// A fresh sheet on the table (one-world.md, the panel: at a table with nothing
// in hand, new paper). It lies on the journal's page where it is put, growing
// live; with the pen in the hand you write on it in the scene (SceneView's
// writer, seated). Sealing it lays it into the book as writing on that page,
// exactly where its ink is; new paper seals the one before (the old sheet
// stays where you put it). Until it is sealed it is a draft on this device.
//   writer: your key in this tab; family: the paper the next sheet is grown on;
//   pen: the pen in the hand (components/PenPanel.jsx usePens); onPlace(line, seed, place)
// A sheet begun with a dip pen in the hand is a law-3 sheet (its pen acts carry the nib's well:
// laws.js); one still blank when the pen in the hand turns dip pen, or back, is begun again so.
// → { sheet (null: none on the table), strokes, newPaper({ size, origin }), seal(), undo(),
//     scene: SceneView's sheet for it, writer: SceneView's writer for it }
import { useEffect, useMemo, useRef, useState } from 'react';
import { b64url } from 'penpals-law';
import { newSheet, sealInk } from '../keys/session.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import { CELLS } from '../ink/live.js';

export const SIZES = { half: { width: 1000, height: 700 }, full: { width: 1000, height: 1400 } }; // on a journal page (1000 × 1400)

const local = (origin, p) => ({ x: p.x - origin[0], y: p.y - origin[1] });
const inside = (size, q) => q.x >= 0 && q.y >= 0 && q.x <= size.width && q.y <= size.height;
const edge = (size, q) => ({ x: Math.max(0, Math.min(size.width, q.x)), y: Math.max(0, Math.min(size.height, q.y)) });

// Where its ink lands as writing on the page: its box's corner, from where the sheet lies.
export const placeOf = (origin, box) => ({ x: origin[0] + box[0] / CELLS, y: origin[1] + box[1] / CELLS });

// The pen on the sheet (SceneView's writer): page px in, the sheet's own units to its ink. A stroke
// begun off the sheet lays nothing; one that leaves it ends at its edge. now() → { ink, paper }.
export function sheetPen(now, pen) {
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

export function useFreshSheet({ writer, family, pen, onPlace }) {
  const [paper, setPaper] = useState(null); // { n, size, origin, family, law }
  const n = useRef(0);
  const made = useMemo(() => (paper && writer ? newSheet(writer) : null), [paper?.n, writer]); // (each new paper, a new sheet)
  const ink = useLiveInk(made ? { paperKey: made.paperKey, family: paper.family, size: paper.size, ...(paper.law === 3 ? { law: 3 } : {}) } : null, made?.sheet);
  const [strokes, setStrokes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    setStrokes(0);
    if (!ink) return undefined;
    ink.scene?.(true); // its tiles carry heights: it is drawn in the room
    return ink.onChange(() => {
      setStrokes(ink.strokes);
      setError(ink.error ? 'That is more ink than one sheet can hold. Undo a little.' : null);
    });
  }, [ink]);
  // a blank sheet under the law the pen in the hand writes with
  const lawNow = pen.dip ? 3 : 2;
  useEffect(() => {
    if (paper && !strokes && paper.law !== lawNow) {
      n.current += 1;
      setPaper({ ...paper, n: n.current, law: lawNow });
    }
  }, [paper, strokes, lawNow]);
  // the pen in the hand writes the next strokes
  useEffect(() => {
    if (!ink) return;
    ink.setPen(pen.lawPen(ink.law));
    ink.capture.setFlex(pen.flexOf(ink.law));
  }, [ink, pen]);

  async function seal() {
    if (!ink || !paper || !made) return null;
    if (!ink.strokes) {
      setPaper(null);
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const settled = await ink.settle();
      if (!settled?.box[2]) throw new Error('Nothing on it yet.');
      const { line } = sealInk(writer, { sheet: made.sheet, seed: made.seed, use: 'book', family: paper.family, settled });
      const id = await onPlace(line, b64url(made.seed), placeOf(paper.origin, settled.box));
      if (id) setPaper(null);
      return id;
    } catch (err) {
      setError(err.law ? 'That is more ink than one sheet can hold. Undo some, or seal it in parts.' : err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function newPaper({ size, origin = [0, 0] }) {
    if (ink?.strokes) await seal();
    n.current += 1;
    setPaper({ n: n.current, size, origin, family, law: lawNow });
  }

  const sheetOnTable =
    paper && ink ? { id: `fresh:${made.sheet}`, box: [0, 0, Math.ceil(paper.size.width * CELLS), Math.ceil(paper.size.height * CELLS)], origin: paper.origin, cellPx: 1 / CELLS, live: ink } : null;
  const live = useRef({ ink, paper });
  live.current = { ink, paper };
  const sceneWriter = useMemo(() => sheetPen(() => live.current, pen), [pen]);

  return {
    sheet: paper,
    strokes,
    busy,
    error,
    newPaper,
    seal,
    undo: () => ink?.undo(),
    scene: sheetOnTable,
    writer: paper && ink ? sceneWriter : null,
  };
}
