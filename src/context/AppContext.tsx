import React, { createContext, useContext, useState, useMemo } from 'react';
import { SwipeDirection, Question } from '../types';
import { TODAY_QUESTIONS, DUMMY_PARTNER_ANSWERS } from '../constants/questions';

interface MatchSummary {
  total: number;
  matchedCount: number;
  percentage: number;
  details: {
    question: Question;
    myAnswer?: SwipeDirection;
    partnerAnswer?: SwipeDirection;
    isMatched: boolean;
  }[];
}

interface AppContextType {
  questions: Question[];
  myAnswers: Record<string, SwipeDirection>;
  partnerAnswers: Record<string, SwipeDirection>;
  isPartnerCompleted: boolean;
  isMyCompleted: boolean;
  partnerName: string;
  myName: string;
  pairCode: string;
  isPairConnected: boolean;
  hasSeenTutorial: boolean;
  isTutorialVisible: boolean;
  submitAnswer: (questionId: string, direction: SwipeDirection) => void;
  togglePartnerSimulation: () => void;
  setPartnerCompleted: (completed: boolean) => void;
  connectPair: (code: string) => void;
  resetAnswers: () => void;
  completeTutorial: () => void;
  showTutorial: () => void;
  closeTutorial: () => void;
  matchSummary: MatchSummary;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [questions] = useState<Question[]>(TODAY_QUESTIONS);
  const [myAnswers, setMyAnswers] = useState<Record<string, SwipeDirection>>({});
  const [partnerAnswers] = useState<Record<string, SwipeDirection>>(DUMMY_PARTNER_ANSWERS);
  const [isPartnerCompleted, setIsPartnerCompleted] = useState<boolean>(false); // 初期状態は未完了（相手待ち）
  const [partnerName] = useState<string>('ゆうき');
  const [myName] = useState<string>('あおい');
  const [pairCode] = useState<string>('LOVE-8823');
  const [isPairConnected, setIsPairConnected] = useState<boolean>(true); // デモ用初期値は連携済み

  // チュートリアル状態（初回起動時は未完了＝表示される）
  const [hasSeenTutorial, setHasSeenTutorial] = useState<boolean>(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState<boolean>(true);

  const submitAnswer = (questionId: string, direction: SwipeDirection) => {
    setMyAnswers((prev) => ({
      ...prev,
      [questionId]: direction,
    }));
  };

  const togglePartnerSimulation = () => {
    setIsPartnerCompleted((prev) => !prev);
  };

  const setPartnerCompleted = (completed: boolean) => {
    setIsPartnerCompleted(completed);
  };

  const connectPair = (_code: string) => {
    setIsPairConnected(true);
  };

  const resetAnswers = () => {
    setMyAnswers({});
    setIsPartnerCompleted(false);
  };

  const completeTutorial = () => {
    setHasSeenTutorial(true);
    setIsTutorialVisible(false);
  };

  const showTutorial = () => {
    setIsTutorialVisible(true);
  };

  const closeTutorial = () => {
    setIsTutorialVisible(false);
  };

  const isMyCompleted = useMemo(() => {
    return questions.every((q) => !!myAnswers[q.id]);
  }, [questions, myAnswers]);

  // 一致率の計算 (純粋関数的に算出)
  const matchSummary = useMemo<MatchSummary>(() => {
    const details = questions.map((q) => {
      const my = myAnswers[q.id];
      const partner = partnerAnswers[q.id];

      let isMatched = false;
      if (my && partner) {
        if (my === partner) {
          isMatched = true;
        } else if (q.id === 'q1' && ((my === 'UP' && partner === 'DOWN') || (my === 'DOWN' && partner === 'UP'))) {
          // 「私が厳しい」と相手が「相手が厳しい」と言っていれば相互認識一致
          isMatched = true;
        }
      }

      return {
        question: q,
        myAnswer: my,
        partnerAnswer: partner,
        isMatched,
      };
    });

    const matchedCount = details.filter((d) => d.isMatched).length;
    const total = questions.length;
    const percentage = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

    return {
      total,
      matchedCount,
      percentage,
      details,
    };
  }, [questions, myAnswers, partnerAnswers]);

  return (
    <AppContext.Provider
      value={{
        questions,
        myAnswers,
        partnerAnswers,
        isPartnerCompleted,
        isMyCompleted,
        partnerName,
        myName,
        pairCode,
        isPairConnected,
        hasSeenTutorial,
        isTutorialVisible,
        submitAnswer,
        togglePartnerSimulation,
        setPartnerCompleted,
        connectPair,
        resetAnswers,
        completeTutorial,
        showTutorial,
        closeTutorial,
        matchSummary,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppContextProvider');
  }
  return context;
};
