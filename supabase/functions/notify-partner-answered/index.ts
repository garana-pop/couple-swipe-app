import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_TOKEN_REGEX = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,128}\]$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type SupportedLocale = "ja" | "en" | "fr" | "ko" | "ru" | "th" | "zh-Hans" | "zh-Hant";

const INTL_TAGS: Record<SupportedLocale, string> = {
  ja: "ja-JP",
  en: "en-US",
  fr: "fr-FR",
  ko: "ko-KR",
  ru: "ru-RU",
  th: "th-TH",
  "zh-Hans": "zh-Hans-CN",
  "zh-Hant": "zh-Hant-TW",
};

const DEFAULT_PARTNER_LABEL: Record<SupportedLocale, string> = {
  ja: "パートナー",
  en: "Your partner",
  fr: "Votre partenaire",
  ko: "파트너",
  ru: "Ваш партнёр",
  th: "คู่ของคุณ",
  "zh-Hans": "你的伴侣",
  "zh-Hant": "你的伴侶",
};

const PLACEHOLDER_NAMES = new Set(["", "あなた", "パートナー", "お相手", "You", "Partner"]);

function resolveSupportedLocale(raw: unknown): SupportedLocale {
  if (
    raw === "ja" ||
    raw === "en" ||
    raw === "fr" ||
    raw === "ko" ||
    raw === "ru" ||
    raw === "th" ||
    raw === "zh-Hans" ||
    raw === "zh-Hant"
  ) {
    return raw;
  }
  return "en";
}

function formatLocalizedDate(quizDate: string, locale: SupportedLocale): string {
  const parts = quizDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return quizDate;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  try {
    return new Intl.DateTimeFormat(INTL_TAGS[locale], {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return quizDate;
  }
}

function buildPushMessage(
  locale: SupportedLocale,
  senderName: string,
  dateLabel: string,
  isPastDay: boolean,
  partnerCompleted: boolean
): { title: string; body: string } {
  switch (locale) {
    case "ja":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "過去のお題の回答が揃いました！"
            : `${senderName}さんが過去のお題に回答しました`
          : partnerCompleted
            ? "二人の回答が揃いました！"
            : `${senderName}さんが回答しました`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName}さんが ${dateLabel} の質問に答えました。履歴から一致率と結果を見てみましょう！`
            : `${senderName}さんが ${dateLabel} の質問に答えました。プレミアムプランならあなたも後から回答して結果を見られます！`
          : partnerCompleted
            ? `${senderName}さんも今日の質問に答えました。今日の一致率と結果を見てみましょう！`
            : "あなたも今日の3問に答えて、二人のかみ合わせ結果を開きましょう！",
      };
    case "fr":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "Vos réponses passées sont prêtes !"
            : `${senderName} a répondu à un quiz passé`
          : partnerCompleted
            ? "Vos réponses du jour sont prêtes !"
            : `${senderName} a terminé le quiz`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName} a répondu aux questions du ${dateLabel}. Découvrez votre compatibilité dans l'historique !`
            : `${senderName} a répondu au quiz du ${dateLabel}. Avec Premium, rattrapez ce jour pour voir les résultats !`
          : partnerCompleted
            ? `${senderName} a aussi fini les questions du jour. Ouvrez vos résultats !`
            : "Répondez aux 3 questions du jour pour débloquer votre taux de compatibilité !",
      };
    case "ko":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "지난 질문의 답변이 모두 모였어요!"
            : `${senderName}님이 지난 질문에 답했어요`
          : partnerCompleted
            ? "두 사람의 답변이 모두 모였어요!"
            : `${senderName}님이 오늘의 질문에 답했어요`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName}님이 ${dateLabel} 질문에 답했어요. 기록에서 일치율과 결과를 확인해 보세요!`
            : `${senderName}님이 ${dateLabel} 질문에 답했어요. 프리미엄으로 지나간 질문에 답하고 결과를 확인해 보세요!`
          : partnerCompleted
            ? `${senderName}님도 오늘의 질문에 답했어요. 오늘의 일치율과 결과를 확인해 보세요!`
            : "오늘의 3가지 질문에 답하고 두 사람의 결과를 열어 보세요!",
      };
    case "ru":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "Ответы за прошлый день готовы!"
            : `${senderName} ответил(а) на прошлый день`
          : partnerCompleted
            ? "Оба ответа готовы!"
            : `${senderName} ответил(а) на вопросы дня`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName} завершил(а) вопросы за ${dateLabel}. Откройте историю, чтобы увидеть совпадение!`
            : `${senderName} ответил(а) за ${dateLabel}. С Premium вы тоже можете ответить и открыть результаты!`
          : partnerCompleted
            ? `${senderName} тоже завершил(а) вопросы дня. Посмотрите процент совпадения!`
            : "Ответьте на 3 вопроса дня, чтобы открыть ваши общие результаты!",
      };
    case "th":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "คำตอบของวันย้อนหลังครบทั้งคู่แล้ว!"
            : `${senderName} ตอบคำถามวันย้อนหลังแล้ว`
          : partnerCompleted
            ? "คำตอบของวันนี้ครบทั้งคู่แล้ว!"
            : `${senderName} ตอบคำถามวันนี้แล้ว`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName} ตอบคำถามวันที่ ${dateLabel} แล้ว เข้าไปดูผลและความเข้ากันได้ในประวัติกันเลย!`
            : `${senderName} ตอบคำถามวันที่ ${dateLabel} แล้ว อัปเกรดพรีเมียมเพื่อตอบย้อนหลังและเปิดดูผลได้เลย!`
          : partnerCompleted
            ? `${senderName} ตอบคำถามวันนี้เรียบร้อยแล้ว มาเปิดดูความเข้ากันได้ของวันนี้กัน!`
            : "มาตอบคำถาม 3 ข้อของวันนี้เพื่อเปิดดูผลลัพธ์ของคู่คุณกันเลย!",
      };
    case "zh-Hans":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "往日问答双方都已完成！"
            : `${senderName}完成了往日问答`
          : partnerCompleted
            ? "今日问答双方都已完成！"
            : `${senderName}完成了今日问答`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName}已回答 ${dateLabel} 的问题，快去历史记录查看契合度和结果吧！`
            : `${senderName}已回答 ${dateLabel} 的问题。开通高级版即可补答并解锁结果！`
          : partnerCompleted
            ? `${senderName}也完成了今日问题，快来看看今天的契合度和结果吧！`
            : "你也快来回答今天的3道题，解锁你们的契合度吧！",
      };
    case "zh-Hant":
      return {
        title: isPastDay
          ? partnerCompleted
            ? "過往問答雙方都已完成！"
            : `${senderName}完成了過往問答`
          : partnerCompleted
            ? "今日問答雙方都已完成！"
            : `${senderName}完成了今日問答`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName}已回答 ${dateLabel} 的題目，快到歷史紀錄查看契合度與結果吧！`
            : `${senderName}已回答 ${dateLabel} 的題目。升級進階方案即可補答並解鎖結果！`
          : partnerCompleted
            ? `${senderName}也完成了今日題目，快來看看今天的契合度與結果吧！`
            : "你也快來回答今天的3道題，解鎖你們的契合度吧！",
      };
    case "en":
    default:
      return {
        title: isPastDay
          ? partnerCompleted
            ? "Both answers for a past quiz are in!"
            : `${senderName} answered a past quiz`
          : partnerCompleted
            ? "Both answers are in!"
            : `${senderName} finished today's quiz`,
        body: isPastDay
          ? partnerCompleted
            ? `${senderName} answered the ${dateLabel} quiz. Check History to see your match rate!`
            : `${senderName} answered the ${dateLabel} quiz. Upgrade to Premium to catch up and unlock results!`
          : partnerCompleted
            ? `${senderName} also finished today's quiz. Check out your match rate and answers!`
            : "Answer today's 3 questions to unlock your match results together!",
      };
  }
}

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

  const { data: pairRow } = await admin
    .from("pairs")
    .select("timezone")
    .eq("id", pairId)
    .maybeSingle();
  const tz = (pairRow?.timezone as string | undefined) || "Asia/Tokyo";
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const quizDate = requestedDate || todayDate;
  const isPastDay = quizDate < todayDate;

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

  // 送信者名とパートナーの Expo Push Token・使用言語（locale）を取得
  let profiles: { id: string; display_name?: string | null; expo_push_token?: string | null; locale?: string | null }[] | null = null;
  const withLocale = await admin
    .from("profiles")
    .select("id, display_name, expo_push_token, locale")
    .in("id", [senderId, partnerId]);

  if (!withLocale.error) {
    profiles = withLocale.data;
  } else {
    const legacy = await admin
      .from("profiles")
      .select("id, display_name, expo_push_token")
      .in("id", [senderId, partnerId]);
    profiles = legacy.data;
  }

  const senderProfile = (profiles ?? []).find((p) => p.id === senderId);
  const partnerProfile = (profiles ?? []).find((p) => p.id === partnerId);

  const partnerLocale: SupportedLocale = partnerProfile?.locale
    ? resolveSupportedLocale(partnerProfile.locale)
    : "ja";

  const rawSenderName = (senderProfile?.display_name ?? "").trim();
  const senderName = PLACEHOLDER_NAMES.has(rawSenderName)
    ? DEFAULT_PARTNER_LABEL[partnerLocale]
    : rawSenderName;
  const partnerToken = (partnerProfile?.expo_push_token ?? "").trim();

  if (!partnerToken || !EXPO_PUSH_TOKEN_REGEX.test(partnerToken)) {
    return jsonResponse({ sent: false, reason: "partner_has_no_push_token" });
  }

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

  const dateLabel = formatLocalizedDate(quizDate, partnerLocale);
  const { title, body } = buildPushMessage(
    partnerLocale,
    senderName,
    dateLabel,
    isPastDay,
    partnerCompleted
  );

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
        screen: isPastDay ? "history" : partnerCompleted ? "result" : "quiz",
        quizDate,
        eventType,
      },
    }),
  });

  const pushJson = (await pushRes.json().catch(() => ({}))) as {
    data?: { status?: string; details?: { error?: string } };
  };

  if (pushJson?.data?.details?.error === "DeviceNotRegistered") {
    await admin
      .from("profiles")
      .update({ expo_push_token: null, updated_at: new Date().toISOString() })
      .eq("id", partnerId);
  }

  return jsonResponse({
    sent: pushRes.ok && pushJson?.data?.status !== "error",
    eventType,
    locale: partnerLocale,
    expoStatus: pushJson?.data?.status ?? pushRes.status,
  });
});
