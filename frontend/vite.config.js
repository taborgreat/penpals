import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HAND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/hand/drawn');
const MAX_HAND_BYTES = 256 * 1024;
const LAB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'law', 'lab', 'samples');
const MAX_LAB_BYTES = 8 * 1024 * 1024;

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

// Dev only: the hand lab (/hand-lab, Phase 0 of Living Ink) saves writing
// samples into law/lab/samples/<person>/ (gitignored), lists them, and serves
// one back (for tracing). Names and fields are checked; nothing else is written.
function handLab() {
  const NAME = /^[a-z0-9][a-z0-9-]{0,19}$/;
  const TASKS = ['A', 'B', 'PAGE', 'corpus', 'impostor', 'trace'];
  const B64 = /^[A-Za-z0-9_-]+$/;
  const reply = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const check = (s) => {
    if (!s || typeof s !== 'object') throw new Error('no sample');
    if (!NAME.test(s.person ?? '')) throw new Error('bad person');
    if (!['phone', 'desktop', 'pen'].includes(s.device)) throw new Error('bad device');
    if (!Number.isInteger(s.session) || s.session < 0 || s.session > 99) throw new Error('bad session');
    if (!TASKS.includes(s.task)) throw new Error('bad task');
    if (s.target !== undefined && !NAME.test(s.target)) throw new Error('bad target');
    if (s.arm !== undefined && !['A', 'B', 'PAGE'].includes(s.arm)) throw new Error('bad arm');
    if (s.text !== undefined && (typeof s.text !== 'string' || s.text.length > 400)) throw new Error('bad text');
    const blobs = [s.acts, s.pangram, ...Object.values(s.letters ?? {})].filter((v) => v !== undefined);
    if (!blobs.length || !blobs.every((v) => typeof v === 'string' && B64.test(v))) throw new Error('bad acts');
    if (s.letters && !Object.keys(s.letters).every((k) => /^[a-z]$/.test(k))) throw new Error('bad letters');
  };
  const list = () => {
    const out = [];
    if (!fs.existsSync(LAB_DIR)) return out;
    for (const person of fs.readdirSync(LAB_DIR)) {
      const dir = path.join(LAB_DIR, person);
      if (!NAME.test(person) || !fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const s = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        out.push({ file: `${person}/${file}`, person: s.person, device: s.device, session: s.session, task: s.task, target: s.target, arm: s.arm, text: s.text });
      }
    }
    return out;
  };
  return {
    name: 'penpals-hand-lab',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab/list', (req, res) => reply(res, 200, list()));
      server.middlewares.use('/__lab/sample', (req, res) => {
        const file = new URL(req.url, 'http://x').searchParams.get('file') ?? '';
        if (!/^[a-z0-9-]+\/[A-Za-z0-9-]+\.json$/.test(file)) return reply(res, 400, { error: 'bad file' });
        const p = path.join(LAB_DIR, file);
        if (!fs.existsSync(p)) return reply(res, 404, { error: 'no such sample' });
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(p));
      });
      server.middlewares.use('/__lab/save', (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_LAB_BYTES) req.destroy();
        });
        req.on('end', () => {
          try {
            const s = JSON.parse(body);
            check(s);
            const dir = path.join(LAB_DIR, s.person);
            fs.mkdirSync(dir, { recursive: true });
            const base = [s.device, `s${String(s.session).padStart(2, '0')}`, s.task, s.target, s.arm].filter(Boolean).join('-');
            let name = `${base}.json`;
            for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}.json`;
            fs.writeFileSync(path.join(dir, name), JSON.stringify({ ...s, saved: new Date().toISOString() }));
            reply(res, 200, { ok: true, file: `${s.person}/${name}` });
          } catch (err) {
            reply(res, 400, { error: err.message });
          }
        });
      });
    },
  };
}

// `host: true` exposes the dev server on your LAN so you can test from a phone:
// http://<your-pc-ip>:5173
// API_URL points /api somewhere other than the local backend (default http://localhost:3000).
// The proxy keeps the browser's Host header: the backend only takes writes whose
// Origin is the host they were sent to (and the device signs that origin).
export default defineConfig({
  plugins: [react(), handStudio(), handLab()],
  server: {
    host: true,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:3000', changeOrigin: false } },
  },
});
