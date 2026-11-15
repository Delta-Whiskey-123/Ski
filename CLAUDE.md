# Summit Protocol — browser snowboard game

Project folder and repo are called "Ski"; the game is "Summit Protocol". A single-player arcade snowboard run seen from a high camera, rider travelling from the top of the screen to the bottom. Read `PROGRESS.md` first (what is done, what is next, known problems), then `MILESTONES.md` (the ordered work list). Do the next unfinished milestone only.

The owner is not a professional developer. Explain choices in plain language. When something is genuinely theirs to decide, ask a multiple-choice question; do not assume.

## Hard constraints

- Static files only: plain HTML, CSS and JavaScript (ES modules). No build step, no npm dependencies, no CDN links, no network requests at runtime, no accounts, no analytics. Must run from any static host and stay wrappable for app stores later (Capacitor), so nothing server-side.
- One vendored library: `vendor/three.module.min.js` (Three.js r160, MIT). Do not add others or upgrade it without asking.
- No asset files: no images, models, audio or web fonts. Graphics are built in code (Three.js primitives, canvas-generated textures, CSS). Sound is synthesized with the Web Audio API and unlocked on the first tap. System fonts only.
- Targets: iPhone Safari, Android Chrome, desktop Chrome, from the same code. Phones are landscape only (portrait shows the rotate screen). Respect safe-area insets.
- Target 60 fps on a mid-range phone. Quality presets (`QUALITY` in `js/render/view.js`) scale pixel ratio, shadows and terrain detail.
- **Every gameplay number lives in `js/tuning.js`.** Never hard-code a feel value (speeds, timings, point values, meter rates, distances that affect play). Add it to `DEFAULTS` with a one-line comment; it then appears in the debug panel automatically. Purely visual constants (model sizes, colours) may stay in the render files.
- **Course, riders, equipment, tricks and levels are data** under `js/data/`. Adding one must not need engine changes.
- Gameplay input acts on `pointerdown`/`keydown`, never `click`, and every pointer is tracked independently. Menu buttons (`js/ui.js`) may use `click` so keyboard and assistive activation work.
- CSS animates only `transform` and `opacity`. Honour `prefers-reduced-motion`.
- Original work only. The game is inspired by arcade snowboard games and top-down ski games in general. Do not copy any existing game's characters, names, courses, UI, art, music or branding. The rider is an original character.
- Gameplay rules the owner has fixed: braking never stops the rider; landing badly costs nothing; only hitting an obstacle is a crash; a crash never ends the run; no other people on the slope.

## Run and check

```bash
node tools/serve.mjs
```

Then open http://localhost:8130. ES modules need http, so `file://` will not work. `.claude/launch.json` defines the same server for the Claude preview pane (name `ski`).

There is no test suite. Check by hand:

1. Console shows no errors on load.
2. Keyboard: left/right carve; space (hold, release) jumps; in the air, tapping left/right spins and up/down flips; a landed trick shows a call-out.
3. A phone-sized landscape viewport (812x375) and a desktop window both look right; a phone-sized portrait viewport on a touch device shows the rotate screen.
4. `` ` `` opens the tuning panel (or tap the top-left corner three times). It shows fps.
5. **Drive the real game loop from the console:** `summit.tick(dt, input)` runs one frame of the whole game (phases, gates, meter, HUD), e.g. `for (let t = 0; t < 5; t += 1/30) summit.tick(1/30, { ...summit.idle(), steer: 0.5 })`. Use this to test run flow; the preview pane throttles animation frames, so waiting in real time does not work. `summit.phase`, `summit.run`, `summit.meter` (`.set(0.85)`), `summit.ui.show(name)` and `summit.save` are also exposed.
6. `window.summit` also exposes `state`, `T`, `terrain`, `view`, `step`, `STEP`, `startRun` for poking from the console. The simulation can be driven without drawing: call `summit.step(summit.state, summit.STEP, inputObject, summit.terrain, stats)` in a loop and read the returned events. Use this to measure air times and to test logic; the preview pane does not always run animation frames continuously.

Touch gestures, multi-touch and real phone frame rate cannot be verified on desktop. `PROGRESS.md` lists what the owner must try on a real phone.

## File layout

| File | Role |
| --- | --- |
| `index.html` | All screens and overlays as static markup. |
| `css/style.css` | All styling. |
| `js/main.js` | Entry point and game loop. The only place simulation, input and drawing meet. |
| `js/tuning.js` | Every gameplay number, plus saving of on-device overrides. |
| `js/debug.js` | Hidden tuning panel. |
| `js/input.js` | Keyboard and touch. Reports intent; never touches the rider. |
| `js/terrain.js` | Turns level data into ground, pistes, forest and gates. Answers height and piste questions. No drawing. |
| `js/rider-physics.js` | The rider simulation. Pure logic, returns events. |
| `js/tricks.js` | Works out what was landed from what happened in the air, and its base point value. |
| `js/gates.js` | Watches the rider pass or miss slalom gates. Pure logic. |
| `js/meter.js` | The power meter and adrenaline. Pure logic; supplies `mods()` to the physics. |
| `js/run.js` | One run: clock, gate counts, Race penalties, result and medal. Pure logic. |
| `js/save.js` | Best results and last menu choices in `localStorage` (versioned). |
| `js/ui.js` | Menu screens: title, mode, level, rider, pause, results. Shows screens and reports choices only. |
| `js/data/modes.js` | The two modes (Race, Tricks Run) as menu data. |
| `js/data/levels/index.js` | The six level slots for level select. |
| `js/data/levels/level1.js` | Level 1 as data. |
| `js/data/riders.js` | Riders, equipment, and stat-to-multiplier mapping. |
| `js/data/tricks.js` | Trick names (and, later, values). |
| `js/render/view.js` | Renderer, light, camera, quality presets. |
| `js/render/terrain-mesh.js` | Snow surface in chunks around the rider. |
| `js/render/props.js` | Trees and gates (instanced), man-made jump models. |
| `js/render/rider-model.js` | The rider model, built from boxes. |
| `js/render/effects.js` | Carved track, powder spray, landing marker. Visual only. |
| `js/render/geo.js` | Geometry helpers (`mergeParts`, `place`). |
| `spikes/riders.html` | Rider look sketches (reference until the look is final). |
| `tools/serve.mjs` | Dev-only static server. Not part of the game. |

Keep the separation: `input.js` reports, `rider-physics.js` decides, `render/*` draws. Render code never changes simulation state. Simulation code never touches the DOM or Three.js. New systems (scoring, meter, audio) follow the same pattern: a pure module driven by events from `main.js`.

## Conventions that must not be mixed up

- **Units:** metres, seconds, radians.
- **Axes:** `x` across the slope (screen right is +), `y` up, `z` downhill distance. The camera sits downhill of the rider looking back uphill, so +z is toward the bottom of the screen.
- **Heading:** angle away from straight downhill. 0 = fall line, + = toward +x. Limited to ±`ride.maxHeading`, so she can never ride uphill.
- **Heights are relative to the base slope**, which is treated as flat. The mountain does not really descend in the 3D scene; the downhill pull comes from the level's `grades`. A cliff is therefore modelled as a `ledge`: a plateau that rises gently over a long approach and then drops away. Do not "fix" this by tilting the world.
- **Take-off has one rule** (in `stepGround`): if the ground falls away faster than gravity could pull her down, she is airborne, keeping the upward speed the ground was giving her (scaled by `jump.launchScale`). Kickers, rollers, ledges and jump pops all use it. Do not add per-feature launch code.
- **Natural vs man-made:** rollers and ledges are part of the snow surface (`naturalHeightAt`, drawn by the terrain mesh). Kickers (and later rails/boxes) are separate models with exact shapes; `heightAt` adds them on top. The rider always uses `heightAt`.
- **Fixed time step:** the simulation runs at 120 Hz (`STEP`) regardless of frame rate. Input is read once per frame; one-shot presses apply to the first step of the frame only.
- **Same keys, two meanings:** left/right/up/down mean steer/boost/brake on snow and spin/flip in the air. `input.js` reports both readings; `rider-physics.js` picks by state.
- **Two modes, one mountain.** Race: fastest total time, where total = riding time + `race.gatePenalty` (1 s) per missed gate; medals from `level.race`. Tricks Run: score (scoring is milestone 2). Tricks charge the meter in both modes. Mode differences belong in `js/run.js`, `js/scoring.js` and the HUD, never in the physics or the level.
- **Gates belong to a piste.** Every path gets its own gates; a gate only counts (passed or missed) for a rider whose nearest piste at that z is the gate's path, so any route is legal. Passing = crossing its z within `race.gateHalfWidth` of its x, in the air or not.
- **Run phases** (`main.js`): menu > countdown > riding > finished (coasting past the line) > menu with results; paused can interrupt countdown or riding. Time only advances while riding.
- **Meter and stats reach physics as multipliers:** `step(..., stats, mods)`. `stats` comes from `deriveStats()`; `mods` (`jump`, `spin`, `boost`, `air`) comes from the power meter. Do not special-case adrenaline inside the physics.

## Adding things

- **A level:** copy `js/data/levels/level1.js`. `paths` are pistes (centre line + half-width, top to bottom; a branch must start and end on top of another path). `features` are `roller`, `ledge` (natural) and `kicker` (man-made). `grades` set steepness per stretch. The forest, the slalom gates and the red side fences are generated from the paths. Optional level fields: `fenceOffset` (metres from the outermost piste edge to the fence, default 10) and `fenceTreeDensity` (how many small hazard trees grow between piste and fence, default 0.14). Every kicker gets course paint (blue spray thickening toward the jump, red line on the lip) unless it has `paint: false`; natural jumps are never painted. Register it in `js/data/levels/index.js` and give it `race: { gold, silver, bronze }` medal times. (The world is currently built once at start-up for level 1; `main.js` must rebuild terrain and view when a second level exists.)
- **A rider:** add an object to `RIDERS` in `js/data/riders.js` (stats 1 to 10, colours, look).
- **Equipment (e.g. skis later):** add to `EQUIPMENT` with a `kind`; the model and stance for a new kind go in `js/render/rider-model.js`.
- **A trick name:** `js/data/tricks.js`.
- **A tuning value:** add to `DEFAULTS` in `js/tuning.js` with a comment.

## Working rules

- One milestone per session. Do not change the architecture, file layout or conventions above; if a milestone seems wrong or blocked, stop and tell the owner instead of redesigning.
- At the end of each milestone: check by hand as the milestone describes, update `PROGRESS.md`, tick the milestone in `MILESTONES.md`, commit, and push to `origin main` (the owner has approved pushing each step).
- Report honestly: if something could not be verified (touch, phone frame rate), say so in `PROGRESS.md`.
