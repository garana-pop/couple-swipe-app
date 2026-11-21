export type SwipeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface QuestionChoice {
  direction: SwipeDirection;
  label: string;
  subtext?: string;
}

export interface QuestionHistoryItem {
  date: string; // 例: '3ヶ月前 (8月21日)'
  myAnswer: SwipeDirection;
  partnerAnswer: SwipeDirection;
  note?: string; // 変化についての簡単なメモ
}

export interface Question {
  id: string;
  category: string;
  title: string;
  choices: Record<SwipeDirection, string>;
  repeatBadge?: string; // 例: '90日ぶりの質問'
  pastHistory?: QuestionHistoryItem; // 過去の同じ質問への回答記録
}

export interface PairUser {
  id: string;
  name: string;
  avatar: string;
  isMe: boolean;
}

export interface QuizSessionState {
  questions: Question[];
  myAnswers: Record<string, SwipeDirection>;
  partnerAnswers: Record<string, SwipeDirection>;
  isPartnerCompleted: boolean;
  partnerName: string;
  myName: string;
  pairCode: string;
  isPairConnected: boolean;
  hasSeenTutorial: boolean;
}
