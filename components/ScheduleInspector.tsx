'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Volume2,
  Search,
  Filter,
  Sparkles,
  RefreshCw,
  Zap,
  TrendingUp,
  Sliders,
} from 'lucide-react';
import { Flashcard, Deck } from '@/lib/types';
import { formatInterval, isCardDue } from '@/lib/srs';
import { speakWord, playHapticFeedback } from '@/lib/audio';

interface ScheduleInspectorProps {
  cards: Flashcard[];
  decks: Deck[];
  onResetCardSchedule: (cardId: string) => void;
  onMakeCardDueToday: (cardId: string) => void;
  onNavigateToStudy: (deckId?: string) => void;
}

export const ScheduleInspector: React.FC<ScheduleInspectorProps> = ({
  cards,
  decks,
  onResetCardSchedule,
  onMakeCardDueToday,
  onNavigateToStudy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeckFilter, setSelectedDeckFilter] = useState<string>('all');
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('all');

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
  const newCount = useMemo(() => cards.filter((c) => c.state === 'new').length, [cards]);

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
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <Calendar className="w-3.5 h-3.5" />
            <span>SuperMemo SM-2 Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-1">
            Spaced Repetition Schedule
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500">
            Scientifically calculated memory intervals based on your recall accuracy
          </p>
        </div>

        {timeline.today.length > 0 && (
          <button
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToStudy();
            }}
            className="self-start sm:self-auto px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm shadow-blue-500/25 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Study Due Now ({timeline.today.length})</span>
          </button>
        )}
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-black/5">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
            Active Vocabulary
          </span>
          <span className="text-2xl font-bold text-neutral-900">{cards.length}</span>
          <span className="text-[11px] text-neutral-400 block mt-0.5">Total words</span>
        </div>

        <div className="bg-white rounded-3xl p-4 shadow-xs border border-black/5">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block mb-1">
            Mastered
          </span>
          <span className="text-2xl font-bold text-emerald-700">{masteredCount}</span>
          <span className="text-[11px] text-neutral-400 block mt-0.5">
            {cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0}% of total
          </span>
        </div>

        <div className="bg-white rounded-3xl p-4 shadow-xs border border-black/5">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block mb-1">
            In Review
          </span>
          <span className="text-2xl font-bold text-blue-700">{inReviewCount}</span>
          <span className="text-[11px] text-neutral-400 block mt-0.5">Active recall loop</span>
        </div>

        <div className="bg-white rounded-3xl p-4 shadow-xs border border-black/5">
          <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider block mb-1">
            Avg Ease Factor
          </span>
          <span className="text-2xl font-bold text-purple-700">{avgEase}</span>
          <span className="text-[11px] text-neutral-400 block mt-0.5">Standard: 2.50</span>
        </div>
      </div>

      {/* Spaced Horizon Cards */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 mb-8">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">
          Upcoming Review Horizon
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/60">
            <span className="text-[11px] font-bold uppercase text-rose-700 block mb-1">
              Due Today
            </span>
            <span className="text-2xl font-bold text-rose-800">{timeline.today.length}</span>
            <span className="text-[10px] text-rose-600 block mt-1">Immediate focus</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60">
            <span className="text-[11px] font-bold uppercase text-amber-700 block mb-1">
              Tomorrow
            </span>
            <span className="text-2xl font-bold text-amber-800">{timeline.tomorrow.length}</span>
            <span className="text-[10px] text-amber-600 block mt-1">24 hr retention</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/60">
            <span className="text-[11px] font-bold uppercase text-blue-700 block mb-1">
              2 – 4 Days
            </span>
            <span className="text-2xl font-bold text-blue-800">{timeline.upcoming2to4.length}</span>
            <span className="text-[10px] text-blue-600 block mt-1">Strengthening</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/60">
            <span className="text-[11px] font-bold uppercase text-indigo-700 block mb-1">
              Next Week
            </span>
            <span className="text-2xl font-bold text-indigo-800">{timeline.nextWeek.length}</span>
            <span className="text-[10px] text-indigo-600 block mt-1">5-14 day interval</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/60">
            <span className="text-[11px] font-bold uppercase text-emerald-700 block mb-1">
              Long Term
            </span>
            <span className="text-2xl font-bold text-emerald-800">{timeline.longTerm.length}</span>
            <span className="text-[10px] text-emerald-600 block mt-1">&gt; 2 weeks memory</span>
          </div>
        </div>
      </div>

      {/* Master Vocabulary Table with Filters */}
      <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Vocabulary Matrix & Schedules ({filteredCards.length})
          </h3>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search word..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-neutral-50 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-36 sm:w-48"
              />
            </div>

            {/* Deck filter */}
            <select
              value={selectedDeckFilter}
              onChange={(e) => setSelectedDeckFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-neutral-50 border border-black/10 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
              className="px-2.5 py-1.5 text-xs rounded-xl bg-neutral-50 border border-black/10 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
        <div className="overflow-x-auto rounded-2xl border border-black/5">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-black/5 text-neutral-500 font-semibold uppercase text-[10px] tracking-wider">
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
            <tbody className="divide-y divide-black/5 text-neutral-800">
              {filteredCards.map((card) => {
                const deck = decks.find((d) => d.id === card.deckId);
                const isDue = isCardDue(card);

                return (
                  <tr key={card.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium">{card.english}</td>
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">
                      <div className="flex items-center gap-1.5">
                        <span>{card.targetWord}</span>
                        <button
                          onClick={() => handleSpeak(card)}
                          className="text-neutral-400 hover:text-blue-600 transition-colors"
                          title="Listen"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500 text-[11px]">
                      {deck?.title || 'Custom'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          card.state === 'mastered'
                            ? 'bg-emerald-100 text-emerald-700'
                            : card.state === 'review'
                            ? 'bg-blue-100 text-blue-700'
                            : card.state === 'learning'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {card.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 font-mono text-[11px]">
                      {formatInterval(card.intervalDays)}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 font-mono text-[11px]">
                      {card.easeFactor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                      {!isDue && (
                        <button
                          onClick={() => onMakeCardDueToday(card.id)}
                          className="px-2 py-1 rounded-lg text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium transition-colors"
                          title="Make card due immediately for extra practice"
                        >
                          Study Now
                        </button>
                      )}
                      <button
                        onClick={() => onResetCardSchedule(card.id)}
                        className="px-2 py-1 rounded-lg text-[10px] bg-neutral-100 hover:bg-rose-50 hover:text-rose-600 text-neutral-600 transition-colors"
                        title="Reset progress back to new"
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-neutral-400">
                    No vocabulary items match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
