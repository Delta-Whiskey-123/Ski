// Visual-only effects: the track carved in the snow, powder spray, and the
// landing marker under the rider. Nothing here affects the simulation.
import * as THREE from '../../vendor/three.module.min.js';

const TRAIL = 320, SPRAY = 140;

export function createEffects(scene, terrain) {
  // ---- carved track: a ribbon laid along the ground behind the board
  const trailPos = new Float32Array(TRAIL * 6);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const idx = [];
  for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  trailGeo.setIndex(idx);
  const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xc3d2ea, side: THREE.DoubleSide }));
  trail.frustumCulled = false; scene.add(trail);
  const points = [];      // { lx, ly, lz, rx, ry, rz } left and right edge, or { gap: true }

  // ---- spray
  const sprayPos = new Float32Array(SPRAY * 3);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.9, depthWrite: false }));
  spray.frustumCulled = false; scene.add(spray);
  let puffs = [];

  // ---- landing marker: shows where she will come down
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 20), new THREE.MeshBasicMaterial({ color: 0x3355cc, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; scene.add(marker);

  function puff(s, power) {
    if (puffs.length >= SPRAY) return;
    const side = -Math.sign(s.steer || (Math.random() - 0.5));
    puffs.push({
      x: s.x + (Math.random() - 0.5), y: s.y + 0.1, z: s.z - 0.3,
      vx: side * (1 + Math.random() * 3) * power + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2.5 * power,
      vz: -Math.random() * 3 + Math.cos(s.heading) * s.speed * 0.25, t: 0, life: 0.45 + Math.random() * 0.35,
    });
  }

  return {
    burst(s, n) { for (let i = 0; i < n; i++) puff(s, 1.6); },
    update(s, dt) {
      if (!s.air && !s.onIce) {     // ice takes no carved track and throws no powder
        const w = 0.3, c = Math.cos(s.heading), sn = Math.sin(s.heading);
        const p = { lx: s.x - c * w, lz: s.z + sn * w, rx: s.x + c * w, rz: s.z - sn * w };
        p.ly = terrain.heightAt(p.lx, p.lz) + 0.04; p.ry = terrain.heightAt(p.rx, p.rz) + 0.04;
        const last = points[points.length - 1];
        if (!last || last.gap || Math.hypot(p.lx - last.lx, p.lz - last.lz) > 0.5) points.push(p);
        const carve = Math.abs(s.steer) * s.speed / 20 + (s.braking ? 0.8 : 0);
        if (Math.random() < carve * 0.9) puff(s, Math.min(1.5, carve));
      } else if (points.length && !points[points.length - 1].gap) {
        points.push({ gap: true });
      }
      if (points.length > TRAIL) points.splice(0, points.length - TRAIL);
      for (let i = 0; i < TRAIL; i++) {
        const p = points[i], q = points[i + 1];
        if (!p || p.gap) {            // collapse onto a neighbour so no triangle is drawn
          const n = (q && !q.gap) ? q : (points[i - 1] && !points[i - 1].gap ? points[i - 1] : null);
          const x = n ? n.lx : 0, y = n ? n.ly : -100, z = n ? n.lz : 0;
          trailPos.set([x, y, z, x, y, z], i * 6);
        } else trailPos.set([p.lx, p.ly, p.lz, p.rx, p.ry, p.rz], i * 6);
      }
      trailGeo.attributes.position.needsUpdate = true;

      for (const p of puffs) { p.t += dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
      puffs = puffs.filter((p) => p.t < p.life);
      for (let i = 0; i < SPRAY; i++) {
        const p = puffs[i];
        sprayPos[i * 3] = p ? p.x : 0; sprayPos[i * 3 + 1] = p ? p.y : -100; sprayPos[i * 3 + 2] = p ? p.z : 0;
      }
      sprayGeo.attributes.position.needsUpdate = true;

      const g = terrain.heightAt(s.x, s.z), up = s.y - g;
      marker.position.set(s.x, g + 0.08, s.z);
      marker.material.opacity = s.air ? Math.min(0.55, up * 0.25) : 0;
      marker.scale.setScalar(1 + Math.min(1.5, up * 0.12));
    },
    reset() { points.length = 0; puffs = []; },
  };
}
