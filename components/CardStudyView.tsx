'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Layers,
  RefreshCw,
  Clock,
  BookOpen,
} from 'lucide-react';
import { Flashcard as FlashcardType, Deck, SM2Rating } from '@/lib/types';
import { getPreviewIntervals, isCardDue } from '@/lib/srs';
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
  onCardReviewed: (updatedCard: FlashcardType, rating: SM2Rating) => void;
  onNavigateToImport: () => void;
  currentStreak?: number;
  userId?: string | null;
}

export const CardStudyView: React.FC<CardStudyViewProps> = ({
  cards,
  decks,
  selectedDeckId,
  onSelectDeck,
  onCardReviewed,
  onNavigateToImport,
  currentStreak = 0,
  userId = null,
}) => {
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Compute session initial cards deterministically based on active deck filter
  const initialSessionCards = useMemo(() => {
    const matching = cards.filter((card) => !selectedDeckId || card.deckId === selectedDeckId);
    const due = matching.filter((card) => isCardDue(card));
    return due.length > 0 ? due : matching;
  }, [cards, selectedDeckId]);

  // Use the queue-based study manager (ZERO skipped cards, active card is ALWAYS queue[0])
  const {
    currentCard,
    cardsRemaining,
    totalSessionCards,
    completedCount,
    progressPercent,
    isFlipped,
    flipCard,
    rateCard,
    skipCard,
    isProcessing,
    isComplete,
    stats,
    restartSession,
  } = useStudySession(initialSessionCards, {
    onCardReviewed: (updatedCard, rating) => {
      // 1. Notify parent handler for local state
      onCardReviewed(updatedCard, rating);

      // 2. Persist study log & aggregate progress directly to user's Firestore account
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

      // 3. Trigger reactive refresh for session review trackers
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

  // Re-sync queue when selected deck changes
  const [prevDeckId, setPrevDeckId] = useState(selectedDeckId);
  if (selectedDeckId !== prevDeckId) {
    setPrevDeckId(selectedDeckId);
    const matching = cards.filter((card) => !selectedDeckId || card.deckId === selectedDeckId);
    const due = matching.filter((card) => isCardDue(card));
    restartSession(due.length > 0 ? due : matching);
  }

  // Associated deck for active card
  const currentDeck = useMemo(() => {
    if (!currentCard) return undefined;
    return decks.find((d) => d.id === currentCard.deckId);
  }, [currentCard, decks]);

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
    playHapticFeedback('flip');
    flipCard();
  }, [isProcessing, flipCard]);

  // Handle Rating with haptic feedback
  const handleRating = useCallback(
    async (rating: SM2Rating) => {
      if (!currentCard || isProcessing) return;

      // Blur focused buttons to avoid duplicate Enter/Space hits
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (rating === 'again') {
        playHapticFeedback('fail');
      } else {
        playHapticFeedback('rating');
      }

      await rateCard(rating);
    },
    [currentCard, isProcessing, rateCard]
  );

  // Keyboard shortcut listeners (Space/Enter/ArrowRight = flip/good, 1-4 = ratings when flipped, S = speak)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in input fields
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.repeat || isProcessing) return;

      if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (!isFlipped) {
          handleFlip();
        } else {
          handleRating('good');
        }
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSpeak();
      } else if (isFlipped && currentCard) {
        if (e.key === '1') {
          e.preventDefault();
          handleRating('again');
        } else if (e.key === '2') {
          e.preventDefault();
          handleRating('hard');
        } else if (e.key === '3') {
          e.preventDefault();
          handleRating('good');
        } else if (e.key === '4') {
          e.preventDefault();
          handleRating('easy');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handleSpeak, handleRating, isFlipped, currentCard, isProcessing]);

  // Preview intervals for current card ratings
  const previewIntervals = useMemo(() => {
    if (!currentCard) return { again: '10m', hard: '1d', good: '3d', easy: '7d' };
    return getPreviewIntervals(currentCard);
  }, [currentCard]);

  // ===================== ZERO DUE CARDS EMPTY STATE =====================
  if (totalSessionCards === 0) {
    const totalDeckCards = cards.filter((c) => !selectedDeckId || c.deckId === selectedDeckId).length;

    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-green-100/80 text-green-600 flex items-center justify-center shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900 mb-2">
          All Caught Up!
        </h2>
        <p className="text-sm text-neutral-600 max-w-md mx-auto mb-6 leading-relaxed">
          {totalDeckCards > 0
            ? 'You have reviewed all cards due for optimal retention today. The spaced repetition engine will schedule your next batch automatically.'
            : 'You don’t have any flashcards in this deck yet. Import a table of vocabulary words to generate smart decks instantly.'}
        </p>

        {/* Deck filter chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <button
            onClick={() => onSelectDeck(null)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              selectedDeckId === null
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-black/5'
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
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedDeckId === deck.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-black/5'
                }`}
              >
                <span>{deck.title}</span>
                <span className="text-[10px] opacity-75">({count})</span>
                {due > 0 && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {totalDeckCards > 0 && (
            <button
              id="empty-practice-anyway-btn"
              onClick={() => {
                const matching = cards.filter((c) => !selectedDeckId || c.deckId === selectedDeckId);
                restartSession(matching);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-neutral-900 text-white font-semibold text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Practice All Cards ({totalDeckCards})</span>
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
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white text-neutral-700 font-medium text-sm hover:bg-neutral-100 border border-black/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-neutral-500" />
            <span>View All Decks</span>
          </button>
        </div>

        {/* Visual Progress Tracking Section */}
        <WeeklyReviewTracker currentStreak={currentStreak} refreshTrigger={reviewRefreshTrigger} userId={userId} />
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
          className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-black/5 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
            <Sparkles className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 mb-1">
            Session Completed!
          </h2>
          <p className="text-xs text-neutral-500 mb-6">
            Optimal memory consolidation active for {currentDeck?.title || 'Selected Deck'}
          </p>

          {/* Retention Stats Circle & Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-3 bg-neutral-50 rounded-2xl border border-black/5">
              <span className="text-xs text-neutral-500 block mb-1">Reviewed</span>
              <span className="text-xl font-bold text-neutral-900">{total}</span>
            </div>
            <div className="p-3 bg-green-50 rounded-2xl border border-green-200/50">
              <span className="text-xs text-green-700 block mb-1">Retention</span>
              <span className="text-xl font-bold text-green-700">{retentionRate}%</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200/50">
              <span className="text-xs text-blue-700 block mb-1">Mastered/Good</span>
              <span className="text-xl font-bold text-blue-700">{goodCount + easyCount}</span>
            </div>
            <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200/50">
              <span className="text-xs text-orange-700 block mb-1">Repeat (Again)</span>
              <span className="text-xl font-bold text-orange-700">{againCount}</span>
            </div>
          </div>

          {/* Rating distribution bar */}
          <div className="mb-6 text-left">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-2">
              Performance Breakdown
            </span>
            <div className="h-3 w-full rounded-full bg-neutral-100 flex overflow-hidden">
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
            <div className="flex justify-between text-[11px] text-neutral-500 mt-1.5">
              <span>Again ({againCount})</span>
              <span>Hard ({hardCount})</span>
              <span>Good ({goodCount})</span>
              <span>Easy ({easyCount})</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              id="study-again-btn"
              onClick={() => restartSession()}
              className="flex-1 py-3 px-4 rounded-2xl bg-neutral-900 text-white font-medium text-sm hover:bg-black transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Review Again</span>
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

        {/* Visual Progress Tracking Section */}
        <WeeklyReviewTracker currentStreak={currentStreak} refreshTrigger={reviewRefreshTrigger} userId={userId} />
      </div>
    );
  }

  // Guard: if no current card, render loading or caught up
  if (!currentCard) {
    return null;
  }

  // ===================== ACTIVE STUDY CARD =====================
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 sm:py-8">
      {/* Top Header: Deck selection & Queue Counter */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Deck Chip Dropdown / Info */}
        <div className="flex items-center gap-2">
          <select
            id="study-deck-select"
            value={selectedDeckId || 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? null : e.target.value;
              onSelectDeck(val);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-black/10 rounded-xl text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
          >
            <option value="all">All Decks ({cards.length} cards)</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.language})
              </option>
            ))}
          </select>

          {currentCard.category && (
            <span className="hidden xs:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600">
              {currentCard.category}
            </span>
          )}
        </div>

        {/* Deterministic Queue Counter Badge */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>
            {completedCount + 1} of {totalSessionCards} ({cardsRemaining} remaining)
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              currentCard.state === 'new'
                ? 'bg-blue-100 text-blue-700'
                : currentCard.state === 'learning'
                ? 'bg-orange-100 text-orange-700'
                : currentCard.state === 'mastered'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-purple-100 text-purple-700'
            }`}
          >
            {currentCard.state}
          </span>
        </div>
      </div>

      {/* Queue Progress Bar */}
      <div className="w-full h-1.5 bg-neutral-200/80 rounded-full overflow-hidden mb-6">
        <motion.div
          className="h-full bg-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>

      {/* 3D Flip Card Container with decoupled cross-card transition */}
      <div className="w-full mb-6 min-h-[380px] sm:min-h-[420px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <Flashcard
              card={currentCard}
              language={currentDeck?.language || currentCard.language}
              isFlipped={isFlipped}
              onFlip={handleFlip}
              onSpeak={handleSpeak}
              isSpeaking={isSpeaking}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action Tray: 4-Level SuperMemo SM-2 Interval Buttons & Navigation */}
      <AnimatePresence mode="wait">
        {isFlipped ? (
          <motion.div
            key="rating-tray"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.14 }}
            className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 ${
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
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100/90 border border-rose-200/80 text-rose-700 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 mb-0.5">
                Again [1]
              </span>
              <span className="text-xs text-rose-800 font-medium">
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
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100/90 border border-amber-200/80 text-amber-800 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">
                Hard [2]
              </span>
              <span className="text-xs text-amber-900 font-medium">
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
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
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200/80 text-emerald-700 transition-all active:scale-98 shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">
                Easy [4]
              </span>
              <span className="text-xs text-emerald-900 font-medium">
                {previewIntervals.easy}
              </span>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="front-tray"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.14 }}
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
              className="flex-1 sm:flex-initial sm:w-64 py-3.5 px-6 rounded-2xl bg-neutral-900 hover:bg-black text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
            >
              <span>Show Answer</span>
              <span className="text-[11px] text-neutral-400 font-normal px-2 py-0.5 rounded-md bg-neutral-800">
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
                skipCard();
              }}
              title="Move this card to end of session queue"
              className="py-3.5 px-4 rounded-2xl bg-white hover:bg-neutral-100 border border-black/10 text-neutral-600 font-medium text-xs shadow-2xs transition-all flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
            >
              <span>Skip</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Progress Tracking Section */}
      <WeeklyReviewTracker currentStreak={currentStreak} refreshTrigger={reviewRefreshTrigger} userId={userId} />
    </div>
  );
};
