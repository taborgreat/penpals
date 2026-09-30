// The ink pipeline. photo → corners → flat page → alpha mask → strokes, or
// pad → strokes; then one renderer paints either as ink and can write it out
// over time.
//
// The shared strokes format ({ width, height, strokes: [{ angle, points: [{ x, y, t, w }] }] })
// is the contract: every letter is weighted, timed strokes, whatever made it.
export { loadPhoto } from './load.js';
export { detectPageCorners, defaultCorners } from './detect.js';
export { pageSize, warpPage } from './warp.js';
export { extractInk } from './extract.js';
export { encodeInkPng } from './encode.js';
export { traceStrokes, rasterize } from './trace.js';
export { encodeStrokes, decodeStrokes, renderStrokes, strokesDuration, countPoints } from './strokes.js';
export { layoutStrokes, scheduleSweep, sweepTiming } from './sweep.js';
export { PAPERS, loadInk, loadStrokes, paintLetter, paintStrokes, createPlayer } from './render.js';
export { NIBS, PEN_SIZES, BROAD_SIZES, FLEX_PRESETS, GUIDES, renderStroke, toSharedStroke, drawGuides } from './nibs.js';
