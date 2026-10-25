// What every matter carries (outside.md §1.2): the few properties the law reads,
// and nothing else. Shapes, swings and breaks come from these and the law, never
// from a rule of their own. Integers, so every machine reads the same:
//   density   kg/m³ (how hard it falls and how hard it pushes)
//   hardness  1..10 (which of two touching matters gives way when rubbed: the harder takes the softer)
//   strength  N/mm² (how far it bends or pulls before it breaks)
//   friction  ×1000 (how much it resists sliding against another matter)
//   heat      { holds (J/(kg·K)), melts (°C) | null, burns (°C) | null } (the heat rule), and
//             where the law needs them: conducts (mW/(m·K)), fuses (J/kg the melting
//             takes and the setting gives back), releases (J/kg its burning gives)
//   draws     µg/s (a wick: the liquid it lifts to its flame, which the flame burns)
//   pores     ‰ of its volume open (a wick: what it holds of the liquid it lifts)
//   tension   mN/m (a liquid's surface: how high it stands at a dry edge before it runs over)
//   light     its curve in light-waves (its colour: what it refuses to drink)
// Tabor's to set: these are ordinary values for each matter, not tuned.

export const MATTER = Object.freeze({
  paper: { density: 800, hardness: 1, strength: 30, friction: 500, heat: { holds: 1340, melts: null, burns: 233 }, light: 'paper' },
  wax: { density: 900, hardness: 1, strength: 2, friction: 300, heat: { holds: 2140, melts: 60, burns: 200, conducts: 250, fuses: 200000, releases: 44000000 }, tension: 30, light: 'wax' }, // paraffin
  wick: { density: 1500, hardness: 1, strength: 300, friction: 500, heat: { holds: 1300, melts: null, burns: 250 }, draws: 2000, pores: 500, light: 'paper' }, // braided cotton
  oak: { density: 750, hardness: 3, strength: 90, friction: 450, heat: { holds: 2000, melts: null, burns: 300 }, light: 'table' },
  bark: { density: 550, hardness: 2, strength: 20, friction: 650, heat: { holds: 1500, melts: null, burns: 280 }, light: 'table' },
  leaf: { density: 600, hardness: 1, strength: 5, friction: 400, heat: { holds: 3500, melts: null, burns: 250 }, light: 'table' },
  fiber: { density: 1300, hardness: 1, strength: 400, friction: 500, heat: { holds: 1300, melts: null, burns: 250 }, light: 'paper' }, // a string's (bark fiber, linen)
  stone: { density: 2700, hardness: 6, strength: 15, friction: 600, heat: { holds: 790, melts: null, burns: null }, light: 'plaster' }, // granite: hard, brittle in pulling
  chalk: { density: 2100, hardness: 2, strength: 3, friction: 550, heat: { holds: 900, melts: null, burns: null }, light: 'plaster' }, // a soft stone
  brass: { density: 8500, hardness: 4, strength: 350, friction: 350, heat: { holds: 380, melts: 930, burns: null }, light: 'brass' },
  glass: { density: 2500, hardness: 6, strength: 40, friction: 900, heat: { holds: 840, melts: 1400, burns: null }, light: 'glass' },
  plaster: { density: 1100, hardness: 2, strength: 2, friction: 600, heat: { holds: 1000, melts: null, burns: null }, light: 'plaster' },
  dirt: { density: 1500, hardness: 1, strength: 0, friction: 700, heat: { holds: 800, melts: null, burns: null }, light: 'floor' },
});

// The room's air, as the heat rule takes it: its temperature (°C), and its film (W/(m²·K)):
// how fast still air carries heat off a surface warmer than it.
export const AIR = Object.freeze({ temp: 20, film: 10 });

export const matterOf = (name) => {
  const m = MATTER[name];
  if (!m) throw new Error(`no such matter: ${name}`);
  return m;
};
// Which gives way when two rub: the softer (equal: both, a little).
export const givesWay = (a, b) => (matterOf(a).hardness < matterOf(b).hardness ? a : matterOf(b).hardness < matterOf(a).hardness ? b : null);
