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
    <footer className="w-full mt-auto border-t border-zinc-200/70 dark:border-white/[0.07] bg-transparent transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Language Flashcards
          </span>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
          <span>
            Created by <strong className="font-medium text-zinc-700 dark:text-zinc-300">Ayaan Khan</strong>
          </span>
          <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700" aria-hidden="true">·</span>
          <span className="hidden sm:inline text-zinc-400 dark:text-zinc-500 font-mono text-[11px]">
            © {currentYear}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="hidden md:inline text-zinc-400 dark:text-zinc-500 font-mono">
            Space flip · 1–4 rate · K knew · E edit
          </span>
          <span className="hidden md:inline text-zinc-200 dark:text-zinc-800" aria-hidden="true">
            /
          </span>
          {user ? (
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-medium">
              {isSyncing ? (
                <RefreshCw className="w-3 h-3 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
              ) : syncError ? (
                <RefreshCw className="w-3 h-3 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span>
                {isSyncing
                  ? 'Syncing...'
                  : syncError
                  ? 'Retrying sync...'
                  : lastSyncedTime
                  ? `Synced ${lastSyncedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Auto-sync active'}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
              <Cloud className="w-3 h-3 shrink-0" />
              <span>Local mode</span>
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
