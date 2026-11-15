// Turns a level (data) into ground you can ask questions of. No drawing here.
//
// Heights are measured from the mountain's base slope, which is treated as
// flat: the downhill pull comes from the level's `grades`, not from real
// descent. So a "ledge" is a plateau that rises gently and then drops away.
//
//   heightAt(x, z)         everything the rider stands on
//   naturalHeightAt(x, z)  the snow surface only (what the terrain mesh draws)
//   corridorOut(x, z)      metres outside the nearest piste edge (<= 0 means on piste)

import { T } from './tuning.js';

const BIN = 50;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v, a, b) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function hash2(x, y, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5;
}

export function createTerrain(level) {
  const seed = level.seed || 1;

  // ---- pistes
  function pathAt(path, z) {
    const n = path.nodes;
    if (z < n[0].z || z > n[n.length - 1].z) return null;
    let i = 0; while (i < n.length - 2 && z > n[i + 1].z) i++;
    const a = n[i], b = n[i + 1], t = smooth(z, a.z, b.z);
    return { x: a.x + (b.x - a.x) * t, w: a.w + (b.w - a.w) * t };
  }
  function corridorOut(x, z) {
    let best = 1e9;
    for (const p of level.paths) {
      const c = pathAt(p, z);
      if (c) best = Math.min(best, Math.abs(x - c.x) - c.w);
    }
    return best;
  }
  // The piste centre nearest to x at this z (used to nudge the rider back in).
  function nearestCentre(x, z) {
    let best = 1e9, cx = 0;
    for (const p of level.paths) {
      const c = pathAt(p, z);
      if (c && Math.abs(x - c.x) - c.w < best) { best = Math.abs(x - c.x) - c.w; cx = c.x; }
    }
    return cx;
  }
  const mainAt = (z) => pathAt(level.paths[0], Math.max(level.paths[0].nodes[0].z, Math.min(level.paths[0].nodes.at(-1).z, z)));

  // ---- features, bucketed by z so lookups stay cheap
  const bins = new Map();
  const span = (f) => f.type === 'ledge' ? [f.z - f.approach, f.z + f.run] : [f.z, f.z + f.length];
  for (const f of level.features) {
    const [z0, z1] = span(f);
    for (let b = Math.floor(z0 / BIN); b <= Math.floor(z1 / BIN); b++) {
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(f);
    }
  }
  const lateral = (f, x, soft = 6) => 1 - smooth(Math.abs(x - f.x), f.width / 2, f.width / 2 + soft);

  function featureHeight(x, z, manMade) {
    const list = bins.get(Math.floor(z / BIN));
    if (!list) return 0;
    let h = 0;
    for (const f of list) {
      if (f.type === 'kicker') {
        if (!manMade) continue;
        const u = (z - f.z) / f.length;
        if (u >= 0 && u < 1 && Math.abs(x - f.x) <= f.width / 2) h += f.height * u * u;
      } else if (manMade) {
        continue;
      } else if (f.type === 'roller') {
        const u = (z - f.z) / f.length;
        if (u > 0 && u < 1) h += f.height * 0.5 * (1 - Math.cos(u * Math.PI * 2)) * lateral(f, x);
      } else if (f.type === 'ledge') {
        const u = z - f.z, lip = f.lip || 0;
        if (u > -f.approach && u < f.run) {
          const top = u < 0
            ? f.drop * smooth(u, -f.approach, 0) + lip * clamp01(1 + u / 8) ** 2
            : (f.drop + lip) * (1 - smooth(u, 0, f.run));
          h += top * lateral(f, x);
        }
      }
    }
    return h;
  }

  function naturalHeightAt(x, z) {
    const out = corridorOut(x, z);
    let h = featureHeight(x, z, false);
    if (out > 0) h += smooth(out, 2, 34) * 3.2 + noise(x * 0.07, z * 0.07, seed) * 1.6 * smooth(out, 0, 12);
    return h;
  }
  const heightAt = (x, z) => naturalHeightAt(x, z) + featureHeight(x, z, true);

  function gradeAt(z) {
    let g = 1;
    for (const s of level.grades || []) if (z >= s.z) g = s.grade;
    return g;
  }

  // ---- forest: generated once, the same every run
  const props = [];
  let minX = 1e9, maxX = -1e9;
  for (const p of level.paths) for (const n of p.nodes) { minX = Math.min(minX, n.x - n.w); maxX = Math.max(maxX, n.x + n.w); }
  const bounds = { minX: minX - 70, maxX: maxX + 70, minZ: -40, maxZ: level.length + 60 };
  const CELL = 6.5;
  for (let gz = bounds.minZ; gz < bounds.maxZ; gz += CELL) {
    for (let gx = bounds.minX; gx < bounds.maxX; gx += CELL) {
      const x = gx + hash2(gx, gz, seed) * CELL, z = gz + hash2(gz, gx, seed + 1) * CELL;
      const out = corridorOut(x, z);
      if (out < 4.5) continue;
      if (hash2(gx * 1.7, gz * 1.3, seed + 2) > 0.42 + smooth(out, 4.5, 14) * 0.3) continue;
      const s = 0.8 + hash2(gx, gz, seed + 3) * 0.9;
      props.push({ type: hash2(gx, gz, seed + 4) > 0.78 ? 'blob' : 'pine', x, z, s, r: 0.5 * s });
    }
  }
  for (const p of level.props || []) props.push(p);
  const propBins = new Map();
  for (const p of props) {
    const b = Math.floor(p.z / BIN);
    if (!propBins.has(b)) propBins.set(b, []);
    propBins.get(b).push(p);
  }
  function propsBetween(z0, z1) {
    const out = [];
    for (let b = Math.floor(z0 / BIN); b <= Math.floor(z1 / BIN); b++) { const l = propBins.get(b); if (l) out.push(...l); }
    return out;
  }

  // ---- slalom gates down the main piste, alternating sides
  const gates = [];
  for (let z = level.start.z + level.gateSpacing, i = 0; z < level.length - 20; z += level.gateSpacing, i++) {
    const c = mainAt(z), side = i % 2 ? 1 : -1;
    gates.push({ x: c.x + side * Math.min(c.w * 0.4, 6), z, red: i % 2 === 0, index: i });
  }

  return {
    level, bounds, gates, props, binSize: BIN,
    heightAt, naturalHeightAt, corridorOut, nearestCentre, gradeAt, mainAt, propsBetween,
    kickers: level.features.filter((f) => f.type === 'kicker'),
    edgeWidth: () => T.ride.edgeWidth,
  };
}
