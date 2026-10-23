import { useCallback, useEffect, useRef, useState } from 'react';

// Adaptive chase: when zoomed in on the pad, the page keeps your writing in
// comfortable view so you never stop to scroll.
//
// 1. While the pen is down near a side edge, the page eases out around the
//    pen tip at the rate that keeps the same room in view ahead of it, so a
//    stroke can carry on. Carrying a stroke further needs exponentially more
//    zooming out, so it stops at `zoomOut`% (40 by default, where writing is
//    still comfortable; 100 = as far as it takes; 0 = off), and the slide on
//    lifting does the rest. The pen tip is the fixed point, so the stroke is
//    never thrown off.
// 2. When the pen lifts in the edge zone, the page eases back to your zoom
//    and slides so where you were writing sits `land`% in from that edge.
//    Nothing chases up and down: a line has room for its ascenders and descenders.
// 3. End of line: lifting within `endMm` of the page's end, then pausing for
//    `resetMs`, jumps to the start of the next line, like a typewriter's
//    carriage return. Putting the pen down during the pause cancels it. The
//    end zone on the page reddens as the pen nears it and fills during the pause.
//    `dir` says which side lines start on; `margin` is how far in.
// 4. Return zone: with the pen up, moving into the start-side edge (or
//    pressing there) also goes back to the start of the line.
//
// The ease is a CSS transform on the page, not a real zoom: nothing is laid
// out again or scrolled while the pen is down, so strokes are never thrown
// off, and pointer positions map through the transform exactly. Slides are a
// scroll plus a transform that starts where the picture was and animates
// away, so they can be finished instantly when the pen comes down.

export const CHASE_DEFAULTS = {
  on: false, dir: 'ltr', edge: 22, zoomOut: 40, land: 30, endMm: 20, resetMs: 900, grab: 8, margin: 0,
};
const STORE_KEY = 'penpals.chase.v6'; // v6: follows while writing, but only eases out so far (40%)
const SLIDE_MS = 240;
const LINE_START_INSET = 24; // px between the edge of the view and the line start after a return
const MIN_ROOM = 0.25; // of an edge zone: the least room kept ahead of the pen, even starting right at an edge
const EASE_RATE = 0.35; // share of the way to the wanted scale taken per pen event, so easing is never a jolt
const EASE_PER_SEC = 1; // just after the pen lands, the fastest it eases out: about 60% smaller per second
const SETTLE_MS = 350; // how long after the pen lands that limit holds (a pen put down at an edge eases in gently)
const MIN_SCALE = 0.12; // never smaller than this
const END_GLOW_ZONES = 3; // the end zone starts to redden this many zone widths before it

function loadSettings() {
  try {
    return { ...CHASE_DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...CHASE_DEFAULTS };
  }
}

// The part of the pad you can actually see, in viewport px: inside the window
// (not under its scrollbars) and below the sticky bar.
function visible(view, bar) {
  const r = view.getBoundingClientRect();
  const doc = document.documentElement;
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, doc.clientWidth);
  const top = Math.max(r.top, bar ? bar.getBoundingClientRect().bottom : 0, 0);
  const bottom = Math.min(r.bottom, doc.clientHeight);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function setTransform(el, tx, ty, s) {
  el.style.transformOrigin = '0 0';
  el.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
}

const NO_EASE = { tx: 0, ty: 0, s: 1 };

// `getLine()` → { step, lineMode }: one line's height in CSS px at the current
// zoom, and whether line mode is on (a return then also drops a line).
// `endZoneRef` is the end-of-line zone drawn on the page.
export function useChase({ viewRef, pageRef, barRef, endZoneRef, pageWidth, pxPerMm, getLine, active = true }) {
  const [settings, setSettings] = useState(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = active ? settings : { ...settings, on: false }; // inactive: as if switched off
  const easeRef = useRef(null); // { tx, ty, s, room } once the pen has come near an edge in this stroke
  const slideRef = useRef(0); // timer of the slide in progress
  const resetRef = useRef(0); // timer of a pending end-of-line return

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch { /* settings just won't be remembered */ }
  }, [settings]);

  useEffect(() => () => {
    clearTimeout(slideRef.current);
    clearTimeout(resetRef.current);
  }, []);

  const box = useCallback(() => visible(viewRef.current, barRef.current), [viewRef, barRef]);

  // The end zone's redness, 0..1, with an optional fade time.
  const glow = useCallback((amount, ms = 120) => {
    const el = endZoneRef.current;
    if (!el) return;
    el.style.transition = `opacity ${ms}ms linear`;
    el.style.opacity = String(amount);
  }, [endZoneRef]);

  // The pen is at page x `px` (null = off the pad): redden the end zone as it nears.
  const track = useCallback((px) => {
    const c = settingsRef.current;
    if (resetRef.current || !c.on || !c.endMm) return;
    if (px == null) {
      glow(0, 300);
      return;
    }
    const zone = c.endMm * pxPerMm;
    const toEnd = c.dir !== 'rtl' ? pageWidth - px : px;
    const t = Math.min(1, Math.max(0, 1 - (toEnd - zone) / (zone * END_GLOW_ZONES)));
    glow(0.15 + 0.5 * t * t);
  }, [glow, pageWidth, pxPerMm]);

  const cancelReset = useCallback(() => {
    if (!resetRef.current) return;
    clearTimeout(resetRef.current);
    resetRef.current = 0;
    endZoneRef.current?.classList.remove('pending');
    glow(0.3, 150);
  }, [endZoneRef, glow]);

  // End any slide now and drop a pending return, so the page is still before the pen lands.
  const finishGlide = useCallback(() => {
    cancelReset();
    clearTimeout(slideRef.current);
    slideRef.current = 0;
    const el = pageRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = 'none';
  }, [pageRef, cancelReset]);

  // Scroll by (dx, dy) and animate from the picture as it was (`from` is the
  // ease it was drawn with) to the page at its new place at scale 1.
  const slide = useCallback((dx, dy, from = NO_EASE) => {
    const el = pageRef.current;
    const v = viewRef.current;
    const left = v.scrollLeft;
    const top = window.scrollY;
    if (dx) v.scrollLeft = left + dx;
    if (dy) window.scrollTo(window.scrollX, top + dy);
    const mx = v.scrollLeft - left; // what the scrolls really did, after clamping
    const my = window.scrollY - top;
    clearTimeout(slideRef.current);
    if (Math.abs(mx) < 0.5 && Math.abs(my) < 0.5 && from.s === 1 && !from.tx && !from.ty) {
      el.style.transform = 'none';
      slideRef.current = 0;
      return;
    }
    el.style.transition = 'none';
    setTransform(el, from.tx + mx, from.ty + my, from.s);
    el.getBoundingClientRect(); // commit the starting picture
    el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
    el.style.transform = 'none';
    slideRef.current = setTimeout(() => {
      slideRef.current = 0;
      el.style.transition = 'none';
    }, SLIDE_MS + 30);
  }, [pageRef, viewRef]);

  // Back to the start of the line; `down` px lower when moving on to the next line.
  const toLineStart = useCallback((down) => {
    const c = settingsRef.current;
    const ltr = c.dir !== 'rtl';
    const vis = box();
    const page = pageRef.current.getBoundingClientRect();
    const inset = ((c.margin * pxPerMm) / pageWidth) * page.width;
    const start = ltr ? page.left + inset : page.right - inset;
    const want = ltr ? vis.left + LINE_START_INSET : vis.right - LINE_START_INSET;
    const dx = ltr ? Math.min(0, start - want) : Math.max(0, start - want);
    if (Math.abs(dx) < 1 && !down) return false;
    slide(dx, down);
    return true;
  }, [box, pageRef, slide, pageWidth, pxPerMm]);

  // Pen down or moving at (x, y). Near an edge with more page beyond it, ease
  // out at the rate that keeps the room ahead of the pen: a whole edge zone, or
  // what there was when the pen came near that edge if it started closer, so
  // putting the pen down at an edge doesn't jolt the page. The scale moves
  // part of the way per event, and no faster than EASE_PER_SEC, so it always
  // eases rather than jumps; if the pen gets to the edge first, the slide on
  // lifting catches up. Each step
  // scales around the pen, so the point under it never moves.
  const follow = useCallback((x, y) => {
    const c = settingsRef.current;
    if (!c.on || c.zoomOut <= 0) return;
    const el = pageRef.current;
    const vis = box();
    const page = el.getBoundingClientRect(); // as drawn, through any ease
    const now = performance.now();
    const ease = easeRef.current ?? { ...NO_EASE, room: {}, t: now, t0: now };
    const zx = (c.edge / 100) * vis.width;
    const edges = [
      ['right', page.right > vis.right + 1, vis.right - x, page.right - x, zx],
      ['left', page.left < vis.left - 1, x - vis.left, x - page.left, zx],
    ];
    // Page in view beyond the pen toward an edge is (distance on screen) / scale.
    // Keep `room` of it in view, or all that's left of the line if that's less,
    // which means scale ≤ distance / room.
    let want = Infinity;
    for (const [side, more, d, toEnd, zone] of edges) {
      if (!more || (d >= zone && ease.room[side] === undefined)) continue;
      ease.room[side] ??= Math.max(MIN_ROOM * zone, Math.min(zone, Math.max(0, d) / ease.s));
      const room = Math.min(ease.room[side], Math.max(0, toEnd) / ease.s);
      if (room > 0) want = Math.min(want, Math.max(0, d) / room);
    }
    if (want === Infinity) return;
    easeRef.current = ease;
    const floor = Math.max(1 - c.zoomOut / 100, MIN_SCALE);
    const target = Math.max(floor, Math.min(ease.s, want));
    const dt = Math.min(50, now - ease.t) / 1000;
    ease.t = now;
    const fastest = now - ease.t0 < SETTLE_MS ? ease.s * Math.exp(-EASE_PER_SEC * dt) : 0;
    const s = Math.max(fastest, ease.s + (target - ease.s) * EASE_RATE);
    const k = s / ease.s;
    if (k > 0.9995) return;
    // Scale by k around the pen: the point under the pen stays put.
    const Rx = page.left - ease.tx;
    const Ry = page.top - ease.ty;
    ease.tx = (x - Rx) * (1 - k) + k * ease.tx;
    ease.ty = (y - Ry) * (1 - k) + k * ease.ty;
    ease.s = s;
    el.style.transition = 'none';
    setTransform(el, ease.tx, ease.ty, ease.s);
  }, [box, pageRef]);

  // Pen lifted; (px, py) is the stroke's last point in page px. Ease back to
  // the real zoom, slide the writing in from any edge it is near, and at the
  // end of the line, start the countdown to the next one.
  const settle = useCallback((px, py) => {
    const ease = easeRef.current;
    easeRef.current = null;
    const c = settingsRef.current;
    if (!c.on) return;
    const from = ease ?? NO_EASE;
    const vis = box();
    const page = pageRef.current.getBoundingClientRect();
    const k = page.width / from.s / pageWidth; // CSS px per page px at the real zoom
    const ux = page.left - from.tx + px * k; // where the point will be once the ease is gone
    const zx = (c.edge / 100) * vis.width;
    const land = c.land / 100;
    let dx = 0;
    if (ux > vis.right - zx) dx = ux - (vis.left + land * vis.width);
    else if (ux < vis.left + zx) dx = ux - (vis.right - land * vis.width);
    if (ease || dx) slide(dx, 0, from);

    const left = c.dir !== 'rtl' ? pageWidth - px : px; // page px to the end of the line
    if (c.endMm > 0 && left < c.endMm * pxPerMm) {
      clearTimeout(resetRef.current);
      endZoneRef.current?.style.setProperty('--pending-y', `${py * k}px`); // the label sits on the line just written
      endZoneRef.current?.classList.add('pending');
      glow(0.95, c.resetMs); // fills over the pause
      resetRef.current = setTimeout(() => {
        resetRef.current = 0;
        endZoneRef.current?.classList.remove('pending');
        glow(0, 300);
        toLineStart(getLine().step);
      }, c.resetMs);
    }
  }, [box, pageRef, endZoneRef, glow, slide, toLineStart, getLine, pageWidth, pxPerMm]);

  // A stroke that ended without lifting normally (turned into a two-finger scroll).
  const cancel = useCallback(() => {
    const ease = easeRef.current;
    easeRef.current = null;
    if (ease) slide(0, 0, ease);
  }, [slide]);

  // Pen up at x: in the return zone at the start side, go back to the start of
  // the line (and down one in line mode). Returns true if it did, so a press
  // there can be kept from starting a stroke.
  const maybeReturn = useCallback((x) => {
    const c = settingsRef.current;
    if (!c.on || c.grab <= 0 || slideRef.current || easeRef.current) return false;
    const ltr = c.dir !== 'rtl';
    const vis = box();
    const zone = (c.grab / 100) * vis.width;
    if (ltr ? x > vis.left + zone : x < vis.right - zone) return false;
    const page = pageRef.current.getBoundingClientRect();
    const hidden = ltr ? page.left < vis.left - 1 : page.right > vis.right + 1; // the line start is out of view
    if (!hidden) return false;
    cancelReset();
    const line = getLine();
    return toLineStart(line.lineMode ? line.step : 0);
  }, [box, pageRef, toLineStart, getLine, cancelReset]);

  return { settings, setSettings, follow, settle, cancel, maybeReturn, finishGlide, track };
}
