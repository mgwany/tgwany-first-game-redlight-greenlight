(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const levelLabel = document.getElementById("levelLabel");
  const timeLabel = document.getElementById("timeLabel");
  const hint = document.getElementById("hint");
  const lightLabel = document.getElementById("lightLabel");
  const bulbs = [...document.querySelectorAll(".bulb")];

  const BASE_W = 800;
  const BASE_H = 500;
  const PADDING = 20;
  const PLAYER_SIZE = 24;
  const MOVE_STEP = 10;
  const MOVE_INTERVAL_MS = 55;
  const LEVEL_TIME_MS = 60_000;

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
    startTimeMs: 0,
    endTimeMs: 0,
    remainingMs: LEVEL_TIME_MS,
    currentLevel: 1,
    yellowDuration: 500,
    moving: false,
    lastMoveAt: 0,
    lightTimerId: 0,
    yellowTimerId: 0,
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
    const remainingMs = getRemainingMs();
    timeLabel.textContent = `Time: ${formatCountdown(remainingMs)}`;
    timeLabel.classList.toggle("urgent", !state.gameOver && remainingMs <= 10_000);

    if (state.gameOver) {
      hint.textContent = "Tap the screen to play again.";
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
      if (state.playerWon) {
        overlayTitle.textContent = "You Win! Level Up!";
        overlaySub.textContent = `Next Level: ${state.currentLevel} — Tap the screen to play!`;
      } else if (state.loseReason === LoseReason.TIMEOUT) {
        overlayTitle.textContent = "Time's Up! Game Over";
        overlaySub.textContent = "Tap the screen to try again.";
      } else {
        overlayTitle.textContent = "You moved on RED! Game Over";
        overlaySub.textContent = "Tap the screen to try again.";
      }
    } else {
      overlay.classList.add("hidden");
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
      state.yellowDuration = Math.max(50, Math.floor(state.yellowDuration / 2));
    }
    updateHud();
  }

  function startGame() {
    clearTimers();
    state.playerX = PADDING;
    state.playerY = state.height / 2 - PLAYER_SIZE / 2;
    state.lightState = LightState.GREEN;
    state.gameOver = false;
    state.playerWon = false;
    state.loseReason = null;
    state.startTimeMs = performance.now();
    state.endTimeMs = 0;
    state.remainingMs = LEVEL_TIME_MS;
    state.moving = false;
    state.lastMoveAt = 0;
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
    event.preventDefault();
    if (state.gameOver) {
      startGame();
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

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointerleave", onPointerUp);
  stage.addEventListener("pointercancel", onPointerCancel);
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener(
    "touchmove",
    (e) => {
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
  startGame();
  requestAnimationFrame(frame);
})();
