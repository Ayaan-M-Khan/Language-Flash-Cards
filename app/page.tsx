'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import {
  deckService,
  loadSyncDirtyState,
  saveSyncDirtyState,
  setSyncedDeckIdsLocally,
} from '@/lib/deckService';
import {
  SyncDirtyState,
  createEmptyDirtyState,
  hasPendingDirtyWork,
  markCardDeletedInState,
  markCardDirtyInState,
  markDeckDeletedInState,
  markDeckDirtyInState,
  mergeLocalAndCloudState,
} from '@/lib/sync-merge';
import {
  recordUserStudyProgress,
  calculateNewStreak,
  syncUserProfile,
} from '@/lib/firestore-sync';
import { CheckCircle2 } from 'lucide-react';

// Account-isolated storage keys to prevent mixing between guest and user accounts
const getDecksStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_decks_${uid}` : 'language_flashcards_decks_guest';

const getCardsStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_cards_${uid}` : 'language_flashcards_cards_guest';

const getStreakStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_streak_${uid}` : 'language_flashcards_streak_guest';

const getDirectionsStorageKey = (uid?: string | null) =>
  uid ? `language_flashcards_directions_${uid}` : 'language_flashcards_directions_guest';

const CONTINUOUS_SYNC_INTERVAL_MS = 4000;
const MUTATION_FLUSH_DEBOUNCE_MS = 350;

export default function HomePage() {
  const { user, profile, updateLocalProfileStats } = useAuth();

  // Consistent initial state between server and client to eliminate hydration mismatches
  const [decks, setDecks] = useState<Deck[]>(INITIAL_DECKS);
  const [cards, setCards] = useState<Flashcard[]>(() =>
    sortCardsSequentially(INITIAL_CARDS, INITIAL_DECKS)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('study');
  const [selectedStudyDeckId, setSelectedStudyDeckId] = useState<string | null>(null);
  const [inspectingDeck, setInspectingDeck] = useState<Deck | null>(null);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [soundState, setSoundState] = useState<boolean>(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState<boolean>(false);
  const [hasSyncError, setHasSyncError] = useState<boolean>(false);
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
  const selectedStudyDeckIdRef = useRef<string | null>(selectedStudyDeckId);
  const dirtyStateRef = useRef<SyncDirtyState>(createEmptyDirtyState());
  const syncInFlightRef = useRef<boolean>(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(user?.uid ?? null);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
  }, [user?.uid]);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    deckDirectionsRef.current = deckDirections;
  }, [deckDirections]);

  useEffect(() => {
    selectedStudyDeckIdRef.current = selectedStudyDeckId;
  }, [selectedStudyDeckId]);

  const showToast = useCallback((msg: string, durationMs = 2800) => {
    setSyncToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setSyncToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  // Derive effective streak from profile when authenticated, or guest streak
  const effectiveStreak = profile?.streak ?? streakDays;

  // Flush pending dirty changes & deletions for the current authenticated user
  const runContinuousFlush = useCallback(async (forceCloudPull = false) => {
    const uid = userIdRef.current;
    if (!uid || hydratedOwnerRef.current !== uid) return;
    if (syncInFlightRef.current) return;

    const currentDirty = dirtyStateRef.current;
    if (!forceCloudPull && !hasPendingDirtyWork(currentDirty)) {
      return;
    }

    syncInFlightRef.current = true;
    setIsAutoSyncing(true);

    try {
      if (hasPendingDirtyWork(currentDirty)) {
        const res = await deckService.flushDirtyState(
          uid,
          decksRef.current,
          cardsRef.current,
          dirtyStateRef.current
        );
        // Merge cleared flags back without losing any NEW mutations added while flush was in-flight
        const latestDirty = dirtyStateRef.current;
        const uploadedSet = new Set(currentDirty.dirtyDeckIds);
        const uploadedCardSet = new Set(currentDirty.dirtyCardIds);
        const deletedDeckSet = new Set(currentDirty.deletedDeckIds);
        const deletedCardSet = new Set(currentDirty.deletedCards.map((c) => c.id));

        const resolvedDirty: SyncDirtyState = {
          dirtyDeckIds: Array.from(
            new Set([
              ...res.nextDirtyState.dirtyDeckIds,
              ...latestDirty.dirtyDeckIds.filter((id) => !uploadedSet.has(id)),
            ])
          ),
          dirtyCardIds: Array.from(
            new Set([
              ...res.nextDirtyState.dirtyCardIds,
              ...latestDirty.dirtyCardIds.filter((id) => !uploadedCardSet.has(id)),
            ])
          ),
          deletedDeckIds: Array.from(
            new Set([
              ...res.nextDirtyState.deletedDeckIds,
              ...latestDirty.deletedDeckIds.filter((id) => !deletedDeckSet.has(id)),
            ])
          ),
          deletedCards: Array.from(
            new Map(
              [
                ...res.nextDirtyState.deletedCards,
                ...latestDirty.deletedCards.filter((c) => !deletedCardSet.has(c.id)),
              ].map((c) => [c.id, c])
            ).values()
          ),
          knownCloudDeckIds: Array.from(
            new Set([
              ...res.nextDirtyState.knownCloudDeckIds,
              ...latestDirty.knownCloudDeckIds,
            ])
          ),
          knownCloudCardIds: Array.from(
            new Set([
              ...res.nextDirtyState.knownCloudCardIds,
              ...latestDirty.knownCloudCardIds,
            ])
          ),
        };

        dirtyStateRef.current = resolvedDirty;
        saveSyncDirtyState(uid, resolvedDirty);

        if (res.hadError) {
          setHasSyncError(true);
        } else {
          setHasSyncError(false);
          if (res.syncedCount > 0) {
            setLastSyncedTime(new Date());
          }
        }
      } else if (forceCloudPull) {
        const synced = await deckService.syncAllDecksWithCloud(
          uid,
          decksRef.current,
          cardsRef.current,
          dirtyStateRef.current
        );
        dirtyStateRef.current = synced.dirtyState;
        saveSyncDirtyState(uid, synced.dirtyState);

        if (hydratedOwnerRef.current === uid) {
          const prevDeckCount = decksRef.current.length;
          const prevCardCount = cardsRef.current.length;
          decksRef.current = synced.decks;
          cardsRef.current = synced.cards;
          setDecks(synced.decks);
          setCards(synced.cards);
          if (
            prevDeckCount !== synced.decks.length ||
            prevCardCount !== synced.cards.length
          ) {
            setStudySyncVersion((v) => v + 1);
          }
          try {
            localStorage.setItem(getDecksStorageKey(uid), JSON.stringify(synced.decks));
            localStorage.setItem(getCardsStorageKey(uid), JSON.stringify(synced.cards));
          } catch {}
        }

        setHasSyncError(false);
        setLastSyncedTime(new Date());
      }
    } catch (err) {
      setHasSyncError(true);
      console.warn('Continuous auto-sync cycle skipped:', err);
    } finally {
      syncInFlightRef.current = false;
      setIsAutoSyncing(false);
    }
  }, []);

  const scheduleDirtyFlush = useCallback(
    (uid: string | null | undefined, nextDirty: SyncDirtyState) => {
      if (!uid) return;
      dirtyStateRef.current = nextDirty;
      saveSyncDirtyState(uid, nextDirty);

      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        runContinuousFlush(false);
      }, MUTATION_FLUSH_DEBOUNCE_MS);
    },
    [runContinuousFlush]
  );

  // Account-Based Cross-Device Cloud Synchronization:
  // When user logs in with Google, migrate any local guest/unsynced decks to Firestore
  // non-destructively, load all cloud decks, and attach real-time listeners AFTER initial merge.
  const userUid = user?.uid ?? null;

  useEffect(() => {
    let isCancelled = false;
    let unsubDecks: (() => void) | null = null;
    const previousOwner = lastOwnerBeforeAuthChangeRef.current;

    // Suspend localStorage writes until targetOwner finishes hydrating
    hydratedOwnerRef.current = null;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const initAccountOrGuestData = async () => {
      if (userUid) {
        const currentUserId = userUid;
        dirtyStateRef.current = loadSyncDirtyState(currentUserId);

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

        setIsAutoSyncing(true);

        // Non-destructively merge local/guest decks & load authoritative cross-device decks from Firestore
        try {
          const synced = await deckService.migrateLocalDecksToAccount(
            currentUserId,
            inMemoryGuestDecks,
            inMemoryGuestCards
          );
          if (isCancelled) return;

          dirtyStateRef.current = synced.dirtyState;
          saveSyncDirtyState(currentUserId, synced.dirtyState);

          setDecks(synced.decks);
          setCards(synced.cards);
          hydratedOwnerRef.current = currentUserId;
          lastOwnerBeforeAuthChangeRef.current = currentUserId;
          setStudySyncVersion((v) => v + 1);
          setLastSyncedTime(new Date());

          if (synced.migratedCount > 0) {
            showToast(
              `Synced ${synced.migratedCount} local ${
                synced.migratedCount === 1 ? 'deck' : 'decks'
              } to your Google account`,
              3500
            );
          }

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
          if (!isCancelled) setIsAutoSyncing(false);
        }

        // Subscribe to real-time updates across all devices AFTER initial migration settles.
        // Uses non-destructive mergeLocalAndCloudState so incoming snapshots NEVER wipe unsynced local changes.
        if (!isCancelled) {
          unsubDecks = deckService.subscribeUserDecks(
            currentUserId,
            (liveData) => {
              if (isCancelled || hydratedOwnerRef.current !== currentUserId) return;

              const merged = mergeLocalAndCloudState({
                localDecks: decksRef.current,
                localCards: cardsRef.current,
                cloudDecks: liveData.decks,
                cloudCards: liveData.cards,
                dirtyState: dirtyStateRef.current,
                isAuthoritativeCloudSnapshot: liveData.decks.length > 0,
              });

              dirtyStateRef.current = merged.nextDirtyState;
              saveSyncDirtyState(currentUserId, merged.nextDirtyState);
              setSyncedDeckIdsLocally(
                currentUserId,
                merged.decks.map((d) => d.id)
              );

              if (
                selectedStudyDeckIdRef.current &&
                merged.decks.length > 0 &&
                !merged.decks.some((d) => d.id === selectedStudyDeckIdRef.current)
              ) {
                setSelectedStudyDeckId(null);
              }

              const prevDeckCount = decksRef.current.length;
              const prevCardCount = cardsRef.current.length;

              setDecks(merged.decks);
              setCards(merged.cards);

              if (prevDeckCount !== merged.decks.length || prevCardCount !== merged.cards.length) {
                setStudySyncVersion((v) => v + 1);
              }

              setLastSyncedTime(new Date());

              try {
                localStorage.setItem(
                  getDecksStorageKey(currentUserId),
                  JSON.stringify(merged.decks)
                );
                localStorage.setItem(
                  getCardsStorageKey(currentUserId),
                  JSON.stringify(merged.cards)
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
        dirtyStateRef.current = createEmptyDirtyState();
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
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [userUid, showToast]);

  // Continuous background auto-sync loop every 4 seconds while signed in,
  // plus immediate flush on browser reconnect or tab hide.
  useEffect(() => {
    if (!user?.uid) return;

    const intervalId = setInterval(() => {
      runContinuousFlush(false);
    }, CONTINUOUS_SYNC_INTERVAL_MS);

    const handleOnline = () => {
      runContinuousFlush(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        runContinuousFlush(false);
      } else if (document.visibilityState === 'visible') {
        runContinuousFlush(true);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.uid, runContinuousFlush]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

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

  // Handlers (all mark dirty state & update refs synchronously so continuous sync guarantees durability)
  const handleCardReviewed = (updatedCard: Flashcard, _rating: SM2Rating) => {
    const stampedCard: Flashcard = {
      ...updatedCard,
      updatedAt: updatedCard.updatedAt || new Date().toISOString(),
    };

    const nextCards = cardsRef.current.map((c) =>
      c.id === stampedCard.id ? stampedCard : c
    );
    cardsRef.current = nextCards;
    setCards(nextCards);

    if (user) {
      const nextDirty = markCardDirtyInState(dirtyStateRef.current, stampedCard.id);
      scheduleDirtyFlush(user.uid, nextDirty);

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
            nextCards
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
    const nowIso = new Date().toISOString();
    const stampedDeck: Deck = { ...newDeck, updatedAt: newDeck.updatedAt || nowIso };
    const orderedNewCards = sortCardsSequentially(newCards, [stampedDeck]).map((c) => ({
      ...c,
      updatedAt: c.updatedAt || nowIso,
    }));

    const nextDecks = [stampedDeck, ...decksRef.current];
    const nextCards = [...orderedNewCards, ...cardsRef.current];
    decksRef.current = nextDecks;
    cardsRef.current = nextCards;
    setDecks(nextDecks);
    setCards(nextCards);

    if (user) {
      let nextDirty = markDeckDirtyInState(dirtyStateRef.current, stampedDeck.id);
      for (const c of orderedNewCards) {
        nextDirty = markCardDirtyInState(nextDirty, c.id);
      }
      scheduleDirtyFlush(user.uid, nextDirty);
      showToast(`Created "${stampedDeck.title}" — syncing to account`);
    } else {
      showToast(`Created "${stampedDeck.title}"`);
    }
  };

  const handleDeleteDeck = (deckId: string) => {
    const cardIdsInDeck = cardsRef.current
      .filter((c) => c.deckId === deckId)
      .map((c) => c.id);

    const nextDecks = decksRef.current.filter((d) => d.id !== deckId);
    const nextCards = cardsRef.current.filter((c) => c.deckId !== deckId);
    decksRef.current = nextDecks;
    cardsRef.current = nextCards;
    setDecks(nextDecks);
    setCards(nextCards);
    if (selectedStudyDeckId === deckId) setSelectedStudyDeckId(null);
    if (inspectingDeck?.id === deckId) setInspectingDeck(null);

    if (user) {
      const nextDirty = markDeckDeletedInState(
        dirtyStateRef.current,
        deckId,
        cardIdsInDeck
      );
      scheduleDirtyFlush(user.uid, nextDirty);
    }
  };

  const handleResetCardSchedule = (cardId: string) => {
    const nowIso = new Date().toISOString();
    const nextCards = cardsRef.current.map((c) => {
      if (c.id === cardId) {
        const resetCard: Flashcard = {
          ...c,
          state: 'new',
          repetitions: 0,
          intervalDays: 0,
          easeFactor: 2.5,
          dueDate: nowIso,
          updatedAt: nowIso,
        };
        return resetCard;
      }
      return c;
    });
    cardsRef.current = nextCards;
    setCards(nextCards);

    if (user) {
      const nextDirty = markCardDirtyInState(dirtyStateRef.current, cardId);
      scheduleDirtyFlush(user.uid, nextDirty);
    }
  };

  const handleMakeCardDueToday = (cardId: string) => {
    const nowIso = new Date().toISOString();
    const nextCards = cardsRef.current.map((c) => {
      if (c.id === cardId) {
        return {
          ...c,
          dueDate: nowIso,
          updatedAt: nowIso,
        };
      }
      return c;
    });
    cardsRef.current = nextCards;
    setCards(nextCards);

    if (user) {
      const nextDirty = markCardDirtyInState(dirtyStateRef.current, cardId);
      scheduleDirtyFlush(user.uid, nextDirty);
    }
  };

  const handleAddCardToDeck = (newCard: Flashcard) => {
    const nowIso = new Date().toISOString();
    const stampedCard: Flashcard = {
      ...newCard,
      updatedAt: newCard.updatedAt || nowIso,
    };
    const nextCards = sortCardsSequentially(
      [...cardsRef.current, stampedCard],
      decksRef.current
    );
    cardsRef.current = nextCards;
    setCards(nextCards);
    if (user) {
      const nextDirty = markCardDirtyInState(dirtyStateRef.current, stampedCard.id);
      scheduleDirtyFlush(user.uid, nextDirty);
    }
  };

  const handleUpdateCard = (updatedCard: Flashcard) => {
    const stampedCard: Flashcard = {
      ...updatedCard,
      updatedAt: new Date().toISOString(),
    };
    const nextCards = cardsRef.current.map((c) =>
      c.id === stampedCard.id ? stampedCard : c
    );
    cardsRef.current = nextCards;
    setCards(nextCards);

    if (user) {
      const nextDirty = markCardDirtyInState(dirtyStateRef.current, stampedCard.id);
      scheduleDirtyFlush(user.uid, nextDirty);
      showToast('Card changes saved');
    } else {
      showToast('Card changes saved', 2000);
    }
  };

  const handleDeleteCard = (cardId: string) => {
    const cardToDelete = cardsRef.current.find((c) => c.id === cardId);
    const nextCards = cardsRef.current.filter((c) => c.id !== cardId);
    cardsRef.current = nextCards;
    setCards(nextCards);
    if (user && cardToDelete) {
      const nextDirty = markCardDeletedInState(
        dirtyStateRef.current,
        cardId,
        cardToDelete.deckId
      );
      scheduleDirtyFlush(user.uid, nextDirty);
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

      {/* Quiet Toast Feedback Indicator */}
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
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
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
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
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
          onUpdateCard={handleUpdateCard}
          onDeleteCard={handleDeleteCard}
        />
      )}

      {/* Minimal Footer with Auto-Sync Indicator & Credits */}
      <Footer
        user={user}
        isSyncing={isAutoSyncing}
        lastSyncedTime={lastSyncedTime}
        syncError={hasSyncError}
      />
    </div>
  );
}
