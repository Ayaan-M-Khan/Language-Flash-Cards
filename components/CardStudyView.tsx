'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Layers,
  RefreshCw,
  Clock,
  BookOpen,
  ListOrdered,
  Shuffle,
  ArrowLeftRight,
} from 'lucide-react';
import { CardDirection, Flashcard as FlashcardType, Deck, SM2Rating } from '@/lib/types';
import { getPreviewIntervals, isCardDue, sortCardsSequentially } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';
import { WeeklyReviewTracker } from './WeeklyReviewTracker';
import { incrementTodayReviewCount } from '@/lib/review-history';
import { deckService } from '@/lib/deckService';
import { Flashcard } from './Flashcard';
import { useStudySession } from '@/hooks/useStudySession';

interface CardStudyViewProps {
  cards: FlashcardType[];
  decks: Deck[];
  selectedDeckId: string | null;
  onSelectDeck: (deckId: string | null) => void;
  cardDirection?: CardDirection;
  onChangeCardDirection?: (direction: CardDirection) => void;
  onCardReviewed: (updatedCard: FlashcardType, rating: SM2Rating) => void;
  onNavigateToImport: () => void;
  currentStreak?: number;
  userId?: string | null;
  syncVersion?: number;
}

export const CardStudyView: React.FC<CardStudyViewProps> = ({
  cards,
  decks,
  selectedDeckId,
  onSelectDeck,
  cardDirection,
  onChangeCardDirection,
  onCardReviewed,
  onNavigateToImport,
  currentStreak = 0,
  userId = null,
  syncVersion = 0,
}) => {
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Default to 'sequential' so ALL cards in the deck always show 1-by-1 without skipping previously reviewed cards
  const [studyMode, setStudyMode] = useState<'sequential' | 'due'>('sequential');
  const [justShuffled, setJustShuffled] = useState(false);
  const [localDirection, setLocalDirection] = useState<CardDirection>('target-first');

  const activeDirection: CardDirection = cardDirection ?? localDirection;

  // Strictly sort matching deck cards 1-by-1 in sequential order
  const orderedMatchingCards = useMemo(() => {
    const matching = cards.filter((card) => !selectedDeckId || card.deckId === selectedDeckId);
    return sortCardsSequentially(matching, decks);
  }, [cards, decks, selectedDeckId]);

  const orderedDueCards = useMemo(() => {
    return orderedMatchingCards.filter((card) => isCardDue(card));
  }, [orderedMatchingCards]);

  // Compute deterministic session cards based on active deck filter and mode
  const initialSessionCards = useMemo(() => {
    if (studyMode === 'due') {
      return orderedDueCards;
    }
    return orderedMatchingCards;
  }, [studyMode, orderedDueCards, orderedMatchingCards]);

  // Re-initialize session queue ONLY when selected deck, study mode, or account hydration changes
  const sessionKey = `${userId ?? 'guest'}::${selectedDeckId ?? 'all'}::${studyMode}::${syncVersion}`;

  // Deterministic queue-based study manager (active card is ALWAYS queue[0], advances 1-by-1)
  const {
    currentCard,
    currentStepId,
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
  } = useStudySession(initialSessionCards, {
    sessionKey,
    onCardReviewed: (updatedCard, rating) => {
      onCardReviewed(updatedCard, rating);

      if (userId) {
        deckService
          .recordStudyLog(
            userId,
            updatedCard.deckId,
            updatedCard.id,
            rating,
            updatedCard.intervalDays
          )
          .catch((err) => console.warn('Record study log in Firestore failed:', err));
      }

      incrementTodayReviewCount(userId);
      setReviewRefreshTrigger((v) => v + 1);
    },
    onSessionComplete: () => {
      playHapticFeedback('celebrate');
      try {
        confetti({
          particleCount: 75,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#007AFF', '#5856D6', '#34C759', '#FF9500', '#FF2D55'],
        });
      } catch {
        // Fallback
      }
    },
  });

  // Associated deck for active card
  const currentDeck = useMemo(() => {
    if (!currentCard) return undefined;
    return decks.find((d) => d.id === currentCard.deckId);
  }, [currentCard, decks]);

  const blurActiveElement = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      const tag = document.activeElement.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        document.activeElement.blur();
      }
    }
  };

  // Switch card face order (Word -> Def vs Def -> Transliteration) cleanly on the front face
  const handleSelectDirection = useCallback(
    (nextDirection: CardDirection) => {
      if (nextDirection === activeDirection) return;
      blurActiveElement();
      playHapticFeedback('tap');
      setIsFlipped(false);
      if (onChangeCardDirection) {
        onChangeCardDirection(nextDirection);
      } else {
        setLocalDirection(nextDirection);
      }
    },
    [activeDirection, onChangeCardDirection, setIsFlipped]
  );

  // Handle Audio Speech
  const handleSpeak = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentCard || isSpeaking) return;
      playHapticFeedback('tap');
      setIsSpeaking(true);
      const code = currentDeck?.languageCode || currentCard.language || 'es-ES';
      await speakWord(currentCard.targetWord, code);
      setIsSpeaking(false);
    },
    [currentCard, currentDeck, isSpeaking]
  );

  // Handle Flip with haptic feedback
  const handleFlip = useCallback(() => {
    if (isProcessing) return;
    blurActiveElement();
    playHapticFeedback('flip');
    flipCard();
  }, [isProcessing, flipCard]);

  // Handle Rating with card-ID + step-ID lock so duplicate events can NEVER skip the next card
  const handleRating = useCallback(
    async (rating: SM2Rating) => {
      if (!currentCard || !isFlipped || isProcessing) return;
      const targetCardId = currentCard.id;
      const targetStepId = currentStepId;
      blurActiveElement();

      if (rating === 'again') {
        playHapticFeedback('fail');
      } else {
        playHapticFeedback('rating');
      }

      await rateCard(rating, targetCardId, targetStepId);
    },
    [currentCard, currentStepId, isFlipped, isProcessing, rateCard]
  );

  // Handle Skip with card-ID + step-ID lock
  const handleSkip = useCallback(() => {
    if (!currentCard || isProcessing) return;
    const targetCardId = currentCard.id;
    const targetStepId = currentStepId;
    blurActiveElement();
    playHapticFeedback('tap');
    skipCard(targetCardId, targetStepId);
  }, [currentCard, currentStepId, isProcessing, skipCard]);

  // Handle Shuffle of current in-memory session queue (leaves SRS due dates & intervals untouched)
  const handleShuffle = useCallback(() => {
    if (cardsRemaining <= 1 || isProcessing) return;
    blurActiveElement();
    playHapticFeedback('tap');
    shuffleQueue();
    setJustShuffled(true);
    setTimeout(() => setJustShuffled(false), 1200);
  }, [cardsRemaining, isProcessing, shuffleQueue]);

  // Capture-phase keyboard listener prevents focused <button> elements from double-firing on Enter/Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isProcessing) return;

      if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (!isFlipped) {
          handleFlip();
        } else {
          handleRating('good');
        }
      } else if (e.key.toLowerCase() === 's') {
        // Avoid spoiling foreign target word audio before flipping when in definition-first mode
        if (activeDirection === 'definition-first' && !isFlipped) return;
        e.preventDefault();
        e.stopPropagation();
        handleSpeak();
      } else if (isFlipped && currentCard) {
        if (e.key === '1') {
          e.preventDefault();
          e.stopPropagation();
          handleRating('again');
        } else if (e.key === '2') {
          e.preventDefault();
          e.stopPropagation();
          handleRating('hard');
        } else if (e.key === '3') {
          e.preventDefault();
          e.stopPropagation();
          handleRating('good');
        } else if (e.key === '4') {
          e.preventDefault();
          e.stopPropagation();
          handleRating('easy');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [
    handleFlip,
    handleSpeak,
    handleRating,
    isFlipped,
    currentCard,
    isProcessing,
    activeDirection,
  ]);

  // Preview intervals for current card ratings
  const previewIntervals = useMemo(() => {
    if (!currentCard) return { again: '10m', hard: '1d', good: '3d', easy: '7d' };
    return getPreviewIntervals(currentCard);
  }, [currentCard]);

  // Reusable Segmented Card Order Control
  const renderCardOrderSelector = (idPrefix: string) => (
    <div
      role="group"
      aria-label="Card definition order"
      className="inline-flex items-center p-0.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-xl border border-black/5 dark:border-white/10 text-xs font-medium shrink-0"
    >
      <button
        id={`${idPrefix}-word-first-btn`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleSelectDirection('target-first');
        }}
        title="Show foreign word & transliteration first, then English definition"
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
          activeDirection === 'target-first'
            ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
        }`}
      >
        <span>Word → Def</span>
      </button>
      <button
        id={`${idPrefix}-def-first-btn`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleSelectDirection('definition-first');
        }}
        title="Show English definition first, then transliteration & foreign word"
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
          activeDirection === 'definition-first'
            ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
        }`}
      >
        <ArrowLeftRight className="w-3 h-3 shrink-0" />
        <span>Def → Translit</span>
      </button>
    </div>
  );

  // ===================== ZERO DUE CARDS EMPTY STATE =====================
  if (totalSessionCards === 0) {
    const totalDeckCards = orderedMatchingCards.length;

    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-green-100/80 dark:bg-emerald-950/50 text-green-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
          All Caught Up!
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-6 leading-relaxed">
          {totalDeckCards > 0
            ? 'You have reviewed all cards due for optimal retention today. Pick a deck and card order below to practice anytime.'
            : 'You don’t have any flashcards in this deck yet. Import a table of vocabulary words to generate smart decks instantly.'}
        </p>

        {/* Deck filter buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <button
            onClick={() => onSelectDeck(null)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedDeckId === null
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-xs'
                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-black/5 dark:border-white/10'
            }`}
          >
            All Decks ({cards.length})
          </button>
          {decks.map((deck) => {
            const count = cards.filter((c) => c.deckId === deck.id).length;
            const due = cards.filter((c) => c.deckId === deck.id && isCardDue(c)).length;
            return (
              <button
                key={deck.id}
                onClick={() => onSelectDeck(deck.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  selectedDeckId === deck.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-black/5 dark:border-white/10'
                }`}
              >
                <span>{deck.title}</span>
                <span className="text-[10px] opacity-75">
                  ({count}
                  {due > 0 ? ` · ${due} due` : ''})
                </span>
              </button>
            );
          })}
        </div>

        {/* Card Order Picker when choosing deck */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Card Order:</span>
          {renderCardOrderSelector('empty-order')}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {totalDeckCards > 0 && (
            <button
              id="empty-practice-anyway-btn"
              onClick={() => {
                setStudyMode('sequential');
                restartSession(orderedMatchingCards);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold text-sm hover:bg-black dark:hover:bg-white transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Practice All Cards in Order ({totalDeckCards})</span>
            </button>
          )}
          <button
            id="empty-import-table-btn"
            onClick={onNavigateToImport}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-sm shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Import Vocabulary Table</span>
          </button>
          <button
            id="empty-preview-deck-btn"
            onClick={() => onSelectDeck(null)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-black/10 dark:border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
            <span>View All Decks</span>
          </button>
        </div>

        <WeeklyReviewTracker
          currentStreak={currentStreak}
          refreshTrigger={reviewRefreshTrigger}
          userId={userId}
        />
      </div>
    );
  }

  // ===================== SESSION COMPLETE SUMMARY =====================
  if (isComplete) {
    const { againCount, hardCount, goodCount, easyCount, cardsReviewed } = stats;
    const total = cardsReviewed;
    const retentionRate = total > 0 ? Math.round(((goodCount + easyCount) / total) * 100) : 100;

    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-8 shadow-sm dark:shadow-2xl border border-black/5 dark:border-white/10 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-1">
            Session Completed!
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
            Optimal memory consolidation active for {currentDeck?.title || 'Selected Deck'}
          </p>

          {/* Retention Stats Circle & Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 tabular-nums">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-black/5 dark:border-white/10">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1">Reviewed</span>
              <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{total}</span>
            </div>
            <div className="p-3 bg-green-50 dark:bg-emerald-950/40 rounded-2xl border border-green-200/50 dark:border-emerald-800/50">
              <span className="text-xs text-green-700 dark:text-emerald-400 block mb-1">Retention</span>
              <span className="text-xl font-bold text-green-700 dark:text-emerald-300">{retentionRate}%</span>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200/50 dark:border-blue-800/50">
              <span className="text-xs text-blue-700 dark:text-blue-400 block mb-1">Mastered/Good</span>
              <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{goodCount + easyCount}</span>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-950/40 rounded-2xl border border-orange-200/50 dark:border-orange-800/50">
              <span className="text-xs text-orange-700 dark:text-orange-400 block mb-1">Repeat (Again)</span>
              <span className="text-xl font-bold text-orange-700 dark:text-orange-300">{againCount}</span>
            </div>
          </div>

          {/* Rating distribution bar */}
          <div className="mb-6 text-left tabular-nums">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 block mb-2">
              Performance Breakdown
            </span>
            <div className="h-3 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 flex overflow-hidden">
              {againCount > 0 && (
                <div
                  style={{ width: `${(againCount / total) * 100}%` }}
                  className="bg-rose-500"
                  title={`Again: ${againCount}`}
                />
              )}
              {hardCount > 0 && (
                <div
                  style={{ width: `${(hardCount / total) * 100}%` }}
                  className="bg-amber-500"
                  title={`Hard: ${hardCount}`}
                />
              )}
              {goodCount > 0 && (
                <div
                  style={{ width: `${(goodCount / total) * 100}%` }}
                  className="bg-blue-500"
                  title={`Good: ${goodCount}`}
                />
              )}
              {easyCount > 0 && (
                <div
                  style={{ width: `${(easyCount / total) * 100}%` }}
                  className="bg-emerald-500"
                  title={`Easy: ${easyCount}`}
                />
              )}
            </div>
            <div className="flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5">
              <span>Again ({againCount})</span>
              <span>Hard ({hardCount})</span>
              <span>Good ({goodCount})</span>
              <span>Easy ({easyCount})</span>
            </div>
          </div>

          {/* Card Order Selector before restarting */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Next Pass Order:</span>
            {renderCardOrderSelector('complete-order')}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              id="study-again-btn"
              onClick={() => {
                setStudyMode('sequential');
                restartSession(orderedMatchingCards);
              }}
              className="flex-1 py-3 px-4 rounded-2xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium text-sm hover:bg-black dark:hover:bg-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Review All Again (1-by-1)</span>
            </button>
            <button
              id="study-import-more-btn"
              onClick={onNavigateToImport}
              className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Add More Words</span>
            </button>
          </div>
        </motion.div>

        <WeeklyReviewTracker
          currentStreak={currentStreak}
          refreshTrigger={reviewRefreshTrigger}
          userId={userId}
        />
      </div>
    );
  }

  // Guard: if no current card, render null
  if (!currentCard) {
    return null;
  }

  // ===================== ACTIVE STUDY CARD =====================
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 sm:py-8">
      {/* Top Header: Deck selection, Card Face Direction, Order Mode & Queue Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="study-deck-select"
            value={selectedDeckId || 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? null : e.target.value;
              onSelectDeck(val);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 rounded-xl text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs max-w-[210px] truncate cursor-pointer"
          >
            <option value="all">All Decks ({cards.length} cards)</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.language})
              </option>
            ))}
          </select>

          {/* Card Definition Order Toggle right beside Deck Picker */}
          {renderCardOrderSelector('study-order')}

          <button
            id="shuffle-queue-btn"
            type="button"
            disabled={isProcessing || cardsRemaining <= 1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleShuffle();
            }}
            title="Randomize current session queue without changing long-term SRS schedules"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border shadow-2xs transition-all select-none touch-manipulation whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-98 ${
              justShuffled
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
            }`}
          >
            <Shuffle
              className={`w-3.5 h-3.5 ${justShuffled ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'}`}
            />
            <span>{justShuffled ? 'Shuffled' : 'Shuffle'}</span>
          </button>

          {orderedMatchingCards.length > 0 && orderedDueCards.length < orderedMatchingCards.length && (
            <button
              type="button"
              onClick={() =>
                setStudyMode((prev) => (prev === 'sequential' ? 'due' : 'sequential'))
              }
              title={
                studyMode === 'sequential'
                  ? 'Showing all deck cards 1-by-1 in order. Click to show only due cards.'
                  : 'Showing only due cards. Click to study all cards 1-by-1 from the beginning.'
              }
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                studyMode === 'sequential'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-100'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>
                {studyMode === 'sequential'
                  ? `All 1-by-1 (${orderedMatchingCards.length})`
                  : `Due Only (${orderedDueCards.length}/${orderedMatchingCards.length})`}
              </span>
            </button>
          )}
        </div>

        {/* Deterministic Queue Counter */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-medium tabular-nums">
          <Clock className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
          <span>
            {Math.min(completedCount + 1, totalSessionCards)} of {totalSessionCards} ({cardsRemaining}{' '}
            left)
          </span>
          <span className="text-neutral-300 dark:text-neutral-600" aria-hidden="true">
            ·
          </span>
          <span
            className={`font-semibold capitalize ${
              currentCard.state === 'new'
                ? 'text-blue-600 dark:text-blue-400'
                : currentCard.state === 'learning'
                ? 'text-orange-600 dark:text-orange-400'
                : currentCard.state === 'mastered'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {currentCard.state}
          </span>
          {currentCard.category && (
            <>
              <span className="hidden sm:inline text-neutral-300 dark:text-neutral-600" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline text-neutral-500 dark:text-neutral-400 truncate max-w-[140px]">
                {currentCard.category}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Queue Progress Bar */}
      <div className="w-full h-1.5 bg-neutral-200/80 dark:bg-neutral-800 rounded-full overflow-hidden mb-6">
        <motion.div
          className="h-full bg-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>

      {/* 3D Flip Card Container — keyed by monotonic currentStepId with NO opacity wrapper around preserve-3d */}
      <div className="w-full mb-6 min-h-[380px] sm:min-h-[420px]">
        <Flashcard
          key={currentStepId}
          card={currentCard}
          stepId={currentStepId}
          language={currentDeck?.language || currentCard.language}
          cardDirection={activeDirection}
          isFlipped={isFlipped}
          onFlip={handleFlip}
          onSpeak={handleSpeak}
          isSpeaking={isSpeaking}
        />
      </div>

      {/* Action Tray: 4-Level SuperMemo SM-2 Interval Buttons & Navigation */}
      {isFlipped ? (
        <div
          className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums ${
            isProcessing ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {/* AGAIN BUTTON */}
          <button
            id="rating-again-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRating('again');
            }}
            className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100/90 dark:hover:bg-rose-900/50 border border-rose-200/80 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-0.5">
              Again [1]
            </span>
            <span className="text-xs text-rose-800 dark:text-rose-200 font-medium">
              {previewIntervals.again}
            </span>
          </button>

          {/* HARD BUTTON */}
          <button
            id="rating-hard-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRating('hard');
            }}
            className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100/90 dark:hover:bg-amber-900/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-0.5">
              Hard [2]
            </span>
            <span className="text-xs text-amber-900 dark:text-amber-100 font-medium">
              {previewIntervals.hard}
            </span>
          </button>

          {/* GOOD / MEDIUM BUTTON */}
          <button
            id="rating-good-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRating('good');
            }}
            className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white transition-all active:scale-98 shadow-sm shadow-blue-500/25 group relative disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[11px] font-bold text-blue-100">
                Good [3]
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-blue-200" />
            </div>
            <span className="text-xs text-white font-medium">
              {previewIntervals.good}
            </span>
          </button>

          {/* EASY BUTTON */}
          <button
            id="rating-easy-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRating('easy');
            }}
            className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">
              Easy [4]
            </span>
            <span className="text-xs text-emerald-900 dark:text-emerald-100 font-medium">
              {previewIntervals.easy}
            </span>
          </button>
        </div>
      ) : (
        <div
          className={`flex items-center justify-center gap-3 ${
            isProcessing ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <button
            id="show-answer-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFlip();
            }}
            className="flex-1 sm:flex-initial sm:w-64 py-3.5 px-6 rounded-2xl bg-neutral-900 dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <span>
              {activeDirection === 'definition-first' ? 'Show Transliteration' : 'Show Answer'}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-600 font-normal px-2 py-0.5 rounded-md bg-neutral-800 dark:bg-neutral-200">
              Space
            </span>
          </button>
          <button
            id="skip-card-front-btn"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSkip();
            }}
            title="Move this card to end of session queue"
            className="py-3.5 px-4 rounded-2xl bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-300 font-medium text-xs shadow-2xs transition-all flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
          >
            <span>Skip</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
          </button>
        </div>
      )}

      {/* Visual Progress Tracking Section */}
      <WeeklyReviewTracker
        currentStreak={currentStreak}
        refreshTrigger={reviewRefreshTrigger}
        userId={userId}
      />
    </div>
  );
};
