// The Phase 0 analysis: does the hand, read through the ink on the calibration
// paper, open the key for its owner and not for attackers?
//
//   node law/lab/analyze.js --samples law/lab/samples [--out law/lab/report.md]
//   node law/lab/analyze.js --synthetic 4            (pipeline check on synthetic writers)
//
// Samples are JSON files (from /hand-lab): { person, session, device, task,
// text?, target?, arm?, acts (b64url), letters?: { a: b64url, ... }, pangram? }
//   task A        a fresh 4-word phrase (control arm: text-independent reading)
//   task B        the person's own secret phrase (design B)
//   task PAGE     the calibration page
//   task corpus   letters a–z (one record each, box frame) + a pangram: their public writing
//   task impostor someone writing `target`'s B phrase (knows the phrase)
//   task trace    someone tracing `target`'s sample of arm `arm`
//
// Arms and readings:
//   B     zones 8 + global, enrolled from sessions 1–3 (majority per bit)
//   A     global only (a fresh phrase every time)
//   PAGE  4 bands × 8 zones + global
// Attackers: zero-effort impostor, human tracer, digital copier (A: the
// person's public writing on the calibration paper), stitcher (B and PAGE:
// the text composed from the person's public letterforms with their timing).

import fs from 'node:fs';
import path from 'node:path';
import { readHand, handLevels, log2x8, ZONE_SPEC, GLOBAL_SPEC, ZONE_FEATURES, GLOBAL_FEATURES, CALIBRATION_TEXT } from '../v1/hand.js';
import { readRaw, rawLevels, levelsToBits, RAW_ZONE_SPEC, RAW_GLOBAL_SPEC, RAW_ZONE, RAW_GLOBAL } from './rawfeatures.js';
import { stitch } from './stitch.js';
import { decodeActs } from '../v1/acts.js';
import { fromB64url, b64url } from '../tags.js';
import * as S from './synth.js';

export { CALIBRATION_TEXT };

const ARMS = {
  B: { layout: { bands: 1, zones: 8 }, useZones: true, useGlobal: true },
  A: { layout: { bands: 1, zones: 1 }, useZones: false, useGlobal: true },
  PAGE: { layout: { bands: 4, zones: 8 }, useZones: true, useGlobal: true },
};

// --- readings (cached: the facts reading grows the whole writing) ---

const cache = new Map();
function reading(kind, bytes, arm) {
  const key = `${kind}:${arm}:${b64url(bytes)}`;
  let r = cache.get(key);
  if (!r) {
    r = kind === 'facts' ? readHand(bytes, ARMS[arm].layout) : readRaw(bytes, ARMS[arm].layout);
    cache.set(key, r);
  }
  return r;
}

const specsOf = (kind, arm) => {
  const z = kind === 'facts' ? ZONE_FEATURES.map((f) => ZONE_SPEC[f]) : RAW_ZONE.map((f) => RAW_ZONE_SPEC[f]);
  const g = kind === 'facts' ? GLOBAL_FEATURES.map((f) => GLOBAL_SPEC[f]) : RAW_GLOBAL.map((f) => RAW_GLOBAL_SPEC[f]);
  const { bands, zones } = ARMS[arm].layout;
  const out = [];
  if (ARMS[arm].useZones) for (let i = 0; i < bands * zones; i++) out.push(...z);
  if (ARMS[arm].useGlobal) out.push(...g);
  return out;
};
const valuesOf = (r, arm) => [...(ARMS[arm].useZones ? r.zone : []), ...(ARMS[arm].useGlobal ? r.global : [])];
const mapped = (v, [kind]) => (kind === 'log' ? log2x8(Math.max(0, Math.round(v))) : v);

function levelsOf(kind, r, arm, offsets) {
  const opts = { useZones: ARMS[arm].useZones, useGlobal: ARMS[arm].useGlobal, offsets };
  return kind === 'facts' ? handLevels(r, opts) : rawLevels(r, opts);
}

// Enrollment: per-bit majority of the enrollment readings. With `center`, each
// feature is shifted so the person's own mean sits in the middle of its bin
// (the shift is helper data, one small number per feature).
function enroll(kind, arm, readings, center) {
  const specs = specsOf(kind, arm);
  let offsets = null;
  if (center) {
    const vals = readings.map((r) => valuesOf(r, arm));
    offsets = specs.map((spec, i) => {
      const m = vals.reduce((s, v) => s + mapped(v[i], spec), 0) / vals.length;
      const step = spec[2];
      return Math.floor(step / 2) - (((Math.round(m) - spec[1]) % step) + step) % step;
    });
  }
  const bitsList = readings.map((r) => levelsToBits(levelsOf(kind, r, arm, offsets)));
  const n = bitsList[0].length;
  const ref = new Uint8Array(n);
  const mask = new Uint8Array(n); // reliable bits: every enrollment reading agreed
  for (let i = 0; i < n; i++) {
    const ones = bitsList.reduce((s, b) => s + b[i], 0);
    ref[i] = ones * 2 > bitsList.length ? 1 : 0;
    mask[i] = ones === 0 || ones === bitsList.length ? 1 : 0;
  }
  return { ref, offsets, mask };
}
const bitsFor = (kind, arm, r, offsets) => levelsToBits(levelsOf(kind, r, arm, offsets));
const hd = (a, b, mask = null) => {
  let d = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (mask && !mask[i]) continue;
    n++;
    d += a[i] !== b[i] ? 1 : 0;
  }
  return mask ? Math.round((d * a.length) / Math.max(1, n)) : d; // masked distances scaled to full length
};

// --- samples ---

export function loadSamples(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const s = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (s.acts) s.acts = fromB64url(s.acts);
        if (s.pangram) s.pangram = fromB64url(s.pangram);
        if (s.letters) for (const k of Object.keys(s.letters)) s.letters[k] = fromB64url(s.letters[k]);
        out.push(s);
      }
    }
  };
  walk(dir);
  return out;
}

export function syntheticSamples(nPeople = 4, sessions = 10, devices = ['desktop', 'phone']) {
  const people = Array.from({ length: nPeople }, (_, i) => ({ id: `s${i + 1}`, w: S.makeWriter(i + 1), phrase: S.freshPhrase(1000 + i) }));
  const out = [];
  for (const p of people) {
    for (const device of devices) {
      for (let s = 1; s <= sessions; s++) {
        out.push({ person: p.id, session: s, device, task: 'A', text: S.freshPhrase(s * 97 + p.w.seed), acts: S.write(p.w, S.freshPhrase(s * 97 + p.w.seed), s, device) });
        out.push({ person: p.id, session: s, device, task: 'B', text: p.phrase, acts: S.write(p.w, p.phrase, s, device) });
        if ([1, 2, 3, 6, 10].includes(s)) out.push({ person: p.id, session: s, device, task: 'PAGE', text: CALIBRATION_TEXT, acts: S.write(p.w, CALIBRATION_TEXT, s, device) });
      }
    }
    const c = S.corpus(p.w);
    out.push({ person: p.id, session: 0, device: 'desktop', task: 'corpus', letters: c.letters, pangram: c.pangram });
  }
  people.forEach((p, i) => {
    const other = people[(i + 1) % people.length];
    for (const device of devices) {
      // the next person writes this person's phrase, and traces their samples
      out.push({ person: other.id, session: 1, device, task: 'impostor', target: p.id, text: p.phrase, acts: S.write(other.w, p.phrase, 1, device) });
      for (const arm of ['A', 'B', 'PAGE']) {
        const src = out.find((s) => s.person === p.id && s.device === device && s.task === arm && s.session === 6);
        if (src) out.push({ person: other.id, session: 1, device, task: 'trace', target: p.id, arm, acts: S.trace(decodeActs(src.acts), i + 50) });
      }
    }
  });
  return out;
}

// --- the analysis ---

function rates(genuine, attackers, nBits) {
  const rows = [];
  for (let t = 0; t <= nBits; t++) {
    const frr = genuine.length ? genuine.filter((d) => d > t).length / genuine.length : null;
    const far = {};
    for (const [k, ds] of Object.entries(attackers)) far[k] = ds.length ? ds.filter((d) => d <= t).length / ds.length : null;
    rows.push({ t, frr, far });
  }
  return rows;
}

export function analyze(samples, { log = () => {} } = {}) {
  const people = [...new Set(samples.filter((s) => s.task === 'B' || s.task === 'A').map((s) => s.person))].sort();
  const devices = [...new Set(samples.filter((s) => s.device).map((s) => s.device))].sort();
  const corpusOf = (p) => samples.find((s) => s.task === 'corpus' && s.person === p);
  const results = [];

  for (const kind of ['facts', 'raw']) {
    for (const arm of ['B', 'A', 'PAGE']) {
      for (const [center, reliable] of [[false, false], [true, false], [true, true]]) {
        const genuine = [];
        const cross = [];
        const att = { impostor: [], tracer: [], copier: [], stitcher: [] };
        const perDevice = {};
        let nBits = 0;
        for (const p of people) {
          for (const device of devices) {
            const own = samples.filter((s) => s.person === p && s.device === device && s.task === arm).sort((a, b) => a.session - b.session);
            if (own.length < 4) continue;
            const enrolled = enroll(kind, arm, own.slice(0, 3).map((s) => reading(kind, s.acts, arm)), center);
            nBits = enrolled.ref.length;
            const dist = (bytes) => hd(bitsFor(kind, arm, reading(kind, bytes, arm), enrolled.offsets), enrolled.ref, reliable ? enrolled.mask : null);
            const g = own.slice(3).map((s) => dist(s.acts));
            genuine.push(...g);
            (perDevice[device] ??= []).push(...g);
            for (const od of devices) {
              if (od === device) continue;
              const others = samples.filter((s) => s.person === p && s.device === od && s.task === arm && s.session > 3);
              cross.push(...others.map((s) => dist(s.acts)));
            }
            if (arm === 'B') {
              att.impostor.push(...samples.filter((s) => s.task === 'impostor' && s.target === p).map((s) => dist(s.acts)));
            }
            if (arm === 'A') {
              att.impostor.push(...samples.filter((s) => s.task === 'A' && s.person !== p && s.device === device).map((s) => dist(s.acts)));
            }
            att.tracer.push(...samples.filter((s) => s.task === 'trace' && s.target === p && s.arm === arm).map((s) => dist(s.acts)));
            const c = corpusOf(p);
            if (c && arm === 'A') att.copier.push(dist(c.pangram));
            if (c && arm === 'B') {
              const text = own[0].text;
              if (text) att.stitcher.push(dist(stitch(c.letters, c.pangram, text)));
            }
            if (c && arm === 'PAGE') att.stitcher.push(dist(stitch(c.letters, c.pangram, CALIBRATION_TEXT)));
          }
          log(`${kind} ${arm}${center ? ' centered' : ''}${reliable ? ' reliable' : ''} ${p} done`);
        }
        if (!genuine.length) continue;
        const table = rates(genuine, att, nBits);
        const pick = table.find((r) => r.frr !== null && r.frr <= 0.05) ?? table[table.length - 1];
        const crossAt = cross.length ? cross.filter((d) => d > pick.t).length / cross.length : null;
        const deviceFrr = Object.fromEntries(Object.entries(perDevice).map(([d, ds]) => [d, ds.filter((x) => x > pick.t).length / ds.length]));
        results.push({ kind, arm, center, reliable, nBits, genuine, cross, perDevice, attackers: att, table, pick, crossFrr: crossAt, deviceFrr });
      }
    }
  }
  return { people, devices, results, discriminability: discriminability(samples, people) };
}

// Fisher ratio per feature (facts, B arm, fixed quantization): how much a
// feature differs between people relative to how much it wobbles within one.
function discriminability(samples, people) {
  const out = [];
  for (const [kind, names] of [['facts', [...ZONE_FEATURES, ...GLOBAL_FEATURES]], ['raw', [...RAW_ZONE, ...RAW_GLOBAL]]]) {
    const byPerson = people.map((p) => samples.filter((s) => s.person === p && s.task === 'B').map((s) => valuesOf(reading(kind, s.acts, 'B'), 'B')));
    if (!byPerson.every((l) => l.length >= 2)) continue;
    const nf = byPerson[0][0].length;
    const nz = ZONE_FEATURES.length;
    const zonesCount = ARMS.B.layout.zones;
    for (let f = 0; f < nf; f++) {
      const means = byPerson.map((l) => l.reduce((s, v) => s + v[f], 0) / l.length);
      const within = byPerson.reduce((s, l, i) => s + l.reduce((a, v) => a + (v[f] - means[i]) ** 2, 0) / l.length, 0) / byPerson.length;
      const grand = means.reduce((s, m) => s + m, 0) / means.length;
      const between = means.reduce((s, m) => s + (m - grand) ** 2, 0) / means.length;
      const name = f < nz * zonesCount ? `zone${Math.floor(f / nz)}.${names[f % nz]}` : `global.${names[nz + (f - nz * zonesCount)]}`;
      out.push({ kind, feature: name, fisher: within > 0 ? between / within : between > 0 ? Infinity : 0 });
    }
  }
  return out;
}

// --- the report ---

const quant = (r) => (r.reliable ? 'centered+reliable' : r.center ? 'centered' : 'fixed');
const pct = (v) => (v === null || v === undefined ? '—' : `${(100 * v).toFixed(1)}%`);

export function report({ people, devices, results, discriminability: disc }, { source }) {
  const lines = [];
  lines.push('# Phase 0 report: the hand through the ink', '');
  lines.push(`Source: ${source}. People: ${people.length} (${people.join(', ')}). Devices: ${devices.join(', ')}.`, '');
  lines.push('Radius t is chosen as the smallest Hamming distance that keeps the false-reject rate at or under 5%; false-accept rates are read at that t. Enrollment is the per-bit majority of sessions 1–3; genuine tests are sessions 4 and later, same device. Cross-device: enrolled on one device, tested on the other.', '');
  lines.push('| measure | arm | quantize | bits | t | FRR | FRR by device | cross-device FRR | impostor | tracer | copier | stitcher |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const f = r.pick.far;
    lines.push(`| ${r.kind} | ${r.arm} | ${quant(r)} | ${r.nBits} | ${r.pick.t} | ${pct(r.pick.frr)} | ${Object.entries(r.deviceFrr).map(([d, v]) => `${d} ${pct(v)}`).join(', ')} | ${pct(r.crossFrr)} | ${pct(f.impostor)} | ${pct(f.tracer)} | ${pct(f.copier)} | ${pct(f.stitcher)} |`);
  }
  lines.push('');
  const n = (r) => `${r.kind}/${r.arm}/${quant(r)}`;
  lines.push('## Distances', '');
  for (const r of results) {
    const s = (ds) => (ds.length ? `min ${Math.min(...ds)} · median ${[...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)]} · max ${Math.max(...ds)} (n=${ds.length})` : '—');
    lines.push(`- **${n(r)}** genuine: ${s(r.genuine)}; cross-device: ${s(r.cross)}; impostor: ${s(r.attackers.impostor)}; tracer: ${s(r.attackers.tracer)}; copier: ${s(r.attackers.copier)}; stitcher: ${s(r.attackers.stitcher)}`);
  }
  lines.push('');
  const facts = results.filter((r) => r.kind === 'facts' && r.arm === 'B');
  const gate = [...facts].sort((a, b) => (a.pick.far.stitcher ?? 1) - (b.pick.far.stitcher ?? 1) || (a.pick.far.tracer ?? 1) - (b.pick.far.tracer ?? 1))[0];
  if (gate) {
    lines.push(`(The best facts/B quantization by stitcher FAR: ${quant(gate)}.)`, '');
    const ok = gate.pick.frr <= 0.05 && (gate.pick.far.tracer ?? 0) < 0.01;
    lines.push('## Gate (design B, facts measure)', '');
    lines.push(`At t = ${gate.pick.t} of ${gate.nBits} bits: FRR ${pct(gate.pick.frr)}, tracer FAR ${pct(gate.pick.far.tracer)}, **stitcher FAR ${pct(gate.pick.far.stitcher)}** (the deciding number), impostor-with-phrase FAR ${pct(gate.pick.far.impostor)}.`);
    lines.push(ok ? 'FRR and tracer FAR are within the gate; the stitcher number decides.' : '**The gate is not met** (FRR > 5% or tracer FAR ≥ 1%).', '');
  }
  lines.push('## Which features separate people (Fisher ratio, B arm)', '');
  for (const kind of ['facts', 'raw']) {
    const list = disc.filter((d) => d.kind === kind).sort((a, b) => b.fisher - a.fisher);
    if (!list.length) continue;
    lines.push(`- ${kind}, strongest: ${list.slice(0, 8).map((d) => `${d.feature} ${d.fisher === Infinity ? '∞' : d.fisher.toFixed(2)}`).join(', ')}`);
    lines.push(`- ${kind}, weakest: ${list.slice(-6).map((d) => `${d.feature} ${d.fisher.toFixed(2)}`).join(', ')}`);
  }
  lines.push('', `Small-sample caveat: ${people.length} people. Rates are counts over few comparisons; treat them as a first look, not a measurement of the population.`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('lab', 'analyze.js'))) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const synthetic = args.includes('--synthetic') ? Number(opt('synthetic', 4)) : 0;
  const dir = opt('samples', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'samples'));
  const samples = synthetic ? syntheticSamples(synthetic) : loadSamples(dir);
  const t0 = Date.now();
  const res = analyze(samples, { log: (m) => process.stderr.write(`${m}\n`) });
  res.synthetic = synthetic > 0; // a synthetic report can never freeze the hand (lab/freeze.js refuses it)
  const text = report(res, { source: synthetic ? `synthetic writers (${synthetic})` : dir });
  const out = opt('out', null);
  if (out) {
    fs.writeFileSync(out, text);
    fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(res, (k, v) => (v instanceof Uint8Array ? undefined : v), 1));
  }
  console.log(text);
  console.error(`analyzed ${samples.length} samples in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
