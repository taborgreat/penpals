import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Whose house this is (backend routes/books.js GET /api/books/:name): its owner's name and key, and the
// paper their name was signed on (new papers are grown on it unless another is chosen).
// → { status: 'loading' | 'ready' | 'private' | 'error', name, key, family, error }
export function useHouse(name) {
  const [house, setHouse] = useState({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setHouse({ status: 'loading' });
    api
      .get(`/api/books/${encodeURIComponent(name)}`)
      .then((h) => alive && setHouse({ status: 'ready', name: h.name, key: h.key, family: h.family ?? null }))
      .catch((err) => alive && setHouse({ status: err.status === 403 ? 'private' : 'error', error: err.message }));
    return () => {
      alive = false;
    };
  }, [name]);
  return house;
}
