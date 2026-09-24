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
  AlertCircle,
} from 'lucide-react';
import {
  buildConsistencyStatsFromRecord,
  DEFAULT_DAILY_TARGET,
  DailyReviewData,
  formatDateKey,
} from '@/lib/review-history';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchUserDailyReviewsFromFirestore,
  subscribeToUserDailyReviews,
} from '@/lib/firestore-sync';

interface WeeklyReviewTrackerProps {
  currentStreak?: number;
  refreshTrigger?: number; // changes whenever a card is reviewed
  userId?: string | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailyReviewData }>;
  label?: string;
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
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isTargetMet = data.reviews >= data.target;

    return (
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-lg border border-black/10 text-xs">
        <p className="font-semibold text-neutral-900 mb-1">{data.fullDayLabel}</p>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-neutral-600">Reviewed:</span>
          <span className="font-bold text-neutral-900 text-sm">{data.reviews} cards</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-100 text-[11px]">
          <span className="text-neutral-500">Goal: {data.target}/day</span>
          <span
            className={`font-semibold px-1.5 py-0.5 rounded-md ${
              isTargetMet
                ? 'bg-emerald-100 text-emerald-700'
                : data.reviews > 0
                ? 'bg-blue-100 text-blue-700'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {isTargetMet ? 'Goal Achieved' : data.reviews > 0 ? 'Active' : 'No Reviews'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export const WeeklyReviewTracker: React.FC<WeeklyReviewTrackerProps> = ({
  currentStreak = 0,
  refreshTrigger = 0,
  userId = null,
}) => {
  const isClient = useIsClient();
  const { user, profile, signInWithGoogle, isSyncing } = useAuth();
  const effectiveUserId = userId || user?.uid || null;

  const [showGoalLine, setShowGoalLine] = useState(true);
  const [dailyReviewsMap, setDailyReviewsMap] = useState<Record<string, number>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Subscribe to real-time Firestore progress when authenticated
  useEffect(() => {
    if (!effectiveUserId) {
      setDailyReviewsMap({});
      return;
    }

    setIsLoadingHistory(true);

    // Initial fetch from Firestore
    fetchUserDailyReviewsFromFirestore(effectiveUserId)
      .then((res) => {
        if (res && res.dailyReviews) {
          setDailyReviewsMap(res.dailyReviews);
        }
      })
      .catch((err) => console.warn('Fetch reviews error:', err))
      .finally(() => setIsLoadingHistory(false));

    // Real-time snapshot listener on users/{uid}/progress/daily
    const unsub = subscribeToUserDailyReviews(effectiveUserId, (realtimeMap) => {
      setDailyReviewsMap(realtimeMap);
      setIsLoadingHistory(false);
    });

    return () => unsub();
  }, [effectiveUserId]);

  // Reactive listener to local events for immediate 0ms UI feedback on review
  useEffect(() => {
    const handleLocalReview = (e: Event) => {
      const customEvent = e as CustomEvent<{ newCount?: number; userId?: string }>;
      if (!effectiveUserId || customEvent.detail?.userId === effectiveUserId) {
        const todayKey = formatDateKey(new Date());
        setDailyReviewsMap((prev) => ({
          ...prev,
          [todayKey]: (prev[todayKey] || 0) + 1,
        }));
      }
    };

    window.addEventListener('language_flashcards_review_added', handleLocalReview);
    return () => {
      window.removeEventListener('language_flashcards_review_added', handleLocalReview);
    };
  }, [effectiveUserId]);

  // Build real stats strictly from verified review data (0 placeholder / 0 mock)
  const stats = useMemo(() => {
    return buildConsistencyStatsFromRecord(dailyReviewsMap, DEFAULT_DAILY_TARGET);
  }, [dailyReviewsMap, refreshTrigger]);

  const maxReviews = useMemo(() => {
    const highest = Math.max(...stats.dailyBreakdown.map((d) => d.reviews), DEFAULT_DAILY_TARGET);
    return Math.ceil((highest + 5) / 5) * 5;
  }, [stats]);

  if (!isClient) {
    return (
      <div className="w-full bg-white rounded-3xl p-6 shadow-xs border border-black/5 animate-pulse min-h-[300px]" />
    );
  }

  // ================= AUTHENTICATION GATE =================
  // If user is not signed in: show an empty-state message inside the chart container
  if (!user) {
    return (
      <section
        id="weekly-review-tracker-auth-gate"
        className="w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-black/5 transition-all mt-8"
        aria-label="Study Progress Authentication Gate"
      >
        <div className="max-w-md mx-auto py-4 sm:py-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
            <TrendingUp className="w-7 h-7" />
          </div>

          <h3 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 mb-2">
            Weekly Study Progress
          </h3>

          <p className="text-xs sm:text-sm text-neutral-500 mb-6 leading-relaxed">
            Sign in with Google to view and track your study progress, spaced repetition retention rates, and daily review consistency across devices.
          </p>

          <button
            id="auth-gate-signin-btn"
            onClick={() => signInWithGoogle()}
            disabled={isSyncing}
            className="inline-flex items-center justify-center gap-3 px-6 py-3 rounded-2xl bg-neutral-900 hover:bg-black text-white font-semibold text-xs sm:text-sm shadow-sm transition-all active:scale-98 disabled:opacity-50 group cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isSyncing ? 'Connecting to Google...' : 'Sign in with Google'}</span>
          </button>
        </div>
      </section>
    );
  }

  // ================= AUTHENTICATED REAL USER PROGRESS =================
  const effectiveStreakDisplay = profile?.streak ?? currentStreak;

  return (
    <section
      id="weekly-review-tracker-section"
      className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-black/5 transition-all mt-8"
      aria-label="Weekly Review Consistency Progress"
    >
      {/* Top Header: Title, Consistency Badge & Goal Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900">
                Weekly Review Consistency
              </h3>
              <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                <CheckCircle2 className="w-3 h-3" />
                {stats.consistencyRate}% Consistent
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Spaced repetition daily retention & 7-day review activity for {profile?.displayName || user.displayName || user.email?.split('@')[0]}
            </p>
          </div>
        </div>

        {/* Right action badges */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="toggle-goal-line-btn"
            onClick={() => setShowGoalLine((prev) => !prev)}
            className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
              showGoalLine
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                : 'bg-neutral-50 text-neutral-600 border-neutral-200/60 hover:bg-neutral-100'
            }`}
            title="Toggle daily target benchmark line"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Target ({DEFAULT_DAILY_TARGET})</span>
          </button>

          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-50 text-orange-700 border border-orange-200/60 text-xs font-semibold"
            title="Active consecutive days studied"
          >
            <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
            <span>{effectiveStreakDisplay}d Streak</span>
          </div>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-6">
        {/* Total This Week */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 border border-black/5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
              7-Day Total
            </span>
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-neutral-900">
              {stats.totalWeeklyReviews}
            </span>
            <span className="text-xs text-neutral-500 font-medium">cards</span>
          </div>
        </div>

        {/* Daily Average */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 border border-black/5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
              Daily Avg
            </span>
            <Zap className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-neutral-900">
              {stats.dailyAverage}
            </span>
            <span className="text-xs text-neutral-500 font-medium">/ day</span>
          </div>
        </div>

        {/* Target Met */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 border border-black/5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
              Goal Met
            </span>
            <Target className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-emerald-700">
              {stats.daysAchievedTarget}
            </span>
            <span className="text-xs text-neutral-500 font-medium">of 7 days</span>
          </div>
        </div>

        {/* Active Days */}
        <div className="p-3 sm:p-3.5 rounded-2xl bg-neutral-50 border border-black/5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
              Study Days
            </span>
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold text-neutral-900">
              {stats.activeDaysCount}
            </span>
            <span className="text-xs text-neutral-500 font-medium">of 7 active</span>
          </div>
        </div>
      </div>

      {/* Zero review state indicator if new user */}
      {stats.totalWeeklyReviews === 0 && !isLoadingHistory && (
        <div className="mb-3 px-4 py-2.5 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center gap-2.5 text-xs text-blue-700">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>No reviews recorded yet for this 7-day period. Rate flashcards above to see your progress curve grow!</span>
        </div>
      )}

      {/* Recharts Line Chart Container */}
      <div className="w-full h-56 sm:h-64 pt-2 pb-1 select-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={stats.dailyBreakdown}
            margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f0f0f4"
            />
            <XAxis
              dataKey="dayLabel"
              stroke="#8E8E93"
              fontSize={11}
              fontWeight={500}
              tickLine={false}
              axisLine={{ stroke: '#E5E5EA' }}
              dy={6}
            />
            <YAxis
              stroke="#8E8E93"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[0, maxReviews]}
              allowDecimals={false}
            />
            <Tooltip content={<CustomChartTooltip />} />

            {/* Target Goal Benchmark Line */}
            {showGoalLine && (
              <ReferenceLine
                y={DEFAULT_DAILY_TARGET}
                stroke="#10B981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Goal: ${DEFAULT_DAILY_TARGET}`,
                  position: 'insideTopRight',
                  fill: '#059669',
                  fontSize: 10,
                  fontWeight: 600,
                  offset: 4,
                }}
              />
            )}

            {/* Main Daily Reviews Trend Line */}
            <Line
              type="monotone"
              dataKey="reviews"
              name="Cards Reviewed"
              stroke="#007AFF"
              strokeWidth={3}
              activeDot={{
                r: 6,
                fill: '#007AFF',
                stroke: '#FFFFFF',
                strokeWidth: 2.5,
              }}
              dot={{
                r: 4,
                fill: '#007AFF',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }}
              animationDuration={500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Weekday Status Day-Pills */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mt-4 pt-4 border-t border-neutral-100">
        {stats.dailyBreakdown.map((item) => (
          <div
            key={item.dateStr}
            className={`flex flex-col items-center justify-center p-2 rounded-xl text-center transition-all ${
              item.isToday
                ? 'bg-blue-50/80 border border-blue-200/80 text-blue-900 shadow-2xs font-bold'
                : item.achievedTarget
                ? 'bg-emerald-50/60 border border-emerald-200/50 text-emerald-900'
                : item.reviews > 0
                ? 'bg-neutral-50 border border-black/5 text-neutral-800'
                : 'bg-neutral-50/40 border border-transparent text-neutral-400'
            }`}
          >
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold opacity-75">
              {item.dayLabel}
            </span>
            <span className="text-xs sm:text-sm font-bold my-0.5">
              {item.reviews}
            </span>
            <div className="h-3 flex items-center justify-center">
              {item.achievedTarget ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : item.reviews > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              ) : (
                <span className="w-1 h-1 rounded-full bg-neutral-300" />
              )}
            </div>
            {item.isToday && (
              <span className="text-[9px] text-blue-600 font-bold uppercase tracking-tight mt-0.5">
                Today
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
