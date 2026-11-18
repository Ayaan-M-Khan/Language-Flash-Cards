'use client';

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Deck, Flashcard, ReviewLog, SM2Rating } from './types';
import { INITIAL_DECKS, INITIAL_CARDS } from './default-data';
import { sortCardsSequentially } from './srs';

import {
  SyncDirtyState,
  createEmptyDirtyState,
  normalizeDirtyState,
  mergeLocalAndCloudState,
  mergeGuestIntoAccountState,
  sortDecksDeterministically,
  hasPendingDirtyWork,
  executeDirtyFlush,
  sanitizeFirestoreId,
  buildDeckFirestorePayload,
  buildCardFirestorePayload,
} from './sync-merge';

export { sanitizeFirestoreId, buildDeckFirestorePayload, buildCardFirestorePayload };

export const LOCAL_DECKS_STORAGE_KEY = 'language_flashcards_decks_guest';
export const LOCAL_CARDS_STORAGE_KEY = 'language_flashcards_cards_guest';
export const LEGACY_LOCAL_STORAGE_KEY = 'local_decks';

const STARTER_DECK_IDS = new Set([
  'deck-spanish-core',
  'deck-japanese-travel',
  'deck-french-cafe',
]);

export function getSyncMetaStorageKey(userId: string): string {
  return `language_flashcards_sync_meta_${userId}`;
}

export function loadSyncDirtyState(userId: string): SyncDirtyState {
  if (typeof window === 'undefined' || !userId) return createEmptyDirtyState();
  try {
    const raw = localStorage.getItem(getSyncMetaStorageKey(userId));
    if (!raw) return createEmptyDirtyState();
    return normalizeDirtyState(JSON.parse(raw));
  } catch {
    return createEmptyDirtyState();
  }
}

export function saveSyncDirtyState(userId: string, state: SyncDirtyState): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(getSyncMetaStorageKey(userId), JSON.stringify(state));
  } catch {}
}

export function getSyncedDeckIdsStorageKey(userId: string): string {
  return `language_flashcards_synced_decks_${userId}`;
}

export function markDeckSyncedLocally(userId: string, deckId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getSyncedDeckIdsStorageKey(userId);
    const raw = localStorage.getItem(key);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const next = Array.from(new Set([...(Array.isArray(existing) ? existing : []), deckId]));
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

export function setSyncedDeckIdsLocally(userId: string, deckIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getSyncedDeckIdsStorageKey(userId),
      JSON.stringify(Array.from(new Set(deckIds)))
    );
  } catch {}
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapFirestoreDocToDeck(docId: string, deckData: Partial<Deck>): Deck {
  return {
    id: deckData.id || docId,
    title: deckData.title || 'Vocabulary Deck',
    language: deckData.language || 'Language',
    languageCode: deckData.languageCode || 'es-ES',
    color: deckData.color || 'blue',
    description: deckData.description || '',
    icon: deckData.icon || 'Sparkles',
    createdAt: deckData.createdAt || new Date().toISOString(),
    updatedAt: deckData.updatedAt,
  };
}

function mapFirestoreDocToCard(
  docId: string,
  deck: Deck,
  cData: Partial<Flashcard>
): Flashcard {
  const card: Flashcard = {
    id: cData.id || docId,
    deckId: deck.id,
    english: cData.english || '',
    targetWord: cData.targetWord || '',
    language: cData.language || deck.language,
    phonetic: cData.phonetic,
    partOfSpeech: cData.partOfSpeech,
    category: cData.category,
    exampleSentence: cData.exampleSentence,
    notes: cData.notes,
    orderIndex: typeof cData.orderIndex === 'number' ? cData.orderIndex : undefined,
    createdAt: cData.createdAt,
    updatedAt: cData.updatedAt,
    state: cData.state || 'new',
    repetitions: cData.repetitions ?? 0,
    intervalDays: cData.intervalDays ?? 0,
    easeFactor: cData.easeFactor ?? 2.5,
    dueDate: cData.dueDate || new Date().toISOString(),
    lastReviewedAt: cData.lastReviewedAt,
  };
  return card;
}

export interface UserDecksResult {
  decks: Deck[];
  cards: Flashcard[];
}

export const deckService = {
  /**
   * Get all decks and cards for the authenticated Google user from Firestore
   */
  async getUserDecks(targetUserId?: string): Promise<UserDecksResult> {
    const user = auth.currentUser;
    const userId = targetUserId || user?.uid;
    if (!userId) {
      throw new Error('User must be signed in to load account decks from cloud.');
    }

    const decksPath = `users/${userId}/decks`;
    try {
      const decksSnap = await getDocs(collection(db, 'users', userId, 'decks'));
      const rawDecks = decksSnap.docs.map((dDoc) =>
        mapFirestoreDocToDeck(dDoc.id, dDoc.data() as Partial<Deck>)
      );
      const loadedDecks = sortDecksDeterministically(rawDecks);

      const cardsPerDeck = await Promise.all(
        loadedDecks.map(async (deck) => {
          const cardsSnap = await getDocs(
            collection(db, 'users', userId, 'decks', deck.id, 'cards')
          );
          return cardsSnap.docs.map((cDoc) =>
            mapFirestoreDocToCard(cDoc.id, deck, cDoc.data() as Partial<Flashcard>)
          );
        })
      );

      const loadedCards = sortCardsSequentially(cardsPerDeck.flat(), loadedDecks);
      return { decks: loadedDecks, cards: loadedCards };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, decksPath);
      return { decks: [], cards: [] };
    }
  },

  /**
   * Subscribe to real-time live synchronization of decks & cards across all devices.
   * Waits until all active decks have loaded their initial card snapshots before emitting
   * so cards never flicker to empty on initial subscription.
   */
  subscribeUserDecks(
    userId: string,
    onUpdate: (data: { decks: Deck[]; cards: Flashcard[] }) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    let isDisposed = false;
    const cardUnsubs: Map<string, Unsubscribe> = new Map();
    const initializedCardDecks: Set<string> = new Set();
    let currentDecks: Deck[] = [];
    const currentCardsByDeck: Map<string, Flashcard[]> = new Map();

    const emitIfReady = () => {
      if (isDisposed) return;
      const allDecksReady = currentDecks.every((d) => initializedCardDecks.has(d.id));
      if (!allDecksReady) return;

      const allCards: Flashcard[] = [];
      for (const deck of currentDecks) {
        const deckCards = currentCardsByDeck.get(deck.id) || [];
        allCards.push(...deckCards);
      }
      onUpdate({
        decks: currentDecks,
        cards: sortCardsSequentially(allCards, currentDecks),
      });
    };

    const decksColRef = collection(db, 'users', userId, 'decks');
    const unsubDecks = onSnapshot(
      decksColRef,
      (decksSnapshot) => {
        if (isDisposed) return;
        // Skip empty cold-cache snapshots so offline cache never flashes empty before server responds
        if (decksSnapshot.metadata.fromCache && decksSnapshot.empty) {
          return;
        }
        const rawDecks: Deck[] = [];
        const activeDeckIds = new Set<string>();

        decksSnapshot.docs.forEach((docSnap) => {
          const mapped = mapFirestoreDocToDeck(
            docSnap.id,
            docSnap.data() as Partial<Deck>
          );
          rawDecks.push(mapped);
          activeDeckIds.add(mapped.id);
        });

        currentDecks = sortDecksDeterministically(rawDecks);

        // Clean up card listeners for decks deleted on another device
        for (const [deckId, unsub] of cardUnsubs.entries()) {
          if (!activeDeckIds.has(deckId)) {
            unsub();
            cardUnsubs.delete(deckId);
            currentCardsByDeck.delete(deckId);
            initializedCardDecks.delete(deckId);
          }
        }

        if (currentDecks.length === 0) {
          onUpdate({ decks: [], cards: [] });
          return;
        }

        // Attach listeners for newly discovered decks
        currentDecks.forEach((deck) => {
          if (!cardUnsubs.has(deck.id)) {
            const cardsColRef = collection(db, 'users', userId, 'decks', deck.id, 'cards');
            const unsubCard = onSnapshot(
              cardsColRef,
              (cardsSnapshot) => {
                if (isDisposed) return;
                const deckCards = cardsSnapshot.docs.map((cDoc) =>
                  mapFirestoreDocToCard(
                    cDoc.id,
                    deck,
                    cDoc.data() as Partial<Flashcard>
                  )
                );
                currentCardsByDeck.set(deck.id, sortCardsSequentially(deckCards, [deck]));
                initializedCardDecks.add(deck.id);
                emitIfReady();
              },
              (err) => {
                console.warn(`Card sync error for deck ${deck.id}:`, err);
                initializedCardDecks.add(deck.id);
                if (onError) onError(err);
              }
            );
            cardUnsubs.set(deck.id, unsubCard);
          }
        });

        emitIfReady();
      },
      (err) => {
        console.warn('Decks sync error:', err);
        if (onError) onError(err);
      }
    );

    return () => {
      isDisposed = true;
      unsubDecks();
      cardUnsubs.forEach((unsub) => unsub());
      cardUnsubs.clear();
      currentCardsByDeck.clear();
      initializedCardDecks.clear();
    };
  },

  /**
   * Save or update a Deck with all of its Flashcards in Firestore.
   */
  async saveDeck(
    userIdOrDeck: string | (Deck & { cards?: Flashcard[]; userId?: string }),
    maybeDeck?: Deck,
    cards: Flashcard[] = []
  ): Promise<void> {
    let userId: string;
    let deck: Deck;
    let cardsToSave: Flashcard[] = cards;

    if (typeof userIdOrDeck === 'string') {
      userId = userIdOrDeck;
      if (!maybeDeck) throw new Error('Deck object must be provided');
      deck = maybeDeck;
    } else {
      deck = userIdOrDeck;
      userId = userIdOrDeck.userId || auth.currentUser?.uid || '';
      if (!userId) {
        throw new Error('User must be signed in to save decks to their account.');
      }
      if (Array.isArray(userIdOrDeck.cards) && cardsToSave.length === 0) {
        cardsToSave = userIdOrDeck.cards;
      }
    }

    const safeDeckId = sanitizeFirestoreId(deck.id, 'deck');
    const basePath = `users/${userId}/decks/${safeDeckId}`;

    try {
      const deckRef = doc(db, 'users', userId, 'decks', safeDeckId);
      const deckPayload = buildDeckFirestorePayload(userId, { ...deck, id: safeDeckId });

      const orderedCards = sortCardsSequentially(cardsToSave, [{ id: safeDeckId }]);
      const initialBatch = writeBatch(db);
      initialBatch.set(deckRef, deckPayload, { merge: true });

      const CHUNK_SIZE = 400;
      const firstChunk = orderedCards.slice(0, CHUNK_SIZE);
      firstChunk.forEach((card, idx) => {
        const safeCardId = sanitizeFirestoreId(card.id, 'card');
        const cardRef = doc(db, 'users', userId, 'decks', safeDeckId, 'cards', safeCardId);
        const cardPayload = buildCardFirestorePayload(
          userId,
          safeDeckId,
          { ...card, id: safeCardId },
          card.orderIndex ?? idx,
          deck.language
        );
        initialBatch.set(cardRef, cardPayload, { merge: true });
      });

      await initialBatch.commit();

      for (let i = CHUNK_SIZE; i < orderedCards.length; i += CHUNK_SIZE) {
        const chunkBatch = writeBatch(db);
        const chunk = orderedCards.slice(i, i + CHUNK_SIZE);
        chunk.forEach((card, offset) => {
          const idx = i + offset;
          const safeCardId = sanitizeFirestoreId(card.id, 'card');
          const cardRef = doc(db, 'users', userId, 'decks', safeDeckId, 'cards', safeCardId);
          const cardPayload = buildCardFirestorePayload(
            userId,
            safeDeckId,
            { ...card, id: safeCardId },
            card.orderIndex ?? idx,
            deck.language
          );
          chunkBatch.set(cardRef, cardPayload, { merge: true });
        });
        await chunkBatch.commit();
      }

      markDeckSyncedLocally(userId, safeDeckId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, basePath);
    }
  },

  /**
   * Save an individual card to Firestore
   */
  async saveCard(
    userIdOrDeckId: string,
    deckIdOrCard: string | Flashcard,
    maybeCard?: Flashcard
  ): Promise<void> {
    let userId: string;
    let deckId: string;
    let card: Flashcard;

    if (maybeCard) {
      userId = userIdOrDeckId;
      deckId = deckIdOrCard as string;
      card = maybeCard;
    } else {
      userId = auth.currentUser?.uid || '';
      deckId = userIdOrDeckId;
      card = deckIdOrCard as Flashcard;
    }

    if (!userId) throw new Error('User must be signed in to save cards to their account.');

    const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
    const safeCardId = sanitizeFirestoreId(card.id, 'card');
    const path = `users/${userId}/decks/${safeDeckId}/cards/${safeCardId}`;
    try {
      const cardRef = doc(db, 'users', userId, 'decks', safeDeckId, 'cards', safeCardId);
      const payload = buildCardFirestorePayload(userId, safeDeckId, {
        ...card,
        id: safeCardId,
      });
      await setDoc(cardRef, payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  /**
   * Update an existing Flashcard review state (with automatic upsert fallback if missing)
   */
  async updateCardReview(
    userIdOrDeckId: string,
    deckIdOrCard: string | Flashcard,
    maybeCard?: Flashcard
  ): Promise<void> {
    let userId: string;
    let deckId: string;
    let card: Flashcard;

    if (maybeCard) {
      userId = userIdOrDeckId;
      deckId = deckIdOrCard as string;
      card = maybeCard;
    } else {
      userId = auth.currentUser?.uid || '';
      deckId = userIdOrDeckId;
      card = deckIdOrCard as Flashcard;
    }

    if (!userId) throw new Error('User must be signed in to update card review.');

    const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
    const safeCardId = sanitizeFirestoreId(card.id, 'card');
    const path = `users/${userId}/decks/${safeDeckId}/cards/${safeCardId}`;
    const cardRef = doc(db, 'users', userId, 'decks', safeDeckId, 'cards', safeCardId);

    try {
      const updates: Record<string, unknown> = {
        state: card.state,
        repetitions: Math.max(0, card.repetitions ?? 0),
        intervalDays: Math.max(0, card.intervalDays ?? 0),
        easeFactor: Math.max(1.3, card.easeFactor || 2.5),
        dueDate: card.dueDate,
        updatedAt: (card.updatedAt || new Date().toISOString()).slice(0, 40),
      };
      if (typeof card.lastReviewedAt === 'string' && card.lastReviewedAt.length > 0) {
        updates.lastReviewedAt = card.lastReviewedAt.slice(0, 40);
      }
      await updateDoc(cardRef, updates);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      if (code === 'not-found' || message.includes('No document to update')) {
        try {
          const fullPayload = buildCardFirestorePayload(userId, safeDeckId, {
            ...card,
            id: safeCardId,
          });
          await setDoc(cardRef, fullPayload, { merge: true });
          return;
        } catch (fallbackErr) {
          handleFirestoreError(fallbackErr, OperationType.WRITE, path);
        }
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  },

  /**
   * Delete a deck and all cards from Firestore
   */
  async deleteDeck(userIdOrDeckId: string, maybeDeckId?: string): Promise<void> {
    const userId = maybeDeckId ? userIdOrDeckId : auth.currentUser?.uid;
    const deckId = maybeDeckId || userIdOrDeckId;
    if (!userId) throw new Error('User must be signed in to delete deck.');

    const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
    const path = `users/${userId}/decks/${safeDeckId}`;
    try {
      const cardsColRef = collection(db, 'users', userId, 'decks', safeDeckId, 'cards');
      const cardsSnap = await getDocs(cardsColRef);
      const docs = cardsSnap.docs;

      const CHUNK_SIZE = 400;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunkBatch = writeBatch(db);
        docs.slice(i, i + CHUNK_SIZE).forEach((d) => chunkBatch.delete(d.ref));
        await chunkBatch.commit();
      }

      const deckRef = doc(db, 'users', userId, 'decks', safeDeckId);
      await deleteDoc(deckRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  /**
   * Delete a single card from Firestore
   */
  async deleteCard(
    userIdOrDeckId: string,
    deckIdOrCardId: string,
    maybeCardId?: string
  ): Promise<void> {
    let userId: string;
    let deckId: string;
    let cardId: string;

    if (maybeCardId) {
      userId = userIdOrDeckId;
      deckId = deckIdOrCardId;
      cardId = maybeCardId;
    } else {
      userId = auth.currentUser?.uid || '';
      deckId = userIdOrDeckId;
      cardId = deckIdOrCardId;
    }

    if (!userId) throw new Error('User must be signed in to delete card.');

    const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
    const safeCardId = sanitizeFirestoreId(cardId, 'card');
    const path = `users/${userId}/decks/${safeDeckId}/cards/${safeCardId}`;
    try {
      const cardRef = doc(db, 'users', userId, 'decks', safeDeckId, 'cards', safeCardId);
      await deleteDoc(cardRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  /**
   * Record a study review log entry under users/{userId}/studyLogs/{logId} and users/{userId}/reviews/{reviewId}
   * and update aggregate daily progress counters
   */
  async recordStudyLog(
    userId: string,
    deckId: string,
    cardId: string,
    rating: SM2Rating,
    intervalDays: number
  ): Promise<void> {
    const logId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const todayStr = getTodayDateString();
    const timestamp = new Date().toISOString();

    try {
      const batch = writeBatch(db);

      const logData: ReviewLog = {
        id: logId,
        userId,
        deckId: sanitizeFirestoreId(deckId, 'deck'),
        cardId: sanitizeFirestoreId(cardId, 'card'),
        rating,
        intervalDays: Math.max(0, intervalDays || 0),
        reviewedAt: timestamp,
        timestamp,
        dateStr: todayStr,
      };

      const studyLogRef = doc(db, 'users', userId, 'studyLogs', logId);
      batch.set(studyLogRef, logData);

      const reviewRef = doc(db, 'users', userId, 'reviews', logId);
      batch.set(reviewRef, logData);

      const progressRef = doc(db, 'users', userId, 'progress', 'daily');
      batch.set(
        progressRef,
        {
          userId,
          totalReviews: increment(1),
          dailyReviews: {
            [todayStr]: increment(1),
          },
          updatedAt: timestamp,
        },
        { merge: true }
      );

      await batch.commit();
    } catch (err) {
      console.warn('Failed to record study log in Firestore:', err);
    }
  },

  /**
   * Flushes all dirty decks, dirty cards, and pending tombstones (deletes) to Firestore.
   * Only clears dirty/deleted flags for items that actually succeeded so failed writes
   * automatically retry on the next continuous sync tick.
   */
  async flushDirtyState(
    userId: string,
    localDecks: Deck[],
    localCards: Flashcard[],
    dirtyState: SyncDirtyState
  ): Promise<{
    nextDirtyState: SyncDirtyState;
    syncedCount: number;
    hadError: boolean;
  }> {
    if (!userId || !hasPendingDirtyWork(dirtyState)) {
      return { nextDirtyState: dirtyState, syncedCount: 0, hadError: false };
    }

    const result = await executeDirtyFlush(localDecks, localCards, dirtyState, {
      deleteDeck: (deckId) => this.deleteDeck(userId, deckId),
      deleteCard: (deckId, cardId) => this.deleteCard(userId, deckId, cardId),
      saveDeck: (deck, deckCards) => this.saveDeck(userId, deck, deckCards),
      saveCard: (deckId, card) => this.saveCard(userId, deckId, card),
    });

    saveSyncDirtyState(userId, result.nextDirtyState);
    return result;
  },

  /**
   * Non-destructive Cross-Device Cloud Sync & Local Migration on Google Login:
   * 1. Fetches all decks & cards stored under `users/{userId}/decks` in Firestore.
   * 2. Preserves any unsynced local cache for this userId (e.g., offline edits/reviews) without overwriting.
   * 3. Merges custom guest decks, added cards, and newer starter card progress from pre-login guest mode.
   * 4. Initializes brand-new accounts (0 cloud + 0 local decks) with starter decks saved directly to Firestore.
   */
  async migrateLocalDecksToAccount(
    targetUserId?: string,
    inMemoryGuestDecks?: Deck[],
    inMemoryGuestCards?: Flashcard[]
  ): Promise<{
    decks: Deck[];
    cards: Flashcard[];
    migratedCount: number;
    dirtyState: SyncDirtyState;
  }> {
    const userId = targetUserId || auth.currentUser?.uid;
    if (!userId) {
      return {
        decks: [],
        cards: [],
        migratedCount: 0,
        dirtyState: createEmptyDirtyState(),
      };
    }

    const cloudData = await this.getUserDecks(userId);
    let dirtyState = loadSyncDirtyState(userId);

    // 1. Read account's own local cache (rescues any offline changes/reviews on this Google account)
    let accountCachedDecks: Deck[] = [];
    let accountCachedCards: Flashcard[] = [];
    try {
      const userCachedDecksRaw = localStorage.getItem(`language_flashcards_decks_${userId}`);
      const userCachedCardsRaw = localStorage.getItem(`language_flashcards_cards_${userId}`);
      if (userCachedDecksRaw) {
        const parsed = JSON.parse(userCachedDecksRaw);
        if (Array.isArray(parsed)) accountCachedDecks = parsed;
      }
      if (userCachedCardsRaw) {
        const parsed = JSON.parse(userCachedCardsRaw);
        if (Array.isArray(parsed)) accountCachedCards = parsed;
      }
    } catch {}

    // Non-destructive merge of account's local cache with cloud data
    const accountMerged = mergeLocalAndCloudState({
      localDecks: accountCachedDecks,
      localCards: accountCachedCards,
      cloudDecks: cloudData.decks,
      cloudCards: cloudData.cards,
      dirtyState,
      isAuthoritativeCloudSnapshot: true,
    });

    let workingDecks = accountMerged.decks;
    let workingCards = accountMerged.cards;
    dirtyState = accountMerged.nextDirtyState;

    // 2. Collect guest decks & cards (in-memory pre-login session + guest localStorage)
    const guestDeckMap = new Map<string, Deck>();
    const guestCardMap = new Map<string, Flashcard>();

    const collectGuestDecks = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const d of list) {
        if (d && typeof d === 'object' && typeof d.id === 'string' && d.title && !guestDeckMap.has(d.id)) {
          guestDeckMap.set(d.id, d as Deck);
        }
      }
    };
    const collectGuestCards = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const c of list) {
        if (c && typeof c === 'object' && typeof c.id === 'string' && c.deckId && !guestCardMap.has(c.id)) {
          guestCardMap.set(c.id, c as Flashcard);
        }
      }
    };

    try {
      collectGuestDecks(inMemoryGuestDecks);
      collectGuestCards(inMemoryGuestCards);

      const guestDecksRaw =
        localStorage.getItem(LOCAL_DECKS_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
      const guestCardsRaw = localStorage.getItem(LOCAL_CARDS_STORAGE_KEY);
      if (guestDecksRaw) collectGuestDecks(JSON.parse(guestDecksRaw));
      if (guestCardsRaw) collectGuestCards(JSON.parse(guestCardsRaw));
    } catch (err) {
      console.warn('Failed reading guest decks during account merge:', err);
    }

    let migratedCount = 0;
    const guestDecks = Array.from(guestDeckMap.values());
    const guestCards = Array.from(guestCardMap.values());

    if (guestDecks.length > 0 || guestCards.length > 0) {
      const guestMerged = mergeGuestIntoAccountState({
        guestDecks,
        guestCards,
        accountDecks: workingDecks,
        accountCards: workingCards,
        starterDeckIds: STARTER_DECK_IDS,
        dirtyState,
      });

      workingDecks = guestMerged.decks;
      workingCards = guestMerged.cards;
      dirtyState = guestMerged.nextDirtyState;
      migratedCount = guestMerged.decksToUpload.length;
    }

    // 3. Brand-new Google account with 0 decks anywhere: seed starter decks
    if (workingDecks.length === 0) {
      for (const starterDeck of INITIAL_DECKS) {
        const starterCards = sortCardsSequentially(
          INITIAL_CARDS.filter((c) => c.deckId === starterDeck.id),
          [starterDeck]
        ).map((c, idx) => ({ ...c, orderIndex: c.orderIndex ?? idx }));
        workingDecks.push(starterDeck);
        workingCards.push(...starterCards);
        dirtyState = {
          ...dirtyState,
          dirtyDeckIds: Array.from(new Set([...dirtyState.dirtyDeckIds, starterDeck.id])),
        };
      }
      workingDecks = sortDecksDeterministically(workingDecks);
      workingCards = sortCardsSequentially(workingCards, workingDecks);
    }

    saveSyncDirtyState(userId, dirtyState);

    // 4. Immediately flush pending uploads/deletes to Firestore
    const flushResult = await this.flushDirtyState(
      userId,
      workingDecks,
      workingCards,
      dirtyState
    );
    dirtyState = flushResult.nextDirtyState;

    // Only clear guest local storage once custom guest items flushed without error
    if (!flushResult.hadError && migratedCount > 0) {
      try {
        localStorage.removeItem(LOCAL_DECKS_STORAGE_KEY);
        localStorage.removeItem(LOCAL_CARDS_STORAGE_KEY);
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      } catch {}
    }

    setSyncedDeckIdsLocally(
      userId,
      workingDecks.map((d) => d.id)
    );

    return {
      decks: workingDecks,
      cards: workingCards,
      migratedCount,
      dirtyState,
    };
  },

  /**
   * Reconciles current local state against Firestore cloud state non-destructively
   * and flushes any dirty local mutations.
   */
  async syncAllDecksWithCloud(
    userId: string,
    localDecks: Deck[],
    localCards: Flashcard[],
    currentDirtyState?: SyncDirtyState
  ): Promise<{
    decks: Deck[];
    cards: Flashcard[];
    dirtyState: SyncDirtyState;
    syncedCount: number;
  }> {
    const baseDirty = currentDirtyState || loadSyncDirtyState(userId);
    const cloudData = await this.getUserDecks(userId);

    const merged = mergeLocalAndCloudState({
      localDecks,
      localCards,
      cloudDecks: cloudData.decks,
      cloudCards: cloudData.cards,
      dirtyState: baseDirty,
      isAuthoritativeCloudSnapshot: true,
    });

    const flushResult = await this.flushDirtyState(
      userId,
      merged.decks,
      merged.cards,
      merged.nextDirtyState
    );

    setSyncedDeckIdsLocally(
      userId,
      merged.decks.map((d) => d.id)
    );

    return {
      decks: merged.decks,
      cards: merged.cards,
      dirtyState: flushResult.nextDirtyState,
      syncedCount: flushResult.syncedCount,
    };
  },
};
