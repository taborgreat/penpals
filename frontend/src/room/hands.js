// The outside's facts and this being's hands on them (outside.md Phase 5; law/hands.js): what is
// there now (read from the stamper: GET /api/outside, again a little after each act and now and then
// for others' acts), and the acts that change it, sealed with your key.
//   useHands({ key }) → { facts (law/hands.js state, or null), act(a) → Promise (take, put, break, carve) }
import { useCallback, useEffect, useRef, useState } from 'react';
import { hands as H } from 'penpals-law';
import { api } from '../api.js';

const AGAIN_MS = 5000; // others' acts are read this often while looking (Tabor's to set)

// the stamper's account back as the law's state (Maps)
const factsOf = (d) => ({
  n: d.n,
  things: new Map(d.things.map(({ id, ...t }) => [id, t])),
  broken: new Map(d.broken.map(({ tree, list }) => [tree, list])),
  cuts: new Map(d.cuts.map(({ id, list }) => [id, list])),
  marks: new Map(d.marks.map(({ tree, list }) => [tree, list])),
  made: new Map((d.made ?? []).map(({ id, ...m }) => [id, m])),
  edges: new Set(d.edges ?? []),
  picked: new Map((d.picked ?? []).map(({ gall, day }) => [gall, day])),
  combs: new Map((d.combs ?? []).map(({ tree, list }) => [tree, list])),
  planted: new Map((d.planted ?? []).map(({ id, ...p }) => [id, p])),
  grass: new Map((d.grass ?? []).map(({ cell, list }) => [cell, list])),
  k: new Map(Object.entries(d.k)),
});

export function useHands({ key = null } = {}) {
  const [facts, setFacts] = useState(null);
  const factsRef = useRef(null);
  factsRef.current = facts;
  const read = useCallback(
    () =>
      api.get('/api/outside').then(
        (d) => setFacts(factsOf(d)),
        () => {},
      ),
    [],
  );
  useEffect(() => {
    read();
    const t = setInterval(read, AGAIN_MS);
    return () => clearInterval(t);
  }, [read]);
  const act = useCallback(
    async (a) => {
      if (!key) throw new Error('Your hands need your key.');
      const k = (factsRef.current?.k.get(key.publicKey) ?? 0) + 1;
      const made = H.sealHandsAct(key.sk, { v: 1, kind: 'outside', by: key.publicKey, k, ...a });
      try {
        return await api.post('/api/outside/acts', made);
      } finally {
        await read();
      }
    },
    [key, read],
  );
  return { facts, act };
}
