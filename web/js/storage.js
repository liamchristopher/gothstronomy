// Thin wrapper around localStorage for best-score / best-stage persistence.
const KEY = "gothstronomy:best";

export class Storage {
  constructor() {
    this.best = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { score: 0, stage: 0 };
      const parsed = JSON.parse(raw);
      return { score: parsed.score || 0, stage: parsed.stage || 0 };
    } catch {
      return { score: 0, stage: 0 };
    }
  }

  get bestScore() { return this.best.score; }
  get bestStage() { return this.best.stage; }

  recordRun(score, stage) {
    let isNewBest = false;
    if (score > this.best.score) {
      this.best.score = score;
      isNewBest = true;
    }
    if (stage > this.best.stage) this.best.stage = stage;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.best));
    } catch {
      // ignore write failures (private mode, quota, etc.)
    }
    return { isNewBest, best: this.best };
  }
}
