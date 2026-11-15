// One run down the mountain: the clock, the gates, and the result. Pure logic.
//
// Modes (js/data/modes.js):
//   race    fastest time wins; each missed gate adds race.gatePenalty seconds
//   tricks  score wins (scoring itself is js/scoring.js, a later milestone)
import { T } from './tuning.js';

export function createRun(mode, level) {
  const r = {
    mode, time: 0, running: false, finished: false,
    gatesPassed: 0, gatesMissed: 0,
    tricks: 0, bestTrick: null, topSpeed: 0, airTime: 0,
  };
  const penalty = () => (mode === 'race' ? r.gatesMissed * T.race.gatePenalty : 0);
  return {
    get data() { return r; },
    get time() { return r.time; },
    get penalty() { return penalty(); },
    get total() { return r.time + penalty(); },        // what a Race is judged on
    start() { r.running = true; },
    tick(dt, s) {
      if (!r.running) return;
      r.time += dt;
      r.topSpeed = Math.max(r.topSpeed, s.speed);
    },
    onGate(passed) { if (passed) r.gatesPassed++; else r.gatesMissed++; },
    onLand(trick, value) {
      r.airTime += trick.airTime;
      if (!trick.isTrick) return;
      r.tricks++;
      if (!r.bestTrick || value > r.bestTrick.value) r.bestTrick = { name: trick.name, value };
    },
    finish() {
      r.running = false; r.finished = true;
      const total = r.time + penalty(), m = level.race || {};
      const medal = total <= m.gold ? 'gold' : total <= m.silver ? 'silver' : total <= m.bronze ? 'bronze' : null;
      return { ...r, penalty: penalty(), total, medal: mode === 'race' ? medal : null };
    },
  };
}

// 83.456 -> "1:23.45"
export function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${(Math.floor(s * 100) / 100).toFixed(2)}`;
}
