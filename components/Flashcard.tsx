'use client';

import React, { useState } from 'react';
import { Volume2, Pencil, Trash2 } from 'lucide-react';
import { CardDirection, Flashcard as FlashcardType } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardType;
  stepId?: number;
  language?: string;
  cardDirection?: CardDirection;
  isFlipped: boolean;
  onFlip: () => void;
  onSpeak: (e?: React.MouseEvent) => void;
  onEdit?: (e?: React.MouseEvent) => void;
  onDelete?: (e?: React.MouseEvent) => void;
  isSpeaking: boolean;
}

const isRtlScript = (text: string) =>
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

export const Flashcard: React.FC<FlashcardProps> = ({
  card,
  stepId,
  language,
  cardDirection = 'target-first',
  isFlipped,
  onFlip,
  onSpeak,
  onEdit,
  onDelete,
  isSpeaking,
}) => {
  // Track whether this specific card presentation (card.id + stepId + cardDirection) has ever been flipped.
  // Before the user flips this card step, the Back face is NOT mounted in the DOM at all,
  // making it physically impossible for the answer side to flash or bleed on card swap or direction flip.
  const identityKey = `${card.id}::${stepId ?? 0}::${cardDirection}`;
  const [trackedIdentity, setTrackedIdentity] = useState(identityKey);
  const [hasFlippedThisStep, setHasFlippedThisStep] = useState(isFlipped);

  if (identityKey !== trackedIdentity) {
    setTrackedIdentity(identityKey);
    setHasFlippedThisStep(isFlipped);
  } else if (isFlipped && !hasFlippedThisStep) {
    setHasFlippedThisStep(true);
  }

  const isDefFirst = cardDirection === 'definition-first';
  const displayLanguage = language || card.language;
  const targetIsRtl = isRtlScript(card.targetWord);

  const ghostBtnClass =
    'w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer';
  const deleteBtnClass =
    'w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer';
  const speakBtnClass = (active: boolean) =>
    `w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
      active
        ? 'bg-blue-600 text-white scale-105 shadow-sm shadow-blue-600/25'
        : 'text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/40'
    }`;

  return (
    <div
      id="flashcard-interactive-box"
      onClick={onFlip}
      className="relative w-full cursor-pointer select-none"
      style={{
        perspective: '1200px',
      }}
    >
      <div
        className="grid grid-cols-1 w-full transform-style-preserve-3d"
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: hasFlippedThisStep
            ? 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'none',
        }}
      >
        {/* ================= CARD FRONT ================= */}
        <div
          className="col-start-1 row-start-1 w-full min-h-[360px] sm:min-h-[430px] rounded-2xl bg-white dark:bg-[#111114] p-6 sm:p-10 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_32px_-16px_rgba(15,23,42,0.09)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_18px_40px_-20px_rgba(0,0,0,0.75)] border border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300/90 dark:hover:border-white/[0.14] transition-colors"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(0deg) translateZ(1px)',
            visibility: isFlipped ? 'hidden' : 'visible',
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          {isDefFirst ? (
            <>
              {/* Front Header (Definition First — no foreign audio spoiler on front) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
                  <span className="font-medium text-blue-600 dark:text-blue-400 shrink-0">
                    Definition
                  </span>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="truncate">{displayLanguage}</span>
                  {card.partOfSpeech && (
                    <>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="italic text-zinc-400 dark:text-zinc-500 truncate">
                        {card.partOfSpeech}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onEdit && (
                    <button
                      id="card-edit-front-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(e);
                      }}
                      title="Edit flashcard (E)"
                      aria-label="Edit flashcard"
                      className={ghostBtnClass}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      id="card-delete-front-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(e);
                      }}
                      title="Delete flashcard"
                      aria-label="Delete flashcard"
                      className={deleteBtnClass}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Front Center: English Definition */}
              <div className="my-auto text-center py-8 px-2">
                <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 block mb-3">
                  English definition
                </span>
                <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 break-words leading-[1.15] text-balance">
                  {card.english}
                </h1>
              </div>

              <div className="h-4" aria-hidden="true" />
            </>
          ) : (
            <>
              {/* Front Header (Target Word First) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
                  <span className="font-medium text-blue-600 dark:text-blue-400 shrink-0">
                    {displayLanguage}
                  </span>
                  {card.partOfSpeech && (
                    <>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="italic text-zinc-400 dark:text-zinc-500 truncate">
                        {card.partOfSpeech}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onEdit && (
                    <button
                      id="card-edit-front-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(e);
                      }}
                      title="Edit flashcard (E)"
                      aria-label="Edit flashcard"
                      className={ghostBtnClass}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      id="card-delete-front-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(e);
                      }}
                      title="Delete flashcard"
                      aria-label="Delete flashcard"
                      className={deleteBtnClass}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    id="card-speak-front-btn"
                    type="button"
                    onClick={onSpeak}
                    title="Pronounce (S)"
                    aria-label="Pronounce word"
                    className={speakBtnClass(isSpeaking)}
                  >
                    <Volume2 className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>

              {/* Front Center: Foreign Target Word & Transliteration */}
              <div className="my-auto text-center py-8 px-2">
                <h1
                  dir={targetIsRtl ? 'rtl' : 'ltr'}
                  className="text-4xl sm:text-5xl md:text-[3.5rem] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mb-3.5 break-words leading-[1.15] text-balance"
                >
                  {card.targetWord}
                </h1>

                {card.phonetic && (
                  <p className="text-base sm:text-lg font-medium text-blue-600/85 dark:text-blue-400/90 tracking-wide break-words">
                    [{card.phonetic}]
                  </p>
                )}
              </div>

              <div className="h-4" aria-hidden="true" />
            </>
          )}
        </div>

        {/* ================= CARD BACK ================= */}
        {hasFlippedThisStep ? (
          <div
            className="col-start-1 row-start-1 w-full min-h-[360px] sm:min-h-[430px] rounded-2xl bg-white dark:bg-[#111114] p-6 sm:p-10 flex flex-col justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_32px_-16px_rgba(15,23,42,0.09)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_18px_40px_-20px_rgba(0,0,0,0.75)] border border-blue-500/25 dark:border-blue-400/25"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg) translateZ(1px)',
              visibility: isFlipped ? 'visible' : 'hidden',
              pointerEvents: isFlipped ? 'auto' : 'none',
            }}
          >
            {isDefFirst ? (
              <>
                {/* Back Header: Definition Echo & Edit / Audio Buttons */}
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-white/[0.06] pb-3.5">
                  <div className="text-left min-w-0">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 block">
                      Definition
                    </span>
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 block break-words">
                      {card.english}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onEdit && (
                      <button
                        id="card-edit-back-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(e);
                        }}
                        title="Edit flashcard (E)"
                        aria-label="Edit flashcard"
                        className={ghostBtnClass}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        id="card-delete-back-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(e);
                        }}
                        title="Delete flashcard"
                        aria-label="Delete flashcard"
                        className={deleteBtnClass}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      id="card-speak-back-btn"
                      type="button"
                      onClick={onSpeak}
                      className={speakBtnClass(isSpeaking)}
                      title="Pronounce (S)"
                      aria-label="Pronounce word"
                    >
                      <Volume2 className="w-[18px] h-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Back Center: Transliteration & Foreign Word */}
                <div className="my-auto py-6 text-center sm:text-left">
                  {card.phonetic ? (
                    <div className="mb-6">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium block mb-1">
                        Transliteration
                      </span>
                      <h2 className="text-2xl sm:text-4xl font-semibold text-blue-600 dark:text-blue-400 tracking-tight mb-3 break-words">
                        {card.phonetic}
                      </h2>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium block mb-0.5">
                        {displayLanguage}
                      </span>
                      <p
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight break-words"
                      >
                        {card.targetWord}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium block mb-1">
                        {displayLanguage}
                      </span>
                      <h2
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-3xl sm:text-4xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight break-words"
                      >
                        {card.targetWord}
                      </h2>
                    </div>
                  )}

                  {(card.exampleSentence?.target || card.notes) && (
                    <div
                      className={`grid gap-3.5 items-stretch ${
                        card.exampleSentence?.target && card.notes
                          ? 'grid-cols-1 md:grid-cols-2'
                          : 'grid-cols-1'
                      }`}
                    >
                      {card.exampleSentence?.target && (
                        <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/[0.06] text-left">
                          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 block mb-1.5">
                            Example sentence
                          </span>
                          <p
                            dir={isRtlScript(card.exampleSentence.target) ? 'rtl' : 'ltr'}
                            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 break-words"
                          >
                            “{card.exampleSentence.target}”
                          </p>
                          {card.exampleSentence.english && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">
                              {card.exampleSentence.english}
                            </p>
                          )}
                        </div>
                      )}

                      {card.notes && (
                        <div className="p-4 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/[0.06] text-left">
                          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 block mb-1.5">
                            Usage &amp; memory note
                          </span>
                          <p
                            dir={isRtlScript(card.notes) ? 'rtl' : 'ltr'}
                            className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed break-words"
                          >
                            {card.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="h-3" aria-hidden="true" />
              </>
            ) : (
              <>
                {/* Back Header: Target echo & edit/audio buttons */}
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-white/[0.06] pb-3.5">
                  <div className="text-left min-w-0">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 block">
                      {displayLanguage}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 break-words"
                      >
                        {card.targetWord}
                      </span>
                      {card.phonetic && (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 break-words">
                          [{card.phonetic}]
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onEdit && (
                      <button
                        id="card-edit-back-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(e);
                        }}
                        title="Edit flashcard (E)"
                        aria-label="Edit flashcard"
                        className={ghostBtnClass}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        id="card-delete-back-btn"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(e);
                        }}
                        title="Delete flashcard"
                        aria-label="Delete flashcard"
                        className={deleteBtnClass}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      id="card-speak-back-btn"
                      type="button"
                      onClick={onSpeak}
                      className={speakBtnClass(isSpeaking)}
                      title="Pronounce again (S)"
                      aria-label="Pronounce word again"
                    >
                      <Volume2 className="w-[18px] h-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Center Meaning & Context */}
                <div className="my-auto py-6">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium block mb-1.5">
                    English definition
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight mb-6 break-words text-balance">
                    {card.english}
                  </h2>

                  {(card.exampleSentence?.target || card.notes) && (
                    <div
                      className={`grid gap-3.5 items-stretch ${
                        card.exampleSentence?.target && card.notes
                          ? 'grid-cols-1 md:grid-cols-2'
                          : 'grid-cols-1'
                      }`}
                    >
                      {card.exampleSentence?.target && (
                        <div className="p-4 rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/[0.06] text-left">
                          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 block mb-1.5">
                            Example sentence
                          </span>
                          <p
                            dir={isRtlScript(card.exampleSentence.target) ? 'rtl' : 'ltr'}
                            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 break-words"
                          >
                            “{card.exampleSentence.target}”
                          </p>
                          {card.exampleSentence.english && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 break-words">
                              {card.exampleSentence.english}
                            </p>
                          )}
                        </div>
                      )}

                      {card.notes && (
                        <div className="p-4 rounded-xl bg-zinc-50/60 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/[0.06] text-left">
                          <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 block mb-1.5">
                            Usage &amp; memory note
                          </span>
                          <p
                            dir={isRtlScript(card.notes) ? 'rtl' : 'ltr'}
                            className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed break-words"
                          >
                            {card.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="h-3" aria-hidden="true" />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
