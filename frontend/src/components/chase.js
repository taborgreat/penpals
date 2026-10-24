// The chase: a follow camera for handwriting, used by write mode (WriteMode.jsx).
//
// The writer's thumb (or mouse) only does the circle of the letters; the chase
// supplies the line. The page moves only when the writer acts: every bit of
// rightward movement inside the chase zone slides the page by the same amount
// (times RATE), but only on connecting strokes: when the pen is heading more
// sideways than up (flatter than CONNECT_DEG). The steep strokes of a letter,
// like going up the side of an a or o, hold the page still and land at the
// writer's own angle. Pausing, moving left, or lifting the pen moves nothing. There
// is no time in it at all: no timers, no smoothing, no easing. Its only input
// is the writer's own movement, event by event, so it always matches their rate.
//
// Two spaces: screen (CSS px on the glass, relative to the view) and page
// (where the ink lives, page px). The camera connects them:
//   page_x = screen_x / zoom + cam      page_y = screen_y / zoom + camY
// Ink is always stored in page coordinates; the camera is a view, never part of the letter.
//
// The one exception to "the camera never moves left" is the line reset, the
// existing end-of-line feature: lifting in the end zone at the end of a line
// and pausing jumps to the start of the next line. That pause is the only
// timer here, and it belongs to the reset, not to the chase.

// The knobs, all in one place, to be felt out on the phone. These are the
// defaults; the chase settings panel (ChaseSettings.jsx) changes them live in
// CHASE and remembers them on this device.
export const CHASE_DEFAULTS = {
  RATE: 1.0, // 1 = the line matches the thumb exactly; lower = tighter, more overlapping loops
  FLIP: false, // false = moving right moves the page (the spec); true = moving left does, to try (downstrokes then land upright)
  CONNECT_DEG: 45, // the page moves only while the pen heads flatter than this (0 = flat, 90 = straight up; 90 = any rightward move)
  HEADING_PX: 8, // the pen's heading is read over its last this many screen px (a distance, not a time), so jitter doesn't flick it
  PHONE_MAX_WIDTH: 700, // a view narrower than this (CSS px) is a phone
  ZONE_PHONE: 0.25, // where the chase zone starts on a phone, as a share of the view width
  ZONE_DESKTOP: 0.72, // and on a full screen
  SLANT_DEG: 55, // slant guide angle when the nib has no slant of its own (a flex nib's slant is used if it has one)
  SLANT_GUIDES: true, // faint guide lines at the slant, drawn on the page so they slide with it
  // Zoom, as one ruled line's height on screen in CSS px (zoom = this / line height in page px).
  ZOOM_MIN: 90, // never smaller: you can't make letters small
  ZOOM_MAX: 380, // never bigger: you need to see what's around the letter
  ZOOM_PHONE: 230, // where a phone starts
  ZOOM_DESKTOP: 120, // where a full screen starts
  RESET_EDGE: 'page', // what ends a line: 'page' = the page's line end, 'view' = the view's right edge
  END_MM: 14, // 'page': the end-of-line zone, the last this many mm of the line
  VIEW_EDGE: 0.1, // 'view': the end-of-line zone, this share of the view at its right edge
  GLOW_ZONES: 3, // the end zone starts to redden this many zone widths before it
  LINE_RESET_PAUSE: 900, // milliseconds of stillness after lifting in the end zone before the next line
  LINE_START_MM: 6, // lines start this far in from the page's left edge
  LINE_START_INSET: 28, // and that point sits this far (CSS px) in from the view's left edge
  BASELINE_AT: 0.6, // the line being written sits this far down the view
  TOP_ROOM: 76, // but the page's top edge comes no lower than this (CSS px), so the first lines aren't half desk
  SHOW_ZONE: false, // tint the chase zone (for tuning)
};

const STORE_KEY = 'penpals.chase.v7'; // v7: the chase in write mode

export const CHASE = { ...CHASE_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  for (const k of Object.keys(CHASE_DEFAULTS)) if (typeof saved[k] === typeof CHASE_DEFAULTS[k]) CHASE[k] = saved[k];
} catch {
  /* the defaults, then */
}

// Change knobs (all of them with CHASE_DEFAULTS) and remember them.
export function setChase(next) {
  Object.assign(CHASE, next);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(CHASE));
  } catch {
    /* they just won't be remembered */
  }
  return { ...CHASE };
}

export const isPhone = (viewW) => viewW < CHASE.PHONE_MAX_WIDTH;

// The screen x where the chase zone starts. Same rule everywhere; only this changes with the view width.
export const zoneStart = (viewW) => viewW * (isPhone(viewW) ? CHASE.ZONE_PHONE : CHASE.ZONE_DESKTOP);

// Zoom (screen px per page px) for a line `linePx` tall on screen, clamped to the middle ground.
export const clampLinePx = (linePx) => Math.min(CHASE.ZOOM_MAX, Math.max(CHASE.ZOOM_MIN, linePx));
export const zoomFor = (linePx, spacing) => clampLinePx(linePx) / spacing;

export const toPage = (cam, x, y) => ({ x: x / cam.zoom + cam.cam, y: y / cam.zoom + cam.camY });

// Pen down at screen (x, y): sets the starting point. Never moves the camera.
export function penDown(cam, x, y) {
  cam.prevX = x;
  cam.trail = [{ x, y }];
  return { cam: cam.cam, camY: cam.camY, line: cam.line }; // the stroke's cam_before, for undo
}

// Step 4 of the movement handler: remember where the pen is (screen px).
export function penAt(cam, x, y) {
  cam.prevX = x;
  cam.trail ??= [];
  cam.trail.push({ x, y });
  if (cam.trail.length > 256) cam.trail.splice(0, 128);
}

// Whether the pen, now at screen (x, y), is on a connecting stroke: heading
// flatter than CONNECT_DEG, read from the trail HEADING_PX back. Too little
// trail to tell (just after the pen lands) counts as not connecting.
function connecting(cam, x, y) {
  if (CHASE.CONNECT_DEG >= 90) return true;
  const trail = cam.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    const vx = x - trail[i].x;
    const vy = y - trail[i].y;
    if (Math.hypot(vx, vy) >= CHASE.HEADING_PX) return (Math.atan2(Math.abs(vy), Math.abs(vx)) * 180) / Math.PI <= CHASE.CONNECT_DEG;
  }
  return false;
}

// One pointer movement to screen (x, y): the whole chase. In the movement
// handler, per coalesced event and in this order: 1. chase() moves the camera,
// 2. convert the point with the new camera, 3. store the ink, 4. penAt().
// Only the part of the movement that is rightward (leftward with FLIP), inside
// the zone (right of `start`) and on a connecting stroke counts. `camMax` is
// where the page's end meets the view's right edge: the chase stops there and
// the line reset takes over. The page always moves the same way; never back.
export function chase(cam, x, y, start, camMax) {
  const dx = Math.max(x, start) - Math.max(cam.prevX ?? x, start); // the movement inside the zone
  const push = CHASE.FLIP ? -dx : dx;
  if (push > 0 && connecting(cam, x, y)) cam.cam = Math.max(cam.cam, Math.min(cam.cam + (push / cam.zoom) * CHASE.RATE, camMax));
}

// The camera at the start of line `line`, in a view `viewH` tall.
export function lineStart(cam, line, rows, viewH, pxPerMm) {
  cam.line = line;
  cam.cam = CHASE.LINE_START_MM * pxPerMm - CHASE.LINE_START_INSET / cam.zoom;
  cam.camY = Math.max(rows[line] - (viewH * CHASE.BASELINE_AT) / cam.zoom, -CHASE.TOP_ROOM / cam.zoom);
}

// How red the end zone is, 0..1, with the pen at page x `px` / screen x `sx`.
// It deepens all the way in to the zone, so the closer you are, the redder.
export function endGlow(px, sx, { pageW, viewW, pxPerMm }) {
  if (CHASE.RESET_EDGE === 'view') {
    const zone = CHASE.VIEW_EDGE * viewW;
    return ramp(viewW - zone - sx, zone);
  }
  const zone = CHASE.END_MM * pxPerMm;
  return ramp(pageW - zone - px, zone);
}

function ramp(before, zone) {
  if (before <= 0) return 1;
  const t = Math.max(0, 1 - before / (zone * CHASE.GLOW_ZONES));
  return t * t;
}

// Whether a stroke that ended at page x `px` / screen x `sx` ended in the end zone.
export const inEndZone = (px, sx, dims) => endGlow(px, sx, dims) >= 1;
