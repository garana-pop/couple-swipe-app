import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';

function formatDateHeading(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}

export default function HistoryScreen() {
  const {
    questions,
    myAnswers,
    partnerAnswers,
    isPartnerCompleted,
    partnerName,
    myName,
    historyDays,
    isHistoryLoading,
    pairStats,
    fetchHistory,
    isSupabaseReady,
    hasPair,
  } = useApp();

  useFocusEffect(
    useCallback(() => {
      if (isSupabaseReady && hasPair) {
        void fetchHistory();
      }
    }, [isSupabaseReady, hasPair, fetchHistory])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>質問の比較とタイムライン</Text>
        <Text style={styles.headerDesc}>
          過去に出題された質問と、二人の回答の記録を一覧で確認できます。
        </Text>
      </View>

      {/* 連続回答ストリーク ＆ カテゴリ別一致率カード */}
      <View style={[styles.card, SHADOWS.cardSmall, styles.statsCard]}>
        <View style={styles.statsKpiRow}>
          <View style={styles.kpiItem}>
            <View style={styles.kpiValueRow}>
              <Ionicons
                name={pairStats.currentStreak > 0 ? 'flame' : 'flame-outline'}
                size={16}
                color={pairStats.currentStreak > 0 ? '#D97559' : COLORS.textMuted}
              />
              <Text style={styles.kpiValue}>{pairStats.currentStreak}日</Text>
            </View>
            <Text style={styles.kpiLabel}>連続ストリーク</Text>
          </View>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{pairStats.totalRevealedDays}日</Text>
            <Text style={styles.kpiLabel}>双方完了日数</Text>
          </View>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>
              {pairStats.overallMatchRate !== null ? `${pairStats.overallMatchRate}%` : '--'}
            </Text>
            <Text style={styles.kpiLabel}>通算一致率</Text>
          </View>
        </View>

        {pairStats.categoryStats.length > 0 ? (
          <View style={styles.categoryStatsSection}>
            <Text style={styles.categoryStatsHeading}>
              カテゴリ別一致率（双方回答 {pairStats.totalBothAnsweredQuestions}問）
            </Text>
            <View style={styles.categoryBarsList}>
              {pairStats.categoryStats.map((stat) => {
                const barColor =
                  stat.percentage >= 75
                    ? '#4A7C59'
                    : stat.percentage >= 50
                      ? COLORS.primary
                      : '#C97A2B';
                return (
                  <View key={stat.category} style={styles.categoryBarItem}>
                    <View style={styles.categoryBarHeader}>
                      <Text style={styles.categoryBarName} numberOfLines={1}>
                        {stat.category}
                      </Text>
                      <Text style={[styles.categoryBarValue, { color: barColor }]}>
                        {stat.percentage}%（{stat.matched}/{stat.total}）
                      </Text>
                    </View>
                    <View style={styles.categoryBarTrack}>
                      <View
                        style={[
                          styles.categoryBarFill,
                          { width: `${stat.percentage}%`, backgroundColor: barColor },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <Text style={styles.categoryEmptyHint}>
            二人とも回答を完了すると、カテゴリ別の一致率グラフが表示されます。
          </Text>
        )}
      </View>

      {/* 今日の再出題比較セクション */}
      <Text style={styles.sectionLabel}>今日のお題（前回との比較）</Text>
      <View style={styles.list}>
        {questions.map((question, index) => {
          const myCurrent = myAnswers[question.id];
          const partnerCurrent = isPartnerCompleted ? partnerAnswers[question.id] : undefined;
          const history = question.pastHistory;

          return (
            <View key={question.id} style={[styles.card, SHADOWS.cardSmall]}>
              <View style={styles.cardTopRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{question.category}</Text>
                </View>
                {question.repeatBadge && (
                  <View style={styles.repeatBadge}>
                    <Ionicons name="time-outline" size={11} color={COLORS.primaryDark} />
                    <Text style={styles.repeatBadgeText}>{question.repeatBadge}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.questionTitle}>
                Q{index + 1}. {question.title}
              </Text>

              {history ? (
                <View style={styles.compareContainer}>
                  <View style={styles.timeBlock}>
                    <Text style={styles.timeBlockLabel}>{history.date} の回答</Text>
                    <View style={styles.answersRow}>
                      <Text style={styles.userAnswerText}>
                        {myName}: 「{history.myAnswer ? question.choices[history.myAnswer] : '未回答'}」
                      </Text>
                      <Text style={styles.userAnswerText}>
                        {partnerName}: 「
                        {history.partnerAnswer ? question.choices[history.partnerAnswer] : '未回答'}」
                      </Text>
                    </View>
                  </View>

                  <View style={styles.arrowRow}>
                    <Ionicons name="arrow-down" size={14} color={COLORS.primary} />
                  </View>

                  <View style={[styles.timeBlock, styles.timeBlockCurrent]}>
                    <Text style={[styles.timeBlockLabel, styles.timeBlockLabelCurrent]}>
                      今回の最新回答
                    </Text>
                    <View style={styles.answersRow}>
                      <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                        {myName}: 「{myCurrent ? question.choices[myCurrent] : '未回答'}」
                      </Text>
                      <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                        {partnerName}: 「
                        {partnerCurrent
                          ? question.choices[partnerCurrent]
                          : isPartnerCompleted
                            ? '未回答'
                            : '公開待ち'}
                        」
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.singleContainer}>
                  <Text style={styles.singleNotice}>今回が初めての出題です</Text>
                  <Text style={styles.singleSub}>
                    一定期間後に再出題され、変化を比較できるようになります
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* 過去の履歴タイムライン（Supabase 実データ） */}
      <Text style={styles.sectionLabel}>過去の履歴タイムライン</Text>

      <TouchableOpacity
        style={[styles.premiumGuideCard, SHADOWS.cardSmall]}
        activeOpacity={0.85}
        onPress={() => router.push('/ai-report')}
      >
        <View style={styles.premiumGuideHeader}>
          <View style={styles.premiumGuideTitleRow}>
            <Ionicons name="diamond" size={14} color="#9E6B24" />
            <Text style={styles.premiumGuideTitle}>過去の未回答お題もプレミアムで回答＆閲覧OK</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color="#9E6B24" />
        </View>
        <Text style={styles.premiumGuideText}>
          プレミアムプランに加入すると、自分が未回答だった過去日の質問に後から回答でき、回答すると相手の答えと一致率が見られます（AI相性診断にも自動反映・当日は双方完了まで秘密）。
        </Text>
      </TouchableOpacity>

      {isHistoryLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>履歴を読み込み中...</Text>
        </View>
      ) : historyDays.length === 0 ? (
        <View style={[styles.card, SHADOWS.cardSmall, styles.emptyCard]}>
          <Ionicons name="calendar-outline" size={28} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>表示できる履歴はまだありません</Text>
          <Text style={styles.emptySub}>
            二人とも回答を完了した日の記録がここに蓄積されます。未回答の過去日がある場合は、プレミアムプランで後から回答して相手の結果を見られます。
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {historyDays.map((day) => {
            // 1. 無料ペアの未回答過去日（ロックカード）
            if (day.isLockedPastDay) {
              return (
                <View key={day.quizDate} style={[styles.card, SHADOWS.cardSmall, styles.lockedPastCard]}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayDate}>{formatDateHeading(day.quizDate)}</Text>
                    <View style={styles.lockedBadge}>
                      <Ionicons name="lock-closed" size={11} color="#9E6B24" />
                      <Text style={styles.lockedBadgeText}>未回答の日</Text>
                    </View>
                  </View>

                  <Text style={styles.lockedDescText}>
                    {day.partnerAnsweredCount > 0
                      ? `あなたは未回答ですが、${partnerName}さんが ${day.partnerAnsweredCount}問 回答しています。プレミアムプランに加入すると、この日の質問に後から回答して相手の結果や一致率を見ることができ、AI相性診断にも反映されます。`
                      : `この日のお題（全${day.totalQuestions}問）は未回答です。プレミアムプランに加入すると、過去の質問に後から回答できるようになります。`}
                  </Text>

                  <TouchableOpacity
                    style={styles.unlockCtaBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push('/ai-report')}
                  >
                    <Ionicons name="diamond-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.unlockCtaBtnText}>
                      プレミアムで過去の質問に回答 ＆ 結果を見る
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }

            // 2. プレミアムペアの未回答過去日（ネタバレ防止：最初は相手の答えを伏せて回答ボタンを表示）
            if (day.canAnswerPastDay) {
              const remaining = Math.max(1, day.totalQuestions - day.myAnsweredCount);
              return (
                <View key={day.quizDate} style={[styles.card, SHADOWS.cardSmall, styles.answerablePastCard]}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayDate}>{formatDateHeading(day.quizDate)}</Text>
                    <View style={styles.premiumUnlockedBadge}>
                      <Ionicons name="diamond" size={11} color="#8C5A1B" />
                      <Text style={styles.premiumUnlockedBadgeText}>
                        未回答あり（残り{remaining}問）
                      </Text>
                    </View>
                  </View>

                  <View style={styles.spoilerShieldBox}>
                    <Ionicons name="eye-off-outline" size={15} color="#8C5A1B" />
                    <Text style={styles.spoilerShieldText}>
                      {day.partnerAnsweredCount > 0
                        ? `${partnerName}さんは ${day.partnerAnsweredCount}問 回答済みです（ネタバレ防止のため伏せています）。この日の質問に回答すると、${partnerName}さんの回答と一致率が見られます！`
                        : `この日のお題はまだ未回答です。プレミアム特典として今から回答できます（${partnerName}さんも回答すると一致率が表示されます）。`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.answerPastBtn}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({ pathname: '/quiz', params: { date: day.quizDate } })
                    }
                  >
                    <Ionicons name="play-circle" size={17} color="#FFFFFF" />
                    <Text style={styles.answerPastBtnText}>
                      この日の質問に回答する（残り{remaining}問）
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              );
            }

            // 3. 回答完了済みの日（双方完了 or 自分完了・相手未完了）
            const bothAnsweredItems = day.items.filter((i) => i.myAnswer && i.partnerAnswer);
            const matchedCount = bothAnsweredItems.filter((i) => i.isMatched).length;
            const totalBoth = bothAnsweredItems.length;
            const rate = totalBoth > 0 ? Math.round((matchedCount / totalBoth) * 100) : 0;

            return (
              <View key={day.quizDate} style={[styles.card, SHADOWS.cardSmall]}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayDate}>{formatDateHeading(day.quizDate)}</Text>
                  {day.isRevealed ? (
                    <View style={styles.dayRateBadge}>
                      <Text style={styles.dayRateText}>
                        一致率 {rate}% ({matchedCount}/{totalBoth})
                      </Text>
                    </View>
                  ) : day.isPremiumUnlocked ? (
                    <View style={styles.premiumUnlockedBadge}>
                      <Ionicons name="diamond" size={11} color="#8C5A1B" />
                      <Text style={styles.premiumUnlockedBadgeText}>プレミアム解放（相手途中回答）</Text>
                    </View>
                  ) : (
                    <View style={styles.partnerWaitingBadge}>
                      <Text style={styles.partnerWaitingBadgeText}>パートナー未回答</Text>
                    </View>
                  )}
                </View>

                <View style={styles.dayItemsList}>
                  {day.items.map((item) => {
                    const hasBoth = Boolean(item.myAnswer && item.partnerAnswer);
                    return (
                      <View key={item.question.id} style={styles.dayItemRow}>
                        <View style={styles.dayItemTop}>
                          <Text style={styles.dayItemTitle}>{item.question.title}</Text>
                          <Text
                            style={[
                              styles.dayItemMatchTag,
                              {
                                color: !hasBoth
                                  ? COLORS.textMuted
                                  : item.isMatched
                                    ? '#4A7C59'
                                    : '#C97A2B',
                              },
                            ]}
                          >
                            {!hasBoth ? '片方回答' : item.isMatched ? '一致' : '不一致'}
                          </Text>
                        </View>
                        <Text style={styles.userAnswerText}>
                          {myName}: 「
                          {item.myAnswer ? item.question.choices[item.myAnswer] : '未回答'}」
                        </Text>
                        <Text style={styles.userAnswerText}>
                          {partnerName}: 「
                          {item.partnerAnswer
                            ? item.question.choices[item.partnerAnswer]
                            : '未回答'}
                          」
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.8}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={16} color={COLORS.text} />
        <Text style={styles.backButtonText}>戻る</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  headerDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  statsCard: {
    marginBottom: 18,
    paddingVertical: 15,
  },
  statsKpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
  },
  kpiLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  categoryStatsSection: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  categoryStatsHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginBottom: 10,
  },
  categoryBarsList: {
    gap: 9,
  },
  categoryBarItem: {
    gap: 4,
  },
  categoryBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  categoryBarName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  categoryBarValue: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  categoryBarTrack: {
    height: 7,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryEmptyHint: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontSize: 11.5,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginBottom: 10,
    marginTop: 4,
  },
  premiumGuideCard: {
    backgroundColor: '#FFFBF3',
    borderRadius: 14,
    padding: 13,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EED9B7',
  },
  premiumGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  premiumGuideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  premiumGuideTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  premiumGuideText: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 17,
  },
  list: {
    gap: 14,
    marginBottom: 22,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
  },
  compareContainer: {
    gap: 6,
  },
  timeBlock: {
    backgroundColor: '#FAF6F2',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE3D7',
  },
  timeBlockCurrent: {
    backgroundColor: '#F4ECE4',
    borderColor: '#E2D3C3',
  },
  timeBlockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  timeBlockLabelCurrent: {
    color: COLORS.primaryDark,
  },
  answersRow: {
    gap: 2,
  },
  userAnswerText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  userAnswerCurrent: {
    fontWeight: '700',
    color: COLORS.text,
  },
  arrowRow: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  singleContainer: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  singleNotice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  singleSub: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  dayRateBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dayRateText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  dayItemsList: {
    gap: 10,
  },
  dayItemRow: {
    backgroundColor: COLORS.surface,
    padding: 10,
    borderRadius: 10,
    gap: 3,
  },
  dayItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  dayItemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayItemMatchTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  lockedPastCard: {
    backgroundColor: '#FFFBF5',
    borderColor: '#F0DEC0',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF3E7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9E6B24',
  },
  lockedDescText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  unlockCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  unlockCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  premiumUnlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBF1DF',
    borderWidth: 1,
    borderColor: '#EBD3AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  premiumUnlockedBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  answerablePastCard: {
    backgroundColor: '#FFFDF8',
    borderColor: '#EBD3AA',
  },
  spoilerShieldBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FAF3E6',
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  spoilerShieldText: {
    flex: 1,
    fontSize: 12,
    color: '#7A5B32',
    lineHeight: 18,
  },
  answerPastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
  },
  answerPastBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  partnerWaitingBadge: {
    backgroundColor: '#EFF5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  partnerWaitingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4D779E',
  },
  backButton: {
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
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
});
