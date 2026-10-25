// Ruled paper (one-world.md: lines and their height, in the new-paper panel): a page's lines, printed
// in a stationer's pale blue a hairline wide, the first a line's height below the top. The page keeps
// how far apart they are (its book op 'rule'); the scene prints them as ink the paper drinks light by,
// the page drawn flat as the same lines.
import { rgbOf } from '../ink/pens.js';

export const RULED = Object.freeze({ color: '#9db8d9', width: 1.5 }); // the printing's colour; its width, page px
// the heights a page may be ruled at, mm (wide ruled, college ruled, narrow)
export const RULE_MM = Object.freeze([9, 8, 7, 6]);
export const LETTER_MM = 215.9; // a page's width (a letter), mm
// → page px apart, for a page `width` px across
export const ruleSpacing = (mm, width) => Math.round((mm * width) / LETTER_MM);
export const ruleMm = (spacing, width) => (spacing ? Math.round((spacing * LETTER_MM) / width) : 0);
// the printing's absorbance by the ink's three channels (as a pen's colour is: ln(255 / c))
export const RULE_ABS = Object.freeze(rgbOf(RULED.color).map((c) => Math.log(255 / c)));
// the page drawn flat: the lines as a CSS background (spacing page px, k: CSS px a page px)
export const ruleCss = (spacing, k) =>
  spacing
    ? `repeating-linear-gradient(to bottom, transparent 0, transparent ${(spacing - RULED.width) * k}px, ${RULED.color} ${(spacing - RULED.width) * k}px, ${RULED.color} ${spacing * k}px)`
    : 'none';
