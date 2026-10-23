import { useEffect, useRef } from 'react';
import { HAND } from '../hand/registry.js';
import { handName, handStrokes } from '../hand/asset.js';
import { play, isPlaying, playMs, onFirstView, onResize, reducedMotion } from '../hand/player.js';
import { renderStrokes } from '../ink/strokes.js';

const LINE_EM = 1.25; // one ruled line of the pad, in em of the surrounding text
const MAX_EM = 1.7; // but the whole drawing, loops and all, is never taller than this
const MIN_STROKE_PX = 1.5; // no line thinner than this on screen (CSS px), so hairlines stay solid
const HALO_PX = 1.25; // labels get an outline this wide (CSS px) in a contrasting tone, like ink with a light edge
// The canvas reaches this far (CSS px) past the drawing's box on every side, so
// widened hairlines, outlines and strokes at the very edge are never cut off.
const BLEED_PX = 6;
const WRITE_IN_DEADLINE_MS = 2500; // a label not yet written in by then is written regardless
const BLEED_STYLE = { left: -BLEED_PX, top: -BLEED_PX, width: `calc(100% + ${2 * BLEED_PX}px)`, height: `calc(100% + ${2 * BLEED_PX}px)` };

// A tone to outline a colour with: dark behind light ink, light behind dark ink.
function haloFor(color) {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.5 ? 'rgba(12, 10, 6, 0.65)' : 'rgba(255, 252, 244, 0.85)';
}

// Handwritten text: <Hand>Undo</Hand> shows the drawn "Undo" if there is one
// (src/hand/drawn/undo.json) and the plain text if not, so labels can be
// drawn one at a time. A drawn label writes itself in the first time it comes
// into view, and again when its button or link is hovered.
export default function Hand({ children, name, size = LINE_EM }) {
  const text = typeof children === 'string' ? children : '';
  const asset = HAND[name ?? handName(text)];
  if (!asset) return children ?? null;
  return <HandDrawn asset={asset} label={text || asset.text} size={size} />;
}

// A drawn label from its asset; also used by the studio for previews.
// `size`: em per ruled line, so labels sit in text like words do.
// `fit`: instead, the whole drawing `fit` em tall and never wider than its
// container (for signatures, which can be any shape).
// `halo`: an outline under the strokes so they read on any background; on by
// default for labels, off for signatures (which have their own colours).
export function HandDrawn({ asset, label, size = LINE_EM, fit = null, writeIn = true, halo = !fit }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  // em per page px; `scale` is the label's own size, set in the studio so labels match
  const k = (asset.scale ?? 1) * Math.min(size / asset.line, MAX_EM / asset.h);
  const em = (v) => `${(v * k).toFixed(4)}em`;

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const data = handStrokes(asset);
    let shown = 0;
    let color = '';
    let scratch = null; // the ink, drawn apart so it can go over its outline

    const draw = (k) => {
      shown = k;
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(r.width * dpr));
      const H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      if (k <= 0) return;
      color ||= getComputedStyle(box).color;
      const bleed = BLEED_PX * dpr;
      const scale = (W - 2 * bleed) / asset.w; // device px per drawing px
      const scaleY = (H - 2 * bleed) / asset.h;
      const opts = { until: k >= 1 ? Infinity : k * asset.dur, minWidth: (MIN_STROKE_PX * dpr) / scale };
      // One pass: the strokes, then tinted.
      const inked = (c, extra) => {
        c.setTransform(scale, 0, 0, scaleY, bleed, bleed);
        renderStrokes(c, data, extra ? { ...opts, ...extra } : opts);
        c.setTransform(1, 0, 0, 1, 0, 0);
      };
      const tint = (c, fill) => {
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = fill;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
      };
      if (!halo) {
        inked(ctx);
        tint(ctx, color);
        return;
      }
      inked(ctx, { grow: (2 * HALO_PX * dpr) / scale });
      tint(ctx, haloFor(color));
      scratch ??= document.createElement('canvas');
      if (scratch.width !== W || scratch.height !== H) {
        scratch.width = W;
        scratch.height = H;
      }
      const sctx = scratch.getContext('2d');
      sctx.clearRect(0, 0, W, H);
      inked(sctx);
      tint(sctx, color);
      ctx.drawImage(scratch, 0, 0);
    };
    const player = { draw };
    const write = () => {
      color = getComputedStyle(box).color;
      if (reducedMotion()) draw(1);
      else play(player, playMs(asset.dur));
    };
    const recolor = () => {
      color = getComputedStyle(box).color;
      if (!isPlaying(player)) draw(shown);
    };

    let unview = () => {};
    let fallback = 0;
    if (writeIn && !reducedMotion()) {
      draw(0);
      unview = onFirstView(box, write);
      // Never left blank: if it hasn't started writing by now, for any reason, write it.
      fallback = setTimeout(() => {
        if (shown === 0 && !isPlaying(player)) {
          unview();
          write();
        }
      }, WRITE_IN_DEADLINE_MS);
    } else {
      draw(1);
    }
    const unsize = onResize(box, () => { if (!isPlaying(player)) draw(shown); });
    // A new theme means new colours.
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener('penpals:theme', recolor);
    scheme?.addEventListener?.('change', recolor);

    // Hovering the button or link it labels writes it again.
    const target = box.closest('a, button, summary, label') ?? box;
    const enter = () => {
      if (!isPlaying(player) && !reducedMotion()) write();
      else recolor();
    };
    target.addEventListener('mouseenter', enter);
    target.addEventListener('mouseleave', recolor);
    target.addEventListener('focusin', recolor);
    target.addEventListener('focusout', recolor);
    return () => {
      clearTimeout(fallback);
      unview();
      unsize();
      window.removeEventListener('penpals:theme', recolor);
      scheme?.removeEventListener?.('change', recolor);
      player.draw = () => {};
      target.removeEventListener('mouseenter', enter);
      target.removeEventListener('mouseleave', recolor);
      target.removeEventListener('focusin', recolor);
      target.removeEventListener('focusout', recolor);
    };
  }, [asset, writeIn, halo]);

  // Sized by the line it was written on, so a label's letters match the text's,
  // but capped at MAX_EM so tall loops and capitals stay inside their button or
  // link. The box is the drawing's own size, with its baseline on the text's.
  if (fit) {
    return (
      <span
        ref={boxRef}
        className="hand fit"
        role="img"
        aria-label={label}
        style={{ width: `${((fit * asset.w) / asset.h).toFixed(4)}em`, aspectRatio: `${asset.w} / ${asset.h}` }}
      >
        <canvas ref={canvasRef} style={BLEED_STYLE} />
      </span>
    );
  }
  return (
    <span
      ref={boxRef}
      className="hand"
      role="img"
      aria-label={label}
      style={{ width: em(asset.w), height: em(asset.h), verticalAlign: `-${em(asset.h - asset.base)}` }}
    >
      <canvas ref={canvasRef} style={BLEED_STYLE} />
    </span>
  );
}
