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

## Next

Milestone 1 in `MILESTONES.md` (crashes and obstacles).

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
- **Original rider:** Freya Lindqvist, blonde, blue top, red trousers. Not based on any existing game's character.
