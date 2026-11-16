// Editor entry point: wiring only. It holds no map state of its own; the
// store does. Flow: gestures and buttons -> store -> (plan, panel, warnings).

import level1 from '../../js/data/levels/level1.js';
import { levelToMap } from '../core/convert.js';
import { generateMap, GENERATOR_DEFAULTS, GENERATOR_LIMITS } from '../core/generate.js';
import { tuningOverridesIgnored } from '../core/predict.js';
import { createStore } from './store.js';
import { createPlan } from './plan.js';
import { attachInteraction } from './interact.js';
import { createPanel } from './panel.js';
import { createWarningList } from './warnings.js';
import { readAutosave, writeAutosave, exportMap, exportLevel, attachImport } from './io.js';
import { anchor } from './actions.js';

const $ = (id) => document.getElementById(id);

// Start from the autosaved map, else from level 1 as the game has it today.
const store = createStore(readAutosave() || levelToMap(level1, { notes: 'Level 1 as in js/data/levels/level1.js' }));
const plan = createPlan($('plan'));
const panel = createPanel($('panel'), store);
let highlight = [];        // the items of the warning last clicked
const warningList = createWarningList($('warnings'), $('warnings-title'), store, (w) => {
  highlight = w.items.filter((i) => i.kind !== 'path');
  const first = w.items.find((i) => i.kind !== 'path') || w.items[0];
  plan.centreOn(w.x, w.z, 2);
  store.select(first ? { ...first } : null);
});

// ---- drawing: one coalesced redraw per frame, always from the store
let queued = false;
function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    plan.draw({ map: store.map, analysis: store.analysis, selection: store.selection, highlight });
    $('zoom').textContent = `${plan.view.scale.toFixed(2)} px/m`;
  });
}
let panelQueued = false;
function refreshPanel() {
  if (panelQueued) return;
  panelQueued = true;
  requestAnimationFrame(() => { panelQueued = false; panel.render(); });
}

function status(text, kind = '') { const s = $('status'); s.textContent = text; s.className = kind; }

store.subscribe((reason, detail) => {
  if (reason === 'rejected') {
    status(`Not changed: ${detail.errors[0].message}`, 'error');
    refreshPanel();
    return;
  }
  if (reason === 'map') {
    highlight = highlight.filter((h) => anchor(store.map, h));
    if (!writeAutosave(store.map)) status('Autosave failed (browser storage is full or blocked). Export the map to keep it.', 'error');
    else if (detail?.label) status(detail.label);
    $('undo').disabled = !store.canUndo; $('redo').disabled = !store.canRedo;
    $('undo').title = store.canUndo ? `Undo: ${store.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    $('redo').title = store.canRedo ? `Redo: ${store.redoLabel} (Ctrl+Y)` : 'Nothing to redo';
    document.title = `${store.map.name} · Summit Protocol map editor`;
  }
  if (reason === 'selection' && !store.selection) highlight = [];
  if (reason !== 'preview') warningList.render();
  refreshPanel();
  redraw();
});

attachInteraction($('plan'), plan, store, {
  redraw,
  onCursor: (w, over) => { $('cursor').textContent = over ? `x ${w.x.toFixed(1)}  z ${w.z.toFixed(1)}` : ''; },
});

// ---- toolbar
$('undo').addEventListener('click', () => store.undo());
$('redo').addEventListener('click', () => store.redo());
$('fit').addEventListener('click', () => { plan.fit(store.map, store.analysis); redraw(); });
$('export-map').addEventListener('click', () => { exportMap(store.map); status(`Exported ${store.map.id}.map.json`); });
$('export-level').addEventListener('click', () => { exportLevel(store.map); status(`Exported ${store.map.id}.js (a game level module)`); });
$('import').addEventListener('click', () => $('file').click());
for (const layer of ['trees', 'arcs', 'warnings']) {
  $(`show-${layer}`).addEventListener('change', (e) => { plan.layers[layer] = e.target.checked; redraw(); });
}

attachImport({
  input: $('file'), dropZone: document.body,
  onMap(map, name, from) {
    store.select(null);
    if (store.apply(`Import ${name}`, map)) {
      plan.fit(store.map, store.analysis);
      status(`Imported ${name}${from !== map.version ? ` (updated from map version ${from})` : ''}. Ctrl+Z brings the previous map back.`);
    }
  },
  onError(name, errors) {
    $('error-title').textContent = `${name} could not be opened`;
    const list = $('error-list');
    list.replaceChildren(...errors.slice(0, 12).map((e) => Object.assign(document.createElement('li'), { textContent: e.message })));
    if (errors.length > 12) list.append(Object.assign(document.createElement('li'), { textContent: `...and ${errors.length - 12} more.` }));
    $('error-dialog').showModal();
  },
});

// ---- generate dialog
const genFields = ['seed', 'length', 'difficulty', 'branches', 'jumpDensity'];
for (const k of genFields) {
  const input = $(`gen-${k}`), [lo, hi] = GENERATOR_LIMITS[k];
  input.min = lo; input.max = hi; input.value = store.map.meta?.generator?.[k] ?? GENERATOR_DEFAULTS[k];
}
$('generate').addEventListener('click', () => { $('gen-report').textContent = ''; $('generate-dialog').showModal(); });
$('gen-random').addEventListener('click', () => { $('gen-seed').value = Math.floor(Math.random() * 100000); });   // choosing a seed is not generating: the generator itself never uses Math.random
$('gen-go').addEventListener('click', () => {
  const settings = Object.fromEntries(genFields.map((k) => [k, Number($(`gen-${k}`).value)]));
  const { map, report } = generateMap(settings);
  for (const k of genFields) $(`gen-${k}`).value = report.settings[k];
  store.select(null);
  if (!store.apply(`Generate course (seed ${report.settings.seed})`, map)) return;
  plan.fit(store.map, store.analysis);
  const r = report;
  const text = `${r.ok ? 'Passes every rule.' : `${r.warnings.length} warning(s) could not be repaired.`} ${r.features.placed} of ${r.features.wanted} features kept, ${r.branches.placed} of ${r.branches.wanted} branches. ${r.notes.join(' ')}`;
  $('gen-report').textContent = text;
  status(`Generated from seed ${r.settings.seed}. ${text} Ctrl+Z brings the previous map back.`, r.ok ? '' : 'error');
});
for (const b of document.querySelectorAll('dialog [data-close]')) b.addEventListener('click', () => b.closest('dialog').close());

// ---- start
function start() {
  warningList.render(); panel.render(); redraw();
  $('undo').disabled = true; $('redo').disabled = true;
  document.title = `${store.map.name} · Summit Protocol map editor`;
  status(tuningOverridesIgnored
    ? `Ready. Jump predictions use the default tuning; ${tuningOverridesIgnored} tuning change(s) saved in the game on this device are ignored.`
    : 'Ready. Jump predictions use the default tuning.');
}
// The first fit waits until the canvas has its real size.
let fitted = false;
new ResizeObserver(() => {
  plan.resize();
  if (!fitted && plan.height > 50) { plan.fit(store.map, store.analysis); fitted = true; }
  redraw();
}).observe($('plan'));
start();

// For poking from the console, as the game does with window.summit.
window.editor = { store, plan, generateMap };
