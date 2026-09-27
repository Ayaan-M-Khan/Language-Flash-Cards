'use client';

import React, { useState, useMemo } from 'react';
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
  Search,
  Layers,
  GraduationCap,
  Globe2,
  RotateCcw,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Hero Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              Vocabulary Decks
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200/60">
              {decks.length} Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500">
            Intelligently scheduled spaced repetition collections with real-time cloud sync
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="decks-import-table-btn"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToImport();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-semibold text-xs sm:text-sm shadow-sm shadow-blue-500/25 transition-all self-start sm:self-auto"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Create Deck from Table</span>
          </button>
        </div>
      </div>

      {/* Apple-styled Stats Overview Bento Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium text-neutral-500">Total Decks</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{decks.length}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Across {availableLanguages.length} languages</p>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium text-neutral-500">Total Cards</span>
            <BookOpen className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{totalCardsCount}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">In active memory loop</p>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium text-neutral-500">Due Today</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{totalDueToday}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {totalDueToday > 0 ? 'Ready for review' : 'All caught up!'}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium text-neutral-500">Mastered Words</span>
            <GraduationCap className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{totalMastered}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {totalCardsCount > 0 ? Math.round((totalMastered / totalCardsCount) * 100) : 0}% of library
          </p>
        </div>
      </div>

      {/* Due Today Quick Action Banner */}
      {totalDueToday > 0 && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">
                You have {totalDueToday} {totalDueToday === 1 ? 'card' : 'cards'} ready for spaced repetition
              </h3>
              <p className="text-xs text-blue-100">
                Regular reviews strengthen long-term memory retention curves.
              </p>
            </div>
          </div>
          <button
            onClick={() => onSelectDeckToStudy(null)}
            className="px-4 py-2 rounded-xl bg-white text-blue-600 font-semibold text-xs shadow-sm hover:bg-blue-50 active:scale-95 transition-all shrink-0"
          >
            Review All Due Cards
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/70 backdrop-blur-md p-2.5 rounded-2xl border border-black/5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search decks by title, language, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-neutral-100/80 rounded-xl border border-transparent focus:border-blue-500 focus:bg-white outline-hidden transition-all text-neutral-800 placeholder:text-neutral-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
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
            className="px-3 py-1.5 text-xs rounded-xl bg-neutral-100 text-neutral-700 border border-neutral-200/80 outline-hidden font-medium"
          >
            <option value="all">All Languages</option>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="flex items-center p-0.5 bg-neutral-200/60 rounded-xl text-xs font-medium">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'all'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('due')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'due'
                  ? 'bg-white text-rose-600 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Due
            </button>
            <button
              onClick={() => setFilterMode('mastered')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMode === 'mastered'
                  ? 'bg-white text-emerald-600 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
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

      {/* Empty Search State */}
      {filteredDecks.length === 0 && (
        <div className="bg-white rounded-3xl p-12 text-center border border-black/5 shadow-xs">
          <Search className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
          <h3 className="font-bold text-base text-neutral-800 mb-1">No matching decks found</h3>
          <p className="text-xs text-neutral-500 mb-4">
            Try adjusting your search keywords or filter options.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedLanguage('all');
              setFilterMode('all');
            }}
            className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-700"
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
