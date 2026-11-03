import { Flashcard, SM2Rating, CardState } from './types';

export interface SM2Result {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  state: CardState;
  dueDate: string;
  nextIntervalFormatted: string;
}

/**
 * Calculates next review parameters according to the SuperMemo SM-2 spaced repetition algorithm.
 */
export function calculateSM2(card: Flashcard, rating: SM2Rating, referenceDate: Date = new Date()): SM2Result {
  let { repetitions, intervalDays, easeFactor } = card;
  easeFactor = easeFactor || 2.5;
  repetitions = repetitions || 0;
  intervalDays = intervalDays || 0;

  let nextRepetitions = repetitions;
  let nextIntervalDays = 1;
  let nextEaseFactor = easeFactor;
  let nextState: CardState = 'review';

  switch (rating) {
    case 'again': {
      // Failed card: reset streak and return to learning queue
      nextRepetitions = 0;
      nextIntervalDays = 0.007; // ~10 minutes (due today during current session)
      nextEaseFactor = Math.max(1.3, easeFactor - 0.2);
      nextState = 'learning';
      break;
    }
    case 'hard': {
      // Hard recall: minor progression, slight ease penalty
      nextRepetitions = repetitions + 1;
      if (repetitions === 0) {
        nextIntervalDays = 1;
      } else {
        nextIntervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      }
      nextEaseFactor = Math.max(1.3, easeFactor - 0.15);
      nextState = 'review';
      break;
    }
    case 'good': {
      // Standard optimal recall
      nextRepetitions = repetitions + 1;
      if (repetitions === 0) {
        nextIntervalDays = 1;
      } else if (repetitions === 1) {
        nextIntervalDays = 3;
      } else {
        nextIntervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
      }
      nextEaseFactor = easeFactor; // unchanged
      nextState = nextRepetitions >= 5 ? 'mastered' : 'review';
      break;
    }
    case 'easy': {
      // Instant effortless recall: boost interval and ease factor
      nextRepetitions = repetitions + 1;
      if (repetitions === 0) {
        nextIntervalDays = 4;
      } else if (repetitions === 1) {
        nextIntervalDays = 7;
      } else {
        nextIntervalDays = Math.max(1, Math.round(intervalDays * easeFactor * 1.3));
      }
      nextEaseFactor = Math.min(3.2, easeFactor + 0.15);
      nextState = nextRepetitions >= 3 ? 'mastered' : 'review';
      break;
    }
  }

  // Calculate new due date based on interval
  const nextDueDate = new Date(referenceDate);
  if (nextIntervalDays < 1) {
    // Minutes interval (10 mins)
    nextDueDate.setMinutes(nextDueDate.getMinutes() + Math.round(nextIntervalDays * 24 * 60));
  } else {
    nextDueDate.setDate(nextDueDate.getDate() + nextIntervalDays);
  }

  return {
    repetitions: nextRepetitions,
    intervalDays: nextIntervalDays,
    easeFactor: Math.round(nextEaseFactor * 100) / 100,
    state: nextState,
    dueDate: nextDueDate.toISOString(),
    nextIntervalFormatted: formatInterval(nextIntervalDays),
  };
}

/**
 * Returns a human-friendly string for the spaced repetition interval (e.g. "10 min", "1 day", "4 days", "2 mo").
 */
export function formatInterval(intervalDays: number): string {
  if (intervalDays < 1) {
    const mins = Math.max(5, Math.round(intervalDays * 24 * 60));
    return `${mins}m`;
  }
  if (intervalDays === 1) return '1 day';
  if (intervalDays < 30) return `${Math.round(intervalDays)} days`;
  if (intervalDays < 365) {
    const months = Math.round(intervalDays / 30);
    return `${months} mo`;
  }
  const years = (intervalDays / 365).toFixed(1);
  return `${years} yr`;
}

/**
 * Returns what the next interval would be for each rating button on a given card.
 */
export function getPreviewIntervals(card: Flashcard): Record<SM2Rating, string> {
  const ratings: SM2Rating[] = ['again', 'hard', 'good', 'easy'];
  const result: Partial<Record<SM2Rating, string>> = {};
  for (const rating of ratings) {
    const res = calculateSM2(card, rating);
    result[rating] = res.nextIntervalFormatted;
  }
  return result as Record<SM2Rating, string>;
}

/**
 * Checks if a card is currently due for study.
 */
export function isCardDue(card: Flashcard, referenceDate: Date = new Date()): boolean {
  if (card.state === 'new') return true;
  const dueDate = new Date(card.dueDate);
  return dueDate.getTime() <= referenceDate.getTime();
}

/**
 * Extracts a numeric sequence index from a card (explicit orderIndex or trailing numeric ID suffix)
 * so cards always sort 1-by-1 in creation/import order rather than lexicographical string order.
 */
export function getCardSequenceNumber(card: Flashcard): number {
  if (typeof card.orderIndex === 'number' && Number.isFinite(card.orderIndex)) {
    return card.orderIndex;
  }
  const match = card.id.match(/-(\d+)$/);
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Deterministically sorts flashcards in strict 1-by-1 sequential order per deck.
 */
export function sortCardsSequentially(
  cards: Flashcard[],
  decks?: { id: string }[]
): Flashcard[] {
  const deckOrderMap = new Map<string, number>();
  if (decks) {
    decks.forEach((d, idx) => deckOrderMap.set(d.id, idx));
  }

  return [...cards].sort((a, b) => {
    if (a.deckId !== b.deckId) {
      const deckIdxA = deckOrderMap.get(a.deckId) ?? Number.MAX_SAFE_INTEGER;
      const deckIdxB = deckOrderMap.get(b.deckId) ?? Number.MAX_SAFE_INTEGER;
      if (deckIdxA !== deckIdxB) return deckIdxA - deckIdxB;
      return a.deckId.localeCompare(b.deckId);
    }

    const seqA = getCardSequenceNumber(a);
    const seqB = getCardSequenceNumber(b);
    if (seqA !== seqB) {
      return seqA - seqB;
    }

    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

/**
 * Helper to generate optimal initial spaced schedules for imported cards.
 * Avoids dumping all cards onto the exact same minute by applying gentle spacing.
 */
export function initializeCardSchedule(
  baseCard: Omit<Flashcard, 'id' | 'state' | 'repetitions' | 'intervalDays' | 'easeFactor' | 'dueDate'>,
  id: string,
  staggerIndex: number = 0
): Flashcard {
  const now = new Date();
  // New cards are available immediately, with slight micro-offset for sorting
  const initialDate = new Date(now.getTime() + staggerIndex * 30 * 1000);

  return {
    ...baseCard,
    id,
    orderIndex: baseCard.orderIndex ?? staggerIndex,
    createdAt: baseCard.createdAt || now.toISOString(),
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: initialDate.toISOString(),
  };
}
