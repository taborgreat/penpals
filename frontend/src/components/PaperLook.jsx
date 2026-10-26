import { useEffect, useRef } from 'react';
import { CELLS } from '../ink/live.js';

// A paper as it has grown (room/papers.js usePaperFields: its field, the cells its marks made), drawn
// small: its whole face, `width` CSS px across, what is on it where it is.
//   field: { box: [x0, y0, w, h] (cells), rgba } | null (nothing on it yet); size: [w, h] (its units)
export default function PaperLook({ field, size, width = 180 }) {
  const ref = useRef(null);
  const height = Math.round((width * size[1]) / size[0]);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f6f1e7';
    ctx.fillRect(0, 0, c.width, c.height);
    if (!field) return;
    const [bx, by, w, h] = field.box;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    off.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(field.rgba), w, h), 0, 0);
    const k = c.width / (size[0] * CELLS);
    ctx.drawImage(off, bx * k, by * k, w * k, h * k);
  }, [field, size[0], size[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="paper-look" width={width} height={height} role="img" aria-label="a paper" />;
}
