// Draws the snow surface in chunks around the rider, sampled from
// terrain.naturalHeightAt(). Man-made features are separate models (props.js).
import * as THREE from '../../vendor/three.module.min.js';

const CHUNK = 48;                 // metres of slope per chunk
const BEHIND = 150, AHEAD = 60;   // metres kept uphill / downhill of the rider

function snowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(140,168,214,.20)'; g.fillRect(x, 0, 3, 128); }   // corduroy
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(135,160,208,${Math.random() * 0.16})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2 + Math.random() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTerrainMesh(scene, terrain, { res = 1.5 } = {}) {
  const { minX, maxX } = terrain.bounds;
  const cols = Math.ceil((maxX - minX) / res), rows = Math.ceil(CHUNK / res);
  const material = new THREE.MeshLambertMaterial({ map: snowTexture(), vertexColors: true, flatShading: true });
  const chunks = new Map();

  // the triangle index list is the same for every chunk
  const index = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + cols + 1;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }

  function build(ci) {
    const n = (cols + 1) * (rows + 1);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let i = 0;
    for (let r = 0; r <= rows; r++) {
      const z = ci * CHUNK + r * res;
      for (let c = 0; c <= cols; c++, i++) {
        const x = minX + c * res, h = terrain.naturalHeightAt(x, z);
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        uv[i * 2] = x / 4; uv[i * 2 + 1] = z / 4;
        const out = terrain.corridorOut(x, z);
        const steep = Math.abs(terrain.naturalHeightAt(x, z + 1) - terrain.naturalHeightAt(x, z - 1)) / 2;
        let rr = 1, gg = 1, bb = 1;
        if (out > 0) { const t = Math.min(1, out / 6); rr = 1 - 0.1 * t; gg = 1 - 0.06 * t; }   // powder: a touch bluer
        if (steep > 1.1) { rr = 0.42; gg = 0.4; bb = 0.44; }                                    // exposed rock
        col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; scene.add(m);
    return m;
  }

  return {
    // Keep the chunks around z built. Builds at most `budget` new chunks per call.
    update(z, budget = 1) {
      const c0 = Math.floor((z - BEHIND) / CHUNK), c1 = Math.floor((z + AHEAD) / CHUNK);
      for (const [ci, m] of chunks) if (ci < c0 || ci > c1) { scene.remove(m); m.geometry.dispose(); chunks.delete(ci); }
      for (let ci = c1; ci >= c0 && budget > 0; ci--) if (!chunks.has(ci)) { chunks.set(ci, build(ci)); budget--; }
    },
  };
}
