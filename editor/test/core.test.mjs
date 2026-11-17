// Tests for the shared core. Run from the repo root:
//
//   node --test "editor/test/*.test.mjs"
//
// Node's built-in test runner; no dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import level1 from '../../js/data/levels/level1.js';
import { createTerrain, generateGates } from '../../js/terrain.js';
import { MAP_VERSION, MIGRATIONS, validateMap, migrateMap, parseMap, serializeMap, emptyMap } from '../core/format.js';
import { levelToMap, mapToLevel, levelModuleSource } from '../core/convert.js';
import { analyse } from '../core/analyse.js';
import { predictJumps, PROFILES, entrySpeed } from '../core/predict.js';
import { RULES, rule } from '../core/rules.js';
import { footprint, footprintGap, fenceGap } from '../core/geometry.js';
import { generateMap, normaliseSettings } from '../core/generate.js';
import { OBJECT_TYPES, objectCircles } from '../core/catalogue.js';
import { createRng } from '../core/rng.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const rulesHit = (map) => analyse(map).warnings.map((w) => w.rule);

// A small clean course to break one rule at a time: one straight piste.
function plain() {
  const map = emptyMap({ id: 't', name: 'Test', length: 800 });
  map.paths[0].nodes = [{ z: -40, x: 0, w: 16 }, { z: 860, x: 0, w: 16 }];
  return map;
}
const kicker = (z, x = 0) => ({ type: 'kicker', x, z, width: 10, length: 6, height: 1.5 });

// ---------------------------------------------------------------- game unchanged

test('level 1 still produces exactly the gates it did before the editor work', () => {
  const baseline = JSON.parse(readFileSync(here('./level1-gates.baseline.json'), 'utf8'));
  assert.deepEqual(createTerrain(level1).gates, baseline);
});

test('createTerrain uses a level\'s own gate list when it has one', () => {
  const gates = [{ x: 1, z: 300, red: true, path: 'main' }, { x: -1, z: 100, red: false, path: 'main' }];
  const t = createTerrain({ ...level1, gates });
  assert.deepEqual(t.gates.map((g) => [g.z, g.index]), [[100, 0], [300, 1]]);
  assert.equal(gates[0].index, undefined, 'the level data is not written to');
});

// ---------------------------------------------------------------- format and round trip

test('level 1 converts to a valid map and back to an equivalent level', () => {
  const map = levelToMap(level1);
  assert.deepEqual(validateMap(map), []);
  const { gates, ...rest } = mapToLevel(map);
  assert.deepEqual(rest, level1, 'every level field survives, nothing added');
  assert.deepEqual(gates, generateGates(level1).sort((a, b) => a.z - b.z), 'gates are the ones the game generates');
  // and the game builds the same world from it
  const a = createTerrain(level1), b = createTerrain(mapToLevel(map));
  assert.deepEqual(b.gates, a.gates);
  assert.equal(b.props.length, a.props.length);
  assert.equal(b.heightAt(2, 636), a.heightAt(2, 636));
});

test('a map survives being written to text and read back, byte for byte', () => {
  const map = levelToMap(level1);
  const text = serializeMap(map);
  const back = parseMap(text);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.map, map);
  assert.equal(serializeMap(back.map), text);
});

test('fields the editor does not understand are kept at every depth', () => {
  const map = levelToMap(level1);
  map.futureThing = { a: [1, 2, { b: 3 }] };
  map.paths[0].surface = 'groomed';
  map.paths[0].nodes[1].banked = true;
  map.features[0].sponsor = 'x';
  map.gates[0].panel = 'blue';
  map.scenery[0].dirs = [1, -1, 1];
  map.objects.push({ type: 'hut', x: 60, z: 100, colour: 'red' });
  const back = parseMap(serializeMap(map)).map;
  assert.deepEqual(back, map);
  const level = mapToLevel(back);
  assert.deepEqual(level.futureThing, map.futureThing);
  assert.equal(level.paths[0].nodes[1].banked, true);
  assert.equal(level.features[0].sponsor, 'x');
  assert.deepEqual(levelToMap(level, map.meta), map, 'level -> map -> level -> map is stable');
});

test('placeholder objects never reach the game\'s prop list', () => {
  const map = levelToMap(level1);
  map.objects.push({ type: 'hut', x: 60, z: 100 }, { type: 'pylon', x: 30, z: 200 });
  const level = mapToLevel(map);
  assert.deepEqual(level.props, [], 'props stay as they were');
  const t = createTerrain(level);
  assert.ok(t.props.every((p) => p.type === 'pine' || p.type === 'blob'), 'the game only sees trees');
  assert.equal('objects' in mapToLevel(levelToMap(level1)), false, 'no objects key when there are none');
});

test('validation explains what is wrong and where', () => {
  const map = levelToMap(level1);
  map.paths[1].nodes[2].w = 'wide';
  map.paths[0].nodes[3].z = 100;                      // out of order
  map.features[1].type = 'halfpipe';
  map.gates[0].path = 'nowhere';
  map.objects.push({ type: 'castle', x: 0, z: 0 });
  delete map.length;
  const errors = validateMap(map);
  const at = (path) => errors.find((e) => e.path === path)?.message;
  assert.match(at('paths[1].nodes[2].w'), /should be a number/);
  assert.match(at('paths[0].nodes[3].z'), /top to bottom/);
  assert.match(at('features[1].type'), /roller, kicker, ledge/);
  assert.match(at('gates[0].path'), /not the id of any piste/);
  assert.match(at('objects[0].type'), /hut/);
  assert.match(at('map.length'), /missing/);
  assert.equal(errors.length, 6);
});

test('parseMap refuses broken files with a readable message', () => {
  assert.match(parseMap('{ not json').errors[0].message, /not valid JSON/);
  assert.match(parseMap('{"hello":1}').errors[0].message, /not a Summit Protocol map/);
  const newer = { ...levelToMap(level1), version: MAP_VERSION + 1 };
  const res = parseMap(JSON.stringify(newer));
  assert.equal(res.map, null);
  assert.match(res.errors[0].message, /newer editor/);
});

test('the migration hook runs old versions forward in order', () => {
  const old = { ...levelToMap(level1), version: 1 };
  assert.equal(migrateMap(old).map, old, 'a current map is returned as it is');
  assert.deepEqual(Object.keys(MIGRATIONS), [], 'version 1 is the first version: no migrations yet');
  // pretend today's format is version 3 and write the two steps that reach it
  const migrations = {
    1: (m) => ({ ...m, version: 2, steps: ['1>2'] }),
    2: (m) => ({ ...m, version: 3, steps: [...m.steps, '2>3'] }),
  };
  const res = migrateMap(old, { version: 3, migrations });
  assert.equal(res.map.version, 3);
  assert.deepEqual(res.map.steps, ['1>2', '2>3']);
  assert.equal(res.migratedFrom, 1);
  assert.equal(res.map.paths, old.paths, 'everything else is carried along');
  assert.match(migrateMap(old, { version: 3, migrations: { 1: migrations[1] } }).errors[0].message, /No migration from version 2/);
  assert.equal(migrateMap({ ...old, version: 0 }).map, null, 'version 0 is not a version');
});

test('levelModuleSource writes a module the game can import', async () => {
  const map = levelToMap(level1);
  const src = levelModuleSource(map);
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.deepEqual(mod.default, mapToLevel(map));
});

// ---------------------------------------------------------------- prediction

test('predicted air times match the ones measured in the game (PROGRESS.md)', () => {
  const jumps = predictJumps(createTerrain(level1));
  const air = (z) => jumps.find((j) => j.feature.z === z).flights.normal.airTime;
  const near = (got, want, tol) => assert.ok(Math.abs(got - want) <= tol, `${got.toFixed(2)} s, measured ${want} s`);
  near(air(262), 0.75, 0.1);     // 4.5 m ledge
  near(air(490), 0.7, 0.1);      // roller
  near(air(628), 1.7, 0.1);      // big kicker
  near(air(806), 1.5, 0.1);      // 12 m ledge
});

test('faster profiles fly further, and speeds come from the tuning formula', () => {
  const [slow, normal, adr] = PROFILES.map((p) => entrySpeed(p, 1));
  assert.ok(slow < normal && normal < adr);
  assert.ok(Math.abs(normal - 24) < 0.5, `normal steady speed is about 24 m/s (${normal.toFixed(1)})`);
  for (const j of predictJumps(createTerrain(level1))) {
    const f = j.flights;
    if (f.slow.air && f.normal.air) assert.ok(f.normal.distance > f.slow.distance);
    if (f.normal.air) assert.ok(f.adrenaline.distance > f.normal.distance);
    if (f.normal.air) assert.ok(f.normal.landing.z > f.normal.takeoff.z && f.normal.arc.length >= 2);
  }
});

// ---------------------------------------------------------------- rules

test('the rule table is complete and a clean course has no warnings', () => {
  for (const r of RULES) { assert.ok(r.id && r.name && r.about && ['error', 'warning'].includes(r.severity), r.id); }
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  assert.deepEqual(analyse(plain()).warnings, []);
  const map = plain(); map.features.push(kicker(300));
  assert.deepEqual(analyse(map).warnings, [], 'one kicker on an empty piste is fine');
});

test('every warning has a place, a message and the items involved', () => {
  for (const w of analyse(levelToMap(level1)).warnings) {
    assert.ok(Number.isFinite(w.x) && Number.isFinite(w.z) && w.message.length > 10 && Array.isArray(w.items) && rule(w.rule));
  }
});

test('jump-spacing: two jumps on one line closer than the rule', () => {
  const map = plain(); map.features.push(kicker(300), kicker(300 + rule('jump-spacing').distance - 10));
  assert.ok(rulesHit(map).includes('jump-spacing'));
  const far = plain(); far.features.push(kicker(200), kicker(600));
  assert.ok(!rulesHit(far).includes('jump-spacing'));
  const beside = plain(); beside.features.push(kicker(300, -9), kicker(320, 9));
  assert.ok(!rulesHit(beside).includes('jump-spacing'), 'side by side is not the same line');
});

test('gate-near-jump: before, on, and after until past the landing at the rule\'s speed', () => {
  const R = rule('gate-near-jump');
  const probe = plain(); probe.features.push(kicker(300));
  const lands = analyse(probe).jumps[0].flights[R.speed].landing.z, clearTo = lands + R.margin;
  assert.ok(lands > 306, 'the test kicker gets air');
  for (const z of [300 - R.before + 5, 303, 306 + 5, clearTo - 2]) {
    const map = plain(); map.features.push(kicker(300)); map.gates.push({ x: 2, z, red: true, path: 'main' });
    assert.ok(rulesHit(map).includes('gate-near-jump'), `gate at ${z}`);
  }
  for (const z of [300 - R.before - 5, clearTo + 2]) {
    const map = plain(); map.features.push(kicker(300)); map.gates.push({ x: 2, z, red: true, path: 'main' });
    assert.ok(!rulesHit(map).includes('gate-near-jump'), `gate at ${z}`);
  }
});

test('landing rules: feature, scenery, object and a curving piste', () => {
  const a = plain(); a.features.push(kicker(300), { type: 'roller', x: 0, z: 330, width: 20, length: 18, height: 1.2 });
  assert.ok(rulesHit(a).includes('landing-clear'));
  const b = plain(); b.features.push(kicker(300)); b.scenery.push({ type: 'snowman-big', x: 1, z: 340 });
  assert.ok(rulesHit(b).includes('scenery-off-landing'));
  const c = plain(); c.features.push(kicker(300)); c.objects.push({ type: 'rock', x: 0, z: 345 });
  assert.ok(rulesHit(c).includes('object-off-landing'));
  const d = plain(); d.features.push(kicker(300));
  d.paths[0].nodes = [{ z: -40, x: 0, w: 12 }, { z: 300, x: 0, w: 12 }, { z: 345, x: 60, w: 12 }, { z: 860, x: 60, w: 12 }];
  const hit = rulesHit(d);
  assert.ok(hit.includes('landing-straight') && hit.includes('landing-predicted-piste'), hit.join());
});

test('landing-predicted: the real flight comes down on a gate', () => {
  const map = plain(); map.features.push(kicker(300));
  const land = analyse(map).jumps[0].flights.adrenaline.landing.z;
  const R = rule('gate-near-jump'), normal = analyse(map).jumps[0].flights[R.speed].landing.z;
  assert.ok(land > normal + R.margin + 5, 'far enough that only the prediction can catch it');
  map.gates.push({ x: 0, z: Math.round(land) + 3, red: true, path: 'main' });
  const w = analyse(map).warnings;
  assert.deepEqual(w.map((x) => x.rule), ['landing-predicted']);
  assert.match(w[0].message, /adrenaline speed/);
  assert.deepEqual(w[0].items, [{ kind: 'gate', index: 0 }, { kind: 'feature', index: 0 }]);
});

test('branch rules: a branch must join, and keep its forest', () => {
  const map = plain();
  map.paths.push({ id: 'b', nodes: [{ z: 100, x: 0, w: 10 }, { z: 220, x: 70, w: 10 }, { z: 480, x: 70, w: 10 }, { z: 600, x: 0, w: 10 }] });
  assert.deepEqual(rulesHit(map), []);
  const loose = clone(map); loose.paths[1].nodes[3].x = 30;
  assert.ok(rulesHit(loose).includes('branch-join'));
  const tight = clone(map); tight.paths[1].nodes[1].x = 40; tight.paths[1].nodes[2].x = 40;
  assert.ok(rulesHit(tight).includes('branch-separation'));
});

test('errors: gate off its piste, start off the piste, short main piste, hut on the piste', () => {
  const a = plain(); a.gates.push({ x: 40, z: 200, red: true, path: 'main' });
  assert.equal(analyse(a).warnings.find((w) => w.rule === 'gate-on-piste').severity, 'error');
  const b = plain(); b.start.x = 50;
  assert.ok(rulesHit(b).includes('course-ends'));
  const c = plain(); c.paths[0].nodes[1].z = 700;
  assert.ok(rulesHit(c).includes('course-ends'));
  const d = plain(); d.objects.push({ type: 'hut', x: 5, z: 200 });
  assert.ok(rulesHit(d).includes('object-clear-of-piste'));
  const e = plain(); e.features.push(kicker(300, 40));
  assert.ok(rulesHit(e).includes('feature-on-piste'));
});

test('clear-of-fence: placed things keep their footprint clear of the red fence', () => {
  const R = rule('clear-of-fence'), fence = 16 + 10;                       // plain(): half-width 16, default fence offset 10
  for (const [what, add] of [
    ['rock inside', (m) => m.objects.push({ type: 'rock', x: fence - 1.2 - R.clearance + 0.3, z: 300 })],
    ['rock across', (m) => m.objects.push({ type: 'rock', x: fence, z: 300 })],
    ['hut beyond', (m) => m.objects.push({ type: 'hut', x: -(fence + 3 + R.clearance - 0.3), z: 300, rot: 0 })],
    ['snowman', (m) => m.scenery.push({ type: 'snowman-big', x: fence - 2.3 - 0.5, z: 300 })],
    ['tree', (m) => m.props.push({ type: 'pine', x: fence + 1, z: 300, s: 1, r: 0.5 })],
    ['fence run', (m) => m.objects.push({ type: 'fence', x: fence - 0.5, z: 280, x2: fence - 0.5, z2: 320 })],
  ]) {
    const map = plain(); add(map);
    assert.ok(rulesHit(map).includes('clear-of-fence'), what);
  }
  const ok = plain();
  ok.objects.push({ type: 'rock', x: fence - 1.2 - R.clearance - 0.3, z: 300 }, { type: 'hut', x: fence + 3 + R.clearance + 0.3, z: 400, rot: 0 });
  assert.ok(!rulesHit(ok).includes('clear-of-fence'));
});

test('the game\'s forest keeps trees clear of the fence and of placed objects', () => {
  const F = rule('clear-of-fence').clearance, O = rule('no-overlap').clearance;
  const maps = [levelToMap(level1), generateMap({ seed: 4242, length: 2600, branches: 3 }).map];
  for (const map of maps) {
    const a = analyse(map);
    assert.ok(!a.warnings.some((w) => w.rule === 'clear-of-fence'), `${map.id}: no tree near the fence`);
    assert.ok(!a.warnings.some((w) => w.rule === 'no-overlap' && /generated tree/.test(w.message)), `${map.id}: no tree on an object`);
    for (const p of a.terrain.props) assert.ok(fenceGap(footprint('prop', p), a.terrain.fenceAt) >= F);
    for (const o of map.objects) for (const p of a.terrain.props) assert.ok(footprintGap(footprint('object', o), footprint('prop', p)) >= O);
  }
  // a hut in the deep forest gets its clearing
  const map = plain(); map.objects.push({ type: 'lodge', x: 60, z: 400, rot: 0 });
  assert.ok(!rulesHit(map).includes('no-overlap'));
});

test('no-overlap: placed things keep 1 m apart, edge to edge', () => {
  const R = rule('no-overlap');
  const cases = [
    ['two snowmen', (m) => m.scenery.push({ type: 'snowman-big', x: 0, z: 300 }, { type: 'snowman-small', x: 2.3 + 0.8 + R.clearance - 0.3, z: 300 })],
    ['snowman on a roller', (m) => { m.features.push({ type: 'roller', x: 0, z: 300, width: 20, length: 18, height: 1.2 }); m.scenery.push({ type: 'snowman-small', x: 5, z: 305 }); }],
    ['sign on a gate', (m) => { m.gates.push({ x: 0, z: 200, red: true, path: 'main' }); m.scenery.push({ type: 'caution', x: 2, z: 200.5 }); }],
    ['rock by a hand-placed tree', (m) => { m.objects.push({ type: 'rock', x: 10, z: 200 }); m.props.push({ type: 'pine', x: 12, z: 200, s: 1, r: 0.5 }); }],
    ['hand-placed tree in the forest', (m) => m.props.push({ type: 'pine', x: 0, z: 0, s: 1, r: 0.5 })],
  ];
  for (const [what, add] of cases) {
    const map = plain(); add(map);
    if (what === 'hand-placed tree in the forest') {
      const a = analyse(map), t = a.terrain.props.find((p) => !p.small && p.x > 30 && p.x < 60);
      map.props = [{ type: 'pine', x: t.x + 0.5, z: t.z, s: 1, r: 0.5 }];
    }
    assert.ok(rulesHit(map).includes('no-overlap'), what);
  }
  const ok = plain();
  ok.scenery.push({ type: 'snowman-big', x: 0, z: 300 }, { type: 'snowman-small', x: 2.3 + 0.8 + R.clearance + 0.3, z: 300 });
  ok.gates.push({ x: 0, z: 200, red: true, path: 'main' }); ok.scenery.push({ type: 'caution', x: 0, z: 202.5 });
  assert.ok(!rulesHit(ok).includes('no-overlap'));
  const w = analyse((() => { const m = plain(); cases[0][1](m); return m; })()).warnings.find((x) => x.rule === 'no-overlap');
  assert.deepEqual(w.items.map((i) => i.kind), ['scenery', 'scenery']);
  assert.equal(w.severity, 'warning');
});

test('the object table lives in the game\'s data; the editor\'s catalogue is the same table', async () => {
  const game = await import('../../js/data/objects.js');
  assert.equal(OBJECT_TYPES, game.OBJECT_TYPES);
  assert.equal(objectCircles, game.objectCircles);
});

// ---------------------------------------------------------------- catalogue and rng

test('catalogue: every type has a shape, a radius and a height', () => {
  for (const [id, t] of Object.entries(OBJECT_TYPES)) {
    assert.ok(t.name && ['circle', 'rect', 'line'].includes(t.shape) && t.r > 0 && t.h > 0, id);
  }
  assert.equal(objectCircles({ type: 'fence', x: 0, z: 0, x2: 0, z2: 15 }).length, 11);
  assert.equal(objectCircles({ type: 'banner', x: 0, z: 0 }).length, 2);
  assert.equal(objectCircles({ type: 'rock', x: 0, z: 0, r: 2 })[0].r, 2);
});

test('the random source repeats exactly for a seed', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const run = (r) => Array.from({ length: 20 }, () => r.next());
  const ra = run(a);
  assert.deepEqual(ra, run(b));
  assert.notDeepEqual(ra, run(c));
  assert.ok(ra.every((v) => v >= 0 && v < 1));
});

// ---------------------------------------------------------------- generator

test('the generator gives the same course for the same seed and settings', () => {
  const s = { seed: 21, length: 1800, difficulty: 3, branches: 2, jumpDensity: 0.6 };
  assert.equal(serializeMap(generateMap(s).map), serializeMap(generateMap({ ...s }).map));
  assert.notEqual(serializeMap(generateMap(s).map), serializeMap(generateMap({ ...s, seed: 22 }).map));
});

test('generated courses are valid maps and pass every rule', () => {
  const cases = [
    { seed: 1 }, { seed: 2, difficulty: 5, jumpDensity: 1, branches: 6 }, { seed: 3, length: 900, branches: 1 },
    { seed: 4, difficulty: 1, jumpDensity: 0.2, branches: 0 }, { seed: 5, length: 4000, branches: 4, jumpDensity: 0.8 },
    { seed: 6, length: 600, branches: 2 }, { seed: 7, difficulty: 2, length: 1500, branches: 3 },
    { seed: 8, difficulty: 4, length: 3000, branches: 5, jumpDensity: 0.7 }, { seed: 10, difficulty: 5, length: 4000, branches: 0 },
    { seed: 12, difficulty: 1, length: 2000, branches: 6, jumpDensity: 1 },
  ];
  for (const c of cases) {
    const { map, report } = generateMap(c);
    assert.deepEqual(validateMap(map), [], JSON.stringify(c));
    assert.equal(report.ok, true, `${JSON.stringify(c)}: ${report.warnings.map((w) => w.message).join(' | ')}`);
    assert.deepEqual(analyse(map).warnings, [], 'a fresh check agrees with the report');
    assert.deepEqual(map.meta.generator, normaliseSettings(c));
    assert.ok(map.gates.length > 0 && map.features.length > 0);
  }
});

test('generated courses are wild at the top and resort at the bottom', () => {
  const { map } = generateMap({ seed: 9, length: 2600 });
  const split = 2600 * 0.38;
  assert.ok(map.features.filter((f) => f.type === 'kicker').every((f) => f.z >= split - 10), 'no man-made jumps in the wild part');
  assert.ok(map.features.filter((f) => f.type === 'ledge').every((f) => f.z < split + 10), 'ledges are in the wild part');
  assert.ok(map.objects.filter((o) => ['pylon', 'hut', 'lodge', 'banner'].includes(o.type)).every((o) => o.z >= split - 10));
  assert.ok(map.objects.some((o) => o.type === 'lodge') && map.objects.some((o) => o.type === 'pylon'));
});

test('generator settings are clamped to their limits', () => {
  assert.deepEqual(normaliseSettings({ seed: -5, length: 10, difficulty: 99, branches: 2.4, jumpDensity: 'x' }),
    { seed: 0, length: 600, difficulty: 5, branches: 2, jumpDensity: 0.5 });
});

// ---------------------------------------------------------------- command line

test('tools/map.mjs: exit codes tell pass from fail', () => {
  const tool = here('../../tools/map.mjs');
  const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  const gen = run('generate', '--seed', '5', '--length', '900', '--branches', '1');
  assert.equal(gen.status, 0);
  assert.deepEqual(parseMap(gen.stdout).errors, [], 'generate prints a valid map');
  assert.equal(run('validate', here('../../js/data/levels/level1.js')).status, 1, 'level 1 has warnings');
  assert.equal(run('validate', here('../maps/generated-11.map.json')).status, 0, 'a generated map passes');
  assert.equal(run('validate', here('./nope.json')).status, 2);
  assert.equal(run('frobnicate').status, 2);
  const jumps = run('jumps', here('../maps/test-slope.map.json'), '--json');
  assert.equal(jumps.status, 0);
  assert.equal(JSON.parse(jumps.stdout).length, level1.features.length);
  assert.match(run('convert', here('../maps/generated-11.map.json')).stdout, /export default \{/);
});
