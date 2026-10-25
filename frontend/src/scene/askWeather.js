// Asking for weather (world.md: as dragging the light): the viewer calls up rain or wind for a while,
// then it eases back to the day's own. Only this viewer's: the weather everyone at a place shares is
// the day's (law/weather.js).
//   ask(asked, 'rain' | 'wind', nowS) → asked (each press, more)
//   asWeather(weather, asked, nowS) → the weather as this viewer has it now
import { KESSLER, LAYER, DROPLET } from 'penpals-law/weather';
import { MATTER } from 'penpals-law/matter';

export const ASK = Object.freeze({ holds: 120, eases: 60, rain: 8, wind: 6 }); // s held, s easing back; mm/h, m/s a press adds (Tabor's to set)

export const ask = (asked, what, now) => {
  const k = strength(asked, now);
  return { rain: (asked?.rain ?? 0) * k + (what === 'rain' ? ASK.rain : 0), wind: (asked?.wind ?? 0) * k + (what === 'wind' ? ASK.wind : 0), at: now };
};
const strength = (asked, now) => {
  if (!asked) return 0;
  const t = now - asked.at;
  return t < ASK.holds ? 1 : Math.max(0, 1 - (t - ASK.holds) / ASK.eases);
};

// The deck a rain needs (law/weather.js's own rule, backward): its water past what its droplets hold
// apart, as much more as falls at that rate; as much of the sun turned back as that deck does.
export function cloudFor(mm) {
  if (!(mm > 0)) return 0;
  const c = KESSLER.holds * MATTER.air.density * LAYER + mm / 3600 / KESSLER.rate;
  const tau = (3 * c) / (2 * MATTER.water.density * DROPLET);
  return tau / (tau + 7.7);
}

export function asWeather(w, asked, now) {
  const k = strength(asked, now);
  if (!w || !(k > 0)) return w;
  const rain = Math.max(w.rain, asked.rain * k),
    wind = Math.max(w.wind, asked.wind * k);
  return { ...w, rain, wind, cloud: Math.max(w.cloud, cloudFor(rain)) };
}
