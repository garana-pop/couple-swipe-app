import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { SwipeDirection } from '../types';

export default function ResultScreen() {
  const {
    isPartnerCompleted,
    isMyCompleted,
    partnerName,
    myName,
    matchSummary,
  } = useApp();

  // 双方完了していない場合はロック画面へ
  useEffect(() => {
    if (!isMyCompleted || !isPartnerCompleted) {
      router.replace('/waiting');
    }
  }, [isMyCompleted, isPartnerCompleted]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 一致率メインサークル（コメント文は削除してシンプルに） */}
      <View style={[styles.rateCard, SHADOWS.card]}>
        <Text style={styles.rateSubtitle}>今日の一致率</Text>
        <View style={styles.percentageCircle}>
          <Text style={styles.percentageText}>{matchSummary.percentage}%</Text>
          <Text style={styles.matchedFractionText}>
            {matchSummary.matchedCount} / {matchSummary.total} 問一致
          </Text>
        </View>
      </View>

      {/* 質問ごとの回答対比一覧 */}
      <View style={styles.sectionHeader}>
        <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>回答の内訳・対比</Text>
      </View>

      <View style={styles.questionsList}>
        {matchSummary.details.map((item, index) => {
          const myBadge = getDirectionBadge(item.myAnswer);
          const partnerBadge = getDirectionBadge(item.partnerAnswer);
          const history = item.question.pastHistory;

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
                    item.isMatched ? styles.matchBadgeMatched : styles.matchBadgeDiff,
                  ]}
                >
                  <Text
                    style={[
                      styles.matchBadgeText,
                      item.isMatched ? styles.matchTextMatched : styles.matchTextDiff,
                    ]}
                  >
                    {item.isMatched ? '一致' : '不一致'}
                  </Text>
                </View>
              </View>

              {/* 二人の回答比較 */}
              <View style={styles.answersCompareBox}>
                {/* 自分の回答 */}
                <View style={styles.answerRow}>
                  <View style={styles.userTag}>
                    <Text style={styles.userTagText}>{myName} (あなた)</Text>
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
                    <Text style={[styles.userTagText, { color: '#4D779E' }]}>
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
                        あなた「{item.question.choices[history.myAnswer]}」 / {partnerName}「{item.question.choices[history.partnerAnswer]}」
                      </Text>
                    </View>
                    <View style={styles.historyAnswerRow}>
                      <Text style={styles.historyLabel}>今回：</Text>
                      <Text style={[styles.historyAnswerText, styles.historyAnswerTextCurrent]}>
                        あなた「{item.myAnswer ? item.question.choices[item.myAnswer] : ''}」 / {partnerName}「{item.partnerAnswer ? item.question.choices[item.partnerAnswer] : ''}」
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 85,
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

  // ----------------------------------------------------
  // 過去との比較セクション
  // ----------------------------------------------------
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
