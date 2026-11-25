import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';

/**
 * ホーム画面ヘッダー用の「Kotaeai」ブランドロゴ
 * （重なり合う2枚のカードモチーフ＋温かみのあるスタイリッシュなワードマーク）
 */
export const KotaeaiLogo: React.FC = () => {
  return (
    <View style={styles.container} accessible accessibilityLabel="Kotaeai">
      {/* 重なる2枚のカードモチーフ（アプリアイコンと統一） */}
      <View style={styles.markWrap}>
        <View style={styles.cardBack} />
        <View style={styles.cardFront}>
          <View style={styles.cardFrontDot} />
        </View>
      </View>

      {/* ワードマーク（Kotae + アクセントカラーの ai + さりげないドット） */}
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordPrimary}>Kotae</Text>
        <Text style={styles.wordAccent}>ai</Text>
        <View style={styles.endDot} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  markWrap: {
    width: 26,
    height: 24,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBack: {
    position: 'absolute',
    left: 1,
    top: 3,
    width: 15,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#F2C1AC',
    borderWidth: 1,
    borderColor: '#E5A38A',
    transform: [{ rotate: '-11deg' }],
  },
  cardFront: {
    position: 'absolute',
    right: 1,
    top: 2,
    width: 16,
    height: 19,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 1.2,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
    shadowColor: '#8E4A36',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  cardFrontDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#FFF7F2',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordPrimary: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'AvenirNext-DemiBold',
      android: 'sans-serif-medium',
      default: undefined,
    }),
  },
  wordAccent: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.4,
    fontFamily: Platform.select({
      ios: 'AvenirNext-DemiBold',
      android: 'sans-serif-medium',
      default: undefined,
    }),
  },
  endDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: COLORS.secondary,
    marginLeft: 2,
    marginBottom: 1,
  },
});
