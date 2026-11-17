// Riders are data. Stats run 1..10 and feed the physics through
// deriveStats() below; js/tuning.js (stats.low / stats.high) sets how much a
// point is worth. To add a rider, add an object here. No code changes needed.

export const RIDERS = [
  {
    id: 'freya',
    name: 'Freya Lindqvist',
    tagline: 'First lift up. Last one down.',
    look: 'pony',                 // which hair/kit variant js/render/rider-model.js draws
    colours: { top: 0x2f6fe4, topShade: 0x2253b8, legs: 0xe0362c, hair: 0xffd84a, skin: 0xf2c8a6, board: 0xffc531, dark: 0x1b2444 },
    stats: { speed: 6, accel: 6, turn: 7, spin: 8, flip: 7, jump: 6 },
    // Her voice, synthesized by js/audio.js (no words). pitch: speaking pitch in Hz.
    // brightness: formant scale (higher = brighter, younger). lift: how far her pitch
    // rises in excited sounds (higher = more upbeat). chance: fraction of qualifying
    // moments she reacts to; minGap: least seconds between reactions (adrenaline fire
    // and crashes always react). Owner's choice for Freya: occasional.
    voice: { pitch: 255, brightness: 1.12, lift: 1.25, chance: 0.33, minGap: 6 },
  },
];

// Equipment is also data so skis can be added later. Multipliers on top of
// the rider's stats; `kind` picks the model and the stance.
export const EQUIPMENT = [
  { id: 'board-allmountain', kind: 'snowboard', name: 'All-mountain board', mods: { speed: 1, turn: 1, spin: 1, flip: 1, jump: 1, accel: 1 } },
];

export function deriveStats(rider, equipment, T) {
  const out = {};
  for (const [k, v] of Object.entries(rider.stats)) {
    const t = (Math.max(1, Math.min(10, v)) - 1) / 9;
    out[k] = (T.stats.low + (T.stats.high - T.stats.low) * t) * (equipment?.mods?.[k] ?? 1);
  }
  return out;
}
