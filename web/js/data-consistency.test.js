// Guards against a real class of silent bug: if gothstronomy_detailed.db
// (the database the game actually loads, see db.js) ever gains a `colors`
// or `happiness` value that isn't in these lookup tables, the game doesn't
// error -- it quietly falls back to a generic color/scale. This test makes
// that drift fail loudly instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COLOR_MAP } from "./theme.js";
import { MOOD_SCALES } from "./audio.js";

const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "gothstronomy_detailed.db");

function loadRows() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db.prepare("SELECT colors, happiness FROM constellations").all();
  } finally {
    db.close();
  }
}

test("every color in gothstronomy_detailed.db has a COLOR_MAP entry", () => {
  const unmapped = new Set();
  for (const row of loadRows()) {
    for (const name of row.colors.split(",").map((s) => s.trim())) {
      if (!(name in COLOR_MAP)) unmapped.add(name);
    }
  }
  assert.deepEqual([...unmapped], []);
});

test("every mood in gothstronomy_detailed.db has a MOOD_SCALES entry", () => {
  const unmapped = new Set();
  for (const row of loadRows()) {
    if (!(row.happiness in MOOD_SCALES)) unmapped.add(row.happiness);
  }
  assert.deepEqual([...unmapped], []);
});
