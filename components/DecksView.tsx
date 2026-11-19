'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  Trash2,
  Download,
  MoreHorizontal,
  Search,
  BarChart3,
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* Clean Minimal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Decks
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 tabular-nums mt-0.5">
            {decks.length} {decks.length === 1 ? 'deck' : 'decks'} · {totalCardsCount} cards
            {totalDueToday > 0 ? ` · ${totalDueToday} due` : ' · caught up'}
            {totalMastered > 0 ? ` · ${totalMastered} mastered` : ''}
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
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-[0.98] text-neutral-800 dark:text-neutral-100 border border-black/10 dark:border-white/10 font-semibold text-xs sm:text-sm shadow-2xs transition-all whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Play className="w-3.5 h-3.5 fill-current text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Study Due ({totalDueToday})</span>
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
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              showInsights
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-transparent'
                : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-black/10 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-700'
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
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Deck</span>
          </button>
        </div>
      </div>

      {/* Lightweight Search & Filter Strip */}
      {decks.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              placeholder="Search decks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white/90 dark:bg-neutral-900/90 rounded-xl border border-black/10 dark:border-white/10 focus:border-blue-500 outline-hidden transition-all text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {availableLanguages.length > 1 && (
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 border border-black/10 dark:border-white/10 outline-hidden font-medium cursor-pointer"
              >
                <option value="all">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center p-0.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('due')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'due'
                    ? 'bg-white dark:bg-neutral-700 text-rose-600 dark:text-rose-400 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                Due
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('mastered')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'mastered'
                    ? 'bg-white dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                Mastered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Decks Grid */}
      {filteredDecks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                className="group relative bg-white dark:bg-neutral-900 rounded-2xl p-5 shadow-2xs hover:shadow-sm border border-black/5 dark:border-white/10 hover:border-black/10 dark:hover:border-white/15 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {deck.language}
                      </span>
                      <span className="text-neutral-300 dark:text-neutral-700">·</span>
                      {dueCards.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                          <Clock className="w-3 h-3" />
                          <span>{dueCards.length} due</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Caught up</span>
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
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {activeMenuId === deck.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 z-20 w-48 rounded-2xl bg-white dark:bg-neutral-800 p-1.5 shadow-lg border border-black/10 dark:border-white/10 text-xs text-neutral-700 dark:text-neutral-200"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              onInspectDeck(deck);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Browse &amp; Edit Cards</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              setSelectedDeckId(deck.id);
                              setShowInsights(true);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>View Mastery Chart</span>
                          </button>
                          <button
                            type="button"
                            disabled={deckCards.length === 0}
                            onClick={() => handleExportDeckCsv(deck)}
                            className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 ${
                              deckCards.length === 0
                                ? 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Export Backup (.csv)</span>
                          </button>
                          <button
                            type="button"
                            disabled={deckCards.length === 0}
                            onClick={() => handleExportDeck(deck)}
                            className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 ${
                              deckCards.length === 0
                                ? 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Export Table (.tsv)</span>
                          </button>
                          {confirmDeleteId === deck.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setActiveMenuId(null);
                                onDeleteDeck(deck.id);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl bg-rose-600 text-white font-semibold flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Confirm Delete ({deckCards.length})</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(deck.id)}
                              className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Deck</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight mb-1">
                    <button
                      type="button"
                      onClick={() => onInspectDeck(deck)}
                      className="text-left w-full hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer"
                    >
                      {deck.title}
                    </button>
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums mb-4">
                    {deckCards.length} {deckCards.length === 1 ? 'card' : 'cards'} · {masteryScore}% mastery
                    {studiedCount > 0 ? ` · ${studiedCount} studied` : ''}
                  </p>
                </div>

                <div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 flex overflow-hidden mb-3.5">
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
                        className="bg-orange-500"
                        title={`Learning: ${learningCount}`}
                      />
                    )}
                    {newCount > 0 && (
                      <div
                        style={{ width: `${(newCount / deckCards.length) * 100}%` }}
                        className="bg-slate-400"
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
                      className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer tabular-nums ${
                        dueCards.length > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-neutral-900 dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{dueCards.length > 0 ? `Study (${dueCards.length})` : 'Practice'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playHapticFeedback('tap');
                        onInspectDeck(deck);
                      }}
                      className="py-2 px-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-medium text-xs transition-colors cursor-pointer"
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
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-10 text-center border border-black/5 dark:border-white/10">
          <Search className="w-7 h-7 text-neutral-300 dark:text-neutral-600 mx-auto mb-2.5" />
          <h3 className="font-bold text-sm sm:text-base text-neutral-800 dark:text-neutral-200 mb-1">
            {decks.length === 0 ? 'No decks yet' : 'No matching decks'}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            {decks.length === 0
              ? 'Import a vocabulary table to create your first deck.'
              : 'Try adjusting your search or filter.'}
          </p>
          {decks.length === 0 ? (
            <button
              type="button"
              onClick={onNavigateToImport}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white cursor-pointer"
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
              className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Side-by-Side Mastery & Weekly Insights below Decks */}
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
