// Hidden tuning panel. Open with the ` key, or by tapping the top-left corner
// of the screen three times quickly. Lists every number in js/tuning.js;
// changes apply at once and are saved on this device.
import { T, DEFAULTS, setTuning, resetTuning, changedTuning } from './tuning.js';

export function createDebug(el) {
  let built = false, fpsEl = null, frames = 0, acc = 0, worst = 0;

  function build() {
    el.innerHTML = `<div class="bar"><button data-a="close">Close</button><button data-a="reset">Reset all</button>
      <button data-a="copy">Copy changes</button><span class="fps"></span></div>`;
    for (const [group, values] of Object.entries(DEFAULTS)) {
      const h = document.createElement('h3'); h.textContent = group; el.appendChild(h);
      for (const key of Object.keys(values)) {
        const row = document.createElement('label');
        const def = DEFAULTS[group][key];
        row.innerHTML = `<span>${key}</span><input type="number" step="${def !== 0 && Math.abs(def) < 1 ? 0.01 : 0.1}" value="${T[group][key]}">`;
        row.classList.toggle('changed', T[group][key] !== def);
        row.querySelector('input').addEventListener('input', (e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v)) return;
          setTuning(group, key, v); row.classList.toggle('changed', v !== def);
        });
        el.appendChild(row);
      }
    }
    fpsEl = el.querySelector('.fps');
    el.querySelector('.bar').addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'close') toggle(false);
      if (a === 'reset') { resetTuning(); build(); }
      if (a === 'copy') {
        const text = JSON.stringify(changedTuning(), null, 2);
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => prompt('Changed values', text));
      }
    });
    built = true;
  }
  function toggle(show = el.hidden) { if (show && !built) build(); el.hidden = !show; }

  addEventListener('keydown', (e) => { if (e.code === 'Backquote') toggle(); });
  let taps = [];
  addEventListener('pointerdown', (e) => {
    if (e.clientX > 70 || e.clientY > 70) return;
    const now = performance.now(); taps = taps.filter((t) => now - t < 700); taps.push(now);
    if (taps.length >= 3) { taps = []; toggle(); }
  });

  return {
    toggle,
    frame(dt) {
      frames++; acc += dt; worst = Math.max(worst, dt);
      if (acc >= 0.5) {
        if (fpsEl && !el.hidden) fpsEl.textContent = `${Math.round(frames / acc)} fps · worst ${Math.round(worst * 1000)} ms`;
        frames = 0; acc = 0; worst = 0;
      }
    },
  };
}
