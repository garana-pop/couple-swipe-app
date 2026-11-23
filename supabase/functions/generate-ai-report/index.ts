import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 同データでの24時間以内の連続再生成を防止
const DAILY_GENERATION_LIMIT = 3; // コスト安全策: 1ペアあたり1日最大3回まで
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
const FALLBACK_GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_THINKING_BUDGET = 512;
const GEMINI_MAX_OUTPUT_TOKENS = 2048;

interface GeminiCallResult {
  ok: boolean;
  status: number;
  rawText?: string;
  modelUsed: string;
  errorDetail?: string;
}

async function discoverFlashModel(
  geminiApiKey: string,
  exclude: Set<string>
): Promise<string | null> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": geminiApiKey },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const candidates = (json.models ?? [])
      .filter(
        (m) =>
          typeof m.name === "string" &&
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent")
      )
      .map((m) => m.name!.replace(/^models\//, ""))
      .filter((id) => !exclude.has(id));

    const flashModels = candidates.filter(
      (id) =>
        id.includes("flash") &&
        !id.includes("tts") &&
        !id.includes("image") &&
        !id.includes("audio")
    );
    if (flashModels.length === 0) return candidates[0] ?? null;

    // 安定版・コスト効率の良い Flash モデルを優先
    const preferred =
      flashModels.find((id) => id === FALLBACK_GEMINI_MODEL) ??
      flashModels.find((id) => id === DEFAULT_GEMINI_MODEL) ??
      flashModels.find((id) => id.includes("flash-lite") && !id.includes("exp")) ??
      flashModels.find((id) => !id.includes("exp") && !id.includes("preview")) ??
      flashModels[0];
    return preferred ?? null;
  } catch {
    return null;
  }
}

async function callGeminiOnce(
  geminiApiKey: string,
  model: string,
  prompt: string,
  thinkingMode: "budget" | "level" | "none"
): Promise<{ status: number; ok: boolean; json: Record<string, unknown> }> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.6,
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  };
  if (thinkingMode === "budget") {
    generationConfig.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
  } else if (thinkingMode === "level") {
    generationConfig.thinkingConfig = { thinkingLevel: "low" };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    }
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, ok: res.ok, json };
}

async function invokeGeminiWithFallback(
  geminiApiKey: string,
  initialModel: string,
  prompt: string
): Promise<GeminiCallResult> {
  let targetModel = initialModel.replace(/^models\//, "");
  let thinkingMode: "budget" | "level" | "none" = targetModel.startsWith("gemini-3")
    ? "level"
    : "budget";
  const failedModels = new Set<string>();

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await callGeminiOnce(geminiApiKey, targetModel, prompt, thinkingMode);
    if (res.ok) {
      const candidates = res.json?.candidates as
        | { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
        | undefined;
      const parts = candidates?.[0]?.content?.parts ?? [];
      const rawText = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      const resolvedModel =
        typeof res.json?.modelVersion === "string" ? res.json.modelVersion : targetModel;
      return { ok: true, status: 200, rawText, modelUsed: resolvedModel };
    }

    const errMsg = String(
      (res.json?.error as { message?: string } | undefined)?.message ?? ""
    );

    // 400 (thinkingConfig パラメータ種別不一致など): 同一モデル内で budget -> level -> none へフォールバック
    if (res.status === 400 && errMsg.toLowerCase().includes("thinking")) {
      if (thinkingMode === "budget") {
        thinkingMode = "level";
        continue;
      }
      if (thinkingMode === "level") {
        thinkingMode = "none";
        continue;
      }
    }

    // 404 / 503 (一時混雑) / 429 (レート制限): 別モデルへフェイルオーバー
    if (res.status === 404 || res.status === 503 || res.status === 429) {
      failedModels.add(targetModel);
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 800));
      }

      let nextModel: string | null = null;
      if (!failedModels.has(FALLBACK_GEMINI_MODEL)) {
        nextModel = FALLBACK_GEMINI_MODEL;
      } else if (!failedModels.has(DEFAULT_GEMINI_MODEL)) {
        nextModel = DEFAULT_GEMINI_MODEL;
      } else {
        nextModel = await discoverFlashModel(geminiApiKey, failedModels);
      }

      if (nextModel) {
        targetModel = nextModel;
        thinkingMode = nextModel.startsWith("gemini-3") ? "level" : "budget";
        continue;
      }
    }

    return {
      ok: false,
      status: res.status,
      modelUsed: targetModel,
      errorDetail: errMsg.slice(0, 200),
    };
  }

  return { ok: false, status: 502, modelUsed: targetModel, errorDetail: "Exhausted fallback attempts" };
}

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

  // ペア基準タイムゾーンにおける「今日」を算出（今日未完了の相手回答は後出し防止のため除外）
  const { data: pairRow } = await admin
    .from("pairs")
    .select("timezone")
    .eq("id", pairId)
    .maybeSingle();
  const pairTz = (pairRow?.timezone as string | undefined) || "Asia/Tokyo";
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: pairTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 4. 回答履歴を集計（最新60日分・DBの実データのみ使用）
  //    - 双方全問完了の日（今日含む）
  //    - プレミアム特典: 昨日以前（quiz_date < todayDate）で片方のみ回答した日のデータも含める
  const { data: dailySets } = await admin
    .from("daily_sets")
    .select("quiz_date, question_ids")
    .eq("pair_id", pairId)
    .order("quiz_date", { ascending: false })
    .limit(60);

  const { data: allAnswers } = await admin
    .from("answers")
    .select("quiz_date, question_id, user_id, direction, created_at")
    .eq("pair_id", pairId);

  const answerMap = new Map<string, Map<string, { direction: string; createdAtMs: number }>>();
  for (const row of allAnswers ?? []) {
    const dayKey = `${row.quiz_date}:${row.question_id}`;
    if (!answerMap.has(dayKey)) answerMap.set(dayKey, new Map());
    const parsedMs = row.created_at ? Date.parse(row.created_at as string) : 0;
    answerMap.get(dayKey)!.set(row.user_id as string, {
      direction: row.direction as string,
      createdAtMs: Number.isNaN(parsedMs) ? 0 : parsedMs,
    });
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
    myChoice: string | null;
    partnerChoice: string | null;
    matched: boolean | null;
    latestAnswerMs: number;
  }

  const analyzableEntries: QAEntry[] = [];
  let revealedDaysCount = 0;
  let pastPartialDaysCount = 0;

  for (const ds of dailySets ?? []) {
    const quizDate = ds.quiz_date as string;
    const qIds = Array.isArray(ds.question_ids) ? (ds.question_ids as string[]) : [];
    if (qIds.length === 0) continue;

    const isPastDay = quizDate < todayDate;
    const bothDayEntries: QAEntry[] = [];
    const partialDayEntries: QAEntry[] = [];
    let allBothCompleted = true;

    for (const qId of qIds) {
      const m = answerMap.get(`${quizDate}:${qId}`);
      const myRec = m?.get(uid) ?? null;
      const partnerRec = m?.get(partnerId) ?? null;
      const myDir = myRec?.direction ?? null;
      const partnerDir = partnerRec?.direction ?? null;
      const latestAnswerMs = Math.max(myRec?.createdAtMs ?? 0, partnerRec?.createdAtMs ?? 0);
      const meta = mergedCatalog[qId];

      if (myDir && partnerDir) {
        const entry: QAEntry = {
          date: quizDate,
          category: meta?.category ?? "その他",
          title: meta?.title ?? qId,
          myChoice: meta?.choices?.[myDir] ?? myDir,
          partnerChoice: meta?.choices?.[partnerDir] ?? partnerDir,
          matched: evaluateMatch(meta?.matchRule, myDir, partnerDir),
          latestAnswerMs,
        };
        bothDayEntries.push(entry);
        partialDayEntries.push(entry);
      } else {
        allBothCompleted = false;
        if (isPastDay && (myDir || partnerDir)) {
          partialDayEntries.push({
            date: quizDate,
            category: meta?.category ?? "その他",
            title: meta?.title ?? qId,
            myChoice: myDir ? (meta?.choices?.[myDir] ?? myDir) : null,
            partnerChoice: partnerDir ? (meta?.choices?.[partnerDir] ?? partnerDir) : null,
            matched: null,
            latestAnswerMs,
          });
        }
      }
    }

    if (allBothCompleted && bothDayEntries.length === qIds.length) {
      revealedDaysCount++;
      analyzableEntries.push(...bothDayEntries);
    } else if (isPastDay && partialDayEntries.length > 0) {
      pastPartialDaysCount++;
      analyzableEntries.push(...partialDayEntries);
    }
  }

  const totalAnalyzedDays = revealedDaysCount + pastPartialDaysCount;
  if (totalAnalyzedDays === 0 || analyzableEntries.length === 0) {
    return jsonResponse({ error: "NOT_ENOUGH_DATA" }, 400);
  }

  const latestAnalyzedAnswerMs = analyzableEntries.reduce(
    (maxMs, e) => Math.max(maxMs, e.latestAnswerMs),
    0
  );

  // 5. キャッシュチェック（24時間以内＆回答に変化がなければ再課金せずキャッシュ返却）
  //    ※ 過去日に追っかけ回答が追加された場合も latestAnalyzedAnswerMs > reportCreatedMs で即キャッシュ無効化
  const { data: latestReport } = await admin
    .from("pair_ai_reports")
    .select("id, analyzed_days, analyzed_answers, model_used, created_at, report_json")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestReport) {
    const reportCreatedMs = Date.parse(latestReport.created_at as string);
    const ageMs = nowMs - reportCreatedMs;
    const hasNewerAnswer = latestAnalyzedAnswerMs > reportCreatedMs;
    const sameVolume = latestReport.analyzed_answers === analyzableEntries.length && !hasNewerAnswer;
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

  // 5.5. 日次生成回数制限（1ペアあたりペア基準タイムゾーンで1日3回まで）
  const { data: recentReports } = await admin
    .from("pair_ai_reports")
    .select("created_at")
    .eq("pair_id", pairId)
    .gte("created_at", new Date(nowMs - 48 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: pairTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayGeneratedCount = (recentReports ?? []).filter((r) => {
    const d = new Date(r.created_at as string);
    return !Number.isNaN(d.getTime()) && dateFormatter.format(d) === todayDate;
  }).length;

  if (todayGeneratedCount >= DAILY_GENERATION_LIMIT) {
    return jsonResponse(
      {
        error: "DAILY_LIMIT_EXCEEDED",
        limit: DAILY_GENERATION_LIMIT,
      },
      429
    );
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

  const bothAnsweredEntries = analyzableEntries.filter((e) => e.matched !== null);
  const matchedTotal = bothAnsweredEntries.filter((e) => e.matched === true).length;
  const matchRateText =
    bothAnsweredEntries.length > 0
      ? `双方回答済み${bothAnsweredEntries.length}問の一致率${Math.round((matchedTotal / bothAnsweredEntries.length) * 100)}%`
      : "双方回答済みの設問はまだなく、過去日の片方回答データから傾向を分析";

  const summaryLines = analyzableEntries
    .slice(0, 80)
    .map((e) => {
      if (e.myChoice && e.partnerChoice) {
        return `[${e.category}] ${e.title} -> ${myName}:「${e.myChoice}」 / ${partnerName}:「${e.partnerChoice}」 (${e.matched ? "一致" : "不一致"})`;
      }
      if (!e.myChoice && e.partnerChoice) {
        return `[${e.category}][過去日・${myName}未回答] ${e.title} -> ${myName}:未回答 / ${partnerName}:「${e.partnerChoice}」`;
      }
      return `[${e.category}][過去日・${partnerName}未回答] ${e.title} -> ${myName}:「${e.myChoice}」 / ${partnerName}:未回答`;
    })
    .join("\n");

  const prompt = `あなたはカップル専門の優しく的確な関係性アナリストです。
以下は「${myName}」と「${partnerName}」が回答したスワイプ診断の履歴（計${totalAnalyzedDays}日分：双方完了${revealedDaysCount}日＋未回答を含む過去日${pastPartialDaysCount}日・計${analyzableEntries.length}問・${matchRateText}）です。
この実データだけに基づき、二人の相性・性格傾向・将来のすれ違い予防アドバイスを日本語の JSON のみで返してください。
※「過去日・未回答」と付いた設問の回答も、その本人の性格傾向・価値観の分析およびすれ違い予測にしっかり反映してください。

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

  const requestedModel = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const geminiResult = await invokeGeminiWithFallback(geminiApiKey, requestedModel, prompt);

  if (!geminiResult.ok) {
    const isOverloaded = geminiResult.status === 503 || geminiResult.status === 429;
    return jsonResponse(
      {
        error: isOverloaded ? "AI_OVERLOADED" : "AI_GENERATION_FAILED",
        status: geminiResult.status,
        model: geminiResult.modelUsed,
        detail: geminiResult.errorDetail,
      },
      isOverloaded ? 503 : 502
    );
  }

  const rawText = (geminiResult.rawText ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const model = geminiResult.modelUsed;

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
      analyzed_days: totalAnalyzedDays,
      analyzed_answers: analyzableEntries.length,
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
