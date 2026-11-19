// Audio helper for Apple-like subtle haptics and reliable multi-language text-to-speech pronunciation

import {
  extractSpeakableText,
  getLanguageDisplayName,
  hasNonLatinScript,
  resolveSpeechLanguageCode,
  selectBestBrowserVoice,
} from './speech-utils';

export interface SpeakWordOptions {
  languageName?: string;
  fallbackText?: string;
}

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

// Playback tracking so overlapping clicks always cancel previous playback cleanly and never wedge UI state
let activePlaybackId = 0;
let activeSourceNode: AudioBufferSourceNode | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let activeCleanup: (() => void) | null = null;

// Client-side memory cache of fetched WAV bytes (keyed by `${targetLang}::${speakableText}`)
const MAX_CLIENT_TTS_CACHE = 150;
const ttsBufferCache = new Map<string, ArrayBuffer>();
const ttsInFlight = new Map<string, Promise<ArrayBuffer | null>>();

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playHapticFeedback(type: 'tap' | 'flip' | 'rating' | 'celebrate' | 'fail') {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'tap') {
      // Very soft iOS haptic click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === 'flip') {
      // Subtle airy whoosh/paper flip
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.07);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'rating') {
      // Pleasant acknowledgment tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.05); // E5
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'fail') {
      // Low gentle 'again' prompt
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.12);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'celebrate') {
      // Happy Apple finish chord (Arpeggio: C5 - E5 - G5 - C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const noteOsc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        noteOsc.type = 'sine';
        noteOsc.frequency.setValueAtTime(freq, now + idx * 0.07);
        noteGain.gain.setValueAtTime(0.08, now + idx * 0.07);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.3);
        noteOsc.connect(noteGain);
        noteGain.connect(ctx.destination);
        noteOsc.start(now + idx * 0.07);
        noteOsc.stop(now + idx * 0.07 + 0.3);
      });
    }
  } catch {
    // Graceful fallback if audio context fails
  }
}

/**
 * Stops any currently playing pronunciation (Web Speech API, AudioContext buffer, or Audio element).
 */
export function stopSpeaking(): void {
  activePlaybackId += 1;

  if (activeCleanup) {
    const cleanup = activeCleanup;
    activeCleanup = null;
    try {
      cleanup();
    } catch {
      // ignore
    }
  }

  if (activeSourceNode) {
    try {
      activeSourceNode.stop();
      activeSourceNode.disconnect();
    } catch {
      // ignore
    }
    activeSourceNode = null;
  }

  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.src = '';
    } catch {
      // ignore
    }
    activeAudioElement = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Loads browser SpeechSynthesis voices, waiting briefly for async `voiceschanged` on initial page load.
 */
function loadBrowserVoices(timeoutMs = 250): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  try {
    const immediate = window.speechSynthesis.getVoices();
    if (immediate && immediate.length > 0) {
      return Promise.resolve(immediate);
    }
  } catch {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(window.speechSynthesis.getVoices() || []);
      } catch {
        resolve([]);
      }
    };

    const onVoicesChanged = () => finish();
    const timer = window.setTimeout(finish, timeoutMs);

    try {
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    } catch {
      finish();
    }
  });
}

/**
 * Speaks via native browser SpeechSynthesis with Chrome queue-stuck workarounds and hard timeouts.
 * Resolves `true` if audio started and finished cleanly, or `false` if playback errored or never started.
 */
function speakWithBrowserVoice(
  text: string,
  targetLang: string,
  voice: SpeechSynthesisVoice | null,
  playbackId: number
): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let startWatchdog: number | null = null;
    let maxDurationTimer: number | null = null;
    let delayTimer: number | null = null;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (startWatchdog !== null) window.clearTimeout(startWatchdog);
      if (maxDurationTimer !== null) window.clearTimeout(maxDurationTimer);
      if (delayTimer !== null) window.clearTimeout(delayTimer);
      if (activeCleanup === cancelSelf) activeCleanup = null;
      resolve(success);
    };

    const cancelSelf = () => finish(true);
    activeCleanup = cancelSelf;

    const startSpeech = () => {
      if (settled || playbackId !== activePlaybackId) {
        finish(true);
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voice?.lang || targetLang;
        if (voice) {
          utterance.voice = voice;
        }
        utterance.rate = 0.88;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
          started = true;
          if (startWatchdog !== null) {
            window.clearTimeout(startWatchdog);
            startWatchdog = null;
          }
        };

        utterance.onend = () => {
          finish(true);
        };

        utterance.onerror = (event) => {
          const errCode = (event as SpeechSynthesisErrorEvent)?.error;
          // If canceled/interrupted due to user starting another clip, don't trigger fallback
          if (errCode === 'canceled' || errCode === 'interrupted') {
            finish(true);
            return;
          }
          finish(false);
        };

        // Guard against silent Chrome/iframe hangs where neither onstart nor onerror fires
        startWatchdog = window.setTimeout(() => {
          if (!started && !settled) {
            try {
              window.speechSynthesis.cancel();
            } catch {
              // ignore
            }
            finish(false);
          }
        }, 1200);

        // Hard upper bound so isSpeaking can never lock indefinitely
        const maxDurationMs = Math.min(12000, Math.max(4000, text.length * 220));
        maxDurationTimer = window.setTimeout(() => {
          if (!settled) {
            finish(started);
          }
        }, maxDurationMs);

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch {
        finish(false);
      }
    };

    try {
      // Chrome bug: calling cancel() and speak() synchronously in the same tick often drops the utterance
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        delayTimer = window.setTimeout(startSpeech, 40);
      } else {
        startSpeech();
      }
    } catch {
      finish(false);
    }
  });
}

function cacheClientTtsBuffer(key: string, buffer: ArrayBuffer) {
  if (ttsBufferCache.size >= MAX_CLIENT_TTS_CACHE) {
    const oldest = ttsBufferCache.keys().next().value;
    if (oldest) ttsBufferCache.delete(oldest);
  }
  ttsBufferCache.set(key, buffer);
}

/**
 * Fetches authentic native pronunciation audio (WAV) from `/api/tts` with deduplication and client caching.
 */
async function fetchServerTtsAudio(
  text: string,
  targetLang: string,
  languageName: string
): Promise<ArrayBuffer | null> {
  const cacheKey = `${targetLang}::${text}`;
  const cached = ttsBufferCache.get(cacheKey);
  if (cached) return cached;

  const existingRequest = ttsInFlight.get(cacheKey);
  if (existingRequest) return existingRequest;

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          languageCode: targetLang,
          language: languageName,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 64) return null;

      cacheClientTtsBuffer(cacheKey, arrayBuffer);
      return arrayBuffer;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
      ttsInFlight.delete(cacheKey);
    }
  })();

  ttsInFlight.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Plays a WAV ArrayBuffer via AudioContext (iOS Safari gesture-safe) with HTMLAudioElement fallback.
 */
async function playAudioBuffer(wavBytes: ArrayBuffer, playbackId: number): Promise<boolean> {
  if (playbackId !== activePlaybackId) return true;

  // Attempt 1: Web Audio API (reliable across iOS Safari, Chrome, Firefox, and iframes even after async fetch)
  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const decoded = await ctx.decodeAudioData(wavBytes.slice(0));
      if (playbackId !== activePlaybackId) return true;

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        activeSourceNode = source;

        const maxMs = Math.max(2500, Math.ceil(decoded.duration * 1000) + 1200);
        const timer = window.setTimeout(() => finish(true), maxMs);

        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (activeSourceNode === source) activeSourceNode = null;
          if (activeCleanup === cancelSelf) activeCleanup = null;
          try {
            source.onended = null;
            source.disconnect();
          } catch {
            // ignore
          }
          resolve(ok);
        };

        const cancelSelf = () => {
          try {
            source.stop();
          } catch {
            // ignore
          }
          finish(true);
        };
        activeCleanup = cancelSelf;

        source.onended = () => finish(true);
        source.start(0);
      });
    } catch {
      // Fall through to HTMLAudioElement
    }
  }

  if (playbackId !== activePlaybackId) return true;

  // Attempt 2: HTMLAudioElement
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let objectUrl = '';

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (activeAudioElement === audio) activeAudioElement = null;
      if (activeCleanup === cancelSelf) activeCleanup = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(ok);
    };

    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAudioElement = audio;

    const timer = window.setTimeout(() => finish(true), 12000);

    const cancelSelf = () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }
      finish(true);
    };
    activeCleanup = cancelSelf;

    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);

    audio.play().catch(() => finish(false));
  });
}

/**
 * Reliable, multi-language pronunciation for ALL cards (starter, imported, AI-enriched, manual).
 *
 * Strategy:
 * 1. Resolves true BCP-47 language code from hint + Unicode script detection (fixes mis-tagged imported decks).
 * 2. Cleans parenthesized romaji, tatweel dashes, and slash duplicates for natural reading.
 * 3. Uses cached server audio immediately if already fetched.
 * 4. Uses matching native browser SpeechSynthesis voice when installed & responsive.
 * 5. Automatically falls back to server-side Gemini TTS (`/api/tts`) whenever the browser lacks a voice
 *    for the card's language (common for Arabic, Urdu, Hindi, Japanese, Korean, etc.) or browser TTS stalls.
 * 6. Last-resort offline fallback: browser speech using phonetic transliteration or default voice.
 */
export async function speakWord(
  text: string,
  languageCode?: string,
  options?: SpeakWordOptions
): Promise<void> {
  if (typeof window === 'undefined') return;

  const speakableText = extractSpeakableText(text);
  if (!speakableText) return;

  // Cancel any prior clip and capture our monotonic playback token
  stopSpeaking();
  const playbackId = activePlaybackId;

  // Unlock AudioContext synchronously during the click gesture before any async awaits
  getAudioContext();

  const targetLang = resolveSpeechLanguageCode(languageCode, speakableText, options?.languageName);
  const languageName = getLanguageDisplayName(targetLang, options?.languageName);
  const cacheKey = `${targetLang}::${speakableText}`;

  // 1. Instant replay if already synthesized via server TTS
  const cachedServerAudio = ttsBufferCache.get(cacheKey);
  if (cachedServerAudio) {
    const played = await playAudioBuffer(cachedServerAudio, playbackId);
    if (played || playbackId !== activePlaybackId) return;
  }

  // 2. Try native browser voice ONLY if a real matching voice exists for this language
  const voices = await loadBrowserVoices();
  if (playbackId !== activePlaybackId) return;

  const matchedVoice = selectBestBrowserVoice(voices, targetLang);
  if (matchedVoice) {
    const nativeOk = await speakWithBrowserVoice(speakableText, targetLang, matchedVoice, playbackId);
    if (nativeOk || playbackId !== activePlaybackId) return;
  }

  // 3. No matching OS voice installed (or native TTS failed/stalled) -> fetch authentic native audio via /api/tts
  const wavBytes = await fetchServerTtsAudio(speakableText, targetLang, languageName);
  if (playbackId !== activePlaybackId) return;

  if (wavBytes) {
    const played = await playAudioBuffer(wavBytes, playbackId);
    if (played || playbackId !== activePlaybackId) return;
  }

  // 4. Final offline fallback: if server TTS is unreachable, attempt browser speech with phonetic fallback or raw text
  const fallbackPhonetic = options?.fallbackText ? extractSpeakableText(options.fallbackText) : '';
  const fallbackText =
    hasNonLatinScript(speakableText) && fallbackPhonetic ? fallbackPhonetic : speakableText;
  const fallbackLang = hasNonLatinScript(speakableText) && fallbackPhonetic ? 'en-US' : targetLang;

  await speakWithBrowserVoice(fallbackText, fallbackLang, null, playbackId);
}
