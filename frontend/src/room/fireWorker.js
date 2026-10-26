// A fire grown off the main thread (law/fire.js kindle): a lit candle lying where it fell, the heat rule over the
// room's matter about it, step after step until nothing in it can catch again. Every screen grows the same fire from
// the same kindling.
// In: { id, kindling ({ t, which, at, way, cd, candles, things, lying }: law/wax.js), ctx (law/fire.js: room/table.js
//   fireContext) }
// Out (a second of it at a time, and when it is over): { id, t (s grown), burning ([[x, y, z]] room m), glow ([[x, y,
// z, K]]: what glows), smoke ([[x, y, z, µg]]: in the room's air's cells), burnt
// ({ [paper]: [{ t, x, y, w, h }] }), left ([[x, y, z, matter, µg]]: char and ash), hottest ({ [owner]: °C }), light
// (J its flames have shone so far), K (their heat), vented ({ heat (J), smoke (g) }: what has risen into the room's
// air so far), box (room m), done }
import { fire as F } from 'penpals-law';

const SECOND = Math.round(1 / F.DT); // steps a second of it

globalThis.onmessage = ({ data }) => {
  const { id, kindling: k, ctx } = data;
  try {
    const fire = F.kindle({ at: k.at, way: k.way, which: k.which, cd: k.cd, candles: k.candles, things: k.things, lying: k.lying, ctx });
    const papers = k.lying.map((p) => p.paper);
    for (;;) {
      fire.step(SECOND);
      const { light, K } = fire.flame();
      globalThis.postMessage({
        id,
        t: fire.t,
        burning: fire.burning(),
        glow: fire.glowing(),
        smoke: fire.smoke(),
        soot: fire.soot(),
        burnt: Object.fromEntries(papers.map((p) => [p, fire.burnt(p)])),
        left: fire.left(),
        hottest: fire.hottest(),
        light,
        K,
        vented: { heat: fire.vented.heat * 1e-9, smoke: fire.vented.smoke * 1e-6 },
        box: fire.box,
        done: fire.done,
      });
      if (fire.done) break;
    }
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message ?? err) });
  }
};
