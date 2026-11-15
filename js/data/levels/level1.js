// Level 1. A level is data only; js/terrain.js turns it into ground, props
// and gates. See CLAUDE.md, "Adding a level".
//
// THIS IS THE SHORT CORE-FEEL TEST SLOPE. Milestone 3 in MILESTONES.md
// replaces it with the full designed course.
//
// x = across the slope (screen right is +), z = distance downhill, in metres.

export default {
  id: 'level1',
  name: 'First Light',
  length: 900,                      // finish line z
  start: { x: 0, z: 6 },
  gateSpacing: 45,
  seed: 7,

  // Pistes. Each path is a centre line with a half-width `w`. Paths must be
  // listed top to bottom (z increasing). A branch starts and ends on top of
  // another path so the pistes join up.
  paths: [
    { id: 'main', nodes: [
      { z: -40, x: 0, w: 16 }, { z: 60, x: 0, w: 16 }, { z: 180, x: -14, w: 15 }, { z: 300, x: 6, w: 15 },
      { z: 420, x: -10, w: 14 }, { z: 560, x: 4, w: 15 }, { z: 700, x: 0, w: 17 }, { z: 960, x: 0, w: 18 },
    ] },
    { id: 'trees', nodes: [
      { z: 300, x: 6, w: 12 }, { z: 380, x: 44, w: 9 }, { z: 470, x: 52, w: 8 }, { z: 560, x: 40, w: 9 }, { z: 660, x: 2, w: 12 },
    ] },
  ],

  // How steep each stretch is (multiplies the downhill pull). Last entry at or
  // above the rider's z wins.
  grades: [{ z: 0, grade: 1 }, { z: 420, grade: 1.1 }, { z: 700, grade: 1 }],

  // Natural shapes are part of the snow surface. Man-made ones are separate models.
  features: [
    { type: 'roller', x: 0, z: 70, width: 22, length: 18, height: 1.2 },
    { type: 'kicker', x: -12, z: 160, width: 9, length: 5, height: 1.0 },
    { type: 'ledge', x: 4, z: 262, width: 16, drop: 4.5, approach: 46, run: 2.5, lip: 0 },
    { type: 'kicker', x: -9, z: 400, width: 11, length: 7, height: 2.0 },
    { type: 'roller', x: 50, z: 440, width: 12, length: 16, height: 1.4 },
    { type: 'roller', x: 48, z: 480, width: 12, length: 16, height: 1.4 },
    { type: 'roller', x: 0, z: 490, width: 20, length: 20, height: 1.6 },
    { type: 'kicker', x: 2, z: 628, width: 13, length: 11, height: 4.0 },
    { type: 'ledge', x: 0, z: 806, width: 24, drop: 12, approach: 70, run: 3, lip: 0.8 },
  ],

  // Hand-placed obstacles (the forest is generated around the pistes).
  props: [],
};
