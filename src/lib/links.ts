import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { showAlert } from './alert';

export const APP_DISPLAY_NAME = 'Kotaeai';
export const APP_SHORT_NAME = 'Kotaeai';

export const LEGAL_URLS = {
  privacyPolicy: 'https://garana-pop.github.io/couple-swipe-app/privacy.html',
  termsOfService: 'https://garana-pop.github.io/couple-swipe-app/terms.html',
  accountDeletion: 'https://garana-pop.github.io/couple-swipe-app/account-deletion.html',
  googlePlaySubscriptions: 'https://play.google.com/store/account/subscriptions',
} as const;

export async function openExternalLink(url: string, label: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    if (url.startsWith('https://play.google.com/')) {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    showAlert('リンクを開けませんでした', `${label}のページを開けませんでした。\n${url}`);
  }
}
