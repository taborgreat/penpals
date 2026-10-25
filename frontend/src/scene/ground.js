// The page's own heights as ground (rooms.md §4): at a being's small size the
// surface it walks on is the page's facts, dents are canyons and dried beads are
// hills. From the scene's sheets (their fields: the surface and what stands above
// it, in drops, per cell) as metres above the paper's top, as tall as the view
// draws them (relief), so what the eye sees is what the feet stand on.
//   sheets  SceneView's: [{ box (cells), origin (page px of cell box[0], box[1]), cellPx, field? }]
//   origin  the page's place in the room (light.js originOf); dropPx: a drop's height in page px
// → (x, y) room m → m (0 where no sheet has heights)

export function groundOf(sheets, { origin, pxPerM, dropPx, relief = 1 }) {
  const fielded = (sheets ?? []).filter((s) => s.field?.surface && s.field?.above);
  return (x, y) => {
    const px = (x - origin[0]) * pxPerM,
      py = (origin[1] - y) * pxPerM;
    for (const s of fielded) {
      const cx = s.box[0] + Math.floor((px - s.origin[0]) / s.cellPx),
        cy = s.box[1] + Math.floor((py - s.origin[1]) / s.cellPx);
      const [fx, fy, fw, fh] = s.field.box;
      const i = cx - fx,
        j = cy - fy;
      if (i < 0 || j < 0 || i >= fw || j >= fh) continue;
      const k = j * fw + i;
      return ((s.field.surface[k] + s.field.above[k]) * dropPx * relief) / pxPerM;
    }
    return 0;
  };
}
