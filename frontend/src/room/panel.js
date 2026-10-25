// The panel (one-world.md, "The panel"): the world's one box, for what is in
// your hand or in front of you. Pick something up and its panel opens; set it
// down and it closes; pick up another and its panel opens. Every change in it
// is an act on that matter's facts: the panel is only a render of them.
//   signedIn  someone is in (no: sign in or register, wherever you are)
//   mine      the house is yours
//   seated    at the table; atCorner: by the account corner (scene/keys.js cornerOf)
//   holding   what the hand holds: 'book' (pulled down from the shelf) | 'candle' | 'sheet' | 'stamper' | null
//   pen       the pen is in the hand
// → 'sign-in' | 'book' | 'candle' | 'sheet' | 'stamper' | 'pen' | 'account' | 'paper' | null
export function panelFor({ signedIn, mine = false, seated = false, atCorner = false, holding = null, pen = false }) {
  if (holding === 'book') return 'book'; // (anyone may read a book they can see)
  if (!signedIn) return 'sign-in';
  if (holding) return holding;
  if (pen) return 'pen';
  if (mine && atCorner) return 'account';
  if (mine && seated) return 'paper'; // at your table with nothing in hand: new paper
  return null;
}
