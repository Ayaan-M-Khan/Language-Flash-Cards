import { TableRowInput } from './types';

export interface ParsedSection {
  name: string;
  count: number;
}

export interface ParseTableResult {
  rows: TableRowInput[];
  detectedDelimiter: string;
  hasHeader: boolean;
  columnsDetected: { englishCol: number; targetCol: number };
  detectedLanguage: string;
  detectedLanguageCode: string;
  detectedTitle: string;
  detectedColor: string;
  detectedIcon: string;
  sections: ParsedSection[];
}

interface ColumnMapping {
  englishCol: number;
  targetCol: number;
  phoneticCol?: number;
  notesCol?: number;
  exampleCols: number[];
}

/**
 * Robust parser for text tables (TSV, CSV, Markdown pipes, tabs, Excel pastes, hyphens, and multi-section vocabulary tables).
 */
export function parseTableText(rawInput: string): ParseTableResult {
  const lines = rawInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('<!--'));

  if (lines.length === 0) {
    return {
      rows: [],
      detectedDelimiter: '\t',
      hasHeader: false,
      columnsDetected: { englishCol: 0, targetCol: 1 },
      detectedLanguage: 'Foreign Language',
      detectedLanguageCode: 'es-ES',
      detectedTitle: 'Vocabulary Deck',
      detectedColor: 'blue',
      detectedIcon: 'Sparkles',
      sections: [],
    };
  }

  // Detect predominant delimiter across the input lines
  const delimiter = detectDelimiter(lines);

  const rows: TableRowInput[] = [];
  const sectionCounts: Map<string, number> = new Map();

  let currentCategory = 'Core Vocabulary';
  let currentMapping: ColumnMapping | null = null;
  let hasEncounteredHeader = false;
  let primaryEnglishCol = 0;
  let primaryTargetCol = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Skip markdown divider rows like |---|---| or horizontal rules
    if (/^[|\-+: \t]+$/.test(line)) {
      continue;
    }

    // 2. Check if this line is a Section Heading
    // e.g. "1. Greetings & Introductions" or "Chapter 2: Places" or "### Animals"
    const sectionTitle = extractSectionHeading(line, delimiter);
    if (sectionTitle) {
      currentCategory = sectionTitle;
      currentMapping = null; // Reset column mapping for new section
      continue;
    }

    // 3. Split the line into individual cells
    const cells = splitLineToCells(line, delimiter);
    if (cells.length === 0) continue;

    // Single-cell line that wasn't caught earlier, could be a section name without numbers
    if (cells.length === 1 && !line.includes(delimiter)) {
      if (line.length > 2 && line.length < 80 && !/[.:?]$/.test(line)) {
        currentCategory = cleanCell(line);
        currentMapping = null;
        continue;
      }
    }

    // 4. Check if this row is a Table Header row
    const headerMapping = analyzeHeaderRow(cells);
    if (headerMapping) {
      currentMapping = headerMapping;
      hasEncounteredHeader = true;
      primaryEnglishCol = headerMapping.englishCol;
      primaryTargetCol = headerMapping.targetCol;
      continue; // Do not treat the header itself as a vocabulary flashcard
    }

    // 5. Parse as data row
    // If no active header mapping for this section, resolve mapping dynamically
    let activeMapping = currentMapping;
    if (!activeMapping) {
      activeMapping = inferRowMapping(cells);
      primaryEnglishCol = activeMapping.englishCol;
      primaryTargetCol = activeMapping.targetCol;
    }

    const englishRaw = cells[activeMapping.englishCol] ?? '';
    const targetWordRaw = cells[activeMapping.targetCol] ?? '';

    const english = cleanCell(englishRaw);
    const targetWord = cleanCell(targetWordRaw);

    // Skip empty or invalid rows
    if (!english && !targetWord) continue;
    // Skip if identical English and target (unless single character) and looks like a header remainder
    if (english.toLowerCase() === targetWord.toLowerCase() && isLikelyHeaderKeyword(english)) {
      continue;
    }

    // Extract phonetic / pronunciation / transliteration
    let phonetic: string | undefined;
    if (activeMapping.phoneticCol !== undefined && cells[activeMapping.phoneticCol]) {
      const p = cleanCell(cells[activeMapping.phoneticCol]);
      if (p) phonetic = p;
    }

    // Extract notes / gender / grammar / dialect notes
    const notesParts: string[] = [];
    if (activeMapping.notesCol !== undefined && cells[activeMapping.notesCol]) {
      const n = cleanCell(cells[activeMapping.notesCol]);
      if (n) notesParts.push(n);
    }

    // Extract examples (e.g. Section 7: Example columns)
    if (activeMapping.exampleCols && activeMapping.exampleCols.length > 0) {
      for (const exCol of activeMapping.exampleCols) {
        const exVal = cleanCell(cells[exCol] || '');
        if (exVal) {
          notesParts.push(exVal);
        }
      }
    }

    // Fallback: if row has extra cells that weren't captured and notes are empty
    if (notesParts.length === 0 && cells.length > 2 && activeMapping.phoneticCol === undefined && activeMapping.notesCol === undefined) {
      for (let c = 0; c < cells.length; c++) {
        if (c !== activeMapping.englishCol && c !== activeMapping.targetCol) {
          const val = cleanCell(cells[c]);
          if (val) notesParts.push(val);
        }
      }
    }

    const notes = notesParts.length > 0 ? notesParts.join(' | ') : undefined;

    // Detect Part of Speech hint if present in notes or category
    let partOfSpeech: string | undefined;
    if (notes) {
      const lowerNotes = notes.toLowerCase();
      if (lowerNotes.includes('noun') || lowerNotes.includes('masculine') || lowerNotes.includes('feminine')) {
        partOfSpeech = 'noun';
      } else if (lowerNotes.includes('verb')) {
        partOfSpeech = 'verb';
      } else if (lowerNotes.includes('preposition')) {
        partOfSpeech = 'preposition';
      } else if (lowerNotes.includes('pronoun')) {
        partOfSpeech = 'pronoun';
      } else if (lowerNotes.includes('adjective')) {
        partOfSpeech = 'adjective';
      } else if (lowerNotes.includes('phrase') || targetWord.includes(' ')) {
        partOfSpeech = 'phrase';
      }
    }

    rows.push({
      english: english || targetWord,
      targetWord: targetWord || english,
      phonetic,
      partOfSpeech,
      category: currentCategory,
      notes,
    });

    // Update section counts
    sectionCounts.set(currentCategory, (sectionCounts.get(currentCategory) || 0) + 1);
  }

  // Detect language and system styling
  const { language, languageCode, color, icon } = detectLanguageAndTheme(rows);

  // Generate an intelligent title
  const sectionsList: ParsedSection[] = Array.from(sectionCounts.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  let detectedTitle = `${language} Vocabulary Deck`;
  if (sectionsList.length > 1) {
    detectedTitle = `${language} Vocabulary: ${sectionsList.length} Comprehensive Topics`;
  } else if (sectionsList.length === 1 && sectionsList[0].name !== 'Core Vocabulary') {
    detectedTitle = `${language}: ${sectionsList[0].name}`;
  }

  return {
    rows,
    detectedDelimiter: delimiter,
    hasHeader: hasEncounteredHeader,
    columnsDetected: { englishCol: primaryEnglishCol, targetCol: primaryTargetCol },
    detectedLanguage: language,
    detectedLanguageCode: languageCode,
    detectedTitle,
    detectedColor: color,
    detectedIcon: icon,
    sections: sectionsList,
  };
}

/**
 * Detects the predominant delimiter across the input lines.
 */
function detectDelimiter(lines: string[]): string {
  let tabCount = 0;
  let pipeCount = 0;
  let commaCount = 0;
  let semicolonCount = 0;
  let dashCount = 0;

  for (const line of lines) {
    if (line.includes('\t')) tabCount++;
    if (line.includes('|')) pipeCount++;
    if (line.includes(';')) semicolonCount++;
    if (line.includes(',')) commaCount++;
    if (/\s+[-–—]\s+/.test(line)) dashCount++;
  }

  if (tabCount >= 1) return '\t';
  if (pipeCount >= 2) return '|';
  if (semicolonCount > commaCount && semicolonCount >= 2) return ';';
  if (commaCount >= 2) return ',';
  if (dashCount >= 2) return ' - ';

  return '\t';
}

/**
 * Identifies if a line is a section heading such as:
 * "1. Greetings & Introductions"
 * "2. Dialect vs. Formal Expressions & Question Words"
 * "### Food and Drink"
 */
function extractSectionHeading(line: string, delimiter: string): string | null {
  // If line contains multiple tabs or multiple pipes, it's definitely a table row, not a heading
  if (delimiter === '\t' && (line.match(/\t/g) || []).length >= 2) return null;
  if (delimiter === '|' && (line.match(/\|/g) || []).length >= 2) return null;

  // Numbered section e.g. "1. Greetings & Introductions" or "7. Possessive Suffixes / Attached Pronouns"
  const numberedMatch = line.match(/^\s*(?:(?:\d+[\.\)]|Chapter\s+\d+[:.]?|Section\s+\d+[:.]?|Part\s+\d+[:.]?|Unit\s+\d+[:.]?|Week\s+\d+[:.]?|#{1,4})\s*)(.+)$/i);
  if (numberedMatch && numberedMatch[1]) {
    return cleanCell(numberedMatch[1]);
  }

  return null;
}

/**
 * Splits a line into cells respecting the delimiter and quotes.
 */
function splitLineToCells(line: string, delimiter: string): string[] {
  if (delimiter === '|') {
    return line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
  }

  if (delimiter === ' - ') {
    return line.split(/\s*[-–—]\s*/).map((c) => c.trim());
  }

  if (delimiter === ',') {
    return parseCSVLine(line);
  }

  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim());
  }

  // Fallback: if delimiter not found in this specific line, check for multiple spaces (copied from formatted tables)
  if (!line.includes(delimiter) && /\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((c) => c.trim());
  }

  return line.split(delimiter).map((c) => c.trim());
}

/**
 * Analyzes whether a row is a table header and maps column indices.
 */
function analyzeHeaderRow(cells: string[]): ColumnMapping | null {
  if (cells.length < 2) return null;

  const lowerCells = cells.map((c) => c.toLowerCase().trim());

  let englishCol = -1;
  let targetCol = -1;
  let phoneticCol: number | undefined;
  let notesCol: number | undefined;
  const exampleCols: number[] = [];

  let matchesHeaderKeywords = 0;

  for (let idx = 0; idx < lowerCells.length; idx++) {
    const val = lowerCells[idx];

    if (
      val === 'english' ||
      val === 'meaning' ||
      val === 'definition' ||
      val === 'translation' ||
      val === 'native' ||
      val === 'en'
    ) {
      englishCol = idx;
      matchesHeaderKeywords++;
    } else if (
      val.includes('transliterat') ||
      val.includes('phonetic') ||
      val.includes('pronun') ||
      val.includes('reading') ||
      val.includes('pinyin') ||
      val.includes('romaji')
    ) {
      phoneticCol = idx;
      matchesHeaderKeywords++;
    } else if (
      val.includes('arabic') ||
      val.includes('script') ||
      val.includes('target') ||
      val.includes('foreign') ||
      val.includes('suffix') ||
      val.includes('prefix') ||
      val.includes('kanji') ||
      val.includes('hanzi') ||
      val === 'word' ||
      val === 'vocab' ||
      val === 'spanish' ||
      val === 'japanese' ||
      val === 'french' ||
      val === 'german' ||
      val === 'chinese'
    ) {
      targetCol = idx;
      matchesHeaderKeywords++;
    } else if (val.includes('example')) {
      exampleCols.push(idx);
      matchesHeaderKeywords++;
    } else if (
      val.includes('note') ||
      val.includes('gender') ||
      val.includes('dialect') ||
      val.includes('grammar') ||
      val.includes('type') ||
      val.includes('number') ||
      val.includes('pos')
    ) {
      notesCol = idx;
      matchesHeaderKeywords++;
    }
  }

  // If at least 2 cells matched recognized header concepts, or there are clear English & Target headers:
  if (matchesHeaderKeywords >= 2 || (englishCol !== -1 && targetCol !== -1)) {
    // If one of the primary columns wasn't explicitly assigned:
    if (englishCol === -1 && targetCol !== -1) {
      // Find the first column that isn't target, phonetic, or notes
      const freeIdx = [0, 1, 2, 3].find(
        (i) => i !== targetCol && i !== phoneticCol && i !== notesCol && !exampleCols.includes(i) && i < cells.length
      );
      englishCol = freeIdx !== undefined ? freeIdx : 0;
    } else if (targetCol === -1 && englishCol !== -1) {
      const freeIdx = [0, 1, 2, 3].find(
        (i) => i !== englishCol && i !== phoneticCol && i !== notesCol && !exampleCols.includes(i) && i < cells.length
      );
      targetCol = freeIdx !== undefined ? freeIdx : 1;
    }

    if (englishCol !== -1 && targetCol !== -1 && englishCol !== targetCol) {
      return { englishCol, targetCol, phoneticCol, notesCol, exampleCols };
    }
  }

  return null;
}

/**
 * Fallback per-row column mapping when no header row is present.
 * Uses script and alphabet heuristics to distinguish foreign script from English.
 */
function inferRowMapping(cells: string[]): ColumnMapping {
  let englishCol = 0;
  let targetCol = 1;
  let phoneticCol: number | undefined;
  let notesCol: number | undefined;

  // Check which cell has non-Latin / target script (e.g. Arabic, Cyrillic, CJK)
  const nonLatinCounts = cells.map((c) => {
    // Arabic, Japanese, Chinese, Korean, Cyrillic, Thai, Hebrew, etc.
    const nonLatin = (c.match(/[\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0E00-\u0E7F\u0590-\u05FF]/g) || []).length;
    return nonLatin;
  });

  if (nonLatinCounts[1] > 0 && nonLatinCounts[0] === 0) {
    // Cell 0 is English, Cell 1 is Foreign
    englishCol = 0;
    targetCol = 1;
    if (cells.length > 2) phoneticCol = 2;
    if (cells.length > 3) notesCol = 3;
  } else if (nonLatinCounts[0] > 0 && nonLatinCounts[1] === 0) {
    // Cell 0 is Foreign, Cell 1 is English
    targetCol = 0;
    englishCol = 1;
    if (cells.length > 2) phoneticCol = 2;
    if (cells.length > 3) notesCol = 3;
  } else {
    // Default: Col 0 is English, Col 1 is Target
    englishCol = 0;
    targetCol = 1;
    if (cells.length > 2) phoneticCol = 2;
    if (cells.length > 3) notesCol = 3;
  }

  return { englishCol, targetCol, phoneticCol, notesCol, exampleCols: [] };
}

function isLikelyHeaderKeyword(str: string): boolean {
  const s = str.toLowerCase().trim();
  const keywords = ['english', 'meaning', 'target', 'word', 'vocab', 'transliteration', 'script', 'notes', 'suffix'];
  return keywords.includes(s);
}

function cleanCell(cell: string): string {
  return cell.replace(/^["']|["']$/g, '').trim();
}

function parseCSVLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim().replace(/^["']|["']$/g, ''));
  return result;
}

/**
 * Detects the language from the collection of parsed cards and selects an Apple theme.
 */
function detectLanguageAndTheme(rows: TableRowInput[]): {
  language: string;
  languageCode: string;
  color: string;
  icon: string;
} {
  let arabicScore = 0;
  let japaneseScore = 0;
  let chineseScore = 0;
  let koreanScore = 0;
  let cyrillicScore = 0;
  let spanishScore = 0;
  let frenchScore = 0;
  let germanScore = 0;

  for (const r of rows) {
    const text = `${r.targetWord} ${r.notes || ''}`;

    // Arabic script range
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
      arabicScore += 5;
    }
    // Japanese Kana
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      japaneseScore += 5;
    }
    // Chinese Kanji/Hanzi without Kana
    if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      chineseScore += 4;
    }
    // Korean Hangul
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
      koreanScore += 5;
    }
    // Cyrillic
    if (/[\u0400-\u04FF]/.test(text)) {
      cyrillicScore += 5;
    }
    // Spanish diacritics
    if (/[áéíóúüñ¿¡]/i.test(text)) {
      spanishScore += 2;
    }
    // French diacritics
    if (/[àèùçœâêîôûëïü]/i.test(text)) {
      frenchScore += 2;
    }
    // German umlauts
    if (/[äöüß]/i.test(text)) {
      germanScore += 2;
    }
  }

  if (arabicScore > 0) {
    return { language: 'Arabic', languageCode: 'ar-SA', color: 'emerald', icon: 'Compass' };
  }
  if (japaneseScore > 0) {
    return { language: 'Japanese', languageCode: 'ja-JP', color: 'pink', icon: 'Sparkles' };
  }
  if (koreanScore > 0) {
    return { language: 'Korean', languageCode: 'ko-KR', color: 'indigo', icon: 'Sparkles' };
  }
  if (chineseScore > 0) {
    return { language: 'Chinese', languageCode: 'zh-CN', color: 'rose', icon: 'Flame' };
  }
  if (cyrillicScore > 0) {
    return { language: 'Russian', languageCode: 'ru-RU', color: 'blue', icon: 'BookOpen' };
  }
  if (germanScore > 1) {
    return { language: 'German', languageCode: 'de-DE', color: 'orange', icon: 'Compass' };
  }
  if (frenchScore > 1) {
    return { language: 'French', languageCode: 'fr-FR', color: 'purple', icon: 'Heart' };
  }
  if (spanishScore > 1) {
    return { language: 'Spanish', languageCode: 'es-ES', color: 'blue', icon: 'BookOpen' };
  }

  // Default fallback
  return { language: 'Foreign Language', languageCode: 'es-ES', color: 'blue', icon: 'Sparkles' };
}

