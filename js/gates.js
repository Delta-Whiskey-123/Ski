// Watches the rider go past slalom gates. Pure logic.
//
// A gate belongs to one piste. It only counts, as passed or missed, for a
// rider who is on that piste when she reaches it; gates on a route she did
// not take are ignored. Passing means crossing the gate's z between its poles
// (in the air counts too).
import { T } from './tuning.js';

export function createGateTracker(terrain) {
  const gates = terrain.gates;        // sorted by z
  let next = 0;
  return {
    reset(z = -Infinity) { next = 0; while (next < gates.length && gates[next].z <= z) next++; },
    // Call after every physics step. Returns [{ type: 'gate', passed, gate }].
    update(s) {
      const events = [];
      while (next < gates.length && s.z >= gates[next].z) {
        const g = gates[next++];
        if (terrain.nearestPathId(s.x, g.z) !== g.path) continue;
        events.push({ type: 'gate', passed: Math.abs(s.x - g.x) <= T.race.gateHalfWidth, gate: g });
      }
      return events;
    },
  };
}
