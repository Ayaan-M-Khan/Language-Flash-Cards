import { CardState, Deck, Flashcard, SM2Rating } from './types';
import { formatInterval, isCardDue } from './srs';

export interface StoredReviewEvent {
  id: string;
  deckId: string;
  cardId: string;
  rating: SM2Rating;
  intervalDays: number;
  easeFactor?: number;
  repetitions?: number;
  dateStr: string; // YYYY-MM-DD (local date)
  timestamp: string; // ISO string
}

export interface RatingBreakdown {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
  recalledCount: number; // hard + good + easy (or good + easy; we track positive recall = good + easy, and non-lapse = hard + good + easy)
  strongRecallCount: number; // good + easy
  retentionRatePct: number | null; // % of reviews not rated 'again'
  strongRecallPct: number | null; // % of reviews rated 'good' or 'easy'
}

export interface MasteryStageDatum {
  state: CardState;
  label: string;
  shortLabel: string;
  description: string;
  count: number;
  percentage: number;
  dueCount: number;
  avgIntervalLabel: string;
  fill: string;
  dotClass: string;
  textClass: string;
  cards: Flashcard[];
}

export interface ForecastBucket {
  id: 'due' | 'tomorrow' | 'week' | 'month' | 'later';
  label: string;
  shortLabel: string;
  count: number;
  fill: string;
  description: string;
}

export interface DeckMasterySummary {
  deckId: string;
  title: string;
  language: string;
  totalCards: number;
  dueCount: number;
  reviewedCount: number;
  masteredCount: number;
  masteryScorePct: number;
}

export interface MasteryAnalyticsResult {
  scopeId: string; // 'all' or deck.id
  scopeTitle: string;
  scopeSubtitle: string;
  totalCards: number;
  reviewedCount: number;
  dueCount: number;
  masteredCount: number;
  masteredPct: number;
  masteryScorePct: number; // Weighted 0..100 progress across all stages
  avgEase: number;
  avgEaseLabel: string;
  avgRepetitions: number;
  avgIntervalDays: number;
  avgIntervalLabel: string;
  distribution: MasteryStageDatum[];
  maxBucketCount: number;
  forecast: ForecastBucket[];
  maxForecastCount: number;
  ratingBreakdown: RatingBreakdown;
  deckSummaries: DeckMasterySummary[];
}

export interface DailyReviewPoint {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // e.g., "Mon" or "Nov 18"
  shortDateLabel: string; // e.g., "Nov 18"
  fullDayLabel: string; // e.g., "Mon, Nov 18"
  reviews: number;
  target: number;
  isToday: boolean;
  achievedTarget: boolean;
  accuracyPct: number | null;
  againCount: number;
  recalledCount: number;
}

export interface ConsistencyStats {
  daysWindow: number;
  totalWeeklyReviews: number;
  dailyAverage: number;
  activeDaysCount: number;
  daysAchievedTarget: number;
  consistencyRate: number;
  currentStreak: number;
  bestDay: { dayLabel: string; reviews: number };
  windowAccuracyPct: number | null;
  windowRatedCount: number;
  dailyBreakdown: DailyReviewPoint[];
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const MASTERY_STAGE_META: Array<{
  state: CardState;
  label: string;
  shortLabel: string;
  description: string;
  fill: string;
  dotClass: string;
  textClass: string;
}> = [
  {
    state: 'new',
    label: 'New',
    shortLabel: 'New',
    description: 'Unseen cards ready for first review',
    fill: '#94A3B8',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-700',
  },
  {
    state: 'learning',
    label: 'Learning',
    shortLabel: 'Learning',
    description: 'Short-interval recall (< 1 day)',
    fill: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-700',
  },
  {
    state: 'review',
    label: 'Reviewing',
    shortLabel: 'Review',
    description: 'Active spaced repetition progression',
    fill: '#2563EB',
    dotClass: 'bg-blue-600',
    textClass: 'text-blue-700',
  },
  {
    state: 'mastered',
    label: 'Mastered',
    shortLabel: 'Mastered',
    description: 'Long-term retention achieved',
    fill: '#10B981',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
];

/**
 * Calculates a weighted 0..100 mastery score for a single flashcard so learners
 * get immediate, truthful progress feedback as cards move from New -> Learning -> Review -> Mastered.
 */
export function calculateCardMasteryWeight(card: Flashcard): number {
  if (card.state === 'mastered') return 100;
  if (card.state === 'new') return 0;
  if (card.state === 'learning') {
    return 25;
  }
  // 'review' state: 50% base + progression toward mastery based on repetitions and interval
  const reps = Math.max(0, card.repetitions || 0);
  const interval = Math.max(0, card.intervalDays || 0);
  const repBonus = Math.min(25, reps * 8);
  const intervalBonus = Math.min(18, Math.round(Math.log2(interval + 1) * 5));
  return Math.min(93, 45 + repBonus + intervalBonus);
}

/**
 * Weighted 0..100 mastery score across a set of cards.
 */
export function computeDeckMasteryScore(cards: Flashcard[]): number {
  if (cards.length === 0) return 0;
  const totalWeight = cards.reduce((sum, c) => sum + calculateCardMasteryWeight(c), 0);
  return Math.round(totalWeight / cards.length);
}

/**
 * Computes rating distribution and recall accuracy from stored review events.
 */
export function computeRatingBreakdown(events: StoredReviewEvent[]): RatingBreakdown {
  let again = 0;
  let hard = 0;
  let good = 0;
  let easy = 0;

  for (const ev of events) {
    if (ev.rating === 'again') again++;
    else if (ev.rating === 'hard') hard++;
    else if (ev.rating === 'good') good++;
    else if (ev.rating === 'easy') easy++;
  }

  const total = again + hard + good + easy;
  const recalledCount = hard + good + easy;
  const strongRecallCount = good + easy;

  return {
    again,
    hard,
    good,
    easy,
    total,
    recalledCount,
    strongRecallCount,
    retentionRatePct: total > 0 ? Math.round((recalledCount / total) * 100) : null,
    strongRecallPct: total > 0 ? Math.round((strongRecallCount / total) * 100) : null,
  };
}

/**
 * Computes detailed SM-2 mastery analytics for either all decks ('all') or a specific deck.
 */
export function computeMasteryAnalytics(
  cards: Flashcard[],
  decks: Deck[],
  selectedDeckId: string | null,
  reviewEvents: StoredReviewEvent[] = [],
  referenceDate: Date = new Date()
): MasteryAnalyticsResult {
  const isAllDecks = !selectedDeckId || selectedDeckId === 'all';
  const selectedDeck = isAllDecks ? null : decks.find((d) => d.id === selectedDeckId) ?? null;

  const scopedCards = selectedDeck
    ? cards.filter((c) => c.deckId === selectedDeck.id)
    : cards;

  const scopedEvents = selectedDeck
    ? reviewEvents.filter((e) => e.deckId === selectedDeck.id)
    : reviewEvents;

  const totalCards = scopedCards.length;
  const dueCount = scopedCards.filter((c) => isCardDue(c, referenceDate)).length;
  const reviewedCards = scopedCards.filter((c) => c.state !== 'new' || Boolean(c.lastReviewedAt));
  const reviewedCount = reviewedCards.length;

  const distribution: MasteryStageDatum[] = MASTERY_STAGE_META.map((meta) => {
    const matching = scopedCards.filter((c) => c.state === meta.state);
    const count = matching.length;
    const percentage = totalCards > 0 ? Math.round((count / totalCards) * 100) : 0;
    const stageDueCount = matching.filter((c) => isCardDue(c, referenceDate)).length;
    const avgDays =
      count > 0
        ? matching.reduce((sum, c) => sum + (c.intervalDays || 0), 0) / count
        : 0;
    const avgIntervalLabel =
      meta.state === 'new' || count === 0 ? '—' : formatInterval(avgDays);

    return {
      ...meta,
      count,
      percentage,
      dueCount: stageDueCount,
      avgIntervalLabel,
      cards: matching,
    };
  });

  const masteredCount = distribution.find((s) => s.state === 'mastered')?.count ?? 0;
  const masteredPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;
  const masteryScorePct = computeDeckMasteryScore(scopedCards);

  const avgEase =
    totalCards > 0
      ? scopedCards.reduce((sum, c) => sum + (c.easeFactor || 2.5), 0) / totalCards
      : 2.5;

  const avgRepetitions =
    totalCards > 0
      ? Math.round(
          (scopedCards.reduce((sum, c) => sum + (c.repetitions || 0), 0) / totalCards) * 10
        ) / 10
      : 0;

  const cardsWithInterval = scopedCards.filter((c) => c.state !== 'new');
  const avgIntervalDays =
    cardsWithInterval.length > 0
      ? cardsWithInterval.reduce((sum, c) => sum + (c.intervalDays || 0), 0) /
        cardsWithInterval.length
      : 0;
  const avgIntervalLabel =
    cardsWithInterval.length > 0 ? formatInterval(avgIntervalDays) : 'New';

  const highestStage = Math.max(...distribution.map((s) => s.count), 4);
  const maxBucketCount = Math.ceil((highestStage + 1) / 2) * 2;

  // Compute upcoming review forecast buckets
  const refMs = referenceDate.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;
  let dueNowCount = 0;
  let tomorrowCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let laterCount = 0;

  for (const card of scopedCards) {
    if (isCardDue(card, referenceDate)) {
      dueNowCount++;
      continue;
    }
    const diffDays = (new Date(card.dueDate).getTime() - refMs) / msPerDay;
    if (diffDays <= 1.5) tomorrowCount++;
    else if (diffDays <= 7) weekCount++;
    else if (diffDays <= 30) monthCount++;
    else laterCount++;
  }

  const forecast: ForecastBucket[] = [
    {
      id: 'due',
      label: 'Due Now',
      shortLabel: 'Now',
      count: dueNowCount,
      fill: '#EF4444',
      description: 'Ready to study immediately (includes New cards)',
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      shortLabel: '1d',
      count: tomorrowCount,
      fill: '#F97316',
      description: 'Scheduled within the next 24–36 hours',
    },
    {
      id: 'week',
      label: '2–7 Days',
      shortLabel: '2–7d',
      count: weekCount,
      fill: '#2563EB',
      description: 'Short-to-medium spaced repetition queue',
    },
    {
      id: 'month',
      label: '8–30 Days',
      shortLabel: '8–30d',
      count: monthCount,
      fill: '#6366F1',
      description: 'Consolidating long-term memory',
    },
    {
      id: 'later',
      label: '30d+',
      shortLabel: '30d+',
      count: laterCount,
      fill: '#10B981',
      description: 'Deeply retained vocabulary',
    },
  ];

  const highestForecast = Math.max(...forecast.map((f) => f.count), 4);
  const maxForecastCount = Math.ceil((highestForecast + 1) / 2) * 2;

  const ratingBreakdown = computeRatingBreakdown(scopedEvents);

  const deckSummaries: DeckMasterySummary[] = decks.map((deck) => {
    const dCards = cards.filter((c) => c.deckId === deck.id);
    const dDue = dCards.filter((c) => isCardDue(c, referenceDate)).length;
    const dReviewed = dCards.filter((c) => c.state !== 'new' || Boolean(c.lastReviewedAt)).length;
    const dMastered = dCards.filter((c) => c.state === 'mastered').length;
    return {
      deckId: deck.id,
      title: deck.title,
      language: deck.language,
      totalCards: dCards.length,
      dueCount: dDue,
      reviewedCount: dReviewed,
      masteredCount: dMastered,
      masteryScorePct: computeDeckMasteryScore(dCards),
    };
  });

  const scopeTitle = selectedDeck ? selectedDeck.title : 'All Decks';
  const scopeSubtitle = selectedDeck
    ? `${selectedDeck.language} · ${totalCards} ${totalCards === 1 ? 'card' : 'cards'} · ${dueCount} due`
    : `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'} · ${totalCards} cards · ${dueCount} due`;

  return {
    scopeId: selectedDeck ? selectedDeck.id : 'all',
    scopeTitle,
    scopeSubtitle,
    totalCards,
    reviewedCount,
    dueCount,
    masteredCount,
    masteredPct,
    masteryScorePct,
    avgEase: Math.round(avgEase * 100) / 100,
    avgEaseLabel: avgEase.toFixed(2),
    avgRepetitions,
    avgIntervalDays,
    avgIntervalLabel,
    distribution,
    maxBucketCount,
    forecast,
    maxForecastCount,
    ratingBreakdown,
    deckSummaries,
  };
}

/**
 * Non-destructively merges local and cloud daily review maps by taking the max
 * count per valid YYYY-MM-DD day so neither offline reviews nor cross-device reviews
 * are ever wiped or double-counted.
 */
export function mergeDailyReviewRecords(
  localRecord: Record<string, number> | null | undefined,
  cloudRecord: Record<string, number> | null | undefined
): { dailyReviews: Record<string, number>; totalReviews: number } {
  const merged: Record<string, number> = {};

  const applyRecord = (rec?: Record<string, number> | null) => {
    if (!rec || typeof rec !== 'object') return;
    for (const [dateKey, rawVal] of Object.entries(rec)) {
      if (!DATE_KEY_PATTERN.test(dateKey)) continue;
      const numeric = typeof rawVal === 'number' && Number.isFinite(rawVal) ? Math.max(0, Math.floor(rawVal)) : 0;
      const prev = merged[dateKey] || 0;
      if (numeric > prev) {
        merged[dateKey] = numeric;
      } else if (!(dateKey in merged) && numeric === 0) {
        merged[dateKey] = 0;
      }
    }
  };

  applyRecord(cloudRecord);
  applyRecord(localRecord);

  // Strip zero-only entries older than 30 days to keep Firestore payload lean
  const totalReviews = Object.values(merged).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
  return { dailyReviews: merged, totalReviews };
}

/**
 * Deduplicates and merges local & cloud review events sorted newest-first.
 */
export function mergeReviewEvents(
  localEvents: StoredReviewEvent[],
  cloudEvents: StoredReviewEvent[],
  maxEvents = 500
): StoredReviewEvent[] {
  const byId = new Map<string, StoredReviewEvent>();

  for (const ev of [...cloudEvents, ...localEvents]) {
    if (!ev || typeof ev.id !== 'string' || !ev.id) continue;
    byId.set(ev.id, ev);
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxEvents);
}

/**
 * Computes the true consecutive study streak ending today (or yesterday if user hasn't
 * completed today's first review yet) directly from daily review counts.
 */
export function computeStreakFromDailyReviews(
  dailyReviews: Record<string, number>,
  referenceDate: Date = new Date()
): number {
  const today = new Date(referenceDate);
  today.setHours(12, 0, 0, 0);

  const todayKey = formatLocalDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = formatLocalDateKey(yesterday);

  let cursor: Date;
  if ((dailyReviews[todayKey] || 0) > 0) {
    cursor = new Date(today);
  } else if ((dailyReviews[yesterdayKey] || 0) > 0) {
    cursor = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const key = formatLocalDateKey(cursor);
    if ((dailyReviews[key] || 0) > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Builds rolling 7-day or 14-day consistency statistics from daily review counts
 * and optional per-review rating logs for accuracy overlays.
 */
export function buildConsistencyStats(
  record: Record<string, number>,
  options: {
    targetDaily?: number;
    days?: number;
    reviewEvents?: StoredReviewEvent[];
    referenceDate?: Date;
  } = {}
): ConsistencyStats {
  const targetDaily = Math.max(1, options.targetDaily ?? 15);
  const daysWindow = Math.max(1, options.days ?? 7);
  const reviewEvents = options.reviewEvents ?? [];
  const today = new Date(options.referenceDate ?? new Date());
  today.setHours(12, 0, 0, 0);
  const todayKey = formatLocalDateKey(today);

  // Index review events by YYYY-MM-DD for O(1) per-day accuracy lookup
  const eventsByDate = new Map<string, StoredReviewEvent[]>();
  for (const ev of reviewEvents) {
    if (!ev?.dateStr) continue;
    const list = eventsByDate.get(ev.dateStr);
    if (list) list.push(ev);
    else eventsByDate.set(ev.dateStr, [ev]);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dailyBreakdown: DailyReviewPoint[] = [];
  let totalWeeklyReviews = 0;
  let activeDaysCount = 0;
  let daysAchievedTarget = 0;
  let bestDay = { dayLabel: 'None', reviews: 0 };
  let windowRatedCount = 0;
  let windowRecalledCount = 0;

  for (let i = daysWindow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatLocalDateKey(d);
    const isToday = dateStr === todayKey;

    const dayOfWeek = dayNames[d.getDay()];
    const month = monthNames[d.getMonth()];
    const dateNum = d.getDate();

    const dayEvents = eventsByDate.get(dateStr) ?? [];
    const reviews = Math.max(record[dateStr] || 0, dayEvents.length);
    const achievedTarget = reviews >= targetDaily;

    let againCount = 0;
    let recalledCount = 0;
    for (const ev of dayEvents) {
      if (ev.rating === 'again') againCount++;
      else recalledCount++;
    }
    const accuracyPct =
      dayEvents.length > 0 ? Math.round((recalledCount / dayEvents.length) * 100) : null;

    windowRatedCount += dayEvents.length;
    windowRecalledCount += recalledCount;

    if (reviews > 0) activeDaysCount++;
    if (achievedTarget) daysAchievedTarget++;
    totalWeeklyReviews += reviews;

    if (reviews > bestDay.reviews) {
      bestDay = { dayLabel: `${dayOfWeek}, ${month} ${dateNum}`, reviews };
    }

    dailyBreakdown.push({
      dateStr,
      dayLabel: daysWindow <= 7 ? dayOfWeek : `${month} ${dateNum}`,
      shortDateLabel: `${month} ${dateNum}`,
      fullDayLabel: `${dayOfWeek}, ${month} ${dateNum}`,
      reviews,
      target: targetDaily,
      isToday,
      achievedTarget,
      accuracyPct,
      againCount,
      recalledCount,
    });
  }

  const dailyAverage = Math.round((totalWeeklyReviews / daysWindow) * 10) / 10;
  const consistencyRate = Math.min(100, Math.round((activeDaysCount / daysWindow) * 100));
  const currentStreak = computeStreakFromDailyReviews(record, today);
  const windowAccuracyPct =
    windowRatedCount > 0 ? Math.round((windowRecalledCount / windowRatedCount) * 100) : null;

  return {
    daysWindow,
    totalWeeklyReviews,
    dailyAverage,
    activeDaysCount,
    daysAchievedTarget,
    consistencyRate,
    currentStreak,
    bestDay,
    windowAccuracyPct,
    windowRatedCount,
    dailyBreakdown,
  };
}
