// Game requires a real <canvas>/DOM to construct, so this exercises just
// _loop's error-handling behavior via Function.prototype.call on a minimal
// fake `this`, rather than constructing a full Game instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "./game.js";

function fakeGame(overrides) {
  return {
    lastTs: 0,
    state: "playing",
    _update() {},
    _render() {},
    _boundLoop: () => {},
    ui: { showFatalError() {} },
    ...overrides,
  };
}

test("_loop reschedules itself on a normal frame", () => {
  global.window = { requestAnimationFrame: () => {} };
  let scheduled = 0;
  global.requestAnimationFrame = () => { scheduled += 1; };
  const fake = fakeGame();
  Game.prototype._loop.call(fake, 16);
  assert.equal(scheduled, 1);
});

test("_loop surfaces an error via ui.showFatalError and does not reschedule", () => {
  let scheduled = 0;
  global.requestAnimationFrame = () => { scheduled += 1; };
  let shown = null;
  const fake = fakeGame({
    _render() { throw new Error("boom"); },
    ui: { showFatalError(msg) { shown = msg; } },
  });
  Game.prototype._loop.call(fake, 16);
  assert.equal(shown, "boom");
  assert.equal(scheduled, 0);
});
