'use client';

import React from 'react';
import { Sparkles, Layers, FileSpreadsheet, Calendar, Volume2, VolumeX, Flame } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled, playHapticFeedback } from '@/lib/audio';
import { UserAccountMenu } from './UserAccountMenu';
import { ThemeToggle } from './ThemeToggle';

export type ActiveTab = 'study' | 'decks' | 'import' | 'schedule';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  dueTodayCount: number;
  streakDays: number;
  soundState: boolean;
  onSoundToggle: (enabled: boolean) => void;
  totalDecks: number;
  totalCards: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  dueTodayCount,
  streakDays,
  soundState,
  onSoundToggle,
  totalDecks,
  totalCards,
}) => {
  const handleTabClick = (tab: ActiveTab) => {
    playHapticFeedback('tap');
    onTabChange(tab);
  };

  const toggleSound = () => {
    const next = !soundState;
    setSoundEnabled(next);
    onSoundToggle(next);
    if (next) playHapticFeedback('tap');
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/85 dark:bg-neutral-900/85 border-b border-black/5 dark:border-white/10 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / App Identity */}
        <button
          type="button"
          onClick={() => handleTabClick('decks')}
          className="flex items-center gap-2.5 cursor-pointer group select-none shrink-0 text-left"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="hidden md:block">
            <span className="font-semibold text-base tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap block leading-tight">
              Language Flashcards
            </span>
          </div>
        </button>

        {/* Segmented Control */}
        <nav
          aria-label="Navigation tabs"
          className="flex items-center p-1 bg-neutral-200/70 dark:bg-neutral-800/80 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/10 transition-colors shrink-0"
        >
          <button
            id="tab-study-btn"
            type="button"
            aria-label="Study"
            onClick={() => handleTabClick('study')}
            className={`relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'study'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Study</span>
            {dueTodayCount > 0 && (
              <span
                suppressHydrationWarning
                className="text-[10px] font-bold px-1.5 py-0.5 leading-none rounded-full bg-blue-600 text-white tabular-nums"
              >
                {dueTodayCount}
              </span>
            )}
          </button>

          <button
            id="tab-decks-btn"
            type="button"
            aria-label="Decks"
            onClick={() => handleTabClick('decks')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'decks'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Decks</span>
          </button>

          <button
            id="tab-import-btn"
            type="button"
            aria-label="Import Table"
            onClick={() => handleTabClick('import')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'import'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Import Table</span>
          </button>

          <button
            id="tab-schedule-btn"
            type="button"
            aria-label="Schedule"
            onClick={() => handleTabClick('schedule')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'schedule'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Schedule</span>
          </button>
        </nav>

        {/* Right Utility: Streak, Sound, Global Theme Toggle, and Account */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
          <div
            title={`${streakDays} Day Learning Streak`}
            className="hidden sm:flex items-center gap-1 px-1.5 text-orange-600 dark:text-orange-400 text-xs font-semibold select-none tabular-nums whitespace-nowrap"
          >
            <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500 shrink-0" />
            <span>{streakDays}d</span>
          </div>

          <button
            id="sound-toggle-btn"
            type="button"
            onClick={toggleSound}
            aria-label={soundState ? 'Mute sound' : 'Unmute sound'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            title={soundState ? 'Sound on' : 'Sound muted'}
          >
            {soundState ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-neutral-400" />
            )}
          </button>

          {/* Global Theme Toggle Button (Light / Dark) */}
          <ThemeToggle />

          {/* Account Profile & Cloud Sync */}
          <UserAccountMenu totalDecks={totalDecks} totalCards={totalCards} />
        </div>
      </div>
    </header>
  );
};
