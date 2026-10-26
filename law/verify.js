// Verifying a .book or a proof bundle with no server: the same code the server,
// the BookViewer and the CLI use. What it can say about each line:
//   sealed    the record is signed by the book's key (anyone can check)
//   open      its sheet's seed is published, signed open by the key, and is the
//             seed the record committed to
//   regrown   the ink grown again from that seed settles exactly as the record says
// A book (Tabor, 2026-10-25) is its chain: its key's signatures, and every paper and house surface it made,
// each replayed from its own acts (law/paper.js). There is no layout.

import { checkInkBody, checkPhotoBody, verifySealed, verifyOpenFor, regrow } from './record.js';
import { proofOf, isGoodPublicKey, fingerprint } from './keys.js';
import { fromB64url, b64url } from './tags.js';
import { checkBirth, replay, growPaper } from './paper.js';

const ID_RE = /^k_\d{6}$/;

export function parseBook(text) {
  const end = text.lastIndexOf('\n');
  const body = end < 0 ? text : text.slice(0, end);
  const [first, ...rest] = body.split('\n');
  const head = JSON.parse(first);
  const lines = [];
  const damaged = [];
  rest.forEach((l, i) => {
    if (!l.trim()) return;
    try {
      lines.push(JSON.parse(l));
    } catch {
      damaged.push(i + 2);
    }
  });
  return { head, lines, damaged };
}

export function verifyBook(text, { regrowOpen = true } = {}) {
  const { head, lines, damaged } = parseBook(text);
  const problems = damaged.map((n) => `line ${n} is damaged`);
  const unverified = []; // (what a book alone cannot check: listed, not a problem)
  if (head.book !== 3) problems.push('not a version 3 book');
  let key = null;
  try {
    key = fromB64url(head.key, 32);
    if (!isGoodPublicKey(key)) throw new Error();
  } catch {
    problems.push('the book has no valid key');
  }
  const results = [];
  const bySheet = new Map();
  const byId = new Map();
  const papers = new Map(); // a paper (law/paper.js) its key made: its birth, its stamped acts

  lines.forEach((line, i) => {
    const expect = `k_${String(i + 1).padStart(6, '0')}`;
    if (line.id !== expect) problems.push(`chain ids jump at ${line.id ?? '?'} (expected ${expect}): lines were removed or reordered`);
    byId.set(line.id, line);
    const r = { id: line.id, kind: null, use: null, sheet: null, sealed: false, open: false, regrown: null, error: null };
    results.push(r);
    try {
      if (!ID_RE.test(line.id)) throw new Error('bad id');
      if (line.ink) {
        r.kind = line.ink.kind;
        r.use = line.ink.use;
        r.sheet = line.ink.sheet;
        if (line.ink.kind === 'ink') checkInkBody(line.ink);
        else checkPhotoBody(line.ink);
        if (!key) throw new Error('no key to check against');
        const D = verifySealed(line, key);
        r.sealed = true;
        if (bySheet.has(line.ink.sheet)) throw new Error(`sheet ${line.ink.sheet} is used twice`);
        bySheet.set(line.ink.sheet, { line, D, r });
        if (line.open) {
          const seed = verifyOpenFor(line.ink, D, line.open);
          r.open = true;
          if (regrowOpen) r.regrown = regrow(line.ink, seed).ok;
        }
      } else if (line.paper) {
        // a paper this key made: open from birth
        r.kind = 'paper';
        r.sheet = line.paper.birth?.paper ?? null;
        const born = checkBirth(line.paper.birth, line.paper);
        if (born.owner !== head.key) throw new Error('a paper in a book is born its maker’s own');
        if (bySheet.has(r.sheet) || papers.has(r.sheet)) throw new Error(`paper ${r.sheet} is used twice`);
        papers.set(r.sheet, { ...born, birth: line.paper.birth, lines: [], r });
        r.sealed = true;
        r.open = true;
      } else if (typeof line.on === 'string') {
        // an act on it, as the stamper placed it
        r.kind = 'paper-act';
        r.sheet = line.on;
        const p = papers.get(line.on);
        if (!p) throw new Error('an act on a paper that is not in this book');
        p.lines.push({ n: line.n, at: line.at, act: line.act, seal: line.seal });
        r.sealed = true;
      } else throw new Error('unknown line');
    } catch (err) {
      r.error = err.message;
    }
  });
  // Each paper replayed: every place in order, every seal its being's, every act allowed by its chain
  // before it (who may mark it, who may move it); then it grows (the wax that dripped onto it is regrown
  // from the rooms it lay in, which a book does not hold: its ink and its seals' impressions are checked here)
  for (const [paper, p] of papers) {
    const { problems: wrong } = replay(p.birth, p.lines);
    for (const w of wrong) problems.push(`paper ${paper}, ${w}`);
    if (regrowOpen && !wrong.length) {
      try {
        growPaper(p.lines, { seed: p.seed, family: p.family });
        p.r.regrown = true;
      } catch (err) {
        p.r.regrown = false;
        p.r.error = err.message;
      }
    }
  }
  // a signature: its key's name, signed (open from birth)
  for (const r of results) {
    if (r.use !== 'signature') continue;
    const l = byId.get(r.id);
    if (!l.open || (l.ink.name !== String(head.name).toLowerCase() && l.ink.name !== head.name)) problems.push(`${r.id} is not an open signature of this name`);
  }
  const bad = results.filter((r) => r.error || r.regrown === false);
  return {
    ok: !problems.length && !bad.length,
    name: head.name,
    key: head.key,
    fingerprint: key ? fingerprint(key) : null,
    results,
    problems,
    unverified,
  };
}

// A live proof: the requester's challenge and the writer's key fix the sheet and
// the phrase; the line must be on that sheet, sealed, open, and regrow.
export function verifyProof(bundle, { regrowOpen = true } = {}) {
  const problems = [];
  let regrown = null;
  try {
    const key = fromB64url(bundle.of?.key, 32);
    const challenge = fromB64url(bundle.challenge, 32);
    const { sheet, phrase } = proofOf(challenge, key);
    const body = bundle.line?.ink;
    checkInkBody(body);
    if (body.use !== 'proof' || body.sheet !== sheet) problems.push('the proof is not on the sheet its challenge names');
    if (body.proof?.phrase !== phrase || body.proof?.challenge !== b64url(challenge)) problems.push('the proof does not carry its challenge and phrase');
    const D = verifySealed(bundle.line, key);
    const seed = verifyOpenFor(body, D, bundle.line.open);
    if (regrowOpen) regrown = regrow(body, seed).ok;
    if (regrown === false) problems.push('the ink does not regrow as sealed');
  } catch (err) {
    problems.push(err.message);
  }
  return { ok: !problems.length, regrown, problems };
}
