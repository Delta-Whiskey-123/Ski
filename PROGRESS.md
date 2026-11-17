# Progress

## Done

- **Renderer chosen: real 3D** (Three.js r160, vendored). Two spikes were built and compared; the owner picked 3D. The 2D spike was deleted.
- **Milestone 0, core feel.** A short test slope (900 m, restarts at the bottom) with:
  - carving with a steer-to-angle model, speed with drag, boost and brake (never below a minimum speed), deep snow off the piste and a firm push back at its far edge;
  - one take-off rule for all jumps; hold-and-release jump pop; kickers, rollers and ledges as level data;
  - spins from key taps, key hold or finger circles (counted in 180s, capped at 2160); front and back flips from up/down or swipes; landing never punished;
  - trick naming and call-outs; rider stats and equipment feeding the physics as multipliers;
  - 3D view: chunked snow surface, generated forest (instanced), slalom gates, kicker models, long shadows, carved track, spray, landing marker, camera that looks ahead and pulls back in the air;
  - course paint on man-made jumps (blue spray that thickens over the 16 m before the ramp and up it, red take-off line on the lip), so they read differently from natural jumps;
  - red safety fencing down both sides of the mountain, with a few small trees just inside it as hazards and the full forest beyond;
  - tuning panel (`` ` `` key or triple-tap the top-left corner) with every gameplay number, saved on the device.
- **Menus and modes (built ahead of order at the owner's request).** Title > Mode > Level > Rider screens, pause (Esc, P, the on-screen button, or leaving the tab) and results. Two modes on the same mountain:
  - **Race:** fastest time; every missed gate adds 1 s; gates on every piste so any route is legal; gold/silver/bronze targets; best time saved. Tricks charge the meter for adrenaline speed.
  - **Tricks Run:** selectable and rideable, shows tricks landed and best trick; points arrive with milestone 2.
- **Power meter and adrenaline** as specified (charged at 80 %, fired by the player at 100 %, 8 s). Measured on the big kicker: 1.67 s of air normally, 1.90 s charged, 2.37 s on adrenaline.
- Start line and finish line with arches; 3-2-1 countdown; coasting to a stop after the finish.
- Measured from the console on the test slope, riding straight with no input: airs of 0.3 s (roller), 0.75 s (4.5 m ledge), 0.7 s (roller), 1.7 s (big kicker), 1.5 s (12 m ledge). A charged jump pop adds to these.

- **Settings > Controls (owner request, 2026-11-15).** Two views: Mobile (gesture guide) and Web browser (key list, remappable in js/settings.js: one key per action, a duplicate swaps the two, number pad and function keys refused, Reset to defaults). Defaults: arrows, Space, Left Shift for adrenaline, Esc pause, R restart. WASD is no longer bound by default.
- **Adrenaline button** is a small circle joined under the meter; red and pulsing when full. Adrenaline lasts 7 s (was 8). Remapping and Left Shift were verified from the console; the circle was NOT verified with a real touch, and the red pulsing was not seen in a screenshot.

- **Breakable scenery (owner request, 2026-11-16, look approved from `spikes/scenery.html`).** Trail direction post, trail map board, caution sign (cliff symbol, no words), small and big snowman, built in code. Hitting one breaks it and cuts her speed once: signs 15 %, small snowman 20 %, big snowman 25 % (`scenery` group in `tuning.js`). Signs vanish; snowmen leave snow chunks and their scarf. Jumping higher than a piece clears it. Everything comes back at the next run. 14 pieces placed on the test slope (`scenery` in `level1.js`). Checked from the console: the 20 % and 15 % cuts, a hit 1 m up in the air, a clean pass 3 m over the big snowman, and the models and debris in the game view at 812x375. Not played by hand on a phone.

## Map editor (separate track, branch `map-editor`)

A desktop tool for designing courses, in `editor/`. Not part of the shipped game. Its work list is `editor/MILESTONES.md`; its design reference is `editor/DESIGN.md`. Nothing here is merged to `main` yet.

**Done (E0, foundation, 2026-11-16):**

- **Map file format**, version 1: a game level plus `format`, `version`, `meta`, a final `gates` list and an `objects` list for placeholders. Validation with plain-language errors that name the bad value; a migration hook for future versions; a newer file is refused with a clear message.
- **Map to level and back** as pure functions. Level 1 converts to a map and back to an identical level; fields the editor does not know survive at every depth.
- **Placeholder catalogue** (hut, lodge, lift station, pylon, rock, signpost, banner, fence run) with footprint, collision radius and height. They are kept in `objects`, which the game does not read, so they cannot reach today's game.
- **Jump prediction** with the game's real `step()` on a real `createTerrain()`, at three speeds: slow (carving at full lock, 16.1 m/s at grade 1), normal (straight, no input, 24.0 m/s), adrenaline (boost held with adrenaline running, 41.8 m/s). Always with default tuning.
- **Placement rules** in one table (14 rules): course ends, branch joins, 25 m of forest between branches, 60 m between jumps, 50 m clear and straight landing, scenery and objects off landings, no gate 30 m before or 40 m after a jump, gates and features on a piste, buildings clear of pistes, and the predicted landing (each speed) clear and on a piste.
- **Generator**: a whole course from seed, length, difficulty, branches and jump density; wild at the top (rollers, ledges, rocks, caution signs), resort at the bottom (kickers, pylons, huts, lodge, banners, snowmen). It checks itself with the real rules and repairs or retries.
- **Command line** `tools/map.mjs`: generate, validate, jumps, convert, import, rules, with exit codes 0 / 1 / 2.
- **Editor page** `editor/index.html`: plan to scale with pan and zoom; pistes, features, gates, scenery, objects, forest and fences; select and drag piste points, features, gates, scenery, objects and the start; properties panel; predicted flights on the plan and as a side view; live warning list that jumps to the problem; generate dialog; import (file picker and drag and drop); export map and level module; undo and redo; autosave; Delete key.
- **38 automated tests** (`node --test "editor/test/*.test.mjs"`).

**Done (E1, place anything from a palette, 2026-11-17):**

- A **palette** strip under the toolbar (`editor/app/palette.js`) with one button per placeable thing, in four groups: Features (roller, kicker, ledge), Scenery (every type in `js/data/scenery.js`), Objects (every type in `editor/core/catalogue.js`) and Trees (pine, round tree). The scenery and object buttons are built from those tables, so a new type appears with no editor change.
- Picking a button arms a **place tool** (kept in `interact.js`). A faint copy of the thing follows the pointer with a dashed ring; a click adds it and selects it; Shift+click keeps the tool armed for another; Escape, or clicking the lit button again, stops. The status bar says what is armed.
- New edits in `editor/app/actions.js`: `newItem()` (a new item with its defaults from the `NEW_ITEM` table; a new feature dropped within 3 m of a piste centre goes onto the centre) and `addItem()` (adds it and returns the selection; features are inserted in `z` order). The ghost and the real placement use the same `newItem()`, so what you see is what you get.
- The plan's per-thing drawing was split into small helpers inside `plan.js` so the ghost is drawn by exactly the same code as the real thing. Nothing else in the drawing changed.
- The properties panel shows a turned object's angle in degrees beside the radians.
- 5 new tests (43 in all).

**Verified for E1, and how:**

- `node --test "editor/test/*.test.mjs"`: 43 pass.
- In headless Chrome (1500x900) with real mouse clicks and key presses (Playwright), starting from level 1: every one of the 18 palette buttons armed, showed its ghost, placed the thing where clicked, selected it and showed its fields; each was then dragged 6 m, undone twice (back to before the drag, then back to before it was placed) and redone. Shift+click placed two snowmen with the tool still armed; Escape and re-clicking the lit button both disarmed. A kicker placed 20 m above a gate brought up `gate-near-jump` at once; a hut dropped on the main piste brought up `object-clear-of-piste`. Turning the hut to 1.5708 radians showed 90.0°. Screenshots looked at (ghost, hut panel, whole course). Placed objects did not appear in `mapToLevel(map).props`.
- Export then re-import gave the identical map, on level 1 with all 18 types added and on a freshly generated map (seed 4242) with a ledge, fence run and banner added. Editor console clean throughout.
- Command line: a freshly generated map (seed 4242, 2600 m, 3 branches) validates PASS. Level 1 validates with 0 errors and the same 6 known warnings as before (see "Known limits of the editor"); E1 did not change it.
- The game page (http://localhost:8130/) loads with no errors. Headless Chrome prints four "GL Driver Message ... GPU stall due to ReadPixels" performance notices there; they come from the browser's software graphics, and no game file was changed in E1.

**Not verified for E1:** the clicks were real mouse events in headless Chrome, not a person at a desktop; how the ghost feels to use by hand is for the owner to judge.

**Done (E1b, ground rules for every map, 2026-11-17):**

The owner's ground rules now hold on every map, hand-made or generated (written up in `editor/DESIGN.md` section 8). All are warnings (orange), and every generated course passes them.

- **Gates keep away from jumps** (`gate-near-jump`, changed): none within 30 m before a jump or on it, and after it none until 10 m past where she lands at normal speed. The owner chose normal speed: measured at every speed it would have removed about 1 in 3 gates and left up to 171 m without a gate after the biggest jumps.
- **Nothing touches the red fence** (`clear-of-fence`, new): trees, scenery, objects and features keep their whole footprint 1 m from the fence, on either side.
- **Nothing overlaps** (`no-overlap`, new): features, gates, scenery, objects and hand-placed trees keep 1 m apart edge to edge, and 1 m from the generated forest.
- **The fence holds her in**: game physics, so it is written into game milestone 1 (`MILESTONES.md`: a wall, not a crash, not jumpable; `fence.inset` and `fence.scrape`), not built here.
- **The game's forest** keeps every tree 1 m clear of the fence and of every placed object (owner's choice; see the game file changes below). Buildings beyond the fence get a clearing, so the generator no longer loses its lodge and lift station to the overlap rule.
- **The generator** places scenery and objects in a clear spot from the start (fixed shifts up and down the slope, no random numbers, so seeds still repeat), then repairs the rest.
- **Footprints** come from each thing's own data (`footprint()`, `footprintGap()`, `fenceGap()` in `editor/core/geometry.js`). The forest and the rules measure trees against objects with the same function, `pointGap()`, so they always agree.
- `editor/maps/generated-11.map.json` regenerated from its own seed and settings (owner's choice; 3 gates changed). Level 1 (`js/data/levels/level1.js`) and `editor/maps/test-slope.map.json` were not touched, as the owner asked.
- 4 new tests and 4 more generator cases (47 tests in all).

**What the gate rule does (measured, normal speed):** level 1: no gate flagged (its gate-free stretches after its jumps are 26 to 52 m). Generated courses (seeds 7, 4242, 11): 0, 0 and 1 gate flagged before repair, 0 after; gate-free stretches 21 to 50 m after each jump. The game's own gate maker already keeps gates off jumps, so the rule rarely bites. Most gates the generator drops (8 to 11 per course) are from the older `landing-predicted` rule (a gate where she lands at some speed); the new overlap rule adds 2 or 3 (a gate on a sign or snowman).

**Verified for E1b, and how:**

- `node --test "editor/test/*.test.mjs"`: 47 pass. Each new rule fires on a small map that breaks it (rock inside and across the fence, a hut beyond it, a snowman, a hand-placed tree, a fence run; two snowmen, a snowman on a roller, a sign on a gate, a rock by a tree, a tree in the forest) and stays quiet on one that does not. Generated courses at 600 to 4000 m, difficulty 1 to 5 and 0 to 6 branches pass; the same seed gives the same file; level 1's gates are byte-identical to the baseline.
- Command line: a freshly generated map (seed 5150, 3200 m, difficulty 4, 5 branches) and the regenerated example both PASS. Level 1: 0 errors, 7 warnings. That is the 6 it had before plus **one new one, from `no-overlap`: the gate at 501 m overlaps the roller at 490** (a real clipping problem on level 1, left as it is because the owner does not want level 1 edited now).
- In headless Chrome (1500x900): a demo map with one break of each rule showed each warning in the list and as a mark on the plan (screenshot looked at); Generate (seed 31) gave "Passes every rule" with no warnings, screenshot looked at; zoomed in on its lodge, the forest leaves it a clearing. Export then re-import gave the identical map. Editor console clean. The game page loads and runs 3 s of `summit.tick` with no errors.

**Not verified for E1b:** the fence as a wall cannot be tried yet (game milestone 1 builds it). Nobody has looked at the changed forest in the game's 3D view; on level 1 the only difference is one tree removed beside the fence.

**Changes made to game files (none alters how the game plays):**

- `js/terrain.js`: `pathAt()` moved out of `createTerrain()` and exported (same code). The gate generator moved into exported `generateGates(level)` with a helper `jumpZone(feature)`; `createTerrain()` calls it. If a level has its own `gates` list, `createTerrain()` uses it instead of generating; level 1 has none, so it generates as before.
- Up to E1 nothing else in `js/`, `css/`, `index.html` or `vendor/` was touched.

**Changes made to game files in E1b (owner-approved, 2026-11-17; these change the generated forest only):**

- `js/terrain.js`: new `terrain.fenceAt(z)` (where the red fence is; the fence lines are now drawn from it, same points). The forest leaves out any tree whose edge would be within `forest.fenceClear` (1 m) of the fence or within `forest.objectClear` (1 m) of a placed object in `level.objects`. On level 1 this removes one tree that stood 0.75 m from the fence; nothing else on level 1 changes (it has no objects), and its gates are unchanged.
- `js/tuning.js`: new group `forest` with `fenceClear` and `objectClear`.
- `js/data/objects.js`: the placed object table, moved from `editor/core/catalogue.js` (which now re-exports it), with `objectFootprint()` and `pointGap()` added. This is the move E8 had planned, done early because the forest needs the sizes.
- `MILESTONES.md`, game milestone 1: the red side fence bullet and its Check rewritten as the owner asked (a wall, not a crash; `fence.inset`, `fence.scrape`). Nothing else in it changed.

**Verified, and how:**

- Level 1 gates are byte-identical to before the change: saved before editing `terrain.js` (`editor/test/level1-gates.baseline.json`), compared by a test, and compared again in the running game page (`summit.terrain.gates`).
- The game page loads with a clean console after the change (http://localhost:8130/, checked from the console; no run was ridden by hand).
- Predicted air times against the measured ones above (normal speed): 4.5 m ledge 0.75 s (measured 0.75), second roller 0.67 s (0.7), big kicker 1.68 s (1.7), 12 m ledge 1.47 s (1.5). The first roller predicts 0.55 s against a measured 0.3 s: in the measured run she reaches it 64 m after a standing start, well below steady speed, so this is expected, not an error.
- The command line was run on level 1 (6 warnings, exit 1) and on generated maps (PASS, exit 0). 36 generated courses across lengths 600 to 4000 m, difficulty 1 to 5, 0 to 6 branches and every jump density all passed every rule at the first attempt, and the same seed gave the same file each time.
- In Chrome, at 1400x850, clean console throughout: the plan drew level 1 and a generated course correctly, and a selected kicker showed its three flights, landing zones, flight table and side view (screenshots looked at); a feature, a piste point and a gate were dragged; undo and redo by button and by Ctrl+Z / Ctrl+Y; a panel edit; a refused edit (negative width, with its message); Delete; wheel zoom; pan; click a warning to jump to it; generate; export then re-import gave the identical map; a file from a "newer version" was refused with the reason and changed nothing; the working map came back after a reload (autosave).

**Not verified:**

- The real Windows file picker, a real file dragged in from the desktop, and a download really landing on disk. Import was tested by handing the page a file object, and export by capturing the text it was about to download. The code paths are the real ones; the operating-system parts are not exercised.
- Only the first drag (a ledge) and the first screenshots used real mouse input. The preview pane then went into the background, so the later drags (piste point, gate), wheel zoom, pan and Delete were tested by sending the page the same mouse and key events from the console.
- Chrome only; no other browser was tried (the editor is specified for desktop Chrome).
- No generated course has been converted and ridden in the game: the game cannot yet load a second level (`editor/MILESTONES.md`, E8).

**Known limits of the editor:**

- Level 1 (the test slope) has 6 warnings under the rules: two rollers land just before a gate at normal speed, three adrenaline landings come down on scenery or on the next jump, and the tree route has only 14 m of forest beside the main piste for a stretch. They are true of the test slope; it was never designed to these rules.
- "Adrenaline" is the worst case (boost held, 41.8 m/s): the big kicker flies 145 m at it, against 42 m at normal speed. Warnings at that speed are real but harsh. If they prove too noisy, the cure is a severity setting per speed in the `RULES` table, which is the owner's call.
- Because of those long flights, the generator removes many jumps when asked for high jump density or difficulty (for example 14 kept of 32 at difficulty 5, density 1). It says how many in its report.
- Generated branches each get their own stretch of mountain: never two side by side, no cross-links, no branch off a branch. Hand editing of pistes arrives with E3.
- Prediction rides the centre line of a feature, straight, at a held speed. It does not try angled approaches or jump pops, and it does not check for tall objects under the flight path, only where she lands.
- Generated gates keep the game generator's exact positions, so their `x` values have many decimals in the file.
- Pistes can be reshaped but not added or deleted (E3). Gates cannot be added from the palette yet (E2).
- The plan draws tree markers 1.6 times their real size so they are easy to see, so trees look closer to buildings and the fence than they really are. The rules measure the real sizes.
- A feature dragged past another is not re-sorted (only a newly placed one goes in at its place); the game's terrain looks features up by position, so the order does not change how a course plays.
- This track's first session was run from another project's folder (the app would not attach the ski folder), using full paths. Nothing in the game or the editor depends on that.

## Next

Game: milestone 1 in `MILESTONES.md` (crashes and obstacles).

Map editor: E2 in `editor/MILESTONES.md` (gates: add, flip, regenerate). E1b (ground rules) is done.

## Waiting on the owner

- **Phone test** (cannot be checked on desktop):
  1. Does it run smoothly? Open the tuning panel (triple-tap top-left) and read the fps while riding. If it is poor, try adding `?q=medium` or `?q=low` to the address.
  2. Drag to steer: is the 70-pixel range comfortable?
  3. In the air, does circling a finger spin her, and in the direction you expect? Does a quick straight swipe up/down flip?
  4. Do the JUMP, BOOST and BRAKE buttons respond while the other thumb steers?
  5. Does portrait show the rotate screen?

## Known problems and limits

- Touch gestures (circle to spin, swipe to flip) are written but have only been exercised with keyboard events; expect to tune `touch.*`.
- Frame rate has not been measured on any phone. The preview pane used for development does not run animation continuously, so there is no desktop figure either.
- How far ahead you can see is limited by the top-to-bottom direction on a wide screen: about 30 m, roughly 1.3 s at top speed (the owner asked for the rider to sit lower on screen, about 18 % from the top, which costs a little look-ahead). `camera.height`, `camera.lead` and `camera.fov` trade rider size against look-ahead.
- Ledge sides and cliff faces are only coloured as rock when steep in the downhill direction.
- "For 2 seconds" in the scenery request: the owner chose a one-off speed cut and that a second hit restarts the timer, so the 2 seconds has no separate effect; every hit simply cuts speed by its own amount.
- No crashes, scoring, settings screen or sound yet; trees and fences can be ridden through.
- Race medal times (36 / 41 / 48 s) are placeholders for the short test slope. A straight no-steering run takes 37.9 s and misses 9 of 11 gates.
- Gates are 4.8 m wide (`race.gateHalfWidth` 2.4). Whether that is the right difficulty at speed needs the owner's play-testing.
- The menus have been checked at 812x375 and desktop size, driven from the console; not on a real phone.
- The project folder is under `.claude`, which the Claude desktop app will not attach to a session that was started elsewhere. Start sessions directly in the folder.

## Decisions and why

- **Heights are relative to a flat base slope; steepness is a `grade` number.** Keeps physics simple and tunable, and jumps predictable. Cliffs are plateaus that drop away (`ledge`).
- **One take-off rule** instead of per-jump launch code, so every shape of terrain gives air naturally and `jump.launchScale` tunes them all together.
- **Natural features are in the snow mesh; man-made ones are separate models,** so kicker lips stay sharp without a very fine terrain grid.
- **Fixed 120 Hz simulation** so jumps are identical at any frame rate.
- **Camera downhill of the rider, looking back uphill,** which is what makes her travel top to bottom.
- **Air camera (owner request):** in the air the camera aim rises with the rider (`camera.airTrack`), she drifts toward the middle of the screen (`camera.airCentre`) and the camera pulls back (`camera.airLift`), so she is always visible, not just her shadow. At 13 m up she sits about 35 % from the top.
- **Level is fixed and hand-designed; the forest is generated from a seed** so it is the same every run.
- **Boost is always available** (modest push); adrenaline doubles it. No separate boost fuel.
- **Run rules fixed by the owner:** par times only (no countdown), a crash loses the unbanked pot and 25 points of meter, adrenaline is fired by the player, level 1 is wild at the top and resort at the bottom, about 2 minutes, speed unit switchable (default mph), equipment as data so skis can come later.
- **Scoring model approved by the owner** (2026-11-15) as written in milestone 2. Numbers stay tunable; the shape should not change without asking.
- **Rider look chosen by the owner (2026-11-15): A, high ponytail with goggles pushed up** (see `spikes/riders.html`). Milestone 9 builds this; the stand-in already has a ponytail.
- **Modes (owner, 2026-11-15):** menu order Title > Mode > Level > Rider; Race has no points, tricks only charge the meter; gates on every branch; Tricks Run keeps the approved speed bonus and gate multiplier; Race results show best time plus medal targets.
- **Breakable scenery (owner, 2026-11-16):** symbols only on signs (no words); caution sign without the flag poles; signs real-life size; snowmen enlarged after a preview (small 2×, about 2.7 m, clearable with a 2.8 m jump; big 4×, about 9 m, so in practice ridden round), hit sizes scaled to match (`scale` in `js/data/scenery.js`); trail post arrows point a random way per post; snowmen break into chunks, signs just vanish; a hit is a one-off speed cut; jumping high enough clears a piece; placement hand-made as level data. Breakables are separate from milestone 1's crash obstacles.
- **Original rider:** Freya Lindqvist, blonde, blue top, red trousers. Not based on any existing game's character.
