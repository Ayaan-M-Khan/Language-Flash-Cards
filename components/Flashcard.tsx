'use client';

import React, { useState } from 'react';
import { Volume2, RotateCw } from 'lucide-react';
import { CardDirection, Flashcard as FlashcardType } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardType;
  stepId?: number;
  language?: string;
  cardDirection?: CardDirection;
  isFlipped: boolean;
  onFlip: () => void;
  onSpeak: (e?: React.MouseEvent) => void;
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

  return (
    <div
      id="flashcard-interactive-box"
      onClick={onFlip}
      className="relative w-full min-h-[360px] sm:min-h-[400px] cursor-pointer select-none"
      style={{
        perspective: '1000px',
      }}
    >
      <div
        className="relative w-full min-h-[360px] sm:min-h-[400px] transform-style-preserve-3d"
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: hasFlippedThisStep
            ? 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'none',
        }}
      >
        {/* ================= CARD FRONT ================= */}
        <div
          className="absolute inset-0 w-full h-full rounded-3xl bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm border border-black/5 hover:border-black/10 transition-colors"
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
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-semibold text-indigo-600">Definition</span>
                  <span aria-hidden="true">·</span>
                  <span>{displayLanguage}</span>
                  {card.partOfSpeech && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="italic text-neutral-400">{card.partOfSpeech}</span>
                    </>
                  )}
                </div>
                <span className="text-[11px] font-medium text-neutral-400">
                  Def → Transliteration
                </span>
              </div>

              {/* Front Center: English Definition */}
              <div className="my-auto text-center py-4">
                <span className="text-xs font-medium text-neutral-400 block mb-2">
                  English Definition
                </span>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-neutral-900 break-words">
                  {card.english}
                </h1>
              </div>

              {/* Front Bottom Prompt */}
              <div className="text-center pt-4 border-t border-neutral-100 flex items-center justify-center gap-2 text-xs text-neutral-400">
                <RotateCw className="w-3.5 h-3.5" />
                <span>Tap card or press [Space] to reveal transliteration &amp; word</span>
              </div>
            </>
          ) : (
            <>
              {/* Front Header (Target Word First) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-semibold text-blue-600">{displayLanguage}</span>
                  {card.partOfSpeech && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="italic text-neutral-400">{card.partOfSpeech}</span>
                    </>
                  )}
                </div>

                <button
                  id="card-speak-front-btn"
                  type="button"
                  onClick={onSpeak}
                  title="Pronounce (S)"
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                    isSpeaking
                      ? 'bg-blue-600 text-white scale-110'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>

              {/* Front Center: Foreign Target Word & Transliteration */}
              <div className="my-auto text-center py-4">
                <h1
                  dir={targetIsRtl ? 'rtl' : 'ltr'}
                  className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-neutral-900 mb-3 break-words"
                >
                  {card.targetWord}
                </h1>

                {card.phonetic && (
                  <p className="text-sm sm:text-base font-medium text-indigo-600/90 tracking-wide">
                    [{card.phonetic}]
                  </p>
                )}
              </div>

              {/* Front Bottom Prompt */}
              <div className="text-center pt-4 border-t border-neutral-100 flex items-center justify-center gap-2 text-xs text-neutral-400">
                <RotateCw className="w-3.5 h-3.5" />
                <span>Tap card or press [Space] to reveal definition</span>
              </div>
            </>
          )}
        </div>

        {/* ================= CARD BACK ================= */}
        {/* Never mount the answer side into the DOM until the user flips this specific card step */}
        {hasFlippedThisStep ? (
          <div
            className="absolute inset-0 w-full h-full rounded-3xl bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm border border-blue-500/20"
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
                {/* Back Header: Definition Echo & Audio Pronunciation Button */}
                <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                  <div className="text-left min-w-0">
                    <span className="text-xs font-semibold text-indigo-600 block">
                      Definition
                    </span>
                    <span className="text-sm font-semibold text-neutral-800 block truncate">
                      {card.english}
                    </span>
                  </div>
                  <button
                    id="card-speak-back-btn"
                    type="button"
                    onClick={onSpeak}
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                      isSpeaking
                        ? 'bg-blue-600 text-white scale-110'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                    title="Pronounce (S)"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Back Center: Transliteration & Foreign Word */}
                <div className="my-auto py-3 text-center sm:text-left">
                  {card.phonetic ? (
                    <div className="mb-4">
                      <span className="text-xs text-neutral-400 font-semibold block mb-1">
                        Transliteration
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600 tracking-tight mb-2.5 break-words">
                        {card.phonetic}
                      </h2>
                      <span className="text-xs text-neutral-400 font-semibold block mb-0.5">
                        {displayLanguage}
                      </span>
                      <p
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight break-words"
                      >
                        {card.targetWord}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <span className="text-xs text-neutral-400 font-semibold block mb-1">
                        {displayLanguage} / Transliteration
                      </span>
                      <h2
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-2xl sm:text-4xl font-bold text-neutral-900 tracking-tight break-words"
                      >
                        {card.targetWord}
                      </h2>
                    </div>
                  )}

                  {/* Example sentence if provided */}
                  {card.exampleSentence?.target && (
                    <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-black/5 text-left mb-3">
                      <p
                        dir={isRtlScript(card.exampleSentence.target) ? 'rtl' : 'ltr'}
                        className="text-sm font-medium text-neutral-900 mb-1"
                      >
                        “{card.exampleSentence.target}”
                      </p>
                      <p className="text-xs text-neutral-500">
                        {card.exampleSentence.english}
                      </p>
                    </div>
                  )}

                  {/* Memory / Mnemonic notes */}
                  {card.notes && (
                    <div className="text-left px-1">
                      <span className="text-[11px] font-semibold text-neutral-400 block mb-0.5">
                        Usage &amp; Memory Note
                      </span>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        {card.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Hint at bottom of back */}
                <div className="text-center pt-2 text-xs text-neutral-400">
                  Rate your recall below to schedule next review
                </div>
              </>
            ) : (
              <>
                {/* Back Header: Target echo & audio button */}
                <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                  <div className="text-left min-w-0">
                    <span className="text-xs font-semibold text-blue-600 block">
                      {displayLanguage}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        dir={targetIsRtl ? 'rtl' : 'ltr'}
                        className="text-sm font-semibold text-neutral-800"
                      >
                        {card.targetWord}
                      </span>
                      {card.phonetic && (
                        <span className="text-xs font-medium text-indigo-600/85">
                          [{card.phonetic}]
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    id="card-speak-back-btn"
                    type="button"
                    onClick={onSpeak}
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                      isSpeaking
                        ? 'bg-blue-600 text-white scale-110'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                    title="Pronounce again (S)"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Center Meaning & Context */}
                <div className="my-auto py-3">
                  <span className="text-xs text-neutral-400 font-semibold block mb-1">
                    English Definition
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-4">
                    {card.english}
                  </h2>

                  {/* Example sentence if provided */}
                  {card.exampleSentence?.target && (
                    <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-black/5 text-left mb-3">
                      <p
                        dir={isRtlScript(card.exampleSentence.target) ? 'rtl' : 'ltr'}
                        className="text-sm font-medium text-neutral-900 mb-1"
                      >
                        “{card.exampleSentence.target}”
                      </p>
                      <p className="text-xs text-neutral-500">
                        {card.exampleSentence.english}
                      </p>
                    </div>
                  )}

                  {/* Memory / Mnemonic notes */}
                  {card.notes && (
                    <div className="text-left px-1">
                      <span className="text-[11px] font-semibold text-neutral-400 block mb-0.5">
                        Usage &amp; Memory Note
                      </span>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        {card.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Hint at bottom of back */}
                <div className="text-center pt-2 text-xs text-neutral-400">
                  Rate your recall below to schedule next review
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
