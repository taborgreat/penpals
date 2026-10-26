// The pen on a pad (SceneView's writer: the signature's, components/Register.jsx): page px in, the pad's own
// units to its ink. A stroke begun off the pad lays nothing; one that leaves it ends at its edge.
// now() → { ink, paper: { size: { width, height }, origin: [x, y] } }.
const local = (origin, p) => ({ x: p.x - origin[0], y: p.y - origin[1] });
const inside = (size, q) => q.x >= 0 && q.y >= 0 && q.x <= size.width && q.y <= size.height;
const edge = (size, q) => ({ x: Math.max(0, Math.min(size.width, q.x)), y: Math.max(0, Math.min(size.height, q.y)) });

export function padPen(now, pen) {
  let down = false;
  let last = null;
  const at = (p) => {
    const { paper: s } = now();
    return s ? local(s.origin, p) : null;
  };
  return {
    widthAt: (p) => (now().ink ? pen.widthAt(now().ink.law)(p) : 0),
    across: () => (pen.nib === 'broad' ? pen.angle : 0),
    // the nib as its ink has it now (heard: sound/pen.js penHand)
    nib() {
      const { ink } = now();
      return ink ? { pen: ink.capture.pen, on: 'paper', ...ink.nib } : null;
    },
    down(p, ev, type) {
      const { ink, paper: s } = now();
      const q = at(p);
      if (!ink || !s || !inside(s.size, q)) return;
      down = true;
      last = q;
      ink.capture.down(q, ev, type);
    },
    move(p, ev) {
      const { ink, paper: s } = now();
      if (!down || !ink) return;
      const q = at(p);
      if (!inside(s.size, q)) {
        ink.capture.up(edge(s.size, q), ev);
        down = false;
        return;
      }
      last = q;
      ink.capture.move(q, ev);
    },
    up(p, ev) {
      const { ink, paper: s } = now();
      if (!down || !ink) return;
      down = false;
      ink.capture.up(p ? edge(s.size, at(p)) : last, ev);
    },
    cancel() {
      if (down) now().ink?.capture.cancel();
      down = false;
    },
  };
}
