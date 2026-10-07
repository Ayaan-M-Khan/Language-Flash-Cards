'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Flashcard, SM2Rating, StudySessionStats } from '@/lib/types';
import { calculateSM2 } from '@/lib/srs';

export interface UseStudySessionOptions {
  onSessionComplete?: (stats?: StudySessionStats) => void;
  onCardReviewed?: (updatedCard: Flashcard, rating: SM2Rating) => void;
}

export function useStudySession(
  initialCards: Flashcard[],
  optionsOrComplete?: UseStudySessionOptions | (() => void)
) {
  // Normalize options whether passed as an object or a direct completion callback
  const normalizedOptions: UseStudySessionOptions =
    typeof optionsOrComplete === 'function'
      ? { onSessionComplete: () => optionsOrComplete() }
      : optionsOrComplete || {};
  // Immutable deterministic queue: the active card is ALWAYS queue[0]
  const [queue, setQueue] = useState<Flashcard[]>(() => [...initialCards]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const totalCardsRef = useRef(initialCards.length);

  const [stats, setStats] = useState<StudySessionStats>({
    cardsReviewed: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
    startTime: Date.now(),
  });

  // Keep options in a ref so we never re-bind rateCard due to callback changes
  const optionsRef = useRef(normalizedOptions);
  useEffect(() => {
    optionsRef.current = normalizedOptions;
  }, [normalizedOptions]);

  // Keep a ref to queue for concurrency guards
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const currentCard = queue[0] || null;
  const isComplete = queue.length === 0 && totalCardsRef.current > 0;

  const flipCard = useCallback(() => {
    if (isProcessing) return;
    setIsFlipped((prev) => !prev);
  }, [isProcessing]);

  const rateCard = useCallback(
    async (rating: SM2Rating) => {
      const activeCard = queueRef.current[0];
      if (!activeCard || isProcessing) return;

      // Lock processing to prevent double-clicks or fast-click race conditions
      setIsProcessing(true);

      // Unflip card immediately for smooth visual transition
      setIsFlipped(false);

      // Allow card rotation animation to commence before queue update
      await new Promise((resolve) => setTimeout(resolve, 140));

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

      // Notify parent/service of review for Firestore & local persistence
      if (optionsRef.current?.onCardReviewed) {
        optionsRef.current.onCardReviewed(updatedCard, rating);
      }

      // Update session statistics
      setStats((prev) => ({
        ...prev,
        cardsReviewed: prev.cardsReviewed + 1,
        againCount: prev.againCount + (rating === 'again' ? 1 : 0),
        hardCount: prev.hardCount + (rating === 'hard' ? 1 : 0),
        goodCount: prev.goodCount + (rating === 'good' ? 1 : 0),
        easyCount: prev.easyCount + (rating === 'easy' ? 1 : 0),
      }));

      // Queue transformation:
      // If rated 'again' or 'hard' (< 3): Remove from front and re-insert 3 positions back (or at end)
      // If rated 'good' or 'easy' (>= 3): Remove permanently from this session
      setQueue((prevQueue) => {
        const [finishedCard, ...remaining] = prevQueue;
        if (!finishedCard) return [];

        let nextQueue: Flashcard[];
        if (rating === 'again' || rating === 'hard') {
          const insertIndex = Math.min(3, remaining.length);
          nextQueue = [...remaining];
          nextQueue.splice(insertIndex, 0, updatedCard);
        } else {
          nextQueue = remaining;
        }

        // If session just finished, trigger complete callback
        if (nextQueue.length === 0 && optionsRef.current?.onSessionComplete) {
          setTimeout(() => {
            optionsRef.current?.onSessionComplete?.({
              ...stats,
              cardsReviewed: stats.cardsReviewed + 1,
              againCount: stats.againCount + (rating === 'again' ? 1 : 0),
              hardCount: stats.hardCount + (rating === 'hard' ? 1 : 0),
              goodCount: stats.goodCount + (rating === 'good' ? 1 : 0),
              easyCount: stats.easyCount + (rating === 'easy' ? 1 : 0),
              endTime: Date.now(),
            });
          }, 200);
        }

        return nextQueue;
      });

      // Brief transition delay before accepting next card input
      setTimeout(() => {
        setIsProcessing(false);
      }, 160);
    },
    [isProcessing, stats]
  );

  // Safely moves current card to end of queue without skipping or modifying others
  const skipCard = useCallback(() => {
    if (isProcessing || queueRef.current.length <= 1) return;
    setIsProcessing(true);
    setIsFlipped(false);

    setTimeout(() => {
      setQueue((prevQueue) => {
        const [head, ...rest] = prevQueue;
        if (!head) return [];
        return [...rest, head];
      });
      setIsProcessing(false);
    }, 120);
  }, [isProcessing]);

  // Restart session with fresh cards
  const restartSession = useCallback((newCards?: Flashcard[]) => {
    const cardsToUse = newCards || initialCards;
    totalCardsRef.current = cardsToUse.length;
    setQueue([...cardsToUse]);
    setIsFlipped(false);
    setIsProcessing(false);
    setStats({
      cardsReviewed: 0,
      againCount: 0,
      hardCount: 0,
      goodCount: 0,
      easyCount: 0,
      startTime: Date.now(),
    });
  }, [initialCards]);

  const cardsRemaining = queue.length;
  const totalSessionCards = totalCardsRef.current;
  const completedCount = Math.max(0, totalSessionCards - cardsRemaining);
  const progressPercent = totalSessionCards > 0
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
    isProcessing,
    isComplete,
    stats,
    restartSession,
  };
}
