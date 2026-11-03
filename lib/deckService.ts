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

export const LOCAL_DECKS_STORAGE_KEY = 'language_flashcards_decks_guest';
export const LOCAL_CARDS_STORAGE_KEY = 'language_flashcards_cards_guest';
export const LEGACY_LOCAL_STORAGE_KEY = 'local_decks';

const STARTER_DECK_IDS = new Set([
  'deck-spanish-core',
  'deck-japanese-travel',
  'deck-french-cafe',
]);

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

function getPreviouslySyncedDeckIds(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(getSyncedDeckIdsStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix: string): string {
  const cleaned = (rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds a clean Firestore-compatible Deck payload with ZERO `undefined` properties
 * and strict adherence to `firestore.rules` validation bounds.
 */
export function buildDeckFirestorePayload(
  userId: string,
  deck: Deck
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(deck.id, 'deck');
  const nowIso = new Date().toISOString();
  return {
    id: safeId,
    userId,
    title: (deck.title || 'Vocabulary Deck').trim().slice(0, 120) || 'Vocabulary Deck',
    language: (deck.language || 'Language').trim().slice(0, 50) || 'Language',
    languageCode: (deck.languageCode || 'es-ES').trim().slice(0, 20) || 'es-ES',
    color: (deck.color || 'blue').trim().slice(0, 30) || 'blue',
    description: (deck.description || '').slice(0, 500),
    icon: (deck.icon || 'Sparkles').slice(0, 50),
    createdAt: (deck.createdAt || nowIso).slice(0, 40),
    updatedAt: nowIso,
  };
}

/**
 * Builds a clean Firestore-compatible Flashcard payload with ZERO `undefined` properties
 * and strict adherence to `firestore.rules` validation bounds.
 */
export function buildCardFirestorePayload(
  userId: string,
  deckId: string,
  card: Flashcard,
  fallbackOrderIndex?: number,
  fallbackLanguage?: string
): Record<string, unknown> {
  const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
  const safeCardId = sanitizeFirestoreId(card.id, 'card');
  const nowIso = new Date().toISOString();
  const validStates = new Set(['new', 'learning', 'review', 'mastered']);
  const safeState = validStates.has(card.state) ? card.state : 'new';

  const payload: Record<string, unknown> = {
    id: safeCardId,
    deckId: safeDeckId,
    userId,
    english: (card.english || '').slice(0, 500),
    targetWord: (card.targetWord || '').slice(0, 500),
    language: (card.language || fallbackLanguage || 'Language').slice(0, 50),
    phonetic: (card.phonetic || '').slice(0, 200),
    partOfSpeech: (card.partOfSpeech || 'phrase').slice(0, 50),
    category: (card.category || 'General').slice(0, 100),
    notes: (card.notes || '').slice(0, 1000),
    state: safeState,
    repetitions: Math.max(0, Number.isFinite(card.repetitions) ? card.repetitions : 0),
    intervalDays: Math.max(0, Number.isFinite(card.intervalDays) ? card.intervalDays : 0),
    easeFactor: Math.max(1.3, Number.isFinite(card.easeFactor) ? card.easeFactor : 2.5),
    dueDate: (card.dueDate || nowIso).slice(0, 40),
    createdAt: (card.createdAt || nowIso).slice(0, 40),
    updatedAt: nowIso,
  };

  const resolvedOrder =
    typeof card.orderIndex === 'number' && Number.isFinite(card.orderIndex)
      ? Math.max(0, Math.floor(card.orderIndex))
      : typeof fallbackOrderIndex === 'number' && Number.isFinite(fallbackOrderIndex)
      ? Math.max(0, Math.floor(fallbackOrderIndex))
      : undefined;

  if (resolvedOrder !== undefined) {
    payload.orderIndex = resolvedOrder;
  }

  if (typeof card.lastReviewedAt === 'string' && card.lastReviewedAt.length > 0) {
    payload.lastReviewedAt = card.lastReviewedAt.slice(0, 40);
  }

  if (
    card.exampleSentence &&
    typeof card.exampleSentence === 'object' &&
    typeof card.exampleSentence.target === 'string' &&
    card.exampleSentence.target.trim().length > 0
  ) {
    payload.exampleSentence = {
      target: card.exampleSentence.target.slice(0, 500),
      english: (card.exampleSentence.english || '').slice(0, 500),
    };
  }

  return payload;
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

function sortDecksDeterministically(decks: Deck[]): Deck[] {
  const starterOrder: Record<string, number> = {
    'deck-spanish-core': 1,
    'deck-japanese-travel': 2,
    'deck-french-cafe': 3,
  };
  return [...decks].sort((a, b) => {
    const aIsStarter = Boolean(starterOrder[a.id]);
    const bIsStarter = Boolean(starterOrder[b.id]);
    // Custom user-created decks appear first (newest first), followed by starter decks
    if (!aIsStarter && bIsStarter) return -1;
    if (aIsStarter && !bIsStarter) return 1;
    if (aIsStarter && bIsStarter) return starterOrder[a.id] - starterOrder[b.id];
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.id.localeCompare(b.id);
  });
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
      await setDoc(cardRef, payload, { merge: true });
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
   * Cross-Device Cloud Sync & Local Migration on Google Login:
   * 1. Fetches all decks & cards stored under `users/{userId}/decks` in Firestore (so logging in on any new device transfers 100% of saved decks).
   * 2. Merges any locally created guest decks OR previously unsynced device decks into Firestore without duplicating starter decks or resurrecting cloud-deleted decks.
   * 3. Initializes brand-new accounts with starter decks saved directly into Firestore.
   */
  async migrateLocalDecksToAccount(
    targetUserId?: string,
    inMemoryGuestDecks?: Deck[],
    inMemoryGuestCards?: Flashcard[]
  ): Promise<{ decks: Deck[]; cards: Flashcard[]; migratedCount: number }> {
    const userId = targetUserId || auth.currentUser?.uid;
    if (!userId) {
      return { decks: [], cards: [], migratedCount: 0 };
    }

    const cloudData = await this.getUserDecks(userId);
    const previouslySyncedIds = getPreviouslySyncedDeckIds(userId);

    // Collect local candidate decks/cards from guest storage, in-memory guest session, and unsynced local user cache
    const candidateDecksMap = new Map<string, { deck: Deck; fromGuest: boolean }>();
    const candidateCardsMap = new Map<string, Flashcard>();

    const addCandidateDecks = (decksList: unknown, fromGuest: boolean) => {
      if (!Array.isArray(decksList)) return;
      for (const d of decksList) {
        if (d && typeof d === 'object' && typeof d.id === 'string' && d.title) {
          if (!candidateDecksMap.has(d.id)) {
            candidateDecksMap.set(d.id, { deck: d as Deck, fromGuest });
          }
        }
      }
    };

    const addCandidateCards = (cardsList: unknown) => {
      if (!Array.isArray(cardsList)) return;
      for (const c of cardsList) {
        if (c && typeof c === 'object' && typeof c.id === 'string' && c.deckId) {
          if (!candidateCardsMap.has(c.id)) {
            candidateCardsMap.set(c.id, c as Flashcard);
          }
        }
      }
    };

    try {
      // 1. In-memory guest state (e.g. decks created in current tab right before clicking Sign In)
      if (inMemoryGuestDecks && inMemoryGuestDecks.length > 0) {
        addCandidateDecks(inMemoryGuestDecks, true);
      }
      if (inMemoryGuestCards && inMemoryGuestCards.length > 0) {
        addCandidateCards(inMemoryGuestCards);
      }

      // 2. Guest localStorage
      const guestDecksRaw =
        localStorage.getItem(LOCAL_DECKS_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
      const guestCardsRaw = localStorage.getItem(LOCAL_CARDS_STORAGE_KEY);
      if (guestDecksRaw) addCandidateDecks(JSON.parse(guestDecksRaw), true);
      if (guestCardsRaw) addCandidateCards(JSON.parse(guestCardsRaw));

      // 3. Account-scoped local cache on this device (rescues decks created while offline or before cloud sync succeeded)
      const userCachedDecksRaw = localStorage.getItem(`language_flashcards_decks_${userId}`);
      const userCachedCardsRaw = localStorage.getItem(`language_flashcards_cards_${userId}`);
      if (userCachedDecksRaw) {
        const parsedUserDecks = JSON.parse(userCachedDecksRaw);
        if (Array.isArray(parsedUserDecks)) {
          // Only consider decks that were NEVER previously confirmed synced & deleted elsewhere
          const unsyncedUserDecks = parsedUserDecks.filter(
            (d: Deck) => d?.id && !previouslySyncedIds.has(d.id)
          );
          addCandidateDecks(unsyncedUserDecks, false);
        }
      }
      if (userCachedCardsRaw) {
        addCandidateCards(JSON.parse(userCachedCardsRaw));
      }
    } catch (err) {
      console.warn('Failed reading local decks during account sync:', err);
    }

    const allCandidateCards = Array.from(candidateCardsMap.values());
    const cloudDeckIds = new Set(cloudData.decks.map((d) => d.id));
    const cloudCardIds = new Set(cloudData.cards.map((c) => c.id));

    let migratedCount = 0;
    let migratedFromGuest = false;

    // Identify custom (non-starter) local decks that are not yet in Firestore
    const unsyncedCustomDecks: Deck[] = [];
    for (const { deck, fromGuest } of candidateDecksMap.values()) {
      if (!cloudDeckIds.has(deck.id) && !STARTER_DECK_IDS.has(deck.id)) {
        unsyncedCustomDecks.push(deck);
        if (fromGuest) migratedFromGuest = true;
      }
    }

    // Upload any unsynced custom decks and their cards to Firestore
    for (const deck of unsyncedCustomDecks) {
      const rawDeckCards = allCandidateCards.filter((c) => c.deckId === deck.id);
      const deckCards = sortCardsSequentially(rawDeckCards, [deck]).map((c, idx) => ({
        ...c,
        orderIndex: c.orderIndex ?? idx,
      }));
      await this.saveDeck(userId, deck, deckCards);
      cloudData.decks.push(deck);
      cloudData.cards.push(...deckCards);
      cloudDeckIds.add(deck.id);
      deckCards.forEach((c) => cloudCardIds.add(c.id));
      migratedCount++;
    }

    // Also upload any manually added cards belonging to existing cloud decks that haven't synced yet
    for (const deck of cloudData.decks) {
      const unsyncedCardsForDeck = allCandidateCards.filter(
        (c) =>
          c.deckId === deck.id &&
          !cloudCardIds.has(c.id) &&
          c.id.startsWith('card-manual-')
      );
      for (const extraCard of unsyncedCardsForDeck) {
        await this.saveCard(userId, deck.id, extraCard);
        cloudData.cards.push(extraCard);
        cloudCardIds.add(extraCard.id);
      }
    }

    // Clear guest local storage once custom guest decks have been safely migrated to cloud
    if (migratedFromGuest) {
      try {
        localStorage.removeItem(LOCAL_DECKS_STORAGE_KEY);
        localStorage.removeItem(LOCAL_CARDS_STORAGE_KEY);
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      } catch {}
    }

    // Brand-new Google account with 0 cloud decks and 0 custom local decks: seed starter decks into Firestore
    if (cloudData.decks.length === 0) {
      for (const starterDeck of INITIAL_DECKS) {
        const localStarterCards = allCandidateCards.filter((c) => c.deckId === starterDeck.id);
        const cardsToSeed = (
          localStarterCards.length > 0
            ? localStarterCards
            : INITIAL_CARDS.filter((c) => c.deckId === starterDeck.id)
        ).map((c, idx) => ({ ...c, orderIndex: c.orderIndex ?? idx }));

        await this.saveDeck(userId, starterDeck, cardsToSeed);
        cloudData.decks.push(starterDeck);
        cloudData.cards.push(...cardsToSeed);
      }
    }

    const sortedDecks = sortDecksDeterministically(cloudData.decks);
    const sortedCards = sortCardsSequentially(cloudData.cards, sortedDecks);

    // Record authoritative synced deck IDs for this user on this device
    setSyncedDeckIdsLocally(
      userId,
      sortedDecks.map((d) => d.id)
    );

    return {
      decks: sortedDecks,
      cards: sortedCards,
      migratedCount,
    };
  },

  /**
   * Force push all current local decks & cards to the user's Firestore account
   * and return the merged cross-device state.
   */
  async syncAllDecksWithCloud(
    userId: string,
    localDecks: Deck[],
    localCards: Flashcard[]
  ): Promise<{ decks: Deck[]; cards: Flashcard[]; uploadedCount: number }> {
    const cloudData = await this.getUserDecks(userId);
    const cloudDeckIds = new Set(cloudData.decks.map((d) => d.id));
    const previouslySyncedIds = getPreviouslySyncedDeckIds(userId);

    let uploadedCount = 0;
    for (const deck of localDecks) {
      if (!cloudDeckIds.has(deck.id) && !previouslySyncedIds.has(deck.id)) {
        const deckCards = sortCardsSequentially(
          localCards.filter((c) => c.deckId === deck.id),
          [deck]
        );
        await this.saveDeck(userId, deck, deckCards);
        cloudData.decks.push(deck);
        cloudData.cards.push(...deckCards);
        uploadedCount++;
      }
    }

    const sortedDecks = sortDecksDeterministically(cloudData.decks);
    const sortedCards = sortCardsSequentially(cloudData.cards, sortedDecks);
    setSyncedDeckIdsLocally(
      userId,
      sortedDecks.map((d) => d.id)
    );

    return { decks: sortedDecks, cards: sortedCards, uploadedCount };
  },
};
