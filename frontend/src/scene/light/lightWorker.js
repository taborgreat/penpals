// The light worker: the room's light settled off the main thread (light-waves
// §4, "When"; settle.js). The integration fetches public/room/room.json and
// room.ff, sends them once, then asks again whenever the sun moves, a candle
// sinks, or a patch's matter changes; candle flicker it combines itself
// (settle.js combine) from the parts this returns.
// Messages in:
//   { type: 'room', json, bin }                                  the baked room
//   { type: 'settle', id, sun?: { az, el }, present?, candles?: [{ litMs, which, generation? }],
//     page?: reflectance (N), curves?: { [patch]: reflectance }, seeds? }
// Out, by id:
//   { id, day, flames: [...], scales: [...], passes, ms }   parts as Float32Array n × N, handed over;
//     scales: each flame's strength now (candleState intensity), to start combining from
//   { id, error }
import { decodeRoom } from './room.js';
import { roomAbsorption, settleParts } from './settle.js';
import { candleState, flameLight } from './candle.js';

let room = null;

// Each candle's flame at unit strength (flicker scales it), standing where its
// burn has brought it down to.
export function flamesOf(room, candles = []) {
  return candles.map(({ litMs = 0, which = 0, generation = 0 }) => {
    const spot = room.candles[which] ?? room.candles[0];
    const s = candleState(litMs, 0, { which, generation });
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
    const parts = settleParts(room, absorption, { sun: msg.sun ?? null, flames, present: msg.present ?? true });
    return {
      id: msg.id,
      day: Float32Array.from(parts.day),
      flames: parts.flames.map((f) => Float32Array.from(f)),
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
    const transfer = out.day ? [out.day.buffer, ...out.flames.map((f) => f.buffer)] : [];
    globalThis.postMessage(out, transfer);
  };
}
