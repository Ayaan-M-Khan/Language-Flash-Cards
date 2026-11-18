'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Volume2, AlertCircle } from 'lucide-react';
import { Flashcard } from '@/lib/types';
import { speakWord, playHapticFeedback } from '@/lib/audio';

interface EditCardModalProps {
  card: Flashcard;
  deckTitle?: string;
  languageCode?: string;
  onSave: (updatedCard: Flashcard) => void;
  onClose: () => void;
  onDelete?: (cardId: string) => void;
}

const isRtlScript = (text: string) =>
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

export const EditCardModal: React.FC<EditCardModalProps> = ({
  card,
  deckTitle,
  languageCode,
  onSave,
  onClose,
  onDelete,
}) => {
  const [targetWord, setTargetWord] = useState(card.targetWord || '');
  const [english, setEnglish] = useState(card.english || '');
  const [phonetic, setPhonetic] = useState(card.phonetic || '');
  const [partOfSpeech, setPartOfSpeech] = useState(card.partOfSpeech || '');
  const [category, setCategory] = useState(card.category || '');
  const [exampleTarget, setExampleTarget] = useState(card.exampleSentence?.target || '');
  const [exampleEnglish, setExampleEnglish] = useState(card.exampleSentence?.english || '');
  const [notes, setNotes] = useState(card.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Trap Escape key cleanly without triggering study view or parent modal shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTarget = targetWord.trim().slice(0, 500);
    const cleanEnglish = english.trim().slice(0, 500);

    if (!cleanTarget || !cleanEnglish) {
      setError('Both the target word/phrase and English definition are required.');
      return;
    }

    const cleanExTarget = exampleTarget.trim().slice(0, 500);
    const cleanExEnglish = exampleEnglish.trim().slice(0, 500);

    if (cleanExEnglish && !cleanExTarget) {
      setError('Please include the target-language example sentence or clear the example translation.');
      return;
    }

    playHapticFeedback('rating');

    const updatedCard: Flashcard = {
      ...card,
      targetWord: cleanTarget,
      english: cleanEnglish,
      phonetic: phonetic.trim().slice(0, 200),
      partOfSpeech: partOfSpeech.trim().slice(0, 50),
      category: category.trim().slice(0, 100) || 'General',
      notes: notes.trim().slice(0, 1000),
      exampleSentence: cleanExTarget
        ? {
            target: cleanExTarget,
            english: cleanExEnglish,
          }
        : undefined,
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedCard);
  };

  const handleSpeakPreview = () => {
    if (!targetWord.trim()) return;
    playHapticFeedback('tap');
    speakWord(targetWord.trim(), languageCode || card.language || 'es-ES');
  };

  const targetIsRtl = isRtlScript(targetWord);
  const exampleIsRtl = isRtlScript(exampleTarget);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-card-modal-title"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-black/10 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-0.5">
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {card.language}
              </span>
              {deckTitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{deckTitle}</span>
                </>
              )}
            </div>
            <h2
              id="edit-card-modal-title"
              className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight"
            >
              Edit Flashcard
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit flashcard dialog"
            className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form id="edit-card-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Core Pair */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="edit-card-target"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Target Word / Phrase <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSpeakPreview}
                  disabled={!targetWord.trim()}
                  title="Listen to pronunciation"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 cursor-pointer"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Listen</span>
                </button>
              </div>
              <input
                id="edit-card-target"
                type="text"
                dir={targetIsRtl ? 'rtl' : 'ltr'}
                value={targetWord}
                onChange={(e) => {
                  setTargetWord(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={500}
                required
                autoFocus
                placeholder={`Word in ${card.language}`}
                className={`w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  targetIsRtl ? 'text-right' : ''
                }`}
              />
            </div>

            <div>
              <label
                htmlFor="edit-card-english"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1"
              >
                English Definition <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-card-english"
                type="text"
                value={english}
                onChange={(e) => {
                  setEnglish(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={500}
                required
                placeholder="English translation"
                className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Phonetic, Part of Speech, Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="edit-card-phonetic"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Transliteration / IPA
              </label>
              <input
                id="edit-card-phonetic"
                type="text"
                value={phonetic}
                onChange={(e) => setPhonetic(e.target.value)}
                maxLength={200}
                placeholder="e.g. marHaban"
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label
                htmlFor="edit-card-pos"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Part of Speech
              </label>
              <input
                id="edit-card-pos"
                type="text"
                value={partOfSpeech}
                onChange={(e) => setPartOfSpeech(e.target.value)}
                maxLength={50}
                placeholder="e.g. noun, phrase"
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label
                htmlFor="edit-card-category"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Category / Topic
              </label>
              <input
                id="edit-card-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={100}
                placeholder="e.g. Greetings"
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Example Sentence */}
          <div className="p-3.5 rounded-2xl bg-neutral-50/80 dark:bg-neutral-800/60 border border-black/5 dark:border-white/10 space-y-2.5">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
              Example Sentence (Optional)
            </span>
            <input
              id="edit-card-example-target"
              type="text"
              dir={exampleIsRtl ? 'rtl' : 'ltr'}
              value={exampleTarget}
              onChange={(e) => {
                setExampleTarget(e.target.value);
                if (error) setError(null);
              }}
              maxLength={500}
              placeholder={`Example sentence in ${card.language}`}
              className={`w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                exampleIsRtl ? 'text-right' : ''
              }`}
            />
            <input
              id="edit-card-example-english"
              type="text"
              value={exampleEnglish}
              onChange={(e) => {
                setExampleEnglish(e.target.value);
                if (error) setError(null);
              }}
              maxLength={500}
              placeholder="English translation of example sentence"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="edit-card-notes"
              className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
            >
              Usage &amp; Memory Notes
            </label>
            <textarea
              id="edit-card-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="Grammar tips, gender, register, or memory hooks..."
              className="w-full px-3.5 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y leading-relaxed"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-black/5 dark:border-white/10 bg-neutral-50/80 dark:bg-neutral-800/50 rounded-b-3xl flex flex-wrap items-center justify-between gap-2">
          <div>
            {onDelete && (
              confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      playHapticFeedback('fail');
                      onDelete(card.id);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2.5 py-2 rounded-xl text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-neutral-200/80 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-card-form"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
