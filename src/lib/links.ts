import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import i18n, { getCurrentLocale } from '../i18n';
import type { SupportedLocale } from '../i18n/locale';
import { showAlert } from './alert';

export const APP_DISPLAY_NAME = 'Kotaeai';
export const APP_SHORT_NAME = 'Kotaeai';

const BASE_LEGAL_ORIGIN = 'https://garana-pop.github.io/couple-swipe-app';

export const STORE_SUBSCRIPTION_URLS = {
  android: 'https://play.google.com/store/account/subscriptions',
  ios: 'https://apps.apple.com/account/subscriptions',
} as const;

export function getStoreSubscriptionsUrl(): string {
  return Platform.OS === 'ios' ? STORE_SUBSCRIPTION_URLS.ios : STORE_SUBSCRIPTION_URLS.android;
}

export function getStoreName(): string {
  return Platform.OS === 'ios'
    ? i18n.t('common.storeNameIos')
    : i18n.t('common.storeNameAndroid');
}

export function getLegalUrls(locale: SupportedLocale = getCurrentLocale()) {
  const prefix = locale === 'ja' ? BASE_LEGAL_ORIGIN : `${BASE_LEGAL_ORIGIN}/en`;
  return {
    privacyPolicy: `${prefix}/privacy.html`,
    termsOfService: `${prefix}/terms.html`,
    accountDeletion: `${prefix}/account-deletion.html`,
    subscriptions: getStoreSubscriptionsUrl(),
    googlePlaySubscriptions: STORE_SUBSCRIPTION_URLS.android,
  };
}

export const LEGAL_URLS = {
  privacyPolicy: `${BASE_LEGAL_ORIGIN}/privacy.html`,
  termsOfService: `${BASE_LEGAL_ORIGIN}/terms.html`,
  accountDeletion: `${BASE_LEGAL_ORIGIN}/account-deletion.html`,
  googlePlaySubscriptions: STORE_SUBSCRIPTION_URLS.android,
} as const;

export async function openExternalLink(url: string, label: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    if (
      url.startsWith('https://play.google.com/') ||
      url.startsWith('https://apps.apple.com/')
    ) {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    showAlert(
      i18n.t('links.openErrorTitle'),
      i18n.t('links.openErrorBody', { label, url })
    );
  }
}
