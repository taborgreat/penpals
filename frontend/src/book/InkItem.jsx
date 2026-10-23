import { useEffect, useRef } from 'react';
import { renderStrokes } from '../ink/strokes.js';
import { play, isPlaying, playMs, onFirstView, onResize, reducedMotion } from '../hand/player.js';
import { inkData } from './ink.js';

const MIN_STROKE_PX = 1.2; // no line thinner than this on screen, so hairlines stay visible
const BLEED_PX = 4; // the canvas reaches past the item's box so thick edges aren't cut

// One piece of writing on a journal page, drawn in its colour to fill its box,
// writing itself in the first time it's seen.
export default function InkItem({ ink, color }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const data = inkData(ink);
    let shown = 0;
    const draw = (k) => {
      shown = k;
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(r.width * dpr));
      const H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (k <= 0) return;
      const bleed = BLEED_PX * dpr;
      const sx = (W - 2 * bleed) / data.width;
      const sy = (H - 2 * bleed) / data.height;
      ctx.setTransform(sx, 0, 0, sy, bleed, bleed);
      renderStrokes(ctx, data, { until: k >= 1 ? Infinity : k * data.duration, minWidth: (MIN_STROKE_PX * dpr) / sx });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    };
    const player = { draw };
    let unview = () => {};
    if (reducedMotion() || !data.duration) draw(1);
    else {
      draw(0);
      unview = onFirstView(box, () => play(player, playMs(data.duration)));
    }
    const unsize = onResize(box, () => { if (!isPlaying(player)) draw(shown); });
    const fallback = setTimeout(() => { if (shown === 0 && !isPlaying(player)) { unview(); draw(1); } }, 4000);
    return () => {
      clearTimeout(fallback);
      unview();
      unsize();
      player.draw = () => {};
    };
  }, [ink, color]);

  return (
    <span ref={boxRef} className="ink-item-art">
      <canvas ref={canvasRef} style={{ left: -BLEED_PX, top: -BLEED_PX, width: `calc(100% + ${2 * BLEED_PX}px)`, height: `calc(100% + ${2 * BLEED_PX}px)` }} />
    </span>
  );
}
