import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { KotaeaiLogo } from '../components/KotaeaiLogo';
import { TutorialModal } from '../components/TutorialModal';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentLocale } from '../i18n';
import { formatIsoShortDate } from '../i18n/format';
import { showAlert, showConfirm } from '../lib/alert';
import { getStoreName } from '../lib/links';

export default function HomeScreen() {
  const { t } = useTranslation();
  const locale = getCurrentLocale();
  const storeName = getStoreName();

  const {
    isInitialized,
    isLoading,
    isSupabaseReady,
    authError,
    accountAuth,
    hasPair,
    isPairConnected,
    pairCode,
    myName,
    partnerName,
    todayDate,
    questions,
    isMyCompleted,
    isPartnerCompleted,
    isPairPremium,
    matchSummary,
    pairStats,
    isTutorialVisible,
    completeTutorial,
    showTutorial,
    createPair,
    joinPair,
    issuePairRelinkCode,
    leavePair,
    regenerateInviteCode,
    updateMyName,
    refreshState,
    deleteAccount,
  } = useApp();

  const [inputCode, setInputCode] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leavingPair, setLeavingPair] = useState(false);
  const [isRelinkModalOpen, setIsRelinkModalOpen] = useState(false);
  const [relinkCode, setRelinkCode] = useState<string | null>(null);
  const [relinkExpiresAt, setRelinkExpiresAt] = useState<string | null>(null);
  const [relinkNowMs, setRelinkNowMs] = useState(() => Date.now());
  const [issuingRelink, setIssuingRelink] = useState(false);
  const [relinkCopied, setRelinkCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isRelinkModalOpen || !relinkExpiresAt) return;
    const timer = setInterval(() => {
      setRelinkNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isRelinkModalOpen, relinkExpiresAt]);

  const relinkRemainingSec = relinkExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(relinkExpiresAt) - relinkNowMs) / 1000))
    : 0;
  const isRelinkExpired = Boolean(relinkCode && relinkExpiresAt && relinkRemainingSec <= 0);
  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleCopyCode = async () => {
    if (!pairCode) return;
    await Clipboard.setStringAsync(pairCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showAlert(
      t('home.alerts.codeCopiedTitle'),
      t('home.alerts.codeCopiedBody', { code: pairCode })
    );
  };

  const handleCreatePair = async () => {
    setSubmitting(true);
    const res = await createPair();
    setSubmitting(false);
    if (!res.ok) {
      showAlert(t('home.alerts.createErrorTitle'), res.error ?? t('home.alerts.createErrorBody'));
    }
  };

  const handleConnect = async () => {
    if (!inputCode.trim()) {
      showAlert(t('home.alerts.inputErrorTitle'), t('home.alerts.inputErrorBody'));
      return;
    }
    setSubmitting(true);
    const res = await joinPair(inputCode.trim());
    setSubmitting(false);
    if (!res.ok) {
      showAlert(
        t('home.alerts.connectErrorTitle'),
        res.error ?? t('home.alerts.connectErrorBody')
      );
      return;
    }
    if (res.relinked) {
      showAlert(t('home.alerts.relinkedTitle'), t('home.alerts.relinkedBody'));
    } else {
      showAlert(t('home.alerts.connectedTitle'), t('home.alerts.connectedBody'));
    }
    setInputCode('');
  };

  const handleOpenRelinkModal = () => {
    setIsMenuOpen(false);
    setRelinkCopied(false);
    setRelinkNowMs(Date.now());
    setIsRelinkModalOpen(true);
  };

  const handleIssueRelinkCode = async () => {
    setIssuingRelink(true);
    try {
      const res = await issuePairRelinkCode();
      if (!res.ok || !res.code) {
        showAlert(t('home.alerts.issueErrorTitle'), res.error ?? t('errors.relinkIssueFailed'));
        return;
      }
      setRelinkCode(res.code);
      setRelinkExpiresAt(res.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString());
      setRelinkNowMs(Date.now());
      setRelinkCopied(false);
    } finally {
      setIssuingRelink(false);
    }
  };

  const handleCopyRelinkCode = async () => {
    if (!relinkCode) return;
    await Clipboard.setStringAsync(relinkCode);
    setRelinkCopied(true);
    setTimeout(() => setRelinkCopied(false), 2000);
    showAlert(
      t('home.alerts.relinkCopiedTitle'),
      t('home.alerts.relinkCopiedBody', { code: relinkCode })
    );
  };

  const handleLeavePair = () => {
    setIsMenuOpen(false);
    setIsLeaveModalOpen(true);
  };

  const handleConfirmLeavePair = async () => {
    setLeavingPair(true);
    try {
      const res = await leavePair();
      setIsLeaveModalOpen(false);
      if (!res.ok) {
        showAlert(t('common.error'), res.error ?? t('home.alerts.leaveErrorBody'));
      }
    } finally {
      setLeavingPair(false);
    }
  };

  const handleOpenReflectionBeforeLeave = () => {
    setIsLeaveModalOpen(false);
    router.push({ pathname: '/ai-report', params: { mode: 'reflection' } });
  };

  const handleDeleteAccount = () => {
    showConfirm(
      t('home.alerts.deleteConfirmTitle'),
      t('home.alerts.deleteConfirmBody', { storeName }),
      t('home.alerts.deleteConfirmAction'),
      async () => {
        setIsMenuOpen(false);
        const res = await deleteAccount();
        if (res.ok) {
          showAlert(t('home.alerts.deletedTitle'), t('home.alerts.deletedBody'));
        } else {
          showAlert(t('common.error'), res.error ?? t('home.alerts.deleteFailedBody'));
        }
      }
    );
  };

  const handleSaveName = async () => {
    const res = await updateMyName(nameInput);
    if (!res.ok) {
      showAlert(t('common.error'), res.error ?? t('errors.displayNameUpdateFailed'));
      return;
    }
    setIsEditingName(false);
  };

  const handleQuizAction = () => {
    if (isSupabaseReady && !hasPair) {
      showAlert(t('home.alerts.pairRequiredTitle'), t('home.alerts.pairRequiredBody'));
      return;
    }
    if (!isMyCompleted) {
      router.push('/quiz');
    } else if (!isPartnerCompleted) {
      router.push('/waiting');
    } else {
      router.push('/result');
    }
  };

  const getQuizButtonText = () => {
    if (!isMyCompleted) {
      return t('home.quizButton.start', { count: questions.length });
    } else if (!isPartnerCompleted) {
      return t('home.quizButton.waiting');
    } else {
      return t('home.quizButton.result', { percentage: matchSummary.percentage });
    }
  };

  const getStatusBadge = () => {
    if (!isMyCompleted) {
      return { text: t('home.status.unanswered'), bg: '#FDF3E7', color: '#C97A2B' };
    } else if (!isPartnerCompleted) {
      return { text: t('home.status.waitingPartner'), bg: '#EFF5F9', color: '#4D779E' };
    } else {
      return { text: t('home.status.bothCompleted'), bg: '#F0F6F2', color: '#4A7C59' };
    }
  };

  const badge = getStatusBadge();

  const renderActionCard = () => (
    <View style={[styles.card, SHADOWS.card]}>
      <View style={styles.actionHeader}>
        <View style={styles.actionHeaderLeft}>
          <Text style={styles.actionTitle}>
            {t('home.todayQuestionsTitle', { count: questions.length })}
          </Text>
          <Text style={styles.actionDate}>
            {t('home.todayTopicDate', { date: formatIsoShortDate(todayDate, locale) })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text
            style={[styles.statusBadgeText, { color: badge.color }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {badge.text}
          </Text>
        </View>
      </View>

      <View style={styles.questionPreviewList}>
        {questions.map((q, idx) => (
          <View key={q.id} style={styles.previewItem}>
            <Text style={styles.previewNumber}>Q{idx + 1}</Text>
            <Text style={styles.previewText} numberOfLines={1}>
              {q.title}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.mainButton}
        activeOpacity={0.8}
        onPress={handleQuizAction}
      >
        <Ionicons
          name={!isMyCompleted ? 'play' : !isPartnerCompleted ? 'lock-closed' : 'sparkles'}
          size={18}
          color="#FFFFFF"
        />
        <Text style={styles.mainButtonText}>{getQuizButtonText()}</Text>
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.outerContainer}>
      <TutorialModal visible={isTutorialVisible} onClose={completeTutorial} />

      <Stack.Screen
        options={{
          title: 'Kotaeai',
          headerTitleAlign: 'left',
          headerTitle: () => <KotaeaiLogo />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setIsMenuOpen(true)}
              style={styles.headerMenuButton}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="menu-outline" size={26} color={COLORS.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refreshState} tintColor={COLORS.primary} />
        }
      >
        {!isSupabaseReady && (
          <View style={styles.noticeBanner}>
            <Ionicons name="information-circle-outline" size={18} color="#9E6B24" />
            <Text style={styles.noticeBannerText}>{t('home.supabaseLocalNotice')}</Text>
          </View>
        )}

        {authError && (
          <View style={[styles.noticeBanner, { backgroundColor: '#FDECEC', borderColor: '#F5C2C2' }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#B84A39" />
            <Text style={[styles.noticeBannerText, { color: '#B84A39' }]}>{authError}</Text>
          </View>
        )}

        {isInitialized && isPairConnected ? (
          <>
            {/* コンパクトペアステータスバー */}
            <View style={[styles.compactPairBar, SHADOWS.cardSmall]}>
              <View style={styles.compactPairBarMain}>
                <View style={styles.compactPairIdentity}>
                  <View style={styles.compactAvatars}>
                    <View style={[styles.compactAvatarCircle, { backgroundColor: '#FDF0EC' }]}>
                      <Text style={styles.compactAvatarInitial}>{myName.slice(0, 1)}</Text>
                    </View>
                    <Ionicons name="heart" size={13} color={COLORS.primary} />
                    <View style={[styles.compactAvatarCircle, { backgroundColor: '#F0F5F9' }]}>
                      <Text style={styles.compactAvatarInitial}>{partnerName.slice(0, 1)}</Text>
                    </View>
                  </View>
                  <Text style={styles.compactPairNames} numberOfLines={1}>
                    {myName} & {partnerName}
                  </Text>
                </View>

                <View style={styles.compactPairActions}>
                  <TouchableOpacity
                    style={styles.compactActionChip}
                    activeOpacity={0.7}
                    onPress={() => {
                      setNameInput(myName);
                      setIsEditingName((v) => !v);
                    }}
                  >
                    <Ionicons name="create-outline" size={13} color={COLORS.primaryDark} />
                    <Text style={styles.compactActionChipText}>{t('home.editNameChip')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isEditingName && (
                <View style={styles.compactNameEditBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('home.namePlaceholder')}
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={20}
                  />
                  <TouchableOpacity style={styles.connectButton} onPress={handleSaveName}>
                    <Text style={styles.connectButtonText}>{t('common.save')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 連続回答ストリーク＆通算統計バー */}
              <TouchableOpacity
                style={styles.streakStatsRow}
                activeOpacity={0.75}
                onPress={() => router.push('/history')}
              >
                <View style={styles.streakPill}>
                  <Ionicons
                    name={pairStats.currentStreak > 0 ? 'flame' : 'flame-outline'}
                    size={14}
                    color={pairStats.currentStreak > 0 ? '#D97559' : COLORS.textMuted}
                  />
                  <Text
                    style={[
                      styles.streakPillText,
                      pairStats.currentStreak > 0 && styles.streakPillTextActive,
                    ]}
                  >
                    {t('home.streak', { count: pairStats.currentStreak })}
                  </Text>
                </View>

                <View style={styles.streakMetaGroup}>
                  <Text
                    style={[
                      styles.streakMetaText,
                      pairStats.myUnansweredDays > 0 && styles.streakMetaUnanswered,
                    ]}
                  >
                    {t('home.unansweredDays', { count: pairStats.myUnansweredDays })}
                  </Text>
                  {pairStats.overallMatchRate !== null ? (
                    <>
                      <Text style={styles.streakMetaDot}>•</Text>
                      <Text style={styles.streakMetaText}>
                        {t('home.matchRateShort', { percentage: pairStats.overallMatchRate })}
                      </Text>
                    </>
                  ) : null}
                  <Ionicons name="chevron-forward" size={13} color={COLORS.textLight} />
                </View>
              </TouchableOpacity>
            </View>

            {renderActionCard()}

            {/* 過去の未回答日がある場合 */}
            {pairStats.myPastUnansweredDays > 0 && (
              <View style={[styles.pastCatchUpCard, SHADOWS.cardSmall]}>
                <View style={styles.pastCatchUpHeader}>
                  <View style={styles.pastCatchUpTitleRow}>
                    <Ionicons
                      name={isPairPremium ? 'calendar' : 'diamond'}
                      size={15}
                      color="#9E6B24"
                    />
                    <Text style={styles.pastCatchUpTitle}>
                      {t('home.pastCatchUp.title', { count: pairStats.myPastUnansweredDays })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.pastCatchUpDesc}>
                  {isPairPremium
                    ? t('home.pastCatchUp.descPremium')
                    : pairStats.pastPartnerAnsweredUnansweredDays > 0
                      ? t('home.pastCatchUp.descPartnerAnswered', {
                          partnerName,
                          count: pairStats.pastPartnerAnsweredUnansweredDays,
                        })
                      : t('home.pastCatchUp.descFree')}
                </Text>

                {isPairPremium ? (
                  <TouchableOpacity
                    style={styles.pastCatchUpPrimaryBtn}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({ pathname: '/history', params: { openCalendar: '1' } })
                    }
                  >
                    <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.pastCatchUpPrimaryBtnText}>
                      {t('home.pastCatchUp.ctaPremium')}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.pastCatchUpActions}>
                    <TouchableOpacity
                      style={styles.pastCatchUpOutlineBtn}
                      activeOpacity={0.8}
                      onPress={() =>
                        router.push({ pathname: '/history', params: { openCalendar: '1' } })
                      }
                    >
                      <Ionicons name="calendar-outline" size={14} color="#8C5A1B" />
                      <Text style={styles.pastCatchUpOutlineBtnText} numberOfLines={2}>
                        {t('home.pastCatchUp.ctaCalendar')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pastCatchUpPremiumBtn}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({ pathname: '/ai-report', params: { focus: 'plans' } })
                      }
                    >
                      <Ionicons name="diamond" size={14} color="#FFFFFF" />
                      <Text style={styles.pastCatchUpPrimaryBtnText} numberOfLines={2}>
                        {t('home.pastCatchUp.ctaUpgrade')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {/* ウェルカムバナー */}
            <View style={styles.heroSection}>
              <View style={styles.heroBadge}>
                <Ionicons name="heart" size={13} color={COLORS.primary} />
                <Text style={styles.heroBadgeText}>{t('home.hero.badge')}</Text>
              </View>
              <Text style={styles.heroSubtitle}>{t('home.hero.subtitle')}</Text>
            </View>

            {/* ペア連携ステータスカード */}
            <View style={[styles.card, SHADOWS.card]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={20} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>{t('home.pairCard.title')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.editNameTrigger}
                  onPress={() => {
                    setNameInput(myName);
                    setIsEditingName((v) => !v);
                  }}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primaryDark} />
                  <Text style={styles.editNameTriggerText} numberOfLines={1}>
                    {t('home.editNameTrigger', { name: myName })}
                  </Text>
                </TouchableOpacity>
              </View>

              {isEditingName && (
                <View style={styles.nameEditBox}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('home.namePlaceholder')}
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={20}
                  />
                  <TouchableOpacity style={styles.connectButton} onPress={handleSaveName}>
                    <Text style={styles.connectButtonText}>{t('common.save')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!isInitialized ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.loadingText}>{t('home.pairCard.checking')}</Text>
                </View>
              ) : hasPair ? (
                <View style={styles.unpairedContainer}>
                  <Text style={styles.unpairedDesc}>{t('home.pairCard.codeIssuedDesc')}</Text>

                  <View style={styles.myCodeBox}>
                    <Text style={styles.inputLabel}>{t('home.pairCard.yourInviteCode')}</Text>
                    <View style={styles.codeRow}>
                      <Text style={styles.myCodeText}>{pairCode}</Text>
                      <TouchableOpacity style={styles.codeCopyBtn} onPress={handleCopyCode}>
                        <Text style={styles.codeCopyBtnText}>
                          {copied ? t('home.pairCard.copied') : t('home.pairCard.copy')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.pendingActionsRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={refreshState}>
                      <Ionicons name="refresh-outline" size={15} color={COLORS.primaryDark} />
                      <Text
                        style={styles.secondaryBtnText}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {t('home.pairCard.checkJoin')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={async () => {
                        const res = await regenerateInviteCode();
                        if (!res.ok) showAlert(t('common.error'), res.error);
                      }}
                    >
                      <Ionicons name="key-outline" size={15} color={COLORS.primaryDark} />
                      <Text
                        style={styles.secondaryBtnText}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {t('home.pairCard.regenerateCode')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleLeavePair}>
                      <Ionicons name="close-circle-outline" size={15} color="#B84A39" />
                      <Text
                        style={[styles.secondaryBtnText, { color: '#B84A39' }]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {t('home.pairCard.leave')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.unpairedContainer}>
                  <Text style={styles.unpairedDesc}>{t('home.pairCard.unpairedDesc')}</Text>

                  <TouchableOpacity
                    style={styles.createPairBtn}
                    activeOpacity={0.8}
                    disabled={submitting}
                    onPress={handleCreatePair}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.createPairBtnText}>
                          {t('home.pairCard.createPairBtn')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>{t('home.pairCard.enterCodeLabel')}</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        placeholder={t('home.pairCard.codePlaceholder')}
                        value={inputCode}
                        onChangeText={setInputCode}
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={styles.connectButton}
                        disabled={submitting}
                        onPress={handleConnect}
                      >
                        <Text style={styles.connectButtonText}>
                          {t('home.pairCard.connectBtn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {renderActionCard()}
          </>
        )}
      </ScrollView>

      {/* ハンバーガーメニュー（スクロール対応で多言語でも縦溢れ防止） */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setIsMenuOpen(false)} />

          <View style={[styles.menuDrawer, SHADOWS.cardFloating]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>{t('home.menu.title')}</Text>
              <TouchableOpacity
                onPress={() => setIsMenuOpen(false)}
                style={styles.closeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.drawerContent} showsVerticalScrollIndicator={false}>
              <View style={styles.drawerUserBanner}>
                <Ionicons name="heart" size={16} color={COLORS.primary} />
                <Text style={styles.drawerUserText} numberOfLines={2}>
                  {isPairConnected
                    ? `${myName} & ${partnerName}`
                    : t('home.menu.unpairedUser', { name: myName })}
                </Text>
              </View>

              <View style={styles.drawerSectionDivider} />

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMenuOpen(false);
                  router.push('/history');
                }}
              >
                <View style={[styles.menuItemIconBox, { backgroundColor: '#F0F5F9' }]}>
                  <Ionicons name="git-compare-outline" size={20} color="#4D779E" />
                </View>
                <View style={styles.menuItemTextBox}>
                  <Text style={styles.menuItemTitle}>{t('home.menu.historyTitle')}</Text>
                  <Text style={styles.menuItemSubtext}>{t('home.menu.historySub')}</Text>
                </View>
                {pairStats.myUnansweredDays > 0 && (
                  <View style={styles.menuUnansweredBadge}>
                    <Text style={styles.menuUnansweredBadgeText}>
                      {t('home.unansweredDays', { count: pairStats.myUnansweredDays })}
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMenuOpen(false);
                  router.push('/ai-report');
                }}
              >
                <View style={[styles.menuItemIconBox, { backgroundColor: '#FDF1EC' }]}>
                  <Ionicons name="analytics-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.menuItemTextBox}>
                  <Text style={styles.menuItemTitle}>{t('home.menu.aiTitle')}</Text>
                  <Text style={styles.menuItemSubtext}>{t('home.menu.aiSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMenuOpen(false);
                  router.push('/settings');
                }}
              >
                <View style={[styles.menuItemIconBox, { backgroundColor: '#FDF3E7' }]}>
                  <Ionicons name="notifications-outline" size={20} color="#C97A2B" />
                </View>
                <View style={styles.menuItemTextBox}>
                  <Text style={styles.menuItemTitle}>{t('home.menu.settingsTitle')}</Text>
                  <Text style={styles.menuItemSubtext}>
                    {accountAuth.isAnonymous
                      ? t('home.menu.settingsSubAnon')
                      : t('home.menu.settingsSubLinked')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMenuOpen(false);
                  showTutorial();
                }}
              >
                <View style={[styles.menuItemIconBox, { backgroundColor: '#F2F7F4' }]}>
                  <Ionicons name="help-circle-outline" size={20} color="#4A7C59" />
                </View>
                <View style={styles.menuItemTextBox}>
                  <Text style={styles.menuItemTitle}>{t('home.menu.tutorialTitle')}</Text>
                  <Text style={styles.menuItemSubtext}>{t('home.menu.tutorialSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              {isPairConnected ? (
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={handleOpenRelinkModal}
                >
                  <View style={[styles.menuItemIconBox, { backgroundColor: '#F5ECE3' }]}>
                    <Ionicons name="key-outline" size={20} color={COLORS.primaryDark} />
                  </View>
                  <View style={styles.menuItemTextBox}>
                    <Text style={styles.menuItemTitle}>{t('home.menu.relinkTitle')}</Text>
                    <Text style={styles.menuItemSubtext}>{t('home.menu.relinkSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              ) : pairCode ? (
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={handleCopyCode}
                >
                  <View style={[styles.menuItemIconBox, { backgroundColor: '#F5ECE3' }]}>
                    <Ionicons name="share-social-outline" size={20} color={COLORS.textMuted} />
                  </View>
                  <View style={styles.menuItemTextBox}>
                    <Text style={styles.menuItemTitle}>{t('home.menu.shareCodeTitle')}</Text>
                    <Text style={styles.menuItemSubtext}>{pairCode}</Text>
                  </View>
                  <Ionicons name="copy-outline" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              ) : null}

              {hasPair && (
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={handleLeavePair}
                >
                  <View style={[styles.menuItemIconBox, { backgroundColor: '#FDF1EC' }]}>
                    <Ionicons name="unlink-outline" size={20} color="#B84A39" />
                  </View>
                  <View style={styles.menuItemTextBox}>
                    <Text style={[styles.menuItemTitle, { color: '#B84A39' }]}>
                      {t('home.menu.leaveTitle')}
                    </Text>
                    <Text style={styles.menuItemSubtext}>{t('home.menu.leaveSub')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {isSupabaseReady && (
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={handleDeleteAccount}
                >
                  <View style={[styles.menuItemIconBox, { backgroundColor: '#FDECEC' }]}>
                    <Ionicons name="trash-outline" size={20} color="#B84A39" />
                  </View>
                  <View style={styles.menuItemTextBox}>
                    <Text style={[styles.menuItemTitle, { color: '#B84A39' }]}>
                      {t('home.menu.deleteTitle')}
                    </Text>
                    <Text style={styles.menuItemSubtext}>{t('home.menu.deleteSub')}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.drawerFooter}>
              <Text style={styles.drawerVersionText}>
                {t('app.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ペア解除確認モーダル */}
      <Modal
        visible={isLeaveModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!leavingPair) setIsLeaveModalOpen(false);
        }}
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!leavingPair) setIsLeaveModalOpen(false);
            }}
          />
          <View style={[styles.confirmDialog, SHADOWS.cardFloating]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.confirmIconCircle}>
                <Ionicons name="unlink-outline" size={22} color="#B84A39" />
              </View>
              <Text style={styles.confirmTitle}>{t('home.leaveModal.title')}</Text>
              <Text style={styles.confirmMessage}>{t('home.leaveModal.message')}</Text>

              <TouchableOpacity
                style={styles.reflectionGuideBtn}
                activeOpacity={0.85}
                disabled={leavingPair}
                onPress={handleOpenReflectionBeforeLeave}
              >
                <Ionicons name="heart-half-outline" size={16} color="#6F5A6B" />
                <Text style={styles.reflectionGuideBtnText}>
                  {t('home.leaveModal.reflectionGuide')}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#6F5A6B" />
              </TouchableOpacity>

              <View style={styles.confirmActionsRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  activeOpacity={0.8}
                  disabled={leavingPair}
                  onPress={() => setIsLeaveModalOpen(false)}
                >
                  <Text style={styles.confirmCancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmDangerBtn}
                  activeOpacity={0.85}
                  disabled={leavingPair}
                  onPress={() => void handleConfirmLeavePair()}
                >
                  {leavingPair ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmDangerBtnText}>
                      {t('home.leaveModal.confirmBtn')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* パートナー再連携ワンタイムコードモーダル */}
      <Modal
        visible={isRelinkModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!issuingRelink) setIsRelinkModalOpen(false);
        }}
      >
        <View style={styles.confirmOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!issuingRelink) setIsRelinkModalOpen(false);
            }}
          />
          <View style={[styles.confirmDialog, SHADOWS.cardFloating]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={[styles.confirmIconCircle, { backgroundColor: '#F5ECE3' }]}>
                <Ionicons name="key-outline" size={22} color={COLORS.primaryDark} />
              </View>
              <Text style={styles.confirmTitle}>{t('home.relinkModal.title')}</Text>
              <Text style={styles.confirmMessage}>
                {t('home.relinkModal.messageIntro', { partnerName })}
                {'\n'}
                {t('home.relinkModal.messageValidityPrefix')}
                <Text style={styles.relinkBold}>{t('home.relinkModal.messageValidityBold')}</Text>
                {t('home.relinkModal.messageValiditySuffix')}
                {'\n'}
                {t('home.relinkModal.messageGoogleNote')}
              </Text>

              {relinkCode ? (
                <View style={styles.relinkCodeBox}>
                  <Text
                    style={[
                      styles.relinkCodeValue,
                      isRelinkExpired && styles.relinkCodeValueExpired,
                    ]}
                    selectable
                  >
                    {relinkCode}
                  </Text>
                  <View
                    style={[
                      styles.relinkTimerPill,
                      isRelinkExpired && styles.relinkTimerPillExpired,
                    ]}
                  >
                    <Ionicons
                      name={isRelinkExpired ? 'alert-circle-outline' : 'time-outline'}
                      size={13}
                      color={isRelinkExpired ? '#B84A39' : '#4A7C59'}
                    />
                    <Text
                      style={[
                        styles.relinkTimerText,
                        isRelinkExpired && styles.relinkTimerTextExpired,
                      ]}
                    >
                      {isRelinkExpired
                        ? t('home.relinkModal.expired')
                        : t('home.relinkModal.remaining', {
                            time: formatCountdown(relinkRemainingSec),
                          })}
                    </Text>
                  </View>

                  <View style={styles.relinkActionStack}>
                    <TouchableOpacity
                      style={[
                        styles.relinkPrimaryBtn,
                        isRelinkExpired && styles.relinkPrimaryBtnDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={isRelinkExpired || issuingRelink}
                      onPress={() => void handleCopyRelinkCode()}
                    >
                      <Ionicons
                        name={relinkCopied ? 'checkmark-circle' : 'copy-outline'}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.relinkPrimaryBtnText}>
                        {relinkCopied
                          ? t('home.relinkModal.copiedBtn')
                          : t('home.relinkModal.copyBtn')}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.confirmActionsRow}>
                      <TouchableOpacity
                        style={styles.confirmCancelBtn}
                        activeOpacity={0.8}
                        disabled={issuingRelink}
                        onPress={() => void handleIssueRelinkCode()}
                      >
                        {issuingRelink ? (
                          <ActivityIndicator size="small" color={COLORS.primaryDark} />
                        ) : (
                          <Text style={styles.confirmCancelBtnText}>
                            {t('home.relinkModal.reissueBtn')}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.confirmCancelBtn}
                        activeOpacity={0.8}
                        disabled={issuingRelink}
                        onPress={() => setIsRelinkModalOpen(false)}
                      >
                        <Text style={styles.confirmCancelBtnText}>{t('common.close')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.confirmActionsRow}>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    activeOpacity={0.8}
                    disabled={issuingRelink}
                    onPress={() => setIsRelinkModalOpen(false)}
                  >
                    <Text style={styles.confirmCancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.relinkIssueBtn}
                    activeOpacity={0.85}
                    disabled={issuingRelink}
                    onPress={() => void handleIssueRelinkCode()}
                  >
                    {issuingRelink ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.relinkPrimaryBtnText}>
                        {t('home.relinkModal.issueBtn')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerMenuButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 8,
    maxWidth: '100%',
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    flexShrink: 1,
    lineHeight: 18,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  compactPairBar: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compactPairBarMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactPairIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  compactAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  compactAvatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compactAvatarInitial: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.text,
  },
  compactPairNames: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 19,
  },
  compactPairActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  compactActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  compactActionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    lineHeight: 16,
  },
  compactNameEditBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  streakStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF3EC',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  streakPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  streakPillTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  streakMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    flexShrink: 1,
  },
  streakMetaText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  streakMetaDot: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDF6E9',
    borderWidth: 1,
    borderColor: '#F0DEC0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  noticeBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#8C6226',
    lineHeight: 19,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 21,
  },
  editNameTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '48%',
    flexShrink: 0,
  },
  editNameTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    flexShrink: 1,
    lineHeight: 16,
  },
  nameEditBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  loadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  unpairedContainer: {},
  unpairedDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },
  createPairBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  createPairBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
  },
  myCodeBox: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  myCodeText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryDark,
    letterSpacing: 2,
    flexShrink: 1,
  },
  codeCopyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  codeCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  pendingActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  secondaryBtn: {
    flex: 1,
    minWidth: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 15,
  },
  inputSection: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#FFFFFF',
  },
  connectButton: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    flexShrink: 0,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  actionHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 24,
  },
  actionDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '48%',
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  questionPreviewList: {
    gap: 8,
    marginBottom: 16,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    width: 24,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 19,
  },
  mainButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 8,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 21,
  },
  modalOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  backdrop: {
    flex: 1,
  },
  menuDrawer: {
    width: '80%',
    maxWidth: 340,
    backgroundColor: COLORS.background,
    height: '100%',
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 28,
    justifyContent: 'space-between',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 24,
  },
  closeButton: {
    padding: 4,
  },
  drawerContent: {
    flex: 1,
  },
  drawerUserBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  drawerUserText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    lineHeight: 19,
  },
  drawerSectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F5ECE3',
    gap: 11,
  },
  menuItemIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuItemTextBox: {
    flex: 1,
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 19,
    marginBottom: 2,
  },
  menuItemSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  drawerFooter: {
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  drawerVersionText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(24, 18, 15, 0.45)',
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 368,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1,
  },
  confirmIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDF1EC',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 10,
  },
  confirmMessage: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 21,
    marginBottom: 16,
  },
  reflectionGuideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7F3F6',
    borderWidth: 1,
    borderColor: '#E5DCE2',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 16,
  },
  reflectionGuideBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#5E4B5B',
    lineHeight: 19,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmDangerBtn: {
    flex: 1,
    backgroundColor: '#B84A39',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDangerBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
  },
  relinkBold: {
    fontWeight: '800',
    color: COLORS.text,
  },
  relinkCodeBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  relinkCodeValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primaryDark,
    letterSpacing: 3.2,
    marginBottom: 8,
  },
  relinkCodeValueExpired: {
    color: COLORS.textLight,
    textDecorationLine: 'line-through',
  },
  relinkTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDF6F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 14,
    maxWidth: '100%',
  },
  relinkTimerPillExpired: {
    backgroundColor: '#FDECEC',
  },
  relinkTimerText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#3B6347',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 17,
  },
  relinkTimerTextExpired: {
    color: '#B84A39',
  },
  relinkActionStack: {
    width: '100%',
    gap: 8,
  },
  relinkPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  relinkPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  relinkPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  relinkIssueBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakMetaUnanswered: {
    color: '#C97A2B',
    fontWeight: '800',
  },
  pastCatchUpCard: {
    backgroundColor: '#FFFBF3',
    borderRadius: 18,
    padding: 15,
    marginTop: 2,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EED9B7',
  },
  pastCatchUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pastCatchUpTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  pastCatchUpTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#8C5A1B',
    lineHeight: 19,
  },
  pastCatchUpDesc: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 19,
    marginBottom: 12,
  },
  pastCatchUpActions: {
    flexDirection: 'row',
    gap: 8,
  },
  pastCatchUpOutlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4C796',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  pastCatchUpOutlineBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#8C5A1B',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 16,
  },
  pastCatchUpPremiumBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#C87D28',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  pastCatchUpPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  pastCatchUpPrimaryBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 16,
  },
  menuUnansweredBadge: {
    backgroundColor: '#FDF3E7',
    borderWidth: 1,
    borderColor: '#EED4AE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
    flexShrink: 0,
  },
  menuUnansweredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9E6B24',
    lineHeight: 14,
  },
});
