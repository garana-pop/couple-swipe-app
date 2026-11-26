import { getCalendars, getLocales, Locale, Weekday } from 'expo-localization';

export const SUPPORTED_LOCALES = [
  'ja',
  'en',
  'fr',
  'ko',
  'ru',
  'th',
  'zh-Hans',
  'zh-Hant',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: SupportedLocale = 'en';

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

const INTL_TAG_MAP: Record<SupportedLocale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  fr: 'fr-FR',
  ko: 'ko-KR',
  ru: 'ru-RU',
  th: 'th-TH',
  'zh-Hans': 'zh-Hans-CN',
  'zh-Hant': 'zh-Hant-TW',
};

const TRADITIONAL_CHINESE_REGIONS = new Set(['TW', 'HK', 'MO']);

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_SET.has(value);
}

/**
 * BCP 47 言語タグ・スクリプトコード・地域コードから対応するアプリ内ロケールへ正規化
 * 未対応言語は null を返し、呼び出し元で次の優先言語またはフォールバック（en）へ移る
 */
export function normalizeLocaleTag(
  languageTag?: string | null,
  languageScriptCode?: string | null,
  regionCode?: string | null
): SupportedLocale | null {
  if (!languageTag && !languageScriptCode) return null;

  const normalizedTag = (languageTag ?? '').replace(/_/g, '-').trim();
  const lowerTag = normalizedTag.toLowerCase();
  const parts = lowerTag.split('-').filter(Boolean);
  const baseLang = parts[0] ?? '';

  if (baseLang === 'zh') {
    const script = (languageScriptCode ?? '').toLowerCase();
    const region = (regionCode ?? '').toUpperCase();

    if (
      script === 'hant' ||
      parts.includes('hant') ||
      parts.includes('tw') ||
      parts.includes('hk') ||
      parts.includes('mo') ||
      TRADITIONAL_CHINESE_REGIONS.has(region)
    ) {
      return 'zh-Hant';
    }
    if (
      script === 'hans' ||
      parts.includes('hans') ||
      parts.includes('cn') ||
      parts.includes('sg') ||
      region === 'CN' ||
      region === 'SG'
    ) {
      return 'zh-Hans';
    }
    return 'zh-Hans';
  }

  switch (baseLang) {
    case 'ja':
      return 'ja';
    case 'en':
      return 'en';
    case 'fr':
      return 'fr';
    case 'ko':
      return 'ko';
    case 'ru':
      return 'ru';
    case 'th':
      return 'th';
    default:
      return null;
  }
}

/**
 * OS の優先言語リストを先頭から走査し、最初に一致した対応言語を返す（一致なしは en）
 */
export function resolveLocaleFromList(locales: readonly Locale[] | null | undefined): SupportedLocale {
  if (!Array.isArray(locales) || locales.length === 0) {
    return FALLBACK_LOCALE;
  }

  for (const item of locales) {
    const matched = normalizeLocaleTag(
      item.languageTag || item.languageCode,
      item.languageScriptCode,
      item.languageRegionCode || item.regionCode
    );
    if (matched) return matched;
  }

  return FALLBACK_LOCALE;
}

/**
 * 現在の端末設定からアプリ表示言語を同期解決する
 */
export function getDeviceAppLocale(): SupportedLocale {
  try {
    return resolveLocaleFromList(getLocales());
  } catch {
    return FALLBACK_LOCALE;
  }
}

export function getIntlLocaleTag(locale: SupportedLocale): string {
  return INTL_TAG_MAP[locale] ?? 'en-US';
}

/**
 * 端末の IANA タイムゾーン（例: America/New_York, Asia/Tokyo）を取得する
 */
export function getDeviceTimeZone(): string {
  try {
    const tz = getCalendars()[0]?.timeZone;
    if (tz && tz.includes('/')) return tz;
  } catch {
    // Fallback to Intl below
  }

  try {
    const intlTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (intlTz && intlTz.includes('/')) return intlTz;
  } catch {
    // Fallback to UTC below
  }

  return 'UTC';
}

/**
 * カレンダーの週開始曜日を返す（0: 日曜始まり, 1: 月曜始まり）
 */
export function getDeviceFirstWeekday(locale: SupportedLocale): 0 | 1 {
  try {
    const firstWeekday = getCalendars()[0]?.firstWeekday;
    if (firstWeekday === Weekday.MONDAY) return 1;
    if (firstWeekday === Weekday.SUNDAY) return 0;
  } catch {
    // Fallback below
  }
  return locale === 'fr' || locale === 'ru' ? 1 : 0;
}

const DEFAULT_PLACEHOLDER_NAMES = new Set([
  '',
  'あなた',
  'パートナー',
  'お相手',
  'You',
  'Partner',
]);

/**
 * 未設定または旧バージョンの日本語デフォルト名かどうか判定する
 */
export function isDefaultDisplayName(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  return DEFAULT_PLACEHOLDER_NAMES.has(trimmed);
}

export function isThaiLocale(locale: string): boolean {
  return locale === 'th';
}

export function isCompactCjkLocale(locale: string): boolean {
  return locale === 'ja' || locale === 'ko' || locale === 'zh-Hans' || locale === 'zh-Hant';
}

export function isLongTextLocale(locale: string): boolean {
  return locale === 'ru' || locale === 'fr' || locale === 'en';
}
