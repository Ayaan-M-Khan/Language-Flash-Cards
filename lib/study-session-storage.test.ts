import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileSavedSessionWithCards,
  PersistedStudySession,
} from './study-session-storage';
import type { Flashcard } from './types';

function makeCard(id: string, overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    deckId: 'deck-1',
    english: `English ${id}`,
    targetWord: `Target ${id}`,
    language: 'Spanish',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('reconcileSavedSessionWithCards restores exact remaining queue order and completed progress after reload', () => {
  const c1 = makeCard('c1', { intervalDays: 7, state: 'review' });
  const c2 = makeCard('c2', { english: 'Updated English 2' });
  const c3 = makeCard('c3');
  const now = Date.now();

  const saved: PersistedStudySession = {
    persistKey: 'guest::all::due',
    remainingCardIds: ['c3', 'c2'], // e.g., c1 was completed, c2 was skipped after c3
    totalSessionCards: 3,
    stats: {
      cardsReviewed: 1,
      againCount: 0,
      hardCount: 0,
      goodCount: 1,
      easyCount: 0,
      alreadyKnewCount: 0,
      startTime: now - 10000,
    },
    updatedAt: now - 1000,
  };

  const restored = reconcileSavedSessionWithCards(saved, [c1, c2, c3], now);
  assert.ok(restored);
  assert.deepEqual(
    restored.queueCards.map((c) => c.id),
    ['c3', 'c2']
  );
  assert.equal(restored.queueCards[1].english, 'Updated English 2');
  assert.equal(restored.totalSessionCards, 3);
  assert.equal(restored.stats.cardsReviewed, 1);
  assert.equal(restored.stats.goodCount, 1);
});

test('reconcileSavedSessionWithCards drops deleted cards cleanly and returns null when empty or expired', () => {
  const c2 = makeCard('c2');
  const now = Date.now();

  const savedWithDeleted: PersistedStudySession = {
    persistKey: 'u1::deck-1::due',
    remainingCardIds: ['deleted-card', 'c2'],
    totalSessionCards: 3,
    stats: {
      cardsReviewed: 1,
      againCount: 0,
      hardCount: 0,
      goodCount: 1,
      easyCount: 0,
      alreadyKnewCount: 0,
      startTime: now - 5000,
    },
    updatedAt: now - 500,
  };

  const restored = reconcileSavedSessionWithCards(savedWithDeleted, [c2], now);
  assert.ok(restored);
  assert.deepEqual(
    restored.queueCards.map((c) => c.id),
    ['c2']
  );

  const expired: PersistedStudySession = {
    ...savedWithDeleted,
    updatedAt: now - 25 * 60 * 60 * 1000,
  };
  assert.equal(reconcileSavedSessionWithCards(expired, [c2], now), null);
});
