import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, SHADOWS } from '../constants/theme';

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: t('tutorial.step1.title'),
      subtitle: t('tutorial.step1.subtitle'),
      renderGraphic: () => (
        <View style={styles.diagramContainer}>
          <View style={[styles.diagramSlot, styles.slotUp]}>
            <Ionicons name="arrow-up" size={14} color={COLORS.directions.UP.color} />
            <Text style={styles.diagramSlotText} numberOfLines={1} adjustsFontSizeToFit>
              {t('tutorial.step1.up')}
            </Text>
          </View>

          <View style={styles.diagramMiddleRow}>
            <View style={[styles.diagramSlot, styles.diagramSideSlot]}>
              <Ionicons name="arrow-back" size={13} color={COLORS.directions.LEFT.color} />
              <Text
                style={styles.diagramSlotText}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t('tutorial.step1.left')}
              </Text>
            </View>

            <View style={[styles.diagramCenterCard, SHADOWS.cardSmall]}>
              <View style={styles.diagramCardInner}>
                <View style={styles.diagramCardAccent} />
                <View style={styles.diagramCardBody}>
                  <View style={styles.diagramCategoryTag}>
                    <Text
                      style={styles.diagramCategoryText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t('tutorial.step1.cardTag')}
                    </Text>
                  </View>
                  <Text
                    style={styles.diagramCardTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {t('tutorial.step1.cardTitle')}
                  </Text>
                  <View style={styles.diagramSwipeHint}>
                    <Ionicons name="move" size={11} color={COLORS.secondary} />
                    <Text
                      style={styles.diagramSwipeText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t('tutorial.step1.drag')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.diagramSlot, styles.diagramSideSlot]}>
              <Text
                style={styles.diagramSlotText}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t('tutorial.step1.right')}
              </Text>
              <Ionicons name="arrow-forward" size={13} color={COLORS.directions.RIGHT.color} />
            </View>
          </View>

          <View style={[styles.diagramSlot, styles.slotDown]}>
            <Text style={styles.diagramSlotText} numberOfLines={1} adjustsFontSizeToFit>
              {t('tutorial.step1.down')}
            </Text>
            <Ionicons name="arrow-down" size={14} color={COLORS.directions.DOWN.color} />
          </View>
        </View>
      ),
      description: t('tutorial.step1.description'),
    },
    {
      title: t('tutorial.step2.title'),
      subtitle: t('tutorial.step2.subtitle'),
      renderGraphic: () => (
        <View style={styles.secretGraphicContainer}>
          <View style={[styles.secretCircle, SHADOWS.cardSmall]}>
            <Ionicons name="lock-closed" size={38} color={COLORS.primary} />
          </View>
          <View style={styles.secretUsersRow}>
            <View style={styles.secretUserBox}>
              <View style={[styles.secretAvatar, { backgroundColor: '#FDF0EC' }]}>
                <Text style={styles.secretAvatarText} numberOfLines={1}>
                  {t('tutorial.step2.me')}
                </Text>
              </View>
              <Text style={styles.secretStatusText} numberOfLines={2}>
                {t('tutorial.step2.done')}
              </Text>
            </View>
            <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.border} />
            <View style={styles.secretUserBox}>
              <View style={[styles.secretAvatar, { backgroundColor: '#F0F5F9' }]}>
                <Text style={styles.secretAvatarText} numberOfLines={1}>
                  {t('tutorial.step2.partner')}
                </Text>
              </View>
              <Text style={styles.secretStatusText} numberOfLines={2}>
                {t('tutorial.step2.waiting')}
              </Text>
            </View>
          </View>
        </View>
      ),
      description: t('tutorial.step2.description'),
    },
    {
      title: t('tutorial.step3.title'),
      subtitle: t('tutorial.step3.subtitle'),
      renderGraphic: () => (
        <View style={styles.resultGraphicContainer}>
          <View style={styles.matchCircleMock}>
            <Text style={styles.matchCirclePercent}>100%</Text>
            <Text
              style={styles.matchCircleSub}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('tutorial.step3.matchRate')}
            </Text>
          </View>
          <View style={styles.repeatNoticeBox}>
            <Ionicons name="time-outline" size={16} color={COLORS.primaryDark} />
            <Text style={styles.repeatNoticeText}>{t('tutorial.step3.repeatNotice')}</Text>
          </View>
        </View>
      ),
      description: t('tutorial.step3.description'),
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
        <View
          style={[
            styles.container,
            SHADOWS.cardFloating,
            { width: Math.min(screenWidth - 36, 388) },
          ]}
        >
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
              <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Text style={styles.title}>{stepData.title}</Text>
            <Text style={styles.subtitle}>{stepData.subtitle}</Text>

            <View style={styles.graphicArea}>{stepData.renderGraphic()}</View>

            <Text style={styles.description}>{stepData.description}</Text>
          </ScrollView>

          <View style={styles.footer}>
            {currentStep > 0 ? (
              <TouchableOpacity
                onPress={() => setCurrentStep((prev) => prev - 1)}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>{t('tutorial.back')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backButtonPlaceholder} />
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={styles.nextButton}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText} numberOfLines={1}>
                {currentStep === steps.length - 1 ? t('tutorial.start') : t('tutorial.next')}
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
    padding: 18,
  },
  container: {
    maxHeight: '90%',
    backgroundColor: COLORS.background,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
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
    lineHeight: 18,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17.5,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 25,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  graphicArea: {
    width: '100%',
    minHeight: 184,
    backgroundColor: COLORS.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  description: {
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexShrink: 1,
  },
  backButtonPlaceholder: {
    width: 48,
  },
  backButtonText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    lineHeight: 19,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    flexShrink: 1,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  diagramContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  diagramSlot: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  diagramSideSlot: {
    flex: 1,
    minWidth: 0,
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
    lineHeight: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  diagramMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
  },
  diagramCenterCard: {
    width: 114,
    minHeight: 84,
    backgroundColor: COLORS.darkCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.darkCardBorder,
    flexShrink: 0,
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
    gap: 3,
  },
  diagramCategoryTag: {
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '100%',
  },
  diagramCategoryText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: COLORS.secondary,
    lineHeight: 12,
  },
  diagramCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.darkCardText,
    lineHeight: 16,
  },
  diagramSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    maxWidth: '100%',
  },
  diagramSwipeText: {
    fontSize: 8.5,
    color: COLORS.darkCardMuted,
    fontWeight: '600',
    lineHeight: 12,
  },
  secretGraphicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secretCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  secretUsersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  secretUserBox: {
    alignItems: 'center',
    flex: 1,
  },
  secretAvatar: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 4,
    maxWidth: '100%',
  },
  secretAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 16,
  },
  secretStatusText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 15,
  },
  resultGraphicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  matchCircleMock: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F2F7F4',
    borderWidth: 3,
    borderColor: COLORS.directions.UP.color,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  matchCirclePercent: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.directions.UP.color,
  },
  matchCircleSub: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    fontWeight: '700',
    lineHeight: 14,
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
    maxWidth: '100%',
  },
  repeatNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    flexShrink: 1,
    lineHeight: 17,
  },
});
