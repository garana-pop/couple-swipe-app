import i18n, { getCurrentLocale } from '../i18n';
import type { SupportedLocale } from '../i18n/locale';
import {
  MatchRule,
  Question,
  QuestionCategoryKey,
  RemoteQuestionRecord,
  SwipeDirection,
} from '../types';

interface QuestionMeta {
  id: string;
  categoryKey: QuestionCategoryKey;
  matchRule?: MatchRule;
}

interface QuestionTranslationBundle {
  categories?: Partial<Record<QuestionCategoryKey, string>>;
  items?: Record<
    string,
    {
      title: string;
      choices: Record<SwipeDirection, string>;
    }
  >;
}

/**
 * 同梱120問の言語非依存メタデータ
 * - 表示文言は src/i18n/locales/{lang}/questions.json で管理
 * - matchRule: 'mirror_up_down' は UP(自分) と DOWN(相手) の組み合わせを相互認識一致とみなす
 */
export const BUNDLED_QUESTION_META: readonly QuestionMeta[] = [
  { id: 'q1', categoryKey: 'lifestyle', matchRule: 'mirror_up_down' },
  { id: 'q2', categoryKey: 'holidays' },
  { id: 'q3', categoryKey: 'anniversary' },
  { id: 'q4', categoryKey: 'lifestyle' },
  { id: 'q5', categoryKey: 'lifestyle' },
  { id: 'q6', categoryKey: 'lifestyle' },
  { id: 'q7', categoryKey: 'lifestyle' },
  { id: 'q8', categoryKey: 'lifestyle', matchRule: 'mirror_up_down' },
  { id: 'q9', categoryKey: 'lifestyle' },
  { id: 'q10', categoryKey: 'lifestyle' },
  { id: 'q11', categoryKey: 'lifestyle' },
  { id: 'q12', categoryKey: 'lifestyle' },
  { id: 'q13', categoryKey: 'communication' },
  { id: 'q14', categoryKey: 'communication' },
  { id: 'q15', categoryKey: 'affection' },
  { id: 'q16', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q17', categoryKey: 'communication' },
  { id: 'q18', categoryKey: 'affection' },
  { id: 'q19', categoryKey: 'communication' },
  { id: 'q20', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q21', categoryKey: 'affection' },
  { id: 'q22', categoryKey: 'communication' },
  { id: 'q23', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q24', categoryKey: 'communication' },
  { id: 'q25', categoryKey: 'money_future' },
  { id: 'q26', categoryKey: 'money_future' },
  { id: 'q27', categoryKey: 'money_future' },
  { id: 'q28', categoryKey: 'money_future' },
  { id: 'q29', categoryKey: 'money_future' },
  { id: 'q30', categoryKey: 'money_future', matchRule: 'mirror_up_down' },
  { id: 'q31', categoryKey: 'money_future' },
  { id: 'q32', categoryKey: 'money_future' },
  { id: 'q33', categoryKey: 'food' },
  { id: 'q34', categoryKey: 'food' },
  { id: 'q35', categoryKey: 'food' },
  { id: 'q36', categoryKey: 'food' },
  { id: 'q37', categoryKey: 'food' },
  { id: 'q38', categoryKey: 'food' },
  { id: 'q39', categoryKey: 'food' },
  { id: 'q40', categoryKey: 'food', matchRule: 'mirror_up_down' },
  { id: 'q41', categoryKey: 'travel' },
  { id: 'q42', categoryKey: 'travel' },
  { id: 'q43', categoryKey: 'travel' },
  { id: 'q44', categoryKey: 'holidays' },
  { id: 'q45', categoryKey: 'holidays' },
  { id: 'q46', categoryKey: 'travel' },
  { id: 'q47', categoryKey: 'holidays' },
  { id: 'q48', categoryKey: 'travel' },
  { id: 'q49', categoryKey: 'relationship', matchRule: 'mirror_up_down' },
  { id: 'q50', categoryKey: 'relationship', matchRule: 'mirror_up_down' },
  { id: 'q51', categoryKey: 'anniversary' },
  { id: 'q52', categoryKey: 'relationship' },
  { id: 'q53', categoryKey: 'relationship', matchRule: 'mirror_up_down' },
  { id: 'q54', categoryKey: 'relationship' },
  { id: 'q55', categoryKey: 'lifestyle' },
  { id: 'q56', categoryKey: 'relationship' },
  { id: 'q57', categoryKey: 'lifestyle' },
  { id: 'q58', categoryKey: 'communication' },
  { id: 'q59', categoryKey: 'relationship' },
  { id: 'q60', categoryKey: 'anniversary' },
  { id: 'q61', categoryKey: 'lifestyle' },
  { id: 'q62', categoryKey: 'lifestyle' },
  { id: 'q63', categoryKey: 'lifestyle' },
  { id: 'q64', categoryKey: 'lifestyle', matchRule: 'mirror_up_down' },
  { id: 'q65', categoryKey: 'lifestyle' },
  { id: 'q66', categoryKey: 'lifestyle' },
  { id: 'q67', categoryKey: 'lifestyle' },
  { id: 'q68', categoryKey: 'lifestyle' },
  { id: 'q69', categoryKey: 'lifestyle' },
  { id: 'q70', categoryKey: 'lifestyle', matchRule: 'mirror_up_down' },
  { id: 'q71', categoryKey: 'communication' },
  { id: 'q72', categoryKey: 'communication' },
  { id: 'q73', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q74', categoryKey: 'communication' },
  { id: 'q75', categoryKey: 'communication' },
  { id: 'q76', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q77', categoryKey: 'communication' },
  { id: 'q78', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q79', categoryKey: 'communication' },
  { id: 'q80', categoryKey: 'communication' },
  { id: 'q81', categoryKey: 'communication', matchRule: 'mirror_up_down' },
  { id: 'q82', categoryKey: 'communication' },
  { id: 'q83', categoryKey: 'affection' },
  { id: 'q84', categoryKey: 'affection' },
  { id: 'q85', categoryKey: 'affection' },
  { id: 'q86', categoryKey: 'affection', matchRule: 'mirror_up_down' },
  { id: 'q87', categoryKey: 'affection' },
  { id: 'q88', categoryKey: 'anniversary' },
  { id: 'q89', categoryKey: 'affection' },
  { id: 'q90', categoryKey: 'affection' },
  { id: 'q91', categoryKey: 'food' },
  { id: 'q92', categoryKey: 'food' },
  { id: 'q93', categoryKey: 'food' },
  { id: 'q94', categoryKey: 'food', matchRule: 'mirror_up_down' },
  { id: 'q95', categoryKey: 'food' },
  { id: 'q96', categoryKey: 'food' },
  { id: 'q97', categoryKey: 'food' },
  { id: 'q98', categoryKey: 'food' },
  { id: 'q99', categoryKey: 'money_future' },
  { id: 'q100', categoryKey: 'money_future' },
  { id: 'q101', categoryKey: 'money_future' },
  { id: 'q102', categoryKey: 'money_future', matchRule: 'mirror_up_down' },
  { id: 'q103', categoryKey: 'money_future' },
  { id: 'q104', categoryKey: 'money_future' },
  { id: 'q105', categoryKey: 'money_future' },
  { id: 'q106', categoryKey: 'money_future' },
  { id: 'q107', categoryKey: 'travel' },
  { id: 'q108', categoryKey: 'travel' },
  { id: 'q109', categoryKey: 'travel' },
  { id: 'q110', categoryKey: 'travel' },
  { id: 'q111', categoryKey: 'holidays' },
  { id: 'q112', categoryKey: 'travel' },
  { id: 'q113', categoryKey: 'holidays' },
  { id: 'q114', categoryKey: 'holidays' },
  { id: 'q115', categoryKey: 'relationship' },
  { id: 'q116', categoryKey: 'relationship' },
  { id: 'q117', categoryKey: 'relationship' },
  { id: 'q118', categoryKey: 'relationship' },
  { id: 'q119', categoryKey: 'anniversary' },
  { id: 'q120', categoryKey: 'relationship' },
];

export const QUESTION_POOL_IDS: string[] = BUNDLED_QUESTION_META.map((q) => q.id);

function getQuestionBundle(locale: string): QuestionTranslationBundle {
  return (i18n.getResourceBundle(locale, 'questions') ?? {}) as QuestionTranslationBundle;
}

function inferCategoryKeyFromLabel(rawCategory: string): QuestionCategoryKey {
  if (rawCategory.includes('暮らし') || rawCategory.includes('価値観')) return 'lifestyle';
  if (rawCategory.includes('休日')) return 'holidays';
  if (rawCategory.includes('記念日') || rawCategory.includes('イベント')) return 'anniversary';
  if (rawCategory.includes('食') || rawCategory.includes('好み')) return 'food';
  if (rawCategory.includes('コミュニケーション') || rawCategory.includes('連絡')) return 'communication';
  if (rawCategory.includes('愛情') || rawCategory.includes('恋愛')) return 'affection';
  if (rawCategory.includes('お金') || rawCategory.includes('将来')) return 'money_future';
  if (rawCategory.includes('旅行') || rawCategory.includes('お出かけ')) return 'travel';
  if (rawCategory.includes('関係')) return 'relationship';
  return 'other';
}

export function getBundledQuestions(locale: SupportedLocale = getCurrentLocale()): Question[] {
  const primary = getQuestionBundle(locale);
  const enFallback = getQuestionBundle('en');
  const jaFallback = getQuestionBundle('ja');

  return BUNDLED_QUESTION_META.map((meta) => {
    const entry =
      primary.items?.[meta.id] ??
      enFallback.items?.[meta.id] ??
      jaFallback.items?.[meta.id];
    const categoryLabel =
      primary.categories?.[meta.categoryKey] ??
      enFallback.categories?.[meta.categoryKey] ??
      jaFallback.categories?.[meta.categoryKey] ??
      meta.categoryKey;

    return {
      id: meta.id,
      categoryKey: meta.categoryKey,
      category: categoryLabel,
      title: entry?.title ?? meta.id,
      choices: entry?.choices ?? { UP: '', DOWN: '', LEFT: '', RIGHT: '' },
      matchRule: meta.matchRule,
    };
  });
}

export function getDefaultTodayQuestions(locale: SupportedLocale = getCurrentLocale()): Question[] {
  return getBundledQuestions(locale).slice(0, 3);
}

/**
 * 同梱質問とリモート追加配信質問（キャッシュ済み）を指定ロケールで統合したカタログを生成
 */
export function buildQuestionCatalog(
  extraQuestions: RemoteQuestionRecord[],
  locale: SupportedLocale = getCurrentLocale()
): {
  questionsById: Record<string, Question>;
  activePoolIds: string[];
} {
  const bundled = getBundledQuestions(locale);
  const questionsById: Record<string, Question> = Object.fromEntries(
    bundled.map((q) => [q.id, q])
  );
  const poolSet = new Set<string>(QUESTION_POOL_IDS);

  const primaryBundle = getQuestionBundle(locale);
  const enBundle = getQuestionBundle('en');

  for (const item of extraQuestions) {
    const translated =
      item.translations?.[locale] ??
      (locale !== 'ja' ? item.translations?.en : undefined);
    const categoryKey = item.categoryKey ?? inferCategoryKeyFromLabel(item.category);
    const fallbackCategoryLabel =
      primaryBundle.categories?.[categoryKey] ??
      enBundle.categories?.[categoryKey] ??
      item.category;

    const question: Question = {
      id: item.id,
      categoryKey,
      category: translated?.category || fallbackCategoryLabel,
      title: translated?.title || item.title,
      choices: translated?.choices || item.choices,
      matchRule: item.matchRule ?? 'exact',
    };
    questionsById[item.id] = question;

    if (item.isActive) {
      poolSet.add(item.id);
    } else {
      poolSet.delete(item.id);
    }
  }

  return {
    questionsById,
    activePoolIds: Array.from(poolSet),
  };
}

/**
 * 質問スキーマの matchRule に基づいて一致判定を行う
 */
export function evaluateMatch(
  question: Question,
  my?: SwipeDirection,
  partner?: SwipeDirection
): boolean {
  if (!my || !partner) return false;
  if (my === partner) return true;
  if (question.matchRule === 'mirror_up_down') {
    return (my === 'UP' && partner === 'DOWN') || (my === 'DOWN' && partner === 'UP');
  }
  return false;
}
