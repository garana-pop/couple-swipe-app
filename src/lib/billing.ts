import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  AiReportData,
  PairAiReportRecord,
  PairEntitlement,
  Question,
} from '../types';
import { supabase } from './supabase';

export interface BillingOfferingPrices {
  isStoreReady: boolean;
  yearlyPriceLabel: string;
  monthlyPriceLabel: string;
  unavailableReason?: string;
}

interface RcPackage {
  identifier: string;
  packageType?: string;
  product?: {
    identifier?: string;
    priceString?: string;
  };
}

interface RcModule {
  configure: (config: { apiKey: string; appUserID?: string | null }) => void;
  logIn: (appUserID: string) => Promise<unknown>;
  getOfferings: () => Promise<{
    current?: {
      annual?: RcPackage | null;
      monthly?: RcPackage | null;
      availablePackages?: RcPackage[];
    } | null;
  }>;
  purchasePackage: (pkg: RcPackage) => Promise<unknown>;
  restorePurchases: () => Promise<unknown>;
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
      unavailableReason: 'Expo Go ではアプリ内課金を利用できません（EAS ビルド版で有効になります）。',
    };
  }
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    return {
      rc: null,
      unavailableReason: 'RevenueCat の公開 API キーが未設定です（docs/RELEASE_GUIDE.md を参照してください）。',
    };
  }

  try {
    // Expo Go / Web でネイティブモジュール未同梱クラッシュを防ぐため遅延読み込み
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    const rc = (mod?.default ?? mod) as RcModule;
    if (!rc || typeof rc.configure !== 'function') {
      return { rc: null, unavailableReason: '課金モジュールを読み込めませんでした。' };
    }
    return { rc };
  } catch {
    return {
      rc: null,
      unavailableReason: 'このビルドには課金モジュールが含まれていません（EAS 開発ビルドで有効化されます）。',
    };
  }
}

/**
 * 開発ビルド／本番ビルド上で RevenueCat SDK を初期化し、Google Play / App Store の価格情報を取得する
 */
export async function initializeBilling(userId: string): Promise<BillingOfferingPrices> {
  const fallback: BillingOfferingPrices = {
    isStoreReady: false,
    yearlyPriceLabel: '¥3,600 / 年',
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
      current?.availablePackages?.find((p) => p.packageType === 'ANNUAL') ??
      null;
    cachedMonthlyPkg =
      current?.monthly ??
      current?.availablePackages?.find((p) => p.packageType === 'MONTHLY') ??
      null;

    return {
      isStoreReady: Boolean(cachedAnnualPkg || cachedMonthlyPkg),
      yearlyPriceLabel: cachedAnnualPkg?.product?.priceString
        ? `${cachedAnnualPkg.product.priceString} / 年`
        : fallback.yearlyPriceLabel,
      monthlyPriceLabel: cachedMonthlyPkg?.product?.priceString
        ? `${cachedMonthlyPkg.product.priceString} / 月`
        : fallback.monthlyPriceLabel,
      unavailableReason:
        cachedAnnualPkg || cachedMonthlyPkg
          ? undefined
          : 'ストアの商品情報（Offering）がまだ公開されていません。',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ...fallback,
      unavailableReason: `課金情報の取得に失敗しました（${detail}）。`,
    };
  }
}

export async function purchaseSubscriptionPlan(
  plan: 'monthly' | 'yearly'
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
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
    await rc.purchasePackage(pkg);
    return { ok: true };
  } catch (err) {
    const rcErr = err as { userCancelled?: boolean; message?: string };
    if (rcErr?.userCancelled) {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error: `購入処理に失敗しました（${rcErr?.message ?? '不明なエラー'}）。`,
    };
  }
}

export async function restoreSubscriptionPurchases(): Promise<{ ok: boolean; error?: string }> {
  const { rc, unavailableReason } = getNativePurchasesModule();
  if (!rc) {
    return { ok: false, error: unavailableReason ?? '現在この環境では復元できません。' };
  }
  try {
    await rc.restorePurchases();
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `購入の復元に失敗しました（${detail}）。` };
  }
}

function parseReportRecord(raw: unknown): PairAiReportRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const report = r.report as Partial<AiReportData> | undefined;
  if (!report || typeof report !== 'object' || typeof report.chemistrySummary !== 'string') {
    return null;
  }
  return {
    id: String(r.id ?? ''),
    analyzedDays: Number(r.analyzed_days ?? 0),
    analyzedAnswers: Number(r.analyzed_answers ?? 0),
    modelUsed: String(r.model_used ?? ''),
    createdAt: String(r.created_at ?? ''),
    report: {
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
    revealedDaysCount: Number(d.revealed_days_count ?? 0),
    pastPartnerOnlyDaysCount: Number(d.past_partner_only_days_count ?? 0),
    pastUnansweredDaysCount: Number(d.past_unanswered_days_count ?? 0),
    analyzableDaysCount: Number(d.analyzable_days_count ?? d.revealed_days_count ?? 0),
    latestReport: parseReportRecord(d.latest_report),
  };
}

function formatAiReportError(code: string): string {
  switch (code) {
    case 'PREMIUM_REQUIRED':
      return 'AI 相性レポートの生成には「ふたりプレミアムプラン」への加入が必要です（パートナーの加入でも利用できます）。';
    case 'NOT_IN_PAIR':
    case 'PARTNER_NOT_CONNECTED':
      return 'パートナーとのペア連携完了後に AI 相性レポートを作成できます。';
    case 'NOT_ENOUGH_DATA':
      return '分析できる回答データがまだありません。今日の3問に答えるか、過去の回答データが揃うとお試しいただけます。';
    case 'DAILY_LIMIT_EXCEEDED':
      return '本日の AI 診断レポート生成回数の上限（1日3回）に達しました。明日になってから再度お試しください。';
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return 'サーバー側の AI API キー（GEMINI_API_KEY）がまだ設定されていません。';
    default:
      return 'AI 相性レポートの生成に失敗しました。しばらくしてからもう一度お試しください。';
  }
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
    return { ok: false, error: 'Supabase が未設定です。' };
  }

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

  const { data, error } = await supabase.functions.invoke('generate-ai-report', {
    body: { forceRefresh, questionCatalog },
  });

  if (error) {
    // Edge Function が 400 / 402 / 503 の JSON エラーを返した場合、本文からエラーコードを抽出
    let errCode = '';
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json();
        errCode = errBody?.error ?? '';
      }
    } catch {
      // ignore
    }
    return { ok: false, error: formatAiReportError(errCode || error.message) };
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
