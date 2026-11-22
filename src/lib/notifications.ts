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
 * Android 用通知チャンネルを作成（ローカル通知・相手回答プッシュ通知で分離）
 * - sound を省略することで Android 標準のデフォルト通知音＆AudioAttributes が使われる
 * - Expo Go の一部 Android 環境でチャンネル作成が失敗した場合でもローカル通知自体は動かせるよう boolean を返す
 */
export async function ensureNotificationChannels(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    await setNotificationChannelAsync(DAILY_CHANNEL_ID, {
      name: '今日の質問リマインダー',
      description: '毎日決まった時刻に「今日の質問が届きました」をお知らせします。',
      importance: AndroidImportance.DEFAULT,
    });

    await setNotificationChannelAsync(PARTNER_CHANNEL_ID, {
      name: 'パートナーの回答通知',
      description: 'パートナーが今日の質問に回答したときにお知らせします。',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });

    return true;
  } catch (err) {
    console.warn('[Notifications] setNotificationChannelAsync failed, falling back to default channel:', err);
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
 * 7-1: 毎日のローカル通知（「今日の質問が届きました」）を予約する
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number
): Promise<{ ok: boolean; settings?: DailyReminderSettings; error?: string }> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      error: 'ローカル通知は Android / iOS アプリで利用できます（Web ブラウザでは利用できません）。',
    };
  }

  configureNotificationHandler();
  const channelReady = await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return {
      ok: false,
      error: '通知の許可が必要です。端末のアプリ設定から通知を許可してください。',
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
        title: '今日の3問が届きました',
        body: 'パートナーとの価値観スワイプ、今日も30秒で答えてみましょう！',
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
      error: `リマインダーの予約に失敗しました（${detail}）。`,
    };
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
 * 7-1: 実機（Expo Go でも動作）でローカル通知を3秒後にテスト送信する
 */
export async function sendTestLocalNotification(): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'テスト通知は Android / iOS 端末でお試しください。' };
  }

  configureNotificationHandler();
  const channelReady = await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return { ok: false, error: '通知の許可が必要です。端末設定から許可してください。' };
  }

  try {
    await scheduleNotificationAsync({
      content: {
        title: '【テスト】今日の3問が届きました',
        body: '毎日設定した時刻にこのようにリマインダー通知が届きます。',
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
    return { ok: false, error: `テスト通知の予約に失敗しました（${detail}）。` };
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
 * - Expo Go (Android SDK 53+) ではリモートプッシュ非対応のためエラーにせず案内ステータスを返す
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { status: 'web_unsupported', token: null };
  }

  if (!Device.isDevice) {
    return {
      status: 'simulator_unsupported',
      token: null,
      message: 'プッシュ通知は実機でのみ登録できます。',
    };
  }

  // Expo Go（storeClient）の Android は SDK 53 以降リモートプッシュ非対応
  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  if (isExpoGo && Platform.OS === 'android') {
    return {
      status: 'expo_go_unsupported',
      token: null,
      message: 'Expo Go (Android) ではリモートプッシュ非対応のため、開発ビルド導入後に自動で有効になります。',
    };
  }

  configureNotificationHandler();
  await ensureNotificationChannels();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    return {
      status: 'permission_denied',
      token: null,
      message: '通知が許可されていません。端末の設定から許可してください。',
    };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    return {
      status: 'missing_project_id',
      token: null,
      message: 'EAS プロジェクト未紐付けです（eas init 後に自動でプッシュ登録されます）。',
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
      message: `プッシュ通知の登録に失敗しました（${detail}）。`,
    };
  }
}

/**
 * 7-2: 自分の全問回答完了時にパートナーへプッシュ通知を送る Edge Function を呼び出す
 * - サーバー側で完了検証＆重複防止を行うため、失敗してもアプリ進行には影響させない
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
