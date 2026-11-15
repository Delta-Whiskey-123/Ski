// The rider simulation. Pure logic: no drawing, no sound, no DOM.
// main.js calls step() at a fixed 120 Hz and reacts to the events it returns.
//
// Coordinates: x across (screen right is +), y up, z downhill. heading is the
// angle away from straight downhill (0 = fall line, + = toward +x).
//
// One rule decides take-off for every kind of jump: if the ground falls away
// faster than gravity could pull her down, she is in the air, keeping the
// upward speed the ground was giving her. Kickers, rollers, ledges and pops
// all go through it.

import { T } from './tuning.js';
import { resolveTrick } from './tricks.js';

export function createRider(level) {
  return {
    x: level.start.x, y: 0, z: level.start.z,
    speed: T.ride.minSpeed, heading: 0,
    air: false, vy: 0, vx: 0, vz: 0, groundVy: 0,
    charge: 0, charging: false,
    spin: 0, spinRate: 0, flip: 0, flipDir: 0, flipping: false,
    airTime: 0, maxHeight: 0, takeoffY: 0,
    out: 0,                       // metres outside the piste (<= 0 on piste)
    boosting: false, braking: false, steer: 0,
  };
}

// mods: multipliers supplied by the power meter (all 1 when it is idle).
export const NO_MODS = { jump: 1, spin: 1, boost: 1, air: 1 };

export function step(s, dt, inp, terrain, stats, mods = NO_MODS) {
  const events = [];
  s.steer = inp.steer;
  if (s.air) stepAir(s, dt, inp, terrain, stats, mods, events);
  else stepGround(s, dt, inp, terrain, stats, mods, events);
  return events;
}

function stepGround(s, dt, inp, terrain, stats, mods, events) {
  const R = T.ride;

  // settle any leftover rotation from the last landing
  s.spin *= Math.exp(-14 * dt); s.flip *= Math.exp(-14 * dt);

  const target = inp.steer * R.maxHeading;
  s.heading += (target - s.heading) * (1 - Math.exp(-R.turnRate * stats.turn * dt));

  s.out = terrain.corridorOut(s.x, s.z);
  const deep = s.out > 0 ? 1 + (R.deepSnowDrag - 1) * Math.min(1, s.out / 3) : 1;
  s.boosting = inp.boost && !inp.brake; s.braking = inp.brake;
  let a = R.slopeAccel * terrain.gradeAt(s.z) * Math.cos(s.heading) - R.drag * deep * s.speed * s.speed / stats.speed;
  if (s.boosting) a += R.boostAccel * stats.accel * mods.boost;
  if (s.braking) a -= R.brakeDecel;
  s.speed = Math.max(R.minSpeed, s.speed + a * dt);

  // jump: hold to crouch, release to pop
  let pop = 0;
  if (inp.jumpHeld) { s.charging = true; s.charge = Math.min(1, s.charge + dt / T.jump.chargeTime); }
  else if (s.charging) {
    pop = (T.jump.popMin + (T.jump.popMax - T.jump.popMin) * s.charge) * stats.jump * mods.jump;
    s.charging = false; s.charge = 0;
  }

  s.x += Math.sin(s.heading) * s.speed * dt;
  s.z += Math.cos(s.heading) * s.speed * dt;

  // far edge of the deep snow: a firm push back toward the piste
  const over = terrain.corridorOut(s.x, s.z) - R.edgeWidth;
  if (over > 0) {
    const dir = Math.sign(terrain.nearestCentre(s.x, s.z) - s.x);
    s.x += dir * Math.min(over, over * R.edgePush * dt + 0.02);
  }

  const g = terrain.heightAt(s.x, s.z);
  const vyG = (g - s.y) / dt;
  const fallsAway = (s.groundVy - vyG) / dt > T.air.gravity * T.jump.launchSharpness;
  if (pop > 0 || fallsAway) {
    s.air = true;
    s.vy = (s.groundVy > 0 ? s.groundVy * T.jump.launchScale * mods.jump : s.groundVy) + pop;
    s.vx = Math.sin(s.heading) * s.speed; s.vz = Math.cos(s.heading) * s.speed;
    s.y += s.vy * dt;
    s.airTime = 0; s.maxHeight = 0; s.takeoffY = s.y;
    s.spin = 0; s.spinRate = 0; s.flip = 0; s.flipping = false; s.flipDir = 0;
    events.push({ type: 'takeoff', popped: pop > 0 });
  } else {
    s.y = g; s.groundVy = vyG;
  }
}

function stepAir(s, dt, inp, terrain, stats, mods, events) {
  const S = T.spin;
  s.vy -= (T.air.gravity / mods.air) * dt;
  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  s.airTime += dt;

  // ---- spins: key taps, key hold, or finger circles
  const maxRate = S.maxRate * stats.spin * mods.spin;
  let driven = false;
  if (inp.spinTaps) { s.spinRate += inp.spinTaps * S.tapImpulse * stats.spin * mods.spin; driven = true; }
  if (inp.spinGestureRate) {
    const want = inp.spinGestureRate * S.touchGain * stats.spin * mods.spin;
    s.spinRate += (want - s.spinRate) * Math.min(1, 12 * dt); driven = true;
  }
  if (inp.spinHold && Math.abs(s.spinRate) < S.holdRate) { s.spinRate = inp.spinHold * S.holdRate; driven = true; }
  if (!driven && !inp.spinHold) s.spinRate *= Math.exp(-S.damping * dt);
  s.spinRate = Math.max(-maxRate, Math.min(maxRate, s.spinRate));
  const cap = S.maxHalves * Math.PI;
  s.spin = Math.max(-cap, Math.min(cap, s.spin + s.spinRate * dt));

  // ---- flips: a press starts one, holding chains them
  const want = inp.flipPress || (!s.flipping ? inp.flipHold : 0);
  if (want && !s.flipping) { s.flipping = true; s.flipDir = want; }
  if (s.flipping) {
    const before = s.flip;
    s.flip += s.flipDir * T.flip.rate * stats.flip * mods.spin * dt;
    const turn = Math.PI * 2;
    const crossed = Math.floor(Math.abs(s.flip) / turn) > Math.floor(Math.abs(before) / turn);
    if (crossed && inp.flipHold !== s.flipDir) {
      s.flip = Math.round(s.flip / turn) * turn; s.flipping = false;
    }
  }

  const g = terrain.heightAt(s.x, s.z);
  s.maxHeight = Math.max(s.maxHeight, s.y - g);
  if (s.y <= g && s.vy <= 0) {
    const trick = resolveTrick({ spin: s.spin, flip: s.flip, airTime: s.airTime, maxHeight: s.maxHeight });
    s.air = false; s.y = g;
    s.speed = Math.max(T.ride.minSpeed, Math.hypot(s.vx, s.vz));
    // ground speed she is about to follow, so the landing does not re-launch her
    const ahead = terrain.heightAt(s.x + s.vx * dt, s.z + s.vz * dt);
    s.groundVy = (ahead - g) / dt;
    // keep only the leftover part-turn so the model eases back to riding
    s.spin = wrap(s.spin, Math.PI); s.flip = wrap(s.flip, Math.PI * 2);
    s.spinRate = 0; s.flipping = false; s.charge = 0; s.charging = false;
    events.push({ type: 'land', trick, impact: -s.vy });
    s.vy = 0;
  }
}

// remainder of a after removing whole multiples of m, in the range -m/2..m/2
function wrap(a, m) { return a - Math.round(a / m) * m; }
