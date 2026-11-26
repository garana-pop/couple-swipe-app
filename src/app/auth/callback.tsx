import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { completeAuthFromUrl } from '../../lib/auth';
import { COLORS } from '../../constants/theme';

/**
 * OAuth リダイレクト（couple-swipe-app://auth/callback）で開かれた場合の受け口画面
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const url = Linking.useLinkingURL();

  useEffect(() => {
    let active = true;
    async function finalize() {
      if (url && (url.includes('code=') || url.includes('access_token='))) {
        await completeAuthFromUrl(url);
      }
      if (active) {
        router.replace('/settings');
      }
    }
    void finalize();
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.text}>{t('authCallback.completing')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
});
