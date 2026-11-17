// Player settings saved on this device (localStorage, versioned). Holds the
// keyboard bindings and sound (on/off, volume); quality and units join it later.
// Version 2 added `sound`; a version 1 save keeps its keys and gets default sound.
//
// Rules for bindings: one key per action, no key used twice, and only keys
// found on a standard keyboard without a number pad. Left and right Shift,
// Ctrl and Alt count as different keys.

const KEY = 'summit.settings.v1';

// Actions in the order the Controls screen lists them. `air` is what the same
// key does in the air (decided in js/rider-physics.js).
export const ACTIONS = [
  { id: 'left', label: 'Steer left', air: 'Spin left (tap rapidly)' },
  { id: 'right', label: 'Steer right', air: 'Spin right (tap rapidly)' },
  { id: 'up', label: 'Boost', air: 'Front flip' },
  { id: 'down', label: 'Brake', air: 'Back flip' },
  { id: 'jump', label: 'Jump', air: 'Hold to crouch, release to pop' },
  { id: 'adrenaline', label: 'Adrenaline', air: 'When the meter is full' },
  { id: 'pause', label: 'Pause', air: '' },
  { id: 'restart', label: 'Restart run', air: '' },
];

export const DEFAULT_KEYS = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  jump: 'Space', adrenaline: 'ShiftLeft', pause: 'Escape', restart: 'KeyR',
};

const NAMED = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
  Backspace: 'Backspace', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
};

// Keys that may be bound: letters, digits, arrows and the named keys above.
// Not allowed: number pad, function keys, the tuning-panel key (`), system keys.
export function keyAllowed(code) {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || code in NAMED;
}
export function keyLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return NAMED[code] || code;
}

function validKeys(k) {
  if (!k || typeof k !== 'object') return false;
  const codes = ACTIONS.map((a) => k[a.id]);
  return codes.every((c) => typeof c === 'string' && keyAllowed(c)) && new Set(codes).size === codes.length;
}

export const DEFAULT_SOUND = { on: true, volume: 0.8 };

let data = { v: 2, keys: { ...DEFAULT_KEYS }, sound: { ...DEFAULT_SOUND } };
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw && (raw.v === 1 || raw.v === 2) && validKeys(raw.keys)) data.keys = Object.fromEntries(ACTIONS.map((a) => [a.id, raw.keys[a.id]]));
  if (raw && raw.v === 2 && raw.sound) {
    if (typeof raw.sound.on === 'boolean') data.sound.on = raw.sound.on;
    if (Number.isFinite(raw.sound.volume)) data.sound.volume = Math.max(0, Math.min(1, raw.sound.volume));
  }
} catch { /* storage unavailable or corrupt: keep defaults */ }

function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } }

export const settings = {
  // Live object: js/input.js reads it on every key press, so changes apply at once.
  keys: data.keys,
  // Bind a key to an action. If another action already uses that key, the two
  // swap, so no key is ever bound twice. Returns { ok, swapped } (swapped = the other action's id).
  bind(action, code) {
    if (!(action in DEFAULT_KEYS) || !keyAllowed(code)) return { ok: false };
    const other = ACTIONS.find((a) => a.id !== action && data.keys[a.id] === code);
    if (other) data.keys[other.id] = data.keys[action];
    data.keys[action] = code;
    persist();
    return { ok: true, swapped: other ? other.id : null };
  },
  resetKeys() { Object.assign(data.keys, DEFAULT_KEYS); persist(); },
  // Sound: { on, volume 0..1 }. Live object; change it through setSound so it is saved.
  sound: data.sound,
  setSound(change) {
    if (typeof change.on === 'boolean') data.sound.on = change.on;
    if (Number.isFinite(change.volume)) data.sound.volume = Math.max(0, Math.min(1, change.volume));
    persist();
  },
  actionFor(code) { const a = ACTIONS.find((x) => data.keys[x.id] === code); return a ? a.id : null; },
};
