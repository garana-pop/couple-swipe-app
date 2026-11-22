import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  product_id?: string | null;
  store?: string | null;
  expiration_at_ms?: number | null;
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

  // Supabase auth.uid() 形式の UUID を優先的に抽出
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ].filter((v): v is string => typeof v === "string" && UUID_REGEX.test(v));

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
      status = "active";
      willRenew = eventType !== "NON_RENEWING_PURCHASE";
      break;
    case "BILLING_ISSUE":
      status = "grace_period";
      willRenew = true;
      break;
    case "CANCELLATION":
      // Google Play の解約は現在の課金期間終了まで利用可能
      status = isStillInFuture ? "active" : "cancelled";
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
    (Array.isArray(event.entitlement_ids) && event.entitlement_ids[0]) ||
    event.entitlement_id ||
    "premium";

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
