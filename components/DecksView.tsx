'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Play,
  Trash2,
  Download,
  MoreHorizontal,
  Search,
  BarChart3,
  X,
} from 'lucide-react';
import { CardDirection, Deck, Flashcard } from '@/lib/types';
import { isCardDue } from '@/lib/srs';
import { computeDeckMasteryScore } from '@/lib/mastery-analytics';
import { exportDeckCardsToCsv } from '@/lib/csv';
import { playHapticFeedback } from '@/lib/audio';
import { WeeklyReviewTracker } from './WeeklyReviewTracker';
import { DeckMasteryChart } from './DeckMasteryChart';

interface DecksViewProps {
  decks: Deck[];
  cards: Flashcard[];
  deckDirections?: Record<string, CardDirection>;
  onSelectDeckToStudy: (deckId: string | null, direction?: CardDirection) => void;
  onNavigateToImport: () => void;
  onDeleteDeck: (deckId: string) => void;
  onInspectDeck: (deck: Deck) => void;
  currentStreak?: number;
  userId?: string | null;
}

export const DecksView: React.FC<DecksViewProps> = ({
  decks,
  cards,
  deckDirections = {},
  onSelectDeckToStudy,
  onNavigateToImport,
  onDeleteDeck,
  onInspectDeck,
  currentStreak = 0,
  userId = null,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(true);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'due' | 'mastered'>('all');

  useEffect(() => {
    if (!activeMenuId) return;
    const handleOutsideClick = () => {
      setActiveMenuId(null);
      setConfirmDeleteId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeMenuId]);

  const availableLanguages = useMemo(() => {
    return Array.from(new Set(decks.map((d) => d.language)));
  }, [decks]);

  const totalCardsCount = cards.length;
  const totalDueToday = useMemo(() => cards.filter((c) => isCardDue(c)).length, [cards]);
  const totalMastered = useMemo(() => cards.filter((c) => c.state === 'mastered').length, [cards]);

  const filteredDecks = useMemo(() => {
    return decks.filter((deck) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        deck.title.toLowerCase().includes(q) ||
        deck.language.toLowerCase().includes(q);

      const matchesLang = selectedLanguage === 'all' || deck.language === selectedLanguage;

      const deckCards = cards.filter((c) => c.deckId === deck.id);
      const hasDue = deckCards.some((c) => isCardDue(c));
      const isMastered = deckCards.length > 0 && deckCards.every((c) => c.state === 'mastered');

      if (!matchesSearch || !matchesLang) return false;
      if (filterMode === 'due') return hasDue;
      if (filterMode === 'mastered') return isMastered;
      return true;
    });
  }, [decks, cards, searchQuery, selectedLanguage, filterMode]);

  const resolvedMasteryDeckId = useMemo(() => {
    if (selectedDeckId === 'all') return 'all';
    if (decks.some((d) => d.id === selectedDeckId)) return selectedDeckId;
    return 'all';
  }, [decks, selectedDeckId]);

  const handleExportDeckCsv = (deck: Deck) => {
    playHapticFeedback('tap');
    const deckCards = cards.filter((c) => c.deckId === deck.id);
    if (deckCards.length === 0) return;
    exportDeckCardsToCsv(deck, deckCards);
    setActiveMenuId(null);
  };

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
    setTimeout(() => URL.revokeObjectURL(url), 150);
    setActiveMenuId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Decks
          </h1>
          <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 tabular-nums mt-1">
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{decks.length}</span>{' '}
            {decks.length === 1 ? 'deck' : 'decks'}
            <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">{totalCardsCount}</span> cards
            <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
            {totalDueToday > 0 ? (
              <span>
                <span className="font-mono text-rose-600 dark:text-rose-400">{totalDueToday}</span> due
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">Caught up</span>
            )}
            {totalMastered > 0 && (
              <>
                <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                <span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{totalMastered}</span> mastered
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {totalDueToday > 0 && (
            <button
              id="decks-review-due-btn"
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                onSelectDeckToStudy(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-[#18181B] active:scale-[0.98] text-zinc-800 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] font-medium text-xs sm:text-[13px] transition-all whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Play className="w-3.5 h-3.5 fill-current text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Study Due</span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {totalDueToday}
              </span>
            </button>
          )}

          <button
            id="decks-insights-toggle-btn"
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              setShowInsights((prev) => !prev);
            }}
            aria-expanded={showInsights}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs sm:text-[13px] font-medium border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              showInsights
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-transparent'
                : 'bg-white dark:bg-[#111114] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-[#18181B]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>Insights</span>
          </button>

          <button
            id="decks-import-table-btn"
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToImport();
            }}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium text-xs sm:text-[13px] shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      {decks.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Search decks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs bg-white dark:bg-[#111114] rounded-xl border border-zinc-200/80 dark:border-white/[0.08] focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 outline-hidden transition-all text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear deck search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {availableLanguages.length > 1 && (
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] focus:border-blue-500/70 outline-hidden font-medium cursor-pointer"
              >
                <option value="all">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('due')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'due'
                    ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Due
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mastered')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'mastered'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Mastered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decks Grid */}
      {filteredDecks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredDecks.map((deck) => {
            const deckCards = cards.filter((c) => c.deckId === deck.id);
            const dueCards = deckCards.filter((c) => isCardDue(c));
            const masteredCount = deckCards.filter((c) => c.state === 'mastered').length;
            const learningCount = deckCards.filter((c) => c.state === 'learning').length;
            const reviewCount = deckCards.filter((c) => c.state === 'review').length;
            const newCount = deckCards.filter((c) => c.state === 'new').length;

            const masteryScore = computeDeckMasteryScore(deckCards);
            const studiedCount = deckCards.length - newCount;
            const deckDirection: CardDirection = deckDirections[deck.id] ?? 'target-first';

            return (
              <div
                key={deck.id}
                className="group relative bg-white dark:bg-[#111114] rounded-2xl p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] hover:-translate-y-0.5 hover:border-zinc-300/90 dark:hover:border-white/[0.15] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs tabular-nums min-w-0">
                      <span className="font-medium text-blue-600 dark:text-blue-400 truncate">
                        {deck.language}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                        ·
                      </span>
                      {dueCards.length > 0 ? (
                        <span className="font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          <span className="font-mono">{dueCards.length}</span> due
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          Caught up
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                          setActiveMenuId((prev) => (prev === deck.id ? null : deck.id));
                        }}
                        aria-label="Deck options"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {activeMenuId === deck.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 z-20 w-48 rounded-xl bg-white dark:bg-[#18181B] p-1.5 shadow-xl border border-zinc-200/80 dark:border-white/[0.09] text-xs text-zinc-700 dark:text-zinc-200"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              onInspectDeck(deck);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer transition-colors"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                            <span>Browse &amp; Edit Cards</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              setSelectedDeckId(deck.id);
                              setShowInsights(true);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer transition-colors"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                            <span>View Mastery Chart</span>
                          </button>
                          <button
                            type="button"
                            disabled={deckCards.length === 0}
                            onClick={() => handleExportDeckCsv(deck)}
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                              deckCards.length === 0
                                ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                                : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                            <span>Export Backup (.csv)</span>
                          </button>
                          <button
                            type="button"
                            disabled={deckCards.length === 0}
                            onClick={() => handleExportDeck(deck)}
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                              deckCards.length === 0
                                ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                                : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                            <span>Export Table (.tsv)</span>
                          </button>
                          <div className="my-1 border-t border-zinc-100 dark:border-white/[0.06]" />
                          {confirmDeleteId === deck.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setActiveMenuId(null);
                                onDeleteDeck(deck.id);
                              }}
                              className="w-full text-left px-2.5 py-2 rounded-lg bg-rose-600 text-white font-semibold flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Confirm Delete ({deckCards.length})</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(deck.id)}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Deck</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight leading-snug mb-1">
                    <button
                      type="button"
                      onClick={() => onInspectDeck(deck)}
                      className="text-left w-full hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer"
                    >
                      {deck.title}
                    </button>
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums mb-4">
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {deckCards.length}
                    </span>{' '}
                    {deckCards.length === 1 ? 'card' : 'cards'}
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                      {masteryScore}%
                    </span>{' '}
                    mastery
                    {studiedCount > 0 && (
                      <>
                        <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                        <span className="font-mono">{studiedCount}</span> studied
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] flex overflow-hidden mb-4">
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
                        className="bg-blue-600"
                        title={`Review: ${reviewCount}`}
                      />
                    )}
                    {learningCount > 0 && (
                      <div
                        style={{ width: `${(learningCount / deckCards.length) * 100}%` }}
                        className="bg-amber-500"
                        title={`Learning: ${learningCount}`}
                      />
                    )}
                    {newCount > 0 && (
                      <div
                        style={{ width: `${(newCount / deckCards.length) * 100}%` }}
                        className="bg-zinc-300 dark:bg-zinc-600"
                        title={`New: ${newCount}`}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        playHapticFeedback('tap');
                        onSelectDeckToStudy(deck.id, deckDirection);
                      }}
                      className={`flex-1 h-9 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer tabular-nums active:scale-[0.99] ${
                        dueCards.length > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                          : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950'
                      }`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>
                        {dueCards.length > 0 ? `Study (${dueCards.length})` : 'Practice'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playHapticFeedback('tap');
                        onInspectDeck(deck);
                      }}
                      className="h-9 px-3.5 rounded-xl bg-zinc-50 dark:bg-[#18181B] hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] font-medium text-xs transition-colors cursor-pointer"
                      title="Browse and edit cards"
                    >
                      Browse
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty Search / No Decks State */}
      {filteredDecks.length === 0 && (
        <div className="bg-white dark:bg-[#111114] rounded-2xl p-10 text-center border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)]">
          <Search className="w-6 h-6 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <h3 className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 mb-1">
            {decks.length === 0 ? 'No decks yet' : 'No matching decks'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
            {decks.length === 0
              ? 'Import a vocabulary table to create your first deck.'
              : 'Try adjusting your search or filter.'}
          </p>
          {decks.length === 0 ? (
            <button
              type="button"
              onClick={onNavigateToImport}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white cursor-pointer transition-colors"
            >
              Create First Deck
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedLanguage('all');
                setFilterMode('all');
              }}
              className="h-9 px-4 rounded-xl bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200/80 dark:hover:bg-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Side-by-Side Mastery & Weekly Insights */}
      {showInsights && decks.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch pt-1">
          <div className="xl:col-span-7 flex [&>*]:w-full">
            <DeckMasteryChart
              decks={decks}
              selectedDeckId={resolvedMasteryDeckId}
              onSelectDeck={(deckId) => setSelectedDeckId(deckId)}
              cards={cards}
              cardDirection={
                resolvedMasteryDeckId !== 'all'
                  ? deckDirections[resolvedMasteryDeckId] ?? 'target-first'
                  : 'target-first'
              }
              onStudyDeck={(deckId, dir) => onSelectDeckToStudy(deckId, dir)}
              onInspectDeck={onInspectDeck}
              onNavigateToImport={onNavigateToImport}
              userId={userId}
            />
          </div>
          <div className="xl:col-span-5 flex [&>*]:w-full">
            <WeeklyReviewTracker currentStreak={currentStreak} userId={userId} />
          </div>
        </div>
      )}
    </div>
  );
};
