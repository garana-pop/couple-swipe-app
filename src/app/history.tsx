import React from 'react';
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

export default function HistoryScreen() {
  const { questions, myAnswers, partnerAnswers, partnerName, myName } = useApp();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>質問の比較とタイムライン</Text>
        <Text style={styles.headerDesc}>
          過去に出題された質問と、二人の回答の変化を一覧で確認できます。
        </Text>
      </View>

      <View style={styles.list}>
        {questions.map((question, index) => {
          const myCurrent = myAnswers[question.id];
          const partnerCurrent = partnerAnswers[question.id];
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

              {/* 比較ブロック */}
              {history ? (
                <View style={styles.compareContainer}>
                  {/* 過去 */}
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

                  {/* 今回 */}
                  <View style={[styles.timeBlock, styles.timeBlockCurrent]}>
                    <Text style={[styles.timeBlockLabel, styles.timeBlockLabelCurrent]}>
                      今回の最新回答
                    </Text>
                    <View style={styles.answersRow}>
                      <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                        {myName}: 「{myCurrent ? question.choices[myCurrent] : '未回答'}」
                      </Text>
                      <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                        {partnerName}: 「{partnerCurrent ? question.choices[partnerCurrent] : '未回答'}」
                      </Text>
                    </View>
                  </View>

                  {history.note && (
                    <Text style={styles.noteText}>{history.note}</Text>
                  )}
                </View>
              ) : (
                <View style={styles.singleContainer}>
                  <Text style={styles.singleNotice}>今回が初めての出題です</Text>
                  <Text style={styles.singleSub}>一定期間後に再出題され、変化を比較できるようになります</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

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
    marginBottom: 18,
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
  list: {
    gap: 14,
    marginBottom: 20,
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
  noteText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
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
