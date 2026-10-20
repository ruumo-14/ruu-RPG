(() => {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) {
    console.error('canvas id="game" が見つかりません。');
    return;
  }

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
    purple: "#a78bfa",
    panel: "#101f30"
  };

  let W = 960;
  let H = 540;
  let dpr = 1;
  let lastTime = 0;

  let mode = "title";
  let stage = 1;
  let gold = 0;
  let runGold = 0;
  let elapsed = 0;
  let goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;

  let menuIndex = 0;
  let shopMessage = "";
  let messageTimer = 0;
  let adminInput = "";
  const ADMIN_CODE = "O0p-@^";

  const unlockedStages = new Set([1]);

  const upgrades = {
    speed: 0,
    hearts: 0,
    heal: 0,
    guard: 0
  };

  const UPGRADE_COSTS = {
    speed: [15, 30, 45, 60],
    hearts: [25, 50, 90],
    heal: [35, 65, 100],
    guard: [30, 60, 100]
  };

  const STAGE_COSTS = {
    1: 0,
    2: 50,
    3: 150,
    4: 350,
    5: 700
  };

  const keys = new Set();
  const touchDirs = new Set();

  let bullets = [];
  let particles = [];
  let edgeWarnings = [];
  let enemies = [];
  let shotTimers = [];
  let radialTimers = [];
  let edgeTimer = 2;
  let patternTick = 0;
  let healTimer = 0;
  let guardTimer = 0;

  const player = {
    x: 0,
    y: 0,
    r: 5,
    speed: 310,
    lives: 3,
    maxLives: 3,
    invuln: 0
  };

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));

  const rand = (min, max) =>
    min + Math.random() * (max - min);

  // -------------------------
  // 画面サイズ
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
  // ステージ設定
  // -------------------------

  function positionEnemies() {
    const count = stage === 1 ? 3 : 1;

    if (count === 3) {
      enemies = [
        { x: W * 0.5, y: H * 0.16, name: "CENTER" },
        { x: W * 0.19, y: H * 0.29, name: "LEFT" },
        { x: W * 0.81, y: H * 0.29, name: "RIGHT" }
      ];
    } else {
      enemies = [
        { x: W * 0.5, y: H * 0.18, name: "BOSS" }
      ];
    }
  }

  function showTitle() {
    mode = "title";
    menuIndex = 0;
    shopMessage = "";
    messageTimer = 0;
  }

  function showStageSelect() {
    mode = "stageSelect";
    menuIndex = 0;
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
      showMessage("先にショップでステージを購入してね");
      return;
    }

    stage = selectedStage;

    elapsed = 0;
    goldTimer = 0;
    runGold = 0;
    hitFlash = 0;
    bulletSpeedMultiplier = 1;
    healTimer = 0;
    guardTimer = 0;

    bullets = [];
    particles = [];
    edgeWarnings = [];

    shotTimers = [];
    radialTimers = [];

    edgeTimer = stage === 1 ? 4 : 1.5;
    patternTick = 0;

    player.maxLives = 3 + upgrades.hearts;
    player.lives = player.maxLives;
    player.invuln = 1.5;

    resetPlayer();
    positionEnemies();

    shotTimers = enemies.map((_, i) => 0.5 + i * 0.3);
    radialTimers = enemies.map((_, i) => 1 + i * 0.4);

    mode = "playing";
  }

  function addGold(amount) {
    gold += amount;
    runGold += amount;
  }

  function showMessage(message) {
    shopMessage = message;
    messageTimer = 2.5;
  }

  // -------------------------
  // 攻撃
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

  function radialShot(enemy, count, speed, offset = 0, color = C.pink) {
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;

      fire(
        enemy.x,
        enemy.y,
        angle,
        speed,
        i % 4 === 0 ? C.orange : color
      );
    }
  }

  function fanShot(enemy, count, spread, speed, color = C.orange) {
    const base = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );

    for (let i = 0; i < count; i++) {
      const offset = count === 1
        ? 0
        : -spread / 2 + spread * i / (count - 1);

      fire(enemy.x, enemy.y, base + offset, speed, color);
    }
  }

  // 画面端から攻撃予告を出す
  function edgeBurst() {
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;
    let angle;

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
      life: stage === 2 ? 0.45 : 0.65,
      fired: false
    });
  }

  function edgeAttack() {
    // ステージが進むほど同時攻撃数が増える
    const count = stage === 2
      ? Math.floor(rand(3, 7))
      : Math.floor(rand(2 + stage, 4 + stage));

    for (let i = 0; i < count; i++) {
      edgeBurst();
    }
  }

  // -------------------------
  // ゲーム更新
  // -------------------------

  function update(dt) {
    if (messageTimer > 0) {
      messageTimer = Math.max(0, messageTimer - dt);
    }

    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    // 30秒ごとに敵弾が加速する
    const tier = Math.floor(elapsed / 30);

    bulletSpeedMultiplier =
      1 +
      0.65 * tier +
      0.15 * tier * (tier - 1) / 2;

    // 移動入力
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

    // 移動速度アップ：最大2倍
    const speedMultiplier =
      upgrades.speed === 0
        ? 1
        : UPGRADE_SPEED_MULTIPLIER(upgrades.speed);

    player.x = clamp(
      player.x + dx * player.speed * speedMultiplier * dt,
      12,
      W - 12
    );

    player.y = clamp(
      player.y + dy * player.speed * speedMultiplier * dt,
      45,
      H - 18
    );

    // 自動回復
    if (upgrades.heal > 0 && player.lives < player.maxLives) {
      healTimer += dt;

      const healInterval = Math.max(
        5,
        16 - upgrades.heal * 3
      );

      if (healTimer >= healInterval) {
        healTimer = 0;
        player.lives = Math.min(
          player.maxLives,
          player.lives + 1
        );
      }
    }

    // ガード：一定間隔でダメージを防ぐ
    guardTimer = Math.max(0, guardTimer - dt);

    // ステージ1：3体から攻撃
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

        shotTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          aimedShot(
            enemy,
            i === 0 ? 205 : 190,
            i === 0 ? C.pink : C.orange
          );

          shotTimers[i] = Math.max(
            0.45,
            (i === 0 ? 0.95 : 1.2) - elapsed * 0.003
          );
        }

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
                115,
                patternTick * 0.3,
                C.pink
              );
            }

            radialTimers[i] = 3.2 + i * 0.3;
          }
        }
      }
    }

    // ステージ2：激しい放射攻撃＋画面端の大量攻撃
    if (stage === 2) {
      radialTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(
          enemies[0],
          22 + Math.min(14, Math.floor(elapsed / 6)),
          165 + Math.min(65, elapsed * 0.7),
          patternTick * 0.2,
          C.purple
        );

        radialTimers[0] = Math.max(
          0.65,
          1.35 - elapsed * 0.004
        );

        if (Math.random() < 0.7) {
          fanShot(enemies[0], 13, 1.8, 175, C.orange);
        }
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeAttack();
        edgeTimer = rand(0.35, 0.75);
      }
    }

    // ステージ3〜5：ボスの攻撃
    if (stage >= 3) {
      const boss = enemies[0];

      shotTimers[0] -= dt;
      radialTimers[0] -= dt;

      if (shotTimers[0] <= 0) {
        fanShot(
          boss,
          9 + stage * 2,
          1.5 + stage * 0.12,
          150 + stage * 20 + Math.min(40, elapsed),
          stage === 3 ? C.green : stage === 4 ? C.orange : C.pink
        );

        shotTimers[0] = Math.max(
          0.3,
          1.0 - stage * 0.1 - elapsed * 0.002
        );
      }

      if (radialTimers[0] <= 0) {
        radialShot(
          boss,
          16 + stage * 5 + Math.floor(elapsed / 12),
          145 + stage * 18 + Math.min(45, elapsed * 0.5),
          patternTick * (0.2 + stage * 0.04),
          stage === 3 ? C.green : stage === 4 ? C.purple : C.pink
        );

        radialTimers[0] = Math.max(
          0.45,
          2.0 - stage * 0.22 - elapsed * 0.003
        );
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeAttack();
        edgeTimer = rand(
          Math.max(0.25, 1.1 - stage * 0.12),
          Math.max(0.45, 1.7 - stage * 0.15)
        );
      }
    }

    // 予告が終わったら画面端から弾を発射
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {
        warning.fired = true;

        const bulletCount = stage === 2
          ? 9
          : 5 + stage * 2;

        const spread = stage === 2 ? 0.19 : 0.14;

        for (
          let i = -(bulletCount - 1) / 2;
          i <= (bulletCount - 1) / 2;
          i++
        ) {
          fire(
            warning.x,
            warning.y,
            warning.angle + i * spread,
            220 + stage * 18,
            stage >= 4 ? C.pink : C.orange
          );
        }
      }
    }

    edgeWarnings = edgeWarnings.filter(w => w.life > -0.6);

    // 弾の移動と衝突判定
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (
        !bullet.dead &&
        player.invuln <= 0 &&
        Math.hypot(
          player.x - bullet.x,
          player.y - bullet.y
        ) < player.r + bullet.r
      ) {
        // ガードアップグレード
        if (upgrades.guard > 0 && guardTimer <= 0) {
          guardTimer = Math.max(1.5, 5 - upgrades.guard);
          bullet.dead = true;

          for (let i = 0; i < 5; i++) {
            particles.push({
              x: player.x,
              y: player.y,
              vx: rand(-70, 70),
              vy: rand(-70, 70),
              life: 0.3,
              color: C.blue
            });
          }

          continue;
        }

        bullet.dead = true;
        player.lives--;
        player.invuln = 1.15;
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
      b.x > -40 &&
      b.x < W + 40 &&
      b.y > -40 &&
      b.y < H + 40
    );

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    particles = particles.filter(p => p.life > 0);

    // 10秒ごとにゴールドを獲得
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      const baseReward = stage === 1 ? 1 : stage * 2;

      addGold(baseReward * Math.pow(2, goldTier));
    }
  }

  // 移動速度アップの倍率
  function UPGRADE_SPEED_MULTIPLIER(level) {
    return [1, 1.25, 1.5, 1.75, 2][level] || 2;
  }

  // -------------------------
  // 描画用の関数
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
    ctx.fillText(String(value), Math.round(x), Math.round(y));
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

  // ステージ1の3体は中央と同じイラスト
  function drawEnemy(enemy, index) {
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);

    if (stage === 1) {
      drawDemon(x, y);
      return;
    }

    if (stage === 2) {
      rect(x - 5, y - 23, 10, 6, "#c7c1ff");
      rect(x - 13, y - 17, 26, 6, "#6a5ae0");
      rect(x - 19, y - 11, 38, 22, "#8c7bff");
      rect(x - 25, y - 5, 6, 12, "#56d9ff");
      rect(x + 19, y - 5, 6, 12, "#56d9ff");
      rect(x - 13, y - 17, 6, 6, C.pink);
      rect(x + 7, y - 17, 6, 6, C.pink);
      rect(x - 12, y - 5, 7, 7, C.bg);
      rect(x + 5, y - 5, 7, 7, C.bg);
      rect(x - 6, y + 7, 12, 4, C.bg);
      rect(x - 9, y + 15, 18, 5, "#56d9ff");
      return;
    }

    const color = stage === 3
      ? C.green
      : stage === 4
        ? C.orange
        : C.pink;

    rect(x - 9, y - 26, 7, 12, color);
    rect(x + 2, y - 26, 7, 12, color);
    rect(x - 24, y - 15, 48, 30, color);
    rect(x - 30, y - 5, 6, 16, C.purple);
    rect(x + 24, y - 5, 6, 16, C.purple);
    rect(x - 13, y - 6, 7, 7, C.bg);
    rect(x + 6, y - 6, 7, 7, C.bg);
    rect(x - 9, y + 8, 18, 4, C.bg);
    rect(x - 17, y + 15, 10, 7, color);
    rect(x + 7, y + 15, 10, 7, color);
  }

  function drawDemon(x, y) {
    rect(x - 5, y - 21, 5, 8, C.orange);
    rect(x + 1, y - 21, 5, 8, C.orange);
    rect(x - 17, y - 13, 34, 26, C.red);
    rect(x - 22, y - 5, 5, 12, C.red);
    rect(x + 17, y - 5, 5, 12, C.red);
    rect(x - 10, y - 5, 6, 6, C.bg);
    rect(x + 4, y - 5, 6, 6, C.bg);
    rect(x - 5, y + 6, 10, 3, C.bg);
    rect(x - 11, y + 13, 7, 5, C.orange);
    rect(x + 4, y + 13, 7, 5, C.orange);
  }

  function drawPlayer() {
    if (
      player.invuln > 0 &&
      Math.floor(player.invuln * 12) % 2 === 0
    ) return;

    rect(player.x - 3, player.y - 7, 6, 14, C.red);
    rect(player.x - 7, player.y - 3, 14, 6, C.red);
    rect(player.x - 2, player.y - 2, 4, 4, "#ff9aa5");

    if (upgrades.guard > 0 && guardTimer > 0) {
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  function drawButton(
    label,
    x,
    y,
    selected,
    width = 300,
    height = 44
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
      Math.min(17, width * 0.05),
      selected ? C.gold : C.white,
      "center"
    );
  }

  // -------------------------
  // タイトル画面
  // -------------------------

  function drawTitle() {
    drawDemon(W / 2, H * 0.16);

    text("RUU RPG", W / 2, H * 0.29, 38, C.white, "center");
    text(
      "DODGE - SURVIVE - COLLECT GOLD",
      W / 2,
      H * 0.37,
      14,
      C.muted,
      "center"
    );

    drawButton(
      "GAME START",
      W / 2,
      H * 0.53,
      menuIndex === 0,
      Math.min(W - 40, 380),
      58
    );

    drawButton(
      "SHOP",
      W / 2,
      H * 0.67,
      menuIndex === 1,
      Math.min(W - 40, 300),
      46
    );

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM",
      W / 2,
      H * 0.81,
      12,
      C.muted,
      "center"
    );

    text(`GOLD ${gold}`, W - 20, 24, 16, C.gold, "right");
  }

  // -------------------------
  // ステージ選択
  // -------------------------

  function drawStageSelect() {
    text("SELECT STAGE", W / 2, H * 0.12, 26, C.white, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.2, 15, C.gold, "center");

    const startY = H * 0.31;
    const gap = Math.min(65, H * 0.12);

    for (let i = 0; i < 5; i++) {
      const s = i + 1;
      const unlocked = unlockedStages.has(s);

      drawButton(
        unlocked ? `STAGE ${s} - PLAY` : `STAGE ${s} - LOCKED`,
        W / 2,
        startY + i * gap,
        menuIndex === i,
        Math.min(W - 35, 360),
        38
      );

      text(
        unlocked ? "UNLOCKED" : `BUY FOR ${STAGE_COSTS[s]} GOLD`,
        W / 2,
        startY + i * gap + 22,
        10,
        unlocked ? C.green : C.orange,
        "center"
      );
    }

    drawButton(
      "BACK",
      W / 2,
      startY + 5 * gap,
      menuIndex === 5,
      240,
      34
    );
  }

  // -------------------------
  // ショップ
  // -------------------------

  function shopItems() {
    return [
      {
        id: "stage2",
        label: unlockedStages.has(2) ? "PLAY STAGE 2" : "BUY STAGE 2",
        detail: unlockedStages.has(2) ? "OWNED" : `${STAGE_COSTS[2]} GOLD`
      },
      {
        id: "stage3",
        label: unlockedStages.has(3) ? "PLAY STAGE 3" : "BUY STAGE 3",
        detail: unlockedStages.has(3) ? "OWNED" : `${STAGE_COSTS[3]} GOLD`
      },
      {
        id: "stage4",
        label: unlockedStages.has(4) ? "PLAY STAGE 4" : "BUY STAGE 4",
        detail: unlockedStages.has(4) ? "OWNED" : `${STAGE_COSTS[4]} GOLD`
      },
      {
        id: "stage5",
        label: unlockedStages.has(5) ? "PLAY STAGE 5" : "BUY STAGE 5",
        detail: unlockedStages.has(5) ? "OWNED" : `${STAGE_COSTS[5]} GOLD`
      },
      {
        id: "speed",
        label: `SPEED UP ${upgrades.speed}/4`,
        detail: upgrades.speed >= 4
          ? "MAX LEVEL"
          : `${UPGRADE_COSTS.speed[upgrades.speed]} GOLD`
      },
      {
        id: "hearts",
        label: `MAX HEARTS UP ${upgrades.hearts}/3`,
        detail: upgrades.hearts >= 3
          ? "MAX LEVEL"
          : `${UPGRADE_COSTS.hearts[upgrades.hearts]} GOLD`
      },
      {
        id: "heal",
        label: `AUTO HEAL ${upgrades.heal}/3`,
        detail: upgrades.heal >= 3
          ? "MAX LEVEL"
          : `${UPGRADE_COSTS.heal[upgrades.heal]} GOLD`
      },
      {
        id: "guard",
        label: `BULLET GUARD ${upgrades.guard}/3`,
        detail: upgrades.guard >= 3
          ? "MAX LEVEL"
          : `${UPGRADE_COSTS.guard[upgrades.guard]} GOLD`
      },
      {
        id: "stage1",
        label: "PLAY STAGE 1",
        detail: "FREE"
      },
      {
        id: "back",
        label: "BACK TO TITLE",
        detail: "RETURN"
      }
    ];
  }

  function drawShop() {
    text("SHOP", W / 2, H * 0.08, 27, C.gold, "center");
    text(`GOLD: ${gold}`, W / 2, H * 0.14, 14, C.white, "center");

    const items = shopItems();
    const rowH = Math.min(42, H * 0.078);
    const startY = H * 0.22;
    const visible = Math.min(9, items.length);
    const maxScroll = Math.max(0, items.length - visible);
    const first = clamp(menuIndex - visible + 1, 0, maxScroll);

    for (let j = 0; j < visible; j++) {
      const i = first + j;
      const item = items[i];
      const y = startY + j * rowH;

      drawButton(
        item.label,
        W / 2,
        y,
        menuIndex === i,
        Math.min(W - 26, 430),
        rowH - 4
      );

      text(
        item.detail,
        W / 2,
        y + rowH * 0.34,
        9,
        C.muted,
        "center"
      );
    }

    if (messageTimer > 0 && shopMessage) {
      text(
        shopMessage,
        W / 2,
        H * 0.94,
        11,
        C.orange,
        "center"
      );
    }
  }

  // -------------------------
  // 管理者画面
  // -------------------------

  function drawAdminCode() {
    text("ADMIN ACCESS", W / 2, H * 0.28, 28, C.purple, "center");
    text("TYPE CODE THEN PRESS ENTER", W / 2, H * 0.4, 13, C.muted, "center");

    rect(W / 2 - 150, H * 0.47, 300, 44, C.panel);
    ctx.strokeStyle = C.blue;
    ctx.strokeRect(W / 2 - 150, H * 0.47, 300, 44);

    text(
      "*".repeat(adminInput.length),
      W / 2,
      H * 0.47 + 22,
      22,
      C.white,
      "center"
    );

    text("BACKSPACE: DELETE   ESC: SHOP", W / 2, H * 0.62, 12, C.muted, "center");

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.73, 13, C.orange, "center");
    }
  }

  function drawAdminPanel() {
    text("ADMIN PANEL", W / 2, H * 0.2, 30, C.gold, "center");
    text(`CURRENT GOLD: ${gold}`, W / 2, H * 0.31, 18, C.white, "center");

    drawButton("ADD 100 GOLD  [1]", W / 2, H * 0.45, false, 340, 42);
    drawButton("ADD 1,000 GOLD  [2]", W / 2, H * 0.56, false, 340, 42);
    drawButton("ADD 10,000 GOLD  [3]", W / 2, H * 0.67, false, 340, 42);
    drawButton("BACK TO SHOP  [ESC]", W / 2, H * 0.79, false, 340, 42);
  }

  // -------------------------
  // ポーズ・ゲームオーバー
  // -------------------------

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
  }

  function drawGameOver() {
    text("GAME OVER", W / 2, H * 0.25, 32, C.pink, "center");
    text(`SURVIVED ${elapsed.toFixed(1)}s`, W / 2, H * 0.36, 15, C.white, "center");
    text(`GOLD: ${gold} (+${runGold})`, W / 2, H * 0.43, 15, C.gold, "center");

    drawButton("RETRY", W / 2, H * 0.56, menuIndex === 0);
    drawButton("GO TO SHOP", W / 2, H * 0.67, menuIndex === 1);
    drawButton("TITLE", W / 2, H * 0.78, menuIndex === 2);
  }

  // -------------------------
  // バトル画面
  // -------------------------

  function drawBattle() {
    for (let i = 0; i < enemies.length; i++) {
      drawEnemy(enemies[i], i);
    }

    for (const warning of edgeWarnings) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 80) * 0.3;
      ctx.fillStyle = C.orange;

      ctx.beginPath();
      ctx.arc(warning.x, warning.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const bullet of bullets) {
      drawBullet(bullet);
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
      rect(p.x, p.y, 3, 3, p.color);
      ctx.globalAlpha = 1;
    }

    drawPlayer();

    text(`STAGE ${stage}`, 14, 20, 14, C.white);
    text(`TIME ${elapsed.toFixed(1)}s`, 14, 40, 12, C.muted);
    text(`GOLD ${gold}`, W - 14, 20, 13, C.gold, "right");

    text(
      `HP ${"♥".repeat(Math.max(0, player.lives))}${"♡".repeat(Math.max(0, player.maxLives - player.lives))}`,
      14,
      60,
      13,
      C.pink
    );

    text(
      "MOVE: WASD / ARROWS   ESC: PAUSE",
      W / 2,
      H - 12,
      11,
      C.muted,
      "center"
    );

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 50, 80, ${hitFlash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // -------------------------
  // メイン描画
  // -------------------------

  function draw() {
    drawBackground();

    if (mode === "title") drawTitle();
    else if (mode === "stageSelect") drawStageSelect();
    else if (mode === "shop") drawShop();
    else if (mode === "adminCode") drawAdminCode();
    else if (mode === "adminPanel") drawAdminPanel();
    else if (mode === "playing") drawBattle();
    else if (mode === "pause") drawPause();
    else if (mode === "gameover") drawGameOver();
  }

  // -------------------------
  // メニュー操作
  // -------------------------

  function moveMenu(direction) {
    let maxIndex = 0;

    if (mode === "title") maxIndex = 1;
    else if (mode === "stageSelect") maxIndex = 5;
    else if (mode === "shop") maxIndex = shopItems().length - 1;
    else if (mode === "pause") maxIndex = 1;
    else if (mode === "gameover") maxIndex = 2;
    else if (mode === "adminPanel") maxIndex = 3;

    menuIndex = clamp(menuIndex + direction, 0, maxIndex);
  }

  function buyStage(s) {
    if (unlockedStages.has(s)) {
      startRun(s);
      return;
    }

    const cost = STAGE_COSTS[s];

    if (gold < cost) {
      showMessage(`ゴールド不足！ ${cost} GOLD 必要`);
      return;
    }

    gold -= cost;
    unlockedStages.add(s);
    showMessage(`STAGE ${s} を購入した！`);
  }

  function buyUpgrade(id) {
    const level = upgrades[id];
    const costs = UPGRADE_COSTS[id];

    if (level >= costs.length) {
      showMessage("このアップグレードは最大レベル！");
      return;
    }

    const cost = costs[level];

    if (gold < cost) {
      showMessage(`ゴールド不足！ ${cost} GOLD 必要`);
      return;
    }

    gold -= cost;
    upgrades[id]++;

    showMessage("アップグレード成功！");
  }

  function confirmShop() {
    const item = shopItems()[menuIndex];
    if (!item) return;

    if (item.id.startsWith("stage")) {
      const s = Number(item.id.replace("stage", ""));

      if (s === 1) {
        startRun(1);
      } else {
        buyStage(s);
      }
      return;
    }

    if (
      item.id === "speed" ||
      item.id === "hearts" ||
      item.id === "heal" ||
      item.id === "guard"
    ) {
      buyUpgrade(item.id);
      return;
    }

    if (item.id === "back") {
      showTitle();
    }
  }

  function confirmMenu() {
    if (mode === "title") {
      if (menuIndex === 0) showStageSelect();
      else openShop();
      return;
    }

    if (mode === "stageSelect") {
      if (menuIndex >= 0 && menuIndex <= 4) {
        startRun(menuIndex + 1);
      } else {
        showTitle();
      }
      return;
    }

    if (mode === "shop") {
      confirmShop();
      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
        openShop();
      }
      return;
    }

    if (mode === "gameover") {
      if (menuIndex === 0) startRun(stage);
      else if (menuIndex === 1) openShop();
      else showTitle();
      return;
    }

    if (mode === "adminPanel") {
      if (menuIndex === 0) gold += 100;
      else if (menuIndex === 1) gold += 1000;
      else if (menuIndex === 2) gold += 10000;
      else openShop();
    }
  }

  // -------------------------
  // キーボード
  // -------------------------

  function keyDown(e) {
    if (
      e.code.startsWith("Arrow") ||
      e.code === "Space"
    ) {
      e.preventDefault();
    }

    keys.add(e.code);

    if (
      e.ctrlKey &&
      e.shiftKey &&
      e.code === "Digit5"
    ) {
      mode = "adminCode";
      adminInput = "";
      shopMessage = "";
      messageTimer = 0;
      return;
    }

    if (mode === "adminCode") {
      if (e.code === "Escape") {
        openShop();
        return;
      }

      if (e.code === "Backspace") {
        adminInput = adminInput.slice(0, -1);
        return;
      }

      if (e.code === "Enter") {
        if (adminInput === ADMIN_CODE) {
          mode = "adminPanel";
          menuIndex = 0;
          showMessage("管理者アクセス成功");
        } else {
          showMessage("コードが違います");
          adminInput = "";
        }
        return;
      }

      if (e.key && e.key.length === 1) {
        adminInput += e.key;
      }
      return;
    }

    if (mode === "adminPanel") {
      if (e.code === "Escape") {
        openShop();
      } else if (e.code === "Digit1") {
        gold += 100;
      } else if (e.code === "Digit2") {
        gold += 1000;
      } else if (e.code === "Digit3") {
        gold += 10000;
      }
      return;
    }

    if (mode === "playing") {
      if (e.code === "Escape") {
        mode = "pause";
        menuIndex = 0;
      }
      return;
    }

    if (e.code === "ArrowUp" || e.code === "ArrowLeft") {
      moveMenu(-1);
      return;
    }

    if (e.code === "ArrowDown" || e.code === "ArrowRight") {
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
  // タッチ操作
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
      } else if (mode === "stageSelect" || mode === "shop") {
        confirmMenu();
      }
    });
  }

  // キャンバス上のクリック
  canvas.addEventListener("pointerdown", e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
      return;
    }

    if (mode === "title") {
      if (y > H * 0.45 && y < H * 0.61) {
        menuIndex = 0;
        confirmMenu();
      } else if (y >= H * 0.61 && y < H * 0.75) {
        menuIndex = 1;
        confirmMenu();
      }
      return;
    }

    if (mode === "pause") {
      if (Math.abs(y - H * 0.45) < 28) {
        menuIndex = 0;
        confirmMenu();
      } else if (Math.abs(y - H * 0.56) < 28) {
        menuIndex = 1;
        confirmMenu();
      }
      return;
    }

    if (mode === "gameover") {
      const positions = [0.56, 0.67, 0.78];

      for (let i = 0; i < positions.length; i++) {
        if (Math.abs(y - H * positions[i]) < 24) {
          menuIndex = i;
          confirmMenu();
          return;
        }
      }
      return;
    }

    if (mode === "stageSelect") {
      const startY = H * 0.31;
      const gap = Math.min(65, H * 0.12);
      const index = Math.round((y - startY) / gap);

      if (index >= 0 && index <= 5) {
        menuIndex = index;
        confirmMenu();
      }
      return;
    }

    if (mode === "shop") {
      const items = shopItems();
      const rowH = Math.min(42, H * 0.078);
      const startY = H * 0.22;
      const visible = Math.min(9, items.length);
      const first = clamp(menuIndex - visible + 1, 0, items.length - visible);

      const index = first + Math.round((y - startY) / rowH);

      if (index >= 0 && index < items.length) {
        menuIndex = index;
        confirmMenu();
      }
    }
  });

  // -------------------------
  // ゲームループ
  // -------------------------

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.04);
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  resize();
  requestAnimationFrame(loop);
})();
