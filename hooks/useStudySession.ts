'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Flashcard, SM2Rating, StudySessionStats } from '@/lib/types';
import { calculateSM2 } from '@/lib/srs';

export interface UseStudySessionOptions {
  sessionKey?: string;
  onSessionComplete?: (stats?: StudySessionStats) => void;
  onCardReviewed?: (updatedCard: Flashcard, rating: SM2Rating) => void;
}

export interface StudyQueueItem {
  card: Flashcard;
  stepId: number;
}

function createInitialStats(): StudySessionStats {
  return {
    cardsReviewed: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
    startTime: Date.now(),
  };
}

export function useStudySession(
  initialCards: Flashcard[],
  optionsOrComplete?: UseStudySessionOptions | (() => void)
) {
  const normalizedOptions: UseStudySessionOptions =
    typeof optionsOrComplete === 'function'
      ? { onSessionComplete: () => optionsOrComplete() }
      : optionsOrComplete || {};

  // Monotonically increasing step counter guarantees every card presentation—even a re-queued card—has a unique stepId
  const stepCounterRef = useRef<number>(initialCards.length);

  const [queueItems, setQueueItems] = useState<StudyQueueItem[]>(() =>
    initialCards.map((card, idx) => ({ card, stepId: idx + 1 }))
  );
  const [totalSessionCards, setTotalSessionCards] = useState<number>(() => initialCards.length);
  const [isProcessing, setIsProcessing] = useState(false);

  // Flip state is bound strictly to a specific stepId so a newly swapped card can NEVER inherit `isFlipped = true`
  const [flippedStepId, setFlippedStepId] = useState<number | null>(null);
  const [stats, setStats] = useState<StudySessionStats>(createInitialStats);

  // Synchronous refs eliminate stale closures and prevent same-tick or rapid double advances
  const queueItemsRef = useRef<StudyQueueItem[]>(queueItems);
  const totalCardsRef = useRef<number>(initialCards.length);
  const processingLockRef = useRef<boolean>(false);
  const flippedStepIdRef = useRef<number | null>(null);
  const flipGuardUntilRef = useRef<number>(0);
  const statsRef = useRef<StudySessionStats>(stats);
  const optionsRef = useRef<UseStudySessionOptions>(normalizedOptions);
  const initialCardsRef = useRef<Flashcard[]>(initialCards);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    optionsRef.current = normalizedOptions;
  }, [normalizedOptions]);

  useEffect(() => {
    initialCardsRef.current = initialCards;
  }, [initialCards]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  const allocateQueueItems = useCallback((cards: Flashcard[]): StudyQueueItem[] => {
    return cards.map((card) => {
      stepCounterRef.current += 1;
      return {
        card,
        stepId: stepCounterRef.current,
      };
    });
  }, []);

  const armCooldown = useCallback((durationMs: number) => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      processingLockRef.current = false;
      setIsProcessing(false);
      cooldownTimerRef.current = null;
    }, durationMs);
  }, []);

  // Deterministically reset session queue when deck, mode, or account hydration changes
  const restartSession = useCallback(
    (newCards?: Flashcard[]) => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const cardsToUse = [...(newCards ?? initialCardsRef.current)];
      const freshItems = allocateQueueItems(cardsToUse);
      const freshStats = createInitialStats();

      processingLockRef.current = false;
      flippedStepIdRef.current = null;
      flipGuardUntilRef.current = 0;
      queueItemsRef.current = freshItems;
      totalCardsRef.current = freshItems.length;
      statsRef.current = freshStats;

      setFlippedStepId(null);
      setTotalSessionCards(freshItems.length);
      setQueueItems(freshItems);
      setIsProcessing(false);
      setStats(freshStats);
    },
    [allocateQueueItems]
  );

  // Sync queue cleanly in an effect whenever the caller's sessionKey changes (never mutating refs during render)
  const prevSessionKeyRef = useRef<string | undefined>(normalizedOptions.sessionKey);
  useEffect(() => {
    if (
      normalizedOptions.sessionKey !== undefined &&
      normalizedOptions.sessionKey !== prevSessionKeyRef.current
    ) {
      prevSessionKeyRef.current = normalizedOptions.sessionKey;
      restartSession(initialCards);
    } else if (totalCardsRef.current === 0 && initialCards.length > 0) {
      restartSession(initialCards);
    }
  }, [normalizedOptions.sessionKey, initialCards, restartSession]);

  const setIsFlipped = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const activeItem = queueItemsRef.current[0];
    if (!activeItem) {
      flippedStepIdRef.current = null;
      setFlippedStepId(null);
      return;
    }
    const currentlyFlipped = flippedStepIdRef.current === activeItem.stepId;
    const next = typeof value === 'function' ? value(currentlyFlipped) : value;
    const nextStepId = next ? activeItem.stepId : null;
    if (next && !currentlyFlipped) {
      flipGuardUntilRef.current = Date.now() + 200;
    }
    flippedStepIdRef.current = nextStepId;
    setFlippedStepId(nextStepId);
  }, []);

  const flipCard = useCallback(() => {
    if (processingLockRef.current) return;
    const activeItem = queueItemsRef.current[0];
    if (!activeItem) return;

    const currentlyFlipped = flippedStepIdRef.current === activeItem.stepId;
    const nextStepId = currentlyFlipped ? null : activeItem.stepId;

    if (!currentlyFlipped) {
      // Brief guard prevents an accidental double-tap or bounced Spacebar from rating on the same gesture
      flipGuardUntilRef.current = Date.now() + 200;
    }

    flippedStepIdRef.current = nextStepId;
    setFlippedStepId(nextStepId);
  }, []);

  const rateCard = useCallback(
    async (rating: SM2Rating, expectedCardId?: string, expectedStepId?: number) => {
      if (processingLockRef.current) return;
      if (Date.now() < flipGuardUntilRef.current) return;

      const currentItems = queueItemsRef.current;
      const activeItem = currentItems[0];
      if (!activeItem) return;

      // Strict guards: must match active card ID, active stepId, AND the active card MUST have been flipped first
      if (expectedCardId && activeItem.card.id !== expectedCardId) return;
      if (expectedStepId !== undefined && activeItem.stepId !== expectedStepId) return;
      if (flippedStepIdRef.current !== activeItem.stepId) return;

      processingLockRef.current = true;
      setIsProcessing(true);

      const sm2 = calculateSM2(activeItem.card, rating);
      const updatedCard: Flashcard = {
        ...activeItem.card,
        repetitions: sm2.repetitions,
        intervalDays: sm2.intervalDays,
        easeFactor: sm2.easeFactor,
        state: sm2.state,
        dueDate: sm2.dueDate,
        lastReviewedAt: new Date().toISOString(),
      };

      // Advance strictly 1 card: pop ONLY currentItems[0], making currentItems[1] the next card
      const [, ...remaining] = currentItems;
      let nextItems: StudyQueueItem[];
      // Only re-queue failed cards ('again') within the current study session (3 cards later).
      // 'hard' schedules the card for review after 1 day (tomorrow) and concludes it for the current session.
      if (rating === 'again') {
        stepCounterRef.current += 1;
        const requeuedItem: StudyQueueItem = {
          card: updatedCard,
          stepId: stepCounterRef.current,
        };
        const insertIndex = Math.min(3, remaining.length);
        nextItems = [...remaining];
        nextItems.splice(insertIndex, 0, requeuedItem);
      } else {
        nextItems = remaining;
      }

      const nextStats: StudySessionStats = {
        ...statsRef.current,
        cardsReviewed: statsRef.current.cardsReviewed + 1,
        againCount: statsRef.current.againCount + (rating === 'again' ? 1 : 0),
        hardCount: statsRef.current.hardCount + (rating === 'hard' ? 1 : 0),
        goodCount: statsRef.current.goodCount + (rating === 'good' ? 1 : 0),
        easyCount: statsRef.current.easyCount + (rating === 'easy' ? 1 : 0),
      };

      // Reset flip state BEFORE or WITH queue update; even without this, nextItems[0].stepId !== flippedStepId
      queueItemsRef.current = nextItems;
      flippedStepIdRef.current = null;
      statsRef.current = nextStats;

      setFlippedStepId(null);
      setQueueItems(nextItems);
      setStats(nextStats);

      // Notify parent for local & Firestore persistence
      optionsRef.current?.onCardReviewed?.(updatedCard, rating);

      if (
        nextItems.length === 0 &&
        totalCardsRef.current > 0 &&
        optionsRef.current?.onSessionComplete
      ) {
        const completedStats: StudySessionStats = {
          ...nextStats,
          endTime: Date.now(),
        };
        setTimeout(() => {
          optionsRef.current?.onSessionComplete?.(completedStats);
        }, 150);
      }

      armCooldown(220);
    },
    [armCooldown]
  );

  // Moves ONLY queueItems[0] to the end with a fresh stepId so queueItems[1] is shown next (strictly 1-by-1)
  const skipCard = useCallback(
    (expectedCardId?: string, expectedStepId?: number) => {
      if (processingLockRef.current || queueItemsRef.current.length <= 1) return;

      const currentItems = queueItemsRef.current;
      const head = currentItems[0];
      if (!head) return;
      if (expectedCardId && head.card.id !== expectedCardId) return;
      if (expectedStepId !== undefined && head.stepId !== expectedStepId) return;

      processingLockRef.current = true;
      setIsProcessing(true);

      stepCounterRef.current += 1;
      const [, ...rest] = currentItems;
      const nextItems: StudyQueueItem[] = [
        ...rest,
        { card: head.card, stepId: stepCounterRef.current },
      ];

      queueItemsRef.current = nextItems;
      flippedStepIdRef.current = null;

      setFlippedStepId(null);
      setQueueItems(nextItems);

      armCooldown(200);
    },
    [armCooldown]
  );

  // Randomizes the remaining in-memory session queue (Fisher-Yates) without altering SRS schedules
  const shuffleQueue = useCallback(() => {
    if (processingLockRef.current || queueItemsRef.current.length <= 1) return;

    const currentItems = queueItemsRef.current;
    const previousHeadCardId = currentItems[0]?.card.id;

    processingLockRef.current = true;
    setIsProcessing(true);

    const shuffledCards = currentItems.map((item) => item.card);
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }

    // Ensure the top card visibly changes when at least 2 distinct cards remain
    if (shuffledCards.length >= 2 && shuffledCards[0].id === previousHeadCardId) {
      const swapIndex = shuffledCards.findIndex((c) => c.id !== previousHeadCardId);
      if (swapIndex > 0) {
        [shuffledCards[0], shuffledCards[swapIndex]] = [
          shuffledCards[swapIndex],
          shuffledCards[0],
        ];
      }
    }

    // Assign fresh stepIds so the new head mounts cleanly unflipped on its front face
    const nextItems = allocateQueueItems(shuffledCards);

    queueItemsRef.current = nextItems;
    flippedStepIdRef.current = null;

    setFlippedStepId(null);
    setQueueItems(nextItems);

    armCooldown(200);
  }, [allocateQueueItems, armCooldown]);

  const activeItem = queueItems[0] || null;
  const currentCard = activeItem?.card || null;
  const currentStepId = activeItem?.stepId ?? 0;
  const isFlipped = Boolean(activeItem && flippedStepId === activeItem.stepId);
  const queue = queueItems.map((item) => item.card);
  const isComplete = queueItems.length === 0 && totalSessionCards > 0;
  const cardsRemaining = queueItems.length;
  const completedCount = Math.max(0, totalSessionCards - cardsRemaining);
  const progressPercent =
    totalSessionCards > 0
      ? Math.min(100, Math.round((completedCount / totalSessionCards) * 100))
      : 0;

  return {
    currentCard,
    currentStepId,
    queue,
    cardsRemaining,
    totalSessionCards,
    completedCount,
    progressPercent,
    isFlipped,
    setIsFlipped,
    flipCard,
    rateCard,
    skipCard,
    shuffleQueue,
    isProcessing,
    isComplete,
    stats,
    restartSession,
  };
}
