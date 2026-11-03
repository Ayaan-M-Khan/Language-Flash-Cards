import { Deck, Flashcard } from './types';

/**
 * Escapes a single cell value according to RFC 4180 CSV rules.
 * Wraps values containing commas, double quotes, or line breaks in double quotes,
 * and escapes internal double quotes by doubling them.
 */
export function escapeCsvCell(
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Produces a filesystem-safe slug for exported CSV backup filenames.
 */
export function buildDeckCsvFilename(deckTitle: string, now: Date = new Date()): string {
  const slug = deckTitle
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const safeSlug = slug || 'vocabulary-deck';
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${safeSlug}-backup-${yyyy}-${mm}-${dd}.csv`;
}

export const DECK_CSV_HEADERS = [
  'English',
  'Target Word',
  'Language',
  'Category',
  'Phonetic',
  'Part of Speech',
  'Example Sentence',
  'Example Translation',
  'Notes',
  'Mastery State',
  'Repetitions',
  'Interval (Days)',
  'Ease Factor',
  'Due Date',
  'Last Reviewed At',
] as const;

/**
 * Serializes a deck's flashcards into an RFC 4180 CSV string with a UTF-8 BOM
 * so non-Latin characters (kanji, accents, Arabic, Cyrillic) open cleanly in spreadsheet apps.
 */
export function buildDeckCsvContent(deck: Deck, deckCards: Flashcard[]): string {
  const headerLine = DECK_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(',');

  const dataLines = deckCards.map((card) => {
    const row = [
      card.english,
      card.targetWord,
      card.language || deck.language,
      card.category ?? '',
      card.phonetic ?? '',
      card.partOfSpeech ?? '',
      card.exampleSentence?.target ?? '',
      card.exampleSentence?.english ?? '',
      card.notes ?? '',
      card.state,
      card.repetitions,
      card.intervalDays,
      Number((card.easeFactor ?? 2.5).toFixed(2)),
      card.dueDate,
      card.lastReviewedAt ?? '',
    ];
    return row.map((cell) => escapeCsvCell(cell)).join(',');
  });

  // Prepend UTF-8 BOM (\uFEFF) and join lines with standard CRLF (\r\n)
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Triggers a local browser download of the deck's cards as a .csv backup file.
 */
export function exportDeckCardsToCsv(
  deck: Deck,
  deckCards: Flashcard[]
): { filename: string; rowCount: number } {
  const csvContent = buildDeckCsvContent(deck, deckCards);
  const filename = buildDeckCsvFilename(deck.title);

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke object URL asynchronously after download is initiated
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 150);

  return { filename, rowCount: deckCards.length };
}
