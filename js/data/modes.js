// Game modes are data for the menus. The rules themselves live in js/run.js
// (and js/scoring.js once it exists). Both modes use the same mountain.

export const MODES = [
  {
    id: 'race',
    name: 'Race',
    blurb: 'Fastest to the bottom. Every missed gate adds a second. Land tricks to charge adrenaline.',
    bestLabel: 'Best time',
  },
  {
    id: 'tricks',
    name: 'Tricks Run',
    blurb: 'Big air, spins and flips for points. Bank them at checkpoints before you crash.',
    bestLabel: 'Best score',
  },
];
