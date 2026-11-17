// The palette: one button per placeable type, in groups. Picking a button
// arms the place tool in interact.js; picking the armed button again
// disarms it. The palette holds no tool state of its own and never edits the
// map: interact.js owns the tool, the store owns the map.
//
// Buttons are built from the type tables, so a new scenery or catalogue type
// appears here with no editor change.

import { SCENERY_TYPES } from '../../js/data/scenery.js';
import { OBJECT_TYPES } from '../core/catalogue.js';

// Hand-placed trees: the only prop types the game draws (js/render/props.js).
const TREES = { pine: 'Pine', blob: 'Round tree' };

export const PALETTE = [
  { name: 'Features', kind: 'feature', types: { roller: 'Roller', kicker: 'Kicker', ledge: 'Ledge' } },
  { name: 'Scenery', kind: 'scenery', types: Object.fromEntries(Object.entries(SCENERY_TYPES).map(([k, t]) => [k, t.name])) },
  { name: 'Objects', kind: 'object', types: Object.fromEntries(Object.entries(OBJECT_TYPES).map(([k, t]) => [k, t.name])) },
  { name: 'Trees', kind: 'prop', types: TREES },
];

export function createPalette(root, interact) {
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const buttons = [];
  for (const group of PALETTE) {
    const box = el('span', { className: 'group' }, el('b', { textContent: group.name }));
    for (const [type, label] of Object.entries(group.types)) {
      const b = el('button', { type: 'button', textContent: label, title: `Place a ${label.toLowerCase()}: click the plan (Shift+click to place more, Escape to stop)` });
      b.dataset.kind = group.kind; b.dataset.type = type;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const t = interact.tool;
        interact.setTool(t && t.kind === group.kind && t.type === type ? null : { kind: group.kind, type });
      });
      buttons.push(b);
      box.append(b);
    }
    root.append(box);
  }

  // Show which button is armed (called whenever the tool changes).
  function update(tool) {
    for (const b of buttons) {
      const on = !!tool && tool.kind === b.dataset.kind && tool.type === b.dataset.type;
      b.classList.toggle('armed', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  // The plain name of a type, for status messages.
  const label = (kind, type) => PALETTE.find((g) => g.kind === kind)?.types[type] || type;

  return { update, label };
}
