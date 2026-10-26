// A fire grown off the main thread (law/fire.js kindle): a lit candle lying where it fell, the heat rule about it,
// step after step until nothing in it can catch again. Every screen grows the same fire from the same kindling.
// In: { id, kindling ({ t, which, at, way, cd, lying }), ctx (law/fire.js) }
// Out (a second of it at a time, and when it is over): { id, t (s grown), burning ([[x, y, z]] room m), burnt
// ({ [paper]: [{ t, x, y, w, h }] }), done }
import { fire as F } from 'penpals-law';

const SECOND = Math.round(1 / F.DT); // steps a second of it

globalThis.onmessage = ({ data }) => {
  const { id, kindling, ctx } = data;
  try {
    const fire = F.kindle({ at: kindling.at, way: kindling.way, cd: kindling.cd, lying: kindling.lying, ctx });
    const papers = kindling.lying.map((p) => p.paper);
    for (;;) {
      fire.step(SECOND);
      globalThis.postMessage({ id, t: fire.t, burning: fire.burning(), burnt: Object.fromEntries(papers.map((p) => [p, fire.burnt(p)])), done: fire.done });
      if (fire.done) break;
    }
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message ?? err) });
  }
};
