// Shared machinery for the handwritten labels, so a page full of them costs
// one animation loop, one intersection observer and one resize observer.

const STAGGER = 70; // ms between labels writing in together
const MAX_STAGGER = 900;

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// How fast labels write, set by the footer's slider; remembered on this device.
// A first visit writes slowly, so a newcomer can take in that it's all handwritten;
// later visits use the default, and a speed picked on the slider always wins.
const SPEED_KEY = 'penpals.writeSpeed';
const VISITED_KEY = 'penpals.visited';
const DEFAULT_SPEED = 0.75; // a touch slower than written-out-quick, so you can watch it
const FIRST_VISIT_SPEED = 0.25;
let speed = DEFAULT_SPEED;
try {
  const picked = Number(localStorage.getItem(SPEED_KEY));
  if (picked) speed = picked;
  else if (!localStorage.getItem(VISITED_KEY)) speed = FIRST_VISIT_SPEED;
  localStorage.setItem(VISITED_KEY, '1');
} catch {
  /* the default */
}
export const getWriteSpeed = () => speed;
export function setWriteSpeed(v) {
  speed = v;
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    /* not remembered */
  }
}

// How long a label takes to write: quicker than it was written, within bounds,
// then at the chosen speed.
export const playMs = (dur) => Math.min(1100, Math.max(280, dur * 0.45)) / speed;

// One requestAnimationFrame loop for every label being written.
// A player is { draw(progress 0..1) }.
const playing = new Map(); // player → { t0, ms }
let raf = 0;

// A label that fails to draw is dropped on its own: the loop always carries on
// for the rest, or one bad frame would leave every label after it blank.
function tick(now) {
  try {
    for (const [p, run] of playing) {
      const k = Math.min(1, Math.max(0, (now - run.t0) / run.ms));
      try {
        p.draw(k);
      } catch (err) {
        console.error('handwriting: could not draw a label', err);
        playing.delete(p);
        continue;
      }
      if (k >= 1) playing.delete(p);
    }
  } finally {
    raf = playing.size ? requestAnimationFrame(tick) : 0;
  }
}

export function play(player, ms) {
  playing.set(player, { t0: performance.now(), ms });
  if (!raf) raf = requestAnimationFrame(tick);
}

export const isPlaying = (player) => playing.has(player);
export const stop = (player) => playing.delete(player);

// Call back the first time an element comes into view. Labels seen together
// are called top to bottom, left to right, a little apart, so a page writes in.
const waiting = new Map(); // element → callback
let viewer = null;

export function onFirstView(el, cb) {
  viewer ??= new IntersectionObserver((entries) => {
    const seen = entries
      .filter((e) => e.isIntersecting && waiting.has(e.target))
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    seen.forEach((e, i) => {
      const fn = waiting.get(e.target);
      waiting.delete(e.target);
      viewer.unobserve(e.target);
      setTimeout(fn, Math.min(i * STAGGER, MAX_STAGGER));
    });
  });
  waiting.set(el, cb);
  viewer.observe(el);
  return () => {
    waiting.delete(el);
    viewer.unobserve(el);
  };
}

// Call back when an element changes size (e.g. the font size changes).
const sized = new Map(); // element → callback
let sizer = null;

export function onResize(el, cb) {
  sizer ??= new ResizeObserver((entries) => {
    for (const e of entries) sized.get(e.target)?.();
  });
  sized.set(el, cb);
  sizer.observe(el);
  return () => {
    sized.delete(el);
    sizer.unobserve(el);
  };
}
