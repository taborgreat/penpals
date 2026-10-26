// The laws, by number. A record carries the law it was made under and is grown,
// looked at, played and verified under that law for good: v1 records keep
// settling exactly as they always did; new writing is made under CURRENT.
//
// Every law offers the same calls. A view ({ ageH, views }) is the time since
// the record was made and how often it has been seen; law 1 has no aging, so
// it ignores the view. The side view, the scene's field and the moments exist
// from law 2 on (null before: law 1 ink has no depth).
// Each law reads its own acts: law 2's PNKA adds the pen's spatter (format 2),
// which law 1 refuses; law 3's adds the nib's well and the wax marks (format 3:
// rooms.md §3b, §3c), which law 2 refuses. Law 3 grows with law 2's rules and
// those two more (v2/sim.js 9, 10); its facts and look carry the wax.
// New writing is still made under law 2 (CURRENT): law 3 is what papers
// (law/paper.js) and the dip pen are made under (Tabor's to rule when all of it is).

import * as v1acts from './v1/acts.js';
import * as v2acts from './v2/acts.js';
import * as v1sim from './v1/sim.js';
import * as v1look from './v1/look.js';
import * as v1live from './v1/live.js';
import * as v1film from './v1/film.js';
import * as v1trace from './v1/trace.js';
import * as v2sim from './v2/sim.js';
import * as v2look from './v2/look.js';
import * as v2live from './v2/live.js';
import * as v2film from './v2/film.js';
import * as v2trace from './v2/trace.js';
import * as v2scene from './v2/scene.js';
import * as v2moments from './v2/moments.js';
import { OAK_GALL } from './v2/constants.js';

export const CURRENT = 2;
export const ACCEPTED = Object.freeze([1, 2, 3, 4]);

const LAWS = {
  1: Object.freeze({
    law: 1,
    encodeActs: v1acts.encodeActs,
    decodeActs: v1acts.decodeActs,
    decodeCanonical: v1acts.decodeCanonical,
    penTimeline: v1acts.penTimeline,
    precheck: v1acts.precheck,
    grow: v1sim.grow,
    settledCells: v1look.settledCells,
    boxOf: v1look.boxOf,
    lookRGB: (cells, box) => v1look.lookRGB(cells, box),
    lookRGBA: v1look.lookRGBA,
    factsDigest: v1look.factsDigest,
    lookDigest: v1look.lookDigest,
    createLive: v1live.createLive,
    createPlayback: v1live.createPlayback,
    makeFilm: v1film.makeFilm,
    trace: v1trace.trace,
    ages: () => false,
    sideView: null,
    sceneField: null,
    liveField: null,
    momentsOf: null,
  }),
  2: Object.freeze({
    law: 2,
    encodeActs: v2acts.encodeActs,
    decodeActs: v2acts.decodeActs,
    decodeCanonical: v2acts.decodeCanonical,
    penTimeline: v2acts.penTimeline,
    precheck: v2acts.precheck,
    grow: v2sim.grow,
    settledCells: v2look.settledCells,
    boxOf: v2look.boxOf,
    lookRGB: v2look.lookRGB,
    lookRGBA: v2look.lookRGBA,
    factsDigest: v2look.factsDigest,
    lookDigest: v2look.lookDigest,
    createLive: v2live.createLive,
    createPlayback: v2live.createPlayback,
    makeFilm: v2film.makeFilm,
    trace: v2trace.trace,
    // Does the look of these acts change with age? Only if oak gall was used (a pen act with its colour).
    ages: (rec) => rec.strokes.some((s) => s.pens.some((p) => p.rgb && p.rgb[0] === OAK_GALL[0] && p.rgb[1] === OAK_GALL[1] && p.rgb[2] === OAK_GALL[2])),
    sideView: v2look.sideView,
    sceneField: v2scene.sceneField,
    liveField: v2scene.liveField,
    momentsOf: v2moments.momentsOf,
  }),
};

LAWS[3] = Object.freeze({
  ...LAWS[2],
  law: 3,
  decodeActs: (bytes) => v2acts.decodeActs(bytes, { maxFormat: 3 }),
  decodeCanonical: (bytes) => v2acts.decodeCanonical(bytes, { maxFormat: 3 }),
  settledCells: (tiles) => v2look.settledCells(tiles, { law: 3 }),
  grow: (rec, opts) => v2sim.grow(rec, { ...opts, law: 3 }),
  createLive: (sheet) => v2live.createLive({ ...sheet, law: 3 }),
  factsDigest: (o) => v2look.factsDigest({ ...o, law: 3 }),
});

// Law 4 (one-matter.md): law 3's rules on any matter. A record says what it was written on
// (its family's matter: wood, plaster, wax, metal, ...; paper by default), and grows on that
// matter's cells (law/grow.js) by its row (law/matter.js); its facts say it too.
LAWS[4] = Object.freeze({
  ...LAWS[3],
  law: 4,
  decodeActs: (bytes) => v2acts.decodeActs(bytes, { maxFormat: 4 }),
  decodeCanonical: (bytes) => v2acts.decodeCanonical(bytes, { maxFormat: 4 }),
  settledCells: (tiles) => v2look.settledCells(tiles, { law: 4 }),
  grow: (rec, opts) => v2sim.grow(rec, { ...opts, law: 4 }),
  createLive: (sheet) => v2live.createLive({ ...sheet, law: 4 }),
  factsDigest: (o) => v2look.factsDigest({ ...o, law: 4 }),
});

export class LawUnknown extends Error {
  constructor(n) {
    super(`law ${n} is not known here`);
    this.code = 'law_unknown';
  }
}

export function lawOf(n) {
  const l = LAWS[n];
  if (!l) throw new LawUnknown(n);
  return l;
}

// The buckets a look is cached under: age in whole hours (capped; 0 when the
// look cannot age), views in steps of 8. Law 1 looks have one bucket.
export function viewBuckets(law, { ageH = 0, views = 0, ages = true } = {}) {
  if (law < 2) return { ageH: 0, views: 0 };
  return { ageH: ages ? v2look.ageBucket(ageH) : 0, views: v2look.exposureBucket(views) };
}
