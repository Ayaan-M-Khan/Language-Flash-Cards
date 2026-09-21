export type CardState = 'new' | 'learning' | 'review' | 'mastered';

export type SM2Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewLog {
  id: string;
  cardId: string;
  rating: SM2Rating;
  reviewedAt: string; // ISO date
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

export interface Flashcard {
  id: string;
  deckId: string;
  english: string;
  targetWord: string;
  language: string; // e.g. "Spanish", "Japanese", "French", "German", etc.
  phonetic?: string; // IPA or romanization (e.g., Romaji, Pinyin)
  partOfSpeech?: string; // "noun", "verb", "adjective", "phrase", etc.
  exampleSentence?: {
    target: string;
    english: string;
  };
  notes?: string;
  category?: string; // e.g., "Food", "Travel", "Essentials", "Grammar"
  
  // Spaced Repetition (SM-2 Algorithm)
  state: CardState;
  repetitions: number; // Consecutive successful reviews
  intervalDays: number; // Current interval in days
  easeFactor: number; // Default 2.5 (difficulty multiplier)
  dueDate: string; // ISO string when card is due
  lastReviewedAt?: string; // ISO string
}

export interface Deck {
  id: string;
  title: string;
  language: string;
  languageCode: string; // e.g., "es-ES", "ja-JP", "fr-FR", "de-DE", "it-IT", "zh-CN"
  color: string; // Apple theme color identifier: 'blue' | 'indigo' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'
  description: string;
  icon: string;
  createdAt: string;
}

export interface TableRowInput {
  english: string;
  targetWord: string;
  category?: string;
  phonetic?: string;
  partOfSpeech?: string;
  notes?: string;
}

export interface StudySessionStats {
  cardsReviewed: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  startTime: number;
  endTime?: number;
}

export interface UserProfile {
  userId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  streak: number;
  lastStudiedDate?: string;
  totalReviews: number;
  cardsMastered: number;
  createdAt?: string;
  updatedAt?: string;
}
