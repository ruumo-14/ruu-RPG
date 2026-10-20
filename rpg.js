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
    panel: "#101f30",
    purple: "#bb8cff",
    cyan: "#5df4e6"
  };

  let W = 960, H = 540, dpr = 1, lastTime = 0;

  // title, stageSelect, shop, playing, pause, gameover,
  // adminCode, adminPanel
  let mode = "title";
  let stage = 1;
  let unlockedStages = new Set([1]);

  let gold = 0;
  let runGold = 0;
  let elapsed = 0;
  let goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;
  // ショップで購入した永続アップグレード
  let healInterval = 0; // 0=未購入、60 / 45 / 30秒
  let healTimer = 0;
  let bonusMaxLives = 0;
  let bulletSlowUpgrade = false;
  let moveSpeedLevel = 0; // 0〜4、最大で通常速度の2倍

  let menuIndex = 0;
  let shopMessage = "";
  let messageTimer = 0;

  // 管理者機能
  const ADMIN_CODE = "O0p-@^";
  let adminCodeInput = "";
  let adminMessage = "";
  let adminMessageTimer = 0;

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
    maxLives: 3,
    invuln: 0
  };

  // 各ステージの購入価格。報酬と難易度が段階的に上がるよう設定。
  const STAGE_COSTS = {
    1: 0,
    2: 50,
    3: 250,
    4: 1000,
    5: 4000
  };

  // 10秒ごとの基本報酬。従来どおり30秒ごとに2倍になる。
  const STAGE_REWARDS = {
    1: 1,
    2: 3,
    3: 7,
    4: 15,
    5: 50
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

  // -------------------------
  // Enemy positions
  // -------------------------

  // 各ステージの敵配置。Stage 1は中央の敵のイラストを3体で共有する。
  function positionEnemies() {
    if (stage === 1) {
      enemies = [
        { x: W * 0.5, y: H * 0.16, name: "CENTER", type: "stage1-center" },
        { x: W * 0.19, y: H * 0.29, name: "LEFT", type: "stage1-center" },
        { x: W * 0.81, y: H * 0.29, name: "RIGHT", type: "stage1-center" }
      ];
      return;
    }

    if (stage === 4) {
      enemies = [
        { x: W * 0.34, y: H * 0.18, name: "LEFT GUARDIAN", type: "stage4-guardian" },
        { x: W * 0.66, y: H * 0.18, name: "RIGHT GUARDIAN", type: "stage4-guardian" }
      ];
      return;
    }

    const bossType = {
      2: "stage2-boss",
      3: "stage3-oracle",
      5: "stage5-final"
    }[stage] || "stage2-boss";

    const bossName = {
      2: "BOSS",
      3: "ORACLE",
      5: "FINAL BOSS"
    }[stage] || "BOSS";

    enemies = [
      { x: W * 0.5, y: H * 0.18, name: bossName, type: bossType }
    ];
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

  function openAdminCode() {
    mode = "adminCode";
    adminCodeInput = "";
    adminMessage = "";
    adminMessageTimer = 0;
  }

  function openAdminPanel() {
    mode = "adminPanel";
    menuIndex = 0;
    adminMessage = "";
    adminMessageTimer = 0;
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
    healTimer = 0;
    player.maxLives = 3 + bonusMaxLives;

    bullets = [];
    particles = [];
    edgeWarnings = [];

    shotTimers = [];
    radialTimers = [];

    // Stage 2は端から複数攻撃、Stage 5は終盤の追加バラージ。
    edgeTimer = stage === 2 ? 0.35 : stage === 5 ? 2.0 : 9999;
    patternTick = 0;

    player.lives = player.maxLives;
    player.invuln = 1.2;

    resetPlayer();
    positionEnemies();

    // 敵ごとに攻撃タイマーを設定。
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

  function fire(
    x,
    y,
    angle,
    speed,
    color = C.pink,
    radius = 4
  ) {
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
  function radialShot(
    enemy,
    count,
    speed,
    offset = 0,
    color = C.pink
  ) {
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
  function fanShot(
    enemy,
    count,
    spread,
    speed,
    color = C.orange
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
        color
      );
    }
  }

  // -------------------------
  // STAGE 2: edge attacks
  // -------------------------

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
      x,
      y,
      angle,
      // 予告を短くして、端攻撃が次々と押し寄せるようにする。
      life: 0.38,
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

    if (adminMessageTimer > 0) {
      adminMessageTimer -= dt;
    }

    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    /*
      Bullet acceleration increases every 30 seconds.

      0 seconds:    x1.00
      30 seconds:   x1.65
      60 seconds:   x2.45
      90 seconds:   x3.40
      120 seconds:  x4.50
      150 seconds:  x5.75
    */
    const tier = Math.floor(elapsed / 30);

    bulletSpeedMultiplier =
      (1 + 0.65 * tier + 0.15 * tier * (tier - 1) / 2) *
      (bulletSlowUpgrade ? 0.9 : 1);

    // 購入した自動回復。HPが最大のときは回復を保留せず、次の周期を待つ。
    if (healInterval > 0) {
      healTimer += dt;
      if (healTimer >= healInterval) {
        healTimer -= healInterval;
        if (player.lives < player.maxLives) {
          player.lives = Math.min(player.maxLives, player.lives + 1);
          shopMessage = "AUTO HEAL +1 HP";
          messageTimer = 1.2;
        }
      }
    }

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
      player.x + dx * player.speed * (1 + moveSpeedLevel * 0.25) * dt,
      12,
      W - 12
    );

    player.y = clamp(
      player.y + dy * player.speed * (1 + moveSpeedLevel * 0.25) * dt,
      45,
      H - 18
    );

    // =========================
    // STAGE 1: three enemies
    // ※既存の攻撃パターンを維持
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

        // Center = radial, left/right = fan attacks.
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
    // STAGE 2: radial + frequent multi-edge bursts
    // 画面端から2〜3方向の予告を同時に発生させる。
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
        // 4〜6方向から一斉に攻撃。間隔も短くして高密度の弾幕に。
        const burstCount = Math.random() < 0.55 ? 6 : 4 + Math.floor(Math.random() * 2);
        for (let i = 0; i < burstCount; i++) edgeBurst();
        edgeTimer = rand(0.22, 0.38);
      }
    }

    // =========================
    // STAGE 3: rotating cross-ring + aimed cyan fans
    // 複数方向の輪と、プレイヤーを狙う小さな扇状弾を交互に使う。
    // =========================
    if (stage === 3) {
      const enemy = enemies[0];
      shotTimers[0] -= dt;
      if (shotTimers[0] <= 0) {
        fanShot(enemy, 5, 0.62, 195 + Math.min(30, elapsed * 0.3), C.cyan);
        aimedShot(enemy, 225, C.blue);
        shotTimers[0] = Math.max(0.72, 1.45 - elapsed * 0.002);
      }

      radialTimers[0] -= dt;
      if (radialTimers[0] <= 0) {
        radialShot(enemy, 12, 142 + Math.min(25, elapsed * 0.25), patternTick * 0.48, C.cyan);
        radialShot(enemy, 4, 175, patternTick * 0.48 + Math.PI / 4, C.blue);
        radialTimers[0] = 3.0;
      }
    }

    // =========================
    // STAGE 4: twin guardians + crossed fans
    // 左右の守護者が交互に扇状弾を撃ち、周期的に輪を重ねる。
    // =========================
    if (stage === 4) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        shotTimers[i] -= dt;
        if (shotTimers[i] <= 0) {
          fanShot(enemy, 7, 0.78, 205 + Math.min(35, elapsed * 0.25), i === 0 ? C.orange : C.pink);
          aimedShot(enemy, 220, C.purple);
          shotTimers[i] = Math.max(0.72, 1.15 - elapsed * 0.0015) + i * 0.16;
        }

        radialTimers[i] -= dt;
        if (radialTimers[i] <= 0) {
          radialShot(enemy, 10, 148, (i === 0 ? 1 : -1) * patternTick * 0.22, i === 0 ? C.orange : C.pink);
          fanShot(enemy, 5, 1.25, 178, C.purple);
          radialTimers[i] = 3.25 + i * 0.45;
        }
      }
    }

    // =========================
    // STAGE 5: final spiral + heavy edge barrage
    // 回転する20方向の弾幕、狙い撃ちの扇、端からの追加攻撃。
    // =========================
    if (stage === 5) {
      const enemy = enemies[0];
      shotTimers[0] -= dt;
      if (shotTimers[0] <= 0) {
        fanShot(enemy, 7, 1.02, 230 + Math.min(45, elapsed * 0.25), C.red);
        aimedShot(enemy, 250, C.orange);
        shotTimers[0] = Math.max(0.62, 0.95 - elapsed * 0.001);
      }

      radialTimers[0] -= dt;
      if (radialTimers[0] <= 0) {
        radialShot(enemy, 20, 150 + Math.min(35, elapsed * 0.3), patternTick * 0.56, C.purple);
        radialShot(enemy, 8, 185, -patternTick * 0.38, C.cyan);
        radialTimers[0] = 2.45;
      }

      edgeTimer -= dt;
      if (edgeTimer <= 0) {
        const burstCount = Math.random() < 0.6 ? 3 : 2;
        for (let i = 0; i < burstCount; i++) edgeBurst();
        edgeTimer = rand(2.0, 2.8);
      }
    }

    // Edge warnings become attacks after a short delay.
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {
        warning.fired = true;

        // 9発の扇状弾を速めに放ち、複数の端攻撃が重なるようにする。
        for (let i = -4; i <= 4; i++) {
          fire(
            warning.x,
            warning.y,
            warning.angle + i * 0.12,
            270,
            C.orange,
            3.5
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

    // -------------------------
    // GOLD rewards
    // -------------------------
    // STAGE 1: 10秒ごとに1 GOLDを基準にする。
    // STAGE 2: 10秒ごとに3 GOLDを基準にする。
    // 30秒ごとに報酬が2倍になる。
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      const baseReward = STAGE_REWARDS[stage] || 1;
      const reward = baseReward * Math.pow(2, goldTier);

      addGold(reward);
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

  // -------------------------
  // Pixel-art enemies
  // -------------------------

  function drawEnemy(enemy, index) {
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);

    // STAGE 2: unique large purple boss.
    if (enemy.type === "stage2-boss") {
      // Outer horns.
      rect(x - 24, y - 19, 7, 12, C.purple);
      rect(x + 17, y - 19, 7, 12, C.purple);
      rect(x - 29, y - 25, 8, 8, C.cyan);
      rect(x + 21, y - 25, 8, 8, C.cyan);

      // Main armor.
      rect(x - 22, y - 12, 44, 25, C.purple);
      rect(x - 16, y - 19, 32, 7, C.purple);
      rect(x - 28, y - 5, 6, 13, C.purple);
      rect(x + 22, y - 5, 6, 13, C.purple);

      // Armor highlights.
      rect(x - 15, y - 8, 7, 5, C.cyan);
      rect(x + 8, y - 8, 7, 5, C.cyan);
      rect(x - 7, y - 14, 14, 4, C.blue);

      // Eyes.
      rect(x - 13, y - 2, 8, 7, C.red);
      rect(x + 5, y - 2, 8, 7, C.red);
      rect(x - 10, y, 3, 3, C.white);
      rect(x + 8, y, 3, 3, C.white);

      // Mouth and lower armor.
      rect(x - 8, y + 9, 16, 4, C.bg);
      rect(x - 13, y + 14, 8, 6, C.purple);
      rect(x + 5, y + 14, 8, 6, C.purple);
      rect(x - 4, y + 15, 8, 4, C.cyan);

      // Side energy blocks.
      rect(x - 34, y - 1, 4, 7, C.cyan);
      rect(x + 30, y - 1, 4, 7, C.cyan);
      return;
    }

    // STAGE 3: cyan oracle with a rotating crystal.
    if (enemy.type === "stage3-oracle") {
      rect(x - 19, y - 14, 38, 28, C.cyan);
      rect(x - 11, y - 22, 22, 8, C.blue);
      rect(x - 5, y - 29, 10, 7, C.white);
      rect(x - 12, y - 5, 7, 8, C.bg);
      rect(x + 5, y - 5, 7, 8, C.bg);
      rect(x - 9, y - 3, 2, 3, C.white);
      rect(x + 8, y - 3, 2, 3, C.white);
      rect(x - 7, y + 8, 14, 4, C.blue);
      rect(x - 27, y - 1, 7, 5, C.blue);
      rect(x + 20, y - 1, 7, 5, C.blue);
      rect(x - 4, y + 14, 8, 7, C.cyan);
      return;
    }

    // STAGE 4: twin armored guardians.
    if (enemy.type === "stage4-guardian") {
      rect(x - 20, y - 13, 40, 27, C.orange);
      rect(x - 26, y - 6, 6, 14, C.purple);
      rect(x + 20, y - 6, 6, 14, C.purple);
      rect(x - 14, y - 21, 8, 8, C.gold);
      rect(x + 6, y - 21, 8, 8, C.gold);
      rect(x - 12, y - 3, 8, 7, C.bg);
      rect(x + 4, y - 3, 8, 7, C.bg);
      rect(x - 10, y - 1, 3, 3, C.white);
      rect(x + 6, y - 1, 3, 3, C.white);
      rect(x - 8, y + 8, 16, 4, C.bg);
      rect(x - 15, y + 14, 9, 6, C.orange);
      rect(x + 6, y + 14, 9, 6, C.orange);
      return;
    }

    // STAGE 5: final boss, larger dark core with crimson horns.
    if (enemy.type === "stage5-final") {
      rect(x - 29, y - 19, 58, 37, C.purple);
      rect(x - 22, y - 28, 12, 10, C.red);
      rect(x + 10, y - 28, 12, 10, C.red);
      rect(x - 15, y - 34, 8, 9, C.orange);
      rect(x + 7, y - 34, 8, 9, C.orange);
      rect(x - 20, y - 11, 12, 10, C.red);
      rect(x + 8, y - 11, 12, 10, C.red);
      rect(x - 16, y - 8, 4, 4, C.white);
      rect(x + 12, y - 8, 4, 4, C.white);
      rect(x - 12, y + 5, 24, 5, C.bg);
      rect(x - 18, y + 19, 10, 8, C.purple);
      rect(x + 8, y + 19, 10, 8, C.purple);
      rect(x - 5, y + 19, 10, 5, C.cyan);
      rect(x - 37, y - 1, 7, 10, C.cyan);
      rect(x + 30, y - 1, 7, 10, C.cyan);
      return;
    }

    // STAGE 1 LEFT: orange square robot.
    if (enemy.type === "stage1-left") {
      rect(x - 17, y - 12, 34, 25, C.orange);
      rect(x - 22, y - 5, 5, 12, C.orange);
      rect(x + 17, y - 5, 5, 12, C.orange);

      // Antenna.
      rect(x - 2, y - 20, 4, 8, C.orange);
      rect(x - 5, y - 24, 10, 4, C.gold);

      // Eyes.
      rect(x - 10, y - 5, 7, 7, C.bg);
      rect(x + 3, y - 5, 7, 7, C.bg);
      rect(x - 8, y - 3, 3, 3, C.white);
      rect(x + 5, y - 3, 3, 3, C.white);

      // Mouth.
      rect(x - 6, y + 6, 12, 3, C.bg);

      // Feet.
      rect(x - 12, y + 13, 7, 5, C.gold);
      rect(x + 5, y + 13, 7, 5, C.gold);
      return;
    }

    // STAGE 1 RIGHT: red winged enemy.
    if (enemy.type === "stage1-right") {
      rect(x - 13, y - 10, 26, 22, C.red);

      // Wings.
      rect(x - 24, y - 12, 11, 6, C.orange);
      rect(x - 29, y - 6, 16, 6, C.orange);
      rect(x + 13, y - 12, 11, 6, C.orange);
      rect(x + 13, y - 6, 16, 6, C.orange);

      // Top spikes.
      rect(x - 10, y - 17, 5, 7, C.red);
      rect(x + 5, y - 17, 5, 7, C.red);

      // Eyes.
      rect(x - 8, y - 3, 5, 6, C.bg);
      rect(x + 3, y - 3, 5, 6, C.bg);
      rect(x - 7, y - 2, 2, 3, C.white);
      rect(x + 4, y - 2, 2, 3, C.white);

      // Mouth and tail.
      rect(x - 5, y + 6, 10, 3, C.bg);
      rect(x - 3, y + 12, 6, 7, C.red);
      return;
    }

    // STAGE 1 CENTER: pink core enemy.
    rect(x - 16, y - 13, 32, 26, C.pink);
    rect(x - 21, y - 6, 5, 12, C.pink);
    rect(x + 16, y - 6, 5, 12, C.pink);

    // Crown.
    rect(x - 12, y - 18, 6, 5, C.pink);
    rect(x - 3, y - 21, 6, 8, C.pink);
    rect(x + 6, y - 18, 6, 5, C.pink);

    // Eyes.
    rect(x - 9, y - 3, 6, 6, C.bg);
    rect(x + 3, y - 3, 6, 6, C.bg);
    rect(x - 7, y - 2, 2, 2, C.white);
    rect(x + 5, y - 2, 2, 2, C.white);

    // Mouth.
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

    rect(
      bullet.x - 1,
      bullet.y - 1,
      2,
      2,
      "#fff0d0"
    );
  }

  function drawButton(
    label,
    x,
    y,
    selected,
    width = 300,
    height = 48
  ) {
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
    drawEnemy({
      x: W / 2,
      y: H * 0.16,
      type: "stage1-center"
    }, 0);

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

    drawButton(
      "GAME START",
      W / 2,
      H * 0.53,
      menuIndex === 0,
      Math.min(W - 40, 380),
      64
    );

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
    text("SELECT STAGE", W / 2, H * 0.105, 25, C.white, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.17, 15, C.gold, "center");

    const descriptions = {
      1: "AIMED + RADIAL + FAN",
      2: "RADIAL + MULTI EDGE BURSTS",
      3: "ROTATING CROSS RING + CYAN FANS",
      4: "TWIN GUARDIANS + CROSSED FANS",
      5: "FINAL SPIRAL + EDGE BARRAGE"
    };

    const items = [];
    for (let target = 1; target <= 5; target++) {
      const unlocked = unlockedStages.has(target);
      items.push({
        label: target === 1 ? "STAGE 1 - PLAY" : `STAGE ${target} - ${unlocked ? "PLAY" : "LOCKED"}`,
        detail: unlocked
          ? `${descriptions[target]} | ${STAGE_REWARDS[target]} GOLD / 10S`
          : `BUY FOR ${STAGE_COSTS[target]} GOLD IN SHOP`,
        unlocked
      });
    }
    items.push({ label: "BACK", detail: "RETURN TO TITLE", unlocked: true });

    const startY = H * 0.26;
    const gap = Math.min(47, H * 0.096);
    items.forEach((item, i) => {
      drawButton(item.label, W / 2, startY + i * gap, menuIndex === i, Math.min(W - 28, 420), 36);
      text(item.detail, W / 2, startY + i * gap + 20, 9, item.unlocked ? C.muted : C.orange, "center");
    });

    text("UP / DOWN: SELECT   SPACE: CONFIRM", W / 2, H * 0.93, 11, C.muted, "center");
  }

  // -------------------------
  // Shop
  // -------------------------

  function getShopItems() {
    const items = [];
    for (let target = 2; target <= 5; target++) {
      const owned = unlockedStages.has(target);
      items.push({
        kind: "stage",
        target,
        label: owned ? `PLAY STAGE ${target}` : `UNLOCK STAGE ${target}`,
        detail: owned
          ? `OWNED - ${STAGE_REWARDS[target]} GOLD / 10S`
          : `COST: ${STAGE_COSTS[target]} GOLD | REWARD: ${STAGE_REWARDS[target]} / 10S`
      });
    }
    items.push({ kind: "stage", target: 1, label: "PLAY STAGE 1", detail: "FREE - 1 GOLD / 10S" });
    items.push({
      kind: "heal",
      target: 60,
      label: healInterval === 60 ? "AUTO HEAL (OWNED)" : "AUTO HEAL - EVERY 60 SEC",
      detail: healInterval === 60 ? "OWNED - HEAL 1 HP EVERY 60 SEC" : "COST: 10 GOLD"
    });
    items.push({
      kind: "heal",
      target: 45,
      label: healInterval === 45 ? "AUTO HEAL LV2 (OWNED)" : "AUTO HEAL LV2 - EVERY 45 SEC",
      detail: healInterval === 45 ? "OWNED - HEAL 1 HP EVERY 45 SEC" : "COST: 20 GOLD - REQUIRES LV1"
    });
    items.push({
      kind: "heal",
      target: 30,
      label: healInterval === 30 ? "AUTO HEAL LV3 (OWNED)" : "AUTO HEAL LV3 - EVERY 30 SEC",
      detail: healInterval === 30 ? "OWNED - HEAL 1 HP EVERY 30 SEC" : "COST: 30 GOLD - REQUIRES LV2"
    });
    for (let level = 1; level <= 4; level++) {
      const cost = level * 15;
      items.push({
        kind: "speed",
        target: level,
        label: moveSpeedLevel >= level ? `MOVE SPEED LV${level} (OWNED)` : `MOVE SPEED LV${level} - ${(1 + level * 0.25).toFixed(2)}X`,
        detail: moveSpeedLevel >= level ? "OWNED" : `COST: ${cost} GOLD${level === moveSpeedLevel + 1 ? "" : " - REQUIRES PREVIOUS LV"}`
      });
    }
    items.push({
      kind: "maxhp",
      target: 1,
      label: bonusMaxLives ? "HEART CONTAINER (OWNED)" : "HEART CONTAINER - +1 MAX HP",
      detail: bonusMaxLives ? "OWNED - START EACH RUN WITH 4 HP" : "COST: 35 GOLD"
    });
    items.push({
      kind: "slow",
      target: 1,
      label: bulletSlowUpgrade ? "BULLET GUARD (OWNED)" : "BULLET GUARD - 10% SLOWER BULLETS",
      detail: bulletSlowUpgrade ? "OWNED - BULLETS 10% SLOWER" : "COST: 80 GOLD"
    });
    items.push({ kind: "back", target: 0, label: "BACK TO TITLE", detail: "RETURN TO MAIN MENU" });
    return items;
  }

  function drawShop() {
    text("SHOP", W / 2, H * 0.07, 25, C.gold, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.125, 14, C.white, "center");
    const items = getShopItems();
    const startY = H * 0.19;
    const gap = Math.min(38, H * 0.071);
    items.forEach((item, i) => {
      const y = startY + i * gap;
      drawButton(item.label, W / 2, y, menuIndex === i, Math.min(W - 24, 460), 29);
      text(item.detail, W / 2, y + 15, 8, C.muted, "center");
    });

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.91, 10, C.orange, "center");
    }
    text("UP / DOWN: SELECT   SPACE: CONFIRM", W / 2, H * 0.96, 9, C.muted, "center");
    text("ADMIN: CTRL + SHIFT + 5", W / 2, H * 0.99, 8, C.muted, "center");
  }

  // -------------------------
  // Admin code screen
  // -------------------------

  function drawAdminCode() {
    text(
      "ADMIN ACCESS",
      W / 2,
      H * 0.25,
      28,
      C.purple,
      "center"
    );

    text(
      "ENTER ADMIN CODE",
      W / 2,
      H * 0.38,
      16,
      C.white,
      "center"
    );

    // 入力されたコードを表示する。
    // パスワードの文字は●で隠す。
    const masked = "*".repeat(adminCodeInput.length);

    rect(
      W / 2 - 155,
      H * 0.48 - 22,
      310,
      44,
      C.panel
    );

    ctx.strokeStyle = C.purple;
    ctx.lineWidth = 2;

    ctx.strokeRect(
      W / 2 - 155,
      H * 0.48 - 22,
      310,
      44
    );

    text(
      masked || "_ _ _ _ _ _",
      W / 2,
      H * 0.48,
      22,
      C.gold,
      "center"
    );

    text(
      "TYPE CODE, THEN PRESS ENTER",
      W / 2,
      H * 0.61,
      12,
      C.muted,
      "center"
    );

    text(
      "ESC: BACK TO SHOP",
      W / 2,
      H * 0.69,
      12,
      C.muted,
      "center"
    );

    if (adminMessageTimer > 0 && adminMessage) {
      text(
        adminMessage,
        W / 2,
        H * 0.78,
        13,
        C.orange,
        "center"
      );
    }
  }

  // -------------------------
  // Admin panel
  // -------------------------

  function drawAdminPanel() {
    text(
      "ADMIN PANEL",
      W / 2,
      H * 0.18,
      30,
      C.purple,
      "center"
    );

    text(
      `CURRENT GOLD: ${gold}`,
      W / 2,
      H * 0.29,
      19,
      C.gold,
      "center"
    );

    const items = [
      "ADD 100 GOLD",
      "ADD 1,000 GOLD",
      "ADD 10,000 GOLD",
      "BACK TO SHOP"
    ];

    const startY = H * 0.42;
    const gap = Math.min(58, H * 0.115);

    items.forEach((label, i) => {
      drawButton(
        label,
        W / 2,
        startY + i * gap,
        menuIndex === i,
        Math.min(W - 36, 360),
        42
      );
    });

    if (adminMessageTimer > 0 && adminMessage) {
      text(
        adminMessage,
        W / 2,
        H * 0.88,
        13,
        C.green,
        "center"
      );
    }

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.96,
      11,
      C.muted,
      "center"
    );
  }

  function drawPause() {
    text("PAUSED", W / 2, H * 0.3, 30, C.white, "center");

    drawButton(
      "RESUME",
      W / 2,
      H * 0.45,
      menuIndex === 0
    );

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
    text(
      "GAME OVER",
      W / 2,
      H * 0.26,
      32,
      C.pink,
      "center"
    );

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

    drawButton(
      "RETRY",
      W / 2,
      H * 0.55,
      menuIndex === 0
    );

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
      `HP ${"♥".repeat(Math.max(0, player.lives))}${"♡".repeat(Math.max(0, player.maxLives - player.lives))}`,
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
          Math.floor(performance.now() / 100) % 2
            ? 0.8
            : 0.3;

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

  // -------------------------
  // Main drawing
  // -------------------------

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

    if (mode === "adminCode") {
      drawAdminCode();
      return;
    }

    if (mode === "adminPanel") {
      drawAdminPanel();
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
    if (mode === "stageSelect") return 6;
    if (mode === "shop") return getShopItems().length;
    if (mode === "pause") return 2;
    if (mode === "gameover") return 2;
    if (mode === "adminPanel") return 4;

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
      if (menuIndex >= 0 && menuIndex <= 4) {
        const selectedStage = menuIndex + 1;
        if (unlockedStages.has(selectedStage)) {
          startRun(selectedStage);
        } else {
          openShop();
          menuIndex = selectedStage - 2;
          shopMessage = `Stage ${selectedStage}を購入してね`;
          messageTimer = 3;
        }
      } else {
        showTitle();
      }
      return;
    }

    if (mode === "shop") {
      const item = getShopItems()[menuIndex];
      if (!item) return;

      if (item.kind === "stage") {
        const selectedStage = item.target;
        if (unlockedStages.has(selectedStage)) {
          startRun(selectedStage);
        } else if (gold >= STAGE_COSTS[selectedStage]) {
          gold -= STAGE_COSTS[selectedStage];
          unlockedStages.add(selectedStage);
          shopMessage = `STAGE ${selectedStage} UNLOCKED!`;
          messageTimer = 2.5;
        } else {
          shopMessage = `GOLDが足りない！ あと${STAGE_COSTS[selectedStage] - gold} GOLD必要`;
          messageTimer = 3;
        }
      } else if (item.kind === "heal") {
        const level = item.target === 60 ? 1 : item.target === 45 ? 2 : 3;
        const currentLevel = healInterval === 0 ? 0 : healInterval === 60 ? 1 : healInterval === 45 ? 2 : 3;
        const costs = { 60: 10, 45: 20, 30: 30 };
        if (currentLevel >= level) {
          shopMessage = "その回復レベルは購入済みだよ";
          messageTimer = 2;
        } else if (level !== currentLevel + 1) {
          shopMessage = "先にひとつ前のレベルを購入してね";
          messageTimer = 2.5;
        } else if (gold < costs[item.target]) {
          shopMessage = `GOLDが足りない！ あと${costs[item.target] - gold} GOLD必要`;
          messageTimer = 2.5;
        } else {
          gold -= costs[item.target];
          healInterval = item.target;
          healTimer = 0;
          shopMessage = `AUTO HEAL LV${level} PURCHASED!`;
          messageTimer = 2.5;
        }
      } else if (item.kind === "speed") {
        const level = item.target;
        const cost = level * 15;
        if (moveSpeedLevel >= level) {
          shopMessage = "その移動速度レベルは購入済みだよ";
          messageTimer = 2;
        } else if (level !== moveSpeedLevel + 1) {
          shopMessage = "先にひとつ前のレベルを購入してね";
          messageTimer = 2.5;
        } else if (gold < cost) {
          shopMessage = "GOLDが足りない！ あと" + (cost - gold) + " GOLD必要";
          messageTimer = 2.5;
        } else {
          gold -= cost;
          moveSpeedLevel = level;
          shopMessage = `MOVE SPEED LV${level} PURCHASED!`;
          messageTimer = 2.5;
        }
      } else if (item.kind === "maxhp") {
        if (bonusMaxLives) {
          shopMessage = "HEART CONTAINERは購入済みだよ";
          messageTimer = 2;
        } else if (gold < 35) {
          shopMessage = "GOLDが足りない！ あと" + (35 - gold) + " GOLD必要";
          messageTimer = 2.5;
        } else {
          gold -= 35;
          bonusMaxLives = 1;
          shopMessage = "MAX HP +1 PURCHASED!";
          messageTimer = 2.5;
        }
      } else if (item.kind === "slow") {
        if (bulletSlowUpgrade) {
          shopMessage = "BULLET GUARDは購入済みだよ";
          messageTimer = 2;
        } else if (gold < 80) {
          shopMessage = "GOLDが足りない！ あと" + (80 - gold) + " GOLD必要";
          messageTimer = 2.5;
        } else {
          gold -= 80;
          bulletSlowUpgrade = true;
          shopMessage = "BULLET GUARD PURCHASED!";
          messageTimer = 2.5;
        }
      } else if (item.kind === "back") {
        showTitle();
      }
      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
        // バトルを終了してショップへ戻る。
        // 獲得済みGOLDは保持する。
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

      return;
    }

    if (mode === "adminPanel") {
      if (menuIndex === 0) {
        addGold(100);
        adminMessage = "100 GOLD ADDED!";
        adminMessageTimer = 2;
      } else if (menuIndex === 1) {
        addGold(1000);
        adminMessage = "1,000 GOLD ADDED!";
        adminMessageTimer = 2;
      } else if (menuIndex === 2) {
        addGold(10000);
        adminMessage = "10,000 GOLD ADDED!";
        adminMessageTimer = 2;
      } else {
        openShop();
      }
    }
  }

  // -------------------------
  // Admin code checking
  // -------------------------

  function submitAdminCode() {
    if (adminCodeInput === ADMIN_CODE) {
      openAdminPanel();
    } else {
      adminMessage = "CODE INCORRECT";
      adminMessageTimer = 2;
      adminCodeInput = "";
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
    } else if (mode === "adminCode" || mode === "adminPanel") {
      openShop();
    }
  }

  // -------------------------
  // Keyboard controls
  // -------------------------

  function keyDown(e) {
    const menuKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "Escape",
      "Enter"
    ];

    if (menuKeys.includes(e.code)) {
      e.preventDefault();
    }

    // 管理者画面でのコード入力。
    if (mode === "adminCode") {
      if (e.code === "Escape") {
        e.preventDefault();
        openShop();
        return;
      }

      if (e.code === "Enter") {
        e.preventDefault();
        submitAdminCode();
        return;
      }

      if (e.code === "Backspace") {
        e.preventDefault();
        adminCodeInput = adminCodeInput.slice(0, -1);
        return;
      }

      // Ctrl / Shiftなどの修飾キーだけでは入力しない。
      if (
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();

        // コードの長さを超えた入力を防止。
        if (adminCodeInput.length < ADMIN_CODE.length) {
          adminCodeInput += e.key;
        }
      }

      return;
    }

    // ショップ画面で Ctrl + Shift + 5 を押すと管理者コード画面へ。
    // Shift + 5 はキーボードによって "%" として検出されることもある。
    if (
      mode === "shop" &&
      e.ctrlKey &&
      e.shiftKey &&
      (
        e.code === "Digit5" ||
        e.key === "%" ||
        e.key === "5"
      )
    ) {
      e.preventDefault();
      openAdminCode();
      return;
    }

    if (e.repeat && mode !== "playing") return;

    keys.add(e.code);

    if (e.code === "Escape") {
      handleEscape();
      return;
    }

    // バトル中は矢印キーとWASDで移動。
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
      } else if (mode === "adminPanel") {
        confirmMenu();
      }
    });
  }

  // -------------------------
  // Canvas mouse/touch clicks
  // -------------------------

  canvas.addEventListener("pointerdown", e => {
    const rectBounds = canvas.getBoundingClientRect();

    const x = e.clientX - rectBounds.left;
    const y = e.clientY - rectBounds.top;

    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
      return;
    }

    if (mode === "adminCode") {
      // コード入力はキーボードで行う。
      return;
    }

    if (mode === "adminPanel") {
      const startY = H * 0.42;
      const gap = Math.min(58, H * 0.115);
      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index < 4) {
        menuIndex = index;
        confirmMenu();
      }

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
      const startY = H * 0.26;
      const gap = Math.min(47, H * 0.096);
      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index < 6) {
        menuIndex = index;
        confirmMenu();
      }

      return;
    }

    if (mode === "shop") {
      const startY = H * 0.19;
      const gap = Math.min(38, H * 0.071);
      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index < getShopItems().length) {
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
