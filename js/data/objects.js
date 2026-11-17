// Placed object types (hut, lodge, lift station, pylon, rock...): things a
// course needs that the game cannot draw yet. Data, like js/data/scenery.js.
// The map editor draws each as a simple shape. The game reads them today
// only to keep its generated forest off them (js/terrain.js); models and
// collisions come in a later milestone and should read these same sizes
// (they follow the sizes written in MILESTONES.md, milestones 1 and 5).
// Moved here from editor/core/catalogue.js (owner, 2026-11-17), which
// re-exports it so the editor's imports keep working.
//
// A placed object is { type, x, z, rot?, x2?, z2?, r? } in a level's `objects`.
//
//   shape   'circle'  a round thing of radius r
//           'rect'    w across by d deep, turned by the object's `rot`
//           'line'    a run from (x, z) to (x2, z2), e.g. a fence
//   r       collision radius in metres (for 'line': of each post along the run)
//   h       height in metres (flying higher than this clears it)
//   posts   for 'rect' shapes that only collide at their two ends (a banner)
//   every   for 'line' shapes: one collision circle every this many metres
//   offPiste  true = must stand clear of every piste (a building)
//   zone    'resort' | 'wild' | 'any': where the generator may put it
//   sizable true = a placed object may carry its own `r`

export const OBJECT_TYPES = {
  hut:         { name: 'Hut',            shape: 'rect', w: 6, d: 5, r: 4, h: 5, offPiste: true, zone: 'any', colour: '#8a5c3c' },
  lodge:       { name: 'Lodge',          shape: 'rect', w: 18, d: 10, r: 10, h: 9, offPiste: true, zone: 'resort', colour: '#6b4329' },
  liftstation: { name: 'Lift station',   shape: 'rect', w: 10, d: 8, r: 6.5, h: 6, offPiste: true, zone: 'resort', colour: '#5d6672' },
  pylon:       { name: 'Lift pylon',     shape: 'circle', r: 0.6, h: 12, zone: 'resort', colour: '#5d6672' },
  rock:        { name: 'Rock',           shape: 'circle', r: 1.2, h: 1, zone: 'wild', sizable: true, colour: '#7d7f86' },
  sign:        { name: 'Signpost',       shape: 'circle', r: 0.4, h: 2, zone: 'resort', colour: '#d9a520' },
  banner:      { name: 'Banner',         shape: 'rect', w: 8, d: 0.4, r: 0.3, h: 5, posts: true, zone: 'resort', colour: '#c2307a' },
  fence:       { name: 'Fence run',      shape: 'line', r: 0.4, h: 1.2, every: 1.5, zone: 'resort', colour: '#a0522d' },
};

// The circles an object collides as: [{ x, z, r }].
export function objectCircles(o) {
  const t = OBJECT_TYPES[o.type];
  if (!t) return [];
  if (t.shape === 'line') {
    const x2 = o.x2 ?? o.x, z2 = o.z2 ?? o.z, len = Math.hypot(x2 - o.x, z2 - o.z);
    const n = Math.max(1, Math.ceil(len / t.every)), out = [];
    for (let i = 0; i <= n; i++) out.push({ x: o.x + (x2 - o.x) * (i / n), z: o.z + (z2 - o.z) * (i / n), r: t.r });
    return out;
  }
  if (t.posts) {
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), half = t.w / 2;
    return [{ x: o.x - c * half, z: o.z + s * half, r: t.r }, { x: o.x + c * half, z: o.z - s * half, r: t.r }];
  }
  return [{ x: o.x, z: o.z, r: (t.sizable && o.r) || t.r }];
}

// Corner points of what the editor draws for an object, in plan (x, z):
// a polygon for 'rect', the two ends for 'line', null for 'circle'.
export function objectOutline(o) {
  const t = OBJECT_TYPES[o.type];
  if (!t || t.shape === 'circle') return null;
  if (t.shape === 'line') return [{ x: o.x, z: o.z }, { x: o.x2 ?? o.x, z: o.z2 ?? o.z }];
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0), hw = t.w / 2, hd = t.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => ({ x: o.x + a * c + b * s, z: o.z - a * s + b * c }));
}

// ---------------------------------------------------------------- footprints
// The ground an object covers: { circle: { x, z, r } } or { poly: [corners] }.
// A rect is its outline; a line (fence run) is the run thickened by its post
// radius, ends included.
export function objectFootprint(o) {
  const t = OBJECT_TYPES[o.type];
  if (!t || t.shape === 'circle') return { circle: { x: o.x, z: o.z, r: (t?.sizable && o.r) || t?.r || 0.5 } };
  if (t.shape === 'rect') return { poly: objectOutline(o) };
  const [a, b] = objectOutline(o), len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-6) return { circle: { x: a.x, z: a.z, r: t.r } };
  const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, r = t.r;
  return { poly: [
    { x: a.x - ux * r - uz * r, z: a.z - uz * r + ux * r }, { x: b.x + ux * r - uz * r, z: b.z + uz * r + ux * r },
    { x: b.x + ux * r + uz * r, z: b.z + uz * r - ux * r }, { x: a.x - ux * r + uz * r, z: a.z - uz * r - ux * r },
  ] };
}

const segPointDist = (a, b, x, z) => {
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1e-12;
  const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * k - x, a.z + dz * k - z);
};
export function insidePoly(poly, x, z) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inn = !inn;
  }
  return inn;
}

// Distance in metres from a point to the edge of a footprint: 0 inside a
// polygon, negative inside a circle. The forest (js/terrain.js) and the map
// editor's clearance rules both measure with this, so they always agree.
export function pointGap(fp, x, z) {
  if (fp.circle) return Math.hypot(x - fp.circle.x, z - fp.circle.z) - fp.circle.r;
  if (insidePoly(fp.poly, x, z)) return 0;
  let best = Infinity;
  for (let i = 0; i < fp.poly.length; i++) best = Math.min(best, segPointDist(fp.poly[i], fp.poly[(i + 1) % fp.poly.length], x, z));
  return best;
}
