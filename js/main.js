// Entry point. Owns the game loop and the run flow, and wires the pieces together:
//   input.read() -> rider-physics step() at a fixed 120 Hz -> events -> view.render()
// Keep simulation, input and drawing separate; they only meet here.
//
// Phases: menu -> countdown -> riding -> finished (coasting past the line) -> menu (results)
//         paused can interrupt countdown or riding.
import { T } from './tuning.js';
import { LEVELS } from './data/levels/index.js';
import { RIDERS, EQUIPMENT, deriveStats } from './data/riders.js';
import { createTerrain } from './terrain.js';
import { createRider, step } from './rider-physics.js';
import { trickValue } from './tricks.js';
import { createInput } from './input.js';
import { createGateTracker } from './gates.js';
import { createMeter } from './meter.js';
import { createRun, formatTime } from './run.js';
import { save } from './save.js';
import { createView } from './render/view.js';
import { createDebug } from './debug.js';
import { createUI, formatBest } from './ui.js';

const STEP = 1 / 120;

// One level and one rider exist so far, so the world is built once at start-up.
// When more arrive, rebuild terrain and view when the choice changes.
const level = LEVELS[0].data;
const rider = RIDERS[0], equipment = EQUIPMENT[0];
const terrain = createTerrain(level);
const quality = new URLSearchParams(location.search).get('q') || 'high';   // settings screen replaces this
const view = createView(document.getElementById('view'), terrain, rider, quality);
const input = createInput(document.getElementById('view'));
const debug = createDebug(document.getElementById('debug'));
const gates = createGateTracker(terrain);
const meter = createMeter();

const $ = (id) => document.getElementById(id);
const el = {
  speed: $('speed-value'), air: $('hud-air'), top: $('hud-top'), callout: $('callout'), flash: $('flash'),
  charge: $('charge'), chargeFill: document.querySelector('#charge i'), countdown: $('countdown'),
  meter: $('meter'), meterFill: $('meter-fill'), meterMark: $('meter-mark'),
};

let phase = 'menu', resumeTo = 'riding';
let mode = save.mode, state, run, countdown = 0, coast = 0;

function resetRun() {
  state = createRider(level);
  state.y = terrain.heightAt(state.x, state.z);
  run = createRun(mode, level);
  gates.reset(state.z); meter.reset();
  view.snap(state);
}
function beginRun() {
  resetRun();
  ui.hide();
  phase = 'countdown'; countdown = 3 * T.race.countdownStep;
}

const ui = createUI({
  onStart(choice) { mode = choice.mode; beginRun(); },
  onResume() { ui.hide(); phase = resumeTo; },
  onRestart: beginRun,
  onQuit() { resetRun(); phase = 'menu'; ui.show('title'); },
});
resetRun();

function pause() {
  if (phase !== 'riding' && phase !== 'countdown') return;
  resumeTo = phase; phase = 'paused'; ui.show('pause');
}
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (phase === 'paused') { ui.hide(); phase = resumeTo; } else pause();
  }
  if (e.code === 'KeyR' && (phase === 'riding' || phase === 'finished')) beginRun();
});
$('btn-pause').addEventListener('pointerdown', (e) => { e.stopPropagation(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function show(node, text, cls = '') {
  node.textContent = text;
  node.className = cls; void node.offsetWidth; node.classList.add('show');
}
const callout = (text) => show(el.callout, text);
const flash = (text, kind) => show(el.flash, text, kind);

function handle(events) {
  for (const ev of events) {
    if (ev.type === 'takeoff') input.setAirborne(true);
    if (ev.type === 'land') {
      input.setAirborne(false);
      view.effects.burst(state, Math.min(30, 6 + ev.impact * 2));
      if (ev.trick.name) callout(ev.trick.name);
      const value = trickValue(ev.trick);
      run.onLand(ev.trick, value);
      const now = meter.onTrick(value);
      if (now === 'charged') flash('CHARGED', 'good');
      if (now === 'full') flash('ADRENALINE READY', 'good');
    }
    if (ev.type === 'gate') {
      run.onGate(ev.passed);
      if (!ev.passed && mode === 'race') flash(`GATE MISSED  +${T.race.gatePenalty.toFixed(1)} s`, 'bad');
    }
  }
}

function finish() {
  const res = run.finish();
  phase = 'finished'; coast = T.race.finishCoast;
  let newBest = false;
  if (mode === 'race') newBest = save.record(level.id, 'race', res.total);
  finish.result = { res, info: { newBest, best: save.best(level.id, mode), targets: level.race } };
  callout(mode === 'race' ? formatTime(res.total) : 'FINISH');
}

const COAST_INPUT = { steer: 0, boost: false, brake: true, jumpHeld: false, spinTaps: 0, spinHold: 0, spinGestureRate: 0, flipPress: 0, flipHold: 0 };

function stat(label, value, cls = '') { return `<div class="${cls}"><small>${label}</small>${value}</div>`; }

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // Input is read once per frame (also while paused, so presses do not pile up).
  tick(dt, input.read());
  requestAnimationFrame(frame);
}

// One frame of the game: dt seconds with this input. Also callable from the
// console (summit.tick) to drive the real game loop without waiting for frames.
function tick(dt, inp) {
  const stats = deriveStats(rider, equipment, T);
  inp.spinGestureRate = dt > 0 ? (inp.spinGesture || 0) / dt : 0;

  if (phase === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) { phase = 'riding'; run.start(); acc = 0; }
  }

  if (phase === 'riding' || phase === 'finished') {
    if (phase === 'riding' && inp.adrenaline && meter.fire()) callout('ADRENALINE!');
    acc += dt;
    while (acc >= STEP) {
      const riding = phase === 'riding';
      handle(step(state, STEP, riding ? inp : COAST_INPUT, terrain, stats, meter.mods()));
      if (riding) {
        handle(gates.update(state));
        meter.tick(STEP); run.tick(STEP, state);
        if (state.z >= level.length) finish();
      }
      inp.spinTaps = 0; inp.flipPress = 0;
      acc -= STEP;
    }
    if (phase === 'finished') {
      coast -= dt;
      if (coast <= 0) { phase = 'menu'; ui.showResults(finish.result.res, finish.result.info); }
    }
  }

  view.render(state, phase === 'paused' || phase === 'menu' ? 0 : dt);

  // ---- HUD
  if (phase !== 'menu' && phase !== 'paused') {
    el.countdown.textContent = phase === 'countdown' ? Math.ceil(countdown / T.race.countdownStep) : '';
    el.speed.textContent = Math.round(state.speed * 2.237);
    el.air.textContent = state.air ? `air ${state.airTime.toFixed(1)} s · spin ${Math.round(Math.abs(state.spin) * 180 / Math.PI)}°` : '';
    el.charge.style.opacity = state.charging ? 1 : 0;
    el.chargeFill.style.transform = `scaleX(${state.charge})`;
    const d = run.data;
    el.top.innerHTML = mode === 'race'
      ? stat('MISSED', d.gatesMissed, d.gatesMissed ? 'bad' : '') + stat('BEST', formatBest('race', save.best(level.id, 'race'))) + stat('TIME', formatTime(run.total))
      : stat('TRICKS', d.tricks) + stat('TIME', formatTime(run.time));
    el.meterFill.style.transform = `scaleY(${meter.level})`;
    el.meterMark.style.bottom = `${T.meter.chargedAt * 100}%`;
    el.meter.className = meter.state;
    document.body.classList.toggle('meter-full', meter.state === 'full');
  }
  debug.frame(dt);
}
requestAnimationFrame(frame);

// For poking from the browser console.
window.summit = {
  get state() { return state; }, get run() { return run; }, get phase() { return phase; },
  T, terrain, view, input, meter, gates, ui, save, step, STEP, beginRun, tick,
  // Blank input for summit.tick(); override fields as needed, e.g. { ...summit.idle(), steer: 0.5 }.
  idle: () => ({ ...COAST_INPUT, brake: false, adrenaline: false, spinGesture: 0 }),
  startRun: beginRun,
};
