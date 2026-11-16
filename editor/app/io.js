// Files and autosave. Import by file picker or drag and drop, export by
// download, and the working map kept in localStorage. All checking of file
// contents is done by core/format.js (parseMap); nothing here validates.

import { parseMap, serializeMap } from '../core/format.js';
import { levelModuleSource } from '../core/convert.js';

// Versioned key. The number is the version of how the editor stores things,
// not the map version (the stored text is a normal map file and is migrated
// like any other when read).
const AUTOSAVE_KEY = 'summit.editor.map.v1';

export function readAutosave() {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    return parseMap(text).map;
  } catch { return null; }
}

export function writeAutosave(map) {
  try { localStorage.setItem(AUTOSAVE_KEY, serializeMap(map)); return true; } catch { return false; }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileBase = (map) => String(map.id || 'map').replace(/[^\w.-]+/g, '-');

export function exportMap(map) { download(`${fileBase(map)}.map.json`, serializeMap(map), 'application/json'); }
export function exportLevel(map) { download(`${fileBase(map)}.js`, levelModuleSource(map), 'text/javascript'); }

// Read a dropped or picked file. Calls onMap(map, fileName) or onError(fileName, errors).
export async function importFile(file, onMap, onError) {
  let text;
  try { text = await file.text(); } catch (e) { onError(file.name, [{ message: `The file could not be read: ${e.message}` }]); return; }
  const res = parseMap(text);
  if (res.map) onMap(res.map, file.name, res.migratedFrom); else onError(file.name, res.errors);
}

// Wire the file picker and whole-window drag and drop.
export function attachImport({ input, dropZone, onMap, onError }) {
  input.addEventListener('change', () => { if (input.files[0]) importFile(input.files[0], onMap, onError); input.value = ''; });
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; dropZone.classList.add('dropping'); e.preventDefault(); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dropZone.classList.remove('dropping'); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; dropZone.classList.remove('dropping');
    if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0], onMap, onError);
  });
}
