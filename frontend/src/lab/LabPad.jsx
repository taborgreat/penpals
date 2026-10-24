import { useEffect, useRef, useState } from 'react';
import { createCapture } from '../ink/capture.js';

// A plain writing surface for the hand lab (Phase 0): page units in, acts out,
// through the same capture path as write mode. Draws thin preview lines only;
// the ink is what the law makes of the acts, not this picture.
//   background: strokes ({ points: [{x, y}] }, page units) shown faintly, to trace over
//   boxes: [{ x, y, w, h, label }] drawn as a grid (the letters of the corpus)
//   baselines: y values of guide lines
export default function LabPad({ width = 1000, height = 320, background = null, boxes = null, baselines = [], onSave, saveLabel = 'Save', busy = false }) {
  const canvasRef = useRef(null);
  const capRef = useRef(null);
  const frame = useRef(0);
  const [count, setCount] = useState(0);
  if (!capRef.current) capRef.current = createCapture();

  const draw = () => {
    frame.current = 0;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const ctx = cv.getContext('2d');
    const k = W / width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(80, 110, 160, 0.35)';
    ctx.lineWidth = 1 / k;
    for (const y of baselines) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    if (boxes) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(80, 110, 160, 0.6)';
      for (const b of boxes) {
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillText(b.label, b.x + 6, b.y + 18);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + b.h * 0.7);
        ctx.lineTo(b.x + b.w, b.y + b.h * 0.7);
        ctx.stroke();
      }
    }
    const line = (s, style, w) => {
      if (!s.points.length) return;
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points) ctx.lineTo(p.x, p.y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.01, s.points[0].y);
      ctx.stroke();
    };
    if (background) for (const s of background) line(s, 'rgba(120, 120, 120, 0.35)', 5);
    const cap = capRef.current;
    for (const s of cap.strokes) line(s, '#1d2a44', 4);
    if (cap.drawing) line(cap.drawing, '#1d2a44', 4);
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => schedule());
    ro.observe(canvasRef.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      capRef.current.cancel();
    };
  }, [background, boxes]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPage = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };
  const onDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    capRef.current.down(toPage(e), e.nativeEvent, e.pointerType);
    schedule();
  };
  const onMove = (e) => {
    const cap = capRef.current;
    if (!cap.drawing) return;
    const list = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of list?.length ? list : [e.nativeEvent]) cap.move(toPage(ev), ev);
    schedule();
  };
  const onUp = (e) => {
    const cap = capRef.current;
    if (!cap.drawing) return;
    cap.up(toPage(e), e.nativeEvent);
    setCount(cap.strokes.length);
    schedule();
  };

  return (
    <div className="lab-pad">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', aspectRatio: `${width} / ${height}`, touchAction: 'none', display: 'block', border: '1px solid #c9c2b3', borderRadius: 6 }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="row" style={{ marginTop: 8, gap: 8, display: 'flex' }}>
        <button
          type="button"
          onClick={() => {
            capRef.current.undo();
            setCount(capRef.current.strokes.length);
            schedule();
          }}
          disabled={!count}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => {
            capRef.current.clear();
            setCount(0);
            schedule();
          }}
          disabled={!count}
        >
          Clear
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="primary" disabled={!count || busy} onClick={() => onSave(capRef.current.strokes)}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
