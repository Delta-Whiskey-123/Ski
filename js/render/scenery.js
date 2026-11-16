// Breakable scenery models: trail direction post, trail map board, caution
// sign, small and big snowman (the look approved in spikes/scenery.html).
// Built in code; each piece is 1 to 4 meshes. Every model faces downhill,
// toward the camera. Visual only: js/scenery.js decides hits, main.js tells
// this module which pieces are broken.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeParts, place, paint } from './geo.js';
import { hash2 } from '../terrain.js';
import { SCENERY_TYPES } from '../data/scenery.js';

const WOOD = 0x8a5c3c, WOOD_D = 0x6b4329, METAL = 0x8d939c, ROOF_EDGE = 0x5e3f2b;
const SNOW = 0xf3f6fb, SNOW_S = 0xe3e9f3, COAL = 0x1b1d22;

// seeded random so every piece looks the same each run
function rng(seed) { let s = Math.floor(seed * 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---- textures
function mapTex() {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#efe9da'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b8a38c';
    g.beginPath(); g.moveTo(0, 270); g.lineTo(70, 120); g.lineTo(150, 170); g.lineTo(256, 34); g.lineTo(350, 140); g.lineTo(430, 90); g.lineTo(512, 200); g.lineTo(512, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = '#9c876f';
    g.beginPath(); g.moveTo(256, 34); g.lineTo(350, 140); g.lineTo(512, 220); g.lineTo(512, 320); g.lineTo(300, 320); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(40, 300); g.bezierCurveTo(60, 200, 160, 120, 256, 60); g.bezierCurveTo(350, 120, 450, 200, 470, 300); g.fill();
    g.fillStyle = '#dfe6ef';
    g.beginPath(); g.moveTo(256, 60); g.bezierCurveTo(350, 120, 450, 200, 470, 300); g.lineTo(330, 300); g.fill();
    const run = (col, pts, wd = 6) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(...pts[0]); g.bezierCurveTo(...pts[1], ...pts[2], ...pts[3]); g.stroke(); };
    run('#45a447', [[248, 70], [150, 120], [90, 200], [150, 250]]);
    run('#45a447', [[150, 250], [190, 280], [210, 286], [236, 294]]);
    run('#3d7cc9', [[252, 70], [200, 130], [230, 190], [180, 240]]);
    run('#3d7cc9', [[180, 240], [160, 262], [220, 280], [244, 294]]);
    run('#d7392f', [[256, 66], [280, 120], [230, 180], [262, 292]]);
    run('#23262d', [[262, 70], [330, 110], [300, 160], [340, 200]], 5);
    run('#23262d', [[340, 200], [370, 230], [300, 260], [276, 294]], 5);
    run('#3d7cc9', [[266, 72], [360, 100], [430, 170], [400, 230]]);
    run('#3d7cc9', [[400, 230], [380, 262], [320, 280], [290, 294]]);
    const mark = (kind, x, y, col) => {
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath();
      if (kind === 'c') g.arc(x, y, 9, 0, 7);
      if (kind === 's') g.rect(x - 8, y - 8, 16, 16);
      if (kind === 'd') { g.moveTo(x, y - 11); g.lineTo(x + 11, y); g.lineTo(x, y + 11); g.lineTo(x - 11, y); g.closePath(); }
      g.fill(); g.stroke();
    };
    mark('c', 104, 186, '#45a447'); mark('s', 214, 170, '#3d7cc9'); mark('s', 420, 180, '#3d7cc9');
    mark('d', 318, 150, '#23262d'); mark('s', 250, 200, '#d7392f');
    g.fillStyle = '#7a4a2c'; g.beginPath(); g.moveTo(252, 30); g.lineTo(252, 12); g.lineTo(268, 18); g.lineTo(256, 23); g.lineTo(256, 30); g.fill();
    g.fillStyle = '#6e4a32';
    for (const x of [214, 248, 282]) { g.fillRect(x, 296, 22, 14); g.beginPath(); g.moveTo(x - 3, 297); g.lineTo(x + 11, 287); g.lineTo(x + 25, 297); g.fill(); }
  });
}
function shingleTex() {
  const r = rng(0.37);
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#7d5d47'; g.fillRect(0, 0, w, h);
    const rows = 6, rh = h / rows;
    for (let row = 0; row < rows; row++) {
      for (let x = -32 + (row % 2) * 16; x < w; x += 32) {
        const l = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${150 * l},${116 * l},${92 * l})`; g.fillRect(x + 1, row * rh + 1, 30, rh - 2);
      }
      g.fillStyle = 'rgba(60,40,28,.55)'; g.fillRect(0, row * rh + rh - 3, w, 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 0.5);
  return t;
}
function iconTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6b4329'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f3ead6';
    g.beginPath(); g.moveTo(92, 52); g.lineTo(118, 14); g.lineTo(132, 32); g.lineTo(142, 22); g.lineTo(164, 52); g.fill();
    g.fillStyle = '#6b4329'; g.beginPath(); g.moveTo(110, 26); g.lineTo(118, 14); g.lineTo(126, 26); g.lineTo(118, 22); g.fill();
  });
}
function cautionTex() {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = '#1b1b1b'; g.fillStyle = '#1b1b1b'; g.lineWidth = 14; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(128, 22); g.lineTo(236, 214); g.lineTo(20, 214); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(52, 200); g.lineTo(52, 150); g.lineTo(122, 150); g.lineTo(150, 200); g.closePath(); g.fill();
    g.lineWidth = 9;
    g.beginPath(); g.arc(150, 96, 12, 0, 7); g.fill();
    g.beginPath(); g.moveTo(144, 110); g.lineTo(166, 140); g.moveTo(155, 124); g.lineTo(182, 112); g.moveTo(155, 124); g.lineTo(134, 112);
    g.moveTo(166, 140); g.lineTo(186, 150); g.moveTo(166, 140); g.lineTo(160, 166); g.stroke();
    for (const [x, y, rad] of [[186, 176, 7], [200, 196, 6], [176, 196, 5]]) { g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  });
}

// ---- shapes
function arrowShape(len, h, tip, d) {
  const s = new THREE.Shape();
  s.moveTo(0, -h / 2); s.lineTo(d * len, -h / 2); s.lineTo(d * (len + tip), 0); s.lineTo(d * len, h / 2); s.lineTo(0, h / 2); s.closePath();
  return s;
}
function pentagon(w, hRect, hTop) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, hRect); s.lineTo(0, hRect + hTop); s.lineTo(-w / 2, hRect); s.closePath();
  return s;
}
const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
const post = (r, h, y) => ({ geo: new THREE.CylinderGeometry(r, r * 1.06, h, 7), color: WOOD, matrix: place(0, y, 0, 1, 1, 1, 0, 0.3) });
const beam = (r, len, y, z) => ({ geo: new THREE.CylinderGeometry(r, r * 1.06, len, 7), color: WOOD, matrix: place(0, y, z, 1, 1, 1, 0, 0, Math.PI / 2) });

// ---- 1. trail direction post: green circle, blue square, black diamond
function postParts(dirs) {
  const wood = [post(0.11, 2.7, 1.35), { geo: new THREE.CylinderGeometry(0.115, 0.11, 0.06, 7), color: WOOD_D, matrix: place(0, 2.72, 0) }];
  const face = [];
  const rows = [{ y: 2.3, color: 0x4fae4a, sym: 'circle' }, { y: 1.92, color: 0x3d7cc9, sym: 'square' }, { y: 1.54, color: 0x23262d, sym: 'diamond' }];
  rows.forEach((r, i) => {
    const d = dirs[i];
    wood.push({ geo: extrude(arrowShape(1.05, 0.3, 0.2, d), 0.05), color: WOOD_D, matrix: place(-d * 0.06, r.y, 0.11) });
    face.push({ geo: extrude(arrowShape(0.98, 0.23, 0.15, d), 0.02), color: r.color, matrix: place(-d * 0.025, r.y, 0.155) });
    const sx = d * 0.2, sz = 0.178;
    if (r.sym === 'circle') face.push({ geo: new THREE.TorusGeometry(0.062, 0.012, 4, 16), color: 0xffffff, matrix: place(sx, r.y, sz) });
    else {
      const rot = r.sym === 'diamond' ? Math.PI / 4 : 0, a = 0.06;
      for (const [ox, oy, w, h] of [[0, a, 2 * a + 0.022, 0.022], [0, -a, 2 * a + 0.022, 0.022], [a, 0, 0.022, 2 * a], [-a, 0, 0.022, 2 * a]]) {
        const c = Math.cos(rot), s = Math.sin(rot);
        face.push({ geo: new THREE.BoxGeometry(w, h, 0.01), color: 0xffffff, matrix: place(sx + ox * c - oy * s, r.y + ox * s + oy * c, sz, 1, 1, 1, 0, 0, rot) });
      }
    }
    for (const dy of [-0.1, 0.1]) wood.push({ geo: new THREE.BoxGeometry(0.05, 0.035, 0.09), color: METAL, matrix: place(d * 0.06, r.y + dy, 0.13) });
  });
  return { wood, face };
}

// ---- 2. trail map board under a shingle roof
function mapParts() {
  const wood = [
    { ...post(0.13, 3.0, 1.5), matrix: place(-1.3, 1.5, 0, 1, 1, 1, 0, 0.3) },
    { ...post(0.13, 3.0, 1.5), matrix: place(1.3, 1.5, 0, 1, 1, 1, 0, 0.3) },
    beam(0.1, 3.2, 2.6, 0.06), beam(0.1, 3.1, 0.72, 0.1),
    { geo: new THREE.BoxGeometry(2.3, 1.45, 0.1), color: WOOD_D, matrix: place(0, 1.62, 0.02) },
    { geo: new THREE.BoxGeometry(1.05, 0.28, 0.06), color: WOOD_D, matrix: place(0, 2.6, 0.18) },
    { geo: new THREE.BoxGeometry(3.4, 0.07, 0.46), color: ROOF_EDGE, matrix: place(0, 3.1, 0.2, 1, 1, 1, 0.45) },
    { geo: new THREE.BoxGeometry(3.4, 0.07, 0.46), color: ROOF_EDGE, matrix: place(0, 3.1, -0.2, 1, 1, 1, -0.45) },
    { geo: new THREE.BoxGeometry(3.45, 0.08, 0.12), color: ROOF_EDGE, matrix: place(0, 3.2, 0) },
    { geo: new THREE.BoxGeometry(3.4, 0.1, 0.06), color: WOOD_D, matrix: place(0, 2.99, 0.41, 1, 1, 1, 0.45) },
  ];
  const roof = new THREE.PlaneGeometry(3.4, 0.46);
  const roofFront = roof.clone().applyMatrix4(place(0, 3.14, 0.215, 1, 1, 1, -Math.PI / 2 + 0.45));
  const roofBack = roof.clone().applyMatrix4(place(0, 3.14, -0.215, 1, 1, 1, -Math.PI / 2 - 0.45));
  return {
    wood,
    roof: [roofFront, roofBack],
    map: new THREE.PlaneGeometry(2.12, 1.3).applyMatrix4(place(0, 1.62, 0.075)),
    icon: new THREE.PlaneGeometry(1.0, 0.24).applyMatrix4(place(0, 2.6, 0.212)),
  };
}

// ---- 3. caution sign: cliff-fall symbol, no words
function cautionParts() {
  return {
    wood: [post(0.11, 2.45, 1.22), ...[0.12, 0.6].map((dy) => ({ geo: new THREE.BoxGeometry(0.06, 0.035, 0.09), color: METAL, matrix: place(0, 1.42 + dy, 0.12) }))],
    face: [
      { geo: extrude(pentagon(0.86, 0.42, 0.42), 0.04), color: 0x1d1d1d, matrix: place(0, 1.42, 0.11) },
      { geo: extrude(pentagon(0.78, 0.4, 0.38), 0.02), color: 0xf5cf1c, matrix: place(0, 1.45, 0.15) },
    ],
    symbol: new THREE.PlaneGeometry(0.6, 0.6).applyMatrix4(place(0, 1.78, 0.172)),
  };
}

// ---- 4 & 5. snowmen
const onSphere = (r, cy, up, side = 0) => [Math.sin(side) * r * Math.cos(up), cy + Math.sin(up) * r, Math.cos(side) * Math.cos(up) * r];
function snowmanParts(big, rnd) {
  const P = [];
  const add = (geo, color, m) => P.push({ geo, color, matrix: m });
  const balls = big ? [[0.54, 0.47], [0.4, 1.18], [0.28, 1.7]] : [[0.36, 0.32], [0.26, 0.8], [0.19, 1.15]];
  for (const [r, y] of balls) add(new THREE.IcosahedronGeometry(r, 1), SNOW, place(0, y, 0, 1, 0.94, 1, rnd(), rnd(), rnd()));
  const [hr, hy] = balls[2], [mr, my] = balls[1];
  for (const sx of [-0.33, 0.33]) add(new THREE.BoxGeometry(0.045, 0.045, 0.03), COAL, place(...onSphere(hr * 0.98, hy, 0.25, sx)));
  const nose = onSphere(hr, hy, 0, 0);
  add(new THREE.ConeGeometry(0.05, hr, 6), 0xf08a24, place(nose[0], nose[1], nose[2] + hr * 0.45, 1, 1, 1, Math.PI / 2));
  for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.03, 0.03, 0.02), COAL, place(...onSphere(hr * 0.97, hy, -0.42 + Math.abs(i) * 0.07, i * 0.16)));
  for (const up of [0.45, 0.05, -0.35]) add(new THREE.IcosahedronGeometry(0.035, 0), COAL, place(...onSphere(mr * 0.98, my, up)));
  // scarf: a ring round the neck and a striped tail hanging down
  const [sa, sb] = big ? [0x5d9a26, 0xe2c52a] : [0xd8302a, 0xf2f2f2];
  const neckR = big ? 0.24 : 0.16, neckY = big ? 1.46 : 1.0;
  add(new THREE.TorusGeometry(neckR, 0.065, 5, 12), sa, place(0, neckY, 0, 1, 1, 1, Math.PI / 2));
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.13, 0.08, 0.04), i % 2 ? sb : sa, place(0.12 + i * 0.012, neckY - 0.06 - i * 0.08, neckR + 0.02 - i * 0.01, 1, 1, 1, -0.15, 0, 0.12));
  if (big) {
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.022, 0.03, 0.62, 5), 0x6b4a30, place(side * 0.28, 1.2, 0.02, 1, 1, 1, 0, 0, side * 1.15));
      add(new THREE.IcosahedronGeometry(0.085, 0), 0x9a7b5c, place(side * 0.56, 1.06, 0.03, 1, 1.15, 0.8));
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), 0xd9d2c4, place(side * 0.5, 1.12, 0.03, 1, 1, 1, 0, 0, side * 1.15));
    }
    const hat = new THREE.Matrix4().compose(new THREE.Vector3(0.02, 1.94, -0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0.1)), new THREE.Vector3(1, 1, 1));
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), 0xa58a62, hat.clone().multiply(place(0, 0, 0)));
    add(new THREE.CylinderGeometry(0.17, 0.18, 0.3, 12), 0xb0946b, hat.clone().multiply(place(0, 0.16, 0)));
    add(new THREE.CylinderGeometry(0.183, 0.183, 0.06, 12), 0x5a4632, hat.clone().multiply(place(0, 0.05, 0)));
  } else {
    for (const side of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.014, 0.02, 0.55, 5), 0x5a3d28, place(side * 0.24, 0.98, 0, 1, 1, 1, 0, 0, -side * 1.05));
      add(new THREE.CylinderGeometry(0.01, 0.012, 0.16, 4), 0x5a3d28, place(side * 0.44, 1.16, 0, 1, 1, 1, 0, 0, -side * 0.3));
    }
  }
  return P;
}
// what is left after a hit: snow chunks and the dropped scarf
function debrisParts(big, rnd) {
  const P = [], size = big ? 1.4 : 1, [sa, sb] = big ? [0x5d9a26, 0xe2c52a] : [0xd8302a, 0xf2f2f2];
  for (let i = 0, n = big ? 11 : 9; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.75 * size, r = (0.06 + rnd() * 0.14) * size;
    P.push({ geo: new THREE.IcosahedronGeometry(r, 0), color: rnd() < 0.3 ? SNOW_S : SNOW, matrix: place(Math.cos(a) * d, r * 0.55, Math.sin(a) * d * 0.7, 1, 1, 1, rnd() * 3, rnd() * 3, rnd() * 3) });
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    P.push({ geo: new THREE.BoxGeometry(0.1, 0.035, 0.14), color: i % 2 ? sb : sa, matrix: place(0.55 * size + t * 0.5, 0.02, 0.2 + Math.sin(t * 3) * 0.18, 1, 1, 1, 0, -Math.cos(t * 3) * 0.6, 0) });
  }
  return P;
}

export function createScenery(scene, terrain) {
  // sign faces are unlit so they stay readable with the low sun behind them
  const wood = paint(), face = new THREE.MeshBasicMaterial({ vertexColors: true });
  wood.flatShading = true;
  const tex = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, ...extra });
  let M = null;      // map-board pieces, built on first use
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

  const pieces = terrain.scenery.map((item) => {
    const g = new THREE.Group(), seed = hash2(item.x, item.z, 3);
    let debris = null;
    if (item.type === 'trailpost') {
      const r = rng(seed), dirs = item.dirs || [0, 1, 2].map(() => (r() < 0.5 ? -1 : 1));
      const p = postParts(dirs);
      g.add(mesh(mergeParts(p.wood), wood), mesh(mergeParts(p.face), face));
    } else if (item.type === 'trailmap') {
      if (!M) {
        const p = mapParts();
        M = {
          wood: mergeParts(p.wood), roof: p.roof,
          roofMat: new THREE.MeshLambertMaterial({ map: shingleTex() }),
          map: p.map, mapMat: tex(mapTex()), icon: p.icon, iconMat: tex(iconTex()),
        };
      }
      g.add(mesh(M.wood, wood), mesh(M.map, M.mapMat), mesh(M.icon, M.iconMat));
      for (const r of M.roof) g.add(mesh(r, M.roofMat));
    } else if (item.type === 'caution') {
      const p = cautionParts();
      g.add(mesh(mergeParts(p.wood), wood), mesh(mergeParts(p.face), face));
      const sym = new THREE.Mesh(p.symbol, tex(cautionTex(), { transparent: true, alphaTest: 0.3 }));
      g.add(sym);
    } else if (item.type === 'snowman-small' || item.type === 'snowman-big') {
      const big = item.type === 'snowman-big', r = rng(seed);
      g.add(mesh(mergeParts(snowmanParts(big, r)), wood));
      debris = mesh(mergeParts(debrisParts(big, r)), wood);
    } else return null;
    const k = SCENERY_TYPES[item.type]?.scale ?? 1;
    const y = terrain.heightAt(item.x, item.z) - 0.05 * k;
    g.position.set(item.x, y, item.z); g.scale.setScalar(k);
    scene.add(g);
    if (debris) { debris.position.set(item.x, y, item.z); debris.scale.setScalar(k); debris.visible = false; scene.add(debris); }
    return { item, model: g, debris };
  });

  return {
    // put every piece back (start of a run)
    reset() { for (const p of pieces) if (p) { p.model.visible = true; if (p.debris) p.debris.visible = false; } },
    // a piece was hit: signs vanish, snowmen leave chunks and their scarf
    breakItem(item) {
      const p = pieces[item.id];
      if (!p) return;
      p.model.visible = false;
      if (p.debris) p.debris.visible = true;
    },
  };
}
