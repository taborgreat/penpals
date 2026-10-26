// Papers as ground (rooms.md §4): at a being's small size the surface it walks on is a paper's facts, dents
// are canyons and dried beads are hills; and a paper lies anywhere (law/paper.js), on the table, on the floor,
// on another. From the scene's sheets: each where it rests (its lift above the page's plane), its field's heights
// (the surface and what stands above it, in drops, per cell) on top, as tall as the view draws them (relief),
// so what the eye sees is what the feet stand on.
//   sheets  SceneView's: [{ box (cells), origin (page px of cell box[0], box[1]), cellPx, size (page px), lift?
//           (page px above the page's plane), held?, field? }]
//   origin  the page's place in the room (light.js originOf: its z the page's plane); dropPx: a drop's height
//           in page px
// → (x, y) room m → the top of the uppermost paper lying there (room m), or null (no paper there)
export function groundOf(sheets, { origin, pxPerM, dropPx, relief = 1 }) {
  const lying = (sheets ?? []).filter((s) => !s.held && s.size).sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
  return (x, y) => {
    const px = (x - origin[0]) * pxPerM,
      py = (origin[1] - y) * pxPerM;
    for (const s of lying) {
      const qx = px - s.origin[0],
        qy = py - s.origin[1];
      if (qx < 0 || qy < 0 || qx > s.size[0] || qy > s.size[1]) continue;
      const top = origin[2] + (s.lift ?? 0) / pxPerM;
      const f = s.field;
      if (!f?.surface || !f.above) return top;
      const i = s.box[0] + Math.floor(qx / s.cellPx) - f.box[0],
        j = s.box[1] + Math.floor(qy / s.cellPx) - f.box[1];
      if (i < 0 || j < 0 || i >= f.box[2] || j >= f.box[3]) return top;
      const k = j * f.box[2] + i;
      return top + ((f.surface[k] + f.above[k]) * dropPx * relief) / pxPerM;
    }
    return null;
  };
}
