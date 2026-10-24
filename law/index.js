// penpals-law: the law of Living Ink and everything that reads or signs by it.
//   v1        the frozen law of flow (acts, paper, rules, look, digests) and the hand measure (no longer a key opener)
//   v2        depth-water-gall: dents, ink in depth, the water brush, oak gall, fading, soak and tears
//   laws      the laws by number: a record grows, looks and verifies under the law it carries
//   keys      the account key (made from the signatures), its words, and every message it signs
//   record    sealed records: making, checking, verifying, regrowing
//   verify    .book and proof verification (server, BookViewer, CLI)
//   unlock    the password backup: OPRF + argon2id + the keyring
export * as v1 from './v1/index.js';
export * as v2 from './v2/index.js';
export * as laws from './laws.js';
export * as keys from './keys.js';
export * as record from './record.js';
export * as verify from './verify.js';
export * as unlock from './unlock.js';
export { T, jcs, b64url, fromB64url, hex, fromHex, concat } from './tags.js';
export const LAW = Object.freeze({ current: 2, accept: Object.freeze([1, 2]) });
