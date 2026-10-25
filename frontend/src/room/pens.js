// The pens on the table (rooms.md §3c; law/room.js PENS) as the panel for the pen in hand and the
// writers take them (one-world.md): each its own matter, its settings its facts on the room's chain.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { room as R } from 'penpals-law';
import { PEN_SIZES, BROAD_SIZES, FLEX_PRESETS } from '../ink/nibs.js';
import { lawPen, lineWidthPx, FLOW_DEFAULT, SPATTER_DEFAULT } from '../ink/pens.js';
import { SIGNATURE_COLORS } from '../hand/colors.js';

const NIB_NAMES = { pen: 'Pen', flex: 'Flex nib', broad: 'Broad nib' };
// A dip pen's reservoir (law 3: rooms.md §3c): this many well levels (Tabor's to set).
export const DIP_WELL = 2;

// The pens on the table (law/room.js PENS): each its own matter, its settings its facts (one-world.md,
// the panel for the pen in hand): what its set acts on the room's chain last made it, else these, as
// its nib was made. Whole numbers, as an act carries them (a flex nib's hairline in tenths of a px).
const INK = SIGNATURE_COLORS[0].light.toLowerCase();
export const PEN_MADE = Object.freeze({
  pen: { size: 'medium', flow: FLOW_DEFAULT, spatter: SPATTER_DEFAULT.pen, color: INK, dip: false },
  flex: {
    hairline: Math.round(FLEX_PRESETS.copperplate.hairline * 10),
    maxWidth: FLEX_PRESETS.copperplate.maxWidth,
    swell: FLEX_PRESETS.copperplate.swell,
    slant: FLEX_PRESETS.copperplate.slant,
    flow: FLOW_DEFAULT,
    spatter: SPATTER_DEFAULT.flex,
    color: INK,
    dip: false,
  },
  broad: { size: '2.4 mm', angle: 35, flow: FLOW_DEFAULT, spatter: SPATTER_DEFAULT.broad, color: INK, dip: false },
});

// The pen `id` as its facts `s` have it, as the writers take a pen (the same shape usePen gives):
// change(patch) sets it (an act); dips: how often it has been dipped (a dip is its next pen act's well).
export function penFrom(id, s, change = () => {}, dips = 0) {
  const nib = R.NIB_OF[id];
  const flex = nib === 'flex' ? { hairline: s.hairline / 10, maxWidth: s.maxWidth, swell: s.swell, slant: s.slant } : { ...FLEX_PRESETS.copperplate };
  const settings = () =>
    nib === 'pen' ? { nib, size: PEN_SIZES[s.size] ?? PEN_SIZES.medium } : nib === 'broad' ? { nib, size: BROAD_SIZES[s.size] ?? BROAD_SIZES['2.4 mm'], angle: s.angle } : { nib, ...flex };
  const spatterFor = (law) => (law >= 2 ? s.spatter : undefined);
  const dipOf = (law) => (s.dip && law >= 3 ? { well: DIP_WELL, n: dips } : null);
  const lp = (law) => lawPen(settings(), s.color, s.flow, spatterFor(law), dipOf(law));
  return {
    id,
    name: NIB_NAMES[nib],
    nib,
    fixedNib: true, // (which pen you hold is its nib)
    penSize: s.size,
    broadSize: s.size,
    flex,
    angle: s.angle ?? 0,
    flow: s.flow,
    spatterSet: s.spatter,
    color: s.color,
    dip: s.dip,
    set: {
      penSize: (v) => change({ size: v }),
      broadSize: (v) => change({ size: v }),
      angle: (v) => change({ angle: Math.round(v) }),
      flow: (v) => change({ flow: Math.round(v) }),
      spatter: (v) => change({ spatter: Math.round(v) }),
      color: (v) => change({ color: v.toLowerCase() }),
      dip: (v) => change({ dip: !!v }),
      flex: (f) => {
        const next = typeof f === 'function' ? f(flex) : f;
        change({ hairline: Math.round(next.hairline * 10), maxWidth: Math.round(next.maxWidth), swell: Math.round(next.swell), slant: Math.round(next.slant) });
      },
    },
    settings,
    spatterFor,
    lawPen: lp,
    flexOf: (law) => (nib === 'flex' ? { slant: flex.slant, swell: flex.swell, hold: law >= 2 } : null),
    widthAt: (law) => (p) => lineWidthPx(lp(law), p),
  };
}

// The pens of a room, from its things (room/presence.js useThings: each pen's last set), and the one in
// the hand. Each change in the panel is the pen's next look at once, and an act on it a moment later (the
// hand still on the control; the room tells everyone). act(a): room/presence.js roomAct, or null (none).
// → { held, hold(id), pen (the one in the hand), of(id), dip() (the pen in the hand into the jar) }
export function usePens({ things = {}, act = null } = {}) {
  const [held, hold] = useState('pen');
  const [mine, setMine] = useState({}); // what this hand set, until the chain has it
  const [dips, setDips] = useState(0);
  const timers = useRef({});
  const factsOf = useCallback((id) => mine[id] ?? things[id]?.set ?? PEN_MADE[R.NIB_OF[id]], [mine, things]);
  useEffect(
    () =>
      setMine((m) => {
        const done = Object.keys(m).filter((id) => JSON.stringify(things[id]?.set) === JSON.stringify(m[id]));
        if (!done.length) return m;
        const out = { ...m };
        for (const id of done) delete out[id];
        return out;
      }),
    [things],
  );
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const actRef = useRef(act);
  actRef.current = act;
  const pens = useMemo(() => {
    const change = (id) => (patch) => {
      const next = { ...factsOf(id), ...patch };
      setMine((m) => ({ ...m, [id]: next }));
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => actRef.current?.({ act: 'set', thing: id, set: next }), 400);
    };
    return Object.fromEntries(R.PENS.map((id) => [id, penFrom(id, factsOf(id), change(id), dips)]));
  }, [factsOf, dips]);
  return useMemo(() => ({ held, hold, pen: pens[held], of: (id) => pens[id], dip: () => setDips((d) => d + 1) }), [held, pens]);
}
