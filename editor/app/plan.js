// The 2D plan: drawing and hit-testing. READ ONLY: nothing in this file may
// change the map or the selection. It is handed the store's state and draws it.
//
// Screen layout matches the game: +x to the right, +z (downhill) toward the
// bottom of the screen. Everything is drawn to scale; `view.scale` is pixels
// per metre.

import { T } from '../../js/tuning.js';
import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES, objectOutline } from '../core/catalogue.js';
import { PROFILES } from '../core/predict.js';
import { rule } from '../core/rules.js';
import { pathAt, featureSpan } from '../core/geometry.js';
import { anchor, getItem, sameSelection } from './actions.js';

export const PROFILE_COLOURS = { slow: '#1f9d55', normal: '#2f6fe4', adrenaline: '#d0288a' };
const C = {
  forest: '#dbe5ee', piste: '#ffffff', pisteEdge: '#9fb3c8', centre: '#b9c7d6',
  pine: '#2f5d50', blob: '#c97656', small: '#6e9a8c', fence: '#e5352b',
  kicker: '#a9cdfb', kickerEdge: '#2f6fe4', lip: '#e5352b', roller: 'rgba(96,120,160,.28)', rollerEdge: '#6078a0',
  ledge: 'rgba(138,110,80,.30)', ledgeEdge: '#5b4636',
  gateRed: '#e5433d', gateBlue: '#3b62e0', sign: '#8a5c3c', snow: '#ffffff',
  select: '#ff8a00', text: '#34495e', start: '#c9241e', finish: '#16224a',
};

export function createPlan(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { cx: 0, cz: 300, scale: 1 };
  const layers = { trees: true, arcs: true, warnings: true };
  let W = 1, H = 1;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const sx = (x) => W / 2 + (x - view.cx) * view.scale;
  const sy = (z) => H / 2 + (z - view.cz) * view.scale;
  const toWorld = (px, py) => ({ x: view.cx + (px - W / 2) / view.scale, z: view.cz + (py - H / 2) / view.scale });
  const px = (metres) => metres * view.scale;

  function fit(map, analysis) {
    const b = analysis.terrain.bounds;
    view.scale = Math.max(0.05, Math.min((W - 60) / (b.maxX - b.minX), (H - 30) / (b.maxZ - b.minZ)));
    view.cx = (b.minX + b.maxX) / 2; view.cz = (b.minZ + b.maxZ) / 2;
  }
  function centreOn(x, z, minScale = 0) {
    view.cx = x; view.cz = z; view.scale = Math.max(view.scale, minScale);
  }
  function zoomAt(px_, py_, factor) {
    const before = toWorld(px_, py_);
    view.scale = Math.max(0.05, Math.min(60, view.scale * factor));
    const after = toWorld(px_, py_);
    view.cx += before.x - after.x; view.cz += before.z - after.z;
  }

  // ------------------------------------------------------------ drawing
  function draw({ map, analysis, selection, highlight = [] }) {
    const { terrain, jumps, warnings } = analysis;
    const top = toWorld(0, 0).z, bottom = toWorld(0, H).z, left = toWorld(0, 0).x, right = toWorld(W, 0).x;
    ctx.fillStyle = C.forest; ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    // pistes: white bands, to scale
    const step = Math.max(2, Math.min(10, 4 / view.scale));
    for (const p of map.paths) {
      const z0 = Math.max(p.nodes[0].z, top - 20), z1 = Math.min(p.nodes.at(-1).z, bottom + 20);
      if (z1 <= z0) continue;
      const L = [], R = [];
      for (let z = z0; ; z += step) {
        const zz = Math.min(z, z1), c = pathAt(p, zz);
        L.push([sx(c.x - c.w), sy(zz)]); R.push([sx(c.x + c.w), sy(zz)]);
        if (zz >= z1) break;
      }
      ctx.beginPath();
      L.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath(); ctx.fillStyle = C.piste; ctx.fill();
    }

    // steepness changes, as labels down the left edge
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const g of map.grades || []) {
      const y = sy(g.z);
      if (y < -10 || y > H + 10) continue;
      ctx.strokeStyle = 'rgba(52,73,94,.25)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(`grade ${g.grade}`, 50, y - 8);
    }

    // generated forest and hand-placed props
    if (layers.trees) {
      const dot = Math.max(1, px(0.9));
      for (const p of terrain.propsBetween(top - 10, bottom + 10)) {
        if (p.x < left - 5 || p.x > right + 5) continue;
        const r = Math.max(dot * 0.5, px(p.r || 0.5) * 1.6);
        ctx.fillStyle = p.small ? C.small : p.type === 'blob' ? C.blob : p.type === 'pine' ? C.pine : '#555';
        ctx.fillRect(sx(p.x) - r, sy(p.z) - r, r * 2, r * 2);
      }
    }

    // the red side fences
    ctx.strokeStyle = C.fence; ctx.lineWidth = Math.max(1, px(0.3));
    for (const f of terrain.fences) {
      ctx.beginPath();
      let started = false;
      for (const p of f.points) {
        if (p.z < top - 10 || p.z > bottom + 10) continue;
        if (started) ctx.lineTo(sx(p.x), sy(p.z)); else { ctx.moveTo(sx(p.x), sy(p.z)); started = true; }
      }
      ctx.stroke();
    }

    // piste edges, centre lines and points
    map.paths.forEach((p, pi) => {
      const chosen = selection && ((selection.kind === 'path' && selection.index === pi) || (selection.kind === 'node' && selection.path === pi));
      const z0 = Math.max(p.nodes[0].z, top - 20), z1 = Math.min(p.nodes.at(-1).z, bottom + 20);
      if (z1 > z0) {
        for (const side of [-1, 0, 1]) {
          ctx.beginPath();
          for (let z = z0, i = 0; ; z += step, i++) {
            const zz = Math.min(z, z1), c = pathAt(p, zz);
            if (i) ctx.lineTo(sx(c.x + side * c.w), sy(zz)); else ctx.moveTo(sx(c.x + side * c.w), sy(zz));
            if (zz >= z1) break;
          }
          ctx.strokeStyle = chosen ? C.select : side ? C.pisteEdge : C.centre;
          ctx.lineWidth = side ? 1 : 1; ctx.setLineDash(side ? [] : [4, 5]); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      p.nodes.forEach((n, ni) => {
        const X = sx(n.x), Y = sy(n.z);
        if (Y < -10 || Y > H + 10) return;
        // half-width whiskers show the piste width at this point
        ctx.strokeStyle = 'rgba(52,73,94,.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(n.x - n.w), Y); ctx.lineTo(sx(n.x + n.w), Y); ctx.stroke();
        ctx.fillStyle = pi === 0 ? '#34495e' : '#7a4fb5';
        ctx.fillRect(X - 4, Y - 4, 8, 8);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(X - 4, Y - 4, 8, 8);
        if (ni === 0 && view.scale > 0.25) { ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(p.id, X + 8, Y - 9); }
      });
    });

    // start and finish lines across the main piste
    for (const [z, colour, label] of [[map.start.z + 4, C.start, 'START'], [map.length, C.finish, 'FINISH']]) {
      const c = pathAt(map.paths[0], z);
      if (!c) continue;
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(2, px(0.8));
      ctx.beginPath(); ctx.moveTo(sx(c.x - c.w), sy(z)); ctx.lineTo(sx(c.x + c.w), sy(z)); ctx.stroke();
      ctx.fillStyle = colour; ctx.textAlign = 'left'; ctx.fillText(label, sx(c.x + c.w) + 6, sy(z));
    }

    // features, to scale
    map.features.forEach((f) => {
      const [z0, z1] = featureSpan(f);
      if (z1 < top - 5 || z0 > bottom + 5) return;
      const x0 = sx(f.x - f.width / 2), w = px(f.width);
      if (f.type === 'kicker') {
        ctx.fillStyle = C.kicker; ctx.fillRect(x0, sy(f.z), w, px(f.length));
        ctx.strokeStyle = C.kickerEdge; ctx.lineWidth = 1; ctx.strokeRect(x0, sy(f.z), w, px(f.length));
        ctx.strokeStyle = C.lip; ctx.lineWidth = Math.max(2, px(0.55));
        ctx.beginPath(); ctx.moveTo(x0, sy(z1)); ctx.lineTo(x0 + w, sy(z1)); ctx.stroke();
      } else if (f.type === 'roller') {
        ctx.fillStyle = C.roller; ctx.fillRect(x0, sy(f.z), w, px(f.length));
        ctx.strokeStyle = C.rollerEdge; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x0, sy(f.z + f.length / 2)); ctx.lineTo(x0 + w, sy(f.z + f.length / 2)); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeRect(x0, sy(f.z), w, px(f.length));
      } else {
        const g = ctx.createLinearGradient(0, sy(z0), 0, sy(f.z));
        g.addColorStop(0, 'rgba(138,110,80,0)'); g.addColorStop(1, 'rgba(138,110,80,.45)');
        ctx.fillStyle = g; ctx.fillRect(x0, sy(z0), w, px(f.approach));
        ctx.fillStyle = C.ledgeEdge; ctx.fillRect(x0, sy(f.z), w, Math.max(2, px(f.run)));
        ctx.strokeStyle = 'rgba(91,70,54,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x0, sy(z0), w, px(z1 - z0));
      }
      if (view.scale > 0.9) {
        ctx.fillStyle = C.text; ctx.textAlign = 'left';
        ctx.fillText(f.type === 'ledge' ? `ledge ${f.drop} m` : `${f.type} ${f.height} m`, x0 + w + 5, sy(f.type === 'ledge' ? f.z : (z0 + z1) / 2));
      }
    });

    // predicted flights: a line from take-off to touchdown and a bar where she lands, per speed
    if (layers.arcs) {
      const R = rule('landing-predicted');
      for (const j of jumps) {
        const f = j.feature, [z0] = featureSpan(f);
        if (z0 > bottom + 5) continue;
        const chosen = selection?.kind === 'feature' && selection.index === j.index;
        PROFILES.forEach((p, i) => {
          const fl = j.flights[p.id];
          if (!fl.air || fl.airTime < R.minAir) return;
          if (fl.landing.z < top - 5) return;
          const colour = PROFILE_COLOURS[p.id], off = (i - 1) * Math.min(3, px(0.6));
          if (chosen) {
            ctx.fillStyle = colour; ctx.globalAlpha = 0.16;
            ctx.fillRect(sx(f.x - f.width / 2), sy(fl.landing.z - R.back), px(f.width), px(R.back + R.settle));
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = colour; ctx.globalAlpha = chosen ? 1 : 0.7; ctx.lineWidth = chosen ? 2 : 1.25;
          ctx.beginPath(); ctx.moveTo(sx(fl.takeoff.x) + off, sy(fl.takeoff.z)); ctx.lineTo(sx(fl.landing.x) + off, sy(fl.landing.z)); ctx.stroke();
          ctx.lineWidth = chosen ? 3 : 2;
          ctx.beginPath(); ctx.moveTo(sx(f.x - f.width / 2), sy(fl.landing.z)); ctx.lineTo(sx(f.x + f.width / 2), sy(fl.landing.z)); ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }
    }

    // gates
    const half = T.race.gateHalfWidth;
    map.gates.forEach((g) => {
      const Y = sy(g.z);
      if (Y < -10 || Y > H + 10) return;
      const colour = g.red ? C.gateRed : C.gateBlue, r = Math.max(2, px(0.25));
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(1.5, px(0.12));
      ctx.beginPath(); ctx.moveTo(sx(g.x - half), Y); ctx.lineTo(sx(g.x + half), Y); ctx.stroke();
      ctx.fillStyle = colour;
      for (const d of [-half, half]) { ctx.beginPath(); ctx.arc(sx(g.x + d), Y, r, 0, 7); ctx.fill(); }
    });

    // breakable scenery
    (map.scenery || []).forEach((s) => {
      const Y = sy(s.z), X = sx(s.x), t = SCENERY_TYPES[s.type];
      if (Y < -10 || Y > H + 10 || !t) return;
      if (t.r != null) {
        const r = Math.max(3.5, px(t.r));
        ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fillStyle = C.snow; ctx.fill();
        ctx.strokeStyle = '#3a4a5c'; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        const hw = Math.max(4, px(t.halfW)), hd = Math.max(2, px(t.halfD));
        ctx.fillStyle = s.type === 'caution' ? '#f2c230' : C.sign; ctx.fillRect(X - hw, Y - hd, hw * 2, hd * 2);
        ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 1; ctx.strokeRect(X - hw, Y - hd, hw * 2, hd * 2);
      }
    });

    // placeholder objects, drawn as plain shapes
    (map.objects || []).forEach((o, oi) => {
      const t = OBJECT_TYPES[o.type];
      if (!t) return;
      const far = Math.max(o.z, o.z2 ?? o.z), near = Math.min(o.z, o.z2 ?? o.z);
      if (far < top - 20 || near > bottom + 20) return;
      ctx.fillStyle = t.colour; ctx.strokeStyle = '#22303c'; ctx.lineWidth = 1;
      const outline = objectOutline(o);
      if (t.shape === 'circle') {
        const r = Math.max(3, px(o.r || t.r));
        ctx.beginPath(); ctx.arc(sx(o.x), sy(o.z), r, 0, 7); ctx.fill(); ctx.stroke();
      } else if (t.shape === 'line') {
        ctx.strokeStyle = t.colour; ctx.lineWidth = Math.max(2.5, px(t.r * 2));
        ctx.beginPath(); ctx.moveTo(sx(outline[0].x), sy(outline[0].z)); ctx.lineTo(sx(outline[1].x), sy(outline[1].z)); ctx.stroke();
        if (selection?.kind === 'object' && selection.index === oi) {
          ctx.fillStyle = '#fff'; ctx.strokeStyle = C.select; ctx.lineWidth = 2;
          for (const p of outline) { ctx.beginPath(); ctx.arc(sx(p.x), sy(p.z), 5, 0, 7); ctx.fill(); ctx.stroke(); }
        }
      } else {
        ctx.beginPath(); outline.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z)))); ctx.closePath();
        ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        if (px(t.w) < 6) { ctx.beginPath(); ctx.arc(sx(o.x), sy(o.z), 3, 0, 7); ctx.fill(); ctx.stroke(); }
      }
      if (view.scale > 1.4) { ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(t.name, sx(o.x) + Math.max(6, px(t.shape === 'rect' ? t.w / 2 : t.r)) + 3, sy(o.z)); }
    });

    // start position
    {
      const X = sx(map.start.x), Y = sy(map.start.z);
      ctx.beginPath(); ctx.moveTo(X, Y + 7); ctx.lineTo(X - 6, Y - 5); ctx.lineTo(X + 6, Y - 5); ctx.closePath();
      ctx.fillStyle = C.start; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }

    // warning markers
    if (layers.warnings) {
      for (const w of warnings) {
        const X = sx(w.x), Y = sy(w.z);
        if (Y < -10 || Y > H + 10) continue;
        ctx.beginPath(); ctx.arc(X, Y, 7, 0, 7);
        ctx.fillStyle = w.severity === 'error' ? '#d7263d' : '#f5a623'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('!', X, Y + 0.5);
        ctx.font = '11px system-ui, sans-serif';
      }
    }

    // selection ring, and the items of the warning last clicked
    const ring = (sel, colour, dash) => {
      const a = anchor(map, sel);
      if (!a) return;
      const it = getItem(map, sel);
      ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.setLineDash(dash);
      if (sel.kind === 'feature') {
        const [z0, z1] = featureSpan(it);
        ctx.strokeRect(sx(it.x - it.width / 2) - 3, sy(z0) - 3, px(it.width) + 6, px(z1 - z0) + 6);
      } else {
        ctx.beginPath(); ctx.arc(sx(a.x), sy(a.z), Math.max(9, px(a.r) + 5), 0, 7); ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    for (const h of highlight) if (!sameSelection(h, selection)) ring(h, '#d7263d', [4, 3]);
    if (selection && selection.kind !== 'path') ring(selection, C.select, []);

    // distance ruler down the left edge, and a scale bar
    ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(0, 0, 44, H);
    const tick = [5, 10, 25, 50, 100, 250, 500, 1000].find((t) => px(t) >= 42) || 1000;
    ctx.fillStyle = C.text; ctx.strokeStyle = 'rgba(52,73,94,.5)'; ctx.lineWidth = 1; ctx.textAlign = 'right';
    for (let z = Math.ceil(top / tick) * tick; z <= bottom; z += tick) {
      ctx.beginPath(); ctx.moveTo(38, sy(z)); ctx.lineTo(44, sy(z)); ctx.stroke();
      ctx.fillText(String(z), 36, sy(z));
    }
    const bar = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((t) => px(t) >= 60) || 500;
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W - 20 - px(bar), H - 16); ctx.lineTo(W - 20, H - 16); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.fillText(`${bar} m`, W - 20, H - 26);
  }

  // ------------------------------------------------------------ hit-testing
  // What is under this screen point? Returns a selection or null. Small
  // things win over the big things they sit on.
  function pick({ map }, mx, my) {
    const w = toWorld(mx, my), near = (x, z) => Math.hypot(sx(x) - mx, sy(z) - my);
    let best = null;
    const offer = (sel, dist, reach) => { if (dist <= reach && (!best || dist < best.dist)) best = { sel, dist }; };

    map.paths.forEach((p, pi) => p.nodes.forEach((n, ni) => offer({ kind: 'node', path: pi, index: ni }, near(n.x, n.z), 8)));
    offer({ kind: 'start' }, near(map.start.x, map.start.z), 8);
    map.gates.forEach((g, i) => {
      const dx = Math.max(0, Math.abs(w.x - g.x) - T.race.gateHalfWidth);
      offer({ kind: 'gate', index: i }, Math.hypot(px(dx), sy(g.z) - my), 6);
    });
    (map.scenery || []).forEach((s, i) => { const t = SCENERY_TYPES[s.type]; offer({ kind: 'scenery', index: i }, near(s.x, s.z), Math.max(7, px(t ? (t.r ?? t.halfW) : 0.5))); });
    (map.objects || []).forEach((o, i) => {
      const t = OBJECT_TYPES[o.type];
      if (!t) return;
      if (t.shape === 'line') {
        offer({ kind: 'object', index: i, end: true }, near(o.x2 ?? o.x, o.z2 ?? o.z), 7);
        offer({ kind: 'object', index: i }, near(o.x, o.z), 7);
      } else offer({ kind: 'object', index: i }, near(o.x, o.z), Math.max(7, px(t.shape === 'rect' ? Math.min(t.w, t.d) / 2 : (o.r || t.r))));
    });
    if (best) return best.sel;

    // along a fence run
    for (let i = (map.objects || []).length - 1; i >= 0; i--) {
      const o = map.objects[i], t = OBJECT_TYPES[o.type];
      if (t?.shape !== 'line') continue;
      const ax = sx(o.x), ay = sy(o.z), bx = sx(o.x2 ?? o.x), by = sy(o.z2 ?? o.z);
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1, k = Math.max(0, Math.min(1, ((mx - ax) * (bx - ax) + (my - ay) * (by - ay)) / len2));
      if (Math.hypot(ax + (bx - ax) * k - mx, ay + (by - ay) * k - my) < 5) return { kind: 'object', index: i };
    }
    // inside a feature (the smallest one under the pointer)
    let feat = null;
    map.features.forEach((f, i) => {
      const [z0, z1] = featureSpan(f);
      if (w.z >= z0 && w.z <= z1 && Math.abs(w.x - f.x) <= f.width / 2) {
        const area = f.width * (z1 - z0);
        if (!feat || area < feat.area) feat = { i, area };
      }
    });
    if (feat) return { kind: 'feature', index: feat.i };
    (map.props || []).forEach((p, i) => offer({ kind: 'prop', index: i }, near(p.x, p.z), 7));
    return best ? best.sel : null;
  }

  return { view, layers, resize, draw, pick, fit, centreOn, zoomAt, toWorld, get width() { return W; }, get height() { return H; } };
}

// A side view of one feature's predicted flights: height against distance.
// Read only, like the plan.
export function drawSideView(canvas, terrain, jump) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#f4f7fa'; ctx.fillRect(0, 0, W, H);
  const f = jump.feature, flights = PROFILES.map((p) => [p, jump.flights[p.id]]).filter(([, fl]) => fl.air);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = C.text;
  if (!flights.length) { ctx.fillText('She stays on the snow at every speed.', 8, H / 2); return; }
  const [z0] = featureSpan(f);
  const zA = Math.max(z0, Math.min(...flights.map(([, fl]) => fl.takeoff.z)) - 25), zB = Math.max(...flights.map(([, fl]) => fl.landing.z)) + 10;
  let top = 1, low = 0;
  const ground = [];
  for (let i = 0; i <= 160; i++) { const z = zA + ((zB - zA) * i) / 160, h = terrain.heightAt(f.x, z); ground.push([z, h]); top = Math.max(top, h); low = Math.min(low, h); }
  for (const [, fl] of flights) for (const a of fl.arc) top = Math.max(top, a.y);
  const X = (z) => 6 + ((z - zA) / (zB - zA)) * (W - 12), Y = (y) => H - 14 - ((y - low) / (top - low)) * (H - 26);
  ctx.beginPath(); ctx.moveTo(X(zA), H); ground.forEach(([z, h]) => ctx.lineTo(X(z), Y(h))); ctx.lineTo(X(zB), H); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 1; ctx.stroke();
  for (const [p, fl] of flights) {
    ctx.strokeStyle = PROFILE_COLOURS[p.id]; ctx.lineWidth = 1.75;
    ctx.beginPath(); fl.arc.forEach((a, i) => (i ? ctx.lineTo(X(a.z), Y(a.y)) : ctx.moveTo(X(a.z), Y(a.y)))); ctx.stroke();
    ctx.fillStyle = PROFILE_COLOURS[p.id]; ctx.beginPath(); ctx.arc(X(fl.landing.z), Y(fl.landing.y), 3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(`${Math.round(zA)} m`, 6, H - 3);
  ctx.textAlign = 'right'; ctx.fillText(`${Math.round(zB)} m   (height not to scale: peak ${top.toFixed(1)} m)`, W - 6, H - 3);
}
