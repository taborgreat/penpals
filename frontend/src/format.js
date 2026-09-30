const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(when) {
  const ms = Date.now() - new Date(when).getTime();
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  return `${Math.floor(ms / DAY)} d ago`;
}

export function timeLeft(until) {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  if (ms < HOUR) return `${Math.ceil(ms / MINUTE)} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ${Math.floor((ms % HOUR) / MINUTE)} min`;
  return `${Math.floor(ms / DAY)} d`;
}

export const kb = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
