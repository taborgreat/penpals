import os from 'node:os';
import { config } from './config.js';
import { createApp } from './app.js';
import { startCleanup } from './cleanup.js';

// No database: everything is files in config.dataDir (books.md, keys.md). The
// in-memory indexes are rebuilt from those files on every start.
const { app, summary, pool } = await createApp();
console.log(`penpals data: ${config.dataDir} (${summary.accounts} accounts, ${summary.cache.files} cached looks); ${pool.stats().workers} render worker(s)`);
startCleanup();
app.listen(config.port, config.host, () => {
  console.log(`penpals api listening on http://localhost:${config.port}`);
  // and on the LAN, where it listens there: each of this machine's own addresses
  if (config.host === '0.0.0.0')
    for (const nets of Object.values(os.networkInterfaces())) for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  on the LAN: http://${n.address}:${config.port}`);
});
