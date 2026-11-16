// Map <-> game level. Pure. Nothing is ever dropped: a key this file does not
// know is carried across in both directions.

import { generateGates } from '../../js/terrain.js';
import { MAP_FORMAT, MAP_VERSION, ENVELOPE_KEYS, stringify } from './format.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// A game level (the object a js/data/levels/*.js file exports) -> a map.
// If the level has no gate list, the gates are generated exactly as the game
// would generate them, and become the map's own list.
export function levelToMap(level, meta = {}) {
  const body = clone(level);
  const gates = (body.gates || generateGates(body))
    .map(({ index, ...g }) => g)                       // `index` is assigned by the game at load
    .sort((a, b) => a.z - b.z);
  return {
    format: MAP_FORMAT, version: MAP_VERSION, meta: clone(meta),
    ...body,
    grades: body.grades || [],
    props: body.props || [],
    scenery: body.scenery || [],
    gates,
    objects: body.objects || [],
  };
}

// A map -> a level object that js/terrain.js createTerrain() accepts.
// The envelope (format, version, meta) is removed. `gates` stays: the game
// uses a level's own gate list when it has one. `objects` (placeholders the
// game cannot draw yet) is a key the game does not read; it is left out when
// empty so a map without placeholders becomes a plain level.
export function mapToLevel(map) {
  const level = clone(map);
  for (const k of ENVELOPE_KEYS) delete level[k];
  if (!level.objects?.length) delete level.objects;
  return level;
}

// The text of a level module (js/data/levels/<id>.js) for this map.
export function levelModuleSource(map) {
  const level = mapToLevel(map);
  return [
    `// ${level.name}. Written by the map editor (tools/map.mjs convert) from a map file.`,
    '// Edit the map and convert again rather than editing this file by hand.',
    '// x = across the slope (screen right is +), z = distance downhill, in metres.',
    '',
    `export default ${stringify(level, { js: true })};`,
    '',
  ].join('\n');
}
