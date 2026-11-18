import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyDirtyState,
  markCardDeletedInState,
  markCardDirtyInState,
  markDeckDeletedInState,
  markDeckDirtyInState,
  mergeGuestIntoAccountState,
  mergeLocalAndCloudState,
  executeDirtyFlush,
  buildDeckFirestorePayload,
  buildCardFirestorePayload,
  sanitizeFirestoreId,
} from './sync-merge';
import type { Deck, Flashcard } from './types';

function makeDeck(id: string, overrides: Partial<Deck> = {}): Deck {
  return {
    id,
    title: `Deck ${id}`,
    language: 'Spanish',
    languageCode: 'es-ES',
    color: 'blue',
    description: 'Test deck',
    icon: 'Sparkles',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCard(id: string, deckId: string, overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id,
    deckId,
    english: `Word ${id}`,
    targetWord: `Palabra ${id}`,
    language: 'Spanish',
    state: 'new',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('mergeLocalAndCloudState NEVER wipes local decks/cards when cloud returns empty snapshot', () => {
  const localDeck = makeDeck('deck-custom-1');
  const localCard = makeCard('card-1', 'deck-custom-1', {
    intervalDays: 7,
    lastReviewedAt: '2026-05-01T12:00:00.000Z',
  });

  const result = mergeLocalAndCloudState({
    localDecks: [localDeck],
    localCards: [localCard],
    cloudDecks: [],
    cloudCards: [],
    dirtyState: {
      ...createEmptyDirtyState(),
      knownCloudDeckIds: ['deck-custom-1'],
      knownCloudCardIds: ['card-1'],
    },
    isAuthoritativeCloudSnapshot: true,
  });

  assert.equal(result.decks.length, 1);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].intervalDays, 7);
  assert.ok(result.nextDirtyState.dirtyDeckIds.includes('deck-custom-1'));
  assert.ok(result.nextDirtyState.dirtyCardIds.includes('card-1'));
});

test('mergeLocalAndCloudState preserves dirty card edits & 7-day schedule over older cloud snapshot', () => {
  const deck = makeDeck('deck-spanish-core');
  const cloudCard = makeCard('card-1', 'deck-spanish-core', {
    english: 'Old meaning',
    intervalDays: 0,
    updatedAt: '2026-05-01T10:00:00.000Z',
  });
  const localEditedCard = makeCard('card-1', 'deck-spanish-core', {
    english: 'Updated meaning',
    intervalDays: 7,
    state: 'review',
    repetitions: 2,
    updatedAt: '2026-05-01T10:05:00.000Z',
  });

  let dirtyState = createEmptyDirtyState();
  dirtyState = markCardDirtyInState(dirtyState, 'card-1');

  const result = mergeLocalAndCloudState({
    localDecks: [deck],
    localCards: [localEditedCard],
    cloudDecks: [deck],
    cloudCards: [cloudCard],
    dirtyState,
    isAuthoritativeCloudSnapshot: true,
  });

  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].english, 'Updated meaning');
  assert.equal(result.cards[0].intervalDays, 7);
  assert.ok(result.nextDirtyState.dirtyCardIds.includes('card-1'));
});

test('mergeLocalAndCloudState respects local delete tombstones and drops remotely deleted known items', () => {
  const deckA = makeDeck('deck-a');
  const deckB = makeDeck('deck-b');
  const deckC = makeDeck('deck-c');
  const cardA1 = makeCard('card-a1', 'deck-a');
  const cardB1 = makeCard('card-b1', 'deck-b');

  // deckA was deleted locally (tombstone), deckB was deleted remotely on another device
  let dirtyState = {
    ...createEmptyDirtyState(),
    knownCloudDeckIds: ['deck-a', 'deck-b', 'deck-c'],
    knownCloudCardIds: ['card-a1', 'card-b1'],
  };
  dirtyState = markDeckDeletedInState(dirtyState, 'deck-a', ['card-a1']);

  const result = mergeLocalAndCloudState({
    localDecks: [deckB, deckC],
    localCards: [cardB1],
    cloudDecks: [deckA, deckC], // deckA still in cloud before tombstone flushes; deckB deleted in cloud
    cloudCards: [cardA1],
    dirtyState,
    isAuthoritativeCloudSnapshot: true,
  });

  assert.deepEqual(
    result.decks.map((d) => d.id),
    ['deck-c']
  );
  assert.ok(result.nextDirtyState.deletedDeckIds.includes('deck-a'));
});

test('mergeLocalAndCloudState blocks resurrecting a locally deleted card while deletion is pending', () => {
  const deck = makeDeck('deck-a');
  const card1 = makeCard('card-1', 'deck-a');
  const card2 = makeCard('card-2', 'deck-a');

  const dirtyState = markCardDeletedInState(createEmptyDirtyState(), 'card-1', 'deck-a');

  const result = mergeLocalAndCloudState({
    localDecks: [deck],
    localCards: [card2],
    cloudDecks: [deck],
    cloudCards: [card1, card2],
    dirtyState,
    isAuthoritativeCloudSnapshot: true,
  });

  assert.deepEqual(
    result.cards.map((c) => c.id),
    ['card-2']
  );
  assert.equal(result.nextDirtyState.deletedCards.length, 1);
  assert.equal(result.nextDirtyState.deletedCards[0].id, 'card-1');
});

test('mergeGuestIntoAccountState merges custom decks, imported cards, and starter card progress on Google sign-in', () => {
  const starterIds = new Set(['deck-spanish-core']);
  const accountStarter = makeDeck('deck-spanish-core');
  const accountCard = makeCard('card-es-1', 'deck-spanish-core', {
    repetitions: 0,
    intervalDays: 0,
    updatedAt: '2026-05-01T08:00:00.000Z',
  });

  const guestCustomDeck = makeDeck('deck-ai-999', { title: 'My Arabic List' });
  const guestCustomCard = makeCard('card-999-00001', 'deck-ai-999');
  const guestReviewedStarterCard = makeCard('card-es-1', 'deck-spanish-core', {
    repetitions: 2,
    intervalDays: 7,
    state: 'review',
    lastReviewedAt: '2026-05-01T11:00:00.000Z',
    updatedAt: '2026-05-01T11:00:00.000Z',
  });
  const guestManualAddedCard = makeCard('card-manual-55', 'deck-spanish-core');

  const merged = mergeGuestIntoAccountState({
    guestDecks: [accountStarter, guestCustomDeck],
    guestCards: [guestReviewedStarterCard, guestManualAddedCard, guestCustomCard],
    accountDecks: [accountStarter],
    accountCards: [accountCard],
    starterDeckIds: starterIds,
    dirtyState: createEmptyDirtyState(),
  });

  assert.equal(merged.decks.length, 2);
  assert.ok(merged.decks.some((d) => d.id === 'deck-ai-999'));
  assert.equal(merged.cards.length, 3);
  const syncedStarterCard = merged.cards.find((c) => c.id === 'card-es-1');
  assert.equal(syncedStarterCard?.intervalDays, 7);
  assert.ok(merged.nextDirtyState.dirtyDeckIds.includes('deck-ai-999'));
  assert.ok(merged.nextDirtyState.dirtyCardIds.includes('card-es-1'));
  assert.ok(merged.nextDirtyState.dirtyCardIds.includes('card-manual-55'));
  assert.ok(merged.nextDirtyState.dirtyCardIds.includes('card-999-00001'));
});

test('markDeckDirtyInState clears delete tombstone if same deck ID is re-added', () => {
  let state = createEmptyDirtyState();
  state = markDeckDeletedInState(state, 'deck-x', ['c1']);
  state = markDeckDirtyInState(state, 'deck-x');
  assert.ok(state.dirtyDeckIds.includes('deck-x'));
  assert.equal(state.deletedDeckIds.includes('deck-x'), false);
});

test('executeDirtyFlush promotes parent deck upload when dirty card belongs to unconfirmed cloud deck', async () => {
  const newDeck = makeDeck('deck-new');
  const card = makeCard('card-1', 'deck-new', { english: 'Book' });

  let dirtyState = createEmptyDirtyState();
  dirtyState = markCardDirtyInState(dirtyState, 'card-1');

  const savedDecks: string[] = [];
  const savedCards: string[] = [];

  const res = await executeDirtyFlush([newDeck], [card], dirtyState, {
    deleteDeck: async () => {},
    deleteCard: async () => {},
    saveDeck: async (deck, cards) => {
      savedDecks.push(deck.id);
      assert.equal(cards.length, 1);
    },
    saveCard: async (_deckId, c) => {
      savedCards.push(c.id);
    },
  });

  assert.equal(res.hadError, false);
  assert.deepEqual(savedDecks, ['deck-new']);
  assert.deepEqual(savedCards, []);
  assert.deepEqual(res.nextDirtyState.dirtyDeckIds, []);
  assert.deepEqual(res.nextDirtyState.dirtyCardIds, []);
  assert.ok(res.nextDirtyState.knownCloudDeckIds.includes('deck-new'));
  assert.ok(res.nextDirtyState.knownCloudCardIds.includes('card-1'));
});

test('executeDirtyFlush retains failed items for automatic retry on next sync tick', async () => {
  const deck = makeDeck('deck-1');
  const card = makeCard('card-1', 'deck-1', { intervalDays: 7 });

  let dirtyState = {
    ...createEmptyDirtyState(),
    knownCloudDeckIds: ['deck-1'],
    knownCloudCardIds: ['card-1'],
  };
  dirtyState = markCardDirtyInState(dirtyState, 'card-1');

  let shouldFail = true;
  const firstTick = await executeDirtyFlush([deck], [card], dirtyState, {
    deleteDeck: async () => {},
    deleteCard: async () => {},
    saveDeck: async () => {},
    saveCard: async () => {
      if (shouldFail) throw new Error('offline');
    },
  });

  assert.equal(firstTick.hadError, true);
  assert.ok(firstTick.nextDirtyState.dirtyCardIds.includes('card-1'));

  shouldFail = false;
  const secondTick = await executeDirtyFlush([deck], [card], firstTick.nextDirtyState, {
    deleteDeck: async () => {},
    deleteCard: async () => {},
    saveDeck: async () => {},
    saveCard: async () => {},
  });

  assert.equal(secondTick.hadError, false);
  assert.equal(secondTick.syncedCount, 1);
  assert.deepEqual(secondTick.nextDirtyState.dirtyCardIds, []);
});

test('buildDeckFirestorePayload & buildCardFirestorePayload satisfy firestore.rules bounds with zero undefined keys', () => {
  const deck = makeDeck('deck/invalid chars!@#', {
    title: '  My Travel Deck  ',
    description: 'A'.repeat(600),
  });
  const card = makeCard('card/1', deck.id, {
    easeFactor: 0.5,
    repetitions: -3,
    intervalDays: -1,
    lastReviewedAt: undefined,
    exampleSentence: { target: 'Hola', english: '' },
  });

  const safeDeckId = sanitizeFirestoreId(deck.id, 'deck');
  const deckPayload = buildDeckFirestorePayload('user-123', deck);
  const cardPayload = buildCardFirestorePayload('user-123', safeDeckId, card, 0);

  const allowedDeckKeys = new Set([
    'id', 'userId', 'title', 'language', 'languageCode',
    'color', 'description', 'icon', 'createdAt', 'updatedAt',
  ]);
  const allowedCardKeys = new Set([
    'id', 'deckId', 'userId', 'orderIndex', 'english', 'targetWord',
    'language', 'phonetic', 'partOfSpeech', 'category', 'notes',
    'state', 'repetitions', 'intervalDays', 'easeFactor', 'dueDate',
    'lastReviewedAt', 'exampleSentence', 'createdAt', 'updatedAt',
  ]);

  assert.match(safeDeckId, /^[a-zA-Z0-9_-]+$/);
  for (const [k, v] of Object.entries(deckPayload)) {
    assert.ok(allowedDeckKeys.has(k), `Unexpected deck key: ${k}`);
    assert.notEqual(v, undefined);
  }
  assert.equal((deckPayload.description as string).length, 500);

  for (const [k, v] of Object.entries(cardPayload)) {
    assert.ok(allowedCardKeys.has(k), `Unexpected card key: ${k}`);
    assert.notEqual(v, undefined);
  }
  assert.ok((cardPayload.easeFactor as number) >= 1.3);
  assert.equal(cardPayload.repetitions, 0);
  assert.equal(cardPayload.intervalDays, 0);
  assert.equal('lastReviewedAt' in cardPayload, false);
});

