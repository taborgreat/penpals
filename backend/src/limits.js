import net from 'node:net';
import { config } from './config.js';
import { httpError } from './files.js';

// Token buckets kept in memory, per account or per address. A bucket holds
// `capacity` tokens and refills them over its window; an empty bucket answers
// 429 with Retry-After. The table is bounded: the oldest keys go first.

const buckets = new Map();
const MAX_KEYS = 100_000;

export function take(name, key, now = Date.now()) {
  const [capacity, windowMs] = config.limits[name];
  const k = `${name}|${key}`;
  let b = buckets.get(k);
  if (!b) {
    b = { tokens: capacity, last: now };
    buckets.set(k, b);
    if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value);
  }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) * capacity) / windowMs);
  b.last = now;
  if (b.tokens < 1) {
    const err = httpError(429, 'rate_limited', 'Too many tries; wait a little and try again.');
    err.retryAfter = Math.max(1, Math.ceil(((1 - b.tokens) * windowMs) / capacity / 1000));
    throw err;
  }
  b.tokens -= 1;
}

// The address a limit is counted against: IPv6 grouped by its /64.
export function ipKey(req) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (net.isIPv6(v4)) return `${expand6(v4).slice(0, 4).join(':')}::/64`;
  return v4;
}

// "2001:db8::1" → ["2001", "db8", "0", "0", "0", "0", "0", "1"] (zone index dropped).
function expand6(ip) {
  const [head, tail = null] = ip.split('%')[0].split('::');
  const a = head ? head.split(':') : [];
  const b = tail === null ? [] : tail ? tail.split(':') : [];
  const fill = tail === null ? [] : Array(8 - a.length - b.length).fill('0');
  return [...a, ...fill, ...b].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
}

export const resetLimits = () => buckets.clear();
