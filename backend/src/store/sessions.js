import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson } from '../files.js';

// Sessions: data/sessions/<sha256 of token>.json = { userId, createdAt }.
// Only a hash of each token is stored, so the files can't be used to log in.

const dir = path.join(config.dataDir, 'sessions');
export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const file = (token) => path.join(dir, `${tokenHash(token)}.json`);

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await writeJson(file(token), { userId, createdAt: new Date().toISOString() });
  return token;
}

export async function sessionUserId(token) {
  if (!/^[\w-]{20,100}$/.test(String(token))) return null;
  const s = await readJson(file(token), null);
  if (!s) return null;
  if (Date.now() - Date.parse(s.createdAt) > config.sessionTtlMs) return null;
  return s.userId;
}

export const deleteSession = (token) => fs.rm(file(token), { force: true });

export async function deleteExpiredSessions() {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const s = await readJson(path.join(dir, name), null);
    if (!s || Date.now() - Date.parse(s.createdAt) > config.sessionTtlMs) {
      await fs.rm(path.join(dir, name), { force: true });
      n++;
    }
  }
  return n;
}

// Sign out everywhere: every session of this account goes.
export async function deleteUserSessions(userId) {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const s = await readJson(path.join(dir, name), null);
    if (s?.userId === userId) {
      await fs.rm(path.join(dir, name), { force: true });
      n++;
    }
  }
  return n;
}
