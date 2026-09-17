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

### The detailed database

`gothstronomy_detailed.db` is a separate, richer database, built by `build_db_detailed.py`. It shares
`gothstronomy.db`'s schema and its `name`/`goth_title`/`cardinality`/`happiness`/`season`/`colors` data
exactly (imported straight from `build_db.py`, so the two never drift), but replaces the other two
columns:

- `tarot_mapping` uses the full 78-card deck (all 22 Major Arcana, each exactly once, plus court cards
  and pips from all four Minor Arcana suits) instead of the original's 20-card, heavily-repeated subset.
- `astrological_mapping` expands each row's original planet/sign choice (unchanged) into real classical
  astrological detail: element and modality for the zodiac signs, and the ruling planet's classical day,
  metal, and temperament for every row.

See the module docstring in `build_db_detailed.py` for the full assignment methodology. Rebuild with
`python3 build_db_detailed.py`. `gothstronomy_original.db` is a plain backup of `gothstronomy.db` taken
before this file existed. Neither of these two files is wired into the game (`web/` still reads
`gothstronomy.db`).

### The merged database

`gothstronomy_merged.db` unions everything else in this repo into one queryable file. It's built
by `build_db_merged.py`, which:

- copies `gothstronomy_detailed.db`'s `constellations` table (the richer of the two constellation
  tables) in as-is,
- copies the full Rider-Waite tarot schema (`suits`, `elements`, `seasons`, `cards`,
  `description_terms`, `card_descriptions`, `keyword_terms`, `card_keywords`, `meaning_terms`,
  `meaning_sets`, `meaning_set_items`, `card_images`) in from `rider_waite_3nf-lower.sqlite`
  verbatim, images included, and
- adds what neither source file could express on its own: `constellations.tarot_card_id`, a real
  foreign key into `cards`, populated by matching `tarot_mapping` strings to `cards.name` (every
  one of the 88 matches exactly), plus a `constellation_tarot_detail` view joining a constellation
  straight through to its card's suit, element, and traditional season.

`gothstronomy.db` and `gothstronomy_original.db` aren't part of the merge — `gothstronomy.db`'s
constellation data is a strict subset of `gothstronomy_detailed.db`'s, and `_original` is a
byte-for-byte backup of it. Rebuild the merged db with `python3 build_db_merged.py`; it's not wired
into the game, which still reads `gothstronomy.db` directly.

### Tests

```
find web/js -name '*.test.js' -print0 | xargs -0 node --test
```

(`find`-based rather than a shell glob so it keeps working if a test file ever moves into a
subdirectory -- neither a plain `web/js/*.test.js` glob nor `node --test web/js` catch that on
their own.)

Covers the color/mood lookup tables in `theme.js` and `audio.js`, including a check that every `colors` and
`happiness` value actually present in `gothstronomy.db` has a corresponding entry -- so adding new
constellation data that the game can't render/score correctly fails the test suite instead of silently
falling back. Requires Node 22+ for the built-in `node:sqlite` module.

