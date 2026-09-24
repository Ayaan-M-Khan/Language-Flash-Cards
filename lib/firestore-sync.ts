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
      // Update profile info if changed
      const updates: Partial<UserProfile> = {
        updatedAt: new Date().toISOString(),
      };
      if (displayName && data.displayName !== displayName) updates.displayName = displayName;
      if (photoURL && data.photoURL !== photoURL) updates.photoURL = photoURL;
      if (userEmail && data.email !== userEmail) updates.email = userEmail;

      if (Object.keys(updates).length > 1) {
        await updateDoc(userDocRef, updates);
      }
      return { ...data, ...updates };
    }

    const newProfile: UserProfile = {
      userId,
      email: userEmail,
      displayName: displayName || userEmail.split('@')[0] || 'Language Learner',
      photoURL: photoURL || undefined,
      streak: initialStreak,
      totalReviews: 0,
      cardsMastered: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(userDocRef, newProfile);
    return newProfile;
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
        state: card.state,
        repetitions: card.repetitions,
        intervalDays: card.intervalDays,
        easeFactor: Math.max(1.3, card.easeFactor || 2.5),
        dueDate: card.dueDate,
        lastReviewedAt: card.lastReviewedAt || undefined,
        exampleSentence: card.exampleSentence || undefined,
        createdAt: new Date().toISOString(),
      };
      initialBatch.set(cardRef, cardPayload);
    }
    await initialBatch.commit();

    // Additional chunks if cards exceed 400
    for (let i = CHUNK_SIZE; i < cards.length; i += CHUNK_SIZE) {
      const chunkBatch = writeBatch(db);
      const chunk = cards.slice(i, i + CHUNK_SIZE);
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
          state: card.state,
          repetitions: card.repetitions,
          intervalDays: card.intervalDays,
          easeFactor: Math.max(1.3, card.easeFactor || 2.5),
          dueDate: card.dueDate,
          lastReviewedAt: card.lastReviewedAt || undefined,
          exampleSentence: card.exampleSentence || undefined,
          createdAt: new Date().toISOString(),
        };
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
    const totalReviews = currentProfile.totalReviews + 1;

    const userDocRef = doc(db, 'users', userId);
    const updates = {
      streak: newStreak,
      lastStudiedDate: todayStr,
      totalReviews,
      cardsMastered: masteredCount,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(userDocRef, updates);

    return {
      ...currentProfile,
      ...updates,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
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
        [`dailyReviews.${todayStr}`]: increment(1),
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
        dailyReviews: (data.dailyReviews as Record<string, number>) || {},
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
        onUpdate(
          (data.dailyReviews as Record<string, number>) || {},
          (data.totalReviews as number) || 0
        );
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
