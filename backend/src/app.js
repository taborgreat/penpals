import express from 'express';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sessionMiddleware, requireOrigin } from './auth.js';
import { loadAccounts, usersDir, accountFile, userDir } from './store/accounts.js';
import { loadLetters } from './store/letters.js';
import { loadProofs } from './store/proofs.js';
import { loadCache, cacheStats } from './store/cache.js';
import { sweepTemps, truncateTornTail, listDirs, httpError } from './files.js';
import { createPool } from './render/pool.js';
import { setPool } from './services.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { lettersRouter } from './routes/letters.js';
import { proofsRouter } from './routes/proofs.js';
import { socialRouter } from './routes/social.js';
import { signaturesRouter } from './routes/signatures.js';
import { booksRouter } from './routes/books.js';
import { lawRouter } from './routes/law.js';
import { roomsRouter, sharedRouter } from './routes/rooms.js';
import { worldRouter } from './routes/world.js';
import { outsideRouter } from './routes/outside.js';
import { loadShared } from './store/shared.js';
import { loadWorld, worldFile } from './store/world.js';
import { loadOutside } from './store/outside.js';

// The data directory says which layout it holds; anything else is refused
// rather than misread (the password-era data is gone: Living Ink starts clean).
async function checkFormat() {
  await fs.mkdir(config.dataDir, { recursive: true });
  const file = path.join(config.dataDir, 'FORMAT');
  if (fss.existsSync(file)) {
    const f = JSON.parse(await fs.readFile(file, 'utf8'));
    if (f.penpals !== config.format) throw new Error(`${config.dataDir} holds data format ${f.penpals}; this server reads format ${config.format}.`);
    return;
  }
  // Indexes and caches are rebuilt on every start: on their own they are not data.
  const REBUILT = ['index', 'cache'];
  const entries = (await fs.readdir(config.dataDir)).filter((e) => !e.startsWith('.') && !REBUILT.includes(e));
  if (entries.length) throw new Error(`${config.dataDir} holds data from before Living Ink (no FORMAT file: ${entries.join(', ')}). Move it away to start clean.`);
  for (const d of REBUILT) await fs.rm(path.join(config.dataDir, d), { recursive: true, force: true });
  await fs.writeFile(file, `${JSON.stringify({ penpals: config.format })}\n`);
}

// After a crash: temp files go, registrations that never reached their
// account.json go, and chains lose any torn last line.
async function recover() {
  const temps = await sweepTemps(config.dataDir);
  let unfinished = 0;
  let torn = 0;
  for (const id of await listDirs(usersDir)) {
    if (!fss.existsSync(accountFile(id))) {
      await fs.rm(userDir(id), { recursive: true, force: true });
      unfinished++;
      continue;
    }
    for (const f of [path.join(userDir(id), 'book', 'ink.chain'), path.join(userDir(id), 'seeds.chain')]) {
      if (await truncateTornTail(f)) torn++;
    }
  }
  if (await truncateTornTail(worldFile())) torn++;
  if (temps || unfinished || torn) console.warn(`[recover] ${temps} temp file(s), ${unfinished} unfinished registration(s), ${torn} torn chain tail(s)`);
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  if (!req.path.startsWith('/api/')) res.set('Content-Security-Policy', CSP);
  next();
}

export async function createApp() {
  await checkFormat();
  await recover();
  const accounts = await loadAccounts();
  const letters = await loadLetters();
  const proofs = await loadProofs();
  await loadCache();
  await loadShared(); // which table every shared sheet lies on (rooms.md §5)
  await loadWorld(); // where every house stands (one-world.md)
  await loadOutside(); // what hands have done outside (outside.md Phase 5)
  const pool = createPool({ ...config.render, workers: config.render.workers });
  setPool(pool);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  app.use(sessionMiddleware);
  app.use('/api', requireOrigin);
  app.use('/api/law', lawRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/signatures', signaturesRouter);
  app.use('/api/users', express.json({ limit: '64kb' }), usersRouter);
  app.use('/api/letters', lettersRouter);
  app.use('/api/proofs', proofsRouter);
  app.use('/api/social', express.json({ limit: '64kb' }), socialRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/shared', sharedRouter);
  app.use('/api/world', worldRouter);
  app.use('/api/outside', outsideRouter);
  app.use('/api', (req, res, next) => next(httpError(404, 'not_found', 'Not found.')));

  // Production: serve the built frontend (`npm run build`). In dev, Vite serves it and proxies /api here.
  if (fss.existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File too large (max ${config.maxInkBytes / 1024} KB).`, code: 'too_large' });
    if (err.name === 'MulterError') return res.status(400).json({ error: `Bad upload: ${err.message}.`, code: 'bad_upload' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too big to send.', code: 'too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That is not valid JSON.', code: 'bad_json' });
    const status = err.status ?? 500;
    if (status >= 500 && err.code !== 'busy' && err.code !== 'render_timeout') console.error(err);
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    const body = { error: status === 500 && !err.code ? 'Server error.' : err.message, code: err.code ?? (status === 500 ? 'server_error' : 'error') };
    if (err.retryAt) body.retryAt = err.retryAt;
    if (err.version !== undefined) body.version = err.version;
    if (err.stale) body.stale = true;
    res.status(status).json(body);
  });

  return {
    app,
    pool,
    summary: { accounts, letters, proofs, cache: cacheStats() },
    close: () => pool.close(),
  };
}
