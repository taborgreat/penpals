import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NIBS, PEN_SIZES, BROAD_SIZES, FLEX_PRESETS, GUIDES, PX_PER_MM, drawGuides, guideRows } from '../ink/nibs.js';
import { PAPERS } from '../ink/paper.js';
import { lawPen, FLOW_DEFAULT, SPATTER_DEFAULT } from '../ink/pens.js';
import { CELLS } from '../ink/live.js';
import WriteMode from './WriteMode.jsx';
import { CHASE, setChase } from './chase.js';
import ChaseSettings from './ChaseSettings.jsx';
import DepthStrip from './DepthStrip.jsx';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn, sceneSupported, setViewChoice, useLowPower } from '../scene/support.js';
import { createCameraStack } from '../scene/stack.js';

const PAGE_WIDTH = 1400; // same page width as a photographed letter
export const PAGES = { half: 905, full: 1811 };
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

// Write on screen, on a sheet of the law's paper (Living Ink). `ink` is the
// live sheet (ink/live.js) the parent made for this writing: the pad captures
// into it and shows what its worker grows, which is exactly what will be
// sealed. `onChange(strokes)` reports how many strokes there are; the parent
// settles and seals when the writer is done (ink.settle()).
// `size` ({ width, height } in page px) makes it a compact pad on a page of
// that size, for short things like a signature: same nibs, lines, undo and
// zoom, but no page sizes or write mode.
// The page is always PAGE_WIDTH px wide (or size.width); zoom only changes how
// big it is on screen, so zooming in lets you write smaller and fit more.
// One finger writes, two fingers scroll; once a stylus is used, fingers only scroll.
// Write mode (WriteMode.jsx) writes into the same sheet with the chase; its
// strokes are a draft until its Play, and one undo walks back through both.
// The ink's colour, nib and flow are on the pen, recorded with the strokes;
// Alt + wheel changes the flow, even mid-stroke.
export default function Pad({ ink, onChange = null, inkColor = '#1a1a1a', size = null, hint: hintText = null, paper = 'plain', onPaperChange = null, onWritten = null, chase: allowChase = null, prompt = null }) {
  const [nib, setNib] = useState('flex');
  const [penSize, setPenSize] = useState('medium');
  const [flex, setFlex] = useState({ ...FLEX_PRESETS.copperplate });
  const [broadSize, setBroadSize] = useState('2.4 mm');
  const [angle, setAngle] = useState(35);
  const [flow, setFlow] = useState(FLOW_DEFAULT);
  const [spatterSet, setSpatter] = useState(null); // null: the nib's default (law 2 sheets only)
  const [guide, setGuide] = useState('plain');
  const [spacing, setSpacing] = useState(() => Math.round(FLEX_PRESETS.copperplate.lineMm * PX_PER_MM));
  const [page, setPage] = useState('half');
  const [strokeCount, setStrokeCount] = useState(ink.strokes);
  const [zoom, setZoom] = useState(1);
  const [cssWidth, setCssWidth] = useState(0); // on-screen width of the page
  const [hand, setHand] = useState(false); // the move tool
  const [depth, setDepth] = useState(false); // a cut through the paper below the pad (law 2)
  // The scene (lit 2D by default, 3D to choose; the flat look where the device can't, or by choice).
  // (not on the pads that read the hand: law 1 sheets stay as they are)
  const [scene, setScene] = useState(() => ink.law >= 2 && sceneOn());
  const lowPower = useLowPower();
  useEffect(() => { setScene(ink.law >= 2 && sceneOn()); }, [lowPower]); // eslint-disable-line react-hooks/exhaustive-deps
  const [toolsHost, setToolsHost] = useState(null);
  const [sceneMode, setSceneMode] = useState('2d');
  const sceneRef = useRef(null);
  const sceneBoxRef = useRef(null);
  const camStack = useRef(createCameraStack()).current;
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [penSeen, setPenSeen] = useState(false); // once a stylus writes, fingers scroll
  const [writing, setWriting] = useState(false); // in write mode
  const [draftCount, setDraftCount] = useState(0); // strokes written in write mode, not yet played
  const [chase, setChaseSettings] = useState(() => ({ ...CHASE })); // the chase's knobs, as the settings panel shows them
  const [chaseOpen, setChaseOpen] = useState(false); // the chase settings panel
  const [adjustOpen, setAdjustOpen] = useState(false); // the nib's sliders, in a dropdown
  const [error, setError] = useState(null);
  const adjustRef = useRef(null);
  const guideRef = useRef(null);
  const inkRef = useRef(null);
  const viewRef = useRef(null);
  const pageRef = useRef(null);
  const draftRef = useRef({ strokes: [], camera: null }); // write mode's draft, kept while you're out of it
  const writingRef = useRef(false);
  const downRef = useRef(false); // the pen is down on the pad
  const panRef = useRef(null);
  const touchesRef = useRef(new Map()); // fingers down on the pad
  const hoverRef = useRef(false);
  const zoomRef = useRef(zoom);
  const frameRef = useRef(0);
  const compact = !!size;
  const showChase = allowChase ?? !compact; // a compact pad can still offer write mode (a long text on a phone)
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
  const sizeRef = useRef({ pageW, height });
  sizeRef.current = { pageW, height };
  zoomRef.current = zoom;

  // The sheet as the worker grows it, scaled to the screen.
  const present = useCallback(() => {
    frameRef.current = 0;
    const c = inkRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    const { pageW: w, height: h } = sizeRef.current;
    ctx.drawImage(ink.canvas, 0, 0, w * CELLS, h * CELLS, 0, 0, c.width, c.height);
  }, [ink]);
  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(present);
  }, [present]);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  useEffect(() => { ink.scene?.(scene); }, [ink, scene]);
  const liveSheet = useMemo(() => [{ id: 'live', box: [0, 0, Math.ceil(pageW * CELLS), Math.ceil(height * CELLS)], origin: [0, 0], cellPx: 1 / CELLS, live: ink }], [ink, pageW, height]);
  // The scene's frame: in 2D the part of the page in sight (the page scrolls and
  // zooms as ever, the scene shows just that part, lit); in 3D the whole view.
  const placeScene = useCallback(() => {
    const box = sceneBoxRef.current;
    const wrap = viewRef.current?.parentElement;
    const inkEl = inkRef.current;
    if (!box || !wrap || !inkEl) return;
    const w = wrap.getBoundingClientRect();
    const r = sceneMode === '3d' ? w : inkEl.getBoundingClientRect();
    const v = viewRef.current.getBoundingClientRect();
    const x0 = Math.max(r.left, sceneMode === '3d' ? w.left : v.left, 0), x1 = Math.min(r.right, sceneMode === '3d' ? w.right : v.right, window.innerWidth);
    const y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, window.innerHeight);
    box.style.left = `${x0 - w.left}px`;
    box.style.top = `${y0 - w.top}px`;
    box.style.width = `${Math.max(0, x1 - x0)}px`;
    box.style.height = `${Math.max(0, y1 - y0)}px`;
    box.dataset.frame = [(x0 - r.left) / r.width, (y0 - r.top) / r.height, (x1 - r.left) / r.width, (y1 - r.top) / r.height].join(',');
    sceneRef.current?.invalidate();
  }, [sceneMode]);
  const frame2d = useCallback(() => {
    const [fx0, fy0, fx1, fy1] = (sceneBoxRef.current?.dataset.frame ?? '0,0,1,1').split(',').map(Number);
    const { pageW: w, height: h } = sizeRef.current;
    return [fx0 * w, fy0 * h, fx1 * w, fy1 * h];
  }, []);
  useLayoutEffect(() => {
    if (!scene) return undefined;
    placeScene();
    const on = () => placeScene();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    viewRef.current?.addEventListener('scroll', on, { passive: true });
    const view = viewRef.current;
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      view?.removeEventListener('scroll', on);
    };
  }, [scene, placeScene, zoom, screenW, screenH, cssWidth]);
  const sceneWriter = useMemo(() => ({
    penDown: (cam) => camStack.penDown(cam),
    down: (p, ev, type) => { downRef.current = true; ink.capture.down(p, ev, type); },
    move: (p, ev) => ink.capture.move(p, ev),
    up: (p, ev) => { downRef.current = false; ink.capture.up(p, ev); },
    cancel: () => { downRef.current = false; ink.capture.cancel(); camStack.undo(); },
  }), [ink, camStack]);
  const paperRgb = useMemo(() => {
    const hex = (PAPERS[paper] ?? PAPERS.plain).color;
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }, [paper]);

  useEffect(() => ink.onChange(() => {
    schedule();
    setStrokeCount(ink.strokes);
    setError(ink.error ? 'This writing has more ink than one sheet can hold. Undo a little.' : null);
  }), [ink, schedule]);
  useEffect(() => { onChange?.(strokeCount); }, [strokeCount, onChange]);

  const nibSettings = useCallback(() => {
    if (nib === 'pen') return { nib, size: PEN_SIZES[penSize] };
    if (nib === 'broad') return { nib, size: BROAD_SIZES[broadSize], angle };
    return { nib, hairline: flex.hairline, maxWidth: flex.maxWidth, swell: flex.swell, slant: flex.slant };
  }, [nib, penSize, broadSize, angle, flex]);

  // The pen the next ink is written with (mid-stroke too: the flow wheel). A flex
  // nib under a mouse or finger gets its thick and thin from the slant (capture.js).
  const spatter = ink.law >= 2 ? (spatterSet ?? SPATTER_DEFAULT[nib]) : undefined;
  useEffect(() => { ink.setPen(lawPen(nibSettings(), inkColor, flow, spatter)); }, [ink, nibSettings, inkColor, flow, spatter]);
  useEffect(() => { ink.capture.setFlex(nib === 'flex' ? { slant: flex.slant, swell: flex.swell, hold: ink.law >= 2 } : null); }, [ink, nib, flex.slant, flex.swell]);

  useLayoutEffect(() => { present(); }, [screenW, screenH, present]);

  useLayoutEffect(() => {
    drawGuides(guideRef.current.getContext('2d'), pageW, height, { guide, spacing, slant, scale, lineWidth: dpr, paper });
  }, [guide, spacing, height, slant, scale, screenW, screenH, dpr, paper, pageW]);

  useLayoutEffect(() => {
    const el = pageRef.current;
    const ro = new ResizeObserver(([entry]) => setCssWidth(entry.contentRect.width));
    ro.observe(el);
    setCssWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

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
  const stepZoom = useCallback((dir, ax, ay) => {
    const z = zoomRef.current;
    const next = dir > 0
      ? ZOOMS.find((v) => v > z + 1e-3) ?? ZOOMS[ZOOMS.length - 1]
      : ZOOMS.findLast((v) => v < z - 1e-3) ?? ZOOMS[0];
    zoomTo(next, ax, ay);
  }, [zoomTo]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer; Alt + wheel sets the flow.
  useEffect(() => {
    const v = viewRef.current;
    let acc = 0;
    let flowAcc = 0;
    const onWheel = (e) => {
      if (e.altKey) {
        e.preventDefault();
        flowAcc += e.deltaY;
        if (Math.abs(flowAcc) < 40) return;
        setFlow((f) => Math.min(15, Math.max(0, f + (flowAcc < 0 ? 1 : -1))));
        flowAcc = 0;
        return;
      }
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
    const outside = (e) => { if (!adjustRef.current?.contains(e.target)) setAdjustOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setAdjustOpen(false); };
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

  const toPage = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * pageW, y: ((e.clientY - r.top) / r.height) * height };
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
        if (downRef.current) ink.capture.cancel(); // the first finger was the start of a scroll, not a stroke
        downRef.current = false;
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
    downRef.current = true;
    camStack.penDown(scene ? sceneRef.current?.camera() ?? null : null);
    ink.capture.down(toPage(e), e.nativeEvent, e.pointerType);
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
    if (!downRef.current) return;
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [e.nativeEvent];
    for (const ev of events) ink.capture.move(toPage(ev), ev);
  };

  const onPointerUp = (e) => {
    touchesRef.current.delete(e.pointerId);
    if (panRef.current) {
      if (!panRef.current.fingers || touchesRef.current.size === 0) panRef.current = null;
      return;
    }
    if (!downRef.current) return;
    downRef.current = false;
    if (e.type === 'pointercancel') ink.capture.cancel();
    else ink.capture.up(toPage(e), e.nativeEvent);
  };

  const enterWriting = () => {
    writingRef.current = true;
    setWriting(true);
  };
  const leaveWriting = () => {
    writingRef.current = false;
    setWriting(false);
    setDraftCount(draftRef.current.strokes.length);
    schedule();
  };

  // Write mode's Play: its draft joins the writing (it is in the sheet already;
  // only the draft's camera bookkeeping ends), and the sheet is written out again.
  const commitDraft = () => {
    draftRef.current.strokes = [];
    setDraftCount(0);
    return {
      width: pageW,
      height,
      strokes: ink.capture.strokes,
      makePlayer: (canvas) => {
        canvas.width = ink.canvas.width;
        canvas.height = Math.round(height * CELLS);
        return ink.play(canvas);
      },
    };
  };
  const writtenOut = () => {
    leaveWriting();
    onWritten?.();
  };

  // One undo for everything on the sheet, newest first: a stroke from write
  // mode's draft leaves the draft too.
  const undo = () => {
    if (downRef.current) return;
    const s = ink.undo();
    if (s) {
      const cam = camStack.undo(); // the camera as it was before that stroke, with the ink
      if (cam && scene) {
        if (cam.mode !== sceneMode) setSceneMode(cam.mode);
        sceneRef.current?.setCamera(cam);
      }
    }
    const draft = draftRef.current.strokes;
    if (s && draft.length && draft.at(-1).captured === s) {
      draft.pop();
      setDraftCount(draft.length);
    }
  };

  const clear = () => {
    if (!ink.strokes || downRef.current) return;
    ink.clear();
    camStack.clear();
    draftRef.current = { strokes: [], camera: null };
    setDraftCount(0);
  };

  // Ctrl/⌘+Z undoes (not while typing in a field, nor in write mode, which has its own).
  const keysRef = useRef({ undo });
  keysRef.current = { undo };
  useEffect(() => {
    const onKey = (e) => {
      if (writingRef.current || !(e.ctrlKey || e.metaKey) || e.altKey || e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      keysRef.current.undo();
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
  const hint = hintText ? hintText
    : draftCount ? `${draftCount} stroke${draftCount === 1 ? '' : 's'} waiting in the chase: press Play there when you're done.`
    : showChase && !strokeCount ? 'Choose your pen, then Chase: zoomed in on your line, and the page follows you along it.'
    : penSeen ? 'The pen writes; fingers scroll.'
      : zoom > 1 ? 'Hold Space and drag, use Move, or two fingers, to get around.' : 'Zoom in to write smaller. Alt + wheel: more or less ink.';

  return (
    <div className={compact ? 'pad compact' : 'pad'}>
      <div className="pad-tools">
        <div className="field">
          <span>Nib</span>
          <div className="nib-picker" role="group" aria-label="Nib">
            {Object.keys(NIBS).map((id) => (
              <button key={id} type="button" aria-pressed={nib === id} title={NIBS[id].name} onClick={() => setNib(id)}>
                <svg viewBox="0 0 36 18" aria-hidden="true">{NIB_CHOICES[id].sample}</svg>
                {NIB_CHOICES[id].label}
              </button>
            ))}
          </div>
        </div>
        {nib === 'pen' && (
          <label className="field">
            <span>Size</span>
            <select id="size" value={penSize} onChange={(e) => setPenSize(e.target.value)}>
              {Object.keys(PEN_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {nib === 'broad' && (
          <label className="field">
            <span>Size</span>
            <select id="size" value={broadSize} onChange={(e) => setBroadSize(e.target.value)}>
              {Object.keys(BROAD_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {nib === 'flex' && (
          <label className="field">
            <span>Preset</span>
            <select id="preset" value={preset} onChange={(e) => e.target.value !== 'custom' && choosePreset(e.target.value)}>
              {Object.entries(FLEX_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
              <option value="custom">custom</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Flow</span>
          <input type="range" min="0" max="15" step="1" value={flow} onChange={(e) => setFlow(num(e))} title="How freely the nib gives ink (Alt + wheel)" />
        </label>
        {spatter !== undefined && (
          <label className="field">
            <span>Spatter</span>
            <input type="range" min="0" max="15" step="1" value={spatter} onChange={(e) => setSpatter(num(e))} title="How readily the pen throws ink on fast flicks, hard landings and heavy dwells (0: never)" />
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

                    <label htmlFor="slant">Slant</label>
                    <input id="slant" type="range" min="40" max="90" step="1" value={flex.slant} onChange={setFlexField('slant')} />
                    <span>{flex.slant}°</span>
                  </div>
                )}
                {nib === 'broad' && (
                  <div className="controls">
                    <label htmlFor="angle">Nib angle</label>
                    <input id="angle" type="range" min="0" max="175" step="5" value={angle} onChange={(e) => setAngle(num(e))} />
                    <span>{angle}°</span>
                  </div>
                )}
                <p className="hint">
                  {nib === 'flex' && 'A hairline when light; pressed, it spreads to the max width. A pressure pen drives it; a mouse or finger writes at middling pressure.'}
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
            {Object.keys(GUIDES).map((g) => <option key={g} value={g}>{GUIDE_NAMES[g] ?? g}</option>)}
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
              {Object.entries(PAPERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {!compact && <div className="field">
          <span>Page</span>
          <div className="tabs small" role="group" aria-label="Page">
            {Object.keys(PAGES).map((p) => (
              <button key={p} type="button" aria-pressed={page === p} onClick={() => setPage(p)}>{p}</button>
            ))}
          </div>
        </div>}
      </div>

      <div className="pad-desk">
        <div className="pad-bar">
          <div className="cluster">
            <button type="button" onClick={undo} disabled={!strokeCount} title="Undo (Ctrl+Z)">Undo</button>
            {scene && <span ref={setToolsHost} className="scene-tools-host" />}
            {!scene && ink.law >= 2 && sceneSupported() && (
              <button type="button" className="quiet" onClick={() => { setViewChoice('scene'); setScene(true); }} title="The page lit, in 2D or 3D">Scene</button>
            )}
            <button type="button" className="quiet" onClick={clear} disabled={!strokeCount}>Clear</button>
          </div>
          <span className="pad-hint">{error ?? hint}</span>
          <div className="cluster">
            {showChase && <>
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
            </>}
            <button type="button" aria-pressed={hand} className="toggle" onClick={() => setHand((h) => !h)} title="Drag to move around the page">
              Move
            </button>
            {ink.law >= 2 && (
              <button type="button" aria-pressed={depth} className="toggle" onClick={() => setDepth((d) => !d)} title="A cut through the paper along your last line, live: the bead, the ink sinking in, dents">
                Into the paper
              </button>
            )}
            <div className="zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Zoom out">−</button>
              <button type="button" className="zoom-level" onClick={() => zoomTo(1)} title="Fit the page to the width">
                {Math.abs(zoom - 1) < 1e-3 ? 'fit' : `${Math.round(zoom * 100)}%`}
              </button>
              <button type="button" onClick={() => stepZoom(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in">+</button>
            </div>
          </div>
          {chaseOpen && showChase && <ChaseSettings settings={chase} onChange={(patch) => setChaseSettings(setChase(patch))} />}
        </div>
        <div className={`pad-view-wrap${scene ? ` scene-on scene-${sceneMode}` : ''}`}>
          {scene && (
            <div ref={sceneBoxRef} className="pad-scene">
              <SceneView
                ref={sceneRef}
                page={[pageW, height]}
                mode={sceneMode}
                onMode={setSceneMode}
                sheets={liveSheet}
                frame2d={frame2d}
                writer={sceneWriter}
                paper={paperRgb}
                cutSide={ink.law >= 2 ? (a, b) => ink.cut(Math.round(a[0] * CELLS), Math.round(a[1] * CELLS), Math.round(b[0] * CELLS), Math.round(b[1] * CELLS)) : null}
                onFlat={() => { setViewChoice('flat'); setScene(false); }}
                toolsHost={toolsHost}
                moments={() => ink.moments()}
                momentsKey={strokeCount}
              />
            </div>
          )}
          <div
            className="pad-view"
            ref={viewRef}
            onPointerEnter={() => { hoverRef.current = true; }}
            onPointerLeave={() => { hoverRef.current = false; }}
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
      {depth && <DepthStrip ink={ink} />}
      {writing && (
        <WriteMode
          getStrokes={() => ink.capture.strokes}
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
          capture={ink.capture}
          live={ink}
          prompt={prompt}
        />
      )}
    </div>
  );
}
