// Pure, deterministic speech language resolution, text normalization, and voice selection utilities.

export interface SpeechVoiceCandidate {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

interface LanguageSpec {
  code: string;
  name: string;
  aliases: string[];
}

const LANGUAGE_SPECS: LanguageSpec[] = [
  { code: 'ar-SA', name: 'Arabic', aliases: ['ar', 'arabic', 'arab', 'MSA', 'levantine', 'egyptian arabic', 'fusha', 'العربية'] },
  { code: 'es-ES', name: 'Spanish', aliases: ['es', 'spanish', 'espanol', 'español', 'castilian', 'castellano'] },
  { code: 'ja-JP', name: 'Japanese', aliases: ['ja', 'jp', 'japanese', 'nihongo', '日本語'] },
  { code: 'fr-FR', name: 'French', aliases: ['fr', 'french', 'francais', 'français'] },
  { code: 'de-DE', name: 'German', aliases: ['de', 'german', 'deutsch'] },
  { code: 'it-IT', name: 'Italian', aliases: ['it', 'italian', 'italiano'] },
  { code: 'zh-CN', name: 'Chinese', aliases: ['zh', 'zh-cn', 'zh-hans', 'chinese', 'mandarin', 'putonghua', '中文', '汉语', '漢語'] },
  { code: 'zh-TW', name: 'Traditional Chinese', aliases: ['zh-tw', 'zh-hant', 'taiwanese mandarin'] },
  { code: 'zh-HK', name: 'Cantonese', aliases: ['zh-hk', 'yue', 'cantonese', '粵語', '粤语'] },
  { code: 'ko-KR', name: 'Korean', aliases: ['ko', 'kr', 'korean', 'hangul', '한국어'] },
  { code: 'pt-BR', name: 'Portuguese', aliases: ['pt', 'pt-br', 'portuguese', 'portugues', 'português'] },
  { code: 'pt-PT', name: 'European Portuguese', aliases: ['pt-pt'] },
  { code: 'ru-RU', name: 'Russian', aliases: ['ru', 'russian', 'русский'] },
  { code: 'hi-IN', name: 'Hindi', aliases: ['hi', 'hindi', 'हिन्दी', 'हिंदी'] },
  { code: 'ur-PK', name: 'Urdu', aliases: ['ur', 'urdu', 'اردو'] },
  { code: 'fa-IR', name: 'Persian', aliases: ['fa', 'persian', 'farsi', 'فارسی'] },
  { code: 'tr-TR', name: 'Turkish', aliases: ['tr', 'turkish', 'turkce', 'türkçe'] },
  { code: 'he-IL', name: 'Hebrew', aliases: ['he', 'iw', 'hebrew', 'עברית'] },
  { code: 'el-GR', name: 'Greek', aliases: ['el', 'greek', 'ελληνικά'] },
  { code: 'nl-NL', name: 'Dutch', aliases: ['nl', 'dutch', 'nederlands', 'flemish'] },
  { code: 'pl-PL', name: 'Polish', aliases: ['pl', 'polish', 'polski'] },
  { code: 'sv-SE', name: 'Swedish', aliases: ['sv', 'swedish', 'svenska'] },
  { code: 'nb-NO', name: 'Norwegian', aliases: ['nb', 'no', 'nn', 'norwegian', 'norsk'] },
  { code: 'da-DK', name: 'Danish', aliases: ['da', 'danish', 'dansk'] },
  { code: 'fi-FI', name: 'Finnish', aliases: ['fi', 'finnish', 'suomi'] },
  { code: 'cs-CZ', name: 'Czech', aliases: ['cs', 'czech', 'čeština', 'cestina'] },
  { code: 'hu-HU', name: 'Hungarian', aliases: ['hu', 'hungarian', 'magyar'] },
  { code: 'ro-RO', name: 'Romanian', aliases: ['ro', 'romanian', 'română', 'romana'] },
  { code: 'uk-UA', name: 'Ukrainian', aliases: ['uk', 'ukrainian', 'українська'] },
  { code: 'vi-VN', name: 'Vietnamese', aliases: ['vi', 'vietnamese', 'tiếng việt', 'tieng viet'] },
  { code: 'th-TH', name: 'Thai', aliases: ['th', 'thai', 'ไทย'] },
  { code: 'id-ID', name: 'Indonesian', aliases: ['id', 'indonesian', 'bahasa indonesia'] },
  { code: 'ms-MY', name: 'Malay', aliases: ['ms', 'malay', 'bahasa melayu'] },
  { code: 'fil-PH', name: 'Filipino', aliases: ['fil', 'tl', 'filipino', 'tagalog'] },
  { code: 'sw-KE', name: 'Swahili', aliases: ['sw', 'swahili', 'kiswahili'] },
  { code: 'ta-IN', name: 'Tamil', aliases: ['ta', 'tamil', 'தமிழ்'] },
  { code: 'bn-BD', name: 'Bengali', aliases: ['bn', 'bengali', 'bangla', 'বাংলা'] },
  { code: 'en-US', name: 'English', aliases: ['en', 'en-us', 'english'] },
  { code: 'en-GB', name: 'British English', aliases: ['en-gb'] },
];

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const PERSIAN_SPECIFIC_RE = /[پچژگک]/;
const URDU_SPECIFIC_RE = /[ٹڈڑںےھ]/;
const JAPANESE_KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
const CJK_RE = /[\u4E00-\u9FFF]/;
const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const UKRAINIAN_SPECIFIC_RE = /[іїєґІЇЄҐ]/;
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HEBREW_RE = /[\u0590-\u05FF]/;
const GREEK_RE = /[\u0370-\u03FF]/;
const THAI_RE = /[\u0E00-\u0E7F]/;
const TAMIL_RE = /[\u0B80-\u0BFF]/;
const BENGALI_RE = /[\u0980-\u09FF]/;

const NON_LATIN_SCRIPT_RE =
  /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u09FF\u0B80-\u0BFF\u0E00-\u0E7F\u1100-\u11FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const BCP47_RE = /^([a-z]{2,3})(?:[-_]([a-z]{4}))?(?:[-_]([a-z]{2}|\d{3}))?$/i;

function normalizeBcp47(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(BCP47_RE);
  if (!match) return null;

  const base = match[1].toLowerCase();
  const script = match[2] ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : '';
  const region = match[3] ? match[3].toUpperCase() : '';

  if (region) {
    return script ? `${base}-${script}-${region}` : `${base}-${region}`;
  }

  // Expand bare 2-3 letter code to canonical default locale if known
  const spec = LANGUAGE_SPECS.find(
    (s) => s.code.toLowerCase().split('-')[0] === base || s.aliases.includes(base)
  );
  if (spec) return spec.code;
  return base;
}

/**
 * Matches a language hint (BCP-47 code or language name like "Japanese", "Arabic (Levantine)", "Spanish")
 * without substring collision bugs (e.g. "Japanese" / "Chinese" / "Portuguese" containing "es").
 */
export function parseLanguageHint(languageHint?: string): string | null {
  if (!languageHint) return null;
  const trimmed = languageHint.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower === 'foreign language' ||
    lower === 'language' ||
    lower === 'unknown' ||
    lower === 'other' ||
    lower === 'auto'
  ) {
    return null;
  }

  // 1. Exact BCP-47 tag match first (e.g., "ja-JP", "ar-SA", "es", "pt-BR")
  const bcp = normalizeBcp47(trimmed);
  if (bcp) return bcp;

  // 2. Exact full-string alias match
  for (const spec of LANGUAGE_SPECS) {
    if (spec.name.toLowerCase() === lower || spec.aliases.some((a) => a.toLowerCase() === lower)) {
      return spec.code;
    }
  }

  // 3. Token / word-boundary alias match for composite names like "Levantine Arabic" or "Japanese (JLPT N5)"
  const tokens = lower
    .replace(/[()[\],/\\:;_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const spec of LANGUAGE_SPECS) {
    for (const alias of spec.aliases) {
      const aliasLower = alias.toLowerCase();
      // Skip 2-letter codes during multi-word phrase scanning so words like "in" or "no" don't mis-match
      if (aliasLower.length <= 2) continue;
      if (aliasLower.includes(' ')) {
        if (lower.includes(aliasLower)) return spec.code;
      } else if (tokens.includes(aliasLower)) {
        return spec.code;
      }
    }
  }

  // 4. Prefix match on longer names (e.g. "japan..." -> ja-JP, "arab..." -> ar-SA)
  for (const spec of LANGUAGE_SPECS) {
    const stem = spec.name.toLowerCase();
    if (stem.length >= 5 && tokens.some((t) => t.startsWith(stem.slice(0, 5)))) {
      return spec.code;
    }
  }

  return null;
}

/**
 * Detects a BCP-47 language code directly from the script/diacritics of the target word/phrase.
 * Non-Latin scripts take strong precedence so imported cards with stale/default language codes
 * (such as an Arabic or Japanese card accidentally saved with 'es-ES') still speak in the right language.
 */
export function detectLanguageCodeFromText(text?: string, hintCode?: string | null): string | null {
  if (!text || !text.trim()) return null;

  const hintBase = hintCode ? hintCode.toLowerCase().split('-')[0] : null;

  if (JAPANESE_KANA_RE.test(text)) return 'ja-JP';
  if (HANGUL_RE.test(text)) return 'ko-KR';

  if (ARABIC_SCRIPT_RE.test(text)) {
    if (hintBase === 'ur' || URDU_SPECIFIC_RE.test(text)) return 'ur-PK';
    if (hintBase === 'fa' || PERSIAN_SPECIFIC_RE.test(text)) return 'fa-IR';
    if (hintBase === 'ar' && hintCode) return hintCode;
    return 'ar-SA';
  }

  if (CJK_RE.test(text)) {
    if (hintBase === 'ja') return 'ja-JP';
    if (hintBase === 'zh' && hintCode) return hintCode;
    return 'zh-CN';
  }

  if (CYRILLIC_RE.test(text)) {
    if (hintBase === 'uk' || UKRAINIAN_SPECIFIC_RE.test(text)) return 'uk-UA';
    if (hintBase === 'ru' && hintCode) return hintCode;
    return 'ru-RU';
  }

  if (DEVANAGARI_RE.test(text)) return 'hi-IN';
  if (HEBREW_RE.test(text)) return 'he-IL';
  if (GREEK_RE.test(text)) return 'el-GR';
  if (THAI_RE.test(text)) return 'th-TH';
  if (TAMIL_RE.test(text)) return 'ta-IN';
  if (BENGALI_RE.test(text)) return 'bn-BD';

  // For Latin-script text, only infer from strong diacritics when no valid hint was supplied
  if (!hintCode) {
    if (/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(text) && /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỵỷỹ]/i.test(text)) {
      return 'vi-VN';
    }
    if (/[¿¡ñ]/i.test(text)) return 'es-ES';
    if (/[ß]/i.test(text)) return 'de-DE';
    if (/[ğışİ]/.test(text)) return 'tr-TR';
    if (/[ãõ]/i.test(text)) return 'pt-BR';
    if (/[œç]/i.test(text)) return 'fr-FR';
    if (/[łńśźżąćę]/i.test(text)) return 'pl-PL';
  }

  return null;
}

/**
 * Resolves the authoritative BCP-47 speech language code given primary & optional secondary hints
 * (e.g., deck languageCode + deck/card language name) and the actual text being spoken.
 */
export function resolveSpeechLanguageCode(
  languageHint?: string,
  text?: string,
  secondaryHint?: string
): string {
  const parsedPrimary = parseLanguageHint(languageHint);
  const parsedSecondary = parseLanguageHint(secondaryHint);

  // If the text is in a non-Latin script, prefer whichever hint matches that script
  // (e.g. deck has stale languageCode 'es-ES' but language 'Japanese' for Kanji-only word '水')
  if (text && NON_LATIN_SCRIPT_RE.test(text)) {
    const primaryBase = parsedPrimary?.toLowerCase().split('-')[0];
    const secondaryBase = parsedSecondary?.toLowerCase().split('-')[0];

    let bestScriptHint: string | null = parsedPrimary;
    if (CJK_RE.test(text) && !JAPANESE_KANA_RE.test(text)) {
      if (primaryBase === 'ja' || primaryBase === 'zh') {
        bestScriptHint = parsedPrimary;
      } else if (secondaryBase === 'ja' || secondaryBase === 'zh') {
        bestScriptHint = parsedSecondary;
      }
    } else if (ARABIC_SCRIPT_RE.test(text)) {
      if (primaryBase === 'ar' || primaryBase === 'ur' || primaryBase === 'fa') {
        bestScriptHint = parsedPrimary;
      } else if (secondaryBase === 'ar' || secondaryBase === 'ur' || secondaryBase === 'fa') {
        bestScriptHint = parsedSecondary;
      }
    } else if (CYRILLIC_RE.test(text)) {
      if (primaryBase === 'ru' || primaryBase === 'uk') {
        bestScriptHint = parsedPrimary;
      } else if (secondaryBase === 'ru' || secondaryBase === 'uk') {
        bestScriptHint = parsedSecondary;
      }
    }

    const scriptDetected = detectLanguageCodeFromText(text, bestScriptHint);
    if (scriptDetected) return scriptDetected;
  }

  if (parsedPrimary) return parsedPrimary;
  if (parsedSecondary) return parsedSecondary;

  const fallbackDetected = detectLanguageCodeFromText(text, null);
  if (fallbackDetected) return fallbackDetected;
  return 'en-US';
}

/**
 * Returns a clean English language name for prompts/metadata given a BCP-47 code or hint.
 */
export function getLanguageDisplayName(languageCode: string, fallbackName?: string): string {
  const exact = LANGUAGE_SPECS.find((s) => s.code.toLowerCase() === languageCode.toLowerCase());
  if (exact) return exact.name;

  const base = languageCode.toLowerCase().split('-')[0];
  const byBase = LANGUAGE_SPECS.find((s) => s.code.toLowerCase().split('-')[0] === base);
  if (byBase) return byBase.name;

  if (fallbackName && fallbackName.trim() && fallbackName.trim().toLowerCase() !== 'foreign language') {
    return fallbackName.trim();
  }
  return languageCode;
}

/**
 * Detects whether the given string contains non-Latin script characters.
 */
export function hasNonLatinScript(text: string): boolean {
  return NON_LATIN_SCRIPT_RE.test(text);
}

/**
 * Cleans flashcard target text for clear, natural speech synthesis:
 * - Removes parenthesized Latin transliterations/gender markers when native script is present
 *   e.g. "水 (Mizu)" -> "水", "美味しい (Oishii)" -> "美味しい", "How are you? (♂)" -> "How are you?"
 * - Strips Arabic tatweel/kashida suffix markers (e.g. "ـي" -> "ي")
 * - Converts slash-separated alternatives ("أهلاً / مرحباً") into natural pause-separated items
 * - Replaces bare placeholder ellipses ("...") with a brief pause
 */
export function extractSpeakableText(rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText.trim();

  // Strip gender/icon annotations like (♂), (♀), (m), (f), (m/f), (plural), (singular), (New)
  cleaned = cleaned.replace(/\s*\((?:[♂♀/\s]+|[mf](?:\s*\/\s*[mf])?|new|plural|singular|formal|informal)\)\s*/gi, ' ');

  // If native non-Latin script is present, remove parenthesized Latin transliteration glosses like "水 (Mizu)"
  if (NON_LATIN_SCRIPT_RE.test(cleaned)) {
    cleaned = cleaned.replace(/\s*[(\[（][^)\]）]*[A-Za-z][^)\]）]*[)\]）]/g, ' ');
  }

  // Strip Arabic tatweel / kashida (U+0640) used for attached suffix notation like "ـكَ"
  cleaned = cleaned.replace(/\u0640+/g, '');

  // Replace ellipsis placeholders with natural brief pause
  cleaned = cleaned.replace(/\s*(?:\.{2,}|…)\s*/g, ' ');

  // Convert slash-separated variants into pause-separated speech so TTS doesn't say "slash"
  // If both sides normalize identically (e.g. diacritic variants "مَرحَباً / مَرحَبَاً"), speak only the first
  if (cleaned.includes('/')) {
    const parts = cleaned
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const stripMarks = (s: string) =>
        s
          .normalize('NFKD')
          .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
          .toLowerCase();
      const uniqueParts: string[] = [];
      for (const p of parts) {
        if (!uniqueParts.some((u) => stripMarks(u) === stripMarks(p))) {
          uniqueParts.push(p);
        }
      }
      cleaned = uniqueParts.slice(0, 2).join(', ');
    }
  }

  // Collapse excess whitespace and stray punctuation at edges
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();

  return cleaned || rawText.trim();
}

/**
 * Selects the highest-quality matching browser SpeechSynthesis voice for a BCP-47 targetLang.
 * Returns null if NO voice installed in the browser matches the target language base code,
 * signaling the audio engine to use server-side TTS instead of silently failing or reading in English.
 */
export function selectBestBrowserVoice<T extends SpeechVoiceCandidate>(
  voices: readonly T[],
  targetLang: string
): T | null {
  if (!voices || voices.length === 0 || !targetLang) return null;

  const normTarget = targetLang.toLowerCase().replace('_', '-');
  const baseLang = normTarget.split('-')[0];

  const matching = voices.filter((v) => {
    if (!v.lang) return false;
    const vLang = v.lang.toLowerCase().replace('_', '-');
    return vLang === normTarget || vLang.startsWith(`${baseLang}-`) || vLang === baseLang;
  });

  if (matching.length === 0) return null;

  const scoreVoice = (v: T): number => {
    let score = 0;
    const vLang = v.lang.toLowerCase().replace('_', '-');
    const vName = (v.name || '').toLowerCase();

    if (vLang === normTarget) score += 30;
    else if (vLang.startsWith(`${baseLang}-`)) score += 15;

    if (vName.includes('natural') || vName.includes('neural') || vName.includes('enhanced') || vName.includes('premium')) {
      score += 25;
    }
    if (vName.includes('google') || vName.includes('siri') || vName.includes('samantha') || vName.includes('microsoft')) {
      score += 12;
    }
    if (vName.includes('espeak') || vName.includes('compact')) {
      score -= 20;
    }
    if (v.localService) score += 5;
    if (v.default) score += 2;
    return score;
  };

  return [...matching].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}
