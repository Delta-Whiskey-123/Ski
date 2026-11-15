// Trees, slalom gates and man-made jumps. Trees and gates are instanced
// (one draw call per kind); only the trees near the rider are placed.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeParts, place, paint } from './geo.js';
import { hash2 } from '../terrain.js';
import { T } from '../tuning.js';

const BEHIND = 150, AHEAD = 60, MAX_TREES = 1400;

function pineGeometry() {
  const cone = new THREE.ConeGeometry(1, 1, 7), trunk = new THREE.CylinderGeometry(0.22, 0.3, 2, 5);
  return mergeParts([
    { geo: trunk, color: 0x5b4636, matrix: place(0, 1, 0) },
    { geo: cone, color: 0x2f5d50, matrix: place(0, 2.4, 0, 2.6, 3.4, 2.6) },
    { geo: cone, color: 0x3d7362, matrix: place(0, 4.2, 0, 2.0, 3.0, 2.0, 0, 1) },
    { geo: cone, color: 0x2f5d50, matrix: place(0, 5.9, 0, 1.3, 2.6, 1.3, 0, 2) },
    { geo: cone, color: 0xf4f8ff, matrix: place(0, 6.9, 0, 0.36, 0.75, 0.36, 0, 2) },   // snow cap
  ]);
}
function blobGeometry() {
  const ico = new THREE.IcosahedronGeometry(1, 0), trunk = new THREE.CylinderGeometry(0.2, 0.3, 4, 5);
  return mergeParts([
    { geo: trunk, color: 0x5b4636, matrix: place(0, 2, 0) },
    { geo: ico, color: 0xd98a6a, matrix: place(0, 5, 0, 1.7, 1.7, 1.7, 0.3, 0.2) },
    { geo: ico, color: 0xc97656, matrix: place(1.3, 4.2, 0.4, 1.2, 1.2, 1.2, 1, 2) },
    { geo: ico, color: 0xd98a6a, matrix: place(-1.2, 4.4, -0.5, 1.3, 1.3, 1.3, 2, 4) },
    { geo: ico, color: 0xe09a7a, matrix: place(0.2, 6.3, 0.3, 1.1, 1.1, 1.1, 3, 6) },
    { geo: ico, color: 0xc97656, matrix: place(-0.3, 4.0, 1.2, 1.1, 1.1, 1.1, 4, 8) },
  ]);
}
function gateGeometry(color, half) {
  const pole = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 5), flag = new THREE.BoxGeometry(0.95, 0.55, 0.05);
  const parts = [];
  for (const dx of [-half, half]) {
    parts.push({ geo: pole, color, matrix: place(dx, 0.95, 0) }, { geo: flag, color, matrix: place(dx - Math.sign(dx) * 0.5, 1.6, 0) });
  }
  return mergeParts(parts);
}
function kickerGeometry(f) {
  const N = 10, w = f.width / 2, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const z = (i / N) * f.length, h = f.height * (i / N) ** 2;
    pos.push(-w, h, z, w, h, z, -w, -0.4, z, w, -0.4, z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, b + 2, a, a, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const e = N * 4; idx.push(e, e + 2, e + 1, e + 1, e + 2, e + 3);     // the lip face
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---- course paint on man-made jumps (visual only)
const PAINT_APPROACH = 16;     // metres of blue spray on the snow before the ramp starts
const PAINT_LINE = 0.55;       // width of the red take-off line, metres

function paintMaterials() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  // the top of the canvas is the lip end: faint far away, dense at the jump
  for (let y = 0; y < 256; y++) {
    const t = 1 - y / 255;
    g.fillStyle = `rgba(28,138,236,${0.8 * t ** 1.7})`; g.fillRect(0, y, 64, 1);
  }
  for (let i = 0; i < 2600; i++) {                      // sprayed speckle, denser toward the jump
    const t = Math.random() ** 0.6, y = (1 - t) * 255;
    g.fillStyle = `rgba(20,120,225,${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 64, y, 2, 2 + Math.random() * 3);
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const common = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return {
    blue: new THREE.MeshLambertMaterial({ map, ...common }),
    red: new THREE.MeshLambertMaterial({ color: 0xe5352b, ...common }),
  };
}

// A strip that hugs the ground from z0 to z1 across the jump's width.
function groundStrip(terrain, f, z0, z1, lift) {
  const N = Math.max(2, Math.ceil((z1 - z0) / 0.8)), w = f.width / 2 - 0.06, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const z = Math.min(z0 + (i / N) * (z1 - z0), f.z + f.length - 0.001);
    for (const x of [f.x - w, f.x + w]) { pos.push(x, terrain.heightAt(x, z) + lift, z); uv.push(x < f.x ? 0 : 1, i / N); }
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function paintJump(scene, terrain, f, mats) {
  const lip = f.z + f.length;
  const blue = new THREE.Mesh(groundStrip(terrain, f, f.z - PAINT_APPROACH, lip - PAINT_LINE, 0.05), mats.blue);
  const red = new THREE.Mesh(groundStrip(terrain, f, lip - PAINT_LINE, lip, 0.06), mats.red);
  for (const m of [blue, red]) { m.receiveShadow = true; m.renderOrder = 1; scene.add(m); }
}

// ---- red safety fencing down both sides of the mountain
const FENCE_HEIGHT = 1.7;

function buildFences(scene, terrain) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(232,52,44,.55)'; g.fillRect(0, 0, 32, 32);          // see-through mesh...
  g.strokeStyle = '#e8342c'; g.lineWidth = 3;
  for (let i = -32; i < 64; i += 8) {                                      // ...with a diamond weave
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 32); g.stroke();
    g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i, 32); g.stroke();
  }
  g.fillStyle = '#d42a23'; g.fillRect(0, 0, 32, 4); g.fillRect(0, 28, 32, 4);   // top and bottom tape
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  const netMat = new THREE.MeshLambertMaterial({ map, transparent: true, side: THREE.DoubleSide });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, FENCE_HEIGHT + 0.3, 5);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xc9241e });
  const dummy = new THREE.Object3D();

  for (const fence of terrain.fences) {
    const pts = fence.points;
    if (pts.length < 2) continue;
    const pos = [], uv = [], idx = [];
    const posts = new THREE.InstancedMesh(postGeo, postMat, pts.length);
    let run = 0;
    pts.forEach((p, i) => {
      const y = terrain.heightAt(p.x, p.z);
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      pos.push(p.x, y + 0.1, p.z, p.x, y + FENCE_HEIGHT, p.z);
      uv.push(run / 1.6, 0, run / 1.6, 1);
      if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      dummy.position.set(p.x, y + (FENCE_HEIGHT + 0.3) / 2 - 0.1, p.z); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const net = new THREE.Mesh(geo, netMat);
    net.frustumCulled = false; posts.frustumCulled = false; posts.castShadow = net.castShadow = true;
    scene.add(net, posts);
  }
}

// ---- start and finish: a painted line across the main piste and an arch over it
function buildLine(scene, terrain, z, finish) {
  const c = terrain.mainAt(z), width = c.w * 2;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
  const g = cv.getContext('2d');
  if (finish) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#16224a' : '#ffffff'; g.fillRect(x * 16, y * 16, 16, 16); }
  } else { g.fillStyle = '#e5352b'; g.fillRect(0, 0, 256, 32); }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const depth = finish ? 3 : 0.8;
  const line = new THREE.Mesh(groundStrip(terrain, { x: c.x, width, z: z - depth / 2, length: depth + 1 }, z - depth / 2, z + depth / 2, 0.05), mat);
  line.receiveShadow = true; line.renderOrder = 1; scene.add(line);

  const colour = finish ? 0x16224a : 0xc9241e, y = terrain.heightAt(c.x, z), H = 6;
  const arch = new THREE.Mesh(mergeParts([
    { geo: new THREE.BoxGeometry(0.5, H, 0.5), color: colour, matrix: place(c.x - c.w - 1, y + H / 2, z) },
    { geo: new THREE.BoxGeometry(0.5, H, 0.5), color: colour, matrix: place(c.x + c.w + 1, y + H / 2, z) },
    { geo: new THREE.BoxGeometry(width + 2.5, 1.3, 0.4), color: finish ? 0xffe14d : 0xffffff, matrix: place(c.x, y + H, z) },
  ]), paint());
  arch.castShadow = true; scene.add(arch);
}

export function createProps(scene, terrain) {
  const dummy = new THREE.Object3D();
  const kinds = {
    pine: new THREE.InstancedMesh(pineGeometry(), paint(), MAX_TREES),
    blob: new THREE.InstancedMesh(blobGeometry(), paint(), MAX_TREES),
  };
  for (const m of Object.values(kinds)) { m.castShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); }
  for (const m of Object.values(kinds)) m.material.flatShading = true;

  // gates: few enough to place once
  for (const red of [true, false]) {
    const list = terrain.gates.filter((g) => g.red === red);
    const mesh = new THREE.InstancedMesh(gateGeometry(red ? 0xe5433d : 0x3b62e0, T.race.gateHalfWidth), paint(), Math.max(1, list.length));
    list.forEach((g, i) => {
      dummy.position.set(g.x, terrain.heightAt(g.x, g.z), g.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = list.length; mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  }

  // man-made kickers, each with course paint: blue spray thickening toward the jump, a red line on the lip
  const paintMats = paintMaterials();
  const kickMat = new THREE.MeshLambertMaterial({ color: 0xeef4ff, side: THREE.DoubleSide, flatShading: true });
  for (const f of terrain.kickers) {
    const m = new THREE.Mesh(kickerGeometry(f), kickMat);
    m.position.set(f.x, terrain.naturalHeightAt(f.x, f.z + f.length / 2), f.z);
    m.castShadow = m.receiveShadow = true; scene.add(m);
    if (f.paint !== false) paintJump(scene, terrain, f, paintMats);
  }

  buildFences(scene, terrain);
  buildLine(scene, terrain, terrain.level.start.z + 4, false);
  buildLine(scene, terrain, terrain.level.length, true);

  let lastBin = null;
  return {
    update(z) {
      const bin = Math.floor(z / terrain.binSize);
      if (bin === lastBin) return;
      lastBin = bin;
      const counts = { pine: 0, blob: 0 };
      for (const p of terrain.propsBetween(z - BEHIND, z + AHEAD + terrain.binSize)) {
        const mesh = kinds[p.type];
        if (!mesh || counts[p.type] >= MAX_TREES) continue;
        dummy.position.set(p.x, terrain.heightAt(p.x, p.z) - 0.2, p.z);
        dummy.rotation.set(0, hash2(p.x, p.z) * 6.28, 0); dummy.scale.setScalar(p.s);
        dummy.updateMatrix(); mesh.setMatrixAt(counts[p.type]++, dummy.matrix);
      }
      for (const k of Object.keys(kinds)) { kinds[k].count = counts[k]; kinds[k].instanceMatrix.needsUpdate = true; }
    },
  };
}
