// The light worker: the room's light settled off the main thread (light-waves
// §4, "When"; settle.js). The integration fetches public/room/room.json and
// room.ff, sends them once, then asks again whenever the sun moves, a candle
// sinks, or a patch's matter changes; candle flicker it combines itself
// (settle.js combine) from the parts this returns.
// Messages in:
//   { type: 'room', json, bin }                                  the baked room
//   { type: 'settle', id, sun?: { az, el, cloud? }, present?, even?, candles?: [{ which, at?, height, fed, burntS, spent }],
//     page?: reflectance (N), curves?: { [patch]: reflectance }, seeds? }
// Out, by id:
//   { id, day, flames: [...], scales: [...], passes, ms }   parts as Float32Array n × N, handed over;
//     scales: each flame's strength now (candleState intensity), to start combining from;
//     with direct: true, also sunDirect and flameDirect: [...] (n × N each): what each patch
//     takes straight from the sun's disk and from each flame (unit strength), so the drawing
//     can put those back per pixel, sharp, over the rest of the settled light; with even: true, also
//     even: the room under a sky of unit radiance every way (a flash in the clouds is that, scaled)
//   { id, error }
import { decodeRoom } from './room.js';
import { roomAbsorption, settleParts, daySources } from './settle.js';
import { directLight } from './direct.js';
import { candleState, flameLight } from './candle.js';

let room = null;

// Each candle's flame at unit strength (flicker scales it), standing where its
// burning has brought it down to (law/candle.js, as candle.js reads it).
export function flamesOf(room, candles = []) {
  return candles.map(({ which = 0, at = null, ...state }) => {
    const spot = at ?? room.candles[which] ?? room.candles[0]; // (carried: where it stands now)
    const s = candleState({ ...state, fed: 1 }, 0, { which });
    const unit = { ...s, intensity: s.spent ? 0 : 1 };
    return { pos: [spot[0], spot[1], spot[2] + s.flameAt], intensity: flameLight(unit), scale: s.intensity };
  });
}

export function handle(msg) {
  if (msg.type === 'room') {
    room = decodeRoom(msg.json, msg.bin);
    return { type: 'room', n: room.patches.length, m: room.openings.length, page: room.page };
  }
  if (msg.type === 'settle') {
    if (!room) return { id: msg.id, error: 'no room yet' };
    const t0 = performance.now();
    const flames = flamesOf(room, msg.candles ?? []);
    const absorption = roomAbsorption(room, { page: msg.page, curves: msg.curves, seeds: msg.seeds });
    const parts = settleParts(room, absorption, { sun: msg.sun ?? null, flames, present: msg.present ?? true, even: !!msg.even });
    const direct = {};
    if (msg.direct) {
      const day = msg.sun && msg.sun.el > -6 && (msg.present ?? true) ? daySources(msg.sun) : null;
      direct.sunDirect = day ? Float32Array.from(directLight(room, { sunDir: day.sunDir, sun: day.sun, glass: day.glass, opens: day.opens })) : new Float32Array(parts.day.length);
      direct.flameDirect = flames.map((f) => Float32Array.from(directLight(room, { flames: [f] })));
    }
    return {
      id: msg.id,
      day: Float32Array.from(parts.day),
      flames: parts.flames.map((f) => Float32Array.from(f)),
      ...(parts.even ? { even: Float32Array.from(parts.even) } : {}),
      ...direct,
      scales: flames.map((f) => f.scale),
      passes: parts.passes,
      ms: performance.now() - t0,
    };
  }
  return { id: msg.id, error: `unknown message ${msg.type}` };
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = ({ data }) => {
    let out;
    try {
      out = handle(data);
    } catch (err) {
      out = { id: data?.id, error: String(err?.message ?? err) };
    }
    const transfer = out.day ? [out.day.buffer, ...out.flames.map((f) => f.buffer), ...(out.sunDirect ? [out.sunDirect.buffer, ...out.flameDirect.map((f) => f.buffer)] : [])] : [];
    globalThis.postMessage(out, transfer);
  };
}
