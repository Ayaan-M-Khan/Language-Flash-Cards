'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Volume2,
  Trash2,
  Play,
  ArrowLeftRight,
  Pencil,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CardDirection, Deck, Flashcard } from '@/lib/types';
import { formatInterval, isCardDue, initializeCardSchedule } from '@/lib/srs';
import { speakWord, stopSpeaking, playHapticFeedback } from '@/lib/audio';
import { EditCardModal } from './EditCardModal';

interface DeckDetailModalProps {
  deck: Deck;
  cards: Flashcard[];
  cardDirection?: CardDirection;
  onChangeCardDirection?: (direction: CardDirection) => void;
  onClose: () => void;
  onStudyDeck: (deckId: string, direction?: CardDirection) => void;
  onAddCardToDeck: (newCard: Flashcard) => void;
  onUpdateCard: (updatedCard: Flashcard) => void;
  onDeleteCard: (cardId: string) => void;
}

const isRtlScript = (text: string) =>
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

export const DeckDetailModal: React.FC<DeckDetailModalProps> = ({
  deck,
  cards,
  cardDirection = 'target-first',
  onChangeCardDirection,
  onClose,
  onStudyDeck,
  onAddCardToDeck,
  onUpdateCard,
  onDeleteCard,
}) => {
  const [newEnglish, setNewEnglish] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPhonetic, setNewPhonetic] = useState('');
  const [newPartOfSpeech, setNewPartOfSpeech] = useState('');
  const [newExampleTarget, setNewExampleTarget] = useState('');
  const [newExampleEnglish, setNewExampleEnglish] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showMoreAddFields, setShowMoreAddFields] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [speakingCardId, setSpeakingCardId] = useState<string | null>(null);
  const speakSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      speakSeqRef.current += 1;
      stopSpeaking();
    };
  }, []);

  const dueCount = useMemo(() => cards.filter((c) => isCardDue(c)).length, [cards]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.targetWord.toLowerCase().includes(q) ||
        c.english.toLowerCase().includes(q) ||
        (c.phonetic || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
    );
  }, [cards, searchQuery]);

  // Close Browse modal on Escape only when EditCardModal is not open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingCard) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCard, onClose]);

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnglish.trim() || !newTarget.trim()) return;

    playHapticFeedback('rating');
    const cleanExTarget = newExampleTarget.trim().slice(0, 500);
    const cleanExEnglish = newExampleEnglish.trim().slice(0, 500);

    const newCard = initializeCardSchedule(
      {
        deckId: deck.id,
        orderIndex: cards.length,
        english: newEnglish.trim().slice(0, 500),
        targetWord: newTarget.trim().slice(0, 500),
        language: deck.language,
        phonetic: newPhonetic.trim().slice(0, 200) || undefined,
        partOfSpeech: newPartOfSpeech.trim().slice(0, 50) || undefined,
        category: newCategory.trim().slice(0, 100) || 'General',
        notes: newNotes.trim().slice(0, 1000) || undefined,
        exampleSentence: cleanExTarget
          ? { target: cleanExTarget, english: cleanExEnglish }
          : undefined,
      },
      `card-manual-${Date.now()}-${String(cards.length).padStart(5, '0')}`,
      cards.length
    );

    onAddCardToDeck(newCard);
    setNewEnglish('');
    setNewTarget('');
    setNewCategory('');
    setNewPhonetic('');
    setNewPartOfSpeech('');
    setNewExampleTarget('');
    setNewExampleEnglish('');
    setNewNotes('');
    setShowMoreAddFields(false);
    setIsAdding(false);
  };

  const handleSpeak = async (card: Flashcard) => {
    const seq = ++speakSeqRef.current;
    playHapticFeedback('tap');
    setSpeakingCardId(card.id);
    try {
      await speakWord(card.targetWord, deck.languageCode || deck.language || card.language, {
        languageName: deck.language || card.language,
        fallbackText: card.phonetic,
      });
    } finally {
      if (speakSeqRef.current === seq) {
        setSpeakingCardId(null);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-detail-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#111114] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-zinc-200/80 dark:border-white/[0.08] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-white/[0.06] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1 text-xs tabular-nums">
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {deck.language}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                  ·
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{cards.length}</span>{' '}
                  {cards.length === 1 ? 'card' : 'cards'} ·{' '}
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{dueCount}</span> due
                </span>
              </div>
              <h2
                id="deck-detail-modal-title"
                className="text-lg sm:text-xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight truncate"
              >
                {deck.title}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                <div
                  role="group"
                  aria-label="Card definition order"
                  className="inline-flex items-center p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('tap');
                      onChangeCardDirection?.('target-first');
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      cardDirection === 'target-first'
                        ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    Word → Def
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('tap');
                      onChangeCardDirection?.('definition-first');
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      cardDirection === 'definition-first'
                        ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <ArrowLeftRight className="w-3 h-3 shrink-0" />
                    <span>Def → Translit</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStudyDeck(deck.id, cardDirection);
                  }}
                  className="h-8 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Study</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close deck browser"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex sm:hidden items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Card definition order"
              className="inline-flex items-center p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium shrink-0"
            >
              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  onChangeCardDirection?.('target-first');
                }}
                className={`px-2 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  cardDirection === 'target-first'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Word → Def
              </button>
              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  onChangeCardDirection?.('definition-first');
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  cardDirection === 'definition-first'
                    ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3 shrink-0" />
                <span>Def → Translit</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onStudyDeck(deck.id, cardDirection);
              }}
              className="h-8 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Study</span>
            </button>
          </div>
        </div>

        {/* Search Toolbar */}
        {cards.length > 0 && (
          <div className="px-5 pt-3.5 pb-1 flex items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search words, definitions, phonetics, or topics..."
                className="w-full h-9 pl-8 pr-8 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 border border-zinc-200/80 dark:border-white/[0.08] focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
              {filteredCards.length}/{cards.length}
            </span>
          </div>
        )}

        {/* Content Body: Card List */}
        <div className="flex-1 overflow-y-auto p-5 pt-3 space-y-3">
          {/* Quick Add Form */}
          {isAdding ? (
            <form
              onSubmit={handleAddCard}
              className="p-4 rounded-2xl bg-zinc-50/90 dark:bg-[#18181B] border border-blue-500/40 dark:border-blue-500/40 mb-3 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Add New Flashcard
                </h4>
                <button
                  type="button"
                  onClick={() => setShowMoreAddFields((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {showMoreAddFields ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      <span>Fewer fields</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      <span>Phonetic, example &amp; notes</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  dir={isRtlScript(newTarget) ? 'rtl' : 'ltr'}
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder={`Foreign word (${deck.language})`}
                  className={`px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 ${
                    isRtlScript(newTarget) ? 'text-right' : ''
                  }`}
                  required
                />
                <input
                  type="text"
                  value={newEnglish}
                  onChange={(e) => setNewEnglish(e.target.value)}
                  placeholder="English meaning"
                  className="px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  required
                />
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Topic / Category"
                  className="px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
              </div>

              {showMoreAddFields && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newPhonetic}
                      onChange={(e) => setNewPhonetic(e.target.value)}
                      placeholder="Transliteration / IPA (optional)"
                      className="px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                    <input
                      type="text"
                      value={newPartOfSpeech}
                      onChange={(e) => setNewPartOfSpeech(e.target.value)}
                      placeholder="Part of speech (e.g. noun, phrase)"
                      className="px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      dir={isRtlScript(newExampleTarget) ? 'rtl' : 'ltr'}
                      value={newExampleTarget}
                      onChange={(e) => setNewExampleTarget(e.target.value)}
                      placeholder={`Example in ${deck.language} (optional)`}
                      className={`px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 ${
                        isRtlScript(newExampleTarget) ? 'text-right' : ''
                      }`}
                    />
                    <input
                      type="text"
                      value={newExampleEnglish}
                      onChange={(e) => setNewExampleEnglish(e.target.value)}
                      placeholder="Example English translation"
                      className="px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Usage & memory notes (optional)"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-[#111114] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="h-8 px-3 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-3.5 rounded-xl bg-blue-600 text-white font-medium text-xs hover:bg-blue-700 cursor-pointer transition-colors"
                >
                  Save Card
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full h-10 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-white/[0.14] hover:border-blue-500/70 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Single Flashcard</span>
            </button>
          )}

          {/* Cards List */}
          <div className="space-y-2">
            {filteredCards.map((card) => {
              const isDue = isCardDue(card);
              const targetRtl = isRtlScript(card.targetWord);

              return (
                <div
                  key={card.id}
                  className="p-3.5 rounded-xl bg-zinc-50/70 dark:bg-[#18181B]/75 border border-zinc-200/70 dark:border-white/[0.07] hover:border-zinc-300/90 dark:hover:border-white/[0.14] flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                      <span
                        dir={targetRtl ? 'rtl' : 'ltr'}
                        className="font-semibold text-sm text-zinc-950 dark:text-zinc-50 break-words"
                      >
                        {card.targetWord}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSpeak(card)}
                        className={`transition-colors shrink-0 cursor-pointer ${
                          speakingCardId === card.id
                            ? 'text-blue-600 dark:text-blue-400 scale-110'
                            : 'text-zinc-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                        title="Pronounce"
                        aria-label={`Pronounce ${card.targetWord}`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      {card.phonetic && (
                        <span className="text-[11px] text-blue-600/85 dark:text-blue-400 font-medium break-words">
                          [{card.phonetic}]
                        </span>
                      )}
                      {card.partOfSpeech && (
                        <span className="text-[11px] italic text-zinc-400 dark:text-zinc-500">
                          {card.partOfSpeech}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 break-words">
                      {card.english}
                    </p>

                    {card.exampleSentence?.target && (
                      <p
                        dir={isRtlScript(card.exampleSentence.target) ? 'rtl' : 'ltr'}
                        className="text-[11px] text-zinc-400 dark:text-zinc-500 italic mt-0.5 truncate"
                      >
                        &ldquo;{card.exampleSentence.target}&rdquo;
                      </p>
                    )}

                    {card.notes && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                        Note: {card.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="text-right tabular-nums pr-1.5">
                      <span
                        className={`block text-[11px] font-medium capitalize ${
                          card.state === 'mastered'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isDue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {isDue ? 'Due' : card.state}
                      </span>
                      <span className="block text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {formatInterval(card.intervalDays)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        playHapticFeedback('tap');
                        setEditingCard(card);
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                      title="Edit card"
                      aria-label={`Edit ${card.targetWord}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteCard(card.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Delete card"
                      aria-label={`Delete ${card.targetWord}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {cards.length === 0 && (
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-8">
                No cards in this deck yet. Click &ldquo;Add Single Flashcard&rdquo; above or import from a table.
              </p>
            )}

            {cards.length > 0 && filteredCards.length === 0 && (
              <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-8">
                No cards match &ldquo;{searchQuery}&rdquo;.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-[#18181B]/70 rounded-b-2xl flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
            Click the edit icon on any card to update text, phonetics, examples, or notes.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-8 px-4 rounded-xl bg-zinc-200/80 dark:bg-white/[0.08] hover:bg-zinc-300/80 dark:hover:bg-white/[0.12] text-zinc-800 dark:text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Nested Edit Card Modal */}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          deckTitle={deck.title}
          languageCode={deck.languageCode}
          onSave={(updated) => {
            onUpdateCard(updated);
            setEditingCard(null);
          }}
          onDelete={(cardId) => {
            onDeleteCard(cardId);
            setEditingCard(null);
          }}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
};
