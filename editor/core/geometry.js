// Measuring helpers over a map (or a level: same shape). Pure.
// Piste positions always come from the game's own pathAt(), never from a copy.

import { pathAt, jumpZone } from '../../js/terrain.js';
import { featureSpan } from './predict.js';

export { pathAt, jumpZone, featureSpan };

// A kicker or a ledge is a "jump" for spacing and gate rules; a roller is not
// (the same split the game's gate generator makes).
export const isJump = (f) => !!jumpZone(f);

// The z where she leaves the snow: a kicker's lip, a ledge's edge, a roller's crest.
export function takeoffZ(f) {
  if (f.type === 'ledge') return f.z;
  return f.type === 'kicker' ? f.z + f.length : f.z + f.length / 2;
}

// Every piste that exists at this z: [{ path, index, x, w }].
export function pathsAt(map, z) {
  const out = [];
  map.paths.forEach((path, index) => { const c = pathAt(path, z); if (c) out.push({ path, index, x: c.x, w: c.w }); });
  return out;
}

// Metres outside the nearest piste edge (<= 0 means on a piste; Infinity where no piste exists).
export function corridorOut(map, x, z) {
  let best = Infinity;
  for (const p of map.paths) { const c = pathAt(p, z); if (c) best = Math.min(best, Math.abs(x - c.x) - c.w); }
  return best;
}

// The piste nearest to a point: { path, index, x, w, out } or null.
export function nearestPath(map, x, z) {
  let best = null;
  for (const c of pathsAt(map, z)) {
    const out = Math.abs(x - c.x) - c.w;
    if (!best || out < best.out) best = { ...c, out };
  }
  return best;
}

// True when two features overlap side to side, so one line of travel crosses both.
export const sameLine = (a, b) => Math.abs(a.x - b.x) < (a.width + b.width) / 2;

// A short plain name for a feature, e.g. "kicker at 628".
export const featureName = (f) => `${f.type} at ${Math.round(f.z)}`;
