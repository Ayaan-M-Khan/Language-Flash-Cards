import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCardMasteryWeight,
  computeDeckMasteryScore,
  computeMasteryAnalytics,
  mergeDailyReviewRecords,
  mergeReviewEvents,
  computeStreakFromDailyReviews,
  buildConsistencyStats,
  formatLocalDateKey,
  StoredReviewEvent,
} from './mastery-analytics';
import { Deck, Flashcard } from './types';

function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: overrides.id ?? 'card-1',
    deckId: overrides.deckId ?? 'deck-1',
    english: overrides.english ?? 'Hello',
    targetWord: overrides.targetWord ?? 'Hola',
    language: overrides.language ?? 'Spanish',
    state: overrides.state ?? 'new',
    repetitions: overrides.repetitions ?? 0,
    intervalDays: overrides.intervalDays ?? 0,
    easeFactor: overrides.easeFactor ?? 2.5,
    dueDate: overrides.dueDate ?? '2026-11-18T12:00:00.000Z',
    lastReviewedAt: overrides.lastReviewedAt,
  };
}

const sampleDecks: Deck[] = [
  {
    id: 'deck-1',
    title: 'Spanish Core',
    language: 'Spanish',
    languageCode: 'es-ES',
    color: 'blue',
    description: '',
    icon: 'Sparkles',
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'deck-2',
    title: 'French Cafe',
    language: 'French',
    languageCode: 'fr-FR',
    color: 'purple',
    description: '',
    icon: 'Sparkles',
    createdAt: '2026-11-02T00:00:00.000Z',
  },
];

test('calculateCardMasteryWeight progresses monotonically from new to mastered', () => {
  const newCard = makeCard({ state: 'new', repetitions: 0, intervalDays: 0 });
  const learningCard = makeCard({ state: 'learning', repetitions: 0, intervalDays: 0.007 });
  const earlyReview = makeCard({ state: 'review', repetitions: 1, intervalDays: 1 });
  const deeperReview = makeCard({ state: 'review', repetitions: 3, intervalDays: 10 });
  const masteredCard = makeCard({ state: 'mastered', repetitions: 5, intervalDays: 25 });

  assert.equal(calculateCardMasteryWeight(newCard), 0);
  assert.equal(calculateCardMasteryWeight(learningCard), 25);
  assert.ok(calculateCardMasteryWeight(earlyReview) > 25);
  assert.ok(calculateCardMasteryWeight(deeperReview) > calculateCardMasteryWeight(earlyReview));
  assert.ok(calculateCardMasteryWeight(deeperReview) < 100);
  assert.equal(calculateCardMasteryWeight(masteredCard), 100);
});

test('computeMasteryAnalytics supports All Decks and single deck scoping with forecast and rating accuracy', () => {
  const refDate = new Date('2026-11-18T12:00:00.000Z');
  const cards: Flashcard[] = [
    makeCard({ id: 'c1', deckId: 'deck-1', state: 'new', dueDate: '2026-11-18T10:00:00.000Z' }),
    makeCard({
      id: 'c2',
      deckId: 'deck-1',
      state: 'review',
      repetitions: 2,
      intervalDays: 3,
      easeFactor: 2.5,
      dueDate: '2026-11-21T12:00:00.000Z',
      lastReviewedAt: '2026-11-18T11:00:00.000Z',
    }),
    makeCard({
      id: 'c3',
      deckId: 'deck-2',
      state: 'mastered',
      repetitions: 5,
      intervalDays: 35,
      easeFactor: 2.7,
      dueDate: '2026-12-23T12:00:00.000Z',
      lastReviewedAt: '2026-11-18T11:05:00.000Z',
    }),
  ];

  const events: StoredReviewEvent[] = [
    {
      id: 'e1',
      deckId: 'deck-1',
      cardId: 'c2',
      rating: 'good',
      intervalDays: 3,
      dateStr: '2026-11-18',
      timestamp: '2026-11-18T11:00:00.000Z',
    },
    {
      id: 'e2',
      deckId: 'deck-1',
      cardId: 'c2',
      rating: 'again',
      intervalDays: 0.007,
      dateStr: '2026-11-18',
      timestamp: '2026-11-18T10:55:00.000Z',
    },
    {
      id: 'e3',
      deckId: 'deck-2',
      cardId: 'c3',
      rating: 'easy',
      intervalDays: 35,
      dateStr: '2026-11-18',
      timestamp: '2026-11-18T11:05:00.000Z',
    },
  ];

  const allStats = computeMasteryAnalytics(cards, sampleDecks, 'all', events, refDate);
  assert.equal(allStats.scopeId, 'all');
  assert.equal(allStats.totalCards, 3);
  assert.equal(allStats.dueCount, 1);
  assert.equal(allStats.masteredCount, 1);
  assert.equal(allStats.masteredPct, 33);
  assert.ok(allStats.masteryScorePct > 50, 'weighted mastery score reflects review + mastered progress');
  assert.equal(allStats.ratingBreakdown.total, 3);
  assert.equal(allStats.ratingBreakdown.retentionRatePct, 67);
  assert.equal(allStats.forecast.find((b) => b.id === 'due')?.count, 1);
  assert.equal(allStats.forecast.find((b) => b.id === 'week')?.count, 1);
  assert.equal(allStats.forecast.find((b) => b.id === 'later')?.count, 1);
  assert.equal(allStats.deckSummaries.length, 2);

  const deck1Stats = computeMasteryAnalytics(cards, sampleDecks, 'deck-1', events, refDate);
  assert.equal(deck1Stats.totalCards, 2);
  assert.equal(deck1Stats.ratingBreakdown.total, 2);
  assert.equal(deck1Stats.ratingBreakdown.retentionRatePct, 50);
  assert.equal(deck1Stats.masteryScorePct, computeDeckMasteryScore(cards.slice(0, 2)));
});

test('mergeDailyReviewRecords merges non-destructively using max per day and filters invalid keys', () => {
  const local = { '2026-11-17': 4, '2026-11-18': 6, bad_key: 99 };
  const cloud = { '2026-11-16': 10, '2026-11-17': 9, '2026-11-18': 2 };

  const merged = mergeDailyReviewRecords(local, cloud);
  assert.deepEqual(merged.dailyReviews, {
    '2026-11-16': 10,
    '2026-11-17': 9,
    '2026-11-18': 6,
  });
  assert.equal(merged.totalReviews, 25);
});

test('mergeReviewEvents deduplicates by id and sorts newest-first', () => {
  const ev1: StoredReviewEvent = {
    id: 'rev-1',
    deckId: 'd1',
    cardId: 'c1',
    rating: 'good',
    intervalDays: 1,
    dateStr: '2026-11-18',
    timestamp: '2026-11-18T10:00:00.000Z',
  };
  const ev2: StoredReviewEvent = {
    id: 'rev-2',
    deckId: 'd1',
    cardId: 'c2',
    rating: 'easy',
    intervalDays: 4,
    dateStr: '2026-11-18',
    timestamp: '2026-11-18T11:00:00.000Z',
  };

  const merged = mergeReviewEvents([ev1, ev2], [ev1]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'rev-2');
  assert.equal(merged[1].id, 'rev-1');
});

test('computeStreakFromDailyReviews accurately counts consecutive days and handles gaps', () => {
  const ref = new Date(2026, 10, 18, 12, 0, 0); // Nov 18, 2026 local
  const d18 = formatLocalDateKey(new Date(2026, 10, 18));
  const d17 = formatLocalDateKey(new Date(2026, 10, 17));
  const d16 = formatLocalDateKey(new Date(2026, 10, 16));
  const d14 = formatLocalDateKey(new Date(2026, 10, 14));

  assert.equal(computeStreakFromDailyReviews({}, ref), 0);
  assert.equal(computeStreakFromDailyReviews({ [d18]: 1 }, ref), 1);
  assert.equal(computeStreakFromDailyReviews({ [d18]: 3, [d17]: 2, [d16]: 5, [d14]: 9 }, ref), 3);
  // Active streak from yesterday remains alive before today's first review
  assert.equal(computeStreakFromDailyReviews({ [d17]: 4, [d16]: 2 }, ref), 2);
  // Gap of 2 days breaks streak
  assert.equal(computeStreakFromDailyReviews({ [d16]: 4 }, ref), 0);
});

test('buildConsistencyStats computes 7d and 14d windows with per-day accuracy overlays', () => {
  const ref = new Date(2026, 10, 18, 12, 0, 0);
  const d18 = formatLocalDateKey(new Date(2026, 10, 18));
  const d17 = formatLocalDateKey(new Date(2026, 10, 17));

  const events: StoredReviewEvent[] = [
    {
      id: 'r1',
      deckId: 'd1',
      cardId: 'c1',
      rating: 'good',
      intervalDays: 1,
      dateStr: d18,
      timestamp: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'r2',
      deckId: 'd1',
      cardId: 'c2',
      rating: 'again',
      intervalDays: 0.007,
      dateStr: d18,
      timestamp: '2026-11-18T10:05:00.000Z',
    },
    {
      id: 'r3',
      deckId: 'd1',
      cardId: 'c3',
      rating: 'easy',
      intervalDays: 4,
      dateStr: d18,
      timestamp: '2026-11-18T10:10:00.000Z',
    },
  ];

  const stats7 = buildConsistencyStats(
    { [d18]: 15, [d17]: 5 },
    { targetDaily: 15, days: 7, reviewEvents: events, referenceDate: ref }
  );
  assert.equal(stats7.dailyBreakdown.length, 7);
  assert.equal(stats7.totalWeeklyReviews, 20);
  assert.equal(stats7.daysAchievedTarget, 1);
  assert.equal(stats7.activeDaysCount, 2);
  assert.equal(stats7.currentStreak, 2);
  assert.equal(stats7.windowAccuracyPct, 67);
  assert.equal(stats7.dailyBreakdown[6].accuracyPct, 67);

  const stats14 = buildConsistencyStats(
    { [d18]: 15, [d17]: 5 },
    { targetDaily: 15, days: 14, reviewEvents: events, referenceDate: ref }
  );
  assert.equal(stats14.dailyBreakdown.length, 14);
  assert.equal(stats14.totalWeeklyReviews, 20);
});
