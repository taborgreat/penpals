// A room's clock (rooms.md §1b): an IANA time zone, as the device reports it
// (Intl.DateTimeFormat().resolvedOptions().timeZone). Anything the runtime
// cannot use is refused.
import { httpError } from './files.js';

export function checkTimeZone(zone) {
  if (typeof zone !== 'string' || zone.length > 64 || !/^[A-Za-z0-9_+-/]+$/.test(zone)) throw httpError(400, 'bad_time_zone', 'That is not a time zone.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw httpError(400, 'bad_time_zone', 'That is not a time zone.');
  }
  return zone;
}
