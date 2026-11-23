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
import { useApp } from '../context/AppContext';
import { SwipeCard } from '../components/SwipeCard';
import { DayQuizData, SwipeDirection } from '../types';
import { COLORS } from '../constants/theme';
import { showAlert } from '../lib/alert';

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function formatFullDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}

export default function QuizScreen() {
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

  const [pastData, setPastData] = useState<DayQuizData | null>(null);
  const [pastMyAnswers, setPastMyAnswers] = useState<Record<string, SwipeDirection>>({});
  const [loadingPast, setLoadingPast] = useState(isPastQuiz);
  const [pastLoadError, setPastLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const submittingRef = useRef(false);

  // 途中まで回答済みの場合、最初の未回答質問から再開（当日モード用初期値）
  const initialIndex = Math.max(
    0,
    questions.findIndex((q) => !myAnswers[q.id])
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // 過去日モードのデータ読み込み
  useEffect(() => {
    if (!isPastQuiz) return;

    let active = true;
    void (async () => {
      try {
        const loaded = await loadDayQuizData(targetDate);
        if (!active) return;

        if (!loaded || loaded.questions.length === 0) {
          setPastLoadError('この日の出題データが見つかりませんでした。');
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
      } catch {
        if (active) {
          setPastLoadError('過去の質問データの読み込みに失敗しました。');
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
  }, [isPastQuiz, targetDate, loadDayQuizData]);

  // 当日モード: 全問回答完了なら結果または待機画面へ自動遷移
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
            '通信エラー',
            res.error ?? '回答の保存に失敗しました。通信環境をご確認のうえもう一度お試しください。'
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

      // 過去日モード: RLS で課金チェックしつつ保存
      const nextAnswers: Record<string, SwipeDirection> = {
        ...activeMyAnswers,
        [currentQuestion.id]: direction,
      };
      const nextUnansweredIndex = activeQuestions.findIndex((q) => !nextAnswers[q.id]);
      const isFinalQuestion = nextUnansweredIndex === -1;

      const res = await submitPastAnswer(targetDate, currentQuestion.id, direction, isFinalQuestion);
      if (!res.ok) {
        setRetryNonce((n) => n + 1);
        showAlert('回答できませんでした', res.error ?? '過去の質問の保存に失敗しました。');
        if (res.error?.includes('プレミアム')) {
          router.replace('/ai-report');
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
            '過去のお題に回答しました',
            `${formatShortDate(targetDate)}のお題への回答を記録しました！${partnerName}さんもこの日に回答すると、結果と一致率が履歴に表示されます。`
          );
          router.replace('/history');
        }
      }
    } finally {
      submittingRef.current = false;
    }
  };

  if (isPastQuiz && loadingPast) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `${formatShortDate(targetDate)}の質問` }} />
        <View style={styles.centerBox}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.centerText}>過去の質問を読み込んでいます...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPastQuiz && (pastLoadError || activeQuestions.length === 0)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `${formatShortDate(targetDate)}の質問` }} />
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.centerText}>
            {pastLoadError ?? 'この日の質問を表示できませんでした。'}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/history')}>
            <Text style={styles.backBtnText}>履歴へ戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: isPastQuiz ? `${formatShortDate(targetDate)}の質問` : '今日の質問',
        }}
      />
      <View style={styles.container}>
        <View style={styles.header}>
          {isPastQuiz && (
            <View style={styles.pastBadge}>
              <Ionicons name="diamond" size={12} color="#8C5A1B" />
              <Text style={styles.pastBadgeText}>
                過去の未回答お題（{formatFullDate(targetDate)}）
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
              第 {currentIndex + 1} 問 / 全 {total} 問
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
    lineHeight: 20,
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
  },
  pastBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C5A1B',
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
    letterSpacing: 0.5,
  },
  cardArea: {
    flex: 1,
  },
});
