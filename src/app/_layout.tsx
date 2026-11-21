import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppContextProvider } from '../context/AppContext';
import { COLORS } from '../constants/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppContextProvider>
        <StatusBar style="dark" />
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
              title: 'ふたりスワイプ',
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
        </Stack>
      </AppContextProvider>
    </SafeAreaProvider>
  );
}
