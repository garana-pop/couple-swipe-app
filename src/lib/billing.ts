import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  AiReportData,
  BreakupCausePoint,
  BreakupReflectionData,
  PairAiReportRecord,
  PairBreakupReflectionRecord,
  PairEntitlement,
  Question,
} from '../types';
import { supabase } from './supabase';

export interface BillingOfferingPrices {
  isStoreReady: boolean;
  yearlyPriceLabel: string;
  yearlyPerMonthLabel: string;
  yearlyDiscountBadge: string;
  monthlyPriceLabel: string;
  unavailableReason?: string;
}

interface RcPackage {
  identifier: string;
  packageType?: string;
  product?: {
    identifier?: string;
    price?: number;
    priceString?: string;
    currencyCode?: string;
  };
}

interface RcCustomerInfo {
  entitlements?: {
    active?: Record<string, unknown>;
  };
}

interface RcModule {
  configure: (config: { apiKey: string; appUserID?: string | null }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  logOut?: () => Promise<unknown>;
  getOfferings: () => Promise<{
    current?: {
      annual?: RcPackage | null;
      monthly?: RcPackage | null;
      availablePackages?: RcPackage[];
    } | null;
  }>;
  purchasePackage: (pkg: RcPackage) => Promise<{ customerInfo?: RcCustomerInfo } | unknown>;
  restorePurchases: () => Promise<RcCustomerInfo | unknown>;
}

let configuredUserId: string | null = null;
let cachedAnnualPkg: RcPackage | null = null;
let cachedMonthlyPkg: RcPackage | null = null;

function getRevenueCatApiKey(): string {
  if (Platform.OS === 'android') {
    return (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '').trim();
  }
  if (Platform.OS === 'ios') {
    return (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '').trim();
  }
  return '';
}

function getNativePurchasesModule(): {
  rc: RcModule | null;
  unavailableReason?: string;
} {
  if (Platform.OS === 'web') {
    return {
      rc: null,
      unavailableReason: 'サブスクリプション購入は Android / iOS アプリから行えます。',
    };
  }
  if (Constants.executionEnvironment === 'storeClient') {
    return {
      rc: null,
      unavailableReason: 'テスト環境ではアプリ内課金を利用できません。ストア配信版アプリからご購入ください。',
    };
  }
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    return {
      rc: null,
      unavailableReason: '現在ストア課金の準備中です。公開までしばらくお待ちください。',
    };
  }

  try {
    // Expo Go / Web でネイティブモジュール未同梱クラッシュを防ぐため遅延読み込み
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    const rc = (mod?.default ?? mod) as RcModule;
    if (!rc || typeof rc.configure !== 'function') {
      return { rc: null, unavailableReason: '課金機能を読み込めませんでした。アプリを再起動してお試しください。' };
    }
    return { rc };
  } catch {
    return {
      rc: null,
      unavailableReason: '現在のビルドではアプリ内課金を利用できません。ストア配信版アプリをご利用ください。',
    };
  }
}

function hasAnyActiveEntitlement(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false;
  const ci = info as RcCustomerInfo;
  const active = ci.entitlements?.active;
  if (!active || typeof active !== 'object') return false;
  return Boolean(active.premium) || Object.keys(active).length > 0;
}

function formatYearlyMeta(
  annualPkg: RcPackage | null,
  monthlyPkg: RcPackage | null
): { perMonthLabel: string; discountBadge: string } {
  const annualPrice = annualPkg?.product?.price;
  const monthlyPrice = monthlyPkg?.product?.price;
  const currency = annualPkg?.product?.currencyCode ?? 'JPY';

  let perMonthLabel = '月250円相当・2人共有';
  if (typeof annualPrice === 'number' && annualPrice > 0) {
    const monthlyEq = Math.round(annualPrice / 12);
    if (currency === 'JPY') {
      perMonthLabel = `月¥${monthlyEq.toLocaleString('ja-JP')}相当・2人共有`;
    } else {
      perMonthLabel = `月あたり ${(annualPrice / 12).toFixed(2)} ${currency}・2人共有`;
    }
  }

  let discountBadge = '月額比 50% OFF';
  if (
    typeof annualPrice === 'number' &&
    typeof monthlyPrice === 'number' &&
    annualPrice > 0 &&
    monthlyPrice > 0
  ) {
    const yearlyAtMonthly = monthlyPrice * 12;
    const discountPct = Math.round((1 - annualPrice / yearlyAtMonthly) * 100);
    if (discountPct >= 5 && discountPct < 100) {
      discountBadge = `月額比 ${discountPct}% OFF`;
    } else {
      discountBadge = 'おすすめ年額';
    }
  }

  return { perMonthLabel, discountBadge };
}

/**
 * 開発ビルド／本番ビルド上で RevenueCat SDK を初期化し、Google Play / App Store の価格情報を取得する
 */
export async function initializeBilling(userId: string): Promise<BillingOfferingPrices> {
  const fallback: BillingOfferingPrices = {
    isStoreReady: false,
    yearlyPriceLabel: '¥3,000 / 年',
    yearlyPerMonthLabel: '月250円相当・2人共有',
    yearlyDiscountBadge: '月額比 50% OFF',
    monthlyPriceLabel: '¥500 / 月',
  };

  const { rc, unavailableReason } = getNativePurchasesModule();
  if (!rc) {
    return { ...fallback, unavailableReason };
  }

  const apiKey = getRevenueCatApiKey();
  try {
    if (!configuredUserId) {
      rc.configure({ apiKey, appUserID: userId });
      configuredUserId = userId;
    } else if (configuredUserId !== userId) {
      await rc.logIn(userId);
      configuredUserId = userId;
    }

    const offerings = await rc.getOfferings();
    const current = offerings?.current;
    cachedAnnualPkg =
      current?.annual ??
      current?.availablePackages?.find(
        (p) => p.packageType === 'ANNUAL' || p.identifier === '$rc_annual'
      ) ??
      null;
    cachedMonthlyPkg =
      current?.monthly ??
      current?.availablePackages?.find(
        (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly'
      ) ??
      null;

    const { perMonthLabel, discountBadge } = formatYearlyMeta(cachedAnnualPkg, cachedMonthlyPkg);

    return {
      isStoreReady: Boolean(cachedAnnualPkg || cachedMonthlyPkg),
      yearlyPriceLabel: cachedAnnualPkg?.product?.priceString
        ? `${cachedAnnualPkg.product.priceString} / 年`
        : fallback.yearlyPriceLabel,
      yearlyPerMonthLabel: perMonthLabel,
      yearlyDiscountBadge: discountBadge,
      monthlyPriceLabel: cachedMonthlyPkg?.product?.priceString
        ? `${cachedMonthlyPkg.product.priceString} / 月`
        : fallback.monthlyPriceLabel,
      unavailableReason:
        cachedAnnualPkg || cachedMonthlyPkg
          ? undefined
          : 'ストアの商品情報を取得できませんでした。通信環境を確認のうえ再度お試しください。',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ...fallback,
      unavailableReason: `課金情報の取得に失敗しました（${detail}）。`,
    };
  }
}

/**
 * アカウント削除・切替時に RevenueCat セッション状態をリセット
 */
export async function resetBillingSession(): Promise<void> {
  configuredUserId = null;
  cachedAnnualPkg = null;
  cachedMonthlyPkg = null;
  const { rc } = getNativePurchasesModule();
  if (rc && typeof rc.logOut === 'function') {
    try {
      await rc.logOut();
    } catch {
      // 匿名状態などで logOut が不要な場合は無視
    }
  }
}

export async function purchaseSubscriptionPlan(
  plan: 'monthly' | 'yearly'
): Promise<{ ok: boolean; hasActiveEntitlement?: boolean; cancelled?: boolean; error?: string }> {
  const { rc, unavailableReason } = getNativePurchasesModule();
  if (!rc) {
    return { ok: false, error: unavailableReason ?? '現在この環境では購入できません。' };
  }

  const pkg = plan === 'yearly' ? cachedAnnualPkg : cachedMonthlyPkg;
  if (!pkg) {
    return {
      ok: false,
      error: '購入対象プランの情報を取得できませんでした。少し待ってから再度お試しください。',
    };
  }

  try {
    const result = (await rc.purchasePackage(pkg)) as { customerInfo?: RcCustomerInfo } | undefined;
    return {
      ok: true,
      hasActiveEntitlement: hasAnyActiveEntitlement(result?.customerInfo),
    };
  } catch (err) {
    const rcErr = err as { userCancelled?: boolean; code?: string; message?: string };
    if (rcErr?.userCancelled || rcErr?.code === '1') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error: `購入処理に失敗しました（${rcErr?.message ?? '不明なエラー'}）。`,
    };
  }
}

export async function restoreSubscriptionPurchases(): Promise<{
  ok: boolean;
  hasActiveEntitlement?: boolean;
  error?: string;
}> {
  const { rc, unavailableReason } = getNativePurchasesModule();
  if (!rc) {
    return { ok: false, error: unavailableReason ?? '現在この環境では復元できません。' };
  }
  try {
    const customerInfo = await rc.restorePurchases();
    return {
      ok: true,
      hasActiveEntitlement: hasAnyActiveEntitlement(customerInfo),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `購入の復元に失敗しました（${detail}）。` };
  }
}

/**
 * 購入直後・復元直後に Supabase Edge Function（sync-subscription）を呼び出し、
 * Webhook 到着前でも即座に DB（user_subscriptions）へ最新課金状態を反映する
 */
export async function syncSubscriptionWithServer(): Promise<{
  ok: boolean;
  synced: boolean;
  isPremium?: boolean;
}> {
  if (!supabase) return { ok: false, synced: false };
  try {
    const { data, error } = await supabase.functions.invoke('sync-subscription');
    if (error || !data || typeof data !== 'object') {
      return { ok: false, synced: false };
    }
    const payload = data as { ok?: boolean; synced?: boolean; isPremium?: boolean };
    return {
      ok: Boolean(payload.ok),
      synced: Boolean(payload.synced),
      isPremium: typeof payload.isPremium === 'boolean' ? payload.isPremium : undefined,
    };
  } catch {
    return { ok: false, synced: false };
  }
}

/**
 * サーバー側同期を実行し、Webhook 遅延がある場合も数秒リトライして最新の PairEntitlement を取得する
 */
export async function syncAndFetchPairEntitlement(
  expectPremium = false
): Promise<PairEntitlement | null> {
  await syncSubscriptionWithServer();
  let ent = await fetchPairEntitlement();
  if (!expectPremium || ent?.isPremium) {
    return ent;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (attempt === 1) {
      await syncSubscriptionWithServer();
    }
    ent = await fetchPairEntitlement();
    if (ent?.isPremium) {
      return ent;
    }
  }
  return ent;
}

function parseReportRecord(raw: unknown): PairAiReportRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const report = r.report as
    | (Omit<Partial<AiReportData>, 'reportType'> & { reportType?: string })
    | undefined;
  if (
    !report ||
    typeof report !== 'object' ||
    report.reportType === 'breakup_reflection' ||
    typeof report.chemistrySummary !== 'string'
  ) {
    return null;
  }
  return {
    id: String(r.id ?? ''),
    analyzedDays: Number(r.analyzed_days ?? 0),
    analyzedAnswers: Number(r.analyzed_answers ?? 0),
    modelUsed: String(r.model_used ?? ''),
    createdAt: String(r.created_at ?? ''),
    report: {
      reportType: 'compatibility',
      overallScore: typeof report.overallScore === 'number' ? report.overallScore : 80,
      myType: {
        tag: report.myType?.tag ?? 'バランスタイプ',
        desc: report.myType?.desc ?? '',
      },
      partnerType: {
        tag: report.partnerType?.tag ?? 'おおらかタイプ',
        desc: report.partnerType?.desc ?? '',
      },
      chemistrySummary: report.chemistrySummary,
      riskPoints: Array.isArray(report.riskPoints) ? report.riskPoints : [],
      nextActionTip: report.nextActionTip ?? '',
    },
  };
}

function parseBreakupReflectionRecord(raw: unknown): PairBreakupReflectionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const report = r.report as Partial<BreakupReflectionData> | undefined;
  if (
    !report ||
    typeof report !== 'object' ||
    report.reportType !== 'breakup_reflection' ||
    typeof report.warmMessage !== 'string'
  ) {
    return null;
  }
  const rawCauses: unknown[] = Array.isArray(report.rootCauses) ? report.rootCauses : [];
  const rootCauses: BreakupCausePoint[] = rawCauses
    .filter((c): c is Partial<BreakupCausePoint> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      title: typeof c.title === 'string' ? c.title : '価値観やペースの違い',
      background: typeof c.background === 'string' ? c.background : '',
      takeaway: typeof c.takeaway === 'string' ? c.takeaway : '',
    }))
    .filter((c) => Boolean(c.background || c.takeaway));

  return {
    id: String(r.id ?? ''),
    analyzedDays: Number(r.analyzed_days ?? 0),
    analyzedAnswers: Number(r.analyzed_answers ?? 0),
    modelUsed: String(r.model_used ?? ''),
    createdAt: String(r.created_at ?? ''),
    report: {
      reportType: 'breakup_reflection',
      isSoloRemaining: Boolean(report.isSoloRemaining),
      hasPartnerAnswers: report.hasPartnerAnswers !== false,
      warmMessage: report.warmMessage,
      goodMemoriesSummary: report.goodMemoriesSummary ?? '',
      rootCauses,
      myStrengthForNextLove: report.myStrengthForNextLove ?? '',
      gentleNextStep: report.gentleNextStep ?? '',
    },
  };
}

/**
 * サーバー側（Supabase RPC）からペア共有の課金状態と最新キャッシュ済みAIレポートを取得する
 */
export async function fetchPairEntitlement(): Promise<PairEntitlement | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_pair_entitlement');
  if (error || !data || typeof data !== 'object') {
    return null;
  }
  const d = data as Record<string, unknown>;
  return {
    hasPair: Boolean(d.has_pair),
    isPremium: Boolean(d.is_premium),
    paidByMe: Boolean(d.paid_by_me),
    paidByPartner: Boolean(d.paid_by_partner),
    status: typeof d.status === 'string' ? d.status : 'inactive',
    productId: typeof d.product_id === 'string' ? d.product_id : null,
    expiresAt: typeof d.expires_at === 'string' ? d.expires_at : null,
    willRenew: Boolean(d.will_renew),
    pairStartDate: typeof d.pair_start_date === 'string' ? d.pair_start_date : null,
    revealedDaysCount: Number(d.revealed_days_count ?? 0),
    pastPartnerOnlyDaysCount: Number(d.past_partner_only_days_count ?? 0),
    pastUnansweredDaysCount: Number(d.past_unanswered_days_count ?? 0),
    analyzableDaysCount: Number(d.analyzable_days_count ?? d.revealed_days_count ?? 0),
    latestReport: parseReportRecord(d.latest_report),
  };
}

/**
 * 有料ペア向けに過去の AI レポート（通常相性診断 ＆ 別れ・関係性の振り返り診断）を1クエリで取得する
 */
export async function fetchPairAllAiReports(
  pairId: string,
  limit = 30
): Promise<{
  compatibilityReports: PairAiReportRecord[];
  reflectionReports: PairBreakupReflectionRecord[];
}> {
  if (!supabase || !pairId) {
    return { compatibilityReports: [], reflectionReports: [] };
  }
  const { data, error } = await supabase
    .from('pair_ai_reports')
    .select('id, analyzed_days, analyzed_answers, model_used, created_at, report_json')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    return { compatibilityReports: [], reflectionReports: [] };
  }

  const compatibilityReports: PairAiReportRecord[] = [];
  const reflectionReports: PairBreakupReflectionRecord[] = [];

  for (const row of data) {
    const wrapped = {
      id: row.id,
      analyzed_days: row.analyzed_days,
      analyzed_answers: row.analyzed_answers,
      model_used: row.model_used,
      created_at: row.created_at,
      report: row.report_json,
    };
    const reflection = parseBreakupReflectionRecord(wrapped);
    if (reflection) {
      reflectionReports.push(reflection);
      continue;
    }
    const compat = parseReportRecord(wrapped);
    if (compat) {
      compatibilityReports.push(compat);
    }
  }

  return { compatibilityReports, reflectionReports };
}

/**
 * 有料ペア向けに過去の AI 相性レポート履歴を新しい順に一覧取得する（RLS で有料ペアメンバーのみ許可）
 */
export async function fetchPairAiReportHistory(
  pairId: string,
  limit = 20
): Promise<PairAiReportRecord[]> {
  const { compatibilityReports } = await fetchPairAllAiReports(pairId, limit);
  return compatibilityReports;
}

function formatAiReportError(code: string): string {
  switch (code) {
    case 'PREMIUM_REQUIRED':
      return 'AI 診断レポートの生成には「ふたりプレミアムプラン」への加入が必要です（パートナーの加入でも利用できます）。';
    case 'NOT_IN_PAIR':
      return 'ペアの回答履歴が見つかりませんでした。ペアを作成または参加してからお試しください。';
    case 'PARTNER_NOT_CONNECTED':
      return 'パートナーとのペア連携完了後に通常の AI 相性レポートを作成できます（相手がペア解除済みの場合は、画面下部の「すれ違い・別れの原因 AI 振り返り診断」をご利用いただけます）。';
    case 'NOT_ENOUGH_DATA':
      return '分析できる回答データがまだありません。回答履歴が1日分以上溜まるとお試しいただけます。';
    case 'DAILY_LIMIT_EXCEEDED':
      return '本日の AI 診断レポート生成回数の上限（1日2回）に達しました。明日になってから再度お試しください。';
    case 'MONTHLY_LIMIT_EXCEEDED':
      return '直近30日間の AI 診断レポート生成回数の上限（月30回）に達しました。しばらく期間をあけてから再度お試しください。';
    case 'AI_OVERLOADED':
      return '現在 AI サーバーが混み合っています。少し時間をおいてからもう一度お試しください。';
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return '現在 AI 診断機能をメンテナンス中です。しばらくしてからお試しください。';
    default:
      return 'AI レポートの生成に失敗しました。しばらくしてからもう一度お試しください。';
  }
}

function buildQuestionCatalogPayload(
  questionsById: Record<string, Question>
): Record<
  string,
  { category: string; title: string; choices: Record<string, string>; matchRule?: string }
> {
  const questionCatalog: Record<
    string,
    { category: string; title: string; choices: Record<string, string>; matchRule?: string }
  > = {};
  for (const [id, q] of Object.entries(questionsById)) {
    questionCatalog[id] = {
      category: q.category,
      title: q.title,
      choices: q.choices,
      matchRule: q.matchRule,
    };
  }
  return questionCatalog;
}

async function extractEdgeFunctionErrorCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx && typeof ctx.json === 'function') {
      const errBody = await ctx.json();
      if (errBody?.error) return errBody.error;
    }
  } catch {
    // ignore
  }
  return error instanceof Error ? error.message : '';
}

/**
 * サーバー側 Edge Function（generate-ai-report）を呼び出し、課金確認後に AI 相性レポートを生成・取得する
 */
export async function generateServerAiReport(
  questionsById: Record<string, Question>,
  forceRefresh = false
): Promise<{
  ok: boolean;
  cached?: boolean;
  reportRecord?: PairAiReportRecord;
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, error: 'サーバーに接続されていません。' };
  }

  const questionCatalog = buildQuestionCatalogPayload(questionsById);
  const { data, error } = await supabase.functions.invoke('generate-ai-report', {
    body: { mode: 'compatibility', forceRefresh, questionCatalog },
  });

  if (error) {
    const errCode = await extractEdgeFunctionErrorCode(error);
    return { ok: false, error: formatAiReportError(errCode) };
  }

  const payload = data as {
    cached?: boolean;
    error?: string;
    reportRecord?: unknown;
  } | null;

  if (payload?.error) {
    return { ok: false, error: formatAiReportError(payload.error) };
  }

  const parsed = parseReportRecord(payload?.reportRecord);
  if (!parsed) {
    return { ok: false, error: 'レポートデータの読み込みに失敗しました。' };
  }

  return {
    ok: true,
    cached: Boolean(payload?.cached),
    reportRecord: parsed,
  };
}

/**
 * 別れ・関係性の振り返り AI 診断を生成・取得する
 * （相手がすでにペアを解除して1人だけ残っている状態でも、残存回答履歴から優しく分析可能）
 */
export async function generateServerBreakupReflection(
  questionsById: Record<string, Question>,
  forceRefresh = false
): Promise<{
  ok: boolean;
  cached?: boolean;
  reflectionRecord?: PairBreakupReflectionRecord;
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, error: 'サーバーに接続されていません。' };
  }

  const questionCatalog = buildQuestionCatalogPayload(questionsById);
  const { data, error } = await supabase.functions.invoke('generate-ai-report', {
    body: { mode: 'breakup_reflection', forceRefresh, questionCatalog },
  });

  if (error) {
    const errCode = await extractEdgeFunctionErrorCode(error);
    return { ok: false, error: formatAiReportError(errCode) };
  }

  const payload = data as {
    cached?: boolean;
    error?: string;
    reportRecord?: unknown;
  } | null;

  if (payload?.error) {
    return { ok: false, error: formatAiReportError(payload.error) };
  }

  const parsed = parseBreakupReflectionRecord(payload?.reportRecord);
  if (!parsed) {
    return { ok: false, error: '振り返りレポートの読み込みに失敗しました。' };
  }

  return {
    ok: true,
    cached: Boolean(payload?.cached),
    reflectionRecord: parsed,
  };
}
