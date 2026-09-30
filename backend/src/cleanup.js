import { letters } from './db.js';
import { config } from './config.js';
import { deleteInk } from './storage.js';

// The server is a postman, not an archive: once nobody keeps a letter and it
// is no longer in the mail (expired, or never sent), the ink file is deleted.
// The metadata stays for counts.
export async function deleteExpiredInk() {
  const expired = await letters
    .find(
      {
        inkDeleted: false,
        'savedBy.0': { $exists: false },
        $or: [{ recipientId: null }, { expiresAt: { $lte: new Date() } }],
      },
      { projection: { _id: 1 } },
    )
    .toArray();
  for (const { _id } of expired) {
    await deleteInk(_id);
    await letters.updateOne({ _id }, { $set: { inkDeleted: true } });
  }
  return expired.length;
}

export function startCleanup() {
  const run = () =>
    deleteExpiredInk()
      .then((n) => n && console.log(`[cleanup] deleted ${n} expired letter(s)`))
      .catch((err) => console.error('[cleanup]', err));
  run();
  setInterval(run, config.cleanupIntervalMs).unref();
}
