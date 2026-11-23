import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  product_id?: string | null;
  store?: string | null;
  expiration_at_ms?: number | null;
  cancel_reason?: string | null;
}

interface RcSubscriberPayload {
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

function extractUuids(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v === "string" && UUID_REGEX.test(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

async function syncUserFromRevenueCatApi(
  admin: SupabaseClient,
  rcKey: string,
  userId: string
): Promise<{ ok: boolean; status: string }> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${rcKey}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) {
      return { ok: false, status: "fetch_failed" };
    }

    const json = (await res.json()) as RcSubscriberPayload;
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

        await admin.from("user_subscriptions").upsert(
          {
            user_id: userId,
            entitlement_id: entitlementId,
            product_id: prodId,
            store: subMeta?.store ?? "PLAY_STORE",
            status,
            expires_at:
              effectiveExpMs !== null && !Number.isNaN(effectiveExpMs)
                ? new Date(effectiveExpMs).toISOString()
                : ent.expires_date ?? null,
            will_renew: willRenew,
            revenuecat_app_user_id: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        return { ok: true, status };
      }
    }

    // RevenueCat 上に有効な Entitlement が無い場合、RevenueCat 管理下の行のみ失効更新
    const { data: existing } = await admin
      .from("user_subscriptions")
      .select("user_id, revenuecat_app_user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.revenuecat_app_user_id) {
      await admin
        .from("user_subscriptions")
        .update({
          status: "expired",
          will_renew: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    return { ok: true, status: "inactive" };
  } catch {
    return { ok: false, status: "error" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expectedKey = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_KEY") ?? "";
  if (!expectedKey) {
    return jsonResponse({ error: "Webhook auth key not configured" }, 500);
  }

  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader;
  if (!providedKey || !timingSafeEqual(providedKey, expectedKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500);
  }

  let event: RevenueCatEvent;
  try {
    const payload = (await req.json()) as { event?: RevenueCatEvent };
    event = payload?.event ?? {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const eventType = (event.type ?? "").toUpperCase();
  if (eventType === "TEST") {
    return jsonResponse({ ok: true, received: "TEST" });
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 購入復元・機種変更時のユーザー間移行イベント（TRANSFER）を確実に同期
  if (eventType === "TRANSFER") {
    const fromIds = extractUuids(Array.isArray(event.transferred_from) ? event.transferred_from : []);
    const toIds = extractUuids(Array.isArray(event.transferred_to) ? event.transferred_to : []);
    const rcKey = (Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "").trim();

    if (rcKey && (fromIds.length > 0 || toIds.length > 0)) {
      const results: Record<string, string> = {};
      for (const uid of [...toIds, ...fromIds]) {
        const r = await syncUserFromRevenueCatApi(admin, rcKey, uid);
        results[uid] = r.status;
      }
      return jsonResponse({ ok: true, eventType, mode: "api_sync", results });
    }

    if (toIds.length > 0 && fromIds.length > 0) {
      const { data: prevSubs } = await admin
        .from("user_subscriptions")
        .select("*")
        .in("user_id", fromIds);

      const sourceSub = (prevSubs ?? []).find(
        (s) => s.status === "active" || s.status === "grace_period"
      );

      if (sourceSub) {
        await admin.from("user_subscriptions").upsert(
          {
            user_id: toIds[0],
            entitlement_id: sourceSub.entitlement_id ?? "premium",
            product_id: sourceSub.product_id ?? null,
            store: sourceSub.store ?? "PLAY_STORE",
            status: sourceSub.status,
            expires_at: sourceSub.expires_at ?? null,
            will_renew: Boolean(sourceSub.will_renew),
            revenuecat_app_user_id: toIds[0],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }

      await admin
        .from("user_subscriptions")
        .update({
          status: "inactive",
          will_renew: false,
          updated_at: new Date().toISOString(),
        })
        .in("user_id", fromIds);

      return jsonResponse({ ok: true, eventType, mode: "db_transfer", to: toIds[0], from: fromIds });
    }

    return jsonResponse({ ok: true, ignored: "transfer_without_supabase_uuid" });
  }

  // Supabase auth.uid() 形式の UUID を優先的に抽出
  const candidates = extractUuids([
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ]);

  const userId = candidates[0];
  if (!userId) {
    return jsonResponse({ ok: true, ignored: "no_supabase_uuid" });
  }

  const expiresAt =
    typeof event.expiration_at_ms === "number"
      ? new Date(event.expiration_at_ms).toISOString()
      : null;
  const isStillInFuture = !expiresAt || new Date(expiresAt).getTime() > Date.now();

  let status: "active" | "grace_period" | "cancelled" | "expired" | "inactive" = "inactive";
  let willRenew = false;

  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
    case "NON_RENEWING_PURCHASE":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      status = "active";
      willRenew =
        eventType !== "NON_RENEWING_PURCHASE" &&
        eventType !== "TEMPORARY_ENTITLEMENT_GRANT";
      break;
    case "BILLING_ISSUE":
      status = "grace_period";
      willRenew = true;
      break;
    case "CANCELLATION":
      // 返金（CUSTOMER_SUPPORT）は即時失効、通常の自動更新オフは期限まで利用可能
      status =
        event.cancel_reason === "CUSTOMER_SUPPORT"
          ? "cancelled"
          : isStillInFuture
            ? "active"
            : "cancelled";
      willRenew = false;
      break;
    case "EXPIRATION":
    case "SUBSCRIPTION_PAUSED":
      status = "expired";
      willRenew = false;
      break;
    default:
      return jsonResponse({ ok: true, ignored: eventType });
  }

  const entitlementId =
    (Array.isArray(event.entitlement_ids) &&
      (event.entitlement_ids.includes("premium") ? "premium" : event.entitlement_ids[0])) ||
    event.entitlement_id ||
    "premium";

  const { error } = await admin.from("user_subscriptions").upsert(
    {
      user_id: userId,
      entitlement_id: entitlementId,
      product_id: event.product_id ?? null,
      store: event.store ?? "PLAY_STORE",
      status,
      expires_at: expiresAt,
      will_renew: willRenew,
      revenuecat_app_user_id: event.app_user_id ?? userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return jsonResponse({ error: "Database upsert failed", detail: error.message }, 500);
  }

  return jsonResponse({ ok: true, userId, status, eventType });
});
