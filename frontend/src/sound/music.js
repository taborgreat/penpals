// The music of matter (world.md Phase 3c): matter meeting matter (a candle's crackle, rain on the
// glass, wind, thunder, a drip) is placed on the world's pulse and tuned to the space's key; a
// being's act (a pen, a step, a chirp) is heard as it happened. Nothing plays that did not happen:
// its events are only placed and tuned.
//   The pulse  bars of the world's clock, BAR of its ticks (its whole seconds) each: the same bars for
//              everyone, wherever they are.
//   Tuplets    each source its own grouping of the bar, from how often it sounds: as many leaves as it
//              has events in a bar, near enough, in a count the whole numbers up to LIMIT make (the
//              bar split into groups, each into its own count, down to the leaves): a dense source a
//              dense grouping, a sparse one a slow one. Each event lands on its nearest leaf, and all
//              the groupings meet again on the bar.
//   Ratios     the same whole numbers make the intervals: a sound keeps its own spread (glass rings,
//              wood knocks) and is pulled, as a whole, to the nearest pitch p / q (p, q at most LIMIT)
//              above the root, in any octave; the root is grown from the space's key (where in the
//              octave its hash falls), so each space has its own key. A 3:2 rhythm sped past twenty
//              a second is a fifth.
//   grouping(rate) → { n, tree }   rootOf(key) → Hz   pitchOf(e) → Hz   place(e, key) → e placed and tuned
//   (an event: { world (s on the world's clock: when it happened), t (s on the ear's), rate (its
//   source's events a second), matter: true, bands, ring?, keepTime? (tuned only) })
import { BANDS } from './bands.js';

export const BAR = 4; // the world's ticks (seconds) in a bar (Tabor's to set)
export const LIMIT = 6; // the largest whole number in a ratio or a grouping (Tabor's to set)

// the intervals: every p / q within an octave, p and q at most LIMIT
export const RATIOS = (() => {
  const out = new Map();
  for (let p = 1; p <= LIMIT; p++) for (let q = 1; q <= LIMIT; q++) if (p >= q && p < 2 * q) out.set(p / q, [p, q]);
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
})();
const LOGS = RATIOS.map(([r]) => Math.log2(r));

// The counts a bar is split into: whole numbers made of factors at most LIMIT (a tree: the bar into
// its first factor's groups, each into the next's, ...).
const smooth = (n) => {
  for (let f = LIMIT; f >= 2; f--) while (n % f === 0) n /= f;
  return n === 1;
};
const treeOf = (n) => {
  const tree = [];
  for (let f = LIMIT; f >= 2 && n > 1; f--)
    while (n % f === 0) {
      tree.push(f);
      n /= f;
    }
  return tree;
};
export function grouping(rate) {
  const want = Math.max(1, rate * BAR); // its events in a bar
  let best = 1;
  for (let n = 1; n <= 2 * want + 1; n++) if (smooth(n) && Math.abs(Math.log(n / want)) < Math.abs(Math.log(best / want))) best = n;
  return { n: best, tree: treeOf(best) };
}

// The space's root: where in the octave its key's hash falls (any octave: only the pitch class counts).
export function rootOf(key) {
  let h = 0x811c9dc5; // (FNV-1a over the key)
  for (const c of String(key)) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
  return 2 ** (h / 2 ** 32);
}

// A sound's pitch: the ring it carries, or where its spread is centred.
export function pitchOf(e) {
  if (e.ring) return e.ring.f;
  let w = 0,
    s = 0;
  e.bands.forEach((x, b) => {
    w += x * Math.log2(BANDS[b]);
    s += x;
  });
  return s > 0 ? 2 ** (w / s) : BANDS[0];
}
// The nearest pitch in the space's ratios to f (any octave).
export function tuned(f, root) {
  const x = Math.log2(f / root);
  const oct = Math.floor(x);
  let best = 0,
    d = Infinity;
  for (const l of [...LOGS, 1]) {
    const dd = Math.abs(x - oct - l);
    if (dd < d) {
      d = dd;
      best = l;
    }
  }
  return root * 2 ** (oct + best);
}

export function place(e, key) {
  if (!e.matter) return e; // (a being's act: as it happened)
  if (e.keepTime) {
    const f = pitchOf(e);
    return { ...e, tune: tuned(f, rootOf(key)) / f }; // (tuned, never moved: thunder's time is its distance)
  }
  const { n } = grouping(e.rate ?? 1 / BAR);
  const leaf = BAR / n;
  const bar = Math.floor(e.world / BAR) * BAR;
  const at = bar + Math.round((e.world - bar) / leaf) * leaf;
  const f = pitchOf(e);
  return { ...e, t: e.t + (at - e.world), world: at, tune: tuned(f, rootOf(key)) / f };
}
