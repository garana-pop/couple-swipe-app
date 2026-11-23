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

function getTimeBandLabel(hour: number): string {
  if (hour >= 5 && hour <= 10) return "朝（5〜10時頃）";
  if (hour >= 11 && hour <= 16) return "昼（11〜16時頃）";
  if (hour >= 17 && hour <= 20) return "夕方（17〜20時頃）";
  if (hour >= 21 && hour <= 23) return "夜（21〜23時頃）";
  return "深夜（0〜4時頃）";
}

interface RhythmEntryInput {
  date: string;
  myCreatedAtMs: number | null;
  partnerCreatedAtMs: number | null;
}

function summarizeUserRhythm(
  name: string,
  daySessions: Map<string, number[]>,
  dateFormatter: Intl.DateTimeFormat,
  hourFormatter: Intl.DateTimeFormat
): string {
  const totalDays = daySessions.size;
  if (totalDays === 0) {
    return `- ${name}: 回答データなし`;
  }

  let sameDayCount = 0;
  let catchUpCount = 0;
  const bandCounts = new Map<string, number>();
  const validGapsSec: number[] = [];

  for (const [quizDate, rawTimes] of daySessions.entries()) {
    const times = [...rawTimes].sort((a, b) => a - b);
    const firstMs = times[0];
    const firstDateObj = new Date(firstMs);
    const answeredDate = dateFormatter.format(firstDateObj);
    const hour = Number(hourFormatter.format(firstDateObj)) % 24;
    const band = getTimeBandLabel(hour);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);

    if (answeredDate > quizDate) {
      catchUpCount++;
    } else {
      sameDayCount++;
    }

    for (let i = 1; i < times.length; i++) {
      const gapSec = (times[i] - times[i - 1]) / 1000;
      // 途中離脱（2分超）や一括インポート（0秒以下）を除外して自然な回答テンポのみ集計
      if (gapSec > 0 && gapSec <= 120) {
        validGapsSec.push(gapSec);
      }
    }
  }

  const sortedBands = [...bandCounts.entries()].sort((a, b) => b[1] - a[1]);
  let bandText = "データ不足";
  if (sortedBands.length === 1) {
    bandText = `${sortedBands[0][0]}が中心`;
  } else if (sortedBands.length >= 2) {
    const [top, second] = sortedBands;
    bandText =
      second[1] >= top[1] * 0.5
        ? `${top[0]}・${second[0]}が多め`
        : `${top[0]}が中心`;
  }

  let paceText = "";
  if (validGapsSec.length >= 4) {
    validGapsSec.sort((a, b) => a - b);
    const medianSec = validGapsSec[Math.floor(validGapsSec.length / 2)];
    if (medianSec <= 8) {
      paceText = "／回答テンポ: テンポ良く直感で答える傾向";
    } else if (medianSec <= 25) {
      paceText = "／回答テンポ: 落ち着いてバランスよく答える傾向";
    } else {
      paceText = "／回答テンポ: 1問ずつじっくり吟味して答える傾向";
    }
  }

  return `- ${name}: 回答日数${totalDays}日（当日回答${sameDayCount}日・過去日追っかけ${catchUpCount}日）／主な回答時間帯: ${bandText}${paceText}`;
}

function buildBehaviorRhythmSummary(
  entries: RhythmEntryInput[],
  pairTz: string,
  myName: string,
  partnerName: string
): string {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: pairTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: pairTz,
    hour: "2-digit",
    hourCycle: "h23",
  });

  const myDaySessions = new Map<string, number[]>();
  const partnerDaySessions = new Map<string, number[]>();

  for (const e of entries) {
    if (e.myCreatedAtMs && e.myCreatedAtMs > 0) {
      if (!myDaySessions.has(e.date)) myDaySessions.set(e.date, []);
      myDaySessions.get(e.date)!.push(e.myCreatedAtMs);
    }
    if (e.partnerCreatedAtMs && e.partnerCreatedAtMs > 0) {
      if (!partnerDaySessions.has(e.date)) partnerDaySessions.set(e.date, []);
      partnerDaySessions.get(e.date)!.push(e.partnerCreatedAtMs);
    }
  }

  let myFirstDays = 0;
  let partnerFirstDays = 0;
  for (const [quizDate, myTimes] of myDaySessions.entries()) {
    const partnerTimes = partnerDaySessions.get(quizDate);
    if (!partnerTimes || partnerTimes.length === 0) continue;
    const myMin = Math.min(...myTimes);
    const partnerMin = Math.min(...partnerTimes);
    if (myMin < partnerMin) myFirstDays++;
    else if (partnerMin < myMin) partnerFirstDays++;
  }

  const lines = [
    summarizeUserRhythm(myName, myDaySessions, dateFormatter, hourFormatter),
    summarizeUserRhythm(partnerName, partnerDaySessions, dateFormatter, hourFormatter),
  ];
  if (myFirstDays + partnerFirstDays >= 2) {
    lines.push(
      `- 先に回答を始める割合（双方回答日）: ${myName}が先 ${myFirstDays}日 / ${partnerName}が先 ${partnerFirstDays}日`
    );
  }
  return lines.join("\n");
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
  let reportMode: "compatibility" | "breakup_reflection" = "compatibility";
  let clientCatalog: Record<string, QuestionMeta> = {};
  try {
    const body = (await req.json()) as {
      forceRefresh?: unknown;
      mode?: unknown;
      questionCatalog?: unknown;
    };
    forceRefresh = Boolean(body?.forceRefresh);
    if (body?.mode === "breakup_reflection") {
      reportMode = "breakup_reflection";
    }
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
  const connectedPartnerId = memberIds.find((id) => id !== uid) ?? null;
  const isSoloRemaining = !connectedPartnerId;
  if (reportMode === "compatibility" && !connectedPartnerId) {
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
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false });

  // 相手がすでにペア解除して 1 人だけ残っている場合も、過去の回答履歴から相手 ID を補完
  let formerPartnerId: string | null = null;
  if (!connectedPartnerId) {
    for (const row of allAnswers ?? []) {
      if (row.user_id && row.user_id !== uid) {
        formerPartnerId = row.user_id as string;
        break;
      }
    }
  }
  const effectivePartnerId = connectedPartnerId ?? formerPartnerId;

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
    myCreatedAtMs: number | null;
    partnerCreatedAtMs: number | null;
    latestAnswerMs: number;
  }

  const analyzableEntries: QAEntry[] = [];
  let revealedDaysCount = 0;
  let pastPartialDaysCount = 0;
  const allowPartialToday = reportMode === "breakup_reflection" && isSoloRemaining;

  for (const ds of dailySets ?? []) {
    const quizDate = ds.quiz_date as string;
    const qIds = Array.isArray(ds.question_ids) ? (ds.question_ids as string[]) : [];
    if (qIds.length === 0) continue;

    const isPastDay = quizDate < todayDate;
    const allowPartialThisDay = isPastDay || allowPartialToday;
    const bothDayEntries: QAEntry[] = [];
    const partialDayEntries: QAEntry[] = [];
    let allBothCompleted = true;

    for (const qId of qIds) {
      const m = answerMap.get(`${quizDate}:${qId}`);
      const myRec = m?.get(uid) ?? null;
      const partnerRec = effectivePartnerId ? (m?.get(effectivePartnerId) ?? null) : null;
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
          myCreatedAtMs: myRec?.createdAtMs ?? null,
          partnerCreatedAtMs: partnerRec?.createdAtMs ?? null,
          latestAnswerMs,
        };
        bothDayEntries.push(entry);
        partialDayEntries.push(entry);
      } else {
        allBothCompleted = false;
        if (allowPartialThisDay && (myDir || partnerDir)) {
          partialDayEntries.push({
            date: quizDate,
            category: meta?.category ?? "その他",
            title: meta?.title ?? qId,
            myChoice: myDir ? (meta?.choices?.[myDir] ?? myDir) : null,
            partnerChoice: partnerDir ? (meta?.choices?.[partnerDir] ?? partnerDir) : null,
            matched: null,
            myCreatedAtMs: myRec?.createdAtMs ?? null,
            partnerCreatedAtMs: partnerRec?.createdAtMs ?? null,
            latestAnswerMs,
          });
        }
      }
    }

    if (allBothCompleted && bothDayEntries.length === qIds.length) {
      revealedDaysCount++;
      analyzableEntries.push(...bothDayEntries);
    } else if (allowPartialThisDay && partialDayEntries.length > 0) {
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

  // 5. キャッシュチェック（同一モードで24時間以内＆回答に変化がなければ再課金せずキャッシュ返却）
  //    ※ 過去日に追っかけ回答が追加された場合も latestAnalyzedAnswerMs > reportCreatedMs で即キャッシュ無効化
  const { data: recentModeReports } = await admin
    .from("pair_ai_reports")
    .select("id, analyzed_days, analyzed_answers, model_used, created_at, report_json")
    .eq("pair_id", pairId)
    .order("created_at", { ascending: false })
    .limit(15);

  const latestReport = (recentModeReports ?? []).find((r) => {
    const rType = (r.report_json as { reportType?: string } | null)?.reportType;
    return reportMode === "breakup_reflection"
      ? rType === "breakup_reflection"
      : rType !== "breakup_reflection";
  });

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

  // 6. Gemini API による AI レポート生成（相性診断 / 別れ・関係性の優しい振り返り診断）
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return jsonResponse({ error: "AI_PROVIDER_NOT_CONFIGURED" }, 503);
  }

  const profileIds = effectivePartnerId ? [uid, effectivePartnerId] : [uid];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", profileIds);

  const myName =
    (profiles ?? []).find((p) => p.id === uid)?.display_name?.trim() || "あなた";
  const partnerName =
    (effectivePartnerId
      ? (profiles ?? []).find((p) => p.id === effectivePartnerId)?.display_name?.trim()
      : "") || (isSoloRemaining ? "お相手" : "パートナー");

  const hasPartnerAnswers = analyzableEntries.some((e) => Boolean(e.partnerChoice));
  const bothAnsweredEntries = analyzableEntries.filter((e) => e.matched !== null);
  const matchedTotal = bothAnsweredEntries.filter((e) => e.matched === true).length;
  const matchRateText =
    bothAnsweredEntries.length > 0
      ? `双方回答済み${bothAnsweredEntries.length}問の一致率${Math.round((matchedTotal / bothAnsweredEntries.length) * 100)}%`
      : hasPartnerAnswers
        ? "双方回答済みの設問はまだなく、過去日の片方回答データから傾向を分析"
        : `${myName}の回答履歴のみが残っている状態`;

  const summaryLines = analyzableEntries
    .slice(0, 80)
    .map((e) => {
      const shortDate = e.date.slice(5).replace("-", "/");
      const myLate =
        e.myCreatedAtMs && e.myCreatedAtMs > 0
          ? dateFormatter.format(new Date(e.myCreatedAtMs)) > e.date
          : false;
      const partnerLate =
        e.partnerCreatedAtMs && e.partnerCreatedAtMs > 0
          ? dateFormatter.format(new Date(e.partnerCreatedAtMs)) > e.date
          : false;
      const myTag = myLate ? "(後日回答)" : "";
      const partnerTag = partnerLate ? "(後日回答)" : "";

      if (e.myChoice && e.partnerChoice) {
        return `[${shortDate}][${e.category}] ${e.title} -> ${myName}:「${e.myChoice}」${myTag} / ${partnerName}:「${e.partnerChoice}」${partnerTag} (${e.matched ? "一致" : "不一致"})`;
      }
      if (!e.myChoice && e.partnerChoice) {
        return `[${shortDate}][${e.category}][過去日・${myName}未回答] ${e.title} -> ${myName}:未回答 / ${partnerName}:「${e.partnerChoice}」${partnerTag}`;
      }
      return `[${shortDate}][${e.category}][過去日・${partnerName}未回答] ${e.title} -> ${myName}:「${e.myChoice}」${myTag} / ${partnerName}:未回答`;
    })
    .join("\n");

  const behaviorRhythmSummary = buildBehaviorRhythmSummary(
    analyzableEntries,
    pairTz,
    myName,
    partnerName
  );
  const rhythmInstruction =
    totalAnalyzedDays >= 5
      ? "質問への回答内容（自己申告）を主軸にしつつ、上記の回答リズム・活動時間帯の違いや回答ペースも二人の生活リズムやすれ違いの背景へ自然に織り込んでください。"
      : `まだ回答日数が少ない（${totalAnalyzedDays}日分）ため、上記の回答リズム・時間帯傾向は参考程度にとどめて断定せず、質問への回答内容を主軸に分析してください。`;

  let prompt: string;
  if (reportMode === "breakup_reflection") {
    const situationNote = hasPartnerAnswers
      ? isSoloRemaining
        ? `${partnerName}はすでにペアを解除していますが、残っている二人分の回答履歴（計${totalAnalyzedDays}日分・計${analyzableEntries.length}問・${matchRateText}）をもとに分析します。`
        : `「${myName}」と「${partnerName}」のこれまでの回答履歴（計${totalAnalyzedDays}日分・計${analyzableEntries.length}問・${matchRateText}）をもとに分析します。`
      : `${partnerName}の回答データは残っていないため、${myName}自身の回答履歴（計${totalAnalyzedDays}日分・計${analyzableEntries.length}問）のみから分析します。データに無い${partnerName}の回答を推測・創作せず、${myName}自身の価値観・大切にしていた想い・恋愛で無理をしやすいポイントを中心に優しく整理してください。`;

    prompt = `あなたは恋愛・パートナーシップに寄り添う、とても温かく優しい心理カウンセラーです。
いま「${myName}」は、${partnerName}との関係を見つめ直し、すれ違いや別れの原因を静かに振り返ろうとしています。
${situationNote}

この実データだけに基づき、${myName}の心にそっと寄り添いながら、誰も責めずに「すれ違いの根本背景」と「次の恋愛やこれからの自分に活かせる優しい気づき」を日本語の JSON のみで返してください。

【厳守するトーン＆ルール】
※ 何よりもまず、これまで向き合ってきた${myName}の気持ちを労い、温かく寄り添う言葉づかい（敬語・やわらかい口調）にしてください。
※ ${myName}も${partnerName}も絶対に責めないでください。「悪い」「欠点」「失敗」「ダメ」などの否定語は使わず、「どちらも悪くなく、安心できるかたちやペースが少しずつ違っていた」という中立で思いやりのある視点で整理してください。
※ すれ違いだけでなく、回答の一致や丁寧な向き合い方から見える「二人が大切にできていた素敵だった点（または${myName}の誠実さ）」も必ず温かく認めてください。
※ ${rhythmInstruction}
※ 細かい時刻（例：「23時42分」など分単位）には触れず、「朝型・夜型」「マイペース派」など自然な表現にし、後日回答や未回答も決して責めないでください。

【回答リズム・行動傾向（集計サマリー）】
${behaviorRhythmSummary}

【回答履歴（日付付き）】
${summaryLines}

【出力JSONスキーマ（キー名厳守）】
{
  "warmMessage": "まず心にそっと寄り添い労う温かいメッセージ（95文字以内）",
  "goodMemoriesSummary": "二人が大切にできていた共通点・素敵だった点（85文字以内）",
  "rootCauses": [
    {
      "title": "すれ違いの背景テーマ（18文字以内・責めない表現）",
      "background": "回答データから見える価値観や心地よいペースの違い（75文字以内・中立で優しく）",
      "takeaway": "次の恋愛やこれからの自分に活かせる優しい気づき（80文字以内）"
    }
  ],
  "myStrengthForNextLove": "回答から見える${myName}の恋愛における素敵な強み・魅力（75文字以内）",
  "gentleNextStep": "自分のペースで前を向くための優しいエール（80文字以内）"
}
※ rootCauses は 2〜3件にしてください。`;
  } else {
    prompt = `あなたはカップル専門の優しく的確な関係性アナリストです。
以下は「${myName}」と「${partnerName}」が回答したスワイプ診断の履歴（計${totalAnalyzedDays}日分：双方完了${revealedDaysCount}日＋未回答を含む過去日${pastPartialDaysCount}日・計${analyzableEntries.length}問・${matchRateText}）です。
この実データだけに基づき、二人の相性・性格傾向・将来のすれ違い予防アドバイスを日本語の JSON のみで返してください。
※「過去日・未回答」と付いた設問の回答も、その本人の性格傾向・価値観の分析およびすれ違い予測にしっかり反映してください。
※ ${rhythmInstruction}
※ 細かい時刻（例：「23時42分」など分単位）には触れず、「朝型・夜型」「マイペース派」など自然な表現にしてください。また、後日回答や未回答が多い側を責める表現は厳禁とし、「自分の落ち着いたタイミングで丁寧に向き合うタイプ」など肯定的に表現してください。

【回答リズム・行動傾向（集計サマリー）】
${behaviorRhythmSummary}

【回答履歴（日付付き）】
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
  }

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

  if (reportMode === "breakup_reflection") {
    parsedReport.reportType = "breakup_reflection";
    parsedReport.isSoloRemaining = isSoloRemaining;
    parsedReport.hasPartnerAnswers = hasPartnerAnswers;
  } else {
    parsedReport.reportType = "compatibility";
  }

  // 7. DB に保存してペアで共有（1人残ったペアでも後から閲覧可能）
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
