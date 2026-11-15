// Keyboard and touch input. Reports what the player is asking for; it never
// touches the rider. main.js calls read() once per drawn frame.
//
// The same keys mean different things on snow and in the air, and that is
// decided in js/rider-physics.js, not here:
//   left/right  steer on snow            | taps spin, holding spins slowly
//   up          boost on snow            | front flip
//   down        brake on snow            | back flip
//   space       hold to crouch, release to jump
//   shift or E  fire adrenaline
//
// Touch: drag sideways to steer. In the air, circle a finger to spin and
// swipe up/down to flip. On-screen buttons carry data-btn="jump|boost|brake|adrenaline".

import { T } from './tuning.js';

const wrapPi = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

export function createInput(surface) {
  const keys = new Set();
  const buttons = { jump: false, boost: false, brake: false };
  let tapLeft = 0, tapRight = 0, flipPress = 0, adrenaline = false, spinGesture = 0;
  const pointers = new Map();          // pointerId -> drag state
  let steerId = null, airborne = false;

  const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], UP = ['ArrowUp', 'KeyW'], DOWN = ['ArrowDown', 'KeyS'];
  const held = (list) => list.some((k) => keys.has(k));

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (!e.repeat) {
      if (LEFT.includes(e.code)) tapLeft++;
      if (RIGHT.includes(e.code)) tapRight++;
      if (UP.includes(e.code)) flipPress = 1;
      if (DOWN.includes(e.code)) flipPress = -1;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') adrenaline = true;
    }
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); buttons.jump = buttons.boost = buttons.brake = false; });

  // ---- on-screen buttons: act on pointerdown, each pointer independent
  for (const el of document.querySelectorAll('[data-btn]')) {
    const name = el.dataset.btn;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId); el.classList.add('down');
      if (name === 'adrenaline') adrenaline = true; else buttons[name] = true;
    });
    const up = (e) => { e.stopPropagation(); el.classList.remove('down'); if (name !== 'adrenaline') buttons[name] = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ---- drag surface: steer, circle to spin, swipe to flip
  surface.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { surface.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const now = performance.now() / 1000;
    pointers.set(e.pointerId, {
      x0: e.clientX, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY,
      dir: null, curveRun: 0, strokeX: e.clientX, strokeY: e.clientY, strokeT: now, strokeCurve: 0, lastT: now,
    });
    if (steerId === null) steerId = e.pointerId;
  });
  surface.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const dx = p.x - p.lx, dy = p.y - p.ly;
    if (dx * dx + dy * dy < 16) return;                 // wait for 4 px of travel
    const now = performance.now() / 1000;
    if (now - p.lastT > 0.14) { p.dir = null; p.curveRun = 0; restartStroke(p, now); }
    const dir = Math.atan2(dy, dx);
    if (p.dir !== null) {
      const d = wrapPi(dir - p.dir);
      p.curveRun = Math.sign(d) === Math.sign(p.curveRun) || p.curveRun === 0 ? p.curveRun + d : d;
      p.strokeCurve += Math.abs(d);
      // clockwise on screen is positive d; the rider turns the same way on screen
      if (Math.abs(p.curveRun) > T.touch.circleStart) spinGesture -= d;
    }
    p.dir = dir; p.lx = p.x; p.ly = p.y; p.lastT = now;

    const sy = p.y - p.strokeY, sx = p.x - p.strokeX;
    if (p.strokeCurve > 0.6 || now - p.strokeT > T.touch.swipeTime) restartStroke(p, now);
    else if (Math.abs(sy) > T.touch.swipeDistance && Math.abs(sy) > 2 * Math.abs(sx)) {
      flipPress = sy < 0 ? 1 : -1;                      // swipe up = front flip
      restartStroke(p, now);
    }
  });
  function restartStroke(p, now) { p.strokeX = p.x; p.strokeY = p.y; p.strokeT = now; p.strokeCurve = 0; }
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (steerId === e.pointerId) steerId = pointers.size ? pointers.keys().next().value : null;
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);

  return {
    // Tell input when the rider lands so the steering thumb re-centres where it is.
    setAirborne(v) {
      if (airborne && !v) for (const p of pointers.values()) p.x0 = p.x;
      airborne = v;
    },
    read() {
      let steer = (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0);
      const sp = pointers.get(steerId);
      if (sp) steer += Math.max(-1, Math.min(1, (sp.x - sp.x0) / T.touch.steerRange));
      const out = {
        steer: Math.max(-1, Math.min(1, steer)),
        boost: held(UP) || buttons.boost,
        brake: held(DOWN) || buttons.brake,
        jumpHeld: keys.has('Space') || buttons.jump,
        spinTaps: tapRight - tapLeft,
        spinHold: (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0),
        spinGesture,
        flipPress,
        flipHold: (held(UP) ? 1 : 0) - (held(DOWN) ? 1 : 0),
        adrenaline,
      };
      tapLeft = tapRight = 0; flipPress = 0; adrenaline = false; spinGesture = 0;
      return out;
    },
  };
}
