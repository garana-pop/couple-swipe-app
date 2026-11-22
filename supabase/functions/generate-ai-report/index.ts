import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 同データでの24時間以内の連続再生成を防止
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

interface QuestionMeta {
  category?: string;
  title?: string;
  choices?: Record<string, string>;
  matchRule?: string;
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
      // Fallback below
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

/**
 * 購入直後で Webhook 未着の場合に備え、REVENUECAT_SECRET_API_KEY が設定されていれば
 * RevenueCat REST API で直接購入状態を確認して DB へ同期する
 */
async function syncSubscriptionFromRevenueCat(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const rcKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!rcKey) return false;

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
    if (!res.ok) return false;

    const json = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null; product_identifier?: string | null }
        >;
      };
    };

    const entitlements = json?.subscriber?.entitlements ?? {};
    const now = Date.now();

    for (const [entitlementId, ent] of Object.entries(entitlements)) {
      const expMs = ent.expires_date ? Date.parse(ent.expires_date) : null;
      if (expMs === null || expMs > now) {
        await admin.from("user_subscriptions").upsert(
          {
            user_id: userId,
            entitlement_id: entitlementId,
            product_id: ent.product_identifier ?? null,
            store: "PLAY_STORE",
            status: "active",
            expires_at: ent.expires_date ?? null,
            will_renew: true,
            revenuecat_app_user_id: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function evaluateMatch(
  matchRule: string | undefined,
  myDir: string,
  partnerDir: string
): boolean {
  if (myDir === partnerDir) return true;
  if (matchRule === "mirror_up_down") {
    return (myDir === "UP" && partnerDir === "DOWN") || (myDir === "DOWN" && partnerDir === "UP");
  }
  return false;
}

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

  // 1. 呼び出しユーザー認証
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  }
  const uid = user.id;

  let forceRefresh = false;
  let clientCatalog: Record<string, QuestionMeta> = {};
  try {
    const body = (await req.json()) as {
      forceRefresh?: unknown;
      questionCatalog?: unknown;
    };
    forceRefresh = Boolean(body?.forceRefresh);
    if (body?.questionCatalog && typeof body.questionCatalog === "object") {
      clientCatalog = body.questionCatalog as Record<string, QuestionMeta>;
    }
  } catch {
    // 空ボディ許容
  }

  // 2. ペア所属確認
  const { data: myMember } = await admin
    .from("pair_members")
    .select("pair_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (!myMember?.pair_id) {
    return jsonResponse({ error: "NOT_IN_PAIR" }, 400);
  }
  const pairId = myMember.pair_id as string;

  const { data: members } = await admin
    .from("pair_members")
    .select("user_id")
    .eq("pair_id", pairId);

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const partnerId = memberIds.find((id) => id !== uid);
  if (!partnerId) {
    return jsonResponse({ error: "PARTNER_NOT_CONNECTED" }, 400);
  }

  // 3. サーバー側でペア共有の課金状態を確認（無課金にはAIを一切呼ばない）
  const { data: subs } = await admin
    .from("user_subscriptions")
    .select("user_id, status, expires_at")
    .in("user_id", memberIds);

  const nowMs = Date.now();
  let isPremium = (subs ?? []).some((s) => {
    const activeStatus = s.status === "active" || s.status === "grace_period";
    const notExpired = !s.expires_at || Date.parse(s.expires_at as string) > nowMs;
    return activeStatus && notExpired;
  });

  if (!isPremium) {
    // Webhook 遅延時のフォールバック確認
    isPremium = await syncSubscriptionFromRevenueCat(admin, uid);
  }

  if (!isPremium) {
    return jsonResponse({ error: "PREMIUM_REQUIRED" }, 402);
  }

  // 4. 公開済みの過去回答を集計（最新60日分・DBの実データのみ使用）
  const { data: dailySets } = await admin
    .from("daily_sets")
    .select("quiz_date, question_ids")
    .eq("pair_id", pairId)
    .order("quiz_date", { ascending: false })
    .limit(60);

  const { data: allAnswers } = await admin
    .from("answers")
    .select("quiz_date, question_id, user_id, direction")
    .eq("pair_id", pairId);

  const answerMap = new Map<string, Map<string, string>>();
  for (const row of allAnswers ?? []) {
    const dayKey = `${row.quiz_date}:${row.question_id}`;
    if (!answerMap.has(dayKey)) answerMap.set(dayKey, new Map());
    answerMap.get(dayKey)!.set(row.user_id as string, row.direction as string);
  }

  // extra_questions をサーバー側辞書として補完
  const { data: extraRows } = await admin
    .from("extra_questions")
    .select("id, category, title, choices, match_rule");

  const mergedCatalog: Record<string, QuestionMeta> = { ...clientCatalog };
  for (const row of extraRows ?? []) {
    mergedCatalog[row.id as string] = {
      category: row.category as string,
      title: row.title as string,
      choices: row.choices as Record<string, string>,
      matchRule: row.match_rule as string,
    };
  }

  interface QAEntry {
    date: string;
    category: string;
    title: string;
    myChoice: string;
    partnerChoice: string;
    matched: boolean;
  }

  const revealedEntries: QAEntry[] = [];
  let revealedDaysCount = 0;

  for (const ds of dailySets ?? []) {
    const qIds = Array.isArray(ds.question_ids) ? (ds.question_ids as string[]) : [];
    if (qIds.length === 0) continue;

    const dayEntries: QAEntry[] = [];
    let allCompleted = true;

    for (const qId of qIds) {
      const m = answerMap.get(`${ds.quiz_date}:${qId}`);
      const myDir = m?.get(uid);
      const partnerDir = m?.get(partnerId);
      if (!myDir || !partnerDir) {
        allCompleted = false;
        break;
      }
      const meta = mergedCatalog[qId];
      dayEntries.push({
        date: ds.quiz_date as string,
        category: meta?.category ?? "その他",
        title: meta?.title ?? qId,
        myChoice: meta?.choices?.[myDir] ?? myDir,
        partnerChoice: meta?.choices?.[partnerDir] ?? partnerDir,
        matched: evaluateMatch(meta?.matchRule, myDir, partnerDir),
      });
    }

    if (allCompleted) {
      revealedDaysCount++;
      revealedEntries.push(...dayEntries);
    }
  }

  if (revealedDaysCount === 0 || revealedEntries.length === 0) {
    return jsonResponse({ error: "NOT_ENOUGH_DATA" }, 400);
  }

  // 5. キャッシュチェック（24時間以内＆回答数に変化がなければ再課金せずキャッシュ返却）
  const { data: latestReport } = await admin
    .from("pair_ai_reports")
    .select("id, analyzed_days, analyzed_answers, model_used, created_at, report_json")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestReport) {
    const ageMs = nowMs - Date.parse(latestReport.created_at as string);
    const sameVolume = latestReport.analyzed_answers === revealedEntries.length;
    if ((!forceRefresh && sameVolume) || (sameVolume && ageMs < CACHE_COOLDOWN_MS)) {
      return jsonResponse({
        cached: true,
        reportRecord: {
          id: latestReport.id,
          analyzed_days: latestReport.analyzed_days,
          analyzed_answers: latestReport.analyzed_answers,
          model_used: latestReport.model_used,
          created_at: latestReport.created_at,
          report: latestReport.report_json,
        },
      });
    }
  }

  // 6. Gemini API による AI 相性レポート生成
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return jsonResponse({ error: "AI_PROVIDER_NOT_CONFIGURED" }, 503);
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", [uid, partnerId]);

  const myName =
    (profiles ?? []).find((p) => p.id === uid)?.display_name?.trim() || "あなた";
  const partnerName =
    (profiles ?? []).find((p) => p.id === partnerId)?.display_name?.trim() || "パートナー";

  const matchedTotal = revealedEntries.filter((e) => e.matched).length;
  const matchRate = Math.round((matchedTotal / revealedEntries.length) * 100);

  const summaryLines = revealedEntries
    .slice(0, 60)
    .map(
      (e) =>
        `[${e.category}] ${e.title} -> ${myName}:「${e.myChoice}」 / ${partnerName}:「${e.partnerChoice}」 (${e.matched ? "一致" : "不一致"})`
    )
    .join("\n");

  const prompt = `あなたはカップル専門の優しく的確な関係性アナリストです。
以下は「${myName}」と「${partnerName}」が回答したスワイプ診断の履歴（計${revealedDaysCount}日分・${revealedEntries.length}問・全体一致率${matchRate}%）です。
この実データだけに基づき、二人の相性・性格傾向・将来のすれ違い予防アドバイスを日本語の JSON のみで返してください。

【回答履歴】
${summaryLines}

【出力JSONスキーマ（キー名厳守）】
{
  "overallScore": 0から100の整数,
  "myType": { "tag": "12文字以内の性格タイプ名", "desc": "45文字以内の特徴説明" },
  "partnerType": { "tag": "12文字以内の性格タイプ名", "desc": "45文字以内の特徴説明" },
  "chemistrySummary": "100文字以内の二人の相性サマリー",
  "riskPoints": [
    {
      "title": "すれ違いやすいテーマ名（18文字以内）",
      "level": "低" | "中" | "高",
      "desc": "回答データに基づく理由（70文字以内）",
      "advice": "今日からできる具体的な対策（80文字以内）"
    }
  ],
  "nextActionTip": "二人の仲をさらに深めるおすすめのアクション（70文字以内）"
}
※ riskPoints は 2〜3件にしてください。`;

  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.6,
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    return jsonResponse({ error: "AI_GENERATION_FAILED", status: geminiRes.status }, 502);
  }

  const geminiJson = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsedReport: Record<string, unknown>;
  try {
    parsedReport = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "AI_INVALID_JSON" }, 502);
  }

  // 7. DB に保存してペア双方で共有
  const { data: saved, error: saveError } = await admin
    .from("pair_ai_reports")
    .insert({
      pair_id: pairId,
      generated_by: uid,
      analyzed_days: revealedDaysCount,
      analyzed_answers: revealedEntries.length,
      report_json: parsedReport,
      model_used: model,
    })
    .select("id, analyzed_days, analyzed_answers, model_used, created_at, report_json")
    .single();

  if (saveError || !saved) {
    return jsonResponse({ error: "REPORT_SAVE_FAILED" }, 500);
  }

  return jsonResponse({
    cached: false,
    reportRecord: {
      id: saved.id,
      analyzed_days: saved.analyzed_days,
      analyzed_answers: saved.analyzed_answers,
      model_used: saved.model_used,
      created_at: saved.created_at,
      report: saved.report_json,
    },
  });
});
