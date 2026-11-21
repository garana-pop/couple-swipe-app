import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';

export default function AiReportScreen() {
  const { partnerName, myName } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  const handleSubscribeMock = () => {
    Alert.alert(
      'サブスクリプション（UIモック）',
      `どちらか1人が加入すると、${myName}さんと${partnerName}さんの2人とも無制限で全レポート・診断機能をご利用いただけます！`
    );
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
          毎日のスワイプ回答から、AIが二人の性格傾向・潜在的な価値観のズレ・関係改善のヒントを導き出します。
        </Text>
        <View style={styles.shareBadge}>
          <Ionicons name="gift-outline" size={14} color="#FFFFFF" />
          <Text style={styles.shareBadgeText}>
            片方の課金でパートナーも一緒に閲覧OK！
          </Text>
        </View>
      </View>

      {/* セクション1: AI性格タイプ分析 */}
      <View style={[styles.card, SHADOWS.card]}>
        <View style={styles.cardHeader}>
          <Ionicons name="analytics" size={19} color={COLORS.primary} />
          <Text style={styles.cardTitle}>AI性格タイプ・ケミストリー</Text>
        </View>

        <View style={styles.coupleTypes}>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser}>{myName}</Text>
            <Text style={styles.typeTag}>しっかり計画派リーダー</Text>
            <Text style={styles.typeDesc}>
              見通しを立てて安心したいタイプ。ルールや時間を尊重する傾向。
            </Text>
          </View>
          <View style={styles.plusSign}>
            <Text style={styles.plusText}>×</Text>
          </View>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser}>{partnerName}</Text>
            <Text style={styles.typeTag}>柔軟な癒やしマイペース</Text>
            <Text style={styles.typeDesc}>
              その場の空気や気分を大切にするタイプ。大らかで包容力がある。
            </Text>
          </View>
        </View>

        <View style={styles.chemistryNote}>
          <Text style={styles.chemistryTitle}>AI分析サマリー</Text>
          <Text style={styles.chemistryText}>
            「計画性」と「柔軟性」という正反対の長所を持つ補完関係です。一方がリードし、もう一方が場を和ませる理想的な凸凹ペア！
          </Text>
        </View>
      </View>

      {/* セクション2: 別れの原因診断（プレミアム機能モック） */}
      <View style={[styles.card, SHADOWS.card, styles.riskCard]}>
        <View style={styles.riskHeader}>
          <View style={styles.riskBadge}>
            <Ionicons name="warning" size={13} color="#C85338" />
            <Text style={styles.riskBadgeText}>要注意ポイント</Text>
          </View>
          <Text style={styles.riskTitle}>別れの原因診断（AI予測）</Text>
        </View>

        <Text style={styles.riskLead}>
          過去のスワイプ履歴から、将来ふたりが衝突しやすい「すれ違いトリガー」を早期予測しました。
        </Text>

        <View style={styles.riskItem}>
          <View style={styles.riskMeterRow}>
            <Text style={styles.riskItemTitle}>① 家事・ルールの基準の違い</Text>
            <Text style={styles.riskItemLevel}>リスク度: 中</Text>
          </View>
          <Text style={styles.riskItemDesc}>
            「家事に厳しい度」の回答差から、掃除や片付けのタイミングで不満が溜まりやすい傾向があります。
          </Text>
          <View style={styles.rxBox}>
            <Text style={styles.rxTitle}>AIのアドバイス</Text>
            <Text style={styles.rxText}>
              「気づいた方がやる」ではなく、「月曜のゴミ出しは相手、水回りは私」のように明確に分担を可視化しましょう。
            </Text>
          </View>
        </View>

        <View style={styles.riskItem}>
          <View style={styles.riskMeterRow}>
            <Text style={styles.riskItemTitle}>② 休日の過ごし方の温度差</Text>
            <Text style={styles.riskItemLevel}>リスク度: 低</Text>
          </View>
          <Text style={styles.riskItemDesc}>
            外出派とのんびり派で適度な自由時間を尊重し合えているため、現在のところ良好です。
          </Text>
        </View>
      </View>

      {/* サブスクリプション料金モックカード */}
      <View style={[styles.card, SHADOWS.card, styles.subCard]}>
        <View style={styles.subHeader}>
          <Ionicons name="diamond" size={22} color="#C97A2B" />
          <Text style={styles.subTitle}>ふたりプレミアムプラン</Text>
        </View>
        <Text style={styles.subSubtitle}>
          1人が加入すれば、2人とも全ての診断・過去ログ・詳細分析を見放題
        </Text>

        {/* プラン選択 */}
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
            <Text style={styles.planPrice}>¥3,600 / 年</Text>
            <Text style={styles.planSubPrice}>(月換算 ¥300・2人分)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.planCard,
              selectedPlan === 'monthly' && styles.planCardActive,
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            <Text style={styles.planName}>月額プラン</Text>
            <Text style={styles.planPrice}>¥500 / 月</Text>
            <Text style={styles.planSubPrice}>(1人あたり ¥250)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.subscribeBtn}
          activeOpacity={0.8}
          onPress={handleSubscribeMock}
        >
          <Ionicons name="lock-open" size={17} color="#FFFFFF" />
          <Text style={styles.subscribeBtnText}>
            {selectedPlan === 'yearly'
              ? '年額 ¥3,600 で全レポートを解放する'
              : '月額 ¥500 で全レポートを解放する'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.subNotes}>
          いつでも解約可能・広告非表示・無制限AI診断
        </Text>
      </View>
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
    backgroundColor: '#3E3430', // 温かみのあるダークエスプレッソ
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
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
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
    marginBottom: 6,
  },
  riskItemTitle: {
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
    marginBottom: 14,
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
    marginBottom: 8,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  subNotes: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
