// A small, fully procedural industrial-techno engine built on the raw
// Web Audio API. No samples, no external audio files -- every kick, hat,
// snare and bass stab is synthesized, so tempo and intensity can track the
// game's escalating difficulty stage by stage.

const PATTERN = {
  kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  hat:   [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  bass:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
};
const BASS_NOTES = [55, 55, 61.74, 49]; // A1, A1, B1, G1 -- grim little riff

export class IndustrialAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = true;
    this.bpm = 132;
    this.stepDuration = 0;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.lookaheadMs = 25;
    this.scheduleAheadTime = 0.12;
    this.timerId = null;
    this._distortionCache = new Map();
  }

  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.5;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this.stepDuration = 60 / this.bpm / 4; // 16th notes
  }

  start(bpm = 132) {
    this.ensureContext();
    this.setBpm(bpm);
    this.stepIndex = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this._scheduler(), this.lookaheadMs);
  }

  stop() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  _scheduler() {
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this._scheduleStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
  }

  _scheduleStep(step, time) {
    if (PATTERN.kick[step]) this._kick(time);
    if (PATTERN.snare[step]) this._snare(time);
    if (PATTERN.hat[step]) this._hat(time);
    if (PATTERN.bass[step]) this._bass(time, step);
  }

  _distortionCurve(amount) {
    if (this._distortionCache.has(amount)) return this._distortionCache.get(amount);
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    this._distortionCache.set(amount, curve);
    return curve;
  }

  _noiseBuffer(seconds = 0.3) {
    const size = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _kick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.26);
    osc.connect(gain).connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  _snare(time) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.18);
  }

  _hat(time) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  _bass(time, step) {
    const freq = BASS_NOTES[(step >> 2) % BASS_NOTES.length];
    const osc = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._distortionCurve(40);
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDuration * 1.8);
    osc.connect(shaper).connect(gain).connect(this.masterGain);
    osc.start(time);
    osc.stop(time + this.stepDuration * 2);
  }

  /** A short distorted stab, used to punctuate chain explosions. */
  stab(freq = 220) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._distortionCurve(60);
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(shaper).connect(gain).connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  /** A brief riser noise sweep for stage transitions / extends. */
  riser(duration = 0.6) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(duration);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(300, time);
    filter.frequency.exponentialRampToValueAtTime(6000, time + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.35, time + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(time);
    noise.stop(time + duration + 0.05);
  }
}
