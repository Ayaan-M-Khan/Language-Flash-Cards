'use client';

import React from 'react';
import { CheckCircle2, Cloud, RefreshCw } from 'lucide-react';
import { User } from 'firebase/auth';

interface FooterProps {
  user: User | null;
  isSyncing: boolean;
  lastSyncedTime: Date | null;
  syncError?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  user,
  isSyncing,
  lastSyncedTime,
  syncError = false,
}) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full mt-auto border-t border-black/5 dark:border-white/10 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            Language Flashcards
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Created by <strong className="font-semibold text-neutral-800 dark:text-neutral-200">Ayaan Khan</strong>
          </span>
          <span className="hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline text-neutral-400 dark:text-neutral-500">
            © {currentYear}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="hidden md:inline text-neutral-400 dark:text-neutral-500">
            Space flip · 1–4 rate · K knew · E edit
          </span>
          <span className="hidden md:inline text-neutral-300 dark:text-neutral-700" aria-hidden="true">
            |
          </span>
          {user ? (
            <span className="inline-flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300 font-medium">
              {isSyncing ? (
                <RefreshCw className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
              ) : syncError ? (
                <RefreshCw className="w-3 h-3 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              )}
              <span>
                {isSyncing
                  ? 'Syncing...'
                  : syncError
                  ? 'Retrying sync...'
                  : lastSyncedTime
                  ? `Auto-synced ${lastSyncedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Auto-sync active'}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500">
              <Cloud className="w-3 h-3 shrink-0" />
              <span>Local mode</span>
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
