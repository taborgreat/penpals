// Light bounces until it stops (light-waves §4): radiosity over patches. Each
// patch drinks its share of what reaches it, bin by bin (its absorption, a
// runtime input: ink on the page, or later on a wall, changes the room's
// light), and gives the rest back to the patches it sees. Every pass, each
// patch in turn gathers what the others give back now (so light handed on
// early in a pass moves on within it: Gauss–Seidel, a little over-relaxed),
// until what is still moving falls below a threshold.
//
// General over the patches it is given: one room, or (layer 3) two joined
// rooms with the form factors between them. Only the form factors are baked
// (geometry); sources and absorption arrive each time the light or any
// patch's matter changes, and the solve runs in a worker. The result is linear
// in the sources: a flame's flicker scales its own solved light, so the light
// need not be solved again for every flicker, only when the sun moves or a
// patch's absorption changes.
//
//   formFactors  n × n, row i what patch i sees: the irradiance at i from the
//                light patch j gives back (its radiosity B_j) is F_ij · B_j
//   absorption   n × bins, 0..1
//   sources      n × bins: what each patch receives directly (direct.js)
// → light: n × bins, the settled irradiance at each patch (direct and bounced)

export const MAX_PASSES = 100;
export const THRESHOLD = 1e-4; // of the light received directly
export const RELAX = 1.2; // each pass goes this much past the patch's new light (fewer passes)

const countOf = (patches) => (typeof patches === 'number' ? patches : patches.n ?? patches.length);
const areaOf = (patches, i) => {
  if (typeof patches !== 'object' || patches.n !== undefined) return 1;
  const p = patches[i];
  return typeof p === 'number' ? p : p?.area ?? 1;
};

// What patch i gathers (Σ_j F_ij · B_j per bin) into acc. On the axis's 17 bins
// the sums are kept apart in locals (the hot loop); any other count, by bin.
function gather(F, row, n, B, bins, acc) {
  if (bins === 17) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0, a6 = 0, a7 = 0, a8 = 0, a9 = 0, a10 = 0, a11 = 0, a12 = 0, a13 = 0, a14 = 0, a15 = 0, a16 = 0;
    for (let j = 0; j < n; j++) {
      const f = F[row + j];
      if (f === 0) continue;
      const o = j * 17;
      a0 += f * B[o]; a1 += f * B[o + 1]; a2 += f * B[o + 2]; a3 += f * B[o + 3]; a4 += f * B[o + 4]; a5 += f * B[o + 5];
      a6 += f * B[o + 6]; a7 += f * B[o + 7]; a8 += f * B[o + 8]; a9 += f * B[o + 9]; a10 += f * B[o + 10]; a11 += f * B[o + 11];
      a12 += f * B[o + 12]; a13 += f * B[o + 13]; a14 += f * B[o + 14]; a15 += f * B[o + 15]; a16 += f * B[o + 16];
    }
    acc[0] = a0; acc[1] = a1; acc[2] = a2; acc[3] = a3; acc[4] = a4; acc[5] = a5; acc[6] = a6; acc[7] = a7; acc[8] = a8;
    acc[9] = a9; acc[10] = a10; acc[11] = a11; acc[12] = a12; acc[13] = a13; acc[14] = a14; acc[15] = a15; acc[16] = a16;
    return;
  }
  acc.fill(0);
  for (let j = 0; j < n; j++) {
    const f = F[row + j];
    if (f === 0) continue;
    const o = j * bins;
    for (let b = 0; b < bins; b++) acc[b] += f * B[o + b];
  }
}

export function solve(patches, formFactors, absorption, sources, { threshold = THRESHOLD, maxPasses = MAX_PASSES, relax = RELAX } = {}) {
  const n = countOf(patches);
  const bins = absorption.length / n;
  if (!Number.isInteger(bins) || sources.length !== absorption.length || formFactors.length < n * n) throw new Error('solve: patches, form factors, absorption and sources do not fit');
  const F = formFactors;
  const light = Float64Array.from(sources);
  const B = new Float64Array(n * bins); // what each patch gives back now
  const acc = new Float64Array(bins);
  const area = Float64Array.from({ length: n }, (_, i) => areaOf(patches, i));
  let power = 0;
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < bins; b++) {
      const k = i * bins + b;
      B[k] = (1 - absorption[k]) * sources[k];
      power += area[i] * sources[k];
    }
  }
  let passes = 0;
  let residual = power > 0 ? Infinity : 0;
  while (residual > threshold && passes < maxPasses) {
    let still = 0; // what changed hands this pass
    for (let i = 0; i < n; i++) {
      gather(F, i * n, n, B, bins, acc);
      const at = i * bins;
      for (let b = 0; b < bins; b++) {
        const k = at + b;
        const h = Math.max(0, light[k] + relax * (sources[k] + acc[b] - light[k]));
        const given = (1 - absorption[k]) * h;
        still += area[i] * Math.abs(given - B[k]);
        B[k] = given;
        light[k] = h;
      }
    }
    passes++;
    residual = still / power;
  }
  return { light, passes, converged: residual <= threshold, residual };
}

// What each patch drinks, summed over every bin including the heat bin: what
// the shared heat rule takes in. W for patches with areas (the room's patches,
// or their areas as numbers), W / m² for a bare count.
export function heatOf(light, absorption, patches) {
  const n = countOf(patches);
  const bins = absorption.length / n;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let b = 0; b < bins; b++) s += light[i * bins + b] * absorption[i * bins + b];
    out[i] = s * areaOf(patches, i);
  }
  return out;
}
