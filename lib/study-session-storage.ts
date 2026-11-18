import { Flashcard, StudySessionStats } from './types';

export type StudyMode = 'due' | 'sequential';
export type PersistedActiveTab = 'study' | 'decks' | 'import' | 'schedule';

export interface PersistedStudySession {
  persistKey: string;
  remainingCardIds: string[];
  totalSessionCards: number;
  stats: StudySessionStats;
  updatedAt: number;
}

export interface PersistedUiPrefs {
  activeTab: PersistedActiveTab;
  selectedDeckId: string | null;
  studyMode: StudyMode;
}

const SESSION_STORAGE_PREFIX = 'language_flashcards_study_session_v1';
const UI_PREFS_STORAGE_PREFIX = 'language_flashcards_ui_prefs_v1';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getStudySessionStorageKey(persistKey: string): string {
  return `${SESSION_STORAGE_PREFIX}::${persistKey}`;
}

export function getUiPrefsStorageKey(ownerId?: string | null): string {
  return ownerId
    ? `${UI_PREFS_STORAGE_PREFIX}_${ownerId}`
    : `${UI_PREFS_STORAGE_PREFIX}_guest`;
}

export function normalizeStudySessionStats(
  raw: unknown,
  fallbackNow: number = Date.now()
): StudySessionStats {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const toNonNegInt = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

  return {
    cardsReviewed: toNonNegInt(obj.cardsReviewed),
    againCount: toNonNegInt(obj.againCount),
    hardCount: toNonNegInt(obj.hardCount),
    goodCount: toNonNegInt(obj.goodCount),
    easyCount: toNonNegInt(obj.easyCount),
    alreadyKnewCount: toNonNegInt(obj.alreadyKnewCount),
    startTime:
      typeof obj.startTime === 'number' && Number.isFinite(obj.startTime)
        ? obj.startTime
        : fallbackNow,
    endTime:
      typeof obj.endTime === 'number' && Number.isFinite(obj.endTime)
        ? obj.endTime
        : undefined,
  };
}

/**
 * Pure reconciliation between a saved session snapshot and the latest candidate cards.
 * Preserves exact queue order, completed progress count, and stats across page reloads,
 * while picking up card edits and dropping deleted cards cleanly.
 */
export function reconcileSavedSessionWithCards(
  saved: PersistedStudySession | null,
  candidateCards: Flashcard[],
  nowMs: number = Date.now()
): {
  queueCards: Flashcard[];
  totalSessionCards: number;
  stats: StudySessionStats;
} | null {
  if (!saved || !Array.isArray(saved.remainingCardIds)) return null;
  if (typeof saved.updatedAt !== 'number' || nowMs - saved.updatedAt > SESSION_TTL_MS) {
    return null;
  }

  const cardMap = new Map(candidateCards.map((c) => [c.id, c]));
  const queueCards: Flashcard[] = [];
  for (const id of saved.remainingCardIds) {
    const match = cardMap.get(id);
    if (match) {
      queueCards.push(match);
    }
  }

  if (queueCards.length === 0) {
    return null;
  }

  const stats = normalizeStudySessionStats(saved.stats, nowMs);
  const savedTotal =
    typeof saved.totalSessionCards === 'number' && Number.isFinite(saved.totalSessionCards)
      ? saved.totalSessionCards
      : queueCards.length;

  // Preserve totalSessionCards so `completedCount / totalSessionCards` stays accurate on reload
  const totalSessionCards = Math.max(queueCards.length, savedTotal);

  return {
    queueCards,
    totalSessionCards,
    stats,
  };
}

export function loadPersistedStudySession(persistKey?: string): PersistedStudySession | null {
  if (typeof window === 'undefined' || !persistKey) return null;
  try {
    const raw = localStorage.getItem(getStudySessionStorageKey(persistKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStudySession;
    if (!parsed || parsed.persistKey !== persistKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedStudySession(session: PersistedStudySession): void {
  if (typeof window === 'undefined' || !session.persistKey) return;
  try {
    localStorage.setItem(
      getStudySessionStorageKey(session.persistKey),
      JSON.stringify(session)
    );
  } catch {}
}

export function clearPersistedStudySession(persistKey?: string): void {
  if (typeof window === 'undefined' || !persistKey) return;
  try {
    localStorage.removeItem(getStudySessionStorageKey(persistKey));
  } catch {}
}

export function loadUiPrefs(ownerId?: string | null): PersistedUiPrefs {
  const defaults: PersistedUiPrefs = {
    activeTab: 'study',
    selectedDeckId: null,
    studyMode: 'due',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(getUiPrefsStorageKey(ownerId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedUiPrefs>;
    const validTabs = new Set<PersistedActiveTab>(['study', 'decks', 'import', 'schedule']);
    return {
      activeTab:
        parsed.activeTab && validTabs.has(parsed.activeTab) ? parsed.activeTab : 'study',
      selectedDeckId:
        typeof parsed.selectedDeckId === 'string' && parsed.selectedDeckId.length > 0
          ? parsed.selectedDeckId
          : null,
      studyMode: parsed.studyMode === 'sequential' ? 'sequential' : 'due',
    };
  } catch {
    return defaults;
  }
}

export function saveUiPrefs(ownerId: string | null | undefined, prefs: PersistedUiPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getUiPrefsStorageKey(ownerId), JSON.stringify(prefs));
  } catch {}
}
