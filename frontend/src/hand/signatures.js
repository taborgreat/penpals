import { useSyncExternalStore } from 'react';
import { api } from '../api.js';

// Scripters' signed names, fetched as they're needed. Every name asked for in
// the same moment goes in one request, and each is fetched once a session.

const cache = new Map(); // lowercased name → signature | null (null = not signed)
const listeners = new Set();
let queue = new Set();
let timer = 0;

const emit = () => listeners.forEach((fn) => fn());

function flush() {
  timer = 0;
  const names = [...queue];
  queue = new Set();
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    api.get(`/api/signatures?names=${batch.map(encodeURIComponent).join(',')}`)
      .then(({ signatures }) => {
        for (const n of batch) cache.set(n, signatures[n] ?? null);
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

// After signing (or removing a signature), so every place showing the name updates.
export function setSignature(name, signature) {
  cache.set(String(name).toLowerCase(), signature ?? null);
  emit();
}
