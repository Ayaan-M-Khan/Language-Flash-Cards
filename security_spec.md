# Security Specification: Lumina Spaced Repetition Cards

## 1. Data Invariants

1. **User Identity Invariant**: A user document at `/users/{userId}` can only be created, read, updated, or deleted by the authenticated user whose `request.auth.uid == userId`.
2. **Deck Ownership Invariant**: A deck at `/users/{userId}/decks/{deckId}` can only exist under the authenticated user's own path, with `request.auth.uid == userId` and `incoming().userId == request.auth.uid`.
3. **Card Relational Invariant**: A flashcard at `/users/{userId}/decks/{deckId}/cards/{cardId}` must belong to the parent deck (`incoming().deckId == deckId`) and the user (`incoming().userId == userId`), with `request.auth.uid == userId`.
4. **No Cross-User Access (Zero-Trust)**: Users cannot read, list, create, edit, or delete another user's profile, decks, or flashcards.
5. **PII and Profile Protection**: User profile reads and writes are strictly restricted to the owning user (`request.auth.uid == userId`).
6. **Immutable Fields**: `id`, `userId`, `deckId`, and `createdAt` cannot be altered or hijacked during updates.
7. **Type and Size Bounds**: All string, number, and enum fields have bounded lengths to prevent Denial-of-Wallet and storage bloat attacks.
8. **Catch-All Default Deny**: Every undefined collection and path is blocked by default (`allow read, write: if false;`).

---

## 2. The "Dirty Dozen" Payloads

1. **Spoofed User UID on Profile Write**: User `attacker_uid` attempts to write to `/users/victim_uid`.
2. **Unauthenticated Deck Read**: Unauthenticated request tries to `get` or `list` `/users/{victimId}/decks`.
3. **Cross-Tenant Deck Injection**: User `attacker_uid` tries to create a deck inside `/users/victim_uid/decks/deck-123`.
4. **Deck Owner Field Hijacking**: User `attacker_uid` attempts to set `userId: victim_uid` inside their own deck.
5. **Oversized String Injection (Denial of Wallet)**: User tries to write a deck with a 50KB title string.
6. **Ghost Field / Shadow Field Injection**: User attempts to add unauthorized admin fields like `{ isAdmin: true }` to their profile or deck.
7. **Immutable Key Mutation on Update**: User creates a deck, then tries to mutate `id` or `userId` in an update payload.
8. **Orphaned Card Creation**: User attempts to create a card at `/users/{userId}/decks/{deckA}/cards/{cardId}` where `deckId` in payload points to `deckB`.
9. **Invalid Card State Value**: User attempts to set card `state` to an illegal enum value like `hacked_mastered`.
10. **Negative/NaN Ease Factor or Repetitions**: User attempts to set negative numbers for `easeFactor` or `repetitions`.
11. **Path Variable ID Injection**: User attempts to inject a path with malicious characters like `/users/uid/decks/../../admin`.
12. **Blanket Query Scraping**: User attempts an open collectionGroup query or unconstrained read across all users' flashcards.

---

## 3. Test Runner Specification

All 12 payloads must return `PERMISSION_DENIED` under Firestore emulator security rules tests.
