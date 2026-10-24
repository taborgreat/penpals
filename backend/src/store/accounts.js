import path from 'node:path';
import { config } from '../config.js';
import { listDirs, readJson, serial, serialAll, writeJson } from '../files.js';

// Accounts: data/users/<id>/account.json. Private, never part of a book:
//   { id, username, usernameLower, publicKey, createdAt, private,
//     friends: [id], incoming: [id], outgoing: [id], blocked: [id], lettersSent, settings: {} }
// There is no password: the account is its public key (keys.md, "there is no
// account, there is a key"). account.json is written last when an account is
// made, so a folder without one is a registration that never finished.
//
// The name and key indexes are rebuilt from the account files on every start
// (data/index/names.json too), so none of them is ever the only record of anything.

export const usersDir = path.join(config.dataDir, 'users');
export const userDir = (id) => path.join(usersDir, id);
export const accountFile = (id) => path.join(userDir(id), 'account.json');
const namesFile = path.join(config.dataDir, 'index', 'names.json');

const byId = new Map();
const byName = new Map(); // lowercased name → id
const byKey = new Map(); // public key (b64url) → id

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

export async function loadAccounts() {
  byId.clear();
  byName.clear();
  byKey.clear();
  for (const id of await listDirs(usersDir)) {
    const account = await readJson(accountFile(id), null);
    if (!account) continue;
    remember(blank(account));
  }
  await saveNames();
  return byId.size;
}

function remember(account) {
  byId.set(account.id, account);
  byName.set(account.usernameLower, account.id);
  byKey.set(account.publicKey, account.id);
}

const saveNames = () => writeJson(namesFile, Object.fromEntries([...byName].sort()));

export const getAccount = (id) => (id ? (byId.get(String(id)) ?? null) : null);
export const findByName = (name) => getAccount(byName.get(String(name ?? '').toLowerCase()));
export const findByKey = (key) => getAccount(byKey.get(String(key ?? '')));
export const allAccounts = () => [...byId.values()];
export const nameOf = (id) => getAccount(id)?.username ?? null;
export const nameTaken = (name) => byName.has(String(name).toLowerCase());
export const keyTaken = (key) => byKey.has(key);

const lockKey = (id) => `account:${id}`;

// The last step of a registration (the commit point): the account file, then the indexes.
// Callers hold the 'names' lock and have checked the name and key are free.
export async function commitAccount({ id, username, publicKey, createdAt }) {
  const account = blank({ id, username, usernameLower: username.toLowerCase(), publicKey, createdAt });
  await writeJson(accountFile(id), account);
  remember(account);
  await saveNames();
  return account;
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
