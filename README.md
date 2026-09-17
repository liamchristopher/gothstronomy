Concept: Astronomy, but gothic themed.

Artifacts: Create a SQLite database with ALL constellations and suggestions of their goth titles. include columns for: cardinality, happiness, seasons, colors, tarot mappings, and astrological mappings. Examples: "The Big Dipper" is "The Goblet of Blood", "The North Star" is "The Beacon of Solace".

Output:
1) a sqlite db as described above

2) A "game" like "e4 every extend extra extreme", but with industrial music where each play increases the work. Each "stage" is a different constellation with a goth attitude.

Method: Work the data first. If there is an issue, then create a PR and then resolve it.

---

## Status

Both artifacts are built.

1. `gothstronomy.db` — a standard SQLite3 database (verify with `sqlite3 gothstronomy.db "PRAGMA integrity_check;"`)
   with a single `constellations` table covering all 88 IAU-recognized constellations. Columns: `name`,
   `goth_title`, `cardinality`, `happiness`, `season`, `colors`, `tarot_mapping`, `astrological_mapping`.
   Rebuild it any time with `python3 build_db.py`.

2. `web/` — the game, "GOTHSTRONOMY: Extend the Void". A static, dependency-free web app (vanilla
   HTML/CSS/JS) styled after *every extend extra extreme*: dodge and detonate to chain-clear waves of
   drifting stars, with a fully procedural industrial-techno soundtrack (Web Audio API, no audio files)
   whose tempo climbs every stage. Each of the 88 stages is one constellation, pulled live from
   `gothstronomy.db` via [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly) — the database
   itself is never converted or duplicated, just queried directly in the browser. `cardinality` sets each
   stage's enemy density, and `colors` sets its palette. After all 88, the cycle loops with rising
   difficulty.

### Running the game

The browser needs to fetch `gothstronomy.db` and the sql.js WASM runtime over HTTP, so open it through a
local server rather than as a `file://` URL:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/web/`.

**Controls:** move with the mouse/touch, detonate with a click/tap or the spacebar.

### Tests

```
node --test web/js/*.test.js
```

Covers the color/mood lookup tables in `theme.js` and `audio.js`, including a check that every `colors` and
`happiness` value actually present in `gothstronomy.db` has a corresponding entry -- so adding new
constellation data that the game can't render/score correctly fails the test suite instead of silently
falling back. Requires Node 22+ for the built-in `node:sqlite` module.

