import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../context/AppContext';
import { SwipeCard } from '../components/SwipeCard';
import { SwipeDirection } from '../types';
import { COLORS } from '../constants/theme';

export default function QuizScreen() {
  const { questions, myAnswers, submitAnswer, isPartnerCompleted } = useApp();

  // 途中まで回答済みの場合、最初の未回答質問から再開
  const initialIndex = Math.max(
    0,
    questions.findIndex((q) => !myAnswers[q.id])
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (questions.length > 0 && questions.every((q) => !!myAnswers[q.id])) {
      router.replace(isPartnerCompleted ? '/result' : '/waiting');
    }
  }, [questions, myAnswers, isPartnerCompleted]);

  const currentQuestion = questions[currentIndex];
  const total = questions.length;

  const handleSwipeAnswer = async (direction: SwipeDirection) => {
    if (!currentQuestion) return;

    await submitAnswer(currentQuestion.id, direction);

    if (currentIndex + 1 < total) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      router.replace(isPartnerCompleted ? '/result' : '/waiting');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${total > 0 ? ((currentIndex + 1) / total) * 100 : 0}%` },
              ]}
            />
          </View>
          <View style={styles.stepInfoRow}>
            <Text style={styles.stepText}>
              第 {currentIndex + 1} 問 / 全 {total} 問
            </Text>
          </View>
        </View>

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
