'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import {
  CloudCheck,
  Cloud,
  LogOut,
  Flame,
  Award,
  CheckCircle2,
  RefreshCw,
  Sparkles,
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
  const { user, profile, isSyncing, syncStatus, signInWithGoogle, signOutUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  // If not signed in, show Apple-style Google Sign In button
  if (!user) {
    return (
      <button
        id="google-signin-btn"
        onClick={handleSignIn}
        disabled={isSyncing}
        title="Sign in with your Google Account to save progress, streaks, and language decks"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-neutral-300 text-neutral-800 text-xs font-semibold shadow-2xs hover:bg-neutral-50 active:scale-98 transition-all duration-200 disabled:opacity-60"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
        <span className="hidden sm:inline">Sign In with Google</span>
        <span className="sm:hidden">Sign In</span>
      </button>
    );
  }

  // User is signed in: show avatar + sync status pill
  const userInitials = (user.displayName || user.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        id="user-account-dropdown-btn"
        onClick={() => {
          playHapticFeedback('tap');
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-white/90 border border-black/5 hover:border-black/10 shadow-2xs hover:shadow-xs active:scale-98 transition-all"
        title={`Account: ${user.email} (Cloud Synced)`}
      >
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt={user.displayName || 'Avatar'}
            width={28}
            height={28}
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-full object-cover border border-neutral-200"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
            {userInitials}
          </div>
        )}

        <div className="flex items-center gap-1">
          {isSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          ) : (
            <CloudCheck className="w-3.5 h-3.5 text-emerald-500" />
          )}
          <span className="text-xs font-medium text-neutral-700 max-w-[80px] sm:max-w-[120px] truncate">
            {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
          </span>
        </div>
      </button>

      {/* Apple Card Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-3xl bg-white/95 backdrop-blur-2xl border border-neutral-200/80 shadow-xl p-4 text-neutral-900 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* User Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt={user.displayName || 'Avatar'}
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-2xl object-cover border border-neutral-200 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {userInitials}
              </div>
            )}
            <div className="overflow-hidden">
              <h4 className="text-sm font-bold text-neutral-900 truncate">
                {user.displayName || 'Language Learner'}
              </h4>
              <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">
                  Cloud Synced
                </span>
              </div>
            </div>
          </div>

          {/* Progress & Mastery Overview */}
          <div className="py-3 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-2xl bg-orange-50/80 border border-orange-100">
              <div className="flex items-center justify-center text-orange-600 mb-0.5">
                <Flame className="w-4 h-4 fill-orange-500" />
              </div>
              <div className="text-sm font-bold text-orange-700">
                {profile?.streak ?? 1}d
              </div>
              <div className="text-[10px] text-orange-600/80 font-medium">Streak</div>
            </div>

            <div className="p-2 rounded-2xl bg-indigo-50/80 border border-indigo-100">
              <div className="flex items-center justify-center text-indigo-600 mb-0.5">
                <Award className="w-4 h-4" />
              </div>
              <div className="text-sm font-bold text-indigo-700">
                {profile?.cardsMastered ?? 0}
              </div>
              <div className="text-[10px] text-indigo-600/80 font-medium">Mastered</div>
            </div>

            <div className="p-2 rounded-2xl bg-blue-50/80 border border-blue-100">
              <div className="flex items-center justify-center text-blue-600 mb-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-sm font-bold text-blue-700">
                {profile?.totalReviews ?? 0}
              </div>
              <div className="text-[10px] text-blue-600/80 font-medium">Reviews</div>
            </div>
          </div>

          {/* Cloud Storage Status Details */}
          <div className="mb-3 px-3 py-2 rounded-2xl bg-neutral-50 border border-neutral-200/60 text-xs text-neutral-600 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-neutral-500" />
              <span>Saved Decks</span>
            </div>
            <span className="font-semibold text-neutral-900">
              {totalDecks} decks ({totalCards} cards)
            </span>
          </div>

          {/* Sign Out Button */}
          <button
            id="signout-btn"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};
