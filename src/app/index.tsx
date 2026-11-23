import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../context/AppContext';
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
    matchSummary,
    isTutorialVisible,
    completeTutorial,
    showTutorial,
    createPair,
    joinPair,
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
  const [submitting, setSubmitting] = useState(false);

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
    showAlert('連携完了', 'パートナーと正常にペアリングされました。');
    setInputCode('');
  };

  const handleLeavePair = () => {
    showConfirm(
      'ペアを解除しますか？',
      '解除すると、このペアから抜けます。誤って二人とも招待コードを作ってしまった場合のリカバリにも使えます。',
      '解除する',
      async () => {
        setIsMenuOpen(false);
        const res = await leavePair();
        if (!res.ok) {
          showAlert('エラー', res.error ?? 'ペア解除に失敗しました。');
        }
      }
    );
  };

  const handleDeleteAccount = () => {
    showConfirm(
      'アカウントとデータを削除',
      'あなたの回答データ・プロフィール・ペア情報がすべて削除されます。この操作は取り消せません。',
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
          title: 'ふたりスワイプ',
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
                  {pairCode ? (
                    <TouchableOpacity
                      style={styles.compactActionChip}
                      activeOpacity={0.7}
                      onPress={handleCopyCode}
                    >
                      <Text style={styles.compactCodeText}>{pairCode}</Text>
                      <Ionicons
                        name={copied ? 'checkmark-circle' : 'copy-outline'}
                        size={13}
                        color={copied ? '#4A7C59' : COLORS.textMuted}
                      />
                    </TouchableOpacity>
                  ) : null}
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
            </View>

            {/* 今日の質問メインアクションカード（連携済み時は最上部に配置） */}
            {renderActionCard()}
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
                    <Text style={styles.inputLabel}>パートナーの招待コードを入力して参加：</Text>
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
                  <Text style={styles.menuItemSubtext}>出題履歴・過去の未回答お題に回答</Text>
                </View>
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
                  <Text style={styles.menuItemSubtext}>AI分析＆過去質問への回答・閲覧を解放</Text>
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

              {pairCode ? (
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
              <Text style={styles.drawerVersionText}>ふたりスワイプ v1.0.0</Text>
            </View>
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
});
