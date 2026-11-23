import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { evaluateMatch } from '../constants/questions';
import { DayQuizData, SwipeDirection } from '../types';

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

export default function ResultScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const rawDate = Array.isArray(dateParam) ? dateParam[0] : dateParam;

  const {
    todayDate,
    isPartnerCompleted,
    isMyCompleted,
    partnerName,
    myName,
    matchSummary,
    loadDayQuizData,
  } = useApp();

  const isPastResult = Boolean(
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate !== todayDate
  );
  const targetDate = isPastResult ? rawDate! : todayDate;

  const [pastData, setPastData] = useState<DayQuizData | null>(null);
  const [loadingPast, setLoadingPast] = useState(isPastResult);

  // 当日モード: 双方完了していない場合はロック画面へ
  useEffect(() => {
    if (isPastResult) return;
    if (!isMyCompleted || !isPartnerCompleted) {
      router.replace('/waiting');
    }
  }, [isPastResult, isMyCompleted, isPartnerCompleted]);

  // 過去日モード: 完了した過去日の結果（双方回答・一致率）を取得
  useEffect(() => {
    if (!isPastResult) return;

    let active = true;
    void (async () => {
      try {
        const loaded = await loadDayQuizData(targetDate);
        if (active) {
          setPastData(loaded);
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
  }, [isPastResult, targetDate, loadDayQuizData]);

  const effectiveSummary = useMemo(() => {
    if (!isPastResult) return matchSummary;
    if (!pastData) {
      return { total: 0, matchedCount: 0, percentage: 0, details: [] };
    }

    const details = pastData.questions.map((q) => {
      const my = pastData.myAnswers[q.id];
      const partner = pastData.partnerAnswers[q.id];
      const isMatched = evaluateMatch(q, my, partner);
      return {
        question: q,
        myAnswer: my,
        partnerAnswer: partner,
        isMatched,
      };
    });

    const bothAnswered = details.filter((d) => d.myAnswer && d.partnerAnswer);
    const matchedCount = bothAnswered.filter((d) => d.isMatched).length;
    const total = bothAnswered.length;
    const percentage = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

    return {
      total,
      matchedCount,
      percentage,
      details,
    };
  }, [isPastResult, matchSummary, pastData]);

  // 方向の日本語ラベルと色を取得
  const getDirectionBadge = (dir?: SwipeDirection) => {
    if (!dir) return { label: '未回答', color: '#B5AAA3', icon: 'help' as const };
    switch (dir) {
      case 'UP':
        return { label: '上', color: COLORS.directions.UP.color, icon: 'arrow-up' as const };
      case 'DOWN':
        return { label: '下', color: COLORS.directions.DOWN.color, icon: 'arrow-down' as const };
      case 'LEFT':
        return { label: '左', color: COLORS.directions.LEFT.color, icon: 'arrow-back' as const };
      case 'RIGHT':
        return { label: '右', color: COLORS.directions.RIGHT.color, icon: 'arrow-forward' as const };
    }
  };

  if (isPastResult && loadingPast) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: `${formatShortDate(targetDate)}の診断結果` }} />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>結果を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen
        options={{
          title: isPastResult ? `${formatShortDate(targetDate)}の診断結果` : '診断結果',
        }}
      />

      {/* 一致率メインサークル */}
      <View style={[styles.rateCard, SHADOWS.card]}>
        <Text style={styles.rateSubtitle}>
          {isPastResult ? `${formatShortDate(targetDate)}の一致率` : '今日の一致率'}
        </Text>
        <View style={styles.percentageCircle}>
          <Text style={styles.percentageText}>{effectiveSummary.percentage}%</Text>
          <Text style={styles.matchedFractionText}>
            {effectiveSummary.matchedCount} / {effectiveSummary.total} 問一致
          </Text>
        </View>
        {isPastResult && effectiveSummary.total < effectiveSummary.details.length ? (
          <Text style={styles.partialNoteText}>
            ※ 双方回答済みの {effectiveSummary.total} 問から算出しています
          </Text>
        ) : null}
      </View>

      {/* 質問ごとの回答対比一覧 */}
      <View style={styles.sectionHeader}>
        <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>回答の内訳・対比</Text>
      </View>

      <View style={styles.questionsList}>
        {effectiveSummary.details.map((item, index) => {
          const myBadge = getDirectionBadge(item.myAnswer);
          const partnerBadge = getDirectionBadge(item.partnerAnswer);
          const history = item.question.pastHistory;
          const hasBoth = Boolean(item.myAnswer && item.partnerAnswer);

          return (
            <View key={item.question.id} style={[styles.detailCard, SHADOWS.cardSmall]}>
              <View style={styles.detailCardHeader}>
                <View style={styles.qNumBox}>
                  <Text style={styles.qNumText}>Q{index + 1}</Text>
                </View>
                <Text style={styles.qTitleText}>{item.question.title}</Text>
                <View
                  style={[
                    styles.matchBadge,
                    !hasBoth
                      ? styles.matchBadgeSingle
                      : item.isMatched
                        ? styles.matchBadgeMatched
                        : styles.matchBadgeDiff,
                  ]}
                >
                  <Text
                    style={[
                      styles.matchBadgeText,
                      !hasBoth
                        ? styles.matchTextSingle
                        : item.isMatched
                          ? styles.matchTextMatched
                          : styles.matchTextDiff,
                    ]}
                  >
                    {!hasBoth ? '片方回答' : item.isMatched ? '一致' : '不一致'}
                  </Text>
                </View>
              </View>

              {/* 二人の回答比較 */}
              <View style={styles.answersCompareBox}>
                {/* 自分の回答 */}
                <View style={styles.answerRow}>
                  <View style={styles.userTag}>
                    <Text style={styles.userTagText} numberOfLines={1} ellipsizeMode="tail">
                      {myName} (あなた)
                    </Text>
                  </View>
                  <View style={styles.answerContent}>
                    <View style={[styles.dirIconBox, { backgroundColor: myBadge.color }]}>
                      <Ionicons name={myBadge.icon} size={13} color="#FFFFFF" />
                    </View>
                    <Text style={styles.answerText}>
                      {item.myAnswer ? item.question.choices[item.myAnswer] : '未回答'}
                    </Text>
                  </View>
                </View>

                {/* パートナーの回答 */}
                <View style={styles.answerRow}>
                  <View style={[styles.userTag, { backgroundColor: '#F0F5F9' }]}>
                    <Text
                      style={[styles.userTagText, { color: '#4D779E' }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {partnerName}
                    </Text>
                  </View>
                  <View style={styles.answerContent}>
                    <View style={[styles.dirIconBox, { backgroundColor: partnerBadge.color }]}>
                      <Ionicons name={partnerBadge.icon} size={13} color="#FFFFFF" />
                    </View>
                    <Text style={styles.answerText}>
                      {item.partnerAnswer
                        ? item.question.choices[item.partnerAnswer]
                        : '未回答'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 過去との回答比較セクション（過去出題歴がある場合） */}
              {history && (
                <View style={styles.historyCompareContainer}>
                  <View style={styles.historyHeader}>
                    <Ionicons name="git-compare-outline" size={13} color={COLORS.primaryDark} />
                    <Text style={styles.historyHeaderText}>
                      過去との比較（{history.date}）
                    </Text>
                  </View>
                  <View style={styles.historyBox}>
                    <View style={styles.historyAnswerRow}>
                      <Text style={styles.historyLabel}>前回：</Text>
                      <Text style={styles.historyAnswerText}>
                        あなた「{history.myAnswer ? item.question.choices[history.myAnswer] : '未回答'}」 / {partnerName}「{history.partnerAnswer ? item.question.choices[history.partnerAnswer] : '未回答'}」
                      </Text>
                    </View>
                    <View style={styles.historyAnswerRow}>
                      <Text style={styles.historyLabel}>今回：</Text>
                      <Text style={[styles.historyAnswerText, styles.historyAnswerTextCurrent]}>
                        あなた「{item.myAnswer ? item.question.choices[item.myAnswer] : '未回答'}」 / {partnerName}「{item.partnerAnswer ? item.question.choices[item.partnerAnswer] : '未回答'}」
                      </Text>
                    </View>
                    {history.note && (
                      <Text style={styles.historyNoteText}>{history.note}</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {isPastResult && (
        <TouchableOpacity
          style={styles.historyBackButton}
          activeOpacity={0.8}
          onPress={() => router.replace('/history')}
        >
          <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
          <Text style={styles.historyBackButtonText}>過去の回答一覧へ戻る</Text>
        </TouchableOpacity>
      )}

      {/* ホームに戻るボタン */}
      <TouchableOpacity
        style={styles.homeButton}
        activeOpacity={0.8}
        onPress={() => router.replace('/')}
      >
        <Ionicons name="home-outline" size={17} color={COLORS.text} />
        <Text style={styles.homeButtonText}>ホームに戻る</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  rateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  percentageCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: COLORS.surface,
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  matchedFractionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: -2,
  },
  partialNoteText: {
    marginTop: 10,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  questionsList: {
    gap: 14,
    marginBottom: 22,
  },
  detailCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  qNumBox: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  qNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  qTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  matchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  matchBadgeMatched: {
    backgroundColor: '#F0F6F2',
  },
  matchBadgeDiff: {
    backgroundColor: '#FEF6EB',
  },
  matchBadgeSingle: {
    backgroundColor: COLORS.surface,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  matchTextMatched: {
    color: '#4A7C59',
  },
  matchTextDiff: {
    color: '#C97A2B',
  },
  matchTextSingle: {
    color: COLORS.textMuted,
  },
  answersCompareBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userTag: {
    backgroundColor: '#FDF1EC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 72,
    maxWidth: 132,
    flexShrink: 0,
    alignItems: 'center',
  },
  userTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  answerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  dirIconBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  historyCompareContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  historyHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  historyBox: {
    backgroundColor: '#FAF5EF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE0D2',
    gap: 4,
  },
  historyAnswerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    width: 40,
  },
  historyAnswerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  historyAnswerTextCurrent: {
    fontWeight: '700',
    color: COLORS.text,
  },
  historyNoteText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  historyBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 6,
    marginBottom: 10,
  },
  historyBackButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 6,
  },
  homeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
});
