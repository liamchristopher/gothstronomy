// Storage's localStorage calls fail silently (caught internally) when no
// global localStorage exists, so it's directly testable in plain Node
// without a DOM/browser mock -- each test just starts from a fresh
// in-memory { score: 0, stage: 0 }.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Storage } from "./storage.js";

test("first run always sets both bests", () => {
  const s = new Storage();
  const r = s.recordRun(100, 5);
  assert.equal(r.isNewBestScore, true);
  assert.equal(r.isNewBestStage, true);
  assert.deepEqual(r.best, { score: 100, stage: 5 });
});

test("a lower score and lower stage set neither flag", () => {
  const s = new Storage();
  s.recordRun(100, 5);
  const r = s.recordRun(50, 3);
  assert.equal(r.isNewBestScore, false);
  assert.equal(r.isNewBestStage, false);
  assert.deepEqual(r.best, { score: 100, stage: 5 });
});

test("a new best stage without a new best score is tracked independently", () => {
  const s = new Storage();
  s.recordRun(100, 5);
  const r = s.recordRun(50, 8);
  assert.equal(r.isNewBestScore, false);
  assert.equal(r.isNewBestStage, true);
  assert.deepEqual(r.best, { score: 100, stage: 8 });
});

test("a new best score without a new best stage is tracked independently", () => {
  const s = new Storage();
  s.recordRun(100, 5);
  const r = s.recordRun(150, 2);
  assert.equal(r.isNewBestScore, true);
  assert.equal(r.isNewBestStage, false);
  assert.deepEqual(r.best, { score: 150, stage: 5 });
});

test("bestScore/bestStage getters reflect recorded runs", () => {
  const s = new Storage();
  s.recordRun(42, 7);
  assert.equal(s.bestScore, 42);
  assert.equal(s.bestStage, 7);
});
