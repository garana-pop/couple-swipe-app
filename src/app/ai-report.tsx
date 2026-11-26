import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentLocale } from '../i18n';
import { formatDateOnlyFromIso, formatDateTimeFromIso } from '../i18n/format';
import { showAlert } from '../lib/alert';
import { getLegalUrls, getStoreName, openExternalLink } from '../lib/links';
import {
  BillingOfferingPrices,
  fetchPairAllAiReports,
  fetchPairEntitlement,
  generateServerAiReport,
  generateServerBreakupReflection,
  getDefaultBillingOfferingPrices,
  initializeBilling,
  normalizeRiskLevel,
  purchaseSubscriptionPlan,
  restoreSubscriptionPurchases,
  syncAndFetchPairEntitlement,
} from '../lib/billing';
import type {
  AiReportData,
  BreakupReflectionData,
  PairAiReportRecord,
  PairBreakupReflectionRecord,
  PairEntitlement,
} from '../types';

export default function AiReportScreen() {
  const { t, i18n } = useTranslation();
  const locale = getCurrentLocale();
  const legalUrls = getLegalUrls(locale);
  const storeName = getStoreName();
  const subscriptionsLabel =
    Platform.OS === 'ios' ? t('links.subscriptionsIos') : t('links.subscriptionsAndroid');

  const { mode, focus } = useLocalSearchParams<{ mode?: string; focus?: string }>();
  const {
    userId,
    pairId,
    hasPair,
    isSupabaseReady,
    isPairConnected,
    partnerName,
    myName,
    getQuestionsById,
    fetchHistory,
    setPairPremium,
  } = useApp();

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const reportDetailYRef = useRef<number>(0);
  const reflectionSectionYRef = useRef<number>(0);
  const subCardYRef = useRef<number>(0);
  const didAutoScrollReflectionRef = useRef(false);
  const didAutoScrollPlansRef = useRef(false);

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [loadingEntitlement, setLoadingEntitlement] = useState(true);
  const [entitlement, setEntitlement] = useState<PairEntitlement | null>(null);
  const [reportHistory, setReportHistory] = useState<PairAiReportRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reflectionHistory, setReflectionHistory] = useState<PairBreakupReflectionRecord[]>([]);
  const [reflectionExpandedOverride, setReflectionExpandedOverride] = useState<boolean | null>(null);
  const isReflectionOpen = reflectionExpandedOverride ?? mode === 'reflection';
  const [isSampleOpen, setIsSampleOpen] = useState(false);
  const [generatingReflection, setGeneratingReflection] = useState(false);
  const [offering, setOffering] = useState<BillingOfferingPrices>(() =>
    getDefaultBillingOfferingPrices()
  );
  const [generating, setGenerating] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const formatPlanName = useCallback(
    (productId: string | null | undefined): string => {
      const raw = (productId ?? '').toLowerCase();
      if (raw.includes('year') || raw.includes('annual')) return t('aiReport.plans.yearly');
      if (raw.includes('month')) return t('aiReport.plans.monthly');
      return t('aiReport.plans.premium');
    },
    [t]
  );

  const sampleReport = useMemo<AiReportData>(
    () => ({
      overallScore: 84,
      myType: {
        tag: t('aiReport.sampleReport.myTag'),
        desc: t('aiReport.sampleReport.myDesc'),
      },
      partnerType: {
        tag: t('aiReport.sampleReport.partnerTag'),
        desc: t('aiReport.sampleReport.partnerDesc'),
      },
      chemistrySummary: t('aiReport.sampleReport.chemistrySummary'),
      riskPoints: [
        {
          title: t('aiReport.sampleReport.risk1Title'),
          level: 'medium',
          desc: t('aiReport.sampleReport.risk1Desc'),
          advice: t('aiReport.sampleReport.risk1Advice'),
        },
        {
          title: t('aiReport.sampleReport.risk2Title'),
          level: 'low',
          desc: t('aiReport.sampleReport.risk2Desc'),
          advice: t('aiReport.sampleReport.risk2Advice'),
        },
      ],
      nextActionTip: t('aiReport.sampleReport.nextActionTip'),
    }),
    [t]
  );

  const sampleReflection = useMemo<BreakupReflectionData>(
    () => ({
      reportType: 'breakup_reflection',
      warmMessage: t('aiReport.sampleReflection.warmMessage'),
      goodMemoriesSummary: t('aiReport.sampleReflection.goodMemoriesSummary'),
      rootCauses: [
        {
          title: t('aiReport.sampleReflection.cause1Title'),
          background: t('aiReport.sampleReflection.cause1Background'),
          takeaway: t('aiReport.sampleReflection.cause1Takeaway'),
        },
      ],
      myStrengthForNextLove: t('aiReport.sampleReflection.myStrengthForNextLove'),
      gentleNextStep: t('aiReport.sampleReflection.gentleNextStep'),
    }),
    [t]
  );

  useEffect(() => {
    if (
      mode === 'reflection' &&
      !loadingEntitlement &&
      isReflectionOpen &&
      !didAutoScrollReflectionRef.current
    ) {
      didAutoScrollReflectionRef.current = true;
      setTimeout(() => {
        if (reflectionSectionYRef.current > 0) {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, reflectionSectionYRef.current - 16),
            animated: true,
          });
        } else {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }
      }, 220);
    }
  }, [mode, loadingEntitlement, isReflectionOpen]);

  useEffect(() => {
    if (
      focus === 'plans' &&
      !loadingEntitlement &&
      !entitlement?.isPremium &&
      !didAutoScrollPlansRef.current
    ) {
      didAutoScrollPlansRef.current = true;
      setTimeout(() => {
        if (subCardYRef.current > 0) {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, subCardYRef.current - 16),
            animated: true,
          });
        }
      }, 240);
    }
  }, [focus, loadingEntitlement, entitlement?.isPremium]);

  const applyEntitlement = useCallback(
    async (ent: PairEntitlement | null) => {
      if (!ent) return;
      setEntitlement(ent);
      setPairPremium(Boolean(ent.isPremium));
      if (ent.isPremium && pairId) {
        const { compatibilityReports, reflectionReports } = await fetchPairAllAiReports(
          pairId,
          30
        );
        setReflectionHistory(reflectionReports);
        if (compatibilityReports.length > 0) {
          setReportHistory(compatibilityReports);
          setSelectedReportId((prev) =>
            prev && compatibilityReports.some((r) => r.id === prev)
              ? prev
              : compatibilityReports[0].id
          );
        } else if (ent.latestReport) {
          setReportHistory([ent.latestReport]);
          setSelectedReportId(ent.latestReport.id);
        } else {
          setReportHistory([]);
          setSelectedReportId(null);
        }
      } else {
        setReflectionHistory([]);
        setReportHistory(ent.latestReport ? [ent.latestReport] : []);
        setSelectedReportId(ent.latestReport?.id ?? null);
      }
    },
    [pairId, setPairPremium]
  );

  const refreshEntitlementAndBilling = useCallback(async () => {
    const [ent, offer] = await Promise.all([
      isSupabaseReady ? fetchPairEntitlement() : Promise.resolve(null),
      userId ? initializeBilling(userId) : Promise.resolve(getDefaultBillingOfferingPrices()),
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
  }, [refreshEntitlementAndBilling, i18n.language]);

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
    isPremium && activeReportRecord ? activeReportRecord.report : sampleReport;
  const isShowingSample = !isPremium || !activeReportRecord;

  const latestReflectionRecord = reflectionHistory[0] ?? null;

  const handleSelectArchiveReport = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setTimeout(() => {
      if (reportDetailYRef.current > 0) {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, reportDetailYRef.current - 12),
          animated: true,
        });
      }
    }, 60);
  }, []);

  const handleGenerateReflection = async (forceRefresh: boolean) => {
    if (!isSupabaseReady) {
      showAlert(t('aiReport.alerts.notConnectedTitle'), t('aiReport.alerts.notConnectedBody'));
      return;
    }
    if (!hasPair) {
      showAlert(t('aiReport.alerts.noHistoryTitle'), t('aiReport.alerts.noHistoryBody'));
      return;
    }
    setGeneratingReflection(true);
    try {
      const res = await generateServerBreakupReflection(getQuestionsById(), forceRefresh);
      if (!res.ok) {
        showAlert(
          t('aiReport.alerts.reflectionErrorTitle'),
          res.error ?? t('aiReport.alerts.reflectionErrorBody')
        );
        return;
      }
      if (res.reflectionRecord) {
        const nextRec = res.reflectionRecord;
        setReflectionHistory((prev) => {
          const withoutDup = prev.filter((item) => item.id !== nextRec.id);
          return [nextRec, ...withoutDup];
        });
      }
      if (res.cached) {
        showAlert(
          t('aiReport.alerts.reflectionCachedTitle'),
          t('aiReport.alerts.reflectionCachedBody')
        );
      } else {
        showAlert(
          t('aiReport.alerts.reflectionDoneTitle'),
          t('aiReport.alerts.reflectionDoneBody')
        );
      }
    } finally {
      setGeneratingReflection(false);
    }
  };

  const handleGenerateReport = async (forceRefresh: boolean) => {
    if (!isSupabaseReady) {
      showAlert(t('aiReport.alerts.notConnectedTitle'), t('aiReport.alerts.notConnectedBody'));
      return;
    }
    setGenerating(true);
    try {
      const res = await generateServerAiReport(getQuestionsById(), forceRefresh);
      if (!res.ok) {
        showAlert(
          t('aiReport.alerts.reportErrorTitle'),
          res.error ?? t('aiReport.alerts.reportErrorBody')
        );
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
        showAlert(t('aiReport.alerts.reportCachedTitle'), t('aiReport.alerts.reportCachedBody'));
      } else {
        showAlert(t('aiReport.alerts.reportDoneTitle'), t('aiReport.alerts.reportDoneBody'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSubscribe = async () => {
    if (!offering.isStoreReady) {
      showAlert(
        t('aiReport.alerts.storeBillingTitle'),
        offering.unavailableReason ?? t('errors.billing.notReady')
      );
      return;
    }

    setPurchasing(true);
    try {
      const res = await purchaseSubscriptionPlan(selectedPlan);
      if (res.cancelled) return;
      if (!res.ok) {
        showAlert(
          t('aiReport.alerts.purchaseErrorTitle'),
          res.error ?? t('aiReport.alerts.purchaseErrorBody')
        );
        return;
      }

      const syncedEnt = await syncAndFetchPairEntitlement(true);
      await applyEntitlement(syncedEnt);
      if (syncedEnt?.isPremium) {
        void fetchHistory();
        showAlert(
          t('aiReport.alerts.subscribedTitle'),
          t('aiReport.alerts.subscribedBody', { me: myName, partner: partnerName })
        );
      } else {
        showAlert(
          t('aiReport.alerts.subscribedPendingTitle'),
          t('aiReport.alerts.subscribedPendingBody')
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
        showAlert(
          t('aiReport.alerts.restoreErrorTitle'),
          res.error ?? t('aiReport.alerts.restoreErrorBody')
        );
        return;
      }

      const syncedEnt = await syncAndFetchPairEntitlement(Boolean(res.hasActiveEntitlement));
      await applyEntitlement(syncedEnt);
      if (syncedEnt?.isPremium) {
        void fetchHistory();
        showAlert(t('aiReport.alerts.restoredTitle'), t('aiReport.alerts.restoredBody'));
      } else if (!res.hasActiveEntitlement) {
        showAlert(t('aiReport.alerts.noActiveSubTitle'), t('aiReport.alerts.noActiveSubBody'));
      } else {
        showAlert(
          t('aiReport.alerts.restorePendingTitle'),
          t('aiReport.alerts.restorePendingBody')
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const renderLegalLinks = () => (
    <View style={styles.legalLinksRow}>
      <TouchableOpacity
        onPress={() => void openExternalLink(legalUrls.termsOfService, t('links.termsOfService'))}
      >
        <Text style={styles.legalLinkText}>{t('aiReport.paywall.linkTerms')}</Text>
      </TouchableOpacity>
      <Text style={styles.legalDot}>•</Text>
      <TouchableOpacity
        onPress={() => void openExternalLink(legalUrls.privacyPolicy, t('links.privacyPolicy'))}
      >
        <Text style={styles.legalLinkText}>{t('aiReport.paywall.linkPrivacy')}</Text>
      </TouchableOpacity>
      <Text style={styles.legalDot}>•</Text>
      <TouchableOpacity
        onPress={() => void openExternalLink(legalUrls.subscriptions, subscriptionsLabel)}
      >
        <Text style={styles.legalLinkText}>{t('aiReport.paywall.linkManage')}</Text>
      </TouchableOpacity>
      <Text style={styles.legalDot}>•</Text>
      <TouchableOpacity
        onPress={() => void openExternalLink(legalUrls.accountDeletion, t('links.accountDeletion'))}
      >
        <Text style={styles.legalLinkText}>{t('aiReport.paywall.linkDeletion')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReportCards = () => (
    <>
      <View
        style={[styles.card, SHADOWS.card]}
        onLayout={(e) => {
          reportDetailYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <View style={styles.cardHeaderBetween}>
          <View style={styles.cardHeaderInline}>
            <Ionicons name="analytics" size={19} color={COLORS.primary} />
            <Text style={styles.cardTitle}>{t('aiReport.reportCard.title')}</Text>
          </View>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText} numberOfLines={1}>
              {isShowingSample
                ? t('aiReport.reportCard.sampleBadge')
                : t('aiReport.reportCard.scoreBadge', { score: displayReport.overallScore })}
            </Text>
          </View>
        </View>

        <View style={styles.coupleTypes}>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser} numberOfLines={1}>
              {myName}
            </Text>
            <Text style={styles.typeTag}>{displayReport.myType.tag}</Text>
            <Text style={styles.typeDesc}>{displayReport.myType.desc}</Text>
          </View>
          <View style={styles.plusSign}>
            <Text style={styles.plusText}>×</Text>
          </View>
          <View style={styles.typeBox}>
            <Text style={styles.typeUser} numberOfLines={1}>
              {partnerName}
            </Text>
            <Text style={styles.typeTag}>{displayReport.partnerType.tag}</Text>
            <Text style={styles.typeDesc}>{displayReport.partnerType.desc}</Text>
          </View>
        </View>

        <View style={styles.chemistryNote}>
          <Text style={styles.chemistryTitle}>{t('aiReport.reportCard.summaryTitle')}</Text>
          <Text style={styles.chemistryText}>{displayReport.chemistrySummary}</Text>
        </View>
      </View>

      <View style={[styles.card, SHADOWS.card, styles.riskCard]}>
        <View style={styles.riskHeader}>
          <View style={styles.riskBadge}>
            <Ionicons name="warning" size={13} color="#C85338" />
            <Text style={styles.riskBadgeText}>
              {isShowingSample
                ? t('aiReport.reportCard.riskSampleBadge')
                : t('aiReport.reportCard.riskCautionBadge')}
            </Text>
          </View>
          <Text style={styles.riskTitle}>{t('aiReport.reportCard.riskTitle')}</Text>
        </View>

        <Text style={styles.riskLead}>{t('aiReport.reportCard.riskLead')}</Text>

        {displayReport.riskPoints.map((risk, idx) => {
          const levelKey = normalizeRiskLevel(risk.level);
          const levelLabel = t(`aiReport.riskLevels.${levelKey}`);
          return (
            <View key={`${risk.title}-${idx}`} style={styles.riskItem}>
              <View style={styles.riskMeterRow}>
                <Text style={styles.riskItemTitle}>
                  {idx + 1}. {risk.title}
                </Text>
                <Text style={styles.riskItemLevel}>
                  {t('aiReport.reportCard.riskLevel', { level: levelLabel })}
                </Text>
              </View>
              <Text style={styles.riskItemDesc}>{risk.desc}</Text>
              {risk.advice ? (
                <View style={styles.rxBox}>
                  <Text style={styles.rxTitle}>{t('aiReport.reportCard.adviceTitle')}</Text>
                  <Text style={styles.rxText}>{risk.advice}</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        {displayReport.nextActionTip ? (
          <View style={styles.nextActionBox}>
            <Ionicons name="bulb-outline" size={15} color={COLORS.primaryDark} />
            <Text style={styles.nextActionText}>{displayReport.nextActionTip}</Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const selectedPriceLabel =
    selectedPlan === 'yearly' ? offering.yearlyPriceLabel : offering.monthlyPriceLabel;

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {loadingEntitlement ? (
        <View style={[styles.card, SHADOWS.card, styles.loadingBox]}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('aiReport.loading')}</Text>
        </View>
      ) : isPremium ? (
        <View style={[styles.card, SHADOWS.card, styles.premiumControlCard]}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color="#4A7C59" />
            <Text style={styles.cardTitle}>
              {latestReportRecord
                ? t('aiReport.premiumCard.titleHasReport')
                : t('aiReport.premiumCard.titleNoReport')}
            </Text>
          </View>
          {entitlement && (
            <View style={styles.subStatusPill}>
              <Ionicons name="diamond" size={13} color="#4A7C59" />
              <Text style={styles.subStatusPillText}>
                {formatPlanName(entitlement.productId)} (
                {entitlement.paidByPartner && !entitlement.paidByMe
                  ? t('aiReport.premiumCard.sharedPartner', { partnerName })
                  : t('aiReport.premiumCard.activeSub')}
                )
                {entitlement.expiresAt
                  ? entitlement.status === 'grace_period'
                    ? t('aiReport.premiumCard.gracePeriod', {
                        date: formatDateOnlyFromIso(entitlement.expiresAt, locale),
                      })
                    : entitlement.willRenew
                      ? t('aiReport.premiumCard.nextRenewal', {
                          date: formatDateOnlyFromIso(entitlement.expiresAt, locale),
                        })
                      : t('aiReport.premiumCard.expiresUntil', {
                          date: formatDateOnlyFromIso(entitlement.expiresAt, locale),
                        })
                  : ''}
              </Text>
            </View>
          )}
          <Text style={styles.premiumMetaText}>
            {t('aiReport.premiumCard.metaAnalyzable', {
              total: entitlement?.analyzableDaysCount ?? 0,
              revealed: entitlement?.revealedDaysCount ?? 0,
              partnerOnlyPart:
                (entitlement?.pastPartnerOnlyDaysCount ?? 0) > 0
                  ? t('aiReport.premiumCard.metaPartnerOnlyPart', {
                      count: entitlement?.pastPartnerOnlyDaysCount ?? 0,
                    })
                  : '',
            })}
            {latestReportRecord
              ? `\n${t('aiReport.premiumCard.metaUpdated', {
                  datetime: formatDateTimeFromIso(latestReportRecord.createdAt, locale),
                  answers: latestReportRecord.analyzedAnswers,
                })}`
              : ''}
            {'\n'}
            {(entitlement?.pastUnansweredDaysCount ?? 0) > 0
              ? t('aiReport.premiumCard.metaPastUnanswered', {
                  count: entitlement?.pastUnansweredDaysCount ?? 0,
                })
              : t('aiReport.premiumCard.metaPastHint')}
          </Text>

          {(entitlement?.pastUnansweredDaysCount ?? 0) > 0 && (
            <TouchableOpacity
              style={styles.pastCatchUpBtn}
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: '/history', params: { openCalendar: '1' } })
              }
            >
              <Ionicons name="calendar-outline" size={16} color="#8C5A1B" />
              <Text style={styles.pastCatchUpBtnText}>
                {t('aiReport.premiumCard.pastCatchUpBtn', {
                  count: entitlement?.pastUnansweredDaysCount ?? 0,
                })}
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
                  {latestReportRecord
                    ? t('aiReport.premiumCard.updateReportBtn')
                    : t('aiReport.premiumCard.generateReportBtn')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={[styles.card, SHADOWS.card, styles.subCard]}
          onLayout={(e) => {
            subCardYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.subHeader}>
            <Ionicons name="diamond" size={22} color="#C97A2B" />
            <Text style={styles.subTitle}>{t('aiReport.paywall.title')}</Text>
          </View>
          <Text style={styles.subSubtitle}>{t('aiReport.paywall.subtitle')}</Text>

          {(entitlement?.pastUnansweredDaysCount ?? 0) > 0 && (
            <View style={styles.subUnansweredCallout}>
              <Ionicons name="calendar" size={15} color="#8C5A1B" />
              <Text style={styles.subUnansweredCalloutText}>
                {t('aiReport.paywall.unansweredCallout', {
                  past: entitlement?.pastUnansweredDaysCount ?? 0,
                  partnerPart:
                    (entitlement?.pastPartnerOnlyDaysCount ?? 0) > 0
                      ? t('aiReport.paywall.unansweredPartnerPart', {
                          count: entitlement?.pastPartnerOnlyDaysCount ?? 0,
                        })
                      : '',
                })}
              </Text>
            </View>
          )}

          <View style={styles.perksBox}>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>{t('aiReport.paywall.perk1Bold')}</Text>
                {t('aiReport.paywall.perk1Rest')}
              </Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>{t('aiReport.paywall.perk2Bold')}</Text>
                {t('aiReport.paywall.perk2Rest')}
              </Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={16} color="#4A7C59" />
              <Text style={styles.perkText}>
                <Text style={styles.perkBold}>{t('aiReport.paywall.perk3Bold')}</Text>
                {t('aiReport.paywall.perk3Rest')}
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
                <Text
                  style={styles.planBestText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {offering.yearlyDiscountBadge}
                </Text>
              </View>
              <Text style={styles.planName} numberOfLines={2}>
                {t('aiReport.plans.yearly')}
              </Text>
              <Text
                style={styles.planPrice}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {offering.yearlyPriceLabel}
              </Text>
              <Text style={styles.planSubPrice} numberOfLines={2}>
                ({offering.yearlyPerMonthLabel})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardActive,
              ]}
              onPress={() => setSelectedPlan('monthly')}
            >
              <Text style={styles.planName} numberOfLines={2}>
                {t('aiReport.plans.monthly')}
              </Text>
              <Text
                style={styles.planPrice}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {offering.monthlyPriceLabel}
              </Text>
              <Text style={styles.planSubPrice} numberOfLines={2}>
                {t('aiReport.plans.monthlySubLabel')}
              </Text>
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
                  {offering.isStoreReady
                    ? t('aiReport.paywall.subscribeBtn', { price: selectedPriceLabel })
                    : t('aiReport.paywall.subscribeBtnGeneric')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.restoreBtn}
            disabled={purchasing}
            onPress={handleRestore}
          >
            <Text style={styles.restoreBtnText}>{t('aiReport.paywall.restoreBtn')}</Text>
          </TouchableOpacity>

          <Text style={styles.subNotes}>
            {t('aiReport.paywall.notes', { storeName })}
          </Text>

          {renderLegalLinks()}
        </View>
      )}

      {/* 過去のAI診断アーカイブ */}
      {isPremium && reportHistory.length > 0 && (
        <View style={styles.archiveSection}>
          <View style={styles.archiveHeader}>
            <View style={styles.archiveTitleRow}>
              <Ionicons name="albums-outline" size={16} color={COLORS.primaryDark} />
              <Text style={styles.archiveTitle}>
                {t('aiReport.archive.title', { count: reportHistory.length })}
              </Text>
            </View>
            {isViewingOlderReport && latestReportRecord && (
              <TouchableOpacity
                style={styles.backLatestBtn}
                onPress={() => handleSelectArchiveReport(latestReportRecord.id)}
              >
                <Text style={styles.backLatestBtnText}>{t('aiReport.archive.backToLatest')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.archiveHint}>{t('aiReport.archive.hint')}</Text>

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
                  onPress={() => handleSelectArchiveReport(item.id)}
                >
                  <View style={styles.archiveCardTop}>
                    <Text style={[styles.archiveDate, isSelected && styles.archiveDateActive]}>
                      {formatDateOnlyFromIso(item.createdAt, locale)}
                    </Text>
                    <View style={styles.archiveChipRow}>
                      {isSelected && (
                        <View style={styles.viewingChip}>
                          <Text style={styles.viewingChipText}>
                            {t('aiReport.archive.viewing')}
                          </Text>
                        </View>
                      )}
                      {idx === 0 && (
                        <View style={styles.latestChip}>
                          <Text style={styles.latestChipText}>
                            {t('aiReport.archive.latest')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.archiveScoreRow}>
                    <Text style={[styles.archiveScore, isSelected && styles.archiveScoreActive]}>
                      {item.report.overallScore}
                      <Text style={styles.archiveScoreUnit}>
                        {t('aiReport.archive.scoreUnit')}
                      </Text>
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
                    {t('aiReport.archive.meta', {
                      days: item.analyzedDays,
                      answers: item.analyzedAnswers,
                    })}
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
                {t('aiReport.archive.olderBanner', {
                  datetime: formatDateTimeFromIso(activeReportRecord.createdAt, locale),
                })}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 実レポート / サンプルプレビュー */}
      {!loadingEntitlement &&
        (isShowingSample ? (
          <View style={styles.sampleAccordionOuter}>
            <TouchableOpacity
              style={styles.sampleToggleBtn}
              activeOpacity={0.75}
              onPress={() => setIsSampleOpen((prev) => !prev)}
            >
              <Ionicons name="eye-outline" size={16} color={COLORS.primaryDark} />
              <Text style={styles.sampleToggleText}>{t('aiReport.sampleToggle')}</Text>
              <Ionicons
                name={isSampleOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {isSampleOpen && <View style={styles.sampleAccordionBody}>{renderReportCards()}</View>}
          </View>
        ) : (
          renderReportCards()
        ))}

      {isPremium && (
        <View style={styles.premiumLegalFooter}>
          <Text style={styles.subNotes}>
            {t('aiReport.paywall.premiumNotes', { storeName })}
          </Text>
          {renderLegalLinks()}
        </View>
      )}

      {/* すれ違い・別れの原因 AI 振り返り診断 */}
      <View
        style={styles.reflectionOuter}
        onLayout={(e) => {
          reflectionSectionYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <TouchableOpacity
          style={styles.reflectionToggleBtn}
          activeOpacity={0.75}
          onPress={() => setReflectionExpandedOverride(!isReflectionOpen)}
        >
          <Ionicons name="heart-half-outline" size={15} color="#7C6A77" />
          <Text style={styles.reflectionToggleText}>{t('aiReport.reflection.toggle')}</Text>
          <Ionicons
            name={isReflectionOpen ? 'chevron-up' : 'chevron-down'}
            size={15}
            color="#9C8D97"
          />
        </TouchableOpacity>

        {isReflectionOpen && (
          <View style={[styles.card, SHADOWS.cardSmall, styles.reflectionCard]}>
            <View style={styles.reflectionHeader}>
              <View style={styles.reflectionTitleRow}>
                <Ionicons name="leaf-outline" size={17} color="#6F5A6B" />
                <Text style={styles.reflectionTitle}>{t('aiReport.reflection.title')}</Text>
              </View>
              {latestReflectionRecord && isPremium ? (
                <Text style={styles.reflectionMeta}>
                  {t('aiReport.reflection.meta', {
                    datetime: formatDateTimeFromIso(latestReflectionRecord.createdAt, locale),
                    days: latestReflectionRecord.analyzedDays,
                    answers: latestReflectionRecord.analyzedAnswers,
                  })}
                </Text>
              ) : (
                <Text style={styles.reflectionSubtitle}>{t('aiReport.reflection.subtitle')}</Text>
              )}
            </View>

            <Text style={styles.reflectionLead}>
              {!isPairConnected && hasPair
                ? t('aiReport.reflection.leadSolo')
                : t('aiReport.reflection.leadDefault')}
            </Text>

            {isPremium ? (
              <TouchableOpacity
                style={[styles.reflectionActionBtn, !hasPair && styles.reflectionActionBtnDisabled]}
                activeOpacity={0.85}
                disabled={generatingReflection || !hasPair}
                onPress={() =>
                  void handleGenerateReflection(Boolean(latestReflectionRecord))
                }
              >
                {generatingReflection ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.reflectionActionBtnText}>
                      {latestReflectionRecord
                        ? t('aiReport.reflection.updateBtn')
                        : t('aiReport.reflection.generateBtn')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.reflectionPremiumNotice}>
                <Text style={styles.reflectionPremiumNoticeText}>
                  {t('aiReport.reflection.freeNotice')}
                </Text>
                <TouchableOpacity
                  style={styles.reflectionScrollToSubBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    scrollViewRef.current?.scrollTo({
                      y: Math.max(0, subCardYRef.current - 16),
                      animated: true,
                    });
                  }}
                >
                  <Text style={styles.reflectionScrollToSubText}>
                    {t('aiReport.reflection.checkPlansBtn')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {(() => {
              const reflection =
                isPremium && latestReflectionRecord
                  ? latestReflectionRecord.report
                  : sampleReflection;
              const isReflectionSample = !isPremium || !latestReflectionRecord;

              return (
                <View style={styles.reflectionBody}>
                  {isReflectionSample && (
                    <View style={styles.reflectionSampleTag}>
                      <Text style={styles.reflectionSampleTagText}>
                        {t('aiReport.reflection.sampleTag')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.warmMessageBox}>
                    <View style={styles.warmMessageHeader}>
                      <Ionicons name="heart-outline" size={15} color="#8E5D6D" />
                      <Text style={styles.warmMessageLabel}>
                        {t('aiReport.reflection.warmMessageLabel')}
                      </Text>
                    </View>
                    <Text style={styles.warmMessageText}>{reflection.warmMessage}</Text>
                  </View>

                  {reflection.goodMemoriesSummary ? (
                    <View style={styles.goodMemoriesBox}>
                      <Text style={styles.goodMemoriesLabel}>
                        {t('aiReport.reflection.goodMemoriesLabel')}
                      </Text>
                      <Text style={styles.goodMemoriesText}>{reflection.goodMemoriesSummary}</Text>
                    </View>
                  ) : null}

                  {reflection.rootCauses.length > 0 && (
                    <View style={styles.causesList}>
                      <Text style={styles.causesHeading}>
                        {t('aiReport.reflection.causesHeading')}
                      </Text>
                      {reflection.rootCauses.map((cause, idx) => (
                        <View key={`${cause.title}-${idx}`} style={styles.causeItem}>
                          <Text style={styles.causeTitle}>
                            {idx + 1}. {cause.title}
                          </Text>
                          <Text style={styles.causeBackground}>{cause.background}</Text>
                          {cause.takeaway ? (
                            <View style={styles.takeawayBox}>
                              <Text style={styles.takeawayLabel}>
                                {t('aiReport.reflection.takeawayLabel')}
                              </Text>
                              <Text style={styles.takeawayText}>{cause.takeaway}</Text>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}

                  {reflection.myStrengthForNextLove ? (
                    <View style={styles.strengthBox}>
                      <Text style={styles.strengthLabel}>
                        {t('aiReport.reflection.strengthLabel')}
                      </Text>
                      <Text style={styles.strengthText}>{reflection.myStrengthForNextLove}</Text>
                    </View>
                  ) : null}

                  {reflection.gentleNextStep ? (
                    <View style={styles.gentleStepBox}>
                      <Ionicons name="sunny-outline" size={15} color="#7A5D4F" />
                      <Text style={styles.gentleStepText}>{reflection.gentleNextStep}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })()}
          </View>
        )}
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
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
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
    lineHeight: 18,
  },
  premiumMetaText: {
    fontSize: 12,
    color: '#3B6347',
    marginBottom: 12,
    lineHeight: 19,
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
    lineHeight: 18,
  },
  generateBtn: {
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 8,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 20,
  },
  sampleAccordionOuter: {
    marginBottom: 12,
  },
  sampleToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sampleToggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryDark,
    lineHeight: 19,
  },
  sampleAccordionBody: {
    marginTop: 12,
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
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 21,
  },
  scoreBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 16,
  },
  coupleTypes: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  typeBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  typeUser: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 4,
    lineHeight: 17,
  },
  typeTag: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primaryDark,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  typeDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  plusSign: {
    paddingHorizontal: 6,
    justifyContent: 'center',
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
    lineHeight: 18,
    marginBottom: 4,
  },
  chemistryText: {
    fontSize: 12,
    color: '#3B6347',
    lineHeight: 19,
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
    lineHeight: 16,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 22,
  },
  riskLead: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  riskItemTitle: {
    flex: 1,
    minWidth: '60%',
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 19,
  },
  riskItemLevel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#C85338',
    flexShrink: 0,
    lineHeight: 17,
  },
  riskItemDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 19,
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
    lineHeight: 16,
    marginBottom: 2,
  },
  rxText: {
    fontSize: 11.5,
    color: COLORS.text,
    lineHeight: 18,
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
    lineHeight: 19,
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
    flex: 1,
    lineHeight: 22,
  },
  subSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 19,
  },
  subUnansweredCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5E2',
    borderWidth: 1,
    borderColor: '#EBC98D',
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  subUnansweredCalloutText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#7A4E16',
    lineHeight: 19,
  },
  perksBox: {
    backgroundColor: '#FAF6EE',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 18,
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
    lineHeight: 19,
  },
  perkBold: {
    fontWeight: '800',
    color: COLORS.text,
  },
  planSelector: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    maxWidth: '94%',
  },
  planBestText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 13,
  },
  planName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 3,
  },
  planPrice: {
    fontSize: 14.5,
    fontWeight: '900',
    color: COLORS.primaryDark,
    textAlign: 'center',
    lineHeight: 20,
  },
  planSubPrice: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 3,
    textAlign: 'center',
    lineHeight: 15,
  },
  subscribeBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    gap: 8,
    marginBottom: 10,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 20,
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
    lineHeight: 18,
  },
  subNotes: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
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
    lineHeight: 17,
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
    gap: 8,
    marginBottom: 4,
  },
  archiveHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 9,
  },
  archiveTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  archiveTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 19,
  },
  backLatestBtn: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 0,
  },
  backLatestBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 16,
  },
  archiveScrollContent: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 6,
  },
  archiveCard: {
    width: 194,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 6,
  },
  archiveChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  archiveDate: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  archiveDateActive: {
    color: COLORS.primaryDark,
  },
  viewingChip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  viewingChipText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
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
    lineHeight: 15,
  },
  archiveTags: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 15,
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
    lineHeight: 17,
  },
  reflectionOuter: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E7DDD3',
  },
  reflectionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#F8F4F2',
    borderWidth: 1,
    borderColor: '#E7DEE2',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  reflectionToggleText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#756470',
    lineHeight: 18,
  },
  reflectionCard: {
    marginTop: 12,
    backgroundColor: '#FAF7F9',
    borderColor: '#E6DCE2',
    marginBottom: 4,
  },
  reflectionHeader: {
    marginBottom: 8,
  },
  reflectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  reflectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#4F3E4B',
    lineHeight: 21,
  },
  reflectionSubtitle: {
    fontSize: 11.5,
    color: '#7E6E7A',
    lineHeight: 18,
  },
  reflectionMeta: {
    fontSize: 11,
    color: '#7E6E7A',
    lineHeight: 17,
  },
  reflectionLead: {
    fontSize: 12,
    color: '#6C5D68',
    lineHeight: 19,
    marginBottom: 14,
  },
  reflectionActionBtn: {
    backgroundColor: '#7A6174',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  reflectionActionBtnDisabled: {
    opacity: 0.5,
  },
  reflectionActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 19,
  },
  reflectionPremiumNotice: {
    backgroundColor: '#F3ECF1',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2D4DF',
    marginBottom: 14,
    gap: 10,
  },
  reflectionPremiumNoticeText: {
    fontSize: 11.5,
    color: '#645260',
    lineHeight: 19,
  },
  reflectionScrollToSubBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6C3D1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reflectionScrollToSubText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B5265',
    lineHeight: 18,
  },
  reflectionBody: {
    gap: 12,
  },
  reflectionSampleTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFE6ED',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  reflectionSampleTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#725D6D',
    lineHeight: 16,
  },
  warmMessageBox: {
    backgroundColor: '#FFF9FA',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFDDE3',
  },
  warmMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  warmMessageLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#8E5D6D',
    lineHeight: 18,
  },
  warmMessageText: {
    fontSize: 12.5,
    color: '#4C3D44',
    lineHeight: 20,
  },
  goodMemoriesBox: {
    backgroundColor: '#F3F8F5',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#D2E4D9',
  },
  goodMemoriesLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#466F53',
    lineHeight: 17,
    marginBottom: 5,
  },
  goodMemoriesText: {
    fontSize: 12,
    color: '#3B5844',
    lineHeight: 19,
  },
  causesList: {
    gap: 10,
  },
  causesHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#574653',
    lineHeight: 19,
    marginBottom: 2,
  },
  causeItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#EAE0E6',
  },
  causeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#463742',
    lineHeight: 19,
    marginBottom: 5,
  },
  causeBackground: {
    fontSize: 12,
    color: '#6A5B66',
    lineHeight: 19,
    marginBottom: 9,
  },
  takeawayBox: {
    backgroundColor: '#F8F4F7',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#9E7B94',
  },
  takeawayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6E5467',
    lineHeight: 17,
    marginBottom: 3,
  },
  takeawayText: {
    fontSize: 11.5,
    color: '#483944',
    lineHeight: 19,
  },
  strengthBox: {
    backgroundColor: '#FDF8F2',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#EFE0CE',
  },
  strengthLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#8D6136',
    lineHeight: 17,
    marginBottom: 5,
  },
  strengthText: {
    fontSize: 12,
    color: '#5A4532',
    lineHeight: 19,
  },
  gentleStepBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F7EFE8',
    borderRadius: 12,
    padding: 12,
  },
  gentleStepText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B463B',
    lineHeight: 19,
  },
});
