import { config } from './config.js';
import { createApp } from './app.js';
import { startCleanup } from './cleanup.js';

// No database: everything is files in config.dataDir (books.md, keys.md). The
// in-memory indexes are rebuilt from those files on every start.
const { app, summary, pool } = await createApp();
console.log(`penpals data: ${config.dataDir} (${summary.accounts} accounts, ${summary.letters} letters, ${summary.cache.files} cached looks); ${pool.stats().workers} render worker(s)`);
startCleanup();
app.listen(config.port, () => console.log(`penpals api listening on http://localhost:${config.port}`));
