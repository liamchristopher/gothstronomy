# GOTHSTRONOMY — Architecture

Exhaustive technical reference for both artifacts in this repo: the SQLite database and the
browser game built on top of it. The README covers the concept and how to run things; this
document covers how everything actually works internally, so future changes can be made with
full context instead of re-deriving it from scratch.

## 1. Repository layout

```
gothstronomy/
├── README.md            concept, status, run/test instructions
├── ARCHITECTURE.md       this file
├── build_db.py           generates gothstronomy.db from a hardcoded Python list
├── gothstronomy.db       generated SQLite3 database (checked in, not gitignored)
└── web/                  the game: a static, dependency-free vanilla JS app
    ├── index.html         page shell, all DOM structure for every screen
    ├── styles.css         all styling, one file, no preprocessor
    └── js/
        ├── main.js               entry point: DOM wiring, boot sequence, UI adapter
        ├── game.js               Game class: state machine, physics, scoring, rendering
        ├── audio.js              IndustrialAudioEngine: procedural music/SFX
        ├── db.js                 loadConstellations(): fetches + queries the .db via sql.js
        ├── theme.js              color name -> hex lookup, palette derivation
        ├── storage.js            localStorage wrapper for best score/stage
        ├── theme.test.js         node:test unit tests for theme.js
        └── data-consistency.test.js  node:test cross-check of theme.js/audio.js against the live .db
```

There is no build step, no bundler, no package.json, and no npm dependencies. The browser loads
`web/js/main.js` as a native ES module, which statically imports the other four small modules.
The one third-party dependency, [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly), is
loaded at runtime from a CDN (`cdnjs.cloudflare.com`), not vendored.

## 2. The database

### 2.1 Schema

```sql
CREATE TABLE constellations (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    name                   TEXT NOT NULL UNIQUE,
    goth_title             TEXT NOT NULL,
    cardinality            INTEGER NOT NULL,
    happiness              TEXT NOT NULL,
    season                 TEXT NOT NULL,
    colors                 TEXT NOT NULL,
    tarot_mapping          TEXT NOT NULL,
    astrological_mapping   TEXT NOT NULL
);
```

One table, 88 rows — one per IAU-recognized constellation, alphabetical by `name`. `id` is the
canonical play order (`ORDER BY id` in `db.js`); the game never reorders or shuffles stages.

Column semantics:

| Column                 | Meaning                                                                                   | Consumed by |
|-------------------------|--------------------------------------------------------------------------------------------|-------------|
| `name`                 | Real IAU constellation name (e.g. "Orion")                                                | stage card, stage banner |
| `goth_title`           | Invented goth-reimagined title (e.g. "The Hunter Slain by His Own Pride")                  | stage card, stage banner |
| `cardinality`          | An arbitrary "star count" difficulty knob per constellation, range 2–24 in the data        | `game.js` `_spawnWave` (enemy count) |
| `happiness`            | One of 17 mood words (Wrath, Despair, Dread, Grief, Sorrow, Torment, Longing, Melancholy, Ennui, Isolation, Numbness, Vanity, Resignation, Regret, Bitterness, "Grim Resolve", Anguish) | `audio.js` `MOOD_SCALES` (picks the bassline's scale) |
| `season`               | Fall / Winter / Spring / Summer / "Circumpolar (Year-round)"                               | stage card only (flavor) |
| `colors`               | Comma-separated list of 1–3 names from a fixed 16-color goth vocabulary                     | `theme.js` `paletteFor` (primary/secondary/tertiary render colors) |
| `tarot_mapping`        | One of 20 Major Arcana card names (flavor; not all 22 arcana are used)                      | stage card only (flavor) |
| `astrological_mapping` | Ruling planet or zodiac sign/planet pair                                                    | stage card only (flavor) |

**Data-integrity invariant**: every distinct value ever placed in `colors` or `happiness` MUST
have a corresponding entry in `theme.js`'s `COLOR_MAP` or `audio.js`'s `MOOD_SCALES` respectively,
or the game silently falls back to a generic color/scale instead of erroring. This is enforced by
`web/js/data-consistency.test.js`, which reads the live `.db` file and fails if anything is
uncovered — run it after editing `build_db.py`'s data.

### 2.2 Build script (`build_db.py`)

- `CONSTELLATIONS`: a hardcoded Python list of 88 tuples (one per row, in the column order above),
  alphabetical by name. This is the single source of truth for content — there is no other data
  file or CMS.
- `build()`: deletes any existing `gothstronomy.db`, recreates the schema, bulk-inserts all rows in
  one `executemany`, then asserts the resulting row count is exactly 88 (`raise SystemExit`
  otherwise — a guard against silently losing a row to a duplicate `name` UNIQUE violation, which
  SQLite would otherwise skip un-noticed under default error handling... actually a UNIQUE
  violation raises immediately in Python's sqlite3, but the count check remains a second, cheap
  line of defense against any other row-loss bug).
- No CLI flags, no config. Run as `python3 build_db.py` from the repo root; it always writes to
  `<repo root>/gothstronomy.db`.
- Verified (as of the last audit) to reproduce all 88 real IAU constellations with zero duplicate
  or missing names, and every `colors`/`happiness`/`tarot_mapping` value drawn from a small, fixed
  vocabulary — see §2.1's invariant.

## 3. The web app

### 3.1 Boot sequence (`main.js`)

1. Grab every DOM element the game needs into a flat `els` object (`document.getElementById`,
   no querySelector, no framework).
2. Construct `IndustrialAudioEngine` and `Storage` — both are safe to construct before any user
   gesture; `IndustrialAudioEngine` defers creating its actual `AudioContext` until
   `ensureContext()` is called (browsers require a user gesture to start audio).
3. Build a plain-object `ui` — this is the *only* thing that touches the DOM outside of `main.js`
   itself. `Game` (in `game.js`) never touches `document`; it's handed `ui` as a dependency and
   calls methods on it (`updateHud`, `updateTimer`, `setStageBanner`, `popChain`, `showStageCard`,
   `hideStageCard`, `showGameOver`, `hideGameOver`). This is the app's only real seam — swapping
   rendering frameworks would mean rewriting `ui` and `main.js`, not `game.js`.
4. `boot()`: mutes audio by default, calls `loadConstellations()` (see §3.2). On failure (e.g. the
   page was opened as `file://` instead of served over HTTP, so `fetch()` of the `.db` fails),
   disables the Start button and shows an explanatory message instead of leaving a silently broken
   game.
5. On success, constructs `Game` with `{ canvas, stages, audio, ui, storage }` and wires up the
   four buttons (Start, Stage-begin, Restart, Mute). `Game.start()` is only ever called from the
   Start/Restart button handlers.

### 3.2 Database loading (`db.js`)

`loadConstellations(dbUrl)`:
1. Lazily injects the sql.js `<script>` tag (`loadScriptOnce`) if `window.initSqlJs` isn't already
   defined, so repeated calls don't double-load it.
2. `initSqlJs({ locateFile: () => SQLJS_WASM })` — points sql.js at the CDN-hosted `.wasm` binary.
3. `fetch(dbUrl)` (default `"../gothstronomy.db"`, relative to `web/js/`, i.e. the repo-root
   `.db` file) and loads the raw bytes into an in-memory `SQL.Database`. The `.db` file itself is
   never converted, transpiled, or duplicated — sql.js queries the exact same SQLite file the
   Python script produces.
4. Runs one `SELECT ... ORDER BY id` for all 8 columns, maps rows into plain objects, and adds a
   derived `colorList` field (`colors.split(",").map(s => s.trim())`) so downstream code never
   re-parses the comma-separated string.
5. Closes the in-memory DB handle (`db.close()`) after extracting rows — nothing keeps the WASM
   database alive for the rest of the session; `Game` only ever holds the plain-object array.
6. Warns (`console.warn`, does not throw) if the row count isn't exactly 88 — a soft version of the
   same invariant `build_db.py` enforces harder.

### 3.3 Color/palette system (`theme.js`)

- `COLOR_MAP`: a hardcoded `{ "Ash Grey": "#9a97a6", ... }` table for all 16 color names that
  appear in `colors` across the dataset, plus an `ANY` fallback (`#8a2846`) for anything unmapped.
- `resolveColor(name)`: `COLOR_MAP[name] || COLOR_MAP.ANY`.
- `paletteFor(colorList)`: takes a stage's `colorList` (already comma-split) and returns
  `{ primary, secondary, tertiary }` by resolving up to the first 3 entries, reusing earlier
  entries to fill gaps when a stage lists fewer than 3 colors (e.g. a single-color stage gets the
  same hex for all three slots). `primary` drives explosion/arena-boundary color, `secondary`
  drives enemy fill color, `tertiary` drives the ambient background tint (`game.js` `_render`).

### 3.4 Persistence (`storage.js`)

- Single `localStorage` key `"gothstronomy:best"`, JSON `{ score, stage }`.
- `Storage.recordRun(score, stage)` updates whichever of the two independently beat the stored
  best (a new best score and a new best stage are tracked separately — you can set a new best
  stage in a lower-scoring run) and returns `{ isNewBest, best }`, where `isNewBest` reflects only
  the score comparison (used to show the "NEW BEST" banner on the game-over screen).
- All reads/writes are wrapped in `try/catch` and degrade to `{ score: 0, stage: 0 }` /
  silent-no-op on failure (private browsing, quota, disabled storage) — the game is fully
  playable without persistence.

### 3.5 Game engine (`game.js`)

#### State machine

`Game.state` is one of four strings: `"idle" -> "intro" -> "playing" -> "intro" -> ... -> "gameover"`.

- **idle**: before the first `start()` call (title screen showing).
- **intro**: between stages — `_goToStageIntro()` clears all live entities, shows the stage card
  with that constellation's flavor, and waits for the player to click "DETONATE THIS SKY"
  (`beginStagePlay()`, called externally by `main.js`'s button handler).
- **playing**: `_update(dt)` runs every frame; this is the only state in which enemies spawn/move,
  detonations register, the stage timer counts down, and Space/click/tap actually detonate
  (`_tryDetonate()` early-returns in every other state).
- **gameover**: triggered by `_loseLife()` when `lives` hits 0. Stops the audio scheduler, records
  the run to `Storage`, and shows the game-over screen. The only way out is `Restart`, which calls
  `Game.start()` again (full reset).

The render loop (`_loop`, driven by `requestAnimationFrame`) runs continuously regardless of
state once started — `_update` is gated on `"playing"`, but `_render` always runs, so the starfield
animates and the current frame stays visible even during the "intro"/"gameover" overlays.

#### Stage progression & looping

- `stageIndex` (0–87) plus `loopCount` (increments every time `stageIndex` wraps past 87) together
  define both the *displayed* absolute stage number
  (`stageIndex + 1 + loopCount * 88`, shown in the HUD and used as the game-over/best-stage value)
  and the *difficulty* (see below). The game never ends from finishing all 88 constellations — it
  loops forever with `loopCount` scaling difficulty ever higher; the only ending is running out of
  lives.
- `_currentStageRow()` = `stages[stageIndex % stages.length]` — always valid regardless of
  `loopCount`.

#### Difficulty curve (`_difficulty()`)

Pure function of `(stageIndex, loopCount)`, recomputed every frame (cheap, four arithmetic
expressions — not cached, but not worth caching):

| Multiplier     | Formula                                          | Clamp        | Effect |
|----------------|---------------------------------------------------|--------------|--------|
| `speedMult`    | `1 + stageIndex*0.02 + loopCount*0.5`             | `[1, 3.6]`   | enemy travel speed |
| `countMult`    | `1 + stageIndex*0.035 + loopCount*0.8`            | `[1, 4.5]`   | enemies per wave |
| `intervalMult` | `1 - stageIndex*0.007 - loopCount*0.12`           | `[0.32, 1]`  | multiplies the base 2.6s wave interval (lower = faster spawns) |
| `scoreMult`    | `1 + stageIndex*0.06 + loopCount*1.2`             | unclamped    | multiplies all score gains |

Notice `loopCount`'s coefficients are far larger than `stageIndex`'s (e.g. `+0.5` vs `+0.02` for
speed) — difficulty ramps gently within a single 88-stage loop but jumps hard at every full loop,
by design (per the README: "the cycle loops with rising difficulty"). `scoreMult` is deliberately
left unclamped so score keeps meaningfully climbing at high loop counts even though the other
three multipliers cap out.

#### Detonation, chains, and scoring

This is the "extend every extend extra extreme"-style core loop:

1. `_tryDetonate()` (click/tap/Space while `state === "playing"`, subject to a 0.45s cooldown):
   spawns one `explosion` at the player's current position with `generation = 0` and a fresh
   `chainId` (`++chainCounter`), and registers a new entry in the `chains` Map:
   `{ count: 0, lastEventTime, finalized: false }`.
2. Every frame, each live `explosion` grows from 0 to `maxR` over 0.3s (`DETONATION_GROW_TIME`,
   eased with `easeOutCubic`), then holds/fades for another 0.35s (`FADE_TIME`) before being
   dropped. While growing, any enemy within `r + ENEMY_HIT_R` of the explosion's center that hasn't
   already been hit by *this specific explosion's chain* (`en.hitBy` check) is killed: the game
   awards `10 * scoreMult` points, spawns a 6-particle burst in the palette's `secondary` color,
   plays an escalating-pitch `stab()` sound, punches the audio filter open via `pulseEnergy()`, and
   — critically — spawns a **new** explosion at the dead enemy's position, one generation deeper
   (`generation + 1`), shrunk by `CHAIN_GENERATION_SHRINK` (0.88×) but floored at `CHAIN_MIN_MAX_R`
   (34px) so chains don't shrink into invisibility, carrying the *same* `chainId` forward. This is
   what makes detonations cascade: one click can trigger an unbounded chain reaction across the
   whole enemy field.
3. A chain is "finalized" once no explosion with its `chainId` is still active AND
   `CHAIN_FINALIZE_GRACE` (0.4s) has passed since its last kill (`_finalizeChain`, checked once per
   frame over all non-finalized entries in `chains`). Finalizing a chain of `count <= 1` (i.e. the
   detonation didn't hit anything, or hit exactly one enemy without any further propagation — note
   a lone kill still shows no popup and gets no bonus) does nothing further. A chain of `count > 1`
   awards a *quadratic* bonus, `round(count² * 15 * scoreMult)`, on top of the per-kill points
   already awarded — this is what rewards chaining aggressively over spacing out single kills. If
   `count >= EXTEND_THRESHOLD` (5), the stage timer gets `+3s` (`EXTEND_BONUS_TIME`, capped at
   `stageDuration * 1.6` total) instead of just a `"CHAIN x{n}"` popup — this is the game's
   "extend" mechanic, directly analogous to *every extend extra extreme*'s namesake.
4. `chains` is a `Map` that's only ever cleared wholesale in `_goToStageIntro()` (i.e. once per
   stage) — finalized entries accumulate in it for the rest of the stage but are skipped
   (`if (chain.finalized) continue`) every frame, so this is a small, stage-scoped memory growth,
   not a leak across the session.

#### Enemy spawning (`_spawnWave`)

- Wave size: `clamp(round(row.cardinality * 0.55 * countMult), 3, 36)` — so a stage's
  `cardinality` value (2–24 in the data) directly sets its baseline enemy density, further scaled
  by the global difficulty curve.
- Each enemy spawns at a random point on the arena's boundary circle and is aimed at a point
  randomly offset (±25% of arena radius) from the player's *current* position at spawn time — not
  homing/re-targeting afterward, so a fast-moving player can dodge a wave that was aimed at where
  they used to be.
- Enemies that drift past `arenaR * 1.6` from center (missed the player, kept going) are silently
  culled the following frame — no penalty, no despawn effect.

#### Player movement, collision, invulnerability

- The player's rendered position eases toward a `(tx, ty)` target (set on mousemove/touchmove,
  clamped to the canvas rect) at a fixed rate (`dt * 14`, clamped to 1) — not an instant snap, so
  movement has a small, consistent amount of lag/smoothing regardless of frame rate.
- Player hit radius (5px) is deliberately smaller than its visual radius (9px) — a small amount of
  forgiveness baked into the hitbox vs. what's drawn.
- On taking a hit, the player gets 1.1s of invulnerability (`INVULNERABLE_TIME`) rendered as a fast
  sine-wave alpha flicker, and the screen gets a brief shake (decaying over ~0.23s at the
  `shake -= dt*1.5` rate from an initial 0.35). Only one life can be lost per enemy-contact event
  because the colliding enemy is immediately marked `!alive` and the loop `continue`s.

#### Rendering (`_render`)

Single 2D canvas, devicePixelRatio-aware (capped at 2× to bound cost on very high-DPI screens),
resized on every window `resize` event. Draw order per frame: screen-shake transform → clear →
radial ambient-tint gradient (from `palette.tertiary`) → twinkling starfield (140 pre-seeded stars,
sine-wave alpha) → dashed arena boundary circle → explosions (stroke + radial-gradient fill,
fading) → particles → enemies (small rotating 4-pointed stars) → player (glowing circle + ring),
with invulnerability flicker applied last so it only affects the player draw. `_withAlpha(hex,
alpha)` is a tiny hex→`rgba()` helper used everywhere a palette color needs a specific opacity;
it assumes well-formed 6-digit hex input (true for every value in `COLOR_MAP`, including `ANY`).

### 3.6 Audio engine (`audio.js`)

A fully procedural, sample-free industrial-techno sequencer built directly on the Web Audio API —
no `<audio>` elements, no fetched sound files. Structure:

- **Graph**: two buses feed a shared `masterFilter` (lowpass, the "brightness" knob) →
  `compressor` → `masterGain` → destination. `dryBus` carries percussion/bass directly;
  `reverbSend` (a `ConvolverNode` fed a synthetically generated impulse response, `_buildImpulse`)
  carries bass/lead/stabs/risers for spatial depth. `masterGain.gain` is what mute/unmute actually
  toggles (`setMuted`, smoothed with `setTargetAtTime`).
- **Scheduling**: a classic look-ahead scheduler (`_scheduler`, driven by `setInterval` every
  `lookaheadMs` = 25ms) that schedules audio events up to `scheduleAheadTime` (0.12s) ahead of
  `ctx.currentTime` using sample-accurate Web Audio timestamps — not `setInterval` timing directly,
  which avoids audio jitter from JS-thread scheduling imprecision. 16 steps per bar (16th notes);
  `stepDuration = 60 / bpm / 4`.
- **Per-stage configuration** (`setStage(row, stageIndex, loopCount)`): picks BPM
  (`clamp(126 + stageIndex*1.4 + loopCount*20, 126, 200)`), filter brightness
  (`clamp(3200 + stageIndex*70 + loopCount*1200, 3200, 13000)`), root note
  (`midiToFreq(33 + stageIndex % 12)` — rotates key every 12 stages), scale (`MOOD_SCALES[
  row.happiness]`, falling back to `MOOD_SCALES.DEFAULT`), bassline riff
  (`BASS_RIFFS[(stageIndex + loopCount*3) % BASS_RIFFS.length]`), and `intensity`
  (`clamp(1 + stageIndex*0.012 + loopCount*0.3, 1, 2.4)`, which gates extra snare hits, clang
  frequency, and open-hat accents at higher values). All of this mirrors `game.js`'s difficulty
  curve in spirit (stage index = gentle ramp, loop count = big jump) but with independently tuned
  constants — the two systems are not sharing a single "difficulty" value, which is worth knowing
  if the two ever need to be kept in sync deliberately.
- **Fixed patterns**: `KICK_PATTERN`/`SNARE_PATTERN`/`HAT_PATTERN` are constant 16-step arrays
  shared by every stage (only the riff/scale/tempo/brightness vary) — the "beat" is always the
  same industrial 4-on-the-floor-ish groove; only harmonic content and intensity accents change.
  `LEAD_FIGURE` is a fixed 4-note melodic shape played at 4 fixed slots per 32-step (2-bar) cycle.
- **Synthesis**: every voice (`_kick`, `_snare`, `_hat`, `_clang`, `_bass`, `_lead`) builds its own
  short-lived `OscillatorNode`/`BufferSourceNode` graph, scheduled to start/stop at a precise time
  and torn down by the Web Audio garbage collector once stopped (no manual node pooling/reuse).
  `_distortionCurve(amount)` results are cached per distinct `amount` value in a `Map`
  (`_distortionCache`) since building a 44,100-sample `Float32Array` per call would be wasteful for
  the handful of fixed amounts actually used (40 for bass, 60 for stabs).
- **Reactive one-shots**: `stab(freq)` (detonation/chain hit), `riser(duration)` (stage
  clear/extend), and `pulseEnergy(strength)` (briefly ramps `masterFilter.frequency` up then back
  down — an audible "punch" whose size scales with how big the triggering event was) are called
  directly from `game.js` at the moments described in §3.5, not scheduled through the step
  sequencer — they layer on top of whatever the sequencer is currently playing.

### 3.7 HTML/CSS structure

- `index.html` is a single page with one `<canvas id="arena">` and a `#hud` overlay
  (score/stage/lives chips, timer bar, `#chain-popup`, `#stage-banner`) plus three mutually
  exclusive `.overlay` sections toggled via a `.hidden` class: `#title-screen`, `#stage-card`,
  `#game-over`. There is no client-side router or templating — `main.js` directly
  adds/removes `.hidden` on the relevant section.
- `styles.css` is one file, custom-property-based theming (`--bg`, `--ink`, `--muted`, `--accent`,
  `--panel`, `--line` on `:root`), no preprocessor, one `@media (max-width: 480px)` breakpoint
  (stacks the stage-card's label/value rows vertically on narrow screens). `#hud` and its
  in-flow children (`#hud-top`, `#timer-track`, `#stage-banner`) use normal flex-column layout;
  `#chain-popup` is the one HUD child that's deliberately absolutely-positioned (it needs to sit
  centered over the arena regardless of HUD chip height).
- Fonts: Google Fonts `Metal Mania` (display/titles) and `Oswald` (UI text), loaded via
  `<link>`/`@import`-style `<link rel="stylesheet">`, not self-hosted.

### 3.8 Tests

`web/js/theme.test.js` and `web/js/data-consistency.test.js` use Node's built-in `node:test` and
`node:assert/strict` — no test framework dependency. `data-consistency.test.js` additionally uses
the built-in (experimental as of Node 22–24) `node:sqlite` module to read `gothstronomy.db`
directly, read-only, with no other dependency. Run both with:

```
node --test web/js/*.test.js
```

`game.js`, `audio.js`'s scheduling/synthesis, `db.js`, `main.js`, and `storage.js` are currently
**untested** — they either require a DOM/Canvas/Web Audio environment or are effectful/stateful in
ways that would need refactoring (dependency injection, extracting pure helpers) to test cheaply.
See the improvement backlog for specifics on what's testable without a larger refactor.

## 4. Known constraints / non-obvious behavior

- The game must be served over `http(s)://`, not opened as `file://` — `fetch()` of
  `gothstronomy.db` is blocked by the browser's CORS policy for local files. `main.js` detects this
  failure and disables Start with an explanatory message rather than leaving the page silently
  inert.
- The game never truly "ends" on success — surviving is the only fail state; the 88 stages loop
  forever with escalating difficulty (see §3.5). There's no win screen.
- `_difficulty()`'s four multipliers and `IndustrialAudioEngine.setStage()`'s tempo/brightness/
  intensity formulas are two independently-tuned systems that happen to share the same
  `(stageIndex, loopCount)` inputs — changing one does not automatically keep the other in sync.
