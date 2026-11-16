// The seeded random source for the generator. Pure. Same seed, same numbers,
// in Chrome and in Node. Never use Math.random in editor/core.

export function createRng(seed) {
  let a = (Math.floor(Number(seed) || 0) ^ 0x9e3779b9) >>> 0;
  const next = () => {                      // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                              // 0 <= n < 1
    range: (lo, hi) => lo + (hi - lo) * next(),        // lo <= n < hi
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),   // whole number, lo..hi inclusive
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// Round to a sensible number of decimals so map files stay readable.
export const round = (v, step = 0.5) => Math.round(v / step) * step;
