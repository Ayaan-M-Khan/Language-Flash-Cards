'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Volume2,
  Search,
  Play,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Flashcard, Deck } from '@/lib/types';
import { formatInterval, isCardDue } from '@/lib/srs';
import { speakWord, stopSpeaking, playHapticFeedback } from '@/lib/audio';
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
  const [speakingCardId, setSpeakingCardId] = useState<string | null>(null);
  const speakSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      speakSeqRef.current += 1;
      stopSpeaking();
    };
  }, []);

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
    if (cards.length === 0) return '2.50';
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

  const handleSpeak = async (card: Flashcard) => {
    const seq = ++speakSeqRef.current;
    playHapticFeedback('tap');
    setSpeakingCardId(card.id);
    const deck = decks.find((d) => d.id === card.deckId);
    try {
      await speakWord(card.targetWord, deck?.languageCode || deck?.language || card.language, {
        languageName: deck?.language || card.language,
        fallbackText: card.phonetic,
      });
    } finally {
      if (speakSeqRef.current === seq) {
        setSpeakingCardId(null);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Schedule
          </h1>
          <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            SM-2 review intervals and upcoming memory horizon across your decks.
          </p>
        </div>

        {timeline.today.length > 0 && (
          <button
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToStudy();
            }}
            className="self-start sm:self-auto h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-[13px] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer tabular-nums"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Study Due ({timeline.today.length})</span>
          </button>
        )}
      </div>

      {/* Consolidated Overview + Horizon Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-6 tabular-nums">
        {/* 4-Metric Overview Strip */}
        <div className="xl:col-span-5 bg-white dark:bg-[#111114] rounded-2xl p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] flex flex-col justify-between">
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Retention Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Total Words
              </span>
              <span className="text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5 block">
                {cards.length}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Mastered
              </span>
              <span className="text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {masteredCount}
                <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-1">
                  ({cards.length > 0 ? Math.round((masteredCount / cards.length) * 100) : 0}%)
                </span>
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                In Review
              </span>
              <span className="text-xl font-semibold font-mono text-blue-600 dark:text-blue-400 mt-0.5 block">
                {inReviewCount}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Avg Ease
              </span>
              <span className="text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5 block">
                {avgEase}
                <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">×</span>
              </span>
            </div>
          </div>
        </div>

        {/* Unified Hairline-Divided Review Horizon */}
        <div className="xl:col-span-7 bg-white dark:bg-[#111114] rounded-2xl p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Upcoming Review Horizon
            </h3>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Scheduled by SM-2 due date
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100 dark:divide-white/[0.06] border-t border-zinc-100 dark:border-white/[0.06] pt-3.5">
            <div className="py-2 sm:py-0 sm:pr-4">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Due Today
              </span>
              <span className="text-2xl font-semibold font-mono text-rose-600 dark:text-rose-400 mt-1 block">
                {timeline.today.length}
              </span>
            </div>

            <div className="py-2 sm:py-0 sm:px-4">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Tomorrow
              </span>
              <span className="text-2xl font-semibold font-mono text-amber-600 dark:text-amber-400 mt-1 block">
                {timeline.tomorrow.length}
              </span>
            </div>

            <div className="py-2 sm:py-0 sm:px-4">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                2–4 Days
              </span>
              <span className="text-2xl font-semibold font-mono text-blue-600 dark:text-blue-400 mt-1 block">
                {timeline.upcoming2to4.length}
              </span>
            </div>

            <div className="py-2 sm:py-0 sm:px-4">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Next Week
              </span>
              <span className="text-2xl font-semibold font-mono text-zinc-900 dark:text-zinc-100 mt-1 block">
                {timeline.nextWeek.length}
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 py-2 sm:py-0 sm:pl-4">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block">
                Long Term
              </span>
              <span className="text-2xl font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                {timeline.longTerm.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Master Vocabulary Table with Filters */}
      <div className="bg-white dark:bg-[#111114] rounded-2xl p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
            Vocabulary Matrix{' '}
            <span className="font-mono text-xs font-normal text-zinc-400 dark:text-zinc-500 ml-1">
              {filteredCards.length}
            </span>
          </h3>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search word..."
                className="h-8 pl-8 pr-3 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 w-44 sm:w-64"
              />
            </div>

            <select
              value={selectedDeckFilter}
              onChange={(e) => setSelectedDeckFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500/70 cursor-pointer"
            >
              <option value="all">All Decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>

            <select
              value={selectedStateFilter}
              onChange={(e) => setSelectedStateFilter(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500/70 cursor-pointer"
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
        <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-white/[0.08]">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50/90 dark:bg-[#18181B] border-b border-zinc-200/80 dark:border-white/[0.07] text-zinc-500 dark:text-zinc-400 font-medium text-[11px]">
              <tr>
                <th className="py-2.5 px-3 font-medium">English Meaning</th>
                <th className="py-2.5 px-3 font-medium">Target Word</th>
                <th className="py-2.5 px-3 font-medium">Deck</th>
                <th className="py-2.5 px-3 font-medium">State</th>
                <th className="py-2.5 px-3 font-medium">Interval</th>
                <th className="py-2.5 px-3 font-medium">Ease</th>
                <th className="py-2.5 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-zinc-800 dark:text-zinc-200">
              {filteredCards.map((card) => {
                const deck = decks.find((d) => d.id === card.deckId);
                const isDue = isCardDue(card);

                return (
                  <tr
                    key={card.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                      {card.english}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-950 dark:text-zinc-50">
                      <div className="flex items-center gap-1.5">
                        <span>{card.targetWord}</span>
                        <button
                          type="button"
                          onClick={() => handleSpeak(card)}
                          className={`transition-colors cursor-pointer ${
                            speakingCardId === card.id
                              ? 'text-blue-600 dark:text-blue-400 scale-110'
                              : 'text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400'
                          }`}
                          title="Listen"
                          aria-label={`Listen to ${card.targetWord}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {deck?.title || 'Custom'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-xs font-medium capitalize ${
                          card.state === 'mastered'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : card.state === 'review'
                            ? 'text-blue-600 dark:text-blue-400'
                            : card.state === 'learning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {card.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 font-mono text-[11px] tabular-nums">
                      {formatInterval(card.intervalDays)}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 font-mono text-[11px] tabular-nums">
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-zinc-100/80 hover:bg-blue-50 hover:text-blue-600 text-zinc-700 dark:bg-white/[0.05] dark:hover:bg-blue-950/40 dark:hover:text-blue-400 dark:text-zinc-300 font-medium transition-colors cursor-pointer"
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-zinc-100/80 hover:bg-rose-50 hover:text-rose-600 text-zinc-600 dark:bg-white/[0.05] dark:hover:bg-rose-950/40 dark:hover:text-rose-400 dark:text-zinc-400 font-medium transition-colors cursor-pointer"
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
                            className="px-2 py-1 rounded-lg text-[11px] bg-zinc-100/80 hover:bg-zinc-200/80 text-zinc-700 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:text-zinc-300 font-medium transition-colors cursor-pointer"
                            title="Make card due immediately for extra practice"
                          >
                            Due Now
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onResetCardSchedule(card.id)}
                          aria-label={`Reset schedule for ${card.targetWord}`}
                          className="p-1.5 rounded-lg bg-zinc-100/80 hover:bg-rose-50 hover:text-rose-600 text-zinc-500 dark:bg-white/[0.05] dark:hover:bg-rose-950/40 dark:hover:text-rose-400 dark:text-zinc-400 transition-colors cursor-pointer"
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
                  <td
                    colSpan={7}
                    className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500"
                  >
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
