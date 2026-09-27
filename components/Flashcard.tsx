'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, RotateCw } from 'lucide-react';
import { Flashcard as FlashcardType } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardType;
  language?: string;
  isFlipped: boolean;
  onFlip: () => void;
  onSpeak: (e?: React.MouseEvent) => void;
  isSpeaking: boolean;
}

export const Flashcard: React.FC<FlashcardProps> = ({
  card,
  language,
  isFlipped,
  onFlip,
  onSpeak,
  isSpeaking,
}) => {
  // Track whether this card has been explicitly flipped by user interaction
  const [prevCardId, setPrevCardId] = useState(card.id);
  const [hasUserFlipped, setHasUserFlipped] = useState(false);

  // When card changes, reset flip interaction state during render per React guidelines
  if (card.id !== prevCardId) {
    setPrevCardId(card.id);
    setHasUserFlipped(false);
  }

  const handleCardClick = () => {
    setHasUserFlipped(true);
    onFlip();
  };

  return (
    <div
      id="flashcard-interactive-box"
      onClick={handleCardClick}
      className="relative w-full min-h-[360px] sm:min-h-[400px] cursor-pointer select-none"
      style={{
        perspective: '1000px',
      }}
    >
      <div
        className="relative w-full min-h-[360px] sm:min-h-[400px] transform-style-preserve-3d"
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: hasUserFlipped
            ? 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'none',
        }}
      >
        {/* ================= CARD FRONT (Target Language) ================= */}
        <div
          className="absolute inset-0 w-full h-full rounded-3xl bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm border border-black/5 hover:border-black/10 transition-colors"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(0deg) translateZ(1px)',
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          {/* Top row: Speaker & Language badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                {language || card.language}
              </span>
              {card.partOfSpeech && (
                <span className="text-xs text-neutral-400 italic">
                  {card.partOfSpeech}
                </span>
              )}
            </div>

            <button
              id="card-speak-front-btn"
              onClick={onSpeak}
              title="Pronounce (S)"
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                isSpeaking
                  ? 'bg-blue-600 text-white scale-110'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {/* Center: Foreign Target Word */}
          <div className="my-auto text-center py-4">
            <h1
              dir={/[\u0600-\u06FF]/.test(card.targetWord) ? 'rtl' : 'ltr'}
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

          {/* Bottom prompt: Space or Tap to Flip */}
          <div className="text-center pt-4 border-t border-neutral-100 flex items-center justify-center gap-2 text-xs text-neutral-400">
            <RotateCw className="w-3.5 h-3.5" />
            <span>Tap card or press [Space] to reveal translation</span>
          </div>
        </div>

        {/* ================= CARD BACK (English & Examples) ================= */}
        <div
          className="absolute inset-0 w-full h-full rounded-3xl bg-white p-6 sm:p-8 flex flex-col justify-between shadow-sm border border-blue-500/20"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg) translateZ(1px)',
            // Strictly hide backface content from rendering until flipped to eliminate any bleed/flash
            visibility: isFlipped ? 'visible' : 'hidden',
            pointerEvents: isFlipped ? 'auto' : 'none',
          }}
        >
          {isFlipped ? (
            <>
              {/* Top row: Target echo & audio button */}
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="text-left">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                    {language || card.language}
                  </span>
                  <span className="text-sm font-semibold text-neutral-800">
                    {card.targetWord}
                  </span>
                </div>
                <button
                  id="card-speak-back-btn"
                  onClick={onSpeak}
                  className="w-9 h-9 rounded-2xl bg-neutral-100 text-neutral-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-colors"
                  title="Pronounce again"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Center Meaning & Context */}
              <div className="my-auto py-3">
                <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold block mb-1">
                  English Translation
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-4">
                  {card.english}
                </h2>

                {/* Example sentence if provided */}
                {card.exampleSentence?.target && (
                  <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-black/5 text-left mb-3">
                    <p className="text-sm font-medium text-neutral-900 mb-1">
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
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-0.5">
                      Usage & Memory Note
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
          ) : null}
        </div>
      </div>
    </div>
  );
};
