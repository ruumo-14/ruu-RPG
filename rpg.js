
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const touchStart = document.getElementById("touch-start");

  const C = {
    bg: "#07111b",
    line: "#26384b",
    white: "#e8edf4",
    muted: "#9eafc1",
    pink: "#ff6575",
    red: "#ff465e",
    orange: "#ffad55",
    gold: "#ffd166",
    blue: "#75c9ff",
    green: "#78e0ae",
    panel: "#101f30"
  };

  let W = 960, H = 540, dpr = 1, lastTime = 0;

  // title, stageSelect, shop, playing, pause, gameover
  let mode = "title";
  let stage = 1;
  let unlockedStages = new Set([1]);

  let gold = 0;
  let runGold = 0;
  let elapsed = 0;
  let goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;

  let menuIndex = 0;
  let shopMessage = "";
  let messageTimer = 0;

  const keys = new Set();
  const touchDirs = new Set();

  let bullets = [];
  let particles = [];
  let edgeWarnings = [];
  let enemies = [];
  let shotTimers = [];
  let radialTimers = [];

  let edgeTimer = 6;
  let patternTick = 0;

  const player = {
    x: 0,
    y: 0,
    r: 5,
    speed: 310,
    lives: 3,
    invuln: 0
  };

  const STAGE_COSTS = {
    1: 0,
    2: 50
  };

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));

  const rand = (min, max) =>
    min + Math.random() * (max - min);

  // -------------------------
  // Screen setup
  // -------------------------

  function resize() {
    const rect = canvas.getBoundingClientRect();

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!player.x) resetPlayer();

    positionEnemies();
    draw();
  }

  window.addEventListener("resize", resize);

  window.addEventListener("orientationchange", () => {
    setTimeout(resize, 100);
  });

  function resetPlayer() {
    player.x = W / 2;
    player.y = H * 0.78;
  }

  // Stage 1: three enemies.
  // Stage 2: one central enemy.
  function positionEnemies() {
    if (stage === 1) {
      enemies = [
        {
          x: W * 0.5,
          y: H * 0.16,
          name: "CENTER"
        },
        {
          x: W * 0.19,
          y: H * 0.29,
          name: "LEFT"
        },
        {
          x: W * 0.81,
          y: H * 0.29,
          name: "RIGHT"
        }
      ];
    } else {
      enemies = [
        {
          x: W * 0.5,
          y: H * 0.18,
          name: "CENTER"
        }
      ];
    }
  }

  // -------------------------
  // Navigation
  // -------------------------

  function showTitle() {
    mode = "title";
    menuIndex = 0;
    shopMessage = "";
    messageTimer = 0;
  }

  function showStageSelect() {
    mode = "stageSelect";
    menuIndex = 0;
    shopMessage = "";
    messageTimer = 0;
  }

  function openShop() {
    mode = "shop";
    menuIndex = 0;
    shopMessage = "";
    messageTimer = 0;
  }

  function startRun(selectedStage) {
    if (!unlockedStages.has(selectedStage)) {
      openShop();
      shopMessage = "このステージはショップで購入してね";
      messageTimer = 3;
      return;
    }

    stage = selectedStage;

    elapsed = 0;
    goldTimer = 0;
    runGold = 0;
    hitFlash = 0;
    bulletSpeedMultiplier = 1;

    bullets = [];
    particles = [];
    edgeWarnings = [];

    shotTimers = [];
    radialTimers = [];

    edgeTimer = 5;
    patternTick = 0;

    player.lives = 3;
    player.invuln = 1.2;

    resetPlayer();
    positionEnemies();

    // Each enemy has its own attack schedule.
    shotTimers = enemies.map((_, i) => 0.6 + i * 0.4);
    radialTimers = enemies.map((_, i) => 1.5 + i * 0.9);

    mode = "playing";
  }

  function addGold(amount) {
    gold += amount;
    runGold += amount;
  }

  // -------------------------
  // Enemy projectiles
  // -------------------------

  function fire(x, y, angle, speed, color = C.pink, radius = 4) {
    bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed * bulletSpeedMultiplier,
      vy: Math.sin(angle) * speed * bulletSpeedMultiplier,
      r: radius,
      color,
      dead: false
    });
  }

  function aimedShot(enemy, speed, color = C.pink) {
    const angle = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );

    fire(enemy.x, enemy.y, angle, speed, color);
  }

  // Full-circle attack.
  function radialShot(enemy, count, speed, offset = 0, color = C.pink) {
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;

      fire(
        enemy.x,
        enemy.y,
        angle,
        speed,
        i % 3 === 0 ? C.orange : color
      );
    }
  }

  // Wide fan attack.
  function fanShot(enemy, count, spread, speed, color = C.orange) {
    const base = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );

    for (let i = 0; i < count; i++) {
      const offset = count === 1
        ? 0
        : -spread / 2 + spread * i / (count - 1);

      fire(
        enemy.x,
        enemy.y,
        base + offset,
        speed,
        color
      );
    }
  }

  // Stage 2: screen-edge warning and attack.
  function edgeBurst() {
    const side = Math.floor(Math.random() * 4);

    let x, y, angle;

    if (side === 0) {
      x = rand(25, W - 25);
      y = 18;
      angle = Math.PI / 2;
    } else if (side === 1) {
      x = W - 18;
      y = rand(45, H - 25);
      angle = Math.PI;
    } else if (side === 2) {
      x = rand(25, W - 25);
      y = H - 18;
      angle = -Math.PI / 2;
    } else {
      x = 18;
      y = rand(45, H - 25);
      angle = 0;
    }

    edgeWarnings.push({
      x, y, angle,
      life: 0.8,
      fired: false
    });
  }

  // -------------------------
  // Battle update
  // -------------------------

  function update(dt) {
    if (messageTimer > 0) {
      messageTimer -= dt;
    }

    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    /*
      Stronger acceleration every 30 seconds.

      0 seconds:    x1.00
      30 seconds:   x1.65
      60 seconds:   x2.45
      90 seconds:   x3.40
      120 seconds:  x4.50
      150 seconds:  x5.75

      Each new tier increases the acceleration amount.
    */
    const tier = Math.floor(elapsed / 30);

    bulletSpeedMultiplier =
      1 +
      0.65 * tier +
      0.15 * tier * (tier - 1) / 2;

    // Player movement.
    let dx = 0;
    let dy = 0;

    if (
      keys.has("ArrowLeft") ||
      keys.has("KeyA") ||
      touchDirs.has("left")
    ) dx--;

    if (
      keys.has("ArrowRight") ||
      keys.has("KeyD") ||
      touchDirs.has("right")
    ) dx++;

    if (
      keys.has("ArrowUp") ||
      keys.has("KeyW") ||
      touchDirs.has("up")
    ) dy--;

    if (
      keys.has("ArrowDown") ||
      keys.has("KeyS") ||
      touchDirs.has("down")
    ) dy++;

    // Prevent faster diagonal movement.
    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    player.x = clamp(
      player.x + dx * player.speed * dt,
      12,
      W - 12
    );

    player.y = clamp(
      player.y + dy * player.speed * dt,
      45,
      H - 18
    );

    // =========================
    // Stage 1: three enemies
    // =========================
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

        // Aimed bullets from every enemy.
        shotTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          if (i === 0) {
            aimedShot(enemy, 205, C.pink);

            shotTimers[i] = Math.max(
              0.4,
              0.92 - elapsed * 0.003
            );
          } else {
            aimedShot(enemy, 190, C.orange);

            shotTimers[i] = Math.max(
              0.52,
              1.2 - elapsed * 0.003
            );
          }
        }

        /*
          Wide attacks from all three enemies:
          center = radial circle,
          left/right = wide fan attacks.
        */
        radialTimers[i] -= dt;

        if (radialTimers[i] <= 0) {
          if (i === 0) {
            radialShot(
              enemy,
              12,
              135 + Math.min(35, elapsed * 0.5),
              patternTick * 0.25,
              C.pink
            );

            radialTimers[i] = 3.1;
          } else if (i === 1) {
            fanShot(
              enemy,
              11,
              1.65,
              155 + Math.min(35, elapsed * 0.5),
              C.orange
            );

            // Occasional additional spread.
            if (Math.random() < 0.35) {
              radialShot(
                enemy,
                9,
                115 + Math.min(30, elapsed * 0.4),
                patternTick * 0.3,
                C.pink
              );
            }

            radialTimers[i] = 3.8;
          } else {
            fanShot(
              enemy,
              11,
              1.65,
              155 + Math.min(35, elapsed * 0.5),
              C.orange
            );

            if (Math.random() < 0.35) {
              radialShot(
                enemy,
                9,
                115 + Math.min(30, elapsed * 0.4),
                -patternTick * 0.3,
                C.pink
              );
            }

            radialTimers[i] = 4.2;
          }
        }
      }
    }

    // =========================
    // Stage 2: radial + edge
    // =========================
    if (stage === 2) {
      radialTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(
          enemies[0],
          16 + Math.min(10, Math.floor(elapsed / 8)),
          155 + Math.min(45, elapsed * 0.6),
          patternTick * 0.16
        );

        radialTimers[0] = 2.05;
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeBurst();
        edgeTimer = rand(5.5, 8.5);
      }
    }

    // Edge warnings become attacks after a short delay.
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {
        warning.fired = true;

        for (let i = -3; i <= 3; i++) {
          fire(
            warning.x,
            warning.y,
            warning.angle + i * 0.15,
            235,
            C.orange
          );
        }
      }
    }

    edgeWarnings = edgeWarnings.filter(w => w.life > -0.8);

    // Move bullets and detect collisions.
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (
        player.invuln <= 0 &&
        Math.hypot(
          player.x - bullet.x,
          player.y - bullet.y
        ) < player.r + bullet.r
      ) {
        bullet.dead = true;

        player.lives--;
        player.invuln = 1.25;
        hitFlash = 0.2;

        for (let i = 0; i < 8; i++) {
          particles.push({
            x: player.x,
            y: player.y,
            vx: rand(-65, 65),
            vy: rand(-65, 65),
            life: 0.35,
            color: C.pink
          });
        }

        if (player.lives <= 0) {
          mode = "gameover";
          menuIndex = 0;
          bullets = [];
          edgeWarnings = [];
          break;
        }
      }
    }

    bullets = bullets.filter(b =>
      !b.dead &&
      b.x > -40 && b.x < W + 40 &&
      b.y > -40 && b.y < H + 40
    );

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    particles = particles.filter(p => p.life > 0);

    // GOLD: every 10 seconds.
    // 30 seconds = x2, 60 = x4, 90 = x8, etc.
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      addGold(Math.pow(2, goldTier));
    }
  }

  // -------------------------
  // Drawing helpers
  // -------------------------

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;

    ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h)
    );
  }

  function text(value, x, y, size = 16, color = C.white, align = "left") {
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;

    ctx.fillText(
      String(value),
      Math.round(x),
      Math.round(y)
    );

    ctx.restore();
  }

  function drawBackground() {
    rect(0, 0, W, H, C.bg);

    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    ctx.globalAlpha = 0.13;

    for (let x = 20; x < W; x += 32) {
      rect(x, 0, 1, H, "#1d3042");
    }

    for (let y = 20; y < H; y += 32) {
      rect(0, y, W, 1, "#1d3042");
    }

    ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy, index) {
    const x = enemy.x;
    const y = enemy.y;
    const color = index === 0 ? C.pink : C.orange;

    rect(x - 16, y - 13, 32, 26, color);
    rect(x - 21, y - 6, 5, 12, color);
    rect(x + 16, y - 6, 5, 12, color);
    rect(x - 10, y - 18, 6, 5, color);
    rect(x + 4, y - 18, 6, 5, color);

    rect(x - 9, y - 2, 5, 5, C.bg);
    rect(x + 4, y - 2, 5, 5, C.bg);
    rect(x - 6, y + 7, 12, 3, C.bg);
  }

  function drawPlayer() {
    if (
      player.invuln > 0 &&
      Math.floor(player.invuln * 12) % 2 === 0
    ) return;

    rect(player.x - 3, player.y - 7, 6, 14, C.red);
    rect(player.x - 7, player.y - 3, 14, 6, C.red);
    rect(player.x - 2, player.y - 2, 4, 4, "#ff9aa5");
  }

  function drawBullet(bullet) {
    rect(
      bullet.x - bullet.r,
      bullet.y - bullet.r,
      bullet.r * 2,
      bullet.r * 2,
      bullet.color
    );

    rect(bullet.x - 1, bullet.y - 1, 2, 2, "#fff0d0");
  }

  function drawButton(label, x, y, selected, width = 300, height = 48) {
    rect(
      x - width / 2,
      y - height / 2,
      width,
      height,
      selected ? "#1b3850" : C.panel
    );

    ctx.strokeStyle = selected ? C.blue : C.line;
    ctx.lineWidth = selected ? 2 : 1;

    ctx.strokeRect(
      x - width / 2,
      y - height / 2,
      width,
      height
    );

    text(
      `${selected ? "> " : "  "}${label}`,
      x,
      y,
      Math.min(18, width * 0.052),
      selected ? C.gold : C.white,
      "center"
    );
  }

  // -------------------------
  // Main menu
  // -------------------------

  function drawTitle() {
    drawEnemy({ x: W / 2, y: H * 0.16 }, 0);

    text(
      "RUU RPG",
      W / 2,
      H * 0.29,
      Math.min(38, W * 0.05),
      C.white,
      "center"
    );

    text(
      "DODGE - SURVIVE - COLLECT GOLD",
      W / 2,
      H * 0.37,
      Math.min(15, W * 0.02),
      C.muted,
      "center"
    );

    // Big GAME START button.
    drawButton(
      "GAME START",
      W / 2,
      H * 0.53,
      menuIndex === 0,
      Math.min(W - 40, 380),
      64
    );

    // SHOP button below it.
    drawButton(
      "SHOP",
      W / 2,
      H * 0.67,
      menuIndex === 1,
      Math.min(W - 40, 300),
      48
    );

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.81,
      12,
      C.muted,
      "center"
    );

    text(
      `GOLD ${gold}`,
      W - 20,
      24,
      16,
      C.gold,
      "right"
    );
  }

  // -------------------------
  // Stage selection
  // -------------------------

  function drawStageSelect() {
    text("SELECT STAGE", W / 2, H * 0.16, 27, C.white, "center");

    text(
      `YOUR GOLD: ${gold}`,
      W / 2,
      H * 0.25,
      16,
      C.gold,
      "center"
    );

    const items = [
      {
        label: "STAGE 1 - PLAY",
        detail: "AIMED + THREE ENEMIES",
        unlocked: unlockedStages.has(1)
      },
      {
        label: unlockedStages.has(2)
          ? "STAGE 2 - PLAY"
          : "STAGE 2 - LOCKED",
        detail: unlockedStages.has(2)
          ? "RADIAL + EDGE ATTACKS"
          : `BUY FOR ${STAGE_COSTS[2]} GOLD IN SHOP`,
        unlocked: unlockedStages.has(2)
      },
      {
        label: "BACK",
        detail: "RETURN TO TITLE",
        unlocked: true
      }
    ];

    const startY = H * 0.39;
    const gap = Math.min(68, H * 0.13);

    items.forEach((item, i) => {
      drawButton(
        item.label,
        W / 2,
        startY + i * gap,
        menuIndex === i,
        Math.min(W - 36, 380),
        42
      );

      text(
        item.detail,
        W / 2,
        startY + i * gap + 25,
        10,
        item.unlocked ? C.muted : C.orange,
        "center"
      );
    });

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.9,
      12,
      C.muted,
      "center"
    );
  }

  // -------------------------
  // Shop
  // -------------------------

  function drawShop() {
    text("SHOP", W / 2, H * 0.13, 30, C.gold, "center");

    text(
      `YOUR GOLD: ${gold}`,
      W / 2,
      H * 0.22,
      17,
      C.white,
      "center"
    );

    const items = [
      {
        label: "BUY / PLAY STAGE 2",
        detail: unlockedStages.has(2)
          ? "ALREADY OWNED - FREE TO PLAY"
          : `COST: ${STAGE_COSTS[2]} GOLD`,
      },
      {
        label: "PLAY STAGE 1",
        detail: "FREE",
      },
      {
        label: "BACK TO TITLE",
        detail: "RETURN TO MAIN MENU",
      }
    ];

    const startY = H * 0.4;
    const gap = Math.min(70, H * 0.14);

    items.forEach((item, i) => {
      drawButton(
        item.label,
        W / 2,
        startY + i * gap,
        menuIndex === i,
        Math.min(W - 30, 390),
        44
      );

      text(
        item.detail,
        W / 2,
        startY + i * gap + 25,
        11,
        C.muted,
        "center"
      );
    });

    if (messageTimer > 0 && shopMessage) {
      text(
        shopMessage,
        W / 2,
        H * 0.88,
        12,
        C.orange,
        "center"
      );
    }

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.95,
      11,
      C.muted,
      "center"
    );
  }

  function drawPause() {
    text("PAUSED", W / 2, H * 0.3, 30, C.white, "center");

    drawButton("RESUME", W / 2, H * 0.45, menuIndex === 0);

    drawButton(
      "GIVE UP - GO TO SHOP",
      W / 2,
      H * 0.56,
      menuIndex === 1,
      Math.min(W - 30, 340)
    );

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.69,
      12,
      C.muted,
      "center"
    );
  }

  function drawGameOver() {
    text("GAME OVER", W / 2, H * 0.26, 32, C.pink, "center");

    text(
      `SURVIVED ${elapsed.toFixed(1)}s`,
      W / 2,
      H * 0.35,
      15,
      C.white,
      "center"
    );

    text(
      `GOLD: ${gold} (+${runGold})`,
      W / 2,
      H * 0.42,
      15,
      C.gold,
      "center"
    );

    drawButton("RETRY", W / 2, H * 0.55, menuIndex === 0);

    drawButton(
      "GO TO SHOP",
      W / 2,
      H * 0.65,
      menuIndex === 1
    );

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.78,
      12,
      C.muted,
      "center"
    );
  }

  // -------------------------
  // Battle drawing
  // -------------------------

  function drawBattle() {
    text(`STAGE ${stage}`, 18, 22, 15, C.white);
    text(`GOLD ${gold}`, W - 18, 22, 15, C.gold, "right");

    text(
      `HP ${"♥".repeat(Math.max(0, player.lives))}`,
      18,
      45,
      14,
      C.pink
    );

    text(
      `TIME ${elapsed.toFixed(1)}s`,
      W / 2,
      23,
      14,
      C.white,
      "center"
    );

    text(
      `BULLET x${bulletSpeedMultiplier.toFixed(2)}`,
      W / 2,
      44,
      11,
      C.orange,
      "center"
    );

    enemies.forEach((enemy, i) => drawEnemy(enemy, i));

    for (const warning of edgeWarnings) {
      if (warning.life > 0) {
        ctx.globalAlpha =
          Math.floor(performance.now() / 100) % 2 ? 0.8 : 0.3;

        rect(
          warning.x - 7,
          warning.y - 7,
          14,
          14,
          C.orange
        );

        ctx.globalAlpha = 1;
      }
    }

    bullets.forEach(drawBullet);

    particles.forEach(p => {
      rect(p.x, p.y, 3, 3, p.color);
    });

    drawPlayer();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();

    if (mode === "title") {
      drawTitle();
      return;
    }

    if (mode === "stageSelect") {
      drawStageSelect();
      return;
    }

    if (mode === "shop") {
      drawShop();
      return;
    }

    drawBattle();

    if (mode === "pause") {
      ctx.globalAlpha = 0.8;
      rect(0, 0, W, H, "#020812");
      ctx.globalAlpha = 1;
      drawPause();
    }

    if (mode === "gameover") {
      ctx.globalAlpha = 0.85;
      rect(0, 0, W, H, "#020812");
      ctx.globalAlpha = 1;
      drawGameOver();
    }

    if (hitFlash > 0 && mode === "playing") {
      ctx.globalAlpha = hitFlash * 1.5;
      rect(0, 0, W, H, C.red);
      ctx.globalAlpha = 1;
    }
  }

  // -------------------------
  // Menu actions
  // -------------------------

  function menuLength() {
    if (mode === "title") return 2;
    if (mode === "stageSelect") return 3;
    if (mode === "shop") return 3;
    if (mode === "pause") return 2;
    if (mode === "gameover") return 2;

    return 0;
  }

  function moveMenu(direction) {
    const length = menuLength();
    if (!length) return;

    menuIndex = (menuIndex + direction + length) % length;
  }

  function confirmMenu() {
    if (mode === "title") {
      if (menuIndex === 0) {
        showStageSelect();
      } else {
        openShop();
      }

      return;
    }

    if (mode === "stageSelect") {
      if (menuIndex === 0) {
        startRun(1);
      } else if (menuIndex === 1) {
        if (unlockedStages.has(2)) {
          startRun(2);
        } else {
          openShop();
          menuIndex = 0;
          shopMessage = "Stage 2を購入してね";
          messageTimer = 3;
        }
      } else {
        showTitle();
      }

      return;
    }

    if (mode === "shop") {
      if (menuIndex === 0) {
        if (unlockedStages.has(2)) {
          showStageSelect();
          return;
        }

        if (gold >= STAGE_COSTS[2]) {
          gold -= STAGE_COSTS[2];
          unlockedStages.add(2);

          shopMessage = "STAGE 2 PURCHASED!";
          messageTimer = 2;

          showStageSelect();
        } else {
          shopMessage =
            `GOLDが足りない！ あと${STAGE_COSTS[2] - gold} GOLD必要`;

          messageTimer = 3;
        }
      } else if (menuIndex === 1) {
        startRun(1);
      } else {
        showTitle();
      }

      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
        // Stop the current battle and go to the shop.
        // Previously earned GOLD is kept.
        bullets = [];
        edgeWarnings = [];
        openShop();
      }

      return;
    }

    if (mode === "gameover") {
      if (menuIndex === 0) {
        startRun(stage);
      } else {
        openShop();
      }
    }
  }

  function handleEscape() {
    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
    } else if (mode === "pause") {
      mode = "playing";
    } else if (mode === "shop") {
      showTitle();
    } else if (mode === "stageSelect") {
      showTitle();
    } else if (mode === "gameover") {
      openShop();
    }
  }

  function keyDown(e) {
    const menuKeys = [
      "ArrowUp", "ArrowDown",
      "ArrowLeft", "ArrowRight",
      "Space", "Escape", "Enter"
    ];

    if (menuKeys.includes(e.code)) {
      e.preventDefault();
    }

    if (e.repeat && mode !== "playing") return;

    keys.add(e.code);

    if (e.code === "Escape") {
      handleEscape();
      return;
    }

    // In battle, arrows and WASD move the player.
    if (mode === "playing") return;

    if (
      e.code === "ArrowUp" ||
      e.code === "ArrowLeft"
    ) {
      moveMenu(-1);
      return;
    }

    if (
      e.code === "ArrowDown" ||
      e.code === "ArrowRight"
    ) {
      moveMenu(1);
      return;
    }

    if (e.code === "Space" || e.code === "Enter") {
      confirmMenu();
    }
  }

  function keyUp(e) {
    keys.delete(e.code);
  }

  window.addEventListener("keydown", keyDown, { passive: false });
  window.addEventListener("keyup", keyUp);

  // -------------------------
  // Touch controls
  // -------------------------

  document.querySelectorAll("[data-dir]").forEach(button => {
    const dir = button.dataset.dir;

    const down = e => {
      e.preventDefault();
      touchDirs.add(dir);
    };

    const up = e => {
      e.preventDefault();
      touchDirs.delete(dir);
    };

    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
  });

  if (touchStart) {
    touchStart.addEventListener("click", () => {
      if (mode === "playing") return;

      if (mode === "pause") {
        mode = "playing";
      } else if (mode === "title") {
        showStageSelect();
      } else if (mode === "gameover") {
        openShop();
      } else if (mode === "stageSelect") {
        confirmMenu();
      } else if (mode === "shop") {
        confirmMenu();
      }
    });
  }

  // Click the visible canvas buttons with a mouse or touchscreen.
  canvas.addEventListener("pointerdown", e => {
    const rect = canvas.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
      return;
    }

    if (mode === "pause" || mode === "gameover") {
      const buttons = mode === "pause"
        ? [
            { index: 0, y: H * 0.45 },
            { index: 1, y: H * 0.56 }
          ]
        : [
            { index: 0, y: H * 0.55 },
            { index: 1, y: H * 0.65 }
          ];

      const chosen = buttons.find(b =>
        Math.abs(y - b.y) < 28 &&
        Math.abs(x - W / 2) < Math.min(W * 0.45, 210)
      );

      if (chosen) {
        menuIndex = chosen.index;
        confirmMenu();
      }

      return;
    }

    if (mode === "title") {
      if (y > H * 0.45 && y < H * 0.6) {
        menuIndex = 0;
        confirmMenu();
      } else if (y >= H * 0.6 && y < H * 0.75) {
        menuIndex = 1;
        confirmMenu();
      }

      return;
    }

    if (mode === "stageSelect") {
      const startY = H * 0.39;
      const gap = Math.min(68, H * 0.13);

      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index < 3) {
        menuIndex = index;
        confirmMenu();
      }

      return;
    }

    if (mode === "shop") {
      const startY = H * 0.4;
      const gap = Math.min(70, H * 0.14);

      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index < 3) {
        menuIndex = index;
        confirmMenu();
      }
    }
  });

  // -------------------------
  // Game loop
  // -------------------------

  function frame(now) {
    const dt = Math.min(
      0.035,
      (now - (lastTime || now)) / 1000
    );

    lastTime = now;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
