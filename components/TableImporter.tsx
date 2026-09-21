'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  FileSpreadsheet,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Zap,
  BookOpen,
  ArrowRight,
  Layers,
  Filter,
} from 'lucide-react';
import { Flashcard, Deck, TableRowInput } from '@/lib/types';
import { parseTableText } from '@/lib/table-parser';
import { initializeCardSchedule } from '@/lib/srs';
import { SAMPLE_TABLE_PRESETS } from '@/lib/default-data';
import { playHapticFeedback } from '@/lib/audio';

interface TableImporterProps {
  onDeckCreated: (newDeck: Deck, newCards: Flashcard[]) => void;
  onNavigateToStudy: (deckId: string) => void;
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
    const cleanLanguage = targetLanguage || parsed.detectedLanguage || 'Language';

    // Map language code for audio speech synthesis
    let langCode = parsed.detectedLanguageCode || 'es-ES';
    const l = cleanLanguage.toLowerCase();
    if (l.includes('arab')) langCode = 'ar-SA';
    else if (l.includes('japan')) langCode = 'ja-JP';
    else if (l.includes('french')) langCode = 'fr-FR';
    else if (l.includes('german')) langCode = 'de-DE';
    else if (l.includes('ital')) langCode = 'it-IT';
    else if (l.includes('chin')) langCode = 'zh-CN';
    else if (l.includes('korean')) langCode = 'ko-KR';
    else if (l.includes('portug')) langCode = 'pt-BR';
    else if (l.includes('russ')) langCode = 'ru-RU';

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

    const newCards: Flashcard[] = validRows.map((row, idx) => {
      const staggerOffset = scheduleMode === 'staggered' ? idx : 0;
      return initializeCardSchedule(
        {
          deckId: newDeckId,
          english: row.english.trim(),
          targetWord: row.targetWord.trim(),
          language: cleanLanguage,
          phonetic: row.phonetic,
          partOfSpeech: row.partOfSpeech,
          category: row.category || 'Core Vocabulary',
          notes: row.notes,
        },
        `card-${Date.now()}-${idx}`,
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

  // 2. AI SMART GENERATE & ENRICH (via Gemini API /api/generate-decks)
  const handleGenerateWithAi = async () => {
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
        throw new Error('AI generation service returned an error. Using instant generation.');
      }

      const data = await res.json();
      const newDeckId = `deck-ai-${Date.now()}`;
      const cleanLanguage = data.detectedLanguage || targetLanguage || parsed.detectedLanguage || 'Foreign Language';

      const newDeck: Deck = {
        id: newDeckId,
        title: data.deckTitle || deckTitle.trim() || parsed.detectedTitle || 'Smart Vocabulary Deck',
        language: cleanLanguage,
        languageCode: data.languageCode || parsed.detectedLanguageCode || 'es-ES',
        color: (data.color as any) || (parsed.detectedColor as any) || 'indigo',
        description:
          data.deckDescription ||
          `Smart spaced repetition deck with ${validRows.length} vocabulary words enriched with pronunciation and context.`,
        icon: data.icon || parsed.detectedIcon || 'Sparkles',
        createdAt: new Date().toISOString(),
      };

      // Map each row, enriching with AI output when available
      const newCards: Flashcard[] = validRows.map((row, idx) => {
        const staggerOffset = scheduleMode === 'staggered' ? idx : 0;
        const aiCard = data.cards?.[idx] || data.cards?.find(
          (c: any) => c.english === row.english || c.targetWord === row.targetWord
        );

        return initializeCardSchedule(
          {
            deckId: newDeckId,
            english: row.english.trim(),
            targetWord: row.targetWord.trim(),
            language: newDeck.language,
            phonetic: row.phonetic || aiCard?.phonetic,
            partOfSpeech: row.partOfSpeech || aiCard?.partOfSpeech,
            category: row.category || aiCard?.category || 'Core Vocabulary',
            exampleSentence: aiCard?.exampleTarget
              ? {
                  target: aiCard.exampleTarget,
                  english: aiCard.exampleEnglish || '',
                }
              : undefined,
            notes: row.notes || aiCard?.notes,
          },
          `card-ai-${Date.now()}-${idx}`,
          staggerOffset
        );
      });

      onDeckCreated(newDeck, newCards);
      setSuccessInfo({
        deckId: newDeckId,
        cardCount: newCards.length,
        deckTitle: newDeck.title,
        isFallback: Boolean(data.fallback),
      });
    } catch (err: unknown) {
      console.warn('AI smart enrich failed, falling back to local generator', err);
      // Seamlessly fallback so user is never blocked
      handleGenerateInstant();
    } finally {
      setIsAiLoading(false);
    }
  };

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
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      {/* Header Banner */}
      <div className="mb-6 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold mb-2">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Multi-Column & Multi-Section Table Importer</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-2">
          Import Vocabulary Table
        </h1>
        <p className="text-sm text-neutral-600 max-w-3xl leading-relaxed">
          Paste any vocabulary table with columns like English, Foreign Script, Transliteration, and Notes (from Excel, Google Sheets, or web tables). We automatically parse sections, pronunciation, and categories into optimal spaced repetition decks.
        </p>
      </div>

      {/* SUCCESS BANNER */}
      {successInfo && (
        <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Generated &ldquo;{successInfo.deckTitle}&rdquo;!
              </h3>
              <p className="text-xs text-emerald-700">
                Created {successInfo.cardCount} flashcards with SuperMemo SM-2 optimal spaced
                repetition schedules{successInfo.isFallback ? ' (Instant Smart Engine)' : ' (AI Enriched)'}.
              </p>
            </div>
          </div>
          <button
            id="start-study-imported-btn"
            onClick={() => onNavigateToStudy(successInfo.deckId)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-xs flex items-center justify-center gap-1.5"
          >
            <span>Start Studying Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Preset Quick Loader */}
      <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap">
          Quick Sample Tables:
        </span>
        {SAMPLE_TABLE_PRESETS.map((preset, idx) => (
          <button
            key={preset.name}
            onClick={() => handleLoadPreset(idx)}
            className="px-3 py-1 rounded-full text-xs bg-white hover:bg-neutral-100 text-neutral-700 font-medium border border-black/5 whitespace-nowrap transition-colors shadow-2xs"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Raw Text Paste Area */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="table-raw-textarea"
                className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              >
                Paste Raw Table Text
              </label>
              <span className="text-[11px] text-neutral-400">
                Tabs, CSV, Pipes, Multi-Section
              </span>
            </div>

            <textarea
              id="table-raw-textarea"
              value={rawText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              placeholder={`1. Greetings & Introductions\nEnglish\tArabic Script\tTransliteration\tNotes\nWelcome\tأهلاً وسهلاً\t'ahlan wa sahlan\tFormal\nHello\tمَرحَباً\tmarHaban\t`}
              rows={16}
              className="w-full flex-1 p-3.5 font-mono text-xs text-neutral-800 bg-neutral-50 rounded-2xl border border-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y leading-relaxed"
            />

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
              <span className="font-medium text-neutral-700">{editableRows.length} words detected</span>
              <span>
                {parsed.sections.length > 1 ? `${parsed.sections.length} sections` : 'Single section'} • Delimiter: &ldquo;{parsed.detectedDelimiter === '\t' ? 'Tab' : parsed.detectedDelimiter}&rdquo;
              </span>
            </div>
          </div>

          {/* Deck Configuration */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Deck Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Deck Title
                </label>
                <input
                  id="deck-title-input"
                  type="text"
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  placeholder="e.g. Arabic Core & Expressions"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Target Language
                </label>
                <input
                  id="target-language-input"
                  type="text"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  placeholder="e.g. Arabic, Spanish, Japanese"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 border border-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                />
              </div>
            </div>

            {/* Spaced Repetition Scheduling Option */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Spaced Repetition Schedule Curve
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('staggered')}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                    scheduleMode === 'staggered'
                      ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-neutral-50 border-black/5 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <span className="block text-xs font-bold">Optimal Stagger</span>
                  <span className="text-[10px] text-neutral-500 font-normal">
                    Paces cards evenly for long-term daily memory
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('immediate')}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                    scheduleMode === 'immediate'
                      ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-neutral-50 border-black/5 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <span className="block text-xs font-bold">All Immediate</span>
                  <span className="text-[10px] text-neutral-500 font-normal">
                    Makes all words due in session 1
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Multi-Column Table Preview & Section Filter */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 flex-1 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Interactive Table Preview ({displayedRows.length} of {editableRows.length})
                </span>
                {parsed.sections.length > 1 && (
                  <p className="text-[11px] text-neutral-400">
                    {parsed.sections.length} thematic topics extracted with pronunciations & notes
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            {/* Section Quick Filters */}
            {sectionCategories.length > 1 && (
              <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
                <span className="text-[11px] text-neutral-400 shrink-0 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSectionFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors ${
                    selectedSectionFilter === 'all'
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  All ({editableRows.length})
                </button>
                {sectionCategories.map((cat) => {
                  const count = editableRows.filter((r) => r.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedSectionFilter(cat)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors truncate max-w-[200px] ${
                        selectedSectionFilter === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                      title={cat}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Table Scrollable Container */}
            <div className="max-h-[460px] overflow-y-auto overflow-x-auto rounded-2xl border border-black/5 bg-neutral-50/60 p-1">
              <table className="w-full text-left text-xs min-w-[540px]">
                <thead className="sticky top-0 bg-neutral-100/95 backdrop-blur-xs text-neutral-500 uppercase tracking-wider text-[10px] z-10">
                  <tr>
                    <th className="py-2 px-2.5">English</th>
                    <th className="py-2 px-2.5">Target Script</th>
                    <th className="py-2 px-2">Transliteration / Phonetic</th>
                    <th className="py-2 px-2">Notes / Details</th>
                    <th className="py-2 px-2 w-7"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {displayedRows.map((row) => {
                    // Find actual index in editableRows
                    const actualIdx = editableRows.indexOf(row);
                    const isRtl = isArabicScript(row.targetWord);
                    return (
                      <tr key={actualIdx} className="group hover:bg-white/90 transition-colors">
                        <td className="p-1 min-w-[120px]">
                          <input
                            type="text"
                            value={row.english}
                            onChange={(e) => handleCellChange(actualIdx, 'english', e.target.value)}
                            placeholder="English phrase"
                            className="w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-neutral-900"
                          />
                        </td>
                        <td className="p-1 min-w-[130px]">
                          <input
                            type="text"
                            value={row.targetWord}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            onChange={(e) => handleCellChange(actualIdx, 'targetWord', e.target.value)}
                            placeholder="Target script"
                            className={`w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-neutral-900 ${
                              isRtl ? 'text-base text-right' : ''
                            }`}
                          />
                        </td>
                        <td className="p-1 min-w-[130px]">
                          <input
                            type="text"
                            value={row.phonetic || ''}
                            onChange={(e) => handleCellChange(actualIdx, 'phonetic', e.target.value)}
                            placeholder="e.g. marHaban"
                            className="w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-neutral-600 italic text-[11px]"
                          />
                        </td>
                        <td className="p-1 min-w-[120px]">
                          <input
                            type="text"
                            value={row.notes || ''}
                            onChange={(e) => handleCellChange(actualIdx, 'notes', e.target.value)}
                            placeholder="Notes, gender, or context"
                            className="w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-neutral-500 text-[11px]"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(actualIdx)}
                            className="p-1 text-neutral-300 hover:text-rose-500 rounded-md transition-colors"
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
                      <td colSpan={5} className="p-8 text-center text-xs text-neutral-400">
                        No rows found in this section. Paste a table on the left or switch filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Generation CTA Buttons */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              {/* Instant Generator - Primary recommended for tables with rich columns */}
              <button
                id="generate-instant-deck-btn"
                type="button"
                disabled={editableRows.length === 0}
                onClick={handleGenerateInstant}
                className="flex-1 py-3 px-4 rounded-2xl bg-neutral-900 hover:bg-black text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-xs active:scale-98"
                title="Instantly generate deck with all detected words, pronunciations, and notes"
              >
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>Create Flashcard Deck ({editableRows.length} Cards)</span>
              </button>

              {/* AI Smart Generator */}
              <button
                id="generate-ai-smart-deck-btn"
                type="button"
                disabled={isAiLoading || editableRows.length === 0}
                onClick={handleGenerateWithAi}
                className="py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-xs shadow-xs shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                title="Enrich with AI generated example sentences and audio tags"
              >
                {isAiLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>AI Enriching...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Enrich & Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
