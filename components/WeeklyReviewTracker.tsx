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
  Flame,
  CheckCircle2,
  Target,
  LogIn,
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
    <div className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-zinc-200/80 dark:border-white/10 text-xs">
      <p className="font-semibold text-zinc-950 dark:text-zinc-50 mb-1">
        {data.fullDayLabel}
      </p>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-zinc-500 dark:text-zinc-400">Reviewed</span>
        <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
          {data.reviews} {data.reviews === 1 ? 'card' : 'cards'}
        </span>
      </div>
      {data.accuracyPct !== null && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 mb-1 tabular-nums">
          <span>Recall accuracy</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {data.accuracyPct}% ({data.recalledCount}/{data.recalledCount + data.againCount})
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-zinc-100 dark:border-white/[0.06] text-[11px] tabular-nums">
        <span className="text-zinc-500 dark:text-zinc-400">
          Goal <span className="font-mono">{data.target}</span>/day
        </span>
        <span
          className={`font-medium ${
            isTargetMet
              ? 'text-emerald-600 dark:text-emerald-400'
              : data.reviews > 0
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-zinc-400 dark:text-zinc-500'
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
      <div className="w-full bg-white dark:bg-[#111114] rounded-2xl p-6 border border-zinc-200/80 dark:border-white/[0.08] animate-pulse min-h-[340px]" />
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
      className="w-full bg-white dark:bg-[#111114] rounded-2xl p-5 sm:p-6 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] transition-all flex flex-col justify-between"
      aria-label="Study Consistency Progress"
    >
      <div>
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-white/[0.06]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap">
                Study Activity
              </h3>
              <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                <span className="font-mono">{stats.consistencyRate}%</span> active
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
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

          {/* Right Controls: 7d/14d Toggle, Goal Button, Streak */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0 tabular-nums">
            <div
              role="group"
              aria-label="Activity date range"
              className="flex items-center p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium"
            >
              <button
                id="tracker-range-7d-btn"
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  setDaysWindow(7);
                }}
                className={`px-2 py-0.5 rounded-lg font-mono transition-all cursor-pointer ${
                  daysWindow === 7
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
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
                className={`px-2 py-0.5 rounded-lg font-mono transition-all cursor-pointer ${
                  daysWindow === 14
                    ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                14d
              </button>
            </div>

            <button
              id="cycle-daily-goal-btn"
              type="button"
              onClick={handleCycleDailyGoal}
              className="h-8 px-2.5 rounded-xl text-xs font-medium border bg-zinc-50/90 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-200 border-zinc-200/80 dark:border-white/[0.08] hover:border-emerald-400/70 dark:hover:border-emerald-600/60 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Click to adjust daily review goal (10 / 15 / 20 / 30)"
            >
              <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-mono">{dailyGoal}</span>
            </button>

            <div
              id="tracker-streak-value"
              className="flex items-center gap-1 px-1.5 text-amber-600 dark:text-amber-400 text-xs font-semibold font-mono"
              title="Active consecutive days studied"
            >
              <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>{effectiveStreakDisplay}d</span>
            </div>
          </div>
        </div>

        {/* 4 Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 sm:gap-0 sm:divide-x divide-zinc-100 dark:divide-white/[0.06] py-3.5 border-b border-zinc-100 dark:border-white/[0.06] tabular-nums">
          <div className="sm:pr-3">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {daysWindow}d Total
            </div>
            <div
              id="tracker-total-reviews-value"
              className="text-lg sm:text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5"
            >
              {stats.totalWeeklyReviews}
            </div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
              {stats.bestDay.reviews > 0 ? (
                <>
                  Best <span className="font-mono">{stats.bestDay.reviews}</span>
                </>
              ) : (
                '0 reviews yet'
              )}
            </div>
          </div>

          <div className="sm:px-3">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Daily Avg
            </div>
            <div className="text-lg sm:text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5">
              {stats.dailyAverage}
            </div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500">cards / day</div>
          </div>

          <div className="sm:px-3">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Goal Met
            </div>
            <div className="text-lg sm:text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.daysAchievedTarget}
              <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                /{daysWindow}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowGoalLine((prev) => !prev)}
              className="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            >
              {showGoalLine ? 'Hide line' : 'Show line'}
            </button>
          </div>

          <div className="sm:pl-3">
            {stats.windowAccuracyPct !== null ? (
              <>
                <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Accuracy
                </div>
                <div className="text-lg sm:text-xl font-semibold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  {stats.windowAccuracyPct}%
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  <span className="font-mono">
                    {stats.activeDaysCount}/{daysWindow}
                  </span>{' '}
                  active
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Active Days
                </div>
                <div className="text-lg sm:text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5">
                  {stats.activeDaysCount}
                  <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                    /{daysWindow}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  days studied
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quiet note when 0 reviews in window */}
        {stats.totalWeeklyReviews === 0 && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Rate flashcards in Study to watch your daily curve, streak, and recall accuracy update live.
          </p>
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
                stroke={isDark ? '#27272A' : '#F1F5F9'}
              />
              <XAxis
                dataKey="dayLabel"
                stroke={isDark ? '#A1A1AA' : '#71717A'}
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={{ stroke: isDark ? '#27272A' : '#E4E4E7' }}
                interval={daysWindow === 14 ? 1 : 0}
                dy={6}
              />
              <YAxis
                stroke={isDark ? '#71717A' : '#71717A'}
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
                  strokeWidth={1.25}
                  label={{
                    value: `Goal ${dailyGoal}`,
                    position: 'insideTopRight',
                    fill: isDark ? '#34D399' : '#059669',
                    fontSize: 10,
                    fontWeight: 500,
                    offset: 4,
                  }}
                />
              )}

              <Line
                type="monotone"
                dataKey="reviews"
                name="Cards Reviewed"
                stroke="#2563EB"
                strokeWidth={2.25}
                isAnimationActive={false}
                activeDot={{
                  r: 5,
                  fill: '#2563EB',
                  stroke: isDark ? '#111114' : '#FFFFFF',
                  strokeWidth: 2,
                }}
                dot={{
                  r: daysWindow === 14 ? 2.5 : 3.5,
                  fill: '#2563EB',
                  stroke: isDark ? '#111114' : '#FFFFFF',
                  strokeWidth: 1.5,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compact Day Strip */}
      <div className="grid grid-cols-7 gap-1.5 mt-3 pt-3.5 border-t border-zinc-100 dark:border-white/[0.06] tabular-nums">
        {stats.dailyBreakdown.map((item) => (
          <div
            key={item.dateStr}
            title={`${item.fullDayLabel}: ${item.reviews} reviewed${
              item.accuracyPct !== null ? ` (${item.accuracyPct}% accuracy)` : ''
            }`}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-center transition-all border ${
              item.isToday
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-800/70 text-blue-700 dark:text-blue-200'
                : item.achievedTarget
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-200'
                : item.reviews > 0
                ? 'bg-zinc-50 dark:bg-[#18181B] border-zinc-200/70 dark:border-white/[0.07] text-zinc-800 dark:text-zinc-200'
                : 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600'
            }`}
          >
            <span className="text-[10px] font-medium opacity-80 truncate max-w-full">
              {daysWindow === 7 ? item.dayLabel : item.shortDateLabel.replace(' ', '')}
            </span>
            <span className="text-xs font-mono font-semibold my-0.5">{item.reviews}</span>
            <div className="h-3 flex items-center justify-center">
              {item.achievedTarget ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              ) : item.reviews > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
              ) : (
                <span className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
