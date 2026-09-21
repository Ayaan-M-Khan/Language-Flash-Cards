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
  HelpCircle,
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
  const [deckTitle, setDeckTitle] = useState<string>('Spanish Travel & Social');
  const [targetLanguage, setTargetLanguage] = useState<string>('Spanish');
  const [scheduleMode, setScheduleMode] = useState<'staggered' | 'immediate'>('staggered');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    deckId: string;
    cardCount: number;
    deckTitle: string;
    isFallback?: boolean;
  } | null>(null);

  const parsed = useMemo(() => parseTableText(rawText), [rawText]);

  // Parse table rows whenever rawText changes
  const [editableRows, setEditableRows] = useState<TableRowInput[]>(() => {
    return parseTableText(SAMPLE_TABLE_PRESETS[0].rawText).rows;
  });

  const handleRawTextChange = (text: string) => {
    setRawText(text);
    const res = parseTableText(text);
    setEditableRows(res.rows);
  };

  // Handle preset selection
  const handleLoadPreset = (idx: number) => {
    playHapticFeedback('tap');
    const preset = SAMPLE_TABLE_PRESETS[idx];
    setRawText(preset.rawText);
    setEditableRows(parseTableText(preset.rawText).rows);
    setDeckTitle(preset.name);
    setTargetLanguage(preset.language);
    setSuccessInfo(null);
    setErrorMessage(null);
  };

  // Add empty row
  const handleAddRow = () => {
    playHapticFeedback('tap');
    setEditableRows((prev) => [...prev, { english: '', targetWord: '' }]);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    playHapticFeedback('tap');
    setEditableRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Update cell in table editor
  const handleCellChange = (
    index: number,
    field: 'english' | 'targetWord' | 'category',
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
    const cleanLanguage = targetLanguage || 'Language';

    // Map language code for audio speech synthesis
    let langCode = 'es-ES';
    const l = cleanLanguage.toLowerCase();
    if (l.includes('japan')) langCode = 'ja-JP';
    else if (l.includes('french')) langCode = 'fr-FR';
    else if (l.includes('german')) langCode = 'de-DE';
    else if (l.includes('ital')) langCode = 'it-IT';
    else if (l.includes('chin')) langCode = 'zh-CN';
    else if (l.includes('korean')) langCode = 'ko-KR';
    else if (l.includes('portug')) langCode = 'pt-BR';
    else if (l.includes('russ')) langCode = 'ru-RU';

    const newDeck: Deck = {
      id: newDeckId,
      title: deckTitle.trim() || `${cleanLanguage} Smart Deck`,
      language: cleanLanguage,
      languageCode: langCode,
      color: 'blue',
      description: `Smart spaced repetition deck with ${validRows.length} vocabulary words generated from table.`,
      icon: 'BookOpen',
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
          deckTitle: deckTitle.trim(),
          targetLanguage: targetLanguage.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('AI generation service returned an error. Using instant generation.');
      }

      const data = await res.json();
      const newDeckId = `deck-ai-${Date.now()}`;

      const newDeck: Deck = {
        id: newDeckId,
        title: data.deckTitle || deckTitle || 'Smart Vocabulary Deck',
        language: data.detectedLanguage || targetLanguage || 'Foreign Language',
        languageCode: data.languageCode || 'es-ES',
        color: (data.color as any) || 'indigo',
        description:
          data.deckDescription ||
          `Smart spaced repetition deck enriched with context sentences and pronunciation.`,
        icon: data.icon || 'Sparkles',
        createdAt: new Date().toISOString(),
      };

      const newCards: Flashcard[] = (data.cards || validRows).map((cardData: any, idx: number) => {
        const staggerOffset = scheduleMode === 'staggered' ? idx : 0;
        return initializeCardSchedule(
          {
            deckId: newDeckId,
            english: cardData.english || validRows[idx]?.english || '',
            targetWord: cardData.targetWord || validRows[idx]?.targetWord || '',
            language: newDeck.language,
            phonetic: cardData.phonetic,
            partOfSpeech: cardData.partOfSpeech,
            category: cardData.category || 'Vocabulary',
            exampleSentence: cardData.exampleTarget
              ? {
                  target: cardData.exampleTarget,
                  english: cardData.exampleEnglish || '',
                }
              : undefined,
            notes: cardData.notes,
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header Banner */}
      <div className="mb-6 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold mb-2">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Smart Table to Flashcards Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-2">
          Import Vocabulary Table
        </h1>
        <p className="text-sm text-neutral-600 max-w-2xl leading-relaxed">
          Paste any table with an English word and foreign word (from Excel, Apple Numbers, CSV, or
          text). We’ll automatically generate smart flashcards with optimal spaced repetition schedules.
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
        <div className="lg:col-span-6 flex flex-col">
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="table-raw-textarea"
                className="text-xs font-bold uppercase tracking-wider text-neutral-500"
              >
                Paste Table Data
              </label>
              <span className="text-[11px] text-neutral-400">
                TSV, CSV, Pipes or Tab separated
              </span>
            </div>

            <textarea
              id="table-raw-textarea"
              value={rawText}
              onChange={(e) => handleRawTextChange(e.target.value)}
              placeholder={`English\tSpanish\nHello\tHola\nThank you\tGracias\nPlease\tPor favor`}
              rows={12}
              className="w-full flex-1 p-3.5 font-mono text-xs text-neutral-800 bg-neutral-50 rounded-2xl border border-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y leading-relaxed"
            />

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
              <span>{editableRows.length} words detected</span>
              <span>Delimiter: &ldquo;{parsed.detectedDelimiter === '\t' ? 'Tab' : parsed.detectedDelimiter}&rdquo;</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Table Preview & Settings */}
        <div className="lg:col-span-6 flex flex-col gap-4">
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
                  placeholder="e.g. Spanish Travel"
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
                  placeholder="e.g. Spanish, Japanese"
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
                    Paces cards for long-term daily memory
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

          {/* Interactive Table Preview & Row Editor */}
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-black/5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Interactive Table Preview ({editableRows.length})
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            {/* Table Scrollable Container */}
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-black/5 bg-neutral-50/60 p-1">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-100/90 backdrop-blur-xs text-neutral-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-1.5 px-2">English</th>
                    <th className="py-1.5 px-2">Target Word</th>
                    <th className="py-1.5 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {editableRows.map((row, idx) => (
                    <tr key={idx} className="group hover:bg-white/80 transition-colors">
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.english}
                          onChange={(e) => handleCellChange(idx, 'english', e.target.value)}
                          placeholder="English word"
                          className="w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-neutral-900"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.targetWord}
                          onChange={(e) => handleCellChange(idx, 'targetWord', e.target.value)}
                          placeholder="Target translation"
                          className="w-full px-2 py-1 bg-transparent rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-neutral-900"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          className="p-1 text-neutral-300 hover:text-rose-500 rounded-md transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {editableRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-xs text-neutral-400">
                        No rows detected. Paste a table on the left or click &ldquo;Add Row&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Generation CTA Buttons */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              {/* AI Smart Generator */}
              <button
                id="generate-ai-smart-deck-btn"
                type="button"
                disabled={isAiLoading || editableRows.length === 0}
                onClick={handleGenerateWithAi}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs shadow-sm shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
              >
                {isAiLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>AI Enriched Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AI Smart Deck & Schedule</span>
                  </>
                )}
              </button>

              {/* Instant Offline Generator */}
              <button
                id="generate-instant-deck-btn"
                type="button"
                disabled={editableRows.length === 0}
                onClick={handleGenerateInstant}
                className="py-3 px-4 rounded-2xl bg-neutral-900 hover:bg-black text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs active:scale-98"
                title="Instant generation without AI enrichment"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Instant Deck</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
