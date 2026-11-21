import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { TutorialModal } from '../components/TutorialModal';
import { COLORS, SHADOWS } from '../constants/theme';

export default function HomeScreen() {
  const {
    pairCode,
    isPairConnected,
    partnerName,
    myName,
    isMyCompleted,
    isPartnerCompleted,
    matchSummary,
    isTutorialVisible,
    completeTutorial,
    showTutorial,
    connectPair,
    resetAnswers,
  } = useApp();

  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCopyCode = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('招待コードをコピーしました', `「${pairCode}」をパートナーに送ってアプリに招待しましょう。`);
  };

  const handleConnect = () => {
    if (!inputCode.trim()) {
      Alert.alert('入力エラー', '招待コードを入力してください。');
      return;
    }
    connectPair(inputCode);
    Alert.alert('連携完了', 'パートナーと正常にペアリングされました。');
    setInputCode('');
  };

  // 今日の質問ボタンの挙動
  const handleQuizAction = () => {
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
      return '今日の質問へ進む（3問）';
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

  return (
    <View style={styles.outerContainer}>
      {/* 初回起動時（またはメニューからのリクエスト時）に表示されるウォークスルーチュートリアル */}
      <TutorialModal
        visible={isTutorialVisible}
        onClose={completeTutorial}
      />

      {/* ヘッダー右上にハンバーガーメニューアイコンを配置 */}
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

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* ウェルカムバナー */}
        <View style={styles.heroSection}>
          <View style={styles.heroBadge}>
            <Ionicons name="heart" size={13} color={COLORS.primary} />
            <Text style={styles.heroBadgeText}>二人同時4択スワイプ診断</Text>
          </View>
          <Text style={styles.heroTitle}>ふたりスワイプ</Text>
          <Text style={styles.heroSubtitle}>
            1日3問、4方向スワイプで答える。{'\n'}お互いが回答を終えて初めて結果がひらく。
          </Text>
        </View>

        {/* ペア連携ステータスカード */}
        <View style={[styles.card, SHADOWS.card]}>
          <View style={styles.cardHeader}>
            <Ionicons name="people" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>ペア連携状況</Text>
          </View>

          {isPairConnected ? (
            <View style={styles.pairedContainer}>
              <View style={styles.avatarRow}>
                <View style={styles.avatarBox}>
                  <View style={[styles.avatarCircle, { backgroundColor: '#FDF0EC' }]}>
                    <Text style={styles.avatarInitial}>{myName.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.avatarName}>{myName} (あなた)</Text>
                </View>

                <View style={styles.heartConnector}>
                  <Ionicons name="heart" size={22} color={COLORS.primary} />
                  <Text style={styles.connectedText}>連携中</Text>
                </View>

                <View style={styles.avatarBox}>
                  <View style={[styles.avatarCircle, { backgroundColor: '#F0F5F9' }]}>
                    <Text style={styles.avatarInitial}>{partnerName.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.avatarName}>{partnerName} (パートナー)</Text>
                </View>
              </View>

              <View style={styles.pairCodeInfo}>
                <Text style={styles.pairCodeLabel}>二人の招待コード：</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  activeOpacity={0.7}
                  onPress={handleCopyCode}
                >
                  <Text style={styles.pairCodeValue}>{pairCode}</Text>
                  <Ionicons
                    name={copied ? 'checkmark-circle' : 'copy-outline'}
                    size={15}
                    color={copied ? '#4A7C59' : COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.unpairedContainer}>
              <Text style={styles.unpairedDesc}>
                パートナーとペアリングして、今日の質問を一緒に始めましょう。
              </Text>

              {/* あなたのコード */}
              <View style={styles.myCodeBox}>
                <Text style={styles.inputLabel}>あなたの招待コード：</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.myCodeText}>{pairCode}</Text>
                  <TouchableOpacity style={styles.codeCopyBtn} onPress={handleCopyCode}>
                    <Text style={styles.codeCopyBtnText}>共有・コピー</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* パートナーのコード入力 */}
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>相手の招待コードを入力：</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="例: LOVE-1234"
                    value={inputCode}
                    onChangeText={setInputCode}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
                    <Text style={styles.connectButtonText}>連携する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* 今日の質問メインアクションカード */}
        <View style={[styles.card, SHADOWS.card, styles.actionCard]}>
          <View style={styles.actionHeader}>
            <View>
              <Text style={styles.actionTitle}>今日の3問</Text>
              <Text style={styles.actionDate}>
                {new Date().getMonth() + 1}月{new Date().getDate()}日 のお題
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          </View>

          <View style={styles.questionPreviewList}>
            <View style={styles.previewItem}>
              <Text style={styles.previewNumber}>Q1</Text>
              <Text style={styles.previewText}>どっちが家事に厳しい？</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={styles.previewNumber}>Q2</Text>
              <Text style={styles.previewText}>理想の休日はどう過ごしたい？</Text>
            </View>
            <View style={styles.previewItem}>
              <Text style={styles.previewNumber}>Q3</Text>
              <Text style={styles.previewText}>記念日や誕生日の過ごし方は？</Text>
            </View>
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

        {/* デバッグ用リセットボタン（画面最下部に控えめに配置） */}
        <View style={styles.debugSection}>
          <TouchableOpacity
            style={styles.resetButton}
            activeOpacity={0.7}
            onPress={() => {
              resetAnswers();
              Alert.alert('リセット完了', '回答状況を初期状態に戻しました。最初からスワイプを試せます。');
            }}
          >
            <Ionicons name="refresh-circle-outline" size={17} color={COLORS.textLight} />
            <Text style={styles.resetButtonText}>【動作確認用】回答状況を初期状態にリセット</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ========================================================
          ハンバーガーメニュー（スライドモーダル）
          ======================================================== */}
      <Modal
        visible={isMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.modalOverlay}>
          {/* 背景タップで閉じる */}
          <Pressable style={styles.backdrop} onPress={() => setIsMenuOpen(false)} />

          {/* 右から表示されるメニューパネル */}
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
              {/* ペア情報ミニバナー */}
              <View style={styles.drawerUserBanner}>
                <Ionicons name="heart" size={16} color={COLORS.primary} />
                <Text style={styles.drawerUserText}>
                  {myName} & {partnerName}
                </Text>
              </View>

              <View style={styles.drawerSectionDivider} />

              {/* メニュー項目1: 質問の回答比較タイムライン */}
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
                  <Text style={styles.menuItemSubtext}>出題履歴と二人の回答の変化</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              {/* メニュー項目2: 相性分析レポート（AI診断） */}
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
                  <Text style={styles.menuItemTitle}>二人の相性レポート</Text>
                  <Text style={styles.menuItemSubtext}>過去の回答からAIが傾向を分析</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>

              {/* メニュー項目3: 使い方チュートリアル */}
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

              {/* メニュー項目4: 招待コード共有 */}
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  handleCopyCode();
                }}
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

              {/* メニュー項目5: 回答状況リセット */}
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMenuOpen(false);
                  resetAnswers();
                  Alert.alert('リセット完了', '回答状況を初期状態に戻しました。');
                }}
              >
                <View style={[styles.menuItemIconBox, { backgroundColor: '#F4ECE4' }]}>
                  <Ionicons name="refresh-outline" size={20} color={COLORS.textMuted} />
                </View>
                <View style={styles.menuItemTextBox}>
                  <Text style={styles.menuItemTitle}>回答状況をリセット</Text>
                  <Text style={styles.menuItemSubtext}>動作確認用</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* ドロワー下部 */}
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
    marginVertical: 14,
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
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 6,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  pairedContainer: {
    alignItems: 'center',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 8,
  },
  avatarBox: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  avatarName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  heartConnector: {
    alignItems: 'center',
  },
  connectedText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },
  pairCodeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pairCodeLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pairCodeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  unpairedContainer: {},
  unpairedDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 12,
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
  actionCard: {
    borderColor: COLORS.primaryLight,
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
  debugSection: {
    alignItems: 'center',
    marginTop: 6,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  resetButtonText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '600',
  },

  // ----------------------------------------------------
  // ハンバーガーメニューモーダル
  // ----------------------------------------------------
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
