// Ruled paper (one-world.md: lines and their height, in the new-paper panel): a paper's lines, ink like
// any other, ruled in a stationer's pale blue a hairline wide, the first a line's height below the top
// (room/papers.js newPaper rules them, stroke by stroke, as its first acts).

export const RULED = Object.freeze({ color: '#9db8d9', width: 1.5 }); // the ruling's colour; its width, page px
// the heights a page may be ruled at, mm (wide ruled, college ruled, narrow)
export const RULE_MM = Object.freeze([9, 8, 7, 6]);
export const LETTER_MM = 215.9; // a page's width (a letter), mm
// → page px apart, for a page `width` px across
export const ruleSpacing = (mm, width) => Math.round((mm * width) / LETTER_MM);
