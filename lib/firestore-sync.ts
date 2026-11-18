import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  writeBatch,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Deck, Flashcard, UserProfile, SM2Rating, ReviewLog } from './types';
import { INITIAL_DECKS, INITIAL_CARDS } from './default-data';

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateNewStreak(
  currentStreak: number,
  lastStudiedDate?: string
): { newStreak: number; todayStr: string } {
  const todayStr = getTodayDateString();
  const yesterdayStr = getYesterdayDateString();

  if (!lastStudiedDate) {
    return { newStreak: Math.max(1, currentStreak), todayStr };
  }

  if (lastStudiedDate === todayStr) {
    // Already studied today, maintain streak
    return { newStreak: Math.max(1, currentStreak), todayStr };
  }

  if (lastStudiedDate === yesterdayStr) {
    // Studied yesterday, consecutive streak increases
    return { newStreak: currentStreak + 1, todayStr };
  }

  // Broken streak, reset to 1
  return { newStreak: 1, todayStr };
}

/**
 * Initialize or get user profile in Firestore
 */
export async function syncUserProfile(
  userId: string,
  userEmail: string,
  displayName?: string | null,
  photoURL?: string | null,
  initialStreak = 0
): Promise<UserProfile> {
  const path = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (displayName && data.displayName !== displayName) {
        updates.displayName = displayName.slice(0, 100);
      }
      if (photoURL && data.photoURL !== photoURL) {
        updates.photoURL = photoURL.slice(0, 500);
      }
      if (userEmail && data.email !== userEmail) {
        updates.email = userEmail.slice(0, 200);
      }

      if (Object.keys(updates).length > 1) {
        await updateDoc(userDocRef, updates);
      }
      return { ...data, ...(updates as Partial<UserProfile>) };
    }

    const nowIso = new Date().toISOString();
    const safeDisplayName = (
      displayName ||
      userEmail.split('@')[0] ||
      'Language Learner'
    ).slice(0, 100);

    const firestoreDoc: Record<string, unknown> = {
      userId,
      email: (userEmail || 'user@example.com').slice(0, 200),
      displayName: safeDisplayName,
      streak: Math.max(0, initialStreak),
      totalReviews: 0,
      cardsMastered: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (photoURL && photoURL.trim().length > 0) {
      firestoreDoc.photoURL = photoURL.trim().slice(0, 500);
    }

    await setDoc(userDocRef, firestoreDoc);

    return {
      userId,
      email: firestoreDoc.email as string,
      displayName: safeDisplayName,
      ...(photoURL ? { photoURL: photoURL.trim().slice(0, 500) } : {}),
      streak: Math.max(0, initialStreak),
      totalReviews: 0,
      cardsMastered: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Listen to real-time user profile updates
 */
export function subscribeToUserProfile(
  userId: string,
  onUpdate: (profile: UserProfile | null) => void
): Unsubscribe {
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as UserProfile);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Save a new Deck along with its Flashcards atomically
 */
export async function saveDeckAndCardsToFirestore(
  userId: string,
  deck: Deck,
  cards: Flashcard[]
): Promise<void> {
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

    // Save deck and cards in batches to stay safely within Firestore 500 operation limit
    const initialBatch = writeBatch(db);
    initialBatch.set(deckRef, deckPayload);

    const CHUNK_SIZE = 400;
    const firstChunk = cards.slice(0, CHUNK_SIZE);
    for (const card of firstChunk) {
      const cardRef = doc(db, 'users', userId, 'decks', deck.id, 'cards', card.id);
      const cardPayload: Record<string, unknown> = {
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
        state: card.state,
        repetitions: card.repetitions,
        intervalDays: card.intervalDays,
        easeFactor: Math.max(1.3, card.easeFactor || 2.5),
        dueDate: card.dueDate,
        createdAt: new Date().toISOString(),
      };
      if (card.lastReviewedAt) cardPayload.lastReviewedAt = card.lastReviewedAt;
      if (card.exampleSentence) cardPayload.exampleSentence = card.exampleSentence;
      initialBatch.set(cardRef, cardPayload);
    }
    await initialBatch.commit();

    // Additional chunks if cards exceed 400
    for (let i = CHUNK_SIZE; i < cards.length; i += CHUNK_SIZE) {
      const chunkBatch = writeBatch(db);
      const chunk = cards.slice(i, i + CHUNK_SIZE);
      for (const card of chunk) {
        const cardRef = doc(db, 'users', userId, 'decks', deck.id, 'cards', card.id);
        const cardPayload: Record<string, unknown> = {
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
          state: card.state,
          repetitions: card.repetitions,
          intervalDays: card.intervalDays,
          easeFactor: Math.max(1.3, card.easeFactor || 2.5),
          dueDate: card.dueDate,
          createdAt: new Date().toISOString(),
        };
        if (card.lastReviewedAt) cardPayload.lastReviewedAt = card.lastReviewedAt;
        if (card.exampleSentence) cardPayload.exampleSentence = card.exampleSentence;
        chunkBatch.set(cardRef, cardPayload);
      }
      await chunkBatch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, basePath);
  }
}

/**
 * Update an existing Flashcard with new SM-2 intervals and review state
 */
export async function updateFlashcardReviewInFirestore(
  userId: string,
  deckId: string,
  card: Flashcard
): Promise<void> {
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
}

/**
 * Delete a deck and all its flashcards from Firestore
 */
export async function deleteDeckFromFirestore(userId: string, deckId: string): Promise<void> {
  const path = `users/${userId}/decks/${deckId}`;
  try {
    // Delete cards in subcollection first
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
}

/**
 * Update user study statistics and streak in Firestore
 */
export async function recordUserStudyProgress(
  userId: string,
  currentProfile: UserProfile,
  allUserCards: Flashcard[]
): Promise<UserProfile> {
  const path = `users/${userId}`;
  try {
    const { newStreak, todayStr } = calculateNewStreak(
      currentProfile.streak,
      currentProfile.lastStudiedDate
    );
    const masteredCount = allUserCards.filter((c) => c.state === 'mastered').length;
    const nextTotalReviews = (currentProfile.totalReviews || 0) + 1;
    const nowIso = new Date().toISOString();

    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      streak: newStreak,
      lastStudiedDate: todayStr,
      totalReviews: increment(1),
      cardsMastered: masteredCount,
      updatedAt: nowIso,
    });

    return {
      ...currentProfile,
      streak: newStreak,
      lastStudiedDate: todayStr,
      totalReviews: nextTotalReviews,
      cardsMastered: masteredCount,
      updatedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Helper to safely extract daily review counts mapping from Firestore document
 */
export function parseDailyReviews(data: Record<string, any>): Record<string, number> {
  const result: Record<string, number> = {};
  if (data.dailyReviews && typeof data.dailyReviews === 'object') {
    for (const [k, v] of Object.entries(data.dailyReviews)) {
      if (typeof v === 'number') {
        result[k] = v;
      }
    }
  }
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('dailyReviews.') && typeof v === 'number') {
      const dateKey = k.substring('dailyReviews.'.length);
      result[dateKey] = (result[dateKey] || 0) + v;
    }
  }
  return result;
}

/**
 * Record a flashcard review log entry and update aggregate daily counters in Firestore
 */
export async function recordReviewInFirestore(
  userId: string,
  deckId: string,
  cardId: string,
  rating: SM2Rating,
  intervalDays: number
): Promise<void> {
  const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = `users/${userId}/reviews/${reviewId}`;
  const todayStr = getTodayDateString();
  const timestamp = new Date().toISOString();

  try {
    const batch = writeBatch(db);

    // 1. Write individual review log entry under users/{uid}/reviews/{reviewId}
    const reviewRef = doc(db, 'users', userId, 'reviews', reviewId);
    const reviewData: ReviewLog = {
      id: reviewId,
      userId,
      deckId,
      cardId,
      rating,
      intervalDays,
      reviewedAt: timestamp,
      timestamp,
      dateStr: todayStr,
    };
    batch.set(reviewRef, reviewData);

    // 2. Increment aggregate progress counters under users/{uid}/progress/daily
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
    console.warn('Failed to record review in Firestore:', err);
    // Non-fatal fallback for network blips
  }
}

/**
 * Fetch real aggregate daily review counts from Firestore for the user
 */
export async function fetchUserDailyReviewsFromFirestore(
  userId: string
): Promise<{ dailyReviews: Record<string, number>; totalReviews: number }> {
  const path = `users/${userId}/progress/daily`;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'progress', 'daily'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        dailyReviews: parseDailyReviews(data),
        totalReviews: (data.totalReviews as number) || 0,
      };
    }
    return { dailyReviews: {}, totalReviews: 0 };
  } catch (err) {
    console.warn('Failed to fetch daily reviews from Firestore:', err);
    return { dailyReviews: {}, totalReviews: 0 };
  }
}

/**
 * Subscribe to real-time daily review progress updates from Firestore
 */
export function subscribeToUserDailyReviews(
  userId: string,
  onUpdate: (dailyRecord: Record<string, number>, totalReviews: number) => void
): Unsubscribe {
  const docRef = doc(db, 'users', userId, 'progress', 'daily');
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onUpdate(parseDailyReviews(data), (data.totalReviews as number) || 0);
      } else {
        onUpdate({}, 0);
      }
    },
    (error) => {
      console.warn('Daily reviews subscription error:', error);
    }
  );
}

/**
 * Delete an individual card from Firestore
 */
export async function deleteCardFromFirestore(
  userId: string,
  deckId: string,
  cardId: string
): Promise<void> {
  const path = `users/${userId}/decks/${deckId}/cards/${cardId}`;
  try {
    const cardRef = doc(db, 'users', userId, 'decks', deckId, 'cards', cardId);
    await deleteDoc(cardRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Save an individual card to Firestore
 */
export async function saveCardToFirestore(
  userId: string,
  deckId: string,
  card: Flashcard
): Promise<void> {
  const path = `users/${userId}/decks/${deckId}/cards/${card.id}`;
  try {
    const cardRef = doc(db, 'users', userId, 'decks', deckId, 'cards', card.id);
    const payload: Record<string, unknown> = {
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
      state: card.state,
      repetitions: card.repetitions,
      intervalDays: card.intervalDays,
      easeFactor: Math.max(1.3, card.easeFactor || 2.5),
      dueDate: card.dueDate,
      createdAt: new Date().toISOString(),
    };
    if (card.lastReviewedAt) payload.lastReviewedAt = card.lastReviewedAt;
    if (card.exampleSentence) payload.exampleSentence = card.exampleSentence;
    await setDoc(cardRef, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Load all user decks and their flashcards from Firestore
 */
export async function loadUserDecksAndCards(
  userId: string
): Promise<{ decks: Deck[]; cards: Flashcard[] }> {
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
        createdAt: deckData.createdAt,
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
  }
}

/**
 * Subscribe to real-time live synchronization of all user decks and cards across devices
 */
export function subscribeToUserDecksAndCards(
  userId: string,
  onUpdate: (data: { decks: Deck[]; cards: Flashcard[] }) => void,
  onError?: (error: unknown) => void
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
          createdAt: dData.createdAt,
        });
        activeDeckIds.add(dData.id);
      });

      currentDecks = newDecks;

      // Clean up listeners for decks that were deleted on another device
      for (const [deckId, unsub] of cardUnsubs.entries()) {
        if (!activeDeckIds.has(deckId)) {
          unsub();
          cardUnsubs.delete(deckId);
          currentCardsByDeck.delete(deckId);
        }
      }

      // Ensure listeners for all active decks
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
}

/**
 * Synchronize and load an account's decks from Firestore on login.
 * Ensures the account in Firestore is the true source of truth.
 * If this account is brand new (0 decks), initializes it with default starter decks in Firestore.
 */
export async function syncDecksOnLogin(
  userId: string
): Promise<{ decks: Deck[]; cards: Flashcard[] }> {
  try {
    const cloudData = await loadUserDecksAndCards(userId);
    if (!cloudData) {
      return { decks: [], cards: [] };
    }

    if (cloudData.decks.length === 0) {
      // Initialize brand new user account with starter decks saved directly to their account
      for (const d of INITIAL_DECKS) {
        const dCards = INITIAL_CARDS.filter((c) => c.deckId === d.id);
        await saveDeckAndCardsToFirestore(userId, d, dCards);
      }
      return { decks: INITIAL_DECKS, cards: INITIAL_CARDS };
    }

    // Return the authenticated account's exact decks from cloud
    return cloudData;
  } catch (err) {
    console.warn('syncDecksOnLogin error:', err);
    return { decks: [], cards: [] };
  }
}
