import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const list = (v) =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

export const config = {
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0', // every network this machine is on (the LAN too); HOST=127.0.0.1 for this machine only

  // Everything lives in files here (books.md, keys.md): accounts, books, the world's chains,
  // sessions. There is no database. FORMAT marks the layout; older data is refused.
  dataDir: env.DATA_DIR || path.join(backendRoot, 'data'),
  format: 2,
  frontendDist: path.resolve(backendRoot, '..', 'frontend', 'dist'),
  production: env.NODE_ENV === 'production',

  // Behind a proxy that sets X-Forwarded-For (Cloudflare Tunnel etc.).
  trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : false,

  unopenedTtlMs: 90 * 24 * 60 * 60 * 1000, // ...or after 90 days unopened
  cleanupIntervalMs: 10 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,

  law: { current: 2, accept: [1, 2] },

  auth: {
    nonceTtlMs: 120 * 1000,
    maxNonces: 10000, // outstanding, across everyone (the oldest go first)
    pendingTtlMs: 10 * 60 * 1000, // a name is held this long between register/begin and finish
    origins: list(env.ORIGINS), // when set, the only origins that may sign in or send writes
    cookieSecure: env.COOKIE_SECURE === '1',
    username: /^[a-z0-9_]{2,20}$/i,
    reserved: ['me', 'api', 'admin', 'book', 'u', 'write', 'inbox', 'hand', 'hand-lab', 'law-check', 'proofs', 'register', 'signin', 'login', 'logout'],
  },

  render: {
    workers: env.RENDER_WORKERS !== undefined ? Number(env.RENDER_WORKERS) : Math.max(1, Math.min(4, (os.availableParallelism?.() ?? 2) - 1)),
    queue: { upload: 16, view: 64, warm: 256 },
    timeoutMs: { book: 10000 },
    heapMb: 512,
    maxCells: 4_000_000, // a look at any scale: cells of its box
    cacheMaxBytes: 1 << 30,
    rev: 2, // bump to throw away every cached look (2: fading by absorbed light, light-waves §8)
  },

  limits: {
    // [capacity, per ms]: a bucket refills `capacity` tokens over the window.
    challenge: [30, 60 * 1000],
    registerIp: [3, 60 * 60 * 1000],
    beginAccount: [20, 60 * 60 * 1000],
    beginIp: [20, 60 * 60 * 1000],
    unlockAccount: [5, 60 * 60 * 1000],
    unlockIp: [5, 60 * 60 * 1000],
    inkUser: [120, 60 * 60 * 1000],
    lookMissViewer: [120, 60 * 1000],
    signaturesIp: [120, 60 * 1000],
    proofsUser: [10, 24 * 60 * 60 * 1000],
    nameIp: [60, 60 * 1000],
  },

  proofs: { pendingTtlMs: 24 * 60 * 60 * 1000, answeredTtlMs: 7 * 24 * 60 * 60 * 1000, pendingPerTarget: 5 },

  // Books (books.md). A journal page is a fixed logical canvas; items sit on it
  // in these units and the page is scaled to fit the screen.
  book: {
    maxActsBytes: 768 * 1024, // one record's acts (about 40 minutes of writing)
    maxSignatureActsBytes: 32 * 1024,
    maxChainBytes: 50 * 1024 * 1024,
    visitorsCanDownload: false, // ruling: only the owner downloads their .book
  },
};
