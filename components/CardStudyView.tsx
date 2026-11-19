'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Check,
  Layers,
  RefreshCw,
  BookOpen,
  ListOrdered,
  Shuffle,
  ArrowLeftRight,
  SkipForward,
} from 'lucide-react';
import { CardDirection, Flashcard as FlashcardType, Deck, SM2Rating } from '@/lib/types';
import { getPreviewIntervals, isCardDue, sortCardsSequentially } from '@/lib/srs';
import { speakWord, stopSpeaking, playHapticFeedback } from '@/lib/audio';

const WeeklyReviewTracker = dynamic(
  () => import('./WeeklyReviewTracker').then((mod) => mod.WeeklyReviewTracker),
  { ssr: false }
);
import { Flashcard } from './Flashcard';
import { EditCardModal } from './EditCardModal';
import { useStudySession } from '@/hooks/useStudySession';

interface CardStudyViewProps {
  cards: FlashcardType[];
  decks: Deck[];
  selectedDeckId: string | null;
  onSelectDeck: (deckId: string | null) => void;
  cardDirection?: CardDirection;
  onChangeCardDirection?: (direction: CardDirection) => void;
  onCardReviewed: (updatedCard: FlashcardType, rating: SM2Rating) => void;
  onUpdateCard?: (updatedCard: FlashcardType) => void;
  onDeleteCard?: (cardId: string) => void;
  onNavigateToImport: () => void;
  currentStreak?: number;
  userId?: string | null;
  isHydrated?: boolean;
  studyMode?: 'due' | 'sequential';
  onChangeStudyMode?: (mode: 'due' | 'sequential') => void;
}

export const CardStudyView: React.FC<CardStudyViewProps> = ({
  cards,
  decks,
  selectedDeckId,
  onSelectDeck,
  cardDirection,
  onChangeCardDirection,
  onCardReviewed,
  onUpdateCard,
  onDeleteCard,
  onNavigateToImport,
  currentStreak = 0,
  userId = null,
  isHydrated = true,
  studyMode: controlledStudyMode,
  onChangeStudyMode,
}) => {
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);
  const [speakingStepId, setSpeakingStepId] = useState<number | null>(null);
  const speakSeqRef = useRef(0);
  const [localStudyMode, setLocalStudyMode] = useState<'due' | 'sequential'>('due');
  const [justShuffled, setJustShuffled] = useState(false);
  const [localDirection, setLocalDirection] = useState<CardDirection>('target-first');
  const [editingCard, setEditingCard] = useState<FlashcardType | null>(null);

  const studyMode = controlledStudyMode ?? localStudyMode;
  const setStudyMode = useCallback(
    (next: 'due' | 'sequential' | ((prev: 'due' | 'sequential') => 'due' | 'sequential')) => {
      const resolved = typeof next === 'function' ? next(studyMode) : next;
      if (onChangeStudyMode) {
        onChangeStudyMode(resolved);
      } else {
        setLocalStudyMode(resolved);
      }
    },
    [onChangeStudyMode, studyMode]
  );

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

  // Re-initialize / restore persisted session queue per owner + deck + study mode
  const persistKey = `${userId ?? 'guest'}::${selectedDeckId ?? 'all'}::${studyMode}`;

  // Deterministic queue-based study manager (active card is ALWAYS queue[0], advances 1-by-1 & persists across reloads)
  const {
    queue,
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
    markAlreadyKnew,
    skipCard,
    shuffleQueue,
    updateCardInSession,
    removeCardFromSession,
    isProcessing,
    isComplete,
    stats,
    restartSession,
  } = useStudySession(initialSessionCards, {
    sessionKey: persistKey,
    persistKey,
    isHydrated,
    onCardReviewed: (updatedCard, rating) => {
      onCardReviewed(updatedCard, rating);
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

  const isSpeaking = speakingStepId === currentStepId;

  // Cancel any in-flight speech when advancing to a different card or leaving the study screen
  useEffect(() => {
    return () => {
      speakSeqRef.current += 1;
      stopSpeaking();
    };
  }, [currentStepId]);

  // Handle Audio Speech (never gets stuck; re-clicking restarts pronunciation immediately)
  const handleSpeak = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentCard) return;
      const seq = ++speakSeqRef.current;
      const stepAtStart = currentStepId;
      playHapticFeedback('tap');
      setSpeakingStepId(stepAtStart);
      try {
        const languageHint = currentDeck?.languageCode || currentDeck?.language || currentCard.language;
        await speakWord(currentCard.targetWord, languageHint, {
          languageName: currentDeck?.language || currentCard.language,
          fallbackText: currentCard.phonetic,
        });
      } finally {
        if (speakSeqRef.current === seq) {
          setSpeakingStepId((prev) => (prev === stepAtStart ? null : prev));
        }
      }
    },
    [currentCard, currentDeck, currentStepId]
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

  // Handle "Already Knew" -> schedules card 7 days ahead and advances 1 card cleanly
  const handleAlreadyKnew = useCallback(() => {
    if (!currentCard || isProcessing) return;
    const targetCardId = currentCard.id;
    const targetStepId = currentStepId;
    blurActiveElement();
    playHapticFeedback('rating');
    markAlreadyKnew(targetCardId, targetStepId);
  }, [currentCard, currentStepId, isProcessing, markAlreadyKnew]);

  // Handle Skip -> moves active card to the end of the session queue without changing its SRS schedule
  const handleSkip = useCallback(() => {
    if (!currentCard || isProcessing || cardsRemaining <= 1) return;
    const targetCardId = currentCard.id;
    const targetStepId = currentStepId;
    blurActiveElement();
    playHapticFeedback('tap');
    skipCard(targetCardId, targetStepId);
  }, [currentCard, currentStepId, isProcessing, cardsRemaining, skipCard]);

  // Handle Shuffle of current in-memory session queue (leaves SRS due dates & intervals untouched)
  const handleShuffle = useCallback(() => {
    if (cardsRemaining <= 1 || isProcessing) return;
    blurActiveElement();
    playHapticFeedback('tap');
    shuffleQueue();
    setJustShuffled(true);
    setTimeout(() => setJustShuffled(false), 1200);
  }, [cardsRemaining, isProcessing, shuffleQueue]);

  // Open edit modal for current card
  const handleOpenEdit = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentCard || isProcessing) return;
      blurActiveElement();
      playHapticFeedback('tap');
      setEditingCard(currentCard);
    },
    [currentCard, isProcessing]
  );

  // Delete active card directly from the review card header
  const handleDeleteCurrentCard = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!currentCard || !onDeleteCard || isProcessing) return;
      const targetCardId = currentCard.id;
      blurActiveElement();
      playHapticFeedback('fail');
      removeCardFromSession(targetCardId);
      onDeleteCard(targetCardId);
    },
    [currentCard, onDeleteCard, isProcessing, removeCardFromSession]
  );

  // Capture-phase keyboard listener prevents focused <button> elements from double-firing on Enter/Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Suspend all study shortcuts while editing modal is open
      if (editingCard) return;

      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isProcessing) return;

      if ((e.code === 'Space' || e.key === ' ') && currentCard) {
        e.preventDefault();
        e.stopPropagation();
        handleFlip();
      } else if ((e.key === 'Enter' || e.key === 'ArrowRight') && currentCard) {
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
      } else if (e.key.toLowerCase() === 'e' && currentCard) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenEdit();
      } else if (!isFlipped && e.key.toLowerCase() === 'k' && currentCard) {
        e.preventDefault();
        e.stopPropagation();
        handleAlreadyKnew();
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
    editingCard,
    handleFlip,
    handleSpeak,
    handleOpenEdit,
    handleAlreadyKnew,
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
  const renderCardOrderSelector = (idPrefix: string, fullWidth = false) => (
    <div
      role="group"
      aria-label="Card definition order"
      className={`${
        fullWidth ? 'grid grid-cols-2 w-full' : 'inline-flex items-center shrink-0'
      } p-0.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-xl border border-black/5 dark:border-white/10 text-xs font-medium`}
    >
      <button
        id={`${idPrefix}-word-first-btn`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleSelectDirection('target-first');
        }}
        title="Show foreign word & transliteration first, then English definition"
        className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
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
        className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-green-100/80 dark:bg-emerald-950/50 text-green-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
          All Caught Up!
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto mb-6 leading-relaxed">
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
                restartSession(orderedMatchingCards, { skipRestore: true });
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

        <div className="mt-8 text-left">
          <WeeklyReviewTracker
            currentStreak={currentStreak}
            refreshTrigger={reviewRefreshTrigger}
            userId={userId}
          />
        </div>
      </div>
    );
  }

  // ===================== SESSION COMPLETE SUMMARY =====================
  if (isComplete) {
    const {
      againCount,
      hardCount,
      goodCount,
      easyCount,
      alreadyKnewCount,
      cardsReviewed,
    } = stats;
    const total = cardsReviewed;
    const passedCount = goodCount + easyCount + alreadyKnewCount;
    const retentionRate = total > 0 ? Math.round((passedCount / total) * 100) : 100;

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white dark:bg-neutral-900 rounded-3xl p-6 sm:p-10 shadow-sm dark:shadow-2xl border border-black/5 dark:border-white/10 text-center"
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
              <span className="text-xs text-blue-700 dark:text-blue-400 block mb-1">Known / Good</span>
              <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{passedCount}</span>
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
              {easyCount + alreadyKnewCount > 0 && (
                <div
                  style={{ width: `${((easyCount + alreadyKnewCount) / total) * 100}%` }}
                  className="bg-emerald-500"
                  title={`Easy / Already Knew: ${easyCount + alreadyKnewCount}`}
                />
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5">
              <span>Again ({againCount})</span>
              <span>Hard ({hardCount})</span>
              <span>Good ({goodCount})</span>
              <span>Easy ({easyCount})</span>
              {alreadyKnewCount > 0 && <span>Knew ({alreadyKnewCount})</span>}
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
                restartSession(orderedMatchingCards, { skipRestore: true });
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

        <div className="mt-8">
          <WeeklyReviewTracker
            currentStreak={currentStreak}
            refreshTrigger={reviewRefreshTrigger}
            userId={userId}
          />
        </div>
      </div>
    );
  }

  // Guard: if no current card, render null
  if (!currentCard) {
    return null;
  }

  const upcomingCards = queue.slice(1, 5);
  const deckMasteredCount = orderedMatchingCards.filter((c) => c.state === 'mastered').length;

  // ===================== ACTIVE STUDY CARD =====================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
      {/* Compact 2-Row Mobile & Tablet Controls (hidden on desktop where sticky sidebar lives) */}
      <div className="lg:hidden space-y-2 mb-3.5">
        <div className="flex items-center justify-between gap-2">
          <select
            id="study-deck-select-mobile"
            aria-label="Select study deck"
            value={selectedDeckId || 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? null : e.target.value;
              onSelectDeck(val);
            }}
            className="flex-1 min-w-0 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 rounded-xl text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs truncate cursor-pointer"
          >
            <option value="all">All Decks ({cards.length})</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 font-medium tabular-nums whitespace-nowrap shrink-0">
            <span>
              {Math.min(completedCount + 1, totalSessionCards)} / {totalSessionCards}
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
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          {renderCardOrderSelector('study-order-mobile')}

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="shuffle-queue-btn-mobile"
              type="button"
              disabled={isProcessing || cardsRemaining <= 1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShuffle();
              }}
              title="Shuffle remaining cards in session"
              aria-label="Shuffle session"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border shadow-2xs transition-all select-none touch-manipulation whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${
                justShuffled
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              <Shuffle
                className={`w-3.5 h-3.5 ${justShuffled ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-500 dark:text-neutral-400'}`}
              />
              <span className="hidden sm:inline">{justShuffled ? 'Shuffled' : 'Shuffle'}</span>
            </button>

            {orderedMatchingCards.length > 0 && orderedDueCards.length < orderedMatchingCards.length && (
              <button
                type="button"
                onClick={() =>
                  setStudyMode((prev) => (prev === 'sequential' ? 'due' : 'sequential'))
                }
                title={
                  studyMode === 'sequential'
                    ? 'Showing all deck cards. Click for due cards only.'
                    : 'Showing due cards only. Click for all cards.'
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  studyMode === 'due'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>
                  {studyMode === 'sequential'
                    ? `All (${orderedMatchingCards.length})`
                    : `Due (${orderedDueCards.length})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Responsive Workspace: Spacious 8/4 Split on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Primary Study Stage */}
        <div className="lg:col-span-8 flex flex-col">
          {/* Queue Progress Bar */}
          <div className="w-full h-1.5 bg-neutral-200/80 dark:bg-neutral-800 rounded-full overflow-hidden mb-5">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>

          {/* 3D Flip Card Container — keyed by monotonic currentStepId with NO opacity wrapper around preserve-3d */}
          <div className="w-full mb-5">
            <Flashcard
              key={currentStepId}
              card={currentCard}
              stepId={currentStepId}
              language={currentDeck?.language || currentCard.language}
              cardDirection={activeDirection}
              isFlipped={isFlipped}
              onFlip={handleFlip}
              onSpeak={handleSpeak}
              onEdit={onUpdateCard ? handleOpenEdit : undefined}
              onDelete={onDeleteCard ? handleDeleteCurrentCard : undefined}
              isSpeaking={isSpeaking}
            />
          </div>

          {/* Action Tray: 4-Level SuperMemo SM-2 Interval Buttons & Navigation */}
          {isFlipped ? (
            <div
              className={`grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 tabular-nums ${
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
                className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100/90 dark:hover:bg-rose-900/50 border border-rose-200/80 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 transition-all active:scale-[0.98] shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
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
                className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100/90 dark:hover:bg-amber-900/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 transition-all active:scale-[0.98] shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
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
                className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white transition-all active:scale-[0.98] shadow-sm shadow-blue-500/25 group relative disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
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
                className="flex flex-col items-center justify-center p-3 sm:py-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 transition-all active:scale-[0.98] shadow-2xs group disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
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
              className={`flex items-center justify-center gap-2 sm:gap-3.5 ${
                isProcessing ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <button
                id="already-knew-front-btn"
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAlreadyKnew();
                }}
                title="Already knew this word — schedule review in 7 days [K]"
                className="py-3.5 px-3 sm:px-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs sm:text-sm shadow-2xs transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Already Knew</span>
                <span className="text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80 tabular-nums">
                  7d
                </span>
              </button>

              <button
                id="show-answer-btn"
                type="button"
                disabled={isProcessing}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFlip();
                }}
                className="flex-1 sm:flex-initial sm:min-w-[240px] py-3.5 px-4 sm:px-6 rounded-2xl bg-neutral-900 dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 font-semibold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap"
              >
                <span>
                  {activeDirection === 'definition-first' ? 'Show Translit' : 'Show Answer'}
                </span>
                <span className="hidden sm:inline text-[11px] text-neutral-400 dark:text-neutral-600 font-normal px-2 py-0.5 rounded-md bg-neutral-800 dark:bg-neutral-200">
                  Space
                </span>
              </button>

              <button
                id="skip-front-btn"
                type="button"
                disabled={isProcessing || cardsRemaining <= 1}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSkip();
                }}
                title="Skip to next card for now"
                className="py-3.5 px-3 sm:px-5 rounded-2xl bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-300 font-medium text-xs sm:text-sm shadow-2xs transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Skip</span>
                <SkipForward className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Desktop Sticky Session Control & Queue Panel */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-4 sticky top-20">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 shadow-2xs border border-black/5 dark:border-white/10 space-y-4">
            {/* Session Progress & State */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 block">
                  Session Progress
                </span>
                <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tabular-nums mt-0.5">
                  {Math.min(completedCount + 1, totalSessionCards)}{' '}
                  <span className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
                    / {totalSessionCards}
                  </span>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold capitalize ${
                  currentCard.state === 'new'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : currentCard.state === 'learning'
                    ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
                    : currentCard.state === 'mastered'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {currentCard.state}
              </span>
            </div>

            {/* Compact 3-Metric Strip */}
            <div className="grid grid-cols-3 divide-x divide-black/5 dark:divide-white/10 rounded-2xl bg-neutral-50 dark:bg-neutral-800/70 py-2.5 text-center tabular-nums">
              <div>
                <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 block">
                  {cardsRemaining}
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Left</span>
              </div>
              <div>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 block">
                  {completedCount}
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Done</span>
              </div>
              <div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block">
                  {deckMasteredCount}
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Mastered</span>
              </div>
            </div>

            {/* Active Deck Selector */}
            <div>
              <label
                htmlFor="study-deck-select"
                className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5"
              >
                Active Deck
              </label>
              <select
                id="study-deck-select"
                aria-label="Select study deck"
                value={selectedDeckId || 'all'}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? null : e.target.value;
                  onSelectDeck(val);
                }}
                className="w-full px-3 py-2 text-xs font-semibold bg-neutral-50 dark:bg-neutral-800 border border-black/10 dark:border-white/10 rounded-xl text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 truncate cursor-pointer"
              >
                <option value="all">All Decks ({cards.length})</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Card Face Direction */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1.5">
                Card Direction
              </span>
              {renderCardOrderSelector('study-order', true)}
            </div>

            {/* Queue Controls */}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                id="shuffle-queue-btn"
                type="button"
                disabled={isProcessing || cardsRemaining <= 1}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleShuffle();
                }}
                title="Shuffle remaining cards in session"
                aria-label="Shuffle session"
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all select-none whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${
                  justShuffled
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
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
                      ? 'Showing all deck cards. Click for due cards only.'
                      : 'Showing due cards only. Click for all cards.'
                  }
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    studyMode === 'due'
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {studyMode === 'sequential'
                      ? `All (${orderedMatchingCards.length})`
                      : `Due (${orderedDueCards.length})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Up Next Queue Preview */}
          {upcomingCards.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 shadow-2xs border border-black/5 dark:border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Up Next
                </span>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                  {cardsRemaining - 1} queued
                </span>
              </div>
              <ul className="divide-y divide-black/5 dark:divide-white/5">
                {upcomingCards.map((card, idx) => (
                  <li
                    key={`${card.id}-${idx}`}
                    className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {activeDirection === 'definition-first' ? card.english : card.targetWord}
                    </span>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 capitalize shrink-0">
                      {card.state}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* In-Review Flashcard Editor Modal */}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          deckTitle={currentDeck?.title}
          languageCode={currentDeck?.languageCode}
          onSave={(updated) => {
            updateCardInSession(updated);
            onUpdateCard?.(updated);
            setEditingCard(null);
          }}
          onDelete={
            onDeleteCard
              ? (cardId) => {
                  removeCardFromSession(cardId);
                  onDeleteCard(cardId);
                  setEditingCard(null);
                }
              : undefined
          }
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
};
