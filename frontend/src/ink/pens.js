// The pad's nib settings as a law pen (law/v1 PNKA pen acts). Page pixels are
// ink units, so a size in px is that many units (tenths in the pen act).
//   pen   round nib: size
//   flex  hairline when light, up to maxWidth when pressed (pressure pens drive it)
//   broad an edge of `size` held at `angle`
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
export function lawPen(settings, color, flow = FLOW_DEFAULT, spatter = undefined) {
  const pen = nibPen(settings, rgbOf(color), Math.min(15, Math.max(0, Math.round(flow))));
  if (spatter !== undefined) pen.spatter = Math.min(15, Math.max(0, Math.round(spatter)));
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
