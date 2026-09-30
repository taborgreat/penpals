import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { ensureInkDir } from './storage.js';
import { sessionMiddleware } from './auth.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { lettersRouter } from './routes/letters.js';
import { socialRouter } from './routes/social.js';
import { startCleanup } from './cleanup.js';

await ensureInkDir();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(sessionMiddleware);

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
  if (!err.status) console.error(err);
  res.status(err.status ?? 500).json({ error: err.status ? err.message : 'Server error.' });
});

startCleanup();
app.listen(config.port, () => console.log(`penpals api listening on http://localhost:${config.port}`));
