#!/usr/bin/env node
// Map tool for the command line. Dev-only, Node built-ins only.
// Everything it knows comes from editor/core (the same code the browser
// editor runs); this file only reads files, calls the core and prints.
//
//   node tools/map.mjs generate [--seed N] [--length M] [--difficulty 1-5] [--branches N] [--jumps 0-1] [--out file.json]
//   node tools/map.mjs validate <map.json | level.js> [--json]
//   node tools/map.mjs jumps    <map.json | level.js> [--json]
//   node tools/map.mjs convert  <map.json> [--out level.js]        map -> level module
//   node tools/map.mjs import   <level.js> [--out map.json]        level module -> map
//   node tools/map.mjs rules                                       print the rule table
//
// Exit codes: 0 = pass, 1 = the map has warnings or errors, 2 = bad usage or unreadable file.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMap, serializeMap, validateMap } from '../editor/core/format.js';
import { levelToMap, levelModuleSource } from '../editor/core/convert.js';
import { analyse, countWarnings } from '../editor/core/analyse.js';
import { generateMap, GENERATOR_DEFAULTS } from '../editor/core/generate.js';
import { PROFILES } from '../editor/core/predict.js';
import { RULES } from '../editor/core/rules.js';
import { featureName } from '../editor/core/geometry.js';

const USAGE = `Summit Protocol map tool

  generate [--seed N] [--length M] [--difficulty 1-5] [--branches N] [--jumps 0-1] [--out file.json]
           Make a course from a seed and settings. Same settings, same course.
  validate <map.json | level.js> [--json]
           Check the file and print every rule warning.
  jumps    <map.json | level.js> [--json]
           Air time and landing position of every feature at slow, normal and adrenaline speed.
  convert  <map.json> [--out level.js]
           Write the game level module for a map.
  import   <level.js> [--out map.json]
           Turn a game level module into a map file.
  rules    Print the placement rule table.

Exit codes: 0 pass, 1 warnings or errors found, 2 bad usage or unreadable file.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const key = a.slice(2);
    if (key === 'json') flags.json = true;
    else { if (i + 1 >= argv.length) throw new UsageError(`--${key} needs a value.`); flags[key] = argv[++i]; }
  }
  return { flags, rest };
}

// Read a map file (.json) or a level module (.js / .mjs). Returns { map, source }.
async function load(file) {
  if (!file) throw new UsageError('Which file? Give a map (.json) or a level module (.js).');
  const full = resolve(file);
  if (/\.m?js$/.test(full)) {
    let mod;
    try { mod = await import(pathToFileURL(full).href); } catch (e) { throw new UsageError(`Cannot load ${file}: ${e.message}`); }
    if (!mod.default) throw new UsageError(`${file} has no default export (a level module exports its level as default).`);
    const map = levelToMap(mod.default, { notes: `Imported from ${file}` });
    const errors = validateMap(map);
    if (errors.length) throw new UsageError(`${file} is not a usable level:\n${errors.map((e) => `  ${e.message}`).join('\n')}`);
    return { map, source: 'level' };
  }
  let text;
  try { text = await readFile(full, 'utf8'); } catch (e) { throw new UsageError(`Cannot read ${file}: ${e.message}`); }
  const res = parseMap(text);
  if (!res.map) throw new UsageError(`${file} is not a valid map:\n${res.errors.map((e) => `  ${e.message}`).join('\n')}`);
  return { map: res.map, source: 'map' };
}

async function emit(text, out) {
  if (out) { await writeFile(resolve(out), text); console.error(`Wrote ${out}`); } else process.stdout.write(text);
}

function summary(map, a) {
  const kinds = {};
  for (const f of map.features) kinds[f.type] = (kinds[f.type] || 0) + 1;
  const c = countWarnings(a.warnings);
  return [
    `${map.name} (${map.id}): ${map.length} m, ${map.paths.length} piste${map.paths.length === 1 ? '' : 's'} (${map.paths.map((p) => p.id).join(', ')})`,
    `  features ${map.features.length} (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}), gates ${map.gates.length}, scenery ${map.scenery.length}, objects ${map.objects.length}, generated trees ${a.terrain.props.length - map.props.length}`,
    `  ${c.errors} error${c.errors === 1 ? '' : 's'}, ${c.warnings} warning${c.warnings === 1 ? '' : 's'}`,
  ].join('\n');
}

function printWarnings(warnings) {
  for (const w of warnings) console.log(`  ${w.severity === 'error' ? 'ERROR  ' : 'warning'}  z ${String(Math.round(w.z)).padStart(5)}  x ${String(Math.round(w.x)).padStart(4)}  [${w.rule}] ${w.message}`);
}

const commands = {
  async generate({ flags }) {
    const settings = {
      seed: flags.seed ?? GENERATOR_DEFAULTS.seed, length: flags.length ?? GENERATOR_DEFAULTS.length,
      difficulty: flags.difficulty ?? GENERATOR_DEFAULTS.difficulty, branches: flags.branches ?? GENERATOR_DEFAULTS.branches,
      jumpDensity: flags.jumps ?? GENERATOR_DEFAULTS.jumpDensity,
    };
    for (const [k, v] of Object.entries(settings)) if (!Number.isFinite(Number(v))) throw new UsageError(`--${k === 'jumpDensity' ? 'jumps' : k} should be a number, not "${v}".`);
    const { map, report } = generateMap(settings);
    await emit(serializeMap(map), flags.out);
    const r = report, rm = r.removed;
    console.error(`Generated with ${JSON.stringify(r.settings)} (attempt ${r.attempt + 1})`);
    console.error(`  features kept ${r.features.placed} of ${r.features.wanted}; branches ${r.branches.placed} of ${r.branches.wanted}; repairs: ${rm.nudged} moved, ${rm.features} features, ${rm.gates} gates, ${rm.scenery} scenery, ${rm.objects} objects removed`);
    for (const n of r.notes) console.error(`  note: ${n}`);
    console.error(r.ok ? '  PASS: no warnings' : `  FAIL: ${r.warnings.length} warning(s) could not be repaired`);
    if (!r.ok) for (const w of r.warnings) console.error(`    [${w.rule}] ${w.message}`);
    return r.ok ? 0 : 1;
  },

  async validate({ flags, rest }) {
    const { map } = await load(rest[0]);
    const a = analyse(map);
    if (flags.json) console.log(JSON.stringify({ ...countWarnings(a.warnings), list: a.warnings }, null, 1));
    else {
      console.log(summary(map, a));
      printWarnings(a.warnings);
      console.log(a.warnings.length ? 'FAIL' : 'PASS');
    }
    return a.warnings.length ? 1 : 0;
  },

  async jumps({ flags, rest }) {
    const { map } = await load(rest[0]);
    const a = analyse(map);
    const rows = a.jumps.map((j) => ({
      index: j.index, type: j.feature.type, x: j.feature.x, z: j.feature.z,
      ...Object.fromEntries(PROFILES.map((p) => {
        const f = j.flights[p.id];
        return [p.id, f.air
          ? { speed: +f.speed.toFixed(1), air: true, airTime: +f.airTime.toFixed(2), distance: +f.distance.toFixed(1), height: +f.maxHeight.toFixed(1), landX: +f.landing.x.toFixed(1), landZ: +f.landing.z.toFixed(1) }
          : { speed: +f.speed.toFixed(1), air: false }];
      })),
      warnings: a.warnings.filter((w) => w.items.some((i) => i.kind === 'feature' && i.index === j.index)).map((w) => w.message),
    }));
    if (flags.json) { console.log(JSON.stringify(rows, null, 1)); return 0; }
    console.log(`${map.name}: predicted flights with default tuning. Speeds: ${PROFILES.map((p) => p.name.toLowerCase()).join(', ')}.`);
    console.log('  time in the air (s) / distance flown (m) / peak height (m) -> lands at z');
    for (const r of rows) {
      console.log(`\n#${r.index} ${featureName(r)}  (x ${r.x})`);
      for (const p of PROFILES) {
        const f = r[p.id];
        console.log(`    ${p.name.padEnd(10)} ${String(f.speed).padStart(5)} m/s  ${f.air ? `${f.airTime.toFixed(2)} s / ${String(f.distance).padStart(5)} m / ${String(f.height).padStart(4)} m -> z ${f.landZ}` : 'stays on the snow'}`);
      }
      for (const w of r.warnings) console.log(`    ! ${w}`);
    }
    return 0;
  },

  async convert({ flags, rest }) {
    const { map, source } = await load(rest[0]);
    if (source !== 'map') throw new UsageError('convert takes a map file (.json). To go the other way use: import <level.js>.');
    await emit(levelModuleSource(map), flags.out);
    if (map.objects.length) console.error(`Note: ${map.objects.length} placeholder object(s) are written under "objects", which the game does not read yet.`);
    return 0;
  },

  async import({ flags, rest }) {
    const { map, source } = await load(rest[0]);
    if (source !== 'level') throw new UsageError('import takes a level module (.js).');
    await emit(serializeMap(map), flags.out);
    return 0;
  },

  async rules() {
    for (const r of RULES) {
      const { id, severity, name, about, ...numbers } = r;
      console.log(`${id}  (${severity})  ${name}`);
      console.log(`    ${about}`);
      if (Object.keys(numbers).length) console.log(`    ${Object.entries(numbers).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
    }
    return 0;
  },
};

try {
  const [name, ...argv] = process.argv.slice(2);
  if (!name || name === 'help' || name === '--help') { console.log(USAGE); process.exit(name ? 0 : 2); }
  if (!commands[name]) throw new UsageError(`Unknown command "${name}".`);
  process.exitCode = await commands[name](parseArgs(argv));
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  console.error(`${e.message}\n\n${USAGE}`);
  process.exitCode = 2;
}
