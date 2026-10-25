// Sound as a range of waves (world.md: the rules of this layer), as light is: ten octave bands, 31 Hz
// to 16 kHz, the counterpart of light's bins. Matter drinks sound by band (its row's `sound`: law/
// matter.js), as it drinks light. What sound does in air and through glass is the air's and the glass's.
import { MATTER, AIR } from 'penpals-law/matter';
import { PANE } from '../scene/light/room.js';

export const BANDS = Object.freeze([31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]); // Hz, each octave's middle
export const NB = BANDS.length;

const R = 8.314462618; // J/(mol·K)
// How fast sound runs in the air (m/s): √(γ R T / M), γ its heat at constant pressure over constant
// volume (the row's holds, less R / M), M its molar mass. 343 m/s at 20 °C.
export function soundSpeed(tempC = AIR.temp) {
  const M = MATTER.air.molar / 1000;
  const cp = MATTER.air.heat.holds;
  const gamma = cp / (cp - R / M);
  return Math.sqrt((gamma * R * (tempC + 273.15)) / M);
}
export const SPEED = soundSpeed();

// How much the air itself drinks of each band over a metre (dB/m): ISO 9613-1, from its heat and how
// much water it holds (relative humidity, %), at a standard atmosphere.
export function airAbsorption(f, tempC = AIR.temp, humidity = 50) {
  const T = tempC + 273.15,
    T0 = 293.15,
    T01 = 273.16;
  const psat = 10 ** (-6.8346 * (T01 / T) ** 1.261 + 4.6151); // (over the standard pressure)
  const h = humidity * psat; // molar concentration of water vapour, %
  const frO = 24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h);
  const frN = (T / T0) ** -0.5 * (9 + 280 * h * Math.exp(-4.17 * ((T / T0) ** (-1 / 3) - 1)));
  const a = 8.686 * f * f * (1.84e-11 * (T / T0) ** 0.5 + (T / T0) ** -2.5 * ((0.01275 * Math.exp(-2239.1 / T)) / (frO + (f * f) / frO) + (0.1068 * Math.exp(-3352 / T)) / (frN + (f * f) / frN)));
  return a; // dB/m
}

// What a pane lets through (a share of the energy by band): the mass law, its weight a square metre
// from its matter's density and how thick it is (m). A window drinks the highs.
export function throughPane(matter = 'glass', thick = PANE) {
  const m = MATTER[matter].density * thick; // kg/m²
  return BANDS.map((f) => {
    const tl = Math.max(0, 20 * Math.log10(f * m) - 47); // dB lost
    return 10 ** (-tl / 10);
  });
}

// The ear's scale: a watt of work heard as this much (how loud the world is: Tabor's to set).
export const LOUD = 40;

// A short knock (a burst, a drop landing): E joules let go over tau seconds. A pulse that short
// spreads its energy evenly up to about 1 / tau and less above (each band an octave: as wide as it
// is high). → { bands, dur }
export function knock(E, tau) {
  const shape = BANDS.map((f) => {
    const x = Math.PI * f * tau;
    return f * (x ? (Math.sin(x) / x) ** 2 : 1);
  });
  const total = shape.reduce((a, x) => a + x, 0) || 1;
  return { bands: shape.map((x) => ((E / tau) * LOUD * x) / total), dur: tau };
}

// What a face of `matter` drinks of each band (0..1).
export const absorbs = (matter) => (MATTER[matter]?.sound ?? MATTER.plaster.sound).map((a) => a / 1000);
