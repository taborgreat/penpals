// The server's clock for anything that ages: a look is drawn at the time since
// its record was made, and views count once per viewer per day. Tests move it
// forward (setClockOffset) instead of waiting days.
let offset = 0;
export const now = () => Date.now() + offset;
export const setClockOffset = (ms) => {
  offset = ms;
};
