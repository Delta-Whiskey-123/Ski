# Summit Protocol

An arcade snowboard game for the browser (phone and desktop). Work in progress.

**Version: 0.2** (git tag `v0.2`): adds sound.

Run locally: `node tools/serve.mjs`, then open http://localhost:8130.

See `CLAUDE.md` for how the project is organised, `PROGRESS.md` for status and `MILESTONES.md` for the plan.

Uses Three.js r160 (MIT licence), bundled in `vendor/`.

## Sound

Every sound is synthesized in code with the Web Audio API (`js/audio.js`); there are no audio files and no music. Sound starts on the first tap or key press. Settings > Sound turns it on or off and sets the volume. To hear and tune each sound on its own, open http://localhost:8130/spikes/sounds.html.

## Map editor

The course editor is on the `map-editor` branch (version **Ev0.1**, tag `Ev0.1`), not on `main`. Switch to that branch, run the same server, open http://localhost:8130/editor/ and see `editor/README.md` there.

## Versions

| Tag | What |
| --- | --- |
| `v0.1a` | Core feel, menus and modes, power meter, breakable scenery. |
| `v0.1` | As v0.1a, with the snowmen enlarged (small 2x, big 4x). No sound. |
| `Ev0.1` | Map editor milestone E0 (foundation), on the `map-editor` branch. |
| `v0.2` | Milestone 8: sound effects (29 synthesized sounds, rider voice, Settings > Sound). |
