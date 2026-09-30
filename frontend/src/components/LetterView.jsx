import { useEffect, useRef, useState } from 'react';
import { loadInk, loadStrokes, paintLetter, paintStrokes, createPlayer } from '../ink/render.js';

// A letter "reborn", painted in its colour on paper: drawn letters from their
// strokes, photographed letters from their ink PNG. Letters with strokes can be
// watched being written, at a chosen speed; for a photo the scan is uncovered
// in reading order along the traced strokes.
// `letter`: { inkUrl, strokesUrl?, strokesData?, display, source, playable?, guides?, inkColor, paper }
// where inkUrl / strokesUrl may be URLs or Blobs (the preview before saving),
// and `guides` ({ rows, tilt }) draws the playback lines over the letter.
export default function LetterView({ letter }) {
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const speedRef = useRef(1);
  const [asset, setAsset] = useState(null); // { img, data }, either may be null
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(null);
  const { inkColor = '#1a1a1a', paper = 'plain', guides = null } = letter;
  const playable = letter.playable !== false;
  const strokesSrc = letter.strokesData ?? letter.strokesUrl ?? null;
  const showMask = letter.source === 'photo' || letter.display !== 'strokes' || !strokesSrc;
  speedRef.current = speed;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      showMask ? loadInk(letter.inkUrl) : null,
      strokesSrc && playable ? loadStrokes(strokesSrc).catch(() => null) : null,
    ])
      .then(([img, data]) => { if (!cancelled) setAsset({ img, data }); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [showMask, strokesSrc, playable, letter.inkUrl]);

  function paintStill() {
    const canvas = canvasRef.current;
    if (asset.img) paintLetter(canvas, asset.img, { inkColor, paper });
    else if (asset.data) paintStrokes(canvas, asset.data, { inkColor, paper });
    if (guides) drawGuides(canvas, guides);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!asset || !canvas) return;
    playerRef.current?.stop();
    setPlaying(false);
    paintStill();
    playerRef.current = asset.data
      ? createPlayer(canvas, { data: asset.data, ink: asset.img }, { inkColor, paper, getSpeed: () => speedRef.current })
      : null;
  }, [asset, inkColor, paper, guides]);

  useEffect(() => () => playerRef.current?.stop(), []);

  function watch() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) {
      player.stop();
      paintStill();
      setPlaying(false);
    } else {
      setPlaying(true);
      player.play(() => setPlaying(false));
    }
  }

  if (error) return <p className="error">Could not load the letter: {error}</p>;
  return (
    <div className="letter-box">
      <canvas ref={canvasRef} className="letter" />
      {asset?.data && playable && (
        <div className="row">
          <button type="button" className="watch" onClick={watch}>
            {playing ? '■ stop' : '▶ watch it being written'}
          </button>
          <label className="muted">
            speed <input type="range" min="0.5" max="4" step="0.5" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /> {speed}×
          </label>
        </div>
      )}
    </div>
  );
}

// Dashed lines where playback thinks the text lines end (rows are sheared: y = row + x * tilt).
function drawGuides(canvas, { rows, tilt }) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(40, 110, 220, 0.55)';
  for (const r of rows) {
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(canvas.width, r + canvas.width * tilt);
    ctx.stroke();
  }
  ctx.restore();
}
