import { keys as K, laws as Laws, record as R, fromB64url, hex } from 'penpals-law';
import { httpError } from './files.js';
import { config } from './config.js';

// Shared services the routes use: the render pool, and the one place every
// sealed upload is checked against the law.

let pool = null;
export const setPool = (p) => {
  pool = p;
};
export const getPool = () => pool;

// Grow acts under `law` on the paper of `seed` (the job only ever sees the
// paperKey). `view` is the look's moment ({ ageH, views } buckets); `mode`
// 'side' (with `cut`) or 'scene' asks for those instead; `lod` the look at a
// level of detail (each pixel 2^lod cells a side: sight.js).
export function settleOnServer({ law, acts, seed, family, scale = 64, png = false, lod = 0, view, mode, cut, priority = 'view', key, timeout }) {
  return pool.run({ law, acts, paperKey: K.paperKeyOf(seed), family, scale, png, lod, view, mode, cut }, { key, priority, timeout: timeout ?? config.render.timeoutMs.book });
}

// The moment a record's look is drawn at: how long it has aged and how often it
// has been seen, in the buckets looks are cached under (law 1: one). Light is
// the clock for aging (rooms.md §1b): litH, the hours the space it lay in was
// lit (store/rooms.js litHours), not the calendar's. Whether its look can age at
// all (oak gall) is read from its acts once.
const agesCache = new Map();
export function viewOf(body, litH, views) {
  if (body.law < 2) return { ageH: 0, views: 0 };
  const id = `${body.key}:${body.sheet}:${body.facts}`; // a record, by what names it (never its acts: they can be large)
  let ages = agesCache.get(id);
  if (ages === undefined) {
    const L = Laws.lawOf(body.law);
    ages = L.ages(L.decodeCanonical(fromB64url(body.acts)));
    if (agesCache.size > 5000) agesCache.clear();
    agesCache.set(id, ages);
  }
  return Laws.viewBuckets(body.law, { ageH: Number.isFinite(litH) ? Math.max(0, litH) : 0, views, ages });
}

// The writer's device grew the ink and sealed what settled; the server grows it
// again and must get exactly the same facts and box. A mismatch means the law
// is not deterministic somewhere: it is refused and logged loudly.
export async function confirmFacts(body, seed, { timeout, png = true, ua = '' } = {}) {
  const acts = fromB64url(body.acts);
  const out = await settleOnServer({
    law: body.law,
    acts,
    seed,
    family: R.familyOf(body),
    scale: 64,
    png,
    priority: 'upload',
    timeout,
    key: `facts:${body.key}:${body.sheet}:${body.facts}`,
  });
  if (out.facts !== hex(fromB64url(body.facts)) || JSON.stringify(out.box) !== JSON.stringify(body.box)) {
    console.error(
      `[law] FACTS MISMATCH law ${body.law} sheet ${body.sheet}: sealed ${hex(fromB64url(body.facts)).slice(0, 16)} box ${body.box} vs server ${out.facts.slice(0, 16)} box ${out.box}; client ${ua}`,
    );
    throw httpError(422, 'facts_mismatch', 'Your device and the server settled this ink differently, so it was not saved. Please report this.');
  }
  return out;
}

// base64url field of an exact length, or a 400 naming the field.
export function decodeField(value, length, what) {
  try {
    return fromB64url(value, length);
  } catch {
    throw httpError(400, `bad_${what}`, `Bad ${what}.`);
  }
}
