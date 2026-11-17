// Measuring helpers over a map (or a level: same shape). Pure.
// Piste positions always come from the game's own pathAt(), never from a copy.

import { pathAt, jumpZone } from '../../js/terrain.js';
import { T } from '../../js/tuning.js';
import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { objectFootprint, pointGap, insidePoly } from './catalogue.js';
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

// ---------------------------------------------------------------- footprints
// The ground a placed thing covers, from its own data: { circle: { x, z, r } }
// or { poly: [{ x, z }, ...] } (corners in order). Used by the clearance
// rules and by the generator to keep things apart.

const GATE_POLE = 0.25;    // radius of a gate pole on the plan (metres)

const box = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

export function footprint(kind, item) {
  switch (kind) {
    case 'feature': { const [z0, z1] = featureSpan(item); return { poly: box(item.x - item.width / 2, z0, item.x + item.width / 2, z1) }; }
    case 'gate': { const h = T.race.gateHalfWidth + GATE_POLE; return { poly: box(item.x - h, item.z - GATE_POLE, item.x + h, item.z + GATE_POLE) }; }
    case 'scenery': {
      const t = SCENERY_TYPES[item.type];
      if (!t) return { circle: { x: item.x, z: item.z, r: 0.5 } };
      if (t.r != null) return { circle: { x: item.x, z: item.z, r: t.r } };
      return { poly: box(item.x - t.halfW, item.z - t.halfD, item.x + t.halfW, item.z + t.halfD) };
    }
    case 'object': return objectFootprint(item);
    default: return { circle: { x: item.x, z: item.z, r: item.r || 0.5 } };      // trees and other props
  }
}

// The box around a footprint: { minX, maxX, minZ, maxZ }.
export function footprintBounds(fp) {
  if (fp.circle) { const { x, z, r } = fp.circle; return { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }; }
  const xs = fp.poly.map((p) => p.x), zs = fp.poly.map((p) => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

const segPointDist = (a, b, p) => pointGap({ poly: [a, b] }, p.x, p.z);    // a two-corner polygon is a segment
const inside = (poly, p) => insidePoly(poly, p.x, p.z);
const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const segsCross = ([a, b], [c, d]) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

// Edge-to-edge distance between two footprints in metres; 0 or less when they overlap.
export function footprintGap(a, b) {
  // with a round thing: the distance from its centre, less its radius (the
  // game's forest measures trees against objects the same way, js/data/objects.js)
  if (b.circle) return pointGap(a, b.circle.x, b.circle.z) - b.circle.r;
  if (a.circle) return pointGap(b, a.circle.x, a.circle.z) - a.circle.r;
  if (a.poly.some((p) => inside(b.poly, p)) || b.poly.some((p) => inside(a.poly, p))) return 0;
  const ea = edges(a.poly), eb = edges(b.poly);
  if (ea.some((s) => eb.some((t) => segsCross(s, t)))) return 0;
  let best = Infinity;
  for (const [p, q] of ea) for (const v of b.poly) best = Math.min(best, segPointDist(p, q, v));
  for (const [p, q] of eb) for (const v of a.poly) best = Math.min(best, segPointDist(p, q, v));
  return best;
}

// Distance in metres from a footprint to the nearer red side fence, across
// the slope (the fence runs downhill); 0 or less when it touches or crosses
// it. `fenceAt` is the game terrain's own answer (terrain.fenceAt). Returns
// Infinity where there is no fence. A round thing is measured at its centre's
// z, as the game's forest is; anything else by its box, every metre down it.
export function fenceGap(fp, fenceAt) {
  const across = (z, lo, hi) => {
    const f = fenceAt(z);
    if (!f) return Infinity;
    return Math.min(...[f.left, f.right].map((fx) => (fx < lo ? lo - fx : fx > hi ? fx - hi : -Math.min(fx - lo, hi - fx))));
  };
  if (fp.circle) { const { x, z, r } = fp.circle; return across(z, x - r, x + r); }
  const b = footprintBounds(fp);
  let best = Infinity;
  for (let z = b.minZ; ; z += 1) { best = Math.min(best, across(Math.min(z, b.maxZ), b.minX, b.maxX)); if (z >= b.maxZ) break; }
  return best;
}
