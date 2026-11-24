import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { evaluateMatch } from '../constants/questions';
import { APP_DISPLAY_NAME, APP_SHORT_NAME } from '../lib/links';
import { showAlert } from '../lib/alert';
import { DayQuizData, SwipeDirection } from '../types';

function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function getOverallMatchComment(percentage: number, hasAnyBoth: boolean): string {
  if (!hasAnyBoth) return 'お互いの回答が揃うのを楽しみに待ちましょう';
  if (percentage === 100) return '息ぴったり！今日の感覚は完全にシンクロしています';
  if (percentage >= 67) return 'いい感じの相性！ズレた1問を話すとさらに仲が深まります';
  if (percentage >= 34) return '違いがあるから面白い！お互いの理由を聞いてみよう';
  return '新しい発見のチャンス！それぞれの価値観をゆっくり語り合おう';
}

function getConversationStarter(category: string): string {
  if (category.includes('暮らし') || category.includes('価値観')) {
    return '「どのくらいならお互い心地よい？」と二人のちょうどいい基準を話してみよう';
  }
  if (category.includes('休日') || category.includes('旅行')) {
    return '次の休みに「お互いの希望を半分ずつ叶えるプラン」を考えてみよう';
  }
  if (category.includes('記念日') || category.includes('イベント')) {
    return '次の記念日はどんな雰囲気で過ごしたいか、さりげなく伝え合ってみよう';
  }
  if (category.includes('連絡') || category.includes('コミュニケーション')) {
    return '普段のやり取りで「実はこうしてもらえると嬉しい」を1つずつ共有してみよう';
  }
  if (category.includes('食') || category.includes('デート')) {
    return '次に行ってみたいお店や一緒に食べたいものを1つずつ挙げてみよう';
  }
  if (category.includes('お金') || category.includes('将来')) {
    return '「ここには使いたい／ここは節約したい」を気軽にすり合わせてみよう';
  }
  if (category.includes('愛情') || category.includes('恋愛')) {
    return '最近うれしかった相手の行動や言葉を1つだけ伝えてみよう';
  }
  return 'どうしてその選択肢を選んだのか、理由を聞いてみると新しい発見があるかも！';
}

export default function ResultScreen() {
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const rawDate = Array.isArray(dateParam) ? dateParam[0] : dateParam;

  const {
    todayDate,
    isPartnerCompleted,
    isMyCompleted,
    isPairPremium,
    partnerName,
    myName,
    matchSummary,
    pairStats,
    loadDayQuizData,
  } = useApp();

  const isPastResult = Boolean(
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate !== todayDate
  );
  const targetDate = isPastResult ? rawDate! : todayDate;

  const [pastData, setPastData] = useState<DayQuizData | null>(null);
  const [loadingPast, setLoadingPast] = useState(isPastResult);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);

  // 当日モード: 双方完了していない場合はロック画面へ
  useEffect(() => {
    if (isPastResult) return;
    if (!isMyCompleted || !isPartnerCompleted) {
      router.replace('/waiting');
    }
  }, [isPastResult, isMyCompleted, isPartnerCompleted]);

  // 過去日モード: 完了した過去日の結果（双方回答・一致率）を取得
  useEffect(() => {
    if (!isPastResult) return;

    let active = true;
    void (async () => {
      try {
        const loaded = await loadDayQuizData(targetDate);
        if (active) {
          setPastData(loaded);
        }
      } finally {
        if (active) {
          setLoadingPast(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isPastResult, targetDate, loadDayQuizData]);

  const effectiveSummary = useMemo(() => {
    if (!isPastResult) return matchSummary;
    if (!pastData) {
      return { total: 0, matchedCount: 0, percentage: 0, details: [] };
    }

    const details = pastData.questions.map((q) => {
      const my = pastData.myAnswers[q.id];
      const partner = pastData.partnerAnswers[q.id];
      const isMatched = evaluateMatch(q, my, partner);
      return {
        question: q,
        myAnswer: my,
        partnerAnswer: partner,
        isMatched,
      };
    });

    const bothAnswered = details.filter((d) => d.myAnswer && d.partnerAnswer);
    const matchedCount = bothAnswered.filter((d) => d.isMatched).length;
    const total = bothAnswered.length;
    const percentage = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

    return {
      total,
      matchedCount,
      percentage,
      details,
    };
  }, [isPastResult, matchSummary, pastData]);

  const overallComment = getOverallMatchComment(
    effectiveSummary.percentage,
    effectiveSummary.total > 0
  );
  const isPerfectMatch =
    effectiveSummary.total > 0 && effectiveSummary.matchedCount === effectiveSummary.total;

  const handleShareText = async () => {
    const dateHeading = formatShortDate(targetDate);
    const streakLine =
      !isPastResult && pairStats.currentStreak > 0
        ? `\n🔥 連続 ${pairStats.currentStreak}日達成中`
        : '';
    const message =
      `💕 ${APP_DISPLAY_NAME}（${dateHeading}）\n` +
      `${myName} & ${partnerName} の一致率は ${effectiveSummary.percentage}%（${effectiveSummary.matchedCount}/${effectiveSummary.total}問一致）！` +
      `${streakLine}\n` +
      `${overallComment}\n` +
      `#${APP_SHORT_NAME} #カップル診断`;

    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        showAlert('シェア文をコピーしました', 'SNS や LINE にそのまま貼り付けて共有できます。');
        return;
      }
      await Share.share({ message });
    } catch {
      showAlert('シェアエラー', '共有シートを開けませんでした。');
    }
  };

  // 方向の日本語ラベルと色を取得
  const getDirectionBadge = (dir?: SwipeDirection) => {
    if (!dir) return { label: '未回答', color: '#B5AAA3', icon: 'help' as const };
    switch (dir) {
      case 'UP':
        return { label: '上', color: COLORS.directions.UP.color, icon: 'arrow-up' as const };
      case 'DOWN':
        return { label: '下', color: COLORS.directions.DOWN.color, icon: 'arrow-down' as const };
      case 'LEFT':
        return { label: '左', color: COLORS.directions.LEFT.color, icon: 'arrow-back' as const };
      case 'RIGHT':
        return { label: '右', color: COLORS.directions.RIGHT.color, icon: 'arrow-forward' as const };
    }
  };

  if (isPastResult && loadingPast) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: `${formatShortDate(targetDate)}の診断結果` }} />
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>結果を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen
        options={{
          title: isPastResult ? `${formatShortDate(targetDate)}の診断結果` : '診断結果',
        }}
      />

      {/* 一致率メインサークル */}
      <View style={[styles.rateCard, SHADOWS.card]}>
        <Text style={styles.rateSubtitle}>
          {isPastResult ? `${formatShortDate(targetDate)}の一致率` : '今日の一致率'}
        </Text>
        <View style={styles.percentageCircle}>
          <Text style={styles.percentageText}>{effectiveSummary.percentage}%</Text>
          <Text style={styles.matchedFractionText}>
            {effectiveSummary.matchedCount} / {effectiveSummary.total} 問一致
          </Text>
        </View>
        <Text style={styles.overallCommentText}>{overallComment}</Text>
        {isPastResult && effectiveSummary.total < effectiveSummary.details.length ? (
          <Text style={styles.partialNoteText}>
            ※ 双方回答済みの {effectiveSummary.total} 問から算出しています
          </Text>
        ) : null}

        {effectiveSummary.total > 0 && (
          <TouchableOpacity
            style={styles.shareTriggerBtn}
            activeOpacity={0.8}
            onPress={() => setIsShareModalVisible(true)}
          >
            <Ionicons name="share-social-outline" size={16} color={COLORS.primaryDark} />
            <Text style={styles.shareTriggerBtnText}>一致率カードをシェアする</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 全問一致時の会話きっかけバナー */}
      {isPerfectMatch && (
        <View style={styles.perfectTalkBanner}>
          <Ionicons name="sparkles" size={16} color="#4A7C59" />
          <Text style={styles.perfectTalkText}>
            全問一致の記念に「最近二人で一番笑った出来事」を1つずつ語り合ってみよう！
          </Text>
        </View>
      )}

      {/* 質問ごとの回答対比一覧 */}
      <View style={styles.sectionHeader}>
        <Ionicons name="chatbubbles" size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>回答の内訳・対比</Text>
      </View>

      <View style={styles.questionsList}>
        {effectiveSummary.details.map((item, index) => {
          const myBadge = getDirectionBadge(item.myAnswer);
          const partnerBadge = getDirectionBadge(item.partnerAnswer);
          const history = item.question.pastHistory;
          const hasBoth = Boolean(item.myAnswer && item.partnerAnswer);

          return (
            <View key={item.question.id} style={[styles.detailCard, SHADOWS.cardSmall]}>
              <View style={styles.detailCardHeader}>
                <View style={styles.qNumBox}>
                  <Text style={styles.qNumText}>Q{index + 1}</Text>
                </View>
                <Text style={styles.qTitleText}>{item.question.title}</Text>
                <View
                  style={[
                    styles.matchBadge,
                    !hasBoth
                      ? styles.matchBadgeSingle
                      : item.isMatched
                        ? styles.matchBadgeMatched
                        : styles.matchBadgeDiff,
                  ]}
                >
                  <Text
                    style={[
                      styles.matchBadgeText,
                      !hasBoth
                        ? styles.matchTextSingle
                        : item.isMatched
                          ? styles.matchTextMatched
                          : styles.matchTextDiff,
                    ]}
                  >
                    {!hasBoth ? '片方回答' : item.isMatched ? '一致' : '不一致'}
                  </Text>
                </View>
              </View>

              {/* 二人の回答比較 */}
              <View style={styles.answersCompareBox}>
                {/* 自分の回答 */}
                <View style={styles.answerRow}>
                  <View style={styles.userTag}>
                    <Text style={styles.userTagText} numberOfLines={1} ellipsizeMode="tail">
                      {myName} (あなた)
                    </Text>
                  </View>
                  <View style={styles.answerContent}>
                    <View style={[styles.dirIconBox, { backgroundColor: myBadge.color }]}>
                      <Ionicons name={myBadge.icon} size={13} color="#FFFFFF" />
                    </View>
                    <Text style={styles.answerText}>
                      {item.myAnswer ? item.question.choices[item.myAnswer] : '未回答'}
                    </Text>
                  </View>
                </View>

                {/* パートナーの回答 */}
                <View style={styles.answerRow}>
                  <View style={[styles.userTag, { backgroundColor: '#F0F5F9' }]}>
                    <Text
                      style={[styles.userTagText, { color: '#4D779E' }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {partnerName}
                    </Text>
                  </View>
                  <View style={styles.answerContent}>
                    <View style={[styles.dirIconBox, { backgroundColor: partnerBadge.color }]}>
                      <Ionicons name={partnerBadge.icon} size={13} color="#FFFFFF" />
                    </View>
                    <Text style={styles.answerText}>
                      {item.partnerAnswer
                        ? item.question.choices[item.partnerAnswer]
                        : '未回答'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 不一致時の会話きっかけの一言 */}
              {hasBoth && !item.isMatched && (
                <View style={styles.talkStarterBox}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.primaryDark} />
                  <View style={styles.talkStarterTextCol}>
                    <Text style={styles.talkStarterLabel}>会話のきっかけ</Text>
                    <Text style={styles.talkStarterText}>
                      {getConversationStarter(item.question.category)}
                    </Text>
                  </View>
                </View>
              )}

              {/* 過去との回答比較セクション（過去出題歴がある場合） */}
              {history && (
                <View style={styles.historyCompareContainer}>
                  <View style={styles.historyHeader}>
                    <Ionicons name="git-compare-outline" size={13} color={COLORS.primaryDark} />
                    <Text style={styles.historyHeaderText}>
                      過去との比較（{history.date}）
                    </Text>
                  </View>
                  <View style={styles.historyBox}>
                    <View style={styles.historyAnswerRow}>
                      <Text style={styles.historyLabel}>前回：</Text>
                      <Text style={styles.historyAnswerText}>
                        あなた「{history.myAnswer ? item.question.choices[history.myAnswer] : '未回答'}」 / {partnerName}「{history.partnerAnswer ? item.question.choices[history.partnerAnswer] : '未回答'}」
                      </Text>
                    </View>
                    <View style={styles.historyAnswerRow}>
                      <Text style={styles.historyLabel}>今回：</Text>
                      <Text style={[styles.historyAnswerText, styles.historyAnswerTextCurrent]}>
                        あなた「{item.myAnswer ? item.question.choices[item.myAnswer] : '未回答'}」 / {partnerName}「{item.partnerAnswer ? item.question.choices[item.partnerAnswer] : '未回答'}」
                      </Text>
                    </View>
                    {history.note && (
                      <Text style={styles.historyNoteText}>{history.note}</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* 過去の未回答日がある場合：結果確認直後の自然な遡り回答・プレミアム導線 */}
      {!isPastResult && pairStats.myPastUnansweredDays > 0 && (
        <View style={[styles.catchUpBanner, SHADOWS.cardSmall]}>
          <View style={styles.catchUpHeader}>
            <Ionicons
              name={isPairPremium ? 'calendar' : 'diamond'}
              size={15}
              color="#9E6B24"
            />
            <Text style={styles.catchUpTitle}>
              過去の未回答が {pairStats.myPastUnansweredDays}日分 残っています
            </Text>
          </View>
          <Text style={styles.catchUpText}>
            {isPairPremium
              ? '回答カレンダーから未回答の過去日をタップすると、続けて遡って回答できます。'
              : pairStats.pastPartnerAnsweredUnansweredDays > 0
                ? `うち ${pairStats.pastPartnerAnsweredUnansweredDays}日 は ${partnerName} さんが回答済み！プレミアムプランならカレンダーから遡って回答して、相手の答えと一致率を見られます。`
                : '答え忘れた過去日も、プレミアムプランなら回答カレンダーからいつでも遡って回答できます（片方の課金で2人とも利用OK）。'}
          </Text>
          {isPairPremium ? (
            <TouchableOpacity
              style={styles.catchUpPrimaryBtn}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: '/history', params: { openCalendar: '1' } })
              }
            >
              <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
              <Text style={styles.catchUpBtnText}>回答カレンダーから遡って回答する</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.catchUpActionsRow}>
              <TouchableOpacity
                style={styles.catchUpOutlineBtn}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({ pathname: '/history', params: { openCalendar: '1' } })
                }
              >
                <Text style={styles.catchUpOutlineBtnText}>カレンダーを見る</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.catchUpPremiumBtn}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/ai-report', params: { focus: 'plans' } })
                }
              >
                <Ionicons name="diamond" size={14} color="#FFFFFF" />
                <Text style={styles.catchUpBtnText}>プレミアムで遡る</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isPastResult && (
        <TouchableOpacity
          style={styles.historyBackButton}
          activeOpacity={0.8}
          onPress={() => router.replace('/history')}
        >
          <Ionicons name="calendar-outline" size={17} color="#FFFFFF" />
          <Text style={styles.historyBackButtonText}>過去の回答一覧へ戻る</Text>
        </TouchableOpacity>
      )}

      {/* ホームに戻るボタン */}
      <TouchableOpacity
        style={styles.homeButton}
        activeOpacity={0.8}
        onPress={() => router.replace('/')}
      >
        <Ionicons name="home-outline" size={17} color={COLORS.text} />
        <Text style={styles.homeButtonText}>ホームに戻る</Text>
      </TouchableOpacity>

      {/* シェア用「一致率カード」モーダル（個別回答を含めずスクショ＆テキスト共有対応） */}
      <Modal
        visible={isShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShareModalVisible(false)}
      >
        <View style={styles.shareModalOverlay}>
          <Pressable
            style={styles.shareModalBackdrop}
            onPress={() => setIsShareModalVisible(false)}
          />
          <View style={styles.shareModalSheet}>
            {/* SNS 映え専用シェアカード */}
            <View style={[styles.shareCard, SHADOWS.darkCardFloating]}>
              <View style={styles.shareCardAccent} />
              <View style={styles.shareCardBody}>
                <View style={styles.shareCardTopRow}>
                  <View style={styles.shareBrandPill}>
                    <Ionicons name="heart" size={11} color={COLORS.secondary} />
                    <Text style={styles.shareBrandText}>{APP_SHORT_NAME}</Text>
                  </View>
                  <Text style={styles.shareDateText}>{formatShortDate(targetDate)}</Text>
                </View>

                <Text style={styles.sharePairNames} numberOfLines={1}>
                  {myName}  ♥  {partnerName}
                </Text>

                <View style={styles.shareRing}>
                  <Text style={styles.shareRingLabel}>一致率</Text>
                  <Text style={styles.shareRingPercent}>{effectiveSummary.percentage}%</Text>
                  <Text style={styles.shareRingSub}>
                    {effectiveSummary.matchedCount} / {effectiveSummary.total} 問一致
                  </Text>
                </View>

                {!isPastResult && pairStats.currentStreak > 0 && (
                  <View style={styles.shareStreakChip}>
                    <Ionicons name="flame" size={13} color={COLORS.secondary} />
                    <Text style={styles.shareStreakText}>
                      連続 {pairStats.currentStreak}日達成中
                    </Text>
                  </View>
                )}

                <Text style={styles.shareCardComment}>{overallComment}</Text>
                <Text style={styles.shareCardFooterTag}>
                  #{APP_SHORT_NAME} ・ ふたりの価値観診断
                </Text>
              </View>
            </View>

            <Text style={styles.sharePrivacyHint}>
              ※ 個別の回答内容は含まれないため、このままスクショして SNS や LINE で綺麗に共有できます。
            </Text>

            <TouchableOpacity
              style={styles.shareActionBtn}
              activeOpacity={0.85}
              onPress={() => void handleShareText()}
            >
              <Ionicons name="paper-plane-outline" size={17} color="#FFFFFF" />
              <Text style={styles.shareActionBtnText}>LINE・SNS にテキストでシェア</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareCloseBtn}
              activeOpacity={0.75}
              onPress={() => setIsShareModalVisible(false)}
            >
              <Text style={styles.shareCloseBtnText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  rateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  percentageCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: COLORS.surface,
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  matchedFractionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: -2,
  },
  overallCommentText: {
    marginTop: 14,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  partialNoteText: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  shareTriggerBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
  },
  shareTriggerBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  perfectTalkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F7F4',
    borderWidth: 1,
    borderColor: '#C8E2D1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  perfectTalkText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#3B6347',
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  questionsList: {
    gap: 14,
    marginBottom: 22,
  },
  detailCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  qNumBox: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  qNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  qTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  matchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  matchBadgeMatched: {
    backgroundColor: '#F0F6F2',
  },
  matchBadgeDiff: {
    backgroundColor: '#FEF6EB',
  },
  matchBadgeSingle: {
    backgroundColor: COLORS.surface,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  matchTextMatched: {
    color: '#4A7C59',
  },
  matchTextDiff: {
    color: '#C97A2B',
  },
  matchTextSingle: {
    color: COLORS.textMuted,
  },
  answersCompareBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userTag: {
    backgroundColor: '#FDF1EC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 72,
    maxWidth: 132,
    flexShrink: 0,
    alignItems: 'center',
  },
  userTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  answerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  dirIconBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  talkStarterBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF9F4',
    borderWidth: 1,
    borderColor: '#F3DFD0',
    borderRadius: 12,
    padding: 10,
  },
  talkStarterTextCol: {
    flex: 1,
    gap: 2,
  },
  talkStarterLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  talkStarterText: {
    fontSize: 11.5,
    color: COLORS.text,
    lineHeight: 17,
  },
  historyCompareContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  historyHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  historyBox: {
    backgroundColor: '#FAF5EF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE0D2',
    gap: 4,
  },
  historyAnswerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  historyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    width: 40,
  },
  historyAnswerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  historyAnswerTextCurrent: {
    fontWeight: '700',
    color: COLORS.text,
  },
  historyNoteText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  historyBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 6,
    marginBottom: 10,
  },
  historyBackButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 6,
  },
  homeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  // ----------------------------------------------------
  // シェア用「一致率カード」モーダル
  // ----------------------------------------------------
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(24, 18, 15, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  shareModalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  shareModalSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.background,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shareCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.darkCardBorder,
    marginBottom: 12,
  },
  shareCardAccent: {
    height: 5,
    backgroundColor: COLORS.primary,
  },
  shareCardBody: {
    padding: 20,
    alignItems: 'center',
  },
  shareCardTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  shareBrandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(242, 160, 126, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  shareBrandText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },
  shareDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
  },
  sharePairNames: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.darkCardText,
    marginBottom: 16,
  },
  shareRing: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  shareRingLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
  },
  shareRingPercent: {
    fontSize: 38,
    fontWeight: '900',
    color: COLORS.secondary,
    letterSpacing: -1,
    marginVertical: -2,
  },
  shareRingSub: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.darkCardText,
  },
  shareStreakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(217, 117, 89, 0.2)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  shareStreakText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  shareCardComment: {
    fontSize: 12,
    color: COLORS.darkCardText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  shareCardFooterTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.darkCardMuted,
    letterSpacing: 0.4,
  },
  sharePrivacyHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 15,
    marginBottom: 8,
  },
  shareActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  shareCloseBtn: {
    alignItems: 'center',
    paddingVertical: 9,
  },
  shareCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  catchUpBanner: {
    backgroundColor: '#FFFBF3',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EED9B7',
  },
  catchUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  catchUpTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  catchUpText: {
    fontSize: 11.5,
    color: '#7A5B32',
    lineHeight: 17,
    marginBottom: 11,
  },
  catchUpActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catchUpOutlineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4C796',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  catchUpOutlineBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  catchUpPremiumBtn: {
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
  catchUpPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  catchUpBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
