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
- Measured from the console on the test slope, riding straight with no input: airs of 0.3 s (roller), 0.75 s (4.5 m ledge), 0.7 s (roller), 1.7 s (big kicker), 1.5 s (12 m ledge). A charged jump pop adds to these.

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
- How far ahead you can see is limited by the top-to-bottom direction on a wide screen: about 35 m, roughly 1.5 s at top speed. `camera.height`, `camera.lead` and `camera.fov` trade rider size against look-ahead.
- Ledge sides and cliff faces are only coloured as rock when steep in the downhill direction.
- No crashes, scoring, meter, menus or sound yet; trees can be ridden through.
- The project folder is under `.claude`, which the Claude desktop app will not attach to a session that was started elsewhere. Start sessions directly in the folder.

## Decisions and why

- **Heights are relative to a flat base slope; steepness is a `grade` number.** Keeps physics simple and tunable, and jumps predictable. Cliffs are plateaus that drop away (`ledge`).
- **One take-off rule** instead of per-jump launch code, so every shape of terrain gives air naturally and `jump.launchScale` tunes them all together.
- **Natural features are in the snow mesh; man-made ones are separate models,** so kicker lips stay sharp without a very fine terrain grid.
- **Fixed 120 Hz simulation** so jumps are identical at any frame rate.
- **Camera downhill of the rider, looking back uphill,** which is what makes her travel top to bottom.
- **Level is fixed and hand-designed; the forest is generated from a seed** so it is the same every run.
- **Boost is always available** (modest push); adrenaline doubles it. No separate boost fuel.
- **Run rules fixed by the owner:** par times only (no countdown), a crash loses the unbanked pot and 25 points of meter, adrenaline is fired by the player, level 1 is wild at the top and resort at the bottom, about 2 minutes, speed unit switchable (default mph), equipment as data so skis can come later.
- **Scoring model approved by the owner** (2026-11-15) as written in milestone 2. Numbers stay tunable; the shape should not change without asking.
- **Rider look chosen by the owner (2026-11-15): A, high ponytail with goggles pushed up** (see `spikes/riders.html`). Milestone 9 builds this; the stand-in already has a ponytail.
- **Original rider:** Freya Lindqvist, blonde, blue top, red trousers. Not based on any existing game's character.
