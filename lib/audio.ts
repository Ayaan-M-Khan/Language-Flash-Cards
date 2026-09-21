// Audio helper for Apple-like subtle haptics and text-to-speech pronunciation

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
 * Text-to-speech pronunciation of foreign words using browser SpeechSynthesis API.
 */
export function speakWord(text: string, languageCode: string = 'es-ES'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any pending utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9; // Slightly slower for foreign language clarity
      utterance.pitch = 1.0;

      // Normalize language code
      let targetLang = languageCode;
      const lower = languageCode.toLowerCase();
      if (lower.includes('es') || lower.includes('spanish')) targetLang = 'es-ES';
      else if (lower.includes('ja') || lower.includes('japan')) targetLang = 'ja-JP';
      else if (lower.includes('fr') || lower.includes('french')) targetLang = 'fr-FR';
      else if (lower.includes('de') || lower.includes('german')) targetLang = 'de-DE';
      else if (lower.includes('it') || lower.includes('italian')) targetLang = 'it-IT';
      else if (lower.includes('zh') || lower.includes('chinese')) targetLang = 'zh-CN';
      else if (lower.includes('ko') || lower.includes('korean')) targetLang = 'ko-KR';
      else if (lower.includes('pt') || lower.includes('portuguese')) targetLang = 'pt-BR';
      else if (lower.includes('ru') || lower.includes('russian')) targetLang = 'ru-RU';
      else if (lower.includes('ar') || lower.includes('arabic')) targetLang = 'ar-SA';

      utterance.lang = targetLang;

      // Attempt to pick a natural native voice if available
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find((v) => v.lang.startsWith(targetLang.slice(0, 2)));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}
