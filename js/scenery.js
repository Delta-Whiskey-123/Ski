// Breakable scenery: watches the rider touch signs and snowmen. Pure logic.
// Each piece breaks once per run; main.js reacts to the `break` events
// (slows her through rider-physics, hides the model through the view).
import { T } from './tuning.js';
import { SCENERY_TYPES } from './data/scenery.js';

export function createSceneryTracker(terrain) {
  const broken = new Set();
  return {
    broken,
    reset() { broken.clear(); },
    update(s) {
      const events = [], R = T.scenery.riderRadius;
      for (const item of terrain.sceneryNear(s.z)) {
        if (broken.has(item.id)) continue;
        const type = SCENERY_TYPES[item.type];
        if (!type) continue;
        if (s.y - terrain.heightAt(s.x, s.z) >= type.h) continue;     // flying over it
        const dx = s.x - item.x, dz = s.z - item.z;
        const hit = type.r != null
          ? Math.hypot(dx, dz) < type.r + R
          : Math.abs(dx) < type.halfW + R && Math.abs(dz) < type.halfD + R;
        if (!hit) continue;
        broken.add(item.id);
        events.push({ type: 'break', item, cut: T.scenery[type.slow] });
      }
      return events;
    },
  };
}
