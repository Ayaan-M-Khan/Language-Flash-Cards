'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { CardStudyView } from '@/components/CardStudyView';
import { TableImporter } from '@/components/TableImporter';
import { DecksView } from '@/components/DecksView';
import { ScheduleInspector } from '@/components/ScheduleInspector';
import { DeckDetailModal } from '@/components/DeckDetailModal';
import { Footer } from '@/components/Footer';
import { Deck, Flashcard, SM2Rating } from '@/lib/types';
import { INITIAL_DECKS, INITIAL_CARDS } from '@/lib/default-data';
import { isCardDue } from '@/lib/srs';
import { isSoundEnabled } from '@/lib/audio';
import { useAuth } from '@/lib/AuthContext';
import { deckService } from '@/lib/deckService';
import {
  recordUserStudyProgress,
  calculateNewStreak,
} from '@/lib/firestore-sync';
import { Cloud, CheckCircle2, RefreshCw } from 'lucide-react';

// Account-isolated storage keys to prevent mixing between guest and user accounts
const getDecksStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_decks_${uid}` : 'language_flashcards_decks_guest';

const getCardsStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_cards_${uid}` : 'language_flashcards_cards_guest';

const getStreakStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_streak_${uid}` : 'language_flashcards_streak_guest';

export default function HomePage() {
  const { user, profile, updateLocalProfileStats, signInWithGoogle } = useAuth();

  // Consistent initial state between server and client to eliminate hydration mismatches
  const [decks, setDecks] = useState<Deck[]>(INITIAL_DECKS);
  const [cards, setCards] = useState<Flashcard[]>(INITIAL_CARDS);
  const [activeTab, setActiveTab] = useState<ActiveTab>('study');
  const [selectedStudyDeckId, setSelectedStudyDeckId] = useState<string | null>(null);
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);
  const [hasDismissedAuthBanner, setHasDismissedAuthBanner] = useState(false);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [soundState, setSoundState] = useState<boolean>(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  // Derive effective streak from profile when authenticated, or guest streak
  const effectiveStreak = profile?.streak ?? streakDays;

  // Account-Based Data Synchronization:
  // When user logs in, load ONLY that account's decks from Firestore and attach real-time multi-device listeners.
  // When user logs out, cleanly revert to guest data without leaving account data in system storage.
  useEffect(() => {
    let isCancelled = false;
    let unsubDecks: (() => void) | null = null;

    const initAccountOrGuestData = async () => {
      if (user) {
        const currentUserId = user.uid;

        // Fast display from account-specific cache if available
        try {
          const cachedDecks = localStorage.getItem(getDecksStorageKey(currentUserId));
          const cachedCards = localStorage.getItem(getCardsStorageKey(currentUserId));
          if (cachedDecks && cachedCards) {
            const pDecks = JSON.parse(cachedDecks);
            const pCards = JSON.parse(cachedCards);
            if (Array.isArray(pDecks) && pDecks.length > 0 && !isCancelled) {
              setDecks(pDecks);
              setCards(pCards);
            }
          }
        } catch {}

        setIsManualSyncing(true);

        // Load this account's authoritative decks and cards from Firestore
        try {
          const synced = await deckService.migrateLocalDecksToAccount(currentUserId);
          if (isCancelled) return;
          if (synced && synced.decks.length > 0) {
            setDecks(synced.decks);
            setCards(synced.cards);
            setLastSyncedTime(new Date());
            setSyncToastMessage(`Account active • Synchronized with cloud`);
            setTimeout(() => setSyncToastMessage(null), 3500);
            try {
              localStorage.setItem(getDecksStorageKey(currentUserId), JSON.stringify(synced.decks));
              localStorage.setItem(getCardsStorageKey(currentUserId), JSON.stringify(synced.cards));
            } catch {}
          }
        } catch (err) {
          console.warn('Account sync error on login:', err);
        } finally {
          if (!isCancelled) setIsManualSyncing(false);
        }

        // Subscribe to real-time updates for this account so changes on other devices sync live
        if (!isCancelled) {
          unsubDecks = deckService.subscribeUserDecks(
            currentUserId,
            (liveData) => {
              if (isCancelled) return;
              if (liveData.decks.length > 0) {
                setDecks(liveData.decks);
                setCards(liveData.cards);
                setLastSyncedTime(new Date());
                try {
                  localStorage.setItem(getDecksStorageKey(currentUserId), JSON.stringify(liveData.decks));
                  localStorage.setItem(getCardsStorageKey(currentUserId), JSON.stringify(liveData.cards));
                } catch {}
              }
            },
            (err) => {
              console.warn('Live subscription error:', err);
            }
          );
        }
      } else {
        // Guest Mode: load guest storage or initial starter decks
        try {
          const guestDecksStr = localStorage.getItem(getDecksStorageKey(null));
          const guestCardsStr = localStorage.getItem(getCardsStorageKey(null));
          const guestStreakStr = localStorage.getItem(getStreakStorageKey(null));

          if (guestDecksStr && guestCardsStr) {
            const parsedDecks = JSON.parse(guestDecksStr);
            const parsedCards = JSON.parse(guestCardsStr);
            if (Array.isArray(parsedDecks) && parsedDecks.length > 0 && !isCancelled) {
              setDecks(parsedDecks);
              setCards(parsedCards);
            } else if (!isCancelled) {
              setDecks(INITIAL_DECKS);
              setCards(INITIAL_CARDS);
            }
          } else if (!isCancelled) {
            setDecks(INITIAL_DECKS);
            setCards(INITIAL_CARDS);
          }

          if (guestStreakStr && !isCancelled) {
            setStreakDays(Number(guestStreakStr) || 0);
          } else if (!isCancelled) {
            setStreakDays(0);
          }
        } catch {
          if (!isCancelled) {
            setDecks(INITIAL_DECKS);
            setCards(INITIAL_CARDS);
          }
        }
      }
    };

    initAccountOrGuestData();

    return () => {
      isCancelled = true;
      if (unsubDecks) unsubDecks();
    };
  }, [user]);

  // Persist decks and cards to account-specific local cache for offline/instant resume
  useEffect(() => {
    try {
      localStorage.setItem(getDecksStorageKey(user?.uid), JSON.stringify(decks));
    } catch {}
  }, [decks, user?.uid]);

  useEffect(() => {
    try {
      localStorage.setItem(getCardsStorageKey(user?.uid), JSON.stringify(cards));
    } catch {}
  }, [cards, user?.uid]);

  // Calculate cards due today across all decks
  const dueTodayCount = useMemo(() => {
    return cards.filter((c) => isCardDue(c)).length;
  }, [cards]);

  // Manual force sync handler for current account
  const handleManualSync = async () => {
    if (!user) return;
    setIsManualSyncing(true);
    try {
      const fresh = await deckService.getUserDecks(user.uid);
      if (fresh && fresh.decks.length > 0) {
        setDecks(fresh.decks);
        setCards(fresh.cards);
        setLastSyncedTime(new Date());
        setSyncToastMessage('Synchronized with account');
        setTimeout(() => setSyncToastMessage(null), 3000);
      }
    } catch (err) {
      console.warn('Manual sync failed:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Handlers
  const handleCardReviewed = (updatedCard: Flashcard, _rating: SM2Rating) => {
    const nextCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
    setCards(nextCards);

    if (user && profile) {
      // Sync card state to Firestore for this account
      deckService.updateCardReview(user.uid, updatedCard.deckId, updatedCard).catch((err) =>
        console.warn('Sync review card error:', err)
      );

      // Record study session progress (streak, total reviews, mastery) for this account
      recordUserStudyProgress(user.uid, profile, nextCards)
        .then((updatedProfile) => {
          if (updatedProfile) {
            updateLocalProfileStats(() => updatedProfile);
            setStreakDays(updatedProfile.streak);
            setLastSyncedTime(new Date());
          }
        })
        .catch((err) => console.warn('Sync progress error:', err));
    } else {
      // Guest local calculation
      const { newStreak, todayStr } = calculateNewStreak(
        streakDays,
        localStorage.getItem('language_flashcards_last_studied_guest') || undefined
      );
      localStorage.setItem('language_flashcards_last_studied_guest', todayStr);
      setStreakDays(newStreak);
      localStorage.setItem(getStreakStorageKey(null), String(newStreak));
    }
  };

  const handleDeckCreated = (newDeck: Deck, newCards: Flashcard[]) => {
    setDecks((prev) => [newDeck, ...prev]);
    setCards((prev) => [...newCards, ...prev]);

    if (user) {
      deckService.saveDeck(user.uid, newDeck, newCards)
        .then(() => {
          setLastSyncedTime(new Date());
          setSyncToastMessage(`Saved "${newDeck.title}" to your account`);
          setTimeout(() => setSyncToastMessage(null), 3000);
        })
        .catch((err) => console.warn('Save deck to cloud failed:', err));
    } else {
      setSyncToastMessage(`Created "${newDeck.title}" (Guest Mode)`);
      setTimeout(() => setSyncToastMessage(null), 3000);
    }
  };

  const handleDeleteDeck = (deckId: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    setCards((prev) => prev.filter((c) => c.deckId !== deckId));
    if (selectedStudyDeckId === deckId) setSelectedStudyDeckId(null);
    if (inspectingDeck?.id === deckId) setInspectingDeck(null);

    if (user) {
      deckService.deleteDeck(user.uid, deckId)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Delete deck from cloud failed:', err));
    }
  };

  const handleResetCardSchedule = (cardId: string) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id === cardId) {
          const resetCard: Flashcard = {
            ...c,
            state: 'new',
            repetitions: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            dueDate: new Date().toISOString(),
          };
          if (user) {
            deckService.updateCardReview(user.uid, resetCard.deckId, resetCard).catch((err) =>
              console.warn('Reset card schedule in cloud failed:', err)
            );
          }
          return resetCard;
        }
        return c;
      })
    );
  };

  const handleMakeCardDueToday = (cardId: string) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id === cardId) {
          const dueCard: Flashcard = {
            ...c,
            dueDate: new Date().toISOString(),
          };
          if (user) {
            deckService.updateCardReview(user.uid, dueCard.deckId, dueCard).catch((err) =>
              console.warn('Make card due in cloud failed:', err)
            );
          }
          return dueCard;
        }
        return c;
      })
    );
  };

  const handleAddCardToDeck = (newCard: Flashcard) => {
    setCards((prev) => [newCard, ...prev]);
    if (user) {
      deckService.saveCard(user.uid, newCard.deckId, newCard)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Add card to cloud failed:', err));
    }
  };

  const handleDeleteCard = (cardId: string) => {
    const cardToDelete = cards.find((c) => c.id === cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (user && cardToDelete) {
      deckService.deleteCard(user.uid, cardToDelete.deckId, cardId)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Delete card cloud error:', err));
    }
  };

  const handleSelectDeckToStudy = (deckId: string | null) => {
    setSelectedStudyDeckId(deckId);
    setActiveTab('study');
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] text-[#1c1c1e] flex flex-col antialiased selection:bg-blue-500 selection:text-white">
      {/* Apple-styled Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dueTodayCount={dueTodayCount}
        streakDays={effectiveStreak}
        soundState={soundState}
        onSoundToggle={setSoundState}
        totalDecks={decks.length}
        totalCards={cards.length}
      />

      {/* Cloud Account Sync Banner for Guests */}
      {!user && !hasDismissedAuthBanner && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-2.5 shadow-sm text-xs font-medium">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 shrink-0 text-blue-200" />
              <span>
                <strong>Save your progress across devices:</strong> Sign in with Google to sync your decks, review schedules, and streaks.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={signInWithGoogle}
                className="px-2.5 py-1 rounded-full bg-white text-blue-700 font-semibold text-[11px] shadow-2xs hover:bg-blue-50 active:scale-95 transition-all"
              >
                Sign In
              </button>
              <button
                onClick={() => setHasDismissedAuthBanner(true)}
                className="text-white/70 hover:text-white text-xs px-1.5"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Toast Feedback Indicator */}
      {syncToastMessage && (
        <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-neutral-900/90 backdrop-blur-md text-white text-xs font-medium shadow-lg border border-white/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{syncToastMessage}</span>
          </div>
        </div>
      )}

      {/* Main App Content Body */}
      <main className="flex-1 w-full pb-8">
        {activeTab === 'study' && (
          <CardStudyView
            cards={cards}
            decks={decks}
            selectedDeckId={selectedStudyDeckId}
            onSelectDeck={setSelectedStudyDeckId}
            onCardReviewed={handleCardReviewed}
            onNavigateToImport={() => setActiveTab('import')}
            currentStreak={effectiveStreak}
            userId={user?.uid}
          />
        )}

        {activeTab === 'decks' && (
          <DecksView
            decks={decks}
            cards={cards}
            onSelectDeckToStudy={(deckId) => handleSelectDeckToStudy(deckId)}
            onNavigateToImport={() => setActiveTab('import')}
            onDeleteDeck={handleDeleteDeck}
            onInspectDeck={setInspectingDeck}
            currentStreak={effectiveStreak}
            userId={user?.uid}
          />
        )}

        {activeTab === 'import' && (
          <TableImporter
            onDeckCreated={handleDeckCreated}
            onNavigateToStudy={(deckId) => {
              setSelectedStudyDeckId(deckId);
              setActiveTab('study');
            }}
          />
        )}

        {activeTab === 'schedule' && (
          <ScheduleInspector
            cards={cards}
            decks={decks}
            onResetCardSchedule={handleResetCardSchedule}
            onMakeCardDueToday={handleMakeCardDueToday}
            onNavigateToStudy={(deckId) => {
              if (deckId) setSelectedStudyDeckId(deckId);
              setActiveTab('study');
            }}
          />
        )}
      </main>

      {/* Modal for Deck Details / Card Browser */}
      {inspectingDeck && (
        <DeckDetailModal
          deck={inspectingDeck}
          cards={cards.filter((c) => c.deckId === inspectingDeck.id)}
          onClose={() => setInspectingDeck(null)}
          onStudyDeck={(deckId) => {
            setInspectingDeck(null);
            handleSelectDeckToStudy(deckId);
          }}
          onAddCardToDeck={handleAddCardToDeck}
          onDeleteCard={handleDeleteCard}
        />
      )}

      {/* Apple-styled Footer with Ayaan Khan Credits */}
      <Footer
        user={user}
        isSyncing={isManualSyncing}
        totalDecks={decks.length}
        totalCards={cards.length}
        lastSyncedTime={lastSyncedTime}
        onManualSync={handleManualSync}
      />
    </div>
  );
}
