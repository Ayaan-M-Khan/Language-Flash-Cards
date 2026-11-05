'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { CardStudyView } from '@/components/CardStudyView';
import { TableImporter } from '@/components/TableImporter';
import { DecksView } from '@/components/DecksView';
import { ScheduleInspector } from '@/components/ScheduleInspector';
import { DeckDetailModal } from '@/components/DeckDetailModal';
import { Footer } from '@/components/Footer';
import { CardDirection, Deck, Flashcard, SM2Rating } from '@/lib/types';
import { INITIAL_DECKS, INITIAL_CARDS } from '@/lib/default-data';
import { isCardDue, sortCardsSequentially } from '@/lib/srs';
import { useAuth } from '@/lib/AuthContext';
import { deckService } from '@/lib/deckService';
import {
  recordUserStudyProgress,
  calculateNewStreak,
  syncUserProfile,
} from '@/lib/firestore-sync';
import { Cloud, CheckCircle2 } from 'lucide-react';

// Account-isolated storage keys to prevent mixing between guest and user accounts
const getDecksStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_decks_${uid}` : 'language_flashcards_decks_guest';

const getCardsStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_cards_${uid}` : 'language_flashcards_cards_guest';

const getStreakStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_streak_${uid}` : 'language_flashcards_streak_guest';

const getDirectionsStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_directions_${uid}` : 'language_flashcards_directions_guest';

export default function HomePage() {
  const { user, profile, updateLocalProfileStats, signInWithGoogle } = useAuth();

  // Consistent initial state between server and client to eliminate hydration mismatches
  const [decks, setDecks] = useState<Deck[]>(INITIAL_DECKS);
  const [cards, setCards] = useState<Flashcard[]>(() =>
    sortCardsSequentially(INITIAL_CARDS, INITIAL_DECKS)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('study');
  const [selectedStudyDeckId, setSelectedStudyDeckId] = useState<string | null>(null);
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);
  const [hasDismissedAuthBanner, setHasDismissedAuthBanner] = useState(false);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [soundState, setSoundState] = useState<boolean>(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const [studySyncVersion, setStudySyncVersion] = useState<number>(0);
  const [deckDirections, setDeckDirections] = useState<Record<string, CardDirection>>({});

  // Track which owner ('guest' or user.uid) has finished hydrating so we NEVER overwrite
  // a newly logged-in user's localStorage cache with stale guest state (or vice versa on logout).
  const hydratedOwnerRef = useRef<string | null>(null);
  const lastOwnerBeforeAuthChangeRef = useRef<string | null>(null);
  const decksRef = useRef<Deck[]>(decks);
  const cardsRef = useRef<Flashcard[]>(cards);
  const deckDirectionsRef = useRef<Record<string, CardDirection>>(deckDirections);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    deckDirectionsRef.current = deckDirections;
  }, [deckDirections]);

  // Derive effective streak from profile when authenticated, or guest streak
  const effectiveStreak = profile?.streak ?? streakDays;

  // Account-Based Cross-Device Cloud Synchronization:
  // When user logs in with Google, migrate any local guest/unsynced decks to Firestore,
  // load all cloud decks saved on any device, and attach real-time multi-device listeners.
  useEffect(() => {
    let isCancelled = false;
    let unsubDecks: (() => void) | null = null;
    const targetOwner = user ? user.uid : 'guest';
    const previousOwner = lastOwnerBeforeAuthChangeRef.current;

    // Immediately suspend localStorage writes until targetOwner finishes hydrating
    hydratedOwnerRef.current = null;

    const initAccountOrGuestData = async () => {
      if (user) {
        const currentUserId = user.uid;

        // Capture any in-memory guest decks created right before clicking "Sign In with Google"
        const inMemoryGuestDecks =
          previousOwner === 'guest' ? [...decksRef.current] : undefined;
        const inMemoryGuestCards =
          previousOwner === 'guest' ? [...cardsRef.current] : undefined;

        // Instant display from this specific user's local cache while cloud syncs
        try {
          const cachedDecks = localStorage.getItem(getDecksStorageKey(currentUserId));
          const cachedCards = localStorage.getItem(getCardsStorageKey(currentUserId));
          const cachedDirections = localStorage.getItem(getDirectionsStorageKey(currentUserId));
          const guestDirections =
            previousOwner === 'guest' ? { ...deckDirectionsRef.current } : {};

          if (cachedDirections) {
            const parsedDirs = JSON.parse(cachedDirections);
            if (parsedDirs && typeof parsedDirs === 'object' && !isCancelled) {
              setDeckDirections({ ...guestDirections, ...parsedDirs });
            }
          } else if (Object.keys(guestDirections).length > 0 && !isCancelled) {
            setDeckDirections(guestDirections);
          }

          if (cachedDecks && cachedCards) {
            const pDecks = JSON.parse(cachedDecks);
            const pCards = JSON.parse(cachedCards);
            if (Array.isArray(pDecks) && pDecks.length > 0 && !isCancelled) {
              const sortedCards = sortCardsSequentially(
                Array.isArray(pCards) ? pCards : [],
                pDecks
              );
              setDecks(pDecks);
              setCards(sortedCards);
              setStudySyncVersion((v) => v + 1);
            }
          }
        } catch {}

        setIsManualSyncing(true);

        // Migrate any local/guest decks & load authoritative cross-device decks from Firestore
        try {
          const synced = await deckService.migrateLocalDecksToAccount(
            currentUserId,
            inMemoryGuestDecks,
            inMemoryGuestCards
          );
          if (isCancelled) return;

          setDecks(synced.decks);
          setCards(synced.cards);
          hydratedOwnerRef.current = currentUserId;
          lastOwnerBeforeAuthChangeRef.current = currentUserId;
          setStudySyncVersion((v) => v + 1);
          setLastSyncedTime(new Date());

          if (synced.migratedCount > 0) {
            setSyncToastMessage(
              `Synced ${synced.migratedCount} local ${
                synced.migratedCount === 1 ? 'deck' : 'decks'
              } to your Google account`
            );
          } else {
            setSyncToastMessage(
              `Cloud synced • ${synced.decks.length} ${
                synced.decks.length === 1 ? 'deck' : 'decks'
              } loaded`
            );
          }
          setTimeout(() => setSyncToastMessage(null), 3500);

          try {
            localStorage.setItem(
              getDecksStorageKey(currentUserId),
              JSON.stringify(synced.decks)
            );
            localStorage.setItem(
              getCardsStorageKey(currentUserId),
              JSON.stringify(synced.cards)
            );
            localStorage.setItem(
              getDirectionsStorageKey(currentUserId),
              JSON.stringify(deckDirectionsRef.current)
            );
          } catch {}
        } catch (err) {
          console.warn('Account sync error on login:', err);
          if (!isCancelled) {
            hydratedOwnerRef.current = currentUserId;
            lastOwnerBeforeAuthChangeRef.current = currentUserId;
          }
        } finally {
          if (!isCancelled) setIsManualSyncing(false);
        }

        // Subscribe to real-time updates across all devices logged into this Google account
        if (!isCancelled) {
          unsubDecks = deckService.subscribeUserDecks(
            currentUserId,
            (liveData) => {
              if (isCancelled) return;
              setDecks((prevDecks) => {
                // If selected deck was deleted on another device, reset filter to All Decks
                if (
                  selectedStudyDeckId &&
                  liveData.decks.length > 0 &&
                  !liveData.decks.some((d) => d.id === selectedStudyDeckId)
                ) {
                  setSelectedStudyDeckId(null);
                }
                // Trigger study session queue load if deck count changed (e.g. new deck added on another device)
                if (prevDecks.length !== liveData.decks.length) {
                  setStudySyncVersion((v) => v + 1);
                }
                return liveData.decks;
              });
              setCards(liveData.cards);
              setLastSyncedTime(new Date());
              try {
                localStorage.setItem(
                  getDecksStorageKey(currentUserId),
                  JSON.stringify(liveData.decks)
                );
                localStorage.setItem(
                  getCardsStorageKey(currentUserId),
                  JSON.stringify(liveData.cards)
                );
              } catch {}
            },
            (err) => {
              console.warn('Live subscription error:', err);
            }
          );
        }
      } else {
        // Guest Mode: load guest storage or initial starter decks cleanly
        try {
          const guestDecksStr = localStorage.getItem(getDecksStorageKey(null));
          const guestCardsStr = localStorage.getItem(getCardsStorageKey(null));
          const guestStreakStr = localStorage.getItem(getStreakStorageKey(null));
          const guestDirectionsStr = localStorage.getItem(getDirectionsStorageKey(null));

          if (guestDirectionsStr && !isCancelled) {
            try {
              const parsedDirs = JSON.parse(guestDirectionsStr);
              if (parsedDirs && typeof parsedDirs === 'object') {
                setDeckDirections(parsedDirs);
              }
            } catch {}
          }

          if (guestDecksStr && guestCardsStr) {
            const parsedDecks = JSON.parse(guestDecksStr);
            const parsedCards = JSON.parse(guestCardsStr);
            if (Array.isArray(parsedDecks) && parsedDecks.length > 0 && !isCancelled) {
              setDecks(parsedDecks);
              setCards(
                sortCardsSequentially(
                  Array.isArray(parsedCards) ? parsedCards : [],
                  parsedDecks
                )
              );
            } else if (!isCancelled) {
              setDecks(INITIAL_DECKS);
              setCards(sortCardsSequentially(INITIAL_CARDS, INITIAL_DECKS));
            }
          } else if (!isCancelled) {
            setDecks(INITIAL_DECKS);
            setCards(sortCardsSequentially(INITIAL_CARDS, INITIAL_DECKS));
          }

          if (!isCancelled) {
            setStreakDays(guestStreakStr ? Number(guestStreakStr) || 0 : 0);
            hydratedOwnerRef.current = 'guest';
            lastOwnerBeforeAuthChangeRef.current = 'guest';
            setStudySyncVersion((v) => v + 1);
          }
        } catch {
          if (!isCancelled) {
            setDecks(INITIAL_DECKS);
            setCards(sortCardsSequentially(INITIAL_CARDS, INITIAL_DECKS));
            hydratedOwnerRef.current = 'guest';
            lastOwnerBeforeAuthChangeRef.current = 'guest';
            setStudySyncVersion((v) => v + 1);
          }
        }
      }
    };

    initAccountOrGuestData();

    return () => {
      isCancelled = true;
      if (unsubDecks) unsubDecks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Persist decks and cards ONLY after the current owner ('guest' or user.uid) has finished hydrating
  useEffect(() => {
    const activeOwner = user ? user.uid : 'guest';
    if (hydratedOwnerRef.current !== activeOwner) return;
    try {
      localStorage.setItem(getDecksStorageKey(user?.uid), JSON.stringify(decks));
    } catch {}
  }, [decks, user]);

  useEffect(() => {
    const activeOwner = user ? user.uid : 'guest';
    if (hydratedOwnerRef.current !== activeOwner) return;
    try {
      localStorage.setItem(getCardsStorageKey(user?.uid), JSON.stringify(cards));
    } catch {}
  }, [cards, user]);

  useEffect(() => {
    const activeOwner = user ? user.uid : 'guest';
    if (hydratedOwnerRef.current !== activeOwner) return;
    try {
      localStorage.setItem(
        getDirectionsStorageKey(user?.uid),
        JSON.stringify(deckDirections)
      );
    } catch {}
  }, [deckDirections, user]);

  // Calculate cards due today across all decks
  const dueTodayCount = useMemo(() => {
    return cards.filter((c) => isCardDue(c)).length;
  }, [cards]);

  // Manual force sync handler: pushes any unsynced local decks and pulls fresh account decks
  const handleManualSync = async () => {
    if (!user) return;
    setIsManualSyncing(true);
    try {
      const synced = await deckService.syncAllDecksWithCloud(
        user.uid,
        decksRef.current,
        cardsRef.current
      );
      setDecks(synced.decks);
      setCards(synced.cards);
      setStudySyncVersion((v) => v + 1);
      setLastSyncedTime(new Date());
      setSyncToastMessage('Synchronized all decks with Google account');
      setTimeout(() => setSyncToastMessage(null), 3000);
    } catch (err) {
      console.warn('Manual sync failed:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Handlers
  const handleCardReviewed = (updatedCard: Flashcard, _rating: SM2Rating) => {
    let nextCardsSnapshot: Flashcard[] = [];
    setCards((prev) => {
      nextCardsSnapshot = prev.map((c) => (c.id === updatedCard.id ? updatedCard : c));
      return nextCardsSnapshot;
    });

    if (user) {
      // Always persist card review state directly to Firestore for this Google account
      deckService
        .updateCardReview(user.uid, updatedCard.deckId, updatedCard)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Sync review card error:', err));

      // Update study streak & mastery statistics in Firestore
      const syncStats = async () => {
        try {
          const baseProfile =
            profile ||
            (await syncUserProfile(
              user.uid,
              user.email || 'user@example.com',
              user.displayName,
              user.photoURL
            ));
          const updatedProfile = await recordUserStudyProgress(
            user.uid,
            baseProfile,
            nextCardsSnapshot.length > 0 ? nextCardsSnapshot : cardsRef.current
          );
          if (updatedProfile) {
            updateLocalProfileStats(() => updatedProfile);
            setStreakDays(updatedProfile.streak);
          }
        } catch (err) {
          console.warn('Sync progress error:', err);
        }
      };
      syncStats();
    } else {
      // Guest local streak calculation
      try {
        const { newStreak, todayStr } = calculateNewStreak(
          streakDays,
          localStorage.getItem('language_flashcards_last_studied_guest') || undefined
        );
        localStorage.setItem('language_flashcards_last_studied_guest', todayStr);
        setStreakDays(newStreak);
        localStorage.setItem(getStreakStorageKey(null), String(newStreak));
      } catch {}
    }
  };

  const handleDeckCreated = (newDeck: Deck, newCards: Flashcard[]) => {
    const orderedNewCards = sortCardsSequentially(newCards, [newDeck]);
    setDecks((prev) => [newDeck, ...prev]);
    setCards((prev) => [...orderedNewCards, ...prev]);

    if (user) {
      deckService
        .saveDeck(user.uid, newDeck, orderedNewCards)
        .then(() => {
          setLastSyncedTime(new Date());
          setSyncToastMessage(`Saved "${newDeck.title}" to your Google account`);
          setTimeout(() => setSyncToastMessage(null), 3000);
        })
        .catch((err) => {
          console.warn('Save deck to cloud failed:', err);
        });
    } else {
      setSyncToastMessage(`Created "${newDeck.title}" (Sign in with Google to sync across devices)`);
      setTimeout(() => setSyncToastMessage(null), 3500);
    }
  };

  const handleDeleteDeck = (deckId: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    setCards((prev) => prev.filter((c) => c.deckId !== deckId));
    if (selectedStudyDeckId === deckId) setSelectedStudyDeckId(null);
    if (inspectingDeck?.id === deckId) setInspectingDeck(null);

    if (user) {
      deckService
        .deleteDeck(user.uid, deckId)
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
            deckService
              .updateCardReview(user.uid, resetCard.deckId, resetCard)
              .catch((err) => console.warn('Reset card schedule in cloud failed:', err));
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
            deckService
              .updateCardReview(user.uid, dueCard.deckId, dueCard)
              .catch((err) => console.warn('Make card due in cloud failed:', err));
          }
          return dueCard;
        }
        return c;
      })
    );
  };

  const handleAddCardToDeck = (newCard: Flashcard) => {
    setCards((prev) => sortCardsSequentially([...prev, newCard], decksRef.current));
    if (user) {
      deckService
        .saveCard(user.uid, newCard.deckId, newCard)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Add card to cloud failed:', err));
    }
  };

  const handleDeleteCard = (cardId: string) => {
    const cardToDelete = cards.find((c) => c.id === cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    if (user && cardToDelete) {
      deckService
        .deleteCard(user.uid, cardToDelete.deckId, cardId)
        .then(() => setLastSyncedTime(new Date()))
        .catch((err) => console.warn('Delete card cloud error:', err));
    }
  };

  const getDeckDirection = (deckId: string | null): CardDirection => {
    const key = deckId ?? 'all';
    return deckDirections[key] ?? 'target-first';
  };

  const handleSetDeckDirection = (deckId: string | null, direction: CardDirection) => {
    const key = deckId ?? 'all';
    setDeckDirections((prev) => ({
      ...prev,
      [key]: direction,
    }));
  };

  const handleSelectDeckToStudy = (deckId: string | null, direction?: CardDirection) => {
    if (direction) {
      handleSetDeckDirection(deckId, direction);
    }
    setSelectedStudyDeckId(deckId);
    setStudySyncVersion((v) => v + 1);
    setActiveTab('study');
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-[#0f141c] text-[#1c1c1e] dark:text-[#f3f4f6] flex flex-col antialiased selection:bg-blue-500 selection:text-white transition-colors">
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
            cardDirection={getDeckDirection(selectedStudyDeckId)}
            onChangeCardDirection={(dir) => handleSetDeckDirection(selectedStudyDeckId, dir)}
            onCardReviewed={handleCardReviewed}
            onNavigateToImport={() => setActiveTab('import')}
            currentStreak={effectiveStreak}
            userId={user?.uid}
            syncVersion={studySyncVersion}
          />
        )}

        {activeTab === 'decks' && (
          <DecksView
            decks={decks}
            cards={cards}
            deckDirections={deckDirections}
            onChangeDeckDirection={handleSetDeckDirection}
            onSelectDeckToStudy={(deckId, dir) => handleSelectDeckToStudy(deckId, dir)}
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
            onNavigateToStudy={(deckId, dir) => {
              handleSelectDeckToStudy(deckId, dir);
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
              setStudySyncVersion((v) => v + 1);
              setActiveTab('study');
            }}
          />
        )}
      </main>

      {/* Modal for Deck Details / Card Browser */}
      {inspectingDeck && (
        <DeckDetailModal
          deck={inspectingDeck}
          cards={sortCardsSequentially(
            cards.filter((c) => c.deckId === inspectingDeck.id),
            [inspectingDeck]
          )}
          cardDirection={getDeckDirection(inspectingDeck.id)}
          onChangeCardDirection={(dir) => handleSetDeckDirection(inspectingDeck.id, dir)}
          onClose={() => setInspectingDeck(null)}
          onStudyDeck={(deckId, dir) => {
            setInspectingDeck(null);
            handleSelectDeckToStudy(deckId, dir);
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
