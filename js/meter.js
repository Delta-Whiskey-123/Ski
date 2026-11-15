// The power meter. Pure logic. main.js feeds it landed tricks and the
// adrenaline button, and passes mods() into the physics step.
//
//   below 80%   no effect
//   80% - 99%   "charged": slightly bigger jumps, more air, faster spins
//   100%        holds until the player fires it
//   adrenaline  much bigger jumps, faster spins, stronger boost; drains to 0
import { T } from './tuning.js';

const IDLE = { jump: 1, spin: 1, boost: 1, air: 1 };

export function createMeter() {
  let level = 0, adrenaline = 0;       // level 0..1; adrenaline = seconds left
  const state = () => (adrenaline > 0 ? 'adrenaline' : level >= 1 ? 'full' : level >= T.meter.chargedAt ? 'charged' : 'idle');
  return {
    get level() { return level; },
    get state() { return state(); },
    get adrenalineLeft() { return adrenaline; },
    reset() { level = 0; adrenaline = 0; },
    set(v) { level = Math.max(0, Math.min(1, v)); },          // for testing from the console
    // value: the trick's base points (before any multiplier). Returns the new state if it changed.
    onTrick(value) {
      if (adrenaline > 0 || value <= 0) return null;
      const before = state();
      level = Math.min(1, level + (value / 100) * (T.meter.fillPer100 / 100));
      return state() !== before ? state() : null;
    },
    fire() {
      if (level < 1 || adrenaline > 0) return false;
      adrenaline = T.meter.adrenalineTime; return true;
    },
    crash() { adrenaline = 0; level = Math.max(0, Math.min(level, 0.999) - T.meter.crashLoss); },
    tick(dt) {
      if (adrenaline <= 0) return;
      adrenaline = Math.max(0, adrenaline - dt);
      level = adrenaline / T.meter.adrenalineTime;
    },
    mods() {
      const M = T.meter, s = state();
      if (s === 'adrenaline') return { jump: M.adrJump, spin: M.adrSpin, boost: M.adrBoost, air: M.adrAir };
      if (s === 'charged' || s === 'full') return { jump: M.chargedJump, spin: M.chargedSpin, boost: 1, air: M.chargedAir };
      return IDLE;
    },
  };
}
