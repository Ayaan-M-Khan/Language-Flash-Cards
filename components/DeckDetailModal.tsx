'use client';

import React, { useState } from 'react';
import { X, Plus, Volume2, Trash2, Clock, CheckCircle2, Play, Sparkles } from 'lucide-react';
import { Deck, Flashcard } from '@/lib/types';
import { formatInterval, isCardDue, initializeCardSchedule } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';

interface DeckDetailModalProps {
  deck: Deck;
  cards: Flashcard[];
  onClose: () => void;
  onStudyDeck: (deckId: string) => void;
  onAddCardToDeck: (newCard: Flashcard) => void;
  onDeleteCard: (cardId: string) => void;
}

export const DeckDetailModal: React.FC<DeckDetailModalProps> = ({
  deck,
  cards,
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
        english: newEnglish.trim(),
        targetWord: newTarget.trim(),
        language: deck.language,
        category: newCategory.trim() || 'General',
      },
      `card-manual-${Date.now()}`
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
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-black/10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                {deck.language}
              </span>
              <span className="text-xs text-neutral-400">
                {cards.length} cards ({dueCount} due)
              </span>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
              {deck.title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onStudyDeck(deck.id);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Study</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
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
              className="p-4 rounded-2xl bg-neutral-50 border border-blue-200/80 mb-4 space-y-3"
            >
              <h4 className="text-xs font-bold text-neutral-700">Add New Word</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newEnglish}
                  onChange={(e) => setNewEnglish(e.target.value)}
                  placeholder="English meaning"
                  className="px-3 py-1.5 text-xs bg-white border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder={`Foreign word (${deck.language})`}
                  className="px-3 py-1.5 text-xs bg-white border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                  required
                />
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Category (e.g. Food)"
                  className="px-3 py-1.5 text-xs bg-white border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-neutral-600 hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-medium text-xs hover:bg-blue-700"
                >
                  Save Card
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-neutral-300 hover:border-blue-500 hover:bg-blue-50/20 text-xs font-semibold text-blue-600 flex items-center justify-center gap-1.5 transition-colors"
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
                  className="p-3.5 rounded-2xl bg-white border border-black/5 hover:border-black/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-neutral-900 truncate">
                        {card.targetWord}
                      </span>
                      <button
                        onClick={() => handleSpeak(card.targetWord)}
                        className="text-neutral-400 hover:text-blue-600 transition-colors shrink-0"
                        title="Pronounce"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      {card.phonetic && (
                        <span className="text-[11px] text-indigo-600/80 font-medium">
                          [{card.phonetic}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">{card.english}</p>
                    {card.exampleSentence?.target && (
                      <p className="text-[11px] text-neutral-400 italic mt-0.5 truncate">
                        &ldquo;{card.exampleSentence.target}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span
                        className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          card.state === 'mastered'
                            ? 'bg-emerald-100 text-emerald-700'
                            : isDue
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {isDue ? 'Due' : card.state}
                      </span>
                      <span className="block text-[10px] text-neutral-400 mt-0.5">
                        {formatInterval(card.intervalDays)}
                      </span>
                    </div>

                    <button
                      onClick={() => onDeleteCard(card.id)}
                      className="text-neutral-300 hover:text-rose-600 p-1 transition-colors"
                      title="Delete card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {cards.length === 0 && (
              <p className="text-center text-xs text-neutral-400 py-8">
                No cards in this deck yet. Click &ldquo;Add Single Flashcard&rdquo; above or import from a table.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-black/5 bg-neutral-50/50 rounded-b-3xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
