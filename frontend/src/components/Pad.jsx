import { useCallback, useEffect, useRef, useState } from 'react';
import { NIBS, PEN_SIZES, BROAD_SIZES, FLEX_PRESETS, GUIDES, renderStroke, toSharedStroke, drawGuides, guideRows } from '../ink/nibs.js';
import { encodeInkPng } from '../ink/encode.js';
import { encodeStrokes } from '../ink/strokes.js';

const PAGE_WIDTH = 1400; // same page width as a photographed letter
const PAGES = { half: 905, full: 1811 };
const FLEX_FIELDS = ['hairline', 'maxWidth', 'swell', 'slant'];
const MAX_PAUSE = 1500; // ms of thinking time kept between strokes on playback

// Recorded pad strokes as the shared format, with real timing (long pauses capped).
function sharedStrokes(recorded) {
  const out = [];
  let clock = 0;
  let prevEnd = null;
  for (const stroke of recorded) {
    const s = toSharedStroke(stroke);
    if (!s.points.length) continue;
    const rawStart = s.points[0].t;
    clock += prevEnd == null ? 0 : Math.min(MAX_PAUSE, Math.max(0, rawStart - prevEnd));
    const base = clock;
    for (const p of s.points) p.t = base + Math.max(0, p.t - rawStart);
    clock = s.points[s.points.length - 1].t;
    prevEnd = stroke.points[stroke.points.length - 1].t;
    out.push(s);
  }
  return out;
}

// Write on screen. Emits the same result as the photo path:
// { png, strokesBlob, strokesData, fidelity, strokeCount, display, detectedColor,
//   width, height, ms, source: 'pad' } or null while dirty.
export default function Pad({ onResult }) {
  const [nib, setNib] = useState('pen');
  const [penSize, setPenSize] = useState('medium');
  const [flex, setFlex] = useState({ ...FLEX_PRESETS.copperplate });
  const [broadSize, setBroadSize] = useState('2.4 mm');
  const [angle, setAngle] = useState(35);
  const [guide, setGuide] = useState('plain');
  const [spacing, setSpacing] = useState(56);
  const [page, setPage] = useState('half');
  const [strokeCount, setStrokeCount] = useState(0);
  const guideRef = useRef(null);
  const inkRef = useRef(null);
  const layerRef = useRef(null); // committed strokes, page pixels
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const emitTimer = useRef(0);
  const jobRef = useRef(0);
  const height = PAGES[page];
  const slant = nib === 'flex' ? flex.slant : 0;
  const preset = Object.keys(FLEX_PRESETS).find((k) => FLEX_FIELDS.every((f) => FLEX_PRESETS[k][f] === flex[f])) ?? 'custom';

  const present = useCallback(() => {
    const ink = inkRef.current;
    if (!ink || !layerRef.current) return;
    const ctx = ink.getContext('2d');
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.drawImage(layerRef.current, 0, 0);
    if (currentRef.current) renderStroke(ctx, currentRef.current, true);
  }, []);

  const redrawLayer = useCallback(() => {
    const layer = layerRef.current;
    const ctx = layer.getContext('2d');
    ctx.clearRect(0, 0, layer.width, layer.height);
    for (const s of strokesRef.current) renderStroke(ctx, s);
    present();
  }, [present]);

  // Encode the drawing a moment after the last change.
  const scheduleEmit = useCallback(() => {
    onResult(null);
    clearTimeout(emitTimer.current);
    if (!strokesRef.current.length) return;
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
        strokes: sharedStrokes(strokesRef.current),
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
    }, 500);
  }, [onResult, guide, spacing]);

  // A new page size means a new layer; strokes are redrawn onto it.
  useEffect(() => {
    const layer = document.createElement('canvas');
    layer.width = PAGE_WIDTH;
    layer.height = height;
    layer.getContext('2d', { willReadFrequently: true });
    layerRef.current = layer;
    redrawLayer();
    scheduleEmit();
  }, [height, redrawLayer, scheduleEmit]);

  useEffect(() => {
    drawGuides(guideRef.current.getContext('2d'), PAGE_WIDTH, height, { guide, spacing, slant });
  }, [guide, spacing, height, slant]);

  useEffect(() => () => clearTimeout(emitTimer.current), []);

  const nibSettings = () => {
    if (nib === 'pen') return { nib, size: PEN_SIZES[penSize] };
    if (nib === 'broad') return { nib, size: BROAD_SIZES[broadSize], angle };
    return { nib, hairline: flex.hairline, maxWidth: flex.maxWidth, swell: flex.swell, slant: flex.slant };
  };

  const toPage = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * PAGE_WIDTH,
      y: ((e.clientY - r.top) / r.height) * height,
      t: performance.now(),
      p: e.pressure || 0.5,
      pen: e.pointerType === 'pen',
    };
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    inkRef.current.setPointerCapture(e.pointerId);
    currentRef.current = { ...nibSettings(), points: [toPage(e)] };
    onResult(null);
    present();
  };

  const onPointerMove = (e) => {
    const cur = currentRef.current;
    if (!cur) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e];
    for (const ev of events) cur.points.push(toPage(ev));
    present();
  };

  const onPointerUp = () => {
    const cur = currentRef.current;
    if (!cur) return;
    currentRef.current = null;
    strokesRef.current.push(cur);
    renderStroke(layerRef.current.getContext('2d'), cur);
    present();
    setStrokeCount(strokesRef.current.length);
    scheduleEmit();
  };

  const undo = () => {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redrawLayer();
    scheduleEmit();
  };

  const clear = () => {
    strokesRef.current = [];
    setStrokeCount(0);
    redrawLayer();
    scheduleEmit();
  };

  const setFlexField = (field) => (e) => setFlex((f) => ({ ...f, [field]: Number(e.target.value) }));
  const num = (e) => Number(e.target.value);

  return (
    <>
      <div className="row">
        <label>
          Script{' '}
          <select id="nib" value={nib} onChange={(e) => setNib(e.target.value)}>
            {Object.entries(NIBS).map(([id, n]) => <option key={id} value={id}>{n.name}</option>)}
          </select>
        </label>
        {nib === 'pen' && (
          <label>
            Size{' '}
            <select id="size" value={penSize} onChange={(e) => setPenSize(e.target.value)}>
              {Object.keys(PEN_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {nib === 'broad' && (
          <label>
            Size{' '}
            <select id="size" value={broadSize} onChange={(e) => setBroadSize(e.target.value)}>
              {Object.keys(BROAD_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {nib === 'flex' && (
          <label>
            Preset{' '}
            <select id="preset" value={preset} onChange={(e) => e.target.value !== 'custom' && setFlex({ ...FLEX_PRESETS[e.target.value] })}>
              {Object.entries(FLEX_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
              <option value="custom">custom</option>
            </select>
          </label>
        )}
      </div>

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

      <div className="row">
        <label>
          Lines{' '}
          <select id="guide" value={guide} onChange={(e) => setGuide(e.target.value)}>
            {Object.keys(GUIDES).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>
          Line height <input id="spacing" type="range" min="30" max="160" step="2" value={spacing} onChange={(e) => setSpacing(num(e))} /> {spacing} px
        </label>
        <label>
          Page{' '}
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            <option value="half">half</option>
            <option value="full">full</option>
          </select>
        </label>
        <button type="button" onClick={undo} disabled={!strokeCount}>Undo</button>
        <button type="button" onClick={clear} disabled={!strokeCount}>Clear</button>
      </div>
      <p className="muted">
        {nib === 'flex' && `Downstrokes along the slant swell over ${flex.swell} px and thin again before release; upstrokes stay hairline. A pressure pen drives the width instead.`}
        {nib === 'broad' && 'Thick and thin come from the direction you move against the fixed nib angle, like a real broad nib.'}
        {nib === 'pen' && 'A plain pen: the same width everywhere.'}
      </p>
      <div className="pad">
        <canvas ref={guideRef} className="guide" width={PAGE_WIDTH} height={height} />
        <canvas
          ref={inkRef}
          className="ink"
          width={PAGE_WIDTH}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </>
  );
}
