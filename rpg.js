
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const touchStart = document.getElementById("touch-start");

  const COLORS = {
    bg: "#07111b",
    panel: "#0b1723",
    line: "#26384b",
    white: "#e8edf4",
    muted: "#9eafc1",
    pink: "#ff6575",
    red: "#ff465e",
    orange: "#ffad55",
    gold: "#ffd166",
    blue: "#75c9ff",
    green: "#78e0ae"
  };

  let W = 960, H = 540, dpr = 1, lastTime = 0;
  let mode = "title";
  let stage = 1, unlockedStage = 1;
  let gold = 0, runGold = 0;
  let elapsed = 0, stageTime = 0, goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;

  let bullets = [];
  let edgeWarnings = [];
  let particles = [];

  let stage1ShotTimer = 0.5;
  let radialTimer = 1.7;
  let stage2EdgeTimer = 7.5;
  let patternTick = 0;

  const keys = new Set();
  const touchDirs = new Set();

  const player = {
    x: 0,
    y: 0,
    r: 5,
    speed: 310,
    invuln: 0,
    lives: 3
  };

  const enemy = {
    x: 0,
    y: 0,
    r: 20
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const rect = canvas.getBoundingClientRect();

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!player.x) resetPositions();

    draw();
  }

  function resetPositions() {
    player.x = W / 2;
    player.y = H * 0.78;

    enemy.x = W / 2;
    enemy.y = H * 0.19;
  }

  window.addEventListener("resize", resize);

  window.addEventListener("orientationchange", () => {
    setTimeout(resize, 100);
  });

  function startRun(selectedStage = 1) {
    stage = selectedStage;
    mode = "playing";

    runGold = 0;
    elapsed = 0;
    stageTime = 0;
    goldTimer = 0;
    hitFlash = 0;
    bulletSpeedMultiplier = 1;

    bullets = [];
    edgeWarnings = [];
    particles = [];

    stage1ShotTimer = 0.5;
    radialTimer = 1.7;
    stage2EdgeTimer = 7.5;
    patternTick = 0;

    player.lives = 3;
    player.invuln = 1.2;

    resetPositions();
  }

  function addGold(amount) {
    gold += amount;
    runGold += amount;
  }

  // 時間が経つほど敵の弾が速くなる
  function fire(x, y, angle, speed, radius = 4, color = COLORS.pink) {
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

  // プレイヤーを狙う弾
  function aimedShot(
    count = 1,
    spread = 0,
    speed = 190,
    color = COLORS.pink
  ) {
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
        4,
        color
      );
    }
  }

  // 敵から全方向へ弾を発射
  function radialShot(
    count = 12,
    speed = 125,
    offset = 0,
    color = COLORS.pink
  ) {
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;

      fire(
        enemy.x,
        enemy.y,
        angle,
        speed,
        4,
        color
      );
    }
  }

  // Stage 2：画面端付近に攻撃予告を出す
  function edgeBurst() {
    const side = Math.floor(Math.random() * 4);

    let x, y, base;

    if (side === 0) {
      x = rand(20, W - 20);
      y = 16;
      base = Math.PI / 2;
    } else if (side === 1) {
      x = W - 16;
      y = rand(20, H - 20);
      base = Math.PI;
    } else if (side === 2) {
      x = rand(20, W - 20);
      y = H - 16;
      base = -Math.PI / 2;
    } else {
      x = 16;
      y = rand(20, H - 20);
      base = 0;
    }

    edgeWarnings.push({
      x,
      y,
      life: 0.8,
      side,
      base,
      fired: false
    });
  }

  function update(dt) {
    // タイトルやゲームオーバーでは戦闘処理を止める
    if (mode !== "playing") return;

    elapsed += dt;
    stageTime += dt;
    patternTick += dt;

    /*
      30秒ごとに弾速アップ。
      30秒：1.28倍
      60秒：約1.61倍
      90秒：約2倍
      120秒：約2.5倍
      以降も段階的に加速する。
    */
    const speedTier = Math.floor(elapsed / 30);

    bulletSpeedMultiplier =
      1 +
      speedTier * 0.28 +
      speedTier * (speedTier - 1) * 0.055;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    // プレイヤー移動
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

    // 斜め移動が速くなりすぎないようにする
    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    player.x = clamp(
      player.x + dx * player.speed * dt,
      15,
      W - 15
    );

    player.y = clamp(
      player.y + dy * player.speed * dt,
      45,
      H - 20
    );

    // =========================
    // Stage 1：狙い撃ち＋全方位弾
    // =========================
    if (stage === 1) {
      stage1ShotTimer -= dt;
      radialTimer -= dt;

      // プレイヤーを狙う直線弾
      if (stage1ShotTimer <= 0) {
        aimedShot(1, 0, 190, COLORS.pink);

        stage1ShotTimer = Math.max(
          0.48,
          1.08 - stageTime * 0.012
        );
      }

      // ときどき全方位に弾を発射
      if (radialTimer <= 0) {
        radialShot(
          10,
          125 + Math.min(35, stageTime),
          patternTick * 0.22,
          COLORS.orange
        );

        radialTimer = 3.1;
      }
    }

    // =========================
    // Stage 2：放射状弾幕＋画面端攻撃
    // =========================
    else if (stage === 2) {
      radialTimer -= dt;

      if (radialTimer <= 0) {
        const count =
          14 + Math.min(8, Math.floor(stageTime / 8));

        const speed =
          145 + Math.min(45, stageTime);

        radialShot(
          count,
          speed,
          patternTick * 0.15,
          COLORS.pink
        );

        radialTimer = 2.15;
      }

      // 画面端付近からの攻撃
      stage2EdgeTimer -= dt;

      if (stage2EdgeTimer <= 0) {
        edgeBurst();
        stage2EdgeTimer = rand(7, 10);
      }
    }

    // 画面端の攻撃予告と発射
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {
        warning.fired = true;

        const count = 7;

        for (let i = 0; i < count; i++) {
          fire(
            warning.x,
            warning.y,
            warning.base +
              (i - (count - 1) / 2) * 0.16,
            220,
            4,
            COLORS.orange
          );
        }
      }
    }

    edgeWarnings = edgeWarnings.filter(
      warning => warning.life > -0.7
    );

    // 弾の移動と当たり判定
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
        player.lives--;
        player.invuln = 1.25;
        hitFlash = 0.2;
        bullet.dead = true;

        for (let i = 0; i < 8; i++) {
          particles.push({
            x: player.x,
            y: player.y,
            vx: rand(-65, 65),
            vy: rand(-65, 65),
            life: 0.35,
            color: COLORS.pink
          });
        }

        if (player.lives <= 0) {
          mode = "gameover";
        }
      }
    }

    bullets = bullets.filter(
      bullet =>
        !bullet.dead &&
        bullet.x > -30 &&
        bullet.x < W + 30 &&
        bullet.y > -30 &&
        bullet.y < H + 30
    );

    // ダメージ演出の粒子
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }

    particles = particles.filter(
      particle => particle.life > 0
    );

    /*
      GOLD獲得：
      10秒ごとに1 GOLDを基本とする。
      30秒経過ごとに獲得量が2倍になる。

      0〜29秒   ：1 GOLD
      30〜59秒  ：2 GOLD
      60〜89秒  ：4 GOLD
      90〜119秒 ：8 GOLD
      120〜149秒：16 GOLD
    */
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      const reward = 2 ** goldTier;

      addGold(reward);
    }

    // 時間によるステージクリアは行わない。
    // HPがなくなるまで生き残り続ける。
  }

  function pixelText(
    text,
    x,
    y,
    size,
    color = COLORS.white,
    align = "left"
  ) {
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
    ctx.restore();
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

  // シンプルなドット絵の敵
  function drawEnemy() {
    const x = enemy.x;
    const y = enemy.y;

    rect(x - 18, y - 14, 36, 28, COLORS.pink);
    rect(x - 23, y - 7, 5, 14, COLORS.pink);
    rect(x + 18, y - 7, 5, 14, COLORS.pink);

    rect(x - 12, y - 19, 7, 5, COLORS.pink);
    rect(x + 5, y - 19, 7, 5, COLORS.pink);

    rect(x - 10, y - 2, 6, 5, COLORS.bg);
    rect(x + 4, y - 2, 6, 5, COLORS.bg);
    rect(x - 7, y + 7, 14, 3, COLORS.bg);
  }

  // 赤いドットのプレイヤー
  function drawPlayer() {
    if (
      player.invuln > 0 &&
      Math.floor(player.invuln * 12) % 2 === 0
    ) {
      return;
    }

    rect(
      player.x - 3,
      player.y - 7,
      6,
      14,
      COLORS.red
    );

    rect(
      player.x - 7,
      player.y - 3,
      14,
      6,
      COLORS.red
    );

    rect(
      player.x - 2,
      player.y - 2,
      4,
      4,
      "#ff9aa5"
    );
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rect(0, 0, W, H, COLORS.bg);

    // 薄いドットグリッド
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    ctx.globalAlpha = 0.14;

    for (let x = 20; x < W; x += 32) {
      rect(x, 0, 1, H, "#1d3042");
    }

    for (let y = 20; y < H; y += 32) {
      rect(0, y, W, 1, "#1d3042");
    }

    ctx.globalAlpha = 1;

    // タイトル画面
    if (mode === "title") {
      drawEnemy();

      pixelText(
        "RUU RPG",
        W / 2,
        H * 0.36,
        Math.max(22, Math.min(38, W * 0.045)),
        COLORS.white,
        "center"
      );

      pixelText(
        "DODGE  -  SURVIVE  -  COLLECT GOLD",
        W / 2,
        H * 0.45,
        Math.max(10, Math.min(16, W * 0.018)),
        COLORS.muted,
        "center"
      );

      if (Math.floor(performance.now() / 450) % 2 === 0) {
        pixelText(
          "PRESS SPACE / ENTER",
          W / 2,
          H * 0.65,
          Math.max(14, Math.min(22, W * 0.024)),
          COLORS.white,
          "center"
        );
      }

      pixelText(
        "MOVE: ARROW KEYS / WASD",
        W / 2,
        H * 0.75,
        12,
        COLORS.muted,
        "center"
      );

      pixelText(
        `GOLD ${gold}`,
        W - 24,
        28,
        16,
        COLORS.gold,
        "right"
      );

      return;
    }

    // HUD
    pixelText(`STAGE ${stage}`, 22, 26, 17, COLORS.white);

    pixelText(
      `GOLD ${gold}`,
      W - 22,
      26,
      17,
      COLORS.gold,
      "right"
    );

    pixelText(
      `HP ${"♥".repeat(Math.max(0, player.lives))}`,
      22,
      51,
      15,
      COLORS.pink
    );

    if (mode === "playing") {
      drawEnemy();

      // 画面端の攻撃予告
      for (const warning of edgeWarnings) {
        if (warning.life > 0) {
          ctx.globalAlpha =
            Math.floor(performance.now() / 100) % 2
              ? 0.8
              : 0.3;

          rect(
            warning.x - 7,
            warning.y - 7,
            14,
            14,
            COLORS.orange
          );

          ctx.globalAlpha = 1;
        }
      }

      // 敵の弾
      for (const bullet of bullets) {
        rect(
          bullet.x - bullet.r,
          bullet.y - bullet.r,
          bullet.r * 2,
          bullet.r * 2,
          bullet.color
        );

        rect(
          bullet.x - 1,
          bullet.y - 1,
          2,
          2,
          "#fff0d0"
        );
      }

      // ダメージ演出
      for (const particle of particles) {
        rect(
          particle.x,
          particle.y,
          3,
          3,
          particle.color
        );
      }

      drawPlayer();

      pixelText(
        `TIME ${stageTime.toFixed(1)}s`,
        W / 2,
        28,
        15,
        COLORS.white,
        "center"
      );

      pixelText(
        `BULLET x${bulletSpeedMultiplier.toFixed(2)}`,
        W / 2,
        49,
        11,
        COLORS.orange,
        "center"
      );
    }

    // ステージ選択
    else if (mode === "stages") {
      pixelText(
        "STAGE SELECT",
        W / 2,
        H * 0.2,
        25,
        COLORS.white,
        "center"
      );

      pixelText(
        `YOUR GOLD: ${gold}`,
        W / 2,
        H * 0.29,
        16,
        COLORS.gold,
        "center"
      );

      drawStageCard(1, W * 0.28, H * 0.43);
      drawStageCard(2, W * 0.72, H * 0.43);

      pixelText(
        "PRESS 1 OR 2 TO ENTER",
        W / 2,
        H * 0.75,
        15,
        COLORS.muted,
        "center"
      );

      pixelText(
        "STAGE 2 UNLOCK: 50 GOLD",
        W / 2,
        H * 0.82,
        12,
        COLORS.muted,
        "center"
      );

      pixelText(
        "ESC: TITLE",
        W / 2,
        H * 0.9,
        12,
        COLORS.muted,
        "center"
      );
    }

    // ゲームオーバー
    else if (mode === "gameover") {
      pixelText(
        "GAME OVER",
        W / 2,
        H * 0.35,
        34,
        COLORS.pink,
        "center"
      );

      pixelText(
        `SURVIVED ${stageTime.toFixed(1)}s`,
        W / 2,
        H * 0.45,
        16,
        COLORS.white,
        "center"
      );

      pixelText(
        `GOLD: ${gold}  (+${runGold})`,
        W / 2,
        H * 0.53,
        16,
        COLORS.gold,
        "center"
      );

      pixelText(
        "ENTER: RETRY    ESC: TITLE",
        W / 2,
        H * 0.68,
        15,
        COLORS.white,
        "center"
      );
    }

    if (hitFlash > 0) {
      ctx.globalAlpha = hitFlash * 1.5;
      rect(0, 0, W, H, COLORS.red);
      ctx.globalAlpha = 1;
    }
  }

  function drawStageCard(n, x, y) {
    const unlocked =
      n <= unlockedStage ||
      (n === 2 && gold >= 50);

    const w = Math.min(220, W * 0.34);
    const h = 100;

    rect(
      x - w / 2,
      y,
      w,
      h,
      unlocked ? "#112536" : "#111720"
    );

    ctx.strokeStyle = unlocked
      ? COLORS.blue
      : COLORS.line;

    ctx.strokeRect(x - w / 2, y, w, h);

    pixelText(
      `STAGE ${n}`,
      x,
      y + 28,
      17,
      unlocked ? COLORS.white : COLORS.muted,
      "center"
    );

    pixelText(
      unlocked
        ? (n === 1 ? "AIMED + RADIAL" : "RADIAL + EDGE")
        : "LOCKED",
      x,
      y + 57,
      11,
      unlocked ? COLORS.gold : COLORS.muted,
      "center"
    );

    if (unlocked) {
      pixelText(
        `[${n}]`,
        x,
        y + 80,
        13,
        COLORS.green,
        "center"
      );
    }
  }

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

  function keyDown(e) {
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space"
      ].includes(e.code)
    ) {
      e.preventDefault();
    }

    keys.add(e.code);

    if (
      mode === "title" &&
      ["Space", "Enter"].includes(e.code)
    ) {
      mode = "stages";
    } else if (
      mode === "gameover" &&
      e.code === "Enter"
    ) {
      startRun(stage);
    } else if (mode === "stages") {
      if (e.code === "Escape") {
        mode = "title";
      }

      if (
        e.code === "Digit1" ||
        e.code === "Numpad1"
      ) {
        startRun(1);
      }

      if (
        (e.code === "Digit2" ||
          e.code === "Numpad2") &&
        (unlockedStage >= 2 || gold >= 50)
      ) {
        if (gold >= 50 && unlockedStage < 2) {
          gold -= 50;
        }

        unlockedStage = 2;
        startRun(2);
      }
    }
  }

  function keyUp(e) {
    keys.delete(e.code);
  }

  window.addEventListener(
    "keydown",
    keyDown,
    { passive: false }
  );

  window.addEventListener("keyup", keyUp);

  // スマートフォン用の方向ボタン
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

  touchStart.addEventListener("click", () => {
    if (mode === "title") {
      mode = "stages";
    } else if (mode === "gameover") {
      startRun(stage);
    } else if (mode === "stages") {
      startRun(stage <= unlockedStage ? stage : 1);
    }
  });

  canvas.addEventListener("pointerdown", () => {
    if (mode === "title") {
      mode = "stages";
    }
  });

  resize();
  requestAnimationFrame(frame);
})();
