// The editor's one source of truth: the working map, the selection, and undo
// and redo. THE MAP CHANGES NOWHERE ELSE. Everything else reads from here.
//
//   store.apply(label, change)   one finished edit (change = a new map, or map -> new map)
//   store.preview(newMap)        a drag in progress: shows the map, adds no history
//   store.commit(label)          the drag is finished: one history entry for all of it
//   store.cancel()               abandon the drag
//   store.undo() / store.redo()
//   store.select(selection)
//   store.subscribe(fn)          fn(reason, detail); reason is one of
//                                'map' (changed for good), 'preview', 'analysis'
//                                (warnings and jumps caught up during a drag),
//                                'selection', 'rejected' (an edit was refused)
//
// By construction: a map is never edited in place (undo is a stack of earlier
// maps); every change is validated first and refused if it would make the map
// invalid; after every change analyse() is re-run, so the plan, the warning
// list and the jump overlays can never be out of date with the map.
//
// No DOM here (only a timer), so this file can be exercised from Node.

import { analyse } from '../core/analyse.js';
import { validateMap } from '../core/format.js';
import { getItem } from './actions.js';

const HISTORY_LIMIT = 200;
const SLOW_ANALYSIS = 40;      // ms; above this, analysis during a drag is spaced out...
const DRAG_INTERVAL = 120;     // ...to one run per this many ms

export function createStore(initialMap) {
  let map = initialMap, analysis = analyse(map), selection = null;
  let past = [], future = [];          // [{ map, label }]
  let base = null;                     // the map from before the current drag
  let timer = null, cost = 0;
  const listeners = new Set();
  const emit = (reason, detail) => { for (const fn of listeners) fn(reason, detail); };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function refresh() {
    if (timer) { clearTimeout(timer); timer = null; }
    const t = now();
    analysis = analyse(map);
    cost = now() - t;
  }
  function settle(label) {
    refresh();
    if (selection && !getItem(map, selection)) selection = null;
    emit('map', { label });
  }
  function push(entry) {
    past.push(entry);
    if (past.length > HISTORY_LIMIT) past.shift();
    future = [];
  }
  function check(next, label) {
    const errors = validateMap(next);
    if (errors.length) emit('rejected', { label, errors });
    return !errors.length;
  }

  return {
    get map() { return map; },
    get analysis() { return analysis; },
    get selection() { return selection; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get undoLabel() { return past.at(-1)?.label; },
    get redoLabel() { return future.at(-1)?.label; },
    get dragging() { return !!base; },
    // the map as it was before the drag in progress (edits during a drag start from this)
    get baseMap() { return base || map; },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    apply(label, change) {
      if (base) this.cancel();
      const next = typeof change === 'function' ? change(map) : change;
      if (!next || next === map) return true;
      if (!check(next, label)) return false;
      push({ map, label });
      map = next;
      settle(label);
      return true;
    },

    preview(next) {
      if (!next || next === map) return true;
      if (validateMap(next).length) return false;         // quietly ignore an impossible drag position
      if (!base) base = map;
      map = next;
      if (!timer) {
        timer = setTimeout(() => { timer = null; const t = now(); analysis = analyse(map); cost = now() - t; emit('analysis'); }, cost > SLOW_ANALYSIS ? DRAG_INTERVAL : 0);
      }
      emit('preview');
      return true;
    },

    commit(label) {
      if (!base) return;
      const from = base;
      base = null;
      if (map === from) return;
      push({ map: from, label });
      settle(label);
    },

    cancel() {
      if (!base) return;
      map = base; base = null;
      settle('Cancelled');
    },

    undo() {
      if (base) { this.cancel(); return; }
      const entry = past.pop();
      if (!entry) return;
      future.push({ map, label: entry.label });
      map = entry.map;
      settle(`Undo: ${entry.label}`);
    },

    redo() {
      if (base) return;
      const entry = future.pop();
      if (!entry) return;
      past.push({ map, label: entry.label });
      map = entry.map;
      settle(`Redo: ${entry.label}`);
    },

    select(next) {
      selection = next && getItem(map, next) ? next : null;
      emit('selection');
    },
  };
}
