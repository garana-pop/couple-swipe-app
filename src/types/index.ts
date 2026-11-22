export type SwipeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type MatchRule = 'exact' | 'mirror_up_down';

export interface QuestionChoice {
  direction: SwipeDirection;
  label: string;
  subtext?: string;
}

export interface QuestionHistoryItem {
  date: string; // 例: '2026-08-21 (90日前)'
  myAnswer: SwipeDirection;
  partnerAnswer: SwipeDirection;
  note?: string;
}

export interface Question {
  id: string;
  category: string;
  title: string;
  choices: Record<SwipeDirection, string>;
  matchRule?: MatchRule; // 省略時は 'exact'
  repeatBadge?: string; // 例: '90日ぶりの質問'
  pastHistory?: QuestionHistoryItem; // 過去の同じ質問への回答記録
}

export interface RemoteQuestionRecord extends Question {
  isActive: boolean;
  updatedAt: string;
}

export interface PairUser {
  id: string;
  name: string;
  avatar: string;
  isMe: boolean;
}

export interface HistoryDayAnswer {
  question: Question;
  myAnswer?: SwipeDirection;
  partnerAnswer?: SwipeDirection;
  isMatched: boolean;
}

export interface HistoryDayItem {
  quizDate: string; // YYYY-MM-DD
  items: HistoryDayAnswer[];
}

export interface AiReportRiskPoint {
  title: string;
  level: '低' | '中' | '高';
  desc: string;
  advice: string;
}

export interface AiReportData {
  overallScore: number;
  myType: { tag: string; desc: string };
  partnerType: { tag: string; desc: string };
  chemistrySummary: string;
  riskPoints: AiReportRiskPoint[];
  nextActionTip: string;
}

export interface PairAiReportRecord {
  id: string;
  analyzedDays: number;
  analyzedAnswers: number;
  modelUsed: string;
  createdAt: string;
  report: AiReportData;
}

export interface PairEntitlement {
  hasPair: boolean;
  isPremium: boolean;
  paidByMe: boolean;
  paidByPartner: boolean;
  status: string;
  productId: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  revealedDaysCount: number;
  latestReport: PairAiReportRecord | null;
}
