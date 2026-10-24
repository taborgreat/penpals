// The camera (the scene, §1 and §4): one model for both views. The page is a 3D
// scene; 2D is that scene seen straight down through an orthographic camera,
// 3D a perspective camera free to orbit, zoom, fly. Pure maths, no three.js:
// the renderer, capture and tests share it.
//
// The page frame: x to the right, y down the page, z up out of the paper, all
// in page px (ink units). A camera looks at `target` (on the page) from `dist`
// away, turned `az` degrees around the page's normal (0: from below the page,
// the way a letter is read) and raised `el` degrees above the paper (90:
// straight down).
//
//   { mode: '2d' | '3d', target: [x, y], dist, az, el, fov, view }
//     view: in 2D, the page width shown (px); fov: in 3D, the vertical field (deg)

export const MIN_WRITE_EL = 25; // below this elevation writing pauses (a pixel covers too much page); looking goes down to 0°
export const MIN_DIST = 0.3; // the closest the camera comes (page px): between the beads

const rad = (d) => (d * Math.PI) / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));

export const camera2d = (pageW, pageH) => ({ mode: '2d', target: [pageW / 2, pageH / 2], dist: Math.max(pageW, pageH) * 1.6, az: 0, el: 90, fov: 40, view: pageW });
export const camera3d = (pageW, pageH) => ({ mode: '3d', target: [pageW / 2, pageH / 2], dist: Math.max(pageW, pageH) * 1.15, az: 0, el: 55, fov: 40, view: pageW });

// Where the camera stands, and which way it looks.
export function frame(cam) {
  const el = Math.min(rad(cam.mode === '2d' ? 90 : Math.min(cam.el, 89.9)), rad(90));
  const az = rad(cam.az);
  const t = [cam.target[0], cam.target[1], 0];
  const back = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
  const eye = add(t, mul(back, cam.dist));
  const forward = norm(mul(back, -1));
  const right = [Math.cos(az), -Math.sin(az), 0];
  const up = cross(forward, right);
  return { eye, forward, right, up };
}

// The ray from the camera through a point of the screen (ndc: −1..1, y up).
export function rayThrough(cam, nx, ny, aspect) {
  const { eye, forward, right, up } = frame(cam);
  if (cam.mode === '2d') {
    const halfW = cam.view / 2;
    const halfH = halfW / aspect;
    return { origin: add(eye, add(mul(right, nx * halfW), mul(up, ny * halfH))), dir: forward };
  }
  const k = Math.tan(rad(cam.fov) / 2);
  return { origin: eye, dir: norm(add(forward, add(mul(right, nx * k * aspect), mul(up, ny * k)))) };
}

// The page point under the screen point (the ray onto the paper, z = 0), or
// null when it does not meet the page (looking away from it). Ink heights are
// far below a stroke's width, so the paper's plane is exact enough.
export function pageAt(cam, nx, ny, aspect) {
  const { origin, dir } = rayThrough(cam, nx, ny, aspect);
  if (dir[2] >= -1e-9) return null;
  const t = -origin[2] / dir[2];
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t];
}

// Where a page point (x, y, z) falls on the screen (ndc), or null behind the camera.
export function project(cam, p, aspect) {
  const { eye, forward, right, up } = frame(cam);
  const v = sub(p, eye);
  if (cam.mode === '2d') {
    const halfW = cam.view / 2;
    return [dot(v, right) / halfW, dot(v, up) / (halfW / aspect)];
  }
  const z = dot(v, forward);
  if (z <= 0) return null;
  const k = Math.tan(rad(cam.fov) / 2);
  return [dot(v, right) / (z * k * aspect), dot(v, up) / (z * k)];
}

export const elevationOf = (cam) => (cam.mode === '2d' ? 90 : Math.min(90, cam.el));
export const canWrite = (cam, min = MIN_WRITE_EL) => elevationOf(cam) >= min;

// Moving the camera (3D).
export const orbit = (cam, dAz, dEl) => ({ ...cam, az: (cam.az + dAz + 360) % 360, el: Math.max(0, Math.min(90, cam.el + dEl)) });
// Closer or further by k; coming closer, the target slides toward `toward` (the page point under the cursor) as much.
export function zoomBy(cam, k, toward = null) {
  if (cam.mode === '2d') return { ...cam, view: Math.max(20, Math.min(20000, cam.view * k)) };
  const dist = Math.max(MIN_DIST, Math.min(20000, cam.dist * k));
  if (!toward || dist >= cam.dist) return { ...cam, dist };
  const s = 1 - dist / cam.dist;
  return { ...cam, dist, target: [cam.target[0] + (toward[0] - cam.target[0]) * s, cam.target[1] + (toward[1] - cam.target[1]) * s] };
}
// Slide the target across the page by a screen-space drag (px of the view's width).
export function panBy(cam, dx, dy, viewPx) {
  const scaleK = (cam.mode === '2d' ? cam.view : 2 * cam.dist * Math.tan(rad(cam.fov) / 2)) / Math.max(1, viewPx);
  const az = rad(cam.az);
  const r = [Math.cos(az), -Math.sin(az)];
  const u = [-Math.sin(az), -Math.cos(az)]; // up the screen, on the page
  return { ...cam, target: [cam.target[0] - (dx * r[0] - dy * u[0]) * scaleK, cam.target[1] - (dx * r[1] - dy * u[1]) * scaleK] };
}
// Fly to a page point (double tap): the target moves there and the camera comes closer.
export const flyTo = (cam, p) => ({ ...cam, target: [p[0], p[1]], dist: Math.max(MIN_DIST, cam.dist * 0.45), view: Math.max(20, cam.view * 0.45) });
// Free flight (keys): forward/back along the view on the page, sideways, up and down.
export function fly(cam, fwd, side, rise) {
  const az = rad(cam.az);
  const ahead = [-Math.sin(az), -Math.cos(az)];
  const r = [Math.cos(az), -Math.sin(az)];
  return { ...cam, target: [cam.target[0] + ahead[0] * fwd + r[0] * side, cam.target[1] + ahead[1] * fwd + r[1] * side], dist: Math.max(MIN_DIST, cam.dist * (1 - rise)) };
}

// The chase in 3D: the camera's target slides along the line by the chase's
// offset, as the flat page would pan by it.
export const chaseFollow = (cam, base, offset) => ({ ...cam, target: [base[0] + offset[0], base[1] + offset[1]] });

// Between two cameras (the 2D/3D switch animates; the page under it does not change).
export function lerpCam(a, b, t) {
  const s = t * t * (3 - 2 * t);
  const l = (x, y) => x + (y - x) * s;
  let dAz = ((b.az - a.az + 540) % 360) - 180;
  return {
    mode: t < 1 ? '3d' : b.mode,
    target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1])],
    dist: l(a.dist, b.dist),
    az: (a.az + dAz * s + 360) % 360,
    el: l(a.mode === '2d' ? 89.9 : a.el, b.mode === '2d' ? 89.9 : b.el),
    fov: l(a.fov, b.fov),
    view: l(a.view, b.view),
  };
}
