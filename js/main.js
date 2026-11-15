// Entry point. Owns the game loop and wires the pieces together:
//   input.read() -> rider-physics step() at a fixed 120 Hz -> events -> view.render()
// Keep simulation, input and drawing separate; they only meet here.
import { T } from './tuning.js';
import level1 from './data/levels/level1.js';
import { RIDERS, EQUIPMENT, deriveStats } from './data/riders.js';
import { createTerrain } from './terrain.js';
import { createRider, step, NO_MODS } from './rider-physics.js';
import { createInput } from './input.js';
import { createView } from './render/view.js';
import { createDebug } from './debug.js';

const STEP = 1 / 120;

const rider = RIDERS[0], equipment = EQUIPMENT[0];
const terrain = createTerrain(level1);
const quality = new URLSearchParams(location.search).get('q') || 'high';   // settings screen replaces this
const view = createView(document.getElementById('view'), terrain, rider, quality);
const input = createInput(document.getElementById('view'));
const debug = createDebug(document.getElementById('debug'));

const el = {
  speed: document.getElementById('speed-value'),
  air: document.getElementById('hud-air'),
  callout: document.getElementById('callout'),
  charge: document.getElementById('charge'),
  chargeFill: document.querySelector('#charge i'),
};

let state;
function startRun() {
  state = createRider(level1);
  state.y = terrain.heightAt(state.x, state.z);
  view.snap(state);
}
startRun();
addEventListener('keydown', (e) => { if (e.code === 'KeyR') startRun(); });

function callout(text) {
  el.callout.textContent = text;
  el.callout.classList.remove('show'); void el.callout.offsetWidth; el.callout.classList.add('show');
}

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'takeoff') input.setAirborne(true);
    if (ev.type === 'land') {
      input.setAirborne(false);
      view.effects.burst(state, Math.min(30, 6 + ev.impact * 2));
      if (ev.trick.name) callout(ev.trick.name);
    }
  }
}

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const stats = deriveStats(rider, equipment, T);

  // Input is read once per frame. One-shot presses apply to the first step only.
  const inp = input.read();
  inp.spinGestureRate = dt > 0 ? inp.spinGesture / dt : 0;
  acc += dt;
  while (acc >= STEP) {
    handle(step(state, STEP, inp, terrain, stats, NO_MODS));
    inp.spinTaps = 0; inp.flipPress = 0; inp.adrenaline = false;
    acc -= STEP;
  }
  if (state.z >= level1.length) startRun();      // finish line: results screen comes later

  view.render(state, dt);

  el.speed.textContent = Math.round(state.speed * 2.237);
  el.air.textContent = state.air
    ? `air ${state.airTime.toFixed(1)} s · spin ${Math.round(Math.abs(state.spin) * 180 / Math.PI)}°`
    : '';
  el.charge.style.opacity = state.charging ? 1 : 0;
  el.chargeFill.style.transform = `scaleX(${state.charge})`;
  debug.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For poking from the browser console.
window.summit = { get state() { return state; }, T, terrain, view, input, startRun, step, STEP };
