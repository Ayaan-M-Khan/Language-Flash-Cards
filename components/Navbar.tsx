'use client';

import React from 'react';
import { Sparkles, Layers, FileSpreadsheet, Calendar, Volume2, VolumeX, Flame } from 'lucide-react';
import { isSoundEnabled, setSoundEnabled, playHapticFeedback } from '@/lib/audio';
import { UserAccountMenu } from './UserAccountMenu';

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
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-white/80 border-b border-black/5 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Apple-style Brand / App Identity */}
        <div
          onClick={() => handleTabClick('decks')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-base tracking-tight text-neutral-900">
                Language Flashcards
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
                SRS
              </span>
            </div>
            <p className="text-xs text-neutral-500 hidden sm:block">
              Spaced Repetition & Smart Decks
            </p>
          </div>
        </div>

        {/* Apple Segmented Control */}
        <nav
          aria-label="Navigation tabs"
          className="flex items-center p-1 bg-neutral-200/70 backdrop-blur-md rounded-2xl border border-black/5"
        >
          <button
            id="tab-study-btn"
            onClick={() => handleTabClick('study')}
            className={`relative flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'study'
                ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Study</span>
            {dueTodayCount > 0 && (
              <span
                suppressHydrationWarning
                className={`ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === 'study'
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-600/90 text-white'
                }`}
              >
                {dueTodayCount}
              </span>
            )}
          </button>

          <button
            id="tab-decks-btn"
            onClick={() => handleTabClick('decks')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'decks'
                ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Decks</span>
          </button>

          <button
            id="tab-import-btn"
            onClick={() => handleTabClick('import')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'import'
                ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Import</span> Table
          </button>

          <button
            id="tab-schedule-btn"
            onClick={() => handleTabClick('schedule')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'schedule'
                ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Schedule</span>
          </button>
        </nav>

        {/* Right Utility: Streak, Sound, and Account */}
        <div className="flex items-center gap-2">
          <div
            title={`${streakDays} Day Learning Streak`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200/60 text-orange-600 text-xs font-semibold select-none"
          >
            <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
            <span>{streakDays}d</span>
          </div>

          <button
            id="sound-toggle-btn"
            onClick={toggleSound}
            aria-label={soundState ? 'Mute sound' : 'Unmute sound'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            title={soundState ? 'Sound on' : 'Sound muted'}
          >
            {soundState ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 text-neutral-400" />
            )}
          </button>

          {/* Account Profile & Cloud Sync */}
          <UserAccountMenu totalDecks={totalDecks} totalCards={totalCards} />
        </div>
      </div>
    </header>
  );
};
