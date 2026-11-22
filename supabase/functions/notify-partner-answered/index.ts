import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_TOKEN_REGEX = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,128}\]$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
      // Fallback to legacy SUPABASE_SERVICE_ROLE_KEY
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: "Server configuration missing" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return jsonResponse({ error: "Missing authorization token" }, 401);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. 呼び出しユーザーの JWT を厳密検証
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const senderId = user.id;

  let requestedDate: string | null = null;
  try {
    const body = (await req.json()) as { quizDate?: unknown };
    if (typeof body?.quizDate === "string" && DATE_REGEX.test(body.quizDate)) {
      requestedDate = body.quizDate;
    }
  } catch {
    // 空ボディでも許容
  }

  // 2. 送信者のペアとパートナーを取得
  const { data: myMember } = await admin
    .from("pair_members")
    .select("pair_id")
    .eq("user_id", senderId)
    .maybeSingle();

  if (!myMember?.pair_id) {
    return jsonResponse({ sent: false, reason: "not_in_pair" });
  }

  const pairId = myMember.pair_id as string;

  const { data: members } = await admin
    .from("pair_members")
    .select("user_id")
    .eq("pair_id", pairId);

  const partnerMember = (members ?? []).find((m) => m.user_id !== senderId);
  if (!partnerMember?.user_id) {
    return jsonResponse({ sent: false, reason: "partner_not_connected" });
  }

  const partnerId = partnerMember.user_id as string;

  // 3. ペア基準タイムゾーンの「今日」を取得し、出題セットを確認
  let quizDate = requestedDate;
  if (!quizDate) {
    const { data: pairRow } = await admin
      .from("pairs")
      .select("timezone")
      .eq("id", pairId)
      .maybeSingle();
    const tz = (pairRow?.timezone as string | undefined) || "Asia/Tokyo";
    quizDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  const { data: dailySet } = await admin
    .from("daily_sets")
    .select("question_ids")
    .eq("pair_id", pairId)
    .eq("quiz_date", quizDate)
    .maybeSingle();

  const questionIds = Array.isArray(dailySet?.question_ids)
    ? (dailySet.question_ids as string[])
    : [];

  if (questionIds.length === 0) {
    return jsonResponse({ sent: false, reason: "no_daily_set" });
  }

  // 4. DB 上で送信者が全問回答済みかを必ず検証（スパム防止）
  const { data: dayAnswers } = await admin
    .from("answers")
    .select("user_id, question_id")
    .eq("pair_id", pairId)
    .eq("quiz_date", quizDate);

  const questionSet = new Set(questionIds);
  const senderAnswered = new Set<string>();
  const partnerAnswered = new Set<string>();

  for (const row of dayAnswers ?? []) {
    if (!questionSet.has(row.question_id)) continue;
    if (row.user_id === senderId) senderAnswered.add(row.question_id);
    if (row.user_id === partnerId) partnerAnswered.add(row.question_id);
  }

  if (senderAnswered.size < questionIds.length) {
    return jsonResponse({ sent: false, reason: "sender_not_completed" });
  }

  const partnerCompleted = partnerAnswered.size >= questionIds.length;
  const eventType = partnerCompleted ? "both_completed" : "partner_completed";

  // 5. 送信者名とパートナーの Expo Push Token を取得
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, expo_push_token")
    .in("id", [senderId, partnerId]);

  const senderProfile = (profiles ?? []).find((p) => p.id === senderId);
  const partnerProfile = (profiles ?? []).find((p) => p.id === partnerId);

  const senderName = (senderProfile?.display_name as string | undefined)?.trim() || "パートナー";
  const partnerToken = (partnerProfile?.expo_push_token as string | undefined)?.trim() || "";

  if (!partnerToken || !EXPO_PUSH_TOKEN_REGEX.test(partnerToken)) {
    return jsonResponse({ sent: false, reason: "partner_has_no_push_token" });
  }

  // 6. 重複送信防止（同一ペア・日付・送信者・イベント種別は1回のみ）
  const { error: logError } = await admin.from("push_notification_logs").insert({
    pair_id: pairId,
    quiz_date: quizDate,
    sender_id: senderId,
    event_type: eventType,
  });

  if (logError) {
    if (logError.code === "23505") {
      return jsonResponse({ sent: false, reason: "already_sent" });
    }
    return jsonResponse({ error: "Failed to log notification" }, 500);
  }

  // 7. Expo Push API へ送信
  const title = partnerCompleted
    ? "二人の回答が揃いました！"
    : `${senderName}さんが回答しました`;
  const body = partnerCompleted
    ? `${senderName}さんも今日の質問に答えました。今日の一致率と結果を見てみましょう！`
    : "あなたも今日の3問に答えて、二人のかみ合わせ結果を開きましょう！";

  const expoHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoAccessToken) {
    expoHeaders["Authorization"] = `Bearer ${expoAccessToken}`;
  }

  const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: expoHeaders,
    body: JSON.stringify({
      to: partnerToken,
      sound: "default",
      channelId: "partner-activity",
      title,
      body,
      data: {
        screen: partnerCompleted ? "result" : "quiz",
        quizDate,
        eventType,
      },
    }),
  });

  const pushJson = (await pushRes.json().catch(() => ({}))) as {
    data?: { status?: string; details?: { error?: string } };
  };

  // トークンが無効化されていた場合は自動クリーンアップ
  if (pushJson?.data?.details?.error === "DeviceNotRegistered") {
    await admin
      .from("profiles")
      .update({ expo_push_token: null, updated_at: new Date().toISOString() })
      .eq("id", partnerId);
  }

  return jsonResponse({
    sent: pushRes.ok && pushJson?.data?.status !== "error",
    eventType,
    expoStatus: pushJson?.data?.status ?? pushRes.status,
  });
});
