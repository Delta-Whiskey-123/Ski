// Breakable scenery types. Place them in a level's `scenery` list as
// { type, x, z } (a trail post may also take `dirs: [1, -1, 1]`, one per
// arrow, +1 = pointing right; otherwise each arrow points a random way).
//
// The hit shape matches the model in js/render/scenery.js, which faces
// downhill (toward the camera): a box `halfW` across by `halfD` deep, or a
// circle of radius `r`. She only hits it if she is lower than `h` above the
// snow, so a big enough jump clears it. `slow` names the js/tuning.js value
// (in the `scenery` group) for how much speed a hit costs.
// Approved look: spikes/scenery.html (owner, 2026-11-16).

export const SCENERY_TYPES = {
  trailpost:       { name: 'Trail direction post', halfW: 1.3, halfD: 0.25, h: 2.75, slow: 'slowSign' },
  trailmap:        { name: 'Trail map board',      halfW: 1.75, halfD: 0.45, h: 3.3, slow: 'slowSign' },
  caution:         { name: 'Caution sign',         halfW: 0.45, halfD: 0.2, h: 2.45, slow: 'slowSign' },
  'snowman-small': { name: 'Small snowman',        r: 0.4, h: 1.4, slow: 'slowSmallSnowman', breaks: true },
  'snowman-big':   { name: 'Big snowman',          r: 0.6, h: 2.25, slow: 'slowBigSnowman', breaks: true },
};
