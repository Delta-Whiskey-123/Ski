// The level list shown on the level select screen: six slots. A slot with
// `data` is playable; the rest are placeholders for later levels.
import level1 from './level1.js';

export const LEVELS = [
  { id: 'level1', name: level1.name, blurb: 'Wild summit, tree runs and cliffs, down to the resort park.', data: level1 },
  { id: 'level2', name: 'Level 2', locked: true },
  { id: 'level3', name: 'Level 3', locked: true },
  { id: 'level4', name: 'Level 4', locked: true },
  { id: 'level5', name: 'Level 5', locked: true },
  { id: 'level6', name: 'Level 6', locked: true },
];
