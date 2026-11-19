'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Flame,
  CheckCircle2,
  Calendar,
  Target,
  Sparkles,
  Zap,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import {
  buildConsistencyStatsFromRecord,
  DAILY_TARGET_OPTIONS,
  DEFAULT_DAILY_TARGET,
  DailyReviewData,
  getDailyGoal,
  getDailyReviewsRecord,
  getReviewEvents,
  REVIEW_HISTORY_UPDATED_EVENT,
  ReviewHistoryUpdateDetail,
  saveMergedDailyReviews,
  setDailyGoal,
  StoredReviewEvent,
} from '@/lib/review-history';
import { mergeDailyReviewRecords } from '@/lib/mastery-analytics';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchUserDailyReviewsFromFirestore,
  subscribeToUserDailyReviews,
} from '@/lib/firestore-sync';
import { useTheme } from '@/lib/ThemeContext';
import { playHapticFeedback } from '@/lib/audio';

interface WeeklyReviewTrackerProps {
  currentStreak?: number;
  refreshTrigger?: number;
  userId?: string | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailyReviewData }>;
}

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  const isTargetMet = data.reviews >= data.target;

  return (
    <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-lg border border-black/10 dark:border-white/10 text-xs">
      <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
        {data.fullDayLabel}
      </p>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-neutral-600 dark:text-neutral-400">Reviewed:</span>
        <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm tabular-nums">
          {data.reviews} {data.reviews === 1 ? 'card' : 'cards'}
        </span>
      </div>
      {data.accuracyPct !== null && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-600 dark:text-neutral-400 mb-1 tabular-nums">
          <span>Recall accuracy</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {data.accuracyPct}% ({data.recalledCount}/{data.recalledCount + data.againCount})
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-100 dark:border-neutral-800 text-[11px] tabular-nums">
        <span className="text-neutral-500 dark:text-neutral-400">Goal: {data.target}/day</span>
        <span
          className={`font-semibold px-1.5 py-0.5 rounded-md ${
            isTargetMet
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              : data.reviews > 0
              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
          }`}
        >
          {isTargetMet ? 'Goal Met' : data.reviews > 0 ? 'Active' : 'No Reviews'}
        </span>
      </div>
    </div>
  );
};

export const WeeklyReviewTracker: React.FC<WeeklyReviewTrackerProps> = ({
  currentStreak = 0,
  refreshTrigger = 0,
  userId = null,
}) => {
  const isClient = useIsClient();
  const { user, profile, signInWithGoogle, isSyncing } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const effectiveUserId = userId ?? user?.uid ?? null;

  const [showGoalLine, setShowGoalLine] = useState(true);
  const [daysWindow, setDaysWindow] = useState<7 | 14>(7);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Non-destructively merge live Firestore updates into localStorage when signed in
  useEffect(() => {
    if (!isClient || !effectiveUserId) {
      return;
    }

    let isMounted = true;

    fetchUserDailyReviewsFromFirestore(effectiveUserId)
      .then((res) => {
        if (!isMounted || !res?.dailyReviews) return;
        saveMergedDailyReviews(effectiveUserId, res.dailyReviews, {
          emitEvent: false,
        });
        setHistoryVersion((v) => v + 1);
      })
      .catch((err) => console.warn('Fetch reviews error:', err));

    const unsub = subscribeToUserDailyReviews(effectiveUserId, (realtimeMap) => {
      if (!isMounted) return;
      const currentLocal = getDailyReviewsRecord(effectiveUserId);
      const merged = mergeDailyReviewRecords(currentLocal, realtimeMap);
      saveMergedDailyReviews(effectiveUserId, merged.dailyReviews, { emitEvent: false });
      setHistoryVersion((v) => v + 1);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [effectiveUserId, isClient]);

  // Deterministic live sync whenever a review is recorded, goal changed, or merged
  useEffect(() => {
    if (!isClient) return;

    const handleHistoryUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ReviewHistoryUpdateDetail>).detail;
      const eventOwner = detail?.userId ?? null;
      if (!detail || eventOwner === effectiveUserId) {
        setHistoryVersion((v) => v + 1);
      }
    };

    window.addEventListener(REVIEW_HISTORY_UPDATED_EVENT, handleHistoryUpdate);
    return () => {
      window.removeEventListener(REVIEW_HISTORY_UPDATED_EVENT, handleHistoryUpdate);
    };
  }, [effectiveUserId, isClient]);

  const { dailyReviewsMap, reviewEvents, dailyGoal } = useMemo<{
    dailyReviewsMap: Record<string, number>;
    reviewEvents: StoredReviewEvent[];
    dailyGoal: number;
  }>(() => {
    if (!isClient) {
      return {
        dailyReviewsMap: {},
        reviewEvents: [],
        dailyGoal: DEFAULT_DAILY_TARGET,
      };
    }
    void historyVersion;
    void refreshTrigger;
    return {
      dailyReviewsMap: getDailyReviewsRecord(effectiveUserId),
      reviewEvents: getReviewEvents(effectiveUserId),
      dailyGoal: getDailyGoal(effectiveUserId),
    };
  }, [isClient, effectiveUserId, historyVersion, refreshTrigger]);

  const handleCycleDailyGoal = () => {
    playHapticFeedback('tap');
    const currentIdx = DAILY_TARGET_OPTIONS.indexOf(
      dailyGoal as (typeof DAILY_TARGET_OPTIONS)[number]
    );
    const nextGoal =
      DAILY_TARGET_OPTIONS[(currentIdx + 1) % DAILY_TARGET_OPTIONS.length];
    setDailyGoal(effectiveUserId, nextGoal);
    setHistoryVersion((v) => v + 1);
  };

  const stats = useMemo(() => {
    return buildConsistencyStatsFromRecord(
      dailyReviewsMap,
      dailyGoal,
      daysWindow,
      reviewEvents
    );
  }, [dailyReviewsMap, dailyGoal, daysWindow, reviewEvents]);

  const maxReviews = useMemo(() => {
    const highest = Math.max(
      ...stats.dailyBreakdown.map((d) => d.reviews),
      dailyGoal
    );
    return Math.ceil((highest + 5) / 5) * 5;
  }, [stats, dailyGoal]);

  if (!isClient) {
    return (
      <div className="w-full bg-white dark:bg-neutral-900 rounded-3xl p-6 shadow-xs border border-black/5 dark:border-white/10 animate-pulse min-h-[340px]" />
    );
  }

  const effectiveStreakDisplay = Math.max(
    stats.currentStreak,
    currentStreak,
    user ? profile?.streak ?? 0 : 0
  );

  return (
    <section
      id="weekly-review-tracker-section"
      className="w-full bg-white dark:bg-neutral-900 rounded-3xl p-5 sm:p-6 shadow-xs border border-black/5 dark:border-white/10 transition-all flex flex-col justify-between"
      aria-label="Study Consistency Progress"
    >
      <div>
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                  Study Activity
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {stats.consistencyRate}% active
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {user ? (
                  <span className="truncate">
                    Synced · {profile?.displayName || user.displayName || user.email}
                  </span>
                ) : (
                  <button
                    id="tracker-signin-sync-btn"
                    type="button"
                    disabled={isSyncing}
                    onClick={() => signInWithGoogle()}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer disabled:opacity-50"
                  >
                    <LogIn className="w-3 h-3 shrink-0" />
                    <span>Saved locally · Sign in to sync</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Controls: 7d/14d Toggle, Goal Button, Streak */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 tabular-nums">
            <div
              role="group"
              aria-label="Activity date range"
              className="flex items-center p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200/60 dark:border-neutral-700 text-xs font-medium"
            >
              <button
                id="tracker-range-7d-btn"
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  setDaysWindow(7);
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  daysWindow === 7
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                7d
              </button>
              <button
                id="tracker-range-14d-btn"
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  setDaysWindow(14);
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  daysWindow === 14
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                14d
              </button>
            </div>

            <button
              id="cycle-daily-goal-btn"
              type="button"
              onClick={handleCycleDailyGoal}
              className="px-2.5 py-1 rounded-xl text-xs font-medium border bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1 cursor-pointer"
              title="Click to adjust daily review goal (10 / 15 / 20 / 30)"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Goal {dailyGoal}</span>
            </button>

            <div
              id="tracker-streak-value"
              className="flex items-center gap-1 px-1.5 text-orange-600 dark:text-orange-400 text-xs font-semibold"
              title="Active consecutive days studied"
            >
              <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
              <span>{effectiveStreakDisplay}d</span>
            </div>
          </div>
        </div>

        {/* 4 Summary Metrics (Single-Elevation Divided Row) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 sm:gap-0 sm:divide-x divide-neutral-100 dark:divide-neutral-800 py-3.5 border-b border-neutral-100 dark:border-neutral-800 tabular-nums">
          <div className="sm:pr-3">
            <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <Sparkles className="w-3 h-3 text-blue-500 shrink-0" />
              <span>{daysWindow}d Total</span>
            </div>
            <div
              id="tracker-total-reviews-value"
              className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-0.5"
            >
              {stats.totalWeeklyReviews}
            </div>
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
              {stats.bestDay.reviews > 0 ? `Best: ${stats.bestDay.reviews}` : '0 reviews yet'}
            </div>
          </div>

          <div className="sm:px-3">
            <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <Zap className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Daily Avg</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
              {stats.dailyAverage}
            </div>
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500">cards / day</div>
          </div>

          <div className="sm:px-3">
            <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <Target className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Goal Met</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.daysAchievedTarget}
              <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
                /{daysWindow}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowGoalLine((prev) => !prev)}
              className="text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
            >
              {showGoalLine ? 'Hide line' : 'Show line'}
            </button>
          </div>

          <div className="sm:pl-3">
            {stats.windowAccuracyPct !== null ? (
              <>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  <ShieldCheck className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span>Accuracy</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {stats.windowAccuracyPct}%
                </div>
                <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  {stats.activeDaysCount}/{daysWindow} active d
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span>Active Days</span>
                </div>
                <div className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                  {stats.activeDaysCount}
                  <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
                    /{daysWindow}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  days studied
                </div>
              </>
            )}
          </div>
        </div>

        {/* Subtle prompt when 0 reviews in window */}
        {stats.totalWeeklyReviews === 0 && (
          <div className="mt-3 px-3.5 py-2 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              Rate flashcards in Study to watch your daily curve, streak, and recall accuracy update live.
            </span>
          </div>
        )}

        {/* Recharts Line Chart Container */}
        <div className="w-full h-52 sm:h-56 pt-4 pb-1 select-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={stats.dailyBreakdown}
              margin={{ top: 10, right: 12, left: -22, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={isDark ? '#262626' : '#f0f0f4'}
              />
              <XAxis
                dataKey="dayLabel"
                stroke={isDark ? '#a3a3a3' : '#8E8E93'}
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={{ stroke: isDark ? '#333333' : '#E5E5EA' }}
                interval={daysWindow === 14 ? 1 : 0}
                dy={6}
              />
              <YAxis
                stroke={isDark ? '#a3a3a3' : '#8E8E93'}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, maxReviews]}
                allowDecimals={false}
              />
              <Tooltip content={<CustomChartTooltip />} />

              {showGoalLine && (
                <ReferenceLine
                  y={dailyGoal}
                  stroke="#10B981"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Goal: ${dailyGoal}`,
                    position: 'insideTopRight',
                    fill: isDark ? '#34D399' : '#059669',
                    fontSize: 10,
                    fontWeight: 600,
                    offset: 4,
                  }}
                />
              )}

              <Line
                type="monotone"
                dataKey="reviews"
                name="Cards Reviewed"
                stroke="#007AFF"
                strokeWidth={2.75}
                isAnimationActive={false}
                activeDot={{
                  r: 5.5,
                  fill: '#007AFF',
                  stroke: isDark ? '#171717' : '#FFFFFF',
                  strokeWidth: 2,
                }}
                dot={{
                  r: daysWindow === 14 ? 3 : 4,
                  fill: '#007AFF',
                  stroke: isDark ? '#171717' : '#FFFFFF',
                  strokeWidth: 1.75,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compact Day Strip (7 tiles in 7d mode, 2 rows of 7 in 14d mode) */}
      <div className="grid grid-cols-7 gap-1.5 mt-3 pt-3.5 border-t border-neutral-100 dark:border-neutral-800 tabular-nums">
        {stats.dailyBreakdown.map((item) => (
          <div
            key={item.dateStr}
            title={`${item.fullDayLabel}: ${item.reviews} reviewed${
              item.accuracyPct !== null ? ` (${item.accuracyPct}% accuracy)` : ''
            }`}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-center transition-all ${
              item.isToday
                ? 'bg-blue-50/90 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-blue-900 dark:text-blue-100 font-bold'
                : item.achievedTarget
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100'
                : item.reviews > 0
                ? 'bg-neutral-50 dark:bg-neutral-800 border border-black/5 dark:border-white/10 text-neutral-800 dark:text-neutral-200'
                : 'bg-neutral-50/40 dark:bg-neutral-800/30 border border-transparent text-neutral-400 dark:text-neutral-500'
            }`}
          >
            <span className="text-[10px] uppercase tracking-tight font-semibold opacity-75 truncate max-w-full">
              {daysWindow === 7 ? item.dayLabel : item.shortDateLabel.replace(' ', '')}
            </span>
            <span className="text-xs font-bold my-0.5">{item.reviews}</span>
            <div className="h-3 flex items-center justify-center">
              {item.achievedTarget ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              ) : item.reviews > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              ) : (
                <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
