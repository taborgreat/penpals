import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PX_PER_MM, renderStroke, drawGuides } from '../ink/nibs.js';
import { createPlayer } from '../ink/render.js';
import { CHASE, isPhone, zoneStart, clampLinePx, zoomFor, toPage, penDown, chase, lineStart, endGlow, inEndZone } from './chase.js';

// Playback shows the page cropped to the lines written on (a line's room either side), so it reads at phone size.
function inkRows(data) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of data.strokes) for (const p of s.points) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return [y0, y1];
}
const PLAY_ROOM = 90; // page px kept above and below the writing
const cropTop = (data) => Math.max(0, inkRows(data)[0] - PLAY_ROOM);
const crop = (data) => {
  const tall = Math.max(1, Math.min(data.height, inkRows(data)[1] + PLAY_ROOM) - cropTop(data));
  return { aspectRatio: `${data.width} / ${tall}`, width: `min(100%, 1100px, calc((100dvh - 90px) * ${data.width / tall}))` };
};

const boxes = new WeakMap(); // finished stroke → its bounds on the page, for drawing only what's in view

function boxOf(stroke) {
  let b = boxes.get(stroke);
  if (b) return b;
  b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of stroke.points) {
    b.x0 = Math.min(b.x0, p.x);
    b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x);
    b.y1 = Math.max(b.y1, p.y);
  }
  const pad = (stroke.maxWidth ?? stroke.size ?? 20) + 4;
  b.x0 -= pad;
  b.y0 -= pad;
  b.x1 += pad;
  b.y1 += pad;
  boxes.set(stroke, b);
  return b;
}

// Write mode ("monk mode"): nothing on screen but the page and three buttons.
// The chase (chase.js) slides the page under the writer as they move right,
// so they keep writing in about the same spot and the line runs on.
//
// Strokes made here are a draft (`draftRef.current.strokes`, each with the
// camera from when its pen went down) until Play: undo works on the draft
// only, and Escape leaves it waiting for when you come back. Play hands the
// draft to the pad (`onPlay`, which returns the whole letter), plays the
// letter written out, then `onDone` moves on to saving and sending.
// `getStrokes()` is the pad's finished strokes; `rows` the baselines (page px).
export default function WriteMode({ getStrokes, draftRef, nib, pageW, height, rows, spacing, guide, slant, paper, inkColor, onLeave, onPlay, onDone }) {
  const rootRef = useRef(null);
  const paperRef = useRef(null);
  const inkRef = useRef(null);
  const endRef = useRef(null);
  const playRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, left: 0, top: 0 });
  const camRef = useRef(null); // { cam, camY, line, zoom, prevX, linePx }
  const curRef = useRef(null); // { stroke, before } while the pen is down
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const penSeenRef = useRef(false); // once a stylus writes, a finger moves the page instead
  const pointerXRef = useRef(null); // the pointer's last screen x
  const resetRef = useRef(0); // the pending line reset
  const frameRef = useRef(0);
  const playerRef = useRef(null);
  const [count, setCount] = useState(draftRef.current.strokes.length);
  const [playing, setPlaying] = useState(null); // the whole letter, while it is written out

  const camMax = () => pageW - sizeRef.current.w / camRef.current.zoom;
  const dims = () => ({ pageW, viewW: sizeRef.current.w, pxPerMm: PX_PER_MM });

  const render = useCallback(() => {
    frameRef.current = 0;
    const c = camRef.current;
    const paperCanvas = paperRef.current;
    const inkCanvas = inkRef.current;
    if (!c || !paperCanvas || !inkCanvas) return;
    const { w, h, dpr } = sizeRef.current;
    const k = c.zoom * dpr;

    const pctx = paperCanvas.getContext('2d');
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, paperCanvas.width, paperCanvas.height);
    drawGuides(pctx, pageW, height, { guide, spacing, slant, paper, scale: k, lineWidth: dpr, view: { ox: c.cam, oy: c.camY } });
    if (CHASE.SHOW_ZONE) {
      pctx.fillStyle = 'rgba(214, 170, 60, 0.16)';
      pctx.fillRect(zoneStart(w) * dpr, 0, paperCanvas.width, paperCanvas.height);
    }

    const ictx = inkCanvas.getContext('2d');
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.globalCompositeOperation = 'source-over';
    ictx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    ictx.setTransform(k, 0, 0, k, -c.cam * k, -c.camY * k);
    const x0 = c.cam;
    const y0 = c.camY;
    const x1 = c.cam + w / c.zoom;
    const y1 = c.camY + h / c.zoom;
    const draw = (s) => {
      const b = boxOf(s);
      if (b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1) renderStroke(ictx, s);
    };
    for (const s of getStrokes()) draw(s);
    for (const d of draftRef.current.strokes) draw(d.stroke);
    if (curRef.current) renderStroke(ictx, curRef.current.stroke, true);
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.globalCompositeOperation = 'source-in'; // the ink in the letter's colour
    ictx.fillStyle = inkColor;
    ictx.fillRect(0, 0, inkCanvas.width, inkCanvas.height);
    ictx.globalCompositeOperation = 'source-over';

    const end = endRef.current;
    if (end && CHASE.RESET_EDGE !== 'view') {
      const zone = CHASE.END_MM * PX_PER_MM;
      end.style.left = `${(pageW - zone - c.cam) * c.zoom}px`;
      end.style.width = `${zone * c.zoom}px`;
      end.style.top = `${-c.camY * c.zoom}px`;
      end.style.height = `${height * c.zoom}px`;
    }
  }, [getStrokes, draftRef, pageW, height, guide, spacing, slant, paper, inkColor]);

  const renderRef = useRef(render);
  renderRef.current = render;
  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(() => renderRef.current());
  }, []);

  // The end zone's redness, 0..1: deeper the closer the pen is to the end of the line.
  const glow = (amount, fill = 0) => {
    const el = endRef.current;
    if (!el) return;
    el.style.transition = fill ? `opacity ${fill}ms linear` : 'opacity 120ms linear';
    el.style.opacity = String(amount);
  };
  const glowAt = (px, sx) => glow(sx == null ? 0 : 0.06 + 0.6 * endGlow(px, sx, dims()));

  const cancelReset = () => {
    if (!resetRef.current) return;
    clearTimeout(resetRef.current);
    resetRef.current = 0;
    endRef.current?.classList.remove('pending');
    glow(0.4);
  };

  // Lifted in the end zone: after a pause, on to the start of the next line.
  // The pen coming down again during the pause cancels it.
  const armReset = () => {
    const c = camRef.current;
    if (c.line + 1 >= rows.length) return;
    clearTimeout(resetRef.current);
    const el = endRef.current;
    const under = rows[c.line] + spacing * 0.45; // the label sits just under the line, clear of the writing
    el?.style.setProperty('--pending-y', `${(CHASE.RESET_EDGE === 'view' ? under - c.camY : under) * c.zoom}px`);
    el?.classList.add('pending');
    glow(1, CHASE.LINE_RESET_PAUSE); // fills over the pause
    resetRef.current = setTimeout(() => {
      resetRef.current = 0;
      el?.classList.remove('pending');
      glow(0, 300);
      lineStart(c, c.line + 1, rows, sizeRef.current.h, PX_PER_MM);
      c.prevX = pointerXRef.current; // so the jump itself never counts as moving right
      schedule();
    }, CHASE.LINE_RESET_PAUSE);
  };

  // Size the canvases to the view; the first time, place the camera: where
  // you left off, or after the last thing written, or at the first line.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const fit = () => {
      const r = root.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: r.width, h: r.height, dpr, left: r.left, top: r.top };
      for (const cv of [paperRef.current, inkRef.current]) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      if (!camRef.current) {
        const saved = draftRef.current.camera;
        const linePx = saved?.linePx ?? (isPhone(r.width) ? CHASE.ZOOM_PHONE : CHASE.ZOOM_DESKTOP);
        const c = { cam: 0, camY: 0, line: 0, zoom: zoomFor(linePx, spacing), prevX: null, linePx: clampLinePx(linePx) };
        camRef.current = c;
        if (saved) Object.assign(c, { cam: saved.cam, camY: saved.camY, line: saved.line });
        else {
          const strokes = getStrokes();
          const last = strokes[strokes.length - 1]?.points.at(-1);
          const line = last ? rows.findIndex((b) => b >= last.y - spacing * 0.15) : 0;
          lineStart(c, line < 0 ? rows.length - 1 : line, rows, r.height, PX_PER_MM);
          if (last) c.cam = Math.max(c.cam, Math.min(last.x - zoneStart(r.width) / c.zoom, camMax()));
        }
      }
      renderRef.current();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { schedule(); }, [render, schedule]); // new colour, paper or lines

  // Monk mode: the page behind doesn't scroll, and can't be reached, while you write.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const behind = [...document.body.children].filter((el) => el !== rootRef.current && !el.inert);
    for (const el of behind) el.inert = true;
    return () => {
      for (const el of behind) el.inert = false;
      document.body.style.overflow = overflow;
      cancelAnimationFrame(frameRef.current);
      clearTimeout(resetRef.current);
      playerRef.current?.stop();
    };
  }, []);

  const local = (e) => ({ x: e.clientX - sizeRef.current.left, y: e.clientY - sizeRef.current.top });
  const pagePoint = (c, x, y, ev, type) => {
    const p = toPage(c, x, y);
    return { x: p.x, y: p.y, t: ev.timeStamp || performance.now(), p: ev.pressure || 0.5, pen: type === 'pen' };
  };

  // Zoom to a line `linePx` tall on screen, keeping the page point under screen (ax, ay) where it is.
  const zoomAround = (linePx, ax, ay) => {
    const c = camRef.current;
    const at = toPage(c, ax, ay);
    c.linePx = clampLinePx(linePx);
    c.zoom = zoomFor(c.linePx, spacing);
    c.cam = at.x - ax / c.zoom;
    c.camY = at.y - ay / c.zoom;
    c.prevX = null;
    schedule();
  };

  const fingers = () => {
    const [a, b] = touchesRef.current.values();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  const startPan = (x, y) => {
    const c = camRef.current;
    panRef.current = { x, y, cam: c.cam, camY: c.camY };
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    if (playing || (curRef.current && e.pointerType !== 'touch')) return;
    const pt = local(e);
    pointerXRef.current = pt.x;
    if (e.pointerType === 'pen') penSeenRef.current = true;
    inkRef.current.setPointerCapture(e.pointerId);
    const c = camRef.current;
    if (e.pointerType === 'touch') {
      touchesRef.current.set(e.pointerId, pt);
      if (penSeenRef.current) {
        if (touchesRef.current.size === 1) startPan(pt.x, pt.y);
        return;
      }
      if (touchesRef.current.size === 2) {
        const cur = curRef.current;
        if (cur) { // the first finger was the start of a pinch, not a stroke
          Object.assign(c, cur.before);
          curRef.current = null;
        }
        panRef.current = null;
        const f = fingers();
        pinchRef.current = { d: f.d, linePx: c.linePx, at: toPage(c, f.x, f.y) };
        schedule();
        return;
      }
      if (touchesRef.current.size > 2) return;
    } else if (e.button === 1) {
      startPan(pt.x, pt.y);
      return;
    } else if (e.button !== 0) return;
    if (pinchRef.current || panRef.current) return;
    cancelReset();
    const before = penDown(c, pt.x); // never moves the camera
    curRef.current = { stroke: { ...nib(), points: [pagePoint(c, pt.x, pt.y, e, e.pointerType)] }, before };
    schedule();
  };

  const onPointerMove = (e) => {
    const pt = local(e);
    pointerXRef.current = pt.x;
    const c = camRef.current;
    if (touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, pt);
    const pinch = pinchRef.current;
    if (pinch) {
      if (touchesRef.current.size < 2) return;
      const f = fingers();
      c.linePx = clampLinePx(pinch.linePx * (f.d / pinch.d));
      c.zoom = zoomFor(c.linePx, spacing);
      c.cam = pinch.at.x - f.x / c.zoom; // the page point between the fingers stays between them
      c.camY = pinch.at.y - f.y / c.zoom;
      c.prevX = null;
      schedule();
      return;
    }
    const pan = panRef.current;
    if (pan) {
      c.cam = pan.cam - (pt.x - pan.x) / c.zoom;
      c.camY = pan.camY - (pt.y - pan.y) / c.zoom;
      schedule();
      return;
    }
    const cur = curRef.current;
    if (!cur) {
      if (e.buttons === 0 && !resetRef.current) { // a hovering mouse or pen
        const p = toPage(c, pt.x, pt.y);
        glowAt(p.x, pt.x);
      }
      return;
    }
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [e.nativeEvent];
    const start = zoneStart(sizeRef.current.w);
    const max = camMax();
    for (const ev of events) {
      const x = ev.clientX - sizeRef.current.left; // screen x, raw from the event
      const y = ev.clientY - sizeRef.current.top;
      chase(c, x, start, max); // 1. move the camera first
      const p = pagePoint(c, x, y, ev, e.pointerType); // 2. then convert with the new camera
      cur.stroke.points.push(p); // 3. then store the ink
      c.prevX = x; // 4. last
    }
    const last = cur.stroke.points[cur.stroke.points.length - 1];
    glowAt(last.x, (last.x - c.cam) * c.zoom);
    schedule();
  };

  const onPointerUp = (e) => {
    touchesRef.current.delete(e.pointerId);
    if (pinchRef.current || panRef.current) {
      if (touchesRef.current.size === 0) {
        pinchRef.current = null;
        panRef.current = null;
      }
      return;
    }
    const cur = curRef.current;
    if (!cur) return;
    curRef.current = null; // the camera does not move
    draftRef.current.strokes.push(cur);
    setCount(draftRef.current.strokes.length);
    const c = camRef.current;
    const last = cur.stroke.points[cur.stroke.points.length - 1];
    if (inEndZone(last.x, (last.x - c.cam) * c.zoom, dims())) armReset();
    schedule();
  };

  // Remove the last stroke and put the camera back exactly where it was when
  // that stroke's pen went down (across a line reset too). No math.
  const undo = () => {
    if (curRef.current || playing) return;
    const d = draftRef.current.strokes.pop();
    if (!d) return;
    cancelReset();
    glow(0);
    const c = camRef.current;
    c.cam = d.before.cam;
    c.camY = d.before.camY;
    c.line = d.before.line;
    c.prevX = null;
    setCount(draftRef.current.strokes.length);
    schedule();
  };

  const keepCamera = () => {
    const c = camRef.current;
    draftRef.current.camera = { cam: c.cam, camY: c.camY, line: c.line, linePx: c.linePx };
  };

  const leave = () => {
    if (playing) return;
    cancelReset();
    curRef.current = null;
    keepCamera();
    onLeave();
  };

  // Play is also done: the draft joins the letter, the letter is written out, then on to sending.
  const play = () => {
    if (curRef.current || playing) return;
    cancelReset();
    keepCamera();
    const data = onPlay();
    if (!data?.strokes.length) return;
    setCount(0);
    setPlaying(data);
  };

  useEffect(() => {
    if (!playing) return;
    const player = createPlayer(playRef.current, { data: playing }, { inkColor, paper });
    playerRef.current = player;
    player.play(onDone);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => {
    playerRef.current?.stop();
    onDone();
  };

  // Escape leaves, Ctrl/⌘+Z undoes, + and − zoom.
  const keysRef = useRef(null);
  keysRef.current = { leave, undo, play, skip, zoomAround };
  useEffect(() => {
    const onKey = (e) => {
      const k = keysRef.current;
      const { w, h } = sizeRef.current;
      if (e.key === 'Escape') (playing ? k.skip : k.leave)();
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') k.undo();
      else if (!playing && (e.key === '+' || e.key === '=')) k.zoomAround(camRef.current.linePx * 1.15, w / 2, h / 2);
      else if (!playing && e.key === '-') k.zoomAround(camRef.current.linePx / 1.15, w / 2, h / 2);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [playing]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer; the wheel alone moves the page.
  useEffect(() => {
    const el = inkRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const c = camRef.current;
      if (!c || curRef.current) return;
      const pt = local(e);
      if (e.ctrlKey || e.metaKey) keysRef.current.zoomAround(c.linePx * Math.exp(-e.deltaY * 0.004), pt.x, pt.y);
      else {
        c.cam += (e.shiftKey ? e.deltaY : e.deltaX) / c.zoom;
        if (!e.shiftKey) c.camY += e.deltaY / c.zoom;
        c.prevX = null;
        schedule();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [schedule]);

  return createPortal(
    <div className="monk" ref={rootRef} role="dialog" aria-modal="true" aria-label="Write mode">
      <canvas ref={paperRef} className="monk-paper" />
      <div ref={endRef} className={`monk-end ${CHASE.RESET_EDGE === 'view' ? 'at-view' : ''}`} style={CHASE.RESET_EDGE === 'view' ? { width: `${CHASE.VIEW_EDGE * 100}%` } : undefined} aria-hidden="true" />
      <canvas
        ref={inkRef}
        className="monk-ink"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => { if (e.buttons === 0 && !resetRef.current) glow(0, 300); }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="monk-bar">
        <button type="button" onClick={leave} disabled={!!playing} title="Leave write mode (Esc)">Escape</button>
        <button type="button" onClick={undo} disabled={!!playing || !count} title="Take back the last stroke (Ctrl+Z)">Undo</button>
        <button type="button" className="primary" onClick={play} disabled={!!playing || (!count && !getStrokes().length)} title="Watch it written out, then save or send">
          ▶ Play
        </button>
      </div>
      {playing && (
        <div className="monk-play" onPointerDown={skip}>
          <div className="monk-play-page" style={crop(playing)}>
            <canvas ref={playRef} style={{ marginTop: `${(-cropTop(playing) / pageW) * 100}%` }} />
          </div>
          <p>Tap to skip</p>
        </div>
      )}
    </div>,
    document.body,
  );
}
