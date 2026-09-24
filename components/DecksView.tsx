'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  Trash2,
  Download,
  MoreHorizontal,
  ChevronRight,
  Flame,
  FileSpreadsheet,
} from 'lucide-react';
import { Deck, Flashcard } from '@/lib/types';
import { isCardDue } from '@/lib/srs';
import { playHapticFeedback } from '@/lib/audio';
import { WeeklyReviewTracker } from './WeeklyReviewTracker';

interface DecksViewProps {
  decks: Deck[];
  cards: Flashcard[];
  onSelectDeckToStudy: (deckId: string) => void;
  onNavigateToImport: () => void;
  onDeleteDeck: (deckId: string) => void;
  onInspectDeck: (deck: Deck) => void;
  currentStreak?: number;
  userId?: string | null;
}

export const DecksView: React.FC<DecksViewProps> = ({
  decks,
  cards,
  onSelectDeckToStudy,
  onNavigateToImport,
  onDeleteDeck,
  onInspectDeck,
  currentStreak = 0,
  userId = null,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const handleExportDeck = (deck: Deck) => {
    playHapticFeedback('tap');
    const deckCards = cards.filter((c) => c.deckId === deck.id);
    const tsvContent =
      'English\tTarget Word\tCategory\tPhonetic\n' +
      deckCards
        .map(
          (c) =>
            `${c.english}\t${c.targetWord}\t${c.category || ''}\t${c.phonetic || ''}`
        )
        .join('\n');

    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${deck.title.toLowerCase().replace(/\s+/g, '-')}-vocab.tsv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setActiveMenuId(null);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-1">
            Smart Language Decks
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500">
            Intelligently scheduled spaced repetition flashcard collections
          </p>
        </div>

        <button
          id="decks-import-table-btn"
          onClick={() => {
            playHapticFeedback('tap');
            onNavigateToImport();
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm shadow-blue-500/25 transition-all self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>New Deck from Table</span>
        </button>
      </div>

      {/* Decks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {decks.map((deck) => {
          const deckCards = cards.filter((c) => c.deckId === deck.id);
          const dueCards = deckCards.filter((c) => isCardDue(c));
          const masteredCount = deckCards.filter((c) => c.state === 'mastered').length;
          const learningCount = deckCards.filter((c) => c.state === 'learning').length;
          const reviewCount = deckCards.filter((c) => c.state === 'review').length;
          const newCount = deckCards.filter((c) => c.state === 'new').length;

          const masteredPercent =
            deckCards.length > 0 ? Math.round((masteredCount / deckCards.length) * 100) : 0;

          return (
            <div
              key={deck.id}
              className="group relative bg-white rounded-3xl p-5 shadow-xs hover:shadow-md border border-black/5 hover:border-black/10 transition-all flex flex-col justify-between"
            >
              {/* Top Row: Language & Menu */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                      {deck.language}
                    </span>
                    {dueCards.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200/50">
                        <Clock className="w-3 h-3" />
                        <span>{dueCards.length} due</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Done</span>
                      </span>
                    )}
                  </div>

                  {/* Options Menu Toggle */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveMenuId((prev) => (prev === deck.id ? null : deck.id))
                      }
                      aria-label="Deck options"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === deck.id && (
                      <div className="absolute right-0 top-9 z-20 w-44 rounded-2xl bg-white p-1.5 shadow-lg border border-black/5 text-xs text-neutral-700">
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onInspectDeck(deck);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 flex items-center gap-2"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Inspect Cards</span>
                        </button>
                        <button
                          onClick={() => handleExportDeck(deck)}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 flex items-center gap-2"
                        >
                          <Download className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Export Table (.tsv)</span>
                        </button>
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            if (confirm(`Delete deck "${deck.title}" and its ${deckCards.length} cards?`)) {
                              onDeleteDeck(deck.id);
                            }
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Deck</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deck Title & Description */}
                <h3
                  onClick={() => onInspectDeck(deck)}
                  className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight cursor-pointer hover:text-blue-600 transition-colors mb-1.5 line-clamp-1"
                >
                  {deck.title}
                </h3>
                <p className="text-xs text-neutral-500 line-clamp-2 mb-4 leading-relaxed">
                  {deck.description || 'Vocabulary spaced repetition collection.'}
                </p>
              </div>

              {/* Progress & Card State Segmented Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1.5">
                  <span className="font-semibold text-neutral-700">
                    {deckCards.length} Total Cards
                  </span>
                  <span>{masteredPercent}% Mastered</span>
                </div>

                {/* Mini Visual SRS Progress Bar */}
                <div className="h-2 w-full rounded-full bg-neutral-100 flex overflow-hidden mb-4">
                  {masteredCount > 0 && (
                    <div
                      style={{ width: `${(masteredCount / deckCards.length) * 100}%` }}
                      className="bg-emerald-500"
                      title={`Mastered: ${masteredCount}`}
                    />
                  )}
                  {reviewCount > 0 && (
                    <div
                      style={{ width: `${(reviewCount / deckCards.length) * 100}%` }}
                      className="bg-blue-500"
                      title={`Review: ${reviewCount}`}
                    />
                  )}
                  {learningCount > 0 && (
                    <div
                      style={{ width: `${(learningCount / deckCards.length) * 100}%` }}
                      className="bg-orange-500"
                      title={`Learning: ${learningCount}`}
                    />
                  )}
                  {newCount > 0 && (
                    <div
                      style={{ width: `${(newCount / deckCards.length) * 100}%` }}
                      className="bg-neutral-300"
                      title={`New: ${newCount}`}
                    />
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      playHapticFeedback('tap');
                      onSelectDeckToStudy(deck.id);
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-2xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                      dueCards.length > 0
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-neutral-900 hover:bg-black text-white'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{dueCards.length > 0 ? `Study (${dueCards.length})` : 'Practice'}</span>
                  </button>

                  <button
                    onClick={() => {
                      playHapticFeedback('tap');
                      onInspectDeck(deck);
                    }}
                    className="py-2.5 px-3 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium text-xs transition-colors"
                    title="View cards in table"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Deck Card Shortcut */}
        <div
          onClick={() => {
            playHapticFeedback('tap');
            onNavigateToImport();
          }}
          className="border-2 border-dashed border-neutral-300 hover:border-blue-400 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-blue-50/30 group min-h-[220px]"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-100 text-blue-600 flex items-center justify-center mb-3 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-neutral-800 mb-1 group-hover:text-blue-600 transition-colors">
            Import Another Table
          </h4>
          <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
            Paste rows with an English word and translation to generate a new smart deck.
          </p>
        </div>
      </div>

      {/* Dashboard Progress Chart Component */}
      <WeeklyReviewTracker currentStreak={currentStreak} userId={userId} />
    </div>
  );
};
