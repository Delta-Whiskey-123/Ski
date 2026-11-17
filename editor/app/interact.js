// Mouse and keyboard on the plan: pan, zoom, select, drag. Turns gestures
// into store calls; never draws and never edits the map itself.
//
//   wheel                      zoom about the pointer
//   drag on empty plan         pan (also middle or right button anywhere)
//   click a thing              select it
//   drag a thing               move it (snaps to 0.5 m; hold Alt for no snap)
//   Delete                     remove the selected feature, gate, scenery, object or prop
//   Ctrl+Z / Ctrl+Y            undo / redo (Ctrl+Shift+Z also redoes)
//   Escape                     abandon a drag, else disarm the place tool, else deselect
//   F                          fit the whole course in view
//
// The place tool (armed from the palette with setTool({ kind, type })):
//   click                      add the thing there and select it; the tool disarms
//   Shift+click                add it and keep the tool armed for another
//   Escape                     disarm (so does picking the armed button again)

import { moveItem, removeItem, canRemove, anchor, describe, newItem, addItem } from './actions.js';

const SNAP = 0.5, DRAG_START = 3;

export function attachInteraction(canvas, plan, store, { redraw, onCursor, onTool }) {
  let drag = null;        // { sel, grab: {x,z} offset from the handle, startX, startY, moved }
  let pan = null;         // { x, y, cx, cz, moved }
  let tool = null;        // the armed place tool: { kind, type } | null
  let pointer = null;     // world point under the mouse while it is over the plan: { x, z, free }
  const snap = (v, free) => (free ? Math.round(v * 100) / 100 : Math.round(v / SNAP) * SNAP);
  const point = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const state = () => ({ map: store.map, analysis: store.analysis, selection: store.selection });

  function setTool(next) {
    tool = next ? { kind: next.kind, type: next.type } : null;
    onTool?.(tool);
    redraw();
  }
  // The thing the armed tool would add at the pointer (also drawn as the ghost).
  const placing = () => (tool && pointer ? newItem(store.map, tool.kind, tool.type, snap(pointer.x, pointer.free), snap(pointer.z, pointer.free)) : null);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    const [mx, my] = point(e);
    if (tool && e.button === 0) {
      const w = plan.toWorld(mx, my);
      pointer = { x: w.x, z: w.z, free: e.altKey };
      const added = addItem(store.map, tool.kind, placing());
      if (store.apply(`Add ${describe(added.map, added.selection).toLowerCase()}`, added.map)) store.select(added.selection);
      if (!e.shiftKey) setTool(null);
      e.preventDefault();
      return;
    }
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
    if (tool) { pointer = e.target === canvas ? { x: w.x, z: w.z, free: e.altKey } : null; redraw(); }
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
      if (drag) { drag = null; store.cancel(); } else if (tool) setTool(null); else store.select(null);
    } else if (key === 'f' && !ctrl) { plan.fit(store.map, store.analysis); redraw(); }
  });

  return {
    setTool,
    get tool() { return tool; },
    // what the plan draws faintly under the pointer: { kind, item } | null
    get ghost() { const item = placing(); return item ? { kind: tool.kind, item } : null; },
  };
}
