// The rider, built from boxes in code and coloured from her data
// (js/data/riders.js). She stands sideways on the board, facing +x, and
// travels along the model's +z.
//
// Node order, outermost first:
//   root (position) > yaw (heading) > flip (about hip height) > spin > lean > body
import * as THREE from '../../vendor/three.module.min.js';

const SCALE = 1.75;       // drawn larger than life so she reads from the high camera
const HIP = 0.85;

export function createRiderModel(rider) {
  const C = rider.colours;
  const root = new THREE.Group(), yaw = new THREE.Group(), flip = new THREE.Group(),
    spin = new THREE.Group(), lean = new THREE.Group(), body = new THREE.Group();
  root.add(yaw); yaw.add(flip); flip.add(spin); spin.add(lean); lean.add(body);
  flip.position.y = HIP; spin.position.y = -HIP;
  root.scale.setScalar(SCALE);

  const mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return mats.get(c); };
  const box = (parent, w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m;
  };

  // board (not part of the crouching body)
  box(lean, 0.36, 0.06, 1.6, C.board, 0, 0.03, 0);
  box(lean, 0.36, 0.062, 0.3, C.legs, 0, 0.031, 0.5);
  box(lean, 0.22, 0.16, 0.3, C.dark, 0, 0.14, 0.32);        // boots
  box(lean, 0.22, 0.16, 0.3, C.dark, 0, 0.14, -0.32);

  // legs, knees bent toward +x
  box(body, 0.2, 0.42, 0.2, C.legs, 0.07, 0.4, 0.3, 0, 0, -0.3);
  box(body, 0.2, 0.42, 0.2, C.legs, 0.07, 0.4, -0.3, 0, 0, -0.3);
  box(body, 0.21, 0.34, 0.21, C.legs, 0.06, 0.7, 0.24, 0, 0, 0.35);
  box(body, 0.21, 0.34, 0.21, C.legs, 0.06, 0.7, -0.24, 0, 0, 0.35);
  box(body, 0.3, 0.2, 0.56, C.legs, 0, 0.88, 0);            // hips
  box(body, 0.26, 0.1, 0.5, 0xffffff, 0.01, 1.0, 0);        // base layer band
  // torso, slightly forward
  box(body, 0.3, 0.42, 0.44, C.top, 0.05, 1.24, 0, 0, 0, -0.12);
  box(body, 0.31, 0.1, 0.45, 0xffffff, 0.06, 1.3, 0, 0, 0, -0.12);   // chest stripe
  // arms out for balance: leading arm forward-down, trailing arm up
  box(body, 0.13, 0.13, 0.5, C.top, 0.08, 1.3, 0.44, 0.35, 0, 0);
  box(body, 0.13, 0.13, 0.5, C.topShade, 0.08, 1.4, -0.44, 0.4, 0, 0);
  box(body, 0.14, 0.14, 0.14, C.dark, 0.08, 1.2, 0.7);      // gloves
  box(body, 0.14, 0.14, 0.14, C.dark, 0.08, 1.52, -0.68);
  // head, looking downhill
  const head = new THREE.Group(); head.position.set(0.06, 1.62, 0); head.rotation.y = -0.9; body.add(head);
  box(head, 0.24, 0.25, 0.24, C.skin, 0, 0, 0);
  box(head, 0.27, 0.12, 0.27, C.hair, 0, 0.13, 0);
  box(head, 0.06, 0.2, 0.27, C.hair, -0.13, 0.02, 0);
  box(head, 0.05, 0.08, 0.2, 0xff9d3c, 0.12, 0.14, 0);      // goggles pushed up
  // ponytail: swings out with spin speed
  const tail = new THREE.Group(); tail.position.set(-0.14, 0.12, 0); head.add(tail);
  box(tail, 0.5, 0.1, 0.1, C.hair, -0.25, 0, 0);
  box(tail, 0.22, 0.08, 0.08, C.hair, -0.56, -0.03, 0);

  let crouch = 0, tailSwing = 0;
  return {
    root,
    update(s, dt) {
      root.position.set(s.x, s.y, s.z);
      yaw.rotation.y = s.heading;
      flip.rotation.x = s.flip;
      spin.rotation.y = s.spin;
      lean.rotation.z = s.air ? 0 : -s.steer * 0.38;

      const want = s.air ? 0.16 : s.charging ? 0.12 + s.charge * 0.2 : s.braking ? 0.1 : 0;
      crouch += (want - crouch) * Math.min(1, 14 * dt);
      body.scale.y = 1 - crouch; body.position.y = 0;

      const swing = s.air ? Math.max(-1.2, Math.min(1.2, -s.spinRate * 0.12)) : 0;
      tailSwing += (swing - tailSwing) * Math.min(1, 8 * dt);
      tail.rotation.y = tailSwing; tail.rotation.z = s.air ? 0.2 : -0.5 + Math.min(0.5, s.speed * 0.02);
    },
  };
}
