import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  PanResponderGestureState,
  useWindowDimensions,
  LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Question, SwipeDirection } from '../types';
import { COLORS, SHADOWS } from '../constants/theme';
import { isCompactCjkLocale, isLongTextLocale, isThaiLocale } from '../i18n/locale';

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
  const { t, i18n } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const isCompactCjk = isCompactCjkLocale(locale);
  const isLongText = isLongTextLocale(locale);
  const isThai = isThaiLocale(locale);

  // 言語特性に応じたカード幅・左右スロット幅の動的調整（欧文・ロシア語・タイ語の崩れ防止）
  const screenWidth = Math.min(windowWidth, 430);
  const cardWidth = isCompactCjk
    ? Math.min(screenWidth * 0.55, 222)
    : Math.min(screenWidth * 0.5, 204);
  const cardHeight = isCompactCjk ? 236 : 244;
  const sideSlotWidth = Math.max((screenWidth - cardWidth) / 2 - 10, isCompactCjk ? 64 : 78);

  const [pan] = useState(() => new Animated.ValueXY());
  const [activeDirection, setActiveDirection] = useState<SwipeDirection | null>(null);
  const isAnimatingRef = useRef(false);

  const slotLayoutsRef = useRef<Partial<Record<SwipeDirection, LayoutRectangle>>>({});
  const cardRestLayoutRef = useRef<LayoutRectangle | null>(null);
  const stageLayoutRef = useRef<LayoutRectangle | null>(null);

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

  const resetCardPosition = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 50,
      useNativeDriver: false,
    }).start();
    setActiveDirection(null);
  }, [pan]);

  const animateSwipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;

      let targetX = 0;
      let targetY = 0;

      switch (direction) {
        case 'UP':
          targetY = -screenWidth * 1.6;
          break;
        case 'DOWN':
          targetY = screenWidth * 1.6;
          break;
        case 'LEFT':
          targetX = -screenWidth * 1.6;
          break;
        case 'RIGHT':
          targetX = screenWidth * 1.6;
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
    [onSwipe, pan, screenWidth]
  );

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

  const rotate = useMemo(
    () =>
      pan.x.interpolate({
        inputRange: [-screenWidth, 0, screenWidth],
        outputRange: ['-14deg', '0deg', '14deg'],
      }),
    [pan.x, screenWidth]
  );

  const activeColor = activeDirection ? COLORS.directions[activeDirection].color : null;
  const cardBorderColor = activeColor ?? COLORS.darkCardBorder;
  const cardAccentColor = activeColor ?? COLORS.primary;

  const horizontalSlotTextStyle = [
    styles.slotTextHorizontal,
    isLongText && styles.slotTextHorizontalLong,
    isThai && styles.slotTextHorizontalThai,
  ];
  const verticalSlotTextStyle = [
    styles.slotTextVertical,
    isLongText && styles.slotTextVerticalLong,
    isThai && styles.slotTextVerticalThai,
  ];

  return (
    <View
      style={styles.stageContainer}
      onLayout={(e) => {
        stageLayoutRef.current = e.nativeEvent.layout;
      }}
    >
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
            ...horizontalSlotTextStyle,
            activeDirection === 'UP' && {
              color: COLORS.directions.UP.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
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
          { width: sideSlotWidth },
          activeDirection === 'LEFT' && {
            backgroundColor: COLORS.directions.LEFT.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Ionicons
          name="arrow-back"
          size={17}
          color={activeDirection === 'LEFT' ? COLORS.directions.LEFT.activeText : COLORS.directions.LEFT.color}
        />
        <Text
          style={[
            ...verticalSlotTextStyle,
            activeDirection === 'LEFT' && {
              color: COLORS.directions.LEFT.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={5}
          adjustsFontSizeToFit
          minimumFontScale={0.76}
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
          { width: sideSlotWidth },
          activeDirection === 'RIGHT' && {
            backgroundColor: COLORS.directions.RIGHT.bg,
            transform: [{ scale: 1.04 }],
          },
        ]}
      >
        <Ionicons
          name="arrow-forward"
          size={17}
          color={activeDirection === 'RIGHT' ? COLORS.directions.RIGHT.activeText : COLORS.directions.RIGHT.color}
        />
        <Text
          style={[
            ...verticalSlotTextStyle,
            activeDirection === 'RIGHT' && {
              color: COLORS.directions.RIGHT.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={5}
          adjustsFontSizeToFit
          minimumFontScale={0.76}
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
            ...horizontalSlotTextStyle,
            activeDirection === 'DOWN' && {
              color: COLORS.directions.DOWN.activeText,
              fontWeight: '800',
            },
          ]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {question.choices.DOWN}
        </Text>
        <Ionicons
          name="arrow-down"
          size={18}
          color={activeDirection === 'DOWN' ? COLORS.directions.DOWN.activeText : COLORS.directions.DOWN.color}
        />
      </View>

      {/* 奥にあるカード */}
      <View
        onLayout={(e) => {
          cardRestLayoutRef.current = e.nativeEvent.layout;
        }}
        style={[
          styles.card,
          styles.cardBehind,
          SHADOWS.cardSmall,
          { width: cardWidth, height: cardHeight },
        ]}
      />

      {/* 手前の操作可能カード */}
      <Animated.View
        {...gestureBridge.panHandlers}
        style={[
          styles.card,
          styles.cardFront,
          SHADOWS.darkCardFloating,
          {
            width: cardWidth,
            height: cardHeight,
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
          <View style={[styles.cardAccentBar, { backgroundColor: cardAccentColor }]} />

          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.categoryBadge}>
                  <Text
                    style={[styles.categoryText, isThai && styles.thaiCompactLine]}
                    numberOfLines={1}
                  >
                    {question.category}
                  </Text>
                </View>
                {question.repeatBadge && (
                  <View style={styles.repeatBadge}>
                    <Ionicons name="time-outline" size={11} color={COLORS.secondary} />
                    <Text
                      style={[styles.repeatBadgeText, isThai && styles.thaiCompactLine]}
                      numberOfLines={1}
                    >
                      {question.repeatBadge}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.questionBox}>
              <Text
                style={[
                  styles.questionTitle,
                  isLongText && styles.questionTitleLong,
                  isThai && styles.questionTitleThai,
                ]}
                numberOfLines={5}
                adjustsFontSizeToFit
                minimumFontScale={0.76}
              >
                {question.title}
              </Text>
            </View>

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
                    isThai && styles.thaiGuideLine,
                    activeColor
                      ? { color: COLORS.darkCardText, fontWeight: '700' }
                      : null,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {activeDirection
                    ? t('common.quoted', { text: question.choices[activeDirection] })
                    : t('swipeCard.guide')}
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
    userSelect: 'none',
  },
  slotPlate: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  slotTop: {
    top: 12,
    left: 16,
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  slotBottom: {
    bottom: 16,
    left: 16,
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  slotLeft: {
    left: 4,
    top: 94,
    bottom: 100,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  slotRight: {
    right: 4,
    top: 94,
    bottom: 100,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  slotTextHorizontal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  slotTextHorizontalLong: {
    fontSize: 13,
    lineHeight: 18,
  },
  slotTextHorizontalThai: {
    fontSize: 13.5,
    lineHeight: 22,
  },
  slotTextVertical: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 17,
    width: '100%',
  },
  slotTextVerticalLong: {
    fontSize: 11,
    lineHeight: 15,
  },
  slotTextVerticalThai: {
    fontSize: 11.5,
    lineHeight: 19,
  },
  card: {
    borderRadius: 24,
    backgroundColor: COLORS.darkCard,
  },
  cardBehind: {
    position: 'absolute',
    backgroundColor: COLORS.darkCardBehind,
    borderWidth: 1,
    borderColor: COLORS.darkCardBehindBorder,
    transform: [{ translateY: 10 }, { scale: 0.94 }],
    zIndex: 5,
  },
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
    padding: 15,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  categoryBadge: {
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: '100%',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
    lineHeight: 15,
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
    maxWidth: '100%',
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
    lineHeight: 14,
  },
  thaiCompactLine: {
    lineHeight: 17,
  },
  questionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  questionTitle: {
    fontSize: 17.5,
    fontWeight: '800',
    color: COLORS.darkCardText,
    textAlign: 'center',
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  questionTitleLong: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  questionTitleThai: {
    fontSize: 16.5,
    lineHeight: 27,
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
    paddingHorizontal: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  swipeGuideText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.darkCardMuted,
    flexShrink: 1,
    lineHeight: 16,
  },
  thaiGuideLine: {
    lineHeight: 19,
  },
});
