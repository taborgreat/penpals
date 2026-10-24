import { useEffect, useRef } from 'react';

const HANDLE_RADIUS = 14; // css px
const MAX_INTERNAL = 1000; // drawing resolution; CSS scales the element to fit

// The photo with four draggable corner handles. `corners` are in photo pixels.
export default function CornerPicker({ photo, corners, onChange }) {
  const canvasRef = useRef(null);
  const photoCanvasRef = useRef(null);
  const dragRef = useRef(-1);

  // Cache the photo as a canvas once; drawImage from it is cheap.
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = photo.width;
    c.height = photo.height;
    c.getContext('2d').putImageData(photo, 0, 0);
    photoCanvasRef.current = c;
  }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = photoCanvasRef.current;
    if (!canvas || !source) return;
    const scale = Math.min(1, MAX_INTERNAL / Math.max(photo.width, photo.height));
    canvas.width = Math.round(photo.width * scale);
    canvas.height = Math.round(photo.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    // Handles are sized in css px, so convert using the on-screen size.
    const cssToInternal = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
    const pts = corners.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    ctx.lineWidth = 2 * cssToInternal;
    ctx.strokeStyle = '#00c853';
    ctx.fillStyle = 'rgba(0, 200, 83, 0.12)';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS * cssToInternal, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [photo, corners]);

  const toPhoto = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * photo.width,
      y: ((e.clientY - rect.top) / rect.height) * photo.height,
    };
  };

  const onPointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const grabRadius = (HANDLE_RADIUS * 2.5) / (rect.width / photo.width); // in photo px
    const p = toPhoto(e);
    let nearest = -1;
    let nearestDist = grabRadius;
    corners.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    if (nearest < 0) return;
    dragRef.current = nearest;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (dragRef.current < 0) return;
    const p = toPhoto(e);
    const clamped = {
      x: Math.max(0, Math.min(photo.width, p.x)),
      y: Math.max(0, Math.min(photo.height, p.y)),
    };
    onChange(corners.map((c, i) => (i === dragRef.current ? clamped : c)));
  };

  const onPointerUp = () => {
    dragRef.current = -1;
  };

  return (
    <div className="corner-picker-wrap">
      <canvas ref={canvasRef} className="corner-picker" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
    </div>
  );
}
