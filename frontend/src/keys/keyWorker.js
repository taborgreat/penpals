// The slow parts of opening an account, off the main thread: reading the hand
// (the writing grown on the public calibration paper) and stretching the
// unlock secret with argon2id. Nothing here leaves the device.
//   { id, type: 'reading', kind, acts }  → { id, reading }
//   { id, type: 'stretch', y, kdf }      → { id, key }
import { handkey as H, unlock as U } from 'penpals-law';

onmessage = ({ data: m }) => {
  try {
    if (m.type === 'reading') postMessage({ id: m.id, reading: H.readingOf(m.kind, m.acts) });
    else if (m.type === 'stretch') postMessage({ id: m.id, key: U.unlockKey(m.y, m.kdf) });
  } catch (err) {
    postMessage({ id: m.id, error: err.message });
  }
};
