import { v2 } from 'penpals-law';
import { SIGNATURE_COLORS } from '../hand/colors.js';

// The ink well: the pen's colours, any colour, and the two inks of law 2 that
// are not just a colour. Both are chosen by the pen's colour, so they are
// sealed with the strokes like any other ink:
//   oak gall     pale as it goes down, darkening in the air over days (fastest
//                in hairlines, deepest in pools); mixed with another colour, only
//                the gall darkens
//   water brush  water and no pigment: on this sheet it wets dry ink again, so it
//                bleeds and moves; worked hard while wet, the paper can tear

const hexOf = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const OAK_GALL_HEX = hexOf(v2.OAK_GALL);
export const WATER_HEX = hexOf(v2.WATER);
export const INKS = SIGNATURE_COLORS.map((c) => ({ id: c.id, name: c.name, hex: c.light }));

export default function InkWell({ value, onChange, water = true }) {
  const v = value?.toLowerCase();
  return (
    <span className="swatches small ink-well" role="group" aria-label="Ink">
      {INKS.map((c) => (
        <button key={c.id} type="button" title={c.name} aria-label={c.name} aria-pressed={v === c.hex} style={{ '--sig-l': c.hex, '--sig-d': c.hex }} onClick={() => onChange(c.hex)} />
      ))}
      <button
        type="button"
        className="gall"
        title="Oak gall: pale as you write, it darkens in the air over days"
        aria-label="Oak gall"
        aria-pressed={v === OAK_GALL_HEX}
        onClick={() => onChange(OAK_GALL_HEX)}
      />
      {water && (
        <button
          type="button"
          className="water"
          title="Water brush: wets dry ink on this sheet so it bleeds and moves (worked hard, wet paper tears)"
          aria-label="Water brush"
          aria-pressed={v === WATER_HEX}
          onClick={() => onChange(WATER_HEX)}
        />
      )}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title="Any colour (pure white is the water brush)" />
    </span>
  );
}
