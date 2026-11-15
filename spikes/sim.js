// Throwaway spike: the same tiny simulation drives both renderers so the
// comparison is about looks and frame rate only. World units are metres.
// x = across the slope (right is +), y = distance downhill, h = height.

export const G = 18;
export const PERIOD = 220;       // the test features repeat every PERIOD metres
const KICK_START = 100, KICK_LEN = 7, KICK_H = 2.4, KICK_HALF_W = 6;

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function kickerY(y) { return Math.floor(y / PERIOD) * PERIOD + KICK_START; }
export const KICKER = { len: KICK_LEN, h: KICK_H, halfW: KICK_HALF_W };

export function ground(x, y) {
  const m = ((y % PERIOD) + PERIOD) % PERIOD;
  if (Math.abs(x) <= KICK_HALF_W && m >= KICK_START && m < KICK_START + KICK_LEN) {
    const t = (m - KICK_START) / KICK_LEN;
    return KICK_H * t * t;
  }
  return 0;
}

// Trees for one 8 m band of slope. Deterministic, so both spikes match.
export function treesInBand(k) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const id = k * 4 + i;
    const side = i < 2 ? -1 : 1;
    out.push({
      x: side * (14 + hash(id) * 24),
      y: k * 8 + hash(id + 0.5) * 8,
      s: 0.8 + hash(id + 0.25) * 0.8,
      blob: hash(id + 0.75) > 0.72,
    });
  }
  return out;
}

export function gateAt(n) {           // one slalom gate every 40 m
  return { x: (n % 2 ? 1 : -1) * 5, y: n * 40 + 20, red: n % 2 === 0 };
}

export function createSim() {
  const s = {
    x: 0, y: 0, h: 0, vh: 0, speed: 16, heading: 0,
    air: false, spin: 0, airTime: 0, maxH: 0,
    steer: 0, jumpQueued: false,
    callout: '', calloutT: 0, trail: [], spray: [],
  };

  // ---- input: arrows / A D, space; touch drag to steer, quick tap to jump
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) s.jumpQueued = true;
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  let drag = null;
  addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x0: e.clientX, t: performance.now(), dx: 0 }; });
  addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) drag.dx = e.clientX - drag.x0; });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (performance.now() - drag.t < 200 && Math.abs(drag.dx) < 12) s.jumpQueued = true;
    drag = null;
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  function readSteer() {
    let v = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) v -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) v += 1;
    if (drag) v += Math.max(-1, Math.min(1, drag.dx / 70));
    return Math.max(-1, Math.min(1, v));
  }

  function land() {
    const halves = Math.floor(Math.abs(s.spin) / Math.PI + 0.2);
    if (halves > 0) { s.callout = `${halves * 180}`; s.calloutT = 1.6; }
    else if (s.airTime > 0.7) { s.callout = 'BIG AIR'; s.calloutT = 1.2; }
    s.air = false; s.spin = 0; s.vh = 0; s.airTime = 0; s.maxH = 0;
    for (let i = 0; i < 14; i++) s.spray.push(puff(s, 1));
  }

  function puff(st, burst) {
    return {
      x: st.x + (Math.random() - 0.5) * 1.2, y: st.y - 0.4, h: 0.1,
      vx: (Math.random() - 0.5) * (burst ? 7 : 3) - Math.sin(st.heading) * 2,
      vy: -Math.random() * 3, vh: 1 + Math.random() * (burst ? 4 : 2), t: 0,
    };
  }

  s.step = (dt) => {
    s.steer = readSteer();
    s.speed += (23 - s.speed) * 0.4 * dt;
    const g0 = ground(s.x, s.y);

    if (!s.air) {
      s.heading += (s.steer * 0.62 - s.heading) * Math.min(1, 7 * dt);
      if (s.jumpQueued) { s.air = true; s.vh = 7.5 + g0 * 1.5; }
    } else {
      s.spin += s.steer * 9 * dt;
      s.heading *= 1 - Math.min(1, 1.5 * dt);
    }
    s.jumpQueued = false;

    s.x += Math.sin(s.heading) * s.speed * dt;
    s.y += Math.cos(s.heading) * s.speed * dt;
    s.x = Math.max(-11, Math.min(11, s.x));
    const g1 = ground(s.x, s.y);

    if (!s.air) {
      if (g0 > 1.2 && g1 === 0) { s.air = true; s.vh = 9.5; s.h = g0; }   // off the lip
      else s.h = g1;
    }
    if (s.air) {
      s.vh -= G * dt; s.h += s.vh * dt; s.airTime += dt;
      s.maxH = Math.max(s.maxH, s.h);
      if (s.h <= g1 && s.vh < 0) { s.h = g1; land(); }
    }

    if (!s.air) {
      s.trail.push({ x: s.x, y: s.y });
      if (Math.abs(s.steer) > 0.3 && Math.random() < 0.6) s.spray.push(puff(s, 0));
    } else if (s.trail.length && !s.trail[s.trail.length - 1].gap) {
      s.trail.push({ x: s.x, y: s.y, gap: true });
    }
    if (s.trail.length > 260) s.trail.splice(0, s.trail.length - 260);

    for (const p of s.spray) {
      p.t += dt; p.vh -= 9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.h = Math.max(0, p.h + p.vh * dt);
    }
    s.spray = s.spray.filter((p) => p.t < 0.7);
    if (s.calloutT > 0) s.calloutT -= dt;
  };
  return s;
}

// Shared HUD: fps, height, call-outs.
export function createHud(label) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:700 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #0009';
  el.innerHTML = `<div style="position:absolute;left:12px;top:10px">${label}<br><span id="fps"></span></div>
    <div id="air" style="position:absolute;right:12px;top:10px;text-align:right"></div>
    <div id="call" style="position:absolute;left:0;right:0;top:22%;text-align:center;font:italic 900 54px system-ui,sans-serif;color:#ffe14d;-webkit-text-stroke:2px #c2185b;opacity:0"></div>
    <div style="position:absolute;left:0;right:0;bottom:8px;text-align:center;font-weight:500;opacity:.8">Steer: arrows or drag &nbsp;·&nbsp; Jump: space or tap &nbsp;·&nbsp; Spin: steer in the air</div>`;
  document.body.appendChild(el);
  const fps = el.querySelector('#fps'), air = el.querySelector('#air'), call = el.querySelector('#call');
  let frames = 0, acc = 0, worst = 0;
  return (s, dt) => {
    frames++; acc += dt; worst = Math.max(worst, dt);
    if (acc >= 0.5) {
      fps.textContent = `${Math.round(frames / acc)} fps (slowest frame ${Math.round(worst * 1000)} ms)`;
      frames = 0; acc = 0; worst = 0;
    }
    air.textContent = s.air ? `height ${s.h.toFixed(1)} m · spin ${Math.round(Math.abs(s.spin) * 180 / Math.PI)}°` : `${Math.round(s.speed * 2.237)} mph`;
    call.textContent = s.callout;
    call.style.opacity = s.calloutT > 0 ? Math.min(1, s.calloutT * 2) : 0;
  };
}
