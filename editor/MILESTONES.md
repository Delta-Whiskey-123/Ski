# Map editor milestones

Ordered work list for the map editor (branch `map-editor`). This is a separate track from the game's `MILESTONES.md`. Do the first unticked one, exactly as written, then tick it. Each is sized for one session. The design decisions are made here on purpose: do not re-decide them. If one looks wrong or is blocked, stop and tell the owner.

Read `editor/DESIGN.md` first. It says what each file owns and what it must never do.

Rules for every milestone:

- **The map format does not change** (`MAP_VERSION` in `editor/core/format.js`) without a version bump, a migration and the owner's approval. None of the milestones below needs a format change. If you think one does, stop and ask.
- **The map changes only through the store**: `store.apply(label, map => newMap)` for a finished edit, `store.preview()` / `store.commit()` for a drag. New edits are new pure functions in `editor/app/actions.js` (map in, new map out, never changing the map given). `plan.js` never changes anything.
- `editor/core/` stays pure: no DOM, no `localStorage`, no Three.js, no `Math.random`.
- No physics or piste maths in the editor. Use `analyse()`, `pathAt()` and the helpers in `core/geometry.js`.
- Every new action gets a test in `editor/test/store.test.mjs`; every core change gets one in `core.test.mjs`.
- Every milestone ends with: `node --test "editor/test/*.test.mjs"` all passing; the editor opened in Chrome (`node tools/serve.mjs`, then http://localhost:8130/editor/) with a clean console and the "Check" below done by hand; the game page (http://localhost:8130/) still loading with a clean console; `PROGRESS.md` updated; commit; push to `origin map-editor` (never to `main`).
- Desktop Chrome, mouse and keyboard only. `click` events are fine here. The game's phone and touch rules do not apply to the editor.

- [x] **E0. Foundation** — done by the architect: map format, validation, migration hook, level conversion, placement rules, jump prediction with the real physics, generator, command-line tool, tests, and the editor skeleton (plan with pan and zoom, select and drag, properties panel, jump flights, warning list, generate, import, export, undo, redo, autosave, delete).

---

## - [x] E1. Place anything from a palette

**Goal:** add new things to the map by picking a type and clicking the plan.

- New file `editor/app/palette.js`: a strip under the toolbar (add `<nav id="palette">` to `editor/index.html`). One button per placeable type, in four groups:
  - **Features:** roller, kicker, ledge.
  - **Scenery:** every key of `SCENERY_TYPES` (`js/data/scenery.js`), labelled with its `name`.
  - **Objects:** every key of `OBJECT_TYPES` (`editor/core/catalogue.js`), labelled with its `name`. Build the buttons from the tables, so a new catalogue type appears with no editor change.
  - **Trees:** `pine` and `blob` (hand-placed props; these are the only prop types the game draws).
- Picking a button arms a **place tool**. The tool state lives in `interact.js` (`tool = { kind, type } | null`); the palette only calls `interact.setTool()`. While armed: the cursor shows a faint outline of the thing at the pointer (draw it in `plan.draw` from a `ghost` field passed in the draw state: a plain object in the same shape as a map item, never added to the map); a click adds the thing there and selects it; Escape or clicking the armed button again disarms. Holding Shift while clicking keeps the tool armed for another.
- New action `addItem(map, kind, item)` in `actions.js` returning `{ map, selection }`. Defaults for a new item, in a `NEW_ITEM` table in `actions.js`:
  - roller `{ width: 20, length: 18, height: 1.2 }`; kicker `{ width: 10, length: 7, height: 2 }`; ledge `{ width: 16, drop: 4.5, approach: 46, run: 2.5, lip: 0 }`.
  - scenery `{ type, x, z }`; object `{ type, x, z }`, plus `rot: 0` for `rect` shapes, plus `x2: x, z2: z + 20` for `line` shapes; prop `{ type, x, z, s: 1, r: 0.5 }`.
  - A new feature's `x` snaps to the centre of the nearest piste (`nearestPath()`) if the click is within 3 m of it; otherwise it stays where clicked.
- Features are kept sorted by `z` in the map (insert at the right place; return the selection for the new index).
- Rotation for `rect` objects: the properties panel already offers `turn (radians)`. Add a second read-out in degrees beside it; no rotate handle yet.

**Check:** place one of every type; each appears in the right place, is selected, shows its fields, and can be dragged, undone and redone. A kicker placed just above a gate shows a `gate-near-jump` warning at once. A hut dropped on a piste shows `object-clear-of-piste`. Export, re-import: nothing lost. The placeholder objects do not appear in `mapToLevel(map).props` (already tested; keep that test passing).

## - [x] E1b. Ground rules for every map

**Goal:** the owner's ground rules (2026-11-17) hold on every map, hand-made or generated. See `editor/DESIGN.md` section 8.

- Rules in the `RULES` table, all `warning`: `gate-near-jump` changed (no gate 30 m before a jump, on it, or until `margin` 10 m past its landing at `speed` normal: the owner chose normal speed over every speed); new `clear-of-fence` (trees, scenery, objects and features keep their footprint 1 m from the red fence, either side); new `no-overlap` (features, gates, scenery, objects and hand-placed trees 1 m apart edge to edge, and 1 m from the generated forest; a gate against a jump is left to `gate-near-jump`).
- Footprints from the data tables, in `core/geometry.js` (`footprint()`, `footprintGap()`, `fenceGap()`); the fence position from the game's new `terrain.fenceAt(z)`.
- Game forest (owner's choice, two questions asked): keeps trees 1 m from the fence (`forest.fenceClear`) and 1 m from every placed object (`forest.objectClear`). This needed the object table in the game: `editor/core/catalogue.js` moves to `js/data/objects.js` and re-exports.
- Generator: places scenery and objects in a clear spot (fixed shifts up and down the slope, no random numbers), then the usual repair. Every generated course passes.
- The red fence as a wall is game physics: written into game milestone 1, not built here.
- `editor/maps/generated-11.map.json` regenerated from its own seed and settings. Level 1 and `test-slope.map.json` are not touched (owner).

**Check:** each new rule fires on a small map that breaks it and is quiet on one that does not; generated courses across 600 to 4000 m, difficulty 1 to 5 and 0 to 6 branches pass; the same seed gives the same file; level 1's gates are unchanged.

## - [ ] E2. Gates: add, flip, regenerate

**Goal:** full control of the gate list. (Dragging and deleting a gate already work.)

- Palette group **Gates** with one button, "Gate". Placing one: `{ x, z, red, path }` where `path` is the id of the nearest piste (`nearestPath`) and `red` is the opposite of the nearest gate uphill on that same piste (red if there is none). Refuse the click with a status message if no piste exists at that `z`.
- The map keeps `gates` sorted by `z`. Decision: **sort when an edit is finished, not during a drag.** Add a small pure `normalise(map)` to `actions.js` that returns the map with `gates` sorted by `z` (and the same map object when they already are); `store.apply` and `store.commit` run it just before validating. Sorting moves a gate to a new index, so the store then re-finds the selected gate by object identity (the gate object itself is not copied by the sort) and updates the selection. `normalise` must not change anything else.
- Panel for a selected gate: a "Flip colour" button. Panel for a selected piste (`kind: 'path'`, reached by clicking a piste point): two buttons, **"Regenerate gates on this piste"** and **"Remove all gates on this piste"**.
  - Regenerate: call the game's `generateGates(mapToLevel(map))`, keep only the gates whose `path` is this piste, drop any that `checkMap` would flag (run `analyse` on the candidate map and remove gates named in warnings, as `repair()` in `core/generate.js` does: move that loop into an exported `dropWarnedGates(map)` in `core/generate.js` and use it from both places), and replace this piste's gates with them. One undo step.
  - This is how "gates on the main line and the racer's piste only" (game milestone 5) is done: remove all gates on the other pistes.
- The optional per-piste `gateSpacing` field already exists in the panel and is honoured by `generateGates`.

**Check:** add gates down a piste: colours alternate. Drag one past another: after release the list is still in `z` order and the same gate is still selected. Change a piste's gate spacing to 30, regenerate: gates are 30 m apart, none within the jump distances, no warnings. Remove all gates on a branch. Undo steps back through each action one at a time.

## - [ ] E3. Pistes: points, branches, join snapping

**Goal:** lay out routes by hand.

- **Add a point:** double-click a piste's centre line (within 6 px) inserts a point there with the piste's interpolated `x` and `w` (`pathAt`), so the shape does not change. **Delete a point:** Delete key on a selected point, refused when the piste would have fewer than 2 points.
- **Width handle:** each point's half-width whisker ends are draggable (new selection `{ kind: 'node', path, index, width: true }`); dragging sets `w` (minimum 4).
- **Add a branch:** toolbar button "Add branch", then two clicks on existing pistes, top then bottom (the second must be at least 300 m below the first: 2 × the `branch-separation` rule's `ramp` plus 60). Creates a piste with 4 points: the two ends exactly on the clicked pistes' centre lines, and two middle points `ramp` metres in from each end, offset to the side of the first click's pointer position by (parent half-width + 10 + `branch-separation.distance` + 5), half-width 10. Id: `branch`, `branch2`, ... (first unused). Take every distance from `rule('branch-separation')`; do not write 25 or 120.
- **Delete a piste:** button in the piste panel; never the main piste (index 0). Removes its gates too. If another piste's end sat on it, that piste now shows a `branch-join` error, which is correct: do not cascade.
- **Join snapping:** a branch's first and last points are *join points*. While one is dragged, it snaps onto the nearest other piste's centre line at its `z` when within 8 m (`x` = that centre; `w` = min(own, that piste's half-width)). A snapped join shows as a ring on the plan. When a point of a piste is moved, any other piste's end point that was within `branch-join.tolerance` of it before the move is re-snapped to it after the move, in the same undo step. Put this in one function `resnapJoins(before, after)` in `actions.js`, called by the node branch of `moveItem`.
- The main piste is always `paths[0]`; no reordering.

**Check:** build the Split A of game milestone 5 by hand on an empty map (one main line, a left and a right branch from 250 to 600): no `branch-join` or `branch-separation` warnings. Drag a main-piste point near a join: the branch end follows. Delete a branch: its gates go; undo brings both back. Add and delete points without the piste changing shape at the moment of insertion.

## - [ ] E4. Keyboard and multi-select

**Goal:** fast editing.

- Selection becomes a list. The store's `selection` stays the *primary* item (so the panel and all existing code keep working) and gains `store.selected` (array, primary first) and `store.selectMany()`. Shift+click toggles an item; dragging on empty plan with Shift held draws a box and selects everything whose anchor is inside. Plain drag on empty plan still pans.
- Dragging any selected item moves them all by the same offset (new action `moveMany`); one undo step. Piste points move with the usual ordering clamp; if any item cannot move, none do.
- Keys (in `interact.js`, ignored while typing in a field): arrows nudge 0.5 m (Shift = 5 m); Delete removes every removable selected item; Ctrl+D duplicates the selection 10 m downhill; Ctrl+A selects everything of the primary item's kind; `1`/`2`/`3` toggle the Trees / Jump flights / Warning marks layers; `+` and `-` zoom; `G` opens Generate; Ctrl+S exports the map; `?` opens a shortcut list (a `<dialog>` in `index.html`).
- The panel, with more than one item selected, shows the count and only the fields every item shares, with a blank value where they differ; editing a field sets it on all.

**Check:** box-select the three kickers of a park line and drag them 40 m downhill together: one Ctrl+Z puts all three back. Nudge a gate with the arrows. Duplicate a snowman. Every key in the `?` list does what it says. Typing in a panel field never triggers a shortcut.

## - [ ] E5. New map, map settings, steepness

**Goal:** start a course from nothing and set its global values.

- Toolbar "New…" opens a dialog: name, id (made from the name: lower case, dashes), length (m), main piste half-width. Creates `emptyMap()` (in `core/format.js`) with those values, as one undoable step (like Generate and Import, it replaces the map; Undo brings the old one back).
- Changing `length` in the map panel: extend or trim the main piste's last point to `length + 60` when it was at the old `length + 60`; warn in the status bar about anything now beyond the finish; never delete anything automatically.
- Steepness table in the map panel: add a row, delete a row (never the first), kept sorted by `z`. A grade row can already be edited.
- The start position is already draggable; add `start.x` / `start.z` fields to the map panel.
- "Race medal times": a button "Estimate" that sets gold to `length / (normal steady speed at the course's average grade)`, silver ×1.12, bronze ×1.3, using `entrySpeed()` from `core/predict.js`, and says in the status bar that these are estimates to be replaced by riding the course.
- The window title and the autosave already follow the map. Add a small "saved" / "not saved to a file since last change" marker in the status bar (set on any map change, cleared on Export map).

**Check:** New → a 1500 m map appears, passes every rule, exports and re-imports. Set length to 2000: the piste reaches the new finish. Add a steepness row at 700 with grade 1.2: the grade label appears on the plan and the predicted flights below 700 get longer.

## - [ ] E6. 3D preview pane

**Goal:** see the real game view of the spot being edited. Read `editor/DESIGN.md` section 9 first: it lists what was found in `js/render/*`.

- New file `editor/app/preview3d.js` and a `<canvas id="preview">` in a resizable pane under the plan (hidden by default; toolbar toggle "3D"). It imports the game's own `createView` from `js/render/view.js`. Do not copy render code.
- The pane shows the game camera at a **preview point**: the selected item's position, or where the plan was last clicked. Build a rider state with `createRider(level)`, set `x`, `z`, `y = terrain.heightAt(x, z)`, then `view.snap(state)` and `view.render(state, 0)`. A slider under the pane moves the point up and down the slope along the nearest piste centre, so you can "walk" a line. Draw the preview point on the plan as a small camera mark.
- Use the terrain from `store.analysis.terrain` (the same object the plan uses). Rebuild the view only when the map has changed **and** the mouse is up (`'map'` events from the store, never `'preview'`), and only while the pane is open.
- `view.js` has no way to free what it created. Add `dispose()` to the object `createView` returns: remove the `resize` listener, call `renderer.dispose()`, and dispose scene geometries and materials. This is a game-file change that does not affect play: list it in `PROGRESS.md` and check the game still loads with a clean console.
- Placeholder objects are not drawn by the game. Add simple meshes for them to `view.scene` from `preview3d.js` (a box the size of the catalogue footprint and height for `rect`, a cylinder for `circle`, thin boxes along a `line`), in the catalogue colour. These live in the editor only.
- Use the `medium` quality preset.

**Check:** select the big kicker: the pane shows it as the game would, with its paint. Move it on the plan: the pane updates when the mouse is released. Drag the slider from above a ledge to below it. Open and close the pane 20 times and edit in between: memory in Chrome's task manager does not climb, and the console stays clean. The game itself still loads and plays.

## - [ ] E7. Design level 1 in the editor (with the owner)

**Goal:** the full level 1 course of game milestone 5, as a map file. This milestone is done **with the owner**: they place things; you run the tools and fix what they ask for.

- Start from `node tools/map.mjs generate --length 2600 --branches 5 --seed <owner's choice>` or from an empty map, as the owner prefers. The layout table in game milestone 5 (Summit Bowl, Split A, The Chute, Treeline, Split B, Lower mountain, Finish arena) is the brief.
- Save the result as `editor/maps/level1.map.json` and commit it. `node tools/map.mjs validate` on it must print PASS, or the owner must have said which warnings they accept (record them in `PROGRESS.md`).
- Do not change `js/data/levels/level1.js` here. That is E8.

**Check:** `node tools/map.mjs validate editor/maps/level1.map.json` and `node tools/map.mjs jumps` on it, both shown to the owner; the owner says the layout is what they want.

## - [ ] E8. Game side: load a map as a level

**Goal:** the game plays a course made in the editor. This is game work and follows the game's `CLAUDE.md` rules (tuning numbers in `js/tuning.js`, levels as data, push to the branch the owner names). **Needs game milestone 1 (crashes) done first**; if it is not, stop and tell the owner.

- A level is still a module under `js/data/levels/`. The route from map to game is `node tools/map.mjs convert editor/maps/<name>.map.json --out js/data/levels/<id>.js`, then register it in `js/data/levels/index.js`. The game does **not** read `.json` map files at run time (no network requests).
- `createTerrain()` already uses a level's own `gates` list. Nothing to do there.
- Make the game read `level.objects` for collisions: in `js/terrain.js`, turn each object into collision circles using the sizes in `js/data/objects.js` (moved there from `editor/core/catalogue.js` in E1b, which re-exports it; the forest already leaves a clearing round each object). The circles go into the obstacle list that game milestone 1's `js/collision.js` checks, with each type's `h`.
- Models for each catalogue type in a new `js/render/objects.js`, built in code with `mergeParts` like the other props: hut, lodge, lift station, pylon (with cables drawn between consecutive pylons), rock, signpost, banner, fence run. Remove the editor-only placeholder meshes from `preview3d.js` once the real ones exist.
- `js/main.js` builds the world once for level 1 today. Rebuild terrain and view when the chosen level changes (the note in `CLAUDE.md`, "Adding a level", already says this is needed); use the `dispose()` added in E6.
- Replace `js/data/levels/level1.js` with the converted E7 map only when the owner says so. Then set `goldTimes` and the Race medal times by riding it, as game milestone 5 describes.

**Check:** convert a generated map, register it as level 2, play it from the level select: pistes, jumps, gates, scenery and the catalogue objects are all where the editor shows them; riding into a hut or a pylon is a crash; level 1 still plays as before; console clean.

---

## Not planned (ask the owner before building any of these)

- Re-rolling one section of a generated course. The generator's stages each draw from a named random stream (`stream('features:main')` and so on in `core/generate.js`) so this stays possible, but the owner said not now.
- A ghost rider riding the whole course. The owner chose per-jump prediction instead.
- Rails and boxes in the editor: they arrive with game milestone 6, and adding the `rail` feature type is a map format change (version bump, migration, owner's approval).
- Phone or touch support for the editor.
