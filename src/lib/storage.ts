import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  HAS_SEEN_TUTORIAL: 'couple_swipe:has_seen_tutorial',
  DISPLAY_NAME: 'couple_swipe:display_name',
} as const;

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
