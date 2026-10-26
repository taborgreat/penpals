// Book ink (keys.md): a signature is a sealed record in the book's chain,
// { id, made, ink: { acts, box, paper, sheet, … }, seal, open }. What shows is
// its look: the settled ink the law grows on its paper, a PNG one pixel per
// cell, from the server (or grown here: it is open). These helpers read its
// strokes for the reveal, and a chain's lines.
import { decodeActs } from 'penpals-law/v2/acts'; // reads every law's acts (law 2's adds the pen's spatter)
import { fromB64url } from 'penpals-law';
import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';

export const CELLS = CELLS_PER_UNIT; // law cells per page unit (the law's own)
export const SCALE_ONE = 64; // item scales are integers, 64 = as written

const paths = new WeakMap();

// The record's strokes as polylines in its box (cells, as written), with their
// times and nib widths: what the reveal draws along. Cached per record.
export function pathsOf(body) {
  let out = paths.get(body);
  if (out) return out;
  const rec = decodeActs(fromB64url(body.acts));
  const [bx, by] = body.box;
  let duration = 0;
  let size = 20;
  const strokes = rec.strokes.map((s) => {
    for (const p of s.pens) if (p.size) size = Math.max(size, p.size + (p.flex ?? 0));
    const pts = Array.from(s.x, (x, i) => {
      const t = s.t[i];
      if (t > duration) duration = t;
      return [2 * rec.orgX + x / 5 - bx, 2 * rec.orgY + s.y[i] / 5 - by, t];
    });
    return pts;
  });
  out = { strokes, duration, width: (size / 10) * CELLS + 6 }; // the nib's widest, in cells, and room for the spread
  paths.set(body, out);
  return out;
}

// Parse JSON lines (a chain, or a .book after its first line), skipping an
// unfinished last line.
export function parseLines(text) {
  const end = text.lastIndexOf('\n');
  const body = end < 0 ? '' : text.slice(0, end);
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* a damaged line is skipped */
    }
  }
  return out;
}
