// The 3D view: renderer, light, camera, and the pieces that draw the world.
// main.js calls view.render(riderState, dt) after the simulation has stepped.
//
// The camera sits downhill of the rider and high above, looking back up the
// slope, so "downhill" is toward the bottom of the screen.
import * as THREE from '../../vendor/three.module.min.js';
import { T } from '../tuning.js';
import { createTerrainMesh } from './terrain-mesh.js';
import { createProps } from './props.js';
import { createRiderModel } from './rider-model.js';
import { createEffects } from './effects.js';
import { createScenery } from './scenery.js';

// Render quality presets (not gameplay, so not in tuning.js).
export const QUALITY = {
  low: { pixelRatio: 1, shadows: 0, terrainRes: 2.5 },
  medium: { pixelRatio: 1.5, shadows: 1024, terrainRes: 2 },
  high: { pixelRatio: 2, shadows: 2048, terrainRes: 1.5 },
};

export function createView(canvas, terrain, rider, quality = 'high') {
  const Q = QUALITY[quality] || QUALITY.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.pixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.shadowMap.enabled = Q.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const sky = 0xdfe7f3;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 120, 230);
  const camera = new THREE.PerspectiveCamera(T.camera.fov, 1, 2, 320);

  // low sun from the upper left: warm light, long blue-tinted shadows
  scene.add(new THREE.HemisphereLight(0xa9c4ff, 0xfff1e0, 1.2));
  const sun = new THREE.DirectionalLight(0xffe0b8, 2.5);
  sun.castShadow = Q.shadows > 0;
  if (Q.shadows) {
    sun.shadow.mapSize.set(Q.shadows, Q.shadows);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 220 });
    sun.shadow.bias = -0.002;
  }
  scene.add(sun, sun.target);

  const ground = createTerrainMesh(scene, terrain, { res: Q.terrainRes });
  const props = createProps(scene, terrain);
  const effects = createEffects(scene, terrain);
  const scenery = createScenery(scene, terrain);
  const model = createRiderModel(rider);
  scene.add(model.root);

  const cam = { x: 0, y: 0, up: 0, lead: T.camera.lead, ready: false };

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  return {
    effects, scenery, renderer, scene, camera,
    // Jump the camera and chunks straight to the rider (start of a run).
    snap(s) { cam.ready = false; ground.update(s.z, 99); effects.reset(); },
    render(s, dt) {
      const C = T.camera;
      const groundY = terrain.heightAt(s.x, s.z), up = Math.max(0, s.y - groundY);
      const k = cam.ready ? Math.min(1, C.smooth * dt) : 1;
      cam.x += (s.x * C.followX - cam.x) * k;
      cam.y += (groundY - cam.y) * k;
      // In the air the aim rises with her, she drifts toward the middle of the screen, and the camera pulls back.
      cam.up += (up - cam.up) * (cam.ready ? Math.min(1, C.smooth * 2 * dt) : 1);
      const wantLead = Math.max(C.minLead, C.lead + Math.max(0, s.speed - 15) * C.speedLead - cam.up * C.airCentre);
      cam.lead += (wantLead - cam.lead) * k;
      cam.ready = true;
      if (camera.fov !== C.fov) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
      const lookZ = s.z + cam.lead;
      const lookY = cam.y + cam.up * C.airTrack, zoom = 1 + (cam.up * C.airLift) / C.height;
      camera.position.set(cam.x, lookY + C.height * zoom, lookZ + C.back * zoom);
      camera.lookAt(cam.x, lookY, lookZ);

      sun.target.position.set(s.x, groundY, s.z + 10);
      sun.position.set(s.x - 70, groundY + 46, s.z - 22);

      ground.update(s.z);
      props.update(s.z);
      model.update(s, dt);
      effects.update(s, dt);
      renderer.render(scene, camera);
    },
  };
}
