export interface DailyReviewData {
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // e.g., "Mon", "Tue"
  fullDayLabel: string; // e.g., "Monday, Sep 21"
  reviews: number;
  target: number; // daily goal, default 15
  isToday: boolean;
  achievedTarget: boolean;
}

export interface WeeklyConsistencyStats {
  totalWeeklyReviews: number;
  dailyAverage: number;
  activeDaysCount: number; // days with >= 1 review
  daysAchievedTarget: number; // days with >= target
  consistencyRate: number; // percentage (0 - 100)
  currentStreak: number;
  bestDay: { dayLabel: string; reviews: number };
  dailyBreakdown: DailyReviewData[];
}

const STORAGE_KEY_DAILY_REVIEWS_BASE = 'language_flashcards_daily_reviews_v2';
export const DEFAULT_DAILY_TARGET = 15;

/**
 * Get storage key scoped to user or guest
 */
export function getDailyReviewsStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY_DAILY_REVIEWS_BASE}_${userId}` : `${STORAGE_KEY_DAILY_REVIEWS_BASE}_guest`;
}

/**
 * Format a Date object as YYYY-MM-DD
 */
export function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate initial clean review history for the rolling 7 days
 * Starts at 0 for all days so consistency is driven entirely by user's actual actions
 */
export function getInitialReviewHistory(): Record<string, number> {
  const history: Record<string, number> = {};
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = formatDateKey(d);
    history[key] = 0;
  }

  return history;
}

/**
 * Get all stored daily review counts for a user or guest
 */
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
        return { ...initial, ...parsed };
      }
    }
  } catch (err) {
    console.warn('Failed to parse daily reviews from storage:', err);
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(initial));
  } catch {}
  return initial;
}

/**
 * Reset daily review history to 0 for all days
 */
export function resetDailyReviewsRecord(userId?: string | null): Record<string, number> {
  const initial = getInitialReviewHistory();
  if (typeof window !== 'undefined') {
    try {
      const storageKey = getDailyReviewsStorageKey(userId);
      localStorage.setItem(storageKey, JSON.stringify(initial));
      window.dispatchEvent(
        new CustomEvent('language_flashcards_review_added', {
          detail: { newCount: 0, userId },
        })
      );
    } catch (err) {
      console.warn('Failed to reset daily reviews record:', err);
    }
  }
  return initial;
}

/**
 * Increment review count for today
 */
export function incrementTodayReviewCount(userId?: string | null): number {
  if (typeof window === 'undefined') return 1;

  const storageKey = getDailyReviewsStorageKey(userId);
  const record = getDailyReviewsRecord(userId);
  const todayKey = formatDateKey(new Date());
  const currentCount = record[todayKey] || 0;
  const newCount = currentCount + 1;

  record[todayKey] = newCount;

  try {
    localStorage.setItem(storageKey, JSON.stringify(record));
    window.dispatchEvent(
      new CustomEvent('language_flashcards_review_added', {
        detail: { newCount, userId },
      })
    );
  } catch (err) {
    console.warn('Failed to save updated daily review count:', err);
  }

  return newCount;
}

/**
 * Get weekly consistency data for the rolling past 7 days up to today
 */
export function getWeeklyConsistencyStats(
  targetDaily: number = DEFAULT_DAILY_TARGET,
  _version?: number,
  userId?: string | null
): WeeklyConsistencyStats {
  const record = getDailyReviewsRecord(userId);
  const today = new Date();
  const todayKey = formatDateKey(today);

  const dailyBreakdown: DailyReviewData[] = [];
  let totalWeeklyReviews = 0;
  let activeDaysCount = 0;
  let daysAchievedTarget = 0;
  let bestDay = { dayLabel: 'None', reviews: 0 };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDateKey(d);
    const isToday = dateStr === todayKey;

    const dayOfWeek = dayNames[d.getDay()];
    const month = monthNames[d.getMonth()];
    const dateNum = d.getDate();

    const reviews = record[dateStr] || 0;
    const achievedTarget = reviews >= targetDaily;

    if (reviews > 0) activeDaysCount++;
    if (achievedTarget) daysAchievedTarget++;
    totalWeeklyReviews += reviews;

    if (reviews > bestDay.reviews) {
      bestDay = { dayLabel: `${dayOfWeek} (${month} ${dateNum})`, reviews };
    }

    dailyBreakdown.push({
      dateStr,
      dayLabel: dayOfWeek,
      fullDayLabel: `${dayOfWeek}, ${month} ${dateNum}`,
      reviews,
      target: targetDaily,
      isToday,
      achievedTarget,
    });
  }

  const dailyAverage = Math.round((totalWeeklyReviews / 7) * 10) / 10;
  // Consistency rate based on active days and meeting study goals
  const consistencyRate = Math.min(100, Math.round((activeDaysCount / 7) * 100));

  return {
    totalWeeklyReviews,
    dailyAverage,
    activeDaysCount,
    daysAchievedTarget,
    consistencyRate,
    currentStreak: activeDaysCount,
    bestDay,
    dailyBreakdown,
  };
}
