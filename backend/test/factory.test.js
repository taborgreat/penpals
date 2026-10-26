// The factory-shape check (one-matter.md Phase 8): every path that changes the world names its act
// and its rule. A path with neither is wrong. This lists every route that writes; a new one fails
// here until it says what act it is and what rule it follows (or that it is not the world).
import test from 'node:test';
import assert from 'node:assert/strict';
import { authRouter } from '../src/routes/auth.js';
import { booksRouter } from '../src/routes/books.js';
import { proofsRouter } from '../src/routes/proofs.js';
import { roomsRouter } from '../src/routes/rooms.js';
import { papersRouter } from '../src/routes/papers.js';
import { socialRouter } from '../src/routes/social.js';
import { usersRouter } from '../src/routes/users.js';
import { worldRouter } from '../src/routes/world.js';
import { outsideRouter } from '../src/routes/outside.js';
import { signaturesRouter } from '../src/routes/signatures.js';
import { lawRouter } from '../src/routes/law.js';

// what changes the world: its act (signed by the hand that made it) and the rule that grows it
const WORLD = {
  'PUT /api/books/me/signature': ['the name written: its acts, sealed', 'the ink law; the signature on sheet 0 (law/record.js)'],
  'POST /api/rooms/:name/motion': ["a being's move", 'law/beings.js: the neck law, at most so many a second'],
  'POST /api/rooms/:name/act': ['an act on a thing in the room: light, out, pick up, tilt, set down', 'law/room.js: the candle law (law/candle.js), possession'],
  'POST /api/papers': ["a paper born, its maker's, on their own table", 'law/paper.js: the paper family, its seal (law/record.js)'],
  'POST /api/papers/:paper/acts': [
    'acts on a paper, sealed by each being: strokes, lifts, seals pressed and broken; taken up, put down anywhere, posted into a mailbox, saved into a book',
    'the ink law; the seal press (law/v2/sim.js); who may mark it, where it rests (law/paper.js); the mailbox oldest first (store/papers.js)',
  ],
  'POST /api/world/acts': ['a house placed or moved', 'law/world.js: the next free plot, in chain order'],
  'POST /api/outside/acts': [
    "a being's hands on the outside: a stone taken or put, a branch broken, a stick or a tree carved; gathered, twisted, struck, bound, swung, rubbed, formed, fired, picked, crushed, mixed, melted, poured, dipped",
    'law/hands.js, law/making.js: the wood breaks past its strength, the harder takes the softer, the heat rule, the matter rows; possession',
  ],
};
// owed: paths that change the world without an act and a rule of the law yet, and what they wait for
const OWED = {
  'POST /api/proofs': 'a live proof: kept or removed is in the rulings (one-world.md)',
  'POST /api/proofs/:id/answer': 'a live proof answered (ink, sealed): kept or removed is in the rulings',
};
// not the world: the key's bookkeeping (who is signed in where), and an account's setting
const NOT_WORLD = [
  'POST /api/auth/challenge',
  'POST /api/auth/register/begin',
  'POST /api/auth/register/finish',
  'POST /api/auth/begin',
  'POST /api/auth/unlock',
  'POST /api/auth/login',
  'POST /api/auth/keyring/oprf',
  'PUT /api/auth/keyring',
  'POST /api/auth/logout',
  'POST /api/auth/logout-all',
  'POST /api/social/private',
];

const MOUNTS = [
  ['/api/auth', authRouter],
  ['/api/books', booksRouter],
  ['/api/proofs', proofsRouter],
  ['/api/rooms', roomsRouter],
  ['/api/papers', papersRouter],
  ['/api/social', socialRouter],
  ['/api/users', usersRouter],
  ['/api/world', worldRouter],
  ['/api/outside', outsideRouter],
  ['/api/signatures', signaturesRouter],
  ['/api/law', lawRouter],
];

test('factory shape: every path that writes names its act and its rule, is owed one, or is not the world', () => {
  const writes = [];
  for (const [base, router] of MOUNTS)
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (method === 'get' || method === 'head') continue;
        writes.push(`${method.toUpperCase()} ${base}${layer.route.path === '/' ? '' : layer.route.path}`);
      }
    }
  const known = new Set([...Object.keys(WORLD), ...Object.keys(OWED), ...NOT_WORLD]);
  const unnamed = writes.filter((w) => !known.has(w));
  assert.deepEqual(unnamed, [], 'paths that write with no act and no rule');
  const gone = [...known].filter((k) => !writes.includes(k));
  assert.deepEqual(gone, [], 'named here but no longer served (take them off the list)');
  for (const [path, [act, rule]] of Object.entries(WORLD)) assert.ok(act && rule, path);
});
