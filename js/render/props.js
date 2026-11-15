// Trees, slalom gates and man-made jumps. Trees and gates are instanced
// (one draw call per kind); only the trees near the rider are placed.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeParts, place, paint } from './geo.js';
import { hash2 } from '../terrain.js';

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
function gateGeometry(color) {
  const pole = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 5), flag = new THREE.BoxGeometry(0.95, 0.55, 0.05);
  const parts = [];
  for (const dx of [-1.7, 1.7]) {
    parts.push({ geo: pole, color, matrix: place(dx, 0.95, 0) }, { geo: flag, color, matrix: place(dx + 0.5, 1.6, 0) });
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
    const mesh = new THREE.InstancedMesh(gateGeometry(red ? 0xe5433d : 0x3b62e0), paint(), Math.max(1, list.length));
    list.forEach((g, i) => {
      dummy.position.set(g.x, terrain.heightAt(g.x, g.z), g.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = list.length; mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  }

  // man-made kickers
  const kickMat = new THREE.MeshLambertMaterial({ color: 0xeef4ff, side: THREE.DoubleSide, flatShading: true });
  for (const f of terrain.kickers) {
    const m = new THREE.Mesh(kickerGeometry(f), kickMat);
    m.position.set(f.x, terrain.naturalHeightAt(f.x, f.z + f.length / 2), f.z);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }

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
