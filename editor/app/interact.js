// Mouse and keyboard on the plan: pan, zoom, select, drag. Turns gestures
// into store calls; never draws and never edits the map itself.
//
//   wheel                      zoom about the pointer
//   drag on empty plan         pan (also middle or right button anywhere)
//   click a thing              select it
//   drag a thing               move it (snaps to 0.5 m; hold Alt for no snap)
//   Delete                     remove the selected feature, gate, scenery, object or prop
//   Ctrl+Z / Ctrl+Y            undo / redo (Ctrl+Shift+Z also redoes)
//   Escape                     abandon a drag, else deselect
//   F                          fit the whole course in view

import { moveItem, removeItem, canRemove, anchor, describe } from './actions.js';

const SNAP = 0.5, DRAG_START = 3;

export function attachInteraction(canvas, plan, store, { redraw, onCursor }) {
  let drag = null;        // { sel, grab: {x,z} offset from the handle, startX, startY, moved }
  let pan = null;         // { x, y, cx, cz, moved }
  const snap = (v, free) => (free ? Math.round(v * 100) / 100 : Math.round(v / SNAP) * SNAP);
  const point = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => ({ map: store.map, analysis: store.analysis, selection: store.selection });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    const [mx, my] = point(e);
    const hit = e.button === 0 ? plan.pick(state(), mx, my) : null;
    if (hit) {
      store.select(hit);
      const a = anchor(store.map, hit), w = plan.toWorld(mx, my);
      drag = { sel: hit, grab: { x: w.x - a.x, z: w.z - a.z }, startX: mx, startY: my, moved: false };
    } else {
      pan = { x: mx, y: my, cx: plan.view.cx, cz: plan.view.cz, moved: false, button: e.button };
    }
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    const [mx, my] = point(e);
    const w = plan.toWorld(mx, my);
    onCursor?.(w, e.target === canvas);
    if (drag) {
      if (!drag.moved && Math.hypot(mx - drag.startX, my - drag.startY) < DRAG_START) return;
      drag.moved = true;
      store.preview(moveItem(store.baseMap, drag.sel, snap(w.x - drag.grab.x, e.altKey), snap(w.z - drag.grab.z, e.altKey)));
    } else if (pan) {
      if (!pan.moved && Math.hypot(mx - pan.x, my - pan.y) < DRAG_START) return;
      pan.moved = true;
      plan.view.cx = pan.cx - (mx - pan.x) / plan.view.scale;
      plan.view.cz = pan.cz - (my - pan.y) / plan.view.scale;
      redraw();
    }
  });

  window.addEventListener('mouseup', () => {
    if (drag) {
      const label = `Move ${describe(store.map, drag.sel).toLowerCase()}`;
      if (drag.moved) store.commit(label);
      drag = null;
    } else if (pan) {
      if (!pan.moved && pan.button === 0) store.select(null);
      pan = null;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [mx, my] = point(e);
    plan.zoomAt(mx, my, Math.exp(-e.deltaY * 0.0015));
    redraw();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea, dialog')) return;
    const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (ctrl && key === 'z' && !e.shiftKey) { store.undo(); e.preventDefault(); }
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { store.redo(); e.preventDefault(); }
    else if ((key === 'delete' || key === 'backspace') && canRemove(store.selection)) {
      const sel = store.selection, label = `Delete ${describe(store.map, sel).toLowerCase()}`;
      store.select(null);
      store.apply(label, (m) => removeItem(m, sel));
      e.preventDefault();
    } else if (key === 'escape') {
      if (drag) { drag = null; store.cancel(); } else store.select(null);
    } else if (key === 'f' && !ctrl) { plan.fit(store.map, store.analysis); redraw(); }
  });
}
