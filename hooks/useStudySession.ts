'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Flashcard, SM2Rating, StudySessionStats } from '@/lib/types';
import { calculateSM2 } from '@/lib/srs';

export interface UseStudySessionOptions {
  onSessionComplete?: (stats?: StudySessionStats) => void;
  onCardReviewed?: (updatedCard: Flashcard, rating: SM2Rating) => void;
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

  // Immutable deterministic queue: active card is ALWAYS queue[0]
  const [queue, setQueue] = useState<Flashcard[]>(() => [...initialCards]);
  const [totalSessionCards, setTotalSessionCards] = useState<number>(() => initialCards.length);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFlipped, setIsFlippedState] = useState(false);
  const [stats, setStats] = useState<StudySessionStats>(createInitialStats);

  // Synchronous refs eliminate stale closures and prevent same-tick double advances
  const queueRef = useRef<Flashcard[]>([...initialCards]);
  const totalCardsRef = useRef<number>(initialCards.length);
  const processingLockRef = useRef<boolean>(false);
  const isFlippedRef = useRef<boolean>(false);
  const statsRef = useRef<StudySessionStats>(stats);
  const optionsRef = useRef<UseStudySessionOptions>(normalizedOptions);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    optionsRef.current = normalizedOptions;
  }, [normalizedOptions]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  const setIsFlipped = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(isFlippedRef.current) : value;
    isFlippedRef.current = next;
    setIsFlippedState(next);
  }, []);

  const flipCard = useCallback(() => {
    if (processingLockRef.current || queueRef.current.length === 0) return;
    const next = !isFlippedRef.current;
    isFlippedRef.current = next;
    setIsFlippedState(next);
  }, []);

  const rateCard = useCallback(async (rating: SM2Rating, expectedCardId?: string) => {
    if (processingLockRef.current) return;

    const currentQueue = queueRef.current;
    const activeCard = currentQueue[0];
    if (!activeCard) return;

    // Guard against duplicate events targeting an already-advanced card
    if (expectedCardId && activeCard.id !== expectedCardId) return;

    // Engage synchronous lock immediately before any state updates
    processingLockRef.current = true;
    setIsProcessing(true);

    const sm2 = calculateSM2(activeCard, rating);
    const updatedCard: Flashcard = {
      ...activeCard,
      repetitions: sm2.repetitions,
      intervalDays: sm2.intervalDays,
      easeFactor: sm2.easeFactor,
      state: sm2.state,
      dueDate: sm2.dueDate,
      lastReviewedAt: new Date().toISOString(),
    };

    // Advance strictly 1 card: pop ONLY currentQueue[0], making currentQueue[1] the next card
    const [, ...remaining] = currentQueue;
    let nextQueue: Flashcard[];
    if (rating === 'again' || rating === 'hard') {
      const insertIndex = Math.min(3, remaining.length);
      nextQueue = [...remaining];
      nextQueue.splice(insertIndex, 0, updatedCard);
    } else {
      nextQueue = remaining;
    }

    const nextStats: StudySessionStats = {
      ...statsRef.current,
      cardsReviewed: statsRef.current.cardsReviewed + 1,
      againCount: statsRef.current.againCount + (rating === 'again' ? 1 : 0),
      hardCount: statsRef.current.hardCount + (rating === 'hard' ? 1 : 0),
      goodCount: statsRef.current.goodCount + (rating === 'good' ? 1 : 0),
      easyCount: statsRef.current.easyCount + (rating === 'easy' ? 1 : 0),
    };

    // Commit synchronous refs first
    queueRef.current = nextQueue;
    isFlippedRef.current = false;
    statsRef.current = nextStats;

    // Batch pure state updates together
    setIsFlippedState(false);
    setQueue(nextQueue);
    setStats(nextStats);

    // Notify parent for local & Firestore persistence
    optionsRef.current?.onCardReviewed?.(updatedCard, rating);

    if (nextQueue.length === 0 && totalCardsRef.current > 0 && optionsRef.current?.onSessionComplete) {
      const completedStats: StudySessionStats = {
        ...nextStats,
        endTime: Date.now(),
      };
      setTimeout(() => {
        optionsRef.current?.onSessionComplete?.(completedStats);
      }, 180);
    }

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      processingLockRef.current = false;
      setIsProcessing(false);
      cooldownTimerRef.current = null;
    }, 220);
  }, []);

  // Moves ONLY queue[0] to the end of the queue so queue[1] is shown next (strictly 1-by-1)
  const skipCard = useCallback((expectedCardId?: string) => {
    if (processingLockRef.current || queueRef.current.length <= 1) return;

    const currentQueue = queueRef.current;
    const head = currentQueue[0];
    if (!head) return;
    if (expectedCardId && head.id !== expectedCardId) return;

    processingLockRef.current = true;
    setIsProcessing(true);

    const [, ...rest] = currentQueue;
    const nextQueue = [...rest, head];

    queueRef.current = nextQueue;
    isFlippedRef.current = false;

    setIsFlippedState(false);
    setQueue(nextQueue);

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      processingLockRef.current = false;
      setIsProcessing(false);
      cooldownTimerRef.current = null;
    }, 180);
  }, []);

  // Randomizes the remaining in-memory session queue (Fisher-Yates) without altering SRS schedules
  const shuffleQueue = useCallback(() => {
    if (processingLockRef.current || queueRef.current.length <= 1) return;

    const currentQueue = queueRef.current;
    const previousHeadId = currentQueue[0]?.id;

    processingLockRef.current = true;
    setIsProcessing(true);

    const nextQueue = [...currentQueue];
    for (let i = nextQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nextQueue[i], nextQueue[j]] = [nextQueue[j], nextQueue[i]];
    }

    // Ensure the top card visibly changes when at least 2 distinct cards remain
    if (nextQueue.length >= 2 && nextQueue[0].id === previousHeadId) {
      const swapIndex = nextQueue.findIndex((c) => c.id !== previousHeadId);
      if (swapIndex > 0) {
        [nextQueue[0], nextQueue[swapIndex]] = [nextQueue[swapIndex], nextQueue[0]];
      }
    }

    queueRef.current = nextQueue;
    isFlippedRef.current = false;

    setIsFlippedState(false);
    setQueue(nextQueue);

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      processingLockRef.current = false;
      setIsProcessing(false);
      cooldownTimerRef.current = null;
    }, 180);
  }, []);

  // Deterministically reset session queue with an ordered card snapshot
  const restartSession = useCallback(
    (newCards?: Flashcard[]) => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      const cardsToUse = [...(newCards ?? initialCards)];
      const freshStats = createInitialStats();

      processingLockRef.current = false;
      isFlippedRef.current = false;
      queueRef.current = cardsToUse;
      totalCardsRef.current = cardsToUse.length;
      statsRef.current = freshStats;

      setTotalSessionCards(cardsToUse.length);
      setQueue(cardsToUse);
      setIsFlippedState(false);
      setIsProcessing(false);
      setStats(freshStats);
    },
    [initialCards]
  );

  const currentCard = queue[0] || null;
  const isComplete = queue.length === 0 && totalSessionCards > 0;
  const cardsRemaining = queue.length;
  const completedCount = Math.max(0, totalSessionCards - cardsRemaining);
  const progressPercent =
    totalSessionCards > 0
      ? Math.min(100, Math.round((completedCount / totalSessionCards) * 100))
      : 0;

  return {
    currentCard,
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
