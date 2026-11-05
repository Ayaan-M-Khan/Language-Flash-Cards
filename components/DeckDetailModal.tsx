'use client';

import React, { useState } from 'react';
import { X, Plus, Volume2, Trash2, Play, ArrowLeftRight } from 'lucide-react';
import { CardDirection, Deck, Flashcard } from '@/lib/types';
import { formatInterval, isCardDue, initializeCardSchedule } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';

interface DeckDetailModalProps {
  deck: Deck;
  cards: Flashcard[];
  cardDirection?: CardDirection;
  onChangeCardDirection?: (direction: CardDirection) => void;
  onClose: () => void;
  onStudyDeck: (deckId: string, direction?: CardDirection) => void;
  onAddCardToDeck: (newCard: Flashcard) => void;
  onDeleteCard: (cardId: string) => void;
}

export const DeckDetailModal: React.FC<DeckDetailModalProps> = ({
  deck,
  cards,
  cardDirection = 'target-first',
  onChangeCardDirection,
  onClose,
  onStudyDeck,
  onAddCardToDeck,
  onDeleteCard,
}) => {
  const [newEnglish, setNewEnglish] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const dueCount = cards.filter((c) => isCardDue(c)).length;

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnglish.trim() || !newTarget.trim()) return;

    playHapticFeedback('rating');
    const newCard = initializeCardSchedule(
      {
        deckId: deck.id,
        orderIndex: cards.length,
        english: newEnglish.trim(),
        targetWord: newTarget.trim(),
        language: deck.language,
        category: newCategory.trim() || 'General',
      },
      `card-manual-${Date.now()}-${String(cards.length).padStart(5, '0')}`,
      cards.length
    );

    onAddCardToDeck(newCard);
    setNewEnglish('');
    setNewTarget('');
    setNewCategory('');
    setIsAdding(false);
  };

  const handleSpeak = (word: string) => {
    playHapticFeedback('tap');
    speakWord(word, deck.languageCode);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-black/10 dark:border-white/10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-black/5 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs tabular-nums">
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {deck.language}
              </span>
              <span className="text-neutral-300 dark:text-neutral-600" aria-hidden="true">·</span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {cards.length} cards ({dueCount} due)
              </span>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
              {deck.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Card Definition Order Toggle when picking deck from Modal */}
            <div
              role="group"
              aria-label="Card definition order"
              className="inline-flex items-center p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200/80 dark:border-neutral-700 text-xs font-medium shrink-0"
            >
              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  onChangeCardDirection?.('target-first');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  cardDirection === 'target-first'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100'
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
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3 shrink-0" />
                <span>Def → Translit</span>
              </button>
            </div>

            <button
              onClick={() => {
                onClose();
                onStudyDeck(deck.id, cardDirection);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Study</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Card List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Quick Add Form */}
          {isAdding ? (
            <form
              onSubmit={handleAddCard}
              className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800 border border-blue-200/80 dark:border-blue-700/80 mb-4 space-y-3"
            >
              <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-200">Add New Word</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newEnglish}
                  onChange={(e) => setNewEnglish(e.target.value)}
                  placeholder="English meaning"
                  className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  required
                />
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder={`Foreign word (${deck.language})`}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  required
                />
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category (e.g. Food)"
                  className="px-3 py-1.5 text-xs bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-medium text-xs hover:bg-blue-700 cursor-pointer"
                >
                  Save Card
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Single Flashcard</span>
            </button>
          )}

          {/* Cards List */}
          <div className="space-y-2">
            {cards.map((card) => {
              const isDue = isCardDue(card);
              return (
                <div
                  key={card.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-neutral-850 border border-black/5 dark:border-white/10 hover:border-black/10 dark:hover:border-white/20 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                        {card.targetWord}
                      </span>
                      <button
                        onClick={() => handleSpeak(card.targetWord)}
                        className="text-neutral-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0 cursor-pointer"
                        title="Pronounce"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      {card.phonetic && (
                        <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400 font-medium">
                          [{card.phonetic}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{card.english}</p>
                    {card.exampleSentence?.target && (
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 italic mt-0.5 truncate">
                        &ldquo;{card.exampleSentence.target}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span
                        className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          card.state === 'mastered'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : isDue
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {isDue ? 'Due' : card.state}
                      </span>
                      <span className="block text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                        {formatInterval(card.intervalDays)}
                      </span>
                    </div>

                    <button
                      onClick={() => onDeleteCard(card.id)}
                      className="text-neutral-300 dark:text-neutral-600 hover:text-rose-600 dark:hover:text-rose-400 p-1 transition-colors cursor-pointer"
                      title="Delete card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {cards.length === 0 && (
              <p className="text-center text-xs text-neutral-400 dark:text-neutral-500 py-8">
                No cards in this deck yet. Click &ldquo;Add Single Flashcard&rdquo; above or import from a table.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-black/5 dark:border-white/10 bg-neutral-50/50 dark:bg-neutral-850/50 rounded-b-3xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
