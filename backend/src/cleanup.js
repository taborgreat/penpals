import { config } from './config.js';
import { deleteExpiredSessions } from './store/sessions.js';
import { sweepNonces } from './store/nonces.js';
import { sweepHeld } from './store/unlock.js';
import { sweepProofs } from './store/proofs.js';

// The sweeps of what is not the world: sessions, nonces, held unlocks, proofs. A letter is matter
// (one-matter.md Phase 4: nothing is deleted); no timer takes it away.
export function startCleanup() {
  const run = async () => {
    try {
      await deleteExpiredSessions();
      sweepNonces();
      sweepHeld();
      await sweepProofs();
    } catch (err) {
      console.error('[cleanup]', err);
    }
  };
  run();
  const timer = setInterval(run, config.cleanupIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
