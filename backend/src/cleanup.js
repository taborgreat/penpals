import { config } from './config.js';
import { allLetters, at, deleteLetter } from './store/letters.js';
import { deleteExpiredSessions } from './store/sessions.js';

// The server is a postman, not an archive: once nobody keeps a letter and it is
// no longer in the mail (expired, or never sent), the letter and its ink go.
export async function deleteExpiredLetters(now = Date.now()) {
  const expired = allLetters().filter((l) => !l.savedBy.length && (!l.recipientId || at(l.expiresAt) <= now));
  for (const l of expired) await deleteLetter(l.id);
  return expired.length;
}

export function startCleanup() {
  const run = async () => {
    try {
      const n = await deleteExpiredLetters();
      if (n) console.log(`[cleanup] deleted ${n} expired letter(s)`);
      await deleteExpiredSessions();
    } catch (err) {
      console.error('[cleanup]', err);
    }
  };
  run();
  setInterval(run, config.cleanupIntervalMs).unref();
}
