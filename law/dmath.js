// Arithmetic every machine does alike (one-matter.md Phase 7). JavaScript's + − × ÷ and sqrt are
// exact to the bit everywhere (IEEE 754); its Math.sin, cos, exp, log and pow are not promised
// to be. A law that needs those takes them from here: series of + − × ÷ alone, in a fixed order.

const TAU = 6.283185307179586;
const LN2 = 0.6931471805599453;

// 2^k, exactly (k an integer)
function pow2(k) {
  let r = 1;
  let b = k < 0 ? 0.5 : 2;
  for (let n = Math.abs(k); n > 0; n >>= 1) {
    if (n & 1) r *= b;
    b *= b;
  }
  return r;
}

export function sin(x) {
  let r = x - Math.round(x / TAU) * TAU; // [−π, π]
  if (r > TAU / 4) r = TAU / 2 - r;
  else if (r < -TAU / 4) r = -TAU / 2 - r; // [−π/2, π/2]
  const r2 = r * r;
  let s = r,
    t = r;
  for (let n = 1; n <= 9; n++) {
    t *= -r2 / (2 * n * (2 * n + 1));
    s += t;
  }
  return s;
}
export const cos = (x) => sin(x + TAU / 4);

export function exp(x) {
  if (x < -745) return 0;
  if (x > 709) return Infinity;
  const k = Math.round(x / LN2);
  const r = x - k * LN2; // |r| ≤ ln2 / 2
  let s = 1,
    t = 1;
  for (let n = 1; n <= 16; n++) {
    t *= r / n;
    s += t;
  }
  return s * pow2(k);
}

export function log(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0;
  while (x >= 1.5) {
    x /= 2;
    e++;
  }
  while (x < 0.75) {
    x *= 2;
    e--;
  }
  const s = (x - 1) / (x + 1); // |s| ≤ 0.2: ln x = 2 atanh s
  const s2 = s * s;
  let sum = 0,
    t = s;
  for (let n = 0; n <= 14; n++) {
    sum += t / (2 * n + 1);
    t *= s2;
  }
  return 2 * sum + e * LN2;
}

export const pow = (a, b) => exp(b * log(a));
