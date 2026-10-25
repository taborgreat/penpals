// Verifying a .book or a proof bundle with no server: the same code the server,
// the BookViewer and the CLI use. What it can say about each line:
//   sealed    the record is signed by the book's key (anyone can check)
//   open      its sheet's seed is published, signed open by the key, and is the
//             seed the record committed to
//   regrown   the ink grown again from that seed settles exactly as the record says
// The layout (pages, positions) is not signed: it is reported as layout.

import { checkInkBody, checkPhotoBody, verifySealed, verifyOpenFor, regrow } from './record.js';
import { proofOf, isGoodPublicKey, fingerprint } from './keys.js';
import { fromB64url, b64url } from './tags.js';
import { checkBirth, replay, growShared } from './shared.js';

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
  if (head.book !== 2) problems.push('not a version 2 book');
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
  const shares = new Map(); // a shared sheet (rooms.md §6): its owner, its stamped acts

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
      } else if (line.share) {
        // a shared sheet: the owner's own, open from birth
        r.kind = 'shared-sheet';
        r.sheet = line.share.birth?.sheet ?? null;
        const born = checkBirth(line.share.birth, line.share);
        if (born.owner !== head.key) throw new Error('a shared sheet in a book is its owner’s own');
        if (bySheet.has(r.sheet) || shares.has(r.sheet)) throw new Error(`sheet ${r.sheet} is used twice`);
        shares.set(r.sheet, { ...born, lines: [], r });
        r.sealed = true;
        r.open = true;
      } else if (typeof line.shared === 'string') {
        // an act on it, as the stamper placed it
        r.kind = 'shared';
        r.sheet = line.shared;
        const sh = shares.get(line.shared);
        if (!sh) throw new Error('an act on a sheet that is not in this book');
        sh.lines.push({ n: line.n, at: line.at, act: line.act, seal: line.seal });
        r.sealed = true;
      } else if (typeof line.open === 'string') {
        r.kind = 'open';
        r.sheet = line.open;
        const target = bySheet.get(line.open);
        if (!target || target.line.id !== line.ref) throw new Error('opens a sheet that is not in this book');
        const seed = verifyOpenFor(target.line.ink, target.D, { seed: line.seed, by: line.by });
        target.r.open = true;
        r.open = true;
        if (regrowOpen && target.line.ink.kind === 'ink') target.r.regrown = regrow(target.line.ink, seed).ok;
      } else throw new Error('unknown line');
    } catch (err) {
      r.error = err.message;
    }
  });
  // Each shared sheet replayed: every place in order, every seal its writer's, every
  // act allowed by the chain before it (possession, lifts); then it grows.
  for (const [sheet, sh] of shares) {
    // (a press took or not: the sheet grown to it says, with the wax that landed on it; that wax
    // is regrown from the signed acts of the rooms it lay in, which a book does not hold: a write
    // allowed only by such a seal is not verified here, and said so)
    const { problems: wrong, unverified: open } = replay(sh.owner, sh.lines, { ctx: { seed: sh.seed, family: sh.family, drips: null } });
    for (const u of open) unverified.push(`shared sheet ${sheet}, ${u}`);
    for (const w of wrong) problems.push(`shared sheet ${sheet}, ${w}`);
    if (regrowOpen && !wrong.length) {
      try {
        growShared(sh.lines, { seed: sh.seed, family: sh.family });
        sh.r.regrown = true;
      } catch (err) {
        sh.r.regrown = false;
        sh.r.error = err.message;
      }
    }
  }
  // The layout points only at ink that is there.
  for (const [pid, page] of Object.entries(head.pages ?? {})) {
    for (const it of page.items ?? []) {
      const l = byId.get(it.ink);
      if (!l?.ink || l.ink.use !== 'book') problems.push(`page ${pid} item ${it.id} points at ${it.ink}, which is not book ink here`);
    }
  }
  // and so does the room's: each surface (a wall, the floor, the table) holds book
  // ink written on that surface's own matter (rooms.md §2)
  for (const [sid, surface] of Object.entries(head.surfaces ?? {})) {
    for (const it of surface.items ?? []) {
      const l = byId.get(it.ink);
      if (!l?.ink || l.ink.use !== 'book') problems.push(`surface ${sid} item ${it.id} points at ${it.ink}, which is not book ink here`);
      else if (l.ink.law >= 4 ? l.ink.matter !== surface.matter : JSON.stringify(l.ink.paper) !== JSON.stringify(surface.family))
        problems.push(`surface ${sid} item ${it.id} is not written on that surface's matter`);
    }
  }
  if (head.signature) {
    const l = byId.get(head.signature);
    if (!l?.ink || l.ink.use !== 'signature' || (l.ink.name !== String(head.name).toLowerCase() && l.ink.name !== head.name)) problems.push('the signature is not a signature record for this name');
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
