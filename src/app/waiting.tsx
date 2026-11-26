import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';

export default function WaitingScreen() {
  const { t } = useTranslation();
  const {
    partnerName,
    myName,
    dayStatus,
    isPartnerCompleted,
    isPairPremium,
    pairStats,
    isSupabaseReady,
    refreshDayStatus,
  } = useApp();

  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    if (!isSupabaseReady || isPartnerCompleted) return;

    void refreshDayStatus();
    const timer = setInterval(() => {
      void refreshDayStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, [isSupabaseReady, isPartnerCompleted, refreshDayStatus]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDayStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const partnerProgressText = isPartnerCompleted
    ? t('waiting.progressDone')
    : dayStatus.partnerAnsweredCount > 0
      ? t('waiting.progressAnswering', {
          answered: dayStatus.partnerAnsweredCount,
          total: dayStatus.totalQuestions,
        })
      : t('waiting.progressPending');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.lockIconContainer}>
        <Animated.View
          style={[
            styles.lockCircle,
            isPartnerCompleted ? styles.unlockedCircle : styles.lockedCircle,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Ionicons
            name={isPartnerCompleted ? 'lock-open' : 'lock-closed'}
            size={48}
            color="#FFFFFF"
          />
        </Animated.View>
      </View>

      <View style={styles.textSection}>
        <Text style={styles.statusTitle}>
          {isPartnerCompleted
            ? t('waiting.titleBothDone')
            : t('waiting.titleWaiting', { partnerName })}
        </Text>
        <Text style={styles.statusDesc}>
          {isPartnerCompleted ? t('waiting.descBothDone') : t('waiting.descWaiting')}
        </Text>
      </View>

      <View style={[styles.statusCard, SHADOWS.card]}>
        <Text style={styles.cardHeaderTitle}>{t('waiting.statusCardTitle')}</Text>

        <View style={styles.userStatusRow}>
          <View style={styles.userCol}>
            <View style={styles.badgeDone}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.userName} numberOfLines={2}>
              {t('common.youSuffix', { name: myName })}
            </Text>
            <Text style={styles.userStatusDone}>{t('waiting.myStatusDone')}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.userCol}>
            <View
              style={[
                isPartnerCompleted ? styles.badgeDone : styles.badgePending,
              ]}
            >
              <Ionicons
                name={isPartnerCompleted ? 'checkmark' : 'time-outline'}
                size={16}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.userName} numberOfLines={2}>
              {partnerName}
            </Text>
            <Text
              style={
                isPartnerCompleted ? styles.userStatusDone : styles.userStatusPending
              }
            >
              {partnerProgressText}
            </Text>
          </View>
        </View>
      </View>

      {isPartnerCompleted ? (
        <TouchableOpacity
          style={styles.resultButton}
          activeOpacity={0.8}
          onPress={() => router.replace('/result')}
        >
          <Text style={styles.resultButtonText}>{t('waiting.goToResult')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.refreshButton}
          activeOpacity={0.7}
          onPress={handleManualRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={17} color={COLORS.primary} />
          )}
          <Text style={styles.refreshButtonText}>{t('waiting.refreshBtn')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.premiumHintCard}
        activeOpacity={0.85}
        onPress={() =>
          isPairPremium && pairStats.myPastUnansweredDays > 0
            ? router.push({ pathname: '/history', params: { openCalendar: '1' } })
            : router.push({ pathname: '/ai-report', params: { focus: 'plans' } })
        }
      >
        <View style={styles.premiumHintHeader}>
          <Ionicons
            name={isPairPremium && pairStats.myPastUnansweredDays > 0 ? 'calendar-outline' : 'diamond-outline'}
            size={14}
            color="#8C5A1B"
          />
          <Text style={styles.premiumHintTitle}>
            {pairStats.myPastUnansweredDays > 0
              ? isPairPremium
                ? t('waiting.premiumHint.titlePremiumHasPast', {
                    count: pairStats.myPastUnansweredDays,
                  })
                : t('waiting.premiumHint.titleFreeHasPast', {
                    count: pairStats.myPastUnansweredDays,
                  })
              : t('waiting.premiumHint.titleDefault')}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#8C5A1B" />
        </View>
        <Text style={styles.premiumHintText}>
          {pairStats.myPastUnansweredDays > 0 && isPairPremium
            ? t('waiting.premiumHint.descPremiumHasPast')
            : pairStats.pastPartnerAnsweredUnansweredDays > 0 && !isPairPremium
              ? t('waiting.premiumHint.descFreePartnerAnswered', {
                  count: pairStats.pastPartnerAnsweredUnansweredDays,
                  partnerName,
                })
              : t('waiting.premiumHint.descDefault')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backHomeBtn}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.backHomeText}>{t('waiting.backHome')}</Text>
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
    padding: 24,
    alignItems: 'center',
    paddingBottom: 40,
  },
  lockIconContainer: {
    marginTop: 18,
    marginBottom: 20,
  },
  lockCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.cardFloating,
  },
  lockedCircle: {
    backgroundColor: COLORS.primary,
  },
  unlockedCircle: {
    backgroundColor: '#4A7C59',
  },
  textSection: {
    alignItems: 'center',
    marginBottom: 22,
    width: '100%',
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
  },
  statusDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 10,
  },
  statusCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 14,
    textAlign: 'center',
    lineHeight: 19,
  },
  userStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  userCol: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: COLORS.border,
  },
  badgeDone: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4A7C59',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgePending: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B5AAA3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  userName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 4,
  },
  userStatusDone: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A7C59',
    textAlign: 'center',
    lineHeight: 18,
  },
  userStatusPending: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8D8179',
    textAlign: 'center',
    lineHeight: 18,
  },
  resultButton: {
    width: '100%',
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 18,
    gap: 8,
    marginBottom: 20,
    ...SHADOWS.cardSmall,
  },
  resultButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 21,
  },
  refreshButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    gap: 8,
    marginBottom: 16,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 20,
  },
  premiumHintCard: {
    width: '100%',
    backgroundColor: '#FFFBF3',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#EED9B7',
    marginBottom: 14,
  },
  premiumHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  premiumHintTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#8C5A1B',
    lineHeight: 18,
  },
  premiumHintText: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 19,
  },
  backHomeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backHomeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    lineHeight: 19,
  },
});
