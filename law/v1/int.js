// Integer helpers for the canonical path. JS numbers hold integers exactly up
// to 2^53, and IEEE division is correctly rounded, so Math.floor(a / b) is the
// exact floor quotient whenever |a| < 2^53 and b is a positive integer. The law
// keeps every product below that (each rule states its bound); `|0` and `>>`
// are never used on values that can reach 2^31.

export const floorDiv = (a, b) => Math.floor(a / b);
export const ceilDiv = (a, b) => -Math.floor(-a / b);
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// floor(sqrt(n)) for 0 ≤ n < 2^52, exact whatever Math.sqrt's last bit does.
export function isqrt(n) {
  if (n < 0) throw new Error('isqrt of a negative');
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

// Thrown when a record breaks a canonical cap or rule: the same INVALID on
// every machine, never a crash.
export class LawError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.law = true;
  }
}
