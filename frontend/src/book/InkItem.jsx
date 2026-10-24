import { useEffect, useRef, useState } from 'react';
import { onFirstView, onResize, reducedMotion } from '../hand/player.js';
import { pathsOf, SCALE_ONE } from './ink.js';
import { useNear } from '../scene/useNear.js';
import { MAX_LOD } from 'penpals-law/v2/scene';

const REVEAL_MS = { min: 600, max: 4000 };

// One piece of writing: its look (the settled ink, `src`), filling its box,
// revealed along its strokes the first time it is seen (the strokes are public;
// the paper they were grown on is not). `src` may be a promise of a URL (a
// look grown on this device); `null` draws the strokes alone. Out of sight it is
// not asked for, and let go a while after it leaves (cleanup-and-speed.md §5b);
// shown small, the server's look comes at the level of detail the screen can show
// (`scale`: the size it is grown at, 64 = as written).
export default function InkItem({ src, body, scale = SCALE_ONE }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null); // the last look that loaded (kept while the next loads: no blink on resize)
  const near = useNear(boxRef);
  const [finer, setFiner] = useState(0); // bumped when it is shown bigger than its look's detail

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!near) {
      // out of sight a while: nothing drawn, nothing held
      imgRef.current = null;
      canvas.width = canvas.height = 0;
      return undefined;
    }
    // the coarsest look that still gives each screen pixel its own (law/v2/scene.js MAX_LOD)
    const lodNow = () => {
      const dev = box.getBoundingClientRect().width * (window.devicePixelRatio || 1);
      const natural = (body.box[2] * scale) / SCALE_ONE;
      return dev > 0 ? Math.max(0, Math.min(MAX_LOD, Math.floor(Math.log2(natural / dev)))) : 0;
    };
    let lod = 0;
    const paths = pathsOf(body);
    let shown = 0;
    let raf = 0;
    let alive = true;

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
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      const img = imgRef.current;
      const sx = W / body.box[2];
      const sy = H / body.box[3];
      if (img) ctx.drawImage(img, 0, 0, W, H);
      if (k >= 1 && img) return;
      // The part written by now: the strokes up to that moment, as wide as the nib could spread.
      const until = k * paths.duration;
      ctx.globalCompositeOperation = img ? 'destination-in' : 'source-over';
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = img ? '#000' : 'rgba(40, 40, 60, 0.55)';
      ctx.lineWidth = img ? paths.width : Math.max(1.5, paths.width / 4);
      ctx.beginPath();
      for (const s of paths.strokes) {
        if (!s.length || s[0][2] > until) continue;
        ctx.moveTo(s[0][0], s[0][1]);
        if (s.length === 1) ctx.lineTo(s[0][0] + 0.01, s[0][1]);
        for (const [x, y, t] of s) {
          if (t > until) break;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    };

    const reveal = () => {
      const ms = Math.min(REVEAL_MS.max, Math.max(REVEAL_MS.min, paths.duration));
      const t0 = performance.now();
      const step = (now) => {
        if (!alive) return;
        const k = Math.min(1, (now - t0) / ms);
        draw(k);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    let unview = () => {};
    const start = () => {
      if (reducedMotion() || imgRef.current?.dataset.revealed) draw(1);
      else {
        draw(0);
        unview = onFirstView(box, () => {
          if (imgRef.current) imgRef.current.dataset.revealed = '1';
          reveal();
        });
      }
    };

    Promise.resolve(src).then((url) => {
      if (!alive) return;
      if (!url) {
        imgRef.current = null;
        draw(1);
        return;
      }
      if (typeof url === 'string' && url.startsWith('/api/')) {
        lod = lodNow();
        if (lod) url = `${url}${url.includes('?') ? '&' : '?'}lod=${lod}`;
      }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (!alive) return;
        if (imgRef.current?.dataset.revealed) img.dataset.revealed = '1';
        imgRef.current = img;
        start();
      };
      img.onerror = () => {
        if (alive && !imgRef.current) draw(1);
      };
      img.src = url;
    });
    if (imgRef.current) draw(shown || 1);
    const unsize = onResize(box, () => {
      if (lod && lodNow() < lod)
        setFiner((v) => v + 1); // shown bigger: a finer look
      else draw(shown || 1);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      unview();
      unsize();
    };
  }, [src, body, near, finer]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={boxRef} className="ink-item-art">
      <canvas ref={canvasRef} style={{ left: 0, top: 0, width: '100%', height: '100%' }} />
    </span>
  );
}
