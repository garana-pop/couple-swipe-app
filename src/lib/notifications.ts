import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';
import i18n from '../i18n';
import { supabase } from './supabase';
import {
  DailyReminderSettings,
  getDailyReminderSettings,
  setDailyReminderSettings,
} from './storage';

const DAILY_CHANNEL_ID = 'daily-reminder';
const PARTNER_CHANNEL_ID = 'partner-activity';

let handlerConfigured = false;

export type PushRegistrationStatus =
  | 'registered'
  | 'web_unsupported'
  | 'simulator_unsupported'
  | 'expo_go_unsupported'
  | 'missing_project_id'
  | 'permission_denied'
  | 'error';

export interface PushRegistrationResult {
  status: PushRegistrationStatus;
  token: string | null;
  message?: string;
}

/**
 * フォアグラウンド時の通知表示設定（ネイティブのみ）
 */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web' || handlerConfigured) return;
  handlerConfigured = true;

  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android 用通知チャンネルを作成・更新（ローカル通知・相手回答プッシュ通知で分離）
 */
export async function ensureNotificationChannels(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    await setNotificationChannelAsync(DAILY_CHANNEL_ID, {
      name: i18n.t('notifications.channels.dailyName'),
      description: i18n.t('notifications.channels.dailyDesc'),
      importance: AndroidImportance.DEFAULT,
    });

    await setNotificationChannelAsync(PARTNER_CHANNEL_ID, {
      name: i18n.t('notifications.channels.partnerName'),
      description: i18n.t('notifications.channels.partnerDesc'),
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });

    return true;
  } catch (err) {
    console.warn(
      '[Notifications] setNotificationChannelAsync failed, falling back to default channel:',
      err
    );
    return false;
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const existing = await getPermissionsAsync();
  if (existing.status === 'granted') return true;

  const requested = await requestPermissionsAsync();
  return requested.status === 'granted';
}

/**
 * 7-1: 毎日のローカル通知を現在の表示言語で予約する
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number
): Promise<{ ok: boolean; settings?: DailyReminderSettings; error?: string }> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      error: i18n.t('notifications.webUnsupported'),
    };
  }

  configureNotificationHandler();
  const channelReady = await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return {
      ok: false,
      error: i18n.t('notifications.permissionNeeded'),
    };
  }

  const prev = await getDailyReminderSettings();
  if (prev.notificationId) {
    try {
      await cancelScheduledNotificationAsync(prev.notificationId);
    } catch {
      // 既にキャンセル済み・期限切れの場合は無視
    }
  }

  try {
    const notificationId = await scheduleNotificationAsync({
      content: {
        title: i18n.t('notifications.dailyTitle'),
        body: i18n.t('notifications.dailyBody'),
        sound: true,
        data: { screen: 'home', type: 'daily_reminder' },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        ...(Platform.OS === 'android' && channelReady ? { channelId: DAILY_CHANNEL_ID } : {}),
      },
    });

    const nextSettings: DailyReminderSettings = {
      enabled: true,
      hour,
      minute,
      notificationId,
    };
    await setDailyReminderSettings(nextSettings);

    return { ok: true, settings: nextSettings };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: i18n.t('notifications.scheduleFailed', { detail }),
    };
  }
}

/**
 * OS 言語切替時に、通知チャンネル名と予約済みデイリー通知の文言を新しい言語へ更新する
 */
export async function refreshNotificationsForLocale(): Promise<void> {
  if (Platform.OS === 'web') return;
  await ensureNotificationChannels();
  const current = await getDailyReminderSettings();
  if (current.enabled) {
    const perm = await getPermissionsAsync();
    if (perm.status === 'granted') {
      await scheduleDailyReminder(current.hour, current.minute);
    }
  }
}

/**
 * 7-1: 毎日のローカル通知をキャンセルする
 */
export async function cancelDailyReminder(): Promise<DailyReminderSettings> {
  const prev = await getDailyReminderSettings();
  if (Platform.OS !== 'web' && prev.notificationId) {
    try {
      await cancelScheduledNotificationAsync(prev.notificationId);
    } catch {
      // 無視
    }
  }

  const nextSettings: DailyReminderSettings = {
    ...prev,
    enabled: false,
    notificationId: null,
  };
  await setDailyReminderSettings(nextSettings);
  return nextSettings;
}

/**
 * 7-1: 実機でローカル通知を3秒後にテスト送信する
 */
export async function sendTestLocalNotification(): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, error: i18n.t('notifications.testWebUnsupported') };
  }

  configureNotificationHandler();
  const channelReady = await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return { ok: false, error: i18n.t('notifications.testPermissionNeeded') };
  }

  try {
    await scheduleNotificationAsync({
      content: {
        title: i18n.t('notifications.testTitle'),
        body: i18n.t('notifications.testBody'),
        sound: true,
        data: { screen: 'home', type: 'test_reminder' },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
        ...(Platform.OS === 'android' && channelReady ? { channelId: DAILY_CHANNEL_ID } : {}),
      },
    });

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: i18n.t('notifications.testScheduleFailed', { detail }) };
  }
}

function getEasProjectId(): string | null {
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromEasConfig ?? fromExtra ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null;
}

/**
 * 7-2: Expo Push Token を取得して Supabase profiles.expo_push_token に保存する
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { status: 'web_unsupported', token: null };
  }

  if (!Device.isDevice) {
    return {
      status: 'simulator_unsupported',
      token: null,
      message: i18n.t('notifications.simulatorUnsupported'),
    };
  }

  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  if (isExpoGo && Platform.OS === 'android') {
    return {
      status: 'expo_go_unsupported',
      token: null,
      message: i18n.t('notifications.expoGoAndroidUnsupported'),
    };
  }

  configureNotificationHandler();
  await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return {
      status: 'permission_denied',
      token: null,
      message: i18n.t('notifications.pushPermissionDenied'),
    };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    return {
      status: 'missing_project_id',
      token: null,
      message: i18n.t('notifications.missingProjectId'),
    };
  }

  try {
    const tokenRes = await getExpoPushTokenAsync({ projectId });
    const token = tokenRes.data;

    if (supabase && token) {
      await supabase.rpc('upsert_push_token', {
        p_expo_push_token: token,
      });
    }

    return { status: 'registered', token };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      token: null,
      message: i18n.t('notifications.pushRegisterFailed', { detail }),
    };
  }
}

/**
 * 7-2: 自分の全問回答完了時にパートナーへプッシュ通知を送る Edge Function を呼び出す
 */
export async function notifyPartnerAnswered(quizDate: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke('notify-partner-answered', {
      body: { quizDate },
    });
  } catch {
    // 通知失敗は回答体験を阻害しないようサイレントに無視
  }
}
