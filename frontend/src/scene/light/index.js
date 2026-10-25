// Light as a range of waves, the room and the eye (light-waves.md): standalone
// modules for the scene, pure functions, no three.js. The scene only: none of
// it touches the ink's facts, seals or digests.
//
//   axis.js       the 16 + 1 bins every spectrum shares
//   blackbody.js  Planck's law on the axis (the sun before the air, the flames)
//   air.js        the sun through the air and the sky it scatters; the clock's sun
//   outside.js    the view out of the window: sky dome, sun disk, field, tree lines
//   curves.js     the one literal table of curves (scripts/curves.mjs makes it)
//   matter.js     what matter drinks: ink by the basis, gall, paper, grown surfaces
//   color.js      from XYZ to the screen: adaptation, tone, sRGB; ΔE
//   eye.js        the eye's own reactions: pupil, gain, colour, lids; toScreen
//   candle.js     candles burn (the law's candle, drawn): candleState, the flame's light
//   fade.js       fading by absorbed light
//   room.js       the room's shape and its baked form factors (scripts/room.mjs bakes them)
//   direct.js     what each patch receives straight from the sun, the sky and the flames
//   bounce.js     light bounces until it stops: solve(patches, F, absorption, sources)
//   settle.js     the room's light in parts (day, each flame), combined per flicker
//   lightWorker.js  settle.js off the main thread
//   roomCamera.js the camera in the room: seated, flying, walking; what the eye sees
//   surface.js    the room's surfaces grown cell by cell (JS, and the shader's GLSL / WGSL)
//
// For the integration (cleanup-and-speed §7), step by step:
//   1. light.js's colour model: the sun's spectrum is air.js sunLight(el) (placed
//      by sunPlace, toward(az, el) in the room frame; pageDirToRoom from light.js's
//      page-frame dir), the sky sky(dir, sunDir), the flames candle.js flameLight.
//      The eye (eye.js) steps each frame on what the view sees (the frame's mean
//      radiance, or the page's), and screenWeights(state) is the 3 × N matrix
//      from a radiance spectrum to linear sRGB; EYE_GLSL's eyeTone and eyeSrgb finish it.
//   2. The shader's per-band loop: a cell refuses R_b = surface_b · exp(−Σ_k a_k·INK[k][b]
//      − (gall / GALL_ABS)·GALL[b]) (matter.js cellReflectance, the table in curves.js:
//      the paper's curve from its colour, paperCurve); its radiance is R_b · light_b / π,
//      light_b = the direct sun and flames with their shadows (per pixel) plus the
//      room's settled light at its patch (settle.js combine); rgb = eyeSrgb(eyeTone(W · radiance)).
//      The ink worker sends the three absorbances (F0..F2) and the gall per cell.
//   3. The room: fetch /room/room.json and /room/room.ff (scripts/room.mjs bakes
//      them at build), post { type: 'room', json, bin } to lightWorker.js, then
//      'settle' when the sun moves, a candle sinks, or ink changes a patch
//      (page: matter.js pageCurve). Draw geom.surfaces and geom.objects, each grown
//      in the shader: surface.js SURFACE_GLSL / SURFACE_WGSL growCell up close,
//      growMean beyond (foot from roomCamera.footprint), tone mixing
//      curves.MATTER[kind].light → .dark; the sun's window patch is direct.js sunAperture.
//   4. Candles: candleState(the law's candle, t, { lit, which }) each frame (flameAt,
//      flameSize, intensity for the object and its light; intensity is combine's
//      scale). The candle itself burns in the law (law/candle.js), regrown from the
//      room's chain (law/wax.js); where no chain says, candleLit({ sunEl, present }).
//   5. The camera: roomCamera.js seat / fly / walk / glide; pageView gives the
//      engine's page-px eye, axes and near plane; inView picks the chunks drawn.
//   6. Fading: fade.js fadedInk(abs, gall, views, depth) where look.js's flat fadeOf was.

export * from './axis.js';
export { planck, planckTail, blackbody } from './blackbody.js';
export * from './air.js';
export * from './outside.js';
export * as curves from './curves.js';
export * from './matter.js';
export { xyzOf, xyzToLinear, linearToXyz, encode, decode, hexToSrgb, adaptDegree, adaptMatrix, brightness, tone, screenMatrix, display, xyzToLab, srgbToLab, deltaE, LUMENS, D65, KNEE } from './color.js';
export * as eye from './eye.js';
export { createEye, settledOn, step, toScreen, toBytes, screenWeights, exposureOf, adaptationOf, EYE_GLSL } from './eye.js';
export * from './candle.js';
export * from './fade.js';
export * from './room.js';
export { directLight, sunAperture } from './direct.js';
export * from './bounce.js';
export * as surface from './surface.js';
export * as shine from './shine.js';
export { meanTone, roomAbsorption, daySources, settleParts, combine } from './settle.js';
export * as roomCamera from './roomCamera.js';
