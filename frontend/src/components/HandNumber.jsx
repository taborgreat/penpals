import { HAND } from '../hand/registry.js';
import { HandDrawn } from './Hand.jsx';

// A number written out from the drawn digits 0-9 (digit-0 … digit-9 in the
// studio), so ten drawings cover every count on the site. Until all of its
// digits are drawn it stays typed, so a number is never half one and half the other.
export default function HandNumber({ value }) {
  const text = String(value);
  const digits = [...text].map((d) => HAND[`digit-${d}`]);
  if (!/^\d+$/.test(text) || digits.some((a) => !a)) return text;
  return (
    <span className="hand-number" role="img" aria-label={text}>
      {digits.map((asset, i) => (
        <HandDrawn key={i} asset={asset} label={text[i]} />
      ))}
    </span>
  );
}
