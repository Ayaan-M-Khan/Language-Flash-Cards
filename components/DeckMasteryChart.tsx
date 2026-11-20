'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieChartIcon,
  CalendarClock,
  Play,
  BookOpen,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { CardDirection, CardState, Deck, Flashcard } from '@/lib/types';
import { formatInterval, isCardDue } from '@/lib/srs';
import { playHapticFeedback } from '@/lib/audio';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import {
  computeMasteryAnalytics,
  ForecastBucket,
  MasteryStageDatum,
  StoredReviewEvent,
} from '@/lib/mastery-analytics';
import {
  getReviewEvents,
  REVIEW_HISTORY_UPDATED_EVENT,
  ReviewHistoryUpdateDetail,
} from '@/lib/review-history';

export type { MasteryStageDatum };

interface DeckMasteryChartProps {
  decks: Deck[];
  selectedDeckId: string; // 'all' or a specific deck ID
  onSelectDeck: (deckId: string) => void;
  cards: Flashcard[];
  cardDirection?: CardDirection;
  onStudyDeck: (deckId: string | null, direction?: CardDirection) => void;
  onInspectDeck: (deck: Deck) => void;
  onNavigateToImport: () => void;
  userId?: string | null;
}

interface StageTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: MasteryStageDatum;
  }>;
}

interface ForecastTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: ForecastBucket;
  }>;
}

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

const MasteryTooltip: React.FC<StageTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-zinc-200/80 dark:border-white/10 text-xs max-w-[230px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-xs shrink-0 ${item.dotClass}`} />
          <span className="font-semibold text-zinc-950 dark:text-zinc-50">{item.label}</span>
        </div>
        <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
          {item.percentage}%
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mb-2">
        {item.description}
      </p>
      <div className="pt-1.5 border-t border-zinc-100 dark:border-white/[0.06] space-y-1 text-[11px] tabular-nums">
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Cards in stage</span>
          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
            {item.count}
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Due right now</span>
          <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
            {item.dueCount}
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <span>Avg. interval</span>
          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
            {item.avgIntervalLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

const ForecastTooltip: React.FC<ForecastTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-zinc-200/80 dark:border-white/10 text-xs max-w-[230px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-semibold text-zinc-950 dark:text-zinc-50">{item.label}</span>
        <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
          {item.count} {item.count === 1 ? 'card' : 'cards'}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
        {item.description}
      </p>
    </div>
  );
};

export const DeckMasteryChart: React.FC<DeckMasteryChartProps> = ({
  decks,
  selectedDeckId,
  onSelectDeck,
  cards,
  cardDirection = 'target-first',
  onStudyDeck,
  onInspectDeck,
  onNavigateToImport,
  userId = null,
}) => {
  const isClient = useIsClient();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const effectiveUserId = userId ?? user?.uid ?? null;

  const [chartType, setChartType] = useState<'bar' | 'donut' | 'forecast'>('bar');
  const [expandedStage, setExpandedStage] = useState<CardState | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  // Stay in sync on every review or cloud merge event
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

  const reviewEvents = useMemo<StoredReviewEvent[]>(() => {
    if (!isClient) return [];
    void historyVersion;
    return getReviewEvents(effectiveUserId);
  }, [isClient, effectiveUserId, historyVersion]);

  const deckCardCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const card of cards) {
      map[card.deckId] = (map[card.deckId] || 0) + 1;
    }
    return map;
  }, [cards]);

  const selectedDeck = useMemo(() => {
    if (selectedDeckId === 'all') return null;
    return decks.find((d) => d.id === selectedDeckId) ?? null;
  }, [decks, selectedDeckId]);

  const resolvedScopeId = selectedDeck ? selectedDeck.id : 'all';

  const analytics = useMemo(() => {
    return computeMasteryAnalytics(cards, decks, resolvedScopeId, reviewEvents);
  }, [cards, decks, resolvedScopeId, reviewEvents]);

  if (!isClient) {
    return (
      <div className="w-full bg-white dark:bg-[#111114] rounded-2xl p-6 border border-zinc-200/80 dark:border-white/[0.08] animate-pulse min-h-[340px]" />
    );
  }

  // Empty state when user has zero decks
  if (decks.length === 0) {
    return (
      <section
        id="deck-mastery-empty-section"
        aria-label="Deck Mastery Distribution"
        className="w-full bg-white dark:bg-[#111114] rounded-2xl p-6 sm:p-8 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)]"
      >
        <div className="max-w-md mx-auto py-4 text-center flex flex-col items-center">
          <h2 className="text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 mb-1.5">
            Mastery &amp; Retention
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-5 leading-relaxed">
            Import or create your first vocabulary deck to inspect how cards progress across New, Learning, Reviewing, and Mastered stages.
          </p>
          <button
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToImport();
            }}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Deck from Table</span>
          </button>
        </div>
      </section>
    );
  }

  const nonZeroDonutSlices = analytics.distribution.filter((d) => d.count > 0);
  const inspectedStageDatum = expandedStage
    ? analytics.distribution.find((s) => s.state === expandedStage) ?? null
    : null;
  const { ratingBreakdown } = analytics;

  return (
    <section
      id="deck-mastery-distribution-section"
      aria-label="Mastery and Retention Analytics"
      className="w-full bg-white dark:bg-[#111114] rounded-2xl p-5 sm:p-6 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] transition-all flex flex-col"
    >
      {/* Header Row: Title + Deck Scope & Chart Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-white/[0.06]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap">
            Mastery &amp; Retention
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums truncate mt-0.5">
            {analytics.scopeSubtitle}
          </p>
        </div>

        {/* Right Controls: Deck Selector & Chart Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label htmlFor="mastery-deck-select" className="sr-only">
            Select deck scope for mastery analytics
          </label>
          <select
            id="mastery-deck-select"
            value={resolvedScopeId}
            onChange={(e) => {
              playHapticFeedback('tap');
              setExpandedStage(null);
              onSelectDeck(e.target.value);
            }}
            className="h-8 px-2.5 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-zinc-800 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] outline-hidden font-medium max-w-[175px] truncate cursor-pointer transition-colors"
          >
            <option value="all">All Decks ({cards.length})</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({deckCardCounts[d.id] || 0})
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Mastery chart mode"
            className="flex items-center p-1 bg-zinc-100 dark:bg-white/[0.05] rounded-xl border border-zinc-200/70 dark:border-white/[0.06] text-xs font-medium"
          >
            <button
              id="mastery-mode-stages-btn"
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                setChartType('bar');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Stages</span>
            </button>
            <button
              id="mastery-mode-donut-btn"
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                setChartType('donut');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'donut'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
            <button
              id="mastery-mode-forecast-btn"
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                setChartType('forecast');
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'forecast'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-2xs font-semibold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Forecast</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 sm:gap-0 sm:divide-x divide-zinc-100 dark:divide-white/[0.06] py-3.5 border-b border-zinc-100 dark:border-white/[0.06] tabular-nums">
        <div className="sm:pr-3">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Mastery Score
          </div>
          <div
            id="mastery-score-value"
            className="text-lg sm:text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5"
          >
            {analytics.masteryScorePct}%
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="font-mono">{analytics.masteredCount}/{analytics.totalCards}</span> mastered
          </div>
        </div>

        <div className="sm:px-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Recall Accuracy
          </div>
          <div
            id="mastery-accuracy-value"
            className="text-lg sm:text-xl font-semibold font-mono text-blue-600 dark:text-blue-400 mt-0.5"
          >
            {ratingBreakdown.retentionRatePct !== null
              ? `${ratingBreakdown.retentionRatePct}%`
              : '—'}
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {ratingBreakdown.total > 0
              ? `${ratingBreakdown.recalledCount}/${ratingBreakdown.total} recalled`
              : 'Rate cards to track'}
          </div>
        </div>

        <div className="sm:px-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Avg. Interval
          </div>
          <div className="text-lg sm:text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5">
            {analytics.avgIntervalLabel}
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Avg <span className="font-mono">{analytics.avgRepetitions}</span> reps
          </div>
        </div>

        <div className="sm:pl-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Mean Ease
          </div>
          <div className="text-lg sm:text-xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 mt-0.5">
            {analytics.avgEaseLabel}
            <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">×</span>
          </div>
          <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
            <span className="font-mono">{analytics.reviewedCount}</span> studied ·{' '}
            <span className="font-mono">{analytics.dueCount}</span> due
          </div>
        </div>
      </div>

      {/* Main Visualization Body */}
      {analytics.totalCards === 0 ? (
        <div className="py-10 text-center flex flex-col items-center">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
            No flashcards in &ldquo;{analytics.scopeTitle}&rdquo; yet
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-4">
            Add vocabulary cards to visualize SM-2 mastery stages and retention.
          </p>
          {selectedDeck && (
            <button
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                onInspectDeck(selectedDeck);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Add Cards to Deck</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-center">
            {/* Recharts Canvas (7 cols) */}
            <div className="lg:col-span-7 w-full h-60 sm:h-64 select-none">
              {chartType === 'bar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.distribution}
                    margin={{ top: 10, right: 10, left: -20, bottom: 2 }}
                    barSize={40}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#27272A' : '#F1F5F9'}
                    />
                    <XAxis
                      dataKey="label"
                      stroke={isDark ? '#A1A1AA' : '#71717A'}
                      fontSize={12}
                      fontWeight={500}
                      tickLine={false}
                      axisLine={{ stroke: isDark ? '#27272A' : '#E4E4E7' }}
                      dy={6}
                    />
                    <YAxis
                      stroke={isDark ? '#71717A' : '#71717A'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, analytics.maxBucketCount]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{
                        fill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.03)',
                        radius: 6,
                      }}
                      content={<MasteryTooltip />}
                    />
                    <Bar
                      dataKey="count"
                      name="Cards"
                      radius={[6, 6, 2, 2]}
                      isAnimationActive={false}
                    >
                      {analytics.distribution.map((entry) => (
                        <Cell key={entry.state} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === 'donut' && (
                <div className="relative w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={nonZeroDonutSlices}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="85%"
                        paddingAngle={nonZeroDonutSlices.length > 1 ? 3 : 0}
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {nonZeroDonutSlices.map((entry) => (
                          <Cell key={entry.state} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<MasteryTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center tabular-nums">
                    <span className="text-2xl font-semibold font-mono text-zinc-950 dark:text-zinc-50 leading-none">
                      {analytics.masteryScorePct}%
                    </span>
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                      Mastery
                    </span>
                  </div>
                </div>
              )}

              {chartType === 'forecast' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.forecast}
                    margin={{ top: 10, right: 10, left: -20, bottom: 2 }}
                    barSize={34}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#27272A' : '#F1F5F9'}
                    />
                    <XAxis
                      dataKey="shortLabel"
                      stroke={isDark ? '#A1A1AA' : '#71717A'}
                      fontSize={12}
                      fontWeight={500}
                      tickLine={false}
                      axisLine={{ stroke: isDark ? '#27272A' : '#E4E4E7' }}
                      dy={6}
                    />
                    <YAxis
                      stroke={isDark ? '#71717A' : '#71717A'}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, analytics.maxForecastCount]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{
                        fill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.03)',
                        radius: 6,
                      }}
                      content={<ForecastTooltip />}
                    />
                    <Bar
                      dataKey="count"
                      name="Scheduled"
                      radius={[6, 6, 2, 2]}
                      isAnimationActive={false}
                    >
                      {analytics.forecast.map((bucket) => (
                        <Cell key={bucket.id} fill={bucket.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Interactive Stage Breakdown & Actions (5 cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between">
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] border-t border-b border-zinc-100 dark:border-white/[0.06]">
                {analytics.distribution.map((stage) => {
                  const isSelected = expandedStage === stage.state;
                  return (
                    <button
                      key={stage.state}
                      type="button"
                      disabled={stage.count === 0}
                      onClick={() => {
                        playHapticFeedback('tap');
                        setExpandedStage((prev) => (prev === stage.state ? null : stage.state));
                      }}
                      className={`w-full text-left py-2.5 px-2 -mx-2 rounded-xl flex items-center justify-between gap-3 text-xs tabular-nums transition-colors ${
                        stage.count === 0
                          ? 'opacity-55 cursor-default'
                          : isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/35 cursor-pointer'
                          : 'hover:bg-zinc-50 dark:hover:bg-white/[0.04] cursor-pointer'
                      }`}
                      title={
                        stage.count > 0
                          ? `Inspect ${stage.count} ${stage.label.toLowerCase()} cards`
                          : undefined
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-xs shrink-0 ${stage.dotClass}`} />
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {stage.label}
                          </span>
                          {stage.avgIntervalLabel !== '—' && (
                            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                              · {stage.avgIntervalLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate pl-4 mt-0.5">
                          {stage.dueCount > 0 ? `${stage.dueCount} due now` : stage.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {stage.count}{' '}
                          <span className="font-normal text-zinc-400 dark:text-zinc-500">
                            ({stage.percentage}%)
                          </span>
                        </div>
                        {stage.count > 0 &&
                          (isSelected ? (
                            <ChevronUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                          ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Rating Mix Bar */}
              {ratingBreakdown.total > 0 && (
                <div className="pt-3.5 tabular-nums">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                      Rating Mix (<span className="font-mono">{ratingBreakdown.total}</span>)
                    </span>
                    <span className="font-mono text-zinc-400 dark:text-zinc-500">
                      {ratingBreakdown.strongRecallPct}% Good/Easy
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/[0.07] flex overflow-hidden">
                    {ratingBreakdown.again > 0 && (
                      <div
                        style={{
                          width: `${(ratingBreakdown.again / ratingBreakdown.total) * 100}%`,
                        }}
                        className="bg-rose-500"
                        title={`Again: ${ratingBreakdown.again}`}
                      />
                    )}
                    {ratingBreakdown.hard > 0 && (
                      <div
                        style={{
                          width: `${(ratingBreakdown.hard / ratingBreakdown.total) * 100}%`,
                        }}
                        className="bg-amber-500"
                        title={`Hard: ${ratingBreakdown.hard}`}
                      />
                    )}
                    {ratingBreakdown.good > 0 && (
                      <div
                        style={{
                          width: `${(ratingBreakdown.good / ratingBreakdown.total) * 100}%`,
                        }}
                        className="bg-blue-600"
                        title={`Good: ${ratingBreakdown.good}`}
                      />
                    )}
                    {ratingBreakdown.easy > 0 && (
                      <div
                        style={{
                          width: `${(ratingBreakdown.easy / ratingBreakdown.total) * 100}%`,
                        }}
                        className="bg-emerald-500"
                        title={`Easy: ${ratingBreakdown.easy}`}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-1.5">
                    <span className="text-rose-600 dark:text-rose-400">
                      Again {ratingBreakdown.again}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400">
                      Hard {ratingBreakdown.hard}
                    </span>
                    <span className="text-blue-600 dark:text-blue-400">
                      Good {ratingBreakdown.good}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Easy {ratingBreakdown.easy}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="pt-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('tap');
                      onStudyDeck(selectedDeck ? selectedDeck.id : null, cardDirection);
                    }}
                    className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer tabular-nums whitespace-nowrap shadow-xs"
                  >
                    <Play className="w-3 h-3 fill-current shrink-0" />
                    <span className="truncate">
                      {analytics.dueCount > 0 ? `Study (${analytics.dueCount})` : 'Practice'}
                    </span>
                  </button>

                  {selectedDeck && (
                    <button
                      type="button"
                      onClick={() => {
                        playHapticFeedback('tap');
                        onInspectDeck(selectedDeck);
                      }}
                      className="h-9 px-3 rounded-xl bg-zinc-50 dark:bg-[#18181B] hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] font-medium text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Browse</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Stage Card Inspector */}
          {inspectedStageDatum && inspectedStageDatum.cards.length > 0 && (
            <div
              id="mastery-stage-inspector"
              className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-xs ${inspectedStageDatum.dotClass}`} />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {inspectedStageDatum.label} Cards ({inspectedStageDatum.count})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedStage(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  aria-label="Close stage inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-44 overflow-y-auto divide-y divide-zinc-100 dark:divide-white/[0.06] rounded-xl border border-zinc-200/70 dark:border-white/[0.07] bg-zinc-50/80 dark:bg-[#18181B] px-3">
                {inspectedStageDatum.cards.slice(0, 25).map((card) => {
                  const due = isCardDue(card);
                  return (
                    <div
                      key={card.id}
                      className="py-2 flex items-center justify-between gap-3 text-xs tabular-nums"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {card.targetWord}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-600 mx-1.5">·</span>
                        <span className="text-zinc-600 dark:text-zinc-300 truncate">
                          {card.english}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        <span>
                          {card.state === 'new' ? 'New' : formatInterval(card.intervalDays)}
                        </span>
                        <span>·</span>
                        <span>{(card.easeFactor || 2.5).toFixed(2)}×</span>
                        {due && (
                          <span className="font-sans font-semibold text-rose-600 dark:text-rose-400">
                            Due
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {inspectedStageDatum.cards.length > 25 && (
                  <div className="py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                    Showing 25 of {inspectedStageDatum.cards.length} cards
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
