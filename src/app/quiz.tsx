import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { SwipeCard } from '../components/SwipeCard';
import { DayQuizData, SwipeDirection } from '../types';
import { COLORS } from '../constants/theme';
import { getCurrentLocale } from '../i18n';
import { formatIsoFullDate, formatIsoShortDate } from '../i18n/format';
import { showAlert } from '../lib/alert';

export default function QuizScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const rawDate = Array.isArray(dateParam) ? dateParam[0] : dateParam;

  const {
    todayDate,
    questions,
    myAnswers,
    submitAnswer,
    isPartnerCompleted,
    partnerName,
    loadDayQuizData,
    submitPastAnswer,
    fetchHistory,
  } = useApp();

  const isPastQuiz = Boolean(
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate !== todayDate
  );
  const targetDate = isPastQuiz ? rawDate! : todayDate;
  const shortTargetDate = formatIsoShortDate(targetDate, locale);
  const fullTargetDate = formatIsoFullDate(targetDate, locale);

  const [pastData, setPastData] = useState<DayQuizData | null>(null);
  const [pastMyAnswers, setPastMyAnswers] = useState<Record<string, SwipeDirection>>({});
  const [loadingPast, setLoadingPast] = useState(isPastQuiz);
  const [pastLoadError, setPastLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const submittingRef = useRef(false);

  const initialIndex = Math.max(
    0,
    questions.findIndex((q) => !myAnswers[q.id])
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (!isPastQuiz) return;

    let active = true;
    void (async () => {
      try {
        const loaded = await loadDayQuizData(targetDate);
        if (!active) return;

        if (!loaded || loaded.questions.length === 0) {
          setPastLoadError(t('quiz.pastNotFound'));
          return;
        }

        if (loaded.isMyCompleted) {
          if (loaded.partnerAnsweredCount > 0) {
            router.replace({ pathname: '/result', params: { date: targetDate } });
          } else {
            router.replace('/history');
          }
          return;
        }

        setPastData(loaded);
        setPastMyAnswers(loaded.myAnswers);
        const firstUnanswered = loaded.questions.findIndex((q) => !loaded.myAnswers[q.id]);
        setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
      } catch (err) {
        if (active) {
          const typedErr = err as Error & { code?: string };
          const msg =
            typedErr instanceof Error && typedErr.message
              ? typedErr.message
              : t('quiz.pastLoadFailed');
          setPastLoadError(msg);
          if (typedErr?.code === 'PREMIUM_REQUIRED') {
            showAlert(t('quiz.premiumOnlyTitle'), msg);
            router.replace({ pathname: '/ai-report', params: { focus: 'plans' } });
          }
        }
      } finally {
        if (active) {
          setLoadingPast(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isPastQuiz, targetDate, loadDayQuizData, t]);

  useEffect(() => {
    if (isPastQuiz) return;
    if (questions.length > 0 && questions.every((q) => !!myAnswers[q.id])) {
      router.replace(isPartnerCompleted ? '/result' : '/waiting');
    }
  }, [isPastQuiz, questions, myAnswers, isPartnerCompleted]);

  const activeQuestions = isPastQuiz ? (pastData?.questions ?? []) : questions;
  const activeMyAnswers = isPastQuiz ? pastMyAnswers : myAnswers;
  const currentQuestion = activeQuestions[currentIndex];
  const total = activeQuestions.length;

  const handleSwipeAnswer = async (direction: SwipeDirection) => {
    if (!currentQuestion || submittingRef.current) return;
    submittingRef.current = true;

    try {
      if (!isPastQuiz) {
        const res = await submitAnswer(currentQuestion.id, direction);
        if (!res.ok) {
          setRetryNonce((n) => n + 1);
          showAlert(
            t('quiz.networkErrorTitle'),
            res.error ?? t('errors.answerSaveFailed')
          );
          return;
        }

        if (currentIndex + 1 < total) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          router.replace(isPartnerCompleted ? '/result' : '/waiting');
        }
        return;
      }

      const nextAnswers: Record<string, SwipeDirection> = {
        ...activeMyAnswers,
        [currentQuestion.id]: direction,
      };
      const nextUnansweredIndex = activeQuestions.findIndex((q) => !nextAnswers[q.id]);
      const isFinalQuestion = nextUnansweredIndex === -1;

      const res = await submitPastAnswer(targetDate, currentQuestion.id, direction, isFinalQuestion);
      if (!res.ok) {
        setRetryNonce((n) => n + 1);
        showAlert(t('quiz.cannotAnswerTitle'), res.error ?? t('quiz.pastSaveFailed'));
        if (res.errorCode === 'PREMIUM_REQUIRED') {
          router.replace({ pathname: '/ai-report', params: { focus: 'plans' } });
        }
        return;
      }

      setPastMyAnswers(nextAnswers);

      if (!isFinalQuestion) {
        setCurrentIndex(nextUnansweredIndex);
      } else {
        await fetchHistory();
        const latestDay = await loadDayQuizData(targetDate);
        const partnerHasAnswers =
          (latestDay?.partnerAnsweredCount ?? pastData?.partnerAnsweredCount ?? 0) > 0;

        if (partnerHasAnswers) {
          router.replace({ pathname: '/result', params: { date: targetDate } });
        } else {
          showAlert(
            t('quiz.pastCompletedTitle'),
            t('quiz.pastCompletedBody', { date: shortTargetDate, partnerName })
          );
          router.replace('/history');
        }
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const screenTitle = isPastQuiz
    ? t('nav.quizPast', { date: shortTargetDate })
    : t('nav.quiz');

  if (isPastQuiz && loadingPast) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: screenTitle }} />
        <View style={styles.centerBox}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.centerText}>{t('quiz.loadingPast')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPastQuiz && (pastLoadError || activeQuestions.length === 0)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: screenTitle }} />
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.centerText}>
            {pastLoadError ?? t('quiz.cannotShowQuestions')}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/history')}>
            <Text style={styles.backBtnText}>{t('quiz.backToHistory')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: screenTitle }} />
      <View style={styles.container}>
        <View style={styles.header}>
          {isPastQuiz && (
            <View style={styles.pastBadge}>
              <Ionicons name="diamond" size={12} color="#8C5A1B" />
              <Text style={styles.pastBadgeText} numberOfLines={2}>
                {t('quiz.pastBadge', { date: fullTargetDate })}
              </Text>
            </View>
          )}

          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${total > 0 ? ((currentIndex + 1) / total) * 100 : 0}%` },
              ]}
            />
          </View>
          <View style={styles.stepInfoRow}>
            <Text style={styles.stepText}>
              {t('quiz.stepProgress', { current: currentIndex + 1, total })}
            </Text>
          </View>
        </View>

        <View style={styles.cardArea}>
          {currentQuestion && (
            <SwipeCard
              key={`${targetDate}-${currentQuestion.id}-${retryNonce}`}
              question={currentQuestion}
              onSwipe={handleSwipeAnswer}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: {
    fontSize: 13.5,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  backBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 19,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FBF1DF',
    borderWidth: 1,
    borderColor: '#EBD3AA',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 10,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  pastBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C5A1B',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 16,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  stepInfoRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    lineHeight: 18,
  },
  cardArea: {
    flex: 1,
  },
});
