import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  Dimensions,
  LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Question, SwipeDirection } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// カードと左右スロットの寸法バランス（重ならず綺麗に見える設計）
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.64, 245);
const CARD_HEIGHT = 240;
const SIDE_SLOT_WIDTH = Math.max((SCREEN_WIDTH - CARD_WIDTH) / 2 - 12, 60);

const VERTICAL_OVERLAP_MIN = 12;
const HORIZONTAL_OVERLAP_MIN = 20;
const OFFSCREEN_MARGIN_X = 35;
const OFFSCREEN_MARGIN_Y = 20;

function getOverlappingDirection(
  cardRect: LayoutRectangle,
  slotLayouts: Partial<Record<SwipeDirection, LayoutRectangle>>
): SwipeDirection | null {
  const cardLeft = cardRect.x;
  const cardRight = cardRect.x + cardRect.width;
  const cardTop = cardRect.y;
  const cardBottom = cardRect.y + cardRect.height;

  let bestDir: SwipeDirection | null = null;
  let bestArea = 0;

  const directions: SwipeDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  for (const dir of directions) {
    const slot = slotLayouts[dir];
    if (!slot) continue;

    const overlapX = Math.max(0, Math.min(cardRight, slot.x + slot.width) - Math.max(cardLeft, slot.x));
    const overlapY = Math.max(0, Math.min(cardBottom, slot.y + slot.height) - Math.max(cardTop, slot.y));

    if (overlapX <= 0 || overlapY <= 0) continue;

    const meetsThreshold =
      dir === 'UP' || dir === 'DOWN'
        ? overlapY >= VERTICAL_OVERLAP_MIN
        : overlapX >= HORIZONTAL_OVERLAP_MIN;

    if (!meetsThreshold) continue;

    const area = overlapX * overlapY;
    if (area > bestArea) {
      bestArea = area;
      bestDir = dir;
    }
  }

  return bestDir;
}

interface SwipeCardProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  onSwipe: (direction: SwipeDirection) => void;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({
  question,
  questionIndex,
  totalQuestions,
  onSwipe,
}) => {
  // Animated インスタンス
  const [pan] = useState(() => new Animated.ValueXY());
  const [activeDirection, setActiveDirection] = useState<SwipeDirection | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const [slotLayouts, setSlotLayouts] = useState<Partial<Record<SwipeDirection, LayoutRectangle>>>({});
  const [cardRestLayout, setCardRestLayout] = useState<LayoutRectangle | null>(null);
  const [stageLayout, setStageLayout] = useState<LayoutRectangle | null>(null);

  // カードが答えのエリア（スロット）に重なっているかを判定
  const getOverlapForGesture = useCallback(
    (dx: number, dy: number): SwipeDirection | null => {
      if (!cardRestLayout) return null;

      return getOverlappingDirection(
        {
          x: cardRestLayout.x + dx,
          y: cardRestLayout.y + dy,
          width: cardRestLayout.width,
          height: cardRestLayout.height,
        },
        slotLayouts
      );
    },
    [cardRestLayout, slotLayouts]
  );

  // カードが画面外までスワイプされたかを判定
  const getOffscreenSwipeDirection = useCallback(
    (dx: number, dy: number): SwipeDirection | null => {
      if (!cardRestLayout || !stageLayout) return null;

      const cardLeft = cardRestLayout.x + dx;
      const cardRight = cardLeft + cardRestLayout.width;
      const cardTop = cardRestLayout.y + dy;
      const cardBottom = cardTop + cardRestLayout.height;

      if (Math.abs(dx) >= Math.abs(dy)) {
        if (cardLeft < -OFFSCREEN_MARGIN_X) return 'LEFT';
        if (cardRight > stageLayout.width + OFFSCREEN_MARGIN_X) return 'RIGHT';
      } else {
        if (cardTop < -OFFSCREEN_MARGIN_Y) return 'UP';
        if (cardBottom > stageLayout.height + OFFSCREEN_MARGIN_Y) return 'DOWN';
      }

      return null;
    },
    [cardRestLayout, stageLayout]
  );

  // スワイプアウトのアニメーション
  const animateSwipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (isAnimating) return;
      setIsAnimating(true);

      let targetX = 0;
      let targetY = 0;

      switch (direction) {
        case 'UP':
          targetY = -SCREEN_WIDTH * 1.6;
          break;
        case 'DOWN':
          targetY = SCREEN_WIDTH * 1.6;
          break;
        case 'LEFT':
          targetX = -SCREEN_WIDTH * 1.6;
          break;
        case 'RIGHT':
          targetX = SCREEN_WIDTH * 1.6;
          break;
      }

      Animated.timing(pan, {
        toValue: { x: targetX, y: targetY },
        duration: 200,
        useNativeDriver: false,
      }).start(() => {
        onSwipe(direction);
      });
    },
    [isAnimating, onSwipe, pan]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
        },
        onPanResponderMove: (_, gesture) => {
          if (isAnimating) return;
          pan.setValue({ x: gesture.dx, y: gesture.dy });

          const dir = getOverlapForGesture(gesture.dx, gesture.dy);
          setActiveDirection(dir);
        },
        onPanResponderRelease: (_, gesture) => {
          if (isAnimating) return;

          const dir = getOffscreenSwipeDirection(gesture.dx, gesture.dy);

          if (dir) {
            animateSwipeOut(dir);
          } else {
            // 画面外までスワイプされていない場合は初期位置に戻る
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 6,
              tension: 50,
              useNativeDriver: false,
            }).start();
            setActiveDirection(null);
          }
        },
      }),
    [animateSwipeOut, getOffscreenSwipeDirection, getOverlapForGesture, isAnimating, pan]
  );

  // カードの回転計算
  const rotate = useMemo(
    () =>
      pan.x.interpolate({
        inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        outputRange: ['-14deg', '0deg', '14deg'],
      }),
    [pan.x]
  );

  // ドラッグ方向に応じたカードボーダー色と背景色（淡いトーン）
  const cardBorderColor = activeDirection
    ? COLORS.directions[activeDirection].color
    : COLORS.border;

  const cardBgColor = activeDirection
    ? COLORS.directions[activeDirection].bg
    : COLORS.card;

  return (
    <View
      style={styles.stageContainer}
      onLayout={(e) => {
        setStageLayout(e.nativeEvent.layout);
      }}
    >
      {/* ========================================================
          4方向の立体スロット（奥行きと厚みのあるトレイデザイン）
          ======================================================== */}

      {/* 上：UP スロット */}
      <View
        onLayout={(e) => {
          const layout = e.nativeEvent.layout;
          setSlotLayouts((prev) => ({ ...prev, UP: layout }));
        }}
        style={[
          styles.slotPlate,
          styles.slotTop,
          styles.slotUpStyle,
          activeDirection === 'UP' && styles.slotActiveUp,
        ]}
      >
        <View style={styles.slotHeaderRow}>
          <Ionicons
            name="arrow-up-circle"
            size={18}
            color={COLORS.directions.UP.color}
          />
          <Text style={[styles.slotDirectionLabel, { color: COLORS.directions.UP.color }]}>
            上にスワイプ
          </Text>
        </View>
        <Text
          style={[
            styles.slotTextHorizontal,
            activeDirection === 'UP' && styles.slotTextActive,
          ]}
          numberOfLines={2}
        >
          {question.choices.UP}
        </Text>
      </View>

      {/* 左：LEFT スロット（立体縦長トレイ） */}
      <View
        onLayout={(e) => {
          const layout = e.nativeEvent.layout;
          setSlotLayouts((prev) => ({ ...prev, LEFT: layout }));
        }}
        style={[
          styles.slotPlate,
          styles.slotLeft,
          styles.slotLeftStyle,
          activeDirection === 'LEFT' && styles.slotActiveLeft,
        ]}
      >
        <Ionicons
          name="arrow-back-circle"
          size={20}
          color={COLORS.directions.LEFT.color}
          style={styles.slotSideIcon}
        />
        <Text
          style={[
            styles.slotTextVertical,
            activeDirection === 'LEFT' && styles.slotTextActive,
          ]}
          numberOfLines={4}
        >
          {question.choices.LEFT}
        </Text>
      </View>

      {/* 右：RIGHT スロット（立体縦長トレイ） */}
      <View
        onLayout={(e) => {
          const layout = e.nativeEvent.layout;
          setSlotLayouts((prev) => ({ ...prev, RIGHT: layout }));
        }}
        style={[
          styles.slotPlate,
          styles.slotRight,
          styles.slotRightStyle,
          activeDirection === 'RIGHT' && styles.slotActiveRight,
        ]}
      >
        <Ionicons
          name="arrow-forward-circle"
          size={20}
          color={COLORS.directions.RIGHT.color}
          style={styles.slotSideIcon}
        />
        <Text
          style={[
            styles.slotTextVertical,
            activeDirection === 'RIGHT' && styles.slotTextActive,
          ]}
          numberOfLines={4}
        >
          {question.choices.RIGHT}
        </Text>
      </View>

      {/* 下：DOWN スロット */}
      <View
        onLayout={(e) => {
          const layout = e.nativeEvent.layout;
          setSlotLayouts((prev) => ({ ...prev, DOWN: layout }));
        }}
        style={[
          styles.slotPlate,
          styles.slotBottom,
          styles.slotDownStyle,
          activeDirection === 'DOWN' && styles.slotActiveDown,
        ]}
      >
        <View style={styles.slotHeaderRow}>
          <Ionicons
            name="arrow-down-circle"
            size={18}
            color={COLORS.directions.DOWN.color}
          />
          <Text style={[styles.slotDirectionLabel, { color: COLORS.directions.DOWN.color }]}>
            下にスワイプ
          </Text>
        </View>
        <Text
          style={[
            styles.slotTextHorizontal,
            activeDirection === 'DOWN' && styles.slotTextActive,
          ]}
          numberOfLines={2}
        >
          {question.choices.DOWN}
        </Text>
      </View>

      {/* ========================================================
          中央カードエリア（奥のカードスタックで奥行きを演出）
          ======================================================== */}

      {/* 奥にあるカード（スタックの奥行き効果） */}
      <View
        onLayout={(e) => {
          setCardRestLayout(e.nativeEvent.layout);
        }}
        style={[styles.card, styles.cardBehind, SHADOWS.cardSmall]}
      />

      {/* 手前の操作可能カード */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          styles.cardFront,
          SHADOWS.cardFloating,
          {
            borderColor: cardBorderColor,
            backgroundColor: cardBgColor,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { rotate },
            ],
          },
        ]}
      >
        {/* カード上部：シンプルなカテゴリ＆カウント */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.categoryText}>{question.category}</Text>
            {question.repeatBadge && (
              <View style={styles.repeatBadge}>
                <Ionicons name="time-outline" size={11} color={COLORS.primaryDark} />
                <Text style={styles.repeatBadgeText}>{question.repeatBadge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.counterText}>
            {questionIndex + 1} / {totalQuestions}
          </Text>
        </View>

        {/* 質問文 */}
        <View style={styles.questionBox}>
          <Text style={styles.questionTitle}>{question.title}</Text>
        </View>

        {/* カード下部：シンプルなジェスチャーガイド */}
        <View style={styles.cardFooter}>
          <View style={styles.swipeGuidePill}>
            <Ionicons
              name="move-outline"
              size={16}
              color={activeDirection ? COLORS.directions[activeDirection].color : COLORS.primary}
            />
            <Text
              style={[
                styles.swipeGuideText,
                activeDirection && { color: COLORS.directions[activeDirection].color, fontWeight: '700' },
              ]}
            >
              {activeDirection
                ? `「${question.choices[activeDirection]}」`
                : '上下左右にスワイプ'}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  stageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
    paddingVertical: 10,
  },

  // ----------------------------------------------------
  // 立体スロット（厚み・ベベルと奥行きを持たせたデザイン）
  // ----------------------------------------------------
  slotPlate: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1.5,
    borderBottomWidth: 4, // 物理的な厚み（3Dプレート感）
    zIndex: 1,
    ...SHADOWS.depthSlot,
  },

  // 上スロット
  slotTop: {
    top: 16,
    left: 20,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  slotUpStyle: {
    backgroundColor: COLORS.directions.UP.bg,
    borderColor: COLORS.directions.UP.border,
    borderBottomColor: COLORS.directions.UP.color,
  },
  slotActiveUp: {
    transform: [{ scale: 1.04 }],
    borderColor: COLORS.directions.UP.color,
    borderBottomWidth: 5,
    ...SHADOWS.depthSlotActive,
  },

  // 下スロット
  slotBottom: {
    bottom: 24,
    left: 20,
    right: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  slotDownStyle: {
    backgroundColor: COLORS.directions.DOWN.bg,
    borderColor: COLORS.directions.DOWN.border,
    borderBottomColor: COLORS.directions.DOWN.color,
  },
  slotActiveDown: {
    transform: [{ scale: 1.04 }],
    borderColor: COLORS.directions.DOWN.color,
    borderBottomWidth: 5,
    ...SHADOWS.depthSlotActive,
  },

  // 左スロット（縦長トレイ・中央カードと干渉しない幅）
  slotLeft: {
    left: 8,
    top: '50%',
    marginTop: -85,
    width: SIDE_SLOT_WIDTH,
    height: 170,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLeftStyle: {
    backgroundColor: COLORS.directions.LEFT.bg,
    borderColor: COLORS.directions.LEFT.border,
    borderBottomColor: COLORS.directions.LEFT.color,
  },
  slotActiveLeft: {
    transform: [{ scale: 1.05 }],
    borderColor: COLORS.directions.LEFT.color,
    borderBottomWidth: 5,
    ...SHADOWS.depthSlotActive,
  },

  // 右スロット（縦長トレイ・中央カードと干渉しない幅）
  slotRight: {
    right: 8,
    top: '50%',
    marginTop: -85,
    width: SIDE_SLOT_WIDTH,
    height: 170,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotRightStyle: {
    backgroundColor: COLORS.directions.RIGHT.bg,
    borderColor: COLORS.directions.RIGHT.border,
    borderBottomColor: COLORS.directions.RIGHT.color,
  },
  slotActiveRight: {
    transform: [{ scale: 1.05 }],
    borderColor: COLORS.directions.RIGHT.color,
    borderBottomWidth: 5,
    ...SHADOWS.depthSlotActive,
  },

  // スロット共通内部パーツ
  slotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  slotDirectionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  slotTextHorizontal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  slotSideIcon: {
    marginBottom: 8,
  },
  slotTextVertical: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  slotTextActive: {
    color: COLORS.text,
    fontWeight: '800',
  },

  // ----------------------------------------------------
  // 中央カード（レイヤードカードスタック）
  // ----------------------------------------------------
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 18,
    justifyContent: 'space-between',
  },
  // 奥のカード（奥行き感を演出）
  cardBehind: {
    position: 'absolute',
    backgroundColor: '#F7EFE7',
    borderWidth: 1.5,
    borderColor: '#E8DCCF',
    transform: [{ rotate: '-3deg' }, { scale: 0.94 }],
    zIndex: 5,
  },
  // 手前のメイン操作カード
  cardFront: {
    borderWidth: 2,
    zIndex: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  questionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  questionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  cardFooter: {
    alignItems: 'center',
  },
  swipeGuidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  swipeGuideText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
