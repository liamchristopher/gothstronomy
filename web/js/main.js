import { loadConstellations } from "./db.js";
import { IndustrialAudioEngine } from "./audio.js";
import { Storage } from "./storage.js";
import { Game } from "./game.js";

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $("arena"),
  scoreVal: $("score-val"),
  stageVal: $("stage-val"),
  livesVal: $("lives-val"),
  timerFill: $("timer-fill"),
  chainPopup: $("chain-popup"),
  stageBanner: $("stage-banner"),
  titleScreen: $("title-screen"),
  startBtn: $("start-btn"),
  bestScore: $("best-score"),
  bestStage: $("best-stage"),
  loadStatus: $("load-status"),
  stageCard: $("stage-card"),
  cardSeason: $("card-season"),
  cardName: $("card-name"),
  cardTitle: $("card-title"),
  cardHappiness: $("card-happiness"),
  cardTarot: $("card-tarot"),
  cardAstro: $("card-astro"),
  cardCardinality: $("card-cardinality"),
  stageBeginBtn: $("stage-begin-btn"),
  gameOver: $("game-over"),
  finalScore: $("final-score"),
  finalStage: $("final-stage"),
  newBest: $("new-best"),
  restartBtn: $("restart-btn"),
  muteBtn: $("mute-btn"),
};

const audio = new IndustrialAudioEngine();
const storage = new Storage();

const ui = {
  updateHud({ score, lives, stage }) {
    els.scoreVal.textContent = score.toLocaleString();
    els.stageVal.textContent = stage;
    els.livesVal.textContent = "●".repeat(Math.max(0, lives)) + "○".repeat(Math.max(0, 3 - lives));
  },
  updateTimer(frac) {
    els.timerFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  },
  setStageBanner(text) {
    els.stageBanner.textContent = text;
  },
  popChain(text) {
    els.chainPopup.textContent = text;
    els.chainPopup.classList.remove("show");
    // force reflow so the animation restarts on repeated triggers
    void els.chainPopup.offsetWidth;
    els.chainPopup.classList.add("show");
  },
  showStageCard(row, stageIndex, loopCount) {
    els.cardSeason.textContent = `${row.season}${loopCount > 0 ? ` · loop ${loopCount + 1}` : ""}`;
    els.cardName.textContent = row.name;
    els.cardTitle.textContent = `"${row.goth_title}"`;
    els.cardHappiness.textContent = row.happiness;
    els.cardTarot.textContent = row.tarot_mapping;
    els.cardAstro.textContent = row.astrological_mapping;
    els.cardCardinality.textContent = row.cardinality;
    els.stageCard.classList.remove("hidden");
  },
  hideStageCard() {
    els.stageCard.classList.add("hidden");
  },
  showGameOver(score, stage, isNewBest) {
    els.finalScore.textContent = `Score: ${score.toLocaleString()}`;
    els.finalStage.textContent = `Reached stage ${stage}`;
    els.newBest.classList.toggle("hidden", !isNewBest);
    els.gameOver.classList.remove("hidden");
  },
  hideGameOver() {
    els.gameOver.classList.add("hidden");
  },
};

let game = null;
let muted = true;

function refreshBestDisplay() {
  els.bestScore.textContent = storage.bestScore.toLocaleString();
  els.bestStage.textContent = storage.bestStage;
}

function setMuted(next) {
  muted = next;
  audio.setMuted(muted);
  els.muteBtn.textContent = muted ? "🔇" : "🔊";
}

async function boot() {
  refreshBestDisplay();
  setMuted(true);

  let stages;
  try {
    stages = await loadConstellations("../gothstronomy.db");
    els.loadStatus.textContent = `${stages.length} skies charted.`;
  } catch (err) {
    console.error(err);
    els.loadStatus.textContent =
      "Could not load gothstronomy.db. Serve this project over http:// (e.g. `python3 -m http.server` from the repo root) rather than opening the file directly.";
    els.startBtn.disabled = true;
    return;
  }

  game = new Game({ canvas: els.canvas, stages, audio, ui, storage });

  els.startBtn.addEventListener("click", () => {
    setMuted(false);
    els.titleScreen.classList.add("hidden");
    game.start();
  });

  els.stageBeginBtn.addEventListener("click", () => {
    game.beginStagePlay();
  });

  els.restartBtn.addEventListener("click", () => {
    refreshBestDisplay();
    els.gameOver.classList.add("hidden");
    game.start();
  });

  els.muteBtn.addEventListener("click", () => setMuted(!muted));
}

boot();
