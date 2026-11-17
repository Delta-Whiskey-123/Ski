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

- **Milestone 8, sound (owner's rewritten spec, 2026-11-16; done 2026-11-17, before milestone 1 at the owner's request).** No music. Every sound synthesized in `js/audio.js` (Web Audio, no files): 29 sounds in all, previewed and approved by the owner on `spikes/sounds.html` before being wired in (that page stays as the listening and tuning bench).
  - Owner's choices: arcade with real-world snow and impacts; Freya reacts occasionally (1 in 3 qualifying moments, at least 6 s apart; adrenaline fire and crashes always); the ready pulse is full level for 4 beats, then a whisper until fired.
  - One `AudioContext` (`latencyHint: 'interactive'`), created on the first tap or key press, resumed when the page comes back. Noise and impact buffers and all continuous layers are built at unlock. Pause fades the riding sounds and ducks one-shots (menu clicks are not ducked). At most 12 one-shots at once, the quietest dropped.
  - Every level, pitch, time and threshold is in the `audio` group of `js/tuning.js` (93 values, editable in the tuning panel and on the preview page), with a master volume and seven category volumes. `meter.readyBeat` (1.1 s) is the one value both the button's CSS pulse (`--adr-beat`) and the ready sound use.
  - Settings > Sound: on/off and volume, saved in `js/settings.js` (settings now version 2; a version 1 save keeps its keys).
  - Freya's voice is data: `voice` in `js/data/riders.js` (pitch, brightness, lift, chance, minGap). Formant synthesis, no words; 2-3 variants per reaction, never the same one twice running.
  - Event fields added for sound, logic otherwise unchanged: `takeoff` now carries `charge` and `surface` ('kicker' or 'snow', from new `terrain.kickerAt()`); `land` carries `sloppy` (0 square .. 1 sideways or upside down). `main.js` also sends `count`, `start`, `finish`, `results` and `adrenaline` events, and passes each `crash` / `respawn` event through when milestone 1 adds them.
  - A natural hop shorter than `audio.minAir` (0.12 s) makes no sound: the deep-snow edge push makes 0.02-0.07 s hops that would otherwise chatter.
  - Console: `summit.audio.test(name)` plays any sound (`summit.audio.names`), `peak()` gives the output level, `heard` counts events received and `played` counts sounds played.
  - **Verified (Chrome, desktop):** nothing exists before the first tap (`summit.audio.ctx` is null); every sound produced output on the preview page; riding layers follow speed, carve and deep snow; pause fades to silence and resume restores; ready beats exactly 1.1 s apart (4 full, then quiet); adrenaline gives the surge, a heartbeat every 0.5 s, warnings in the last 1.5 s and the power down at 7 s; the voice limits and the 12-sound cap hold; sound off silences and is saved. Whole runs driven with `summit.tick()` reached the audio with every event type (count, start, takeoff, land, break, gate, adrenaline, finish, results, the menu click) — see the run figures below.
  - Run figures (Race, autopilot steering at scenery, a pop every 4 s with spins and flips, boost and brake bursts, adrenaline fired, one 1.5 s pause; driven in real time so the audio clock moved): 60.5 s of game, 28 take-offs (2 off kickers, 11 popped, 6 natural puffs, the rest tiny edge hops kept silent), 22 landings (3 during adrenaline), 19 trick blips, 67 spin and 15 flip whooshes, 8 scenery breaks with the right sound for each type, 12 gates (3 ticks, 9 buzzes), 20 ready beats, 14 heartbeats, 8 warnings, 1 surge and 1 power down, 6 boost whooshes, 7 edge bumps, 3 grunts, 3 whoops and 1 laugh, countdown 3-2-1-go, start, finish and the results sting. Output was silent while paused; at most 10 one-shots played at once; the peak level stayed under 1.
  - **Waiting on milestone 1:** tree, fence, crash tumble and respawn sounds and the `crash` handler (with `obstacle`) are built and tested from the console and the preview page; nothing in the game crashes yet.
  - **Not checked:** how anything sounds (no ears on this side; the owner approved the preview); real phones; a real tab switch (only the code path); frame cost on a phone.
- **Board follows the snow (fix, drawing only).** The rider model used to stay level, so on any ramp the nose of the board went into the snow (up to 0.94 m on the big kicker). `js/render/rider-model.js` now has a `slope` layer between `root` and `yaw` that tilts the whole figure to the surface under the board, front to back and side to side. Owner's choices: rider and board tilt together; in the air the tilt eases back to level; side slopes are matched too.
  - A curved ramp is matched at nose and tail (she is lifted slightly so the board bridges the curve); at a jump lip the flatter side is used, so the nose hangs over the edge instead of diving.
  - The simulation, `tuning.js` and scoring are untouched. The constants at the top of `rider-model.js` are visual only.
  - **Verified (Chrome, desktop):** deepest point of the board below the snow, before and after, measured along each feature: big kicker 0.94 m to 0.01 m, middle kicker 0.71 to 0.02, small kicker 0.47 to 0.01, roller 0.29 to 0, 12 m ledge lip 0.27 to 0, also at an angle and off piste (all 0.03 m or less). A real pass over the big kicker with `summit.tick()`: tilt rises to 32° at the lip, then fades to under 2° in about 0.2 s of air. No console errors.
  - **Not checked:** how it looks in motion (the preview pane does not animate continuously); phones.

## Next

Milestone 1 in `MILESTONES.md` (crashes and obstacles). Its `crash` event should carry `obstacle` ('tree', 'fence', 'sign', 'rock') and a `respawn` event should follow; `main.js` already passes both to the audio.

## Waiting on the owner

- **Phone test** (cannot be checked on desktop):
  1. Does it run smoothly? Open the tuning panel (triple-tap top-left) and read the fps while riding. If it is poor, try adding `?q=medium` or `?q=low` to the address.
  2. Drag to steer: is the 70-pixel range comfortable?
  3. In the air, does circling a finger spin her, and in the direction you expect? Does a quick straight swipe up/down flip?
  4. Do the JUMP, BOOST and BRAKE buttons respond while the other thumb steers?
  5. Does portrait show the rotate screen?
- **Sound on a real phone** (milestone 8):
  1. iPhone: with the silent switch on, does sound still play? (Web Audio normally plays through the silent switch on iOS 17+, but some versions mute it. If it is muted, say whether you want sound to follow the switch.)
  2. Is there any sound before the first tap? (There should be none.) Does the first hit after Drop In sound on time?
  3. Lock the phone or switch apps mid-run, come back: does sound resume cleanly after Resume?
  4. Balance: are board and wind too loud against tricks and impacts? Is Freya's voice too loud or too quiet? (Category volumes are `volBoard`, `volWind`, ... in the tuning panel.)
  5. Can you hear the change between "slow cruise" and "fast" on the board (around 17 m/s, about 38 mph)?
  6. Is the adrenaline-ready pulse annoying over a long hold, even after it drops to a whisper?
  7. Does Freya talk too much, too little, or about right?
  8. Frame rate with sound on (tuning panel fps), compared with sound off in Settings.

## Known problems and limits

- Touch gestures (circle to spin, swipe to flip) are written but have only been exercised with keyboard events; expect to tune `touch.*`.
- Frame rate has not been measured on any phone. The preview pane used for development does not run animation continuously, so there is no desktop figure either.
- How far ahead you can see is limited by the top-to-bottom direction on a wide screen: about 30 m, roughly 1.3 s at top speed (the owner asked for the rider to sit lower on screen, about 18 % from the top, which costs a little look-ahead). `camera.height`, `camera.lead` and `camera.fov` trade rider size against look-ahead.
- Ledge sides and cliff faces are only coloured as rock when steep in the downhill direction.
- "For 2 seconds" in the scenery request: the owner chose a one-off speed cut and that a second hit restarts the timer, so the 2 seconds has no separate effect; every hit simply cuts speed by its own amount.
- No crashes or scoring yet; trees and fences can be ridden through (their sounds are ready).
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
- **Sound (owner, 2026-11-16):** no music; arcade style with real-world snow and impacts; voice occasional; ready pulse fades to a whisper after 4 beats; every sound previewed on a page and approved before being wired in. Settings > Sound lives on the existing Settings screen (reachable from title and pause), not on the pause screen.
- **Original rider:** Freya Lindqvist, blonde, blue top, red trousers. Not based on any existing game's character.
