// Placement rules. Pure: reads the map, never changes it.
//
// RULES is the one table: every rule's name, severity and distances live
// here and nowhere else. checkMap() runs them all and returns warnings:
//
//   { rule, severity, x, z, message, items: [{ kind, index }] }
//
// `x, z` is where to look; `items` are the map entries involved (kind is one
// of 'feature', 'gate', 'scenery', 'object', 'prop', 'path', 'start'; index
// is the position in that list of the map), so the editor can select them.
//
// severity 'error'   the course is broken (a gap between pistes, a gate off its piste)
//          'warning' the course works but breaks a design rule
//
// The distances start from the rules under milestone 5 in MILESTONES.md.

import { T } from '../../js/tuning.js';
import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES, objectCircles } from './catalogue.js';
import { PROFILES } from './predict.js';
import { pathAt, jumpZone, featureSpan, isJump, takeoffZ, corridorOut, sameLine, featureName } from './geometry.js';

export const RULES = [
  { id: 'course-ends', severity: 'error', name: 'The main piste covers the whole course',
    about: 'The first piste must run from above the start to below the finish, and the start must be on it.' },
  { id: 'branch-join', severity: 'error', name: 'Branch ends sit on another piste', tolerance: 3,
    about: 'The first and last point of a branch must be within `tolerance` metres of another piste centre line.' },
  { id: 'branch-separation', severity: 'warning', name: 'Forest between parallel branches', distance: 25, ramp: 120, step: 5,
    about: 'Two pistes need `distance` metres of forest between their edges, except within `ramp` metres of where one of them starts or ends.' },
  { id: 'jump-spacing', severity: 'warning', name: 'Space between jumps on one line', distance: 60,
    about: 'Take-offs of two jumps (kickers, ledges) that overlap side to side must be `distance` metres apart.' },
  { id: 'landing-clear', severity: 'warning', name: 'Clear landing after a jump', distance: 50,
    about: 'For `distance` metres after a jump, its lane must hold no other feature, tree or hand-placed prop.' },
  { id: 'landing-straight', severity: 'warning', name: 'Straight landing after a jump', distance: 50, step: 5,
    about: 'For `distance` metres after a jump, the line straight on from its centre must stay on a piste.' },
  { id: 'scenery-off-landing', severity: 'warning', name: 'Scenery kept off landings', distance: 50,
    about: 'No breakable scenery in the lane of a jump for `distance` metres after it.' },
  { id: 'object-off-landing', severity: 'warning', name: 'Objects kept off landings', distance: 50,
    about: 'No placed object in the lane of a jump for `distance` metres after it.' },
  { id: 'gate-near-jump', severity: 'warning', name: 'No gate close to a jump', before: 30, after: 40, side: 8,
    about: 'No gate within `before` metres before a jump or `after` metres after it, in its lane widened by `side` metres each side.' },
  { id: 'gate-on-piste', severity: 'error', name: 'Every gate is on its piste',
    about: 'A gate must lie between the edges of the piste it belongs to.' },
  { id: 'feature-on-piste', severity: 'warning', name: 'Every feature is on a piste',
    about: 'The take-off point of a feature must be on a piste.' },
  { id: 'object-clear-of-piste', severity: 'warning', name: 'Buildings stand clear of the pistes', clearance: 2,
    about: 'Buildings (catalogue types marked offPiste) keep `clearance` metres from every piste edge.' },
  { id: 'landing-predicted', severity: 'warning', name: 'Predicted landing is clear', back: 2, settle: 12, minAir: 0.3,
    about: 'Where the real physics says she lands (each speed), the lane from `back` metres before touchdown to `settle` metres after must hold no tree, gate, feature, scenery or object. Airs shorter than `minAir` seconds are ignored.' },
  { id: 'landing-predicted-piste', severity: 'warning', name: 'Predicted landing is on a piste',
    about: 'Where the real physics says she lands (each speed) must be on a piste. Uses minAir from landing-predicted.' },
];

export const rule = (id) => RULES.find((r) => r.id === id);

const m = (v) => `${Math.round(v)} m`;
const join = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function checkMap(map, terrain, jumps) {
  const out = [];
  const warn = (id, x, z, message, items = []) => out.push({ rule: id, severity: rule(id).severity, x, z, message, items });
  const features = map.features, main = map.paths[0];

  // ---- course-ends
  {
    const first = main.nodes[0], last = main.nodes.at(-1);
    if (first.z > map.start.z) warn('course-ends', first.x, first.z, `The main piste starts at ${m(first.z)}, below the start line at ${m(map.start.z)}.`, [{ kind: 'path', index: 0 }]);
    if (last.z < map.length) warn('course-ends', last.x, last.z, `The main piste ends at ${m(last.z)}, before the finish line at ${m(map.length)}.`, [{ kind: 'path', index: 0 }]);
    const c = pathAt(main, map.start.z);
    if (c && Math.abs(map.start.x - c.x) > c.w) warn('course-ends', map.start.x, map.start.z, 'The start position is not on the main piste.', [{ kind: 'start', index: 0 }]);
  }

  // ---- branch-join
  {
    const R = rule('branch-join');
    map.paths.forEach((p, pi) => {
      if (pi === 0) return;
      for (const [n, which] of [[p.nodes[0], 'top'], [p.nodes.at(-1), 'bottom']]) {
        let best = Infinity;
        map.paths.forEach((q, qi) => { if (qi !== pi) { const c = pathAt(q, n.z); if (c) best = Math.min(best, Math.abs(n.x - c.x)); } });
        if (best > R.tolerance) {
          warn('branch-join', n.x, n.z, best === Infinity
            ? `The ${which} of piste "${p.id}" is not on any other piste: there is no piste at ${m(n.z)} to join.`
            : `The ${which} of piste "${p.id}" is ${best.toFixed(1)} m from the nearest piste centre (limit ${R.tolerance} m), so the pistes do not join cleanly.`,
          [{ kind: 'path', index: pi }]);
        }
      }
    });
  }

  // ---- branch-separation
  {
    const R = rule('branch-separation');
    for (let a = 0; a < map.paths.length; a++) for (let b = a + 1; b < map.paths.length; b++) {
      const A = map.paths[a], B = map.paths[b];
      const ends = [A.nodes[0].z, A.nodes.at(-1).z, B.nodes[0].z, B.nodes.at(-1).z];
      const z0 = Math.max(ends[0], ends[2]), z1 = Math.min(ends[1], ends[3]);
      let run = null;
      const flush = () => {
        if (!run) return;
        warn('branch-separation', run.x, run.z, run.gap < 0
          ? `Pistes "${A.id}" and "${B.id}" overlap by ${m(-run.gap)} around ${m(run.z)}, away from where they join.`
          : `Only ${m(run.gap)} of forest between pistes "${A.id}" and "${B.id}" around ${m(run.z)} (from ${m(run.from)} to ${m(run.to)}); the rule is ${R.distance} m.`,
        [{ kind: 'path', index: a }, { kind: 'path', index: b }]);
        run = null;
      };
      for (let z = Math.ceil(z0 / R.step) * R.step; z <= z1; z += R.step) {
        if (ends.some((e) => Math.abs(z - e) < R.ramp)) { flush(); continue; }
        const ca = pathAt(A, z), cb = pathAt(B, z);
        const gap = Math.abs(ca.x - cb.x) - ca.w - cb.w;
        if (gap >= R.distance) { flush(); continue; }
        if (!run) run = { gap: Infinity, from: z };
        run.to = z;
        if (gap < run.gap) { run.gap = gap; run.z = z; run.x = (ca.x + cb.x) / 2; }
      }
      flush();
    }
  }

  // ---- rules about what surrounds each jump
  const gateNear = rule('gate-near-jump'), clear = rule('landing-clear'), straight = rule('landing-straight');
  const scn = rule('scenery-off-landing'), obj = rule('object-off-landing'), spacing = rule('jump-spacing');
  const handPlaced = new Map((map.props || []).map((p, i) => [`${p.x},${p.z},${p.type}`, i]));
  features.forEach((f, fi) => {
    if (!isJump(f)) return;
    const [z0, z1] = jumpZone(f), half = f.width / 2, name = featureName(f);
    const me = { kind: 'feature', index: fi };
    const inLane = (x, extra = 0) => Math.abs(x - f.x) < half + extra;

    // jump-spacing (each pair once)
    features.forEach((g, gi) => {
      if (gi <= fi || !isJump(g) || !sameLine(f, g)) return;
      const d = Math.abs(takeoffZ(f) - takeoffZ(g));
      if (d < spacing.distance) warn('jump-spacing', g.x, g.z, `The ${name} and the ${featureName(g)} take off ${m(d)} apart on the same line; the rule is ${spacing.distance} m.`, [me, { kind: 'feature', index: gi }]);
    });

    // landing-clear: other features, trees and props
    features.forEach((g, gi) => {
      if (gi === fi || !sameLine(f, g)) return;
      const [g0, g1] = featureSpan(g);
      if (g1 > z1 && g0 < z1 + clear.distance && g0 >= z0) {
        warn('landing-clear', g.x, g0, `The ${featureName(g)} starts ${m(Math.max(0, g0 - z1))} after the ${name}; the landing should be clear for ${clear.distance} m.`, [me, { kind: 'feature', index: gi }]);
      }
    });
    const trees = terrain.propsBetween(z1, z1 + clear.distance).filter((p) => p.z > z1 && p.z <= z1 + clear.distance && inLane(p.x, p.r || 0));
    if (trees.length) {
      const t = trees.reduce((a, b) => (a.z < b.z ? a : b));
      const pi = handPlaced.get(`${t.x},${t.z},${t.type}`);
      warn('landing-clear', t.x, t.z, `${trees.length === 1 ? 'A tree or prop stands' : `${trees.length} trees or props stand`} in the landing of the ${name}, the first ${m(t.z - z1)} after it.`, pi === undefined ? [me] : [me, { kind: 'prop', index: pi }]);
    }

    // landing-straight
    for (let d = straight.step; d <= straight.distance; d += straight.step) {
      if (corridorOut(map, f.x, z1 + d) > 0) {
        warn('landing-straight', f.x, z1 + d, `Straight on from the ${name}, the piste runs out ${m(d)} after it; the landing should be straight for ${straight.distance} m.`, [me]);
        break;
      }
    }

    // scenery-off-landing
    (map.scenery || []).forEach((s, si) => {
      const t = SCENERY_TYPES[s.type], r = t ? (t.r ?? t.halfW) : 0;
      if (s.z > z1 && s.z <= z1 + scn.distance && inLane(s.x, r)) {
        warn('scenery-off-landing', s.x, s.z, `${t?.name || s.type} stands in the landing of the ${name}, ${m(s.z - z1)} after it.`, [{ kind: 'scenery', index: si }, me]);
      }
    });

    // object-off-landing
    (map.objects || []).forEach((o, oi) => {
      const hit = objectCircles(o).find((c) => c.z > z1 && c.z <= z1 + obj.distance && inLane(c.x, c.r));
      if (hit) warn('object-off-landing', hit.x, hit.z, `${OBJECT_TYPES[o.type].name} stands in the landing of the ${name}, ${m(hit.z - z1)} after it.`, [{ kind: 'object', index: oi }, me]);
    });

    // gate-near-jump
    map.gates.forEach((g, gi) => {
      if (!inLane(g.x, gateNear.side)) return;
      const items = [{ kind: 'gate', index: gi }, me];
      if (g.z > z0 - gateNear.before && g.z < z0) warn('gate-near-jump', g.x, g.z, `A gate is ${m(z0 - g.z)} before the ${name}; the rule is ${gateNear.before} m.`, items);
      else if (g.z >= z0 && g.z <= z1) warn('gate-near-jump', g.x, g.z, `A gate stands on the ${name}.`, items);
      else if (g.z > z1 && g.z < z1 + gateNear.after) warn('gate-near-jump', g.x, g.z, `A gate is ${m(g.z - z1)} after the ${name}; the rule is ${gateNear.after} m.`, items);
    });
  });

  // ---- gate-on-piste
  map.gates.forEach((g, gi) => {
    const p = map.paths.find((q) => q.id === g.path), c = p && pathAt(p, g.z);
    const items = [{ kind: 'gate', index: gi }];
    if (!c) warn('gate-on-piste', g.x, g.z, `A gate at ${m(g.z)} belongs to piste "${g.path}", which does not exist at that point.`, items);
    else if (Math.abs(g.x - c.x) > c.w) warn('gate-on-piste', g.x, g.z, `A gate at ${m(g.z)} is ${(Math.abs(g.x - c.x) - c.w).toFixed(1)} m outside its piste "${g.path}".`, items);
  });

  // ---- feature-on-piste
  features.forEach((f, fi) => {
    if (corridorOut(map, f.x, takeoffZ(f)) > 0) warn('feature-on-piste', f.x, f.z, `The ${featureName(f)} is not on a piste.`, [{ kind: 'feature', index: fi }]);
  });

  // ---- object-clear-of-piste
  {
    const R = rule('object-clear-of-piste');
    (map.objects || []).forEach((o, oi) => {
      const t = OBJECT_TYPES[o.type];
      if (!t?.offPiste) return;
      const gap = corridorOut(map, o.x, o.z) - t.r;
      if (gap < R.clearance) warn('object-clear-of-piste', o.x, o.z, `${t.name} at ${m(o.z)} is ${gap < 0 ? 'on' : `only ${gap.toFixed(1)} m from`} a piste; buildings should stand ${R.clearance} m clear.`, [{ kind: 'object', index: oi }]);
    });
  }

  // ---- predicted landings (the real physics, at each speed)
  {
    const R = rule('landing-predicted');
    const rider = T.scenery.riderRadius, gateHalf = T.race.gateHalfWidth;
    for (const j of jumps || []) {
      const f = j.feature, fi = j.index, half = f.width / 2, name = featureName(f);
      const me = { kind: 'feature', index: fi };
      const hits = new Map();          // what is hit -> { text, x, z, item, speeds }
      const offPiste = [];
      for (const prof of PROFILES) {
        const fl = j.flights[prof.id];
        if (!fl?.air || fl.airTime < R.minAir) continue;
        const L = fl.landing, a = L.z - R.back, b = L.z + R.settle;
        const inZone = (x, z, r = 0) => z + r >= a && z - r <= b && Math.abs(x - f.x) <= half + r;
        const hit = (key, text, x, z, item) => {
          if (!hits.has(key)) hits.set(key, { text, x, z, item, speeds: [] });
          hits.get(key).speeds.push(prof.name.toLowerCase());
        };
        if (corridorOut(map, L.x, L.z) > 0) offPiste.push({ prof, L });

        const trees = terrain.propsBetween(a - 3, b + 3).filter((p) => inZone(p.x, p.z, (p.r || 0) + rider));
        if (trees.length) hit('trees', trees.length === 1 ? 'a tree' : 'trees', trees[0].x, trees[0].z, null);
        map.gates.forEach((g, gi) => { if (inZone(g.x, g.z, gateHalf)) hit(`gate${gi}`, 'a gate', g.x, g.z, { kind: 'gate', index: gi }); });
        features.forEach((g, gi) => {
          if (gi === fi || !sameLine(f, g)) return;
          const [g0, g1] = featureSpan(g);
          if (g1 >= a && g0 <= b) hit(`feature${gi}`, `the ${featureName(g)}`, g.x, g0, { kind: 'feature', index: gi });
        });
        (map.scenery || []).forEach((s, si) => {
          const t = SCENERY_TYPES[s.type], r = t ? (t.r ?? t.halfW) : 0;
          if (inZone(s.x, s.z, r + rider)) hit(`scenery${si}`, `a ${(t?.name || s.type).toLowerCase()}`, s.x, s.z, { kind: 'scenery', index: si });
        });
        (map.objects || []).forEach((o, oi) => {
          const c = objectCircles(o).find((q) => inZone(q.x, q.z, q.r + rider));
          if (c) hit(`object${oi}`, `a ${OBJECT_TYPES[o.type].name.toLowerCase()}`, c.x, c.z, { kind: 'object', index: oi });
        });
      }
      for (const h of hits.values()) {
        warn('landing-predicted', h.x, h.z, `At ${join(h.speeds)} speed the ${name} lands on or just before ${h.text} (at ${m(h.z)}).`, h.item ? [h.item, me] : [me]);
      }
      if (offPiste.length) {
        const L = offPiste[0].L;
        warn('landing-predicted-piste', L.x, L.z, `At ${join(offPiste.map((o) => o.prof.name.toLowerCase()))} speed the ${name} lands off the piste (at ${m(L.z)}).`, [me]);
      }
    }
  }

  return out.sort((p, q) => p.z - q.z);
}
