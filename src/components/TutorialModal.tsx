import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ visible, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: '4方向スワイプで直感回答',
      subtitle: '毎日の3問に上下左右スワイプで答えます',
      renderGraphic: () => (
        <View style={styles.diagramContainer}>
          {/* 上 */}
          <View style={[styles.diagramSlot, styles.slotUp]}>
            <Ionicons name="arrow-up" size={14} color={COLORS.directions.UP.color} />
            <Text style={styles.diagramSlotText}>上へスワイプ</Text>
          </View>

          {/* 中段（左・中央カード・右） */}
          <View style={styles.diagramMiddleRow}>
            {/* 左 */}
            <View style={styles.diagramSlot}>
              <Ionicons name="arrow-back" size={14} color={COLORS.directions.LEFT.color} />
              <Text style={styles.diagramSlotText}>左へ</Text>
            </View>

            {/* 中央カード（ダーク主役カード） */}
            <View style={[styles.diagramCenterCard, SHADOWS.cardSmall]}>
              <View style={styles.diagramCardInner}>
                <View style={styles.diagramCardAccent} />
                <View style={styles.diagramCardBody}>
                  <View style={styles.diagramCategoryTag}>
                    <Text style={styles.diagramCategoryText}>質問カード</Text>
                  </View>
                  <Text style={styles.diagramCardTitle}>質問文</Text>
                  <View style={styles.diagramSwipeHint}>
                    <Ionicons name="move" size={11} color={COLORS.secondary} />
                    <Text style={styles.diagramSwipeText}>ドラッグ</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 右 */}
            <View style={styles.diagramSlot}>
              <Text style={styles.diagramSlotText}>右へ</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.directions.RIGHT.color} />
            </View>
          </View>

          {/* 下 */}
          <View style={[styles.diagramSlot, styles.slotDown]}>
            <Text style={styles.diagramSlotText}>下へスワイプ</Text>
            <Ionicons name="arrow-down" size={14} color={COLORS.directions.DOWN.color} />
          </View>
        </View>
      ),
      description:
        '1問につき4つの選択肢が四方に配置されています。カードを上下左右にドラッグしてフリックすると回答が確定します。',
    },
    {
      title: '双方が終えるまで完全秘密',
      subtitle: '相手の回答を見ることはできません',
      renderGraphic: () => (
        <View style={styles.secretGraphicContainer}>
          <View style={[styles.secretCircle, SHADOWS.cardSmall]}>
            <Ionicons name="lock-closed" size={40} color={COLORS.primary} />
          </View>
          <View style={styles.secretUsersRow}>
            <View style={styles.secretUserBox}>
              <View style={[styles.secretAvatar, { backgroundColor: '#FDF0EC' }]}>
                <Text style={styles.secretAvatarText}>あなた</Text>
              </View>
              <Text style={styles.secretStatusText}>回答完了</Text>
            </View>
            <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.border} />
            <View style={styles.secretUserBox}>
              <View style={[styles.secretAvatar, { backgroundColor: '#F0F5F9' }]}>
                <Text style={styles.secretAvatarText}>相手</Text>
              </View>
              <Text style={styles.secretStatusText}>回答待ち</Text>
            </View>
          </View>
        </View>
      ),
      description:
        'あなたが回答済みでも、パートナーが回答を完了するまでお互いの答えは伏せられます。相手の答えを気にせず本音で答えられます。',
    },
    {
      title: '一致率公開と過去との比較',
      subtitle: '二人で振り返り、関係の変化を確かめる',
      renderGraphic: () => (
        <View style={styles.resultGraphicContainer}>
          <View style={styles.matchCircleMock}>
            <Text style={styles.matchCirclePercent}>100%</Text>
            <Text style={styles.matchCircleSub}>一致率</Text>
          </View>
          <View style={styles.repeatNoticeBox}>
            <Ionicons name="time-outline" size={16} color={COLORS.primaryDark} />
            <Text style={styles.repeatNoticeText}>一定期間後に同じ質問が再登場</Text>
          </View>
        </View>
      ),
      description:
        '二人の回答が揃うと一致率と回答内容が公開されます。プレミアムプランでは、自分が未回答だった過去日の質問に後から回答して相手の結果を見たり、それを含めたAI相性診断も利用できます。',
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    setCurrentStep(0);
    onClose();
  };

  const stepData = steps[currentStep];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleFinish}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, SHADOWS.cardFloating]}>
          {/* ヘッダー・スキップボタン */}
          <View style={styles.header}>
            <View style={styles.stepIndicator}>
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    currentStep === i ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity onPress={handleFinish} style={styles.skipButton}>
              <Text style={styles.skipText}>スキップ</Text>
            </TouchableOpacity>
          </View>

          {/* コンテンツ */}
          <View style={styles.content}>
            <Text style={styles.title}>{stepData.title}</Text>
            <Text style={styles.subtitle}>{stepData.subtitle}</Text>

            <View style={styles.graphicArea}>{stepData.renderGraphic()}</View>

            <Text style={styles.description}>{stepData.description}</Text>
          </View>

          {/* フッター・ナビゲーションボタン */}
          <View style={styles.footer}>
            {currentStep > 0 ? (
              <TouchableOpacity
                onPress={() => setCurrentStep((prev) => prev - 1)}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>戻る</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backButtonPlaceholder} />
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={styles.nextButton}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>
                {currentStep === steps.length - 1 ? 'はじめる' : '次へ'}
              </Text>
              <Ionicons
                name={currentStep === steps.length - 1 ? 'checkmark' : 'arrow-forward'}
                size={16}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 24, 20, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: Math.min(SCREEN_WIDTH - 36, 380),
    backgroundColor: COLORS.background,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIndicator: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: COLORS.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#E2D7CC',
  },
  skipButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 18,
  },
  graphicArea: {
    width: '100%',
    height: 180,
    backgroundColor: COLORS.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 18,
  },
  description: {
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 6,
    marginBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  backButtonPlaceholder: {
    width: 60,
  },
  backButtonText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ----------------------------------------------------
  // 図解1: 4方向スワイプダイアグラム（ダークカード＋枠なしスロット）
  // ----------------------------------------------------
  diagramContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  diagramSlot: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  slotUp: {
    marginBottom: 8,
  },
  slotDown: {
    marginTop: 8,
  },
  diagramSlotText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.text,
  },
  diagramMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 6,
  },
  diagramCenterCard: {
    width: 112,
    height: 82,
    backgroundColor: COLORS.darkCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.darkCardBorder,
  },
  diagramCardInner: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  diagramCardAccent: {
    height: 3,
    width: '100%',
    backgroundColor: COLORS.primary,
  },
  diagramCardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  diagramCategoryTag: {
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diagramCategoryText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  diagramCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.darkCardText,
  },
  diagramSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  diagramSwipeText: {
    fontSize: 8,
    color: COLORS.darkCardMuted,
    fontWeight: '600',
  },

  // ----------------------------------------------------
  // 図解2: 秘密・待機グラフィック
  // ----------------------------------------------------
  secretGraphicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  secretCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  secretUsersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  secretUserBox: {
    alignItems: 'center',
  },
  secretAvatar: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 4,
  },
  secretAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
  },
  secretStatusText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // ----------------------------------------------------
  // 図解3: 一致率 & 過去比較グラフィック
  // ----------------------------------------------------
  resultGraphicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCircleMock: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F2F7F4',
    borderWidth: 3,
    borderColor: COLORS.directions.UP.color,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  matchCirclePercent: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.directions.UP.color,
  },
  matchCircleSub: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  repeatNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  repeatNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
});
