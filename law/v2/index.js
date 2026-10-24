// Law v2 (depth-water-gall): v1's paper and its acts (plus the pen's spatter), with dents, ink in depth,
// the water brush, oak gall, fading by exposure, paper that remembers water, and splatter.
export { LAW, OAK_GALL, WATER, AGE_CAP_H, EXPOSURE_STEP, THICK } from './constants.js';
export { encodeActs, decodeActs, decodeCanonical, penTimeline, precheck, SPATTER_MAX } from './acts.js';
export { splatOdds } from './splat.js';
export { makePaper, checkFamily } from './paper.js';
export { createSim, grow, isGall, darkAt } from './sim.js';
export { settledCells, boxOf, lookRGB, lookRGBA, factsDigest, lookDigest, hasGall, ageBucket, exposureBucket, gallDark, fadeOf, sideView, heightOf } from './look.js';
export { sceneField, liveField, encodeScene, decodeScene, paperDetail, sceneWindow, MAX_LOD } from './scene.js';
export { momentsOf, bandOf } from './moments.js';
export { createLive, createPlayback, livePoints } from './live.js';
export { trace } from './trace.js';
export { makeFilm, readFilm, paintFrame, msPerFrame } from './film.js';
