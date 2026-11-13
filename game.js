(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const overlayAction = document.getElementById("overlayAction");
  const nameForm = document.getElementById("nameForm");
  const playerNameInput = document.getElementById("playerName");
  const nameError = document.getElementById("nameError");
  const levelLabel = document.getElementById("levelLabel");
  const livesLabel = document.getElementById("livesLabel");
  const timeLabel = document.getElementById("timeLabel");
  const hint = document.getElementById("hint");
  const lightLabel = document.getElementById("lightLabel");
  const highScoreList = document.getElementById("highScoreList");
  const highScoreEmpty = document.getElementById("highScoreEmpty");
  const highScoreStatus = document.getElementById("highScoreStatus");
  const bulbs = [...document.querySelectorAll(".bulb")];

  const BASE_W = 800;
  const BASE_H = 500;
  const PADDING = 20;
  const PLAYER_SIZE = 24;
  const MOVE_STEP = 10;
  const MOVE_INTERVAL_MS = 55;
  const LEVEL_TIME_MS = 60_000;
  const MAX_LIVES = 10;
  const BASE_YELLOW_DURATION = 500;
  const MAX_HIGH_SCORES = 10;
  const HIGH_SCORE_API = "/.netlify/functions/highscores";
  // Optional `?lives=1` (1–10) for quick local demos; default remains 10.
  const livesParam = Number.parseInt(
    new URLSearchParams(location.search).get("lives") || "",
    10
  );
  const STARTING_LIVES =
    Number.isFinite(livesParam) && livesParam >= 1 && livesParam <= MAX_LIVES
      ? livesParam
      : MAX_LIVES;

  const LightState = Object.freeze({
    GREEN: "GREEN",
    YELLOW: "YELLOW",
    RED: "RED",
  });

  const LoseReason = Object.freeze({
    RED: "RED",
    TIMEOUT: "TIMEOUT",
  });

  const state = {
    width: BASE_W,
    height: BASE_H,
    playerX: PADDING,
    playerY: BASE_H / 2 - PLAYER_SIZE / 2,
    lightState: LightState.GREEN,
    gameOver: false,
    playerWon: false,
    loseReason: null,
    lives: STARTING_LIVES,
    needsFullRestart: false,
    startTimeMs: 0,
    endTimeMs: 0,
    remainingMs: LEVEL_TIME_MS,
    currentLevel: 1,
    highestLevelReached: 1,
    yellowDuration: BASE_YELLOW_DURATION,
    moving: false,
    lastMoveAt: 0,
    lightTimerId: 0,
    yellowTimerId: 0,
    highScores: [],
    awaitingName: false,
    pendingScoreLevel: 0,
    scoresOffline: false,
  };

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function getRemainingMs(now = performance.now()) {
    if (state.gameOver) {
      return Math.max(0, state.remainingMs);
    }
    return Math.max(0, LEVEL_TIME_MS - (now - state.startTimeMs));
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function clearTimers() {
    if (state.lightTimerId) {
      clearTimeout(state.lightTimerId);
      state.lightTimerId = 0;
    }
    if (state.yellowTimerId) {
      clearTimeout(state.yellowTimerId);
      state.yellowTimerId = 0;
    }
  }

  function qualifiesForTop10(level, scores = state.highScores) {
    if (!Number.isFinite(level) || level < 1) return false;
    if (scores.length < MAX_HIGH_SCORES) return true;
    return level > scores[scores.length - 1].level;
  }

  function renderHighScores() {
    highScoreList.innerHTML = "";
    const scores = state.highScores;
    highScoreEmpty.classList.toggle("hidden", scores.length > 0);

    scores.forEach((entry, index) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="high-score-rank">${index + 1}.</span>` +
        `<span class="high-score-name"></span>` +
        `<span class="high-score-level">Lv ${entry.level}</span>`;
      li.querySelector(".high-score-name").textContent = entry.name;
      highScoreList.appendChild(li);
    });

    if (state.scoresOffline) {
      highScoreStatus.textContent =
        "Score API offline — deploy on Netlify or run `npm run dev` (netlify dev).";
    } else if (!highScoreStatus.dataset.sticky) {
      highScoreStatus.textContent = "";
    }
  }

  async function loadHighScores() {
    try {
      const res = await fetch(HIGH_SCORE_API, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.highScores = Array.isArray(data.scores) ? data.scores : [];
      state.scoresOffline = false;
      delete highScoreStatus.dataset.sticky;
      highScoreStatus.textContent = "";
      renderHighScores();
    } catch {
      state.scoresOffline = true;
      renderHighScores();
    }
  }

  async function submitHighScore(name, level) {
    const res = await fetch(HIGH_SCORE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    state.highScores = Array.isArray(data.scores) ? data.scores : state.highScores;
    state.scoresOffline = false;
    highScoreStatus.dataset.sticky = "1";
    highScoreStatus.textContent = data.accepted
      ? `Saved ${name} — Level ${level}`
      : data.reason || "Score was not added.";
    renderHighScores();
    return data;
  }

  function showNamePrompt(level) {
    state.awaitingName = true;
    state.pendingScoreLevel = level;
    nameForm.classList.remove("hidden");
    nameError.classList.add("hidden");
    nameError.textContent = "";
    playerNameInput.value = "";
    overlayAction.classList.add("hidden");
    // Focus after paint so mobile keyboards behave more reliably.
    requestAnimationFrame(() => {
      try {
        playerNameInput.focus({ preventScroll: true });
      } catch {
        playerNameInput.focus();
      }
    });
  }

  function hideNamePrompt() {
    state.awaitingName = false;
    state.pendingScoreLevel = 0;
    nameForm.classList.add("hidden");
    nameError.classList.add("hidden");
    nameError.textContent = "";
    overlayAction.classList.remove("hidden");
  }

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    // Keep a landscape playfield letterboxed inside the stage so the player
    // is never stretched on tall phone viewports.
    const fit = Math.min(cssW / BASE_W, cssH / BASE_H);
    const drawW = Math.max(1, Math.floor(BASE_W * fit));
    const drawH = Math.max(1, Math.floor(BASE_H * fit));

    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;
    canvas.width = Math.floor(drawW * dpr);
    canvas.height = Math.floor(drawH * dpr);

    ctx.setTransform(dpr * fit, 0, 0, dpr * fit, 0, 0);
    state.width = BASE_W;
    state.height = BASE_H;
  }

  function updateHud() {
    levelLabel.textContent = `Level ${state.currentLevel}`;
    livesLabel.textContent = `Lives: ${state.lives}`;
    livesLabel.classList.toggle("critical", state.lives <= 3);
    const remainingMs = getRemainingMs();
    timeLabel.textContent = `Time: ${formatCountdown(remainingMs)}`;
    timeLabel.classList.toggle("urgent", !state.gameOver && remainingMs <= 10_000);

    if (state.awaitingName) {
      hint.textContent = `Level ${state.pendingScoreLevel} made the top 10 — enter your name.`;
    } else if (state.gameOver) {
      if (state.needsFullRestart) {
        hint.textContent = "Out of lives — tap to restart from Level 1.";
      } else if (state.playerWon) {
        hint.textContent = "Tap the screen to play the next level.";
      } else {
        hint.textContent = "Life lost — tap to retry this level.";
      }
    } else {
      hint.textContent =
        "Tap the screen to move. Don't move on RED. Reach the finish line!";
    }

    const labels = {
      [LightState.GREEN]: "GREEN — Go!",
      [LightState.YELLOW]: "YELLOW — Hurry!",
      [LightState.RED]: "RED — Don't Move!",
    };
    lightLabel.textContent = labels[state.lightState];
    bulbs.forEach((bulb) => {
      bulb.classList.toggle("active", bulb.dataset.state === state.lightState);
    });

    if (state.gameOver) {
      overlay.classList.remove("hidden");
      if (state.awaitingName) {
        overlayTitle.textContent = "Game Over — High Score!";
        overlaySub.textContent = `You reached Level ${state.pendingScoreLevel}. Save your name for the board.`;
        overlayAction.classList.add("hidden");
        nameForm.classList.remove("hidden");
      } else if (state.playerWon) {
        overlayTitle.textContent = "You Win! Level Up!";
        overlaySub.textContent = `Next Level: ${state.currentLevel} — Lives: ${state.lives}`;
        overlayAction.classList.remove("hidden");
        overlayAction.textContent = "Tap the screen to continue";
        nameForm.classList.add("hidden");
      } else if (state.needsFullRestart) {
        overlayTitle.textContent = "Game Over — No Lives Left";
        const livesWord = STARTING_LIVES === 1 ? "life" : "lives";
        if (state.loseReason === LoseReason.TIMEOUT) {
          overlaySub.textContent = `Time ran out on your last life. Tap to restart from Level 1 with ${STARTING_LIVES} ${livesWord}.`;
        } else {
          overlaySub.textContent = `You moved on RED on your last life. Tap to restart from Level 1 with ${STARTING_LIVES} ${livesWord}.`;
        }
        overlayAction.classList.remove("hidden");
        overlayAction.textContent = "Tap the screen to continue";
        nameForm.classList.add("hidden");
      } else if (state.loseReason === LoseReason.TIMEOUT) {
        overlayTitle.textContent = "Time's Up! −1 Life";
        overlaySub.textContent = `${state.lives} ${
          state.lives === 1 ? "life" : "lives"
        } left — tap to retry this level.`;
        overlayAction.classList.remove("hidden");
        overlayAction.textContent = "Tap the screen to continue";
        nameForm.classList.add("hidden");
      } else {
        overlayTitle.textContent = "Moved on RED! −1 Life";
        overlaySub.textContent = `${state.lives} ${
          state.lives === 1 ? "life" : "lives"
        } left — tap to retry this level.`;
        overlayAction.classList.remove("hidden");
        overlayAction.textContent = "Tap the screen to continue";
        nameForm.classList.add("hidden");
      }
    } else {
      overlay.classList.add("hidden");
      nameForm.classList.add("hidden");
    }
  }

  function scheduleNextLightSwitch() {
    clearTimeout(state.lightTimerId);
    const nextInterval = 1200 + Math.floor(Math.random() * 1801);

    state.lightTimerId = setTimeout(() => {
      if (state.gameOver) return;

      if (state.lightState === LightState.GREEN) {
        state.lightState = LightState.YELLOW;
        updateHud();
        state.yellowTimerId = setTimeout(() => {
          if (state.gameOver) return;
          state.lightState = LightState.RED;
          updateHud();
          scheduleNextLightSwitch();
        }, state.yellowDuration);
      } else if (state.lightState === LightState.RED) {
        state.lightState = LightState.GREEN;
        updateHud();
        scheduleNextLightSwitch();
      }
    }, nextInterval);
  }

  function resetRunProgress() {
    state.currentLevel = 1;
    state.highestLevelReached = 1;
    state.yellowDuration = BASE_YELLOW_DURATION;
    state.lives = STARTING_LIVES;
    state.needsFullRestart = false;
  }

  function maybePromptHighScore() {
    const level = state.highestLevelReached;
    if (!qualifiesForTop10(level)) {
      hideNamePrompt();
      return;
    }
    if (state.scoresOffline) {
      highScoreStatus.dataset.sticky = "1";
      highScoreStatus.textContent =
        `Level ${level} would make the top 10, but the score server is offline.`;
      hideNamePrompt();
      return;
    }
    showNamePrompt(level);
  }

  function endGame(won, reason = null) {
    if (state.gameOver) return;

    const now = performance.now();
    const remainingMs = Math.max(0, LEVEL_TIME_MS - (now - state.startTimeMs));
    state.gameOver = true;
    state.playerWon = won;
    state.loseReason = won ? null : reason;
    state.endTimeMs = now;
    state.remainingMs = remainingMs;
    state.moving = false;
    clearTimers();

    if (won) {
      state.currentLevel += 1;
      state.highestLevelReached = Math.max(
        state.highestLevelReached,
        state.currentLevel
      );
      state.yellowDuration = Math.max(50, Math.floor(state.yellowDuration / 2));
      state.needsFullRestart = false;
      hideNamePrompt();
    } else {
      state.lives = Math.max(0, state.lives - 1);
      state.needsFullRestart = state.lives <= 0;
      if (state.needsFullRestart) {
        maybePromptHighScore();
      } else {
        hideNamePrompt();
      }
    }
    updateHud();
  }

  function startGame({ fullRestart = false } = {}) {
    if (fullRestart) {
      resetRunProgress();
    }

    clearTimers();
    hideNamePrompt();
    state.playerX = PADDING;
    state.playerY = state.height / 2 - PLAYER_SIZE / 2;
    state.lightState = LightState.GREEN;
    state.gameOver = false;
    state.playerWon = false;
    state.loseReason = null;
    state.needsFullRestart = false;
    state.startTimeMs = performance.now();
    state.endTimeMs = 0;
    state.remainingMs = LEVEL_TIME_MS;
    state.moving = false;
    state.lastMoveAt = 0;
    state.highestLevelReached = Math.max(
      state.highestLevelReached,
      state.currentLevel
    );
    delete highScoreStatus.dataset.sticky;
    scheduleNextLightSwitch();
    updateHud();
  }

  function tryMove(dx, dy) {
    if (state.gameOver) return;

    if (state.lightState === LightState.RED) {
      endGame(false, LoseReason.RED);
      return;
    }

    state.playerX += dx;
    state.playerY += dy;
    state.playerX = clamp(
      state.playerX,
      PADDING,
      state.width - PADDING - PLAYER_SIZE
    );
    state.playerY = clamp(
      state.playerY,
      PADDING,
      state.height - PADDING - PLAYER_SIZE
    );

    if (state.playerX >= state.width - PADDING - PLAYER_SIZE) {
      endGame(true);
    }
  }

  function onPointerDown(event) {
    if (state.awaitingName) {
      // Let the name form receive taps; don't restart mid-prompt.
      if (event.target.closest && event.target.closest("#nameForm")) {
        return;
      }
      event.preventDefault();
      return;
    }

    event.preventDefault();
    if (state.gameOver) {
      startGame({ fullRestart: state.needsFullRestart });
      return;
    }
    state.moving = true;
    state.lastMoveAt = 0;
    tryMove(MOVE_STEP, 0);
  }

  function onPointerUp(event) {
    event.preventDefault();
    state.moving = false;
  }

  function onPointerCancel() {
    state.moving = false;
  }

  function drawGrid() {
    ctx.strokeStyle = "#e6e8ee";
    ctx.lineWidth = 1;
    for (let x = PADDING; x < state.width - PADDING; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, state.height - PADDING);
      ctx.stroke();
    }
    for (let y = PADDING; y < state.height - PADDING; y += 40) {
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(state.width - PADDING, y);
      ctx.stroke();
    }
  }

  function drawFinishLine() {
    const x = state.width - PADDING - 6;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, PADDING, 6, state.height - 2 * PADDING);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = "bold 12px Segoe UI, Helvetica Neue, sans-serif";
    ctx.fillText("Finish", x - 45, PADDING + 15);
  }

  function drawPlayer() {
    const r = 8;
    const x = state.playerX;
    const y = state.playerY;
    const w = PLAYER_SIZE;
    const h = PLAYER_SIZE;
    ctx.fillStyle = "#2d72d2";
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#f5f6fa";
    ctx.fillRect(0, 0, state.width, state.height);
    drawGrid();
    drawFinishLine();
    drawPlayer();
  }

  function frame(now) {
    if (!state.gameOver && getRemainingMs(now) <= 0) {
      endGame(false, LoseReason.TIMEOUT);
    }

    if (state.moving && !state.gameOver) {
      if (now - state.lastMoveAt >= MOVE_INTERVAL_MS) {
        state.lastMoveAt = now;
        tryMove(MOVE_STEP, 0);
      }
    }
    updateHud();
    draw();
    requestAnimationFrame(frame);
  }

  nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const name = playerNameInput.value.trim();
    if (!name) {
      nameError.textContent = "Please enter a name.";
      nameError.classList.remove("hidden");
      return;
    }

    const level = state.pendingScoreLevel;
    nameError.classList.add("hidden");
    const submitBtn = document.getElementById("nameSubmit");
    submitBtn.disabled = true;
    try {
      await submitHighScore(name, level);
      hideNamePrompt();
      updateHud();
    } catch (err) {
      nameError.textContent = err.message || "Could not save score.";
      nameError.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Keep typing from bubbling into stage pointer handlers on some browsers.
  nameForm.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  playerNameInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointerleave", onPointerUp);
  stage.addEventListener("pointercancel", onPointerCancel);
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener(
    "touchmove",
    (e) => {
      if (state.awaitingName) return;
      if (e.target === canvas || stage.contains(e.target)) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  resizeCanvas();
  renderHighScores();
  loadHighScores();
  startGame();
  requestAnimationFrame(frame);
})();
