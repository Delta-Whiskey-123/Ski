// What is remembered on this device: best results and the last menu choices.
// localStorage with a version number; no network, no accounts.

const KEY = 'summit.save.v1';
const blank = () => ({ v: 1, best: {}, mode: 'race', level: 'level1', rider: 'freya' });

let data = blank();
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw && raw.v === 1) data = { ...blank(), ...raw };
} catch { /* storage unavailable or corrupt: start fresh */ }

function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } }

export const save = {
  get mode() { return data.mode; }, get level() { return data.level; }, get rider() { return data.rider; },
  choose(patch) { Object.assign(data, patch); persist(); },
  // best Race time (lower is better) or best Tricks score (higher is better); null if none yet
  best(levelId, mode) { return data.best[levelId]?.[mode] ?? null; },
  // Returns true if this result is a new best.
  record(levelId, mode, value) {
    const old = this.best(levelId, mode);
    const better = old === null || (mode === 'race' ? value < old : value > old);
    if (better) { data.best[levelId] = { ...data.best[levelId], [mode]: value }; persist(); }
    return better;
  },
};
