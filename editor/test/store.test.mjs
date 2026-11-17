// Tests for the editor's store and actions (no browser needed: neither
// touches the DOM). Run from the repo root:  node --test "editor/test/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';

import level1 from '../../js/data/levels/level1.js';
import { levelToMap } from '../core/convert.js';
import { validateMap, serializeMap } from '../core/format.js';
import { createStore } from '../app/store.js';
import { moveItem, setField, removeItem, updateItem, getItem, canRemove, newItem, addItem, NEW_ITEM } from '../app/actions.js';
import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES } from '../core/catalogue.js';
import { mapToLevel } from '../core/convert.js';
import { pathAt } from '../core/geometry.js';

const fresh = () => levelToMap(level1);
const freeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(freeze); } return v; };

test('actions return a new map and never touch the one they were given', () => {
  const map = freeze(fresh());                       // any write to the original would throw
  const text = serializeMap(map);
  const sels = [
    { kind: 'node', path: 1, index: 2 }, { kind: 'feature', index: 3 }, { kind: 'gate', index: 4 },
    { kind: 'scenery', index: 0 }, { kind: 'start' }, { kind: 'path', index: 1 }, { kind: 'grade', index: 1 },
  ];
  for (const sel of sels) {
    const moved = moveItem(map, sel, 3, 123);
    assert.notEqual(moved, map);
    assert.deepEqual(validateMap(sel.kind === 'path' ? map : moved), [], sel.kind);
  }
  assert.equal(setField(map, { kind: 'feature', index: 1 }, 'height', 3).features[1].height, 3);
  assert.equal(removeItem(map, { kind: 'gate', index: 0 }).gates.length, map.gates.length - 1);
  assert.equal(serializeMap(map), text);
});

test('an edit shares everything it did not change (cheap undo)', () => {
  const map = fresh(), next = setField(map, { kind: 'feature', index: 1 }, 'height', 3);
  assert.equal(next.paths, map.paths);
  assert.equal(next.gates, map.gates);
  assert.equal(next.features[0], map.features[0]);
  assert.notEqual(next.features[1], map.features[1]);
});

test('moving a piste point keeps the points in order', () => {
  const map = fresh(), sel = { kind: 'node', path: 0, index: 2 };
  const down = moveItem(map, sel, 0, 9999).paths[0].nodes;
  assert.ok(down[2].z < down[3].z);
  const up = moveItem(map, sel, 0, -9999).paths[0].nodes;
  assert.ok(up[2].z > up[1].z);
});

test('a gate takes the piste it is dropped on; renaming a piste renames its gates', () => {
  const map = fresh();
  const gi = map.gates.findIndex((g) => g.path === 'main');
  assert.equal(moveItem(map, { kind: 'gate', index: gi }, 50, 460).gates[gi].path, 'trees');
  const renamed = setField(map, { kind: 'path', index: 1 }, 'id', 'glade');
  assert.ok(renamed.gates.every((g) => g.path !== 'trees') && renamed.gates.some((g) => g.path === 'glade'));
  assert.deepEqual(validateMap(renamed), []);
});

test('unknown fields survive edits', () => {
  const map = fresh();
  map.features[1].sponsor = 'x';
  const next = moveItem(map, { kind: 'feature', index: 1 }, 5, 170);
  assert.equal(next.features[1].sponsor, 'x');
  assert.equal(updateItem(next, { kind: 'feature', index: 1 }, (f) => { f.height = 2; }).features[1].sponsor, 'x');
});

test('only whole things in lists can be removed', () => {
  assert.equal(canRemove({ kind: 'node', path: 0, index: 1 }), false);
  assert.equal(canRemove({ kind: 'start' }), false);
  assert.equal(canRemove({ kind: 'object', index: 0 }), true);
  assert.equal(getItem(fresh(), { kind: 'object', index: 0 }), null);
});

test('store: apply, undo and redo walk through exact earlier maps', () => {
  const a = fresh(), store = createStore(a);
  const reasons = [];
  store.subscribe((r) => reasons.push(r));
  assert.equal(store.canUndo, false);
  store.apply('raise kicker', (m) => setField(m, { kind: 'feature', index: 1 }, 'height', 3));
  const b = store.map;
  store.apply('move gate', (m) => moveItem(m, { kind: 'gate', index: 0 }, 1, 60));
  const c = store.map;
  assert.equal(store.undoLabel, 'move gate');
  store.undo(); assert.equal(store.map, b);
  store.undo(); assert.equal(store.map, a);
  store.undo(); assert.equal(store.map, a, 'nothing more to undo');
  store.redo(); assert.equal(store.map, b);
  store.redo(); assert.equal(store.map, c);
  store.undo();
  store.apply('new edit', (m) => setField(m, { kind: 'feature', index: 1 }, 'height', 1));
  assert.equal(store.canRedo, false, 'a new edit clears redo');
  assert.ok(reasons.every((r) => r === 'map'));
});

test('store: the analysis always belongs to the current map', () => {
  const store = createStore(fresh());
  const before = store.analysis;
  assert.equal(before.level.features[7].height, 4);
  store.apply('lower the big kicker', (m) => setField(m, { kind: 'feature', index: 7 }, 'height', 1));
  assert.notEqual(store.analysis, before);
  assert.equal(store.analysis.level.features[7].height, 1);
  assert.ok(store.analysis.jumps[7].flights.normal.airTime < before.jumps[7].flights.normal.airTime);
  store.undo();
  assert.equal(store.analysis.level.features[7].height, 4);
});

test('store: an edit that would make the map invalid is refused', () => {
  const store = createStore(fresh());
  const a = store.map;
  let rejected = null;
  store.subscribe((r, d) => { if (r === 'rejected') rejected = d; });
  assert.equal(store.apply('bad width', (m) => setField(m, { kind: 'feature', index: 1 }, 'width', -4)), false);
  assert.equal(store.map, a);
  assert.equal(store.canUndo, false);
  assert.match(rejected.errors[0].message, /more than 0/);
});

test('store: a drag is many previews and one history entry', () => {
  const store = createStore(fresh());
  const a = store.map, sel = { kind: 'feature', index: 1 };
  for (const x of [-11, -10, -9, -8]) store.preview(moveItem(store.baseMap, sel, x, 160));
  assert.equal(store.dragging, true);
  assert.equal(store.map.features[1].x, -8);
  assert.equal(store.baseMap, a);
  store.commit('move kicker');
  assert.equal(store.dragging, false);
  assert.equal(store.analysis.level.features[1].x, -8, 'analysis is up to date the moment the drag ends');
  store.undo();
  assert.equal(store.map, a, 'one undo takes back the whole drag');
  assert.equal(store.canUndo, false);
  store.preview(moveItem(store.baseMap, sel, 0, 160));
  store.cancel();
  assert.equal(store.map, a);
  assert.equal(store.canUndo, false);
});

test('store: the selection is dropped when its item no longer exists', () => {
  const store = createStore(fresh());
  const last = store.map.gates.length - 1;
  store.select({ kind: 'gate', index: last });
  assert.deepEqual(store.selection, { kind: 'gate', index: last });
  store.apply('delete gate', (m) => removeItem(m, { kind: 'gate', index: 0 }));
  assert.equal(store.selection, null);
  store.select({ kind: 'gate', index: 999 });
  assert.equal(store.selection, null);
});

test('addItem: every palette type makes a valid map with the new item selected', () => {
  const map = freeze(fresh()), text = serializeMap(map);
  const all = [
    ...['roller', 'kicker', 'ledge'].map((t) => ['feature', t]),
    ...Object.keys(SCENERY_TYPES).map((t) => ['scenery', t]),
    ...Object.keys(OBJECT_TYPES).map((t) => ['object', t]),
    ['prop', 'pine'], ['prop', 'blob'],
  ];
  for (const [kind, type] of all) {
    const item = newItem(map, kind, type, 60, 500);
    const { map: next, selection } = addItem(map, kind, item);
    assert.deepEqual(validateMap(next), [], `${kind} ${type}`);
    assert.equal(selection.kind, kind);
    assert.equal(getItem(next, selection), item, `${kind} ${type} is selected`);
    assert.equal(next[{ feature: 'features', scenery: 'scenery', object: 'objects', prop: 'props' }[kind]].length,
      (map[{ feature: 'features', scenery: 'scenery', object: 'objects', prop: 'props' }[kind]] || []).length + 1);
  }
  assert.equal(serializeMap(map), text, 'the original map is untouched');
});

test('newItem: defaults from NEW_ITEM, rotation for rect objects, a far end for lines', () => {
  const map = fresh();
  assert.deepEqual(newItem(map, 'feature', 'kicker', 80, 300), { type: 'kicker', x: 80, z: 300, ...NEW_ITEM.kicker });
  assert.deepEqual(newItem(map, 'feature', 'ledge', 80, 300), { type: 'ledge', x: 80, z: 300, width: 16, drop: 4.5, approach: 46, run: 2.5, lip: 0 });
  assert.deepEqual(newItem(map, 'scenery', 'caution', 3, 40), { type: 'caution', x: 3, z: 40 });
  assert.deepEqual(newItem(map, 'object', 'hut', 60, 200), { type: 'hut', x: 60, z: 200, rot: 0 });
  assert.deepEqual(newItem(map, 'object', 'rock', 60, 200), { type: 'rock', x: 60, z: 200 });
  assert.deepEqual(newItem(map, 'object', 'fence', 60, 200), { type: 'fence', x: 60, z: 200, x2: 60, z2: 220 });
  assert.deepEqual(newItem(map, 'prop', 'pine', 60, 200), { type: 'pine', x: 60, z: 200, s: 1, r: 0.5 });
});

test('newItem: a feature within 3 m of a piste centre snaps onto it', () => {
  const map = fresh(), z = 300, mid = pathAt(map.paths[0], z).x;           // the game's own piste centre
  const at = (x) => newItem(map, 'feature', 'roller', x, z).x;
  assert.equal(at(mid + 2.5), mid);
  assert.equal(at(mid - 3), mid);
  assert.equal(at(mid + 3.5), mid + 3.5, 'further than 3 m stays where clicked');
  assert.equal(newItem(map, 'object', 'rock', mid + 1, z).x, mid + 1, 'only features snap');
});

test('addItem: features stay sorted by z', () => {
  const map = fresh();
  const { map: next, selection } = addItem(map, 'feature', newItem(map, 'feature', 'kicker', 0, 300));
  const zs = next.features.map((f) => f.z);
  assert.deepEqual(zs, zs.slice().sort((a, b) => a - b));
  assert.equal(next.features[selection.index].z, 300);
  assert.equal(addItem(map, 'feature', newItem(map, 'feature', 'kicker', 0, -10)).selection.index, 0);
  assert.equal(addItem(map, 'feature', newItem(map, 'feature', 'kicker', 0, 1e4)).selection.index, map.features.length);
});

test('addItem through the store: one undo step, and objects stay out of the game\'s props', () => {
  const store = createStore(fresh()), a = store.map;
  const added = addItem(a, 'object', newItem(a, 'object', 'hut', 0, 300));
  store.apply('Add hut', added.map);
  store.select(added.selection);
  assert.equal(getItem(store.map, store.selection).type, 'hut');
  assert.ok(store.analysis.warnings.some((w) => w.rule === 'object-clear-of-piste'), 'a hut on the piste is flagged');
  assert.ok(!(mapToLevel(store.map).props || []).some((p) => p.type === 'hut'));
  store.undo();
  assert.equal(store.map, a);
});
