'use client';

import React, { useState, useMemo } from 'react';
import {
  Volume2,
  Search,
  Sparkles,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Flashcard, Deck } from '@/lib/types';
import { formatInterval, isCardDue } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';
import { EditCardModal } from './EditCardModal';

interface ScheduleInspectorProps {
  cards: Flashcard[];
  decks: Deck[];
  onResetCardSchedule: (cardId: string) => void;
  onMakeCardDueToday: (cardId: string) => void;
  onUpdateCard?: (updatedCard: Flashcard) => void;
  onDeleteCard?: (cardId: string) => void;
  onNavigateToStudy: (deckId?: string) => void;
}

export const ScheduleInspector: React.FC<ScheduleInspectorProps> = ({
  cards,
  decks,
  onResetCardSchedule,
  onMakeCardDueToday,
  onUpdateCard,
  onDeleteCard,
  onNavigateToStudy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeckFilter, setSelectedDeckFilter] = useState<string>('all');
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('all');
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  // Compute Spaced Repetition Timeline Buckets
  const timeline = useMemo(() => {
    const now = new Date();
    const today = cards.filter((c) => isCardDue(c, now));
    const tomorrow = cards.filter((c) => {
      if (isCardDue(c, now)) return false;
      const diffHours = (new Date(c.dueDate).getTime() - now.getTime()) / (1000 * 3600);
      return diffHours > 0 && diffHours <= 36;
    });
    const upcoming2to4 = cards.filter((c) => {
      const diffDays = (new Date(c.dueDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diffDays > 1.5 && diffDays <= 4;
    });
    const nextWeek = cards.filter((c) => {
      const diffDays = (new Date(c.dueDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diffDays > 4 && diffDays <= 14;
    });
    const longTerm = cards.filter((c) => {
      const diffDays = (new Date(c.dueDate).getTime() - now.getTime()) / (1000 * 3600 * 24);
      return diffDays > 14;
    });

    return { today, tomorrow, upcoming2to4, nextWeek, longTerm };
  }, [cards]);

  // Overall metrics
  const avgEase = useMemo(() => {
    if (cards.length === 0) return 2.5;
    const sum = cards.reduce((acc, c) => acc + (c.easeFactor || 2.5), 0);
    return (sum / cards.length).toFixed(2);
  }, [cards]);

  const masteredCount = useMemo(() => cards.filter((c) => c.state === 'mastered').length, [cards]);
  const inReviewCount = useMemo(() => cards.filter((c) => c.state === 'review').length, [cards]);

  // Filtered card list
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      const matchesDeck = selectedDeckFilter === 'all' || c.deckId === selectedDeckFilter;
      const matchesState = selectedStateFilter === 'all' || c.state === selectedStateFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        c.english.toLowerCase().includes(q) ||
        c.targetWord.toLowerCase().includes(q) ||
        (c.category && c.category.toLowerCase().includes(q));

      return matchesDeck && matchesState && matchesQuery;
    });
  }, [cards, selectedDeckFilter, selectedStateFilter, searchQuery]);

  const handleSpeak = (card: Flashcard) => {
    playHapticFeedback('tap');
    const deck = decks.find((d) => d.id === card.deckId);
    speakWord(card.targetWord, deck?.languageCode || card.language);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Schedule
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            SM-2 review intervals and upcoming memory horizon across your decks
          </p>
        </div>

        {timeline.today.length > 0 && (
          <button
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToStudy();
            }}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all flex items-center gap-2 cursor-pointer tabular-nums"
          >
            <Sparkles className="w-4 h-4" />
            <span>Study Due ({timeline.today.length})</span>
          </button>
        )}
      </div>

      {/* Consolidated Overview + Horizon Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-6 tabular-nums">
        {/* Compact 4-Metric Overview Strip */}
        <div className="xl:col-span-5 bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 shadow-2xs border border-black/5 dark:border-white/10 flex flex-col justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
            Retention Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
                Total Words
              </span>
              <span className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                {cards.length}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block">
                Mastered
              </span>
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {masteredCount}
                <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 ml-1">
                  ({cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 block">
                In Review
              </span>
              <span className="text-xl font-bold text-blue-700 dark:text-blue-400">
                {inReviewCount}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 block">
                Avg Ease
              </span>
              <span className="text-xl font-bold text-purple-700 dark:text-purple-400">
                {avgEase}
              </span>
            </div>
          </div>
        </div>

        {/* Upcoming Review Horizon */}
        <div className="xl:col-span-7 bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 shadow-2xs border border-black/5 dark:border-white/10 flex flex-col justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
            Upcoming Review Horizon
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/60">
              <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300 block mb-0.5">
                Due Today
              </span>
              <span className="text-xl font-bold text-rose-800 dark:text-rose-200">{timeline.today.length}</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60">
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block mb-0.5">
                Tomorrow
              </span>
              <span className="text-xl font-bold text-amber-800 dark:text-amber-200">{timeline.tomorrow.length}</span>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60">
              <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block mb-0.5">
                2–4 Days
              </span>
              <span className="text-xl font-bold text-blue-800 dark:text-blue-200">{timeline.upcoming2to4.length}</span>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60">
              <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300 block mb-0.5">
                Next Week
              </span>
              <span className="text-xl font-bold text-indigo-800 dark:text-indigo-200">{timeline.nextWeek.length}</span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block mb-0.5">
                Long Term
              </span>
              <span className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{timeline.longTerm.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Master Vocabulary Table with Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-3xl p-5 shadow-xs border border-black/5 dark:border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Vocabulary Matrix & Schedules ({filteredCards.length})
          </h3>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search word..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-black/10 dark:border-white/10 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-40 sm:w-64"
              />
            </div>

            {/* Deck filter */}
            <select
              value={selectedDeckFilter}
              onChange={(e) => setSelectedDeckFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>

            {/* State filter */}
            <select
              value={selectedStateFilter}
              onChange={(e) => setSelectedStateFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All States</option>
              <option value="new">New</option>
              <option value="learning">Learning</option>
              <option value="review">Review</option>
              <option value="mastered">Mastered</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-black/5 dark:border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-black/5 dark:border-white/10 text-neutral-500 dark:text-neutral-400 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">English Meaning</th>
                <th className="py-2.5 px-3">Target Foreign Word</th>
                <th className="py-2.5 px-3">Deck</th>
                <th className="py-2.5 px-3">SRS State</th>
                <th className="py-2.5 px-3">Interval</th>
                <th className="py-2.5 px-3">Ease</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5 text-neutral-800 dark:text-neutral-200">
              {filteredCards.map((card) => {
                const deck = decks.find((d) => d.id === card.deckId);
                const isDue = isCardDue(card);

                return (
                  <tr key={card.id} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-2.5 px-3 font-medium">{card.english}</td>
                    <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-neutral-100">
                      <div className="flex items-center gap-1.5">
                        <span>{card.targetWord}</span>
                        <button
                          type="button"
                          onClick={() => handleSpeak(card)}
                          className="text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          title="Listen"
                          aria-label={`Listen to ${card.targetWord}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 text-[11px]">
                      {deck?.title || 'Custom'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold capitalize ${
                          card.state === 'mastered'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : card.state === 'review'
                            ? 'text-blue-700 dark:text-blue-400'
                            : card.state === 'learning'
                            ? 'text-orange-700 dark:text-orange-400'
                            : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            card.state === 'mastered'
                              ? 'bg-emerald-500'
                              : card.state === 'review'
                              ? 'bg-blue-500'
                              : card.state === 'learning'
                              ? 'bg-orange-500'
                              : 'bg-neutral-400'
                          }`}
                        />
                        {card.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400 font-mono text-[11px] tabular-nums">
                      {formatInterval(card.intervalDays)}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-400 font-mono text-[11px] tabular-nums">
                      {card.easeFactor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        {onUpdateCard && (
                          <button
                            type="button"
                            onClick={() => {
                              playHapticFeedback('tap');
                              setEditingCard(card);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-neutral-100 hover:bg-blue-50 hover:text-blue-600 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-400 dark:text-neutral-200 font-medium transition-colors cursor-pointer"
                            title="Edit flashcard"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                        {onDeleteCard && (
                          <button
                            type="button"
                            onClick={() => {
                              playHapticFeedback('fail');
                              onDeleteCard(card.id);
                            }}
                            aria-label={`Delete ${card.targetWord}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-neutral-100 hover:bg-rose-50 hover:text-rose-600 text-neutral-600 dark:bg-neutral-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 dark:text-neutral-400 font-medium transition-colors cursor-pointer"
                            title="Delete flashcard"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                        {!isDue && (
                          <button
                            type="button"
                            onClick={() => onMakeCardDueToday(card.id)}
                            className="px-2 py-1 rounded-lg text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 font-medium transition-colors cursor-pointer"
                            title="Make card due immediately for extra practice"
                          >
                            Due Now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onResetCardSchedule(card.id)}
                          aria-label={`Reset schedule for ${card.targetWord}`}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-rose-50 hover:text-rose-600 text-neutral-500 dark:bg-neutral-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 dark:text-neutral-400 transition-colors cursor-pointer"
                          title="Reset progress back to new"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                    No vocabulary items match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card Edit Modal */}
      {editingCard && onUpdateCard && (
        <EditCardModal
          card={editingCard}
          deckTitle={decks.find((d) => d.id === editingCard.deckId)?.title}
          languageCode={decks.find((d) => d.id === editingCard.deckId)?.languageCode}
          onSave={(updated) => {
            onUpdateCard(updated);
            setEditingCard(null);
          }}
          onDelete={
            onDeleteCard
              ? (cardId) => {
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
