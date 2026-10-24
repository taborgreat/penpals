import { useState } from 'react';
import { getWriteSpeed, setWriteSpeed } from '../hand/player.js';
import Hand from './Hand.jsx';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// How fast the site's handwritten words write themselves, on load and on hover.
export default function WriteSpeed() {
  const [speed, setSpeed] = useState(getWriteSpeed);
  const index = Math.max(
    0,
    SPEEDS.findIndex((s) => s >= speed),
  );
  const pct = `${(index / (SPEEDS.length - 1)) * 100}%`;
  return (
    <label className="field write-speed" title="How fast the handwriting writes itself, on load and on hover">
      <span>
        <Hand>Writing speed</Hand>
      </span>
      <span className="end">slow</span>
      <input
        type="range"
        min="0"
        max={SPEEDS.length - 1}
        step="1"
        value={index}
        style={{ '--pct': pct }}
        aria-valuetext={`${SPEEDS[index]} times`}
        onChange={(e) => {
          const v = SPEEDS[Number(e.target.value)];
          setWriteSpeed(v);
          setSpeed(v);
        }}
      />
      <span className="end">fast</span>
    </label>
  );
}
