import { useEffect, useRef, useState } from 'react';
import { kb } from '../format.js';
import CornerPicker from './CornerPicker.jsx';
import {
  loadPhoto, detectPageCorners, defaultCorners, pageSize, warpPage, extractInk, encodeInkPng, traceStrokes, encodeStrokes,
  layoutStrokes, sweepTiming,
} from '../ink/index.js';

const PAGE_WIDTH = 1400; // px across the page; plenty for a screen, small on disk
const DEFAULT_PARAMS = { threshold: 0.08, softness: 0.3, despeckle: 6, edgeTrim: 0.01 };
const DEFAULT_LINES = { mode: 'auto', height: 90, offset: 45 };

// Let React paint (the "working…" label) before we block the thread with pixel work.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Rows (the boundaries between text lines) for a chosen line height.
function manualRows({ height, offset }, pageHeight) {
  const rows = [];
  for (let r = offset; r < pageHeight; r += height) rows.push(r);
  return rows;
}

// Photograph a page → ink mask → strokes. Emits through onResult:
// { png, strokesBlob, strokesData, fidelity, strokeCount, display, playable, guides,
//   detectedColor, width, height, ms, sourceBytes, source: 'photo' }, or null while working.
// A photographed letter is shown from its ink mask (display 'mask'); the traced
// strokes travel with it as data and steer playback, whose line geometry can
// be automatic, set by hand, or switched off for this letter.
export default function PhotoSource({ onResult }) {
  const [photo, setPhoto] = useState(null); // ImageData of the downscaled photo
  const [photoBytes, setPhotoBytes] = useState(0);
  const [corners, setCorners] = useState(null); // [TL, TR, BR, BL] in photo px
  const [shape, setShape] = useState('auto');
  const [rotate, setRotate] = useState(0);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [lines, setLines] = useState(DEFAULT_LINES);
  const [base, setBase] = useState(null); // the heavy part: mask, trace, colour
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const pageCache = useRef({ key: null, page: null }); // flattened page, reused while only sliders change
  const jobRef = useRef(0);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setWorking(true);
    setBase(null);
    onResult(null);
    pageCache.current = { key: null, page: null };
    try {
      const img = await loadPhoto(file);
      setPhoto(img);
      setPhotoBytes(file.size);
      setCorners(detectPageCorners(img) ?? defaultCorners(img));
    } catch (err) {
      setError(`Could not read that image: ${err.message}`);
      setWorking(false);
    }
  }

  // The pipeline: flatten, extract, trace. Debounced; stale runs are dropped.
  useEffect(() => {
    if (!photo || !corners) return undefined;
    const job = ++jobRef.current;
    const timer = setTimeout(async () => {
      setWorking(true);
      onResult(null);
      try {
        await nextPaint();
        const t0 = performance.now();
        const size = pageSize(corners, PAGE_WIDTH, shape);
        const key = JSON.stringify([corners, size, rotate]);
        if (pageCache.current.key !== key) {
          pageCache.current = { key, page: warpPage(photo, corners, size.width, size.height, { rotate }) };
        }
        const { mask, inkColor: detectedColor } = extractInk(pageCache.current.page, params);
        const png = await encodeInkPng(mask);
        const trace = traceStrokes(mask);
        if (job !== jobRef.current) return;
        setBase({
          png,
          trace,
          autoRows: trace.data.rows.slice(),
          autoTilt: trace.data.tilt,
          detectedColor,
          width: mask.width,
          height: mask.height,
          ms: Math.round(performance.now() - t0),
          sourceBytes: photoBytes,
        });
        setError(null);
      } catch (err) {
        if (job === jobRef.current) setError(err.message);
      } finally {
        if (job === jobRef.current) setWorking(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [photo, photoBytes, corners, shape, rotate, params, onResult]);

  // The cheap part: apply the playback line choice, time the strokes, encode.
  useEffect(() => {
    if (!base) return undefined;
    let cancelled = false;
    (async () => {
      const data = base.trace.data;
      if (lines.mode === 'manual') {
        data.tilt = 0;
        data.rows = manualRows(lines, data.height);
      } else {
        data.tilt = base.autoTilt;
        data.rows = base.autoRows.slice();
      }
      sweepTiming(data);
      const strokesBlob = await encodeStrokes(data);
      if (cancelled) return;
      const layout = layoutStrokes(data);
      onResult({
        png: base.png,
        strokesBlob,
        strokesData: data,
        fidelity: base.trace.fidelity,
        strokeCount: data.strokes.length,
        display: 'mask',
        playable: lines.mode !== 'off',
        guides: lines.mode === 'off' ? null : { rows: layout.rows, tilt: layout.tilt },
        detectedColor: base.detectedColor,
        width: base.width,
        height: base.height,
        ms: base.ms,
        sourceBytes: base.sourceBytes,
        source: 'photo',
      });
    })();
    return () => { cancelled = true; };
  }, [base, lines, onResult]);

  const setParam = (name) => (e) => setParams((p) => ({ ...p, [name]: Number(e.target.value) }));
  const setLine = (name) => (e) => setLines((l) => ({ ...l, [name]: Number(e.target.value) }));

  return (
    <>
      <div className="notice" role="note">
        <strong>Experimental.</strong> Best for sharing something you've already written on paper. The automatic
        parts (finding the ink, playback) are rough, so don't expect much from them.
      </div>
      <p className="muted">
        Write on paper, then photograph the page. For the best result: page flat with all four corners in
        frame, even light with no shadow across it, a dark pen, and shoot straight down.
      </p>
      <label className="dropzone">
        <input type="file" accept="image/*" onChange={onFile} />
        <span>{photo ? 'Choose a different photo' : 'Choose a photo of your page'}</span>
      </label>

      {photo && corners && (
        <>
          <h2>Corners</h2>
          <p className="muted">Drag the handles onto the corners of the page.</p>
          <CornerPicker photo={photo} corners={corners} onChange={setCorners} />
          <div className="row">
            <button type="button" onClick={() => setCorners(detectPageCorners(photo) ?? defaultCorners(photo))}>Auto-detect</button>
            <button type="button" onClick={() => setCorners(defaultCorners(photo))}>Whole photo</button>
            <label>
              Page shape{' '}
              <select value={shape} onChange={(e) => setShape(e.target.value)}>
                <option value="auto">auto</option>
                <option value="letter">US letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label>
              Tilt <input id="rotate" type="range" min="-5" max="5" step="0.25" value={rotate} onChange={(e) => setRotate(Number(e.target.value))} /> {rotate.toFixed(2)}°
            </label>
          </div>

          <h2>Ink</h2>
          <div className="controls">
            <label htmlFor="threshold">Threshold</label>
            <input id="threshold" type="range" min="0.02" max="0.3" step="0.01" value={params.threshold} onChange={setParam('threshold')} />
            <span>{params.threshold.toFixed(2)}</span>

            <label htmlFor="softness">Softness</label>
            <input id="softness" type="range" min="0.05" max="0.6" step="0.01" value={params.softness} onChange={setParam('softness')} />
            <span>{params.softness.toFixed(2)}</span>

            <label htmlFor="despeckle">Despeckle</label>
            <input id="despeckle" type="range" min="0" max="30" step="1" value={params.despeckle} onChange={setParam('despeckle')} />
            <span>{params.despeckle} px</span>

            <label htmlFor="edgeTrim">Edge trim</label>
            <input id="edgeTrim" type="range" min="0" max="0.04" step="0.005" value={params.edgeTrim} onChange={setParam('edgeTrim')} />
            <span>{(params.edgeTrim * 100).toFixed(1)}%</span>
          </div>
          <p className="muted">
            Lower threshold picks up fainter marks. Lower softness makes strokes harder and darker.
            {working && ' Working…'}
            {!working && photoBytes > 0 && ` Photo was ${kb(photoBytes)}.`}
          </p>

          <h2>Playback</h2>
          <p className="muted">
            "Watch" reads the page line by line, so it needs to know where your lines are.
            Auto finds ruled lines or the rows of writing; the dashed guides on the preview show what it found.
            If they are wrong, set the line height by hand, or turn playback off for this letter.
          </p>
          <div className="row">
            {['auto', 'manual', 'off'].map((mode) => (
              <label key={mode}>
                <input type="radio" name="lines" checked={lines.mode === mode} onChange={() => setLines((l) => ({ ...l, mode }))} /> {mode}
              </label>
            ))}
          </div>
          {lines.mode === 'manual' && (
            <div className="controls">
              <label htmlFor="lineHeight">Line height</label>
              <input id="lineHeight" type="range" min="20" max="300" step="1" value={lines.height} onChange={setLine('height')} />
              <span>{lines.height} px</span>

              <label htmlFor="lineOffset">First line</label>
              <input id="lineOffset" type="range" min="0" max="300" step="1" value={lines.offset} onChange={setLine('offset')} />
              <span>{lines.offset} px</span>
            </div>
          )}
          <p className="muted">
            Pages that play well: lines an equal distance apart, descenders not reaching into the line below,
            the page level in the photo (use Tilt above if not), and ruled paper helps.
          </p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}
