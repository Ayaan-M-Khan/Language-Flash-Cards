import { TableRowInput } from './types';

/**
 * Robust parser for text tables (TSV, CSV, Markdown pipes, tabs, Excel pastes, hyphens).
 */
export function parseTableText(rawInput: string): {
  rows: TableRowInput[];
  detectedDelimiter: string;
  hasHeader: boolean;
  columnsDetected: { englishCol: number; targetCol: number };
} {
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
    };
  }

  // Detect delimiter
  const firstNonDivider = lines.find((l) => !/^[-|+ \t]+$/.test(l)) || lines[0];

  let delimiter = '\t';
  if (firstNonDivider.includes('\t')) {
    delimiter = '\t';
  } else if (firstNonDivider.includes('|')) {
    delimiter = '|';
  } else if (firstNonDivider.includes(';')) {
    delimiter = ';';
  } else if (firstNonDivider.includes(',')) {
    delimiter = ',';
  } else if (firstNonDivider.includes(' - ') || firstNonDivider.includes(' – ') || firstNonDivider.includes(' — ')) {
    delimiter = ' - ';
  } else if (firstNonDivider.includes(':')) {
    delimiter = ':';
  }

  // Parse lines into cell arrays
  const parsedGrid: string[][] = [];

  for (const line of lines) {
    // Skip Markdown divider rows like |---|---|
    if (/^[|\-+: \t]+$/.test(line)) continue;

    let cells: string[] = [];
    if (delimiter === '|') {
      // Pipe separated markdown
      cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
    } else if (delimiter === ' - ') {
      const parts = line.split(/\s*[-–—]\s*/);
      cells = parts.map((p) => p.trim());
    } else if (delimiter === ',') {
      // Basic CSV cell split taking quotes into account
      cells = parseCSVLine(line);
    } else {
      cells = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    }

    if (cells.length >= 2 && (cells[0] !== '' || cells[1] !== '')) {
      parsedGrid.push(cells);
    }
  }

  if (parsedGrid.length === 0) {
    return {
      rows: [],
      detectedDelimiter: delimiter,
      hasHeader: false,
      columnsDetected: { englishCol: 0, targetCol: 1 },
    };
  }

  // Check header row
  const firstRow = parsedGrid[0];
  const headerCheck = isHeaderRow(firstRow);
  let startIndex = 0;
  let englishCol = 0;
  let targetCol = 1;

  if (headerCheck.isHeader) {
    startIndex = 1;
    englishCol = headerCheck.englishCol;
    targetCol = headerCheck.targetCol;
  } else {
    // Detect column based on language heuristics (e.g. non-ascii characters or common English words)
    const detected = detectEnglishColumn(parsedGrid);
    englishCol = detected.englishCol;
    targetCol = detected.targetCol;
  }

  const rows: TableRowInput[] = [];
  for (let i = startIndex; i < parsedGrid.length; i++) {
    const row = parsedGrid[i];
    const english = row[englishCol] || '';
    const targetWord = row[targetCol] || '';

    if (english.trim() && targetWord.trim()) {
      // Check if there is an optional 3rd or 4th column for category, notes, or phonetics
      const category = row[2] && row[2] !== row[englishCol] && row[2] !== row[targetCol] ? row[2] : undefined;
      const notes = row[3] || undefined;

      rows.push({
        english: cleanCell(english),
        targetWord: cleanCell(targetWord),
        category: category ? cleanCell(category) : undefined,
        notes: notes ? cleanCell(notes) : undefined,
      });
    }
  }

  return {
    rows,
    detectedDelimiter: delimiter,
    hasHeader: headerCheck.isHeader,
    columnsDetected: { englishCol, targetCol },
  };
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

function isHeaderRow(row: string[]): { isHeader: boolean; englishCol: number; targetCol: number } {
  const rowLower = row.map((r) => r.toLowerCase().trim());
  let englishCol = -1;
  let targetCol = -1;

  rowLower.forEach((val, idx) => {
    if (
      val === 'english' ||
      val === 'en' ||
      val === 'meaning' ||
      val === 'definition' ||
      val === 'native' ||
      val.includes('english')
    ) {
      englishCol = idx;
    } else if (
      val === 'target' ||
      val === 'word' ||
      val === 'foreign' ||
      val === 'translation' ||
      val === 'vocab' ||
      val === 'vocabulary' ||
      val === 'spanish' ||
      val === 'japanese' ||
      val === 'french' ||
      val === 'german' ||
      val === 'italian' ||
      val === 'chinese' ||
      val === 'korean' ||
      val.includes('target')
    ) {
      targetCol = idx;
    }
  });

  if (englishCol !== -1 && targetCol !== -1 && englishCol !== targetCol) {
    return { isHeader: true, englishCol, targetCol };
  }

  // Check if first row strings look like header names (e.g. Word, Definition)
  const commonHeaderWords = ['word', 'meaning', 'translation', 'english', 'term', 'front', 'back', 'vocab'];
  const hasCommonHeader = rowLower.some((val) => commonHeaderWords.includes(val));
  if (hasCommonHeader) {
    return {
      isHeader: true,
      englishCol: englishCol !== -1 ? englishCol : 0,
      targetCol: targetCol !== -1 ? targetCol : 1,
    };
  }

  return { isHeader: false, englishCol: 0, targetCol: 1 };
}

function detectEnglishColumn(grid: string[][]): { englishCol: number; targetCol: number } {
  // Inspect non-ascii characters (Japanese, Chinese, Arabic, Cyrillic, accented letters like é, ñ, etc.)
  let col0NonAscii = 0;
  let col1NonAscii = 0;

  for (const row of grid.slice(0, 10)) {
    const c0 = row[0] || '';
    const c1 = row[1] || '';
    col0NonAscii += (c0.match(/[^\x00-\x7F]/g) || []).length;
    col1NonAscii += (c1.match(/[^\x00-\x7F]/g) || []).length;
  }

  if (col0NonAscii > col1NonAscii && col0NonAscii > 0) {
    // Column 0 is foreign, Column 1 is English
    return { englishCol: 1, targetCol: 0 };
  }

  // Default: Col 0 is English, Col 1 is Target
  return { englishCol: 0, targetCol: 1 };
}
