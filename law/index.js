// penpals-law: the law of Living Ink and everything that reads or signs by it.
//   v1        the frozen law of flow (acts, paper, rules, look, digests) and the hand measure
//   keys      the key and every message it signs
//   record    sealed records: making, checking, verifying, regrowing
//   verify    .book and proof verification (server, BookViewer, CLI)
//   fuzzy     BCH fuzzy commitments;  handkey: the hand as a key opener
//   unlock    OPRF + argon2id + the keyring
export * as v1 from './v1/index.js';
export * as keys from './keys.js';
export * as record from './record.js';
export * as verify from './verify.js';
export * as fuzzy from './fuzzy.js';
export * as handkey from './handkey.js';
export * as unlock from './unlock.js';
export { T, jcs, b64url, fromB64url, hex, fromHex, concat } from './tags.js';
export const LAW = Object.freeze({ current: 1, accept: Object.freeze([1]) });
