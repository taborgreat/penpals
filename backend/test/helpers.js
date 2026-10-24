// Test helpers: an app on a temporary data directory, and a client that does
// what a writer's device does (make a key, write with a hand, seal, unlock),
// using the law exactly as the frontend will.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function startApp(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-test-'));
  Object.assign(process.env, { DATA_DIR: dir, RENDER_WORKERS: '0', ...extraEnv });
  const { createApp } = await import('../src/app.js');
  const made = await createApp();
  const server = await new Promise((resolve) => {
    const s = made.app.listen(0, '127.0.0.1', () => resolve(s));
    // The test client runs in this process: a long synchronous step (growing ink,
    // argon2) must not let the server drop a kept-alive socket as it is reused.
    s.keepAliveTimeout = 120_000;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { resetLimits } = await import('../src/limits.js');
  return {
    base,
    dir,
    resetLimits, // every test client is 127.0.0.1: tests that are not about limits start with full buckets
    async close() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await made.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// fetch with a cookie jar and this site's Origin (as a browser on the site would send).
// A restarted server has a new port: pass `cookie` (from cookieHeader()) to keep the session.
export function client(base, { origin = base, cookie: start = '' } = {}) {
  let cookie = start;
  const sent = []; // every request body this client sent (for the privacy canary)
  async function call(method, p, body, headers = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    if (method !== 'GET' && origin) h.origin = origin;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
      sent.push(payload);
    }
    const res = await fetch(base + p, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /penpals_session=([^;]*)/.exec(set);
      if (m) cookie = m[1] ? `penpals_session=${m[1]}` : '';
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.startsWith('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return {
    origin,
    sent,
    get: (p, headers) => call('GET', p, undefined, headers),
    post: (p, b, headers) => call('POST', p, b ?? {}, headers),
    put: (p, b) => call('PUT', p, b ?? {}),
    del: (p) => call('DELETE', p, undefined),
    upload: (p, form) => call('POST', p, form),
    signedIn: () => !!cookie,
    cookieHeader: () => cookie,
    forgetCookie: () => { cookie = ''; },
  };
}
