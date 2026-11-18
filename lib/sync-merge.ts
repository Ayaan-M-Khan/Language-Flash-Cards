import { Deck, Flashcard } from './types';
import { sortCardsSequentially } from './srs';

export interface DeletedCardRef {
  id: string;
  deckId: string;
}

export interface SyncDirtyState {
  dirtyDeckIds: string[];
  dirtyCardIds: string[];
  deletedDeckIds: string[];
  deletedCards: DeletedCardRef[];
  knownCloudDeckIds: string[];
  knownCloudCardIds: string[];
}

export function createEmptyDirtyState(): SyncDirtyState {
  return {
    dirtyDeckIds: [],
    dirtyCardIds: [],
    deletedDeckIds: [],
    deletedCards: [],
    knownCloudDeckIds: [],
    knownCloudCardIds: [],
  };
}

export function normalizeDirtyState(raw: unknown): SyncDirtyState {
  const empty = createEmptyDirtyState();
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;

  const uniqueStrings = (val: unknown): string[] =>
    Array.isArray(val)
      ? Array.from(new Set(val.filter((item): item is string => typeof item === 'string' && item.length > 0)))
      : [];

  const deletedCardsMap = new Map<string, DeletedCardRef>();
  if (Array.isArray(obj.deletedCards)) {
    for (const entry of obj.deletedCards) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as DeletedCardRef).id === 'string' &&
        typeof (entry as DeletedCardRef).deckId === 'string'
      ) {
        const ref = entry as DeletedCardRef;
        deletedCardsMap.set(ref.id, { id: ref.id, deckId: ref.deckId });
      }
    }
  }

  return {
    dirtyDeckIds: uniqueStrings(obj.dirtyDeckIds),
    dirtyCardIds: uniqueStrings(obj.dirtyCardIds),
    deletedDeckIds: uniqueStrings(obj.deletedDeckIds),
    deletedCards: Array.from(deletedCardsMap.values()),
    knownCloudDeckIds: uniqueStrings(obj.knownCloudDeckIds),
    knownCloudCardIds: uniqueStrings(obj.knownCloudCardIds),
  };
}

export function markDeckDirtyInState(state: SyncDirtyState, deckId: string): SyncDirtyState {
  return {
    ...state,
    dirtyDeckIds: Array.from(new Set([...state.dirtyDeckIds, deckId])),
    deletedDeckIds: state.deletedDeckIds.filter((id) => id !== deckId),
  };
}

export function markCardDirtyInState(state: SyncDirtyState, cardId: string): SyncDirtyState {
  return {
    ...state,
    dirtyCardIds: Array.from(new Set([...state.dirtyCardIds, cardId])),
    deletedCards: state.deletedCards.filter((c) => c.id !== cardId),
  };
}

export function markDeckDeletedInState(
  state: SyncDirtyState,
  deckId: string,
  cardIdsInDeck: string[]
): SyncDirtyState {
  const cardIdSet = new Set(cardIdsInDeck);
  return {
    ...state,
    dirtyDeckIds: state.dirtyDeckIds.filter((id) => id !== deckId),
    dirtyCardIds: state.dirtyCardIds.filter((id) => !cardIdSet.has(id)),
    deletedDeckIds: Array.from(new Set([...state.deletedDeckIds, deckId])),
    deletedCards: state.deletedCards.filter((c) => c.deckId !== deckId),
  };
}

export function markCardDeletedInState(
  state: SyncDirtyState,
  cardId: string,
  deckId: string
): SyncDirtyState {
  const existing = state.deletedCards.filter((c) => c.id !== cardId);
  return {
    ...state,
    dirtyCardIds: state.dirtyCardIds.filter((id) => id !== cardId),
    deletedCards: [...existing, { id: cardId, deckId }],
  };
}

export function hasPendingDirtyWork(state: SyncDirtyState): boolean {
  return (
    state.dirtyDeckIds.length > 0 ||
    state.dirtyCardIds.length > 0 ||
    state.deletedDeckIds.length > 0 ||
    state.deletedCards.length > 0
  );
}

export function parseIsoMs(iso?: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function getDeckTimestampMs(deck: Deck): number {
  return Math.max(parseIsoMs(deck.updatedAt), parseIsoMs(deck.createdAt));
}

export function getCardTimestampMs(card: Flashcard): number {
  return Math.max(
    parseIsoMs(card.updatedAt),
    parseIsoMs(card.lastReviewedAt),
    parseIsoMs(card.createdAt)
  );
}

function isLocalCardNewerOrRicher(localCard: Flashcard, cloudCard: Flashcard): boolean {
  const localTs = getCardTimestampMs(localCard);
  const cloudTs = getCardTimestampMs(cloudCard);

  if (localTs > cloudTs) return true;
  if (cloudTs > localTs) return false;

  // Equal or missing timestamps: prefer the one that actually has review progress
  if ((localCard.repetitions || 0) !== (cloudCard.repetitions || 0)) {
    return (localCard.repetitions || 0) > (cloudCard.repetitions || 0);
  }
  return false;
}

export function sortDecksDeterministically(decks: Deck[]): Deck[] {
  const starterOrder: Record<string, number> = {
    'deck-spanish-core': 1,
    'deck-japanese-travel': 2,
    'deck-french-cafe': 3,
  };
  return [...decks].sort((a, b) => {
    const aIsStarter = Boolean(starterOrder[a.id]);
    const bIsStarter = Boolean(starterOrder[b.id]);
    if (!aIsStarter && bIsStarter) return -1;
    if (aIsStarter && !bIsStarter) return 1;
    if (aIsStarter && bIsStarter) return starterOrder[a.id] - starterOrder[b.id];
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.id.localeCompare(b.id);
  });
}

export interface MergeLocalAndCloudInput {
  localDecks: Deck[];
  localCards: Flashcard[];
  cloudDecks: Deck[];
  cloudCards: Flashcard[];
  dirtyState: SyncDirtyState;
  /**
   * Set to true once the cloud fetch/snapshot represents authoritative server state
   * (e.g., not an empty offline cache snapshot). Even when true, if cloudDecks is empty
   * and localDecks has items not in deletedDeckIds, we preserve localDecks safely.
   */
  isAuthoritativeCloudSnapshot?: boolean;
}

export interface MergeLocalAndCloudResult {
  decks: Deck[];
  cards: Flashcard[];
  nextDirtyState: SyncDirtyState;
}

/**
 * Non-destructive bidirectional merge between local state and cloud Firestore state.
 * - NEVER wipes local unsynced/dirty decks, cards, edits, or review progress.
 * - NEVER resurrects locally deleted decks/cards while tombstones are pending upload.
 * - Adopts new/updated cloud decks and cards created on other devices.
 * - Only drops a local deck/card when cloud removed it AND it was previously confirmed on cloud AND not dirty locally.
 */
export function mergeLocalAndCloudState({
  localDecks,
  localCards,
  cloudDecks,
  cloudCards,
  dirtyState,
  isAuthoritativeCloudSnapshot = true,
}: MergeLocalAndCloudInput): MergeLocalAndCloudResult {
  const dirtyDeckSet = new Set(dirtyState.dirtyDeckIds);
  const dirtyCardSet = new Set(dirtyState.dirtyCardIds);
  const deletedDeckSet = new Set(dirtyState.deletedDeckIds);
  const deletedCardSet = new Set(dirtyState.deletedCards.map((c) => c.id));
  const knownCloudDeckSet = new Set(dirtyState.knownCloudDeckIds);
  const knownCloudCardSet = new Set(dirtyState.knownCloudCardIds);

  const localDeckMap = new Map<string, Deck>();
  for (const d of localDecks) {
    if (!deletedDeckSet.has(d.id)) {
      localDeckMap.set(d.id, d);
    }
  }

  const cloudDeckMap = new Map<string, Deck>();
  for (const d of cloudDecks) {
    if (!deletedDeckSet.has(d.id)) {
      cloudDeckMap.set(d.id, d);
    }
  }

  const nextDirtyDeckSet = new Set(dirtyDeckSet);
  const nextDirtyCardSet = new Set(dirtyCardSet);
  const nextKnownDeckSet = new Set(knownCloudDeckSet);
  const nextKnownCardSet = new Set(knownCloudCardSet);

  // Record every deck & card currently confirmed in cloud
  for (const d of cloudDecks) {
    nextKnownDeckSet.add(d.id);
  }
  for (const c of cloudCards) {
    nextKnownCardSet.add(c.id);
  }

  const mergedDecksMap = new Map<string, Deck>();
  const cloudHasAnyDecks = cloudDecks.length > 0;

  // 1. Process cloud decks (adopting new ones & merging existing ones)
  for (const cloudDeck of cloudDeckMap.values()) {
    const localDeck = localDeckMap.get(cloudDeck.id);
    if (!localDeck) {
      mergedDecksMap.set(cloudDeck.id, cloudDeck);
    } else if (dirtyDeckSet.has(cloudDeck.id)) {
      // Local has pending changes; keep local unless cloud is strictly newer
      if (getDeckTimestampMs(cloudDeck) > getDeckTimestampMs(localDeck)) {
        mergedDecksMap.set(cloudDeck.id, cloudDeck);
        nextDirtyDeckSet.delete(cloudDeck.id);
      } else {
        mergedDecksMap.set(cloudDeck.id, localDeck);
      }
    } else if (getDeckTimestampMs(localDeck) > getDeckTimestampMs(cloudDeck)) {
      mergedDecksMap.set(cloudDeck.id, localDeck);
      nextDirtyDeckSet.add(cloudDeck.id);
    } else {
      mergedDecksMap.set(cloudDeck.id, cloudDeck);
    }
  }

  // 2. Process local-only decks (preserve anything not genuinely deleted on another device)
  for (const localDeck of localDeckMap.values()) {
    if (cloudDeckMap.has(localDeck.id)) continue;

    const wasPreviouslyInCloud = knownCloudDeckSet.has(localDeck.id);
    const shouldDropRemotelyDeleted =
      isAuthoritativeCloudSnapshot &&
      cloudHasAnyDecks &&
      wasPreviouslyInCloud &&
      !dirtyDeckSet.has(localDeck.id);

    if (!shouldDropRemotelyDeleted) {
      mergedDecksMap.set(localDeck.id, localDeck);
      nextDirtyDeckSet.add(localDeck.id);
    } else {
      nextKnownDeckSet.delete(localDeck.id);
    }
  }

  const keptDeckIds = new Set(mergedDecksMap.keys());

  // 3. Merge cards belonging to kept decks
  const localCardMap = new Map<string, Flashcard>();
  for (const c of localCards) {
    if (keptDeckIds.has(c.deckId) && !deletedCardSet.has(c.id)) {
      localCardMap.set(c.id, c);
    }
  }

  const cloudCardMap = new Map<string, Flashcard>();
  const cloudDeckCardCounts = new Map<string, number>();
  for (const c of cloudCards) {
    if (keptDeckIds.has(c.deckId) && !deletedCardSet.has(c.id)) {
      cloudCardMap.set(c.id, c);
      cloudDeckCardCounts.set(c.deckId, (cloudDeckCardCounts.get(c.deckId) || 0) + 1);
    }
  }

  const mergedCardsMap = new Map<string, Flashcard>();

  for (const cloudCard of cloudCardMap.values()) {
    const localCard = localCardMap.get(cloudCard.id);
    if (!localCard) {
      mergedCardsMap.set(cloudCard.id, cloudCard);
    } else if (dirtyCardSet.has(cloudCard.id)) {
      if (getCardTimestampMs(cloudCard) > getCardTimestampMs(localCard)) {
        mergedCardsMap.set(cloudCard.id, cloudCard);
        nextDirtyCardSet.delete(cloudCard.id);
      } else {
        mergedCardsMap.set(cloudCard.id, localCard);
      }
    } else if (isLocalCardNewerOrRicher(localCard, cloudCard)) {
      mergedCardsMap.set(cloudCard.id, localCard);
      nextDirtyCardSet.add(cloudCard.id);
    } else {
      mergedCardsMap.set(cloudCard.id, cloudCard);
    }
  }

  for (const localCard of localCardMap.values()) {
    if (cloudCardMap.has(localCard.id)) continue;

    const deckInCloud = cloudDeckMap.has(localCard.deckId);
    const cloudDeckHasCards = (cloudDeckCardCounts.get(localCard.deckId) || 0) > 0;
    const wasPreviouslyInCloud = knownCloudCardSet.has(localCard.id);

    const shouldDropRemotelyDeleted =
      isAuthoritativeCloudSnapshot &&
      deckInCloud &&
      cloudDeckHasCards &&
      wasPreviouslyInCloud &&
      !dirtyCardSet.has(localCard.id);

    if (!shouldDropRemotelyDeleted) {
      mergedCardsMap.set(localCard.id, localCard);
      nextDirtyCardSet.add(localCard.id);
    } else {
      nextKnownCardSet.delete(localCard.id);
    }
  }

  // Filter out tombstones for decks/cards no longer present in cloud either
  const rawCloudDeckIds = new Set(cloudDecks.map((d) => d.id));
  const rawCloudCardIds = new Set(cloudCards.map((c) => c.id));
  const remainingDeletedDecks = dirtyState.deletedDeckIds.filter((id) =>
    rawCloudDeckIds.has(id)
  );
  const remainingDeletedCards = dirtyState.deletedCards.filter((ref) =>
    rawCloudCardIds.has(ref.id)
  );

  const sortedDecks = sortDecksDeterministically(Array.from(mergedDecksMap.values()));
  const sortedCards = sortCardsSequentially(
    Array.from(mergedCardsMap.values()),
    sortedDecks
  );

  return {
    decks: sortedDecks,
    cards: sortedCards,
    nextDirtyState: {
      dirtyDeckIds: Array.from(nextDirtyDeckSet).filter((id) => keptDeckIds.has(id)),
      dirtyCardIds: Array.from(nextDirtyCardSet).filter((id) => mergedCardsMap.has(id)),
      deletedDeckIds: remainingDeletedDecks,
      deletedCards: remainingDeletedCards,
      knownCloudDeckIds: Array.from(nextKnownDeckSet),
      knownCloudCardIds: Array.from(nextKnownCardSet),
    },
  };
}

/**
 * Merges a user's pre-login Guest session (custom decks, added cards, and any reviewed starter cards)
 * into their authenticated Google account state without wiping either side.
 */
export function mergeGuestIntoAccountState(params: {
  guestDecks: Deck[];
  guestCards: Flashcard[];
  accountDecks: Deck[];
  accountCards: Flashcard[];
  starterDeckIds: Set<string>;
  dirtyState: SyncDirtyState;
}): {
  decks: Deck[];
  cards: Flashcard[];
  nextDirtyState: SyncDirtyState;
  decksToUpload: Deck[];
  cardsToUpload: Flashcard[];
} {
  const { guestDecks, guestCards, accountDecks, accountCards, starterDeckIds, dirtyState } = params;

  const accountDeckIds = new Set(accountDecks.map((d) => d.id));
  const accountCardMap = new Map(accountCards.map((c) => [c.id, c]));

  let nextDirty = { ...dirtyState };
  const mergedDecks = [...accountDecks];
  const mergedCardMap = new Map<string, Flashcard>(accountCards.map((c) => [c.id, c]));
  const decksToUpload: Deck[] = [];
  const cardsToUpload: Flashcard[] = [];

  // 1. Custom guest decks not yet in account
  for (const gDeck of guestDecks) {
    if (!accountDeckIds.has(gDeck.id) && !starterDeckIds.has(gDeck.id)) {
      mergedDecks.push(gDeck);
      decksToUpload.push(gDeck);
      nextDirty = markDeckDirtyInState(nextDirty, gDeck.id);
    }
  }

  const keptDeckIds = new Set(mergedDecks.map((d) => d.id));

  // 2. Guest cards (for new custom decks, added cards in existing decks, or fresher starter card progress)
  for (const gCard of guestCards) {
    if (!keptDeckIds.has(gCard.deckId)) continue;
    const accCard = accountCardMap.get(gCard.id);

    if (!accCard) {
      // Newly added card in guest session (works for ALL card IDs, not just card-manual-)
      mergedCardMap.set(gCard.id, gCard);
      if (accountDeckIds.has(gCard.deckId)) {
        cardsToUpload.push(gCard);
      }
      nextDirty = markCardDirtyInState(nextDirty, gCard.id);
    } else if (isLocalCardNewerOrRicher(gCard, accCard)) {
      // Guest edited or reviewed this card more recently than cloud
      mergedCardMap.set(gCard.id, gCard);
      cardsToUpload.push(gCard);
      nextDirty = markCardDirtyInState(nextDirty, gCard.id);
    }
  }

  const sortedDecks = sortDecksDeterministically(mergedDecks);
  const sortedCards = sortCardsSequentially(Array.from(mergedCardMap.values()), sortedDecks);

  return {
    decks: sortedDecks,
    cards: sortedCards,
    nextDirtyState: nextDirty,
    decksToUpload,
    cardsToUpload,
  };
}

export interface DirtyFlushAdapter {
  deleteDeck: (deckId: string) => Promise<void>;
  deleteCard: (deckId: string, cardId: string) => Promise<void>;
  saveDeck: (deck: Deck, cards: Flashcard[]) => Promise<void>;
  saveCard: (deckId: string, card: Flashcard) => Promise<void>;
}

export interface DirtyFlushResult {
  nextDirtyState: SyncDirtyState;
  syncedCount: number;
  hadError: boolean;
}

/**
 * Pure, retry-safe dirty state flush executor shared by Firestore deckService and unit tests.
 * - Processes deck deletions, card deletions, dirty decks, and dirty cards in safe order.
 * - Promotes parent deck upload automatically when a dirty card belongs to a deck not yet confirmed on cloud.
 * - Preserves dirty/tombstone markers for any item whose cloud operation failed so the next continuous sync tick retries it.
 */
export async function executeDirtyFlush(
  localDecks: Deck[],
  localCards: Flashcard[],
  dirtyState: SyncDirtyState,
  adapter: DirtyFlushAdapter
): Promise<DirtyFlushResult> {
  if (!hasPendingDirtyWork(dirtyState)) {
    return { nextDirtyState: dirtyState, syncedCount: 0, hadError: false };
  }

  const deckMap = new Map(localDecks.map((d) => [d.id, d]));
  const cardMap = new Map(localCards.map((c) => [c.id, c]));

  const remainingDirtyDecks = new Set(dirtyState.dirtyDeckIds);
  const remainingDirtyCards = new Set(dirtyState.dirtyCardIds);
  const remainingDeletedDecks = new Set(dirtyState.deletedDeckIds);
  const remainingDeletedCards = new Map(
    dirtyState.deletedCards.map((c) => [c.id, c])
  );
  const knownDecks = new Set(dirtyState.knownCloudDeckIds);
  const knownCards = new Set(dirtyState.knownCloudCardIds);

  let syncedCount = 0;
  let hadError = false;

  // 1. Process deck deletions first
  for (const deckId of dirtyState.deletedDeckIds) {
    try {
      await adapter.deleteDeck(deckId);
      remainingDeletedDecks.delete(deckId);
      knownDecks.delete(deckId);
      syncedCount++;
    } catch {
      hadError = true;
    }
  }

  // 2. Process card deletions (skip cards whose parent deck was just deleted)
  for (const ref of dirtyState.deletedCards) {
    if (
      dirtyState.deletedDeckIds.includes(ref.deckId) &&
      !remainingDeletedDecks.has(ref.deckId)
    ) {
      remainingDeletedCards.delete(ref.id);
      knownCards.delete(ref.id);
      continue;
    }
    try {
      await adapter.deleteCard(ref.deckId, ref.id);
      remainingDeletedCards.delete(ref.id);
      knownCards.delete(ref.id);
      syncedCount++;
    } catch {
      hadError = true;
    }
  }

  // Promote any deck that has a dirty card but is not yet confirmed on cloud
  for (const cardId of remainingDirtyCards) {
    const card = cardMap.get(cardId);
    if (
      card &&
      !knownDecks.has(card.deckId) &&
      !remainingDeletedDecks.has(card.deckId) &&
      deckMap.has(card.deckId)
    ) {
      remainingDirtyDecks.add(card.deckId);
    }
  }

  // 3. Save dirty decks along with all their cards
  for (const deckId of Array.from(remainingDirtyDecks)) {
    const deck = deckMap.get(deckId);
    if (!deck) {
      remainingDirtyDecks.delete(deckId);
      continue;
    }
    const deckCards = sortCardsSequentially(
      localCards.filter((c) => c.deckId === deckId),
      [deck]
    );
    try {
      await adapter.saveDeck(deck, deckCards);
      remainingDirtyDecks.delete(deckId);
      knownDecks.add(deckId);
      deckCards.forEach((c) => {
        remainingDirtyCards.delete(c.id);
        knownCards.add(c.id);
      });
      syncedCount++;
    } catch {
      hadError = true;
    }
  }

  // 4. Save remaining dirty cards (whose parent deck is already confirmed on cloud)
  for (const cardId of Array.from(remainingDirtyCards)) {
    const card = cardMap.get(cardId);
    if (!card) {
      remainingDirtyCards.delete(cardId);
      continue;
    }
    try {
      await adapter.saveCard(card.deckId, card);
      remainingDirtyCards.delete(cardId);
      knownCards.add(cardId);
      syncedCount++;
    } catch {
      hadError = true;
    }
  }

  const nextDirtyState: SyncDirtyState = {
    dirtyDeckIds: Array.from(remainingDirtyDecks),
    dirtyCardIds: Array.from(remainingDirtyCards),
    deletedDeckIds: Array.from(remainingDeletedDecks),
    deletedCards: Array.from(remainingDeletedCards.values()),
    knownCloudDeckIds: Array.from(knownDecks),
    knownCloudCardIds: Array.from(knownCards),
  };

  return { nextDirtyState, syncedCount, hadError };
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix: string): string {
  const cleaned = (rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

export function buildDeckFirestorePayload(
  userId: string,
  deck: Deck
): Record<string, unknown> {
  const safeId = sanitizeFirestoreId(deck.id, 'deck');
  const nowIso = new Date().toISOString();
  return {
    id: safeId,
    userId,
    title: (deck.title || 'Vocabulary Deck').trim().slice(0, 120) || 'Vocabulary Deck',
    language: (deck.language || 'Language').trim().slice(0, 50) || 'Language',
    languageCode: (deck.languageCode || 'es-ES').trim().slice(0, 20) || 'es-ES',
    color: (deck.color || 'blue').trim().slice(0, 30) || 'blue',
    description: (deck.description || '').slice(0, 500),
    icon: (deck.icon || 'Sparkles').slice(0, 50),
    createdAt: (deck.createdAt || nowIso).slice(0, 40),
    updatedAt: (deck.updatedAt || nowIso).slice(0, 40),
  };
}

export function buildCardFirestorePayload(
  userId: string,
  deckId: string,
  card: Flashcard,
  fallbackOrderIndex?: number,
  fallbackLanguage?: string
): Record<string, unknown> {
  const safeDeckId = sanitizeFirestoreId(deckId, 'deck');
  const safeCardId = sanitizeFirestoreId(card.id, 'card');
  const nowIso = new Date().toISOString();
  const validStates = new Set(['new', 'learning', 'review', 'mastered']);
  const safeState = validStates.has(card.state) ? card.state : 'new';

  const payload: Record<string, unknown> = {
    id: safeCardId,
    deckId: safeDeckId,
    userId,
    english: (card.english || '').slice(0, 500),
    targetWord: (card.targetWord || '').slice(0, 500),
    language: (card.language || fallbackLanguage || 'Language').slice(0, 50),
    phonetic: (card.phonetic || '').slice(0, 200),
    partOfSpeech: (card.partOfSpeech || 'phrase').slice(0, 50),
    category: (card.category || 'General').slice(0, 100),
    notes: (card.notes || '').slice(0, 1000),
    state: safeState,
    repetitions: Math.max(0, Number.isFinite(card.repetitions) ? card.repetitions : 0),
    intervalDays: Math.max(0, Number.isFinite(card.intervalDays) ? card.intervalDays : 0),
    easeFactor: Math.max(1.3, Number.isFinite(card.easeFactor) ? card.easeFactor : 2.5),
    dueDate: (card.dueDate || nowIso).slice(0, 40),
    createdAt: (card.createdAt || nowIso).slice(0, 40),
    updatedAt: (card.updatedAt || nowIso).slice(0, 40),
  };

  const resolvedOrder =
    typeof card.orderIndex === 'number' && Number.isFinite(card.orderIndex)
      ? Math.max(0, Math.floor(card.orderIndex))
      : typeof fallbackOrderIndex === 'number' && Number.isFinite(fallbackOrderIndex)
      ? Math.max(0, Math.floor(fallbackOrderIndex))
      : undefined;

  if (resolvedOrder !== undefined) {
    payload.orderIndex = resolvedOrder;
  }

  if (typeof card.lastReviewedAt === 'string' && card.lastReviewedAt.length > 0) {
    payload.lastReviewedAt = card.lastReviewedAt.slice(0, 40);
  }

  if (
    card.exampleSentence &&
    typeof card.exampleSentence === 'object' &&
    typeof card.exampleSentence.target === 'string' &&
    card.exampleSentence.target.trim().length > 0
  ) {
    payload.exampleSentence = {
      target: card.exampleSentence.target.slice(0, 500),
      english: (card.exampleSentence.english || '').slice(0, 500),
    };
  }

  return payload;
}


