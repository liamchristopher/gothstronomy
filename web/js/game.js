import { paletteFor } from "./theme.js";
import { clamp, easeOutCubic, dist, difficultyFor, EXTEND_THRESHOLD, chainBonus } from "./difficulty.js";

// ---- Tunables --------------------------------------------------------

const PLAYER_VISUAL_R = 9;
const PLAYER_HIT_R = 5;
const ENEMY_VISUAL_R = 8;
const ENEMY_HIT_R = 7;
const DETONATION_COOLDOWN = 0.45; // s
const DETONATION_GROW_TIME = 0.3; // s
const DETONATION_BASE_MAX_R = 100; // px, scaled by arena size
const CHAIN_PROPAGATION_DELAY = 0.09; // s
const CHAIN_GENERATION_SHRINK = 0.88;
const CHAIN_MIN_MAX_R = 34;
const CHAIN_FINALIZE_GRACE = 0.4; // s
const EXTEND_BONUS_TIME = 3; // s
const STAGE_BASE_DURATION = 18; // s
const LIVES_START = 3;
const INVULNERABLE_TIME = 1.1; // s
const FADE_TIME = 0.35; // s, explosion ring fade after full growth

export class Game {
  constructor({ canvas, stages, audio, ui, storage }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.stages = stages; // array of 88 rows from db.js
    this.audio = audio;
    this.ui = ui;
    this.storage = storage;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.arenaCx = 0;
    this.arenaCy = 0;
    this.arenaR = 0;

    this.state = "idle"; // idle | intro | playing | gameover
    this.stageIndex = 0;
    this.loopCount = 0;
    this.score = 0;
    this.lives = LIVES_START;

    this.player = { x: 0, y: 0, tx: 0, ty: 0, invulnUntil: 0 };
    this.enemies = [];
    this.explosions = [];
    this.chains = new Map();
    this.chainCounter = 0;
    this.particles = [];
    this.stars = [];

    this.detonateReadyAt = 0;
    this.stageTimeLeft = STAGE_BASE_DURATION;
    this.stageDuration = STAGE_BASE_DURATION;
    this.spawnTimer = 0;
    this.shake = 0;

    this.lastTs = 0;
    this._boundLoop = this._loop.bind(this);

    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._bindInput();
    this._seedStars();
  }

  // ---- setup ----------------------------------------------------------

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.arenaCx = rect.width / 2;
    this.arenaCy = rect.height / 2;
    this.arenaR = Math.min(rect.width, rect.height) * 0.44;
    if (this.player.x === 0 && this.player.y === 0) {
      this.player.x = this.player.tx = this.arenaCx;
      this.player.y = this.player.ty = this.arenaCy;
    }
  }

  _seedStars() {
    this.stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
    }));
  }

  _bindInput() {
    const setTarget = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      this.player.tx = clamp(clientX - rect.left, 0, rect.width);
      this.player.ty = clamp(clientY - rect.top, 0, rect.height);
    };

    this.canvas.addEventListener("mousemove", (e) => setTarget(e.clientX, e.clientY));
    this.canvas.addEventListener("mousedown", (e) => {
      setTarget(e.clientX, e.clientY);
      this._tryDetonate();
    });
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      setTarget(t.clientX, t.clientY);
      this._tryDetonate();
    }, { passive: false });
    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      setTarget(t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && this.state === "playing") {
        e.preventDefault();
        this._tryDetonate();
      }
    });
  }

  // ---- difficulty -------------------------------------------------------

  _difficulty() {
    return difficultyFor(this.stageIndex, this.loopCount);
  }

  // ---- flow -------------------------------------------------------------

  start() {
    this.score = 0;
    this.lives = LIVES_START;
    this.stageIndex = 0;
    this.loopCount = 0;
    this._goToStageIntro();
    if (!this.lastTs) requestAnimationFrame(this._boundLoop);
  }

  _currentStageRow() {
    return this.stages[this.stageIndex % this.stages.length];
  }

  _goToStageIntro() {
    this.state = "intro";
    this.enemies = [];
    this.explosions = [];
    this.particles = [];
    this.chains.clear();
    const row = this._currentStageRow();
    this.ui.setStageBanner("");
    this.ui.showStageCard(row, this.stageIndex, this.loopCount);
    this.ui.updateHud({
      score: this.score,
      lives: this.lives,
      stage: this.stageIndex + 1 + this.loopCount * this.stages.length,
    });
  }

  beginStagePlay() {
    const row = this._currentStageRow();
    this.palette = paletteFor(row.colorList);
    this.ui.hideStageCard();
    this.state = "playing";
    this.stageDuration = STAGE_BASE_DURATION;
    this.stageTimeLeft = this.stageDuration;
    this.spawnTimer = 0.4;
    this.player.x = this.player.tx = this.arenaCx;
    this.player.y = this.player.ty = this.arenaCy;
    this.player.invulnUntil = 0;
    this.ui.setStageBanner(`${row.name} — "${row.goth_title}"`);

    this.audio.setStage(row, this.stageIndex, this.loopCount);
  }

  _tryDetonate() {
    if (this.state !== "playing") return;
    const now = performance.now() / 1000;
    if (now < this.detonateReadyAt) return;
    this.detonateReadyAt = now + DETONATION_COOLDOWN;
    this._spawnExplosion(this.player.x, this.player.y, DETONATION_BASE_MAX_R * (this.arenaR / 260 + 0.4), 0, ++this.chainCounter);
    this.audio.stab(220);
    this.audio.pulseEnergy(0.35);
  }

  _spawnExplosion(x, y, maxR, generation, chainId) {
    const now = performance.now() / 1000;
    this.explosions.push({
      x, y, maxR: Math.max(maxR, CHAIN_MIN_MAX_R),
      startTime: now, generation, chainId, hit: false,
    });
    if (!this.chains.has(chainId)) {
      this.chains.set(chainId, { count: 0, lastEventTime: now, finalized: false });
    }
  }

  _loseLife() {
    this.lives -= 1;
    this.shake = 0.35;
    this.player.invulnUntil = performance.now() / 1000 + INVULNERABLE_TIME;
    this.ui.updateHud({ score: this.score, lives: this.lives, stage: this.stageIndex + 1 + this.loopCount * this.stages.length });
    if (this.lives <= 0) {
      this._gameOver();
    }
  }

  _stageCleared() {
    this.audio.riser(0.5);
    this.stageIndex += 1;
    if (this.stageIndex >= this.stages.length) {
      this.stageIndex = 0;
      this.loopCount += 1;
    }
    this._goToStageIntro();
  }

  _gameOver() {
    this.state = "gameover";
    this.ui.setStageBanner("");
    this.audio.stop();
    const best = this.storage.recordRun(this.score, this.stageIndex + 1 + this.loopCount * this.stages.length);
    this.ui.showGameOver(this.score, this.stageIndex + 1 + this.loopCount * this.stages.length, best.isNewBest);
  }

  // ---- main loop ----------------------------------------------------------

  _loop(ts) {
    const dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, 0.05) : 0;
    this.lastTs = ts;
    if (this.state === "playing") this._update(dt);
    this._render(dt);
    requestAnimationFrame(this._boundLoop);
  }

  _update(dt) {
    const diff = this._difficulty();
    const now = performance.now() / 1000;

    // player easing toward pointer target
    this.player.x += (this.player.tx - this.player.x) * Math.min(1, dt * 14);
    this.player.y += (this.player.ty - this.player.y) * Math.min(1, dt * 14);

    // stage timer
    this.stageTimeLeft -= dt;
    this.ui.updateTimer(clamp(this.stageTimeLeft / this.stageDuration, 0, 1));
    if (this.stageTimeLeft <= 0) {
      this._stageCleared();
      return;
    }

    // spawn waves
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnWave(diff);
      this.spawnTimer = clamp(2.6 * diff.intervalMult, 0.55, 3.2);
    }

    // move + collide enemies against player
    for (const en of this.enemies) {
      if (!en.alive) continue;
      en.x += en.vx * dt;
      en.y += en.vy * dt;
      en.spin += dt * 3;

      const d = dist(en.x, en.y, this.player.x, this.player.y);
      if (d <= ENEMY_HIT_R + PLAYER_HIT_R && now >= this.player.invulnUntil) {
        en.alive = false;
        this._loseLife();
        continue;
      }
      const centerDist = dist(en.x, en.y, this.arenaCx, this.arenaCy);
      if (centerDist > this.arenaR * 1.6) en.alive = false;
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // explosions: grow + collide + chain propagation
    const stillGrowing = [];
    for (const ex of this.explosions) {
      if (now < ex.startTime) { stillGrowing.push(ex); continue; }
      const t = clamp((now - ex.startTime) / DETONATION_GROW_TIME, 0, 1);
      const r = ex.maxR * easeOutCubic(t);
      ex._r = r;

      for (const en of this.enemies) {
        if (!en.alive || en.hitBy) continue;
        if (dist(en.x, en.y, ex.x, ex.y) <= r + ENEMY_HIT_R) {
          en.alive = false;
          en.hitBy = ex.chainId;
          const chain = this.chains.get(ex.chainId);
          chain.count += 1;
          chain.lastEventTime = now;
          this.score += Math.round(10 * diff.scoreMult);
          this._spawnParticleBurst(en.x, en.y, this.palette.secondary);
          this._spawnExplosion(
            en.x, en.y,
            ex.maxR * CHAIN_GENERATION_SHRINK,
            ex.generation + 1,
            ex.chainId
          );
          this.audio.stab(220 + ex.generation * 30);
          this.audio.pulseEnergy(0.12 + ex.generation * 0.04);
        }
      }

      if (t < 1 || now - (ex.startTime + DETONATION_GROW_TIME) < FADE_TIME) {
        stillGrowing.push(ex);
      }
    }
    this.explosions = stillGrowing;

    // finalize chains that have gone quiet
    for (const [chainId, chain] of this.chains) {
      if (chain.finalized) continue;
      const pending = this.explosions.some((ex) => ex.chainId === chainId);
      if (!pending && now - chain.lastEventTime > CHAIN_FINALIZE_GRACE) {
        chain.finalized = true;
        this._finalizeChain(chain, diff);
      }
    }

    // particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.5);

    this.ui.updateHud({ score: this.score, lives: this.lives, stage: this.stageIndex + 1 + this.loopCount * this.stages.length });
  }

  _finalizeChain(chain, diff) {
    if (chain.count <= 1) return;
    const bonus = chainBonus(chain.count, diff.scoreMult);
    this.score += bonus;
    if (chain.count >= EXTEND_THRESHOLD) {
      this.stageTimeLeft = Math.min(this.stageTimeLeft + EXTEND_BONUS_TIME, this.stageDuration * 1.6);
      this.ui.popChain(`EXTEND +${EXTEND_BONUS_TIME}s`);
      this.audio.riser(0.4);
      this.audio.pulseEnergy(0.6);
    } else {
      this.ui.popChain(`CHAIN x${chain.count}`);
      this.audio.pulseEnergy(clamp(chain.count * 0.08, 0, 0.5));
    }
  }

  _spawnParticleBurst(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.3 + Math.random() * 0.3, color,
      });
    }
  }

  _spawnWave(diff) {
    const row = this._currentStageRow();
    const count = clamp(Math.round(row.cardinality * 0.55 * diff.countMult), 3, 36);
    const speedBase = this.arenaR * 0.32 * diff.speedMult;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sx = this.arenaCx + Math.cos(angle) * this.arenaR;
      const sy = this.arenaCy + Math.sin(angle) * this.arenaR;
      const targetX = this.player.x + (Math.random() - 0.5) * this.arenaR * 0.5;
      const targetY = this.player.y + (Math.random() - 0.5) * this.arenaR * 0.5;
      const dx = targetX - sx;
      const dy = targetY - sy;
      const len = Math.hypot(dx, dy) || 1;
      const speed = speedBase * (0.85 + Math.random() * 0.3);
      this.enemies.push({
        x: sx, y: sy,
        vx: (dx / len) * speed, vy: (dy / len) * speed,
        alive: true, spin: Math.random() * Math.PI * 2, hitBy: null,
      });
    }
  }

  // ---- rendering ----------------------------------------------------------

  _render() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const pal = this.palette || { primary: "#a4102a", secondary: "#c9cad4", tertiary: "#332f36" };

    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake * 14, (Math.random() - 0.5) * this.shake * 14);
    }

    ctx.clearRect(-20, -20, w + 40, h + 40);

    // ambient tint
    const grad = ctx.createRadialGradient(this.arenaCx, this.arenaCy, 0, this.arenaCx, this.arenaCy, this.arenaR * 1.4);
    grad.addColorStop(0, this._withAlpha(pal.tertiary, 0.28));
    grad.addColorStop(1, "rgba(2,2,4,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // starfield
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    const t = performance.now() / 1000;
    for (const s of this.stars) {
      const alpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.tw));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // arena boundary
    ctx.beginPath();
    ctx.arc(this.arenaCx, this.arenaCy, this.arenaR, 0, Math.PI * 2);
    ctx.strokeStyle = this._withAlpha(pal.primary, 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // explosions
    for (const ex of this.explosions) {
      const r = ex._r ?? 0;
      if (r <= 0) continue;
      const age = t - (ex.startTime + DETONATION_GROW_TIME);
      const fade = age > 0 ? clamp(1 - age / FADE_TIME, 0, 1) : 1;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = this._withAlpha(pal.primary, 0.85 * fade);
      ctx.lineWidth = 3;
      ctx.stroke();
      const rg = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
      rg.addColorStop(0, this._withAlpha(pal.primary, 0.18 * fade));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fill();
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // enemies
    for (const en of this.enemies) {
      ctx.save();
      ctx.translate(en.x, en.y);
      ctx.rotate(en.spin);
      ctx.fillStyle = pal.secondary;
      ctx.shadowColor = pal.secondary;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        const rr = i % 2 === 0 ? ENEMY_VISUAL_R : ENEMY_VISUAL_R * 0.45;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // player
    const invuln = (performance.now() / 1000) < this.player.invulnUntil;
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.globalAlpha = invuln ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_VISUAL_R, 0, Math.PI * 2);
    ctx.fillStyle = "#f2eef5";
    ctx.shadowColor = pal.primary;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_VISUAL_R + 5, 0, Math.PI * 2);
    ctx.strokeStyle = this._withAlpha(pal.primary, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  _withAlpha(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
