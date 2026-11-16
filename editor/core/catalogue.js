// Placeholder objects: things a course needs that the game cannot draw yet.
// Data only. The editor draws each as a simple shape; the game models and
// collisions come in a later game milestone, which should read these same
// sizes (they follow the sizes written in MILESTONES.md, milestones 1 and 5).
//
// A placed object is { type, x, z, rot?, x2?, z2?, r? } in the map's `objects`.
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
