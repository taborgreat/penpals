// The light (the scene, §3). A beauty layer only: it never touches facts,
// digests or the record. By the viewer's own clock: the sun low and warm in the
// morning, high and white at noon, long and gold in the evening; at night two
// candles flank the page, one each side, warm and flickering; dusk and dawn
// cross-fade. The viewer can drag the light anywhere; on release it returns to
// the clock.
//
// Directions are in the page frame (x right, y down the page, z up), pointing
// toward the light. Colours are linear 0..1.

const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// A black body's colour (Tanner Helland's fit), linear-ish 0..1.
export function kelvin(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((v) => Math.max(0, Math.min(255, v)) / 255);
}

// The sun at a local time: elevation through the day (6:00 up, 12:00 highest,
// 18:00 down), from the left of the page in the morning to the right at evening.
export function sunAt(date) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const el = 68 * Math.sin((Math.PI * (h - 6)) / 12); // degrees; below 0 at night
  const az = -90 + (180 * (h - 6)) / 12; // −90 left (east) → +90 right (west)
  return lightFrom(az, el, sunKelvin(el));
}
const sunKelvin = (el) => 2200 + 3600 * smooth(0, 35, el); // warm low, white high

export function lightFrom(az, el, k) {
  const e = rad(Math.max(-90, Math.min(90, el)));
  const a = rad(az);
  return { az, el, dir: [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)], color: kelvin(k), intensity: smooth(-4, 10, el) * (0.75 + 0.35 * smooth(10, 60, el)) };
}

// How much the candles are lit (0 day .. 1 night): they come up as the sun sets.
export const candleMix = (sunEl) => 1 - smooth(-8, 4, sunEl);

// A gentle flicker (non-canonical noise): incommensurate waves, never in step
// between the two candles.
export function flicker(t, which) {
  const s = which * 1.618;
  const v = 0.55 * Math.sin(t * 7.3 + s) + 0.3 * Math.sin(t * 13.1 + 2.1 * s) + 0.15 * Math.sin(t * 29.7 + 0.7 * s);
  return 0.86 + 0.14 * v;
}

// Two candles, one each side of the page, about 1800 K, in page px.
export function candlesAt(pageW, pageH, t, mix) {
  const color = kelvin(1800);
  return [-0.35, 1.35].map((fx, i) => ({
    pos: [pageW * fx, pageH * 0.45, Math.max(pageW, pageH) * 0.32],
    color,
    intensity: mix * flicker(t, i),
  }));
}

// Everything the renderer needs at a moment: the clock's light, or the one the
// viewer is dragging (override: { az, el }), easing back to the clock after release.
export function lightAt(date, t, pageW, pageH, override = null) {
  const sun = override ? lightFrom(override.az, override.el, sunKelvin(override.el)) : sunAt(date);
  const mix = override ? 0 : candleMix(sun.el);
  return {
    sun,
    candles: candlesAt(pageW, pageH, t, mix),
    ambient: 0.22 + 0.18 * (1 - mix) * smooth(-4, 30, sun.el) + 0.06 * mix,
    night: mix,
  };
}

// Easing a dragged light back to the clock's.
export function returnTo(from, to, k) {
  const s = k * k * (3 - 2 * k);
  const dAz = ((to.az - from.az + 540) % 360) - 180;
  return { az: from.az + dAz * s, el: from.el + (to.el - from.el) * s };
}
