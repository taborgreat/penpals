// The pad's nib settings as a law pen (law/v1 PNKA pen acts). Page pixels are
// ink units, so a size in px is that many units (tenths in the pen act).
//   pen   round nib: size
//   flex  hairline when light, up to maxWidth when pressed (pressure pens drive it)
//   broad an edge of `size` held at `angle`
import { PRESS_SHAPE } from 'penpals-law/v1/tables';
import { OAK_GALL, WATER } from 'penpals-law/v2/constants';
import { BROAD_SIZES, FLEX_PRESETS, PEN_SIZES } from './nibs.js';

export const FLOW_DEFAULT = 7; // 0..15: how freely the nib gives ink
// 0..15: how readily the pen throws ink (law 2 splatter); a flex nib throws more (defaults, Tabor's to rule)
export const SPATTER_DEFAULT = { pen: 1, flex: 3, broad: 1 };

const tenths = (px, lo = 5, hi = 400) => Math.min(hi, Math.max(lo, Math.round(px * 10)));

export function rgbOf(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [26, 26, 26];
}

// settings: { nib: 'pen' | 'flex' | 'broad', size?, hairline?, maxWidth?, angle? } (Pad's nibSettings())
// spatter: 0..15 on a law 2 sheet; left out (undefined) on law 1 sheets, whose acts have no such field.
// dip: a dip pen (rooms.md §3c, law 3): { well (its reservoir, 1..15), n (how many times it has
// been dipped) }. A pen act that carries its well is a dip: the reservoir full again.
// law: the sheet's. From law 5 an ink is what it holds (law/v2/sim.js 16): the oak gall swatch is an ink
// with no pigment and all oak gall (its pen act's gall), not a colour the law reads.
const isGallColor = (rgb) => rgb.every((c, i) => c === OAK_GALL[i]);
export function lawPen(settings, color, flow = FLOW_DEFAULT, spatter = undefined, dip = null, law = 0) {
  const rgb = rgbOf(color);
  const gall = law >= 5 && isGallColor(rgb);
  const pen = nibPen(settings, gall ? [...WATER] : rgb, Math.min(15, Math.max(0, Math.round(flow))));
  if (gall) pen.gall = 255;
  if (spatter !== undefined) pen.spatter = Math.min(15, Math.max(0, Math.round(spatter)));
  if (dip) {
    pen.well = dip.well;
    pen.dip = dip.n; // (not recorded: a new dip is a new pen act, and that act is the dip)
  }
  return pen;
}

function nibPen(settings, rgb, f) {
  if (settings.nib === 'broad') {
    return { nib: 2, size: tenths(settings.size ?? BROAD_SIZES['2.4 mm']), flex: 0, flow: f, rgb, angle: Math.round(settings.angle ?? 35) % 180 };
  }
  if (settings.nib === 'flex') {
    const hair = settings.hairline ?? FLEX_PRESETS.copperplate.hairline;
    const max = settings.maxWidth ?? FLEX_PRESETS.copperplate.maxWidth;
    // the tines spread across the nib's axis, which follows the slant: law 2 lays a short wide rectangle that way
    const spread = ((Math.round(90 - (settings.slant ?? 55)) % 180) + 180) % 180;
    return { nib: 1, size: tenths(hair), flex: Math.min(400, Math.max(0, Math.round((max - hair) * 10))), flow: f, rgb, angle: spread };
  }
  return { nib: 0, size: tenths(settings.size ?? PEN_SIZES.medium), flex: 0, flow: f, rgb, angle: 0 };
}

// How wide the nib lays its line at pressure p (0..255), in page px: the law's own
// width (law/v2/sim.js widthAt), so the tines a viewer sees spread are the line it
// gets (rooms.md §3c). pen: a law pen (lawPen).
export function lineWidthPx(pen, p) {
  const q = Math.max(0, Math.min(255, Math.round(p)));
  let ht; // half-tenths of a unit
  if (pen.nib === 1) ht = 2 * (pen.size + Math.floor((pen.flex * PRESS_SHAPE[q]) / 256));
  else if (pen.nib === 2) ht = 2 * pen.size;
  else ht = Math.floor((2 * pen.size * (224 + Math.floor((q * 64) / 255))) / 256);
  return ht / 20;
}
