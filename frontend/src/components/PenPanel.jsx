import { useCallback, useMemo, useState } from 'react';
import { NIBS, PEN_SIZES, BROAD_SIZES, FLEX_PRESETS } from '../ink/nibs.js';
import { lawPen, lineWidthPx, FLOW_DEFAULT, SPATTER_DEFAULT } from '../ink/pens.js';
import { SIGNATURE_COLORS } from '../hand/colors.js';
import InkWell from '../ink/InkWell.jsx';

// The pen in the hand (one-world.md, the panel; rooms.md §3c): what the write
// page's toolbar held (nib, size or preset, flow, spatter, the nib's own
// adjustments, the ink), now the panel for the pen you hold. Every stroke it
// writes carries them: they are recorded with the ink.
const FLEX_FIELDS = ['hairline', 'maxWidth', 'swell', 'slant'];
const NIB_NAMES = { pen: 'Pen', flex: 'Flex nib', broad: 'Broad nib' };

export function usePen() {
  const [nib, setNib] = useState('flex');
  const [penSize, setPenSize] = useState('medium');
  const [flex, setFlex] = useState({ ...FLEX_PRESETS.copperplate });
  const [broadSize, setBroadSize] = useState('2.4 mm');
  const [angle, setAngle] = useState(35);
  const [flow, setFlow] = useState(FLOW_DEFAULT);
  const [spatterSet, setSpatter] = useState(null); // null: the nib's own
  const [color, setColor] = useState(SIGNATURE_COLORS[0].light);
  const settings = useCallback(() => {
    if (nib === 'pen') return { nib, size: PEN_SIZES[penSize] };
    if (nib === 'broad') return { nib, size: BROAD_SIZES[broadSize], angle };
    return { nib, hairline: flex.hairline, maxWidth: flex.maxWidth, swell: flex.swell, slant: flex.slant };
  }, [nib, penSize, broadSize, angle, flex]);
  const spatterFor = useCallback((law) => (law >= 2 ? (spatterSet ?? SPATTER_DEFAULT[nib]) : undefined), [spatterSet, nib]);
  return useMemo(
    () => ({
      nib,
      penSize,
      flex,
      broadSize,
      angle,
      flow,
      spatterSet,
      color,
      set: { nib: setNib, penSize: setPenSize, flex: setFlex, broadSize: setBroadSize, angle: setAngle, flow: setFlow, spatter: setSpatter, color: setColor },
      settings,
      spatterFor,
      // the law's pen, for a sheet under law `law`
      lawPen: (law) => lawPen(settings(), color, flow, spatterFor(law)),
      // the flex nib under a mouse or finger takes its thick and thin from the slant (ink/capture.js)
      flexOf: (law) => (nib === 'flex' ? { slant: flex.slant, swell: flex.swell, hold: law >= 2 } : null),
      widthAt: (law) => (p) => lineWidthPx(lawPen(settings(), color, flow, spatterFor(law)), p),
    }),
    [nib, penSize, flex, broadSize, angle, flow, spatterSet, color, settings, spatterFor],
  );
}

// The panel's form for the pen in hand: each change is the pen's next strokes.
export default function PenPanel({ pen, law = 2, children = null }) {
  const preset = Object.keys(FLEX_PRESETS).find((k) => FLEX_FIELDS.every((f) => FLEX_PRESETS[k][f] === pen.flex[f])) ?? 'custom';
  const num = (fn) => (e) => fn(Number(e.target.value));
  const flexField = (field) => (e) => pen.set.flex((f) => ({ ...f, [field]: Number(e.target.value) }));
  const spatter = pen.spatterFor(law);
  return (
    <div className="stack pen-panel">
      <div className="nib-picker" role="group" aria-label="Nib">
        {Object.keys(NIBS).map((id) => (
          <button key={id} type="button" aria-pressed={pen.nib === id} title={NIBS[id].name} onClick={() => pen.set.nib(id)}>
            {NIB_NAMES[id] ?? id}
          </button>
        ))}
      </div>
      {pen.nib === 'pen' && (
        <label className="field">
          <span>Size</span>
          <select value={pen.penSize} onChange={(e) => pen.set.penSize(e.target.value)}>
            {Object.keys(PEN_SIZES).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      {pen.nib === 'broad' && (
        <>
          <label className="field">
            <span>Size</span>
            <select value={pen.broadSize} onChange={(e) => pen.set.broadSize(e.target.value)}>
              {Object.keys(BROAD_SIZES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nib angle</span>
            <input type="range" min="0" max="175" step="5" value={pen.angle} onChange={num(pen.set.angle)} /> <span className="meta">{pen.angle}°</span>
          </label>
        </>
      )}
      {pen.nib === 'flex' && (
        <>
          <label className="field">
            <span>Preset</span>
            <select value={preset} onChange={(e) => e.target.value !== 'custom' && pen.set.flex({ ...FLEX_PRESETS[e.target.value] })}>
              {Object.entries(FLEX_PRESETS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
              <option value="custom">custom</option>
            </select>
          </label>
          <label className="field">
            <span>Hairline</span>
            <input type="range" min="0.6" max="3" step="0.1" value={pen.flex.hairline} onChange={flexField('hairline')} /> <span className="meta">{pen.flex.hairline.toFixed(1)} px</span>
          </label>
          <label className="field">
            <span>Max width</span>
            <input type="range" min="2" max="30" step="1" value={pen.flex.maxWidth} onChange={flexField('maxWidth')} /> <span className="meta">{pen.flex.maxWidth} px</span>
          </label>
          <label className="field">
            <span>Slant</span>
            <input type="range" min="40" max="90" step="1" value={pen.flex.slant} onChange={flexField('slant')} /> <span className="meta">{pen.flex.slant}°</span>
          </label>
        </>
      )}
      <label className="field">
        <span>Flow</span>
        <input type="range" min="0" max="15" step="1" value={pen.flow} onChange={num(pen.set.flow)} title="How freely the nib gives ink" />
      </label>
      {spatter !== undefined && (
        <label className="field">
          <span>Spatter</span>
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={spatter}
            onChange={num(pen.set.spatter)}
            title="How readily the pen throws ink on fast flicks, hard landings and heavy dwells (0: never)"
          />
        </label>
      )}
      <div className="field">
        <span>Ink</span>
        <InkWell value={pen.color} onChange={pen.set.color} />
      </div>
      {children}
    </div>
  );
}
