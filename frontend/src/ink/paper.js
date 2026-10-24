// Papers a letter can be on. Flat papers are a colour; parchment is a
// texture, made once per page size from a fixed seed so the pad, the letter
// and its exports all show the very same sheet.

export const PAPERS = {
  plain: { name: 'Plain', color: '#f7f3ea' },
  white: { name: 'White', color: '#ffffff' },
  cream: { name: 'Cream', color: '#f2e8d0' },
  parchment: { name: 'Parchment', color: '#eddcb6', texture: true },
};

const paperOf = (id) => PAPERS[id] ?? PAPERS.plain;

// A CSS background for something that stands in for a sheet (no canvas).
export const paperCss = (id) => {
  const p = paperOf(id);
  return p.texture ? `radial-gradient(ellipse at center, ${p.color} 55%, #d9c193 135%)` : p.color;
};

// Small, fast, seeded random numbers, so the texture is the same every time.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sheets = new Map(); // `${w}x${h}` → canvas

// Parchment at page size: a warm base, soft mottling, faint fibres, fine
// grain, and edges that darken a little toward the corners.
function parchment(w, h) {
  const key = `${w}x${h}`;
  const cached = sheets.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const rand = seeded(1771);
  ctx.fillStyle = PAPERS.parchment.color;
  ctx.fillRect(0, 0, w, h);

  const blotches = Math.round((w * h) / 9000);
  for (let i = 0; i < blotches; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 40 + rand() * 260;
    const a = 0.03 + rand() * 0.07;
    const dark = rand() < 0.6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, dark ? `rgba(150, 105, 45, ${a})` : `rgba(255, 249, 228, ${a * 1.4})`);
    g.addColorStop(1, dark ? 'rgba(150, 105, 45, 0)' : 'rgba(255, 249, 228, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.lineCap = 'round';
  const fibres = Math.round((w * h) / 2500);
  for (let i = 0; i < fibres; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 6 + rand() * 30;
    const ang = rand() * Math.PI;
    ctx.strokeStyle = `rgba(120, 82, 35, ${0.04 + rand() * 0.06})`;
    ctx.lineWidth = 0.5 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (rand() - 0.5) * 6, y + Math.sin(ang) * len * 0.5 + (rand() - 0.5) * 6, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const tctx = tile.getContext('2d');
  const grain = tctx.createImageData(128, 128);
  for (let i = 0; i < grain.data.length; i += 4) {
    const dark = rand() < 0.5;
    grain.data[i] = dark ? 90 : 255;
    grain.data[i + 1] = dark ? 60 : 250;
    grain.data[i + 2] = dark ? 25 : 235;
    grain.data[i + 3] = Math.round(rand() * 22);
  }
  tctx.putImageData(grain, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fillRect(0, 0, w, h);

  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  edge.addColorStop(0, 'rgba(120, 75, 25, 0)');
  edge.addColorStop(1, 'rgba(120, 75, 25, 0.24)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  sheets.set(key, c);
  return c;
}

// Paper over a whole canvas that shows a page `pageW` × `pageH` page px
// (the canvas may be larger or smaller, e.g. sized to the screen).
// `view` ({ ox, oy, scale }): the canvas is a view onto part of the page, its
// top-left at page (ox, oy), `scale` canvas px per page px; only the page is papered.
export function paintPaper(ctx, id, pageW, pageH, view = null) {
  const p = paperOf(id);
  const { width, height } = ctx.canvas;
  const [x, y, w, h] = view ? [-view.ox * view.scale, -view.oy * view.scale, pageW * view.scale, pageH * view.scale] : [0, 0, width, height];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (p.texture) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(parchment(Math.round(pageW), Math.round(pageH)), x, y, w, h);
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

export const isTextured = (id) => !!paperOf(id).texture;
