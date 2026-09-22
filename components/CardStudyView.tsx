'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  RotateCw,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Layers,
  ArrowRight,
  RefreshCw,
  Clock,
  BookOpen,
} from 'lucide-react';
import { Flashcard as FlashcardType, Deck, SM2Rating, CardState } from '@/lib/types';
import { calculateSM2, getPreviewIntervals, isCardDue } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';
import { WeeklyReviewTracker } from './WeeklyReviewTracker';
import { incrementTodayReviewCount } from '@/lib/review-history';
import { Flashcard } from './Flashcard';

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
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);
  const [sessionReviews, setSessionReviews] = useState<{
    cardId: string;
    rating: SM2Rating;
  }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isAdvancingRef = useRef(false);

  // Filter study queue based on selected deck and due status
  const queueCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesDeck = !selectedDeckId || card.deckId === selectedDeckId;
      return matchesDeck && isCardDue(card);
    });
  }, [cards, selectedDeckId]);

  // Current active card
  const currentCard: FlashcardType | undefined = queueCards[sessionIndex];

  // Associated deck for current card
  const currentDeck = useMemo(() => {
    if (!currentCard) return undefined;
    return decks.find((d) => d.id === currentCard.deckId);
  }, [currentCard, decks]);

  // Handle Flip
  const handleFlip = useCallback(() => {
    if (isAdvancingRef.current) return;
    playHapticFeedback('flip');
    setIsFlipped((prev) => !prev);
  }, []);

  // Handle Audio Speech
  const handleSpeak = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentCard) return;
      playHapticFeedback('tap');
      setIsSpeaking(true);
      const code = currentDeck?.languageCode || currentCard.language || 'es-ES';
      await speakWord(currentCard.targetWord, code);
      setIsSpeaking(false);
    },
    [currentCard, currentDeck]
  );

  // Handle User Evaluation (Again, Hard, Good, Easy)
  const handleRating = useCallback(
    (rating: SM2Rating) => {
      if (!currentCard || isAdvancingRef.current) return;

      if (rating === 'again') {
        playHapticFeedback('fail');
      } else {
        playHapticFeedback('rating');
      }

      const sm2 = calculateSM2(currentCard, rating);
      const updatedCard: FlashcardType = {
        ...currentCard,
        repetitions: sm2.repetitions,
        intervalDays: sm2.intervalDays,
        easeFactor: sm2.easeFactor,
        state: sm2.state,
        dueDate: sm2.dueDate,
        lastReviewedAt: new Date().toISOString(),
      };

      onCardReviewed(updatedCard, rating);
      setSessionReviews((prev) => [...prev, { cardId: currentCard.id, rating }]);

      // Log review to local weekly review consistency tracker
      incrementTodayReviewCount(userId);
      setReviewRefreshTrigger((v) => v + 1);

      // Immediately reset flipped state and advance card without delay or visible un-flip
      isAdvancingRef.current = true;
      setIsFlipped(false);
      setSessionIndex((prev) => prev + 1);
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 150);
    },
    [currentCard, onCardReviewed, userId]
  );

  // Keyboard shortcut listeners (Space = flip, 1-4 = ratings, S = speak)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in input fields
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (isAdvancingRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
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
  }, [handleFlip, handleSpeak, handleRating, isFlipped, currentCard]);

  // Check if session completed
  const isSessionComplete = queueCards.length > 0 && sessionIndex >= queueCards.length;

  // Trigger celebration on completion
  useEffect(() => {
    if (isSessionComplete && sessionReviews.length > 0) {
      playHapticFeedback('celebrate');
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#007AFF', '#5856D6', '#34C759', '#FF9500', '#FF2D55'],
        });
      } catch {
        // Safe fallback
      }
    }
  }, [isSessionComplete, sessionReviews.length]);

  // Restart session
  const restartSession = () => {
    playHapticFeedback('tap');
    setSessionIndex(0);
    setSessionReviews([]);
    setIsFlipped(false);
  };

  // Preview intervals for current card ratings
  const previewIntervals = useMemo(() => {
    if (!currentCard) return { again: '10m', hard: '1d', good: '3d', easy: '7d' };
    return getPreviewIntervals(currentCard);
  }, [currentCard]);

  // ===================== ZERO DUE CARDS EMPTY STATE =====================
  if (queueCards.length === 0) {
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
          <button
            id="empty-import-table-btn"
            onClick={onNavigateToImport}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-sm shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Import Vocabulary Table</span>
          </button>
          <button
            id="empty-preview-deck-btn"
            onClick={() => onSelectDeck(null)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-white text-neutral-700 font-medium text-sm hover:bg-neutral-100 border border-black/10 transition-all flex items-center justify-center gap-2"
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
  if (isSessionComplete) {
    const againCount = sessionReviews.filter((r) => r.rating === 'again').length;
    const hardCount = sessionReviews.filter((r) => r.rating === 'hard').length;
    const goodCount = sessionReviews.filter((r) => r.rating === 'good').length;
    const easyCount = sessionReviews.filter((r) => r.rating === 'easy').length;
    const total = sessionReviews.length;
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
              onClick={restartSession}
              className="flex-1 py-3 px-4 rounded-2xl bg-neutral-900 text-white font-medium text-sm hover:bg-black transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Review Again</span>
            </button>
            <button
              id="study-import-more-btn"
              onClick={onNavigateToImport}
              className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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

  // ===================== ACTIVE STUDY CARD =====================
  const progressPercent = Math.round((sessionIndex / queueCards.length) * 100);

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 sm:py-8">
      {/* Top Header: Deck selection & Progress */}
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Deck Chip Dropdown / Info */}
        <div className="flex items-center gap-2">
          <select
            id="study-deck-select"
            value={selectedDeckId || 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? null : e.target.value;
              onSelectDeck(val);
              setSessionIndex(0);
              setIsFlipped(false);
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

        {/* Counter Badge */}
        <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>
            {sessionIndex + 1} of {queueCards.length}
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

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-neutral-200/80 rounded-full overflow-hidden mb-6">
        <motion.div
          className="h-full bg-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>

      {/* 3D Flip Card Container with key remounting and clean exit transition */}
      <div className="perspective-1000 w-full mb-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentCard.id || sessionIndex}
            initial={{ opacity: 0, y: 6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="w-full"
          >
            <Flashcard
              key={currentCard.id || sessionIndex}
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

      {/* Action Tray: 4-Level SuperMemo SM-2 Interval Buttons */}
      <AnimatePresence>
        {isFlipped ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
          >
            {/* AGAIN BUTTON */}
            <button
              id="rating-again-btn"
              onClick={() => handleRating('again')}
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100/90 border border-rose-200/80 text-rose-700 transition-all active:scale-98 shadow-2xs group"
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
              onClick={() => handleRating('hard')}
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100/90 border border-amber-200/80 text-amber-800 transition-all active:scale-98 shadow-2xs group"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">
                Hard [2]
              </span>
              <span className="text-xs text-amber-900 font-medium">
                {previewIntervals.hard}
              </span>
            </button>

            {/* GOOD BUTTON */}
            <button
              id="rating-good-btn"
              onClick={() => handleRating('good')}
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100/90 border border-blue-200/80 text-blue-700 transition-all active:scale-98 shadow-2xs group"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-0.5">
                Good [3]
              </span>
              <span className="text-xs text-blue-900 font-medium">
                {previewIntervals.good}
              </span>
            </button>

            {/* EASY BUTTON */}
            <button
              id="rating-easy-btn"
              onClick={() => handleRating('easy')}
              className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200/80 text-emerald-700 transition-all active:scale-98 shadow-2xs group"
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
          <div className="flex items-center justify-center gap-3">
            <button
              id="show-answer-btn"
              onClick={handleFlip}
              className="w-full sm:w-80 py-3.5 px-6 rounded-2xl bg-neutral-900 hover:bg-black text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              <span>Show Answer</span>
              <span className="text-[11px] text-neutral-400 font-normal px-2 py-0.5 rounded-md bg-neutral-800">
                Space
              </span>
            </button>
          </div>
        )}
      </AnimatePresence>

      {/* Visual Progress Tracking Section */}
      <WeeklyReviewTracker currentStreak={currentStreak} refreshTrigger={reviewRefreshTrigger} userId={userId} />
    </div>
  );
};
