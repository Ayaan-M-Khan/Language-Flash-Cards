'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import {
  CloudCheck,
  Cloud,
  LogOut,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { playHapticFeedback } from '@/lib/audio';

interface UserAccountMenuProps {
  totalDecks: number;
  totalCards: number;
}

export const UserAccountMenu: React.FC<UserAccountMenuProps> = ({
  totalDecks,
  totalCards,
}) => {
  const { user, profile, isSyncing, signInWithGoogle, signOutUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSignIn = async () => {
    playHapticFeedback('tap');
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    playHapticFeedback('tap');
    setIsOpen(false);
    await signOutUser();
  };

  if (!user) {
    return (
      <button
        id="google-signin-btn"
        type="button"
        onClick={handleSignIn}
        disabled={isSyncing}
        title="Sign in with your Google Account to save progress, streaks, and language decks"
        className="inline-flex items-center gap-1.5 sm:gap-2 h-8 px-2 sm:px-3 rounded-lg bg-white dark:bg-[#18181B] border border-zinc-200 dark:border-white/[0.1] text-zinc-800 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-150 disabled:opacity-60 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Sign in</span>
      </button>
    );
  }

  const userInitials = (user.displayName || user.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        id="user-account-dropdown-btn"
        type="button"
        onClick={() => {
          playHapticFeedback('tap');
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1.5 sm:gap-2 h-8 pl-1 pr-2 sm:pr-2.5 rounded-lg bg-white dark:bg-[#18181B] border border-zinc-200/80 dark:border-white/[0.1] hover:border-zinc-300 dark:hover:border-white/[0.18] active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        title={`Account: ${user.email} (Cloud Synced)`}
      >
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt={user.displayName || 'Avatar'}
            width={24}
            height={24}
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-md object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-semibold flex items-center justify-center">
            {userInitials}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 text-blue-600 dark:text-blue-400 animate-spin" />
          ) : (
            <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="hidden sm:inline text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[110px] truncate">
            {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#111114] border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_12px_36px_-12px_rgba(15,23,42,0.18)] p-4 text-zinc-900 dark:text-zinc-100 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* User Header */}
          <div className="flex items-center gap-3 pb-3.5 border-b border-zinc-100 dark:border-white/[0.06]">
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || 'Avatar'}
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-xl object-cover border border-zinc-200/80 dark:border-white/[0.08] shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold flex items-center justify-center shrink-0">
                {userInitials}
              </div>
            )}
            <div className="overflow-hidden min-w-0">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {user.displayName || 'Language Learner'}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
            </div>
          </div>

          {/* Hairline-divided Progress Overview */}
          <div className="py-3.5 grid grid-cols-3 divide-x divide-zinc-100 dark:divide-white/[0.06] text-center tabular-nums">
            <div className="px-2">
              <div className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                {profile?.streak ?? 0}d
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Streak</div>
            </div>

            <div className="px-2">
              <div className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                {profile?.cardsMastered ?? 0}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Mastered</div>
            </div>

            <div className="px-2">
              <div className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                {profile?.totalReviews ?? 0}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Reviews</div>
            </div>
          </div>

          {/* Cloud Storage Summary */}
          <div className="py-3 border-t border-zinc-100 dark:border-white/[0.06] space-y-2 text-xs">
            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                Saved library
              </span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200 font-mono">
                {totalDecks}d · {totalCards}c
              </span>
            </div>

            <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Cloud sync
              </span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Active</span>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            id="signout-btn"
            type="button"
            onClick={handleSignOut}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-zinc-200/80 dark:border-white/[0.08] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
};
