// Pure, DOM-free game-balance logic extracted from game.js so it can be
// unit-tested without a <canvas>/DOM environment. No behavior here should
// ever depend on anything but its arguments.

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// A full 88-stage loop (loopCount) ramps difficulty far more aggressively
// than progressing through a single loop's stages (stageIndex) -- gentle
// ramp within a loop, a hard jump at every full cycle. See ARCHITECTURE.md
// section 3.5 for the design intent.
export function difficultyFor(stageIndex, loopCount) {
  const s = stageIndex;
  const l = loopCount;
  return {
    speedMult: clamp(1 + s * 0.02 + l * 0.5, 1, 3.6),
    countMult: clamp(1 + s * 0.035 + l * 0.8, 1, 4.5),
    intervalMult: clamp(1 - s * 0.007 - l * 0.12, 0.32, 1),
    scoreMult: 1 + s * 0.06 + l * 1.2,
  };
}

// A chain finalizing at or above this many kills grants a stage-time
// extension instead of just a score popup (the "extend" mechanic).
export const EXTEND_THRESHOLD = 5;

export function chainBonus(count, scoreMult) {
  return Math.round(count * count * 15 * scoreMult);
}
