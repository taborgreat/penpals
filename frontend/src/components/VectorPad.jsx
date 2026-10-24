import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NIBS, PEN_SIZES, BROAD_SIZES, FLEX_PRESETS, GUIDES, PX_PER_MM, renderStroke, timedStrokes, drawGuides, guideRows } from '../ink/nibs.js';
import { encodeInkPng } from '../ink/encode.js';
import { PAPERS } from '../ink/paper.js';
import { encodeStrokes } from '../ink/strokes.js';
import WriteMode from './WriteMode.jsx';
import { CHASE, setChase } from './chase.js';
import ChaseSettings from './ChaseSettings.jsx';

const PAGE_WIDTH = 1400; // same page width as a photographed letter
const PAGES = { half: 905, full: 1811 };
const FLEX_FIELDS = ['hairline', 'maxWidth', 'swell', 'slant'];
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6]; // × the width that fits; zooming in = smaller writing on the page
const MAX_SCREEN_PX = 10e6; // cap per on-screen canvas, so a zoomed full page stays within memory
const GUIDE_NAMES = { none: 'none', plain: 'ruled' };

// The nib picker: a short name and a little sample of the line each nib makes.
const NIB_CHOICES = {
  pen: { label: 'Pen', sample: <path d="M3 13 C9 3, 13 3, 17 10 S27 17, 33 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> },
  flex: {
    label: 'Flex nib',
    sample: (
      <>
        <path d="M4 14 C8 8, 11 4, 13 3" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M13 3 C12.2 7, 11 11, 10.4 15 C12 11, 13.6 7, 14.6 3 Z" fill="currentColor" />
        <path d="M16 15 C21 9, 25 5, 28 3" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <path d="M28 3 C27.2 7, 26 11, 25.4 15 C27 11, 28.6 7, 29.6 3 Z" fill="currentColor" />
      </>
    ),
  },
  broad: {
    label: 'Broad nib',
    sample: <path d="M3 14 L9 4 L13 4 L7 14 Z M14 14 L20 4 L28 4 L22 14 Z M27 14 L33 4 L34.5 4 L28.5 14 Z" fill="currentColor" />,
  },
};

// All strokes onto a canvas whose pixels are `k` × page pixels.
function paintAll(canvas, strokes, k) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  for (const s of strokes) renderStroke(ctx, s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function paintOne(canvas, stroke, k) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  renderStroke(ctx, stroke);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// The vector pad: strokes painted as shapes, emitted as a PNG and a strokes
// file. Kept for HandStudio's labels (the site's own hand-drawn words); all
// writing that is sealed goes through Pad.jsx and the law.
// Write on screen. Emits the same result as the photo path:
// { png, strokesBlob, strokesData, fidelity, strokeCount, display, detectedColor,
//   width, height, ms, source: 'pad' } or null while dirty; onResult(null, true)
// means the page is empty.
// `size` ({ width, height } in page px) makes it a compact pad on a page of
// that size, for short things like a signature or a label: same nibs, lines,
// undo and zoom, but no page sizes or write mode.
// The page is always PAGE_WIDTH px wide (or size.width); zoom only changes how big it is on
// screen, so zooming in lets you write smaller and fit more on the page.
// Like a document editor, the page sits in the flow of the page and the window
// scrolls it; only sideways overflow (when zoomed in) scrolls inside the pad.
// One finger writes, two fingers scroll; once a stylus is used, fingers only scroll.
// Write mode (WriteMode.jsx) is where letters are written: full screen, with
// the chase (chase.js) sliding the page along the line under the pen. What is
// written there is a draft until its Play; then it joins these strokes, the
// letter is emitted at once and `onWritten` moves on to saving and sending.
// Strokes are kept twice: in page pixels (what gets sent) and at screen
// resolution (what you see), so the pad stays sharp at every zoom.
export default function VectorPad({ onResult, inkColor = '#1a1a1a', size = null, hint: hintText = null, paper = 'plain', onPaperChange = null, onWritten = null }) {
  const [nib, setNib] = useState('flex');
  const [penSize, setPenSize] = useState('medium');
  const [flex, setFlex] = useState({ ...FLEX_PRESETS.copperplate });
  const [broadSize, setBroadSize] = useState('2.4 mm');
  const [angle, setAngle] = useState(35);
  const [guide, setGuide] = useState('plain');
  const [spacing, setSpacing] = useState(() => Math.round(FLEX_PRESETS.copperplate.lineMm * PX_PER_MM));
  const [page, setPage] = useState('half');
  const [strokeCount, setStrokeCount] = useState(0);
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const [zoom, setZoom] = useState(1);
  const [cssWidth, setCssWidth] = useState(0); // on-screen width of the page
  const [hand, setHand] = useState(false); // the move tool
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [penSeen, setPenSeen] = useState(false); // once a stylus writes, fingers scroll
  const [writing, setWriting] = useState(false); // in write mode
  const [draftCount, setDraftCount] = useState(0); // strokes written in write mode, not yet played
  const [chase, setChaseSettings] = useState(() => ({ ...CHASE })); // the chase's knobs, as the settings panel shows them
  const [chaseOpen, setChaseOpen] = useState(false); // the chase settings panel
  const [adjustOpen, setAdjustOpen] = useState(false); // the nib's sliders, in a dropdown
  const adjustRef = useRef(null);
  const guideRef = useRef(null);
  const inkRef = useRef(null);
  const viewRef = useRef(null);
  const pageRef = useRef(null);
  const layerRef = useRef(null); // committed strokes, page pixels
  const screenRef = useRef(null); // committed strokes, screen pixels
  const strokesRef = useRef([]);
  const historyRef = useRef([]); // { add: stroke } | { cleared: strokes }, newest last
  const futureRef = useRef([]); // what undo took back, for redo
  const draftRef = useRef({ strokes: [], camera: null }); // write mode's draft, kept while you're out of it
  const writingRef = useRef(false);
  const currentRef = useRef(null);
  const panRef = useRef(null);
  const touchesRef = useRef(new Map()); // fingers down on the pad
  const hoverRef = useRef(false);
  const zoomRef = useRef(zoom);
  const inkColorRef = useRef(inkColor);
  const emitTimer = useRef(0);
  const jobRef = useRef(0);
  const compact = !!size;
  const pageW = size?.width ?? PAGE_WIDTH;
  const height = size?.height ?? PAGES[page];
  const slant = nib === 'flex' ? flex.slant : 0;
  const preset = Object.keys(FLEX_PRESETS).find((k) => FLEX_FIELDS.every((f) => FLEX_PRESETS[k][f] === flex[f])) ?? 'custom';

  // Screen pixels per page pixel.
  const dpr = window.devicePixelRatio || 1;
  const fit = cssWidth ? (cssWidth * dpr) / pageW : 1;
  const scale = Math.round(Math.min(fit, Math.sqrt(MAX_SCREEN_PX / (pageW * height))) * 1000) / 1000;
  const screenW = Math.round(pageW * scale);
  const screenH = Math.round(height * scale);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  zoomRef.current = zoom;

  const present = useCallback(() => {
    const ink = inkRef.current;
    const screen = screenRef.current;
    if (!ink || !screen) return;
    const ctx = ink.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.drawImage(screen, 0, 0);
    const k = scaleRef.current;
    if (draftRef.current.strokes.length) {
      // waiting in write mode: shown faint
      ctx.globalAlpha = 0.35;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      for (const d of draftRef.current.strokes) renderStroke(ctx, d.stroke);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (currentRef.current) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      renderStroke(ctx, currentRef.current, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-in'; // show the ink in the letter's colour
    ctx.fillStyle = inkColorRef.current;
    ctx.fillRect(0, 0, ink.width, ink.height);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const redraw = useCallback(() => {
    if (layerRef.current) paintAll(layerRef.current, strokesRef.current, 1);
    if (screenRef.current) paintAll(screenRef.current, strokesRef.current, scaleRef.current);
    present();
  }, [present]);

  // Encode the drawing a moment after the last change (or after `wait` ms).
  const scheduleEmit = useCallback(
    (wait = 500) => {
      clearTimeout(emitTimer.current);
      const empty = !strokesRef.current.length;
      onResult(null, empty);
      if (empty) return;
      emitTimer.current = setTimeout(async () => {
        const job = ++jobRef.current;
        const layer = layerRef.current;
        const t0 = performance.now();
        const { data } = layer.getContext('2d').getImageData(0, 0, layer.width, layer.height);
        const alpha = new Uint8ClampedArray(layer.width * layer.height);
        for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = data[p];
        const png = await encodeInkPng({ width: layer.width, height: layer.height, alpha });
        const strokesData = {
          width: layer.width,
          height: layer.height,
          tilt: 0,
          rows: guideRows(guide, spacing, layer.height), // the baselines the writer used
          strokes: timedStrokes(strokesRef.current),
        };
        const strokesBlob = await encodeStrokes(strokesData);
        if (job !== jobRef.current) return;
        onResult({
          png,
          strokesBlob,
          strokesData,
          fidelity: 1,
          strokeCount: strokesData.strokes.length,
          display: 'strokes',
          detectedColor: null,
          width: layer.width,
          height: layer.height,
          ms: Math.round(performance.now() - t0),
          source: 'pad',
        });
      }, wait);
    },
    [onResult, guide, spacing],
  );

  // A new page size means a new page layer; strokes are redrawn onto it.
  useEffect(() => {
    const layer = document.createElement('canvas');
    layer.width = pageW;
    layer.height = height;
    layer.getContext('2d', { willReadFrequently: true });
    layerRef.current = layer;
    paintAll(layer, strokesRef.current, 1);
    scheduleEmit();
  }, [height, scheduleEmit]);

  // A new on-screen size (zoom, window, page) means a new screen layer. Layout
  // effects, so the resized canvases are repainted before the screen updates.
  useLayoutEffect(() => {
    const screen = document.createElement('canvas');
    screen.width = screenW;
    screen.height = screenH;
    screenRef.current = screen;
    paintAll(screen, strokesRef.current, scaleRef.current);
    present();
  }, [screenW, screenH, present]);

  useLayoutEffect(() => {
    drawGuides(guideRef.current.getContext('2d'), pageW, height, { guide, spacing, slant, scale, lineWidth: dpr, paper });
  }, [guide, spacing, height, slant, scale, screenW, screenH, dpr, paper, pageW]);

  useEffect(() => {
    inkColorRef.current = inkColor;
    present();
  }, [inkColor, present]);

  useLayoutEffect(() => {
    const el = pageRef.current;
    const ro = new ResizeObserver(([entry]) => setCssWidth(entry.contentRect.width));
    ro.observe(el);
    setCssWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(emitTimer.current), []);

  // Zoom, keeping the point under (ax, ay) in viewport px — the middle of the
  // visible part of the page by default — where it is.
  const zoomTo = useCallback((next, ax, ay) => {
    const v = viewRef.current;
    const pg = pageRef.current;
    next = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], next));
    if (!v || Math.abs(next - zoomRef.current) < 1e-4) return;
    const before = pg.getBoundingClientRect();
    const x = ax ?? (Math.max(before.left, 0) + Math.min(before.right, window.innerWidth)) / 2;
    const y = ay ?? (Math.max(before.top, 0) + Math.min(before.bottom, window.innerHeight)) / 2;
    const fx = (x - before.left) / before.width;
    const fy = (y - before.top) / before.height;
    flushSync(() => setZoom(next));
    const after = pg.getBoundingClientRect();
    v.scrollLeft += after.left + fx * after.width - x;
    window.scrollBy(0, after.top + fy * after.height - y);
  }, []);

  // To the next preset zoom.
  const stepZoom = useCallback(
    (dir, ax, ay) => {
      const z = zoomRef.current;
      const next = dir > 0 ? (ZOOMS.find((v) => v > z + 1e-3) ?? ZOOMS[ZOOMS.length - 1]) : (ZOOMS.findLast((v) => v < z - 1e-3) ?? ZOOMS[0]);
      zoomTo(next, ax, ay);
    },
    [zoomTo],
  );

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const v = viewRef.current;
    let acc = 0;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 40) return;
      stepZoom(acc < 0 ? 1 : -1, e.clientX, e.clientY);
      acc = 0;
    };
    v.addEventListener('wheel', onWheel, { passive: false });
    return () => v.removeEventListener('wheel', onWheel);
  }, [stepZoom]);

  useEffect(() => {
    if (!adjustOpen) return undefined;
    const outside = (e) => {
      if (!adjustRef.current?.contains(e.target)) setAdjustOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setAdjustOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [adjustOpen]);

  // Hold Space over the pad to drag the page around.
  useEffect(() => {
    const typing = (e) => e.target.closest?.('input, select, textarea');
    const down = (e) => {
      if (e.code !== 'Space' || !hoverRef.current || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) setSpaceHeld(true);
    };
    const up = (e) => {
      if (e.code !== 'Space') return;
      if (hoverRef.current && !typing(e)) e.preventDefault();
      setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const nibSettings = () => {
    if (nib === 'pen') return { nib, size: PEN_SIZES[penSize] };
    if (nib === 'broad') return { nib, size: BROAD_SIZES[broadSize], angle };
    return { nib, hairline: flex.hairline, maxWidth: flex.maxWidth, swell: flex.swell, slant: flex.slant };
  };

  const toPage = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * pageW,
      y: ((e.clientY - r.top) / r.height) * height,
      t: performance.now(),
      p: e.pressure || 0.5,
      pen: e.pointerType === 'pen',
    };
  };

  // Panning scrolls the pad sideways and the window up and down.
  const startPan = (x, y, fingers = false) => {
    panRef.current = { x, y, left: viewRef.current.scrollLeft, top: window.scrollY, fingers };
  };
  const movePan = (x, y) => {
    const pan = panRef.current;
    viewRef.current.scrollLeft = pan.left - (x - pan.x);
    window.scrollTo(window.scrollX, pan.top - (y - pan.y));
  };
  const fingersMid = () => {
    const [a, b] = touchesRef.current.values();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    if (e.pointerType === 'pen' && !penSeen) setPenSeen(true);
    if (e.pointerType === 'touch' && penSeen) return; // the pen writes; fingers scroll natively
    inkRef.current.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchesRef.current.size === 2) {
        currentRef.current = null; // the first finger was the start of a scroll, not a stroke
        present();
        const mid = fingersMid();
        startPan(mid.x, mid.y, true);
        return;
      }
      if (touchesRef.current.size > 2) return;
    }
    if (hand || spaceHeld || e.button === 1) {
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0 || panRef.current) return;
    currentRef.current = { ...nibSettings(), points: [toPage(e)] };
    onResult(null);
    present();
  };

  const onPointerMove = (e) => {
    if (touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pan = panRef.current;
    if (pan) {
      if (!pan.fingers) movePan(e.clientX, e.clientY);
      else if (touchesRef.current.size >= 2) {
        const mid = fingersMid();
        movePan(mid.x, mid.y);
      }
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [e];
    for (const ev of events) cur.points.push(toPage(ev));
    present();
  };

  const onPointerUp = (e) => {
    touchesRef.current.delete(e.pointerId);
    if (panRef.current) {
      if (!panRef.current.fingers || touchesRef.current.size === 0) panRef.current = null;
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;
    currentRef.current = null;
    strokesRef.current.push(cur);
    historyRef.current.push({ add: cur });
    futureRef.current = [];
    paintOne(layerRef.current, cur, 1);
    paintOne(screenRef.current, cur, scaleRef.current);
    present();
    changed(false);
  };

  // After any change to the strokes: counts, picture, and a new letter.
  const changed = (repaint = true, wait = undefined) => {
    setStrokeCount(strokesRef.current.length);
    setSteps({ undo: historyRef.current.length, redo: futureRef.current.length });
    if (repaint) redraw();
    scheduleEmit(wait);
  };

  const enterWriting = () => {
    writingRef.current = true;
    setWriting(true);
  };
  const leaveWriting = () => {
    writingRef.current = false;
    setWriting(false);
    setDraftCount(draftRef.current.strokes.length);
    present();
  };

  // Write mode's Play: its draft joins the letter (each stroke undoable here
  // as usual), the letter is emitted now, and the whole of it comes back to be played.
  const commitDraft = () => {
    const draft = draftRef.current.strokes;
    draftRef.current.strokes = [];
    for (const { stroke } of draft) {
      strokesRef.current.push(stroke);
      historyRef.current.push({ add: stroke });
    }
    if (draft.length) futureRef.current = [];
    setDraftCount(0);
    changed(true, 0);
    return { width: pageW, height, strokes: timedStrokes(strokesRef.current) };
  };
  const writtenOut = () => {
    leaveWriting();
    onWritten?.();
  };

  const undo = () => {
    const h = historyRef.current.pop();
    if (!h) return;
    if (h.add) strokesRef.current.pop();
    else strokesRef.current = h.cleared;
    futureRef.current.push(h);
    changed();
  };

  const redo = () => {
    const h = futureRef.current.pop();
    if (!h) return;
    if (h.add) strokesRef.current.push(h.add);
    else strokesRef.current = [];
    historyRef.current.push(h);
    changed();
  };

  const clear = () => {
    if (!strokesRef.current.length) return;
    historyRef.current.push({ cleared: strokesRef.current });
    futureRef.current = [];
    strokesRef.current = [];
    changed();
  };

  // Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z or Ctrl+Y redoes (not while typing in a field).
  const keysRef = useRef({ undo, redo });
  keysRef.current = { undo, redo };
  useEffect(() => {
    const onKey = (e) => {
      if (writingRef.current || !(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest?.('input, textarea, [contenteditable]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) keysRef.current.undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') keysRef.current.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A preset can bring the line height it's meant to be written at.
  const choosePreset = (id) => {
    setFlex({ ...FLEX_PRESETS[id] });
    if (FLEX_PRESETS[id].lineMm) setSpacing(Math.round(FLEX_PRESETS[id].lineMm * PX_PER_MM));
  };
  const setFlexField = (field) => (e) => setFlex((f) => ({ ...f, [field]: Number(e.target.value) }));
  const num = (e) => Number(e.target.value);
  const panning = hand || spaceHeld;
  const hint = hintText
    ? hintText
    : draftCount
      ? `${draftCount} stroke${draftCount === 1 ? '' : 's'} waiting in the chase: they join the letter when you press Play there.`
      : !compact && !strokeCount
        ? 'Choose your pen, then Chase: zoomed in on your line, and the page follows you along it.'
        : penSeen
          ? 'The pen writes; fingers scroll.'
          : zoom > 1
            ? 'Hold Space and drag, use Move, or two fingers, to get around.'
            : 'Zoom in to write smaller and fit more on the page.';

  return (
    <div className={compact ? 'pad compact' : 'pad'}>
      <div className="pad-tools">
        <div className="field">
          <span>Nib</span>
          <div className="nib-picker" role="group" aria-label="Nib">
            {Object.keys(NIBS).map((id) => (
              <button key={id} type="button" aria-pressed={nib === id} title={NIBS[id].name} onClick={() => setNib(id)}>
                <svg viewBox="0 0 36 18" aria-hidden="true">
                  {NIB_CHOICES[id].sample}
                </svg>
                {NIB_CHOICES[id].label}
              </button>
            ))}
          </div>
        </div>
        {nib === 'pen' && (
          <label className="field">
            <span>Size</span>
            <select id="size" value={penSize} onChange={(e) => setPenSize(e.target.value)}>
              {Object.keys(PEN_SIZES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {nib === 'broad' && (
          <label className="field">
            <span>Size</span>
            <select id="size" value={broadSize} onChange={(e) => setBroadSize(e.target.value)}>
              {Object.keys(BROAD_SIZES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {nib === 'flex' && (
          <label className="field">
            <span>Preset</span>
            <select id="preset" value={preset} onChange={(e) => e.target.value !== 'custom' && choosePreset(e.target.value)}>
              {Object.entries(FLEX_PRESETS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </label>
        )}
        {nib !== 'pen' && (
          <div className="popover-wrap" ref={adjustRef}>
            <button type="button" className="adjust" aria-expanded={adjustOpen} onClick={() => setAdjustOpen((o) => !o)}>
              Adjust ▾
            </button>
            {adjustOpen && (
              <div className="popover" role="dialog" aria-label="Nib settings">
                {nib === 'flex' && (
                  <div className="controls">
                    <label htmlFor="hairline">Hairline</label>
                    <input id="hairline" type="range" min="0.6" max="3" step="0.1" value={flex.hairline} onChange={setFlexField('hairline')} />
                    <span>{flex.hairline.toFixed(1)} px</span>

                    <label htmlFor="maxWidth">Max width</label>
                    <input id="maxWidth" type="range" min="2" max="30" step="1" value={flex.maxWidth} onChange={setFlexField('maxWidth')} />
                    <span>{flex.maxWidth} px</span>

                    <label htmlFor="swell">Swell over</label>
                    <input id="swell" type="range" min="5" max="80" step="1" value={flex.swell} onChange={setFlexField('swell')} />
                    <span>{flex.swell} px</span>

                    <label htmlFor="slant">Slant</label>
                    <input id="slant" type="range" min="40" max="90" step="1" value={flex.slant} onChange={setFlexField('slant')} />
                    <span>{flex.slant}°</span>
                  </div>
                )}
                {nib === 'broad' && (
                  <div className="controls">
                    <label htmlFor="angle">Nib angle</label>
                    <input id="angle" type="range" min="0" max="180" step="5" value={angle} onChange={(e) => setAngle(num(e))} />
                    <span>{angle}°</span>
                  </div>
                )}
                <p className="hint">
                  {nib === 'flex' && `Downstrokes along the slant swell over ${flex.swell} px and thin again before release; upstrokes stay hairline. A pressure pen drives the width instead.`}
                  {nib === 'broad' && 'Thick and thin come from the direction you move against the fixed nib angle, like a real broad nib.'}
                </p>
              </div>
            )}
          </div>
        )}
        <span className="tool-sep" aria-hidden="true" />
        <label className="field">
          <span>Lines</span>
          <select id="guide" value={guide} onChange={(e) => setGuide(e.target.value)}>
            {Object.keys(GUIDES).map((g) => (
              <option key={g} value={g}>
                {GUIDE_NAMES[g] ?? g}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Line height</span>
          <input id="spacing" type="range" min="24" max="160" step="1" value={spacing} onChange={(e) => setSpacing(num(e))} disabled={guide === 'none'} />
          <output>{(spacing / PX_PER_MM).toFixed(1)} mm</output>
        </label>
        {onPaperChange && (
          <label className="field">
            <span>Paper</span>
            <select value={paper} onChange={(e) => onPaperChange(e.target.value)}>
              {Object.entries(PAPERS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!compact && (
          <div className="field">
            <span>Page</span>
            <div className="tabs small" role="group" aria-label="Page">
              {Object.keys(PAGES).map((p) => (
                <button key={p} type="button" aria-pressed={page === p} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pad-desk">
        <div className="pad-bar">
          <div className="cluster">
            <button type="button" onClick={undo} disabled={!steps.undo} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!steps.redo} title="Redo (Ctrl+Shift+Z)">
              Redo
            </button>
            <button type="button" className="quiet" onClick={clear} disabled={!strokeCount}>
              Clear
            </button>
          </div>
          <span className="pad-hint">{hint}</span>
          <div className="cluster">
            {!compact && (
              <>
                <div className="split">
                  <button
                    type="button"
                    aria-pressed={writing}
                    className="toggle write-enter"
                    onClick={enterWriting}
                    title="Chase: zoom in on your line, full screen, and the page follows your pen along it"
                  >
                    {draftCount ? 'Chase · back to it' : 'Chase'}
                  </button>
                  <button type="button" aria-expanded={chaseOpen} aria-label="Chase settings" className="more" onClick={() => setChaseOpen((o) => !o)}>
                    ⚙
                  </button>
                </div>
                <span className="tool-sep" aria-hidden="true" />
              </>
            )}
            <button type="button" aria-pressed={hand} className="toggle" onClick={() => setHand((h) => !h)} title="Drag to move around the page">
              Move
            </button>
            <div className="zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="zoom-level" onClick={() => zoomTo(1)} title="Fit the page to the width">
                {Math.abs(zoom - 1) < 1e-3 ? 'fit' : `${Math.round(zoom * 100)}%`}
              </button>
              <button type="button" onClick={() => stepZoom(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">
                +
              </button>
            </div>
          </div>
          {chaseOpen && !compact && <ChaseSettings settings={chase} onChange={(patch) => setChaseSettings(setChase(patch))} />}
        </div>
        <div className="pad-view-wrap">
          <div
            className="pad-view"
            ref={viewRef}
            onPointerEnter={() => {
              hoverRef.current = true;
            }}
            onPointerLeave={() => {
              hoverRef.current = false;
            }}
          >
            <div className="pad-page" ref={pageRef} style={{ width: `${zoom * 100}%` }}>
              <canvas ref={guideRef} className="guide" width={screenW} height={screenH} />
              <canvas
                ref={inkRef}
                className={`ink${panning ? ' grab' : ''}${penSeen ? ' pen-scroll' : ''}`}
                width={screenW}
                height={screenH}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </div>
        </div>
      </div>
      {writing && (
        <WriteMode
          getStrokes={() => strokesRef.current}
          draftRef={draftRef}
          nib={nibSettings}
          pageW={pageW}
          height={height}
          rows={guideRows(guide === 'none' ? 'plain' : guide, spacing, height)}
          spacing={spacing}
          guide={guide}
          slant={chase.SLANT_GUIDES ? (nib === 'flex' ? flex.slant : chase.SLANT_DEG) : 0}
          paper={paper}
          inkColor={inkColor}
          onLeave={leaveWriting}
          onPlay={commitDraft}
          onDone={writtenOut}
        />
      )}
    </div>
  );
}
