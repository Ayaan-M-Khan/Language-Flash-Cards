'use client';

import React from 'react';
import {
  Sparkles,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Laptop,
  Layers,
  Heart,
  Command,
} from 'lucide-react';
import { User } from 'firebase/auth';

interface FooterProps {
  user: User | null;
  isSyncing: boolean;
  totalDecks: number;
  totalCards: number;
  lastSyncedTime: Date | null;
  onManualSync: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  user,
  isSyncing,
  totalDecks,
  totalCards,
  lastSyncedTime,
  onManualSync,
}) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full mt-auto border-t border-black/5 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Top Sync & Status Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-neutral-200/60 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  Language Flashcards
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/50">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Spaced repetition learning engine across all your devices
              </p>
            </div>
          </div>

          {/* Real-time Multi-Device Sync Pill */}
          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100/90 dark:bg-neutral-850/90 border border-neutral-200/70 dark:border-neutral-700/70 text-xs text-neutral-700 dark:text-neutral-300 shadow-2xs">
              {user ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    Cross-Device Sync Active
                  </span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden md:inline">
                    {user.email}
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="font-medium text-neutral-600 dark:text-neutral-300">
                    Local Device Mode
                  </span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Sign in to sync across devices
                  </span>
                </>
              )}
            </div>

            {user && (
              <button
                onClick={onManualSync}
                disabled={isSyncing}
                title="Force sync data with Firestore cloud"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-medium shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 text-blue-600 dark:text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Middle: Feature Pills & Keyboard Shortcuts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-b border-neutral-200/60 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400">
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Multi-Platform Synchronized</span>
            </h4>
            <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Decks, card intervals, and review history automatically synchronize in real time between your laptop, tablet, and mobile browsers.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Speed Keyboard Shortcuts</span>
            </h4>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-700 dark:text-neutral-300">Space</span> flip / next
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-700 dark:text-neutral-300">1-4</span> ratings
              <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-neutral-700 dark:text-neutral-300">S</span> audio
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Your Library At A Glance</span>
            </h4>
            <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Managing <strong className="text-neutral-800 dark:text-neutral-200 font-semibold">{totalDecks}</strong> decks with <strong className="text-neutral-800 dark:text-neutral-200 font-semibold">{totalCards}</strong> active vocabulary flashcards.
              {lastSyncedTime && (
                <span className="block text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                  Last verified sync: {lastSyncedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Bottom Credits & Legal - PROMINENT AYAAN KHAN CREDIT */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <span>© {currentYear} Language Flashcards.</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium text-neutral-800 dark:text-neutral-200">
              Created by <strong className="font-bold text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Ayaan Khan</strong>
            </span>
          </div>

          <div className="flex items-center gap-4 text-neutral-400 dark:text-neutral-500 text-[11px]">
            <span>Powered by SuperMemo SM-2 &amp; Google Cloud</span>
            <span>•</span>
            <span>All rights reserved</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
