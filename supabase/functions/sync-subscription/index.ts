import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function getAdminKey(): string {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // Fallback below
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null;
        product_identifier?: string | null;
        grace_period_expires_date?: string | null;
      }
    >;
    subscriptions?: Record<
      string,
      {
        store?: string | null;
        expires_date?: string | null;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
      }
    >;
  };
}

/**
 * 購入直後・復元直後に RevenueCat REST API へ直接問い合わせて
 * Supabase の public.user_subscriptions を即時同期する Edge Function
 * （Webhook の到着遅延で課金直後にロック画面が残るのを防止する）
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: "SERVER_CONFIG_MISSING" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  }

  const uid = user.id;
  const rcKey = (Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "").trim();
  if (!rcKey) {
    // Secret API Key 未設定時はエラーにせず Webhook 到着待ちへフォールバックさせる
    return jsonResponse({
      ok: true,
      synced: false,
      reason: "REVENUECAT_SECRET_NOT_CONFIGURED",
    });
  }

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      {
        headers: {
          Authorization: `Bearer ${rcKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      return jsonResponse(
        { ok: false, synced: false, error: "REVENUECAT_API_ERROR", statusCode: res.status },
        502
      );
    }

    const json = (await res.json()) as RcSubscriberResponse;
    const entitlements = json?.subscriber?.entitlements ?? {};
    const subscriptions = json?.subscriber?.subscriptions ?? {};
    const now = Date.now();

    const orderedEntries: [
      string,
      {
        expires_date?: string | null;
        product_identifier?: string | null;
        grace_period_expires_date?: string | null;
      },
    ][] = [];
    if (entitlements.premium) {
      orderedEntries.push(["premium", entitlements.premium]);
    }
    for (const [k, v] of Object.entries(entitlements)) {
      if (k !== "premium") orderedEntries.push([k, v]);
    }

    for (const [entitlementId, ent] of orderedEntries) {
      const expMs = ent.expires_date ? Date.parse(ent.expires_date) : null;
      const graceMs = ent.grace_period_expires_date
        ? Date.parse(ent.grace_period_expires_date)
        : null;
      const effectiveExpMs =
        graceMs !== null && !Number.isNaN(graceMs) && (expMs === null || graceMs > expMs)
          ? graceMs
          : expMs;

      if (effectiveExpMs === null || Number.isNaN(effectiveExpMs) || effectiveExpMs > now) {
        const prodId = ent.product_identifier ?? null;
        const subMeta = prodId ? subscriptions[prodId] : undefined;
        const inGrace = Boolean(subMeta?.billing_issues_detected_at);
        const willRenew = !subMeta?.unsubscribe_detected_at;
        const status = inGrace ? "grace_period" : "active";
        const expiresAt =
          effectiveExpMs !== null && !Number.isNaN(effectiveExpMs)
            ? new Date(effectiveExpMs).toISOString()
            : ent.expires_date ?? null;

        const { error: upsertErr } = await admin.from("user_subscriptions").upsert(
          {
            user_id: uid,
            entitlement_id: entitlementId,
            product_id: prodId,
            store: subMeta?.store ?? "PLAY_STORE",
            status,
            expires_at: expiresAt,
            will_renew: willRenew,
            revenuecat_app_user_id: uid,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (upsertErr) {
          return jsonResponse({ ok: false, synced: false, error: "DB_UPSERT_FAILED" }, 500);
        }

        return jsonResponse({
          ok: true,
          synced: true,
          isPremium: true,
          status,
          productId: prodId,
          expiresAt,
          willRenew,
        });
      }
    }

    // 有効な Entitlement が RevenueCat 上に見つからない場合、RevenueCat 管理行のみ失効更新
    const { data: existing } = await admin
      .from("user_subscriptions")
      .select("user_id, revenuecat_app_user_id")
      .eq("user_id", uid)
      .maybeSingle();

    if (existing?.revenuecat_app_user_id) {
      await admin
        .from("user_subscriptions")
        .update({
          status: "expired",
          will_renew: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", uid);
    }

    return jsonResponse({
      ok: true,
      synced: true,
      isPremium: false,
      status: "inactive",
    });
  } catch {
    return jsonResponse({ ok: false, synced: false, error: "SYNC_FAILED" }, 502);
  }
});
