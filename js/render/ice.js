// Draws the ice channels (terrain.ice): one ribbon of glossy pale-blue ice per
// channel, laid on the snow. The look is a texture painted in code: a ragged
// frost rim, a darker line just inside it, and skate-like scratches.
// Drawing only; what counts as ice is decided by terrain.iceOut().
import * as THREE from '../../vendor/three.module.min.js';

const ROW = 1;            // metres between cross-sections along the channel
const COLS = 6;           // quads across the channel
const LIFT = 0.06;        // metres above the snow, so it never flickers against it
const TILE = 16;          // metres of channel per repeat of the texture
const RIM = 0.09;         // fraction of the width taken by the frost rim on each side

function iceTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Anything drawn near the top or bottom is repeated one tile up and down so the texture joins up.
  const tiled = (draw) => { for (const dy of [-H, 0, H]) { g.save(); g.translate(0, dy); draw(); g.restore(); } };

  // the ice itself: deeper blue toward the sides, pale down the middle
  const body = g.createLinearGradient(0, 0, W, 0);
  body.addColorStop(RIM, '#6fb2d8'); body.addColorStop(0.3, '#a9d6ec'); body.addColorStop(0.5, '#c2e5f4');
  body.addColorStop(0.7, '#a9d6ec'); body.addColorStop(1 - RIM, '#6fb2d8');
  g.fillStyle = body; g.fillRect(W * RIM, 0, W * (1 - 2 * RIM), H);

  // broad glossy streaks
  for (let i = 0; i < 7; i++) {
    const x = W * (0.2 + Math.random() * 0.6), y = Math.random() * H, len = 120 + Math.random() * 200;
    tiled(() => {
      const s = g.createLinearGradient(x - 14, 0, x + 14, 0);
      s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,.22)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = s; g.fillRect(x - 14, y, 28, len);
    });
  }

  // scratches: mostly along the channel, a few across
  g.lineCap = 'round';
  for (let i = 0; i < 80; i++) {
    const x = W * (RIM + 0.03 + Math.random() * (1 - 2 * RIM - 0.06)), y = Math.random() * H;
    const across = Math.random() < 0.25, len = across ? 20 + Math.random() * 50 : 50 + Math.random() * 170;
    const ang = across ? (Math.random() - 0.5) * 2.2 : (Math.random() - 0.5) * 0.5;
    const bend = (Math.random() - 0.5) * 30;
    tiled(() => {
      g.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`; g.lineWidth = 0.6 + Math.random() * 1.1;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.sin(ang) * len / 2 + bend, y + Math.cos(ang) * len / 2, x + Math.sin(ang) * len, y + Math.cos(ang) * len);
      g.stroke();
    });
  }

  // the darker line just inside each rim, wandering a little
  for (const side of [0, 1]) {
    g.strokeStyle = 'rgba(58,120,168,.55)'; g.lineWidth = 3;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) {
      const u = RIM + 0.045 + Math.sin(y / H * Math.PI * 4 + side * 2) * 0.008;   // whole waves, so it joins up
      const x = W * (side ? 1 - u : u);
      if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }

  // frost rim: a ragged white edge built from soft blobs
  for (const side of [0, 1]) {
    for (let y = 0; y < H; y += 5) {
      const u = RIM * (0.55 + Math.random() * 0.75), r = 5 + Math.random() * 9;
      const x = W * (side ? 1 - u : u), yy = y + Math.random() * 5;
      tiled(() => {
        g.fillStyle = `rgba(255,255,255,${0.75 + Math.random() * 0.25})`;
        g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill();
      });
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createIce(scene, terrain) {
  if (!terrain.ice.length) return;
  const material = new THREE.MeshPhongMaterial({
    map: iceTexture(), transparent: true, depthWrite: false,
    shininess: 70, specular: 0x8fc8e8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  for (const ch of terrain.ice) {
    const rows = Math.max(2, Math.ceil((ch.z1 - ch.z0) / ROW));
    const pos = [], uv = [], index = [];
    for (let r = 0; r <= rows; r++) {
      const z = ch.z0 + (ch.z1 - ch.z0) * r / rows;
      const p = ch.at(z), half = p.w / (1 - 2 * RIM);   // the rim is drawn outside the edge that counts
      for (let c = 0; c <= COLS; c++) {
        const u = c / COLS, x = p.x + (u * 2 - 1) * half;
        pos.push(x, terrain.heightAt(x, z) + LIFT, z);
        uv.push(u, z / TILE);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c, b = a + COLS + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true; m.renderOrder = 1;
    scene.add(m);
  }
}
