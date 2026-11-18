'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  Trash2,
  Download,
  MoreHorizontal,
  FileSpreadsheet,
  Search,
  Layers,
  GraduationCap,
} from 'lucide-react';
import { CardDirection, Deck, Flashcard } from '@/lib/types';
import { isCardDue } from '@/lib/srs';
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
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(
    () => decks[0]?.id ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'due' | 'mastered'>('all');

  // Available unique languages in decks
  const availableLanguages = useMemo(() => {
    return Array.from(new Set(decks.map((d) => d.language)));
  }, [decks]);

  // Overall metrics
  const totalCardsCount = cards.length;
  const totalDueToday = useMemo(() => cards.filter((c) => isCardDue(c)).length, [cards]);
  const totalMastered = useMemo(() => cards.filter((c) => c.state === 'mastered').length, [cards]);

  // Filtered decks list
  const filteredDecks = useMemo(() => {
    return decks.filter((deck) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        deck.title.toLowerCase().includes(q) ||
        deck.language.toLowerCase().includes(q) ||
        (deck.description || '').toLowerCase().includes(q);

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

  // Active deck for the Mastery Distribution visualization
  const selectedDeck = useMemo(() => {
    if (decks.length === 0) return null;
    if (selectedDeckId) {
      const match = decks.find((d) => d.id === selectedDeckId);
      if (match) return match;
    }
    return filteredDecks[0] ?? decks[0] ?? null;
  }, [decks, filteredDecks, selectedDeckId]);

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2 mb-0.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Vocabulary Decks
            </h1>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
              · {decks.length} Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
            Select a deck to study, browse cards, or inspect mastery
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
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-[0.98] text-neutral-800 dark:text-neutral-100 border border-black/10 dark:border-white/10 font-semibold text-xs sm:text-sm shadow-2xs transition-all whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Play className="w-3.5 h-3.5 fill-current text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Study Due ({totalDueToday})</span>
            </button>
          )}

          <button
            id="decks-import-table-btn"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToImport();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm shadow-sm shadow-blue-500/25 transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Create Deck</span>
          </button>
        </div>
      </div>

      {/* Apple-styled Stats Overview Bento Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 dark:border-white/10 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-500 mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total Decks</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{decks.length}</div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">Across {availableLanguages.length} languages</p>
        </div>

        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 dark:border-white/10 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-500 mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total Cards</span>
            <BookOpen className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{totalCardsCount}</div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">In active memory loop</p>
        </div>

        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 dark:border-white/10 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-500 mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Due Today</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{totalDueToday}</div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {totalDueToday > 0 ? 'Ready for review' : 'All caught up!'}
          </p>
        </div>

        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 dark:border-white/10 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 dark:text-neutral-500 mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Mastered Words</span>
            <GraduationCap className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalMastered}</div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            {totalCardsCount > 0 ? Math.round((totalMastered / totalCardsCount) * 100) : 0}% of library
          </p>
        </div>
      </div>

      {/* Selected Deck Card Mastery Visualization (Recharts) */}
      <DeckMasteryChart
        decks={decks}
        selectedDeck={selectedDeck}
        onSelectDeck={(deckId) => setSelectedDeckId(deckId)}
        cards={cards}
        cardDirection={selectedDeck ? deckDirections[selectedDeck.id] ?? 'target-first' : 'target-first'}
        onStudyDeck={(deckId, dir) => onSelectDeckToStudy(deckId, dir)}
        onInspectDeck={onInspectDeck}
        onNavigateToImport={onNavigateToImport}
      />

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/70 dark:bg-neutral-900/80 backdrop-blur-md p-2.5 rounded-2xl border border-black/5 dark:border-white/10">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            placeholder="Search decks by title, language, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-neutral-100/80 dark:bg-neutral-800/80 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-neutral-800 outline-hidden transition-all text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Language Selector */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200/80 dark:border-neutral-700 outline-hidden font-medium cursor-pointer"
          >
            <option value="all">All Languages</option>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="flex items-center p-0.5 bg-neutral-200/60 dark:bg-neutral-800 rounded-xl text-xs font-medium">
            <button
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

      {/* Decks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredDecks.map((deck) => {
          const deckCards = cards.filter((c) => c.deckId === deck.id);
          const dueCards = deckCards.filter((c) => isCardDue(c));
          const masteredCount = deckCards.filter((c) => c.state === 'mastered').length;
          const learningCount = deckCards.filter((c) => c.state === 'learning').length;
          const reviewCount = deckCards.filter((c) => c.state === 'review').length;
          const newCount = deckCards.filter((c) => c.state === 'new').length;

          const masteredPercent =
            deckCards.length > 0 ? Math.round((masteredCount / deckCards.length) * 100) : 0;
          const isSelectedForChart = selectedDeck?.id === deck.id;
          const deckDirection: CardDirection = deckDirections[deck.id] ?? 'target-first';

          return (
            <div
              key={deck.id}
              onClick={() => {
                playHapticFeedback('tap');
                setSelectedDeckId(deck.id);
              }}
              className={`group relative bg-white dark:bg-neutral-900 rounded-3xl p-5 transition-all flex flex-col justify-between cursor-pointer ${
                isSelectedForChart
                  ? 'ring-2 ring-blue-600/80 border border-blue-200 dark:border-blue-800 shadow-sm'
                  : 'shadow-xs hover:shadow-md border border-black/5 dark:border-white/10 hover:border-black/10 dark:hover:border-white/20'
              }`}
            >
              {/* Top Row: Language & Menu */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {deck.language}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-600">·</span>
                    {dueCards.length > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
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

                  <div className="flex items-center gap-1">
                    {/* Options Menu Toggle */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                          setActiveMenuId((prev) => (prev === deck.id ? null : deck.id));
                        }}
                        aria-label="Deck options"
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuId === deck.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-9 z-20 w-48 rounded-2xl bg-white dark:bg-neutral-800 p-1.5 shadow-lg border border-black/10 dark:border-white/10 text-xs text-neutral-700 dark:text-neutral-200"
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
                </div>

                {/* Deck Title & Description */}
                <h3
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectDeck(deck);
                  }}
                  className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-1.5 line-clamp-1"
                >
                  {deck.title}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-4 leading-relaxed">
                  {deck.description || 'Vocabulary spaced repetition collection.'}
                </p>
              </div>

              {/* Progress & Card State Segmented Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 tabular-nums">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {deckCards.length} Total Cards
                  </span>
                  <span>{masteredPercent}% Mastered</span>
                </div>

                {/* Mini Visual SRS Progress Bar */}
                <div className="h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 flex overflow-hidden mb-4">
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

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playHapticFeedback('tap');
                      onSelectDeckToStudy(deck.id, deckDirection);
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-2xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer tabular-nums ${
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
                    onClick={(e) => {
                      e.stopPropagation();
                      playHapticFeedback('tap');
                      onInspectDeck(deck);
                    }}
                    className="py-2.5 px-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-medium text-xs transition-colors cursor-pointer"
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
          className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-blue-50/30 dark:hover:bg-blue-950/20 group min-h-[220px]"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            Import Another Table
          </h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs leading-relaxed">
            Paste rows with an English word and translation to generate a new smart deck.
          </p>
        </div>
      </div>

      {/* Empty Search State */}
      {filteredDecks.length === 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-12 text-center border border-black/5 dark:border-white/10 shadow-xs">
          <Search className="w-8 h-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
          <h3 className="font-bold text-base text-neutral-800 dark:text-neutral-200 mb-1">No matching decks found</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            Try adjusting your search keywords or filter options.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedLanguage('all');
              setFilterMode('all');
            }}
            className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Dashboard Progress Chart Component */}
      <WeeklyReviewTracker currentStreak={currentStreak} userId={userId} />
    </div>
  );
};
