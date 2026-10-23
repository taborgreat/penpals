import path from 'node:path';
import { config } from '../config.js';
import { listDirs, newId, readJson, serial, serialAll, writeJson } from '../files.js';

// Accounts: data/users/<id>/account.json. Private, never part of a book:
//   { id, username, usernameLower, passwordHash, createdAt, private,
//     friends: [id], incoming: [id], outgoing: [id], blocked: [id],
//     lettersSent, settings: {} }
// incoming/outgoing are friend requests. A friendship is written into both
// accounts (under both people's locks), so each account file stands alone.
//
// data/index/names.json maps lowercased names to ids. It is rebuilt from the
// account files on every start, so it can never be the only record of anything.

export const usersDir = path.join(config.dataDir, 'users');
export const userDir = (id) => path.join(usersDir, id);
const accountFile = (id) => path.join(userDir(id), 'account.json');
const namesFile = path.join(config.dataDir, 'index', 'names.json');

const byId = new Map(); // id → account (the files, kept in memory)
const byName = new Map(); // lowercased name → id

const blank = (fields) => ({
  private: false,
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
  lettersSent: 0,
  settings: {},
  ...fields,
});

// Read every account and rebuild the name index.
export async function loadAccounts() {
  byId.clear();
  byName.clear();
  for (const id of await listDirs(usersDir)) {
    const account = await readJson(accountFile(id), null);
    if (!account) continue;
    byId.set(account.id, blank(account));
    byName.set(account.usernameLower, account.id);
  }
  await saveNames();
  return byId.size;
}

const saveNames = () => writeJson(namesFile, Object.fromEntries([...byName].sort()));

export const getAccount = (id) => (id ? byId.get(String(id)) ?? null : null);
export const findByName = (name) => getAccount(byName.get(String(name ?? '').toLowerCase()));
export const allAccounts = () => [...byId.values()];
export const nameOf = (id) => getAccount(id)?.username ?? null;

const lockKey = (id) => `account:${id}`;

export function createAccount({ username, passwordHash, id = newId(), createdAt = new Date().toISOString(), ...rest }) {
  return serial('names', async () => {
    const lower = username.toLowerCase();
    if (byName.has(lower)) {
      const err = new Error('That name is taken.');
      err.status = 409;
      throw err;
    }
    const account = blank({ id, username, usernameLower: lower, passwordHash, createdAt, ...rest });
    await writeJson(accountFile(id), account);
    byId.set(id, account);
    byName.set(lower, id);
    await saveNames();
    return account;
  });
}

// Change one account: `change(copy)` edits a copy, which is written whole and atomically.
export function updateAccount(id, change) {
  return serial(lockKey(id), async () => {
    const current = byId.get(id);
    if (!current) throw new Error(`no account ${id}`);
    const next = structuredClone(current);
    const out = await change(next);
    await writeJson(accountFile(id), next);
    byId.set(id, next);
    return out;
  });
}

// Change two accounts together (a friendship, a block), each still written whole.
export function updateTwo(a, b, change) {
  return serialAll([lockKey(a), lockKey(b)], async () => {
    const A = structuredClone(byId.get(a));
    const B = structuredClone(byId.get(b));
    if (!A || !B) throw new Error('no such account');
    const out = await change(A, B);
    await writeJson(accountFile(a), A);
    await writeJson(accountFile(b), B);
    byId.set(a, A);
    byId.set(b, B);
    return out;
  });
}

export const without = (list, id) => list.filter((x) => x !== id);
export const withId = (list, id) => (list.includes(id) ? list : [...list, id]);
