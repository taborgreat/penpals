// Freezing the hand (plan: Phase 0 gate → law v1): read the analysis of REAL
// hands (lab/analyze.js on law/lab/samples), check the gate, and, with --apply,
// write the radii into v1/hand.js and turn LAW_HAND_UNFROZEN off.
//   node law/lab/freeze.js [--report law/lab/report.json] [--apply]
// Exit 0 when the gate passes (and, with --apply, the constants are written);
// 1 when it does not, or the data cannot decide it. Nothing is written then.
//
// The gate, as the plan states it, for the measure the code implements (the
// facts read on the calibration paper, bins centred on the person, majority of
// three enrolment writings, as the hand opened the key until accounts-change.md):
//   phrase (arm B): FRR ≤ 5% overall and on each device with its own sketch;
//                   tracer FAR ≤ 1%; stitcher FAR ≤ 1% (the deciding number)
//   page:           FRR ≤ 5%; tracer and stitcher FAR ≤ 1%
// and each radius must leave the BCH code room for at least MIN_R_BITS of r.
// It also reports the zero-effort impostor (someone else writing the phrase
// with the password: the password is what stops them) and whether one sketch
// covers both devices or each device needs its own rhythm (the cap must hold two).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCode } from '../fuzzy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HAND_FILE = path.join(here, '..', 'v1', 'hand.js');

export const GATE = { frr: 0.05, tracer: 0.01, stitcher: 0.01, impostorWarn: 0.05 };
export const MIN_PEOPLE = 3;
export const MIN_GENUINE_PER_DEVICE = 15; // tested writings per device, over everyone
export const MIN_R_BITS = 32;
export const SKETCH_CAP = 5;
const CODES = { B: { m: 9, n: 300, kind: 'phrase' }, PAGE: { m: 11, n: 1092, kind: 'page' } };

const rate = (ds, pass) => (ds?.length ? ds.filter(pass).length / ds.length : null);

// The smallest radius meeting the false-reject goal everywhere it must, and what it lets in.
function pickRadius(r, { perDevice }) {
  for (let t = 0; t <= r.nBits; t++) {
    const frr = rate(r.genuine, (d) => d > t);
    if (frr === null || frr > GATE.frr) continue;
    if (perDevice) {
      const worst = Math.max(...Object.values(r.perDevice ?? {}).map((ds) => rate(ds, (d) => d > t) ?? 0));
      if (worst > GATE.frr) continue;
    }
    return t;
  }
  return null;
}

export function decide(report) {
  const problems = [];
  const notes = [];
  if (report.synthetic) problems.push('this report is from synthetic writers: only real hands can freeze the hand');
  if ((report.people?.length ?? 0) < MIN_PEOPLE) problems.push(`${report.people?.length ?? 0} people; the gate needs at least ${MIN_PEOPLE}`);
  for (const d of ['desktop', 'phone']) if (!report.devices?.includes(d)) problems.push(`no ${d} sessions: every person writes on both`);

  const find = (arm, center, reliable) => report.results?.find((r) => r.kind === 'facts' && r.arm === arm && r.center === center && r.reliable === reliable);
  const out = { radii: {}, codes: {}, devices: null };

  for (const arm of ['B', 'PAGE']) {
    const r = find(arm, true, false);
    const name = arm === 'B' ? 'phrase' : 'page';
    if (!r) {
      problems.push(`no ${name} results for the implemented measure (facts, centred)`);
      continue;
    }
    if (arm === 'B') {
      if (!r.perDevice) problems.push('the report has no per-device distances: run lab/analyze.js again');
      for (const [d, ds] of Object.entries(r.perDevice ?? {})) if (ds.length < MIN_GENUINE_PER_DEVICE) problems.push(`only ${ds.length} tested ${d} phrase writings (need ${MIN_GENUINE_PER_DEVICE})`);
      if (!r.attackers.tracer.length) problems.push('no tracings of the phrase');
      if (!r.attackers.stitcher.length) problems.push('no stitcher attempts (each person needs the public corpus)');
    }
    const t = pickRadius(r, { perDevice: arm === 'B' });
    if (t === null) {
      problems.push(`${name}: no radius keeps the false-reject rate at ${GATE.frr * 100}%${arm === 'B' ? ' on every device' : ''}`);
      continue;
    }
    const tracer = rate(r.attackers.tracer, (d) => d <= t);
    const stitcher = rate(r.attackers.stitcher, (d) => d <= t);
    const impostor = rate(r.attackers.impostor, (d) => d <= t);
    if (tracer !== null && tracer > GATE.tracer) problems.push(`${name}: at t=${t} a tracer gets in ${(tracer * 100).toFixed(1)}% of the time (gate ${GATE.tracer * 100}%)`);
    if (stitcher !== null && stitcher > GATE.stitcher)
      problems.push(`${name}: at t=${t} the stitcher gets in ${(stitcher * 100).toFixed(1)}% of the time (gate ${GATE.stitcher * 100}%): the deciding number`);
    if (impostor !== null && impostor > GATE.impostorWarn)
      notes.push(`${name}: at t=${t} someone else writing the phrase matches ${(impostor * 100).toFixed(1)}% of the time; the password is what stops them`);
    let code = null;
    try {
      code = makeCode(CODES[arm].m, t, CODES[arm].n);
    } catch (err) {
      problems.push(`${name}: t=${t} leaves no BCH code (${err.message})`);
    }
    if (code && code.k < MIN_R_BITS) problems.push(`${name}: t=${t} leaves ${code.k} bits for r (need ${MIN_R_BITS}): the hand is too unsteady for this code`);
    out.radii[name] = t;
    if (code) out.codes[name] = { id: code.id, k: code.k };
    // Would the other quantizations pass where this one does not? (that would be a code change, not a constant)
    for (const [center, reliable, label] of [
      [false, false, 'fixed bins'],
      [true, true, 'centred + reliable bits'],
    ]) {
      const alt = find(arm, center, reliable);
      const at = alt && pickRadius(alt, { perDevice: arm === 'B' });
      if (at === null || at === undefined) continue;
      const altStitch = rate(alt.attackers.stitcher, (d) => d <= at);
      const altTrace = rate(alt.attackers.tracer, (d) => d <= at);
      notes.push(`${name}, ${label}: t=${at}, tracer ${altTrace === null ? '–' : (altTrace * 100).toFixed(1)}%, stitcher ${altStitch === null ? '–' : (altStitch * 100).toFixed(1)}%`);
    }
    if (arm === 'B') {
      const cross = rate(r.cross, (d) => d > t);
      const perDevice = Object.fromEntries(Object.entries(r.perDevice ?? {}).map(([d, ds]) => [d, rate(ds, (x) => x > t)]));
      const oneCovers = cross !== null && cross <= GATE.frr;
      out.devices = { perDevice, cross, oneCovers };
      notes.push(
        oneCovers
          ? `one sketch covers both devices (cross-device FRR ${(cross * 100).toFixed(1)}%)`
          : `each device needs its own rhythm (cross-device FRR ${cross === null ? '–' : (cross * 100).toFixed(1)}%): the cap of ${SKETCH_CAP} holds ${Math.floor(SKETCH_CAP / 2)} rhythms for each of two devices`,
      );
    }
  }
  return { ok: problems.length === 0, problems, notes, ...out };
}

// Write the radii into v1/hand.js and turn the unfrozen flag off.
export function applyFreeze(decision, file = HAND_FILE) {
  let s = fs.readFileSync(file, 'utf8');
  const set = (name, value) => {
    const re = new RegExp(`(export const ${name} = )[^;]+;`);
    if (!re.test(s)) throw new Error(`${name} not found in ${file}`);
    s = s.replace(re, `$1${value};`);
  };
  set('PHRASE_RADIUS', decision.radii.phrase);
  set('PAGE_RADIUS', decision.radii.page);
  set('LAW_HAND_UNFROZEN', 'false');
  fs.writeFileSync(file, s);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const file = opt('report', path.join(here, 'report.json'));
  if (!fs.existsSync(file)) {
    console.error(`No report at ${file}. Collect the sessions (/hand-lab), then: node law/lab/analyze.js --out law/lab/report.md`);
    process.exit(1);
  }
  const d = decide(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(
    `radii: phrase ${d.radii.phrase ?? '–'} (${d.codes.phrase?.id ?? '–'}, r ${d.codes.phrase?.k ?? '–'} bits), page ${d.radii.page ?? '–'} (${d.codes.page?.id ?? '–'}, r ${d.codes.page?.k ?? '–'} bits)`,
  );
  for (const n of d.notes) console.log(`  note: ${n}`);
  for (const p of d.problems) console.log(`  GATE: ${p}`);
  if (!d.ok) {
    console.log('The hand stays unfrozen. Nothing was written.');
    process.exit(1);
  }
  if (!args.includes('--apply')) {
    console.log('The gate passes. Run again with --apply to write the radii into law/v1/hand.js and freeze the hand.');
    process.exit(0);
  }
  applyFreeze(d);
  console.log(`Frozen: law/v1/hand.js now has PHRASE_RADIUS ${d.radii.phrase}, PAGE_RADIUS ${d.radii.page}, LAW_HAND_UNFROZEN false.`);
  console.log('Sketches made before this (their code ids name the old radii) no longer open: accounts registered before the freeze register again.');
  console.log('Then: npm test, and record the decision in keys.md (Rulings taken in this build).');
}
