// A shared sheet grown off the main thread (rooms.md §6; law/shared.js): its
// stamped acts, in the stamper's order, grown on its owner's paper into the
// scene's field. Every screen grows the same sheet from the same acts.
// In: { id, lines, seed (b64url), family }   Out: { id, field | null, n, facts, seals: [took] } or { id, error }
import { shared as SH, fromB64url, b64url } from 'penpals-law';
import { sceneField } from 'penpals-law/v2/scene';

globalThis.onmessage = ({ data }) => {
  const { id, lines, seed, family } = data;
  try {
    const grown = SH.growShared(lines, { seed: fromB64url(seed, 64), family });
    const field = grown ? sceneField(grown.cells, grown.box) : null;
    const out = { id, field, n: lines.length, facts: grown ? b64url(grown.facts) : null, seals: grown ? grown.seals.map((x) => x.took) : [] };
    globalThis.postMessage(out, field ? [field.surface.buffer, field.above.buffer, field.depth.buffer, field.rgba.buffer, field.flags.buffer] : []);
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message ?? err) });
  }
};
