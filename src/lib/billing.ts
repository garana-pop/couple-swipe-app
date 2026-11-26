import { Platform } from 'react-native';
import Constants from 'expo-constants';
import i18n, { getCurrentLocale } from '../i18n';
import { formatCurrencyAmount } from '../i18n/format';
import type {
  AiReportData,
  AiReportRiskPoint,
  BreakupCausePoint,
  BreakupReflectionData,
  PairAiReportRecord,
  PairBreakupReflectionRecord,
  PairEntitlement,
  Question,
  RiskLevelKey,
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
      unavailableReason: i18n.t('errors.billing.webUnsupported'),
    };
  }
  if (Constants.executionEnvironment === 'storeClient') {
    return {
      rc: null,
      unavailableReason: i18n.t('errors.billing.expoGoUnsupported'),
    };
  }
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    return {
      rc: null,
      unavailableReason: i18n.t('errors.billing.notReady'),
    };
  }

  try {
    // Expo Go / Web でネイティブモジュール未同梱クラッシュを防ぐため遅延読み込み
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    const rc = (mod?.default ?? mod) as RcModule;
    if (!rc || typeof rc.configure !== 'function') {
      return { rc: null, unavailableReason: i18n.t('errors.billing.moduleLoadFailed') };
    }
    return { rc };
  } catch {
    return {
      rc: null,
      unavailableReason: i18n.t('errors.billing.buildUnsupported'),
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

export function normalizeRiskLevel(level: unknown): RiskLevelKey {
  if (typeof level !== 'string') return 'medium';
  const normalized = level.trim().toLowerCase();
  if (normalized === 'low' || normalized === '低') return 'low';
  if (normalized === 'high' || normalized === '高') return 'high';
  return 'medium';
}

function formatYearlyMeta(
  annualPkg: RcPackage | null,
  monthlyPkg: RcPackage | null
): { perMonthLabel: string; discountBadge: string } {
  const locale = getCurrentLocale();
  const annualPrice = annualPkg?.product?.price;
  const monthlyPrice = monthlyPkg?.product?.price;
  const currency = annualPkg?.product?.currencyCode ?? 'USD';

  let perMonthLabel = i18n.t('aiReport.plans.perMonthFallback');
  if (typeof annualPrice === 'number' && annualPrice > 0) {
    const formattedMonthly = formatCurrencyAmount(annualPrice / 12, currency, locale);
    perMonthLabel = i18n.t('aiReport.plans.perMonthLabel', { price: formattedMonthly });
  }

  let discountBadge = i18n.t('aiReport.plans.recommendedBadge');
  if (
    typeof annualPrice === 'number' &&
    typeof monthlyPrice === 'number' &&
    annualPrice > 0 &&
    monthlyPrice > 0
  ) {
    const yearlyAtMonthly = monthlyPrice * 12;
    const discountPct = Math.round((1 - annualPrice / yearlyAtMonthly) * 100);
    if (discountPct >= 5 && discountPct < 100) {
      discountBadge = i18n.t('aiReport.plans.discountBadge', { percent: discountPct });
    }
  }

  return { perMonthLabel, discountBadge };
}

export function getDefaultBillingOfferingPrices(): BillingOfferingPrices {
  return {
    isStoreReady: false,
    yearlyPriceLabel: i18n.t('aiReport.plans.priceLoading'),
    yearlyPerMonthLabel: i18n.t('aiReport.plans.perMonthFallback'),
    yearlyDiscountBadge: i18n.t('aiReport.plans.recommendedBadge'),
    monthlyPriceLabel: i18n.t('aiReport.plans.priceLoading'),
  };
}

/**
 * 開発ビルド／本番ビルド上で RevenueCat SDK を初期化し、ストア価格情報を取得する
 */
export async function initializeBilling(userId: string): Promise<BillingOfferingPrices> {
  const fallback = getDefaultBillingOfferingPrices();

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
        ? i18n.t('aiReport.plans.yearlyPriceFormat', {
            price: cachedAnnualPkg.product.priceString,
          })
        : fallback.yearlyPriceLabel,
      yearlyPerMonthLabel: perMonthLabel,
      yearlyDiscountBadge: discountBadge,
      monthlyPriceLabel: cachedMonthlyPkg?.product?.priceString
        ? i18n.t('aiReport.plans.monthlyPriceFormat', {
            price: cachedMonthlyPkg.product.priceString,
          })
        : fallback.monthlyPriceLabel,
      unavailableReason:
        cachedAnnualPkg || cachedMonthlyPkg
          ? undefined
          : i18n.t('errors.billing.storeFetchFailed'),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ...fallback,
      unavailableReason: i18n.t('errors.billing.fetchFailed', { detail }),
    };
  }
}

export async function resetBillingSession(): Promise<void> {
  configuredUserId = null;
  cachedAnnualPkg = null;
  cachedMonthlyPkg = null;
  const { rc } = getNativePurchasesModule();
  if (rc && typeof rc.logOut === 'function') {
    try {
      await rc.logOut();
    } catch {
      // ignore
    }
  }
}

export async function purchaseSubscriptionPlan(
  plan: 'monthly' | 'yearly'
): Promise<{ ok: boolean; hasActiveEntitlement?: boolean; cancelled?: boolean; error?: string }> {
  const { rc, unavailableReason } = getNativePurchasesModule();
  if (!rc) {
    return { ok: false, error: unavailableReason ?? i18n.t('errors.billing.cannotPurchaseHere') };
  }

  const pkg = plan === 'yearly' ? cachedAnnualPkg : cachedMonthlyPkg;
  if (!pkg) {
    return {
      ok: false,
      error: i18n.t('errors.billing.packageNotFound'),
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
      error: i18n.t('errors.billing.purchaseFailed', {
        detail: rcErr?.message ?? i18n.t('errors.billing.unknownError'),
      }),
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
    return { ok: false, error: unavailableReason ?? i18n.t('errors.billing.cannotRestoreHere') };
  }
  try {
    const customerInfo = await rc.restorePurchases();
    return {
      ok: true,
      hasActiveEntitlement: hasAnyActiveEntitlement(customerInfo),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: i18n.t('errors.billing.restoreFailed', { detail }) };
  }
}

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

  const rawRisks: unknown[] = Array.isArray(report.riskPoints) ? report.riskPoints : [];
  const riskPoints: AiReportRiskPoint[] = rawRisks
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      level: normalizeRiskLevel(item.level),
      desc: typeof item.desc === 'string' ? item.desc : '',
      advice: typeof item.advice === 'string' ? item.advice : '',
    }))
    .filter((item) => Boolean(item.title || item.desc));

  return {
    id: String(r.id ?? ''),
    locale: typeof r.locale === 'string' ? r.locale : undefined,
    analyzedDays: Number(r.analyzed_days ?? 0),
    analyzedAnswers: Number(r.analyzed_answers ?? 0),
    modelUsed: String(r.model_used ?? ''),
    createdAt: String(r.created_at ?? ''),
    report: {
      reportType: 'compatibility',
      overallScore: typeof report.overallScore === 'number' ? report.overallScore : 80,
      myType: {
        tag: report.myType?.tag ?? i18n.t('aiReport.fallbackTypes.myTag'),
        desc: report.myType?.desc ?? '',
      },
      partnerType: {
        tag: report.partnerType?.tag ?? i18n.t('aiReport.fallbackTypes.partnerTag'),
        desc: report.partnerType?.desc ?? '',
      },
      chemistrySummary: report.chemistrySummary,
      riskPoints,
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
      title: typeof c.title === 'string' ? c.title : i18n.t('aiReport.fallbackTypes.causeTitle'),
      background: typeof c.background === 'string' ? c.background : '',
      takeaway: typeof c.takeaway === 'string' ? c.takeaway : '',
    }))
    .filter((c) => Boolean(c.background || c.takeaway));

  return {
    id: String(r.id ?? ''),
    locale: typeof r.locale === 'string' ? r.locale : undefined,
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

export async function fetchPairEntitlement(): Promise<PairEntitlement | null> {
  if (!supabase) return null;
  const locale = getCurrentLocale();

  let res = await supabase.rpc('get_pair_entitlement', { p_locale: locale });
  if (res.error) {
    // マイグレーション適用前サーバーとの後方互換フォールバック
    res = await supabase.rpc('get_pair_entitlement');
  }

  const { data, error } = res;
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
  const locale = getCurrentLocale();

  let rows: Record<string, unknown>[] | null = null;
  const withLocaleRes = await supabase
    .from('pair_ai_reports')
    .select('id, locale, analyzed_days, analyzed_answers, model_used, created_at, report_json')
    .eq('pair_id', pairId)
    .eq('locale', locale)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!withLocaleRes.error && Array.isArray(withLocaleRes.data)) {
    rows = withLocaleRes.data as Record<string, unknown>[];
  } else {
    // マイグレーション適用前サーバーとの後方互換フォールバック
    const legacyRes = await supabase
      .from('pair_ai_reports')
      .select('id, analyzed_days, analyzed_answers, model_used, created_at, report_json')
      .eq('pair_id', pairId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!legacyRes.error && Array.isArray(legacyRes.data)) {
      rows = legacyRes.data as Record<string, unknown>[];
    }
  }

  if (!rows) {
    return { compatibilityReports: [], reflectionReports: [] };
  }

  const compatibilityReports: PairAiReportRecord[] = [];
  const reflectionReports: PairBreakupReflectionRecord[] = [];

  for (const row of rows) {
    const wrapped = {
      id: row.id,
      locale: row.locale,
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
      return i18n.t('errors.billing.ai.premiumRequired');
    case 'NOT_IN_PAIR':
      return i18n.t('errors.billing.ai.notInPair');
    case 'PARTNER_NOT_CONNECTED':
      return i18n.t('errors.billing.ai.partnerNotConnected');
    case 'NOT_ENOUGH_DATA':
      return i18n.t('errors.billing.ai.notEnoughData');
    case 'DAILY_LIMIT_EXCEEDED':
      return i18n.t('errors.billing.ai.dailyLimit');
    case 'MONTHLY_LIMIT_EXCEEDED':
      return i18n.t('errors.billing.ai.monthlyLimit');
    case 'AI_OVERLOADED':
      return i18n.t('errors.billing.ai.overloaded');
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return i18n.t('errors.billing.ai.notConfigured');
    default:
      return i18n.t('errors.billing.ai.generic');
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
    return { ok: false, error: i18n.t('errors.notConnectedServer') };
  }

  const locale = getCurrentLocale();
  const questionCatalog = buildQuestionCatalogPayload(questionsById);
  const { data, error } = await supabase.functions.invoke('generate-ai-report', {
    body: { mode: 'compatibility', locale, forceRefresh, questionCatalog },
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
    return { ok: false, error: i18n.t('errors.billing.aiReportLoadFailed') };
  }

  return {
    ok: true,
    cached: Boolean(payload?.cached),
    reportRecord: parsed,
  };
}

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
    return { ok: false, error: i18n.t('errors.notConnectedServer') };
  }

  const locale = getCurrentLocale();
  const questionCatalog = buildQuestionCatalogPayload(questionsById);
  const { data, error } = await supabase.functions.invoke('generate-ai-report', {
    body: { mode: 'breakup_reflection', locale, forceRefresh, questionCatalog },
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
    return { ok: false, error: i18n.t('errors.billing.reflectionLoadFailed') };
  }

  return {
    ok: true,
    cached: Boolean(payload?.cached),
    reflectionRecord: parsed,
  };
}
