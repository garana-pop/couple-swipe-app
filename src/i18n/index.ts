import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useLocales } from 'expo-localization';
import i18n, { changeLanguage, use as registerI18nPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  SupportedLocale,
  getDeviceAppLocale,
  isSupportedLocale,
  resolveLocaleFromList,
} from './locale';

import jaCommon from './locales/ja/common.json';
import jaQuestions from './locales/ja/questions.json';
import enCommon from './locales/en/common.json';
import enQuestions from './locales/en/questions.json';
import frCommon from './locales/fr/common.json';
import frQuestions from './locales/fr/questions.json';
import koCommon from './locales/ko/common.json';
import koQuestions from './locales/ko/questions.json';
import ruCommon from './locales/ru/common.json';
import ruQuestions from './locales/ru/questions.json';
import thCommon from './locales/th/common.json';
import thQuestions from './locales/th/questions.json';
import zhHansCommon from './locales/zh-Hans/common.json';
import zhHansQuestions from './locales/zh-Hans/questions.json';
import zhHantCommon from './locales/zh-Hant/common.json';
import zhHantQuestions from './locales/zh-Hant/questions.json';

export const resources = {
  ja: { common: jaCommon, questions: jaQuestions },
  en: { common: enCommon, questions: enQuestions },
  fr: { common: frCommon, questions: frQuestions },
  ko: { common: koCommon, questions: koQuestions },
  ru: { common: ruCommon, questions: ruQuestions },
  th: { common: thCommon, questions: thQuestions },
  'zh-Hans': { common: zhHansCommon, questions: zhHansQuestions },
  'zh-Hant': { common: zhHantCommon, questions: zhHantQuestions },
} as const;

const initialLocale = getDeviceAppLocale();

if (!i18n.isInitialized) {
  void registerI18nPlugin(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'common',
    ns: ['common', 'questions'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    initAsync: false,
  });
}

export function getCurrentLocale(): SupportedLocale {
  const current = i18n.resolvedLanguage || i18n.language;
  if (isSupportedLocale(current)) return current;
  return getDeviceAppLocale();
}

/**
 * OS の言語設定・アプリ別言語設定の変更を監視し、自動で i18next を追従させる
 * （Android のバックグラウンド復帰時も含めて追従）
 */
export function useSyncDeviceLocale(onLocaleChanged?: (next: SupportedLocale) => void): SupportedLocale {
  const locales = useLocales();
  const resolved = resolveLocaleFromList(locales);

  useEffect(() => {
    if (i18n.language !== resolved) {
      void changeLanguage(resolved);
      onLocaleChanged?.(resolved);
    }
  }, [resolved, onLocaleChanged]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const latest = getDeviceAppLocale();
      if (i18n.language !== latest) {
        void changeLanguage(latest);
        onLocaleChanged?.(latest);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [onLocaleChanged]);

  return resolved;
}

export default i18n;
