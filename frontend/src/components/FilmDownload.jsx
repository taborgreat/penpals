import { useState } from 'react';
import { exportFilm } from '../ink/film.js';
import { download } from '../ink/export.js';

// Save a sheet being written: a video (WebM, where this browser can encode
// it) or a GIF, on `background` (GIF can be transparent). `source` is what
// ink/film.js takes: { url } of a server film or { local } to grow it here.
export default function FilmDownload({ source, background = '#ffffff', name = 'penpals' }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  async function save(format, bg = background) {
    setError(null);
    setProgress(0);
    try {
      const { blob, format: made } = await exportFilm(typeof source === 'function' ? source() : source, { format, background: bg, onProgress: setProgress });
      download(blob, `${name}.${made}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <span className="film-download">
      <button type="button" className="quiet" disabled={progress !== null} onClick={() => save('webm')} title="It being written, as a video">
        {progress === null ? 'Video' : `Making it… ${Math.round(progress * 100)}%`}
      </button>
      <button type="button" className="quiet" disabled={progress !== null} onClick={() => save('gif')}>
        GIF
      </button>
      <button type="button" className="quiet" disabled={progress !== null} onClick={() => save('gif', null)} title="A GIF with no background">
        clear GIF
      </button>
      {error && <span className="error"> {error}</span>}
    </span>
  );
}
