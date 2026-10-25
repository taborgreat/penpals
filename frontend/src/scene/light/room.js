// The room (light-waves §4): the page sits on a table in a small room, plaster
// walls, a wood floor, a ceiling and one window. This is the room's shape only:
// its surfaces, the patches the light is solved over, and which patches see
// which (the form factors). Nothing about the surfaces' cells is here (they are
// grown in the shader from a seed, surface.js); nothing about light either (the
// sources and every patch's absorption are runtime inputs, direct.js and
// bounce.js). A build script (frontend/scripts/room.mjs) bakes the shape when
// the site is built: same input, identical files.
//
// The room frame: metres, x to the seated writer's right, y away from the
// writer toward the window, z up, the floor at z = 0. The page frame (page px,
// x right, y down the page toward the writer, z up: camera.js, engine.js) lies
// on the table: room = pageOrigin + (px, −py, pz) / PX_PER_M, pageOrigin being
// the page's top-left corner (far left as the writer sees it). A direction in
// the page frame (dx, dy, dz) is (dx, −dy, dz) in the room's.
//
// Every surface is an axis-aligned rectangle with unit axes u and v (u runs
// along the wood's grain where there is one) and its own normal into the room
// (or out of the table's slab). Each is cut into patches on a grid whose lines
// fall on the window's and the page's edges: the window opening becomes 3 × 3
// openings (light goes out through them and the sky comes in), the page is
// exactly one patch cut out of the table top. The table's legs are visual
// only: the light's geometry leaves them out.

export const PX_PER_M = 1400 / 0.2159; // page px a metre (nibs.js: 1400 px across a letter-width page)
const PAGE_PX_W = 1400;
export const PAPER_PX = 3; // the paper's thickness in page px (engine.js SLAB_PX)

const freeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
};

// The room as built by default (Tabor's to set): about 10 × 11 ft, an 8 ft
// ceiling, one window in the far wall centred on the table, the table against
// that wall, the page on it in front of the seat.
export const ROOM = freeze({
  size: [3.048, 3.353, 2.438], // across, from the seat's wall to the window's, floor to ceiling
  window: { width: 1.0, sill: 0.9, head: 2.1, split: [3, 3] }, // a thin wall: no reveal
  door: { x: 0.35, width: 0.9, height: 2.03, split: [1, 2] }, // in the wall behind the seat, on its left (outside.md Phase 4)
  table: { width: 1.4, depth: 0.75, top: 0.74, thick: 0.04, gap: 0.02 }, // gap: from the far wall
  page: { size: [0.2159, 0.2794], fromNear: 0.1 }, // letter; its near edge from the table's near edge
  candles: [[-0.35, 0.45], [1.35, 0.45]], // light.js candlesAt: fractions of the page's width and height
  patch: 0.5, // patch edge to aim for
});

const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
const neg = (a) => a.map((v) => -v);
const at = (o, u, a, v, b) => [0, 1, 2].map((k) => o[k] + u[k] * a + v[k] * b);

// Grid lines over [0, len]: every hole's edges, each stretch between cut into
// pieces no longer than `target`, a hole's own stretch into its split.
function gridLines(len, spans, target) {
  const edges = [0, len];
  for (const [a, b] of spans) edges.push(a, b);
  edges.sort((a, b) => a - b);
  const cuts = edges.filter((e, i) => i === 0 || e - edges[i - 1] > 1e-9);
  const out = [0];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    const span = spans.find(([s0, s1]) => Math.abs(s0 - a) < 1e-9 && Math.abs(s1 - b) < 1e-9);
    const k = span ? span[2] : Math.max(1, Math.ceil((b - a) / target - 1e-9));
    for (let j = 1; j < k; j++) out.push(a + ((b - a) * j) / k);
    out.push(b);
  }
  return out;
}

// The room's shape: surfaces, patches, openings, the page's patch, the candles'
// spots and the page's place. Pure data (it survives JSON).
export function roomGeometry(spec = ROOM) {
  const [W, D, H] = spec.size;
  const cx = W / 2;
  const win = { x0: cx - spec.window.width / 2, x1: cx + spec.window.width / 2, z0: spec.window.sill, z1: spec.window.head };
  const door = spec.door ? { x0: spec.door.x, x1: spec.door.x + spec.door.width, z0: 0, z1: spec.door.height } : null;
  const t = spec.table;
  const tb = { x0: cx - t.width / 2, x1: cx + t.width / 2, y1: D - t.gap, y0: D - t.gap - t.depth, top: t.top, bottom: t.top - t.thick };
  const [pw, ph] = spec.page.size;
  const pg = { x0: cx - pw / 2, x1: cx + pw / 2, y0: tb.y0 + spec.page.fromNear, y1: tb.y0 + spec.page.fromNear + ph };
  const pageOrigin = [pg.x0, pg.y1, tb.top + PAPER_PX / PX_PER_M]; // the paper's top (engine.js: the table lies SLAB_PX below it)

  // holes: [u0, u1, v0, v1, kind, [su, sv]]
  const S = (id, kind, matter, origin, u, v, size, normal, holes = []) => ({ id, kind, matter, origin, u, v, size, normal, holes });
  const surfaces = [
    S('floor', 'floor', 'floor', [0, 0, 0], Y, X, [D, W], Z), // the boards run the room's length
    S('ceiling', 'ceiling', 'plaster', [0, 0, H], X, Y, [W, D], neg(Z)),
    S('wall-near', 'wall', 'plaster', [0, 0, 0], X, Z, [W, H], Y, door ? [[door.x0, door.x1, door.z0, door.z1, 'door', spec.door.split]] : []),
    S('wall-far', 'wall', 'plaster', [0, D, 0], X, Z, [W, H], neg(Y), [[win.x0, win.x1, win.z0, win.z1, 'window', spec.window.split]]),
    S('wall-left', 'wall', 'plaster', [0, 0, 0], Y, Z, [D, H], X),
    S('wall-right', 'wall', 'plaster', [W, 0, 0], Y, Z, [D, H], neg(X)),
    S('table-top', 'table', 'table', [tb.x0, tb.y0, tb.top], X, Y, [t.width, t.depth], Z, [[pg.x0 - tb.x0, pg.x1 - tb.x0, pg.y0 - tb.y0, pg.y1 - tb.y0, 'page', [1, 1]]]),
    S('table-bottom', 'table', 'table', [tb.x0, tb.y0, tb.bottom], X, Y, [t.width, t.depth], neg(Z)),
    S('table-near', 'table', 'table', [tb.x0, tb.y0, tb.bottom], X, Z, [t.width, t.thick], neg(Y)),
    S('table-far', 'table', 'table', [tb.x0, tb.y1, tb.bottom], X, Z, [t.width, t.thick], Y),
    S('table-left', 'table', 'table', [tb.x0, tb.y0, tb.bottom], Y, Z, [t.depth, t.thick], neg(X)),
    S('table-right', 'table', 'table', [tb.x1, tb.y0, tb.bottom], Y, Z, [t.depth, t.thick], X),
  ];

  const patches = [];
  const openings = [];
  let page = -1;
  const out = surfaces.map((s, k) => {
    const us = gridLines(s.size[0], s.holes.map((h) => [h[0], h[1], h[5][0]]), spec.patch);
    const vs = gridLines(s.size[1], s.holes.map((h) => [h[2], h[3], h[5][1]]), spec.patch);
    const cells = [];
    for (let j = 1; j < vs.length; j++) {
      for (let i = 1; i < us.length; i++) {
        const rect = [us[i - 1], us[i], vs[j - 1], vs[j]];
        const uc = (rect[0] + rect[1]) / 2, vc = (rect[2] + rect[3]) / 2;
        const hole = s.holes.find((h) => uc > h[0] && uc < h[1] && vc > h[2] && vc < h[3]);
        const p = {
          surface: k,
          rect,
          center: at(s.origin, s.u, uc, s.v, vc),
          normal: s.normal,
          area: (rect[1] - rect[0]) * (rect[3] - rect[2]),
          kind: hole ? hole[4] : s.kind,
          matter: hole ? (hole[4] === 'window' ? 'glass' : hole[4] === 'door' ? 'wood' : 'paper') : s.matter,
        };
        if (hole?.[4] === 'window' || hole?.[4] === 'door') {
          cells.push(-1 - openings.length);
          openings.push(p);
        } else if (hole?.[4] === 'page') {
          if (page < 0) {
            page = patches.length;
            patches.push(p);
          }
          cells.push(page);
        } else {
          cells.push(patches.length);
          patches.push(p);
        }
      }
    }
    const { holes, ...rest } = s;
    return { ...rest, grid: { u: us, v: vs, cells } };
  });

  const pageH = (PAGE_PX_W * ph) / pw;
  const candles = spec.candles.map(([fx, fy]) => {
    const [x, y] = pageToRoom([fx * PAGE_PX_W, fy * pageH, 0], pageOrigin);
    return [x, y, tb.top]; // standing on the table, beside the paper
  });
  return { units: 'm', size: [W, D, H], window: win, door, table: tb, pageRect: pg, pageOrigin, pxPerM: PX_PER_M, surfaces: out, patches, openings, page, candles, objects: objectsOf(spec, win, tb, candles) };
}

// The room's things that the light's geometry leaves out (too small to matter
// to the bounce) but the eye sees and the being bumps into: the table's legs,
// the window's frame, the candles' holders. Each is matter at the paper's
// grain like the surfaces. Boxes are [x0, y0, z0, x1, y1, z1]; a holder is a
// dish, a short cylinder (the candle in it is the candle's own state, candle.js).
export const LEG = 0.05; // m a side
export const FRAME = { width: 0.05, depth: 0.06, sill: 0.12 }; // the frame's members, and how far the inner sill reaches into the room
export const PANE = 0.004; // the window's glass, this thick (m)
export const HOLDER = { radius: 0.045, height: 0.015 };
// The stamper (rooms.md §3b): its brass face's radius and its wooden handle's height (m), and where it
// lies when the room is made with it: left of the page, toward the writer (clear of the candle's holder).
export const STAMPER = { face: 0.015, handle: 0.07 };
export const stamperRestOf = (geom) => [geom.pageRect.x0 - 0.05, geom.pageRect.y0 + 0.03, geom.table.top];
// The pens (rooms.md §3c; law/room.js PENS: a plain pen, a flex nib, a broad nib): a wooden body and a
// nib of brass, each lying right of the page toward the writer, side by side, its nib to the right
// (clear of the candle's holder); and the ink jar beyond them (glass and oak gall ink).
export const PEN = { length: 0.12, thick: 0.009, tine: 0.012, tineW: 0.0012, apart: 0.03 };
export const penRestOf = (geom, k) => [geom.pageRect.x1 + 0.08, geom.pageRect.y0 + 0.02 + k * PEN.apart, geom.table.top];
export const JAR = { radius: 0.025, height: 0.06, wall: 0.003 }; // (its glass a wall this thick)
export const jarRestOf = (geom) => [geom.pageRect.x1 + 0.08 + PEN.length / 2 + JAR.radius + 0.02, geom.pageRect.y0 + 0.04, geom.table.top];
// The key corner (one-world.md): behind the chair on the right, clear of the shelf, a wooden
// stand (how far in from the corner, a side, its height) and on it a small brass box (your keys).
export const CORNER = { at: 0.4, side: 0.3, height: 0.95, box: [0.1, 0.07, 0.05] };
export const cornerOf = (geom) => [geom.size[0] - CORNER.at, CORNER.at];
function objectsOf(spec, win, tb, candles) {
  const [W, D] = spec.size;
  const inset = 0.04;
  const legs = [[tb.x0 + inset, tb.y0 + inset], [tb.x1 - inset - LEG, tb.y0 + inset], [tb.x0 + inset, tb.y1 - inset - LEG], [tb.x1 - inset - LEG, tb.y1 - inset - LEG]]
    .map(([x, y], k) => ({ id: `leg-${k}`, kind: 'leg', matter: 'table', box: [x, y, 0, x + LEG, y + LEG, tb.bottom] }));
  const f = FRAME.width, d = D - FRAME.depth;
  const frame = [
    { id: 'frame-head', box: [win.x0 - f, d, win.z1, win.x1 + f, D, win.z1 + f] },
    { id: 'frame-left', box: [win.x0 - f, d, win.z0, win.x0, D, win.z1] },
    { id: 'frame-right', box: [win.x1, d, win.z0, win.x1 + f, D, win.z1] },
    { id: 'frame-sill', box: [win.x0 - f, D - FRAME.sill, win.z0 - f, win.x1 + f, D, win.z0] },
  ].map((o) => ({ ...o, kind: 'frame', matter: 'table' }));
  const holders = candles.map((c, k) => ({ id: `holder-${k}`, kind: 'holder', matter: 'brass', center: [c[0], c[1]], radius: HOLDER.radius, z0: c[2], z1: c[2] + HOLDER.height }));
  const [cx, cy] = cornerOf({ size: [W, D] }),
    h = CORNER.side / 2,
    [bx, by, bz] = CORNER.box;
  const corner = [
    { id: 'corner-stand', kind: 'corner', matter: 'table', box: [cx - h, cy - h, 0, cx + h, cy + h, CORNER.height] },
    { id: 'corner-keys', kind: 'corner', matter: 'brass', box: [cx - bx / 2, cy - by / 2, CORNER.height, cx + bx / 2, cy + by / 2, CORNER.height + bz] },
  ];
  return [...legs, ...frame, ...holders, ...corner];
}

// The page frame ↔ the room (a point; z page px above the paper), by default
// for the default room.
export const pageToRoom = (p, origin = ORIGIN) => [origin[0] + p[0] / PX_PER_M, origin[1] - p[1] / PX_PER_M, origin[2] + (p[2] ?? 0) / PX_PER_M];
export const roomToPage = (p, origin = ORIGIN) => [(p[0] - origin[0]) * PX_PER_M, (origin[1] - p[1]) * PX_PER_M, (p[2] - origin[2]) * PX_PER_M];
const ORIGIN = roomGeometry().pageOrigin;
// A direction (the sun's, light.js) from the page frame to the room's.
export const pageDirToRoom = (d) => [d[0], -d[1], d[2]];

// --- rays ---

// The surfaces as flat arrays for casting (made once per geometry).
const tracers = new WeakMap();
function tracer(geom) {
  let T = tracers.get(geom);
  if (T) return T;
  const s = geom.surfaces;
  const axisOf = (a) => (a[0] ? 0 : a[1] ? 1 : 2);
  T = {
    n: geom.patches.length,
    count: s.length,
    axis: Int8Array.from(s, (f) => axisOf(f.normal)),
    facing: Int8Array.from(s, (f) => f.normal[axisOf(f.normal)]),
    ua: Int8Array.from(s, (f) => axisOf(f.u)),
    va: Int8Array.from(s, (f) => axisOf(f.v)),
    c: Float64Array.from(s, (f) => f.origin[axisOf(f.normal)]),
    ou: Float64Array.from(s, (f) => f.origin[axisOf(f.u)]),
    ov: Float64Array.from(s, (f) => f.origin[axisOf(f.v)]),
    su: Float64Array.from(s, (f) => f.size[0]),
    sv: Float64Array.from(s, (f) => f.size[1]),
    gu: s.map((f) => Float64Array.from(f.grid.u)),
    gv: s.map((f) => Float64Array.from(f.grid.v)),
    cells: s.map((f) => Int32Array.from(f.grid.cells)),
  };
  tracers.set(geom, T);
  return T;
}

const cellOf = (lines, x) => {
  let lo = 0, hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

// The first surface the ray o + t·d meets with 0 < t < maxT (skipping surface
// `skip`): the column it lands in (a patch j, or n + w for opening w), or −1.
// The hit's distance and surface are left in `last`.
const last = { t: 0, surface: -1 };
function cast(T, o0, o1, o2, d0, d1, d2, maxT = Infinity, skip = -1) {
  let best = maxT, bs = -1, bu = 0, bv = 0;
  const { axis, facing, ua, va, c: plane, ou, ov, su, sv } = T;
  for (let k = 0; k < T.count; k++) {
    if (k === skip) continue;
    const a = axis[k];
    const da = a === 0 ? d0 : a === 1 ? d1 : d2;
    if (da * facing[k] > -1e-12) continue; // only a surface's front: the room is closed, the slab solid
    const t = (plane[k] - (a === 0 ? o0 : a === 1 ? o1 : o2)) / da;
    if (t <= 1e-9 || t >= best) continue;
    const b = ua[k], c = va[k];
    const u = (b === 0 ? o0 + d0 * t : b === 1 ? o1 + d1 * t : o2 + d2 * t) - ou[k];
    if (u < 0 || u > su[k]) continue;
    const v = (c === 0 ? o0 + d0 * t : c === 1 ? o1 + d1 * t : o2 + d2 * t) - ov[k];
    if (v < 0 || v > sv[k]) continue;
    best = t;
    bs = k;
    bu = u;
    bv = v;
  }
  last.t = best;
  last.surface = bs;
  if (bs < 0) return -1;
  const gu = T.gu[bs], gv = T.gv[bs];
  const cell = T.cells[bs][cellOf(gv, bv) * (gu.length - 1) + cellOf(gu, bu)];
  return cell >= 0 ? cell : T.n - 1 - cell;
}

// The first thing a ray meets: { t, surface, patch } or { t, surface, opening }, or null.
export function hit(geom, origin, dir, maxT = Infinity, skip = -1) {
  const T = tracer(geom);
  const col = cast(T, origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], maxT, skip);
  if (col < 0) return null;
  return col < T.n ? { t: last.t, surface: last.surface, patch: col } : { t: last.t, surface: last.surface, opening: col - T.n };
}

// --- form factors ---

// A fixed integer hash (no Math.random: the bake is the same every time).
const mix32 = (x) => {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};
const rnd = (a, b, c) => mix32(a ^ mix32(b ^ mix32((c + 0x9e3779b9) >>> 0))) / 4294967296;
const PER_U16 = 1 / 65536; // 16 bits of a hash as a fraction

// Which patches each patch sees: from `positions`² stratified points on it,
// `directions`² stratified cosine-weighted directions each (Shirley and Chiu's
// concentric map of the square onto the disk, lifted to the hemisphere), F_ij =
// the share of its rays that land on j first. → Float32Array n × (n + m), row i
// what patch i sees (columns n.. the window's openings). With a power-of-two
// ray count every entry is exact in float32 and a row sums to at most 1: the
// share of its rays that met anything (in this closed room, all of them).
export function formFactors(geom, { positions = 8, directions = 32 } = {}) {
  const T = tracer(geom);
  const n = geom.patches.length, cols = n + geom.openings.length;
  const rays = positions * positions * directions * directions;
  const out = new Float32Array(n * cols);
  const counts = new Uint32Array(cols);
  for (let i = 0; i < n; i++) {
    const p = geom.patches[i];
    const s = geom.surfaces[p.surface];
    const [u0, u1, v0, v1] = p.rect;
    const nu = s.u, nv = s.v, nn = p.normal;
    counts.fill(0);
    const key = mix32(i ^ 0x85ebca6b);
    for (let pj = 0; pj < positions; pj++) {
      for (let pi = 0; pi < positions; pi++) {
        const ps = pj * positions + pi;
        const a = u0 + ((pi + rnd(i, ps, 1)) / positions) * (u1 - u0);
        const b = v0 + ((pj + rnd(i, ps, 2)) / positions) * (v1 - v0);
        const o0 = s.origin[0] + nu[0] * a + nv[0] * b + nn[0] * 1e-7;
        const o1 = s.origin[1] + nu[1] * a + nv[1] * b + nn[1] * 1e-7;
        const o2 = s.origin[2] + nu[2] * a + nv[2] * b + nn[2] * 1e-7;
        for (let dj = 0; dj < directions; dj++) {
          for (let di = 0; di < directions; di++) {
            const h = mix32(Math.imul((ps * directions + dj) * directions + di, 0x9e3779b1) ^ key);
            const sx = (2 * (di + (h & 0xffff) * PER_U16)) / directions - 1;
            const sy = (2 * (dj + (h >>> 16) * PER_U16)) / directions - 1;
            let r, phi;
            if (sx === 0 && sy === 0) { r = 0; phi = 0; }
            else if (Math.abs(sx) > Math.abs(sy)) { r = sx; phi = (Math.PI / 4) * (sy / sx); }
            else { r = sy; phi = Math.PI / 2 - (Math.PI / 4) * (sx / sy); }
            const x = r * Math.cos(phi), y = r * Math.sin(phi);
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
            const col = cast(T, o0, o1, o2, nu[0] * x + nv[0] * y + nn[0] * z, nu[1] * x + nv[1] * y + nn[1] * z, nu[2] * x + nv[2] * y + nn[2] * z);
            if (col >= 0) counts[col]++;
          }
        }
      }
    }
    for (let j = 0; j < cols; j++) out[i * cols + j] = counts[j] / rays;
  }
  return out;
}

// The patch block (n × n) and the openings' block (n × m) of a baked matrix.
export function splitFormFactors(ff, n, m) {
  const F = new Float32Array(n * n), W = new Float32Array(n * m);
  for (let i = 0; i < n; i++) {
    F.set(ff.subarray(i * (n + m), i * (n + m) + n), i * n);
    W.set(ff.subarray(i * (n + m) + n, (i + 1) * (n + m)), i * m);
  }
  return { F, W };
}

// --- the files ---
// room.json: the geometry, a header and what the bake used; room.ff: a 16-byte
// header ('PNRF', version, n, m as little-endian u32) then the n × (n + m)
// matrix as little-endian float32, row by row.
export const ROOM_VERSION = 1;
const MAGIC = [0x50, 0x4e, 0x52, 0x46]; // PNRF

export function encodeRoom(geom, ff, bake = {}) {
  const n = geom.patches.length, m = geom.openings.length;
  if (ff.length !== n * (n + m)) throw new Error('form factors do not fit the geometry');
  const json = JSON.stringify({ format: 'penpals-room', version: ROOM_VERSION, n, m, bake, ff: { file: 'room.ff', rows: n, cols: n + m, type: 'f32le', header: 16 }, ...geom });
  const bin = new Uint8Array(16 + ff.length * 4);
  const dv = new DataView(bin.buffer);
  MAGIC.forEach((b, i) => dv.setUint8(i, b));
  dv.setUint32(4, ROOM_VERSION, true);
  dv.setUint32(8, n, true);
  dv.setUint32(12, m, true);
  for (let k = 0; k < ff.length; k++) dv.setFloat32(16 + 4 * k, ff[k], true);
  return { json, bin };
}

// The baked room back: the geometry, F (n × n) and W (n × m).
export function decodeRoom(json, bin) {
  const geom = typeof json === 'string' ? JSON.parse(json) : json;
  if (geom.format !== 'penpals-room' || geom.version !== ROOM_VERSION) throw new Error('not a room this code knows');
  const bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!MAGIC.every((b, i) => dv.getUint8(i) === b) || dv.getUint32(4, true) !== ROOM_VERSION) throw new Error('not a room.ff');
  const n = dv.getUint32(8, true), m = dv.getUint32(12, true);
  if (n !== geom.n || m !== geom.m || bytes.byteLength !== 16 + n * (n + m) * 4) throw new Error('room.ff does not fit room.json');
  const ff = new Float32Array(n * (n + m));
  for (let k = 0; k < ff.length; k++) ff[k] = dv.getFloat32(16 + 4 * k, true);
  return { ...geom, ...splitFormFactors(ff, n, m) };
}
