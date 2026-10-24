import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createView, engineReady } from './engine.js';
import { camera2d, camera3d, pageAt, canWrite, orbit, zoomBy, panBy, flyTo, fly, lerpCam, chaseFollow, MIN_WRITE_EL } from './camera.js';
import { lightAt, returnTo, sunAt } from './light.js';
import { isPhone } from './support.js';

// The scene (the scene spec): the page as a lit 3D scene, seen straight down
// (2D) or from anywhere (3D), one renderer for both. Facts decide; the scene
// only shows.
//
//   page        [w, h] page px (the camera's home, the candles' places)
//   mode        '3d': the scene is always seen in 3D (no toggle; '2d', straight down, is kept for the lab only)
//   sheets      [{ id, box: [x0, y0, w, h] (cells), origin: [px, py], cellPx,
//                  field?, look?: { rgba, box }, live?, detail?: { data, box }, bands?: { data, box } }]
//   frame2d     () => [x0, y0, x1, y1]: the part of the page the 2D view shows (default: all of it)
//   writer      { down(p, ev, type), move(p, ev), up(p, ev), cancel(), penDown?(cam) }: writing in 3D
//   follow      { base: [x, y], offset: [dx, dy] }: the chase, in 3D
//   cutSide     (a, b) => Promise<{ width, height, rgba }>: the cross-section picture for the cut plane
//   moments     () => Promise<{ box, at } | [{ id, box, at }]>: show the moments (own and open sheets)
//   momentsKey  changes when the writing does: shown moments are banded again
//   ground      the sheets lie on the page (a journal page), not on the desk
//   onFlat      the viewer chose the flat look
//   toolsHost   an element to put the tools in (a pad's own bar, off the page), else over the view
// ref: { camera(), setCamera(cam), invalidate() }
const BAND_MS = 40;
const LIVE_MS = 16; // a sheet being written is drawn again at most this often (about every frame)
const STILL_MS = 200; // after this long without the camera moving, frames are full resolution again
const MOVING = 0.75; // the resolution while the camera moves, and for frames drawn only for the candles' flicker
const CAP_DESKTOP = 1.5; // device pixels per CSS pixel, at most (phones: 1)
const FLICKER_MS = 80; // candlelight alone is drawn again this often: enough to shiver, and cheap

const SceneView = forwardRef(function SceneView({ page, mode, onMode, sheets, frame2d, writer, follow, cutSide, moments, momentsKey, ground = false, onFlat, paper = null, tools = true, toolsHost = null, className = '', style }, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const st = useRef(null);
  const [tool, setTool] = useState(null); // 'light' | 'cut' | null
  const [steep, setSteep] = useState(false); // too low to write
  const [bandsOn, setBandsOn] = useState(false);
  const [banded, setBanded] = useState(0); // cells in a dark band (shown on the element: data-banded)
  const [ready, setReady] = useState(null); // the renderer, once chosen: 'webgpu' | 'webgl2'
  const phone = useRef(isPhone()).current;

  if (!st.current) {
    st.current = { cam: mode === '3d' ? camera3d(...page) : camera2d(...page), anim: null, override: null, back: null, raf: 0, last: 0, view: null, applied: new Map(), css: [1, 1], moveUntil: 0, pointers: new Map(), drag: null, taps: [] };
  }
  const S = st.current;

  const schedule = () => {
    if (!S.raf && S.view) S.raf = requestAnimationFrame(draw);
  };
  const liveSoon = () => {
    if (S.liveTimer) return;
    const wait = Math.max(0, LIVE_MS - (performance.now() - S.last));
    S.liveTimer = setTimeout(() => {
      S.liveTimer = 0;
      schedule();
    }, wait);
  };
  const invalidate = schedule;

  function currentLight(now) {
    let override = S.override;
    if (!override && S.back) {
      const k = Math.min(1, (now - S.back.t0) / 800);
      override = k < 1 ? returnTo(S.back.from, sunAt(new Date()), k) : null;
      if (k >= 1) S.back = null;
    }
    return lightAt(new Date(), now / 1000, page[0], page[1], override);
  }

  function draw(now) {
    S.raf = 0;
    if (!S.view || S.hidden) return; // out of sight: drawn again when it comes back
    if (phone && now - S.last < 32 && S.anim === null) { // a frame cap on phones
      schedule();
      return;
    }
    S.last = now;
    if (S.anim) {
      const k = Math.min(1, (now - S.anim.t0) / S.anim.ms);
      S.cam = lerpCam(S.anim.from, S.anim.to, k);
      if (k >= 1) S.anim = null;
    }
    let cam = S.cam;
    if (cam.mode === '2d' && frame2d) {
      const [x0, y0, x1, y1] = frame2d();
      cam = { ...cam, target: [(x0 + x1) / 2, (y0 + y1) / 2], view: Math.max(1, x1 - x0) };
    }
    if (cam.mode === '3d' && follow) cam = chaseFollow(cam, follow.base, follow.offset);
    const light = currentLight(now);
    S.view.setLight(light);
    // the resolution: capped; lower while moving and for the flicker alone (full again once still)
    const moving = !!S.anim || now < S.moveUntil || S.drag?.kind === 'orbit' || S.drag?.kind === 'pan' || S.drag?.kind === 'two';
    if (!S.flickerOnly) S.lastFull = now;
    const quiet = S.flickerOnly && now - (S.lastFull ?? 0) > 1000; // only the candles, for a second now
    const k = (phone ? 1 : Math.min(CAP_DESKTOP, window.devicePixelRatio || 1)) * (moving || quiet ? MOVING : 1);
    S.flickerOnly = false;
    if (moving && !S.anim) {
      clearTimeout(S.still);
      S.still = setTimeout(schedule, Math.max(0, S.moveUntil - now) + 20);
    }
    S.view.render(cam, Math.max(1, Math.round(S.css[0] * k)), Math.max(1, Math.round(S.css[1] * k)));
    S.shown = cam;
    const low = cam.mode === '3d' && !!writer && !canWrite(cam);
    setSteep((was) => (was === low ? was : low));
    if (S.anim || S.override || S.back) schedule(); // moving
    else if (light.night > 0.01 && !S.flicker) {
      // only the candles flickering
      S.flicker = setTimeout(() => {
        S.flicker = 0;
        if (!S.raf) S.flickerOnly = true;
        schedule();
      }, FLICKER_MS);
    }
  }

  // the view and its canvas, once the renderer is chosen (WebGPU starts asynchronously)
  useEffect(() => {
    let alive = true;
    let stop = null;
    engineReady().then((gpu) => {
      if (alive) stop = start(gpu);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function start(gpu) {
    const view = createView(canvasRef.current, { host: wrapRef.current, invalidate: schedule });
    S.view = view;
    if (paper) view.setPaper(paper);
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      S.css = [r.width, r.height];
      schedule();
    });
    ro.observe(wrapRef.current);
    const io = new IntersectionObserver(([e]) => {
      S.hidden = !e.isIntersecting;
      view.setVisible(!S.hidden);
      if (!S.hidden) schedule();
    });
    io.observe(wrapRef.current);
    const tick = setInterval(schedule, 60000); // the clock moves the sun
    setReady(gpu);
    return () => {
      ro.disconnect();
      io.disconnect();
      clearInterval(tick);
      clearTimeout(S.liveTimer);
      clearTimeout(S.flicker);
      clearTimeout(S.still);
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      for (const a of S.applied.values()) a.unsub?.();
      S.applied.clear();
      view.dispose();
      S.view = null;
    };
  }

  // the sheets
  useEffect(() => {
    const view = S.view;
    if (!view) return;
    const ids = new Set(sheets.map((s) => s.id));
    for (const [id, a] of S.applied) {
      if (!ids.has(id)) {
        a.unsub?.();
        view.removeSheet(id);
        S.applied.delete(id);
      }
    }
    for (const s of sheets) {
      const a = S.applied.get(s.id);
      const placed = a && a.spec.cellPx === s.cellPx && a.spec.origin[0] === s.origin[0] && a.spec.origin[1] === s.origin[1] && a.spec.box.join() === s.box.join();
      if (!placed) {
        a?.unsub?.();
        const [x0, y0, w, h] = s.box;
        view.setSheet(s.id, { x0, y0, w, h, origin: s.origin, cellPx: s.cellPx });
      }
      const was = placed ? a.spec : {};
      if (s.field && s.field !== was.field) view.setField(s.id, s.field);
      if (s.look && s.look !== was.look) view.setLook(s.id, s.look.rgba, s.look.box);
      if (s.detail && s.detail !== was.detail) view.setDetail(s.id, s.detail.data, s.detail.box);
      let unsub = placed ? a.unsub : null;
      if (s.live && (!placed || s.live !== was.live)) {
        unsub?.();
        view.setTiles(s.id, s.live.tiles());
        unsub = s.live.onTiles((tiles) => {
          view.setTiles(s.id, tiles);
          liveSoon(); // at most every LIVE_MS
        });
      }
      S.applied.set(s.id, { spec: s, unsub });
    }
    schedule();
  }, [sheets, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // the 2D/3D switch: the camera moves, the page under it does not
  useEffect(() => {
    if (S.cam.mode === mode && !S.anim) return;
    const from = S.shown ?? S.cam;
    const to = mode === '3d' ? { ...camera3d(...page), target: from.target } : { ...camera2d(...page), target: from.target, view: from.view };
    S.anim = { from: { ...from, mode: '3d', el: from.mode === '2d' ? 89.9 : from.el }, to, t0: performance.now(), ms: 650 };
    S.cam = to;
    schedule();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(schedule, [frame2d, follow?.offset?.[0], follow?.offset?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!S.view) return;
    S.view.setGround(ground ? page : null);
    schedule();
  }, [ground, page[0], page[1], ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paper && S.view) {
      S.view.setPaper(paper);
      schedule();
    }
  }, [paper?.join(), ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    camera: () => S.shown ?? S.cam,
    setCamera(cam) {
      if (!cam) return;
      S.anim = { from: S.shown ?? S.cam, to: cam, t0: performance.now(), ms: 300 };
      S.cam = cam;
      schedule();
    },
    invalidate,
  }));

  // --- pointers ---
  const toNdc = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), r.width / r.height];
  };
  const pageOf = (e) => {
    const [nx, ny, aspect] = toNdc(e);
    const p = pageAt(S.shown ?? S.cam, nx, ny, aspect);
    return p ? { x: p[0], y: p[1] } : null;
  };
  // the pen writes only where the ray meets the page (over the desk it lays nothing)
  const onPage = (p) => p && p.x >= 0 && p.y >= 0 && p.x <= page[0] && p.y <= page[1];
  const lightFromPointer = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    return { az: (fx - 0.5) * 220, el: Math.max(2, Math.min(88, (1 - fy) * 90)) };
  };

  const onPointerDown = (e) => {
    const c = canvasRef.current;
    c.setPointerCapture(e.pointerId);
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (tool === 'light' || e.altKey) {
      S.drag = { kind: 'light' };
      S.override = lightFromPointer(e);
      S.back = null;
      schedule();
      return;
    }
    if (mode !== '3d') return;
    if (tool === 'cut') {
      const p = pageOf(e);
      if (p) S.drag = { kind: 'cut', a: [p.x, p.y], b: [p.x, p.y] };
      return;
    }
    // a double tap flies to the point
    const now = performance.now();
    S.taps = S.taps.filter((t) => now - t < 320);
    S.taps.push(now);
    if (S.taps.length >= 2 && e.pointerType !== 'mouse') {
      const p = pageOf(e);
      if (p) S.anim = { from: S.cam, to: flyTo(S.cam, [p.x, p.y]), t0: now, ms: 500 };
      if (p) S.cam = S.anim.to;
      S.taps = [];
      schedule();
      return;
    }
    if (S.pointers.size >= 2) { // two fingers: orbit and pinch
      if (S.drag?.kind === 'write') writer?.cancel();
      const [a, b] = [...S.pointers.values()];
      S.drag = { kind: 'two', mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const writes = writer && (e.pointerType === 'pen' || e.pointerType === 'touch' || e.button === 0) && !e.shiftKey && e.button !== 2;
    const at = writes && canWrite(S.shown ?? S.cam) ? pageOf(e) : null;
    if (onPage(at)) {
      writer.penDown?.(S.shown ?? S.cam);
      S.drag = { kind: 'write', last: at };
      writer.down(at, e.nativeEvent, e.pointerType);
      return;
    }
    S.drag = { kind: e.button === 1 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e) => {
    const p0 = S.pointers.get(e.pointerId);
    if (p0) S.pointers.set(e.pointerId, { ...p0, x: e.clientX, y: e.clientY });
    const d = S.drag;
    if (!d) return;
    if (d.kind === 'light') {
      S.override = lightFromPointer(e);
      schedule();
    } else if (d.kind === 'cut') {
      const p = pageOf(e);
      if (p) d.b = [p.x, p.y];
    } else if (d.kind === 'write') {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const p = pageOf(ev);
        if (!onPage(p)) { // off the page: the stroke ends at its edge
          writer.up(d.last, ev);
          S.drag = null;
          break;
        }
        writer.move(p, ev);
        d.last = p;
      }
    } else if (d.kind === 'two' && S.pointers.size >= 2) {
      const [a, b] = [...S.pointers.values()];
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      S.cam = zoomBy(orbit(S.cam, (mid[0] - d.mid[0]) * 0.3, (mid[1] - d.mid[1]) * 0.2), d.dist / Math.max(1, dist));
      d.mid = mid;
      d.dist = dist;
      schedule();
    } else if (d.kind === 'orbit') {
      S.cam = orbit(S.cam, (e.clientX - d.x) * 0.3, (e.clientY - d.y) * 0.25);
      d.x = e.clientX;
      d.y = e.clientY;
      schedule();
    } else if (d.kind === 'pan') {
      S.cam = panBy(S.cam, e.clientX - d.x, e.clientY - d.y, canvasRef.current.getBoundingClientRect().width);
      d.x = e.clientX;
      d.y = e.clientY;
      schedule();
    }
  };

  const onPointerUp = (e) => {
    S.pointers.delete(e.pointerId);
    const d = S.drag;
    if (!d) return;
    if (d.kind === 'two' && S.pointers.size) return;
    S.drag = null;
    if (d.kind === 'orbit' || d.kind === 'pan' || d.kind === 'two') {
      S.moveUntil = performance.now() + STILL_MS;
      schedule();
    }
    if (d.kind === 'light') {
      S.back = { from: S.override, t0: performance.now() }; // released: back to the clock
      S.override = null;
      schedule();
    } else if (d.kind === 'cut' && cutSide) {
      const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      if (len > 2) {
        cutSide(d.a, d.b).then((image) => {
          S.view?.setCut({ line: [d.a, d.b], image });
          schedule();
        }).catch(() => {});
      }
    } else if (d.kind === 'write') {
      if (e.type === 'pointercancel') writer.cancel();
      else {
        const p = pageOf(e);
        writer.up(onPage(p) ? p : d.last, e.nativeEvent);
      }
    }
  };

  const onWheel = (e) => {
    if (mode !== '3d') return;
    e.preventDefault();
    S.cam = zoomBy(S.cam, e.deltaY > 0 ? 1.12 : 1 / 1.12);
    S.moveUntil = performance.now() + STILL_MS;
    schedule();
  };
  const onDoubleClick = (e) => {
    if (mode !== '3d') return;
    const p = pageOf(e);
    if (!p) return;
    S.anim = { from: S.cam, to: flyTo(S.cam, [p.x, p.y]), t0: performance.now(), ms: 500 };
    S.cam = S.anim.to;
    schedule();
  };
  const onKeyDown = (e) => {
    if (mode !== '3d') return;
    const k = e.key.toLowerCase();
    const step = Math.max(2, S.cam.dist * 0.04);
    const moves = { w: [step, 0, 0], arrowup: [step, 0, 0], s: [-step, 0, 0], arrowdown: [-step, 0, 0], a: [0, -step, 0], arrowleft: [0, -step, 0], d: [0, step, 0], arrowright: [0, step, 0], q: [0, 0, 0.08], e: [0, 0, -0.08] };
    if (!moves[k]) return;
    e.preventDefault();
    S.cam = fly(S.cam, ...moves[k]);
    S.moveUntil = performance.now() + STILL_MS;
    schedule();
  };

  // wheel listeners must not be passive to stop the page scrolling
  useEffect(() => {
    const c = canvasRef.current;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  // the moments, banded: one sheet's ({ box, at }) or several ([{ id, box, at }])
  async function showBands() {
    const got = await moments();
    for (const s of sheets) S.view?.setBands(s.id, null);
    let dark = 0;
    for (const m of got == null ? [] : Array.isArray(got) ? got : [{ id: sheets[0].id, ...got }]) {
      const bands = new Uint8Array(m.at.length);
      for (let i = 0; i < bands.length; i++) {
        bands[i] = m.at[i] < 0 ? 0 : Math.floor(m.at[i] / BAND_MS) % 2;
        dark += bands[i];
      }
      S.view?.setBands(m.id, bands, m.box);
    }
    setBanded(dark);
    schedule();
  }
  async function toggleBands() {
    if (bandsOn) {
      for (const s of sheets) S.view?.setBands(s.id, null);
      setBandsOn(false);
      schedule();
      return;
    }
    await showBands();
    setBandsOn(true);
  }
  useEffect(() => {
    if (bandsOn) showBands();
  }, [momentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const interactive = mode === '3d' || tool === 'light';
  const wrapTools = (el) => (toolsHost ? createPortal(el, toolsHost) : el);
  return (
    <div ref={wrapRef} className={`scene-view ${mode} ${className}`} style={style} data-banded={bandsOn ? banded : undefined} data-gpu={ready ?? undefined}>
      <canvas
        ref={canvasRef}
        className="scene-canvas"
        tabIndex={mode === '3d' ? 0 : -1}
        style={{ pointerEvents: interactive ? 'auto' : 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={mode === '3d' ? 'The page in 3D: drag to turn it, wheel to come closer, double-click to fly to a spot' : 'The page, lit'}
      />
      {steep && <p className="scene-hint">Tilt up to write: below {MIN_WRITE_EL}° a pixel covers too much page.</p>}
      {tools && wrapTools(
        <div className={`scene-tools${toolsHost ? ' hosted' : ''}`} role="group" aria-label="View">
          <button type="button" aria-pressed={tool === 'light'} onClick={() => setTool(tool === 'light' ? null : 'light')} title="Drag to move the light; let go and it returns to the time of day">Light</button>
          {mode === '3d' && cutSide && (
            <button type="button" aria-pressed={tool === 'cut'} onClick={() => { setTool(tool === 'cut' ? null : 'cut'); if (tool === 'cut') { S.view?.setCut(null); schedule(); } }} title="Drag a line across the writing to cut through the paper">Cut</button>
          )}
          {moments && <button type="button" aria-pressed={bandsOn} onClick={toggleBands} title="Band the ink by when it went down, like tree rings">Moments</button>}
          {onFlat && <button type="button" onClick={onFlat} title="The flat look: the record's own image">Flat</button>}
        </div>,
      )}
    </div>
  );
});

export default SceneView;
