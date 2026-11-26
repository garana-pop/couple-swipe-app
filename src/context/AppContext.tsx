import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SwipeDirection,
  Question,
  QuestionCategoryKey,
  RemoteQuestionRecord,
  HistoryDayItem,
  CalendarDaySummary,
  DayQuizData,
  CategoryMatchStat,
  PairStats,
} from '../types';
import {
  buildQuestionCatalog,
  evaluateMatch,
  getDefaultTodayQuestions,
} from '../constants/questions';
import i18n, { getCurrentLocale } from '../i18n';
import { formatIsoShortDate } from '../i18n/format';
import {
  SupportedLocale,
  getDeviceTimeZone,
  isDefaultDisplayName,
} from '../i18n/locale';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { resetBillingSession } from '../lib/billing';
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
  refreshNotificationsForLocale,
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

export type PastAnswerErrorCode = 'PREMIUM_REQUIRED' | 'INVALID_PAST_DATE' | 'SERVER_ERROR';

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
  pairStartDate: string | null;
  isPairPremium: boolean;
  setPairPremium: (next: boolean) => void;
  questions: Question[];
  myAnswers: Record<string, SwipeDirection>;
  partnerAnswers: Record<string, SwipeDirection>;
  dayStatus: DayStatus;
  isMyCompleted: boolean;
  isPartnerCompleted: boolean;
  hasSeenTutorial: boolean;
  isTutorialVisible: boolean;
  historyDays: HistoryDayItem[];
  calendarDays: Record<string, CalendarDaySummary>;
  isHistoryLoading: boolean;
  pairStats: PairStats;
  dailyReminder: DailyReminderSettings;
  pushStatus: PushRegistrationResult | null;
  submitAnswer: (questionId: string, direction: SwipeDirection) => Promise<{ ok: boolean; error?: string }>;
  loadDayQuizData: (quizDate: string) => Promise<DayQuizData | null>;
  submitPastAnswer: (
    quizDate: string,
    questionId: string,
    direction: SwipeDirection,
    isFinalQuestion?: boolean
  ) => Promise<{ ok: boolean; error?: string; errorCode?: PastAnswerErrorCode }>;
  createPair: (displayName?: string) => Promise<{ ok: boolean; error?: string }>;
  joinPair: (
    code: string,
    displayName?: string
  ) => Promise<{ ok: boolean; relinked?: boolean; error?: string }>;
  issuePairRelinkCode: () => Promise<{
    ok: boolean;
    code?: string;
    expiresAt?: string;
    error?: string;
  }>;
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
    return i18n.t('errors.join.tooManyAttempts');
  }
  if (message.includes('INVALID_INVITE_CODE')) {
    return i18n.t('errors.join.invalidInviteCode');
  }
  if (message.includes('INVITE_CODE_NOT_FOUND')) {
    return i18n.t('errors.join.inviteCodeNotFound');
  }
  if (message.includes('INVITE_CODE_EXPIRED')) {
    return i18n.t('errors.join.inviteCodeExpired');
  }
  if (message.includes('RELINK_CODE_USED')) {
    return i18n.t('errors.join.relinkCodeUsed');
  }
  if (message.includes('RELINK_CODE_EXPIRED')) {
    return i18n.t('errors.join.relinkCodeExpired');
  }
  if (message.includes('RELINK_PAIR_CHANGED')) {
    return i18n.t('errors.join.relinkPairChanged');
  }
  if (message.includes('CANNOT_RELINK_SELF')) {
    return i18n.t('errors.join.cannotRelinkSelf');
  }
  if (message.includes('PARTNER_NOT_CONNECTED')) {
    return i18n.t('errors.join.partnerNotConnected');
  }
  if (message.includes('PAIR_IS_FULL')) {
    return i18n.t('errors.join.pairIsFull');
  }
  if (message.includes('ALREADY_IN_PAIR')) {
    return i18n.t('errors.join.alreadyInPair');
  }
  return i18n.t('errors.join.generic');
}

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatPastDateLabel(
  pastDateStr: string,
  currentDateStr: string,
  locale: SupportedLocale
): { badge: string; label: string } {
  const past = new Date(`${pastDateStr}T00:00:00Z`);
  const curr = new Date(`${currentDateStr}T00:00:00Z`);
  const diffDays = Math.max(1, Math.round((curr.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)));
  const shortDate = formatIsoShortDate(pastDateStr, locale);
  return {
    badge: i18n.t('repeat.badge', { count: diffDays }),
    label: i18n.t('repeat.dateLabel', { count: diffDays, date: shortDate }),
  };
}

function parseCalendarSummaryMap(rawDays: unknown): Record<string, CalendarDaySummary> {
  const map: Record<string, CalendarDaySummary> = {};
  if (!Array.isArray(rawDays)) return map;
  for (const row of rawDays) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const quizDate = typeof r.quiz_date === 'string' ? r.quiz_date : '';
    if (!quizDate) continue;
    map[quizDate] = {
      quizDate,
      totalQuestions: Number(r.total_questions ?? 0),
      myAnsweredCount: Number(r.my_answered_count ?? 0),
      partnerAnsweredCount: Number(r.partner_answered_count ?? 0),
      isMyCompleted: Boolean(r.is_my_completed),
      isPartnerCompleted: Boolean(r.is_partner_completed),
      isRevealed: Boolean(r.is_revealed),
    };
  }
  return map;
}

async function syncProfileLocaleAndTimezone(locale: SupportedLocale): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc('upsert_profile_locale', {
      p_locale: locale,
      p_timezone: getDeviceTimeZone(),
    });
  } catch {
    // マイグレーション未適用時でもアプリ動作に影響させない
  }
}

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = getCurrentLocale();

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
  const [rawMyName, setRawMyName] = useState<string | null>(null);
  const [rawPartnerName, setRawPartnerName] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pairStartDate, setPairStartDate] = useState<string | null>(null);
  const [isPairPremium, setIsPairPremium] = useState(false);

  const [questions, setQuestions] = useState<Question[]>(() => getDefaultTodayQuestions(locale));
  const [myAnswers, setMyAnswers] = useState<Record<string, SwipeDirection>>({});
  const [partnerAnswers, setPartnerAnswers] = useState<Record<string, SwipeDirection>>({});
  const [dayStatus, setDayStatus] = useState<DayStatus>({
    totalQuestions: 3,
    myAnsweredCount: 0,
    partnerAnsweredCount: 0,
    isMyCompleted: false,
    isPartnerCompleted: false,
    isRevealed: false,
  });

  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);

  const [historyDays, setHistoryDays] = useState<HistoryDayItem[]>([]);
  const [calendarDays, setCalendarDays] = useState<Record<string, CalendarDaySummary>>({});
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [dailyReminder, setDailyReminder] = useState<DailyReminderSettings>(DEFAULT_DAILY_REMINDER);
  const [pushStatus, setPushStatus] = useState<PushRegistrationResult | null>(null);

  const extraQuestionsRef = useRef<RemoteQuestionRecord[]>([]);
  const catalogRef = useRef(buildQuestionCatalog([], locale));
  const lastSyncedLocaleRef = useRef<string | null>(null);
  const dailyPastMetaRef = useRef<{
    quizDate: string;
    pastByQId: Record<string, { quiz_date: string; my_answer: SwipeDirection | null; partner_answer: SwipeDirection | null }>;
  }>({ quizDate: '', pastByQId: {} });

  const myName = useMemo(
    () => (!isDefaultDisplayName(rawMyName) ? rawMyName!.trim() : t('common.you')),
    [rawMyName, t]
  );

  const partnerName = useMemo(
    () => (!isDefaultDisplayName(rawPartnerName) ? rawPartnerName!.trim() : t('common.partner')),
    [rawPartnerName, t]
  );

  const refreshQuestionCatalog = useCallback(
    async (options?: { force?: boolean; fullRefresh?: boolean }) => {
      const records = await syncExtraQuestions(options);
      extraQuestionsRef.current = records;
      const nextCatalog = buildQuestionCatalog(records, getCurrentLocale());
      catalogRef.current = nextCatalog;
      return nextCatalog;
    },
    []
  );

  // OS 言語が切り替わった際に質問カタログ・表示中質問・履歴・通知・DBロケールを即時再同期する
  useEffect(() => {
    const activeLocale = getCurrentLocale();
    const nextCatalog = buildQuestionCatalog(extraQuestionsRef.current, activeLocale);
    catalogRef.current = nextCatalog;

    setQuestions((prev) => {
      if (prev.length === 0) return getDefaultTodayQuestions(activeLocale);
      return prev.map((q) => {
        const localized = nextCatalog.questionsById[q.id];
        if (!localized) return q;
        const past = dailyPastMetaRef.current.pastByQId[q.id];
        if (past && dailyPastMetaRef.current.quizDate) {
          const formatted = formatPastDateLabel(
            past.quiz_date,
            dailyPastMetaRef.current.quizDate,
            activeLocale
          );
          return {
            ...localized,
            repeatBadge: formatted.badge,
            pastHistory: {
              date: formatted.label,
              myAnswer: past.my_answer ?? undefined,
              partnerAnswer: past.partner_answer ?? undefined,
            },
          };
        }
        return {
          ...localized,
          repeatBadge: q.repeatBadge,
          pastHistory: q.pastHistory,
        };
      });
    });

    setHistoryDays((prev) =>
      prev.map((day) => ({
        ...day,
        items: day.items.map((item) => {
          const localized = nextCatalog.questionsById[item.question.id];
          return localized ? { ...item, question: localized } : item;
        }),
      }))
    );

    if (userId && lastSyncedLocaleRef.current !== activeLocale) {
      lastSyncedLocaleRef.current = activeLocale;
      void syncProfileLocaleAndTimezone(activeLocale);
      void refreshNotificationsForLocale();
    }
  }, [i18nInstance.language, userId]);

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
      const activeLocale = getCurrentLocale();

      const { data: pairState, error: pairErr } = await supabase.rpc('get_pair_state');
      if (pairErr || !pairState) {
        return;
      }

      setHasPair(Boolean(pairState.has_pair));
      setIsPairConnected(Boolean(pairState.is_pair_connected));
      setPairId(pairState.pair_id ?? null);
      setPairCode(pairState.invite_code ?? '');
      if (typeof pairState.my_name === 'string') {
        setRawMyName(pairState.my_name);
        if (!isDefaultDisplayName(pairState.my_name)) {
          await setCachedDisplayName(pairState.my_name);
        }
      }
      setRawPartnerName(typeof pairState.partner_name === 'string' ? pairState.partner_name : null);
      if (pairState.today_date) {
        setTodayDate(pairState.today_date);
      }
      setPairStartDate(
        typeof pairState.pair_start_date === 'string' ? pairState.pair_start_date : null
      );
      setIsPairPremium(Boolean(pairState.is_premium));

      if (!pairState.has_pair || !pairState.pair_id) {
        const defaultQs = getDefaultTodayQuestions(activeLocale);
        setQuestions(defaultQs);
        setMyAnswers({});
        setPartnerAnswers({});
        setHistoryDays([]);
        setCalendarDays({});
        setPairStartDate(null);
        setDayStatus({
          totalQuestions: defaultQs.length,
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

      if (qIds.some((id) => !catalogRef.current.questionsById[id])) {
        await refreshQuestionCatalog({ force: true, fullRefresh: true });
      }

      const { data: pastRows } = await supabase.rpc('get_past_question_history', {
        p_question_ids: qIds,
        p_before_date: quizDate,
      });

      const pastMap = new Map<
        string,
        { quiz_date: string; my_answer: SwipeDirection | null; partner_answer: SwipeDirection | null }
      >();
      const pastRecord: Record<
        string,
        { quiz_date: string; my_answer: SwipeDirection | null; partner_answer: SwipeDirection | null }
      > = {};
      if (Array.isArray(pastRows)) {
        for (const r of pastRows) {
          pastMap.set(r.question_id, r);
          pastRecord[r.question_id] = r;
        }
      }
      dailyPastMetaRef.current = { quizDate, pastByQId: pastRecord };

      const questionsById = catalogRef.current.questionsById;
      const hydratedQuestions: Question[] = qIds
        .map((id) => {
          const base = questionsById[id];
          if (!base) return null;
          const past = pastMap.get(id);
          if (!past) return base;
          const formatted = formatPastDateLabel(past.quiz_date, quizDate, activeLocale);
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

      setQuestions(
        hydratedQuestions.length > 0 ? hydratedQuestions : getDefaultTodayQuestions(activeLocale)
      );

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

      const [histRes, calRes] = await Promise.all([
        supabase.rpc('get_pair_history', {
          p_limit: 60,
          p_offset: 0,
        }),
        supabase.rpc('get_pair_calendar_summary'),
      ]);

      if (!calRes.error && calRes.data && typeof calRes.data === 'object') {
        const cal = calRes.data as Record<string, unknown>;
        if (typeof cal.pair_start_date === 'string') {
          setPairStartDate(cal.pair_start_date);
        }
        if (typeof cal.is_premium === 'boolean') {
          setIsPairPremium(cal.is_premium);
        }
        setCalendarDays(parseCalendarSummaryMap(cal.days));
      }

      const histData = histRes.data;
      const histErr = histRes.error;
      if (!histErr && Array.isArray(histData)) {
        const missingHistQuestion = histData.some((day: any) => {
          const rawAnswers: any[] = Array.isArray(day.answers) ? day.answers : [];
          return rawAnswers.some((a) => !catalogRef.current.questionsById[a.question_id]);
        });
        if (missingHistQuestion) {
          await refreshQuestionCatalog({ force: true, fullRefresh: true });
        }
        const dict = catalogRef.current.questionsById;
        const mappedHist: HistoryDayItem[] = histData.map((day: any) => {
          const rawAnswers: any[] = Array.isArray(day.answers) ? day.answers : [];
          const items = rawAnswers
            .map((a) => {
              const q = dict[a.question_id];
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
            totalQuestions: Number(
              day.total_questions ??
                (Array.isArray(day.question_ids) ? day.question_ids.length : items.length)
            ),
            myAnsweredCount: Number(day.my_answered_count ?? 0),
            partnerAnsweredCount: Number(day.partner_answered_count ?? 0),
            isMyCompleted: Boolean(day.is_my_completed ?? day.is_revealed),
            isPartnerCompleted: Boolean(day.is_partner_completed ?? day.is_revealed),
            isRevealed: day.is_revealed !== false,
            isPremiumUnlocked: Boolean(day.is_premium_unlocked),
            canAnswerPastDay: Boolean(day.can_answer_past_day),
            isLockedPastDay: Boolean(day.is_locked_past_day),
            items,
          };
        });
        setHistoryDays(mappedHist);
      }
    },
    [loadAnswersForDay, refreshQuestionCatalog]
  );

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
      extraQuestionsRef.current = cachedExtra;
      catalogRef.current = buildQuestionCatalog(cachedExtra, getCurrentLocale());
      setDailyReminder(savedReminder);
      setHasSeenTutorial(seen);
      setIsTutorialVisible(!seen);
      if (cachedName && !isDefaultDisplayName(cachedName)) {
        setRawMyName(cachedName);
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
            setAuthError(i18n.t('errors.authFailedRestart', { detail: anonError.message }));
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
          const currentLoc = getCurrentLocale();
          lastSyncedLocaleRef.current = currentLoc;
          void syncProfileLocaleAndTimezone(currentLoc);

          await refreshQuestionCatalog({ force: false });
          if (!mounted) return;
          await loadPairAndDailyData(activeUserId);

          void registerForPushNotificationsAsync().then((res) => {
            if (mounted) setPushStatus(res);
          });
        }
      } catch (err) {
        console.warn('[Supabase] init error:', err);
        if (mounted) {
          const detail = err instanceof Error ? err.message : String(err);
          setAuthError(i18n.t('errors.serverConnectFailed', { detail }));
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
    async (
      questionId: string,
      direction: SwipeDirection
    ): Promise<{ ok: boolean; error?: string }> => {
      const prevMyAnswers = myAnswers;
      const nextMyAnswers: Record<string, SwipeDirection> = {
        ...prevMyAnswers,
        [questionId]: direction,
      };
      setMyAnswers(nextMyAnswers);

      if (!supabase || !userId || !pairId) {
        return { ok: true };
      }

      try {
        const { error } = await supabase.from('answers').insert({
          pair_id: pairId,
          quiz_date: todayDate,
          question_id: questionId,
          user_id: userId,
          direction,
        });

        if (error && error.code !== '23505') {
          setMyAnswers(prevMyAnswers);
          return {
            ok: false,
            error: i18n.t('errors.answerSaveFailed'),
          };
        }

        await refreshDayStatus();
        const completedAll =
          questions.length > 0 && questions.every((q) => Boolean(nextMyAnswers[q.id]));
        if (completedAll && isPairConnected) {
          void notifyPartnerAnswered(todayDate);
        }
        return { ok: true };
      } catch {
        setMyAnswers(prevMyAnswers);
        return {
          ok: false,
          error: i18n.t('errors.answerNetworkFailed'),
        };
      }
    },
    [myAnswers, userId, pairId, todayDate, refreshDayStatus, questions, isPairConnected]
  );

  const loadDayQuizData = useCallback(
    async (quizDate: string): Promise<DayQuizData | null> => {
      if (!supabase || !userId || !pairId) return null;
      const activeLocale = getCurrentLocale();

      const { data: setRow, error: setErr } = await supabase
        .from('daily_sets')
        .select('question_ids')
        .eq('pair_id', pairId)
        .eq('quiz_date', quizDate)
        .maybeSingle();

      let qIds: string[] = [];
      if (!setErr && setRow && Array.isArray(setRow.question_ids) && setRow.question_ids.length > 0) {
        qIds = setRow.question_ids as string[];
      } else if (quizDate < todayDate) {
        const { data: createdSet, error: createErr } = await supabase.rpc(
          'get_or_create_past_daily_set',
          {
            p_quiz_date: quizDate,
            p_question_pool: catalogRef.current.activePoolIds,
          }
        );
        if (createErr) {
          if (createErr.message?.includes('PREMIUM_REQUIRED')) {
            const err = new Error(i18n.t('errors.pastQuizPremiumRequired')) as Error & {
              code?: PastAnswerErrorCode;
            };
            err.code = 'PREMIUM_REQUIRED';
            throw err;
          }
          if (createErr.message?.includes('INVALID_PAST_DATE')) {
            const err = new Error(i18n.t('errors.invalidPastDate')) as Error & {
              code?: PastAnswerErrorCode;
            };
            err.code = 'INVALID_PAST_DATE';
            throw err;
          }
          return null;
        }
        if (
          !createdSet ||
          !Array.isArray(createdSet.question_ids) ||
          createdSet.question_ids.length === 0
        ) {
          return null;
        }
        qIds = createdSet.question_ids as string[];
      } else {
        return null;
      }

      if (qIds.some((id) => !catalogRef.current.questionsById[id])) {
        await refreshQuestionCatalog({ force: true, fullRefresh: true });
      }

      const [pastRes, statusRes, answersRes] = await Promise.all([
        supabase.rpc('get_past_question_history', {
          p_question_ids: qIds,
          p_before_date: quizDate,
        }),
        supabase.rpc('get_day_status', {
          p_quiz_date: quizDate,
        }),
        supabase
          .from('answers')
          .select('question_id, user_id, direction')
          .eq('pair_id', pairId)
          .eq('quiz_date', quizDate),
      ]);

      const pastMap = new Map<
        string,
        { quiz_date: string; my_answer: SwipeDirection | null; partner_answer: SwipeDirection | null }
      >();
      if (Array.isArray(pastRes.data)) {
        for (const r of pastRes.data) {
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
          const formatted = formatPastDateLabel(past.quiz_date, quizDate, activeLocale);
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

      const mine: Record<string, SwipeDirection> = {};
      const partner: Record<string, SwipeDirection> = {};
      if (Array.isArray(answersRes.data)) {
        for (const row of answersRes.data) {
          if (row.user_id === userId) {
            mine[row.question_id] = row.direction as SwipeDirection;
          } else {
            partner[row.question_id] = row.direction as SwipeDirection;
          }
        }
      }

      const status = statusRes.data;
      const totalQuestions = Number(status?.total_questions ?? hydratedQuestions.length);
      const myAnsweredCount = Number(status?.my_answered_count ?? Object.keys(mine).length);
      const partnerAnsweredCount = Number(status?.partner_answered_count ?? Object.keys(partner).length);

      return {
        quizDate,
        questions: hydratedQuestions,
        myAnswers: mine,
        partnerAnswers: partner,
        totalQuestions,
        myAnsweredCount,
        partnerAnsweredCount,
        isMyCompleted: Boolean(status?.is_my_completed ?? (totalQuestions > 0 && myAnsweredCount >= totalQuestions)),
        isPartnerCompleted: Boolean(
          status?.is_partner_completed ?? (totalQuestions > 0 && partnerAnsweredCount >= totalQuestions)
        ),
        isRevealed: Boolean(status?.is_revealed),
      };
    },
    [userId, pairId, todayDate, refreshQuestionCatalog]
  );

  const submitPastAnswer = useCallback(
    async (
      quizDate: string,
      questionId: string,
      direction: SwipeDirection,
      isFinalQuestion = false
    ): Promise<{ ok: boolean; error?: string; errorCode?: PastAnswerErrorCode }> => {
      if (!supabase || !userId || !pairId) {
        return { ok: false, error: i18n.t('errors.notConnectedServer'), errorCode: 'SERVER_ERROR' };
      }

      const { error } = await supabase.from('answers').insert({
        pair_id: pairId,
        quiz_date: quizDate,
        question_id: questionId,
        user_id: userId,
        direction,
      });

      if (error && error.code !== '23505') {
        if (error.code === '42501') {
          return {
            ok: false,
            error: i18n.t('errors.pastAnswerPremiumRequired'),
            errorCode: 'PREMIUM_REQUIRED',
          };
        }
        return {
          ok: false,
          error: i18n.t('errors.answerSaveFailed'),
          errorCode: 'SERVER_ERROR',
        };
      }

      if (isFinalQuestion && isPairConnected) {
        void notifyPartnerAnswered(quizDate);
      }

      return { ok: true };
    },
    [userId, pairId, isPairConnected]
  );

  const ensureAuthenticatedUserId = useCallback(async (): Promise<{
    uid: string | null;
    error?: string;
  }> => {
    if (!supabase) {
      return {
        uid: null,
        error: i18n.t('errors.supabaseNotConfiguredRestart'),
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
        const msg = anonError?.message ?? i18n.t('errors.anonAuthFailed');
        const errText = i18n.t('errors.authFailed', { detail: msg });
        setAuthError(errText);
        return { uid: null, error: errText };
      }
      setUserId(anonData.user.id);
      setAuthError(null);
      return { uid: anonData.user.id };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const errText = i18n.t('errors.serverConnectFailed', { detail });
      setAuthError(errText);
      return { uid: null, error: errText };
    }
  }, [userId]);

  const createPair = useCallback(
    async (displayName?: string): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) {
        return {
          ok: false,
          error: i18n.t('errors.supabaseNotConfiguredRestart'),
        };
      }
      setIsLoading(true);
      try {
        const auth = await ensureAuthenticatedUserId();
        if (!auth.uid) {
          return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
        }
        const effectiveName = displayName ?? (!isDefaultDisplayName(rawMyName) ? rawMyName! : myName);
        let res = await supabase.rpc('create_pair', {
          p_display_name: effectiveName,
          p_timezone: getDeviceTimeZone(),
        });
        if (res.error && res.error.code === 'PGRST202') {
          // マイグレーション適用前の1引数シグネチャへ後方互換フォールバック
          res = await supabase.rpc('create_pair', {
            p_display_name: effectiveName,
          });
        }
        if (res.error) {
          return { ok: false, error: formatJoinError(res.error.message) };
        }
        void syncProfileLocaleAndTimezone(getCurrentLocale());
        await loadPairAndDailyData(auth.uid);
        return { ok: true };
      } finally {
        setIsLoading(false);
      }
    },
    [ensureAuthenticatedUserId, rawMyName, myName, loadPairAndDailyData]
  );

  const joinPair = useCallback(
    async (
      code: string,
      displayName?: string
    ): Promise<{ ok: boolean; relinked?: boolean; error?: string }> => {
      if (!supabase) {
        return {
          ok: false,
          error: i18n.t('errors.supabaseNotConfiguredRestart'),
        };
      }
      setIsLoading(true);
      try {
        const auth = await ensureAuthenticatedUserId();
        if (!auth.uid) {
          return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
        }
        const effectiveName = displayName ?? (!isDefaultDisplayName(rawMyName) ? rawMyName! : myName);
        const { data, error } = await supabase.rpc('join_pair', {
          p_invite_code: code,
          p_display_name: effectiveName,
        });
        if (error) {
          return { ok: false, error: formatJoinError(error.message) };
        }
        void syncProfileLocaleAndTimezone(getCurrentLocale());
        await loadPairAndDailyData(auth.uid);
        return { ok: true, relinked: Boolean(data?.relinked) };
      } finally {
        setIsLoading(false);
      }
    },
    [ensureAuthenticatedUserId, rawMyName, myName, loadPairAndDailyData]
  );

  const issuePairRelinkCode = useCallback(async (): Promise<{
    ok: boolean;
    code?: string;
    expiresAt?: string;
    error?: string;
  }> => {
    if (!supabase) {
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
    }
    const auth = await ensureAuthenticatedUserId();
    if (!auth.uid) {
      return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
    }
    const { data, error } = await supabase.rpc('issue_pair_relink_code');
    if (error || !data?.relink_code) {
      return {
        ok: false,
        error: error ? formatJoinError(error.message) : i18n.t('errors.relinkIssueFailed'),
      };
    }
    return {
      ok: true,
      code: String(data.relink_code),
      expiresAt: typeof data.expires_at === 'string' ? data.expires_at : undefined,
    };
  }, [ensureAuthenticatedUserId]);

  const leavePair = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) {
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
    }
    setIsLoading(true);
    try {
      const auth = await ensureAuthenticatedUserId();
      if (!auth.uid) {
        return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
      }
      const { error } = await supabase.rpc('leave_pair');
      if (error) {
        return { ok: false, error: i18n.t('errors.leavePairFailed') };
      }
      await loadPairAndDailyData(auth.uid);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [ensureAuthenticatedUserId, loadPairAndDailyData]);

  const regenerateInviteCode = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) {
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
    }
    const auth = await ensureAuthenticatedUserId();
    if (!auth.uid) {
      return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
    }
    const { data, error } = await supabase.rpc('regenerate_invite_code');
    if (error || !data) {
      return { ok: false, error: i18n.t('errors.regenerateCodeFailed') };
    }
    setPairCode(data.invite_code);
    return { ok: true };
  }, [ensureAuthenticatedUserId]);

  const updateMyName = useCallback(
    async (name: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = name.trim();
      if (!trimmed) {
        return { ok: false, error: i18n.t('errors.displayNameEmpty') };
      }
      setRawMyName(trimmed);
      await setCachedDisplayName(trimmed);

      if (!supabase || !userId) {
        return { ok: true };
      }

      const { error } = await supabase.rpc('upsert_profile', {
        p_display_name: trimmed,
      });
      if (error) {
        return { ok: false, error: i18n.t('errors.displayNameUpdateFailed') };
      }
      return { ok: true };
    },
    [userId]
  );

  const fetchHistory = useCallback(async () => {
    if (!supabase || !userId || !hasPair) {
      setHistoryDays([]);
      setCalendarDays({});
      return;
    }
    setIsHistoryLoading(true);
    try {
      const [histRes, calRes] = await Promise.all([
        supabase.rpc('get_pair_history', {
          p_limit: 60,
          p_offset: 0,
        }),
        supabase.rpc('get_pair_calendar_summary'),
      ]);

      if (!calRes.error && calRes.data && typeof calRes.data === 'object') {
        const cal = calRes.data as Record<string, unknown>;
        if (typeof cal.pair_start_date === 'string') {
          setPairStartDate(cal.pair_start_date);
        }
        if (typeof cal.is_premium === 'boolean') {
          setIsPairPremium(cal.is_premium);
        }
        setCalendarDays(parseCalendarSummaryMap(cal.days));
      }

      const data = histRes.data;
      const error = histRes.error;
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
          totalQuestions: Number(
            day.total_questions ?? (Array.isArray(day.question_ids) ? day.question_ids.length : items.length)
          ),
          myAnsweredCount: Number(day.my_answered_count ?? 0),
          partnerAnsweredCount: Number(day.partner_answered_count ?? 0),
          isMyCompleted: Boolean(day.is_my_completed ?? day.is_revealed),
          isPartnerCompleted: Boolean(day.is_partner_completed ?? day.is_revealed),
          isRevealed: day.is_revealed !== false,
          isPremiumUnlocked: Boolean(day.is_premium_unlocked),
          canAnswerPastDay: Boolean(day.can_answer_past_day),
          isLockedPastDay: Boolean(day.is_locked_past_day),
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
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        return { ok: false, error: i18n.t('errors.deleteAccountFailed') };
      }
      await supabase.auth.signOut();
      await resetBillingSession();
      setHasPair(false);
      setIsPairConnected(false);
      setPairId(null);
      setPairCode('');
      setRawMyName(null);
      setRawPartnerName(null);
      setMyAnswers({});
      setPartnerAnswers({});
      setHistoryDays([]);
      setCalendarDays({});
      setPairStartDate(null);
      setIsPairPremium(false);
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
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
    }
    setIsLoading(true);
    try {
      const auth = await ensureAuthenticatedUserId();
      if (!auth.uid) {
        return { ok: false, error: auth.error ?? i18n.t('errors.authNotCompleted') };
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
      return { ok: false, error: i18n.t('errors.supabaseNotConfigured') };
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

  const setPairPremium = useCallback((next: boolean) => {
    setIsPairPremium(next);
  }, []);

  const effectiveCalendarDays = useMemo<Record<string, CalendarDaySummary>>(() => {
    const merged: Record<string, CalendarDaySummary> = { ...calendarDays };

    for (const day of historyDays) {
      if (!merged[day.quizDate]) {
        merged[day.quizDate] = {
          quizDate: day.quizDate,
          totalQuestions: day.totalQuestions,
          myAnsweredCount: day.myAnsweredCount,
          partnerAnsweredCount: day.partnerAnsweredCount,
          isMyCompleted: day.isMyCompleted,
          isPartnerCompleted: day.isPartnerCompleted,
          isRevealed: day.isRevealed,
        };
      }
    }

    if (hasPair && todayDate) {
      const myCount = Math.max(
        dayStatus.myAnsweredCount,
        questions.filter((q) => Boolean(myAnswers[q.id])).length
      );
      const totalQ = Math.max(dayStatus.totalQuestions, questions.length);
      merged[todayDate] = {
        quizDate: todayDate,
        totalQuestions: totalQ,
        myAnsweredCount: myCount,
        partnerAnsweredCount: dayStatus.partnerAnsweredCount,
        isMyCompleted,
        isPartnerCompleted,
        isRevealed: dayStatus.isRevealed || (isMyCompleted && isPartnerCompleted),
      };
    }

    return merged;
  }, [
    calendarDays,
    historyDays,
    hasPair,
    todayDate,
    dayStatus,
    questions,
    myAnswers,
    isMyCompleted,
    isPartnerCompleted,
  ]);

  const pairStats = useMemo<PairStats>(() => {
    const revealedDates = new Set<string>();
    const historyDatesSet = new Set<string>();
    const categoryAcc = new Map<
      string,
      { categoryKey?: QuestionCategoryKey; label: string; matched: number; total: number }
    >();
    let totalMatched = 0;
    let totalBoth = 0;

    const addCategoryItem = (q: Question, matched: boolean) => {
      const groupKey = q.categoryKey ?? (q.category || 'other');
      const label = q.category || t('common.otherCategory');
      const prev = categoryAcc.get(groupKey) ?? {
        categoryKey: q.categoryKey,
        label,
        matched: 0,
        total: 0,
      };
      categoryAcc.set(groupKey, {
        categoryKey: q.categoryKey ?? prev.categoryKey,
        label,
        matched: prev.matched + (matched ? 1 : 0),
        total: prev.total + 1,
      });
    };

    for (const rec of Object.values(effectiveCalendarDays)) {
      if (rec.isRevealed) {
        revealedDates.add(rec.quizDate);
      }
    }

    for (const day of historyDays) {
      historyDatesSet.add(day.quizDate);
      if (day.isRevealed) {
        revealedDates.add(day.quizDate);
      }
      for (const item of day.items) {
        if (!item.myAnswer || !item.partnerAnswer) continue;
        totalBoth++;
        if (item.isMatched) totalMatched++;
        addCategoryItem(item.question, item.isMatched);
      }
    }

    if (
      isMyCompleted &&
      isPartnerCompleted &&
      !historyDatesSet.has(todayDate) &&
      matchSummary.details.length > 0
    ) {
      revealedDates.add(todayDate);
      for (const item of matchSummary.details) {
        if (!item.myAnswer || !item.partnerAnswer) continue;
        totalBoth++;
        if (item.isMatched) totalMatched++;
        addCategoryItem(item.question, item.isMatched);
      }
    }

    const isTodayIncludedInStreak = revealedDates.has(todayDate);
    let cursor = isTodayIncludedInStreak ? todayDate : shiftIsoDate(todayDate, -1);
    let currentStreak = 0;
    while (revealedDates.has(cursor)) {
      currentStreak++;
      cursor = shiftIsoDate(cursor, -1);
    }

    let myUnansweredDays = 0;
    let myPastUnansweredDays = 0;
    let pastPartnerAnsweredUnansweredDays = 0;

    if (hasPair && todayDate) {
      let effectiveStart = pairStartDate;
      for (const dateKey of Object.keys(effectiveCalendarDays)) {
        if (!effectiveStart || dateKey < effectiveStart) {
          effectiveStart = dateKey;
        }
      }
      if (!effectiveStart || effectiveStart > todayDate) {
        effectiveStart = todayDate;
      }

      let dayCursor = effectiveStart;
      let guard = 0;
      while (dayCursor <= todayDate && guard < 2000) {
        const rec = effectiveCalendarDays[dayCursor];
        if (dayCursor === todayDate) {
          if (!isMyCompleted) {
            myUnansweredDays++;
          }
        } else if (!rec?.isMyCompleted) {
          myPastUnansweredDays++;
          myUnansweredDays++;
          if ((rec?.partnerAnsweredCount ?? 0) > 0) {
            pastPartnerAnsweredUnansweredDays++;
          }
        }
        dayCursor = shiftIsoDate(dayCursor, 1);
        guard++;
      }
    }

    const categoryStats: CategoryMatchStat[] = [...categoryAcc.values()]
      .map((stat) => ({
        categoryKey: stat.categoryKey,
        category: stat.label,
        matched: stat.matched,
        total: stat.total,
        percentage: stat.total > 0 ? Math.round((stat.matched / stat.total) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage || b.total - a.total);

    return {
      currentStreak,
      isTodayIncludedInStreak,
      totalRevealedDays: revealedDates.size,
      myUnansweredDays,
      myPastUnansweredDays,
      pastPartnerAnsweredUnansweredDays,
      overallMatchRate: totalBoth > 0 ? Math.round((totalMatched / totalBoth) * 100) : null,
      totalBothAnsweredQuestions: totalBoth,
      categoryStats,
    };
  }, [
    effectiveCalendarDays,
    historyDays,
    hasPair,
    pairStartDate,
    todayDate,
    isMyCompleted,
    isPartnerCompleted,
    matchSummary.details,
    t,
  ]);

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
        pairStartDate,
        isPairPremium,
        setPairPremium,
        questions,
        myAnswers,
        partnerAnswers,
        dayStatus,
        isMyCompleted,
        isPartnerCompleted,
        hasSeenTutorial,
        isTutorialVisible,
        historyDays,
        calendarDays: effectiveCalendarDays,
        isHistoryLoading,
        pairStats,
        dailyReminder,
        pushStatus,
        submitAnswer,
        loadDayQuizData,
        submitPastAnswer,
        createPair,
        joinPair,
        issuePairRelinkCode,
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
