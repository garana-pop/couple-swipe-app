import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { showAlert } from '../lib/alert';
import { LEGAL_URLS, openExternalLink } from '../lib/links';
import {
  BillingOfferingPrices,
  fetchPairAiReportHistory,
  fetchPairEntitlement,
  generateServerAiReport,
  initializeBilling,
  purchaseSubscriptionPlan,
  restoreSubscriptionPurchases,
  syncAndFetchPairEntitlement,
} from '../lib/billing';
import type { AiReportData, PairAiReportRecord, PairEntitlement } from '../types';

function formatPlanName(productId: string | null | undefined): string {
  const raw = (productId ?? '').toLowerCase();
  if (raw.includes('year') || raw.includes('annual')) return '年額プラン';
  if (raw.includes('month')) return '月額プラン';
  return 'ふたりプレミアムプラン';
}

const SAMPLE_REPORT: AiReportData = {
  overallScore: 84,
  myType: {
    tag: 'しっかり計画派リーダー',
    desc: '見通しを立てて安心したいタイプ。ルールや時間を大切にする傾向。',
  },
  partnerType: {
    tag: '柔軟な癒やしマイペース',
    desc: 'その場の空気や気分を大切にするタイプ。大らかで包容力がある。',
  },
  chemistrySummary:
    '「計画性」と「柔軟性」という正反対の長所を持つ補完関係です。一方がリードし、もう一方が場を和ませる理想的な凸凹ペア！',
  riskPoints: [
    {
      title: '家事・ルールの基準の違い',
      level: '中',
      desc: '「家事に厳しい度」の回答差から、掃除や片付けのタイミングで不満が溜まりやすい傾向があります。',
      advice:
        '「気づいた方がやる」ではなく、「ゴミ出しは相手、水回りは私」のように明確に分担を可視化しましょう。',
    },
    {
      title: '休日の過ごし方の温度差',
      level: '低',
      desc: '外出派とのんびり派で適度な自由時間を尊重し合えているため、現在のところ良好です。',
      advice: '月1回はお互いが主役の休日を交互に企画すると、さらに満足度が上がります。',
    },
  ],
  nextActionTip: '週末にカフェで15分だけ、お互いが最近嬉しかったことを1つずつ共有してみましょう。',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AiReportScreen() {
  const {
    userId,
    pairId,
    isSupabaseReady,
    isPairConnected,
    partnerName,
    myName,
    getQuestionsById,
    fetchHistory,
  } = useApp();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [loadingEntitlement, setLoadingEntitlement] = useState(true);
  const [entitlement, setEntitlement] = useState<PairEntitlement | null>(null);
  const [reportHistory, setReportHistory] = useState<PairAiReportRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [offering, setOffering] = useState<BillingOfferingPrices>({
    isStoreReady: false,
    yearlyPriceLabel: '¥3,000 / 年',
    yearlyPerMonthLabel: '月250円相当・2人共有',
    yearlyDiscountBadge: '月額比 50% OFF',
    monthlyPriceLabel: '¥500 / 月',
  });
  const [generating, setGenerating] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const applyEntitlement = useCallback(
    async (ent: PairEntitlement | null) => {
      if (!ent) return;
      setEntitlement(ent);
      if (ent.isPremium && pairId) {
        const hist = await fetchPairAiReportHistory(pairId, 20);
        if (hist.length > 0) {
          setReportHistory(hist);
          setSelectedReportId((prev) =>
            prev && hist.some((r) => r.id === prev) ? prev : hist[0].id
          );
        } else if (ent.latestReport) {
          setReportHistory([ent.latestReport]);
          setSelectedReportId(ent.latestReport.id);
        } else {
          setReportHistory([]);
          setSelectedReportId(null);
        }
      } else {
        setReportHistory(ent.latestReport ? [ent.latestReport] : []);
        setSelectedReportId(ent.latestReport?.id ?? null);
      }
    },
    [pairId]
  );

  const refreshEntitlementAndBilling = useCallback(async () => {
    const [ent, offer] = await Promise.all([
      isSupabaseReady ? fetchPairEntitlement() : Promise.resolve(null),
      userId ? initializeBilling(userId) : Promise.resolve(null),
    ]);
    await applyEntitlement(ent);
    if (offer) {
      setOffering(offer);
    }
  }, [isSupabaseReady, userId, applyEntitlement]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await refreshEntitlementAndBilling();
      } finally {
        if (active) setLoadingEntitlement(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshEntitlementAndBilling]);

  const isPremium = Boolean(entitlement?.isPremium);
  const latestReportRecord = reportHistory[0] ?? entitlement?.latestReport ?? null;
  const activeReportRecord =
    reportHistory.find((r) => r.id === selectedReportId) ?? latestReportRecord;
  const isViewingOlderReport = Boolean(
    isPremium &&
      activeReportRecord &&
      latestReportRecord &&
      activeReportRecord.id !== latestReportRecord.id
  );
  const displayReport: AiReportData =
    isPremium && activeReportRecord ? activeReportRecord.report : SAMPLE_REPORT;
  const isShowingSample = !isPremium || !activeReportRecord;

  const handleGenerateReport = async (forceRefresh: boolean) => {
    if (!isSupabaseReady) {
      showAlert('未接続', 'Supabase に接続してからお試しください。');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateServerAiReport(getQuestionsById(), forceRefresh);
      if (!res.ok) {
        showAlert('AI診断エラー', res.error ?? 'レポートの生成に失敗しました。');
        return;
      }
      if (res.reportRecord) {
        const nextRec = res.reportRecord;
        setReportHistory((prev) => {
          const withoutDup = prev.filter((item) => item.id !== nextRec.id);
          return [nextRec, ...withoutDup];
        });
        setSelectedReportId(nextRec.id);
      }
      if (res.cached) {
        showAlert(
          '最新レポートを表示中',
          '前回の分析から新しい回答が増えていないため、最新の分析結果を表示しています。'
        );
      } else {
        showAlert('AI診断が完了しました', '最新の回答データから二人の相性レポートを作成しました！');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSubscribe = async () => {
    if (!offering.isStoreReady) {
      showAlert(
        'ストア課金について',
        offering.unavailableReason ??
          '現在ストア課金の準備中です。公開までしばらくお待ちください。'
      );
      return;
    }

    setPurchasing(true);
    try {
      const res = await purchaseSubscriptionPlan(selectedPlan);
      if (res.cancelled) return;
      if (!res.ok) {
        showAlert('購入エラー', res.error ?? '購入処理に失敗しました。');
        return;
      }

      // サーバー側で即時同期（sync-subscription ＋ Webhook 到着待ちリトライ）
      const syncedEnt = await syncAndFetchPairEntitlement(true);
      await applyEntitlement(syncedEnt);
      if (syncedEnt?.isPremium) {
        void fetchHistory();
        showAlert(
          'ご加入ありがとうございます！',
          `${myName}さんと${partnerName}さんのペアで「ふたりプレミアムプラン」が有効になりました。AI相性診断と、過去の未回答質問への回答・相手の結果閲覧が解放されています。`
        );
      } else {
        showAlert(
          'ご購入ありがとうございます',
          '決済が完了しました。ご契約状態の反映に数秒かかる場合があります。画面を切り替えても反映されない場合は「以前の購入を復元する」をお試しください。'
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const res = await restoreSubscriptionPurchases();
      if (!res.ok) {
        showAlert('復元エラー', res.error ?? '購入情報の復元に失敗しました。');
        return;
      }

      const syncedEnt = await syncAndFetchPairEntitlement(Boolean(res.hasActiveEntitlement));
      await applyEntitlement(syncedEnt);
      if (syncedEnt?.isPremium) {
        void fetchHistory();
        showAlert(
          '購入を復元しました',
          '「ふたりプレミアムプラン」のご契約を確認し、すべてのプレミアム機能を解放しました。'
        );
      } else if (!res.hasActiveEntitlement) {
        showAlert(
          '有効なご契約が見つかりませんでした',
          'この Google アカウントに紐づく有効な定期購入が見つかりませんでした。購入時と同じ Google アカウントで Google Play にログインしているかご確認ください。'
        );
      } else {
        showAlert(
          '復元処理を受け付けました',
          '契約情報の反映に数秒かかる場合があります。少し時間をおいて画面を開き直してください。'
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* プレミアムバナー */}
      <View style={styles.heroBanner}>
        <View style={styles.badgeRow}>
          <Ionicons name="sparkles" size={15} color="#F2A07E" />
          <Text style={styles.badgeText}>AI COUPLE ANALYSIS</Text>
        </View>
        <Text style={styles.heroTitle}>ふたりの深層AI診断レポート</Text>
        <Text style={styles.heroDesc}>
          毎日のスワイプ回答履歴（自分が未回答だった過去の日の相手の回答も含む）をAIが分析し、性格傾向や価値観のすれ違い予防策をレポートします。
        </Text>
        <View style={styles.shareBadge}>
          <Ionicons
            name={isPremium ? 'checkmark-circle' : 'gift-outline'}
            size={14}
            color="#FFFFFF"
          />
          <Text style={styles.shareBadgeText}>
            {isPremium
              ? entitlement?.paidByPartner && !entitlement?.paidByMe
                ? `${partnerName}さんのプランで解放済み！`
                : 'ふたりプレミアムプラン有効中'
              : '片方の課金でパートナーも一緒に閲覧OK！'}
          </Text>
        </View>
      </View>

      {/* 有料ペア向け：実レポート生成／更新アクションカード */}
      {loadingEntitlement ? (
        <View style={[styles.card, SHADOWS.card, styles.loadingBox]}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>課金状態と最新レポートを確認中...</Text>
        </View>
      ) : isPremium ? (
        <View style={[styles.card, SHADOWS.card, styles.premiumControlCard]}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color="#4A7C59" />
            <Text style={styles.cardTitle}>
              {latestReportRecord ? '最新のAI診断レポート' : '最初のAIレポートを作成しましょう'}
            </Text>
          </View>
          {entitlement && (
            <View style={styles.subStatusPill}>
              <Ionicons name="diamond" size={13} color="#4A7C59" />
              <Text style={styles.subStatusPillText}>
                {formatPlanName(entitlement.productId)}（
                {entitlement.paidByPartner && !entitlement.paidByMe
                  ? `${partnerName}さんの契約を共有`
                  : 'ご契約中'}
                ）
                {entitlement.expiresAt
                  ? entitlement.status === 'grace_period'
                    ? ` ・ お支払い確認中（${formatShortDate(entitlement.expiresAt)}まで）`
                    : entitlement.willRenew
                      ? ` ・ 次回更新 ${formatShortDate(entitlement.expiresAt)}`
                      : ` ・ ${formatShortDate(entitlement.expiresAt)}まで利用可（自動更新停止）`
                  : ''}
              </Text>
            </View>
          )}
          <Text style={styles.premiumMetaText}>
            分析対象データ：計 {entitlement?.analyzableDaysCount ?? 0}日分（双方回答{' '}
            {entitlement?.revealedDaysCount ?? 0}日
            {(entitlement?.pastPartnerOnlyDaysCount ?? 0) > 0
              ? ` ＋ 過去未回答日の相手回答 ${entitlement?.pastPartnerOnlyDaysCount}日`
              : ''}
            ）
            {latestReportRecord
              ? `\n最終更新: ${formatDateTime(latestReportRecord.createdAt)}（${latestReportRecord.analyzedAnswers}問を分析）`
              : ''}
            {(entitlement?.pastUnansweredDaysCount ?? 0) > 0
              ? `\n※ 過去の未回答お題が ${entitlement?.pastUnansweredDaysCount}日分 あります。「過去の回答との比較」から後から回答して相手の結果を見られます。`
              : '\n※ 過去の未回答お題は「過去の回答との比較」からいつでも回答できます。'}
          </Text>

          {(entitlement?.pastUnansweredDaysCount ?? 0) > 0 && (
            <TouchableOpacity
              style={styles.pastCatchUpBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/history')}
            >
              <Ionicons name="play-circle-outline" size={16} color="#8C5A1B" />
              <Text style={styles.pastCatchUpBtnText}>
                過去の未回答お題（{entitlement?.pastUnansweredDaysCount}日分）に回答する
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#8C5A1B" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.generateBtn}
            activeOpacity={0.85}
            disabled={generating || !isPairConnected}
            onPress={() => void handleGenerateReport(Boolean(latestReportRecord))}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={17} color="#FFFFFF" />
                <Text style={styles.generateBtnText}>
                  {latestReportRecord ? '最新データでレポートを更新する' : 'AI相性レポートを生成する'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sampleNoticeBanner}>
          <Ionicons name="eye-outline" size={16} color="#9E6B24" />
          <Text style={styles.sampleNoticeText}>
            以下はサンプルプレビューです。プレミアムプランに加入（またはパートナーが加入）すると、二人の実データ（双方回答 {entitlement?.revealedDaysCount ?? 0}日分
            {(entitlement?.pastPartnerOnlyDaysCount ?? 0) > 0
              ? `＋あなたが未回答の過去日 ${entitlement?.pastPartnerOnlyDaysCount}日分`
              : ''}
            ）から AI が専用レポートを生成し、過去の未回答の質問にも後から回答して相手の結果を見られるようになります。
          </Text>
        </View>
      )}

      {/* 有料ペア向け：過去のAI診断アーカイブ（横並びで見返し＆比較） */}
      {isPremium && reportHistory.length > 0 && (
        <View style={styles.archiveSection}>
          <View style={styles.archiveHeader}>
            <View style={styles.archiveTitleRow}>
              <Ionicons name="albums-outline" size={16} color={COLORS.primaryDark} />
              <Text style={styles.archiveTitle}>
                AI診断アーカイブ（全 {reportHistory.length}件）
              </Text>
            </View>
            {isViewingOlderReport && latestReportRecord && (
              <TouchableOpacity
                style={styles.backLatestBtn}
                onPress={() => setSelectedReportId(latestReportRecord.id)}
              >
                <Text style={styles.backLatestBtnText}>最新へ戻す</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.archiveScrollContent}
          >
            {reportHistory.map((item, idx) => {
              const isSelected = activeReportRecord?.id === item.id;
              const prevItem = reportHistory[idx + 1];
              const delta = prevItem
                ? item.report.overallScore - prevItem.report.overallScore
                : null;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.archiveCard,
                    SHADOWS.cardSmall,
                    isSelected && styles.archiveCardActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedReportId(item.id)}
                >
                  <View style={styles.archiveCardTop}>
                    <Text style={[styles.archiveDate, isSelected && styles.archiveDateActive]}>
                      {formatShortDate(item.createdAt)}
                    </Text>
                    {idx === 0 && (
                      <View style={styles.latestChip}>
                        <Text style={styles.latestChipText}>最新</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.archiveScoreRow}>
                    <Text style={[styles.archiveScore, isSelected && styles.archiveScoreActive]}>
                      {item.report.overallScore}
                      <Text style={styles.archiveScoreUnit}>点</Text>
                    </Text>
                    {delta !== null && (
                      <Text
                        style={[
                          styles.archiveDelta,
                          {
                            color:
                              delta > 0 ? '#4A7C59' : delta < 0 ? '#C85338' : COLORS.textMuted,
                          },
                        ]}
                      >
                        {delta > 0 ? `▲+${delta}` : delta < 0 ? `▼${delta}` : '±0'}
                      </Text>
                    )}
                  </View>

                  <Text style={styles.archiveMeta}>
                    {item.analyzedDays}日・{item.analyzedAnswers}問
                  </Text>
                  <Text style={styles.archiveTags} numberOfLines={1}>
                    {item.report.myType.tag} × {item.report.partnerType.tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {isViewingOlderReport && activeReportRecord && (
            <View style={styles.olderViewingBanner}>
              <Ionicons name="time-outline" size={14} color={COLORS.primaryDark} />
              <Text style={styles.olderViewingText}>
                {formatDateTime(activeReportRecord.createdAt)} に生成した過去レポートを表示中です
              </Text>
            </View>
          )}
        </View>
      )}

      {/* セクション1: AI性格タイプ分析 */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeaderBetween}>
          <View style={styles.cardHeaderInline}>
            <Ionicons name="analytics" size={19} color={COLORS.primary} />
            <Text style={styles.cardTitle}>AI性格タイプ・ケミストリー</Text>
          </View>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>
              {isShowingSample ? 'サンプル' : `相性 ${displayReport.overallScore}点`}
            </Text>
          </View>
        </View>

        <View style={styles.coupleTypes}>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser}>{myName}</Text>
            <Text style={styles.typeTag}>{displayReport.myType.tag}</Text>
            <Text style={styles.typeDesc}>{displayReport.myType.desc}</Text>
          </View>
          <View style={styles.plusSign}>
            <Text style={styles.plusText}>×</Text>
          </View>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser}>{partnerName}</Text>
            <Text style={styles.typeTag}>{displayReport.partnerType.tag}</Text>
            <Text style={styles.typeDesc}>{displayReport.partnerType.desc}</Text>
          </View>
        </View>

        <View style={styles.chemistryNote}>
          <Text style={styles.chemistryTitle}>AI分析サマリー</Text>
          <Text style={styles.chemistryText}>{displayReport.chemistrySummary}</Text>
        </View>
      </View>

      {/* セクション2: すれ違い予防・別れの原因診断 */}
      <View style={[styles.card, SHADOWS.card, styles.riskCard]}>
        <View style={styles.riskHeader}>
          <View style={styles.riskBadge}>
            <Ionicons name="warning" size={13} color="#C85338" />
            <Text style={styles.riskBadgeText}>
              {isShowingSample ? 'サンプルプレビュー' : '要注意ポイント'}
            </Text>
          </View>
          <Text style={styles.riskTitle}>すれ違い予防診断（AI予測）</Text>
        </View>

        <Text style={styles.riskLead}>
          過去のスワイプ履歴から、将来ふたりが衝突しやすい「すれ違いトリガー」と対策を整理しました。
        </Text>

        {displayReport.riskPoints.map((risk, idx) => (
          <View key={`${risk.title}-${idx}`} style={styles.riskItem}>
            <View style={styles.riskMeterRow}>
              <Text style={styles.riskItemTitle}>
                {idx + 1}. {risk.title}
              </Text>
              <Text style={styles.riskItemLevel}>リスク度: {risk.level}</Text>
            </View>
            <Text style={styles.riskItemDesc}>{risk.desc}</Text>
            {risk.advice ? (
              <View style={styles.rxBox}>
                <Text style={styles.rxTitle}>AIのアドバイス</Text>
                <Text style={styles.rxText}>{risk.advice}</Text>
              </View>
            ) : null}
          </View>
        ))}

        {displayReport.nextActionTip ? (
          <View style={styles.nextActionBox}>
            <Ionicons name="bulb-outline" size={15} color={COLORS.primaryDark} />
            <Text style={styles.nextActionText}>{displayReport.nextActionTip}</Text>
          </View>
        ) : null}
      </View>

      {/* サブスクリプション購入カード（未加入時のみ表示） */}
      {!isPremium && (
        <View style={[styles.card, SHADOWS.card, styles.subCard]}>
          <View style={styles.subHeader}>
            <Ionicons name="diamond" size={22} color="#C97A2B" />
            <Text style={styles.subTitle}>ふたりプレミアムプラン</Text>
          </View>
          <Text style={styles.subSubtitle}>
            1人が加入すれば2人とも利用OK！ペア共有でプレミアム機能がすべて解放されます。
          </Text>

          <View style={styles.perksBox}>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>過去の未回答質問に回答＆相手の結果を解放</Text>
                ：答え忘れた過去日の質問に履歴から後から回答でき、回答すると相手の答えと一致率が見られます（※当日は双方回答まで秘密）
              </Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>未回答日も含めた深層AI相性診断＆過去アーカイブ</Text>
                ：性格傾向やすれ違い予防策をAIが分析し、過去の診断レポートも並べて見返せます
              </Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>片方の課金で2人とも利用可能</Text>
                ：どちらかが加入すればパートナーにも自動適用されます
              </Text>
            </View>
          </View>

          <View style={styles.planSelector}>
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'yearly' && styles.planCardActive,
              ]}
              onPress={() => setSelectedPlan('yearly')}
            >
              <View style={styles.planBestBadge}>
                <Text style={styles.planBestText}>{offering.yearlyDiscountBadge}</Text>
              </View>
              <Text style={styles.planName}>年額プラン</Text>
              <Text style={styles.planPrice}>{offering.yearlyPriceLabel}</Text>
              <Text style={styles.planSubPrice}>({offering.yearlyPerMonthLabel})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardActive,
              ]}
              onPress={() => setSelectedPlan('monthly')}
            >
              <Text style={styles.planName}>月額プラン</Text>
              <Text style={styles.planPrice}>{offering.monthlyPriceLabel}</Text>
              <Text style={styles.planSubPrice}>(2人分・ペア共有)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.subscribeBtn}
            activeOpacity={0.8}
            disabled={purchasing}
            onPress={handleSubscribe}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="lock-open" size={17} color="#FFFFFF" />
                <Text style={styles.subscribeBtnText}>
                  {selectedPlan === 'yearly'
                    ? `${offering.yearlyPriceLabel} で全レポートを解放`
                    : `${offering.monthlyPriceLabel} で全レポートを解放`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreBtn}
            disabled={purchasing}
            onPress={handleRestore}
          >
            <Text style={styles.restoreBtnText}>以前の購入を復元する</Text>
          </TouchableOpacity>

          <Text style={styles.subNotes}>
            お支払いは Google Play アカウントへ請求されます。定期購入は自動更新されますが、次回更新の24時間前までに Google Play の定期購入管理からいつでも解約できます。
          </Text>

          <View style={styles.legalLinksRow}>
            <TouchableOpacity
              onPress={() => void openExternalLink(LEGAL_URLS.termsOfService, '利用規約')}
            >
              <Text style={styles.legalLinkText}>利用規約</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() => void openExternalLink(LEGAL_URLS.privacyPolicy, 'プライバシーポリシー')}
            >
              <Text style={styles.legalLinkText}>プライバシーポリシー</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() =>
                void openExternalLink(
                  LEGAL_URLS.googlePlaySubscriptions,
                  'Google Play 定期購入管理'
                )
              }
            >
              <Text style={styles.legalLinkText}>解約・サブスク管理</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() =>
                void openExternalLink(LEGAL_URLS.accountDeletion, '退会・データ削除案内')
              }
            >
              <Text style={styles.legalLinkText}>退会案内</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 課金済みユーザー向け：利用規約・プライバシーポリシー・解約管理リンク */}
      {isPremium && (
        <View style={styles.premiumLegalFooter}>
          <Text style={styles.subNotes}>
            プランの確認・解約は Google Play の定期購入管理からいつでも行えます。
          </Text>
          <View style={styles.legalLinksRow}>
            <TouchableOpacity
              onPress={() => void openExternalLink(LEGAL_URLS.termsOfService, '利用規約')}
            >
              <Text style={styles.legalLinkText}>利用規約</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() => void openExternalLink(LEGAL_URLS.privacyPolicy, 'プライバシーポリシー')}
            >
              <Text style={styles.legalLinkText}>プライバシーポリシー</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() =>
                void openExternalLink(
                  LEGAL_URLS.googlePlaySubscriptions,
                  'Google Play 定期購入管理'
                )
              }
            >
              <Text style={styles.legalLinkText}>解約・サブスク管理</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity
              onPress={() =>
                void openExternalLink(LEGAL_URLS.accountDeletion, '退会・データ削除案内')
              }
            >
              <Text style={styles.legalLinkText}>退会案内</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  heroBanner: {
    backgroundColor: '#3E3430',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F2A07E',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 13,
    color: '#D8CDC4',
    lineHeight: 18,
    marginBottom: 14,
  },
  shareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  shareBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  premiumControlCard: {
    backgroundColor: '#F4FAF6',
    borderColor: '#C8E2D1',
  },
  subStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F4EC',
    borderWidth: 1,
    borderColor: '#C4E0CD',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 10,
  },
  subStatusPillText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2F593C',
    lineHeight: 16,
  },
  premiumMetaText: {
    fontSize: 12,
    color: '#3B6347',
    marginBottom: 12,
    lineHeight: 17,
  },
  pastCatchUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBF3',
    borderWidth: 1,
    borderColor: '#EBD3AA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  pastCatchUpBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#8C5A1B',
  },
  generateBtn: {
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sampleNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FDF6E9',
    borderWidth: 1,
    borderColor: '#F0DEC0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  sampleNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#8C6226',
    lineHeight: 18,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  cardHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  scoreBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  coupleTypes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  typeBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  typeUser: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  typeTag: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    textAlign: 'center',
    marginBottom: 6,
  },
  typeDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  plusSign: {
    paddingHorizontal: 8,
  },
  plusText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  chemistryNote: {
    backgroundColor: '#F2F7F4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8E2D1',
  },
  chemistryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4A7C59',
    marginBottom: 4,
  },
  chemistryText: {
    fontSize: 12,
    color: '#3B6347',
    lineHeight: 17,
  },
  riskCard: {
    borderColor: '#F8CBD2',
    borderWidth: 1.5,
  },
  riskHeader: {
    marginBottom: 8,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF2F4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C85338',
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  riskLead: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 14,
  },
  riskItem: {
    backgroundColor: '#FDF6F4',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  riskMeterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  riskItemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  riskItemLevel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C85338',
  },
  riskItemDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginBottom: 8,
  },
  rxBox: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  rxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
    marginBottom: 2,
  },
  rxText: {
    fontSize: 11,
    color: COLORS.text,
    lineHeight: 15,
  },
  nextActionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  nextActionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 17,
  },
  subCard: {
    borderWidth: 1.5,
    borderColor: '#F6E5D0',
    backgroundColor: '#FFFEFA',
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  subSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 17,
  },
  perksBox: {
    backgroundColor: '#FAF6EE',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0DEC0',
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  perkText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
    lineHeight: 17,
  },
  perkBold: {
    fontWeight: '800',
    color: COLORS.text,
  },
  planSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  planCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FDF1EC',
  },
  planBestBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  planBestText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  planName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 6,
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.primaryDark,
  },
  planSubPrice: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  subscribeBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    marginBottom: 10,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 6,
  },
  restoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
    textDecorationLine: 'underline',
  },
  subNotes: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  legalLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  premiumLegalFooter: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  archiveSection: {
    marginBottom: 16,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  archiveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  archiveTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text,
  },
  backLatestBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  backLatestBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  archiveScrollContent: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 6,
  },
  archiveCard: {
    width: 158,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  archiveCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#FDF4EF',
  },
  archiveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  archiveDate: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  archiveDateActive: {
    color: COLORS.primaryDark,
  },
  latestChip: {
    backgroundColor: '#4A7C59',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  latestChipText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  archiveScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 3,
  },
  archiveScore: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
  },
  archiveScoreActive: {
    color: COLORS.primaryDark,
  },
  archiveScoreUnit: {
    fontSize: 12,
    fontWeight: '700',
  },
  archiveDelta: {
    fontSize: 11,
    fontWeight: '800',
  },
  archiveMeta: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  archiveTags: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  olderViewingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  olderViewingText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
});
