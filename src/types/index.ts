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
