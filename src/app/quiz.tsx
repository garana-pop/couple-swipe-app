import React, { useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../context/AppContext';
import { SwipeCard } from '../components/SwipeCard';
import { SwipeDirection } from '../types';
import { COLORS } from '../constants/theme';

export default function QuizScreen() {
  const { questions, submitAnswer, isPartnerCompleted } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentQuestion = questions[currentIndex];
  const total = questions.length;

  const handleSwipeAnswer = (direction: SwipeDirection) => {
    // 回答を保存
    submitAnswer(currentQuestion.id, direction);

    // 次の質問へ進むか、全問完了判定
    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // 3問すべて回答完了
      if (!isPartnerCompleted) {
        router.replace('/waiting');
      } else {
        router.replace('/result');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* シンプルで温かみのあるプログレスバー */}
        <View style={styles.header}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${((currentIndex + 1) / total) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.stepInfoRow}>
            <Text style={styles.stepText}>
              第 {currentIndex + 1} 問 / 全 {total} 問
            </Text>
          </View>
        </View>

        {/* 4択スワイプエリア */}
        <View style={styles.cardArea}>
          {currentQuestion && (
            <SwipeCard
              key={currentQuestion.id}
              question={currentQuestion}
              questionIndex={currentIndex}
              totalQuestions={total}
              onSwipe={handleSwipeAnswer}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#EDE5DC',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  stepInfoRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  cardArea: {
    flex: 1,
  },
});
