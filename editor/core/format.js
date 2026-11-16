// The map file format: version, validation, migration, text in and out.
// Pure. See editor/DESIGN.md section 1 for the format and section 6 for the
// rule on changing it (version bump + migration + owner's approval, always).

import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES } from './catalogue.js';

export const MAP_FORMAT = 'summit-map';
export const MAP_VERSION = 1;

// The envelope keys a map has and a level does not.
export const ENVELOPE_KEYS = ['format', 'version', 'meta'];

// Required number fields per feature type (ledge `lip` is optional).
export const FEATURE_FIELDS = {
  roller: ['x', 'z', 'width', 'length', 'height'],
  kicker: ['x', 'z', 'width', 'length', 'height'],
  ledge: ['x', 'z', 'width', 'drop', 'approach', 'run'],
};

// MIGRATIONS[n] turns a version n map into a version n + 1 map (a new object;
// it must keep every key it does not know). There are none yet. Example of
// what one looks like, for when version 2 exists:
//
//   1: (map) => ({ ...map, version: 2, objects: map.objects.map((o) => ({ ...o, rot: o.rot ?? 0 })) }),
export const MIGRATIONS = {};

// Bring a parsed file up to MAP_VERSION. Returns { map, errors, migratedFrom }.
export function migrateMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { map: null, errors: [err('', 'The file is not a map (it should be one JSON object).')] };
  if (raw.format !== MAP_FORMAT) return { map: null, errors: [err('format', `This is not a Summit Protocol map: "format" should be "${MAP_FORMAT}".`)] };
  if (!Number.isInteger(raw.version) || raw.version < 1) return { map: null, errors: [err('version', '"version" should be a whole number, 1 or more.')] };
  if (raw.version > MAP_VERSION) {
    return { map: null, errors: [err('version', `This map is version ${raw.version}; this editor only understands up to version ${MAP_VERSION}. Use a newer editor.`)] };
  }
  let map = raw;
  const migratedFrom = raw.version;
  while (map.version < MAP_VERSION) {
    const step = MIGRATIONS[map.version];
    if (!step) return { map: null, errors: [err('version', `No migration from version ${map.version} is known.`)] };
    map = step(map);
  }
  return { map, errors: [], migratedFrom };
}

const err = (path, message) => ({ path, message });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Check a current-version map. Returns a list of { path, message }; empty
// means valid. Never changes the map. Unknown keys are allowed everywhere.
export function validateMap(map) {
  const errors = [];
  const bad = (path, message) => { errors.push(err(path, message)); };
  const num = (obj, key, path, { min = -Infinity, above = -Infinity, optional = false } = {}) => {
    const v = obj[key];
    if (v === undefined && optional) return true;
    if (!isNum(v)) { bad(`${path}.${key}`, `${path}.${key} should be a number${v === undefined ? ' (it is missing)' : ` (it is ${JSON.stringify(v)})`}.`); return false; }
    if (v < min) { bad(`${path}.${key}`, `${path}.${key} is ${v}; it should be ${min} or more.`); return false; }
    if (v <= above) { bad(`${path}.${key}`, `${path}.${key} is ${v}; it should be more than ${above}.`); return false; }
    return true;
  };
  const list = (key, optional = false) => {
    const v = map[key];
    if (v === undefined && optional) return [];
    if (!Array.isArray(v)) { bad(key, `"${key}" should be a list${v === undefined ? ' (it is missing)' : ''}.`); return []; }
    return v;
  };
  const each = (key, items, fn) => items.forEach((item, i) => {
    const path = `${key}[${i}]`;
    if (!isObj(item)) bad(path, `${path} should be an object.`); else fn(item, path, i);
  });

  if (!isObj(map)) return [err('', 'The map should be one object.')];
  if (map.format !== MAP_FORMAT) bad('format', `"format" should be "${MAP_FORMAT}".`);
  if (map.version !== MAP_VERSION) bad('version', `"version" should be ${MAP_VERSION} (run migrateMap first).`);
  if (map.meta !== undefined && !isObj(map.meta)) bad('meta', '"meta" should be an object.');
  for (const key of ['id', 'name']) if (typeof map[key] !== 'string' || !map[key]) bad(key, `"${key}" should be a non-empty piece of text.`);
  num(map, 'length', 'map', { above: 0 });
  num(map, 'gateSpacing', 'map', { above: 0 });
  num(map, 'seed', 'map', { optional: true });
  num(map, 'fenceOffset', 'map', { optional: true, min: 0 });
  num(map, 'fenceTreeDensity', 'map', { optional: true, min: 0 });
  if (!isObj(map.start)) bad('start', '"start" should be an object with x and z.');
  else { num(map.start, 'x', 'start'); num(map.start, 'z', 'start'); }
  if (map.race !== undefined) {
    if (!isObj(map.race)) bad('race', '"race" should be an object with gold, silver and bronze times.');
    else for (const k of ['gold', 'silver', 'bronze']) num(map.race, k, 'race', { above: 0 });
  }

  // ---- pistes
  const paths = list('paths');
  if (Array.isArray(map.paths) && !paths.length) bad('paths', 'A map needs at least one piste in "paths" (the first is the main one).');
  const ids = new Set();
  each('paths', paths, (p, path) => {
    if (typeof p.id !== 'string' || !p.id) bad(`${path}.id`, `${path}.id should be a non-empty piece of text.`);
    else if (ids.has(p.id)) bad(`${path}.id`, `Two pistes are both called "${p.id}"; every piste needs its own id.`);
    else ids.add(p.id);
    num(p, 'gateSpacing', path, { optional: true, above: 0 });
    if (!Array.isArray(p.nodes) || p.nodes.length < 2) { bad(`${path}.nodes`, `${path}.nodes should be a list of at least 2 points.`); return; }
    let lastZ = -Infinity;
    p.nodes.forEach((n, i) => {
      const np = `${path}.nodes[${i}]`;
      if (!isObj(n)) { bad(np, `${np} should be an object with z, x and w.`); return; }
      const ok = num(n, 'z', np); num(n, 'x', np); num(n, 'w', np, { above: 0 });
      if (ok) {
        if (n.z <= lastZ) bad(`${np}.z`, `${np}.z is ${n.z}, which is not below the point before it (${lastZ}). Points must run top to bottom.`);
        lastZ = n.z;
      }
    });
  });

  // ---- steepness
  let lastGradeZ = -Infinity;
  each('grades', list('grades', true), (g, path) => {
    const ok = num(g, 'z', path); num(g, 'grade', path, { above: 0 });
    if (ok) { if (g.z < lastGradeZ) bad(`${path}.z`, `${path}.z is ${g.z}; grades must be listed top to bottom.`); lastGradeZ = g.z; }
  });

  // ---- features
  each('features', list('features'), (f, path) => {
    const fields = FEATURE_FIELDS[f.type];
    if (!fields) { bad(`${path}.type`, `${path}.type is ${JSON.stringify(f.type)}; it should be one of: ${Object.keys(FEATURE_FIELDS).join(', ')}.`); return; }
    for (const k of fields) num(f, k, path, k === 'x' || k === 'z' ? {} : { above: 0 });
    if (f.type === 'ledge') num(f, 'lip', path, { optional: true, min: 0 });
  });

  // ---- hand-placed props (the game's own list; any type is carried along)
  each('props', list('props', true), (p, path) => {
    if (typeof p.type !== 'string') bad(`${path}.type`, `${path}.type should be text.`);
    num(p, 'x', path); num(p, 'z', path);
  });

  // ---- breakable scenery
  each('scenery', list('scenery', true), (s, path) => {
    if (!SCENERY_TYPES[s.type]) bad(`${path}.type`, `${path}.type is ${JSON.stringify(s.type)}; it should be one of: ${Object.keys(SCENERY_TYPES).join(', ')}.`);
    num(s, 'x', path); num(s, 'z', path);
  });

  // ---- gates
  each('gates', list('gates'), (g, path) => {
    num(g, 'x', path); num(g, 'z', path);
    if (typeof g.red !== 'boolean') bad(`${path}.red`, `${path}.red should be true or false.`);
    if (!ids.has(g.path)) bad(`${path}.path`, `${path}.path is ${JSON.stringify(g.path)}, which is not the id of any piste.`);
  });

  // ---- placeholder objects
  each('objects', list('objects'), (o, path) => {
    const t = OBJECT_TYPES[o.type];
    if (!t) { bad(`${path}.type`, `${path}.type is ${JSON.stringify(o.type)}; it should be one of: ${Object.keys(OBJECT_TYPES).join(', ')}.`); return; }
    num(o, 'x', path); num(o, 'z', path); num(o, 'rot', path, { optional: true });
    if (t.shape === 'line') { num(o, 'x2', path); num(o, 'z2', path); }
    if (o.r !== undefined) num(o, 'r', path, { above: 0 });
  });

  return errors;
}

// Text of a file -> { map, errors, migratedFrom }. `map` is null when the
// file cannot be used; `errors` then says why, in plain language.
export function parseMap(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { map: null, errors: [err('', `The file is not valid JSON: ${e.message}`)] }; }
  const res = migrateMap(raw);
  if (!res.map) return res;
  const errors = validateMap(res.map);
  return { map: errors.length ? null : res.map, errors, migratedFrom: res.migratedFrom };
}

// A map -> the text of its file. Compact but readable: one line per point,
// gate, feature and object, so two versions of a map compare well.
export function serializeMap(map) {
  return `${stringify(map)}\n`;
}

// JSON with flat objects kept on one line. `js: true` writes JavaScript
// object-literal style instead (unquoted keys), for level modules.
export function stringify(value, { js = false, indent = '' } = {}) {
  const key = (k) => (js && /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  const str = (v) => (js ? `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));
  const flat = (v) => v === null || typeof v !== 'object'
    || (Array.isArray(v) ? v.every((x) => x === null || typeof x !== 'object') : Object.values(v).every((x) => x === null || typeof x !== 'object'));
  const inline = (v) => {
    if (typeof v === 'string') return str(v);
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
    const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${key(k)}: ${inline(x)}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  };
  const walk = (v, ind) => {
    if (flat(v)) return inline(v);
    const next = `${ind}  `;
    if (Array.isArray(v)) return `[\n${v.map((x) => next + walk(x, next)).join(',\n')}\n${ind}]`;
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    // a piste: keep its points one per line
    return `{\n${entries.map(([k, x]) => `${next}${key(k)}: ${walk(x, next)}`).join(',\n')}\n${ind}}`;
  };
  return walk(value, indent);
}

// A minimal valid map to start from: one straight piste.
export function emptyMap({ id = 'new-map', name = 'New map', length = 600 } = {}) {
  return {
    format: MAP_FORMAT, version: MAP_VERSION, meta: {},
    id, name, length, start: { x: 0, z: 6 }, gateSpacing: 45, seed: 1,
    race: { gold: 30, silver: 35, bronze: 40 },
    paths: [{ id: 'main', nodes: [{ z: -40, x: 0, w: 16 }, { z: length + 60, x: 0, w: 16 }] }],
    grades: [{ z: 0, grade: 1 }],
    features: [], props: [], scenery: [], gates: [], objects: [],
  };
}
