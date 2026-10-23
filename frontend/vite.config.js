import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HAND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/hand/drawn');
const MAX_HAND_BYTES = 256 * 1024;

// Dev only: the handwriting studio (/hand) saves labels straight into
// src/hand/drawn/<name>.json. Only well-formed labels with plain names are
// written, and only into that folder.
function handStudio() {
  return {
    name: 'penpals-hand-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__hand/save', (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_HAND_BYTES) req.destroy();
        });
        req.on('end', () => {
          try {
            const { name, asset } = JSON.parse(body);
            if (typeof name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 60) throw new Error('bad name');
            if (!asset || asset.v !== 1 || !Array.isArray(asset.s) || !(asset.w > 0) || !(asset.h > 0)) throw new Error('not a label');
            fs.mkdirSync(HAND_DIR, { recursive: true });
            fs.writeFileSync(path.join(HAND_DIR, `${name}.json`), JSON.stringify(asset));
            reply(200, { ok: true });
          } catch (err) {
            reply(400, { error: err.message });
          }
        });
      });
    },
  };
}

// `host: true` exposes the dev server on your LAN so you can test from a phone:
// http://<your-pc-ip>:5173
// API_URL points /api somewhere other than the local backend (default http://localhost:3000).
export default defineConfig({
  plugins: [react(), handStudio()],
  server: {
    host: true,
    proxy: { '/api': process.env.API_URL || 'http://localhost:3000' },
  },
});
