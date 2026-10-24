import { keys as K, fromB64url, hex } from 'penpals-law';
import { httpError } from './files.js';
import { config } from './config.js';

// Shared services the routes use: the render pool, and the one place every
// sealed upload is checked against the law.

let pool = null;
export const setPool = (p) => { pool = p; };
export const getPool = () => pool;

// Grow acts on the paper of `seed` (the job only ever sees the paperKey).
export function settleOnServer({ acts, seed, family, scale = 64, png = false, priority = 'view', key, timeout }) {
  return pool.run({ acts, paperKey: K.paperKeyOf(seed), family, scale, png }, { key, priority, timeout: timeout ?? config.render.timeoutMs.book });
}

// A closed sheet's film (law/v1/film.js), deflated: made by the pool, kept on disk.
export function filmOnServer({ acts, seed, family, box, key }) {
  return pool.run({ film: true, acts, paperKey: K.paperKeyOf(seed), family, box }, { key, priority: 'view', timeout: config.render.timeoutMs.letter });
}

// The writer's device grew the ink and sealed what settled; the server grows it
// again and must get exactly the same facts and box. A mismatch means the law
// is not deterministic somewhere: it is refused and logged loudly.
export async function confirmFacts(body, seed, { timeout, png = true, ua = '' } = {}) {
  const acts = fromB64url(body.acts);
  const out = await settleOnServer({
    acts, seed, family: body.paper, scale: 64, png, priority: 'upload', timeout,
    key: `facts:${body.key}:${body.sheet}:${body.facts}`,
  });
  if (out.facts !== hex(fromB64url(body.facts)) || JSON.stringify(out.box) !== JSON.stringify(body.box)) {
    console.error(`[law] FACTS MISMATCH law ${body.law} sheet ${body.sheet}: sealed ${hex(fromB64url(body.facts)).slice(0, 16)} box ${body.box} vs server ${out.facts.slice(0, 16)} box ${out.box}; client ${ua}`);
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
