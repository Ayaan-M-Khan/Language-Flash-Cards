'use client';

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  increment,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Deck, Flashcard, ReviewLog, SM2Rating, UserProfile } from './types';
import { INITIAL_DECKS, INITIAL_CARDS } from './default-data';

export const LOCAL_DECKS_STORAGE_KEY = 'language_flashcards_decks_guest';
export const LOCAL_CARDS_STORAGE_KEY = 'language_flashcards_cards_guest';
export const LEGACY_LOCAL_STORAGE_KEY = 'local_decks';

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface UserDecksResult {
  decks: Deck[];
  cards: Flashcard[];
}

export const deckService = {
  /**
   * Get all decks for the currently authenticated Google user (or target userId)
   */
  async getUserDecks(
    targetUserId?: string
  ): Promise<UserDecksResult> {
    const user = auth.currentUser;
    const userId = targetUserId || user?.uid;
    if (!userId) {
      throw new Error('User must be signed in to load account decks from cloud.');
    }

    const decksPath = `users/${userId}/decks`;
    try {
      const decksSnap = await getDocs(collection(db, 'users', userId, 'decks'));
      const loadedDecks: Deck[] = [];
      const loadedCards: Flashcard[] = [];

      for (const dDoc of decksSnap.docs) {
        const deckData = dDoc.data() as Deck;
        loadedDecks.push({
          id: deckData.id,
          title: deckData.title,
          language: deckData.language,
          languageCode: deckData.languageCode,
          color: deckData.color,
          description: deckData.description || '',
          icon: deckData.icon || 'Sparkles',
          createdAt: deckData.createdAt || new Date().toISOString(),
        });

        const cardsSnap = await getDocs(
          collection(db, 'users', userId, 'decks', deckData.id, 'cards')
        );
        cardsSnap.docs.forEach((cDoc) => {
          const cData = cDoc.data() as Flashcard;
          loadedCards.push({
            id: cData.id,
            deckId: deckData.id,
            english: cData.english,
            targetWord: cData.targetWord,
            language: cData.language || deckData.language,
            phonetic: cData.phonetic,
            partOfSpeech: cData.partOfSpeech,
            category: cData.category,
            exampleSentence: cData.exampleSentence,
            notes: cData.notes,
            state: cData.state || 'new',
            repetitions: cData.repetitions ?? 0,
            intervalDays: cData.intervalDays ?? 0,
            easeFactor: cData.easeFactor ?? 2.5,
            dueDate: cData.dueDate || new Date().toISOString(),
            lastReviewedAt: cData.lastReviewedAt,
          });
        });
      }

      return { decks: loadedDecks, cards: loadedCards };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, decksPath);
      return { decks: [], cards: [] };
    }
  },

  /**
   * Subscribe to real-time live synchronization of decks & cards across all devices
   */
  subscribeUserDecks(
    userId: string,
    onUpdate: (data: { decks: Deck[]; cards: Flashcard[] }) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    let isDisposed = false;
    const cardUnsubs: Map<string, Unsubscribe> = new Map();
    let currentDecks: Deck[] = [];
    const currentCardsByDeck: Map<string, Flashcard[]> = new Map();

    const emitUpdate = () => {
      if (isDisposed) return;
      const allCards: Flashcard[] = [];
      for (const deck of currentDecks) {
        const deckCards = currentCardsByDeck.get(deck.id) || [];
        allCards.push(...deckCards);
      }
      onUpdate({ decks: currentDecks, cards: allCards });
    };

    const decksColRef = collection(db, 'users', userId, 'decks');
    const unsubDecks = onSnapshot(
      decksColRef,
      (decksSnapshot) => {
        if (isDisposed) return;
        const newDecks: Deck[] = [];
        const activeDeckIds = new Set<string>();

        decksSnapshot.docs.forEach((docSnap) => {
          const dData = docSnap.data() as Deck;
          newDecks.push({
            id: dData.id,
            title: dData.title,
            language: dData.language,
            languageCode: dData.languageCode,
            color: dData.color,
            description: dData.description || '',
            icon: dData.icon || 'Sparkles',
            createdAt: dData.createdAt || new Date().toISOString(),
          });
          activeDeckIds.add(dData.id);
        });

        currentDecks = newDecks;

        // Clean up unneeded card listeners for decks deleted elsewhere
        for (const [deckId, unsub] of cardUnsubs.entries()) {
          if (!activeDeckIds.has(deckId)) {
            unsub();
            cardUnsubs.delete(deckId);
            currentCardsByDeck.delete(deckId);
          }
        }

        // Attach listeners for newly added decks
        newDecks.forEach((deck) => {
          if (!cardUnsubs.has(deck.id)) {
            const cardsColRef = collection(db, 'users', userId, 'decks', deck.id, 'cards');
            const unsubCard = onSnapshot(
              cardsColRef,
              (cardsSnapshot) => {
                if (isDisposed) return;
                const deckCards: Flashcard[] = [];
                cardsSnapshot.docs.forEach((cDoc) => {
                  const cData = cDoc.data() as Flashcard;
                  deckCards.push({
                    id: cData.id,
                    deckId: deck.id,
                    english: cData.english,
                    targetWord: cData.targetWord,
                    language: cData.language || deck.language,
                    phonetic: cData.phonetic,
                    partOfSpeech: cData.partOfSpeech,
                    category: cData.category,
                    exampleSentence: cData.exampleSentence,
                    notes: cData.notes,
                    state: cData.state || 'new',
                    repetitions: cData.repetitions ?? 0,
                    intervalDays: cData.intervalDays ?? 0,
                    easeFactor: cData.easeFactor ?? 2.5,
                    dueDate: cData.dueDate || new Date().toISOString(),
                    lastReviewedAt: cData.lastReviewedAt,
                  });
                });
                currentCardsByDeck.set(deck.id, deckCards);
                emitUpdate();
              },
              (err) => {
                console.warn(`Card sync error for deck ${deck.id}:`, err);
                if (onError) onError(err);
              }
            );
            cardUnsubs.set(deck.id, unsubCard);
          }
        });

        emitUpdate();
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
    };
  },

  /**
   * Save or update a Deck with its Flashcards in Firestore.
   * Supports saveDeck(userId, deck, cards) or saveDeck(deck) for auth.currentUser.
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

    const basePath = `users/${userId}/decks/${deck.id}`;
    try {
      const deckRef = doc(db, 'users', userId, 'decks', deck.id);
      const deckPayload = {
        id: deck.id,
        userId,
        title: deck.title.slice(0, 120),
        language: deck.language.slice(0, 50),
        languageCode: deck.languageCode.slice(0, 20),
        color: deck.color.slice(0, 30),
        description: (deck.description || '').slice(0, 500),
        icon: (deck.icon || 'Sparkles').slice(0, 50),
        createdAt: deck.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const initialBatch = writeBatch(db);
      initialBatch.set(deckRef, deckPayload, { merge: true });

      const CHUNK_SIZE = 400;
      const firstChunk = cardsToSave.slice(0, CHUNK_SIZE);
      for (const card of firstChunk) {
        const cardRef = doc(db, 'users', userId, 'decks', deck.id, 'cards', card.id);
        const cardPayload = {
          id: card.id,
          deckId: deck.id,
          userId,
          english: card.english.slice(0, 500),
          targetWord: card.targetWord.slice(0, 500),
          language: (card.language || deck.language).slice(0, 50),
          phonetic: (card.phonetic || '').slice(0, 200),
          partOfSpeech: (card.partOfSpeech || 'phrase').slice(0, 50),
          category: (card.category || 'General').slice(0, 100),
          notes: (card.notes || '').slice(0, 1000),
          state: card.state || 'new',
          repetitions: card.repetitions ?? 0,
          intervalDays: card.intervalDays ?? 0,
          easeFactor: Math.max(1.3, card.easeFactor || 2.5),
          dueDate: card.dueDate || new Date().toISOString(),
          lastReviewedAt: card.lastReviewedAt || undefined,
          exampleSentence: card.exampleSentence || undefined,
          createdAt: new Date().toISOString(),
        };
        initialBatch.set(cardRef, cardPayload, { merge: true });
      }
      await initialBatch.commit();

      // Additional chunks if deck contains more than 400 cards
      for (let i = CHUNK_SIZE; i < cardsToSave.length; i += CHUNK_SIZE) {
        const chunkBatch = writeBatch(db);
        const chunk = cardsToSave.slice(i, i + CHUNK_SIZE);
        for (const card of chunk) {
          const cardRef = doc(db, 'users', userId, 'decks', deck.id, 'cards', card.id);
          const cardPayload = {
            id: card.id,
            deckId: deck.id,
            userId,
            english: card.english.slice(0, 500),
            targetWord: card.targetWord.slice(0, 500),
            language: (card.language || deck.language).slice(0, 50),
            phonetic: (card.phonetic || '').slice(0, 200),
            partOfSpeech: (card.partOfSpeech || 'phrase').slice(0, 50),
            category: (card.category || 'General').slice(0, 100),
            notes: (card.notes || '').slice(0, 1000),
            state: card.state || 'new',
            repetitions: card.repetitions ?? 0,
            intervalDays: card.intervalDays ?? 0,
            easeFactor: Math.max(1.3, card.easeFactor || 2.5),
            dueDate: card.dueDate || new Date().toISOString(),
            lastReviewedAt: card.lastReviewedAt || undefined,
            exampleSentence: card.exampleSentence || undefined,
            createdAt: new Date().toISOString(),
          };
          chunkBatch.set(cardRef, cardPayload, { merge: true });
        }
        await chunkBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, basePath);
    }
  },

  /**
   * Save an individual card
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

    const path = `users/${userId}/decks/${deckId}/cards/${card.id}`;
    try {
      const cardRef = doc(db, 'users', userId, 'decks', deckId, 'cards', card.id);
      await setDoc(
        cardRef,
        {
          id: card.id,
          deckId,
          userId,
          english: card.english.slice(0, 500),
          targetWord: card.targetWord.slice(0, 500),
          language: (card.language || '').slice(0, 50),
          phonetic: (card.phonetic || '').slice(0, 200),
          partOfSpeech: (card.partOfSpeech || 'phrase').slice(0, 50),
          category: (card.category || 'General').slice(0, 100),
          notes: (card.notes || '').slice(0, 1000),
          state: card.state || 'new',
          repetitions: card.repetitions ?? 0,
          intervalDays: card.intervalDays ?? 0,
          easeFactor: Math.max(1.3, card.easeFactor || 2.5),
          dueDate: card.dueDate || new Date().toISOString(),
          lastReviewedAt: card.lastReviewedAt || undefined,
          exampleSentence: card.exampleSentence || undefined,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  /**
   * Update an existing Flashcard review state (intervals, due date, repetitions)
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

    const path = `users/${userId}/decks/${deckId}/cards/${card.id}`;
    try {
      const cardRef = doc(db, 'users', userId, 'decks', deckId, 'cards', card.id);
      const updates: Record<string, any> = {
        state: card.state,
        repetitions: card.repetitions,
        intervalDays: card.intervalDays,
        easeFactor: Math.max(1.3, card.easeFactor),
        dueDate: card.dueDate,
      };
      if (card.lastReviewedAt) {
        updates.lastReviewedAt = card.lastReviewedAt;
      }
      await updateDoc(cardRef, updates);
    } catch (err) {
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

    const path = `users/${userId}/decks/${deckId}`;
    try {
      const cardsColRef = collection(db, 'users', userId, 'decks', deckId, 'cards');
      const cardsSnap = await getDocs(cardsColRef);
      const batch = writeBatch(db);

      cardsSnap.docs.forEach((d) => {
        batch.delete(d.ref);
      });

      const deckRef = doc(db, 'users', userId, 'decks', deckId);
      batch.delete(deckRef);

      await batch.commit();
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

    const path = `users/${userId}/decks/${deckId}/cards/${cardId}`;
    try {
      const cardRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
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
        deckId,
        cardId,
        rating,
        intervalDays,
        reviewedAt: timestamp,
        timestamp,
        dateStr: todayStr,
      };

      // 1. Write to studyLogs collection
      const studyLogRef = doc(db, 'users', userId, 'studyLogs', logId);
      batch.set(studyLogRef, logData);

      // 2. Also write to reviews collection for backward compatibility
      const reviewRef = doc(db, 'users', userId, 'reviews', logId);
      batch.set(reviewRef, logData);

      // 3. Atomically update daily aggregate progress
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
   * Automatically migrate any local/guest device decks to the Google account on login.
   * Clears the local guest cache once migrated, ensuring decks are permanently saved to Firestore.
   */
  async migrateLocalDecksToAccount(
    targetUserId?: string
  ): Promise<{ decks: Deck[]; cards: Flashcard[]; migratedCount: number }> {
    const userId = targetUserId || auth.currentUser?.uid;
    if (!userId) {
      return { decks: [], cards: [], migratedCount: 0 };
    }

    try {
      // 1. Fetch cloud decks currently existing in this Google account
      const cloudData = await this.getUserDecks(userId);

      // 2. Check for locally created guest decks on this device
      let localDecks: Deck[] = [];
      let localCards: Flashcard[] = [];

      try {
        const guestDecksRaw =
          localStorage.getItem(LOCAL_DECKS_STORAGE_KEY) ||
          localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
        const guestCardsRaw = localStorage.getItem(LOCAL_CARDS_STORAGE_KEY);

        if (guestDecksRaw) {
          const parsed = JSON.parse(guestDecksRaw);
          if (Array.isArray(parsed)) localDecks = parsed;
        }
        if (guestCardsRaw) {
          const parsed = JSON.parse(guestCardsRaw);
          if (Array.isArray(parsed)) localCards = parsed;
        }
      } catch (err) {
        console.warn('Failed to read local guest decks:', err);
      }

      // Check if user has custom local decks (non-initial starter decks or modified decks)
      const cloudDeckIds = new Set(cloudData.decks.map((d) => d.id));
      const customLocalDecks = localDecks.filter(
        (d) =>
          !cloudDeckIds.has(d.id) &&
          !d.id.startsWith('deck-spanish-core') &&
          !d.id.startsWith('deck-japanese-travel') &&
          !d.id.startsWith('deck-french-cafe')
      );

      let migratedCount = 0;

      // Migrate custom local decks to cloud account
      if (customLocalDecks.length > 0) {
        for (const deck of customLocalDecks) {
          const deckCards = localCards.filter((c) => c.deckId === deck.id);
          await this.saveDeck(userId, deck, deckCards);
          cloudData.decks.push(deck);
          cloudData.cards.push(...deckCards);
          migratedCount++;
        }
        // Safely clear local guest decks now that they are in cloud
        try {
          localStorage.removeItem(LOCAL_DECKS_STORAGE_KEY);
          localStorage.removeItem(LOCAL_CARDS_STORAGE_KEY);
          localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
        } catch {}
      }

      // If user has zero decks in cloud (brand new account), initialize with default essentials
      if (cloudData.decks.length === 0) {
        for (const deck of INITIAL_DECKS) {
          const deckCards = INITIAL_CARDS.filter((c) => c.deckId === deck.id);
          await this.saveDeck(userId, deck, deckCards);
        }
        return { decks: INITIAL_DECKS, cards: INITIAL_CARDS, migratedCount: 0 };
      }

      return {
        decks: cloudData.decks,
        cards: cloudData.cards,
        migratedCount,
      };
    } catch (err) {
      console.warn('migrateLocalDecksToAccount error:', err);
      return { decks: [], cards: [], migratedCount: 0 };
    }
  },
};
