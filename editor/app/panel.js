// The properties panel: the fields of the selected thing (or of the map when
// nothing is selected), and for a feature its predicted flights. It shows
// what the store holds and sends edits back through store.apply(); it never
// changes the map itself.

import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES } from '../core/catalogue.js';
import { PROFILES, tuningOverridesIgnored } from '../core/predict.js';
import { getItem, setField, describe, canRemove, removeItem } from './actions.js';
import { drawSideView, PROFILE_COLOURS } from './plan.js';

// Plain names for field keys. A key not listed here is shown as it is.
const LABELS = {
  x: 'x, across (m)', z: 'z, downhill (m)', w: 'half-width (m)', width: 'width (m)', length: 'length (m)', height: 'height (m)',
  drop: 'drop (m)', approach: 'approach (m)', run: 'run-out (m)', lip: 'lip (m)', red: 'red (off = blue)', path: 'piste',
  rot: 'turn (radians)', r: 'radius (m)', x2: 'far end x (m)', z2: 'far end z (m)', type: 'type', id: 'id', name: 'name',
  gateSpacing: 'gate spacing (m)', seed: 'forest seed', fenceOffset: 'fence offset (m)', fenceTreeDensity: 'fence tree density',
  grade: 'steepness (1 = normal)', gold: 'gold (s)', silver: 'silver (s)', bronze: 'bronze (s)', paint: 'course paint', s: 'size', dirs: 'arrow directions',
};
// Optional fields offered even when the item does not have them yet.
const OPTIONAL = {
  ledge: { lip: 'number' }, kicker: { paint: 'boolean' }, path: { gateSpacing: 'number' },
  map: { fenceOffset: 'number', fenceTreeDensity: 'number' },
};
const HIDDEN = { map: new Set(['format', 'version', 'meta', 'paths', 'grades', 'features', 'props', 'scenery', 'gates', 'objects', 'start', 'race']), path: new Set(['nodes']) };

export function createPanel(root, store) {
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

  function field(sel, key, value, kind, optional) {
    const id = `f-${sel.kind}-${key}`;
    const commit = (v) => store.apply(`Set ${LABELS[key] || key}`, (m) => setField(m, sel, key, v));
    let input;
    const choices = key === 'type' && sel.kind === 'scenery' ? Object.keys(SCENERY_TYPES)
      : key === 'path' && sel.kind === 'gate' ? store.map.paths.map((p) => p.id) : null;
    if (choices) {
      input = el('select', { id });
      for (const c of choices) input.append(el('option', { value: c, textContent: c, selected: c === value }));
      input.addEventListener('change', () => commit(input.value));
    } else if (key === 'type') {
      input = el('input', { id, value, disabled: true });
    } else if (kind === 'boolean') {
      input = el('input', { id, type: 'checkbox', checked: value ?? (key === 'paint') });
      input.addEventListener('change', () => commit(input.checked));
    } else if (kind === 'number') {
      input = el('input', { id, type: 'number', step: 'any', value: value ?? '', placeholder: optional ? 'not set' : '' });
      input.addEventListener('change', () => {
        if (input.value === '' && optional) commit(undefined);
        else if (Number.isFinite(input.valueAsNumber)) commit(input.valueAsNumber);
        else input.value = value ?? '';
      });
    } else if (kind === 'string') {
      input = el('input', { id, value });
      input.addEventListener('change', () => { if (input.value) commit(input.value); else input.value = value; });
    } else {
      input = el('input', { id, value: JSON.stringify(value), disabled: true, title: 'Kept as it is; not editable here' });
    }
    input.dataset.key = id;
    return el('label', { className: 'field' }, el('span', { textContent: LABELS[key] || key }), input);
  }

  function fields(sel) {
    const item = getItem(store.map, sel), box = el('div', { className: 'fields' });
    if (!item) return box;
    const hidden = HIDDEN[sel.kind] || new Set();
    const optional = OPTIONAL[sel.kind === 'feature' ? item.type : sel.kind] || {};
    const fixed = sel.kind === 'object' && sel.end ? new Set(['x2', 'z2']) : null;
    for (const [key, value] of Object.entries(item)) {
      if (hidden.has(key) || (fixed && !fixed.has(key))) continue;
      box.append(field(sel, key, value, typeof value, key in optional));
    }
    for (const [key, kind] of Object.entries(optional)) if (!(key in item) && !fixed) box.append(field(sel, key, undefined, kind, true));
    if (sel.kind === 'object' && !sel.end) {
      const t = OBJECT_TYPES[item.type];
      if (t?.shape === 'rect' && !('rot' in item)) box.append(field(sel, 'rot', undefined, 'number', true));
      if (t?.sizable && !('r' in item)) box.append(field(sel, 'r', undefined, 'number', true));
    }
    return box;
  }

  function flights(index) {
    const { jumps, terrain, warnings } = store.analysis, jump = jumps[index];
    if (!jump) return '';
    const table = el('table', { className: 'flights' });
    table.append(el('tr', {}, ...['speed', 'm/s', 'air (s)', 'flies (m)', 'peak (m)', 'lands at z'].map((t) => el('th', { textContent: t }))));
    for (const p of PROFILES) {
      const f = jump.flights[p.id];
      const cells = f.air ? [f.speed.toFixed(1), f.airTime.toFixed(2), f.distance.toFixed(0), f.maxHeight.toFixed(1), f.landing.z.toFixed(0)] : [f.speed.toFixed(1), 'stays on the snow'];
      const name = el('td', {}, el('i', { className: 'swatch', style: `background:${PROFILE_COLOURS[p.id]}` }), p.name);
      const row = el('tr', {}, name, ...cells.map((c) => el('td', { textContent: c })));
      if (!f.air) row.lastChild.colSpan = 4;
      table.append(row);
    }
    const side = el('canvas', { className: 'side' });
    const mine = warnings.filter((w) => w.items.some((i) => i.kind === 'feature' && i.index === index));
    const box = el('div', {}, el('h3', { textContent: 'Predicted flights' }), table, side,
      el('p', { className: 'note', textContent: `Real game physics, default tuning${tuningOverridesIgnored ? ` (${tuningOverridesIgnored} tuning change(s) saved in the game on this device are ignored)` : ''}. Slow = carving hard; normal = straight, no input; adrenaline = boost held with adrenaline running.` }),
      ...mine.map((w) => el('p', { className: `warn ${w.severity}`, textContent: w.message })));
    requestAnimationFrame(() => { if (side.isConnected) drawSideView(side, terrain, jump); });
    return box;
  }

  function mapPanel() {
    const map = store.map, gen = map.meta?.generator;
    const box = el('div', {}, fields({ kind: 'map' }));
    box.append(el('h3', { textContent: 'Race medal times' }), map.race ? fields({ kind: 'race' }) : el('p', { className: 'note', textContent: 'None set.' }));
    box.append(el('h3', { textContent: 'Steepness (from z downward)' }));
    (map.grades || []).forEach((g, i) => {
      const row = fields({ kind: 'grade', index: i });
      row.classList.add('row');
      for (const input of row.querySelectorAll('input')) { input.id += `-${i}`; input.dataset.key += `-${i}`; }
      const [from, grade] = row.querySelectorAll('span');
      if (from && grade) { from.textContent = 'from z (m)'; grade.textContent = 'steepness'; }
      box.append(row);
    });
    box.append(el('p', { className: 'note', textContent: `${map.paths.length} piste(s), ${map.features.length} features, ${map.gates.length} gates, ${map.scenery.length} scenery, ${map.objects.length} objects, ${map.props.length} hand-placed props.${gen ? ` Generated from seed ${gen.seed} (length ${gen.length}, difficulty ${gen.difficulty}, branches ${gen.branches}, jump density ${gen.jumpDensity}).` : ''}` }));
    box.append(el('p', { className: 'note', textContent: 'Click something on the plan to edit it. Click a point of a piste to edit its position and half-width.' }));
    return box;
  }

  function render() {
    const active = document.activeElement?.dataset?.key;
    const sel = store.selection;
    root.replaceChildren();
    root.append(el('h2', { textContent: sel ? describe(store.map, sel) : `Map: ${store.map.name}` }));
    if (!sel) root.append(mapPanel());
    else {
      root.append(fields(sel));
      if (sel.kind === 'node') {
        const pathSel = { kind: 'path', index: sel.path };
        root.append(el('h3', { textContent: describe(store.map, pathSel) }), fields(pathSel));
      }
      if (sel.kind === 'feature') root.append(flights(sel.index));
      if (sel.kind === 'object') {
        const t = OBJECT_TYPES[getItem(store.map, sel).type];
        if (t) root.append(el('p', { className: 'note', textContent: `Placeholder: the game cannot draw a ${t.name.toLowerCase()} yet. Collision radius ${t.r} m, height ${t.h} m.` }));
      }
      if (canRemove(sel)) {
        const del = el('button', { textContent: 'Delete', className: 'danger' });
        del.addEventListener('click', () => { const label = `Delete ${describe(store.map, sel).toLowerCase()}`; store.select(null); store.apply(label, (m) => removeItem(m, sel)); });
        root.append(del);
      }
    }
    if (active) root.querySelector(`[data-key="${active}"]`)?.focus();
  }

  return { render };
}
