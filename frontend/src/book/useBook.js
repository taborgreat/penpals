import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { parseLines } from './ink.js';
import { applyLocal } from './ops.js';

// A person's book (books.md): the skeleton first, then the ink it points at.
// For the owner, `send(op)` and `addInk(ink, place)` are micro edits: shown at
// once, sent one at a time, each against the version the client has. A stale
// edit (someone else's tab got there first) reloads the book and tries again.
//
// `fromFile` ({ name, skeleton, inks }) shows a downloaded .book instead (read-only).
export function useBook(name, fromFile = null) {
  const [book, setBook] = useState(() => (fromFile ? { status: 'ready', ...fromFile } : { status: 'loading' }));
  const [error, setError] = useState(null);
  const versionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const bookRef = useRef(book);
  bookRef.current = book;

  const load = useCallback(async () => {
    if (fromFile) return;
    try {
      const head = await api.get(`/api/books/${encodeURIComponent(name)}`);
      const res = await fetch(`/api/books/${encodeURIComponent(name)}/ink`);
      const inks = new Map(parseLines(await res.text()).map((r) => [r.id, r]));
      versionRef.current = head.skeleton.version;
      setBook({ status: 'ready', name: head.name, page: head.page, skeleton: head.skeleton, inks });
    } catch (err) {
      setBook({ status: err.status === 403 ? 'private' : 'error', error: err.message });
    }
  }, [name, fromFile]);

  useEffect(() => {
    if (fromFile) setBook({ status: 'ready', ...fromFile });
    else {
      setBook({ status: 'loading' });
      load();
    }
  }, [load, fromFile]);

  // Run edits strictly one after another, so each goes out with the version the last one left.
  const enqueue = (work) => {
    const run = queueRef.current.then(work, work);
    queueRef.current = run.catch(() => {});
    return run;
  };

  const show = (op) => setBook((b) => ({ ...b, skeleton: applyLocal(b.skeleton, op) }));

  const send = useCallback((op) => {
    show(op);
    return enqueue(async () => {
      try {
        versionRef.current = (await api.post('/api/books/me/edit', { ...op, base: versionRef.current })).version;
      } catch (err) {
        if (err.status === 409) {
          await load(); // someone else's edit landed first: take theirs, then put this one on top
          try {
            show(op);
            versionRef.current = (await api.post('/api/books/me/edit', { ...op, base: versionRef.current })).version;
            return;
          } catch (again) {
            err = again;
          }
        }
        setError(err.message);
        await load();
      }
    });
  }, [load]);

  // New writing: the ink is appended to the chain, then placed (one request).
  const addInk = useCallback((ink, place) => enqueue(async () => {
    try {
      const res = await api.post('/api/books/me/ink', { ink, place, base: versionRef.current });
      versionRef.current = res.version;
      setBook((b) => {
        const inks = new Map(b.inks);
        inks.set(res.ink, { id: res.ink, ...ink });
        return { ...b, inks, skeleton: applyLocal(b.skeleton, { ...place, op: 'add', id: res.item, ink: res.ink }) };
      });
      return res.item;
    } catch (err) {
      setError(err.message);
      if (err.status === 409) await load();
      return null;
    }
  }), [load]);

  return { book, send, addInk, reload: load, error, clearError: () => setError(null) };
}
