// The panel (one-world.md, "The panel"): the world's one box, for what is in
// your hand or in front of you. Pick something up and its panel opens; set it
// down and it closes; pick up another and its panel opens. Every change in it
// is an act on that matter's facts: the panel is only a render of them.
//   signedIn  someone is in (no: sign in or register, wherever you are)
//   mine      the house is yours
//   seated    at the table; atTable: standing by it; atCorner: by the account corner (scene/keys.js cornerOf)
//   holding   what the hand holds: 'book' (pulled down from the shelf) | 'candle' | 'stamper' | 'paper' (taken up
//             from where it lay, out of your book or out of your mailbox: law/paper.js) | null
//   pen       the pen is in the hand
//   freePlot  out of doors, standing on a plot no house stands on: [i, j] (law/world.js), or null
// → 'sign-in' | 'book' | 'candle' | 'stamper' | 'paper' | 'pen' | 'account' | 'table' | 'plot' | null
export function panelFor({ signedIn, mine = false, seated = false, atTable = false, atCorner = false, holding = null, pen = false, freePlot = null }) {
  if (holding === 'book') return 'book'; // (anyone may hold a book they can see)
  if (!signedIn) return 'sign-in';
  if (holding) return holding;
  if (pen) return 'pen';
  if (mine && atCorner) return 'account';
  if (mine && (seated || atTable)) return 'table'; // at your own table with nothing in hand: new paper
  if (freePlot) return 'plot'; // a free plot underfoot: your house may stand here (one move act)
  return null;
}
