import { useCallback, useEffect, useState } from 'react';
import { keys as K, b64url } from 'penpals-law';
import { useAuth } from '../auth.jsx';
import { useKey } from '../keys/session.js';
import Journal from '../book/Journal.jsx';
import { parseLines, readChain } from '../book/ink.js';
import InkItem from '../book/InkItem.jsx';
import { verifyBookHere, growLook, regrowHere, viewAt } from '../ink/grown.js';
import { sceneOf } from '../scene/sources.js';

// Open a downloaded .book (books.md A7, keys.md) and check it here, with no
// server: line 1 is the head (name, key, layout), the rest the chain of sealed
// records. Every seal is checked against the book's key; every open sheet is
// grown again from its published seed and must settle exactly as sealed.
// Closed sheets show their strokes (public) but not their look: their paper is
// the writer's secret, unless it is your own book and your key is in this tab:
// then every closed sheet is grown again here too. Nothing is uploaded.
export function readBook(text) {
  const nl = text.indexOf('\n');
  const head = JSON.parse(nl < 0 ? text : text.slice(0, nl));
  if (head.book !== 2 || !head.pages) throw new Error(head.book === 1 ? 'That is an old .book, from before Living Ink: it cannot be checked.' : 'That is not a .book file.');
  const { book, name, key, fingerprint, law, ...skeleton } = head;
  const lines = parseLines(nl < 0 ? '' : text.slice(nl + 1));
  const { inks, opened } = readChain(lines);
  const seeds = new Map(); // sheet → published seed
  for (const l of lines) {
    if (l.ink && l.open) seeds.set(l.ink.sheet, l.open.seed);
    else if (typeof l.open === 'string') seeds.set(l.open, l.seed);
  }
  return { name: name ?? 'someone', key, fingerprint, law, skeleton, inks, opened, seeds, page: { width: 1000, height: 1400 } };
}

export default function BookViewer() {
  const [book, setBook] = useState(null);
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [closed, setClosed] = useState(null); // { ok, bad: [id] } for your own book's closed sheets
  const { user } = useAuth();
  const key = useKey(user);
  const mine = !!(book && key && key.publicKey === book.key);
  const seedOf = useCallback((sheet) => book?.seeds.get(sheet) ?? (mine ? b64url(K.sheetSeed(key.sk, sheet)) : null), [book, mine, key]);

  useEffect(() => {
    setClosed(null);
    if (!mine) return undefined;
    let alive = true;
    const lines = [...book.inks.values()].filter((l) => l.ink.kind === 'ink' && !book.seeds.has(l.ink.sheet));
    Promise.all(lines.map((l) => regrowHere(l.ink, seedOf(l.ink.sheet)).then((ok) => [l.id, ok])))
      .then((rs) => { if (alive) setClosed({ ok: rs.filter(([, ok]) => ok).length, bad: rs.filter(([, ok]) => !ok).map(([id]) => id) }); });
    return () => { alive = false; };
  }, [book, mine, seedOf]);

  async function open(file) {
    if (!file) return;
    setError(null);
    setReport(null);
    try {
      const text = await file.text();
      setBook(readBook(text));
      setPage(null);
      setReport('checking');
      setReport(await verifyBookHere(text));
    } catch (err) {
      setError(err.message);
    }
  }

  const sceneSrc = useCallback((item, line) => {
    const seed = seedOf(line.ink.sheet);
    return seed ? sceneOf({ line, seed }) : Promise.resolve(null);
  }, [seedOf]);
  const lookSrc = useCallback((item, line) => {
    const seed = seedOf(line.ink.sheet);
    return seed ? growLook(line.ink, seed, item.scale, viewAt(line)) : null;
  }, [seedOf]);

  const sig = book?.skeleton.signature && book.inks.get(book.skeleton.signature);
  const sigSeed = sig && book.seeds.get(sig.ink.sheet);
  const done = report && report !== 'checking';
  const sealed = done ? report.results.filter((r) => r.sealed).length : 0;
  const regrown = done ? report.results.filter((r) => r.regrown === true).length : 0;

  return (
    <div className="book-viewer">
      <h1>
        {book && sig ? <span className="username signed book-signature"><InkItem src={sigSeed ? growLook(sig.ink, sigSeed, 64, viewAt(sig)) : null} body={sig.ink} /></span> : null}
        {book ? ` @${book.name}` : 'Open a book'}
      </h1>
      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); open(e.dataTransfer.files?.[0]); }}
      >
        <input type="file" accept=".book,text/plain" onChange={(e) => open(e.target.files?.[0])} />
        <span>{book ? 'Open a different .book' : 'Choose or drop a .book file'}</span>
      </label>
      {error && <p className="error">{error}</p>}
      {book && (
        <div className="stack card book-check">
          <p className="meta">key {book.fingerprint ?? '?'} · law {book.law ?? '?'}</p>
          {report === 'checking' && <p className="muted">Checking every seal and regrowing the open sheets…</p>}
          {done && (report.ok
            ? <p><strong>The book checks.</strong> {sealed} sealed record{sealed === 1 ? '' : 's'}, all by this key; {regrown} open sheet{regrown === 1 ? '' : 's'} grown again here, exactly as sealed.</p>
            : (
              <>
                <p className="error"><strong>The book does not check.</strong></p>
                <ul>
                  {report.problems.map((p) => <li key={p}>{p}</li>)}
                  {report.results.filter((r) => r.error || r.regrown === false).map((r) => <li key={r.id}>{r.id}: {r.error ?? 'does not grow to its record'}</li>)}
                </ul>
              </>
            ))}
          {mine && !closed && <p className="muted">Your key is in this tab: growing your closed sheets again too…</p>}
          {closed && (closed.bad.length
            ? <p className="error">Closed sheets that do not grow as sealed: {closed.bad.join(', ')}</p>
            : <p>And with your key: {closed.ok} closed sheet{closed.ok === 1 ? '' : 's'} grown again here, exactly as sealed.</p>)}
        </div>
      )}
      {book && <Journal key={book.name + book.skeleton.version} name={book.name} fromFile={book} pageId={page} onPage={setPage} lookSrc={lookSrc} sceneSrc={sceneSrc} />}
    </div>
  );
}
