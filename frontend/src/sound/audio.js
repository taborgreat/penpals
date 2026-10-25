// The ear's sounds played (world.md Phase 1): Web Audio. A voice is its grain played from where it
// happened, through the head's two ears (HRTF), quieter with distance; the cloud from its mean
// direction; the wash a looped noise, each of its bands as loud as its numbers; a bed (the weather's
// rain, its wind: sound/weather.js) the same, as long as it lasts. With nothing to sound the audio
// sleeps (suspended: no work). Browsers start audio only from a gesture: start() then.
import { BANDS, NB } from './bands.js';
import { noise, shaped } from './grain.js';
import { roomIR } from './room.js';

export function createAudioOut({ volume = 0.5 } = {}) {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const rate = ctx.sampleRate;
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  // the ear's clock (performance.now() s) on the audio's
  const offset = () => performance.now() / 1000 - ctx.currentTime;
  const when = (t) => Math.max(ctx.currentTime, t - offset());
  let wash = null;
  const beds = new Map(); // name → { gains, on }
  let sleepTimer = 0;
  // the room's tail (sound/room.js roomIR): every voice heard in the room sent into it as it was made
  const tail = new ConvolverNode(ctx, { disableNormalization: true });
  tail.connect(master);
  // a looped second of each band's noise, made as a grain's is (a unit of energy in its band): so a
  // gain of √(energy a second) sounds as the grains would → the bands' gains (silent)
  let made = 0; // (each set of loops its own noise)
  const loops = () => {
    const n = made++;
    return BANDS.map((_, b) => {
      const buf = ctx.createBuffer(1, rate, rate);
      shaped(
        buf.getChannelData(0),
        BANDS.map((__, j) => (j === b ? 1 : 0)),
        noise(0x5a5a + 16 * n + b),
        rate,
      );
      const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
      const g = new GainNode(ctx, { gain: 0 });
      src.connect(g).connect(master);
      src.start();
      return g;
    });
  };
  const wake = () => {
    clearTimeout(sleepTimer);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  return {
    rate,
    start: wake,
    head(pose) {
      const L = ctx.listener;
      const [x, y, z] = pose.pos;
      const r = Math.PI / 180;
      const fwd = [Math.sin(pose.yaw * r) * Math.cos(pose.pitch * r), Math.cos(pose.yaw * r) * Math.cos(pose.pitch * r), Math.sin(pose.pitch * r)];
      // (Web Audio's frame: y up; the room's: z up)
      if (L.positionX) {
        L.positionX.value = x;
        L.positionY.value = z;
        L.positionZ.value = -y;
        L.forwardX.value = fwd[0];
        L.forwardY.value = fwd[2];
        L.forwardZ.value = -fwd[1];
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      }
    },
    room(ac) {
      if (!ac) {
        tail.buffer = null;
        return;
      }
      const [l, r] = roomIR(ac, rate);
      const buf = ctx.createBuffer(2, l.length, rate);
      buf.copyToChannel(l, 0);
      buf.copyToChannel(r, 1);
      tail.buffer = buf;
    },
    // (an early reflection is placed by level alone: cheaper than the head's two ears, and heard as such)
    // (tune: matter's sound pulled to the space's key, as a whole: sound/music.js)
    voice(g, t, pos, h, { scale = 1, early = false, wet = false, tune = 1 } = {}) {
      wake();
      const buf = ctx.createBuffer(1, g.length, rate);
      buf.copyToChannel(g, 0);
      const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: tune });
      const pan = new PannerNode(ctx, {
        panningModel: early ? 'equalpower' : 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        rolloffFactor: 1,
        positionX: pos[0],
        positionY: pos[2],
        positionZ: -pos[1],
      });
      const level = scale === 1 ? src : src.connect(new GainNode(ctx, { gain: scale }));
      level.connect(pan).connect(master);
      if (wet && tail.buffer) src.connect(tail);
      src.start(when(t));
    },
    cloud(b, t, { az }) {
      wake();
      const buf = ctx.createBuffer(1, b.length, rate);
      buf.copyToChannel(b, 0);
      const src = new AudioBufferSourceNode(ctx, { buffer: buf });
      const pan = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, Math.sin((az * Math.PI) / 180))) });
      src.connect(pan).connect(master);
      src.start(when(t));
    },
    // a sound that lasts (energy a second, by band), heard all about; null or silence, it fades
    bed(name, bands) {
      const on = !!bands && bands.some((x) => x > 1e-12);
      let b = beds.get(name);
      if (!on) {
        if (b?.on) for (const g of b.gains) g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        if (b) b.on = false;
        return;
      }
      wake();
      if (!b) {
        b = { gains: loops(), on: true };
        beds.set(name, b);
      }
      b.on = true;
      for (let k = 0; k < NB; k++) b.gains[k].gain.setTargetAtTime(Math.sqrt(bands[k]), ctx.currentTime, 0.5);
    },
    wash(stats) {
      if (!stats) {
        if (wash) for (const g of wash.gains) g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        return;
      }
      wake();
      if (!wash) wash = { gains: loops() };
      for (let b = 0; b < NB; b++) wash.gains[b].gain.setTargetAtTime(Math.sqrt(stats.bands[b]), ctx.currentTime, 0.2);
    },
    idle() {
      clearTimeout(sleepTimer);
      if ([...beds.values()].some((b) => b.on)) return; // (a bed still sounds)
      sleepTimer = setTimeout(() => ctx.state === 'running' && ctx.suspend().catch(() => {}), 2000);
    },
  };
}
