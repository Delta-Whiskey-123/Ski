// Works out what was landed from what happened in the air. Pure logic.
// Scoring (points, multipliers) is layered on top of this by js/scoring.js.

import { T } from './tuning.js';
import { FLIP_COUNT_WORDS, FLIP_NAMES, AIR_NAMES } from './data/tricks.js';

// spin and flip are the total radians turned in the air (signed).
export function resolveTrick({ spin, flip, airTime, maxHeight }) {
  const halves = Math.min(T.spin.maxHalves, Math.floor(Math.abs(spin) / Math.PI + T.spin.landTolerance));
  const flips = Math.floor(Math.abs(flip) / (Math.PI * 2) + T.flip.landTolerance);
  const flipDir = flip > 0 ? 'front' : 'back';
  const parts = [];
  if (flips > 0) parts.push(`${FLIP_COUNT_WORDS[Math.min(flips, 4)]}${FLIP_NAMES[flipDir]}`);
  if (halves > 0) parts.push(`${halves * 180}`);
  let name = parts.join(' ');
  if (!name && airTime >= T.air.minAirForCallout) name = (AIR_NAMES.find((a) => airTime >= a.min) || {}).name || '';
  return {
    name, halves, degrees: halves * 180, spinDir: spin >= 0 ? 1 : -1,
    flips, flipDir, airTime, maxHeight,
    isTrick: halves > 0 || flips > 0,
  };
}
