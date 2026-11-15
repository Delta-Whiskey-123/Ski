# Milestones

Ordered work list. Do the first unticked one, exactly as written, then tick it. Each is sized for one session. The design decisions are made here on purpose: do not re-decide them. If one looks wrong or is blocked, stop and tell the owner.

Every new number goes in `js/tuning.js` (new groups are fine). Every milestone ends with: console clean, hand checks below pass, `PROGRESS.md` updated, commit, push.

Driving the simulation from the console (see `CLAUDE.md`, "Run and check") is the reliable way to test logic.

- [x] **0b. Menus, modes, Race, meter** — done by the architect at the owner's request, ahead of order: title > mode > level > rider screens, pause, results; Race mode complete (gates on every piste, +1 s per miss, medals, best time); power meter and adrenaline; start and finish lines; saved bests. Milestones 2, 3, 4 and 7 below are reduced accordingly: read the "Already built" note at the top of each.
- [x] **0. Core feel** — riding, carving, speed, jumps, spins, flips, landing, camera, shadow, tuning panel. Done by the architect.

---

## - [ ] 1. Crashes and obstacles

**Goal:** hitting an obstacle is a crash; nothing else is.

- New file `js/collision.js` (pure logic). Each prop already has `x`, `z` and a radius `r` (`terrain.props`, fetched with `terrain.propsBetween`). A crash happens when the rider is within `r + crash.riderRadius` of a prop **and** her height above the ground is below `crash.clearHeight` (default 2.5 m, so she can fly over small things but not trees: give trees `h` of 6+ and compare against the prop's own `h` where it has one).
- Check from `main.js` after each physics step; on a hit, push a `crash` event.
- Crash sequence, driven by a `crashT` timer on the rider state inside `rider-physics.js`: input ignored for `crash.tumbleTime` (0.9 s) while she slides on at `crash.slideSpeed` (5 m/s) straight downhill; then she is placed at the nearest piste centre (`terrain.nearestCentre`) at the same `z`, at `ride.minSpeed`, with `crash.graceTime` (1.5 s) of no collisions. No game over, ever.
- Model: during the tumble, spin the `flip` and `spin` nodes quickly (visual only, in `rider-model.js`); blink the model during grace time.
- Add hand-placed obstacle types to the level `props` list, each with a model in `js/render/props.js` (instanced, built with `mergeParts`): `sign` (post + coloured board, r 0.4, h 2), `rock` (grey icosahedron half-sunk, r by size, h 1), `fence` (a run of posts and two rails between two points; collide as a line of circles every 1.5 m, h 1.2). Place a few of each on the current test slope so they can be tried.
- The red side fences already exist (`terrain.fences`, drawn in `render/props.js`). Make them crash obstacles: collide as a line of circles (r 0.4, every 1.5 m, h 1.7) along each fence. Keep the soft edge push in front of them. The small trees just inside the fence (`small: true` in `terrain.props`) are ordinary crash obstacles with h 3.

**Check:** ride into a tree, a sign and a rock: tumble, respawn on the piste, ride on. Jump clean over a rock and a fence. Fly into a tree mid-air: crash. Landing sideways or mid-spin: no crash.

## - [ ] 2. Scoring, gates and checkpoints

**Already built:** gate pass/miss events (`js/gates.js`, handled in `main.js`), Race mode, `trickValue()` in `js/tricks.js` with the spin, flip and combo numbers in `tuning.js` (`score` group), the run clock and the results screen. **Scoring applies to Tricks Run only**; Race stays time-only. Record the banked score as the Tricks Run best with `save.record(level.id, 'tricks', score)` and show it on the results screen in place of the "scoring update" note. Checkpoint banners and sector gold times are used by Tricks Run only.

**Goal:** the full scoring model. New pure module `js/scoring.js`, fed by events from `main.js` (`land`, `crash`, `gate`, `checkpoint`, `nearMiss`, plus a per-step `tick(dt, state)`). Point values live in `js/data/tricks.js` and `js/tuning.js` (`score` group).

Scoring model (approved shape; all numbers tunable):

| Source | Points |
| --- | --- |
| Spin | `100 × halves × (1 + 0.1 × (halves − 1))`. So 180 = 100, 360 = 220, 720 = 520, 1080 = 900, 2160 = 2520. |
| Flip | 300 for one, then ×1.25 per extra: `300 × flips × 1.25^(flips − 1)`. |
| Spin + flip in the same air | sum of both × 1.5 |
| Air | 50 per second in the air beyond 0.5 s, plus 10 per metre of peak height. Awarded for every air, trick or not. |
| Clean landing | +20 % of that air's points if the board lands within 20° of a straight (or exactly reversed) line. Never a penalty. Call-out "CLEAN". |
| Repeat | The same trick name again before the next checkpoint is worth 70 %, then 40 %, then 20 % (floor). Resets at each checkpoint. |
| Near miss | 50 for passing within 1.5 m of a tree's edge at over 15 m/s without crashing. Call-out "CLOSE CALL". Once per tree. |
| Speed | At each checkpoint: 1000 if the sector time beats its gold time, sliding down to 0 at 1.5 × gold. Goes straight to the bank. |

- **Multiplier:** starts at ×1. Each landed trick (spin or flip, not plain air) adds 1, up to ×5. It drops by 1 for every `score.chainHold` (6 s) spent without landing a trick. A crash resets it to ×1. Each slalom gate passed adds 0.1 on top (up to +1.0); missing a gate resets only that gate bonus. The multiplier applies to trick, air and near-miss points as they enter the pot, not to speed points.
- **Pot and bank:** trick, air and near-miss points go into the unbanked pot. Reaching a checkpoint moves the whole pot to the bank. If no trick has been landed for `score.trickleDelay` (6 s), the pot trickles into the bank at 15 % of the pot per second (minimum 50 per second). Banked score is permanent. A crash empties the pot.
- **Gates:** a gate is passed when the rider crosses its `z` within `score.gateHalfWidth` (2.2 m) of its `x` (between the two poles, which are 3.4 m apart). Crossing its `z` outside that is a miss. Missing has no cost beyond the streak. Emit `gate` events from a small helper in `scoring.js` or `main.js` that watches `state.z`.
- **Checkpoints:** `level.checkpoints` is a count (use 10); they sit at equal `z` spacing between start and finish, the last one being the finish line. Draw each as a wide banner arch across the main piste (`render/props.js`). Gold times: `level.goldTimes` array, one per sector; set them by riding each sector well and adding 10 %.
- HUD for this milestone can be plain text (pot, bank, multiplier, sector time); milestone 4 makes it pretty.

**Check:** land a 360: pot rises by 220 × multiplier. Reach a checkpoint: pot moves to bank. Crash: pot is lost, bank is not. Wait 6 s with points in the pot: it drains into the bank. Repeat the same trick three times: values fall 70/40/20 %. Pass and miss gates: the gate bonus rises and resets.

## - [ ] 3. Power meter and adrenaline

**Already built:** `js/meter.js` with every rule below, the HUD bar with its 80 % mark, the adrenaline key and touch button, and the "CHARGED" / "ADRENALINE READY" call-outs. It currently fills from `trickValue()` directly. **Left to do here:** double trick points during adrenaline (needs milestone 2), call `meter.crash()` on a crash (needs milestone 1), the rider glow when charged, the speed-line overlay and wider camera during adrenaline, and the console checks below.

**Goal:** the meter. New pure module `js/meter.js` exposing `mods()` (the multipliers passed to `step`) and reacting to `land`, `crash` and the adrenaline button.

- Fills from landed trick points before the multiplier: `meter.fillPer100` (2.5 % per 100 points), so about 4000 points fills it.
- **Below 80 %:** all mods 1.
- **80 % to 99 % ("charged"):** `jump` 1.10, `air` 1.06, `spin` 1.15, `boost` 1.
- **100 %:** holds, with the charged mods, until the player fires it (Shift, E, or the on-screen adrenaline button). Then adrenaline lasts `meter.adrenalineTime` (7 s), draining the meter visibly to 0: `jump` 1.35, `air` 1.15, `spin` 1.6, `boost` 2.0, and all trick points are doubled while it runs. Landing tricks during adrenaline does not refill it; filling starts again when it ends.
- **Crash:** removes `meter.crashLoss` (25 percentage points) and ends adrenaline immediately.
- Add the adrenaline button to `#touch` in `index.html` (`data-btn="adrenaline"`, already handled by `input.js`); show it only when the meter is full.
- Visuals: meter bar in the HUD with the 80 % mark shown; when charged, a subtle glow on the rider; during adrenaline, a speed-line overlay (CSS, opacity only) and a slightly wider camera (`camera.fov` + `meter.adrenalineFov`).

**Check:** from the console, set the meter to 85 % and confirm a kicker gives about 10 % more air time than at 0 %. Fill to 100 %, fire, confirm much bigger air and faster spins for 8 s, then 0 %. Crash at 60 %: meter reads 35 %.

## - [ ] 4. Full HUD

**Already built:** top-right stat boxes (Race: MISSED, BEST, TIME; Tricks Run: TRICKS, TIME), the meter bar, speed, trick call-outs, the flash line for penalties and meter messages, the countdown and a pause button. **Left to do here:** the Tricks Run pot and multiplier display, SCORE and RECORD for Tricks Run, checkpoint sector flashes, stacked call-outs with values, and the speed unit setting.

**Goal:** the in-run display, in the game's style: loud arcade type over the calm mountain (chunky slanted system font, yellow/pink call-outs, as in `#callout` already).

- Top right: banked SCORE, RECORD (best saved score for the level), TIME (counting up).
- Near the rider's side of the screen: the pot with its multiplier ("×3  1,240"), popping on each addition, and a short trickle animation when it drains.
- Left edge: vertical power meter with the 80 % mark; pulses at 100 %.
- Bottom left: speed. Unit is mph or km/h from settings (default mph; add `units` to the settings object now, the settings screen arrives in milestone 7).
- Checkpoint flash: sector time against gold in green or red ("−0.42"), for 1.5 s.
- Call-outs: trick name large, value underneath, stacked for combos ("BACKFLIP 360 / 1,230 / CLEAN").
- Keep everything clear of the rider (who sits about 12 % down from the top, centre) and inside the safe-area insets. Remove the "core-feel test build" note.

**Check:** at 812x375 and at desktop size nothing overlaps the rider or the touch buttons; all values update live.

## - [ ] 5. The full level 1 course

**Goal:** replace the test slope in `js/data/levels/level1.js` with the designed course. Data only, plus small scenery models.

Length **2600 m** (about 2 minutes). 10 checkpoints (every 260 m). Layout, top to bottom:

| z (m) | Zone | What is there |
| --- | --- | --- |
| 0 – 250 | **Summit Bowl** (wild) | Wide open piste (half-width 20). Gentle rollers, one small wind-lip ledge (drop 2 m). First gates. No trees near the line. Teaches riding and a first jump. |
| 250 – 600 | **Split A** | Main slalom line down the centre. Left branch **Cliff Line**: three ledges of 4, 6 and 9 m, rocks beside the line. Right branch **The Glade**: narrow (half-width 7 to 9) through tight trees with rollers, good for near misses. All three rejoin at 600. |
| 600 – 900 | **The Chute** | One narrower, steeper piste (half-width 12, grade 1.25). Rollers at 680 and 760, then the first showpiece: a 10 m ledge with a lip at about 860. |
| 900 – 1000 | **Treeline** | Widens. First fences and signposts. First man-made kicker (small). Lift pylons appear at the side. |
| 1000 – 1700 | **Split B** (resort) | Left branch **Park Lane**: three kickers in a row (small, medium, big), two rails and a box (rails/box are placed in milestone 6; leave their positions as comments). Right branch **Racer's Piste**: wide, fast, groomed (grade 1.15), dense slalom (gate spacing 30). A short cross-link joins them at about 1350. Rejoin at 1700. |
| 1700 – 2300 | **Lower mountain** | Main piste with rollers. Right branch **Lift Line** runs under the lift: pylons are obstacles to weave through. Left branch **Quarry**: a 7 m ledge between rock walls. Rejoin at 2300. |
| 2300 – 2600 | **Finish arena** | Straight, wide, fenced, with banners. The big-air ramp (kicker height 5.5, length 14) at about 2380, a long clear landing, finish arch at 2600. |

Rules for placing things:

- A branch's first and last nodes must sit on another path (same `x`, similar `w`) so the pistes join without a gap. Keep at least 25 m of forest between parallel branches.
- At least 60 m between jumps on the same line; at least 50 m of clear, straight landing after any ledge or kicker (no trees, gates or other features).
- Never put a gate within 30 m before a jump or 40 m after one.
- Per-path gate spacing: add an optional `gateSpacing` on a path, and generate gates down the main line and Racer's Piste only (extend the generator in `js/terrain.js`).
- Scenery models in `js/render/props.js`, built in code, all with collision entries: lift pylon (tall post + crossarm, r 0.6, h 12) with cables drawn between consecutive pylons; hut (box + pitched roof, collide as circle r 4, h 5, placed well off the line); banner (two posts + cloth, r on the posts only); finish arch. No people anywhere.
- Every man-made jump keeps its course paint (automatic for kickers). Rails and boxes get the same blue approach and red line in milestone 6. The red side fences follow the outermost pistes automatically; check they do not cut across a branch.
- Set `goldTimes` after the layout is final, and reset the Race medal times in `level.race` (ride a clean Race: gold = that time + 5 %, silver + 15 %, bronze + 30 %). Check every branch has sensible gates (the generator already skips gates near jumps).

**Check:** ride every branch start to finish from the console and by hand: no gaps between pistes, no jump lands in trees, each rejoin is smooth, the run takes roughly 2 minutes. Fps in the tuning panel stays steady along the whole course.

## - [ ] 6. Rails and boxes

**Goal:** grinds, as a new man-made feature type `rail` (`{ type: 'rail', x, z, length, height, kind: 'rail' | 'box' }`), running straight downhill.

- Getting on: if she is airborne, descending, within `rail.catchWidth` (0.8 m for a rail, 1.5 m for a box) of the rail line and passes through its height, she locks on. So you jump onto it; put a tiny kicker 6 m before each one.
- On the rail: position locked to the line, speed kept, steer does nothing; left/right taps spin the board (counts as spins when she leaves). Jump pops off with normal pop rules. Reaching the end drops her off as airborne with no upward speed.
- Score: `rail.pointsPerMetre` (40) into the pot, with the multiplier, counted as a trick for the chain and the meter. Call-out "6.0 m RAIL".
- Implement in `rider-physics.js` as a third state beside ground and air (`s.rail`). Model in `render/props.js`.
- Place the two rails and the box in Park Lane.

**Check:** jump onto each, ride its length, pop off with a spin, see the call-out and points. Missing the rail just lands on snow.

## - [ ] 7. Menus, settings and run flow

**Already built:** title, mode select, level select (six slots), rider select (one rider, three empty slots), pause, results, the run flow with countdown, and saved bests (`js/save.js`). **Left to do here:** the Settings screen and `js/settings.js` only (sound, quality replacing `?q=`, speed unit, control hints, reduced effects), reachable from the title screen and from pause. A slowly turning 3D rider on the rider screen is optional polish.

**Goal:** simple flat screens, not a 3D hub. All markup in `index.html`, logic in new `js/ui.js`, persistence in new `js/settings.js` (`localStorage`, versioned key).

- Screens: **Title** ("SUMMIT PROTOCOL", Play) → **Level select** (six cards: level 1 playable with its best score; five locked cards reading "Coming soon") → **Rider select** (one rider card with name, tagline, stat bars and a slowly turning model; three empty "Coming soon" slots; equipment line showing the board) → run → **Results** (banked score, best trick, top speed, time, new-record flag; Retry / Levels).
- **Pause** (Esc or a pause button): Resume, Restart, Settings, Quit. Pausing stops the simulation and the timers.
- **Settings:** sound on/off and volume, quality (low/medium/high, replacing the `?q=` parameter), speed unit (mph/km/h), control hints on/off, reduced effects.
- Run flow in `main.js` as a small state machine: `menu → countdown (3-2-1) → riding → finished → results`. The finish line (last checkpoint) banks the pot and ends the run.
- Best score per level saved in settings.
- The first tap on Play is also where audio gets unlocked (milestone 8 uses it).
- Menu background: the live 3D view of the start area with a slow camera drift is enough.

**Check:** full loop from title to results and back, by keyboard and by mouse; settings survive a reload; pause truly freezes time; portrait on a phone-sized touch viewport shows the rotate screen.

## - [ ] 8. Sound

**Goal:** everything synthesized with the Web Audio API in new `js/audio.js`. One `AudioContext`, unlocked on the Play tap, resumed when the page returns from the background.

- Continuous: board-on-snow noise (filtered noise; louder and brighter with speed, harsher when carving or braking), wind that rises with speed and in the air.
- One-shots: jump pop, landing thump (scaled by impact), trick landed (rising blip, higher for bigger tricks), gate pass tick, gate miss, checkpoint chime, bank trickle, crash, meter charged (80 %), meter full, adrenaline fire and its running layer.
- Music: one short original synth loop for menus and a driving one for the run, generated in code (simple sequencer). Keep it optional in settings.
- `main.js` calls audio from events, never from render code.

**Check:** every listed event makes its sound; nothing plays before the first tap; switching tabs and back resumes sound.

## - [ ] 9. Final rider model and animation

**Goal:** replace the boxy stand-in with the chosen look: **A, high ponytail with goggles pushed up**, as sketched in `spikes/riders.html`.

- Still built in code. Keep the node order in `rider-model.js` (root > yaw > flip > spin > lean > body). Aim for a confident, athletic, feminine silhouette that reads at 25 pixels tall: clear waist and hips, the chosen hair as a strong moving shape, blue top, red trousers, white chest stripe.
- Poses blended by state: riding (knees bent, arms out), carving (lean, trailing hand toward the snow), crouch while charging, air tuck, a grab pose while spinning fast, arms up on a landed big trick, tumble.
- The same model, larger and lit from the front, is what the rider select screen shows.

**Check:** each pose is distinguishable from the game camera; spins and flips read clearly; no frame-rate drop.

## - [ ] 10. Touch polish and hints

**Goal:** make phones feel right. Needs the owner's phone feedback from `PROGRESS.md` first; ask for it if it is missing.

- Tune `touch.*` values from that feedback (steer range, circle sensitivity, swipe thresholds).
- Button layout: jump large at bottom right, boost and brake beside it, adrenaline above when available; all inside safe areas; steering drag works anywhere not on a button.
- First-run hints (if enabled in settings): short prompts at the right moment ("Drag to carve", "Hold JUMP, release at the lip", "Circle your finger to spin", "Swipe up or down to flip"), each shown until done once.
- Prevent page scroll, zoom, text selection and the iOS long-press menu during play.

**Check:** owner confirms on a real iPhone and Android phone.

## - [ ] 11. Look and performance pass

**Goal:** closer to the reference mood, steady frame rate.

- Soft blur toward the top and bottom screen edges (a cheap overlay; must be switchable off by the quality setting).
- Powder texture off-piste distinct from the groomed corduroy; rock colouring on steep ledge faces from all directions.
- Trees that would cover the rider near the bottom of the screen fade out or are thinned along the line.
- Gate feedback: a passed gate's flags flip; a missed one dims.
- Performance: measure on the owner's phone with the tuning panel; set the default quality by device (start phones on medium); cap chunk building to one per frame (already so) and check for hitches at chunk boundaries.

**Check:** owner's phone holds 60 fps on medium (or the best achievable is recorded in `PROGRESS.md`).
