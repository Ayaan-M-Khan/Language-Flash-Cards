import { SM2Rating } from './types';
import {
  StoredReviewEvent,
  DailyReviewPoint,
  ConsistencyStats,
  formatLocalDateKey,
  mergeDailyReviewRecords,
  mergeReviewEvents,
  computeStreakFromDailyReviews,
  buildConsistencyStats,
} from './mastery-analytics';

export type DailyReviewData = DailyReviewPoint;
export type WeeklyConsistencyStats = ConsistencyStats;
export type { StoredReviewEvent };

export const REVIEW_HISTORY_UPDATED_EVENT = 'language_flashcards_review_added';
export const DEFAULT_DAILY_TARGET = 15;
export const DAILY_TARGET_OPTIONS = [10, 15, 20, 30] as const;

const STORAGE_KEY_DAILY_REVIEWS_BASE = 'language_flashcards_daily_reviews_v2';
const STORAGE_KEY_REVIEW_EVENTS_BASE = 'language_flashcards_review_events_v1';
const STORAGE_KEY_DAILY_GOAL_BASE = 'language_flashcards_daily_goal_v1';
const STORAGE_KEY_PROGRESS_DIRTY_BASE = 'language_flashcards_progress_dirty_v1';
const STORAGE_KEY_PENDING_EVENTS_BASE = 'language_flashcards_pending_review_events_v1';

const MAX_STORED_EVENTS = 500;
const MAX_PENDING_EVENTS = 250;

export interface ReviewHistoryUpdateDetail {
  userId: string | null;
  newCount: number;
  dailyReviews: Record<string, number>;
  reviewEvents: StoredReviewEvent[];
  dailyGoal: number;
}

function ownerSuffix(userId?: string | null): string {
  return userId && userId.trim().length > 0 ? userId : 'guest';
}

export function getDailyReviewsStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_DAILY_REVIEWS_BASE}_${ownerSuffix(userId)}`;
}

export function getReviewEventsStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_REVIEW_EVENTS_BASE}_${ownerSuffix(userId)}`;
}

export function getDailyGoalStorageKey(userId?: string | null): string {
  return `${STORAGE_KEY_DAILY_GOAL_BASE}_${ownerSuffix(userId)}`;
}

function getProgressDirtyStorageKey(userId: string): string {
  return `${STORAGE_KEY_PROGRESS_DIRTY_BASE}_${userId}`;
}

function getPendingEventsStorageKey(userId: string): string {
  return `${STORAGE_KEY_PENDING_EVENTS_BASE}_${userId}`;
}

export function formatDateKey(d: Date): string {
  return formatLocalDateKey(d);
}

export function getInitialReviewHistory(): Record<string, number> {
  const history: Record<string, number> = {};
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    history[formatDateKey(d)] = 0;
  }
  return history;
}

export function getDailyReviewsRecord(userId?: string | null): Record<string, number> {
  const initial = getInitialReviewHistory();
  if (typeof window === 'undefined') {
    return initial;
  }

  const storageKey = getDailyReviewsStorageKey(userId);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return mergeDailyReviewRecords(parsed as Record<string, number>, initial).dailyReviews;
      }
    }
  } catch (err) {
    console.warn('Failed to parse daily reviews from storage:', err);
  }

  return initial;
}

export function getReviewEvents(userId?: string | null): StoredReviewEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getReviewEventsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (ev): ev is StoredReviewEvent =>
        Boolean(ev) &&
        typeof ev === 'object' &&
        typeof ev.id === 'string' &&
        typeof ev.cardId === 'string' &&
        typeof ev.rating === 'string'
    );
  } catch {
    return [];
  }
}

export function getDailyGoal(userId?: string | null): number {
  if (typeof window === 'undefined') return DEFAULT_DAILY_TARGET;
  try {
    const raw = localStorage.getItem(getDailyGoalStorageKey(userId));
    if (!raw) return DEFAULT_DAILY_TARGET;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 200) {
      return Math.round(parsed);
    }
  } catch {}
  return DEFAULT_DAILY_TARGET;
}

export function setDailyGoal(userId: string | null | undefined, goal: number): number {
  const safeGoal = Math.max(1, Math.min(200, Math.round(goal)));
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDailyGoalStorageKey(userId), String(safeGoal));
      dispatchReviewHistoryUpdate(userId ?? null);
    } catch {}
  }
  return safeGoal;
}

export function isProgressSyncDirty(userId?: string | null): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return localStorage.getItem(getProgressDirtyStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function setProgressSyncDirty(userId: string | null | undefined, dirty: boolean): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    if (dirty) {
      localStorage.setItem(getProgressDirtyStorageKey(userId), '1');
    } else {
      localStorage.removeItem(getProgressDirtyStorageKey(userId));
    }
  } catch {}
}

export function getPendingReviewEvents(userId?: string | null): StoredReviewEvent[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = localStorage.getItem(getPendingEventsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingReviewEvents(
  userId: string | null | undefined,
  events: StoredReviewEvent[]
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    if (events.length === 0) {
      localStorage.removeItem(getPendingEventsStorageKey(userId));
    } else {
      localStorage.setItem(
        getPendingEventsStorageKey(userId),
        JSON.stringify(events.slice(0, MAX_PENDING_EVENTS))
      );
    }
  } catch {}
}

export function hasPendingProgressSync(userId?: string | null): boolean {
  if (!userId) return false;
  return isProgressSyncDirty(userId) || getPendingReviewEvents(userId).length > 0;
}

function dispatchReviewHistoryUpdate(userId: string | null): void {
  if (typeof window === 'undefined') return;
  const dailyReviews = getDailyReviewsRecord(userId);
  const reviewEvents = getReviewEvents(userId);
  const dailyGoal = getDailyGoal(userId);
  const todayKey = formatDateKey(new Date());
  const detail: ReviewHistoryUpdateDetail = {
    userId,
    newCount: dailyReviews[todayKey] || 0,
    dailyReviews,
    reviewEvents,
    dailyGoal,
  };
  window.dispatchEvent(new CustomEvent<ReviewHistoryUpdateDetail>(REVIEW_HISTORY_UPDATED_EVENT, { detail }));
}

export function saveMergedDailyReviews(
  userId: string | null | undefined,
  cloudOrMergedRecord: Record<string, number>,
  options: { emitEvent?: boolean } = {}
): { dailyReviews: Record<string, number>; totalReviews: number; hadLocalNewer: boolean } {
  const localCurrent = getDailyReviewsRecord(userId);
  const merged = mergeDailyReviewRecords(localCurrent, cloudOrMergedRecord);

  let hadLocalNewer = false;
  for (const [k, v] of Object.entries(merged.dailyReviews)) {
    const cloudVal = cloudOrMergedRecord[k] || 0;
    if (v > cloudVal) {
      hadLocalNewer = true;
      break;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDailyReviewsStorageKey(userId), JSON.stringify(merged.dailyReviews));
    } catch {}
    if (options.emitEvent !== false) {
      dispatchReviewHistoryUpdate(userId ?? null);
    }
  }

  return { ...merged, hadLocalNewer };
}

export function saveMergedReviewEvents(
  userId: string | null | undefined,
  incomingEvents: StoredReviewEvent[],
  options: { emitEvent?: boolean } = {}
): StoredReviewEvent[] {
  const localEvents = getReviewEvents(userId);
  const merged = mergeReviewEvents(localEvents, incomingEvents, MAX_STORED_EVENTS);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getReviewEventsStorageKey(userId), JSON.stringify(merged));
    } catch {}
    if (options.emitEvent !== false) {
      dispatchReviewHistoryUpdate(userId ?? null);
    }
  }
  return merged;
}

/**
 * Atomically records a single flashcard review in localStorage (daily count + detailed rating event),
 * queues it for cloud sync if signed in, and dispatches a deterministic snapshot event.
 */
export function recordReviewActivity(
  userId: string | null | undefined,
  input: {
    deckId: string;
    cardId: string;
    rating: SM2Rating;
    intervalDays: number;
    easeFactor?: number;
    repetitions?: number;
  }
): {
  event: StoredReviewEvent;
  todayCount: number;
  dailyReviews: Record<string, number>;
  reviewEvents: StoredReviewEvent[];
  streak: number;
} {
  const now = new Date();
  const todayKey = formatDateKey(now);
  const timestamp = now.toISOString();
  const eventId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const event: StoredReviewEvent = {
    id: eventId,
    deckId: input.deckId,
    cardId: input.cardId,
    rating: input.rating,
    intervalDays: Math.max(0, Number.isFinite(input.intervalDays) ? input.intervalDays : 0),
    easeFactor:
      typeof input.easeFactor === 'number' && Number.isFinite(input.easeFactor)
        ? Math.max(1.3, input.easeFactor)
        : undefined,
    repetitions:
      typeof input.repetitions === 'number' && Number.isFinite(input.repetitions)
        ? Math.max(0, Math.floor(input.repetitions))
        : undefined,
    dateStr: todayKey,
    timestamp,
  };

  const currentRecord = getDailyReviewsRecord(userId);
  const nextCount = (currentRecord[todayKey] || 0) + 1;
  const nextRecord: Record<string, number> = {
    ...currentRecord,
    [todayKey]: nextCount,
  };

  const currentEvents = getReviewEvents(userId);
  const nextEvents = mergeReviewEvents([event], currentEvents, MAX_STORED_EVENTS);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDailyReviewsStorageKey(userId), JSON.stringify(nextRecord));
      localStorage.setItem(getReviewEventsStorageKey(userId), JSON.stringify(nextEvents));

      if (userId) {
        setProgressSyncDirty(userId, true);
        const pending = getPendingReviewEvents(userId);
        savePendingReviewEvents(userId, [event, ...pending]);
      }

      dispatchReviewHistoryUpdate(userId ?? null);
    } catch (err) {
      console.warn('Failed to persist review activity:', err);
    }
  }

  return {
    event,
    todayCount: nextCount,
    dailyReviews: nextRecord,
    reviewEvents: nextEvents,
    streak: computeStreakFromDailyReviews(nextRecord, now),
  };
}

/**
 * Merges any pre-login guest review counts, rating logs, and daily goal into the
 * signed-in user's storage and marks progress dirty so it flushes to Firestore.
 */
export function migrateGuestReviewHistoryToUser(userId: string): {
  migratedReviews: number;
  dailyReviews: Record<string, number>;
  reviewEvents: StoredReviewEvent[];
} {
  if (typeof window === 'undefined' || !userId) {
    return { migratedReviews: 0, dailyReviews: {}, reviewEvents: [] };
  }

  const guestDaily = getDailyReviewsRecord(null);
  const guestEvents = getReviewEvents(null);
  const guestTotal = Object.values(guestDaily).reduce((s, n) => s + (n > 0 ? n : 0), 0);

  const userDailyBefore = getDailyReviewsRecord(userId);
  const mergedDaily = mergeDailyReviewRecords(userDailyBefore, guestDaily);
  const mergedEvents = mergeReviewEvents(getReviewEvents(userId), guestEvents, MAX_STORED_EVENTS);

  if (guestTotal > 0 || guestEvents.length > 0) {
    try {
      localStorage.setItem(
        getDailyReviewsStorageKey(userId),
        JSON.stringify(mergedDaily.dailyReviews)
      );
      localStorage.setItem(getReviewEventsStorageKey(userId), JSON.stringify(mergedEvents));

      // Carry over guest daily goal if user doesn't have a custom one yet
      if (
        !localStorage.getItem(getDailyGoalStorageKey(userId)) &&
        localStorage.getItem(getDailyGoalStorageKey(null))
      ) {
        localStorage.setItem(getDailyGoalStorageKey(userId), String(getDailyGoal(null)));
      }

      setProgressSyncDirty(userId, true);
      if (guestEvents.length > 0) {
        const existingPending = getPendingReviewEvents(userId);
        savePendingReviewEvents(
          userId,
          mergeReviewEvents(existingPending, guestEvents, MAX_PENDING_EVENTS)
        );
      }

      // Clear guest review history after safely merging into user storage
      localStorage.removeItem(getDailyReviewsStorageKey(null));
      localStorage.removeItem(getReviewEventsStorageKey(null));
    } catch (err) {
      console.warn('Failed migrating guest review history:', err);
    }

    dispatchReviewHistoryUpdate(userId);
  }

  return {
    migratedReviews: guestTotal,
    dailyReviews: mergedDaily.dailyReviews,
    reviewEvents: mergedEvents,
  };
}

export function resetDailyReviewsRecord(userId?: string | null): Record<string, number> {
  const initial = getInitialReviewHistory();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDailyReviewsStorageKey(userId), JSON.stringify(initial));
      localStorage.removeItem(getReviewEventsStorageKey(userId));
      dispatchReviewHistoryUpdate(userId ?? null);
    } catch (err) {
      console.warn('Failed to reset daily reviews record:', err);
    }
  }
  return initial;
}

export function incrementTodayReviewCount(userId?: string | null): number {
  const record = getDailyReviewsRecord(userId);
  const todayKey = formatDateKey(new Date());
  const nextCount = (record[todayKey] || 0) + 1;
  record[todayKey] = nextCount;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getDailyReviewsStorageKey(userId), JSON.stringify(record));
      if (userId) setProgressSyncDirty(userId, true);
      dispatchReviewHistoryUpdate(userId ?? null);
    } catch (err) {
      console.warn('Failed to save updated daily review count:', err);
    }
  }
  return nextCount;
}

export function buildConsistencyStatsFromRecord(
  record: Record<string, number>,
  targetDaily: number = DEFAULT_DAILY_TARGET,
  days: number = 7,
  reviewEvents: StoredReviewEvent[] = []
): WeeklyConsistencyStats {
  return buildConsistencyStats(record, {
    targetDaily,
    days,
    reviewEvents,
  });
}

export function getWeeklyConsistencyStats(
  targetDaily: number = DEFAULT_DAILY_TARGET,
  _version?: number,
  userId?: string | null,
  days: number = 7
): WeeklyConsistencyStats {
  const record = getDailyReviewsRecord(userId);
  const events = getReviewEvents(userId);
  return buildConsistencyStats(record, {
    targetDaily,
    days,
    reviewEvents: events,
  });
}
