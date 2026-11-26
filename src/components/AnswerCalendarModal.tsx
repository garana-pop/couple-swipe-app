import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentLocale } from '../i18n';
import {
  formatIsoFullDate,
  formatIsoShortDate,
  formatYearMonth,
  getCalendarWeekdayLabels,
} from '../i18n/format';
import { getDeviceFirstWeekday } from '../i18n/locale';
import type { CalendarDaySummary, HistoryDayItem } from '../types';

type DayVisualStatus =
  | 'inactive'
  | 'both_done'
  | 'my_done_waiting'
  | 'today_unanswered'
  | 'past_unanswered_partner_done'
  | 'past_unanswered';

interface AnswerCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  hasPair: boolean;
  todayDate: string;
  pairStartDate: string | null;
  isPairPremium: boolean;
  partnerName: string;
  calendarDays: Record<string, CalendarDaySummary>;
  historyDays: HistoryDayItem[];
  myUnansweredDays: number;
  myPastUnansweredDays: number;
  pastPartnerAnsweredUnansweredDays: number;
  onAnswerDate: (dateStr: string, isToday: boolean) => void;
  onOpenResult: (dateStr: string, isToday: boolean) => void;
  onOpenWaiting: () => void;
  onOpenPremium: () => void;
}

function parseIsoParts(iso: string): { year: number; month: number; day: number } {
  const parts = iso.split('-').map(Number);
  if (parts.length === 3 && !parts.some((n) => Number.isNaN(n))) {
    return { year: parts[0], month: parts[1], day: parts[2] };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getWeekdayUtc(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function compareYearMonth(a: { year: number; month: number }, b: { year: number; month: number }): number {
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

export const AnswerCalendarModal: React.FC<AnswerCalendarModalProps> = ({
  visible,
  onClose,
  hasPair,
  todayDate,
  pairStartDate,
  isPairPremium,
  partnerName,
  calendarDays,
  historyDays,
  myUnansweredDays,
  myPastUnansweredDays,
  pastPartnerAnsweredUnansweredDays,
  onAnswerDate,
  onOpenResult,
  onOpenWaiting,
  onOpenPremium,
}) => {
  const { t, i18n } = useTranslation();
  const locale = getCurrentLocale();
  const weekStartsOn = useMemo(() => getDeviceFirstWeekday(locale), [locale]);
  const weekdayLabels = useMemo(
    () => getCalendarWeekdayLabels(locale, weekStartsOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, weekStartsOn, i18n.language]
  );

  // 週の開始曜日に応じた日曜・土曜の列インデックス
  const sundayColIdx = (7 - weekStartsOn) % 7;
  const saturdayColIdx = (6 - weekStartsOn) % 7;

  const todayParts = useMemo(() => parseIsoParts(todayDate), [todayDate]);

  const effectiveStartDate = useMemo(() => {
    if (!hasPair) return null;
    let earliest = pairStartDate;
    for (const dateKey of Object.keys(calendarDays)) {
      if (!earliest || dateKey < earliest) {
        earliest = dateKey;
      }
    }
    if (!earliest || earliest > todayDate) {
      return todayDate;
    }
    return earliest;
  }, [hasPair, pairStartDate, calendarDays, todayDate]);

  const startParts = useMemo(
    () => (effectiveStartDate ? parseIsoParts(effectiveStartDate) : todayParts),
    [effectiveStartDate, todayParts]
  );

  const historyByDate = useMemo(() => {
    const map: Record<string, HistoryDayItem> = {};
    for (const h of historyDays) {
      map[h.quizDate] = h;
    }
    return map;
  }, [historyDays]);

  const latestPastUnansweredDate = useMemo(() => {
    if (!hasPair || !effectiveStartDate || effectiveStartDate >= todayDate) return null;
    let cursor = shiftIsoDate(todayDate, -1);
    let guard = 0;
    while (cursor >= effectiveStartDate && guard < 2000) {
      const rec = calendarDays[cursor];
      if (!rec?.isMyCompleted) {
        return cursor;
      }
      cursor = shiftIsoDate(cursor, -1);
      guard++;
    }
    return null;
  }, [hasPair, effectiveStartDate, todayDate, calendarDays]);

  const [displayYear, setDisplayYear] = useState(todayParts.year);
  const [displayMonth, setDisplayMonth] = useState(todayParts.month);
  const [selectedDate, setSelectedDate] = useState<string>(todayDate);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      userTouchedRef.current = false;
      return;
    }
    if (userTouchedRef.current) return;
    const target = latestPastUnansweredDate ?? todayDate;
    const p = parseIsoParts(target);
    setDisplayYear(p.year);
    setDisplayMonth(p.month);
    setSelectedDate(target);
  }, [visible, latestPastUnansweredDate, todayDate]);

  const canGoPrevMonth =
    compareYearMonth({ year: displayYear, month: displayMonth }, startParts) > 0;
  const canGoNextMonth =
    compareYearMonth({ year: displayYear, month: displayMonth }, todayParts) < 0;

  const isViewingCurrentMonth =
    displayYear === todayParts.year && displayMonth === todayParts.month;

  const handlePrevMonth = () => {
    if (!canGoPrevMonth) return;
    userTouchedRef.current = true;
    if (displayMonth === 1) {
      setDisplayYear((y) => y - 1);
      setDisplayMonth(12);
    } else {
      setDisplayMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNextMonth) return;
    userTouchedRef.current = true;
    if (displayMonth === 12) {
      setDisplayYear((y) => y + 1);
      setDisplayMonth(1);
    } else {
      setDisplayMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    userTouchedRef.current = true;
    setDisplayYear(todayParts.year);
    setDisplayMonth(todayParts.month);
    setSelectedDate(todayDate);
  };

  const getDayStatus = (iso: string): DayVisualStatus => {
    if (!hasPair || !effectiveStartDate) return 'inactive';
    if (iso > todayDate || iso < effectiveStartDate) return 'inactive';
    const rec = calendarDays[iso];
    if (iso === todayDate) {
      if (rec?.isMyCompleted && rec?.isPartnerCompleted) return 'both_done';
      if (rec?.isMyCompleted) return 'my_done_waiting';
      return 'today_unanswered';
    }
    if (rec?.isRevealed) return 'both_done';
    if (rec?.isMyCompleted) return 'my_done_waiting';
    if ((rec?.partnerAnsweredCount ?? 0) > 0) return 'past_unanswered_partner_done';
    return 'past_unanswered';
  };

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = getWeekdayUtc(displayYear, displayMonth, 1);
    const leadingBlanks = (firstDayOfWeek - weekStartsOn + 7) % 7;
    const totalDays = getDaysInMonth(displayYear, displayMonth);
    const cells: (string | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push(toIsoDate(displayYear, displayMonth, d));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [displayYear, displayMonth, weekStartsOn]);

  const monthSummary = useMemo(() => {
    let answered = 0;
    let unanswered = 0;
    const totalDays = getDaysInMonth(displayYear, displayMonth);
    for (let d = 1; d <= totalDays; d++) {
      const iso = toIsoDate(displayYear, displayMonth, d);
      const status = getDayStatus(iso);
      if (status === 'both_done' || status === 'my_done_waiting') {
        answered++;
      } else if (
        status === 'today_unanswered' ||
        status === 'past_unanswered' ||
        status === 'past_unanswered_partner_done'
      ) {
        unanswered++;
      }
    }
    return { answered, unanswered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayYear, displayMonth, hasPair, effectiveStartDate, todayDate, calendarDays]);

  const handleTapDay = (iso: string, status: DayVisualStatus) => {
    if (status === 'inactive') return;
    userTouchedRef.current = true;
    if (
      selectedDate === iso &&
      isPairPremium &&
      (status === 'past_unanswered' || status === 'past_unanswered_partner_done')
    ) {
      onAnswerDate(iso, false);
      return;
    }
    setSelectedDate(iso);
  };

  const selectedStatus = getDayStatus(selectedDate);
  const selectedRec = calendarDays[selectedDate];
  const selectedHistory = historyByDate[selectedDate];

  const renderSelectedDayPanel = () => {
    if (!hasPair || selectedStatus === 'inactive') {
      return (
        <View style={styles.detailCard}>
          <Text style={styles.detailEmptyText}>{t('calendar.emptyPanel')}</Text>
        </View>
      );
    }

    const totalQ = selectedRec?.totalQuestions && selectedRec.totalQuestions > 0 ? selectedRec.totalQuestions : 3;
    const myCount = selectedRec?.myAnsweredCount ?? 0;
    const partnerCount = selectedRec?.partnerAnsweredCount ?? 0;
    const remaining = Math.max(1, totalQ - myCount);
    const fullDateText = formatIsoFullDate(selectedDate, locale);
    const shortDateText = formatIsoShortDate(selectedDate, locale);

    if (selectedStatus === 'past_unanswered' || selectedStatus === 'past_unanswered_partner_done') {
      return (
        <View
          style={[
            styles.detailCard,
            isPairPremium ? styles.detailCardPremiumReady : styles.detailCardLocked,
          ]}
        >
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailDate}>{fullDateText}</Text>
            <View style={isPairPremium ? styles.badgePremium : styles.badgeAmber}>
              <Ionicons
                name={isPairPremium ? 'diamond' : 'lock-closed'}
                size={11}
                color="#8C5A1B"
              />
              <Text style={styles.badgeAmberText}>
                {myCount > 0
                  ? t('calendar.badges.partial', { count: remaining })
                  : t('calendar.badges.unansweredDay')}
              </Text>
            </View>
          </View>

          {partnerCount > 0 ? (
            <View style={styles.partnerHighlightBox}>
              <Ionicons name="heart" size={14} color="#D97559" />
              <Text style={styles.partnerHighlightText}>
                {isPairPremium
                  ? t('calendar.pastUnanswered.partnerDonePremium', {
                      partnerName,
                      count: partnerCount,
                    })
                  : t('calendar.pastUnanswered.partnerDoneFree', {
                      partnerName,
                      count: partnerCount,
                    })}
              </Text>
            </View>
          ) : (
            <Text style={styles.detailDesc}>
              {isPairPremium
                ? t('calendar.pastUnanswered.descPremium', { partnerName })
                : t('calendar.pastUnanswered.descFree')}
            </Text>
          )}

          {isPairPremium ? (
            <TouchableOpacity
              style={styles.primaryCtaBtn}
              activeOpacity={0.85}
              onPress={() => onAnswerDate(selectedDate, false)}
            >
              <Ionicons name="play-circle" size={17} color="#FFFFFF" />
              <Text style={styles.primaryCtaBtnText}>
                {t('calendar.pastUnanswered.ctaPremium', {
                  date: shortDateText,
                  count: remaining,
                })}
              </Text>
              <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.premiumCtaBtn}
              activeOpacity={0.85}
              onPress={onOpenPremium}
            >
              <Ionicons name="diamond" size={15} color="#FFFFFF" />
              <Text style={styles.primaryCtaBtnText}>
                {t('calendar.pastUnanswered.ctaFree', { date: shortDateText })}
              </Text>
              <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (selectedStatus === 'today_unanswered') {
      return (
        <View style={[styles.detailCard, styles.detailCardToday]}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailDate}>{fullDateText}</Text>
            <View style={styles.badgeToday}>
              <Text style={styles.badgeTodayText}>{t('calendar.badges.todayUnanswered')}</Text>
            </View>
          </View>
          <Text style={styles.detailDesc}>
            {partnerCount > 0
              ? t('calendar.todayUnanswered.descPartnerStarted', {
                  partnerName,
                  count: remaining,
                })
              : t('calendar.todayUnanswered.descDefault', { count: remaining })}
          </Text>
          <TouchableOpacity
            style={styles.primaryCtaBtn}
            activeOpacity={0.85}
            onPress={() => onAnswerDate(selectedDate, true)}
          >
            <Ionicons name="play" size={15} color="#FFFFFF" />
            <Text style={styles.primaryCtaBtnText}>
              {t('calendar.todayUnanswered.cta', { count: remaining })}
            </Text>
            <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      );
    }

    if (selectedStatus === 'both_done') {
      const bothItems = selectedHistory?.items.filter((i) => i.myAnswer && i.partnerAnswer) ?? [];
      const matched = bothItems.filter((i) => i.isMatched).length;
      const rateText =
        bothItems.length > 0
          ? t('calendar.bothDone.rateText', {
              percentage: Math.round((matched / bothItems.length) * 100),
              matched,
              total: bothItems.length,
            })
          : t('calendar.bothDone.fallbackText');

      return (
        <View style={[styles.detailCard, styles.detailCardDone]}>
          <View style={styles.detailHeaderRow}>
            <Text style={styles.detailDate}>{fullDateText}</Text>
            <View style={styles.badgeDone}>
              <Ionicons name="checkmark-circle" size={12} color="#3B6347" />
              <Text style={styles.badgeDoneText}>{t('calendar.badges.bothDone')}</Text>
            </View>
          </View>
          <Text style={styles.detailDesc}>{rateText}</Text>
          <TouchableOpacity
            style={styles.secondaryCtaBtn}
            activeOpacity={0.8}
            onPress={() => onOpenResult(selectedDate, selectedDate === todayDate)}
          >
            <Ionicons name="sparkles-outline" size={15} color="#3B6347" />
            <Text style={styles.secondaryCtaBtnText}>{t('calendar.bothDone.cta')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#3B6347" />
          </TouchableOpacity>
        </View>
      );
    }

    const isToday = selectedDate === todayDate;
    const canViewPastPartial = !isToday && isPairPremium && partnerCount > 0;
    return (
      <View style={[styles.detailCard, styles.detailCardWaiting]}>
        <View style={styles.detailHeaderRow}>
          <Text style={styles.detailDate}>{fullDateText}</Text>
          <View style={styles.badgeWaiting}>
            <Ionicons name="time-outline" size={12} color="#33587A" />
            <Text style={styles.badgeWaitingText}>{t('calendar.badges.myDone')}</Text>
          </View>
        </View>
        <Text style={styles.detailDesc}>
          {isToday
            ? t('calendar.myDoneWaiting.descToday', { partnerName })
            : partnerCount > 0
              ? t('calendar.myDoneWaiting.descPastPartnerPartial', {
                  partnerName,
                  count: partnerCount,
                })
              : t('calendar.myDoneWaiting.descPastPartnerNone', { partnerName })}
        </Text>
        {isToday ? (
          <TouchableOpacity
            style={styles.waitingCtaBtn}
            activeOpacity={0.8}
            onPress={onOpenWaiting}
          >
            <Ionicons name="lock-closed-outline" size={15} color="#33587A" />
            <Text style={styles.waitingCtaBtnText}>{t('calendar.myDoneWaiting.ctaWaiting')}</Text>
            <Ionicons name="chevron-forward" size={14} color="#33587A" />
          </TouchableOpacity>
        ) : canViewPastPartial ? (
          <TouchableOpacity
            style={styles.waitingCtaBtn}
            activeOpacity={0.8}
            onPress={() => onOpenResult(selectedDate, false)}
          >
            <Ionicons name="diamond-outline" size={15} color="#33587A" />
            <Text style={styles.waitingCtaBtnText}>
              {t('calendar.myDoneWaiting.ctaPastPartial')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#33587A" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, SHADOWS.cardFloating]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <View style={styles.sheetIconBadge}>
                <Ionicons name="calendar" size={16} color={COLORS.primary} />
              </View>
              <View style={styles.sheetTitleTextCol}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {t('calendar.title')}
                </Text>
                <Text style={styles.sheetSubtitle} numberOfLines={2}>
                  {myUnansweredDays > 0
                    ? t('calendar.subtitleUnanswered', {
                        total: myUnansweredDays,
                        past: myPastUnansweredDays,
                      })
                    : t('calendar.subtitleAllDone')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            <View style={styles.monthBar}>
              <TouchableOpacity
                style={[styles.monthNavBtn, !canGoPrevMonth && styles.monthNavBtnDisabled]}
                disabled={!canGoPrevMonth}
                onPress={handlePrevMonth}
              >
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={canGoPrevMonth ? COLORS.text : COLORS.textLight}
                />
              </TouchableOpacity>

              <View style={styles.monthCenter}>
                <Text
                  style={styles.monthLabel}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {formatYearMonth(displayYear, displayMonth, locale)}
                </Text>
                <Text style={styles.monthMiniStat} numberOfLines={2}>
                  {t('calendar.monthMiniStat', {
                    answered: monthSummary.answered,
                    unanswered: monthSummary.unanswered,
                  })}
                </Text>
              </View>

              <View style={styles.monthRightGroup}>
                {!isViewingCurrentMonth && (
                  <TouchableOpacity style={styles.todayChip} onPress={handleJumpToday}>
                    <Text style={styles.todayChipText} numberOfLines={1}>
                      {t('calendar.todayChip')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.monthNavBtn, !canGoNextMonth && styles.monthNavBtnDisabled]}
                  disabled={!canGoNextMonth}
                  onPress={handleNextMonth}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={canGoNextMonth ? COLORS.text : COLORS.textLight}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.weekdayRow}>
              {weekdayLabels.map((w, idx) => (
                <View key={`${w}-${idx}`} style={styles.weekdayCell}>
                  <Text
                    style={[
                      styles.weekdayText,
                      idx === sundayColIdx && { color: '#C85338' },
                      idx === saturdayColIdx && { color: '#4D779E' },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {w}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              {calendarCells.map((iso, idx) => {
                if (!iso) {
                  return <View key={`blank-${idx}`} style={styles.dayCellOuter} />;
                }
                const dayNum = Number(iso.slice(8, 10));
                const status = getDayStatus(iso);
                const isSelected = selectedDate === iso && status !== 'inactive';
                const isInactive = status === 'inactive';

                return (
                  <View key={iso} style={styles.dayCellOuter}>
                    <TouchableOpacity
                      disabled={isInactive}
                      activeOpacity={0.75}
                      onPress={() => handleTapDay(iso, status)}
                      style={[
                        styles.dayCell,
                        status === 'both_done' && styles.cellBothDone,
                        status === 'my_done_waiting' && styles.cellMyDoneWaiting,
                        status === 'today_unanswered' && styles.cellTodayUnanswered,
                        status === 'past_unanswered_partner_done' && styles.cellPastPartnerDone,
                        status === 'past_unanswered' && styles.cellPastUnanswered,
                        isSelected && styles.cellSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          isInactive && styles.dayNumInactive,
                          status === 'both_done' && styles.dayNumBothDone,
                          status === 'my_done_waiting' && styles.dayNumWaiting,
                          status === 'today_unanswered' && styles.dayNumToday,
                          status === 'past_unanswered_partner_done' && styles.dayNumPartnerDone,
                          status === 'past_unanswered' && styles.dayNumPastUnanswered,
                        ]}
                      >
                        {dayNum}
                      </Text>

                      <View style={styles.indicatorRow}>
                        {status === 'both_done' && (
                          <Ionicons name="checkmark" size={11} color="#3B6347" />
                        )}
                        {status === 'my_done_waiting' && (
                          <View style={[styles.dot, { backgroundColor: '#4D779E' }]} />
                        )}
                        {status === 'today_unanswered' && (
                          <Text
                            style={styles.todayTinyLabel}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.65}
                          >
                            {t('calendar.todayTinyLabel')}
                          </Text>
                        )}
                        {status === 'past_unanswered_partner_done' && (
                          <View style={styles.miniIconsPair}>
                            <Ionicons name="heart" size={9} color="#D97559" />
                            {!isPairPremium && (
                              <Ionicons name="lock-closed" size={9} color="#9E6B24" />
                            )}
                          </View>
                        )}
                        {status === 'past_unanswered' &&
                          (isPairPremium ? (
                            <View style={[styles.dot, { backgroundColor: '#D97559' }]} />
                          ) : (
                            <Ionicons name="lock-closed" size={9} color="#B86B4B" />
                          ))}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.cellBothDone]} />
                <Text style={styles.legendText}>{t('calendar.legend.bothDone')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.cellMyDoneWaiting]} />
                <Text style={styles.legendText}>{t('calendar.legend.myDone')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.cellPastPartnerDone]} />
                <Text style={styles.legendText}>{t('calendar.legend.pastPartnerDone')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.cellPastUnanswered]} />
                <Text style={styles.legendText}>{t('calendar.legend.unanswered')}</Text>
              </View>
            </View>

            {renderSelectedDayPanel()}

            {!isPairPremium && myPastUnansweredDays > 0 && (
              <TouchableOpacity
                style={styles.footerUpsellStrip}
                activeOpacity={0.85}
                onPress={onOpenPremium}
              >
                <Ionicons name="diamond" size={14} color="#8C5A1B" />
                <Text style={styles.footerUpsellText}>
                  {pastPartnerAnsweredUnansweredDays > 0
                    ? t('calendar.footerUpsellPartner', {
                        past: myPastUnansweredDays,
                        partner: pastPartnerAnsweredUnansweredDays,
                      })
                    : t('calendar.footerUpsellDefault', { count: myPastUnansweredDays })}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 24, 20, 0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    width: '100%',
    maxWidth: 404,
    maxHeight: '88%',
    backgroundColor: COLORS.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  sheetTitleTextCol: {
    flex: 1,
    minWidth: 0,
  },
  sheetIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 22,
  },
  sheetSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 1,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
    flexShrink: 0,
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 18,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 12,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  monthNavBtnDisabled: {
    opacity: 0.45,
  },
  monthCenter: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 21,
  },
  monthMiniStat: {
    fontSize: 10.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 1,
    textAlign: 'center',
    lineHeight: 15,
  },
  monthRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  todayChip: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#F2CFC2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
  },
  todayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 15,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCell: {
    width: '14.2857%',
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  dayCellOuter: {
    width: '14.2857%',
    padding: 2.5,
  },
  dayCell: {
    height: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 2,
  },
  cellBothDone: {
    backgroundColor: '#E8F4EC',
    borderColor: '#C1E0CB',
  },
  cellMyDoneWaiting: {
    backgroundColor: '#EAF2F8',
    borderColor: '#C2D9EB',
  },
  cellTodayUnanswered: {
    backgroundColor: '#FDF1EC',
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  cellPastPartnerDone: {
    backgroundColor: '#FFF3DC',
    borderColor: '#E8BC6F',
  },
  cellPastUnanswered: {
    backgroundColor: '#FCEEE9',
    borderColor: '#EAC6B9',
  },
  cellSelected: {
    borderColor: COLORS.text,
    borderWidth: 2,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 16,
  },
  dayNumInactive: {
    color: COLORS.textLight,
    opacity: 0.45,
    fontWeight: '500',
  },
  dayNumBothDone: {
    color: '#2F593C',
    fontWeight: '800',
  },
  dayNumWaiting: {
    color: '#33587A',
    fontWeight: '800',
  },
  dayNumToday: {
    color: COLORS.primaryDark,
    fontWeight: '900',
  },
  dayNumPartnerDone: {
    color: '#8C5A1B',
    fontWeight: '800',
  },
  dayNumPastUnanswered: {
    color: '#A34B36',
    fontWeight: '800',
  },
  indicatorRow: {
    height: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  todayTinyLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
    maxWidth: '94%',
    textAlign: 'center',
  },
  miniIconsPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 6,
    columnGap: 10,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendSwatch: {
    width: 11,
    height: 11,
    borderRadius: 3.5,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  detailCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailCardLocked: {
    backgroundColor: '#FFFBF4',
    borderColor: '#EED9B7',
  },
  detailCardPremiumReady: {
    backgroundColor: '#FFFDF8',
    borderColor: '#EBD3AA',
  },
  detailCardToday: {
    backgroundColor: '#FFF9F6',
    borderColor: '#F2CFC2',
  },
  detailCardDone: {
    backgroundColor: '#F5FAF6',
    borderColor: '#C8E2D1',
  },
  detailCardWaiting: {
    backgroundColor: '#F5F9FC',
    borderColor: '#C8DDEC',
  },
  detailHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  detailDate: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
    lineHeight: 20,
  },
  badgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF3E7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: '100%',
  },
  badgePremium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBF1DF',
    borderWidth: 1,
    borderColor: '#EBD3AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: '100%',
  },
  badgeAmberText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8C5A1B',
    lineHeight: 15,
    flexShrink: 1,
  },
  badgeToday: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeTodayText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primaryDark,
    lineHeight: 15,
  },
  badgeDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F4EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeDoneText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#3B6347',
    lineHeight: 15,
  },
  badgeWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EAF2F8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeWaitingText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#33587A',
    lineHeight: 15,
  },
  detailDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginBottom: 11,
  },
  detailEmptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  partnerHighlightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#FAF3E6',
    borderRadius: 11,
    padding: 10,
    marginBottom: 11,
  },
  partnerHighlightText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#7A5B32',
    lineHeight: 19,
  },
  primaryCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  premiumCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#C87D28',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  primaryCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  secondaryCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#B8DEC4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  secondaryCtaBtnText: {
    color: '#3B6347',
    fontSize: 12.5,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  waitingCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#BDD5E8',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  waitingCtaBtnText: {
    color: '#33587A',
    fontSize: 12.5,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerUpsellStrip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF8EB',
    borderWidth: 1,
    borderColor: '#EDD4A7',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  footerUpsellText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#8C5A1B',
    lineHeight: 18,
  },
});
