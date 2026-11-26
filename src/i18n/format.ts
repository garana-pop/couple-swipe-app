import {
  SupportedLocale,
  getIntlLocaleTag,
  isCompactCjkLocale,
} from './locale';

function parseIsoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function makeUtcMiddayDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * YYYY-MM-DD を完全日付（曜日付き）にフォーマット
 * 例: ja -> 2026年11月25日(水) / en -> Wed, Nov 25, 2026
 */
export function formatIsoFullDate(isoDate: string, locale: SupportedLocale): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return isoDate;
  const date = makeUtcMiddayDate(parts.year, parts.month, parts.day);
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return isoDate;
  }
}

/**
 * YYYY-MM-DD を月・日のみにフォーマット
 * 例: ja -> 11月25日 / en -> Nov 25 / fr -> 25 nov.
 */
export function formatIsoShortDate(isoDate: string, locale: SupportedLocale): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return isoDate;
  const date = makeUtcMiddayDate(parts.year, parts.month, parts.day);
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return `${parts.month}/${parts.day}`;
  }
}

/**
 * 年月見出し（カレンダーヘッダー用）
 * 例: ja -> 2026年11月 / en -> November 2026
 */
export function formatYearMonth(year: number, month: number, locale: SupportedLocale): string {
  const date = makeUtcMiddayDate(year, month, 1);
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return `${year}/${month}`;
  }
}

/**
 * ISO タイムスタンプをローカル日時（年月日時分）にフォーマット
 */
export function formatDateTimeFromIso(isoTimestamp: string, locale: SupportedLocale): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * ISO タイムスタンプをローカル年月日のみにフォーマット
 */
export function formatDateOnlyFromIso(isoTimestamp: string, locale: SupportedLocale): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(locale), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
}

/**
 * 7列カレンダー用の曜日ラベル配列を返す
 * - CJK (ja/ko/zh-Hans/zh-Hant): narrow (日, 月, ...)
 * - 欧文・タイ語 (en/fr/ru/th): short（末尾ドット除去）で重複を回避しつつコンパクト表示
 */
export function getCalendarWeekdayLabels(
  locale: SupportedLocale,
  weekStartsOn: 0 | 1
): string[] {
  const intlTag = getIntlLocaleTag(locale);
  const style: 'narrow' | 'short' = isCompactCjkLocale(locale) ? 'narrow' : 'short';
  // 2024-01-07 is Sunday, 2024-01-08 is Monday
  const startDay = weekStartsOn === 1 ? 8 : 7;

  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = makeUtcMiddayDate(2024, 1, startDay + i);
    try {
      let raw = new Intl.DateTimeFormat(intlTag, {
        weekday: style,
        timeZone: 'UTC',
      }).format(date);
      if (locale === 'fr') {
        raw = raw.replace(/\.$/, '');
      }
      labels.push(raw);
    } catch {
      const fallback = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      labels.push(fallback[(weekStartsOn + i) % 7]);
    }
  }
  return labels;
}

/**
 * 通貨フォーマット（JPY / KRW は小数なし、その他は小数2桁まで）
 */
export function formatCurrencyAmount(
  amount: number,
  currencyCode: string,
  locale: SupportedLocale
): string {
  const code = (currencyCode || 'USD').toUpperCase();
  const isZeroDecimal = code === 'JPY' || code === 'KRW';
  try {
    return new Intl.NumberFormat(getIntlLocaleTag(locale), {
      style: 'currency',
      currency: code,
      maximumFractionDigits: isZeroDecimal ? 0 : 2,
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
    }).format(isZeroDecimal ? Math.round(amount) : amount);
  } catch {
    const formatted = isZeroDecimal ? Math.round(amount).toLocaleString() : amount.toFixed(2);
    return `${formatted} ${code}`;
  }
}

export function formatTimeHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
