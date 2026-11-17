# Map editor — design reference

The editor is a desktop design tool for Summit Protocol courses. It is not part of the shipped game. This file is the reference for anyone continuing the work: read it before `editor/MILESTONES.md`.

All game conventions apply (see `CLAUDE.md`): metres, seconds, radians; `x` across the slope, `z` downhill; heights relative to a flat base slope; one take-off rule; levels are data.

## 1. The map file

A map is **a game level object plus three envelope keys**. Everything the game's level data already has keeps the same name and shape, so the game's own `createTerrain()` can read it.

| Key | Meaning |
| --- | --- |
| `format` | Always `"summit-map"`. |
| `version` | Integer. Currently `1`. Changes only with a migration (section 6). |
| `meta` | Free notes for the editor: `{ notes, generator: { seed, length, difficulty, branches, jumpDensity } }`. Never read by the game. |
| `id`, `name`, `length`, `start`, `gateSpacing`, `race`, `seed`, `paths`, `grades`, `features`, `props`, `scenery`, `fenceOffset`, `fenceTreeDensity` | Exactly as in `js/data/levels/level1.js`. |
| `gates` | The **final** gate list: `[{ x, z, red, path }]`. Generated once the way the game does it, then edited by hand. `terrain.js` uses this list when a level has one. |
| `objects` | Placeholder objects from the catalogue (hut, lodge, pylon, rock...): `[{ type, x, z, rot?, x2?, z2?, r? }]`. `rot` is radians about the vertical, 0 = facing downhill. Line types (fence) run from `x, z` to `x2, z2`. |

Any other key, at any depth, is kept untouched on import and written back on export. The editor never rebuilds an item from the fields it knows; it only changes the fields being edited.

Small example (a valid map):

```json
{
  "format": "summit-map", "version": 1,
  "meta": { "notes": "example" },
  "id": "example", "name": "Example", "length": 400,
  "start": { "x": 0, "z": 6 }, "gateSpacing": 45, "seed": 3,
  "race": { "gold": 20, "silver": 23, "bronze": 26 },
  "paths": [
    { "id": "main", "nodes": [ { "z": -40, "x": 0, "w": 16 }, { "z": 460, "x": 0, "w": 16 } ] }
  ],
  "grades": [ { "z": 0, "grade": 1 } ],
  "features": [ { "type": "kicker", "x": 0, "z": 150, "width": 10, "length": 6, "height": 1.5 } ],
  "props": [],
  "scenery": [ { "type": "caution", "x": -8, "z": 130 } ],
  "gates": [ { "x": -6, "z": 51, "red": true, "path": "main" }, { "x": 6, "z": 96, "red": false, "path": "main" } ],
  "objects": [ { "type": "hut", "x": 40, "z": 200, "rot": 0 } ]
}
```

### Why placeholders are in `objects`, not `props`

`terrain.js` pushes `level.props` straight into the forest list. Today the renderer skips prop types it does not know (`js/render/props.js`: `if (!mesh ...) continue`), so nothing would crash. But game milestone 1 turns everything in that list into a crash obstacle, which would make placeholders **invisible things you crash into**. So placeholders live in `objects`, a key the game reads for one thing only: its generated forest leaves a clearing round each object (since E1b), so they are never collided with or drawn yet. `mapToLevel()` leaves `objects` out when it is empty. A later game milestone gives each catalogue type a model and collision and starts reading `level.objects`.

## 2. Modules

### Shared core: `editor/core/` — pure

Runs unchanged in Chrome and in Node. **Must never** touch the DOM, `window`, `localStorage`, Three.js, `Math.random`, the clock, or files. Imports only the game's pure modules (`js/terrain.js`, `js/rider-physics.js`, `js/tuning.js`, `js/data/*`) and each other.

| File | Owns | Must never |
| --- | --- | --- |
| `rng.js` | The seeded random source (`createRng(seed)`). | Use `Math.random`. |
| `format.js` | `MAP_VERSION`, `validateMap()` (readable errors with the path to the bad value), `migrateMap()` and the `MIGRATIONS` table, `parseMap()` / `serializeMap()` (text in, text out), `emptyMap()`. | Change a map it is validating. Know about rules or physics. |
| `convert.js` | `levelToMap()`, `mapToLevel()`, `levelModuleSource()` (the text of a `js/data/levels/*.js` file). | Drop a field it does not know. |
| `catalogue.js` | Re-exports `js/data/objects.js` (moved there in E1b because the game reads it): placeholder object types as data (name, footprint, collision radius, height, where it belongs), `objectCircles()`, `objectFootprint()`, `pointGap()`. | Draw anything. |
| `geometry.js` | Measuring helpers over a map: which piste is where, lanes, jump take-off positions, and each placed thing's footprint with the gaps between footprints and to the fence (`footprint()`, `footprintGap()`, `fenceGap()`). Uses the game's exported `pathAt()`, `jumpZone()` and `terrain.fenceAt()`. | Re-implement the piste interpolation. |
| `predict.js` | Jump prediction by calling the game's real `step()` on a real `createTerrain()`. Defines the three speed profiles. | Contain flight maths of its own. |
| `rules.js` | The `RULES` table (name, distance, severity, message) and `checkMap()`, which returns warnings with a location. | Change the map. Hide a distance inside a check function. |
| `analyse.js` | `analyse(map)`: one call that returns `{ level, terrain, jumps, warnings }`. The editor and the command line both use only this. | Cache across maps. |
| `generate.js` | `generateMap(settings)`: seed and settings in, a map that passes the rules out. | Use `Math.random`. Return a map with warnings without saying so in its report. |

### Browser editor: `editor/app/` and `editor/index.html`

| File | Owns | Must never |
| --- | --- | --- |
| `store.js` | The working map, selection, undo and redo. **The only place the map changes.** After every change it re-runs `analyse()` and tells its listeners. | Draw. Read the mouse. |
| `actions.js` | Named edits (move a node, move a gate, set a field...) as pure functions `map -> new map`. | Mutate the map it is given. |
| `plan.js` | Drawing the 2D plan on a canvas, and hit-testing (what is under the mouse). | Change the map or the selection. |
| `interact.js` | Mouse and keyboard on the plan: pan, zoom, select, drag, and the place tool (`setTool()`, `ghost`). Turns gestures into store calls. | Draw. Edit the map directly. |
| `palette.js` | The palette strip: one button per placeable type, built from the type tables. Arms the place tool through `interact.setTool()`. | Hold tool state. Edit the map. |
| `panel.js` | The properties panel for the selected item, and the jump report for a selected feature. | Edit the map directly (it calls the store). |
| `warnings.js` | The warning list; a click moves the view to the problem. | Compute rules. |
| `io.js` | Import (file picker, drag and drop), export (download), autosave in `localStorage` under `summit.editor.map.v1`. | Validate by itself (it calls `format.js`). |
| `main.js` | Wiring, toolbar, the generate dialog. | Hold map state of its own. |

### Command line: `tools/map.mjs`

Reads and writes files, calls the core, prints. All logic stays in the core. Exit codes: `0` pass, `1` the map has warnings or errors, `2` bad usage or unreadable file.

### Tests: `editor/test/*.test.mjs`

Node's built-in runner, no dependencies: `node --test "editor/test/*.test.mjs"` (the quotes and the pattern are needed; a bare folder name does not work on this Node version). `core.test.mjs` covers the core and the command line; `store.test.mjs` covers the store and the actions, which need no browser.

## 3. Data flow

```
 file / autosave / generator ──> parseMap + migrateMap + validateMap ──> store.load(map)
                                                                           │
 mouse, panel, dialogs ──> actions (map -> new map) ──> store.apply() ─────┤   (history, autosave)
                                                                           ▼
                                                                    analyse(map)
                                           mapToLevel -> createTerrain -> predictJumps -> checkMap
                                                                           │
                              plan.js draws  ◄── { map, level, terrain, jumps, warnings, selection } ──► warnings list, panel
```

- A map is treated as a value that is never changed in place. Every edit makes a new map. Undo is a stack of earlier maps.
- A drag calls `store.preview(newMap)` on every mouse move (no history entry) and `store.commit()` on release (one history entry for the whole drag).
- Drawing reads the store and nothing else. Nothing that draws can change the map.

## 4. Jump prediction

`predictFlight()` places a rider `RUN_UP` metres above a feature on its centre line, heading straight downhill, and calls `step()` at the game's 120 Hz until she has taken off and landed. Her speed is held at the entry speed until she leaves the snow.

The three speeds are the steady speeds the game's own riding formula settles at (acceleration zero in `stepGround()`), with the first rider's stats (`RIDERS[0]`, `EQUIPMENT[0]`) and the grade at the feature:

| Profile | Way of riding | Meter mods | Speed at grade 1 |
| --- | --- | --- | --- |
| slow | carving at full lock (`ride.maxHeading`), no boost | none | 16.1 m/s |
| normal | straight down, no input | none | 24.0 m/s |
| adrenaline | straight down, boost held | `meter.adrJump`, `adrAir`, `adrBoost` | 41.8 m/s |

"Adrenaline" is the realistic worst case: adrenaline doubles boost, and players hold boost while it runs. It gives far longer flights than "normal" (the big kicker on the test slope: 42 m normal, 145 m adrenaline).

Predictions always use the default tuning. `js/tuning.js` applies saved on-device overrides when it loads in a browser; importing `predict.js` puts the defaults back in memory only (saved overrides are untouched; the game page is unaffected). The editor shows a note when overrides were set aside.

Checked against the measured airs in `PROGRESS.md` (normal profile): 4.5 m ledge 0.75 s (measured 0.75), second roller 0.67 s (0.7), big kicker 1.68 s (1.7), 12 m ledge 1.47 s (1.5). The first roller predicts 0.55 s against a measured 0.3 s because in the measured run she reaches it 64 m after a standing start, well below steady speed.

## 5. Placement rules

One table, `RULES` in `core/rules.js`. Each row has an id, a plain name, its distances, a severity (`error` = the course is broken, `warning` = bad design) and produces warnings `{ rule, severity, x, z, message, items }`, where `items` name the map entries involved so the editor can select them. Add or change a rule by editing the table; the distances must stay in the table.

`node tools/map.mjs rules` prints the table with every distance.

A "jump" for spacing and gate rules is a kicker or a ledge (the game's `jumpZone()`); rollers are not. Predicted-landing rules apply to every feature that gets air at a profile.

## 6. Versions and migration

`MAP_VERSION` is in `core/format.js`. **Never change what a map file means without all three: a version bump, a migration, and the owner's approval.** A migration is a function in `MIGRATIONS[n]` that turns a version `n` map into version `n + 1`. `migrateMap()` runs them in order, so any old file opens. A file from a newer editor is refused with a clear message. Adding a key the old editor would simply carry along is still a format change if the game or the rules give it meaning.

## 7. Changes made to game files

Listed in `PROGRESS.md` too. Up to E1, none changed how the game plays. E1b made two changes the owner asked for (2026-11-17) that change the generated forest; everything else stays as it was.

- E1b, `js/terrain.js`: new `terrain.fenceAt(z)` (where the red fence is at a z; the fences are now drawn from it, same points). The generated forest keeps every tree's edge `forest.fenceClear` (1 m) from the fence and `forest.objectClear` (1 m) from every placed object in `level.objects` (both new values in `js/tuning.js`). Level 1 has no objects, so the only change to it is one tree that stood 0.75 m from the fence. Its gates are unchanged (the baseline test still passes).
- E1b, `editor/core/catalogue.js` moved to `js/data/objects.js` (the move E8 had planned), with `objectFootprint()` and `pointGap()` added so the forest and the editor's rules measure in exactly the same way. `editor/core/catalogue.js` re-exports it.

- `js/terrain.js`: `pathAt()` moved from inside `createTerrain()` to an exported function (same code). The gate generator moved into exported `generateGates(level)` and `jumpZone(feature)`; `createTerrain()` calls it. If a level has a `gates` list, `createTerrain()` uses it instead of generating (level 1 has none, so it generates as before). Verified: level 1 produces byte-identical gates (`editor/test/level1-gates.baseline.json`).

## 8. Ground rules for every map

Decided by the owner on 2026-11-17. They apply to hand-made and generated maps alike. All are **warnings** (orange): a map that breaks one can still be saved and used, but the generator never hands one out without saying so in its report (in practice every generated course passes). The distances live in the `RULES` table; change them there.

1. **Gates keep away from jumps** (`gate-near-jump`). No gate within 30 m before a jump or on it. After a jump, none until 10 m past where she lands at normal speed (the real physics). The owner chose normal speed rather than every speed: at adrenaline speed she can still fly past or onto a gate, which `landing-predicted` reports as before.
2. **The red fence holds her in** (game physics, not an editor rule). She can never get past the side fences, on the snow or in the air; touching one is not a crash, she slides along it. This is written into game milestone 1 (`MILESTONES.md`) and is built there. The jump predictions will follow it by themselves, because they run the real `step()`.
3. **Nothing touches the fence** (`clear-of-fence`). Trees, scenery, objects and features keep their whole footprint 1 m from the fence line, on either side. The game's own forest obeys this (`forest.fenceClear`).
4. **Nothing overlaps anything else** (`no-overlap`). Features, gates, scenery, objects and hand-placed trees keep 1 m apart, edge to edge, and 1 m from the generated forest. The game's forest leaves a clearing round every placed object (`forest.objectClear`), so buildings can stand in the woods. A gate against a jump is left to rule 1.

A footprint is the thing's own size, from its data: `r` or `halfW`/`halfD` (scenery), the catalogue shape (objects: a rect's outline, a fence run thickened by its post radius), width by span (features), the gate's width plus its poles, `r` (trees).

The generator follows them by placing scenery and objects clear in the first place (it tries a few spots up and down the slope, without using random numbers), then its check and repair loop removes anything left over.

## 9. The 3D preview pane (later work): what was found in `js/render/*`

Checked on 2026-11-16. The render modules can be reused as they are:

- `createView(canvas, terrain, rider, quality)` takes **any canvas**. It does not look up game DOM ids. It reads the canvas's own `clientWidth` / `clientHeight`, so it works inside a pane.
- `view.render(state, dt)` takes a rider state and positions the game camera from it. For a preview, make a state with `createRider(level)`, set `x`, `z`, `y = terrain.heightAt(x, z)`, call `view.snap(state)` then `view.render(state, 0)`. That is the real game view of that spot.
- `view.scene` is exposed, so the editor can add its own simple meshes for placeholder objects without touching game files.
- The textures use `document.createElement('canvas')`: fine in any page, not in Node. Keep `js/render/*` out of `editor/core/`.

Three things to handle when building it:

1. **No dispose.** `createView` adds a `resize` listener and GPU objects and never removes them. Rebuilding the view on every edit would leak. Either add a `dispose()` to `view.js` (a game change that does not affect play: allowed, list it) or rebuild rarely (on demand or when the mouse is released).
2. **The view is built for one terrain.** A changed map needs a new `createTerrain()` and a new view. `analyse()` already returns the terrain; pass that same object so plan and preview can never disagree.
3. **Unknown things are skipped silently**: `props.js` ignores prop types other than `pine` and `blob`; `render/scenery.js` ignores unknown scenery types. Placeholders will not appear until the editor adds meshes for them.

The pane must only read from the store, like the plan.
