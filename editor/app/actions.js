// Named edits. Every function here takes a map and returns a NEW map; the
// map it was given is never changed (undo depends on that). No DOM.
//
// A selection names one thing in the map:
//   { kind: 'node', path: 1, index: 2 }      a point of a piste
//   { kind: 'path', index: 1 }               a whole piste
//   { kind: 'feature' | 'gate' | 'scenery' | 'object' | 'prop' | 'grade', index }
//   { kind: 'object', index, end: true }     the far end of a line object (fence)
//   { kind: 'start' } | { kind: 'race' } | { kind: 'map' }

import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES } from '../core/catalogue.js';
import { nearestPath, featureSpan } from '../core/geometry.js';

export const LISTS = { feature: 'features', gate: 'gates', scenery: 'scenery', object: 'objects', prop: 'props', grade: 'grades' };
const NODE_GAP = 5;      // a piste point stays at least this far (m) from its neighbours in z

export function getItem(map, sel) {
  if (!sel) return null;
  if (sel.kind === 'node') return map.paths[sel.path]?.nodes[sel.index] ?? null;
  if (sel.kind === 'path') return map.paths[sel.index] ?? null;
  if (sel.kind === 'start') return map.start;
  if (sel.kind === 'race') return map.race ?? null;
  if (sel.kind === 'map') return map;
  return map[LISTS[sel.kind]]?.[sel.index] ?? null;
}

export const sameSelection = (a, b) => !!a && !!b && a.kind === b.kind && a.index === b.index && a.path === b.path && !!a.end === !!b.end;

// A new map in which the selected item is a copy that `change` has edited.
export function updateItem(map, sel, change) {
  if (!getItem(map, sel)) return map;
  const edit = (item) => { const copy = { ...item }; change(copy); return copy; };
  if (sel.kind === 'map') return edit(map);
  if (sel.kind === 'start') return { ...map, start: edit(map.start) };
  if (sel.kind === 'race') return { ...map, race: edit(map.race) };
  if (sel.kind === 'path' || sel.kind === 'node') {
    const pi = sel.kind === 'path' ? sel.index : sel.path;
    const paths = map.paths.slice();
    if (sel.kind === 'path') paths[pi] = edit(paths[pi]);
    else { const nodes = paths[pi].nodes.slice(); nodes[sel.index] = edit(nodes[sel.index]); paths[pi] = { ...paths[pi], nodes }; }
    return { ...map, paths };
  }
  const key = LISTS[sel.kind], list = map[key].slice();
  list[sel.index] = edit(list[sel.index]);
  return { ...map, [key]: list };
}

// Move the selected thing so that its handle is at (x, z).
export function moveItem(map, sel, x, z) {
  if (sel.kind === 'node') {
    const nodes = map.paths[sel.path].nodes, prev = nodes[sel.index - 1], next = nodes[sel.index + 1];
    const zz = Math.max(prev ? prev.z + NODE_GAP : -Infinity, Math.min(next ? next.z - NODE_GAP : Infinity, z));
    return updateItem(map, sel, (n) => { n.x = x; n.z = zz; });
  }
  if (sel.kind === 'gate') {
    const near = nearestPath(map, x, z);                     // a gate belongs to the piste it stands on
    return updateItem(map, sel, (g) => { g.x = x; g.z = z; if (near) g.path = near.path.id; });
  }
  if (sel.kind === 'object') {
    const o = getItem(map, sel), line = OBJECT_TYPES[o.type]?.shape === 'line';
    if (sel.end) return updateItem(map, sel, (c) => { c.x2 = x; c.z2 = z; });
    return updateItem(map, sel, (c) => {
      if (line) { c.x2 = (c.x2 ?? c.x) + (x - c.x); c.z2 = (c.z2 ?? c.z) + (z - c.z); }
      c.x = x; c.z = z;
    });
  }
  if (sel.kind === 'grade') return updateItem(map, sel, (g) => { g.z = z; });
  return updateItem(map, sel, (c) => { c.x = x; c.z = z; });
}

// Set one field (value undefined removes the field).
export function setField(map, sel, key, value) {
  const before = getItem(map, sel);
  if (!before) return map;
  let next = updateItem(map, sel, (c) => { if (value === undefined) delete c[key]; else c[key] = value; });
  if (sel.kind === 'path' && key === 'id' && before.id !== value) {
    // gates refer to their piste by id: rename them with it
    next = { ...next, gates: next.gates.map((g) => (g.path === before.id ? { ...g, path: value } : g)) };
  }
  return next;
}

export const canRemove = (sel) => !!sel && ['feature', 'gate', 'scenery', 'object', 'prop'].includes(sel.kind);

export function removeItem(map, sel) {
  if (!canRemove(sel) || !getItem(map, sel)) return map;
  const key = LISTS[sel.kind];
  return { ...map, [key]: map[key].filter((_, i) => i !== sel.index) };
}

// Where a thing's drag handle is, and roughly how big it is (metres).
export function anchor(map, sel) {
  const it = getItem(map, sel);
  if (!it) return null;
  switch (sel.kind) {
    case 'node': return { x: it.x, z: it.z, r: 0 };
    case 'feature': { const [a, b] = featureSpan(it); return { x: it.x, z: it.z, r: Math.max(it.width / 2, (b - a) / 2), cz: (a + b) / 2 }; }
    case 'gate': return { x: it.x, z: it.z, r: 2.4 };
    case 'scenery': { const t = SCENERY_TYPES[it.type]; return { x: it.x, z: it.z, r: t ? (t.r ?? t.halfW) : 0.5 }; }
    case 'object': {
      const t = OBJECT_TYPES[it.type];
      if (sel.end) return { x: it.x2 ?? it.x, z: it.z2 ?? it.z, r: 0 };
      return { x: it.x, z: it.z, r: t ? (t.shape === 'rect' ? Math.max(t.w, t.d) / 2 : t.shape === 'line' ? 0 : (it.r || t.r)) : 1 };
    }
    case 'prop': return { x: it.x, z: it.z, r: it.r || 0.5 };
    case 'start': return { x: it.x, z: it.z, r: 1 };
    case 'path': { const n = it.nodes[Math.floor(it.nodes.length / 2)]; return { x: n.x, z: n.z, r: n.w }; }
    default: return null;
  }
}

// A short plain name for the selected thing.
export function describe(map, sel) {
  const it = getItem(map, sel);
  if (!it) return 'Nothing selected';
  switch (sel.kind) {
    case 'node': return `Point ${sel.index + 1} of piste "${map.paths[sel.path].id}"`;
    case 'path': return `Piste "${it.id}"${sel.index === 0 ? ' (the main piste)' : ''}`;
    case 'feature': return `${it.type[0].toUpperCase()}${it.type.slice(1)} (feature ${sel.index})`;
    case 'gate': return `${it.red ? 'Red' : 'Blue'} gate (gate ${sel.index})`;
    case 'scenery': return SCENERY_TYPES[it.type]?.name || it.type;
    case 'object': return `${OBJECT_TYPES[it.type]?.name || it.type}${sel.end ? ' (far end)' : ''}`;
    case 'prop': return `Hand-placed ${it.type}`;
    case 'start': return 'Start position';
    case 'race': return 'Race medal times';
    case 'grade': return `Steepness from ${it.z} m`;
    default: return 'Map';
  }
}
