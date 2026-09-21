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

const STORAGE_KEY_DAILY_REVIEWS = 'language_flashcards_daily_reviews_v1';
export const DEFAULT_DAILY_TARGET = 15;

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
 * Generate initial realistic review history for the last 7 days
 * aligning with the app's default 4-day study streak
 */
function getInitialReviewHistory(): Record<string, number> {
  const history: Record<string, number> = {};
  const today = new Date();

  // Past 7 days realistic distribution:
  // 4 days of active streak (today, yesterday, 2 days ago, 3 days ago)
  const pastStreakCounts = [14, 22, 18, 16]; // today down to 3 days ago
  const olderCounts = [0, 11, 8]; // 4, 5, 6 days ago

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = formatDateKey(d);

    // If day is within the 4-day active streak (i.e. last 4 days: i = 3, 4, 5, 6)
    if (i >= 3) {
      const streakIdx = 6 - i; // 0 = today, 1 = yesterday, etc.
      history[key] = pastStreakCounts[streakIdx] ?? 15;
    } else {
      const olderIdx = 2 - i;
      history[key] = olderCounts[olderIdx] ?? 0;
    }
  }

  return history;
}

/**
 * Get all stored daily review counts
 */
export function getDailyReviewsRecord(): Record<string, number> {
  if (typeof window === 'undefined') {
    return getInitialReviewHistory();
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_DAILY_REVIEWS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to parse daily reviews from storage:', err);
  }

  const initial = getInitialReviewHistory();
  try {
    localStorage.setItem(STORAGE_KEY_DAILY_REVIEWS, JSON.stringify(initial));
  } catch {}
  return initial;
}

/**
 * Increment review count for today
 */
export function incrementTodayReviewCount(): number {
  if (typeof window === 'undefined') return 1;

  const record = getDailyReviewsRecord();
  const todayKey = formatDateKey(new Date());
  const currentCount = record[todayKey] || 0;
  const newCount = currentCount + 1;

  record[todayKey] = newCount;

  try {
    localStorage.setItem(STORAGE_KEY_DAILY_REVIEWS, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent('language_flashcards_review_added', { detail: { newCount } }));
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
  _version?: number
): WeeklyConsistencyStats {
  const record = getDailyReviewsRecord();
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
