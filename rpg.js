
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

  let W = 960;
  let H = 540;
  let dpr = 1;
  let lastTime = 0;

  // title, shop, playing, pause, gameover
  let mode = "title";
  let previousMode = "title";

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

  let shotTimers = [];
  let radialTimer = 1.5;
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

  // Stage 1 has three enemies.
  // Stage 2 currently has one central enemy.
  let enemies = [];

  const STAGE_COSTS = {
    1: 0,
    2: 50
  };

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));

  const rand = (min, max) =>
    min + Math.random() * (max - min);

  function resize() {
    const rect = canvas.getBoundingClientRect();

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!player.x) resetPositions();

    positionEnemies();
    draw();
  }

  function resetPositions() {
    player.x = W / 2;
    player.y = H * 0.78;
  }

  function positionEnemies() {
    if (stage === 1) {
      enemies = [
        { x: W * 0.5, y: H * 0.17, type: "front" },
        { x: W * 0.2, y: H * 0.29, type: "left" },
        { x: W * 0.8, y: H * 0.29, type: "right" }
      ];
    } else {
      enemies = [
        { x: W * 0.5, y: H * 0.19, type: "front" }
      ];
    }
  }

  window.addEventListener("resize", resize);

  window.addEventListener("orientationchange", () => {
    setTimeout(resize, 100);
  });

  function addGold(amount) {
    gold += amount;
    runGold += amount;
  }

  function startRun(selectedStage) {
    if (!unlockedStages.has(selectedStage)) {
      openShop();
      shopMessage = "先にショップでステージを購入してね";
      messageTimer = 3;
      return;
    }

    stage = selectedStage;
    mode = "playing";

    elapsed = 0;
    goldTimer = 0;
    runGold = 0;
    hitFlash = 0;
    bulletSpeedMultiplier = 1;

    bullets = [];
    particles = [];
    edgeWarnings = [];

    shotTimers = [];
    radialTimer = 1.5;
    edgeTimer = 6;
    patternTick = 0;

    player.lives = 3;
    player.invuln = 1.2;

    resetPositions();
    positionEnemies();

    // Different starting delays for each enemy.
    shotTimers = enemies.map((_, i) => 0.6 + i * 0.45);
  }

  function openShop() {
    mode = "shop";
    menuIndex = 0;
    shopMessage = "";
    messageTimer = 0;
  }

  function fire(x, y, angle, speed, color = C.pink, radius = 4) {
    const actualSpeed = speed * bulletSpeedMultiplier;

    bullets.push({
      x,
      y,
      vx: Math.cos(angle) * actualSpeed,
      vy: Math.sin(angle) * actualSpeed,
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

  function radialShot(enemy, count, speed, offset = 0) {
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;

      fire(
        enemy.x,
        enemy.y,
        angle,
        speed,
        i % 3 === 0 ? C.orange : C.pink
      );
    }
  }

  // Stage 2: attack from a random point near a screen edge.
  function edgeBurst() {
    const side = Math.floor(Math.random() * 4);

    let x, y, angle;

    if (side === 0) {
      x = rand(25, W - 25);
      y = 18;
      angle = Math.PI / 2;
    } else if (side === 1) {
      x = W - 18;
      y = rand(40, H - 25);
      angle = Math.PI;
    } else if (side === 2) {
      x = rand(25, W - 25);
      y = H - 18;
      angle = -Math.PI / 2;
    } else {
      x = 18;
      y = rand(40, H - 25);
      angle = 0;
    }

    edgeWarnings.push({
      x, y, angle,
      life: 0.8,
      fired: false
    });
  }

  function update(dt) {
    if (mode !== "playing") {
      if (messageTimer > 0) {
        messageTimer -= dt;
      }
      return;
    }

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    // Every 30 seconds, enemy bullets become faster.
    
    const tier = Math.floor(elapsed / 30);

    // 30秒ごとに加速幅を大きくする
    bulletSpeedMultiplier =
      1 + tier * 0.5 + tier * (tier - 1) * 0.12;

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
      42,
      H - 18
    );

    // Stage 1: three enemies attack from the front,
    // front-left and front-right.
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        shotTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          const enemy = enemies[i];

          // Center enemy fires directly aimed bullets.
          if (i === 0) {
            aimedShot(enemy, 205, C.pink);
            shotTimers[i] = Math.max(
              0.42,
              0.95 - elapsed * 0.003
            );
          }

          // Side enemies fire aimed bullets too.
          else {
            aimedShot(enemy, 185, C.orange);
            shotTimers[i] = Math.max(
              0.55,
              1.3 - elapsed * 0.003
            );
          }
        }
      }

      // The center enemy periodically releases a radial burst.
      radialTimer -= dt;

      if (radialTimer <= 0) {
        radialShot(
          enemies[0],
          12,
          125 + Math.min(40, elapsed),
          patternTick * 0.2
        );

        radialTimer = 3;
      }
    }

    // Stage 2: radial volleys and occasional edge attacks.
    if (stage === 2) {
      radialTimer -= dt;

      if (radialTimer <= 0) {
        radialShot(
          enemies[0],
          16 + Math.min(10, Math.floor(elapsed / 8)),
          150 + Math.min(45, elapsed),
          patternTick * 0.16
        );

        radialTimer = 2.05;
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeBurst();
        edgeTimer = rand(5.5, 8.5);
      }
    }

    // Edge attack warning, then a fan of bullets.
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

    // Move bullets and check collisions.
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

    // Gain GOLD every 10 seconds.
    // 30s = x2, 60s = x4, 90s = x8, etc.
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      const reward = Math.pow(2, goldTier);

      addGold(reward);
    }
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h)
    );
  }

  function text(
    value,
    x,
    y,
    size = 16,
    color = C.white,
    align = "left"
  ) {
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(value, Math.round(x), Math.round(y));
    ctx.restore();
  }

  function drawEnemy(enemy, index) {
    const x = enemy.x;
    const y = enemy.y;
    const color = index === 0 ? C.pink : C.orange;

    // Pixel-art enemy.
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

  function drawBullet(b) {
    rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, b.color);
    rect(b.x - 1, b.y - 1, 2, 2, "#fff0d0");
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

  function drawButton(label, x, y, selected, width = 250) {
    const h = 36;

    rect(
      x - width / 2,
      y - h / 2,
      width,
      h,
      selected ? "#1b3850" : C.panel
    );

    ctx.strokeStyle = selected ? C.blue : C.line;
    ctx.lineWidth = selected ? 2 : 1;

    ctx.strokeRect(
      x - width / 2,
      y - h / 2,
      width,
      h
    );

    text(
      `${selected ? "> " : "  "}${label}`,
      x,
      y,
      15,
      selected ? C.gold : C.white,
      "center"
    );
  }

  function drawTitle() {
    const enemyX = W / 2;
    const enemyY = H * 0.19;

    drawEnemy({ x: enemyX, y: enemyY }, 0);

    text(
      "RUU RPG",
      W / 2,
      H * 0.37,
      Math.min(38, W * 0.045),
      C.white,
      "center"
    );

    text(
      "DODGE  -  SURVIVE  -  COLLECT GOLD",
      W / 2,
      H * 0.46,
      Math.min(16, W * 0.018),
      C.muted,
      "center"
    );

    drawButton("START / SHOP", W / 2, H * 0.64, true, 230);

    text(
      "ARROWS: MOVE / SELECT     SPACE: CONFIRM",
      W / 2,
      H * 0.76,
      12,
      C.muted,
      "center"
    );

    text(`GOLD ${gold}`, W - 22, 25, 16, C.gold, "right");
  }

  function drawShop() {
    text("SHOP", W / 2, H * 0.12, 28, C.gold, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.2, 17, C.white, "center");

    const items = [
      {
        label: "STAGE 1 - PLAY (FREE)",
        action: "stage1"
      },
      {
        label: unlockedStages.has(2)
          ? "STAGE 2 - PLAY"
          : `BUY STAGE 2 - ${STAGE_COSTS[2]} GOLD`,
        action: "stage2"
      },
      {
        label: "BACK TO TITLE",
        action: "back"
      }
    ];

    const startY = H * 0.39;
    const gap = 55;

    items.forEach((item, i) => {
      drawButton(
        item.label,
        W / 2,
        startY + i * gap,
        menuIndex === i,
        Math.min(W - 30, 350)
      );
    });

    text(
      "UP / DOWN: SELECT     SPACE: CONFIRM",
      W / 2,
      H * 0.78,
      12,
      C.muted,
      "center"
    );

    if (messageTimer > 0 && shopMessage) {
      text(
        shopMessage,
        W / 2,
        H * 0.87,
        13,
        C.orange,
        "center"
      );
    }
  }

  function drawPause() {
    text("PAUSED", W / 2, H * 0.27, 30, C.white, "center");

    drawButton(
      "RESUME",
      W / 2,
      H * 0.44,
      menuIndex === 0
    );

    drawButton(
      "GIVE UP - GO TO SHOP",
      W / 2,
      H * 0.53,
      menuIndex === 1,
      290
    );

    text(
      "UP / DOWN: SELECT     SPACE: CONFIRM",
      W / 2,
      H * 0.65,
      12,
      C.muted,
      "center"
    );
  }

  function drawGameOver() {
    text("GAME OVER", W / 2, H * 0.27, 32, C.pink, "center");

    text(
      `SURVIVED ${elapsed.toFixed(1)}s`,
      W / 2,
      H * 0.36,
      15,
      C.white,
      "center"
    );

    text(
      `GOLD: ${gold}  (+${runGold})`,
      W / 2,
      H * 0.43,
      15,
      C.gold,
      "center"
    );

    drawButton(
      "RETRY",
      W / 2,
      H * 0.55,
      menuIndex === 0
    );

    drawButton(
      "GO TO SHOP",
      W / 2,
      H * 0.64,
      menuIndex === 1
    );

    text(
      "UP / DOWN: SELECT     SPACE: CONFIRM",
      W / 2,
      H * 0.76,
      12,
      C.muted,
      "center"
    );
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();

    if (mode === "title") {
      drawTitle();
      return;
    }

    if (mode === "shop") {
      drawShop();
      return;
    }

    // The active battle is drawn behind the pause menu.
    if (
      mode === "playing" ||
      mode === "pause" ||
      mode === "gameover"
    ) {
      text(`STAGE ${stage}`, 18, 23, 15, C.white);
      text(`GOLD ${gold}`, W - 18, 23, 15, C.gold, "right");

      text(
        `HP ${"♥".repeat(Math.max(0, player.lives))}`,
        18,
        46,
        14,
        C.pink
      );

      text(
        `TIME ${elapsed.toFixed(1)}s`,
        W / 2,
        24,
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

    if (mode === "pause") {
      ctx.globalAlpha = 0.78;
      rect(0, 0, W, H, "#020812");
      ctx.globalAlpha = 1;
      drawPause();
    }

    if (mode === "gameover") {
      ctx.globalAlpha = 0.84;
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
  // Menu navigation
  // -------------------------

  function menuLength() {
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
      openShop();
      return;
    }

    if (mode === "shop") {
      if (menuIndex === 0) {
        startRun(1);
      } else if (menuIndex === 1) {
        if (unlockedStages.has(2)) {
          startRun(2);
        } else if (gold >= STAGE_COSTS[2]) {
          gold -= STAGE_COSTS[2];
          unlockedStages.add(2);
          shopMessage = "STAGE 2 UNLOCKED!";
          messageTimer = 2;
          startRun(2);
        } else {
          shopMessage = `GOLDが足りない！ あと${STAGE_COSTS[2] - gold} GOLD必要`;
          messageTimer = 3;
        }
      } else if (menuIndex === 2) {
        mode = "title";
      }

      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
        // Giving up ends the run and opens the shop.
        // Already collected GOLD is kept.
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
      mode = "title";
    } else if (mode === "gameover") {
      openShop();
    }
  }

  function keyDown(e) {
    const handled = [
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "Escape", "Enter"
    ];

    if (handled.includes(e.code)) {
      e.preventDefault();
    }

    // Ignore held-key repeat for menu actions.
    if (e.repeat && mode !== "playing") return;

    keys.add(e.code);

    if (e.code === "Escape") {
      handleEscape();
      return;
    }

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

  // Touch direction controls from rpg.html.
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
      } else if (mode === "gameover") {
        openShop();
      } else if (mode === "title") {
        openShop();
      } else if (mode === "shop") {
        confirmMenu();
      }
    });
  }

  // Tap the battle area to pause or resume.
  canvas.addEventListener("pointerdown", () => {
    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
    } else if (mode === "pause") {
      mode = "playing";
    } else if (mode === "title") {
      openShop();
    }
  });

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
