'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Flashcard, SM2Rating, StudySessionStats } from '@/lib/types';
import { calculateSM2, scheduleAlreadyKnew } from '@/lib/srs';
import {
  clearPersistedStudySession,
  loadPersistedStudySession,
  reconcileSavedSessionWithCards,
  savePersistedStudySession,
} from '@/lib/study-session-storage';

export interface UseStudySessionOptions {
  sessionKey?: string;
  persistKey?: string;
  isHydrated?: boolean;
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
    alreadyKnewCount: 0,
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

  const isHydrated = normalizedOptions.isHydrated ?? true;
  const persistKey = normalizedOptions.persistKey;

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

  const persistSnapshot = useCallback(
    (items: StudyQueueItem[], total: number, nextStats: StudySessionStats) => {
      const activePersistKey = optionsRef.current.persistKey;
      const activeHydrated = optionsRef.current.isHydrated ?? true;
      if (!activePersistKey || !activeHydrated) return;

      if (items.length === 0) {
        clearPersistedStudySession(activePersistKey);
        return;
      }

      savePersistedStudySession({
        persistKey: activePersistKey,
        remainingCardIds: items.map((i) => i.card.id),
        totalSessionCards: total,
        stats: nextStats,
        updatedAt: Date.now(),
      });
    },
    []
  );

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

  // Deterministically reset session queue when explicitly restarted or starting a fresh scope
  const restartSession = useCallback(
    (newCards?: Flashcard[], options?: { skipRestore?: boolean }) => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const candidateCards = [...(newCards ?? initialCardsRef.current)];
      const activePersistKey = optionsRef.current.persistKey;
      const activeHydrated = optionsRef.current.isHydrated ?? true;

      let cardsToUse = candidateCards;
      let nextTotal = candidateCards.length;
      let nextStats = createInitialStats();

      if (options?.skipRestore) {
        clearPersistedStudySession(activePersistKey);
      } else if (activePersistKey && activeHydrated) {
        const saved = loadPersistedStudySession(activePersistKey);
        const restored = reconcileSavedSessionWithCards(saved, candidateCards);
        if (restored) {
          cardsToUse = restored.queueCards;
          nextTotal = restored.totalSessionCards;
          nextStats = restored.stats;
        }
      }

      const freshItems = allocateQueueItems(cardsToUse);

      processingLockRef.current = false;
      flippedStepIdRef.current = null;
      flipGuardUntilRef.current = 0;
      queueItemsRef.current = freshItems;
      totalCardsRef.current = nextTotal;
      statsRef.current = nextStats;

      setFlippedStepId(null);
      setTotalSessionCards(nextTotal);
      setQueueItems(freshItems);
      setIsProcessing(false);
      setStats(nextStats);
    },
    [allocateQueueItems]
  );

  // Restore saved session or sync updates smoothly across hydration, reloads, and deck switches
  const prevSessionKeyRef = useRef<string | undefined>(normalizedOptions.sessionKey);
  const prevHydratedRef = useRef<boolean>(isHydrated);
  const prevPersistKeyRef = useRef<string | undefined>(persistKey);

  useEffect(() => {
    const hydratedJustFinished = !prevHydratedRef.current && isHydrated;
    const persistKeyChanged = persistKey !== prevPersistKeyRef.current;
    const sessionKeyChanged =
      normalizedOptions.sessionKey !== undefined &&
      normalizedOptions.sessionKey !== prevSessionKeyRef.current;

    if (hydratedJustFinished || persistKeyChanged || sessionKeyChanged) {
      prevHydratedRef.current = isHydrated;
      prevPersistKeyRef.current = persistKey;
      prevSessionKeyRef.current = normalizedOptions.sessionKey;
      restartSession(initialCards);
      return;
    }

    if (totalCardsRef.current === 0 && initialCards.length > 0) {
      restartSession(initialCards);
      return;
    }

    // Keep existing queue items synchronized with edits/cloud snapshots WITHOUT resetting progress
    if (queueItemsRef.current.length > 0 && initialCards.length > 0) {
      const latestMap = new Map(initialCards.map((c) => [c.id, c]));
      let didUpdateAnyCard = false;
      const refreshedItems = queueItemsRef.current.map((item) => {
        const fresh = latestMap.get(item.card.id);
        if (fresh && fresh !== item.card) {
          didUpdateAnyCard = true;
          return { ...item, card: fresh };
        }
        return item;
      });
      if (didUpdateAnyCard) {
        queueItemsRef.current = refreshedItems;
        setQueueItems(refreshedItems);
      }
    }
  }, [
    isHydrated,
    persistKey,
    normalizedOptions.sessionKey,
    initialCards,
    restartSession,
  ]);

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
      const nowIso = new Date().toISOString();
      const updatedCard: Flashcard = {
        ...activeItem.card,
        repetitions: sm2.repetitions,
        intervalDays: sm2.intervalDays,
        easeFactor: sm2.easeFactor,
        state: sm2.state,
        dueDate: sm2.dueDate,
        lastReviewedAt: nowIso,
        updatedAt: nowIso,
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

      queueItemsRef.current = nextItems;
      flippedStepIdRef.current = null;
      statsRef.current = nextStats;

      // Persist session progress synchronously BEFORE state updates so an immediate reload retains position
      persistSnapshot(nextItems, totalCardsRef.current, nextStats);

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
    [armCooldown, persistSnapshot]
  );

  // Marks the active front-facing card as Already Known -> schedules 7 days out and advances strictly 1 card
  const markAlreadyKnew = useCallback(
    (expectedCardId?: string, expectedStepId?: number) => {
      if (processingLockRef.current) return;

      const currentItems = queueItemsRef.current;
      const activeItem = currentItems[0];
      if (!activeItem) return;

      if (expectedCardId && activeItem.card.id !== expectedCardId) return;
      if (expectedStepId !== undefined && activeItem.stepId !== expectedStepId) return;

      processingLockRef.current = true;
      setIsProcessing(true);

      const updatedCard = scheduleAlreadyKnew(activeItem.card);
      const [, ...remaining] = currentItems;

      const nextStats: StudySessionStats = {
        ...statsRef.current,
        cardsReviewed: statsRef.current.cardsReviewed + 1,
        alreadyKnewCount: statsRef.current.alreadyKnewCount + 1,
      };

      queueItemsRef.current = remaining;
      flippedStepIdRef.current = null;
      statsRef.current = nextStats;

      persistSnapshot(remaining, totalCardsRef.current, nextStats);

      setFlippedStepId(null);
      setQueueItems(remaining);
      setStats(nextStats);

      // Persist the 7-day schedule; log as 'easy' for Firestore reviewLog compatibility
      optionsRef.current?.onCardReviewed?.(updatedCard, 'easy');

      if (
        remaining.length === 0 &&
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
    [armCooldown, persistSnapshot]
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

      persistSnapshot(nextItems, totalCardsRef.current, statsRef.current);

      setFlippedStepId(null);
      setQueueItems(nextItems);

      armCooldown(200);
    },
    [armCooldown, persistSnapshot]
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

    persistSnapshot(nextItems, totalCardsRef.current, statsRef.current);

    setFlippedStepId(null);
    setQueueItems(nextItems);

    armCooldown(200);
  }, [allocateQueueItems, armCooldown, persistSnapshot]);

  // Updates a card's content in-place across the active queue without altering stepId, flip state, or progress
  const updateCardInSession = useCallback((updatedCard: Flashcard) => {
    initialCardsRef.current = initialCardsRef.current.map((c) =>
      c.id === updatedCard.id ? updatedCard : c
    );
    const nextItems = queueItemsRef.current.map((item) =>
      item.card.id === updatedCard.id ? { ...item, card: updatedCard } : item
    );
    queueItemsRef.current = nextItems;
    setQueueItems(nextItems);
  }, []);

  // Removes a deleted card cleanly from the active study queue
  const removeCardFromSession = useCallback(
    (cardId: string) => {
      initialCardsRef.current = initialCardsRef.current.filter((c) => c.id !== cardId);
      const prevHead = queueItemsRef.current[0];
      const nextItems = queueItemsRef.current.filter((item) => item.card.id !== cardId);
      const removedCount = queueItemsRef.current.length - nextItems.length;

      queueItemsRef.current = nextItems;
      if (prevHead && prevHead.card.id === cardId) {
        flippedStepIdRef.current = null;
        setFlippedStepId(null);
      }
      let nextTotal = totalCardsRef.current;
      if (removedCount > 0) {
        nextTotal = Math.max(0, totalCardsRef.current - removedCount);
        totalCardsRef.current = nextTotal;
        setTotalSessionCards(nextTotal);
      }
      persistSnapshot(nextItems, nextTotal, statsRef.current);
      setQueueItems(nextItems);
    },
    [persistSnapshot]
  );

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
    markAlreadyKnew,
    skipCard,
    shuffleQueue,
    updateCardInSession,
    removeCardFromSession,
    isProcessing,
    isComplete,
    stats,
    restartSession,
  };
}
