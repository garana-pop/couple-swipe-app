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
import { useApp } from '../context/AppContext';
import { KotaeaiLogo } from '../components/KotaeaiLogo';
import { TutorialModal } from '../components/TutorialModal';
import { COLORS, SHADOWS } from '../constants/theme';
import { showAlert, showConfirm } from '../lib/alert';

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return `${m}月${d}日 のお題`;
}

export default function HomeScreen() {
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
      '招待コードをコピーしました',
      `「${pairCode}」をパートナーに送ってアプリに招待しましょう。`
    );
  };

  const handleCreatePair = async () => {
    setSubmitting(true);
    const res = await createPair();
    setSubmitting(false);
    if (!res.ok) {
      showAlert('作成エラー', res.error ?? 'ペアの作成に失敗しました。');
    }
  };

  const handleConnect = async () => {
    if (!inputCode.trim()) {
      showAlert('入力エラー', '招待コードを入力してください。');
      return;
    }
    setSubmitting(true);
    const res = await joinPair(inputCode.trim());
    setSubmitting(false);
    if (!res.ok) {
      showAlert('連携エラー', res.error ?? 'ペアリングに失敗しました。');
      return;
    }
    if (res.relinked) {
      showAlert(
        '再連携が完了しました',
        'パートナーとのペアに再連携し、これまでの回答履歴と記録を引き継ぎました。'
      );
    } else {
      showAlert('連携完了', 'パートナーと正常にペアリングされました。');
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
        showAlert('発行エラー', res.error ?? '再連携コードの発行に失敗しました。');
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
      '再連携コードをコピーしました',
      `「${relinkCode}」（5分間・1回限り有効）をパートナーへ送ってください。`
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
        showAlert('エラー', res.error ?? 'ペア解除に失敗しました。');
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
      'アカウントとデータを削除',
      'あなたの回答データ・プロフィール・ペア情報がすべて削除されます。この操作は取り消せません。\n\n※有料プランをご契約中の場合、アカウント削除だけでは自動更新は停止されません。Google Play の「定期購入」から解約手続きを行ってください。',
      '削除する',
      async () => {
        setIsMenuOpen(false);
        const res = await deleteAccount();
        if (res.ok) {
          showAlert('削除完了', 'アカウントとデータを削除しました。');
        } else {
          showAlert('エラー', res.error ?? '削除に失敗しました。');
        }
      }
    );
  };

  const handleSaveName = async () => {
    const res = await updateMyName(nameInput);
    if (!res.ok) {
      showAlert('エラー', res.error ?? '表示名の更新に失敗しました。');
      return;
    }
    setIsEditingName(false);
  };

  // 今日の質問ボタンの挙動
  const handleQuizAction = () => {
    if (isSupabaseReady && !hasPair) {
      showAlert('ペア連携が必要です', 'まずは招待コードを発行するか、パートナーのコードを入力してペアを作成してください。');
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
      return `今日の質問へ進む（${questions.length}問）`;
    } else if (!isPartnerCompleted) {
      return '相手の回答待ち（待機画面へ）';
    } else {
      return `結果を見る（一致率 ${matchSummary.percentage}%）`;
    }
  };

  const getStatusBadge = () => {
    if (!isMyCompleted) {
      return { text: '未回答', bg: '#FDF3E7', color: '#C97A2B' };
    } else if (!isPartnerCompleted) {
      return { text: '相手の回答待ち', bg: '#EFF5F9', color: '#4D779E' };
    } else {
      return { text: '双方回答完了', bg: '#F0F6F2', color: '#4A7C59' };
    }
  };

  const badge = getStatusBadge();

  const renderActionCard = () => (
    <View style={[styles.card, SHADOWS.card]}>
      <View style={styles.actionHeader}>
        <View>
          <Text style={styles.actionTitle}>今日の{questions.length}問</Text>
          <Text style={styles.actionDate}>{formatDisplayDate(todayDate)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.text}</Text>
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
            <Text style={styles.noticeBannerText}>
              Supabase 未設定のためローカル表示モードです。.env.local に接続情報を設定すると同期が有効になります。
            </Text>
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
                    <Text style={styles.compactActionChipText}>名前</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {isEditingName && (
                <View style={styles.compactNameEditBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="あなたの表示名"
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={20}
                  />
                  <TouchableOpacity style={styles.connectButton} onPress={handleSaveName}>
                    <Text style={styles.connectButtonText}>保存</Text>
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
                    連続 {pairStats.currentStreak}日
                  </Text>
                </View>

                <View style={styles.streakMetaGroup}>
                  <Text
                    style={[
                      styles.streakMetaText,
                      pairStats.myUnansweredDays > 0 && styles.streakMetaUnanswered,
                    ]}
                  >
                    未回答 {pairStats.myUnansweredDays}日
                  </Text>
                  {pairStats.overallMatchRate !== null ? (
                    <>
                      <Text style={styles.streakMetaDot}>•</Text>
                      <Text style={styles.streakMetaText}>
                        一致率 {pairStats.overallMatchRate}%
                      </Text>
                    </>
                  ) : null}
                  <Ionicons name="chevron-forward" size={13} color={COLORS.textLight} />
                </View>
              </TouchableOpacity>
            </View>

            {/* 今日の質問メインアクションカード（連携済み時は最上部に配置） */}
            {renderActionCard()}

            {/* 過去の未回答日がある場合：カレンダー確認＆プレミアム遡り回答の自然な導線 */}
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
                      過去の未回答お題が {pairStats.myPastUnansweredDays}日分 あります
                    </Text>
                  </View>
                </View>
                <Text style={styles.pastCatchUpDesc}>
                  {isPairPremium
                    ? 'プレミアム特典として、回答カレンダーから未回答の過去日をタップすると遡って回答できます。'
                    : pairStats.pastPartnerAnsweredUnansweredDays > 0
                      ? `${partnerName}さんが回答済みの日が ${pairStats.pastPartnerAnsweredUnansweredDays}日 あります。プレミアムプランならカレンダーから遡って回答して、相手の答えと一致率を見られます。`
                      : '答え忘れた日も、プレミアムプランなら回答カレンダーからいつでも遡って回答できます（片方の課金で2人とも利用OK）。'}
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
                      回答カレンダーから遡って回答する
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
                      <Text style={styles.pastCatchUpOutlineBtnText}>カレンダーで確認</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pastCatchUpPremiumBtn}
                      activeOpacity={0.85}
                      onPress={() =>
                        router.push({ pathname: '/ai-report', params: { focus: 'plans' } })
                      }
                    >
                      <Ionicons name="diamond" size={14} color="#FFFFFF" />
                      <Text style={styles.pastCatchUpPrimaryBtnText}>プレミアムで遡る</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {/* ウェルカムバナー（ヘッダーとのタイトル重複を解消） */}
            <View style={styles.heroSection}>
              <View style={styles.heroBadge}>
                <Ionicons name="heart" size={13} color={COLORS.primary} />
                <Text style={styles.heroBadgeText}>二人同時4択スワイプ診断</Text>
              </View>
              <Text style={styles.heroSubtitle}>
                1日3問、4方向スワイプで答える。{'\n'}お互いが回答を終えて初めて結果がひらく。
              </Text>
            </View>

            {/* ペア連携ステータスカード */}
            <View style={[styles.card, SHADOWS.card]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={20} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>ペア連携状況</Text>
                </View>
                <TouchableOpacity
                  style={styles.editNameTrigger}
                  onPress={() => {
                    setNameInput(myName);
                    setIsEditingName((v) => !v);
                  }}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primaryDark} />
                  <Text style={styles.editNameTriggerText}>名前: {myName}</Text>
                </TouchableOpacity>
              </View>

              {isEditingName && (
                <View style={styles.nameEditBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="あなたの表示名"
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={20}
                  />
                  <TouchableOpacity style={styles.connectButton} onPress={handleSaveName}>
                    <Text style={styles.connectButtonText}>保存</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!isInitialized ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.loadingText}>接続状態を確認中...</Text>
                </View>
              ) : hasPair ? (
                <View style={styles.unpairedContainer}>
                  <Text style={styles.unpairedDesc}>
                    招待コードを発行しました！パートナーがこのコードを入力するとペア連携が完了します。
                  </Text>

                  <View style={styles.myCodeBox}>
                    <Text style={styles.inputLabel}>あなたの招待コード（有効期限7日間）：</Text>
                    <View style={styles.codeRow}>
                      <Text style={styles.myCodeText}>{pairCode}</Text>
                      <TouchableOpacity style={styles.codeCopyBtn} onPress={handleCopyCode}>
                        <Text style={styles.codeCopyBtnText}>
                          {copied ? 'コピー済み' : 'コピー'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.pendingActionsRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={refreshState}>
                      <Ionicons name="refresh-outline" size={15} color={COLORS.primaryDark} />
                      <Text style={styles.secondaryBtnText}>参加を確認</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={async () => {
                        const res = await regenerateInviteCode();
                        if (!res.ok) showAlert('エラー', res.error);
                      }}
                    >
                      <Ionicons name="key-outline" size={15} color={COLORS.primaryDark} />
                      <Text style={styles.secondaryBtnText}>コード再発行</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleLeavePair}>
                      <Ionicons name="close-circle-outline" size={15} color="#B84A39" />
                      <Text style={[styles.secondaryBtnText, { color: '#B84A39' }]}>解除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.unpairedContainer}>
                  <Text style={styles.unpairedDesc}>
                    どちらか1人が「招待コードを発行」し、もう1人がコードを入力してペアリングしましょう。
                  </Text>

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
                        <Text style={styles.createPairBtnText}>新しいペアを作る（招待コード発行）</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>
                      パートナーの招待コード／再連携コードを入力して参加：
                    </Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.input}
                        placeholder="例: K7M9P2X4"
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
                        <Text style={styles.connectButtonText}>連携する</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* 今日の質問メインアクションカード */}
            {renderActionCard()}
          </>
        )}
      </ScrollView>

      {/* ハンバーガーメニュー（スライドモーダル） */}
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
              <Text style={styles.drawerTitle}>メニュー</Text>
              <TouchableOpacity
                onPress={() => setIsMenuOpen(false)}
                style={styles.closeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.drawerContent}>
              <View style={styles.drawerUserBanner}>
                <Ionicons name="heart" size={16} color={COLORS.primary} />
                <Text style={styles.drawerUserText}>
                  {isPairConnected ? `${myName} & ${partnerName}` : `${myName}（ペア未連携）`}
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
                  <Text style={styles.menuItemTitle}>過去の回答との比較</Text>
                  <Text style={styles.menuItemSubtext}>回答カレンダー・出題履歴・過去お題に回答</Text>
                </View>
                {pairStats.myUnansweredDays > 0 && (
                  <View style={styles.menuUnansweredBadge}>
                    <Text style={styles.menuUnansweredBadgeText}>
                      未回答 {pairStats.myUnansweredDays}日
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
                  <Text style={styles.menuItemTitle}>AI相性診断・プレミアム</Text>
                  <Text style={styles.menuItemSubtext}>過去日への遡り回答＆AI相性診断を解放</Text>
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
                  <Text style={styles.menuItemTitle}>通知・アカウント引き継ぎ</Text>
                  <Text style={styles.menuItemSubtext}>
                    {accountAuth.isAnonymous
                      ? 'リマインダー設定・Google連携（未連携）'
                      : 'リマインダー設定・Google連携済み'}
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
                  <Text style={styles.menuItemTitle}>アプリの使い方を見る</Text>
                  <Text style={styles.menuItemSubtext}>4択スワイプの操作ガイド</Text>
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
                    <Text style={styles.menuItemTitle}>パートナー再連携コードを発行</Text>
                    <Text style={styles.menuItemSubtext}>
                      再インストール・機種変更時の引き継ぎ（5分・1回限り）
                    </Text>
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
                    <Text style={styles.menuItemTitle}>招待コードを共有</Text>
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
                    <Text style={[styles.menuItemTitle, { color: '#B84A39' }]}>ペアを解除する</Text>
                    <Text style={styles.menuItemSubtext}>別の相手とペアを組み直す</Text>
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
                    <Text style={[styles.menuItemTitle, { color: '#B84A39' }]}>アカウント削除</Text>
                    <Text style={styles.menuItemSubtext}>すべてのデータを削除</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.drawerFooter}>
              <Text style={styles.drawerVersionText}>
                Kotaeai v{Constants.expoConfig?.version ?? '1.0.0'}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ペア解除確認モーダル（解除前の優しいAI振り返り導線付き） */}
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
            <View style={styles.confirmIconCircle}>
              <Ionicons name="unlink-outline" size={22} color="#B84A39" />
            </View>
            <Text style={styles.confirmTitle}>ペアを解除しますか？</Text>
            <Text style={styles.confirmMessage}>
              解除すると、このペアから抜けます。お互いが解除すると、これまでの回答履歴も削除されます。
              {'\n\n'}
              関係の見直しやお別れの整理をしたいときは、解除する前に二人の回答履歴からすれ違い・別れの原因を AI で優しく振り返ることもできます。
            </Text>

            <TouchableOpacity
              style={styles.reflectionGuideBtn}
              activeOpacity={0.85}
              disabled={leavingPair}
              onPress={handleOpenReflectionBeforeLeave}
            >
              <Ionicons name="heart-half-outline" size={16} color="#6F5A6B" />
              <Text style={styles.reflectionGuideBtnText}>
                解除前に、二人の回答履歴からすれ違い・別れの原因を AI で振り返る
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
                <Text style={styles.confirmCancelBtnText}>キャンセル</Text>
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
                  <Text style={styles.confirmDangerBtnText}>このまま解除する</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* パートナー再連携ワンタイムコード発行・再発行モーダル */}
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
            <View style={[styles.confirmIconCircle, { backgroundColor: '#F5ECE3' }]}>
              <Ionicons name="key-outline" size={22} color={COLORS.primaryDark} />
            </View>
            <Text style={styles.confirmTitle}>パートナー再連携コード</Text>
            <Text style={styles.confirmMessage}>
              {partnerName}さんがアプリを再インストール・機種変更して連携が切れた場合に使用します。
              {'\n'}
              コードは <Text style={styles.relinkBold}>5分間・1回限り有効</Text> で、再発行すると前のコードは自動で無効になります。
              {'\n'}
              ※相手が Google 連携済みの場合は、先に相手端末の「設定 ＞ Google ログインで復元」をお試しください。
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
                      ? '有効期限切れ（下のボタンから再発行できます）'
                      : `残り ${formatCountdown(relinkRemainingSec)} ・ 1回限り有効`}
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
                      {relinkCopied ? 'コピーしました' : 'コードをコピーして送る'}
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
                        <Text style={styles.confirmCancelBtnText}>コードを再発行</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmCancelBtn}
                      activeOpacity={0.8}
                      disabled={issuingRelink}
                      onPress={() => setIsRelinkModalOpen(false)}
                    >
                      <Text style={styles.confirmCancelBtnText}>閉じる</Text>
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
                  <Text style={styles.confirmCancelBtnText}>キャンセル</Text>
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
                    <Text style={styles.relinkPrimaryBtnText}>発行する（5分）</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
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
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
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
  },
  compactPairActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  },
  compactCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    letterSpacing: 0.6,
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  streakPillTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  streakMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakMetaText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
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
    lineHeight: 17,
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
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  editNameTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  editNameTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
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
  },
  unpairedContainer: {},
  unpairedDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  createPairBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  createPairBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
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
    marginTop: 6,
  },
  myCodeText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryDark,
    letterSpacing: 2,
  },
  codeCopyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  codeCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingActionsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  inputSection: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 42,
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
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  actionDate: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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
  },
  mainButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
    width: '78%',
    backgroundColor: COLORS.background,
    height: '100%',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 30,
    justifyContent: 'space-between',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
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
    marginBottom: 16,
  },
  drawerUserText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  drawerSectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5ECE3',
    gap: 12,
  },
  menuItemIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextBox: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  menuItemSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  drawerFooter: {
    alignItems: 'center',
    paddingTop: 16,
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
    padding: 22,
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 360,
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
    marginBottom: 10,
  },
  confirmMessage: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
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
    lineHeight: 17,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  confirmDangerBtn: {
    flex: 1,
    backgroundColor: '#B84A39',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDangerBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
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
  },
  relinkTimerPillExpired: {
    backgroundColor: '#FDECEC',
  },
  relinkTimerText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#3B6347',
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
  },
  relinkPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  relinkPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  relinkIssueBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
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
    fontSize: 13,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  pastCatchUpDesc: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 17,
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
  },
  menuUnansweredBadge: {
    backgroundColor: '#FDF3E7',
    borderWidth: 1,
    borderColor: '#EED4AE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
  menuUnansweredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9E6B24',
  },
});
