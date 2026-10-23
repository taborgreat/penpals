import { useState } from 'react';
import Journal from '../book/Journal.jsx';
import { inkAsset, parseLines } from '../book/ink.js';
import { HandDrawn } from '../components/Hand.jsx';
import { colorVars } from '../hand/colors.js';

// Open a downloaded .book (books.md A7) and read it here, without the site's
// data: line 1 is the skeleton (pages, layout, signature), the rest is the
// ink, one stroke collection per line. Shown exactly as on the site, with
// playback; nothing is uploaded.
export function readBook(text) {
  const nl = text.indexOf('\n');
  const head = JSON.parse(nl < 0 ? text : text.slice(0, nl));
  if (head.book !== 1 || !head.pages) throw new Error('That is not a .book file.');
  const { book, name, ...skeleton } = head;
  const inks = new Map(parseLines(nl < 0 ? '' : text.slice(nl + 1)).map((r) => [r.id, r]));
  return { name: name ?? 'someone', skeleton, inks, page: { width: 1000, height: 1400 } };
}

export default function BookViewer() {
  const [book, setBook] = useState(null);
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);

  async function open(file) {
    if (!file) return;
    setError(null);
    try {
      setBook(readBook(await file.text()));
      setPage(null);
    } catch (err) {
      setError(err.message);
    }
  }

  const sig = book?.skeleton.signature && book.inks.get(book.skeleton.signature);

  return (
    <div className="book-viewer">
      <h1>{book ? (sig ? <span className="username signed" style={colorVars(book.skeleton.signatureColor)}><HandDrawn asset={inkAsset(sig)} label={`@${book.name}`} fit={1.4} /></span> : `@${book.name}`) : 'Open a book'}</h1>
      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); open(e.dataTransfer.files?.[0]); }}
      >
        <input type="file" accept=".book,text/plain" onChange={(e) => open(e.target.files?.[0])} />
        <span>{book ? 'Open a different .book' : 'Choose or drop a .book file'}</span>
      </label>
      {error && <p className="error">{error}</p>}
      {book && <Journal key={book.name + book.skeleton.version} name={book.name} fromFile={book} pageId={page} onPage={setPage} />}
    </div>
  );
}
