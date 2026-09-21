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
} from 'lucide-react';
import {
  getWeeklyConsistencyStats,
  DEFAULT_DAILY_TARGET,
  DailyReviewData,
} from '@/lib/review-history';

interface WeeklyReviewTrackerProps {
  currentStreak?: number;
  refreshTrigger?: number; // changes whenever a card is reviewed
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
  currentStreak = 4,
  refreshTrigger = 0,
}) => {
  const isClient = useIsClient();
  const [showGoalLine, setShowGoalLine] = useState(true);
  const [storeVersion, setStoreVersion] = useState(0);

  // Subscribe to external storage event for real-time reactivity
  useEffect(() => {
    const handleStorageUpdate = () => {
      setStoreVersion((v) => v + 1);
    };

    window.addEventListener('language_flashcards_review_added', handleStorageUpdate);
    return () => {
      window.removeEventListener('language_flashcards_review_added', handleStorageUpdate);
    };
  }, []);

  const stats = useMemo(() => {
    return getWeeklyConsistencyStats(DEFAULT_DAILY_TARGET, refreshTrigger + storeVersion);
  }, [refreshTrigger, storeVersion]);

  const maxReviews = useMemo(() => {
    const highest = Math.max(...stats.dailyBreakdown.map((d) => d.reviews), DEFAULT_DAILY_TARGET);
    return Math.ceil((highest + 5) / 5) * 5;
  }, [stats]);

  if (!isClient) {
    return (
      <div className="w-full bg-white rounded-3xl p-6 shadow-xs border border-black/5 animate-pulse min-h-[340px]" />
    );
  }

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
              Spaced repetition daily retention & 7-day review activity
            </p>
          </div>
        </div>

        {/* Right action badges */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="toggle-goal-line-btn"
            onClick={() => setShowGoalLine((prev) => !prev)}
            className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
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
            title="Active streak days"
          >
            <Flame className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
            <span>{currentStreak}d Streak</span>
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
              animationDuration={800}
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
