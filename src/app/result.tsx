import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { AnswerCalendarModal } from '../components/AnswerCalendarModal';
import { COLORS, SHADOWS } from '../constants/theme';
import { evaluateMatch } from '../constants/questions';
import { getCurrentLocale } from '../i18n';
import { formatIsoShortDate } from '../i18n/format';
import { APP_DISPLAY_NAME, APP_SHORT_NAME } from '../lib/links';
import { showAlert } from '../lib/alert';
import { DayQuizData, Question, SwipeDirection } from '../types';

export default function ResultScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const rawDate = Array.isArray(dateParam) ? dateParam[0] : dateParam;

  const {
    isSupabaseReady,
    hasPair,
    todayDate,
    pairStartDate,
    isPartnerCompleted,
    isMyCompleted,
    isPairPremium,
    partnerName,
    myName,
    matchSummary,
    historyDays,
    calendarDays,
    pairStats,
    loadDayQuizData,
    fetchHistory,
  } = useApp();

  const isPastResult = Boolean(
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate !== todayDate
  );
  const targetDate = isPastResult ? rawDate! : todayDate;
  const shortTargetDate = formatIsoShortDate(targetDate, locale);

  const [pastData, setPastData] = useState<DayQuizData | null>(null);
  const [loadingPast, setLoadingPast] = useState(isPastResult);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  const getOverallMatchComment = (percentage: number, hasAnyBoth: boolean): string => {
    if (!hasAnyBoth) return t('result.comments.noBoth');
    if (percentage === 100) return t('result.comments.perfect');
    if (percentage >= 67) return t('result.comments.high');
    if (percentage >= 34) return t('result.comments.mid');
    return t('result.comments.low');
  };

  const getConversationStarter = (q: Question): string => {
    switch (q.categoryKey) {
      case 'lifestyle':
        return t('result.starters.lifestyle');
      case 'holidays':
        return t('result.starters.holidays');
      case 'travel':
        return t('result.starters.travel');
      case 'anniversary':
        return t('result.starters.anniversary');
      case 'communication':
        return t('result.starters.communication');
      case 'food':
        return t('result.starters.food');
      case 'money_future':
        return t('result.starters.money_future');
      case 'affection':
        return t('result.starters.affection');
      case 'relationship':
        return t('result.starters.relationship');
      default:
        return t('result.starters.default');
    }
  };

  const handleOpenCalendar = () => {
    if (isSupabaseReady && hasPair) {
      void fetchHistory();
    }
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

  const handleOpenResultFromCalendar = (dateStr: string, isToday: boolean) => {
    setIsCalendarVisible(false);
    if (dateStr === targetDate) return;
    if (isToday) {
      router.replace('/result');
    } else {
      router.push({ pathname: '/result', params: { date: dateStr } });
    }
  };

  const handleOpenWaitingFromCalendar = () => {
    setIsCalendarVisible(false);
    router.push('/waiting');
  };

  const handleOpenPremiumFromCalendar = () => {
    setIsCalendarVisible(false);
    router.push({ pathname: '/ai-report', params: { focus: 'plans' } });
  };

  useEffect(() => {
    if (isPastResult) return;
    if (!isMyCompleted || !isPartnerCompleted) {
      router.replace('/waiting');
    }
  }, [isPastResult, isMyCompleted, isPartnerCompleted]);

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

  const overallComment = getOverallMatchComment(
    effectiveSummary.percentage,
    effectiveSummary.total > 0
  );
  const isPerfectMatch =
    effectiveSummary.total > 0 && effectiveSummary.matchedCount === effectiveSummary.total;

  const handleShareText = async () => {
    const streakLine =
      !isPastResult && pairStats.currentStreak > 0
        ? `\n${t('result.share.textStreak', { count: pairStats.currentStreak })}`
        : '';
    const message =
      `${t('result.share.textHeader', { brand: APP_DISPLAY_NAME, date: shortTargetDate })}\n` +
      `${t('result.share.textRate', {
        me: myName,
        partner: partnerName,
        percentage: effectiveSummary.percentage,
        matched: effectiveSummary.matchedCount,
        total: effectiveSummary.total,
      })}` +
      `${streakLine}\n` +
      `${overallComment}\n` +
      `${t('result.share.textHashtags', { brand: APP_SHORT_NAME })}`;

    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        showAlert(t('result.share.copiedTitle'), t('result.share.copiedBody'));
        return;
      }
      await Share.share({ message });
    } catch {
      showAlert(t('result.share.errorTitle'), t('result.share.errorBody'));
    }
  };

  const getDirectionBadge = (dir?: SwipeDirection) => {
    if (!dir) return { color: '#B5AAA3', icon: 'help' as const };
    switch (dir) {
      case 'UP':
        return { color: COLORS.directions.UP.color, icon: 'arrow-up' as const };
      case 'DOWN':
        return { color: COLORS.directions.DOWN.color, icon: 'arrow-down' as const };
      case 'LEFT':
        return { color: COLORS.directions.LEFT.color, icon: 'arrow-back' as const };
      case 'RIGHT':
        return { color: COLORS.directions.RIGHT.color, icon: 'arrow-forward' as const };
    }
  };

  const screenTitle = isPastResult
    ? t('nav.resultPast', { date: shortTargetDate })
    : t('nav.result');

  if (isPastResult && loadingPast) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: screenTitle }} />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>{t('result.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen options={{ title: screenTitle }} />

      {/* 一致率メインサークル */}
      <View style={[styles.rateCard, SHADOWS.card]}>
        <Text style={styles.rateSubtitle}>
          {isPastResult
            ? t('result.rateSubtitlePast', { date: shortTargetDate })
            : t('result.rateSubtitleToday')}
        </Text>
        <View style={styles.percentageCircle}>
          <Text style={styles.percentageText}>{effectiveSummary.percentage}%</Text>
          <Text
            style={styles.matchedFractionText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {t('result.matchedFraction', {
              matched: effectiveSummary.matchedCount,
              total: effectiveSummary.total,
            })}
          </Text>
        </View>
        <Text style={styles.overallCommentText}>{overallComment}</Text>
        {isPastResult && effectiveSummary.total < effectiveSummary.details.length ? (
          <Text style={styles.partialNoteText}>
            {t('result.partialNote', { count: effectiveSummary.total })}
          </Text>
        ) : null}

        {effectiveSummary.total > 0 && (
          <TouchableOpacity
            style={styles.shareTriggerBtn}
            activeOpacity={0.8}
            onPress={() => setIsShareModalVisible(true)}
          >
            <Ionicons name="share-social-outline" size={16} color={COLORS.primaryDark} />
            <Text style={styles.shareTriggerBtnText}>{t('result.shareTrigger')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 全問一致時の会話きっかけバナー */}
      {isPerfectMatch && (
        <View style={styles.perfectTalkBanner}>
          <Ionicons name="sparkles" size={16} color="#4A7C59" />
          <Text style={styles.perfectTalkText}>{t('result.perfectBanner')}</Text>
        </View>
      )}

      {/* 質問ごとの回答対比一覧 */}
      <View style={styles.sectionHeader}>
        <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{t('result.breakdownTitle')}</Text>
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
                    numberOfLines={1}
                  >
                    {!hasBoth
                      ? t('result.badgeSingle')
                      : item.isMatched
                        ? t('result.badgeMatched')
                        : t('result.badgeDiff')}
                  </Text>
                </View>
              </View>

              <View style={styles.answersCompareBox}>
                <View style={styles.answerRow}>
                  <View style={styles.userTag}>
                    <Text style={styles.userTagText} numberOfLines={1} ellipsizeMode="tail">
                      {t('common.youSuffix', { name: myName })}
                    </Text>
                  </View>
                  <View style={styles.answerContent}>
                    <View style={[styles.dirIconBox, { backgroundColor: myBadge.color }]}>
                      <Ionicons name={myBadge.icon} size={13} color="#FFFFFF" />
                    </View>
                    <Text style={styles.answerText}>
                      {item.myAnswer ? item.question.choices[item.myAnswer] : t('common.unanswered')}
                    </Text>
                  </View>
                </View>

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
                        : t('common.unanswered')}
                    </Text>
                  </View>
                </View>
              </View>

              {hasBoth && !item.isMatched && (
                <View style={styles.talkStarterBox}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primaryDark} />
                  <View style={styles.talkStarterTextCol}>
                    <Text style={styles.talkStarterLabel}>{t('result.talkStarterLabel')}</Text>
                    <Text style={styles.talkStarterText}>
                      {getConversationStarter(item.question)}
                    </Text>
                  </View>
                </View>
              )}

              {history && (
                <View style={styles.historyCompareContainer}>
                  <View style={styles.historyHeader}>
                    <Ionicons name="git-compare-outline" size={13} color={COLORS.primaryDark} />
                    <Text style={styles.historyHeaderText}>
                      {t('result.historyCompareHeader', { date: history.date })}
                    </Text>
                  </View>
                  <View style={styles.historyBox}>
                    <Text style={styles.historyAnswerText}>
                      <Text style={styles.historyLabelInline}>
                        {t('result.historyPrevLabel')}:{' '}
                      </Text>
                      {t('result.historyPairLine', {
                        me: myName,
                        myChoice: history.myAnswer
                          ? item.question.choices[history.myAnswer]
                          : t('common.unanswered'),
                        partner: partnerName,
                        partnerChoice: history.partnerAnswer
                          ? item.question.choices[history.partnerAnswer]
                          : t('common.unanswered'),
                      })}
                    </Text>
                    <Text style={[styles.historyAnswerText, styles.historyAnswerTextCurrent]}>
                      <Text style={styles.historyLabelInline}>
                        {t('result.historyCurrLabel')}:{' '}
                      </Text>
                      {t('result.historyPairLine', {
                        me: myName,
                        myChoice: item.myAnswer
                          ? item.question.choices[item.myAnswer]
                          : t('common.unanswered'),
                        partner: partnerName,
                        partnerChoice: item.partnerAnswer
                          ? item.question.choices[item.partnerAnswer]
                          : t('common.unanswered'),
                      })}
                    </Text>
                    {history.note && <Text style={styles.historyNoteText}>{history.note}</Text>}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* 過去の未回答日がある場合 */}
      {!isPastResult && pairStats.myPastUnansweredDays > 0 && (
        <View style={[styles.catchUpBanner, SHADOWS.cardSmall]}>
          <View style={styles.catchUpHeader}>
            <Ionicons
              name={isPairPremium ? 'calendar' : 'diamond'}
              size={15}
              color="#9E6B24"
            />
            <Text style={styles.catchUpTitle}>
              {t('result.catchUp.title', { count: pairStats.myPastUnansweredDays })}
            </Text>
          </View>
          <Text style={styles.catchUpText}>
            {isPairPremium
              ? t('result.catchUp.descPremium')
              : pairStats.pastPartnerAnsweredUnansweredDays > 0
                ? t('result.catchUp.descFreePartnerAnswered', {
                    count: pairStats.pastPartnerAnsweredUnansweredDays,
                    partnerName,
                  })
                : t('result.catchUp.descFree')}
          </Text>
          {isPairPremium ? (
            <TouchableOpacity
              style={styles.catchUpPrimaryBtn}
              activeOpacity={0.85}
              onPress={handleOpenCalendar}
            >
              <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
              <Text style={styles.catchUpBtnText}>{t('result.catchUp.ctaPremium')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.catchUpActionsRow}>
              <TouchableOpacity
                style={styles.catchUpOutlineBtn}
                activeOpacity={0.8}
                onPress={handleOpenCalendar}
              >
                <Text style={styles.catchUpOutlineBtnText} numberOfLines={2}>
                  {t('result.catchUp.ctaCalendar')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.catchUpPremiumBtn}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/ai-report', params: { focus: 'plans' } })
                }
              >
                <Ionicons name="diamond" size={14} color="#FFFFFF" />
                <Text style={styles.catchUpBtnText} numberOfLines={2}>
                  {t('result.catchUp.ctaUpgrade')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isPastResult && (
        <TouchableOpacity
          style={styles.historyBackButton}
          activeOpacity={0.8}
          onPress={() => router.replace('/history')}
        >
          <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
          <Text style={styles.historyBackButtonText}>{t('result.backToHistory')}</Text>
        </TouchableOpacity>
      )}

      {/* 関連機能導線 */}
      <View style={styles.subtleLinksRow}>
        <TouchableOpacity
          style={styles.subtleLinkBtn}
          activeOpacity={0.75}
          onPress={() => router.push('/ai-report')}
        >
          <Ionicons name="sparkles-outline" size={15} color={COLORS.primaryDark} />
          <Text style={styles.subtleLinkBtnText} numberOfLines={2}>
            {t('result.linkAiReport')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.subtleLinkBtn}
          activeOpacity={0.75}
          onPress={handleOpenCalendar}
        >
          <Ionicons name="calendar-outline" size={15} color={COLORS.primaryDark} />
          <Text style={styles.subtleLinkBtnText} numberOfLines={2}>
            {t('result.linkCalendar')}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.homeButton}
        activeOpacity={0.8}
        onPress={() => router.replace('/')}
      >
        <Ionicons name="home-outline" size={17} color={COLORS.text} />
        <Text style={styles.homeButtonText}>{t('result.backHome')}</Text>
      </TouchableOpacity>

      {/* シェア用「一致率カード」モーダル */}
      <Modal
        visible={isShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShareModalVisible(false)}
      >
        <View style={styles.shareModalOverlay}>
          <Pressable
            style={styles.shareModalBackdrop}
            onPress={() => setIsShareModalVisible(false)}
          />
          <View style={styles.shareModalSheet}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={[styles.shareCard, SHADOWS.darkCardFloating]}>
                <View style={styles.shareCardAccent} />
                <View style={styles.shareCardBody}>
                  <View style={styles.shareCardTopRow}>
                    <View style={styles.shareBrandPill}>
                      <Ionicons name="heart" size={11} color={COLORS.secondary} />
                      <Text style={styles.shareBrandText}>{APP_SHORT_NAME}</Text>
                    </View>
                    <Text style={styles.shareDateText}>{shortTargetDate}</Text>
                  </View>

                  <Text style={styles.sharePairNames} numberOfLines={1}>
                    {myName}  ♥  {partnerName}
                  </Text>

                  <View style={styles.shareRing}>
                    <Text
                      style={styles.shareRingLabel}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {t('result.share.ringLabel')}
                    </Text>
                    <Text style={styles.shareRingPercent}>{effectiveSummary.percentage}%</Text>
                    <Text
                      style={styles.shareRingSub}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {t('result.matchedFraction', {
                        matched: effectiveSummary.matchedCount,
                        total: effectiveSummary.total,
                      })}
                    </Text>
                  </View>

                  {!isPastResult && pairStats.currentStreak > 0 && (
                    <View style={styles.shareStreakChip}>
                      <Ionicons name="flame" size={13} color={COLORS.secondary} />
                      <Text style={styles.shareStreakText}>
                        {t('result.share.streak', { count: pairStats.currentStreak })}
                      </Text>
                    </View>
                  )}

                  <Text style={styles.shareCardComment}>{overallComment}</Text>
                  <Text style={styles.shareCardFooterTag}>
                    {t('result.share.footerTag', { brand: APP_SHORT_NAME })}
                  </Text>
                </View>
              </View>

              <Text style={styles.sharePrivacyHint}>{t('result.share.privacyHint')}</Text>

              <TouchableOpacity
                style={styles.shareActionBtn}
                activeOpacity={0.85}
                onPress={() => void handleShareText()}
              >
                <Ionicons name="paper-plane-outline" size={17} color="#FFFFFF" />
                <Text style={styles.shareActionBtnText}>{t('result.share.actionBtn')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareCloseBtn}
                activeOpacity={0.75}
                onPress={() => setIsShareModalVisible(false)}
              >
                <Text style={styles.shareCloseBtnText}>{t('common.close')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
        onOpenResult={handleOpenResultFromCalendar}
        onOpenWaiting={handleOpenWaitingFromCalendar}
        onOpenPremium={handleOpenPremiumFromCalendar}
      />
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
    lineHeight: 20,
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
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  percentageCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: COLORS.surface,
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  percentageText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  matchedFractionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: -2,
    textAlign: 'center',
    lineHeight: 17,
  },
  overallCommentText: {
    marginTop: 14,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  partialNoteText: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  shareTriggerBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
  },
  shareTriggerBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 18,
  },
  perfectTalkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F7F4',
    borderWidth: 1,
    borderColor: '#C8E2D1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  perfectTalkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6347',
    lineHeight: 19,
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
    lineHeight: 22,
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
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  qNumBox: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
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
    minWidth: 0,
    lineHeight: 20,
  },
  matchBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
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
    lineHeight: 15,
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 68,
    maxWidth: 122,
    flexShrink: 0,
    alignItems: 'center',
  },
  userTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    lineHeight: 16,
  },
  answerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  dirIconBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  answerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    lineHeight: 19,
  },
  talkStarterBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF9F4',
    borderWidth: 1,
    borderColor: '#F3DFD0',
    borderRadius: 12,
    padding: 10,
  },
  talkStarterTextCol: {
    flex: 1,
    gap: 2,
  },
  talkStarterLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 16,
  },
  talkStarterText: {
    fontSize: 11.5,
    color: COLORS.text,
    lineHeight: 19,
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
    flex: 1,
    lineHeight: 16,
  },
  historyBox: {
    backgroundColor: '#FAF5EF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE0D2',
    gap: 5,
  },
  historyLabelInline: {
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  historyAnswerText: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  historyAnswerTextCurrent: {
    fontWeight: '700',
    color: COLORS.text,
  },
  historyNoteText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  historyBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 6,
    marginBottom: 10,
  },
  historyBackButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 20,
  },
  subtleLinksRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  subtleLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  subtleLinkBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  homeButton: {
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
  homeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 20,
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(24, 18, 15, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  shareModalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  shareModalSheet: {
    width: '100%',
    maxWidth: 368,
    maxHeight: '90%',
    backgroundColor: COLORS.background,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shareCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.darkCardBorder,
    marginBottom: 12,
  },
  shareCardAccent: {
    height: 5,
    backgroundColor: COLORS.primary,
  },
  shareCardBody: {
    padding: 20,
    alignItems: 'center',
  },
  shareCardTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  shareBrandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  shareBrandText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },
  shareDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
  },
  sharePairNames: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.darkCardText,
    marginBottom: 16,
  },
  shareRing: {
    width: 146,
    height: 146,
    borderRadius: 73,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  shareRingLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
    lineHeight: 15,
  },
  shareRingPercent: {
    fontSize: 38,
    fontWeight: '900',
    color: COLORS.secondary,
    letterSpacing: -1,
    marginVertical: -2,
  },
  shareRingSub: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.darkCardText,
    textAlign: 'center',
    lineHeight: 16,
  },
  shareStreakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(217, 117, 89, 0.2)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  shareStreakText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.secondary,
    lineHeight: 17,
  },
  shareCardComment: {
    fontSize: 12,
    color: COLORS.darkCardText,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  shareCardFooterTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  sharePrivacyHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 15,
    marginBottom: 8,
  },
  shareActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
  },
  shareCloseBtn: {
    alignItems: 'center',
    paddingVertical: 9,
  },
  shareCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 19,
  },
  catchUpBanner: {
    backgroundColor: '#FFFBF3',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EED9B7',
  },
  catchUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  catchUpTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#8C5A1B',
    lineHeight: 19,
  },
  catchUpText: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 19,
    marginBottom: 11,
  },
  catchUpActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catchUpOutlineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4C796',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  catchUpOutlineBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#8C5A1B',
    textAlign: 'center',
    lineHeight: 16,
  },
  catchUpPremiumBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#C87D28',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  catchUpPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  catchUpBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 16,
  },
});
