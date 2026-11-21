import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
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
    fetchHistory,
    isSupabaseReady,
    hasPair,
  } = useApp();

  useEffect(() => {
    if (isSupabaseReady && hasPair) {
      void fetchHistory();
    }
  }, [isSupabaseReady, hasPair, fetchHistory]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>質問の比較とタイムライン</Text>
        <Text style={styles.headerDesc}>
          過去に出題された質問と、二人の回答の記録を一覧で確認できます。
        </Text>
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
                        {myName}: 「{question.choices[history.myAnswer]}」
                      </Text>
                      <Text style={styles.userAnswerText}>
                        {partnerName}: 「{question.choices[history.partnerAnswer]}」
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
      <Text style={styles.sectionLabel}>過去の公開済みタイムライン</Text>
      {isHistoryLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>履歴を読み込み中...</Text>
        </View>
      ) : historyDays.length === 0 ? (
        <View style={[styles.card, SHADOWS.cardSmall, styles.emptyCard]}>
          <Ionicons name="calendar-outline" size={28} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>公開済みの履歴はまだありません</Text>
          <Text style={styles.emptySub}>
            二人とも回答を完了した日の記録がここに蓄積されます。
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {historyDays.map((day) => {
            const matchedCount = day.items.filter((i) => i.isMatched).length;
            const total = day.items.length;
            const rate = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

            return (
              <View key={day.quizDate} style={[styles.card, SHADOWS.cardSmall]}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayDate}>{formatDateHeading(day.quizDate)}</Text>
                  <View style={styles.dayRateBadge}>
                    <Text style={styles.dayRateText}>
                      一致率 {rate}% ({matchedCount}/{total})
                    </Text>
                  </View>
                </View>

                <View style={styles.dayItemsList}>
                  {day.items.map((item) => (
                    <View key={item.question.id} style={styles.dayItemRow}>
                      <View style={styles.dayItemTop}>
                        <Text style={styles.dayItemTitle}>{item.question.title}</Text>
                        <Text
                          style={[
                            styles.dayItemMatchTag,
                            { color: item.isMatched ? '#4A7C59' : '#C97A2B' },
                          ]}
                        >
                          {item.isMatched ? '一致' : '不一致'}
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
                  ))}
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginBottom: 10,
    marginTop: 4,
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
