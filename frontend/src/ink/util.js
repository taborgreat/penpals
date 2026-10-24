// Shared pixel helpers. Everything in ink/ (except load.js and render.js) works
// on plain typed arrays, so the pipeline can move into a Web Worker unchanged.

// Integer luma of an RGBA image → one byte per pixel.
export function toGray(image) {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28) >> 8;
  }
  return gray;
}

// Flood-fill labelling of a 0/1 mask. Returns labels (0 = background) and the
// area of each label, indexed by label.
export function labelComponents(mask, width, height, eightConnected = false) {
  const n = width * height;
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const areas = [0];
  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed] || labels[seed]) continue;
    const label = areas.length;
    let area = 0;
    let top = 0;
    labels[seed] = label;
    stack[top++] = seed;
    while (top > 0) {
      const i = stack[--top];
      area++;
      const x = i % width;
      const y = (i - x) / width;
      const x0 = x > 0 ? -1 : 0;
      const x1 = x < width - 1 ? 1 : 0;
      const y0 = y > 0 ? -1 : 0;
      const y1 = y < height - 1 ? 1 : 0;
      for (let dy = y0; dy <= y1; dy++) {
        for (let dx = x0; dx <= x1; dx++) {
          if ((dx === 0 && dy === 0) || (!eightConnected && dx !== 0 && dy !== 0)) continue;
          const j = i + dy * width + dx;
          if (mask[j] && !labels[j]) {
            labels[j] = label;
            stack[top++] = j;
          }
        }
      }
    }
    areas.push(area);
  }
  return { labels, areas };
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function rgbToHex(r, g, b) {
  const hex = (v) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
