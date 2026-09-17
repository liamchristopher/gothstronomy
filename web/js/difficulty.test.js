import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp, easeOutCubic, dist, difficultyFor, EXTEND_THRESHOLD, chainBonus } from "./difficulty.js";

test("clamp bounds a value into [lo, hi]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test("easeOutCubic starts at 0 and ends at 1", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
});

test("dist computes Euclidean distance", () => {
  assert.equal(dist(0, 0, 3, 4), 5);
});

test("difficultyFor is at its floor at stage 0, loop 0", () => {
  const d = difficultyFor(0, 0);
  assert.equal(d.speedMult, 1);
  assert.equal(d.countMult, 1);
  assert.equal(d.intervalMult, 1);
  assert.equal(d.scoreMult, 1);
});

test("difficultyFor's multipliers only increase with stageIndex and loopCount", () => {
  const base = difficultyFor(0, 0);
  const laterStage = difficultyFor(40, 0);
  const laterLoop = difficultyFor(0, 2);
  assert.ok(laterStage.speedMult >= base.speedMult);
  assert.ok(laterStage.countMult >= base.countMult);
  assert.ok(laterStage.scoreMult >= base.scoreMult);
  assert.ok(laterLoop.speedMult >= base.speedMult);
  assert.ok(laterLoop.scoreMult >= base.scoreMult);
});

test("one loop step escalates difficulty more than one stage step (per ARCHITECTURE.md's design intent)", () => {
  const base = difficultyFor(0, 0);
  const oneStage = difficultyFor(1, 0);
  const oneLoop = difficultyFor(0, 1);
  const stageStep = oneStage.speedMult - base.speedMult;
  const loopStep = oneLoop.speedMult - base.speedMult;
  assert.ok(loopStep > stageStep, "a single loopCount increment should outweigh a single stageIndex increment");
});

test("difficultyFor's clamped multipliers respect their documented ceilings/floors", () => {
  const extreme = difficultyFor(10000, 100);
  assert.equal(extreme.speedMult, 3.6);
  assert.equal(extreme.countMult, 4.5);
  assert.equal(extreme.intervalMult, 0.32);
});

test("chainBonus scales quadratically with chain count", () => {
  assert.equal(chainBonus(2, 1), Math.round(2 * 2 * 15));
  assert.equal(chainBonus(4, 1), 4 * chainBonus(2, 1));
});

test("EXTEND_THRESHOLD is a positive integer", () => {
  assert.ok(Number.isInteger(EXTEND_THRESHOLD) && EXTEND_THRESHOLD > 0);
});
