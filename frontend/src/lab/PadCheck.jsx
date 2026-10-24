import { useEffect, useMemo, useState } from 'react';
import { keys as K } from 'penpals-law';
import Pad from '../components/Pad.jsx';
import { useLiveInk } from '../ink/useLiveInk.js';
import { engineReady } from '../scene/engine.js';

// /pad-check (dev only, and in e2e/perf.mjs's build): a law 2 pad on a paper of
// its own, signed out, for writing in the scene and timing it. ?hour= sets the
// clock (night: the candles), ?gpu=webgl2 skips WebGPU.
const PAD = { width: 1000, height: 470 };
const PAPER = K.paperKeyOf(new Uint8Array(64).fill(7));
const FAMILY = { grain: 8, weight: 8, tooth: 0 };

export default function PadCheck() {
  const params = new URLSearchParams(window.location.search);
  const chosen = useMemo(() => engineReady(params.get('gpu')), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [gpu, setGpu] = useState(null);
  useEffect(() => { chosen.then(setGpu); }, [chosen]);
  useMemo(() => {
    if (!params.get('hour')) return;
    const h = Number(params.get('hour'));
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...a) {
        if (a.length) super(...a);
        else {
          super();
          this.setHours(h, 0, 0, 0);
        }
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useLiveInk({ paperKey: PAPER, family: FAMILY, size: PAD }, 'pad-check');
  return (
    <div className="stack">
      <h1>Pad check</h1>
      <p className="muted" data-gpu={gpu ?? ''}>A law 2 pad on its own paper: write, and time it.</p>
      {ink && <Pad ink={ink} size={PAD} hint="Write anything." />}
    </div>
  );
}
