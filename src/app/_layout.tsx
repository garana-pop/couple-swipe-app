import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppContextProvider } from '../context/AppContext';
import { COLORS } from '../constants/theme';

export default function RootLayout() {
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
          fontSize: 18,
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
          title: 'Kotaeai',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="quiz"
        options={{
          title: '今日の質問',
          headerBackTitle: '戻る',
        }}
      />
      <Stack.Screen
        name="waiting"
        options={{
          title: '回答待機中',
          headerBackVisible: false, // 完了後は勝手に戻らないよう
        }}
      />
      <Stack.Screen
        name="result"
        options={{
          title: '診断結果',
          headerBackTitle: 'ホーム',
        }}
      />
      <Stack.Screen
        name="ai-report"
        options={{
          title: 'AI相性レポート',
          headerBackTitle: '戻る',
        }}
      />
      <Stack.Screen
        name="history"
        options={{
          title: '過去の回答比較',
          headerBackTitle: '戻る',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: '通知・アカウント設定',
          headerBackTitle: '戻る',
        }}
      />
      <Stack.Screen
        name="auth/callback"
        options={{
          title: '認証中',
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
    backgroundColor: '#E9E0D6',
    alignItems: 'center',
  },
  webPhoneFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
});
