// Menu screens: title > mode > level > rider, plus pause and results.
// Flat DOM screens over the live mountain (markup in index.html). This module
// only shows screens and reports choices; main.js owns the run.
//
// Menu buttons use `click` so keyboard and assistive activation work.
// Gameplay input (js/input.js) uses pointerdown/keydown.
import { MODES } from './data/modes.js';
import { LEVELS } from './data/levels/index.js';
import { RIDERS, EQUIPMENT } from './data/riders.js';
import { save } from './save.js';
import { formatTime } from './run.js';
import { settings, ACTIONS, keyAllowed, keyLabel } from './settings.js';

const $ = (sel, root = document) => root.querySelector(sel);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const STAT_LABELS = { speed: 'Speed', accel: 'Accel', turn: 'Carve', spin: 'Spin', flip: 'Flip', jump: 'Jump' };

export function formatBest(mode, value) {
  if (value === null || value === undefined) return '—';
  return mode === 'race' ? formatTime(value) : Math.round(value).toLocaleString('en-GB');
}

// The rider's portrait, drawn in code from her colours (look A: high ponytail, goggles up).
function portrait(r) {
  const C = Object.fromEntries(Object.entries(r.colours).map(([k, v]) => [k, hex(v)]));
  return `<svg viewBox="0 0 200 410" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="100" cy="394" rx="78" ry="9" fill="rgba(10,18,50,.35)"/>
    <g transform="rotate(-5 36 230)"><rect x="20" y="58" width="32" height="336" rx="16" fill="${C.board}"/>
      <path d="M20,150 L52,120 L52,170 L20,200 Z M20,250 L52,220 L52,240 L20,270 Z" fill="#ff7a3d"/>
      <rect x="27" y="286" width="18" height="26" rx="4" fill="${C.dark}"/><rect x="27" y="196" width="18" height="26" rx="4" fill="${C.dark}"/></g>
    <path d="M112,40 C150,26 170,62 158,104 C154,120 146,128 140,132 C150,104 146,72 118,58 Z" fill="${C.hair}"/>
    <path d="M140,132 C150,104 146,72 118,58 C138,76 142,104 134,128 Z" fill="#e7b52c"/>
    <path d="M80,176 L123,176 Q135,215 131,262 L143,372 L115,372 L105,272 L101,222 L99,272 L99,372 L71,372 L76,262 Q71,215 80,176 Z" fill="${C.legs}"/>
    <path d="M123,176 Q135,215 131,262 L143,372 L131,372 L119,262 Q123,215 113,176 Z M101,222 L99,272 L99,372 L91,372 L93,262 Z" fill="#b3241d"/>
    <rect x="66" y="366" width="38" height="26" rx="10" fill="${C.dark}"/><rect x="111" y="366" width="38" height="26" rx="10" fill="${C.dark}"/>
    <rect x="66" y="366" width="38" height="7" rx="3" fill="#fff"/><rect x="111" y="366" width="38" height="7" rx="3" fill="#fff"/>
    <path d="M83,158 L119,158 L123,178 L80,178 Z" fill="#fff"/>
    <rect x="79" y="174" width="45" height="7" rx="3" fill="${C.dark}"/><rect x="97" y="173" width="10" height="9" rx="2" fill="${C.board}"/>
    <path d="M76,106 L56,142 L46,172" fill="none" stroke="${C.top}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="45" cy="174" r="10" fill="${C.dark}"/>
    <g transform="rotate(-4 100 130)">
      <path d="M72,102 Q100,90 128,102 L122,136 Q117,150 120,164 L82,164 Q85,150 79,136 Z" fill="${C.top}"/>
      <path d="M128,102 L122,136 Q117,150 120,164 L108,164 Q106,140 114,100 Z" fill="${C.topShade}"/>
      <path d="M76,122 L100,136 L125,122 L124,132 L100,146 L77,132 Z" fill="#fff"/>
      <path d="M78,138 L100,152 L123,138 L122,143 L100,157 L79,143 Z" fill="#7fb0ff"/>
      <path d="M90,96 L100,110 L110,96 L112,104 L100,118 L88,104 Z" fill="${C.topShade}"/>
      <line x1="100" y1="112" x2="100" y2="164" stroke="${C.dark}" stroke-width="2"/></g>
    <path d="M125,106 L152,142 L126,170" fill="none" stroke="${C.topShade}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="125" cy="172" r="10" fill="${C.dark}"/>
    <rect x="93" y="78" width="14" height="20" rx="5" fill="#dba783"/>
    <ellipse cx="100" cy="62" rx="20" ry="23" fill="${C.skin}"/>
    <path d="M88,62 q5,-5 10,0 M103,62 q5,-5 10,0" fill="none" stroke="${C.dark}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M92,73 q8,7 17,-1" fill="none" stroke="#c2452f" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M79,62 C76,34 98,30 104,32 C122,30 126,48 121,64 C118,50 108,44 98,46 C88,46 82,52 79,62 Z" fill="${C.hair}"/>
    <rect x="78" y="40" width="44" height="7" rx="3" fill="${C.dark}"/>
    <rect x="83" y="33" width="34" height="13" rx="6" fill="#ff9d3c" stroke="${C.dark}" stroke-width="3"/>
    <circle cx="114" cy="38" r="5" fill="${C.hair}"/>
  </svg>`;
}

// onSound(): the sound settings changed. onClick(kind): a menu button was pressed ('click' or 'back').
export function createUI({ onStart, onResume, onRestart, onQuit, onSound = () => {}, onClick = () => {} }) {
  const menu = $('#menu');
  const choice = {
    mode: MODES.some((m) => m.id === save.mode) ? save.mode : MODES[0].id,
    level: LEVELS.some((l) => l.id === save.level && l.data) ? save.level : LEVELS[0].id,
    rider: RIDERS.some((r) => r.id === save.rider) ? save.rider : RIDERS[0].id,
  };
  let current = 'title';
  let settingsFrom = 'title';          // the screen Settings was opened from (title or pause)
  let listening = null;                // the action waiting for a new key, if any
  const modeOf = (id) => MODES.find((m) => m.id === id);

  function show(name) {
    current = name;
    for (const s of menu.querySelectorAll('.screen')) s.hidden = s.dataset.screen !== name;
    document.body.classList.add('in-menu');
    if (name === 'mode') renderModes();
    if (name === 'level') renderLevels();
    if (name === 'rider') renderRider();
    if (name === 'controls-web') renderKeys();
    if (name === 'settings') renderSound();
    listening = null;
    const first = $(`.screen[data-screen="${name}"] .selected, .screen[data-screen="${name}"] .cta`, menu);
    if (first) first.focus({ preventScroll: true });
  }
  function hide() { current = null; document.body.classList.remove('in-menu'); }

  function renderModes() {
    $('#mode-list').innerHTML = MODES.map((m) => `
      <button class="card${m.id === choice.mode ? ' selected' : ''}" data-mode="${m.id}">
        <div class="icon">${m.id === 'race' ? '&#9201;' : '&#10022;'}</div>
        <h3>${m.name}</h3><p>${m.blurb}</p>
      </button>`).join('');
  }
  function renderLevels() {
    const m = modeOf(choice.mode);
    $('#crumb-level').textContent = m.name;
    $('#level-list').innerHTML = LEVELS.map((l, i) => l.data ? `
      <button class="card${l.id === choice.level ? ' selected' : ''}" data-level="${l.id}">
        <span class="num">${i + 1}</span><h3>${l.name}</h3><p>${l.blurb}</p>
        <div class="best">${m.bestLabel}<b>${formatBest(choice.mode, save.best(l.id, choice.mode))}</b></div>
      </button>` : `
      <div class="card locked"><span class="num">${i + 1}</span><h3>${l.name}</h3><p>Coming soon</p></div>`).join('');
  }
  function renderRider() {
    const r = RIDERS.find((x) => x.id === choice.rider), kit = EQUIPMENT[0];
    $('#crumb-rider').textContent = `${modeOf(choice.mode).name} · ${LEVELS.find((l) => l.id === choice.level).name}`;
    $('#rider-card').innerHTML = `${portrait(r)}<div class="info">
      <h3>${r.name}</h3><em>${r.tagline}</em>
      ${Object.entries(r.stats).map(([k, v]) => `<div class="stat"><span>${STAT_LABELS[k] || k}</span><i><b style="transform:scaleX(${v / 10})"></b></i></div>`).join('')}
      <div class="kit">Riding: ${kit.name}</div></div>`;
    $('#rider-list').innerHTML = [1, 2, 3].map(() => '<div class="card locked"><h3>?</h3><p>Coming soon</p></div>').join('');
  }

  // ---- sound: on/off and volume, saved through settings.setSound
  function renderSound() {
    const on = settings.sound.on, b = $('#sound-on'), v = $('#sound-vol');
    b.textContent = on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(on));
    v.value = settings.sound.volume; v.disabled = !on;
  }
  $('#sound-vol').addEventListener('input', (e) => { settings.setSound({ volume: +e.target.value }); onSound(); });
  $('#sound-vol').addEventListener('change', () => onClick('click'));      // a click at the new level

  // ---- keyboard controls: one key per action, no key used twice
  function renderKeys(note = '', warn = false) {
    $('#key-list').innerHTML = ACTIONS.map((a) => `
      <div class="key-row"><div><b>${a.label}</b><small>${a.air}</small></div>
        <button class="keycap${listening === a.id ? ' listening' : ''}" data-key="${a.id}">${listening === a.id ? 'Press a key…' : keyLabel(settings.keys[a.id])}</button></div>`).join('');
    const n = $('#key-note');
    n.textContent = note || 'Select a key to change it, then press the new key. Esc cancels.';
    n.classList.toggle('warn', warn);
  }
  // Runs before every other key handler while a key is being chosen, so the
  // press is not also treated as steering, pausing or going back.
  addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const action = listening, label = ACTIONS.find((a) => a.id === action).label;
    if (e.code === 'Escape') { listening = null; renderKeys(); return; }
    if (!keyAllowed(e.code)) {
      renderKeys(/^Numpad/.test(e.code) ? 'Number pad keys cannot be used. Press another key.' : 'That key cannot be used. Press another key.', true);
      return;
    }
    listening = null;
    const res = settings.bind(action, e.code);
    const other = res.swapped && ACTIONS.find((a) => a.id === res.swapped);
    renderKeys(other
      ? `${keyLabel(e.code)} was already ${other.label}, so the two swapped: ${other.label} is now ${keyLabel(settings.keys[other.id])}.`
      : `${label} is now ${keyLabel(e.code)}.`, Boolean(other));
  }, true);

  function start() {
    save.choose({ mode: choice.mode, level: choice.level, rider: choice.rider });
    onStart({ ...choice });
  }

  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'sound-on') { settings.setSound({ on: !settings.sound.on }); renderSound(); onSound(); }
    onClick('back' in b.dataset || b.classList.contains('back') ? 'back' : 'click');
    if (b.dataset.key) { listening = b.dataset.key; renderKeys(); }
    else if (b.id === 'keys-reset') { settings.resetKeys(); listening = null; renderKeys('Keys reset to the defaults.'); }
    else if ('settings' in b.dataset) { settingsFrom = current; show('settings'); }
    else if ('back' in b.dataset) show(settingsFrom);
    else if (b.dataset.go) show(b.dataset.go);
    else if (b.dataset.mode) { choice.mode = b.dataset.mode; show('level'); }
    else if (b.dataset.level) { choice.level = b.dataset.level; show('rider'); }
    else if (b.id === 'btn-start') start();
    else if (b.dataset.act === 'resume') onResume();
    else if (b.dataset.act === 'restart') onRestart();
    else if (b.dataset.act === 'quit') onQuit();
  });
  // Esc steps back through the menus (pause is handled by main.js).
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !current) return;
    const back = { mode: 'title', level: 'mode', rider: 'level', settings: settingsFrom, 'controls-mobile': 'settings', 'controls-web': 'settings' }[current];
    if (back) { onClick('back'); show(back); e.stopImmediatePropagation(); }
  });

  function showResults(res, info) {
    const race = res.mode === 'race';
    $('#results-title').textContent = race ? 'Race finished' : 'Run finished';
    const line = (a, b, cls = '') => `<div class="res-line ${cls}"><span>${a}</span><span>${b}</span></div>`;
    let html;
    if (race) {
      const t = info.targets || {};
      html = `<div class="res-big">${formatTime(res.total)}</div>
        <div class="medal ${res.medal || 'none'}">${res.medal ? `${res.medal.toUpperCase()} MEDAL` : 'NO MEDAL'}</div>
        ${info.newBest ? '<div class="newbest">NEW BEST TIME</div>' : ''}
        ${line('Riding time', formatTime(res.time))}
        ${line(`Gates missed: ${res.gatesMissed}`, `+${res.penalty.toFixed(1)} s`, res.gatesMissed ? 'bad' : '')}
        ${line('Gates passed', res.gatesPassed)}
        ${line('Best time', formatBest('race', info.best))}
        <div class="targets">Gold ${formatTime(t.gold)} · Silver ${formatTime(t.silver)} · Bronze ${formatTime(t.bronze)}</div>`;
    } else {
      html = `<div class="res-big">${res.bestTrick ? res.bestTrick.name : 'No tricks'}</div>
        <div class="medal none">BEST TRICK</div>
        ${line('Tricks landed', res.tricks)}
        ${line('Time in the air', `${res.airTime.toFixed(1)} s`)}
        ${line('Top speed', `${Math.round(res.topSpeed * 2.237)} mph`)}
        ${line('Run time', formatTime(res.time))}
        <div class="targets">Points, banking and best scores arrive with the scoring update.</div>`;
    }
    $('#results-body').innerHTML = html;
    show('results');
  }

  return { show, hide, showResults, get open() { return current !== null; }, get screen() { return current; } };
}
