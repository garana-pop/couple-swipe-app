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
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentLocale } from '../i18n';
import { formatTimeHHMM } from '../i18n/format';
import { showAlert, showConfirm } from '../lib/alert';
import { getLegalUrls, getStoreName, openExternalLink } from '../lib/links';
import { sendTestLocalNotification } from '../lib/notifications';

const TIME_PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: '08:00', hour: 8, minute: 0 },
  { label: '12:00', hour: 12, minute: 0 },
  { label: '19:00', hour: 19, minute: 0 },
  { label: '21:00', hour: 21, minute: 0 },
  { label: '22:00', hour: 22, minute: 0 },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const legalUrls = getLegalUrls(locale);
  const storeName = getStoreName();

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
          showAlert(
            t('settings.reminder.errorTitle'),
            res.error ?? t('settings.reminder.enableFailed')
          );
        } else {
          showAlert(
            t('settings.reminder.enabledTitle'),
            t('settings.reminder.enabledBody', {
              time: formatTimeHHMM(dailyReminder.hour, dailyReminder.minute),
            })
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
        showAlert(
          t('settings.reminder.errorTitle'),
          res.error ?? t('settings.reminder.timeUpdateFailed')
        );
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
        showAlert(t('settings.reminder.testScheduledTitle'), t('settings.reminder.testScheduledBody'));
      } else {
        showAlert(
          t('settings.reminder.testErrorTitle'),
          res.error ?? t('settings.reminder.testErrorBody')
        );
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
        showAlert(t('settings.push.enabledTitle'), t('settings.push.enabledBody'));
      } else {
        showAlert(
          t('settings.push.statusAlertTitle'),
          res.message ?? t('settings.push.statusAlertFallback')
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
        showAlert(t('settings.account.linkedAlertTitle'), t('settings.account.linkedAlertBody'));
      } else {
        showAlert(
          t('settings.account.linkErrorTitle'),
          res.error ?? t('settings.account.linkErrorBody')
        );
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
          showAlert(t('settings.account.restoredTitle'), t('settings.account.restoredBody'));
          router.replace('/');
        } else {
          showAlert(
            t('settings.account.loginErrorTitle'),
            res.error ?? t('settings.account.loginErrorBody')
          );
        }
      } finally {
        setAuthBusy(false);
      }
    };

    if (hasPair && accountAuth.isAnonymous) {
      showConfirm(
        t('settings.account.restoreConfirmTitle'),
        t('settings.account.restoreConfirmBody'),
        t('settings.account.restoreConfirmAction'),
        runSignIn
      );
      return;
    }

    void runSignIn();
  };

  const renderPushStatusText = () => {
    if (!pushStatus) return t('settings.push.statusUnchecked');
    switch (pushStatus.status) {
      case 'registered':
        return t('settings.push.statusRegistered');
      case 'expo_go_unsupported':
        return t('settings.push.statusExpoGo');
      case 'missing_project_id':
        return t('settings.push.statusMissingProject');
      case 'web_unsupported':
        return t('settings.push.statusWeb');
      case 'simulator_unsupported':
        return t('settings.push.statusSimulator');
      case 'permission_denied':
        return t('settings.push.statusDenied');
      default:
        return pushStatus.message ?? t('settings.push.statusUnregistered');
    }
  };

  const subscriptionsLabel =
    Platform.OS === 'ios' ? t('links.subscriptionsIos') : t('links.subscriptionsAndroid');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 毎日のローカル通知 */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#FDF1EC' }]}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardTitle}>{t('settings.reminder.title')}</Text>
              <Text style={styles.cardSubtitle}>{t('settings.reminder.subtitle')}</Text>
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

        <Text style={styles.descText}>{t('settings.reminder.desc')}</Text>

        <View style={styles.timeBox}>
          <Text style={styles.timeBoxLabel}>{t('settings.reminder.timeLabel')}</Text>
          <View style={styles.timeStepperRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              disabled={reminderBusy || Platform.OS === 'web'}
              onPress={() => handleStepTime(-30)}
            >
              <Ionicons name="remove" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>
            <Text style={styles.timeValue}>
              {formatTimeHHMM(dailyReminder.hour, dailyReminder.minute)}
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
          <Text style={styles.secondaryBtnText}>{t('settings.reminder.testBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* パートナー回答プッシュ通知 */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconBox, { backgroundColor: '#F0F5F9' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#4D779E" />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.cardTitle}>{t('settings.push.title')}</Text>
            <Text style={styles.cardSubtitle}>{t('settings.push.subtitle')}</Text>
          </View>
        </View>

        <Text style={styles.descText}>{t('settings.push.desc')}</Text>

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
          <Text style={styles.secondaryBtnText}>{t('settings.push.registerBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* アカウント保護・機種変更引き継ぎ */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconBox, { backgroundColor: '#F2F7F4' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#4A7C59" />
            </View>
            <View style={styles.cardHeaderTexts}>
              <Text style={styles.cardTitle}>{t('settings.account.title')}</Text>
              <Text style={styles.cardSubtitle}>{t('settings.account.subtitle')}</Text>
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
              numberOfLines={1}
            >
              {accountAuth.isAnonymous
                ? t('settings.account.badgeAnon')
                : t('settings.account.badgeLinked')}
            </Text>
          </View>
        </View>

        {!accountAuth.isAnonymous ? (
          <View style={styles.linkedInfoBox}>
            <Ionicons name="logo-google" size={18} color="#4A7C59" />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkedTitle}>{t('settings.account.linkedTitle')}</Text>
              {accountAuth.email ? (
                <Text style={styles.linkedEmail}>{accountAuth.email}</Text>
              ) : null}
              <Text style={styles.linkedHint}>{t('settings.account.linkedHint')}</Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.descText}>{t('settings.account.anonDesc')}</Text>

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
                  <Text style={styles.googlePrimaryBtnText}>{t('settings.account.linkBtn')}</Text>
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
                {t('settings.account.restoreBtn')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 規約・プライバシーポリシー・解約案内 */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.iconBox, { backgroundColor: '#F5EFE8' }]}>
            <Ionicons name="document-text-outline" size={20} color={COLORS.primaryDark} />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.cardTitle}>{t('settings.legal.title')}</Text>
            <Text style={styles.cardSubtitle}>{t('settings.legal.subtitle')}</Text>
          </View>
        </View>

        <View style={styles.legalLinksList}>
          <TouchableOpacity
            style={styles.legalRow}
            activeOpacity={0.75}
            onPress={() =>
              void openExternalLink(legalUrls.privacyPolicy, t('links.privacyPolicy'))
            }
          >
            <View style={styles.legalRowLeft}>
              <Ionicons name="shield-outline" size={17} color={COLORS.primaryDark} />
              <Text style={styles.legalRowText}>{t('settings.legal.privacy')}</Text>
            </View>
            <Ionicons name="open-outline" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.legalRow}
            activeOpacity={0.75}
            onPress={() =>
              void openExternalLink(legalUrls.termsOfService, t('links.termsOfService'))
            }
          >
            <View style={styles.legalRowLeft}>
              <Ionicons name="reader-outline" size={17} color={COLORS.primaryDark} />
              <Text style={styles.legalRowText}>{t('settings.legal.terms')}</Text>
            </View>
            <Ionicons name="open-outline" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.legalRow}
            activeOpacity={0.75}
            onPress={() => void openExternalLink(legalUrls.subscriptions, subscriptionsLabel)}
          >
            <View style={styles.legalRowLeft}>
              <Ionicons name="card-outline" size={17} color={COLORS.primaryDark} />
              <Text style={styles.legalRowText}>
                {t('settings.legal.subscriptions', { storeName })}
              </Text>
            </View>
            <Ionicons name="open-outline" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.legalRow, styles.legalRowLast]}
            activeOpacity={0.75}
            onPress={() =>
              void openExternalLink(legalUrls.accountDeletion, t('links.accountDeletion'))
            }
          >
            <View style={styles.legalRowLeft}>
              <Ionicons name="person-remove-outline" size={17} color={COLORS.primaryDark} />
              <Text style={styles.legalRowText}>{t('settings.legal.accountDeletion')}</Text>
            </View>
            <Ionicons name="open-outline" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.8}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={16} color={COLORS.text} />
        <Text style={styles.backButtonText}>{t('common.backHome')}</Text>
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
    minWidth: 0,
    marginBottom: 8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardHeaderTexts: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 21,
  },
  cardSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
    lineHeight: 16,
  },
  descText: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    lineHeight: 20,
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
    lineHeight: 16,
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
    lineHeight: 19,
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
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
  },
  authBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
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
    lineHeight: 16,
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
    lineHeight: 19,
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
    lineHeight: 19,
  },
  googlePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  googlePrimaryBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
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
    paddingHorizontal: 14,
  },
  googleSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
  },
  legalLinksList: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legalRowLast: {
    borderBottomWidth: 0,
  },
  legalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  legalRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 19,
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
