# Summit Protocol

An arcade snowboard game for the browser (phone and desktop). Work in progress.

Run locally: `node tools/serve.mjs`, then open http://localhost:8130.

See `CLAUDE.md` for how the project is organised, `PROGRESS.md` for status and `MILESTONES.md` for the plan.

Uses Three.js r160 (MIT licence), bundled in `vendor/`.

## This branch: the map editor

This is the `map-editor` branch, at map editor version **Ev0.1** (tag `Ev0.1`). It holds the game as of version 0.1 plus the course editor in `editor/`. Open http://localhost:8130/editor/ and see `editor/README.md`.

The game itself moves on on `main` (version 0.2 adds sound).

## Versions

| Tag | What |
| --- | --- |
| `v0.1a` | Core feel, menus and modes, power meter, breakable scenery. |
| `v0.1` | As v0.1a, with the snowmen enlarged (small 2x, big 4x). No sound. |
| `Ev0.1` | Map editor milestone E0 (foundation), on the `map-editor` branch. |
