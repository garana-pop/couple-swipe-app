import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useSyncDeviceLocale } from '../i18n';
import { AppContextProvider } from '../context/AppContext';
import { COLORS } from '../constants/theme';

export default function RootLayout() {
  useSyncDeviceLocale();
  const { t } = useTranslation();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'result') {
        router.push('/result');
      } else if (screen === 'quiz') {
        router.push('/quiz');
      } else if (screen === 'waiting') {
        router.push('/waiting');
      } else if (screen === 'history') {
        router.push('/history');
      } else {
        router.replace('/');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const stack = (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: COLORS.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('nav.home'),
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="quiz"
        options={{
          title: t('nav.quiz'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="waiting"
        options={{
          title: t('nav.waiting'),
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="result"
        options={{
          title: t('nav.result'),
          headerBackTitle: t('common.home'),
        }}
      />
      <Stack.Screen
        name="ai-report"
        options={{
          title: t('nav.aiReport'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="history"
        options={{
          title: t('nav.history'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="auth/callback"
        options={{
          title: t('nav.authCallback'),
          headerShown: false,
        }}
      />
    </Stack>
  );

  return (
    <SafeAreaProvider>
      <AppContextProvider>
        <StatusBar style="dark" />
        {Platform.OS === 'web' ? (
          <View style={styles.webOuter}>
            <View style={styles.webPhoneFrame}>{stack}</View>
          </View>
        ) : (
          stack
        )}
      </AppContextProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    backgroundColor: '#E8E0D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webPhoneFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
});
