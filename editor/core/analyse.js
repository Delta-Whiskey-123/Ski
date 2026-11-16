// One call that works out everything about a map: the level the game would
// load, the real terrain, the jump predictions and the rule warnings. The
// browser editor and the command line both use this and nothing else, so
// they can never disagree. Pure.

import { createTerrain } from '../../js/terrain.js';
import { mapToLevel } from './convert.js';
import { predictJumps } from './predict.js';
import { checkMap } from './rules.js';

export function analyse(map) {
  const level = mapToLevel(map);
  const terrain = createTerrain(level);
  const jumps = predictJumps(terrain);
  const warnings = checkMap(map, terrain, jumps);
  return { level, terrain, jumps, warnings };
}

// Counts for a summary line: { errors, warnings }.
export function countWarnings(warnings) {
  const errors = warnings.filter((w) => w.severity === 'error').length;
  return { errors, warnings: warnings.length - errors };
}
