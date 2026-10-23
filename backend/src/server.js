import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sessionMiddleware } from './auth.js';
import { loadAccounts } from './store/accounts.js';
import { loadLetters } from './store/letters.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { lettersRouter } from './routes/letters.js';
import { socialRouter } from './routes/social.js';
import { signaturesRouter } from './routes/signatures.js';
import { booksRouter } from './routes/books.js';
import { startCleanup } from './cleanup.js';

// No database: everything is files in config.dataDir (books.md). The in-memory
// indexes are rebuilt from those files here, on every start.
fs.mkdirSync(config.dataDir, { recursive: true });
const accounts = await loadAccounts();
const letters = await loadLetters();
console.log(`penpals data: ${config.dataDir} (${accounts} accounts, ${letters} letters)`);

const app = express();
app.disable('x-powered-by');
app.use(sessionMiddleware);
// Books and signatures come before the general JSON parser: new ink has its own size limit.
app.use('/api/books', booksRouter);
app.use('/api/signatures', signaturesRouter);
app.use(express.json({ limit: '64kb' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/letters', lettersRouter);
app.use('/api/social', socialRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Production: serve the built frontend (`npm run build`). In dev, Vite serves it and proxies /api here.
if (fs.existsSync(config.frontendDist)) {
  app.use(express.static(config.frontendDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large (max ${config.maxInkBytes / 1024} KB).` });
  }
  if (err.name === 'MulterError') return res.status(400).json({ error: `Bad upload: ${err.message}.` });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too big to send.' });
  if (!err.status) console.error(err);
  res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Server error.' });
});

startCleanup();
app.listen(config.port, () => console.log(`penpals api listening on http://localhost:${config.port}`));
