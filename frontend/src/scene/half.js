// Half floats (IEEE 754 binary16) for the heights the ink worker sends the
// renderer: its textures hold them as they are, so a live tile is copied, not
// converted (cleanup-and-speed.md §1.4). The values are whole numbers well
// inside the half's range.

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 112; // rebias 127 → 15
  const mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign; // too small: zero
    return sign | ((mant | 0x800000) >>> (1 - exp + 13)); // subnormal
  }
  if (exp >= 31) return sign | 0x7c00; // too big: infinity
  return sign | ((exp << 10) + ((mant + 0x1000) >>> 13)); // rounded (a carry goes into the exponent)
}

// A typed array of numbers → their half floats.
export function halves(src, out = new Uint16Array(src.length)) {
  for (let i = 0; i < src.length; i++) out[i] = toHalf(src[i]);
  return out;
}
