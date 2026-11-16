// Jump prediction: where a rider leaves the ground on each feature and where
// she comes down, at three named speeds. Pure: no DOM, no storage.
//
// This file contains NO flight maths. It places a rider state uphill of a
// feature and calls the game's real step() against a real createTerrain()
// result until she has taken off and landed. If the game's physics change,
// the predictions change with them.
//
// Tuning: predictions always use the DEFAULTS in js/tuning.js. In a browser,
// tuning.js applies this device's saved overrides when it loads; importing
// this module puts the defaults back IN MEMORY ONLY (the saved overrides are
// not touched, and the game page is a different page, so it is unaffected).

import { T, DEFAULTS, changedTuning } from '../../js/tuning.js';
import { createRider, step } from '../../js/rider-physics.js';
import { RIDERS, EQUIPMENT, deriveStats } from '../../js/data/riders.js';

// How many on-device tuning overrides were set aside (0 in Node).
export const tuningOverridesIgnored = Object.keys(changedTuning()).length;
for (const g of Object.keys(DEFAULTS)) Object.assign(T[g], DEFAULTS[g]);

// The game's fixed simulation step (STEP in js/main.js, which cannot be
// imported outside the game page). CLAUDE.md fixes it at 120 Hz.
export const STEP = 1 / 120;

// Simulation set-up values (not gameplay numbers).
const RUN_UP = 4;          // metres uphill of the feature where the rider is placed
const OVERRUN = 6;         // metres past the feature before giving up on a take-off
const MAX_AIR = 12;        // seconds; safety stop
const ARC_EVERY = 3;       // keep every n-th step of the flight for drawing

const IDLE = { jump: 1, spin: 1, boost: 1, air: 1 };

// The three speeds. Each is the steady speed the game's own riding formula
// settles at for a named way of riding, so no new numbers are invented:
//   slow        carving at full lock (ride.maxHeading), no boost, meter idle
//   normal      straight down the fall line, no input, meter idle
//   adrenaline  straight down, boost held, adrenaline running (meter.adr* mods)
// She then rides straight at the feature (heading 0) at that speed.
export const PROFILES = [
  { id: 'slow', name: 'Slow', boost: false, carve: true, mods: () => IDLE },
  { id: 'normal', name: 'Normal', boost: false, carve: false, mods: () => IDLE },
  { id: 'adrenaline', name: 'Adrenaline', boost: true, carve: false,
    mods: () => ({ jump: T.meter.adrJump, spin: T.meter.adrSpin, boost: T.meter.adrBoost, air: T.meter.adrAir }) },
];

export function riderStats(rider = RIDERS[0], equipment = EQUIPMENT[0]) {
  return deriveStats(rider, equipment, T);
}

// Steady speed for a profile where the slope has this grade: the speed at
// which the acceleration in stepGround() is zero.
export function entrySpeed(profile, grade, stats = riderStats()) {
  const R = T.ride, mods = profile.mods();
  let push = R.slopeAccel * grade * Math.cos(profile.carve ? R.maxHeading : 0);
  if (profile.boost) push += R.boostAccel * stats.accel * mods.boost;
  return Math.max(R.minSpeed, Math.sqrt(push * stats.speed / R.drag));
}

// The stretch of slope a feature occupies, [z0, z1].
export function featureSpan(f) {
  return f.type === 'ledge' ? [f.z - f.approach, f.z + f.run] : [f.z, f.z + f.length];
}

// One flight: ride feature f at this profile, along the line x (default: its
// centre). Returns { speed, air: false } if she never leaves the ground.
export function predictFlight(terrain, f, profile, { x = f.x, stats = riderStats() } = {}) {
  const [z0, z1] = featureSpan(f);
  const mods = profile.mods();
  const speed = entrySpeed(profile, terrain.gradeAt(f.z), stats);
  const inp = { steer: 0, boost: profile.boost, brake: false, jumpHeld: false, spinTaps: 0, spinHold: 0, spinGestureRate: 0, flipPress: 0, flipHold: 0 };

  const s = createRider(terrain.level);
  s.x = x; s.z = z0 - RUN_UP; s.y = terrain.heightAt(s.x, s.z); s.speed = speed;

  let takeoff = null, n = 0;
  const arc = [];
  for (let t = 0; t < MAX_AIR + (z1 - z0 + RUN_UP + OVERRUN) / speed; t += STEP) {
    if (!takeoff) s.speed = speed;                     // hold the entry speed until she leaves the snow
    const events = step(s, STEP, inp, terrain, stats, mods);
    for (const ev of events) {
      if (ev.type === 'takeoff' && !takeoff) {
        takeoff = { x: s.x, z: s.z, y: s.y, vy: s.vy };
        arc.push({ x: s.x, z: s.z, y: s.y, h: s.y - terrain.heightAt(s.x, s.z) });
      }
      if (ev.type === 'land' && takeoff) {
        arc.push({ x: s.x, z: s.z, y: s.y, h: 0 });
        return {
          speed, air: true, airTime: ev.trick.airTime, maxHeight: ev.trick.maxHeight, impact: ev.impact,
          takeoff, landing: { x: s.x, z: s.z, y: s.y }, distance: s.z - takeoff.z, arc,
        };
      }
    }
    if (takeoff && s.air && ++n % ARC_EVERY === 0) arc.push({ x: s.x, z: s.z, y: s.y, h: s.y - terrain.heightAt(s.x, s.z) });
    if (!takeoff && s.z > z1 + OVERRUN) break;
  }
  return { speed, air: false };
}

// Every feature at every profile. Result: [{ index, feature, flights: { slow, normal, adrenaline } }]
export function predictJumps(terrain, features = terrain.level.features) {
  const stats = riderStats();
  return features.map((feature, index) => {
    const flights = {};
    for (const p of PROFILES) flights[p.id] = predictFlight(terrain, feature, p, { stats });
    return { index, feature, flights };
  });
}
