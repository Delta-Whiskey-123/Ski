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
  race: { gold: 36, silver: 41, bronze: 48 },   // Race medal times in seconds (final time, penalties included)
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

  // Ice channels: strips of faster surface (top speed x `ice.speedUp` in tuning.js).
  // Each is a centre line (top to bottom, z increasing) with a half-width `w` in
  // metres; a node may carry its own `w`. Both ends round off by themselves.
  // Here: one beside each kicker, as the fast way round it in Race.
  ice: [
    { id: 'ice-small', w: 3.2, nodes: [{ z: 122, x: -1 }, { z: 150, x: -3.5 }, { z: 182, x: -4.5 }] },      // right of the 1 m kicker
    { id: 'ice-middle', w: 3.2, nodes: [{ z: 368, x: 3.5 }, { z: 396, x: 1 }, { z: 424, x: -0.5 }] },// right of the 2 m kicker
    { id: 'ice-big', w: 3.4, nodes: [{ z: 590, x: -7 }, { z: 620, x: -9.5 }, { z: 656, x: -8 }] },          // left of the 4 m kicker
  ],

  // Hand-placed obstacles (the forest is generated around the pistes).
  props: [],

  // Breakable scenery (types in js/data/scenery.js). Hitting one slows her; jumping clears it.
  scenery: [
    { type: 'trailmap', x: -12.5, z: 32 },             // at the start
    { type: 'trailpost', x: 11, z: 44 },
    { type: 'snowman-small', x: 4, z: 118 },
    { type: 'snowman-big', x: -15, z: 226 },
    { type: 'caution', x: -7.5, z: 246 },              // before the 4.5 m ledge
    { type: 'trailpost', x: 10, z: 318 },              // where the tree route splits off
    { type: 'snowman-big', x: -6, z: 352 },
    { type: 'snowman-small', x: 50, z: 420 },          // on the tree route
    { type: 'snowman-small', x: -14, z: 470 },
    { type: 'snowman-big', x: 12, z: 588 },
    { type: 'caution', x: -14, z: 786 },               // either side of the 12 m ledge
    { type: 'caution', x: 14, z: 786 },
    { type: 'snowman-small', x: 7, z: 880 },
    { type: 'snowman-big', x: -9, z: 886 },
  ],
};
