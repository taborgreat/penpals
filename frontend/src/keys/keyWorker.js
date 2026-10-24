// The slow parts of making and opening an account, off the main thread: the
// key from the three signatures (each grown again by the law on the provisional
// paper) and stretching a password with argon2id. Nothing here leaves the device.
//   { id, type: 'key', r32, signatures: [PNKA ×3] }  → { id, K }
//   { id, type: 'settle', acts, seed, family }       → { id, settled: { acts, law, box, facts } }
//   { id, type: 'stretch', y, kdf }                   → { id, key }
import { record as R, unlock as U } from 'penpals-law';

onmessage = ({ data: m }) => {
  try {
    if (m.type === 'key') postMessage({ id: m.id, K: R.accountKey(m.r32, m.signatures).K });
    else if (m.type === 'settle') {
      const s = R.settle(m.acts, m.seed, m.family);
      postMessage({ id: m.id, settled: { acts: m.acts, law: s.law, box: s.box, facts: s.facts } });
    } else if (m.type === 'stretch') postMessage({ id: m.id, key: U.unlockKey(m.y, m.kdf) });
  } catch (err) {
    postMessage({ id: m.id, error: err.message });
  }
};
