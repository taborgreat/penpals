import { useSyncExternalStore } from 'react';
import { api } from '../api.js';

// Scripters' signed names, fetched as they're needed. Every name asked for in
// the same moment goes in one request, and each is fetched once a session.
// A signature is a sheet in its owner's book, sealed and open from birth; what
// shows is its look ({ look: url, box: [x, y, w, h] in cells }).

const cache = new Map(); // lowercased name → signature | null (null = not signed)
const listeners = new Set();
let queue = new Set();
let timer = 0;

const emit = () => listeners.forEach((fn) => fn());
const asShown = (sig) => (sig?.look ? { look: sig.look, box: sig.box, ink: sig.ink } : null);

function flush() {
  timer = 0;
  const names = [...queue];
  queue = new Set();
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    api
      .get(`/api/signatures?names=${batch.map(encodeURIComponent).join(',')}`)
      .then(({ signatures }) => {
        for (const n of batch) cache.set(n, asShown(signatures[n]));
        emit();
      })
      .catch(() => {
        for (const n of batch) cache.set(n, null); // show the plain name
        emit();
      });
  }
}

function request(key) {
  if (cache.has(key) || queue.has(key)) return;
  queue.add(key);
  timer ||= setTimeout(flush, 0);
}

// Someone's signature: undefined while loading, null if they haven't signed.
export function useSignature(name) {
  const key = name ? String(name).toLowerCase() : '';
  if (key) request(key);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (key ? cache.get(key) : null),
  );
}

// After signing again, so every place showing the name updates.
export function refreshSignature(name) {
  cache.delete(String(name).toLowerCase());
  request(String(name).toLowerCase());
}
