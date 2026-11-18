import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSM2, scheduleAlreadyKnew, isCardDue } from './srs';
import type { Flashcard } from './types';

function makeCard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 'card-1',
    deckId: 'deck-spanish-core',
    english: 'Hello',
    targetWord: 'Hola',
    language: 'Spanish',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('calculateSM2 hard schedules card for 1 day', () => {
  const ref = new Date('2026-05-01T10:00:00.000Z');
  const card = makeCard({ repetitions: 3, intervalDays: 10 });
  const res = calculateSM2(card, 'hard', ref);

  assert.equal(res.intervalDays, 1);
  assert.equal(res.state, 'review');
  assert.equal(res.dueDate, '2026-05-02T10:00:00.000Z');
});

test('scheduleAlreadyKnew schedules card exactly 7 days in the future', () => {
  const ref = new Date('2026-05-01T10:00:00.000Z');
  const card = makeCard({ state: 'new', repetitions: 0, intervalDays: 0 });
  const updated = scheduleAlreadyKnew(card, ref);

  assert.equal(updated.intervalDays, 7);
  assert.equal(updated.dueDate, '2026-05-08T10:00:00.000Z');
  assert.equal(updated.repetitions, 2);
  assert.equal(updated.state, 'review');
  assert.equal(updated.lastReviewedAt, ref.toISOString());
  assert.equal(updated.updatedAt, ref.toISOString());
  assert.equal(isCardDue(updated, new Date('2026-05-07T23:59:00.000Z')), false);
  assert.equal(isCardDue(updated, new Date('2026-05-08T10:00:00.000Z')), true);
});

test('scheduleAlreadyKnew promotes cards with existing repetitions to mastered', () => {
  const ref = new Date('2026-05-01T10:00:00.000Z');
  const card = makeCard({ state: 'review', repetitions: 2, intervalDays: 3 });
  const updated = scheduleAlreadyKnew(card, ref);

  assert.equal(updated.intervalDays, 7);
  assert.equal(updated.repetitions, 3);
  assert.equal(updated.state, 'mastered');
});
