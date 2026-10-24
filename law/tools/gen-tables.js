// Generates law/v1/tables.js: every table the law needs that comes from a
// transcendental function, computed in BigInt fixed point (50 decimal digits)
// and rounded to integers. The law never calls Math.exp/log/sin/cos/pow at run
// time: those are implementation-approximated in ECMAScript, these literals are not.
//
//   node law/tools/gen-tables.js           write law/v1/tables.js
//   node law/tools/gen-tables.js --check   exit 1 if the committed file differs
//
// The parameters below are part of law v1 (PRESS_GAMMA etc.). Changing one
// after the freeze means a new law version.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARAMS = {
  P_NONE: 153, // the pressure assumed when a device has none (0.6 of full)
  PRESS_GAMMA: [4, 5], // deposit grows as (p / P_NONE)^(4/5)
  FLEX_GAMMA: [3, 2], // a flex nib opens as (p / 255)^(3/2)
  FLOW_BASE: 1000, // flow step 7: drops per ms per cell of nib width, ×16
  FLOW_RATIO: [13, 10], // each flow step is 1.3× the last
};

const D = 50n;
const S = 10n ** D; // fixed-point scale

const fx = (n, d = 1n) => (BigInt(n) * S) / BigInt(d);
const mul = (a, b) => (a * b) / S;
const div = (a, b) => (a * S) / b;

function expFx(x) {
  // exp(x) = exp(x / 2^k)^(2^k), Taylor on the small argument.
  let k = 0;
  let y = x;
  while (y > S / 8n || y < -S / 8n) {
    y /= 2n;
    k++;
  }
  let sum = S;
  let term = S;
  for (let n = 1n; n < 200n; n++) {
    term = mul(term, y) / n;
    if (term === 0n) break;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum = mul(sum, sum);
  return sum;
}

function atanhFx(x) {
  // atanh(x) = x + x^3/3 + x^5/5 + ...  (|x| < 1)
  const x2 = mul(x, x);
  let p = x;
  let sum = 0n;
  for (let n = 1n; n < 2000n; n += 2n) {
    const t = p / n;
    if (t === 0n) break;
    sum += t;
    p = mul(p, x2);
  }
  return sum;
}

const LN2 = 2n * atanhFx(fx(1, 3));

function lnFx(y) {
  if (y <= 0n) throw new Error('ln of non-positive');
  let e = 0n;
  let m = y;
  while (m >= 2n * S) {
    m /= 2n;
    e++;
  }
  while (m < S) {
    m *= 2n;
    e--;
  }
  return e * LN2 + 2n * atanhFx(div(m - S, m + S));
}

function atanFx(x) {
  const x2 = mul(x, x);
  let p = x;
  let sum = 0n;
  for (let n = 1n, sign = 1n; n < 4000n; n += 2n, sign = -sign) {
    const t = p / n;
    if (t === 0n) break;
    sum += sign * t;
    p = mul(p, x2);
  }
  return sum;
}

const PI = 16n * atanFx(fx(1, 5)) - 4n * atanFx(fx(1, 239));

function sinCosFx(a) {
  // Taylor series; fine for |a| <= 2π at this precision.
  let s = 0n;
  let c = 0n;
  let term = S; // a^n / n!
  for (let n = 0n; n < 200n; n++) {
    if (n > 0n) term = mul(term, a) / n;
    if (term === 0n) break;
    switch (Number(n % 4n)) {
      case 0: c += term; break;
      case 1: s += term; break;
      case 2: c -= term; break;
      case 3: s -= term; break;
      default:
    }
  }
  return [s, c];
}

const powFx = (base, [num, den]) => expFx((lnFx(base) * BigInt(num)) / BigInt(den));

// Round a fixed-point value to the nearest integer, halves away from zero.
function roundFx(x) {
  const neg = x < 0n;
  const a = neg ? -x : x;
  const r = (a + S / 2n) / S;
  return Number(neg ? -r : r);
}

const deg = (d) => (PI * BigInt(d)) / 180n;

export function build(params = PARAMS) {
  const t = {};

  // Colour in: a channel value c in 0..255 as absorbance ×1024 (c = 0 treated as 1).
  t.ABS_Q = Array.from({ length: 256 }, (_, c) => roundFx(1024n * lnFx(fx(255, Math.max(c, 1)))));

  // Colour out: transmittance ×255 for absorbance i/256.
  t.EXP8 = Array.from({ length: 2048 }, (_, i) => roundFx(255n * expFx(-fx(i, 256))));

  // Broad-nib angles: [cos, sin] ×16384 for 0..179 degrees.
  t.COSSIN_Q14 = Array.from({ length: 180 }, (_, d) => sinCosFx(deg(d)).reverse().map((v) => roundFx(16384n * v)));

  // Fiber directions k·11.25° (0..168.75°), y down: [cos, sin] ×16384.
  t.DIR16_Q14 = Array.from({ length: 16 }, (_, k) => sinCosFx((PI * BigInt(k)) / 16n).reverse().map((v) => roundFx(16384n * v)));

  // How much a fiber at direction k carries toward neighbour n (n·45°, E first,
  // y down): cos²(k·11.25° − n·45°) ×256. Symmetric under n ↔ n+4.
  t.DIRW = Array.from({ length: 16 }, (_, k) => Array.from({ length: 8 }, (_, n) => {
    const [, c] = sinCosFx((PI * BigInt(k)) / 16n - (PI * BigInt(n)) / 4n);
    return roundFx(256n * mul(c, c));
  }));

  // Deposit response to pressure, ×256 at P_NONE.
  t.PRESS = Array.from({ length: 256 }, (_, p) => (p === 0 ? 0 : roundFx(256n * powFx(fx(p, params.P_NONE), params.PRESS_GAMMA))));

  // How far a flex nib opens at pressure p, ×256 (0 at no pressure, 256 at full).
  t.PRESS_SHAPE = Array.from({ length: 256 }, (_, p) => (p === 0 ? 0 : roundFx(256n * powFx(fx(p, 255), params.FLEX_GAMMA))));

  // Smoothstep 3t² − 2t³ at t = i/32, ×256 (rational, exact before rounding).
  t.SMOOTH32 = Array.from({ length: 33 }, (_, i) => roundFx((fx(3 * i * i, 32 * 32) - fx(2 * i * i * i, 32 * 32 * 32)) * 256n));

  // Flow steps 0..15: 0 is a dry nib; step 7 is FLOW_BASE; ratio between steps.
  t.FLOW_Q = Array.from({ length: 16 }, (_, f) => {
    if (f === 0) return 0;
    const [n, d] = params.FLOW_RATIO;
    const r = powFx(fx(n, d), [f - 7, 1]);
    return roundFx(BigInt(params.FLOW_BASE) * r);
  });

  return t;
}

export function render(tables, params = PARAMS) {
  const lines = [
    '// GENERATED by law/tools/gen-tables.js — do not edit. Part of law v1.',
    `// Parameters: ${JSON.stringify(params)}`,
    '// Every value is an integer computed in 50-digit BigInt fixed point.',
    '',
  ];
  for (const [name, value] of Object.entries(tables)) {
    const flat = value.flat();
    const kind = flat.some((v) => v < 0) ? 'Int32Array' : flat.every((v) => v < 65536) ? 'Uint16Array' : 'Uint32Array';
    const rows = Array.isArray(value[0]) ? value[0].length : 0;
    lines.push(`// ${name}${rows ? ` (${value.length} rows × ${rows}, row-major)` : ` (${value.length})`}`);
    lines.push(`export const ${name} = ${kind}.from([`);
    for (let i = 0; i < flat.length; i += 16) lines.push(`  ${flat.slice(i, i + 16).join(', ')},`);
    lines.push(']);');
    lines.push('');
  }
  return `${lines.join('\n')}`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'v1', 'tables.js');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(build());
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (now !== text) {
      console.error('law/v1/tables.js differs from what gen-tables.js produces.');
      process.exit(1);
    }
    console.log('tables match');
  } else {
    fs.writeFileSync(out, text);
    console.log(`wrote ${out}`);
  }
}
