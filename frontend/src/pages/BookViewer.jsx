import { useMemo, useState } from 'react';
import { parseLines } from '../book/ink.js';
import InkItem from '../book/InkItem.jsx';
import PaperLook from '../components/PaperLook.jsx';
import { usePaperFields } from '../room/papers.js';
import { verifyBookHere, growLook, viewAt } from '../ink/grown.js';

// Open a downloaded .book (books.md A7, keys.md) and check it here, with no server: line 1 is the head (name,
// key), the rest the chain of sealed records: their signature, and everything they made of paper (law/paper.js:
// a paper or a house's surface born, then each act on it). Every seal is checked; every paper is replayed and
// grown again from its own chain, and shown as it grew. Nothing is uploaded.
export function readBook(text) {
  const nl = text.indexOf('\n');
  const head = JSON.parse(nl < 0 ? text : text.slice(0, nl));
  if (head.book !== 3) throw new Error(head.book === 1 || head.book === 2 ? 'That .book was made before paper was matter: it cannot be read here.' : 'That is not a .book file.');
  const lines = parseLines(nl < 0 ? '' : text.slice(nl + 1));
  // their signature: the latest they signed (open: its seed beside it)
  const sig = lines.findLast((l) => l.ink?.use === 'signature') ?? null;
  // its papers, each as anyone sees it: its birth, then its stamped acts in its order
  const papers = new Map();
  for (const l of lines) {
    if (l.paper) papers.set(l.paper.birth.paper, { paper: l.paper.birth.paper, birth: l.paper.birth, open: l.paper.open, born: Date.parse(l.made), lines: [] });
    else if (typeof l.on === 'string') papers.get(l.on)?.lines.push({ n: l.n, at: l.at, act: l.act, seal: l.seal });
  }
  return { name: head.name ?? 'someone', key: head.key, fingerprint: head.fingerprint, law: head.law, sig, papers: [...papers.values()] };
}

export default function BookViewer() {
  const [book, setBook] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  async function open(file) {
    if (!file) return;
    setError(null);
    setReport(null);
    try {
      const text = await file.text();
      setBook(readBook(text));
      setReport('checking');
      setReport(await verifyBookHere(text));
    } catch (err) {
      setError(err.message);
    }
  }

  const views = useMemo(() => book?.papers ?? [], [book]);
  const fields = usePaperFields(views);
  const sig = book?.sig;
  const done = report && report !== 'checking';
  const sealed = done ? report.results.filter((r) => r.sealed).length : 0;
  const regrown = done ? report.results.filter((r) => r.regrown === true).length : 0;

  return (
    <div className="book-viewer">
      <h1>
        {sig ? (
          <span className="username signed book-signature">
            <InkItem src={sig.open ? growLook(sig.ink, sig.open.seed, 64, viewAt(sig)) : null} body={sig.ink} />
          </span>
        ) : null}
        {book ? ` @${book.name}` : 'Open a book'}
      </h1>
      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          open(e.dataTransfer.files?.[0]);
        }}
      >
        <input type="file" accept=".book,text/plain" onChange={(e) => open(e.target.files?.[0])} />
        <span>{book ? 'Open a different .book' : 'Choose or drop a .book file'}</span>
      </label>
      {error && <p className="error">{error}</p>}
      {book && (
        <div className="stack card book-check">
          <p className="meta">
            key {book.fingerprint ?? '?'} · law {book.law ?? '?'}
          </p>
          {report === 'checking' && <p className="muted">Checking every seal, replaying every paper and growing it again…</p>}
          {done &&
            (report.ok ? (
              <p>
                <strong>The book checks.</strong> {sealed} sealed record{sealed === 1 ? '' : 's'}, all by this key; {regrown} grown again here, exactly as sealed.
              </p>
            ) : (
              <>
                <p className="error">
                  <strong>The book does not check.</strong>
                </p>
                <ul>
                  {report.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {report.results
                    .filter((r) => r.error || r.regrown === false)
                    .map((r) => (
                      <li key={r.id}>
                        {r.id}: {r.error ?? 'does not grow to its record'}
                      </li>
                    ))}
                </ul>
              </>
            ))}
        </div>
      )}
      {book && views.length > 0 && (
        <div className="book-papers">
          {views.map((v) => (
            <figure key={v.paper} className="book-paper" data-paper={v.paper}>
              <PaperLook field={fields.get(v.paper)?.field ?? null} size={v.birth.size} width={260} />
              <figcaption className="meta">
                {v.birth.kind === 'surface' ? `the ${v.birth.surface.replace('-', ' ')}, ` : ''}
                {new Date(v.born).toLocaleDateString()}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
