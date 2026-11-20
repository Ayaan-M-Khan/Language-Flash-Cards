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
      } p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium`}
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
            ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
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
            ? 'bg-blue-600 text-white shadow-2xs font-semibold'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
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
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/60 dark:border-emerald-800/40">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mb-2">
          All caught up
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto mb-6 leading-relaxed">
          {totalDeckCards > 0
            ? 'You have reviewed all cards due for optimal retention today. Pick a deck and card order below to practice anytime.'
            : 'You don’t have any flashcards in this deck yet. Import a table of vocabulary words to generate smart decks instantly.'}
        </p>

        {/* Deck filter buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => onSelectDeck(null)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedDeckId === null
                ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950'
                : 'bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08]'
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
                type="button"
                onClick={() => onSelectDeck(deck.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  selectedDeckId === deck.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08]'
                }`}
              >
                <span>{deck.title}</span>
                <span className="text-[11px] opacity-75 font-mono">
                  ({count}
                  {due > 0 ? ` · ${due} due` : ''})
                </span>
              </button>
            );
          })}
        </div>

        {/* Card Order Picker when choosing deck */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Card order</span>
          {renderCardOrderSelector('empty-order')}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          {totalDeckCards > 0 && (
            <button
              id="empty-practice-anyway-btn"
              type="button"
              onClick={() => {
                setStudyMode('sequential');
                restartSession(orderedMatchingCards, { skipRestore: true });
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-sm hover:bg-zinc-800 dark:hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              <span>Practice all in order ({totalDeckCards})</span>
            </button>
          )}
          <button
            id="empty-import-table-btn"
            type="button"
            onClick={onNavigateToImport}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Import vocabulary table</span>
          </button>
          <button
            id="empty-preview-deck-btn"
            type="button"
            onClick={() => onSelectDeck(null)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 font-medium text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
            <span>View all decks</span>
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
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-[#111114] rounded-2xl p-6 sm:p-10 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_32px_-16px_rgba(15,23,42,0.08)] border border-zinc-200/80 dark:border-white/[0.08] text-center"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/50 dark:border-blue-800/40">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mb-1">
            Session complete
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
            Memory consolidation updated for {currentDeck?.title || 'Selected Deck'}
          </p>

          {/* Hairline-divided Retention Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100 dark:divide-white/[0.06] border-y border-zinc-100 dark:border-white/[0.06] py-4 mb-6 tabular-nums">
            <div className="px-3 py-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Reviewed</span>
              <span className="text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50">{total}</span>
            </div>
            <div className="px-3 py-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Retention</span>
              <span className="text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400">{retentionRate}%</span>
            </div>
            <div className="px-3 py-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Known / Good</span>
              <span className="text-xl font-semibold font-mono text-blue-600 dark:text-blue-400">{passedCount}</span>
            </div>
            <div className="px-3 py-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">Repeat</span>
              <span className="text-xl font-semibold font-mono text-amber-600 dark:text-amber-400">{againCount}</span>
            </div>
          </div>

          {/* Rating distribution bar */}
          <div className="mb-6 text-left tabular-nums">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">
              Performance breakdown
            </span>
            <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-white/[0.06] flex overflow-hidden">
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
                  className="bg-blue-600"
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
            <div className="flex flex-wrap justify-between gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-2">
              <span>Again ({againCount})</span>
              <span>Hard ({hardCount})</span>
              <span>Good ({goodCount})</span>
              <span>Easy ({easyCount})</span>
              {alreadyKnewCount > 0 && <span>Knew ({alreadyKnewCount})</span>}
            </div>
          </div>

          {/* Card Order Selector before restarting */}
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Next pass order</span>
            {renderCardOrderSelector('complete-order')}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              id="study-again-btn"
              type="button"
              onClick={() => {
                setStudyMode('sequential');
                restartSession(orderedMatchingCards, { skipRestore: true });
              }}
              className="flex-1 h-11 px-4 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-sm hover:bg-zinc-800 dark:hover:bg-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Review all again</span>
            </button>
            <button
              id="study-import-more-btn"
              type="button"
              onClick={onNavigateToImport}
              className="flex-1 h-11 px-4 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Add more words</span>
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Compact 2-Row Mobile & Tablet Controls (hidden on desktop where sticky sidebar lives) */}
      <div className="lg:hidden space-y-2.5 mb-4">
        <div className="flex items-center justify-between gap-2.5">
          <select
            id="study-deck-select-mobile"
            aria-label="Select study deck"
            value={selectedDeckId || 'all'}
            onChange={(e) => {
              const val = e.target.value === 'all' ? null : e.target.value;
              onSelectDeck(val);
            }}
            className="flex-1 min-w-0 h-9 px-3 text-xs font-medium bg-white dark:bg-[#111114] border border-zinc-200/80 dark:border-white/[0.08] rounded-xl text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 truncate cursor-pointer"
          >
            <option value="all">All Decks ({cards.length})</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium font-mono tabular-nums whitespace-nowrap shrink-0">
            <span>
              {Math.min(completedCount + 1, totalSessionCards)}/{totalSessionCards}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
              ·
            </span>
            <span
              className={`font-sans font-semibold capitalize ${
                currentCard.state === 'new'
                  ? 'text-blue-600 dark:text-blue-400'
                  : currentCard.state === 'learning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : currentCard.state === 'mastered'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-zinc-700 dark:text-zinc-300'
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
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium border transition-all select-none touch-manipulation whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${
                justShuffled
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                  : 'bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.05]'
              }`}
            >
              <Shuffle
                className={`w-3.5 h-3.5 ${justShuffled ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'}`}
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
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono ${
                  studyMode === 'due'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60'
                    : 'bg-white dark:bg-[#111114] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.05]'
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
          {/* Precision Progress Rail */}
          <div className="w-full h-1 bg-zinc-200/80 dark:bg-white/[0.08] rounded-full overflow-hidden mb-5">
            <motion.div
              className="h-full bg-blue-600 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>

          {/* 3D Flip Card Container */}
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

          {/* Action Tray: 4-Level SuperMemo SM-2 Interval Buttons & Front Controls */}
          {isFlipped ? (
            <div
              className={`grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 tabular-nums ${
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
                className="flex flex-col items-center justify-center py-3 px-3 rounded-xl bg-white dark:bg-[#111114] hover:bg-rose-50/90 dark:hover:bg-rose-950/35 border border-zinc-200/80 dark:border-white/[0.08] hover:border-rose-300 dark:hover:border-rose-800/70 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
              >
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Again <span className="font-mono text-[10px] opacity-65 ml-0.5">[1]</span>
                </span>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
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
                className="flex flex-col items-center justify-center py-3 px-3 rounded-xl bg-white dark:bg-[#111114] hover:bg-amber-50/90 dark:hover:bg-amber-950/35 border border-zinc-200/80 dark:border-white/[0.08] hover:border-amber-300 dark:hover:border-amber-800/70 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
              >
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Hard <span className="font-mono text-[10px] opacity-65 ml-0.5">[2]</span>
                </span>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
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
                className="flex flex-col items-center justify-center py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 border border-blue-600 text-white transition-all active:scale-[0.98] shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
              >
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
                  Good <span className="font-mono text-[10px] text-blue-100 ml-0.5">[3]</span>
                  <ChevronRight className="w-3.5 h-3.5 text-blue-200" />
                </span>
                <span className="text-[11px] font-mono text-blue-50 mt-0.5">
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
                className="flex flex-col items-center justify-center py-3 px-3 rounded-xl bg-white dark:bg-[#111114] hover:bg-emerald-50/90 dark:hover:bg-emerald-950/35 border border-zinc-200/80 dark:border-white/[0.08] hover:border-emerald-300 dark:hover:border-emerald-800/70 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer"
              >
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Easy <span className="font-mono text-[10px] opacity-65 ml-0.5">[4]</span>
                </span>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {previewIntervals.easy}
                </span>
              </button>
            </div>
          ) : (
            <div
              className={`flex items-center justify-center gap-2.5 sm:gap-3 ${
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
                className="h-11 px-3.5 sm:px-4 rounded-xl bg-white dark:bg-[#111114] hover:bg-emerald-50/80 dark:hover:bg-emerald-950/35 border border-zinc-200/90 dark:border-white/[0.09] hover:border-emerald-300 dark:hover:border-emerald-800/70 text-emerald-700 dark:text-emerald-400 font-medium text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Already Knew</span>
                <span className="font-mono text-[11px] text-emerald-600/75 dark:text-emerald-400/75 tabular-nums">
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
                className="flex-1 sm:flex-initial sm:min-w-[230px] h-11 px-4 sm:px-6 rounded-xl bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-semibold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap"
              >
                <span>
                  {activeDirection === 'definition-first' ? 'Show Translit' : 'Show Answer'}
                </span>
                <kbd className="hidden sm:inline font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal px-1.5 py-0.5 rounded-md bg-white/10 dark:bg-black/10">
                  Space
                </kbd>
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
                className="h-11 px-3.5 sm:px-4 rounded-xl bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-white/[0.05] border border-zinc-200/90 dark:border-white/[0.09] text-zinc-600 dark:text-zinc-300 font-medium text-xs sm:text-sm transition-all inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Skip</span>
                <SkipForward className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Unified Single-Card Sticky Session Sidebar */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-[4.75rem]">
          <div className="bg-white dark:bg-[#111114] rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {/* Section 1: Progress & Metrics */}
            <div className="p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block">
                    Session progress
                  </span>
                  <div className="text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                    {Math.min(completedCount + 1, totalSessionCards)}
                    <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500 ml-1">
                      / {totalSessionCards}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium capitalize ${
                    currentCard.state === 'new'
                      ? 'text-blue-600 dark:text-blue-400'
                      : currentCard.state === 'learning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : currentCard.state === 'mastered'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {currentCard.state}
                </span>
              </div>

              {/* Clean Hairline-Divided 3-Metric Row (no nested boxes) */}
              <div className="grid grid-cols-3 divide-x divide-zinc-100 dark:divide-white/[0.06] pt-3 border-t border-zinc-100 dark:border-white/[0.06] text-center tabular-nums">
                <div>
                  <span className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100 block">
                    {cardsRemaining}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Left</span>
                </div>
                <div>
                  <span className="text-sm font-semibold font-mono text-blue-600 dark:text-blue-400 block">
                    {completedCount}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Done</span>
                </div>
                <div>
                  <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400 block">
                    {deckMasteredCount}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Mastered</span>
                </div>
              </div>
            </div>

            {/* Section 2: Deck, Direction & Queue Controls */}
            <div className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="study-deck-select"
                  className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5"
                >
                  Active deck
                </label>
                <select
                  id="study-deck-select"
                  aria-label="Select study deck"
                  value={selectedDeckId || 'all'}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? null : e.target.value;
                    onSelectDeck(val);
                  }}
                  className="w-full h-9 px-3 text-xs font-medium bg-zinc-50/90 dark:bg-[#18181B] border border-zinc-200/80 dark:border-white/[0.08] rounded-xl text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 truncate cursor-pointer"
                >
                  <option value="all">All Decks ({cards.length})</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Card direction
                </span>
                {renderCardOrderSelector('study-order', true)}
              </div>

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
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-all select-none whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] ${
                    justShuffled
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                      : 'bg-zinc-50/80 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <Shuffle
                    className={`w-3.5 h-3.5 ${justShuffled ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'}`}
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
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer font-mono ${
                      studyMode === 'due'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60'
                        : 'bg-zinc-50/80 dark:bg-[#18181B] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
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

            {/* Section 3: Up Next Queue Preview */}
            {upcomingCards.length > 0 && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Up next
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
                    {cardsRemaining - 1} queued
                  </span>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                  {upcomingCards.map((card, idx) => (
                    <li
                      key={`${card.id}-${idx}`}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {activeDirection === 'definition-first' ? card.english : card.targetWord}
                      </span>
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 capitalize shrink-0">
                        {card.state}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
