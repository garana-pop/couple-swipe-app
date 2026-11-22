import AsyncStorage from '@react-native-async-storage/async-storage';
import { RemoteQuestionRecord } from '../types';

const KEYS = {
  HAS_SEEN_TUTORIAL: 'couple_swipe:has_seen_tutorial',
  DISPLAY_NAME: 'couple_swipe:display_name',
  EXTRA_QUESTIONS: 'couple_swipe:extra_questions_v1',
  EXTRA_QUESTIONS_SYNC: 'couple_swipe:extra_questions_sync_v1',
  DAILY_REMINDER: 'couple_swipe:daily_reminder_v1',
} as const;

export interface DailyReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
  notificationId: string | null;
}

export const DEFAULT_DAILY_REMINDER: DailyReminderSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
  notificationId: null,
};

export interface ExtraQuestionsSyncState {
  serverCursor: string | null; // Supabase サーバーから受け取った最新 server_time / updatedAt
  lastCheckedAt: number; // 端末で最後に同期チェックした Unix ms
}

export async function getHasSeenTutorial(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.HAS_SEEN_TUTORIAL);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenTutorialStorage(seen: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.HAS_SEEN_TUTORIAL, seen ? 'true' : 'false');
  } catch {
    // ストレージ保存失敗時は無視
  }
}

export async function getCachedDisplayName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.DISPLAY_NAME);
  } catch {
    return null;
  }
}

export async function setCachedDisplayName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.DISPLAY_NAME, name);
  } catch {
    // ストレージ保存失敗時は無視
  }
}

export async function getCachedExtraQuestions(): Promise<RemoteQuestionRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.EXTRA_QUESTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RemoteQuestionRecord[]) : [];
  } catch {
    return [];
  }
}

export async function setCachedExtraQuestions(records: RemoteQuestionRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.EXTRA_QUESTIONS, JSON.stringify(records));
  } catch {
    // ストレージ保存失敗時は無視
  }
}

export async function getExtraQuestionsSyncState(): Promise<ExtraQuestionsSyncState> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.EXTRA_QUESTIONS_SYNC);
    if (!raw) return { serverCursor: null, lastCheckedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<ExtraQuestionsSyncState>;
    return {
      serverCursor: typeof parsed.serverCursor === 'string' ? parsed.serverCursor : null,
      lastCheckedAt: typeof parsed.lastCheckedAt === 'number' ? parsed.lastCheckedAt : 0,
    };
  } catch {
    return { serverCursor: null, lastCheckedAt: 0 };
  }
}

export async function setExtraQuestionsSyncState(state: ExtraQuestionsSyncState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.EXTRA_QUESTIONS_SYNC, JSON.stringify(state));
  } catch {
    // ストレージ保存失敗時は無視
  }
}

export async function getDailyReminderSettings(): Promise<DailyReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.DAILY_REMINDER);
    if (!raw) return DEFAULT_DAILY_REMINDER;
    const parsed = JSON.parse(raw) as Partial<DailyReminderSettings>;
    const hour = typeof parsed.hour === 'number' && parsed.hour >= 0 && parsed.hour <= 23 ? parsed.hour : 21;
    const minute =
      typeof parsed.minute === 'number' && parsed.minute >= 0 && parsed.minute <= 59 ? parsed.minute : 0;
    return {
      enabled: Boolean(parsed.enabled),
      hour,
      minute,
      notificationId: typeof parsed.notificationId === 'string' ? parsed.notificationId : null,
    };
  } catch {
    return DEFAULT_DAILY_REMINDER;
  }
}

export async function setDailyReminderSettings(settings: DailyReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.DAILY_REMINDER, JSON.stringify(settings));
  } catch {
    // ストレージ保存失敗時は無視
  }
}
