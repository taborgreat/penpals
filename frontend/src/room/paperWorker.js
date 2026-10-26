// A paper grown off the main thread (law/paper.js growPaper): its stamped acts, in the stamper's order, and
// the drips that landed on it, grown on its owner's paper into the scene's field. Every screen grows the
// same paper from the same acts.
// Its ink as it looks at its age (oak gall darkens in the air: the law's view, by the hour).
// In: { id, lines, drips (law/wax.js dripsOn), burns (law/fire.js burntOn), seed (b64url), family, law (it was born
// under), ageH }   Out: { id, field | null, n, facts, seals: [took] } or { id, error }
import { paper as P, fromB64url, b64url } from 'penpals-law';
import { viewBuckets } from 'penpals-law/laws';
import { sceneField } from 'penpals-law/v2/scene';

globalThis.onmessage = ({ data }) => {
  const { id, lines, drips = [], burns = [], seed, family, law, ageH = 0 } = data;
  try {
    const grown = P.growPaper(lines, { seed: fromB64url(seed, 64), family, law, drips, burns });
    const field = grown ? sceneField(grown.cells, grown.box, viewBuckets(law, { ageH })) : null;
    const out = { id, field, n: lines.length, facts: grown ? b64url(grown.facts) : null, seals: grown ? grown.seals.map((x) => x.took) : [] };
    globalThis.postMessage(out, field ? [field.surface.buffer, field.above.buffer, field.depth.buffer, field.rgba.buffer, field.abs.buffer, field.flags.buffer] : []);
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message ?? err) });
  }
};
