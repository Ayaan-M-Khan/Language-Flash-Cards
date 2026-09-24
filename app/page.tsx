'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { CardStudyView } from '@/components/CardStudyView';
import { TableImporter } from '@/components/TableImporter';
import { DecksView } from '@/components/DecksView';
import { ScheduleInspector } from '@/components/ScheduleInspector';
import { DeckDetailModal } from '@/components/DeckDetailModal';
import { Deck, Flashcard, SM2Rating } from '@/lib/types';
import { INITIAL_DECKS, INITIAL_CARDS } from '@/lib/default-data';
import { isCardDue } from '@/lib/srs';
import { isSoundEnabled } from '@/lib/audio';
import { useAuth } from '@/lib/AuthContext';
import {
  loadUserDecksAndCards,
  saveDeckAndCardsToFirestore,
  updateFlashcardReviewInFirestore,
  deleteDeckFromFirestore,
  recordUserStudyProgress,
  calculateNewStreak,
} from '@/lib/firestore-sync';
import { Cloud } from 'lucide-react';

const STORAGE_KEY_DECKS = 'language_flashcards_decks_v1';
const STORAGE_KEY_CARDS = 'language_flashcards_cards_v1';
const STORAGE_KEY_STREAK = 'language_flashcards_streak_v2';

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

  // Storage hydration guard to prevent overwriting saved items with initial placeholders
  const isStorageLoadedRef = useRef(false);

  // Hydrate client storage after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedDecks = localStorage.getItem(STORAGE_KEY_DECKS);
        if (savedDecks) {
          const parsed = JSON.parse(savedDecks);
          if (Array.isArray(parsed) && parsed.length > 0) setDecks(parsed);
        }
        const savedCards = localStorage.getItem(STORAGE_KEY_CARDS);
        if (savedCards) {
          const parsed = JSON.parse(savedCards);
          if (Array.isArray(parsed) && parsed.length > 0) setCards(parsed);
        }
        const savedStreak = localStorage.getItem(STORAGE_KEY_STREAK);
        if (savedStreak) setStreakDays(Number(savedStreak) || 0);
      } catch (err) {
        console.warn('Failed to load local state:', err);
      } finally {
        isStorageLoadedRef.current = true;
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Keep refs to current decks and cards for initial cloud migration
  const decksRef = useRef(decks);
  const cardsRef = useRef(cards);
  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Derive effective streak from profile when authenticated, or guest streak
  const effectiveStreak = profile?.streak ?? streakDays;

  // Load cloud data when user signs in
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.uid;
    let isCancelled = false;

    async function loadCloudData() {
      try {
        const cloudData = await loadUserDecksAndCards(currentUserId);
        if (isCancelled) return;

        if (cloudData && cloudData.decks.length > 0) {
          setDecks(cloudData.decks);
          setCards(cloudData.cards);
        } else {
          // If the account has no decks yet, migrate current initial/local decks to cloud
          for (const d of decksRef.current) {
            const dCards = cardsRef.current.filter((c) => c.deckId === d.id);
            await saveDeckAndCardsToFirestore(currentUserId, d, dCards);
          }
        }
      } catch (err) {
        console.warn('Failed to load user cloud data:', err);
      }
    }

    loadCloudData();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  // Save changes to localStorage as fallback only after initial storage hydration is complete
  useEffect(() => {
    if (!isStorageLoadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY_DECKS, JSON.stringify(decks));
    } catch {}
  }, [decks]);

  useEffect(() => {
    if (!isStorageLoadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(cards));
    } catch {}
  }, [cards]);

  // Calculate cards due today across all decks
  const dueTodayCount = useMemo(() => {
    return cards.filter((c) => isCardDue(c)).length;
  }, [cards]);

  // Handlers
  const handleCardReviewed = (updatedCard: Flashcard, _rating: SM2Rating) => {
    const nextCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
    setCards(nextCards);

    if (user && profile) {
      // Sync card state to Firestore
      updateFlashcardReviewInFirestore(user.uid, updatedCard.deckId, updatedCard).catch((err) =>
        console.warn('Sync review card error:', err)
      );

      // Record study session progress (streak, total reviews, mastery)
      recordUserStudyProgress(user.uid, profile, nextCards)
        .then((updatedProfile) => {
          if (updatedProfile) {
            updateLocalProfileStats(() => updatedProfile);
            setStreakDays(updatedProfile.streak);
          }
        })
        .catch((err) => console.warn('Sync progress error:', err));
    } else {
      // Guest local calculation
      const { newStreak, todayStr } = calculateNewStreak(
        streakDays,
        localStorage.getItem('last_studied_date') || undefined
      );
      localStorage.setItem('last_studied_date', todayStr);
      setStreakDays(newStreak);
      localStorage.setItem(STORAGE_KEY_STREAK, String(newStreak));
    }
  };

  const handleDeckCreated = (newDeck: Deck, newCards: Flashcard[]) => {
    setDecks((prev) => [newDeck, ...prev]);
    setCards((prev) => [...newCards, ...prev]);

    if (user) {
      saveDeckAndCardsToFirestore(user.uid, newDeck, newCards).catch((err) =>
        console.warn('Save deck to cloud failed:', err)
      );
    }
  };

  const handleDeleteDeck = (deckId: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    setCards((prev) => prev.filter((c) => c.deckId !== deckId));
    if (selectedStudyDeckId === deckId) setSelectedStudyDeckId(null);
    if (inspectingDeck?.id === deckId) setInspectingDeck(null);

    if (user) {
      deleteDeckFromFirestore(user.uid, deckId).catch((err) =>
        console.warn('Delete deck from cloud failed:', err)
      );
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
            updateFlashcardReviewInFirestore(user.uid, resetCard.deckId, resetCard).catch((err) =>
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
            updateFlashcardReviewInFirestore(user.uid, dueCard.deckId, dueCard).catch((err) =>
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
      const parentDeck = decks.find((d) => d.id === newCard.deckId);
      if (parentDeck) {
        saveDeckAndCardsToFirestore(user.uid, parentDeck, [newCard]).catch((err) =>
          console.warn('Add card to cloud failed:', err)
        );
      }
    }
  };

  const handleDeleteCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleSelectDeckToStudy = (deckId: string) => {
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
                <strong>Save your progress:</strong> Sign in to sync your study streaks, custom decks, and word mastery to your Google account.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={signInWithGoogle}
                className="px-2.5 py-1 rounded-full bg-white text-blue-700 font-semibold text-[11px] shadow-2xs hover:bg-blue-50 transition-colors"
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

      {/* Main App Content Body */}
      <main className="flex-1 w-full pb-16">
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
            onSelectDeckToStudy={handleSelectDeckToStudy}
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
    </div>
  );
}
