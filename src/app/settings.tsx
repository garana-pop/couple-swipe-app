import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { showAlert, showConfirm } from '../lib/alert';
import { sendTestLocalNotification } from '../lib/notifications';

const TIME_PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: '08:00', hour: 8, minute: 0 },
  { label: '12:00', hour: 12, minute: 0 },
  { label: '19:00', hour: 19, minute: 0 },
  { label: '21:00', hour: 21, minute: 0 },
  { label: '22:00', hour: 22, minute: 0 },
];

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function SettingsScreen() {
  const {
    isSupabaseReady,
    hasPair,
    accountAuth,
    dailyReminder,
    pushStatus,
    enableDailyReminder,
    disableDailyReminder,
    registerPushNotifications,
    linkGoogle,
    signInWithGoogle,
  } = useApp();

  const [reminderBusy, setReminderBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const handleToggleReminder = async (nextValue: boolean) => {
    setReminderBusy(true);
    try {
      if (nextValue) {
        const res = await enableDailyReminder(dailyReminder.hour, dailyReminder.minute);
        if (!res.ok) {
          showAlert('通知設定エラー', res.error ?? 'リマインダーの設定に失敗しました。');
        } else {
          showAlert(
            'リマインダーを設定しました',
            `毎日 ${formatTime(dailyReminder.hour, dailyReminder.minute)} に「今日の3問が届きました」と通知します。`
          );
        }
      } else {
        await disableDailyReminder();
      }
    } finally {
      setReminderBusy(false);
    }
  };

  const handleChangeTime = async (hour: number, minute: number) => {
    setReminderBusy(true);
    try {
      const res = await enableDailyReminder(hour, minute);
      if (!res.ok) {
        showAlert('通知設定エラー', res.error ?? '時刻の更新に失敗しました。');
      }
    } finally {
      setReminderBusy(false);
    }
  };

  const handleStepTime = (deltaMinutes: number) => {
    const totalMinutes = (dailyReminder.hour * 60 + dailyReminder.minute + deltaMinutes + 1440) % 1440;
    const nextHour = Math.floor(totalMinutes / 60);
    const nextMinute = totalMinutes % 60;
    void handleChangeTime(nextHour, nextMinute);
  };

  const handleTestLocalNotification = async () => {
    setReminderBusy(true);
    try {
      const res = await sendTestLocalNotification();
      if (res.ok) {
        showAlert('テスト通知を予約しました', '約3秒後に通知が届きます。');
      } else {
        showAlert('テスト通知エラー', res.error ?? '通知の送信に失敗しました。');
      }
    } finally {
      setReminderBusy(false);
    }
  };

  const handleRegisterPush = async () => {
    setPushBusy(true);
    try {
      const res = await registerPushNotifications();
      if (res.status === 'registered') {
        showAlert('プッシュ通知を有効にしました', 'パートナーが回答を完了するとお知らせが届きます。');
      } else {
        showAlert(
          'プッシュ通知の状態',
          res.message ?? '現在の環境ではリモートプッシュ通知を登録できませんでした。'
        );
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleLinkGoogle = async () => {
    setAuthBusy(true);
    try {
      const res = await linkGoogle();
      if (res.cancelled || res.redirecting) return;
      if (res.ok) {
        showAlert(
          'Google アカウントと連携しました',
          '現在のペアと回答履歴が保護されました。機種変更しても同じ Google アカウントで引き継げます。'
        );
      } else {
        showAlert('連携エラー', res.error ?? 'Google アカウントの連携に失敗しました。');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignInWithGoogle = () => {
    const runSignIn = async () => {
      setAuthBusy(true);
      try {
        const res = await signInWithGoogle();
        if (res.cancelled || res.redirecting) return;
        if (res.ok) {
          showAlert('データを復元しました', 'Google アカウントに紐づくペアと履歴を読み込みました。');
          router.replace('/');
        } else {
          showAlert('ログインエラー', res.error ?? 'Google ログインに失敗しました。');
        }
      } finally {
        setAuthBusy(false);
      }
    };

    if (hasPair && accountAuth.isAnonymous) {
      showConfirm(
        '既存アカウントで復元しますか？',
        'この端末には未連携のペアがあります。別の Google アカウントでログインすると表示が切り替わります。現在のデータを残したい場合は、先に「Google と連携してデータを保護」を押してください。',
        '復元ログインへ進む',
        runSignIn
      );
      return;
    }

    void runSignIn();
  };

  const renderPushStatusText = () => {
    if (!pushStatus) return '未確認';
    switch (pushStatus.status) {
      case 'registered':
        return '登録済み（パートナーの回答時に通知が届きます）';
      case 'expo_go_unsupported':
        return 'Expo Go (Android) ではリモートプッシュ非対応です（EAS 開発ビルドで自動有効化）';
      case 'missing_project_id':
        return 'EAS プロジェクト未設定（eas init 後に有効化）';
      case 'web_unsupported':
        return 'Web ブラウザではプッシュ通知を利用できません';
      case 'simulator_unsupported':
        return 'シミュレータ／エミュレータでは利用できません（実機のみ）';
      case 'permission_denied':
        return '通知が拒否されています（端末の設定から許可してください）';
      default:
        return pushStatus.message ?? '未登録';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ================================================================
          7-1: 毎日のローカル通知（「今日の質問が届きました」）
         ================================================================ */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#FDF1EC' }]}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardTitle}>毎日の質問リマインダー</Text>
              <Text style={styles.cardSubtitle}>端末ローカル通知（サーバー不要）</Text>
            </View>
          </View>
          <Switch
            value={dailyReminder.enabled}
            onValueChange={handleToggleReminder}
            disabled={reminderBusy || Platform.OS === 'web'}
            trackColor={{ false: COLORS.border, true: '#E6A08A' }}
            thumbColor={dailyReminder.enabled ? COLORS.primary : '#FFFFFF'}
          />
        </View>

        <Text style={styles.descText}>
          毎日決まった時刻に「今日の3問が届きました」と端末からお知らせします。
        </Text>

        {/* 時刻設定エリア */}
        <View style={styles.timeBox}>
          <Text style={styles.timeBoxLabel}>通知する時刻</Text>
          <View style={styles.timeStepperRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              disabled={reminderBusy || Platform.OS === 'web'}
              onPress={() => handleStepTime(-30)}
            >
              <Ionicons name="remove" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>
            <Text style={styles.timeValue}>
              {formatTime(dailyReminder.hour, dailyReminder.minute)}
            </Text>
            <TouchableOpacity
              style={styles.stepBtn}
              disabled={reminderBusy || Platform.OS === 'web'}
              onPress={() => handleStepTime(30)}
            >
              <Ionicons name="add" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>
          </View>

          <View style={styles.presetRow}>
            {TIME_PRESETS.map((preset) => {
              const selected =
                dailyReminder.hour === preset.hour && dailyReminder.minute === preset.minute;
              return (
                <TouchableOpacity
                  key={preset.label}
                  style={[styles.presetChip, selected && styles.presetChipActive]}
                  disabled={reminderBusy || Platform.OS === 'web'}
                  onPress={() => void handleChangeTime(preset.hour, preset.minute)}
                >
                  <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={styles.secondaryBtn}
          disabled={reminderBusy || Platform.OS === 'web'}
          onPress={handleTestLocalNotification}
        >
          {reminderBusy ? (
            <ActivityIndicator size="small" color={COLORS.primaryDark} />
          ) : (
            <Ionicons name="paper-plane-outline" size={16} color={COLORS.primaryDark} />
          )}
          <Text style={styles.secondaryBtnText}>テスト通知を3秒後に試す</Text>
        </TouchableOpacity>
      </View>

      {/* ================================================================
          7-2: 「相手が回答した」プッシュ通知
         ================================================================ */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconBox, { backgroundColor: '#F0F5F9' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#4D779E" />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.cardTitle}>パートナーの回答通知</Text>
            <Text style={styles.cardSubtitle}>Expo Push ＋ Supabase Edge Function</Text>
          </View>
        </View>

        <Text style={styles.descText}>
          パートナーが今日の3問に回答し終えたタイミング（または2人揃って結果がひらいたタイミング）でプッシュ通知をお届けします。
        </Text>

        <View style={styles.statusBox}>
          <Ionicons
            name={pushStatus?.status === 'registered' ? 'checkmark-circle' : 'information-circle-outline'}
            size={16}
            color={pushStatus?.status === 'registered' ? '#4A7C59' : COLORS.textMuted}
          />
          <Text style={styles.statusBoxText}>{renderPushStatusText()}</Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryBtn}
          disabled={pushBusy || !isSupabaseReady || Platform.OS === 'web'}
          onPress={handleRegisterPush}
        >
          {pushBusy ? (
            <ActivityIndicator size="small" color={COLORS.primaryDark} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={COLORS.primaryDark} />
          )}
          <Text style={styles.secondaryBtnText}>プッシュ通知トークンを登録・更新</Text>
        </TouchableOpacity>
      </View>

      {/* ================================================================
          7-3: アカウント保護・機種変更引き継ぎ（Google ログイン昇格）
         ================================================================ */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#F2F7F4' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#4A7C59" />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardTitle}>アカウント保護・機種変更</Text>
              <Text style={styles.cardSubtitle}>Google アカウント連携（linkIdentity）</Text>
            </View>
          </View>
          <View
            style={[
              styles.authBadge,
              accountAuth.isAnonymous ? styles.authBadgeAnon : styles.authBadgeLinked,
            ]}
          >
            <Text
              style={[
                styles.authBadgeText,
                accountAuth.isAnonymous ? styles.authBadgeTextAnon : styles.authBadgeTextLinked,
              ]}
            >
              {accountAuth.isAnonymous ? '未連携' : '連携済み'}
            </Text>
          </View>
        </View>

        {!accountAuth.isAnonymous ? (
          <View style={styles.linkedInfoBox}>
            <Ionicons name="logo-google" size={18} color="#4A7C59" />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkedTitle}>Google アカウント連携済み</Text>
              {accountAuth.email ? (
                <Text style={styles.linkedEmail}>{accountAuth.email}</Text>
              ) : null}
              <Text style={styles.linkedHint}>
                機種変更やアプリ再インストール時も、同じ Google アカウントで復元ログインするとペアと履歴を引き継げます。
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.descText}>
              現在は匿名アカウントで利用中です。Google アカウントと連携しておくと、ペア情報や過去の回答履歴をそのまま保持したまま機種変更できます。
            </Text>

            <TouchableOpacity
              style={styles.googlePrimaryBtn}
              activeOpacity={0.85}
              disabled={authBusy || !isSupabaseReady}
              onPress={handleLinkGoogle}
            >
              {authBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={17} color="#FFFFFF" />
                  <Text style={styles.googlePrimaryBtnText}>
                    Google と連携してデータを保護する
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.googleSecondaryBtn}
              activeOpacity={0.8}
              disabled={authBusy || !isSupabaseReady}
              onPress={handleSignInWithGoogle}
            >
              <Ionicons name="log-in-outline" size={17} color={COLORS.primaryDark} />
              <Text style={styles.googleSecondaryBtnText}>
                機種変更後のデータ復元（Google ログイン）
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.8}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={16} color={COLORS.text} />
        <Text style={styles.backButtonText}>ホームへ戻る</Text>
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
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginBottom: 8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTexts: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  descText: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  timeBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  timeStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 12,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeValue: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1,
    minWidth: 92,
    textAlign: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  presetChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusBoxText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 17,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  authBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  authBadgeAnon: {
    backgroundColor: '#FDF3E7',
  },
  authBadgeLinked: {
    backgroundColor: '#F0F6F2',
  },
  authBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  authBadgeTextAnon: {
    color: '#C97A2B',
  },
  authBadgeTextLinked: {
    color: '#4A7C59',
  },
  linkedInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F2F7F4',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C8E2D1',
  },
  linkedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3B6347',
    marginBottom: 2,
  },
  linkedEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  linkedHint: {
    fontSize: 11.5,
    color: '#4A7C59',
    lineHeight: 17,
  },
  googlePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  googlePrimaryBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  googleSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
  },
  googleSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
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
