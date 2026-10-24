// A sheet being written, saved as a video (WebM) or a GIF. The frames come
// from the law's playback, 1/30 s of film each: made here when this device can
// grow the sheet (your own sheets with your key in this tab, or open ones), or
// by the server for closed sheets you may see (it alone holds their seeds).
// Encoding happens in a worker (ink/filmWorker.js).

async function serverFilm(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Could not get the film (${res.status}).`);
  }
  // deflated on the server; inflated here
  const inflated = res.body.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(inflated).arrayBuffer());
}

// source: { url } (a server film) or { local: { actsBytes, paperKey, family, box } }
export async function exportFilm(source, { format = 'webm', background = '#ffffff', onProgress } = {}) {
  const film = source.url ? await serverFilm(source.url) : null;
  const worker = new Worker(new URL('./filmWorker.js', import.meta.url), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.progress !== undefined) onProgress?.(data.progress);
        else if (data.error) reject(new Error(data.error));
        else resolve({ blob: data.done, format: data.format });
      };
      worker.onerror = (e) => reject(new Error(e.message || 'The film could not be made.'));
      worker.postMessage({ film, local: source.local ?? null, format, background }, film ? [film.buffer] : []);
    });
  } finally {
    worker.terminate();
  }
}
