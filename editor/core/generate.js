// Course generator. Pure and repeatable: the same settings always give the
// same map, in Chrome and in Node. Never uses Math.random.
//
//   generateMap({ seed, length, difficulty, branches, jumpDensity })
//     -> { map, report }
//
// How it works: build a course in stages (pistes, steepness, features,
// scenery and objects, gates), then CHECK it with the real rules
// (analyse()) and REPAIR what they complain about (nudge or remove the
// offending item). If a course cannot be repaired, RETRY with the next
// attempt number. A map is only reported `ok` when it has no warnings.
//
// Character (owner's brief): wild at the top, resort at the bottom. The top
// WILD_SHARE of the course has natural features only (rollers, ledges),
// rocks and caution signs. Below it: kickers, lift pylons, huts, banners,
// snowmen, signposts, and a lodge by the finish.
//
// Each stage draws from its own random stream, named after the stage
// (stream('pistes'), stream('features:main')...). Re-rolling one section
// later only needs that stage re-run with a different stream name; nothing
// here prevents it, and nothing here builds it.

import { generateGates, createTerrain } from '../../js/terrain.js';
import { mapToLevel } from './convert.js';
import { createRng, round } from './rng.js';
import { MAP_FORMAT, MAP_VERSION } from './format.js';
import { OBJECT_TYPES } from './catalogue.js';
import { analyse } from './analyse.js';
import { rule } from './rules.js';
import { PROFILES, entrySpeed } from './predict.js';
import { pathAt, corridorOut, takeoffZ, isJump, featureSpan, sameLine, footprint, footprintBounds, footprintGap, fenceGap } from './geometry.js';

export const GENERATOR_DEFAULTS = { seed: 1, length: 2600, difficulty: 3, branches: 3, jumpDensity: 0.5 };
export const GENERATOR_LIMITS = {
  seed: [0, 999999], length: [600, 6000], difficulty: [1, 5], branches: [0, 6], jumpDensity: [0, 1],
};

// Shape numbers for the generator (design choices, not gameplay tuning).
const G = {
  wildShare: 0.38,            // top share of the course that is "wild"
  nodeGap: [110, 170],        // metres between piste points
  branchLength: [320, 520],   // metres from split to rejoin
  branchTop: 150,             // no split above this z
  branchBottom: 250,          // no rejoin within this of the finish
  jumpGap: [260, 90],         // typical metres between features at density 0 and 1
  maxAttempts: 8,
  maxRepairRounds: 14,
  shifts: [0, 3, -3, 6, -6, 9, -9, 12, -12],   // metres up or down the slope tried to find a clear spot
};

const WILD_NAMES = ['glade', 'cliffs', 'gully', 'bowl', 'chute', 'ridge'];
const RESORT_NAMES = ['park', 'racer', 'liftline', 'quarry', 'cruiser', 'village'];

export function normaliseSettings(settings = {}) {
  const out = {};
  for (const [k, def] of Object.entries(GENERATOR_DEFAULTS)) {
    const [lo, hi] = GENERATOR_LIMITS[k];
    let v = Number(settings[k]);
    if (!Number.isFinite(v)) v = def;
    v = Math.max(lo, Math.min(hi, v));
    out[k] = k === 'jumpDensity' ? Math.round(v * 100) / 100 : Math.round(v);
  }
  return out;
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function generateMap(settings) {
  const S = normaliseSettings(settings);
  let best = null;
  for (let attempt = 0; attempt < G.maxAttempts; attempt++) {
    const res = buildAttempt(S, attempt);
    if (!best || res.report.warnings.length < best.report.warnings.length) best = res;
    if (res.report.ok) break;
  }
  return best;
}

function buildAttempt(S, attempt) {
  const stream = (name) => createRng(hashText(`${S.seed}/${attempt}/${name}`));
  const wildEnd = round(S.length * G.wildShare, 10);
  const isWild = (z) => z < wildEnd;
  const notes = [];

  const map = {
    format: MAP_FORMAT, version: MAP_VERSION,
    meta: { generator: { ...S }, notes: 'Generated course. Race medal times are rough placeholders: ride it and reset them.' },
    id: `gen-${S.seed}`, name: `Generated ${S.seed}`,
    length: S.length, start: { x: 0, z: 6 },
    gateSpacing: 55 - 4 * S.difficulty,
    race: { gold: 1, silver: 1, bronze: 1 },
    seed: (S.seed % 9973) + 1,
    fenceTreeDensity: round(0.08 + 0.03 * S.difficulty, 0.01),
    paths: [], grades: [], features: [], props: [], scenery: [], gates: [], objects: [],
  };

  buildMain(map, S, stream('pistes'), isWild);
  buildGrades(map, S, stream('grades'), wildEnd);
  buildBranches(map, S, stream('branches'), isWild, notes);
  for (const p of map.paths) buildFeatures(map, S, p, stream(`features:${p.id}`), isWild);
  map.features.sort((a, b) => a.z - b.z);
  const fit = clearSpot(map);
  buildScenery(map, S, stream('scenery'), wildEnd, fit);
  buildObjects(map, S, stream('objects'), wildEnd, fit);

  const v = entrySpeed(PROFILES.find((p) => p.id === 'normal'), 1);
  const gold = Math.round(S.length / v);
  map.race = { gold, silver: Math.round(gold * 1.12), bronze: Math.round(gold * 1.3) };

  const wanted = map.features.length;
  const removed = { features: 0, gates: 0, scenery: 0, objects: 0, nudged: 0 };

  // Phase A: features, scenery and objects, with no gates yet.
  let result = repair(map, removed);
  // Phase B: gates the way the game makes them, then drop the ones the rules reject.
  if (result.fixable) {
    map.gates = generateGates(map).sort((a, b) => a.z - b.z);
    result = repair(map, removed);
  }

  const report = {
    ok: result.warnings.length === 0,
    settings: S, attempt,
    features: { wanted, placed: map.features.length },
    branches: { wanted: S.branches, placed: map.paths.length - 1 },
    removed, notes,
    warnings: result.warnings,
  };
  return { map, report };
}

// ---- stage: the main piste
function buildMain(map, S, rng, isWild) {
  const baseW = 19 - 1.2 * S.difficulty, amp = 6 + 3 * S.difficulty;
  const nodes = [{ z: -40, x: 0, w: round(baseW + 3) }, { z: 70, x: 0, w: round(baseW + 3) }];
  let z = 70, x = 0;
  const straightFrom = S.length - 150;                 // finish arena: straight and wide
  for (;;) {
    z += round(rng.range(...G.nodeGap), 10);
    if (z >= straightFrom - 60) break;
    const swing = amp * (isWild(z) ? 1 : 0.6);          // the groomed resort runs straighter
    x = Math.max(-40, Math.min(40, x + rng.range(-swing, swing)));
    nodes.push({ z, x: round(x), w: round(baseW + (isWild(z) ? rng.range(-2.5, 3) : rng.range(-1, 2))) });
  }
  nodes.push({ z: straightFrom, x: round(x), w: round(baseW + 2) }, { z: S.length + 60, x: round(x), w: round(baseW + 3) });
  map.paths.push({ id: 'main', nodes });
}

// ---- stage: steepness
function buildGrades(map, S, rng, wildEnd) {
  const sections = Math.max(3, Math.round(S.length / 450));
  map.grades.push({ z: 0, grade: 1 });
  for (let i = 1; i < sections; i++) {
    const z = round((S.length * i) / sections, 10);
    const last = i === sections - 1;
    const g = last ? 1 : 1 + (S.difficulty - 1) * 0.04 + rng.range(-0.05, 0.1) + (z < wildEnd ? 0.05 : 0);
    map.grades.push({ z, grade: round(Math.max(0.9, g), 0.05) });
  }
}

// ---- stage: branches. Each gets its own stretch of the mountain, so two
// branches never run beside each other.
function buildBranches(map, S, rng, isWild, notes) {
  const main = map.paths[0], R = rule('branch-separation');
  const top = G.branchTop, bottom = S.length - G.branchBottom;
  const slot = S.branches ? (bottom - top) / S.branches : 0;
  const used = new Set(['main']);
  for (let i = 0; i < S.branches; i++) {
    if (slot < G.branchLength[0] + 20) { notes.push(`Only ${map.paths.length - 1} of ${S.branches} branches fit in ${S.length} m.`); break; }
    const len = round(Math.min(slot - 20, rng.range(...G.branchLength)), 10);
    const z0 = round(top + slot * i + rng.range(0, slot - 20 - len), 10), z1 = z0 + len;
    const side = rng.sign(), wild = isWild((z0 + z1) / 2);
    const bw = round(wild ? rng.range(8, 11) : rng.range(11, 14));
    const extra = rng.range(8, 22);
    const offsetAt = (z) => pathAt(main, z).w + bw + R.distance + extra;
    const zs = [z0 + R.ramp, ...main.nodes.map((n) => n.z).filter((z) => z > z0 + R.ramp + 30 && z < z1 - R.ramp - 30), z1 - R.ramp];
    const a = pathAt(main, z0), b = pathAt(main, z1);
    const nodes = [
      { z: z0, x: round(a.x), w: round(Math.min(a.w, bw + 3)) },
      ...zs.map((z) => ({ z, x: round(pathAt(main, z).x + side * offsetAt(z)), w: bw })),
      { z: z1, x: round(b.x), w: round(Math.min(b.w, bw + 3)) },
    ];
    // the end points sit on the main centre line, to the centimetre
    nodes[0].x = round(a.x, 0.01); nodes.at(-1).x = round(b.x, 0.01);
    const names = wild ? WILD_NAMES : RESORT_NAMES;
    let id = names[Math.floor(rng.next() * names.length)];
    for (let n = 2; used.has(id); n++) id = `${id.replace(/\d+$/, '')}${n}`;
    used.add(id);
    const path = { id, nodes };
    widen(map, path, side);
    map.paths.push(path);
  }
}

// Push a branch further out until it clears the separation rule everywhere it applies.
function widen(map, path, side) {
  const main = map.paths[0], R = rule('branch-separation');
  const z0 = path.nodes[0].z, z1 = path.nodes.at(-1).z;
  for (let round_ = 0; round_ < 6; round_++) {
    let worst = Infinity;
    for (let z = z0 + R.ramp; z <= z1 - R.ramp; z += R.step) {
      const a = pathAt(main, z), b = pathAt(path, z);
      worst = Math.min(worst, Math.abs(a.x - b.x) - a.w - b.w);
    }
    if (worst >= R.distance + 2) return;
    for (const n of path.nodes.slice(1, -1)) n.x = round(n.x + side * (R.distance + 4 - worst));
  }
}

// ---- stage: features down one piste
function buildFeatures(map, S, path, rng, isWild) {
  const isMain = path === map.paths[0], R = rule('branch-separation');
  const from = isMain ? map.start.z + 90 : path.nodes[0].z + R.ramp;
  const to = isMain ? S.length - 130 : path.nodes.at(-1).z - R.ramp;
  const gap = G.jumpGap[0] + (G.jumpGap[1] - G.jumpGap[0]) * S.jumpDensity;
  const d = S.difficulty;
  let z = from + rng.range(0, gap * 0.5);
  while (z < to) {
    const c = pathAt(path, z), wild = isWild(z);
    const roll = rng.next();
    let f;
    if (roll < (wild ? 0.4 : 0.3)) {
      f = { type: 'roller', x: round(c.x), z: round(z), width: round(Math.min(c.w * 1.4, 24)), length: round(rng.range(16, 20)), height: round(rng.range(1.1, 1.3 + 0.1 * d), 0.1) };
    } else if (wild) {
      const drop = round(rng.range(2, 2 + 2 * d), 0.5);
      f = { type: 'ledge', x: round(c.x), z: round(z), width: round(Math.min(c.w * 1.5, 24)), drop, approach: round(30 + drop * 3.3), run: drop >= 8 ? 3 : 2.5, lip: drop >= 8 ? 0.8 : 0 };
    } else {
      const height = round(rng.range(0.8, 1.2 + 0.7 * d), 0.1), width = round(rng.range(9, 13));
      const off = Math.max(0, c.w - width / 2 - 3);
      f = { type: 'kicker', x: round(c.x + rng.range(-off, off) * 0.6), z: round(z), width, length: round(3 + 2 * height), height };
    }
    const [s0, s1] = featureSpan(f);
    const clash = map.features.some((g) => {
      if (!sameLine(f, g)) return false;
      const [g0, g1] = featureSpan(g);
      if (s0 < g1 + 12 && g0 < s1 + 12) return true;                                   // overlapping or nose to tail
      return isJump(f) && isJump(g) && Math.abs(takeoffZ(f) - takeoffZ(g)) < rule('jump-spacing').distance + 5;
    });
    if (!clash && s0 > from - 40 && corridorOut(map, f.x, takeoffZ(f)) < -f.width / 2 + 1) map.features.push(f);
    z += gap * rng.range(0.75, 1.25);
  }
  // resort finale on the main piste: a big-air kicker before the finish
  if (isMain && !isWild(S.length - 220) && S.jumpDensity > 0) {
    const zf = S.length - 220, c = pathAt(path, zf), height = round(2 + 0.7 * d, 0.1);
    const f = { type: 'kicker', x: round(c.x), z: zf, width: 12, length: round(3 + 2 * height), height };
    map.features = map.features.filter((g) => Math.abs(g.z - zf) > 110 || !sameLine(f, g));
    map.features.push(f);
  }
}

// ---- placing things clear of each other, the forest and the fence
// Returns fit(kind, item): the item, moved up or down the slope by the first
// of G.shifts that keeps it `clearance` metres from the fence, the generated
// forest (scenery only: the game's forest leaves a clearing round every
// object) and everything already placed (rules clear-of-fence and no-overlap).
// If no shift works it is returned where it was, and repair() deals with it.
// Uses no random numbers, so the random streams are not disturbed.
function clearSpot(map) {
  const terrain = createTerrain(mapToLevel(map));         // the forest depends on the pistes only
  const F = rule('clear-of-fence').clearance, O = rule('no-overlap').clearance;
  const LISTS = { feature: 'features', scenery: 'scenery', object: 'objects' };
  const ok = (kind, item) => {
    const fp = footprint(kind, item), b = footprintBounds(fp);
    if (fenceGap(fp, terrain.fenceAt) < F) return false;
    const trees = kind === 'object' ? [] : terrain.propsBetween(b.minZ - O - 2, b.maxZ + O + 2);   // the game's forest clears round objects
    if (trees.some((p) => p.x > b.minX - O - 2 && p.x < b.maxX + O + 2 && footprintGap(fp, footprint('prop', p)) < O)) return false;
    for (const [k, key] of Object.entries(LISTS)) {
      for (const other of map[key]) {
        const q = footprint(k, other), qb = footprintBounds(q);
        if (qb.minZ > b.maxZ + O || qb.maxZ < b.minZ - O || qb.minX > b.maxX + O || qb.maxX < b.minX - O) continue;
        if (footprintGap(fp, q) < O) return false;
      }
    }
    return true;
  };
  return (kind, item) => {
    for (const dz of G.shifts) {
      const moved = dz ? { ...item, z: round(item.z + dz) } : item;
      if (dz && moved.z2 !== undefined) moved.z2 = round(item.z2 + dz);
      if (ok(kind, moved)) return moved;
    }
    return item;
  };
}

// ---- stage: breakable scenery
function buildScenery(map, S, rng, wildEnd, fit) {
  const main = map.paths[0], put = (type, x, z) => map.scenery.push(fit('scenery', { type, x: round(x), z: round(z) }));
  const c0 = pathAt(main, map.start.z + 26);
  put('trailmap', c0.x - c0.w + 3.5, map.start.z + 26);
  // a direction post where each branch leaves
  for (const p of map.paths.slice(1)) {
    const n = p.nodes[0], side = Math.sign(p.nodes[1].x - n.x) || 1, c = pathAt(main, n.z + 16);
    if (c) put('trailpost', c.x + side * (c.w - 2.5), n.z + 16);
  }
  // caution signs either side of every real drop
  for (const f of map.features) {
    if (f.type !== 'ledge' || f.drop < 4) continue;
    for (const side of [-1, 1]) put('caution', f.x + side * (f.width / 2 + 2), f.z - 20);
  }
  // snowmen: the resort only
  for (let z = wildEnd + 60; z < S.length - 60; z += rng.range(110, 240)) {
    const c = pathAt(main, z);
    put(rng.chance(0.5) ? 'snowman-small' : 'snowman-big', c.x + rng.range(-1, 1) * (c.w - 3), z);
  }
}

// ---- stage: placeholder objects from the catalogue
function buildObjects(map, S, rng, wildEnd, fit) {
  const fence = map.fenceOffset ?? 10;
  const edges = (z) => {
    let left = Infinity, right = -Infinity;
    for (const p of map.paths) { const c = pathAt(p, z); if (c) { left = Math.min(left, c.x - c.w); right = Math.max(right, c.x + c.w); } }
    return { left, right };
  };
  const put = (type, x, z, more = {}) => map.objects.push(fit('object', { type, x: round(x), z: round(z), ...more }));
  const liftSide = rng.sign();
  const outside = (z, side, dist) => { const e = edges(z); return side < 0 ? e.left - dist : e.right + dist; };

  // wild: rocks beside each ledge, and a few along the piste edges
  for (const f of map.features) {
    if (f.type !== 'ledge') continue;
    const r = OBJECT_TYPES.rock.r;
    for (const side of [-1, 1]) if (rng.chance(0.7)) put('rock', f.x + side * (f.width / 2 + r + 3 + rng.range(0, 3)), f.z + rng.range(-12, 4), { r: round(rng.range(0.8, 1.8), 0.1) });
  }
  for (let z = 120; z < wildEnd; z += rng.range(90, 200)) {
    const side = rng.sign();
    put('rock', outside(z, side, rng.range(1.5, 5)), z, { r: round(rng.range(0.8, 2), 0.1) });
  }

  // resort: a lift line down one side, between the piste and the fence
  for (let z = wildEnd + 20; z < S.length - 40; z += 80) put('pylon', outside(z, liftSide, fence * 0.6), z);
  put('liftstation', outside(S.length - 20, liftSide, fence + OBJECT_TYPES.liftstation.r + 4), S.length - 20);
  put('lodge', outside(S.length - 30, -liftSide, fence + OBJECT_TYPES.lodge.r + 4), S.length - 30);
  for (let z = wildEnd + 150; z < S.length - 200; z += rng.range(350, 700)) {
    const side = rng.sign();
    put('hut', outside(z, side, fence + OBJECT_TYPES.hut.r + 4), z, { rot: round(rng.range(-0.4, 0.4), 0.1) });
  }
  // signposts where the resort begins, banners down the finish straight
  for (const side of [-1, 1]) put('sign', outside(wildEnd + 10, side, 2), wildEnd + 10);
  for (const z of [S.length - 90, S.length - 45]) {
    for (const side of [-1, 1]) put('banner', outside(z, side, 1.5), z, { rot: Math.PI / 2 });
  }
  // short fence runs funnelling into the finish
  for (const side of [-1, 1]) {
    put('fence', outside(S.length - 120, side, 3), S.length - 120, { x2: round(outside(S.length - 60, side, 3)), z2: S.length - 60 });
  }
}

// ---- check and repair
// Runs the real rules and fixes what they report. Returns { warnings, fixable }.
// Called twice: first while the gate list is still empty, then with gates.
function repair(map, removed) {
  const nudged = new Set();
  let warnings = [];
  for (let round_ = 0; round_ < G.maxRepairRounds; round_++) {
    const a = analyse(map);
    warnings = a.warnings;
    if (!warnings.length) return { warnings, fixable: true };
    const kill = { feature: new Set(), gate: new Set(), scenery: new Set(), object: new Set() };
    let structural = false;
    for (const w of warnings) {
      const item = (kind) => w.items.find((i) => i.kind === kind);
      const gate = item('gate'), scn = item('scenery'), obj = item('object');
      if (gate) { kill.gate.add(gate.index); continue; }
      if (scn) { kill.scenery.add(scn.index); continue; }
      if (obj) { kill.object.add(obj.index); continue; }
      const feats = w.items.filter((i) => i.kind === 'feature');
      if (!feats.length) { structural = true; continue; }
      if (feats.length > 1) {
        // two features in each other's way: drop the roller if one is a roller, else the lower one
        const pick = feats.find((i) => map.features[i.index].type === 'roller') || feats.reduce((p, q) => (map.features[p.index].z > map.features[q.index].z ? p : q));
        kill.feature.add(pick.index);
        continue;
      }
      // one feature whose landing leaves the piste or meets trees: slide it toward where the piste goes, once
      const f = map.features[feats[0].index];
      if (!nudged.has(f) && tryNudge(map, f, a.jumps[feats[0].index])) { nudged.add(f); removed.nudged++; } else kill.feature.add(feats[0].index);
    }
    if (structural && !Object.values(kill).some((s) => s.size)) return { warnings, fixable: false };
    const drop = (list, set) => list.filter((_, i) => !set.has(i));
    removed.features += kill.feature.size; removed.gates += kill.gate.size; removed.scenery += kill.scenery.size; removed.objects += kill.object.size;
    map.features = drop(map.features, kill.feature); map.gates = drop(map.gates, kill.gate);
    map.scenery = drop(map.scenery, kill.scenery); map.objects = drop(map.objects, kill.object);
  }
  warnings = analyse(map).warnings;
  return { warnings, fixable: warnings.every((w) => w.items.some((i) => i.kind !== 'path' && i.kind !== 'start')) };
}

// Move a feature sideways so both its take-off and its furthest landing are
// well inside the piste. Returns false when no such position exists.
function tryNudge(map, f, jump) {
  const far = Math.max(...Object.values(jump.flights).filter((fl) => fl.air).map((fl) => fl.landing.z), takeoffZ(f) + rule('landing-straight').distance);
  const zs = [takeoffZ(f)];
  for (let z = takeoffZ(f) + 10; z <= far + rule('landing-predicted').settle; z += 10) zs.push(z);
  // the widest band of x that is on a single piste at every one of those z
  let best = null;
  for (const p of map.paths) {
    let lo = -Infinity, hi = Infinity, ok = true;
    for (const z of zs) { const c = pathAt(p, z); if (!c) { ok = false; break; } lo = Math.max(lo, c.x - c.w); hi = Math.min(hi, c.x + c.w); }
    if (ok && hi - lo > (best ? best.hi - best.lo : 0)) best = { lo, hi };
  }
  const margin = f.width / 2 + 3;
  if (!best || best.hi - best.lo < margin * 2) return false;
  const x = round(Math.max(best.lo + margin, Math.min(best.hi - margin, f.x)));
  if (x === f.x) return false;
  f.x = x;
  return true;
}
