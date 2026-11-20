'use client';

import React from 'react';
import { BookOpen, Layers, FileSpreadsheet, Calendar, Volume2, VolumeX, Flame } from 'lucide-react';
import { setSoundEnabled, playHapticFeedback } from '@/lib/audio';
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

  const navItems: { id: ActiveTab; btnId: string; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: 'study', btnId: 'tab-study-btn', label: 'Study', shortLabel: 'Study', icon: <BookOpen className="w-4 h-4 sm:hidden shrink-0" /> },
    { id: 'decks', btnId: 'tab-decks-btn', label: 'Decks', shortLabel: 'Decks', icon: <Layers className="w-4 h-4 sm:hidden shrink-0" /> },
    { id: 'import', btnId: 'tab-import-btn', label: 'Import Table', shortLabel: 'Import', icon: <FileSpreadsheet className="w-4 h-4 sm:hidden shrink-0" /> },
    { id: 'schedule', btnId: 'tab-schedule-btn', label: 'Schedule', shortLabel: 'Schedule', icon: <Calendar className="w-4 h-4 sm:hidden shrink-0" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#09090B]/80 backdrop-blur-xl border-b border-zinc-200/75 dark:border-white/[0.07] transition-colors">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-1.5 sm:gap-8">
        {/* Zone 1: Minimal Brand Mark */}
        <button
          type="button"
          onClick={() => handleTabClick('decks')}
          className="flex items-center gap-2.5 cursor-pointer group select-none shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
        >
          <span className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center transition-transform duration-150 group-hover:scale-[1.03] shrink-0">
            <BookOpen className="w-3.5 h-3.5" strokeWidth={2.25} />
          </span>
          <span className="hidden md:inline font-semibold text-[15px] tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
            Language Flashcards
          </span>
        </button>

        {/* Zone 2: Clean Editorial Text Navigation */}
        <nav
          aria-label="Navigation tabs"
          className="flex items-center h-full gap-0.5 sm:gap-6 shrink-0"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={item.btnId}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleTabClick(item.id)}
                className={`relative h-full inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-0.5 text-[13px] sm:text-sm transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:text-blue-600 ${
                  isActive
                    ? 'text-zinc-950 dark:text-white font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium'
                }`}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
                {item.id === 'study' && dueTodayCount > 0 && (
                  <span
                    suppressHydrationWarning
                    className={`font-mono text-[11px] tabular-nums transition-colors ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    {dueTodayCount}
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-900 dark:bg-white rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Quiet Utility Cluster & Account */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0 min-w-0">
          <div
            title={`${streakDays} Day Learning Streak`}
            className="hidden sm:flex items-center gap-1 px-2 text-zinc-600 dark:text-zinc-400 text-xs font-medium select-none font-mono tabular-nums whitespace-nowrap"
          >
            <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{streakDays}d</span>
          </div>

          <button
            id="sound-toggle-btn"
            type="button"
            onClick={toggleSound}
            aria-label={soundState ? 'Mute sound' : 'Unmute sound'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            title={soundState ? 'Sound on' : 'Sound muted'}
          >
            {soundState ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
            )}
          </button>

          <ThemeToggle />

          <span
            aria-hidden="true"
            className="hidden sm:block w-px h-4 bg-zinc-200 dark:bg-white/10 mx-1"
          />

          <UserAccountMenu totalDecks={totalDecks} totalCards={totalCards} />
        </div>
      </div>
    </header>
  );
};
