// A fully procedural industrial-techno engine built on the raw Web Audio
// API. No samples, no external audio files -- every kick, snare, hat,
// clang, bassline and lead figure is synthesized, and both the harmonic
// content and the mix react to the game: each stage's mood picks a scale,
// each stage's index rotates the key and raises the master brightness, and
// detonations/chains punch the filter open in real time.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// Each constellation's `happiness` mood picks a 5-note scale (semitone
// offsets from the stage root) so the bassline's character shifts with the
// stage's attitude -- tense/dissonant moods lean on b2/tritone intervals,
// heavier grief moods sit in natural minor, prouder moods (Vanity) get a
// major 6/maj7 flavor. Covers every mood value present in gothstronomy.db.
export const MOOD_SCALES = {
  Wrath: [0, 1, 4, 6, 7],
  Despair: [0, 2, 3, 7, 8],
  Dread: [0, 1, 3, 6, 7],
  Grief: [0, 2, 3, 5, 7],
  Sorrow: [0, 2, 3, 5, 7],
  Torment: [0, 1, 4, 6, 7],
  Longing: [0, 3, 5, 7, 9],
  Melancholy: [0, 2, 3, 7, 9],
  Ennui: [0, 2, 5, 7, 9],
  Isolation: [0, 3, 5, 6, 10],
  Numbness: [0, 5, 6, 7, 10],
  Vanity: [0, 4, 7, 9, 11],
  Resignation: [0, 2, 3, 5, 7],
  Regret: [0, 1, 3, 5, 8],
  Bitterness: [0, 3, 4, 7, 10],
  "Grim Resolve": [0, 3, 5, 7, 8],
  Anguish: [0, 1, 3, 7, 8],
  DEFAULT: [0, 3, 5, 7, 10],
};

// Bassline riffs as 16th-note grids; each entry is either null (rest) or a
// scale-degree index (can exceed the scale length -- degrees wrap with
// octave transposition). Which riff plays rotates with the stage.
const BASS_RIFFS = [
  [0, null, 0, null, null, null, 2, null, 0, null, 0, null, null, 3, null, null],
  [0, null, null, 3, null, null, 0, null, 2, null, null, 0, null, null, 4, null],
  [0, 0, null, null, 2, null, 0, null, 0, 0, null, null, 3, null, 0, null],
  [0, null, 4, null, 0, null, 2, null, 0, null, 4, null, 0, null, 2, null],
  [0, null, null, 0, 2, null, null, 0, 3, null, null, 0, 2, null, null, 0],
  [0, null, 2, null, 3, null, 2, null, 0, null, 2, null, 3, null, 4, null],
];

const LEAD_FIGURE = [2, 4, 3, 5];

const KICK_PATTERN = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE_PATTERN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const HAT_PATTERN = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1];

export class IndustrialAudioEngine {
  constructor() {
    this.ctx = null;
    this.unsupported = false;
    this.muted = true;
    this.bpm = 132;
    this.stepDuration = 0;
    this.stepIndex = 0;
    this.absoluteStep = 0;
    this.nextStepTime = 0;
    this.lookaheadMs = 25;
    this.scheduleAheadTime = 0.12;
    this.timerId = null;
    this._distortionCache = new Map();

    this.rootFreq = midiToFreq(33);
    this.scale = MOOD_SCALES.DEFAULT;
    this.riffPattern = BASS_RIFFS[0];
    this.intensity = 1;
    this.filterBase = 3200;
  }

  // ---- graph setup ----------------------------------------------------

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    if (this.unsupported) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      // No Web Audio support in this browser -- the game stays fully
      // playable, just silent, instead of throwing here.
      this.unsupported = true;
      return;
    }
    this.ctx = new Ctx();

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = "lowpass";
    this.masterFilter.frequency.value = this.filterBase;
    this.masterFilter.Q.value = 0.7;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.55;

    this.masterFilter.connect(this.compressor).connect(this.masterGain).connect(this.ctx.destination);

    // dry bus (percussion + bass) and a reverb send (bass/lead/stabs/risers)
    // that both land in the shared master filter.
    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryBus.connect(this.masterFilter);

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.4;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this._buildImpulse();
    this.reverbSend.connect(this.convolver).connect(this.masterFilter);
  }

  _buildImpulse(duration = 1.6, decay = 3.4) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  setBpm(bpm) {
    this.bpm = bpm;
    this.stepDuration = 60 / this.bpm / 4; // 16th notes
  }

  /** Configure key, scale, riff and brightness for the stage about to play,
   *  then (re)start the scheduler at that stage's tempo. */
  setStage(row, stageIndex, loopCount) {
    this.ensureContext();
    const bpm = clamp(126 + stageIndex * 1.4 + loopCount * 20, 126, 200);
    this.filterBase = clamp(3200 + stageIndex * 70 + loopCount * 1200, 3200, 13000);
    this.rootFreq = midiToFreq(33 + (stageIndex % 12));
    this.scale = MOOD_SCALES[row?.happiness] || MOOD_SCALES.DEFAULT;
    this.riffPattern = BASS_RIFFS[(stageIndex + loopCount * 3) % BASS_RIFFS.length];
    this.intensity = clamp(1 + stageIndex * 0.012 + loopCount * 0.3, 1, 2.4);
    if (this.masterFilter) {
      this.masterFilter.frequency.setTargetAtTime(this.filterBase, this.ctx.currentTime, 0.5);
    }
    this.start(bpm);
  }

  start(bpm = 132) {
    this.ensureContext();
    if (!this.ctx) return;
    this.setBpm(bpm);
    this.stepIndex = 0;
    this.absoluteStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this._scheduler(), this.lookaheadMs);
  }

  stop() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  // ---- scheduling -------------------------------------------------------

  _scheduler() {
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this._scheduleStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.stepIndex = (this.stepIndex + 1) % 16;
      this.absoluteStep += 1;
    }
  }

  _degreeToFreq(degree, octaveOffset = 0) {
    const len = this.scale.length;
    const octave = Math.floor(degree / len) + octaveOffset;
    const semis = this.scale[((degree % len) + len) % len] + octave * 12;
    return this.rootFreq * Math.pow(2, semis / 12);
  }

  _scheduleStep(step, time) {
    if (KICK_PATTERN[step]) this._kick(time);
    if (SNARE_PATTERN[step] || (this.intensity > 1.6 && step === 10)) this._snare(time);
    if (HAT_PATTERN[step]) this._hat(time, step % 4 === 2 && this.intensity > 1.3);

    const degree = this.riffPattern[step];
    if (degree !== null && degree !== undefined) {
      this._bass(time, this._degreeToFreq(degree));
    }

    // occasional metallic clang for texture, more frequent as things escalate
    if (step === 3 && Math.random() < 0.15 * this.intensity) this._clang(time);

    // sparse lead figure, once every other bar
    const barStep = this.absoluteStep % 32;
    const leadSlot = [0, 6, 16, 22].indexOf(barStep);
    if (leadSlot !== -1) {
      this._lead(time, this._degreeToFreq(LEAD_FIGURE[leadSlot % LEAD_FIGURE.length], 1));
    }
  }

  // ---- percussion ---------------------------------------------------------

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
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    gain.gain.setValueAtTime(0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.26);
    osc.connect(gain).connect(this.dryBus);
    osc.start(time);
    osc.stop(time + 0.3);

    // transient click for punch
    const click = this.ctx.createBufferSource();
    click.buffer = this._noiseBuffer(0.02);
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 3500;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.4, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    click.connect(clickFilter).connect(clickGain).connect(this.dryBus);
    click.start(time);
    click.stop(time + 0.03);
  }

  _snare(time) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.75, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    noise.connect(filter).connect(gain).connect(this.dryBus);
    noise.start(time);
    noise.stop(time + 0.18);

    // a short pitched body under the noise, for an industrial "clang-snare"
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(210, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    oscGain.gain.setValueAtTime(0.18, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    osc.connect(oscGain).connect(this.dryBus);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  _hat(time, open) {
    const noise = this.ctx.createBufferSource();
    const len = open ? 0.18 : 0.07;
    noise.buffer = this._noiseBuffer(len);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(open ? 0.2 : 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + len);
    noise.connect(filter).connect(gain).connect(this.dryBus);
    noise.start(time);
    noise.stop(time + len + 0.01);
  }

  _clang(time) {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 + Math.random() * 1400;
    filter.Q.value = 6;
    filter.connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.reverbSend);
    // a small cluster of detuned square oscillators reads as metal, not tone
    [1, 1.48, 2.37].forEach((ratio) => {
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = filter.frequency.value * ratio;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + 0.5);
    });
  }

  // ---- melodic layers -----------------------------------------------------

  _bass(time, freq) {
    const osc = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._distortionCurve(40);
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDuration * 1.8);
    osc.connect(shaper).connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.reverbSend);
    osc.start(time);
    osc.stop(time + this.stepDuration * 2);
  }

  _lead(time, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.14, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.reverbSend);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  /** A short distorted stab, used to punctuate detonations and chains. */
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
    osc.connect(shaper).connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.reverbSend);
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
    noise.connect(filter).connect(gain);
    gain.connect(this.dryBus);
    gain.connect(this.reverbSend);
    noise.start(time);
    noise.stop(time + duration + 0.05);

    // a rising drone underneath the noise sweep, for weight
    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = "sawtooth";
    drone.frequency.setValueAtTime(this.rootFreq, time);
    drone.frequency.exponentialRampToValueAtTime(this.rootFreq * 4, time + duration);
    droneGain.gain.setValueAtTime(0.0001, time);
    droneGain.gain.exponentialRampToValueAtTime(0.12, time + duration * 0.85);
    droneGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    drone.connect(droneGain).connect(this.reverbSend);
    drone.start(time);
    drone.stop(time + duration + 0.05);
  }

  /** Briefly opens the master filter, giving detonations/chains an audible
   *  "punch" reactive to how big the hit was. strength in [0, 1]. */
  pulseEnergy(strength = 0.3) {
    if (!this.ctx || !this.masterFilter) return;
    const now = this.ctx.currentTime;
    const amt = clamp(strength, 0, 1);
    const base = this.filterBase;
    const peak = clamp(base + 7000 * amt, base, 17000);
    this.masterFilter.frequency.cancelScheduledValues(now);
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.value, now);
    this.masterFilter.frequency.linearRampToValueAtTime(peak, now + 0.03);
    this.masterFilter.frequency.exponentialRampToValueAtTime(Math.max(base, 200), now + 0.4);
  }
}
