'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Zap,
  ArrowRight,
  ArrowLeftRight,
} from 'lucide-react';
import { CardDirection, Flashcard, Deck, TableRowInput } from '@/lib/types';
import { parseTableText } from '@/lib/table-parser';
import { initializeCardSchedule } from '@/lib/srs';
import { SAMPLE_TABLE_PRESETS } from '@/lib/default-data';
import { playHapticFeedback } from '@/lib/audio';
import { resolveSpeechLanguageCode } from '@/lib/speech-utils';

interface TableImporterProps {
  onDeckCreated: (newDeck: Deck, newCards: Flashcard[]) => void;
  onNavigateToStudy: (deckId: string, direction?: CardDirection) => void;
}

export const TableImporter: React.FC<TableImporterProps> = ({
  onDeckCreated,
  onNavigateToStudy,
}) => {
  const [rawText, setRawText] = useState<string>(SAMPLE_TABLE_PRESETS[0].rawText);
  const [deckTitle, setDeckTitle] = useState<string>(SAMPLE_TABLE_PRESETS[0].name);
  const [targetLanguage, setTargetLanguage] = useState<string>(SAMPLE_TABLE_PRESETS[0].language);
  const [scheduleMode, setScheduleMode] = useState<'staggered' | 'immediate'>('staggered');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [successInfo, setSuccessInfo] = useState<{
    deckId: string;
    cardCount: number;
    deckTitle: string;
    isFallback?: boolean;
  } | null>(null);
  const [studyDirection, setStudyDirection] = useState<CardDirection>('target-first');

  const parsed = useMemo(() => parseTableText(rawText), [rawText]);

  // Parse table rows whenever rawText changes or user edits
  const [editableRows, setEditableRows] = useState<TableRowInput[]>(() => {
    return parseTableText(SAMPLE_TABLE_PRESETS[0].rawText).rows;
  });

  const handleRawTextChange = (text: string) => {
    setRawText(text);
    const res = parseTableText(text);
    setEditableRows(res.rows);

    if (res.detectedLanguage && res.detectedLanguage !== 'Foreign Language') {
      setTargetLanguage(res.detectedLanguage);
    }
    if (res.detectedTitle) {
      setDeckTitle(res.detectedTitle);
    }
    setSelectedSectionFilter('all');
  };

  // Handle preset selection
  const handleLoadPreset = (idx: number) => {
    playHapticFeedback('tap');
    const preset = SAMPLE_TABLE_PRESETS[idx];
    setRawText(preset.rawText);
    const res = parseTableText(preset.rawText);
    setEditableRows(res.rows);
    setDeckTitle(preset.name);
    setTargetLanguage(preset.language);
    setSelectedSectionFilter('all');
    setSuccessInfo(null);
    setErrorMessage(null);
  };

  // Add empty row
  const handleAddRow = () => {
    playHapticFeedback('tap');
    const newRow: TableRowInput = {
      english: '',
      targetWord: '',
      category: selectedSectionFilter !== 'all' ? selectedSectionFilter : 'General',
    };
    setEditableRows((prev) => [...prev, newRow]);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    playHapticFeedback('tap');
    setEditableRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Update cell in table editor
  const handleCellChange = (
    index: number,
    field: keyof TableRowInput,
    value: string
  ) => {
    setEditableRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // 1. INSTANT LOCAL GENERATION (Zero network delay, instant SM-2 optimal schedules)
  const handleGenerateInstant = () => {
    playHapticFeedback('rating');
    const validRows = editableRows.filter((r) => r.english.trim() && r.targetWord.trim());
    if (validRows.length === 0) {
      setErrorMessage('Please add at least one row with an English word and a target language word.');
      return;
    }

    setErrorMessage(null);
    const newDeckId = `deck-${Date.now()}`;
    const cleanLanguage = targetLanguage.trim() || parsed.detectedLanguage || 'Language';
    const sampleTargetText = validRows
      .slice(0, 12)
      .map((r) => r.targetWord)
      .join(' ');
    const langCode = resolveSpeechLanguageCode(
      cleanLanguage || parsed.detectedLanguageCode,
      sampleTargetText
    );

    const sectionCount = parsed.sections ? parsed.sections.length : 1;
    const newDeck: Deck = {
      id: newDeckId,
      title: deckTitle.trim() || parsed.detectedTitle || `${cleanLanguage} Smart Deck`,
      language: cleanLanguage,
      languageCode: langCode,
      color: (parsed.detectedColor as any) || 'blue',
      description: `Spaced repetition deck with ${validRows.length} vocabulary words across ${sectionCount} topic ${sectionCount === 1 ? 'section' : 'sections'}.`,
      icon: parsed.detectedIcon || 'BookOpen',
      createdAt: new Date().toISOString(),
    };

    const batchTimestamp = Date.now();
    const newCards: Flashcard[] = validRows.map((row, idx) => {
      const staggerOffset = scheduleMode === 'staggered' ? idx : 0;
      return initializeCardSchedule(
        {
          deckId: newDeckId,
          orderIndex: idx,
          english: row.english.trim(),
          targetWord: row.targetWord.trim(),
          language: cleanLanguage,
          phonetic: row.phonetic,
          partOfSpeech: row.partOfSpeech,
          category: row.category || 'Core Vocabulary',
          notes: row.notes,
        },
        `card-${batchTimestamp}-${String(idx).padStart(5, '0')}`,
        staggerOffset
      );
    });

    onDeckCreated(newDeck, newCards);
    setSuccessInfo({
      deckId: newDeckId,
      cardCount: newCards.length,
      deckTitle: newDeck.title,
    });
  };

  // 2. AI SMART GENERATE & ENRICH (via Gemini API /api/generate-decks with client-side batching)
  const handleAIGenerate = async () => {
    playHapticFeedback('rating');
    const validRows = editableRows.filter((r) => r.english.trim() && r.targetWord.trim());
    if (validRows.length === 0) {
      setErrorMessage('Please add at least one row with an English word and a target language word.');
      return;
    }

    setIsAiLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/generate-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: validRows,
          deckTitle: deckTitle.trim() || parsed.detectedTitle,
          targetLanguage: targetLanguage.trim() || parsed.detectedLanguage,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      const allAiCards: any[] = Array.isArray(data.cards) ? data.cards : [];
      const hasAnyFallback = Boolean(data.fallback);

      const newDeckId = `deck-ai-${Date.now()}`;
      const cleanLanguage =
        data.detectedLanguage ||
        targetLanguage.trim() ||
        parsed.detectedLanguage ||
        'Foreign Language';

      const sampleTargetText = validRows
        .slice(0, 12)
        .map((r) => r.targetWord)
        .join(' ');
      const resolvedAiLangCode = resolveSpeechLanguageCode(
        data.languageCode || cleanLanguage || parsed.detectedLanguageCode,
        sampleTargetText
      );

      const newDeck: Deck = {
        id: newDeckId,
        title:
          data.deckTitle ||
          deckTitle.trim() ||
          parsed.detectedTitle ||
          `${cleanLanguage} Smart Deck`,
        language: cleanLanguage,
        languageCode: resolvedAiLangCode,
        color:
          (data.color as any) || (parsed.detectedColor as any) || 'indigo',
        description:
          data.deckDescription ||
          `Smart spaced repetition deck with ${validRows.length} vocabulary words across ${parsed.sections?.length || 1} sections.`,
        icon: data.icon || parsed.detectedIcon || 'Sparkles',
        createdAt: new Date().toISOString(),
      };

      const aiBatchTimestamp = Date.now();
      const newCards: Flashcard[] = validRows.map((row, idx) => {
        const staggerOffset = scheduleMode === 'staggered' ? idx : 0;

        // Match AI enrichment by targetWord, english, or position
        const aiCard =
          allAiCards.find(
            (c: any) =>
              c &&
              ((c.targetWord &&
                c.targetWord.trim().toLowerCase() === row.targetWord.trim().toLowerCase()) ||
               (c.english &&
                c.english.trim().toLowerCase() === row.english.trim().toLowerCase()))
          ) || allAiCards[idx];

        return initializeCardSchedule(
          {
            deckId: newDeckId,
            orderIndex: idx,
            english: row.english.trim(),
            targetWord: row.targetWord.trim(),
            language: newDeck.language,
            phonetic: row.phonetic?.trim() || aiCard?.phonetic?.trim() || '',
            partOfSpeech:
              row.partOfSpeech?.trim() ||
              aiCard?.partOfSpeech?.trim() ||
              (row.targetWord.includes(' ') ? 'phrase / expression' : 'word'),
            category: row.category?.trim() || aiCard?.category?.trim() || 'Core Vocabulary',
            exampleSentence: aiCard?.exampleTarget
              ? {
                  target: aiCard.exampleTarget,
                  english: aiCard.exampleEnglish || '',
                }
              : undefined,
            notes: row.notes?.trim() || aiCard?.notes?.trim() || '',
          },
          `card-ai-${aiBatchTimestamp}-${String(idx).padStart(5, '0')}`,
          staggerOffset
        );
      });

      onDeckCreated(newDeck, newCards);
      setSuccessInfo({
        deckId: newDeckId,
        cardCount: newCards.length,
        deckTitle: newDeck.title,
        isFallback: hasAnyFallback,
      });
    } catch (err: unknown) {
      console.warn('AI smart enrich failed, falling back to local generator', err);
      // Seamlessly fallback so user is never blocked and retains all 81 cards
      handleGenerateInstant();
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateWithAi = handleAIGenerate;

  // Section categories for filtering
  const sectionCategories = useMemo(() => {
    const cats = new Set<string>();
    editableRows.forEach((r) => {
      if (r.category) cats.add(r.category);
    });
    return Array.from(cats);
  }, [editableRows]);

  // Filtered rows for the live preview table
  const displayedRows = useMemo(() => {
    if (selectedSectionFilter === 'all') return editableRows;
    return editableRows.filter((r) => r.category === selectedSectionFilter);
  }, [editableRows, selectedSectionFilter]);

  const isArabicScript = (text: string) => {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9">
      {/* Header & Sample Presets */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Import Vocabulary Table
          </h1>
          <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Paste tabs, CSV, or multi-section tables from Sheets or Excel to generate spaced repetition decks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mr-1">
            Samples
          </span>
          {SAMPLE_TABLE_PRESETS.map((preset, idx) => {
            const isSelected = deckTitle === preset.name;
            const shortLabel = preset.name.replace(/\s*\([^)]*\)/g, '').trim();
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleLoadPreset(idx)}
                title={preset.name}
                className={`h-8 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-transparent'
                    : 'bg-white dark:bg-[#111114] hover:bg-zinc-50 dark:hover:bg-[#18181B] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08]'
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {successInfo && (
        <div className="mb-5 p-4 rounded-2xl bg-emerald-50/75 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Generated &ldquo;{successInfo.deckTitle}&rdquo;
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Created <span className="font-mono">{successInfo.cardCount}</span> flashcards with SM-2 schedules
                {successInfo.isFallback ? ' · Instant Engine' : ' · AI Enriched'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <div
              role="group"
              aria-label="Card definition order"
              className="inline-flex items-center p-1 bg-white/90 dark:bg-[#18181B] rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-medium shrink-0"
            >
              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  setStudyDirection('target-first');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  studyDirection === 'target-first'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40'
                }`}
              >
                Word → Def
              </button>
              <button
                type="button"
                onClick={() => {
                  playHapticFeedback('tap');
                  setStudyDirection('definition-first');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  studyDirection === 'definition-first'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3 shrink-0" />
                <span>Def → Translit</span>
              </button>
            </div>

            <button
              id="start-study-imported-btn"
              type="button"
              onClick={() => onNavigateToStudy(successInfo.deckId, studyDirection)}
              className="w-full sm:w-auto h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Start Studying</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/35 border border-rose-200/80 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Raw Input + Deck Settings + Primary Actions */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white dark:bg-[#111114] rounded-2xl p-4 sm:p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <label
                htmlFor="table-raw-textarea"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Raw Table Input
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                <span className="font-mono text-zinc-600 dark:text-zinc-300">{editableRows.length}</span> rows ·{' '}
                <span className="font-mono text-zinc-600 dark:text-zinc-300">{parsed.sections.length}</span>{' '}
                {parsed.sections.length === 1 ? 'section' : 'sections'}
              </span>
            </div>

            <textarea
              id="table-raw-textarea"
              value={rawText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              placeholder={`1. Greetings & Introductions\nEnglish\tArabic Script\tTransliteration\tNotes\nWelcome\tأهلاً وسهلاً\t'ahlan wa sahlan\tFormal\nHello\tمَرحَباً\tmarHaban\t`}
              rows={9}
              className="w-full min-h-[200px] p-3 font-mono text-xs text-zinc-900 dark:text-zinc-100 bg-zinc-50/90 dark:bg-[#18181B] rounded-xl border border-zinc-200/80 dark:border-white/[0.08] focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 resize-y leading-relaxed"
            />
          </div>

          {/* Deck Settings & Generation CTAs */}
          <div className="bg-white dark:bg-[#111114] rounded-2xl p-4 sm:p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="deck-title-input"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5"
                >
                  Deck Title
                </label>
                <input
                  id="deck-title-input"
                  type="text"
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  placeholder="e.g. Arabic Core & Expressions"
                  className="w-full h-9 px-3 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="target-language-input"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5"
                >
                  Target Language
                </label>
                <input
                  id="target-language-input"
                  type="text"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  placeholder="e.g. Arabic, Spanish, Japanese"
                  className="w-full h-9 px-3 text-xs rounded-xl bg-zinc-50/90 dark:bg-[#18181B] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.08] focus:outline-none focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15 font-medium"
                />
              </div>
            </div>

            {/* Schedule Curve */}
            <div>
              <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                Initial Schedule
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('staggered')}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    scheduleMode === 'staggered'
                      ? 'bg-blue-50/70 dark:bg-blue-950/35 border-blue-500/60 dark:border-blue-500/50 text-blue-950 dark:text-blue-100'
                      : 'bg-zinc-50/90 dark:bg-[#18181B] border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/[0.15]'
                  }`}
                >
                  <span className="block font-semibold">Optimal Stagger</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
                    Paced daily retention
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('immediate')}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    scheduleMode === 'immediate'
                      ? 'bg-blue-50/70 dark:bg-blue-950/35 border-blue-500/60 dark:border-blue-500/50 text-blue-950 dark:text-blue-100'
                      : 'bg-zinc-50/90 dark:bg-[#18181B] border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/[0.15]'
                  }`}
                >
                  <span className="block font-semibold">All Immediate</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
                    All due in session 1
                  </span>
                </button>
              </div>
            </div>

            {/* Primary Generation Actions */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                id="generate-instant-deck-btn"
                type="button"
                disabled={editableRows.length === 0}
                onClick={handleGenerateInstant}
                className="flex-1 h-10 px-3.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-950 font-medium text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] cursor-pointer disabled:opacity-50 tabular-nums"
                title="Instantly generate deck with all detected words, pronunciations, and notes"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600 fill-current shrink-0" />
                <span>Create Deck ({editableRows.length})</span>
              </button>

              <button
                id="generate-ai-smart-deck-btn"
                type="button"
                disabled={isAiLoading || editableRows.length === 0}
                onClick={handleAIGenerate}
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] cursor-pointer whitespace-nowrap"
                title="Enrich all cards with AI generated example sentences, mnemonics, and phonetics"
              >
                {isAiLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Enriching...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>AI Enrich</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Multi-Column Table Preview */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-white dark:bg-[#111114] rounded-2xl p-4 sm:p-5 border border-zinc-200/80 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-18px_rgba(15,23,42,0.07)] flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Preview
                </span>
                <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {displayedRows.length}
                  </span>{' '}
                  of <span className="font-mono">{editableRows.length}</span> cards
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {sectionCategories.length > 1 && (
                  <select
                    aria-label="Filter by topic section"
                    value={selectedSectionFilter}
                    onChange={(e) => setSelectedSectionFilter(e.target.value)}
                    className="h-8 max-w-[220px] px-2.5 text-xs font-medium rounded-xl bg-zinc-50/90 dark:bg-[#18181B] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] focus:outline-none focus:border-blue-500/70 truncate cursor-pointer"
                  >
                    <option value="all">All Sections ({editableRows.length})</option>
                    {sectionCategories.map((cat) => {
                      const count = editableRows.filter((r) => r.category === cat).length;
                      return (
                        <option key={cat} value={cat}>
                          {cat} ({count})
                        </option>
                      );
                    })}
                  </select>
                )}

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl text-xs bg-zinc-50 dark:bg-[#18181B] text-blue-600 dark:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/35 border border-zinc-200/80 dark:border-white/[0.08] font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Row</span>
                </button>
              </div>
            </div>

            {/* Table Scrollable Container */}
            <div className="max-h-[540px] overflow-y-auto overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-[#09090B]/40">
              <table className="w-full text-left text-xs min-w-[640px] table-fixed">
                <thead className="sticky top-0 bg-zinc-50/95 dark:bg-[#18181B]/95 backdrop-blur-xs text-zinc-500 dark:text-zinc-400 font-medium text-[11px] z-10 border-b border-zinc-200/80 dark:border-white/[0.07]">
                  <tr>
                    <th className="py-2.5 px-2.5 w-[25%] font-medium">English</th>
                    <th className="py-2.5 px-2.5 w-[25%] font-medium">Target Script</th>
                    <th className="py-2.5 px-2.5 w-[24%] font-medium">Transliteration</th>
                    <th className="py-2.5 px-2.5 w-[21%] font-medium">Notes</th>
                    <th className="py-2.5 px-1 w-9"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                  {displayedRows.map((row) => {
                    const actualIdx = editableRows.indexOf(row);
                    const isRtl = isArabicScript(row.targetWord);
                    return (
                      <tr
                        key={actualIdx}
                        className="group hover:bg-white dark:hover:bg-[#18181B]/70 transition-colors"
                      >
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.english}
                            title={row.english}
                            onChange={(e) => handleCellChange(actualIdx, 'english', e.target.value)}
                            placeholder="English phrase"
                            className="w-full px-2 py-1.5 bg-transparent rounded-lg focus:bg-white dark:focus:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 truncate"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.targetWord}
                            title={row.targetWord}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            onChange={(e) => handleCellChange(actualIdx, 'targetWord', e.target.value)}
                            placeholder="Target script"
                            className={`w-full px-2 py-1.5 bg-transparent rounded-lg focus:bg-white dark:focus:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-zinc-900 dark:text-zinc-100 truncate ${
                              isRtl ? 'text-sm text-right' : ''
                            }`}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.phonetic || ''}
                            title={row.phonetic || ''}
                            onChange={(e) => handleCellChange(actualIdx, 'phonetic', e.target.value)}
                            placeholder="Transliteration"
                            className="w-full px-2 py-1.5 bg-transparent rounded-lg focus:bg-white dark:focus:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-600 dark:text-zinc-300 italic text-[11px] truncate"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={row.notes || ''}
                            title={row.notes || ''}
                            onChange={(e) => handleCellChange(actualIdx, 'notes', e.target.value)}
                            placeholder="Optional notes"
                            className="w-full px-2 py-1.5 bg-transparent rounded-lg focus:bg-white dark:focus:bg-[#18181B] focus:outline-none focus:ring-1 focus:ring-blue-500 text-zinc-500 dark:text-zinc-400 text-[11px] truncate"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(actualIdx)}
                            aria-label={`Delete row ${row.english || actualIdx + 1}`}
                            className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500"
                      >
                        No rows found in this section. Paste a table on the left or switch filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

