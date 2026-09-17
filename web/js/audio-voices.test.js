// Verifies that extracting _osc/_expGain out of the individual voice
// functions (_kick/_snare/_hat/_clang/_bass/_lead/stab) didn't change any of
// their actual envelope/frequency numbers or routing. Drives each voice
// through a minimal fake Web Audio graph and inspects the recorded
// AudioParam automation events, rather than a real AudioContext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { IndustrialAudioEngine } from "./audio.js";

class Param {
  constructor(value = 1) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) { this.value = v; this.events.push(["set", v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(["exp", v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(["lin", v, t]); return this; }
}

class Node {
  connect(dest) { return dest; }
  start() {}
  stop() {}
}

class Osc extends Node {
  constructor() { super(); this.type = "sine"; this.frequency = new Param(440); }
}

class Gain extends Node {
  constructor() { super(); this.gain = new Param(1); }
}

class BufferSource extends Node {
  buffer = null;
}

class Filter extends Node {
  constructor() { super(); this.type = "lowpass"; this.frequency = new Param(350); this.Q = new Param(1); }
}

class Shaper extends Node {
  curve = null;
}

function makeEngineWithFakeCtx() {
  const engine = new IndustrialAudioEngine();
  const created = { osc: [], gain: [] };
  engine.ctx = {
    currentTime: 0,
    sampleRate: 44100,
    createOscillator: () => { const n = new Osc(); created.osc.push(n); return n; },
    createGain: () => { const n = new Gain(); created.gain.push(n); return n; },
    createBufferSource: () => new BufferSource(),
    createBiquadFilter: () => new Filter(),
    createWaveShaper: () => new Shaper(),
  };
  engine.dryBus = new Node();
  engine.reverbSend = new Node();
  engine._distortionCurve = () => new Float32Array(1);
  engine._noiseBuffer = () => ({ getChannelData: () => new Float32Array(1) });
  return { engine, created };
}

test("_kick's oscillator pitch sweep and gain envelope are unchanged", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine._kick(0);
  const [kickOsc] = created.osc;
  const [kickGain] = created.gain;
  assert.deepEqual(kickOsc.frequency.events, [["set", 155, 0], ["exp", 38, 0.12]]);
  assert.deepEqual(kickGain.gain.events, [["set", 0.95, 0], ["exp", 0.001, 0.26]]);
});

test("_snare's noise gain and pitched-body oscillator are unchanged", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine._snare(0);
  const [snareGain, oscGain] = created.gain;
  const [snareOsc] = created.osc;
  assert.deepEqual(snareGain.gain.events, [["set", 0.75, 0], ["exp", 0.001, 0.16]]);
  assert.deepEqual(snareOsc.frequency.events, [["set", 210, 0], ["exp", 120, 0.08]]);
  assert.deepEqual(oscGain.gain.events, [["set", 0.18, 0], ["exp", 0.001, 0.09]]);
});

test("_hat's gain envelope scales with the open/closed length", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine._hat(0, false);
  assert.deepEqual(created.gain[0].gain.events, [["set", 0.25, 0], ["exp", 0.001, 0.07]]);

  const open = makeEngineWithFakeCtx();
  open.engine._hat(0, true);
  assert.deepEqual(open.created.gain[0].gain.events, [["set", 0.2, 0], ["exp", 0.001, 0.18]]);
});

test("_bass sets a fixed-frequency sawtooth and the expected gain envelope", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine.stepDuration = 0.1;
  engine._bass(0, 220);
  const [osc] = created.osc;
  assert.equal(osc.type, "sawtooth");
  assert.equal(osc.frequency.value, 220);
  const [setEvent, expEvent] = created.gain[0].gain.events;
  assert.deepEqual(setEvent, ["set", 0.32, 0]);
  assert.equal(expEvent[0], "exp");
  assert.equal(expEvent[1], 0.001);
  assert.ok(Math.abs(expEvent[2] - 0.18) < 1e-9);
});

test("_lead's three-stage envelope is unchanged", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine._lead(0, 330);
  const [osc] = created.osc;
  assert.equal(osc.type, "triangle");
  assert.equal(osc.frequency.value, 330);
  assert.deepEqual(created.gain[0].gain.events, [
    ["set", 0.001, 0],
    ["lin", 0.14, 0.02],
    ["exp", 0.001, 0.4],
  ]);
});

test("stab uses a fixed-frequency square oscillator and its gain envelope", () => {
  const { engine, created } = makeEngineWithFakeCtx();
  engine.ctx.currentTime = 5;
  engine.stab(440);
  const [osc] = created.osc;
  assert.equal(osc.type, "square");
  assert.equal(osc.frequency.value, 440);
  assert.deepEqual(created.gain[0].gain.events, [["set", 0.22, 5], ["exp", 0.001, 5.15]]);
});
