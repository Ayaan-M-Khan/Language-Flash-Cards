'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
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
  Play,
  BookOpen,
  Plus,
  Layers,
  Download,
  Check,
  ArrowLeftRight,
} from 'lucide-react';
import { CardDirection, CardState, Deck, Flashcard } from '@/lib/types';
import { formatInterval, isCardDue } from '@/lib/srs';
import { playHapticFeedback } from '@/lib/audio';

export interface MasteryStageDatum {
  state: CardState;
  label: string;
  shortLabel: string;
  description: string;
  count: number;
  percentage: number;
  dueCount: number;
  avgIntervalLabel: string;
  fill: string;
  dotClass: string;
  textClass: string;
}

interface DeckMasteryChartProps {
  decks: Deck[];
  selectedDeck: Deck | null;
  onSelectDeck: (deckId: string) => void;
  cards: Flashcard[];
  cardDirection?: CardDirection;
  onChangeCardDirection?: (deckId: string, direction: CardDirection) => void;
  onStudyDeck: (deckId: string, direction?: CardDirection) => void;
  onInspectDeck: (deck: Deck) => void;
  onNavigateToImport: () => void;
  onExportDeckCsv: (deck: Deck) => void;
  exportedDeckId?: string | null;
}

interface MasteryTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: MasteryStageDatum;
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

const MASTERY_STAGE_META: Array<{
  state: CardState;
  label: string;
  shortLabel: string;
  description: string;
  fill: string;
  dotClass: string;
  textClass: string;
}> = [
  {
    state: 'new',
    label: 'New',
    shortLabel: 'New',
    description: 'Unseen cards queued for first introduction',
    fill: '#94A3B8',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-700',
  },
  {
    state: 'learning',
    label: 'Learning',
    shortLabel: 'Learning',
    description: 'Short-interval acquisition (< 1 day)',
    fill: '#F97316',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-700',
  },
  {
    state: 'review',
    label: 'Reviewing',
    shortLabel: 'Review',
    description: 'Active SM-2 spaced repetition loop',
    fill: '#2563EB',
    dotClass: 'bg-blue-600',
    textClass: 'text-blue-700',
  },
  {
    state: 'mastered',
    label: 'Mastered',
    shortLabel: 'Mastered',
    description: 'Long-term recall stability achieved',
    fill: '#10B981',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
];

const MasteryTooltip: React.FC<MasteryTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const item = payload[0].payload;

  return (
    <div className="bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-lg border border-black/10 text-xs max-w-[230px]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${item.dotClass}`} />
          <span className="font-bold text-neutral-900">{item.label}</span>
        </div>
        <span className="font-bold text-neutral-900 tabular-nums">
          {item.percentage}%
        </span>
      </div>
      <p className="text-[11px] text-neutral-500 leading-snug mb-2">
        {item.description}
      </p>
      <div className="pt-1.5 border-t border-neutral-100 space-y-1 text-[11px] tabular-nums">
        <div className="flex items-center justify-between text-neutral-600">
          <span>Cards in stage</span>
          <span className="font-semibold text-neutral-900">{item.count}</span>
        </div>
        <div className="flex items-center justify-between text-neutral-600">
          <span>Due right now</span>
          <span className="font-semibold text-rose-600">{item.dueCount}</span>
        </div>
        <div className="flex items-center justify-between text-neutral-600">
          <span>Avg. interval</span>
          <span className="font-semibold text-neutral-900">{item.avgIntervalLabel}</span>
        </div>
      </div>
    </div>
  );
};

export const DeckMasteryChart: React.FC<DeckMasteryChartProps> = ({
  decks,
  selectedDeck,
  onSelectDeck,
  cards,
  cardDirection = 'target-first',
  onChangeCardDirection,
  onStudyDeck,
  onInspectDeck,
  onNavigateToImport,
  onExportDeckCsv,
  exportedDeckId = null,
}) => {
  const isClient = useIsClient();
  const [chartType, setChartType] = useState<'bar' | 'donut'>('bar');

  const deckCardCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const card of cards) {
      map[card.deckId] = (map[card.deckId] || 0) + 1;
    }
    return map;
  }, [cards]);

  const selectedDeckCards = useMemo(() => {
    if (!selectedDeck) return [];
    return cards.filter((c) => c.deckId === selectedDeck.id);
  }, [cards, selectedDeck]);

  const { distribution, dueTotal, masteredPct, avgEase, avgIntervalFormatted, maxBucketCount } =
    useMemo(() => {
      const total = selectedDeckCards.length;
      const now = new Date();

      const stages: MasteryStageDatum[] = MASTERY_STAGE_META.map((meta) => {
        const matching = selectedDeckCards.filter((c) => c.state === meta.state);
        const count = matching.length;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const dueCount = matching.filter((c) => isCardDue(c, now)).length;

        const avgDays =
          count > 0
            ? matching.reduce((sum, c) => sum + (c.intervalDays || 0), 0) / count
            : 0;

        const avgIntervalLabel =
          meta.state === 'new' || count === 0 ? '—' : formatInterval(avgDays);

        return {
          ...meta,
          count,
          percentage,
          dueCount,
          avgIntervalLabel,
        };
      });

      const dueCountAll = selectedDeckCards.filter((c) => isCardDue(c, now)).length;
      const masteredCount = stages.find((s) => s.state === 'mastered')?.count ?? 0;
      const pctMastered = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

      const meanEase =
        total > 0
          ? selectedDeckCards.reduce((sum, c) => sum + (c.easeFactor || 2.5), 0) / total
          : 2.5;

      const reviewedCards = selectedDeckCards.filter((c) => c.state !== 'new');
      const meanIntervalDays =
        reviewedCards.length > 0
          ? reviewedCards.reduce((sum, c) => sum + (c.intervalDays || 0), 0) /
            reviewedCards.length
          : 0;

      const highestCount = Math.max(...stages.map((s) => s.count), 4);
      const yAxisMax = Math.ceil((highestCount + 1) / 2) * 2;

      return {
        distribution: stages,
        dueTotal: dueCountAll,
        masteredPct: pctMastered,
        avgEase: meanEase.toFixed(2),
        avgIntervalFormatted:
          reviewedCards.length > 0 ? formatInterval(meanIntervalDays) : 'New',
        maxBucketCount: yAxisMax,
      };
    }, [selectedDeckCards]);

  if (!isClient) {
    return (
      <div className="w-full bg-white rounded-3xl p-6 shadow-xs border border-black/5 animate-pulse min-h-[320px]" />
    );
  }

  // Empty state when user has zero decks
  if (decks.length === 0 || !selectedDeck) {
    return (
      <section
        id="deck-mastery-empty-section"
        aria-label="Deck Mastery Distribution"
        className="w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-black/5"
      >
        <div className="max-w-md mx-auto py-4 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h2 className="text-base sm:text-lg font-bold text-neutral-900 mb-1">
            Card Mastery Distribution
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mb-5 leading-relaxed">
            Import or create your first vocabulary deck to inspect how cards progress across New, Learning, Reviewing, and Mastered stages.
          </p>
          <button
            onClick={() => {
              playHapticFeedback('tap');
              onNavigateToImport();
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Deck from Table</span>
          </button>
        </div>
      </section>
    );
  }

  const nonZeroDonutSlices = distribution.filter((d) => d.count > 0);

  return (
    <section
      id="deck-mastery-distribution-section"
      aria-label="Selected Deck Mastery Distribution"
      className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-black/5 transition-all"
    >
      {/* Header Row: Deck Title + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900">
                Card Mastery Distribution
              </h2>
              <span className="text-xs text-neutral-400">·</span>
              <span className="text-xs font-semibold text-blue-600 truncate">
                {selectedDeck.title}
              </span>
            </div>
            <p className="text-xs text-neutral-500 tabular-nums mt-0.5">
              {selectedDeck.language} · {selectedDeckCards.length}{' '}
              {selectedDeckCards.length === 1 ? 'card' : 'cards'} · {dueTotal} due now ·{' '}
              {masteredPct}% mastered
            </p>
          </div>
        </div>

        {/* Right Controls: Deck Selector & Chart Mode Toggle */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-neutral-400 shrink-0 hidden sm:block" />
            <label htmlFor="mastery-deck-select" className="sr-only">
              Select deck to inspect mastery distribution
            </label>
            <select
              id="mastery-deck-select"
              value={selectedDeck.id}
              onChange={(e) => {
                playHapticFeedback('tap');
                onSelectDeck(e.target.value);
              }}
              className="px-3 py-1.5 text-xs rounded-xl bg-neutral-100 hover:bg-neutral-200/70 text-neutral-800 border border-neutral-200/80 outline-hidden font-semibold max-w-[220px] truncate cursor-pointer transition-colors"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({deckCardCounts[d.id] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Chart Type Segmented Switch */}
          <div
            role="group"
            aria-label="Chart visualization type"
            className="flex items-center p-0.5 bg-neutral-100 rounded-xl border border-neutral-200/60 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                setChartType('bar');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'bar'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bars</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playHapticFeedback('tap');
                setChartType('donut');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                chartType === 'donut'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Proportion</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Deck Switcher Buttons when multiple decks exist */}
      {decks.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-neutral-100">
          {decks.map((deck) => {
            const isSelected = deck.id === selectedDeck.id;
            const count = deckCardCounts[deck.id] || 0;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  onSelectDeck(deck.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer tabular-nums flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-neutral-900 text-white font-semibold shadow-2xs'
                    : 'bg-neutral-100/80 hover:bg-neutral-200/70 text-neutral-600 font-medium'
                }`}
              >
                <span>{deck.title}</span>
                <span
                  className={`text-[11px] ${
                    isSelected ? 'text-neutral-300' : 'text-neutral-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Key Deck SRS Telemetry Strip (Single-Elevation Divided Row) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 py-3.5 border-b border-neutral-100 tabular-nums">
        <div className="pr-3 py-1 sm:py-0">
          <div className="text-[11px] font-medium text-neutral-500">Deck Size</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-900 mt-0.5">
            {selectedDeckCards.length}{' '}
            <span className="text-xs font-normal text-neutral-400">cards</span>
          </div>
        </div>
        <div className=" sm:px-4 py-1 sm:py-0">
          <div className="text-[11px] font-medium text-neutral-500">Mastery Rate</div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 mt-0.5">
            {masteredPct}%
          </div>
        </div>
        <div className="pr-3 sm:px-4 pt-2 sm:pt-0">
          <div className="text-[11px] font-medium text-neutral-500">Avg. Memory Interval</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-900 mt-0.5">
            {avgIntervalFormatted}
          </div>
        </div>
        <div className="sm:pl-4 pt-2 sm:pt-0">
          <div className="text-[11px] font-medium text-neutral-500">Mean Ease Factor</div>
          <div className="text-lg sm:text-xl font-bold text-neutral-900 mt-0.5">
            {avgEase}
            <span className="text-xs font-normal text-neutral-400">×</span>
          </div>
        </div>
      </div>

      {/* Main Visualization Body */}
      {selectedDeckCards.length === 0 ? (
        <div className="py-10 text-center flex flex-col items-center">
          <p className="text-sm font-semibold text-neutral-800 mb-1">
            No flashcards in &ldquo;{selectedDeck.title}&rdquo; yet
          </p>
          <p className="text-xs text-neutral-500 max-w-sm mb-4">
            Add vocabulary cards to this deck to visualize its SM-2 mastery distribution.
          </p>
          <button
            type="button"
            onClick={() => {
              playHapticFeedback('tap');
              onInspectDeck(selectedDeck);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Add Cards to Deck</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 items-center">
          {/* Recharts Canvas (7 cols) */}
          <div className="lg:col-span-7 w-full h-60 sm:h-64 select-none">
            {chartType === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distribution}
                  margin={{ top: 10, right: 12, left: -20, bottom: 2 }}
                  barSize={44}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F0F0F4"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#8E8E93"
                    fontSize={12}
                    fontWeight={600}
                    tickLine={false}
                    axisLine={{ stroke: '#E5E5EA' }}
                    dy={6}
                  />
                  <YAxis
                    stroke="#8E8E93"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, maxBucketCount]}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0, 0, 0, 0.03)', radius: 8 }}
                    content={<MasteryTooltip />}
                  />
                  <Bar
                    dataKey="count"
                    name="Cards"
                    radius={[10, 10, 4, 4]}
                    animationDuration={450}
                  >
                    {distribution.map((entry) => (
                      <Cell key={entry.state} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="relative w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={nonZeroDonutSlices}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="85%"
                      paddingAngle={nonZeroDonutSlices.length > 1 ? 3 : 0}
                      strokeWidth={0}
                      animationDuration={450}
                    >
                      {nonZeroDonutSlices.map((entry) => (
                        <Cell key={entry.state} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<MasteryTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Donut Readout */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center tabular-nums">
                  <span className="text-2xl font-bold text-neutral-900 leading-none">
                    {masteredPct}%
                  </span>
                  <span className="text-[11px] font-medium text-neutral-500 mt-1">
                    Mastered
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stage Breakdown & Quick Actions (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div className="divide-y divide-neutral-100 border-t border-b border-neutral-100">
              {distribution.map((stage) => (
                <div
                  key={stage.state}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs tabular-nums"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-xs shrink-0 ${stage.dotClass}`} />
                      <span className="font-semibold text-neutral-900">{stage.label}</span>
                      {stage.avgIntervalLabel !== '—' && (
                        <span className="text-[11px] text-neutral-400">
                          · avg {stage.avgIntervalLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate pl-4.5 mt-0.5">
                      {stage.dueCount > 0
                        ? `${stage.dueCount} due now`
                        : stage.description}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-neutral-900">
                      {stage.count}{' '}
                      <span className="font-normal text-neutral-400">
                        ({stage.percentage}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Card Order Picker & Footer Action Buttons for Selected Deck */}
            <div className="pt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-neutral-500">
                  Card Definition Order
                </span>
                <div
                  role="group"
                  aria-label="Selected deck card order"
                  className="inline-flex items-center p-0.5 bg-neutral-100 rounded-xl border border-neutral-200/80 text-xs font-medium shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('tap');
                      onChangeCardDirection?.(selectedDeck.id, 'target-first');
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      cardDirection === 'target-first'
                        ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Word → Def
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('tap');
                      onChangeCardDirection?.(selectedDeck.id, 'definition-first');
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      cardDirection === 'definition-first'
                        ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    <ArrowLeftRight className="w-3 h-3 shrink-0" />
                    <span>Def → Translit</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playHapticFeedback('tap');
                    onStudyDeck(selectedDeck.id, cardDirection);
                  }}
                  className="flex-1 min-w-[160px] py-2.5 px-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer tabular-nums whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span className="truncate">
                    {dueTotal > 0
                      ? `Study ${selectedDeck.title} (${dueTotal} due)`
                      : `Practice ${selectedDeck.title}`}
                  </span>
                </button>

              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  onInspectDeck(selectedDeck);
                }}
                className="py-2.5 px-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Cards</span>
              </button>

              <button
                id="selected-deck-export-csv-btn"
                type="button"
                onClick={() => onExportDeckCsv(selectedDeck)}
                title={`Export "${selectedDeck.title}" (${selectedDeckCards.length} cards) as CSV`}
                className={`py-2.5 px-3.5 rounded-2xl font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  exportedDeckId === selectedDeck.id
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                {exportedDeckId === selectedDeck.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Saved CSV</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Export CSV</span>
                  </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
