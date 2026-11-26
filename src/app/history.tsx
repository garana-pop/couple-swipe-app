import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { AnswerCalendarModal } from '../components/AnswerCalendarModal';
import { COLORS, SHADOWS } from '../constants/theme';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const { openCalendar } = useLocalSearchParams<{ openCalendar?: string }>();
  const {
    questions,
    myAnswers,
    partnerAnswers,
    isPartnerCompleted,
    partnerName,
    myName,
    todayDate,
    pairStartDate,
    isPairPremium,
    historyDays,
    calendarDays,
    pairStats,
    fetchHistory,
    isSupabaseReady,
    hasPair,
  } = useApp();

  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const didAutoOpenCalendarRef = useRef(false);

  useEffect(() => {
    if (openCalendar === '1' && !didAutoOpenCalendarRef.current) {
      didAutoOpenCalendarRef.current = true;
      setIsCalendarVisible(true);
    }
  }, [openCalendar]);

  useFocusEffect(
    useCallback(() => {
      if (isSupabaseReady && hasPair) {
        void fetchHistory();
      }
    }, [isSupabaseReady, hasPair, fetchHistory])
  );

  const handleOpenCalendar = () => {
    setIsCalendarVisible(true);
  };

  const handleAnswerDate = (dateStr: string, isToday: boolean) => {
    setIsCalendarVisible(false);
    if (isToday) {
      router.push('/quiz');
    } else {
      router.push({ pathname: '/quiz', params: { date: dateStr } });
    }
  };

  const handleOpenResult = (dateStr: string, isToday: boolean) => {
    setIsCalendarVisible(false);
    if (isToday) {
      router.push('/result');
    } else {
      router.push({ pathname: '/result', params: { date: dateStr } });
    }
  };

  const handleOpenWaiting = () => {
    setIsCalendarVisible(false);
    router.push('/waiting');
  };

  const handleOpenPremium = () => {
    setIsCalendarVisible(false);
    router.push({ pathname: '/ai-report', params: { focus: 'plans' } });
  };

  const calendarSubtext = (() => {
    if (!hasPair) {
      return t('history.calendarSub.noPair');
    }
    if (pairStats.myPastUnansweredDays > 0) {
      if (isPairPremium) {
        return t('history.calendarSub.premiumHasPast', {
          count: pairStats.myPastUnansweredDays,
        });
      }
      if (pairStats.pastPartnerAnsweredUnansweredDays > 0) {
        return t('history.calendarSub.freePartnerAnswered', { partnerName });
      }
      return t('history.calendarSub.freeHasPast', {
        count: pairStats.myPastUnansweredDays,
      });
    }
    if (pairStats.myUnansweredDays > 0) {
      return t('history.calendarSub.todayUnanswered');
    }
    return t('history.calendarSub.allDone');
  })();

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.history'),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleOpenCalendar}
              style={styles.headerCalendarBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="calendar-outline" size={22} color={COLORS.text} />
              {pairStats.myUnansweredDays > 0 && <View style={styles.headerCalendarDot} />}
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>{t('history.headerTitle')}</Text>
          <Text style={styles.headerDesc}>{t('history.headerDesc')}</Text>
        </View>

        {/* 連続回答ストリーク ＆ 自身の未回答日数 ＆ カテゴリ別一致率カード */}
        <View style={[styles.card, SHADOWS.cardSmall, styles.statsCard]}>
          <View style={styles.statsKpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiValueRow}>
                <Ionicons
                  name={pairStats.currentStreak > 0 ? 'flame' : 'flame-outline'}
                  size={16}
                  color={pairStats.currentStreak > 0 ? '#D97559' : COLORS.textMuted}
                />
                <Text
                  style={styles.kpiValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {t('common.daysCount', { count: pairStats.currentStreak })}
                </Text>
              </View>
              <Text style={styles.kpiLabel} numberOfLines={2}>
                {t('history.kpiStreak')}
              </Text>
            </View>

            <View style={styles.kpiDivider} />

            <TouchableOpacity
              style={styles.kpiItem}
              activeOpacity={0.7}
              onPress={handleOpenCalendar}
            >
              <View style={styles.kpiValueRow}>
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={pairStats.myUnansweredDays > 0 ? '#C97A2B' : '#4A7C59'}
                />
                <Text
                  style={[
                    styles.kpiValue,
                    pairStats.myUnansweredDays > 0 && styles.kpiValueUnanswered,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {t('common.daysCount', { count: pairStats.myUnansweredDays })}
                </Text>
              </View>
              <Text style={styles.kpiLabel} numberOfLines={2}>
                {t('history.kpiUnanswered')}
              </Text>
            </TouchableOpacity>

            <View style={styles.kpiDivider} />

            <View style={styles.kpiItem}>
              <Text
                style={styles.kpiValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {pairStats.overallMatchRate !== null ? `${pairStats.overallMatchRate}%` : '--'}
              </Text>
              <Text style={styles.kpiLabel} numberOfLines={2}>
                {t('history.kpiOverallRate')}
              </Text>
            </View>
          </View>

          {pairStats.categoryStats.length > 0 ? (
            <View style={styles.categoryStatsSection}>
              <Text style={styles.categoryStatsHeading}>
                {t('history.categoryHeading', {
                  count: pairStats.totalBothAnsweredQuestions,
                })}
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
                    <View key={stat.categoryKey ?? stat.category} style={styles.categoryBarItem}>
                      <View style={styles.categoryBarHeader}>
                        <Text style={styles.categoryBarName} numberOfLines={1}>
                          {stat.category}
                        </Text>
                        <Text style={[styles.categoryBarValue, { color: barColor }]}>
                          {stat.percentage}% ({stat.matched}/{stat.total})
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
            <Text style={styles.categoryEmptyHint}>{t('history.categoryEmptyHint')}</Text>
          )}
        </View>

        {/* 回答カレンダーボタン */}
        <TouchableOpacity
          style={[
            styles.calendarTriggerCard,
            SHADOWS.cardSmall,
            pairStats.myPastUnansweredDays > 0 && styles.calendarTriggerCardHighlight,
          ]}
          activeOpacity={0.82}
          onPress={handleOpenCalendar}
        >
          <View style={styles.calendarTriggerIconBox}>
            <Ionicons name="calendar" size={20} color={COLORS.primary} />
          </View>
          <View style={styles.calendarTriggerBody}>
            <View style={styles.calendarTriggerTopRow}>
              <Text style={styles.calendarTriggerTitle}>{t('history.calendarTriggerTitle')}</Text>
              {pairStats.myUnansweredDays > 0 ? (
                <View style={styles.calendarUnansweredPill}>
                  <Text style={styles.calendarUnansweredPillText}>
                    {t('home.unansweredDays', { count: pairStats.myUnansweredDays })}
                  </Text>
                </View>
              ) : (
                <View style={styles.calendarDonePill}>
                  <Text style={styles.calendarDonePillText}>{t('history.calendarDonePill')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.calendarTriggerSub}>{calendarSubtext}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* 今日の再出題比較セクション */}
        <Text style={styles.sectionLabel}>{t('history.sectionTodayCompare')}</Text>
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
                      <Text style={styles.timeBlockLabel}>
                        {t('history.pastAnswerHeading', { date: history.date })}
                      </Text>
                      <View style={styles.answersRow}>
                        <Text style={styles.userAnswerText}>
                          {t('history.answerLine', {
                            name: myName,
                            choice: history.myAnswer
                              ? question.choices[history.myAnswer]
                              : t('common.unanswered'),
                          })}
                        </Text>
                        <Text style={styles.userAnswerText}>
                          {t('history.answerLine', {
                            name: partnerName,
                            choice: history.partnerAnswer
                              ? question.choices[history.partnerAnswer]
                              : t('common.unanswered'),
                          })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.arrowRow}>
                      <Ionicons name="arrow-down" size={14} color={COLORS.primary} />
                    </View>

                    <View style={[styles.timeBlock, styles.timeBlockCurrent]}>
                      <Text style={[styles.timeBlockLabel, styles.timeBlockLabelCurrent]}>
                        {t('history.currentAnswerHeading')}
                      </Text>
                      <View style={styles.answersRow}>
                        <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                          {t('history.answerLine', {
                            name: myName,
                            choice: myCurrent
                              ? question.choices[myCurrent]
                              : t('common.unanswered'),
                          })}
                        </Text>
                        <Text style={[styles.userAnswerText, styles.userAnswerCurrent]}>
                          {t('history.answerLine', {
                            name: partnerName,
                            choice: partnerCurrent
                              ? question.choices[partnerCurrent]
                              : isPartnerCompleted
                                ? t('common.unanswered')
                                : t('common.waitingReveal'),
                          })}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.singleContainer}>
                    <Text style={styles.singleNotice}>{t('history.firstTimeNotice')}</Text>
                    <Text style={styles.singleSub}>{t('history.firstTimeSub')}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* 過去の未回答お題 */}
        <Text style={styles.sectionLabel}>{t('history.sectionPastUnanswered')}</Text>

        {isPairPremium ? (
          <TouchableOpacity
            style={[styles.premiumGuideCard, SHADOWS.cardSmall]}
            activeOpacity={0.85}
            onPress={handleOpenCalendar}
          >
            <View style={styles.premiumGuideHeader}>
              <View style={styles.premiumGuideTitleRow}>
                <Ionicons name="diamond" size={14} color="#9E6B24" />
                <Text style={styles.premiumGuideTitle}>
                  {pairStats.myPastUnansweredDays > 0
                    ? t('history.premiumGuide.titlePremiumHasPast', {
                        count: pairStats.myPastUnansweredDays,
                      })
                    : t('history.premiumGuide.titlePremiumNoPast')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#9E6B24" />
            </View>
            <Text style={styles.premiumGuideText}>{t('history.premiumGuide.descPremium')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.premiumGuideCard, SHADOWS.cardSmall]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/ai-report', params: { focus: 'plans' } })}
          >
            <View style={styles.premiumGuideHeader}>
              <View style={styles.premiumGuideTitleRow}>
                <Ionicons name="diamond" size={14} color="#9E6B24" />
                <Text style={styles.premiumGuideTitle}>
                  {pairStats.myPastUnansweredDays > 0
                    ? t('history.premiumGuide.titleFreeHasPast', {
                        count: pairStats.myPastUnansweredDays,
                      })
                    : t('history.premiumGuide.titleFreeNoPast')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#9E6B24" />
            </View>
            <Text style={styles.premiumGuideText}>
              {pairStats.pastPartnerAnsweredUnansweredDays > 0
                ? t('history.premiumGuide.descFreePartnerAnswered', {
                    partnerName,
                    count: pairStats.pastPartnerAnsweredUnansweredDays,
                  })
                : t('history.premiumGuide.descFree')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={16} color={COLORS.text} />
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AnswerCalendarModal
        visible={isCalendarVisible}
        onClose={() => setIsCalendarVisible(false)}
        hasPair={hasPair}
        todayDate={todayDate}
        pairStartDate={pairStartDate}
        isPairPremium={isPairPremium}
        partnerName={partnerName}
        calendarDays={calendarDays}
        historyDays={historyDays}
        myUnansweredDays={pairStats.myUnansweredDays}
        myPastUnansweredDays={pairStats.myPastUnansweredDays}
        pastPartnerAnsweredUnansweredDays={pairStats.pastPartnerAnsweredUnansweredDays}
        onAnswerDate={handleAnswerDate}
        onOpenResult={handleOpenResult}
        onOpenWaiting={handleOpenWaiting}
        onOpenPremium={handleOpenPremium}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerCalendarBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'relative',
  },
  headerCalendarDot: {
    position: 'absolute',
    top: 3,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#C97A2B',
    borderWidth: 1,
    borderColor: COLORS.background,
  },
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
    lineHeight: 28,
    marginBottom: 6,
  },
  headerDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
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
    paddingHorizontal: 4,
    minWidth: 0,
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    maxWidth: '100%',
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 23,
  },
  kpiValueUnanswered: {
    color: '#C97A2B',
  },
  kpiLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 15,
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
    lineHeight: 17,
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
    lineHeight: 18,
  },
  categoryBarValue: {
    fontSize: 11.5,
    fontWeight: '800',
    flexShrink: 0,
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
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 19,
    marginBottom: 10,
    marginTop: 4,
  },
  calendarTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarTriggerCardHighlight: {
    backgroundColor: '#FFFDF8',
    borderColor: '#EBD3AA',
  },
  calendarTriggerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calendarTriggerBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  calendarTriggerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  calendarTriggerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 20,
    flexShrink: 1,
  },
  calendarUnansweredPill: {
    backgroundColor: '#FDF3E7',
    borderWidth: 1,
    borderColor: '#EED4AE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  calendarUnansweredPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#9E6B24',
    lineHeight: 15,
  },
  calendarDonePill: {
    backgroundColor: '#E8F4EC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  calendarDonePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#3B6347',
    lineHeight: 15,
  },
  calendarTriggerSub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    lineHeight: 18,
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
    gap: 6,
    marginBottom: 5,
  },
  premiumGuideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  premiumGuideTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#8C5A1B',
    lineHeight: 19,
  },
  premiumGuideText: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 19,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '100%',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    lineHeight: 16,
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
    lineHeight: 15,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 22,
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
    lineHeight: 16,
    marginBottom: 4,
  },
  timeBlockLabelCurrent: {
    color: COLORS.primaryDark,
  },
  answersRow: {
    gap: 3,
  },
  userAnswerText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
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
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 2,
  },
  singleSub: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 17,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 20,
  },
});
