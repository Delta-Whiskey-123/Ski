# Summit Protocol map editor

A desktop tool for designing courses for the Summit Protocol game. It is not part of the shipped game. It lives on the `map-editor` branch only; nothing here is merged to `main` yet.

**Version: Ev0.1** (git tag `Ev0.1`). Milestone E0, the foundation.

## Run it

```bash
node tools/serve.mjs
```

Then open http://localhost:8130/editor/ in desktop Chrome (mouse and keyboard).

Command line, for generating and checking maps without the browser:

```bash
node tools/map.mjs generate | validate | jumps | convert | import | rules
```

Tests:

```bash
node --test "editor/test/*.test.mjs"
```

## What Ev0.1 does

- **Map files** (format version 1): a game level plus metadata, the final gate list and placeholder objects. Validation with plain-language errors; a newer file is refused.
- **Plan view** drawn to scale with pan and zoom: pistes, jumps, gates, scenery, objects, forest and fences.
- **Editing:** select and drag piste points, jumps, gates, scenery, objects and the start; a properties panel; undo and redo; Delete; autosave.
- **Jump prediction** with the game's real physics at three speeds (slow, normal, adrenaline), shown on the plan and as a side view.
- **Placement rules** (14) with a live warning list that jumps to each problem.
- **Generator:** a whole course from a seed, length, difficulty, branches and jump density, checked against the rules.
- **Import and export:** map files, and the game's level module.

Not yet: placing new things by hand (E1), adding or deleting pistes (E3), loading a generated course into the game (E8). See `editor/MILESTONES.md`.

## Files

| Where | What |
| --- | --- |
| `editor/index.html`, `editor/editor.css` | The editor page. |
| `editor/app/` | Browser side: store (undo/redo), plan drawing, interaction, panel, warnings, import/export. |
| `editor/core/` | Pure logic shared by the page, the command line and the tests: format, conversion, rules, prediction, generator. |
| `editor/maps/` | Example maps (the test slope and a generated course). |
| `editor/test/` | Automated tests. |
| `tools/map.mjs` | Command-line tool. |
| `editor/DESIGN.md` | Design reference: what each file owns and must never do. |
| `editor/MILESTONES.md` | The editor's work list (E1 onward). |

## Versions

- **Ev0.1** (2026-11-16): milestone E0, the foundation. Built against game version 0.1 (enlarged snowmen included).
