import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { SwipeDirection, Question, HistoryDayItem } from '../types';
import {
  TODAY_QUESTIONS,
  buildQuestionCatalog,
  evaluateMatch,
} from '../constants/questions';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { syncExtraQuestions } from '../lib/extraQuestions';
import {
  AccountAuthInfo,
  extractAccountAuthInfo,
  linkGoogleIdentity,
  signInWithGoogleAccount,
} from '../lib/auth';
import {
  PushRegistrationResult,
  cancelDailyReminder,
  configureNotificationHandler,
  notifyPartnerAnswered,
  registerForPushNotificationsAsync,
  scheduleDailyReminder,
} from '../lib/notifications';
import {
  DEFAULT_DAILY_REMINDER,
  DailyReminderSettings,
  getHasSeenTutorial,
  setHasSeenTutorialStorage,
  getCachedDisplayName,
  setCachedDisplayName,
  getCachedExtraQuestions,
  getDailyReminderSettings,
} from '../lib/storage';

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

interface DayStatus {
  totalQuestions: number;
  myAnsweredCount: number;
  partnerAnsweredCount: number;
  isMyCompleted: boolean;
  isPartnerCompleted: boolean;
  isRevealed: boolean;
}

interface AppContextType {
  isInitialized: boolean;
  isLoading: boolean;
  isSupabaseReady: boolean;
  authError: string | null;
  userId: string | null;
  accountAuth: AccountAuthInfo;
  pairId: string | null;
  hasPair: boolean;
  isPairConnected: boolean;
  pairCode: string;
  myName: string;
  partnerName: string;
  todayDate: string;
  questions: Question[];
  myAnswers: Record<string, SwipeDirection>;
  partnerAnswers: Record<string, SwipeDirection>;
  dayStatus: DayStatus;
  isMyCompleted: boolean;
  isPartnerCompleted: boolean;
  hasSeenTutorial: boolean;
  isTutorialVisible: boolean;
  historyDays: HistoryDayItem[];
  isHistoryLoading: boolean;
  dailyReminder: DailyReminderSettings;
  pushStatus: PushRegistrationResult | null;
  submitAnswer: (questionId: string, direction: SwipeDirection) => Promise<void>;
  createPair: (displayName?: string) => Promise<{ ok: boolean; error?: string }>;
  joinPair: (code: string, displayName?: string) => Promise<{ ok: boolean; error?: string }>;
  leavePair: () => Promise<{ ok: boolean; error?: string }>;
  regenerateInviteCode: () => Promise<{ ok: boolean; error?: string }>;
  updateMyName: (name: string) => Promise<{ ok: boolean; error?: string }>;
  enableDailyReminder: (hour: number, minute: number) => Promise<{ ok: boolean; error?: string }>;
  disableDailyReminder: () => Promise<void>;
  registerPushNotifications: () => Promise<PushRegistrationResult>;
  linkGoogle: () => Promise<{ ok: boolean; cancelled?: boolean; redirecting?: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ ok: boolean; cancelled?: boolean; redirecting?: boolean; error?: string }>;
  refreshState: () => Promise<void>;
  refreshDayStatus: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  completeTutorial: () => void;
  showTutorial: () => void;
  closeTutorial: () => void;
  getQuestionsById: () => Record<string, Question>;
  matchSummary: MatchSummary;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function formatJoinError(message: string): string {
  if (message.includes('TOO_MANY_ATTEMPTS')) {
    return '試行回数が上限に達しました。15分ほど待ってから再度お試しください。';
  }
  if (message.includes('INVALID_INVITE_CODE')) {
    return '招待コードの形式が正しくありません。';
  }
  if (message.includes('INVITE_CODE_NOT_FOUND')) {
    return '招待コードが見つかりませんでした。文字をもう一度ご確認ください。';
  }
  if (message.includes('INVITE_CODE_EXPIRED')) {
    return 'この招待コードは有効期限が切れています。パートナーに再発行を依頼してください。';
  }
  if (message.includes('PAIR_IS_FULL')) {
    return 'このペアはすでに2人が参加済みです。';
  }
  if (message.includes('ALREADY_IN_PAIR')) {
    return 'すでに別のペアに参加しています。先にペアを解除してください。';
  }
  return '連携処理に失敗しました。通信環境をご確認のうえ再度お試しください。';
}

function formatPastDateLabel(pastDateStr: string, currentDateStr: string): { badge: string; label: string } {
  const past = new Date(`${pastDateStr}T00:00:00Z`);
  const curr = new Date(`${currentDateStr}T00:00:00Z`);
  const diffDays = Math.max(1, Math.round((curr.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)));
  const month = past.getUTCMonth() + 1;
  const day = past.getUTCDate();
  return {
    badge: `${diffDays}日ぶりの質問`,
    label: `${diffDays}日前 (${month}月${day}日)`,
  };
}

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [accountAuth, setAccountAuth] = useState<AccountAuthInfo>({
    isAnonymous: true,
    email: null,
    isGoogleLinked: false,
  });
  const [pairId, setPairId] = useState<string | null>(null);
  const [hasPair, setHasPair] = useState(false);
  const [isPairConnected, setIsPairConnected] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [myName, setMyName] = useState('あなた');
  const [partnerName, setPartnerName] = useState('パートナー');
  const [todayDate, setTodayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [questions, setQuestions] = useState<Question[]>(TODAY_QUESTIONS);
  const [myAnswers, setMyAnswers] = useState<Record<string, SwipeDirection>>({});
  const [partnerAnswers, setPartnerAnswers] = useState<Record<string, SwipeDirection>>({});
  const [dayStatus, setDayStatus] = useState<DayStatus>({
    totalQuestions: TODAY_QUESTIONS.length,
    myAnsweredCount: 0,
    partnerAnsweredCount: 0,
    isMyCompleted: false,
    isPartnerCompleted: false,
    isRevealed: false,
  });

  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);

  const [historyDays, setHistoryDays] = useState<HistoryDayItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [dailyReminder, setDailyReminder] = useState<DailyReminderSettings>(DEFAULT_DAILY_REMINDER);
  const [pushStatus, setPushStatus] = useState<PushRegistrationResult | null>(null);

  const catalogRef = useRef(buildQuestionCatalog([]));

  const refreshQuestionCatalog = useCallback(
    async (options?: { force?: boolean; fullRefresh?: boolean }) => {
      const records = await syncExtraQuestions(options);
      const nextCatalog = buildQuestionCatalog(records);
      catalogRef.current = nextCatalog;
      return nextCatalog;
    },
    []
  );

  const loadAnswersForDay = useCallback(
    async (targetPairId: string, quizDate: string, currentUserId: string) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('answers')
        .select('question_id, user_id, direction')
        .eq('pair_id', targetPairId)
        .eq('quiz_date', quizDate);

      if (error || !data) return;

      const mine: Record<string, SwipeDirection> = {};
      const partner: Record<string, SwipeDirection> = {};
      for (const row of data) {
        if (row.user_id === currentUserId) {
          mine[row.question_id] = row.direction as SwipeDirection;
        } else {
          partner[row.question_id] = row.direction as SwipeDirection;
        }
      }
      setMyAnswers(mine);
      setPartnerAnswers(partner);
    },
    []
  );

  const loadPairAndDailyData = useCallback(
    async (currentUserId: string) => {
      if (!supabase) return;

      const { data: pairState, error: pairErr } = await supabase.rpc('get_pair_state');
      if (pairErr || !pairState) {
        return;
      }

      setHasPair(Boolean(pairState.has_pair));
      setIsPairConnected(Boolean(pairState.is_pair_connected));
      setPairId(pairState.pair_id ?? null);
      setPairCode(pairState.invite_code ?? '');
      if (pairState.my_name) {
        setMyName(pairState.my_name);
        await setCachedDisplayName(pairState.my_name);
      }
      setPartnerName(pairState.partner_name ?? 'パートナー');
      if (pairState.today_date) {
        setTodayDate(pairState.today_date);
      }

      if (!pairState.has_pair || !pairState.pair_id) {
        setQuestions(TODAY_QUESTIONS);
        setMyAnswers({});
        setPartnerAnswers({});
        setDayStatus({
          totalQuestions: TODAY_QUESTIONS.length,
          myAnsweredCount: 0,
          partnerAnsweredCount: 0,
          isMyCompleted: false,
          isPartnerCompleted: false,
          isRevealed: false,
        });
        return;
      }

      const { data: dailySet, error: dailyErr } = await supabase.rpc('get_or_create_daily_set', {
        p_question_pool: catalogRef.current.activePoolIds,
      });

      if (dailyErr || !dailySet) {
        return;
      }

      const qIds: string[] = dailySet.question_ids ?? [];
      const quizDate: string = dailySet.quiz_date;
      setTodayDate(quizDate);

      // パートナー側で新しい追加配信質問が出題された場合、ローカル辞書に無ければ即時同期して補完
      if (qIds.some((id) => !catalogRef.current.questionsById[id])) {
        await refreshQuestionCatalog({ force: true, fullRefresh: true });
      }

      // 過去に出題された質問があれば履歴を取得
      const { data: pastRows } = await supabase.rpc('get_past_question_history', {
        p_question_ids: qIds,
        p_before_date: quizDate,
      });

      const pastMap = new Map<
        string,
        { quiz_date: string; my_answer: SwipeDirection | null; partner_answer: SwipeDirection | null }
      >();
      if (Array.isArray(pastRows)) {
        for (const r of pastRows) {
          pastMap.set(r.question_id, r);
        }
      }

      const questionsById = catalogRef.current.questionsById;
      const hydratedQuestions: Question[] = qIds
        .map((id) => {
          const base = questionsById[id];
          if (!base) return null;
          const past = pastMap.get(id);
          if (!past) return base;
          const formatted = formatPastDateLabel(past.quiz_date, quizDate);
          return {
            ...base,
            repeatBadge: formatted.badge,
            pastHistory: {
              date: formatted.label,
              myAnswer: past.my_answer ?? undefined,
              partnerAnswer: past.partner_answer ?? undefined,
            },
          } as Question;
        })
        .filter((q): q is Question => q !== null);

      setQuestions(hydratedQuestions.length > 0 ? hydratedQuestions : TODAY_QUESTIONS);

      const { data: statusData } = await supabase.rpc('get_day_status', {
        p_quiz_date: quizDate,
      });

      if (statusData) {
        setDayStatus({
          totalQuestions: statusData.total_questions ?? hydratedQuestions.length,
          myAnsweredCount: statusData.my_answered_count ?? 0,
          partnerAnsweredCount: statusData.partner_answered_count ?? 0,
          isMyCompleted: Boolean(statusData.is_my_completed),
          isPartnerCompleted: Boolean(statusData.is_partner_completed),
          isRevealed: Boolean(statusData.is_revealed),
        });
      }

      await loadAnswersForDay(pairState.pair_id, quizDate, currentUserId);
    },
    [loadAnswersForDay, refreshQuestionCatalog]
  );

  // 初期化（チュートリアル状態復元 + キャッシュ読込 + 匿名ログイン + データ取得）
  useEffect(() => {
    let mounted = true;

    async function init() {
      configureNotificationHandler();

      const [seen, cachedName, cachedExtra, savedReminder] = await Promise.all([
        getHasSeenTutorial(),
        getCachedDisplayName(),
        getCachedExtraQuestions(),
        getDailyReminderSettings(),
      ]);

      if (!mounted) return;
      catalogRef.current = buildQuestionCatalog(cachedExtra);
      setDailyReminder(savedReminder);
      setHasSeenTutorial(seen);
      setIsTutorialVisible(!seen);
      if (cachedName) {
        setMyName(cachedName);
      }

      if (!isSupabaseConfigured || !supabase) {
        setIsInitialized(true);
        return;
      }

      setIsLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        let activeUser = session?.user ?? null;

        if (!activeUser) {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) {
            console.warn('[Supabase] signInAnonymously error:', anonError);
            setAuthError(`認証に失敗しました（${anonError.message}）。しばらくしてから再起動してください。`);
            setIsInitialized(true);
            setIsLoading(false);
            return;
          }
          activeUser = anonData.user ?? null;
        }

        const activeUserId = activeUser?.id ?? null;

        if (!mounted) return;
        setAuthError(null);
        setUserId(activeUserId);
        setAccountAuth(extractAccountAuthInfo(activeUser));

        if (activeUserId) {
          // 1日1回だけ追加質問の差分同期を実行（変更が無ければほぼ0バイト）
          await refreshQuestionCatalog({ force: false });
          if (!mounted) return;
          await loadPairAndDailyData(activeUserId);

          // 開発ビルド / 本番ビルドの実機なら Expo Push Token をバックグラウンド登録
          void registerForPushNotificationsAsync().then((res) => {
            if (mounted) setPushStatus(res);
          });
        }
      } catch (err) {
        console.warn('[Supabase] init error:', err);
        if (mounted) {
          const detail = err instanceof Error ? err.message : String(err);
          setAuthError(`サーバーへの接続に失敗しました（${detail}）。`);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    }

    init();

    const authSubscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      const nextUser = nextSession?.user ?? null;
      setAccountAuth(extractAccountAuthInfo(nextUser));
      if (nextUser?.id) {
        setUserId(nextUser.id);
      }
    });

    return () => {
      mounted = false;
      authSubscription?.data.subscription.unsubscribe();
    };
  }, [loadPairAndDailyData, refreshQuestionCatalog]);

  const refreshState = useCallback(async () => {
    if (!supabase || !userId) return;
    setIsLoading(true);
    try {
      await loadPairAndDailyData(userId);
    } finally {
      setIsLoading(false);
    }
  }, [userId, loadPairAndDailyData]);

  const refreshDayStatus = useCallback(async () => {
    if (!supabase || !userId) return;

    const { data: statusData } = await supabase.rpc('get_day_status', {
      p_quiz_date: todayDate,
    });

    if (!statusData) return;

    const nextPartnerConnected = Boolean(statusData.partner_connected);
    if (nextPartnerConnected !== isPairConnected) {
      await loadPairAndDailyData(userId);
      return;
    }

    const nextRevealed = Boolean(statusData.is_revealed);
    setDayStatus({
      totalQuestions: statusData.total_questions ?? questions.length,
      myAnsweredCount: statusData.my_answered_count ?? 0,
      partnerAnsweredCount: statusData.partner_answered_count ?? 0,
      isMyCompleted: Boolean(statusData.is_my_completed),
      isPartnerCompleted: Boolean(statusData.is_partner_completed),
      isRevealed: nextRevealed,
    });

    if (nextRevealed && pairId) {
      await loadAnswersForDay(pairId, todayDate, userId);
    }
  }, [userId, todayDate, isPairConnected, questions.length, pairId, loadPairAndDailyData, loadAnswersForDay]);

  const submitAnswer = useCallback(
    async (questionId: string, direction: SwipeDirection) => {
      const nextMyAnswers: Record<string, SwipeDirection> = {
        ...myAnswers,
        [questionId]: direction,
      };
      setMyAnswers(nextMyAnswers);

      if (!supabase || !userId || !pairId) return;

      const { error } = await supabase.from('answers').insert({
        pair_id: pairId,
        quiz_date: todayDate,
        question_id: questionId,
        user_id: userId,
        direction,
      });

      if (!error || error.code === '23505') {
        await refreshDayStatus();
        // 今日の全問に回答し終えたタイミングでパートナーへプッシュ通知を送信（サーバー側で重複防止）
        const completedAll =
          questions.length > 0 && questions.every((q) => Boolean(nextMyAnswers[q.id]));
        if (completedAll && isPairConnected) {
          void notifyPartnerAnswered(todayDate);
        }
      }
    },
    [myAnswers, userId, pairId, todayDate, refreshDayStatus, questions, isPairConnected]
  );

  const ensureAuthenticatedUserId = useCallback(async (): Promise<{
    uid: string | null;
    error?: string;
  }> => {
    if (!supabase) {
      return {
        uid: null,
        error: 'Supabase が未設定です。.env.local を確認し、npx expo start --clear で再起動してください。',
      };
    }
    if (userId) {
      return { uid: userId };
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUserId(session.user.id);
        setAuthError(null);
        return { uid: session.user.id };
      }
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError || !anonData.user?.id) {
        const msg = anonError?.message ?? '匿名認証に失敗しました';
        setAuthError(`認証に失敗しました（${msg}）。`);
        return { uid: null, error: `認証に失敗しました（${msg}）。` };
      }
      setUserId(anonData.user.id);
      setAuthError(null);
      return { uid: anonData.user.id };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setAuthError(`サーバーへの接続に失敗しました（${detail}）。`);
      return { uid: null, error: `サーバーへの接続に失敗しました（${detail}）。` };
    }
  }, [userId]);

  const createPair = useCallback(
    async (displayName?: string): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) {
        return {
          ok: false,
          error: 'Supabase が未設定です。.env.local を確認し、npx expo start --clear で再起動してください。',
        };
      }
      setIsLoading(true);
      try {
        const auth = await ensureAuthenticatedUserId();
        if (!auth.uid) {
          return { ok: false, error: auth.error ?? '認証が完了していません。' };
        }
        const { error } = await supabase.rpc('create_pair', {
          p_display_name: displayName ?? myName,
        });
        if (error) {
          return { ok: false, error: formatJoinError(error.message) };
        }
        await loadPairAndDailyData(auth.uid);
        return { ok: true };
      } finally {
        setIsLoading(false);
      }
    },
    [ensureAuthenticatedUserId, myName, loadPairAndDailyData]
  );

  const joinPair = useCallback(
    async (code: string, displayName?: string): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) {
        return {
          ok: false,
          error: 'Supabase が未設定です。.env.local を確認し、npx expo start --clear で再起動してください。',
        };
      }
      setIsLoading(true);
      try {
        const auth = await ensureAuthenticatedUserId();
        if (!auth.uid) {
          return { ok: false, error: auth.error ?? '認証が完了していません。' };
        }
        const { error } = await supabase.rpc('join_pair', {
          p_invite_code: code,
          p_display_name: displayName ?? myName,
        });
        if (error) {
          return { ok: false, error: formatJoinError(error.message) };
        }
        await loadPairAndDailyData(auth.uid);
        return { ok: true };
      } finally {
        setIsLoading(false);
      }
    },
    [ensureAuthenticatedUserId, myName, loadPairAndDailyData]
  );

  const leavePair = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) {
      return { ok: false, error: 'Supabase が未設定です。' };
    }
    setIsLoading(true);
    try {
      const auth = await ensureAuthenticatedUserId();
      if (!auth.uid) {
        return { ok: false, error: auth.error ?? '認証が完了していません。' };
      }
      const { error } = await supabase.rpc('leave_pair');
      if (error) {
        return { ok: false, error: 'ペアの解除に失敗しました。' };
      }
      await loadPairAndDailyData(auth.uid);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [ensureAuthenticatedUserId, loadPairAndDailyData]);

  const regenerateInviteCode = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) {
      return { ok: false, error: 'Supabase が未設定です。' };
    }
    const auth = await ensureAuthenticatedUserId();
    if (!auth.uid) {
      return { ok: false, error: auth.error ?? '認証が完了していません。' };
    }
    const { data, error } = await supabase.rpc('regenerate_invite_code');
    if (error || !data) {
      return { ok: false, error: '招待コードの再発行に失敗しました。' };
    }
    setPairCode(data.invite_code);
    return { ok: true };
  }, [ensureAuthenticatedUserId]);

  const updateMyName = useCallback(
    async (name: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, error: '表示名を入力してください。' };
      }
      setMyName(trimmed);
      await setCachedDisplayName(trimmed);

      if (!supabase || !userId) {
        return { ok: true };
      }

      const { error } = await supabase.rpc('upsert_profile', {
        p_display_name: trimmed,
      });
      if (error) {
        return { ok: false, error: '表示名の更新に失敗しました。' };
      }
      return { ok: true };
    },
    [userId]
  );

  const fetchHistory = useCallback(async () => {
    if (!supabase || !userId || !hasPair) {
      setHistoryDays([]);
      return;
    }
    setIsHistoryLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_pair_history', {
        p_limit: 30,
        p_offset: 0,
      });
      if (error || !Array.isArray(data)) {
        return;
      }

      const missingAnyQuestion = data.some((day: any) => {
        const rawAnswers: any[] = Array.isArray(day.answers) ? day.answers : [];
        return rawAnswers.some((a) => !catalogRef.current.questionsById[a.question_id]);
      });
      if (missingAnyQuestion) {
        await refreshQuestionCatalog({ force: true, fullRefresh: true });
      }

      const questionsById = catalogRef.current.questionsById;
      const mapped: HistoryDayItem[] = data.map((day: any) => {
        const rawAnswers: any[] = Array.isArray(day.answers) ? day.answers : [];
        const items = rawAnswers
          .map((a) => {
            const q = questionsById[a.question_id];
            if (!q) return null;
            const myAns = a.my_answer as SwipeDirection | undefined;
            const partnerAns = a.partner_answer as SwipeDirection | undefined;
            return {
              question: q,
              myAnswer: myAns,
              partnerAnswer: partnerAns,
              isMatched: evaluateMatch(q, myAns, partnerAns),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        return {
          quizDate: day.quiz_date,
          isRevealed: day.is_revealed !== false,
          isPremiumUnlocked: Boolean(day.is_premium_unlocked),
          isLockedPastDay: Boolean(day.is_locked_past_day),
          partnerAnsweredCount: Number(day.partner_answered_count ?? 0),
          items,
        };
      });

      setHistoryDays(mapped);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [userId, hasPair, refreshQuestionCatalog]);

  const deleteAccount = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase || !userId) {
      return { ok: false, error: 'Supabase が未設定です。' };
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        return { ok: false, error: 'アカウント削除に失敗しました。' };
      }
      await supabase.auth.signOut();
      setHasPair(false);
      setIsPairConnected(false);
      setPairId(null);
      setPairCode('');
      setMyAnswers({});
      setPartnerAnswers({});
      setHistoryDays([]);
      // 新しい匿名セッションを作成
      const { data: anonData } = await supabase.auth.signInAnonymously();
      setUserId(anonData.user?.id ?? null);
      setAccountAuth(extractAccountAuthInfo(anonData.user));
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const enableDailyReminder = useCallback(
    async (hour: number, minute: number): Promise<{ ok: boolean; error?: string }> => {
      const res = await scheduleDailyReminder(hour, minute);
      if (res.ok && res.settings) {
        setDailyReminder(res.settings);
        return { ok: true };
      }
      return { ok: false, error: res.error };
    },
    []
  );

  const disableDailyReminder = useCallback(async () => {
    const next = await cancelDailyReminder();
    setDailyReminder(next);
  }, []);

  const registerPushNotifications = useCallback(async (): Promise<PushRegistrationResult> => {
    const res = await registerForPushNotificationsAsync();
    setPushStatus(res);
    return res;
  }, []);

  const linkGoogle = useCallback(async () => {
    if (!supabase) {
      return { ok: false, error: 'Supabase が未設定です。' };
    }
    setIsLoading(true);
    try {
      const auth = await ensureAuthenticatedUserId();
      if (!auth.uid) {
        return { ok: false, error: auth.error ?? '認証が完了していません。' };
      }
      const res = await linkGoogleIdentity();
      if (res.ok && !res.redirecting) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          setAccountAuth(extractAccountAuthInfo(userData.user));
          setUserId(userData.user.id);
          await loadPairAndDailyData(userData.user.id);
        }
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, [ensureAuthenticatedUserId, loadPairAndDailyData]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      return { ok: false, error: 'Supabase が未設定です。' };
    }
    setIsLoading(true);
    try {
      const res = await signInWithGoogleAccount();
      if (res.ok && !res.redirecting) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          setAccountAuth(extractAccountAuthInfo(userData.user));
          setUserId(userData.user.id);
          setHistoryDays([]);
          await loadPairAndDailyData(userData.user.id);
          void registerForPushNotificationsAsync().then((pushRes) => {
            setPushStatus(pushRes);
          });
        }
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, [loadPairAndDailyData]);

  const completeTutorial = useCallback(() => {
    setHasSeenTutorial(true);
    setIsTutorialVisible(false);
    void setHasSeenTutorialStorage(true);
  }, []);

  const showTutorial = useCallback(() => {
    setIsTutorialVisible(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setIsTutorialVisible(false);
  }, []);

  const getQuestionsById = useCallback(() => catalogRef.current.questionsById, []);

  const isMyCompleted = useMemo(() => {
    if (dayStatus.isMyCompleted) return true;
    return questions.length > 0 && questions.every((q) => !!myAnswers[q.id]);
  }, [dayStatus.isMyCompleted, questions, myAnswers]);

  const isPartnerCompleted = dayStatus.isPartnerCompleted;

  const matchSummary = useMemo<MatchSummary>(() => {
    const details = questions.map((q) => {
      const my = myAnswers[q.id];
      const partner = partnerAnswers[q.id];
      const isMatched = evaluateMatch(q, my, partner);
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
        isInitialized,
        isLoading,
        isSupabaseReady: isSupabaseConfigured,
        authError,
        userId,
        accountAuth,
        pairId,
        hasPair,
        isPairConnected,
        pairCode,
        myName,
        partnerName,
        todayDate,
        questions,
        myAnswers,
        partnerAnswers,
        dayStatus,
        isMyCompleted,
        isPartnerCompleted,
        hasSeenTutorial,
        isTutorialVisible,
        historyDays,
        isHistoryLoading,
        dailyReminder,
        pushStatus,
        submitAnswer,
        createPair,
        joinPair,
        leavePair,
        regenerateInviteCode,
        updateMyName,
        enableDailyReminder,
        disableDailyReminder,
        registerPushNotifications,
        linkGoogle,
        signInWithGoogle,
        refreshState,
        refreshDayStatus,
        fetchHistory,
        deleteAccount,
        completeTutorial,
        showTutorial,
        closeTutorial,
        getQuestionsById,
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
