import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveColor, paletteFor, COLOR_MAP } from "./theme.js";

test("resolveColor returns the mapped hex for a known name", () => {
  assert.equal(resolveColor("Blood Red"), "#a4102a");
});

test("resolveColor falls back to ANY for an unrecognized name", () => {
  assert.equal(resolveColor("Not A Real Color"), COLOR_MAP.ANY);
});

test("paletteFor reuses the first color when the list is short", () => {
  const pal = paletteFor(["Blood Red"]);
  assert.equal(pal.primary, COLOR_MAP["Blood Red"]);
  assert.equal(pal.secondary, COLOR_MAP["Blood Red"]);
  assert.equal(pal.tertiary, COLOR_MAP["Blood Red"]);
});

test("paletteFor takes up to three colors in order", () => {
  const pal = paletteFor(["Blood Red", "Iron Grey", "Black"]);
  assert.equal(pal.primary, COLOR_MAP["Blood Red"]);
  assert.equal(pal.secondary, COLOR_MAP["Iron Grey"]);
  assert.equal(pal.tertiary, COLOR_MAP["Black"]);
});
