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
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { showAlert } from '../lib/alert';
import {
  BillingOfferingPrices,
  fetchPairEntitlement,
  generateServerAiReport,
  initializeBilling,
  purchaseSubscriptionPlan,
  restoreSubscriptionPurchases,
} from '../lib/billing';
import type { AiReportData, PairAiReportRecord, PairEntitlement } from '../types';

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

export default function AiReportScreen() {
  const {
    userId,
    isSupabaseReady,
    isPairConnected,
    partnerName,
    myName,
    getQuestionsById,
  } = useApp();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [loadingEntitlement, setLoadingEntitlement] = useState(true);
  const [entitlement, setEntitlement] = useState<PairEntitlement | null>(null);
  const [reportRecord, setReportRecord] = useState<PairAiReportRecord | null>(null);
  const [offering, setOffering] = useState<BillingOfferingPrices>({
    isStoreReady: false,
    yearlyPriceLabel: '¥3,600 / 年',
    monthlyPriceLabel: '¥500 / 月',
  });
  const [generating, setGenerating] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const refreshEntitlementAndBilling = useCallback(async () => {
    const [ent, offer] = await Promise.all([
      isSupabaseReady ? fetchPairEntitlement() : Promise.resolve(null),
      userId ? initializeBilling(userId) : Promise.resolve(null),
    ]);
    if (ent) {
      setEntitlement(ent);
      setReportRecord(ent.latestReport);
    }
    if (offer) {
      setOffering(offer);
    }
  }, [isSupabaseReady, userId]);

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
  const displayReport: AiReportData = isPremium && reportRecord ? reportRecord.report : SAMPLE_REPORT;
  const isShowingSample = !isPremium || !reportRecord;

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
        setReportRecord(res.reportRecord);
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
        'ストア課金の準備について',
        offering.unavailableReason ??
          'Google Play 課金（RevenueCat）は EAS ビルド版のアプリで利用できます。'
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

      // サーバー側で課金状態を同期（Webhook 到着前でも generate-ai-report / get_pair_entitlement で反映）
      await refreshEntitlementAndBilling();
      showAlert(
        'ご加入ありがとうございます！',
        `${myName}さんと${partnerName}さんのペアで「ふたりプレミアムプラン」が有効になりました。AI相性診断と、未回答だった過去日の相手回答の閲覧が解放されています。`
      );
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
      await refreshEntitlementAndBilling();
      showAlert('復元処理が完了しました', '最新の契約状態をサーバーと同期しました。');
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
              {reportRecord ? '最新のAI診断レポート' : '最初のAIレポートを作成しましょう'}
            </Text>
          </View>
          <Text style={styles.premiumMetaText}>
            分析対象データ：計 {entitlement?.analyzableDaysCount ?? 0}日分（双方回答{' '}
            {entitlement?.revealedDaysCount ?? 0}日
            {(entitlement?.pastPartnerOnlyDaysCount ?? 0) > 0
              ? ` ＋ 過去未回答日の相手回答 ${entitlement?.pastPartnerOnlyDaysCount}日`
              : ''}
            ）
            {reportRecord
              ? `\n最終更新: ${formatDateTime(reportRecord.createdAt)}（${reportRecord.analyzedAnswers}問を分析）`
              : ''}
            {'\n'}※ 自分が未回答だった過去日の相手の回答も「過去の回答との比較」から閲覧できます。
          </Text>

          <TouchableOpacity
            style={styles.generateBtn}
            activeOpacity={0.85}
            disabled={generating || !isPairConnected}
            onPress={() => void handleGenerateReport(Boolean(reportRecord))}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={17} color="#FFFFFF" />
                <Text style={styles.generateBtnText}>
                  {reportRecord ? '最新データでレポートを更新する' : 'AI相性レポートを生成する'}
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
            ）から AI が専用レポートを生成し、未回答の過去日の相手の回答も履歴から閲覧できるようになります。
          </Text>
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
                <Text style={styles.perkBold}>未回答の過去日の相手回答を閲覧</Text>
                ：自分が答え忘れた日でも、過去の相手の回答を履歴で見られます（※当日は双方回答まで秘密）
              </Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>未回答日も含めた深層AI相性診断</Text>
                ：双方の回答＋過去未回答日の相手回答をもとに、性格傾向やすれ違い予防策をAIが分析
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
                <Text style={styles.planBestText}>人気No.1（40% OFF）</Text>
              </View>
              <Text style={styles.planName}>年額プラン</Text>
              <Text style={styles.planPrice}>{offering.yearlyPriceLabel}</Text>
              <Text style={styles.planSubPrice}>(2人分・ペア共有)</Text>
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
            いつでも Google Play から解約可能・ペア共有対応
          </Text>
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
  premiumMetaText: {
    fontSize: 12,
    color: '#3B6347',
    marginBottom: 12,
    lineHeight: 17,
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
  },
});
