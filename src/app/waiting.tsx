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
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';

export default function WaitingScreen() {
  const {
    partnerName,
    myName,
    dayStatus,
    isPartnerCompleted,
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

  // 相手の回答状況を定期ポーリング（5秒間隔）
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
    ? '回答完了'
    : dayStatus.partnerAnsweredCount > 0
      ? `${dayStatus.partnerAnsweredCount} / ${dayStatus.totalQuestions} 問回答中`
      : '回答待ち';

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
            ? '二人の回答が揃いました'
            : `${partnerName} さんの回答待ちです`}
        </Text>
        <Text style={styles.statusDesc}>
          {isPartnerCompleted
            ? 'お互いの回答と今日の一致率が公開されました。結果を確認しましょう。'
            : '2人とも回答を終えるまで、お互いの答えを見ることはできません。'}
        </Text>
      </View>

      <View style={[styles.statusCard, SHADOWS.card]}>
        <Text style={styles.cardHeaderTitle}>回答状況</Text>

        <View style={styles.userStatusRow}>
          <View style={styles.userCol}>
            <View style={styles.badgeDone}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.userName}>{myName} (あなた)</Text>
            <Text style={styles.userStatusDone}>回答済み</Text>
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
            <Text style={styles.userName}>{partnerName}</Text>
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
          <Text style={styles.resultButtonText}>結果画面へ進む</Text>
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
          <Text style={styles.refreshButtonText}>最新の状況を確認する</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.backHomeBtn}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.backHomeText}>ホーム画面に戻る</Text>
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
  },
  statusTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  statusDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
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
  },
  userStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  userCol: {
    alignItems: 'center',
    flex: 1,
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
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  userStatusDone: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A7C59',
  },
  userStatusPending: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8D8179',
  },
  resultButton: {
    width: '100%',
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 18,
    gap: 8,
    marginBottom: 20,
    ...SHADOWS.cardSmall,
  },
  resultButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  refreshButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
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
  },
  backHomeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backHomeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
