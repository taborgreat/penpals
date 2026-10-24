import { useEffect, useRef, useState } from 'react';
import { CELLS } from '../ink/live.js';

const REACH = 160; // cells either side of the last point
const EVERY_MS = 250;

// Into the paper while writing (law 2): a cut through the sheet along the line
// the pen last wrote on, redrawn as the ink sinks and dries: the bead standing
// while it is wet (its peak once dry), the ink sunk into the fibers, dents and
// cockle ridges in the surface, a break where the paper tore. A view only: it
// changes nothing that will be sealed.
export default function DepthStrip({ ink }) {
  const ref = useRef(null);
  const [pic, setPic] = useState(null); // { width, height, rgba }
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      const pt = ink.capture.strokes.at(-1)?.points.at(-1);
      if (pt) {
        const cx = Math.floor(pt.x * CELLS);
        const cy = Math.floor(pt.y * CELLS);
        try {
          const got = await ink.cut(cx - REACH, cy, cx + REACH, cy);
          if (!stopped && got.width && got.height) setPic(got);
        } catch {
          // the sheet was closed or cleared: try again next time
        }
      }
      if (!stopped) timer = setTimeout(tick, EVERY_MS);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ink]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !pic) return;
    c.width = pic.width;
    c.height = pic.height;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pic.rgba.buffer), pic.width, pic.height), 0, 0);
  }, [pic]);
  return (
    <figure className="depth-view live">
      <canvas ref={ref} hidden={!pic} />
      <figcaption className="meta">
        {pic ? 'Through the paper along your last line: the bead standing while it is wet, the ink sinking in, dents and ridges.' : 'Write something: a cut through the paper along your last line shows here.'}
      </figcaption>
    </figure>
  );
}
