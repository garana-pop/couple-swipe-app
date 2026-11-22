import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  PanResponderGestureState,
  Dimensions,
  LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Question, SwipeDirection } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// カードと左右スロットの寸法バランス（左右に十分な呼吸スペースを確保）
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.56, 224);
const CARD_HEIGHT = 236;
const SIDE_SLOT_WIDTH = Math.max((SCREEN_WIDTH - CARD_WIDTH) / 2 - 18, 60);

const VERTICAL_OVERLAP_MIN = 12;
const HORIZONTAL_OVERLAP_MIN = 20;
const OFFSCREEN_MARGIN_X = 35;
const VERTICAL_CONFIRM_RATIO = 0.5; // 上下スロットの中央を越えるまでスワイプしたら確定
const FLICK_VELOCITY = 0.45;

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

interface GestureCallbacks {
  onMove: (gesture: PanResponderGestureState) => void;
  onRelease: (gesture: PanResponderGestureState) => void;
  onTerminate: () => void;
}

function createStablePanHandlers() {
  let callbacks: GestureCallbacks = {
    onMove: () => {},
    onRelease: () => {},
    onTerminate: () => {},
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => {
      return Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => {
      callbacks.onMove(gesture);
    },
    onPanResponderRelease: (_, gesture) => {
      callbacks.onRelease(gesture);
    },
    onPanResponderTerminate: () => {
      callbacks.onTerminate();
    },
  });

  return {
    setCallbacks: (next: GestureCallbacks) => {
      callbacks = next;
    },
    panHandlers: panResponder.panHandlers,
  };
}

interface SwipeCardProps {
  question: Question;
  onSwipe: (direction: SwipeDirection) => void;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({
  question,
  onSwipe,
}) => {
  // Animated インスタンス
  const [pan] = useState(() => new Animated.ValueXY());
  const [activeDirection, setActiveDirection] = useState<SwipeDirection | null>(null);
  const isAnimatingRef = useRef(false);

  const slotLayoutsRef = useRef<Partial<Record<SwipeDirection, LayoutRectangle>>>({});
  const cardRestLayoutRef = useRef<LayoutRectangle | null>(null);
  const stageLayoutRef = useRef<LayoutRectangle | null>(null);

  // カードが答えのエリア（スロット）に重なっているかを判定
  const getOverlapForGesture = useCallback((dx: number, dy: number): SwipeDirection | null => {
    const rest = cardRestLayoutRef.current;
    if (!rest) return null;

    return getOverlappingDirection(
      {
        x: rest.x + dx,
        y: rest.y + dy,
        width: rest.width,
        height: rest.height,
      },
      slotLayoutsRef.current
    );
  }, []);

  // カードが回答確定位置までスワイプされたかを判定
  const getConfirmSwipeDirection = useCallback(
    (dx: number, dy: number, vx: number, vy: number): SwipeDirection | null => {
      const rest = cardRestLayoutRef.current;
      const stage = stageLayoutRef.current;
      if (!rest || !stage) return null;

      const cardLeft = rest.x + dx;
      const cardRight = cardLeft + rest.width;
      const cardTop = rest.y + dy;
      const cardBottom = cardTop + rest.height;
      const overlapDir = getOverlapForGesture(dx, dy);

      if (Math.abs(dx) >= Math.abs(dy)) {
        if (cardLeft < -OFFSCREEN_MARGIN_X) return 'LEFT';
        if (cardRight > stage.width + OFFSCREEN_MARGIN_X) return 'RIGHT';
        if (overlapDir === 'LEFT' && vx <= -FLICK_VELOCITY) return 'LEFT';
        if (overlapDir === 'RIGHT' && vx >= FLICK_VELOCITY) return 'RIGHT';
      } else {
        const upSlot = slotLayoutsRef.current.UP;
        const downSlot = slotLayoutsRef.current.DOWN;

        if (
          cardTop < 0 ||
          (upSlot && cardTop <= upSlot.y + upSlot.height * VERTICAL_CONFIRM_RATIO) ||
          (overlapDir === 'UP' && vy <= -FLICK_VELOCITY)
        ) {
          return 'UP';
        }

        if (
          cardBottom > stage.height ||
          (downSlot &&
            cardBottom >= downSlot.y + downSlot.height * (1 - VERTICAL_CONFIRM_RATIO)) ||
          (overlapDir === 'DOWN' && vy >= FLICK_VELOCITY)
        ) {
          return 'DOWN';
        }
      }

      return null;
    },
    [getOverlapForGesture]
  );

  // 初期位置へスプリングで戻す
  const resetCardPosition = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 50,
      useNativeDriver: false,
    }).start();
    setActiveDirection(null);
  }, [pan]);

  // スワイプアウトのアニメーション
  const animateSwipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

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
    [onSwipe, pan]
  );

  // PanResponder はマウント時に1回だけ生成し、ドラッグ中に再生成されてタッチが途切れないようにする
  const [gestureBridge] = useState(createStablePanHandlers);

  useEffect(() => {
    gestureBridge.setCallbacks({
      onMove: (gesture) => {
        if (isAnimatingRef.current) return;
        pan.setValue({ x: gesture.dx, y: gesture.dy });

        const dir = getOverlapForGesture(gesture.dx, gesture.dy);
        setActiveDirection((prev) => (prev === dir ? prev : dir));
      },
      onRelease: (gesture) => {
        if (isAnimatingRef.current) return;

        const dir = getConfirmSwipeDirection(gesture.dx, gesture.dy, gesture.vx, gesture.vy);

        if (dir) {
          animateSwipeOut(dir);
        } else {
          resetCardPosition();
        }
      },
      onTerminate: () => {
        if (isAnimatingRef.current) return;
        resetCardPosition();
      },
    });
  }, [
    animateSwipeOut,
    gestureBridge,
    getConfirmSwipeDirection,
    getOverlapForGesture,
    pan,
    resetCardPosition,
  ]);

  // カードの回転計算
  const rotate = useMemo(
    () =>
      pan.x.interpolate({
        inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        outputRange: ['-14deg', '0deg', '14deg'],
      }),
    [pan.x]
  );

  // ドラッグ方向に応じたカードボーダー色とアクセントカラー
  const activeColor = activeDirection ? COLORS.directions[activeDirection].color : null;
  const cardBorderColor = activeColor ?? COLORS.darkCardBorder;
  const cardAccentColor = activeColor ?? COLORS.primary;

  return (
    <View
      style={styles.stageContainer}
      onLayout={(e) => {
        stageLayoutRef.current = e.nativeEvent.layout;
      }}
    >
      {/* ========================================================
          4方向の枠なしミニマルスロット（矢印アイコン＋選択肢テキスト）
          ======================================================== */}

      {/* 上：UP スロット */}
      <View
        onLayout={(e) => {
          slotLayoutsRef.current.UP = e.nativeEvent.layout;
        }}
        style={[
          styles.slotPlate,
          styles.slotTop,
          activeDirection === 'UP' && {
            backgroundColor: COLORS.directions.UP.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Ionicons
          name="arrow-up"
          size={18}
          color={activeDirection === 'UP' ? COLORS.directions.UP.activeText : COLORS.directions.UP.color}
        />
        <Text
          style={[
            styles.slotTextHorizontal,
            activeDirection === 'UP' && {
              color: COLORS.directions.UP.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={2}
        >
          {question.choices.UP}
        </Text>
      </View>

      {/* 左：LEFT スロット */}
      <View
        onLayout={(e) => {
          slotLayoutsRef.current.LEFT = e.nativeEvent.layout;
        }}
        style={[
          styles.slotPlate,
          styles.slotLeft,
          activeDirection === 'LEFT' && {
            backgroundColor: COLORS.directions.LEFT.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Ionicons
          name="arrow-back"
          size={18}
          color={activeDirection === 'LEFT' ? COLORS.directions.LEFT.activeText : COLORS.directions.LEFT.color}
        />
        <Text
          style={[
            styles.slotTextVertical,
            activeDirection === 'LEFT' && {
              color: COLORS.directions.LEFT.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={4}
        >
          {question.choices.LEFT}
        </Text>
      </View>

      {/* 右：RIGHT スロット */}
      <View
        onLayout={(e) => {
          slotLayoutsRef.current.RIGHT = e.nativeEvent.layout;
        }}
        style={[
          styles.slotPlate,
          styles.slotRight,
          activeDirection === 'RIGHT' && {
            backgroundColor: COLORS.directions.RIGHT.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Ionicons
          name="arrow-forward"
          size={18}
          color={activeDirection === 'RIGHT' ? COLORS.directions.RIGHT.activeText : COLORS.directions.RIGHT.color}
        />
        <Text
          style={[
            styles.slotTextVertical,
            activeDirection === 'RIGHT' && {
              color: COLORS.directions.RIGHT.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={4}
        >
          {question.choices.RIGHT}
        </Text>
      </View>

      {/* 下：DOWN スロット */}
      <View
        onLayout={(e) => {
          slotLayoutsRef.current.DOWN = e.nativeEvent.layout;
        }}
        style={[
          styles.slotPlate,
          styles.slotBottom,
          activeDirection === 'DOWN' && {
            backgroundColor: COLORS.directions.DOWN.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Text
          style={[
            styles.slotTextHorizontal,
            activeDirection === 'DOWN' && {
              color: COLORS.directions.DOWN.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={2}
        >
          {question.choices.DOWN}
        </Text>
        <Ionicons
          name="arrow-down"
          size={18}
          color={activeDirection === 'DOWN' ? COLORS.directions.DOWN.activeText : COLORS.directions.DOWN.color}
        />
      </View>

      {/* ========================================================
          中央カードエリア（ダーク主役カード＋水平スタック）
          ======================================================== */}

      {/* 奥にあるカード（水平スタックで奥行き感を演出） */}
      <View
        onLayout={(e) => {
          cardRestLayoutRef.current = e.nativeEvent.layout;
        }}
        style={[styles.card, styles.cardBehind, SHADOWS.cardSmall]}
      />

      {/* 手前の操作可能カード */}
      <Animated.View
        {...gestureBridge.panHandlers}
        style={[
          styles.card,
          styles.cardFront,
          SHADOWS.darkCardFloating,
          {
            borderColor: cardBorderColor,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { rotate },
            ],
          },
        ]}
      >
        <View style={styles.cardInner}>
          {/* 上部アクセントライン */}
          <View style={[styles.cardAccentBar, { backgroundColor: cardAccentColor }]} />

          <View style={styles.cardBody}>
            {/* カード上部：カテゴリ＆リマインドバッジ */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{question.category}</Text>
                </View>
                {question.repeatBadge && (
                  <View style={styles.repeatBadge}>
                    <Ionicons name="time-outline" size={11} color={COLORS.secondary} />
                    <Text style={styles.repeatBadgeText}>{question.repeatBadge}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* 質問文 */}
            <View style={styles.questionBox}>
              <Text style={styles.questionTitle}>{question.title}</Text>
            </View>

            {/* カード下部：ジェスチャーガイド */}
            <View style={styles.cardFooter}>
              <View
                style={[
                  styles.swipeGuidePill,
                  activeColor ? { backgroundColor: activeColor } : null,
                ]}
              >
                <Ionicons
                  name="move-outline"
                  size={15}
                  color={activeColor ? COLORS.darkCardText : COLORS.secondary}
                />
                <Text
                  style={[
                    styles.swipeGuideText,
                    activeColor
                      ? { color: COLORS.darkCardText, fontWeight: '700' }
                      : null,
                  ]}
                  numberOfLines={1}
                >
                  {activeDirection
                    ? `「${question.choices[activeDirection]}」`
                    : '上下左右にスワイプ'}
                </Text>
              </View>
            </View>
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
  // 4方向ミニマルスロット（通常時は枠なし・矢印＋テキストのみ）
  // ----------------------------------------------------
  slotPlate: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'transparent',
    zIndex: 1,
  },

  // 上スロット
  slotTop: {
    top: 16,
    left: 24,
    right: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4,
  },

  // 下スロット
  slotBottom: {
    bottom: 22,
    left: 24,
    right: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4,
  },

  // 左スロット（上下スロットと干渉しない範囲で縦長に確保）
  slotLeft: {
    left: 6,
    top: 100,
    bottom: 106,
    width: SIDE_SLOT_WIDTH,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // 右スロット（上下スロットと干渉しない範囲で縦長に確保）
  slotRight: {
    right: 6,
    top: 100,
    bottom: 106,
    width: SIDE_SLOT_WIDTH,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // スロットテキスト
  slotTextHorizontal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 19,
  },
  slotTextVertical: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 17,
  },

  // ----------------------------------------------------
  // 中央カード（ダークエスプレッソ主役カード＋水平スタック）
  // ----------------------------------------------------
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    backgroundColor: COLORS.darkCard,
  },
  // 奥のカード（水平スタックで奥行き感を演出）
  cardBehind: {
    position: 'absolute',
    backgroundColor: COLORS.darkCardBehind,
    borderWidth: 1,
    borderColor: COLORS.darkCardBehindBorder,
    transform: [{ translateY: 10 }, { scale: 0.94 }],
    zIndex: 5,
  },
  // 手前のメイン操作カード
  cardFront: {
    borderWidth: 2,
    zIndex: 10,
  },
  cardInner: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  cardAccentBar: {
    height: 5,
    width: '100%',
  },
  cardBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
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
    flexShrink: 1,
  },
  categoryBadge: {
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
  },
  questionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.darkCardText,
    textAlign: 'center',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  cardFooter: {
    alignItems: 'center',
  },
  swipeGuidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    maxWidth: '100%',
  },
  swipeGuideText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkCardMuted,
    flexShrink: 1,
  },
});
