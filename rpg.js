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
  let mode = "title";
  let adminInput = "";
  const ADMIN_CODE = "O0p-@^";
  let stage = 1;
  let unlockedStages = new Set([1]);

  let gold = 0;
  let runGold = 0;
  let elapsed = 0;
  let goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;

  let menuIndex = 0;
  let shopTab = 0;
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
  let spiralTimer = 0;
  let rainTimer = 0;
  let waveTimer = 0;
  let rotatingBarAngle = 0;
  let stage6BurstTimer = 5;
  let stage6Warning = 0;
  let waveGapY = 0.5;
  let waveGapTarget = 0.5;
  let waveDirectionTimer = 0;
  let stage4RainDirection = 1;

  const upgrades = {
    speed: 0,
    heart: 0,
    slow: 0,
    gold: 0
  };

  const ITEM_DEFS = [
    {
      key: "speed",
      label: "SPEED BOOST",
      detail: level => `MOVE SPEED +${level * 15}%`,
      base: 35,
      max: 4
    },
    {
      key: "heart",
      label: "EXTRA HEART",
      detail: level => `MAX HP +${Math.round(level / 3 * 100)}%`,
      base: 45,
      max: 3
    },
    {
      key: "slow",
      label: "BULLET SLOW",
      detail: level => `ENEMY BULLET SPEED -${level * 8}%`,
      base: 65,
      max: 4
    },
    {
      key: "gold",
      label: "GOLD BONUS",
      detail: level => `GOLD REWARD +${level * 25}%`,
      base: 80,
      max: 4
    }
  ];

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
    2: 50,
    3: 100,
    4: 200,
    5: 350,
    6: 500,
    7: 800
  };

  const STAGE_REWARDS = {
    1: 1,
    2: 3,
    3: 7,
    4: 15,
    5: 30,
    6: 50,
    7: 100
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
          y: stage === 6 ? H * 0.5 : H * 0.18,
          name: "CENTER"
        }
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

    edgeTimer = selectedStage === 2 ? 2.25 : 5;
    patternTick = 0;

    spiralTimer = 0.25;
    rainTimer = 0.4;
    waveTimer = 0.6;
    rotatingBarAngle = 0;
    stage6BurstTimer = 5;
    stage6Warning = 0;
    waveGapY = 0.5;
    waveGapTarget = 0.5;
    waveDirectionTimer = 1.5;
    stage4RainDirection = 1;

    player.lives = 3 + upgrades.heart;
    player.speed = 310 * (1 + upgrades.speed * 0.15);
    player.invuln = 1.2;

    resetPlayer();
    positionEnemies();

    shotTimers = enemies.map((_, i) => 0.6 + i * 0.4);
    radialTimers = enemies.map((_, i) => 1.5 + i * 0.9);

    mode = "playing";
  }

  function addGold(amount) {
    gold += amount;
    runGold += amount;
  }

  function fire(
    x,
    y,
    angle,
    speed,
    color = C.pink,
    radius = 4,
    limitY = null
  ) {
    const slowMultiplier = Math.max(
      0.68,
      1 - upgrades.slow * 0.08
    );

    bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed *
        bulletSpeedMultiplier * slowMultiplier,
      vy: Math.sin(angle) * speed *
        bulletSpeedMultiplier * slowMultiplier,
      r: radius,
      color,
      limitY,
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
      life: 0.8,
      fired: false
    });
  }

  function update(dt) {
    if (messageTimer > 0) {
      messageTimer -= dt;
    }

    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    const tier = Math.floor(elapsed / 30);

    bulletSpeedMultiplier =
      1 +
      0.65 * tier +
      0.15 * tier * (tier - 1) / 2;

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
      45,
      H - 18
    );

    // Stage 1
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

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

    // Stage 2: radial attacks and screen-edge attacks
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

        if (Math.random() < 0.22) {
          edgeBurst();
        }

        edgeTimer = rand(2.0, 3.7);
      }
    }

    // Stage 3: spiral bullets around a stationary enemy
    if (stage === 3) {
      spiralTimer -= dt;

      if (spiralTimer <= 0) {
        const e = enemies[0];
        const a = patternTick * 2.1;
        const speed = 125 + Math.min(45, elapsed * 0.5);

        fire(e.x, e.y, a, speed, C.pink, 4);
        fire(e.x, e.y, a + Math.PI, speed, C.blue, 4);

        spiralTimer = 0.075;
      }

      radialTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(
          enemies[0],
          10,
          145,
          patternTick * 0.4,
          C.orange
        );

        radialTimers[0] = 4.5;
      }
    }

    // Stage 4: rain of bullets with an unpredictable slant
    if (stage === 4) {
      rainTimer -= dt;
      waveDirectionTimer -= dt;

      if (waveDirectionTimer <= 0) {
        rainTimer = Math.min(rainTimer, 0.12);
        waveDirectionTimer = rand(1.1, 2.8);

        stage4RainDirection =
          Math.random() < 0.5 ? -1 : 1;
      }

      if (rainTimer <= 0) {
        const count = 7 + Math.floor(Math.random() * 5);

        for (let i = 0; i < count; i++) {
          const x = rand(18, W - 18);
          const angle =
            Math.PI / 2 +
            stage4RainDirection * rand(0.08, 0.34);

          fire(
            x,
            30,
            angle,
            rand(175, 235),
            i % 3 ? C.blue : C.orange,
            4
          );
        }

        rainTimer = rand(0.28, 0.62);
      }
    }

    // Stage 5: waves from the top and bottom.
    // The safe corridor moves up and down.
    if (stage === 5) {
      waveTimer -= dt;
      waveDirectionTimer -= dt;

      if (waveDirectionTimer <= 0) {
        waveGapTarget = rand(0.28, 0.72);
        waveDirectionTimer = rand(1.0, 1.8);
      }

      waveGapY +=
        (waveGapTarget - waveGapY) *
        Math.min(1, dt * 1.6);

      if (waveTimer <= 0) {
        const gapSize = Math.max(82, H * 0.19);
        const gapCenter = H * waveGapY;
        const topLimit = gapCenter - gapSize / 2;
        const bottomLimit = gapCenter + gapSize / 2;
        const spacing = 19;

        for (let x = 12; x < W - 12; x += spacing) {
          fire(
            x, 22,
            Math.PI / 2,
            220,
            C.orange,
            4,
            topLimit
          );

          fire(
            x, H - 22,
            -Math.PI / 2,
            220,
            C.pink,
            4,
            bottomLimit
          );
        }

        waveTimer = rand(0.48, 0.72);
      }
    }

    // Stage 6: rotating bar and a periodic wide attack
    if (stage === 6) {
      rotatingBarAngle += dt * 1.35;

      const e = enemies[0];
      const barLength = Math.min(W, H) * 0.43;

      const ax =
        e.x - Math.cos(rotatingBarAngle) * barLength;
      const ay =
        e.y - Math.sin(rotatingBarAngle) * barLength;
      const bx =
        e.x + Math.cos(rotatingBarAngle) * barLength;
      const by =
        e.y + Math.sin(rotatingBarAngle) * barLength;

      const dxBar = bx - ax;
      const dyBar = by - ay;
      const denom = dxBar * dxBar + dyBar * dyBar || 1;

      const tBar = clamp(
        (
          (player.x - ax) * dxBar +
          (player.y - ay) * dyBar
        ) / denom,
        0,
        1
      );

      const closestX = ax + tBar * dxBar;
      const closestY = ay + tBar * dyBar;

      if (
        player.invuln <= 0 &&
        Math.hypot(
          player.x - closestX,
          player.y - closestY
        ) < 10
      ) {
        player.lives--;
        player.invuln = 1.25;
        hitFlash = 0.2;

        if (player.lives <= 0) {
          mode = "gameover";
          menuIndex = 0;
          bullets = [];
          edgeWarnings = [];
        }
      }

      stage6BurstTimer -= dt;

      if (stage6Warning > 0) {
        stage6Warning -= dt;

        if (stage6Warning <= 0) {
          radialShot(
            e,
            28,
            195,
            patternTick * 0.12,
            C.orange
          );
        }
      }

      if (
        stage6BurstTimer <= 0 &&
        stage6Warning <= 0
      ) {
        stage6Warning = 0.8;
        stage6BurstTimer = rand(6, 9);
      }
    }

    // Stage 7: fast radial attack and aimed shots
    if (stage === 7) {
      radialTimers[0] -= dt;
      shotTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(
          enemies[0],
          32,
          185,
          patternTick * 0.22,
          C.blue
        );

        radialTimers[0] = 2.1;
      }

      if (shotTimers[0] <= 0) {
        aimedShot(enemies[0], 225, C.pink);
        shotTimers[0] = 0.65;
      }
    }

    // Edge warnings become attacks after a short delay
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

    // Move bullets and detect collisions
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (
        bullet.limitY !== null &&
        bullet.limitY !== undefined
      ) {
        if (
          (bullet.vy > 0 && bullet.y >= bullet.limitY) ||
          (bullet.vy < 0 && bullet.y <= bullet.limitY)
        ) {
          bullet.dead = true;
        }
      }

      if (
        !bullet.dead &&
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

    // Gold is awarded every 10 seconds.
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;

      const goldTier = Math.floor(elapsed / 30);
      const baseReward = STAGE_REWARDS[stage] || 1;

      addGold(
        Math.round(
          baseReward *
          (1 + upgrades.gold * 0.25) *
          Math.pow(2, goldTier)
        )
      );
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
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);

    if (stage === 2) {
      rect(x - 5, y - 23, 10, 6, "#c7c1ff");
      rect(x - 13, y - 17, 26, 6, "#6a5ae0");
      rect(x - 19, y - 11, 38, 22, "#8c7bff");
      rect(x - 25, y - 5, 6, 12, "#56d9ff");
      rect(x + 19, y - 5, 6, 12, "#56d9ff");
      rect(x - 13, y - 17, 6, 6, "#ff6575");
      rect(x + 7, y - 17, 6, 6, "#ff6575");
      rect(x - 12, y - 5, 7, 7, "#07111b");
      rect(x + 5, y - 5, 7, 7, "#07111b");
      rect(x - 6, y + 7, 12, 4, "#07111b");
      rect(x - 9, y + 15, 18, 5, "#56d9ff");
      return;
    }

    if (index === 0) {
      rect(x - 5, y - 21, 5, 8, "#ffad55");
      rect(x + 1, y - 21, 5, 8, "#ffad55");
      rect(x - 17, y - 13, 34, 26, "#ff465e");
      rect(x - 22, y - 5, 5, 12, "#ff465e");
      rect(x + 17, y - 5, 5, 12, "#ff465e");
      rect(x - 10, y - 5, 6, 6, "#07111b");
      rect(x + 4, y - 5, 6, 6, "#07111b");
      rect(x - 5, y + 6, 10, 3, "#07111b");
      rect(x - 11, y + 13, 7, 5, "#ffad55");
      rect(x + 4, y + 13, 7, 5, "#ffad55");
    } else if (index === 1) {
      rect(x - 10, y - 18, 7, 8, "#ffe08a");
      rect(x + 3, y - 18, 7, 8, "#ffe08a");
      rect(x - 16, y - 10, 32, 20, "#ffad55");
      rect(x - 23, y - 3, 7, 7, "#ff7b35");
      rect(x + 16, y - 3, 7, 7, "#ff7b35");
      rect(x - 10, y - 3, 5, 5, "#07111b");
      rect(x + 5, y - 3, 5, 5, "#07111b");
      rect(x - 6, y + 7, 12, 3, "#07111b");
      rect(x - 12, y + 10, 5, 6, "#ff7b35");
      rect(x + 7, y + 10, 5, 6, "#ff7b35");
    } else {
      rect(x - 5, y - 23, 10, 8, "#b7ffcf");
      rect(x - 15, y - 15, 30, 24, "#78e0ae");
      rect(x - 22, y - 7, 7, 13, "#48b985");
      rect(x + 15, y - 7, 7, 13, "#48b985");
      rect(x - 10, y - 7, 5, 6, "#07111b");
      rect(x + 5, y - 7, 5, 6, "#07111b");
      rect(x - 5, y + 5, 10, 3, "#07111b");
      rect(x - 10, y + 9, 6, 7, "#b7ffcf");
      rect(x + 4, y + 9, 6, 7, "#b7ffcf");
    }
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

  function drawStageSelect() {
    text("SELECT STAGE", W / 2, H * 0.1, 25, C.white, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.17, 15, C.gold, "center");

    const items = [];

    for (let n = 1; n <= 7; n++) {
      const unlocked = unlockedStages.has(n);

      items.push({
        label: `STAGE ${n} ${unlocked ? "- PLAY" : "- LOCKED"}`,
        detail: `FIRST REWARD: ${STAGE_REWARDS[n]} GOLD${
          unlocked ? "" : ` | SHOP COST ${STAGE_COSTS[n]}G`
        }`,
        unlocked
      });
    }

    items.push({
      label: "BACK",
      detail: "RETURN TO TITLE",
      unlocked: true
    });

    const rowGap = Math.min(47, H * 0.083);
    const startY = H * 0.25;
    const visible = 7;
    const offset = Math.max(
      0,
      Math.min(items.length - visible, menuIndex - visible + 1)
    );

    items.slice(offset, offset + visible).forEach((item, i) => {
      const index = offset + i;

      drawButton(
        item.label,
        W / 2,
        startY + i * rowGap,
        menuIndex === index,
        Math.min(W - 36, 460),
        30
      );

      text(
        item.detail,
        W / 2,
        startY + i * rowGap + 17,
        9,
        item.unlocked ? C.muted : C.orange,
        "center"
      );
    });

    text(
      "UP / DOWN: SELECT   SPACE: CONFIRM   ESC: BACK",
      W / 2,
      H * 0.94,
      11,
      C.muted,
      "center"
    );
  }

  function drawShop() {
    text("SHOP", W / 2, H * 0.09, 28, C.gold, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.16, 15, C.white, "center");

    const margin = 16;
    const gapX = 18;
    const colW = (W - margin * 2 - gapX) / 2;
    const leftX = margin;
    const rightX = margin + colW + gapX;
    const panelY = H * 0.22;
    const panelH = H * 0.62;

    rect(
      leftX,
      panelY,
      colW,
      panelH,
      shopTab === 0 ? "#122b3d" : C.panel
    );

    rect(
      rightX,
      panelY,
      colW,
      panelH,
      shopTab === 1 ? "#122b3d" : C.panel
    );

    ctx.strokeStyle = shopTab === 0 ? C.blue : C.line;
    ctx.strokeRect(leftX, panelY, colW, panelH);

    ctx.strokeStyle = shopTab === 1 ? C.blue : C.line;
    ctx.strokeRect(rightX, panelY, colW, panelH);

    text(
      `${shopTab === 0 ? "> " : ""}ITEMS`,
      leftX + colW / 2,
      panelY + 22,
      16,
      shopTab === 0 ? C.gold : C.white,
      "center"
    );

    text(
      `${shopTab === 1 ? "> " : ""}STAGES`,
      rightX + colW / 2,
      panelY + 22,
      16,
      shopTab === 1 ? C.gold : C.white,
      "center"
    );

    const rowStart = panelY + 58;
    const rowGap = Math.min(64, (panelH - 75) / 7);

    const items = ITEM_DEFS.map(item => {
      const level = upgrades[item.key];
      const cost = item.base * (level + 1);

      return {
        kind: "item",
        label: `${item.label} Lv.${level}/${item.max}`,
        detail: level >= item.max
          ? "MAX LEVEL"
          : `${item.detail(level + 1)} | COST ${cost}G`,
        cost,
        maxed: level >= item.max
      };
    });

    items.push({
      kind: "back",
      label: "BACK TO TITLE",
      detail: "RETURN TO MAIN MENU"
    });

    const stages = [];

    for (let n = 1; n <= 7; n++) {
      const unlocked = unlockedStages.has(n);

      stages.push({
        kind: "stage",
        stage: n,
        label: `STAGE ${n} ${unlocked ? "- OWNED" : "- LOCKED"}`,
        detail: `FIRST REWARD: ${STAGE_REWARDS[n]} GOLD${
          n === 1
            ? " | FREE"
            : unlocked
              ? " | PLAY FREE"
              : ` | COST ${STAGE_COSTS[n]}G`
        }`,
        unlocked,
        cost: STAGE_COSTS[n]
      });
    }

    stages.push({
      kind: "back",
      label: "BACK TO TITLE",
      detail: "RETURN TO MAIN MENU"
    });

    const activeRows = shopTab === 0 ? items : stages;
    const selected = clamp(menuIndex, 0, activeRows.length - 1);
    const visibleCount = 6;

    const scrollStart = Math.max(
      0,
      Math.min(
        activeRows.length - visibleCount,
        selected - visibleCount + 1
      )
    );

    activeRows.slice(
      scrollStart,
      scrollStart + visibleCount
    ).forEach((item, visibleIndex) => {
      const actualIndex = scrollStart + visibleIndex;
      const x = shopTab === 0 ? leftX : rightX;
      const y = rowStart + visibleIndex * rowGap;

      const selectedRow =
        shopTab === (
          item.kind === "item" ||
          (item.kind === "back" && activeRows === items)
            ? 0
            : 1
        ) &&
        selected === actualIndex;

      const disabled =
        item.maxed ||
        (
          item.kind === "stage" &&
          !item.unlocked &&
          gold < item.cost
        );

      rect(
        x + 7,
        y - 16,
        colW - 14,
        31,
        selectedRow ? "#1b3850" : "#0c1926"
      );

      ctx.strokeStyle = selectedRow ? C.blue : C.line;
      ctx.strokeRect(x + 7, y - 16, colW - 14, 31);

      text(
        `${selectedRow ? "> " : ""}${item.label}`,
        x + colW / 2,
        y - 5,
        Math.min(11, colW * 0.035),
        disabled ? C.muted : C.white,
        "center"
      );

      text(
        item.detail,
        x + colW / 2,
        y + 15,
        Math.min(9, colW * 0.029),
        disabled ? C.orange : C.muted,
        "center"
      );
    });

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.88, 12, C.orange, "center");
    }

    text(
      "LEFT / RIGHT: SWITCH PANEL   UP / DOWN: SELECT   SPACE / ENTER: BUY / PLAY",
      W / 2,
      H * 0.95,
      Math.min(11, W * 0.014),
      C.muted,
      "center"
    );
  }

  function drawAdminCode() {
    text("ADMIN ACCESS", W / 2, H * 0.25, 27, C.gold, "center");
    text("TYPE ACCESS CODE THEN PRESS ENTER", W / 2, H * 0.36, 12, C.muted, "center");

    rect(W / 2 - 150, H * 0.43, 300, 48, C.panel);
    ctx.strokeStyle = C.blue;
    ctx.strokeRect(W / 2 - 150, H * 0.43, 300, 48);

    text(
      "*".repeat(adminInput.length),
      W / 2,
      H * 0.43 + 24,
      22,
      C.white,
      "center"
    );

    text("BACKSPACE: DELETE   ESC: SHOP", W / 2, H * 0.58, 12, C.muted, "center");
    text("ENTER: CONFIRM", W / 2, H * 0.64, 12, C.muted, "center");

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.76, 13, C.orange, "center");
    }
  }

  function drawAdminPanel() {
    text("ADMIN PANEL", W / 2, H * 0.2, 30, C.gold, "center");
    text(`CURRENT GOLD: ${gold}`, W / 2, H * 0.31, 18, C.white, "center");

    drawButton("ADD 100 GOLD  [1]", W / 2, H * 0.45, false, Math.min(W - 40, 340), 42);
    drawButton("ADD 1,000 GOLD  [2]", W / 2, H * 0.56, false, Math.min(W - 40, 340), 42);
    drawButton("ADD 10,000 GOLD  [3]", W / 2, H * 0.67, false, Math.min(W - 40, 340), 42);
    drawButton("BACK TO SHOP  [ESC]", W / 2, H * 0.79, false, Math.min(W - 40, 340), 42);

    text("Press 1, 2, or 3 to add GOLD", W / 2, H * 0.9, 12, C.muted, "center");
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

    if (stage === 6 && enemies[0]) {
      const e = enemies[0];
      const length = Math.min(W, H) * 0.43;
      const bx = Math.cos(rotatingBarAngle) * length;
      const by = Math.sin(rotatingBarAngle) * length;

      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(e.x - bx, e.y - by);
      ctx.lineTo(e.x + bx, e.y + by);
      ctx.stroke();

      for (let t = -1; t <= 1; t += 0.12) {
        rect(
          e.x + bx * t - 3,
          e.y + by * t - 3,
          6,
          6,
          C.orange
        );
      }

      if (stage6Warning > 0) {
        ctx.strokeStyle = C.red;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          e.x,
          e.y,
          Math.min(W, H) * 0.42,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        text("WIDE ATTACK!", W / 2, H * 0.13, 13, C.red, "center");
      }
    }

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

  function menuLength() {
    if (mode === "title") return 2;
    if (mode === "stageSelect") return 8;
    if (mode === "shop") {
      return shopTab === 0 ? ITEM_DEFS.length + 1 : 8;
    }
    if (mode === "pause") return 2;
    if (mode === "gameover") return 2;
    return 0;
  }

  function moveMenu(direction) {
    if (mode === "shop") {
      const length = shopTab === 0 ? ITEM_DEFS.length + 1 : 8;
      menuIndex = (menuIndex + direction + length) % length;
      return;
    }

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
      if (menuIndex >= 0 && menuIndex <= 6) {
        const selectedStage = menuIndex + 1;

        if (unlockedStages.has(selectedStage)) {
          startRun(selectedStage);
        } else {
          openShop();
          shopTab = 1;
          menuIndex = selectedStage - 1;
          shopMessage = `STAGE ${selectedStage} を購入してね`;
          messageTimer = 3;
        }
      } else {
        showTitle();
      }

      return;
    }

    if (mode === "shop") {
      const activeItems = shopTab === 0
        ? ITEM_DEFS
        : Array.from(
            { length: 7 },
            (_, i) => ({ stage: i + 1 })
          ).concat([{ back: true }]);

      const chosen = activeItems[menuIndex];
      if (!chosen) return;

      if (shopTab === 0) {
        if (menuIndex === ITEM_DEFS.length) {
          showTitle();
          return;
        }

        const item = ITEM_DEFS[menuIndex];
        const level = upgrades[item.key];

        if (level >= item.max) {
          shopMessage = "MAX LEVEL!";
          messageTimer = 2;
          return;
        }

        const cost = item.base * (level + 1);

        if (gold < cost) {
          shopMessage = `GOLDが足りない！ あと${cost - gold} GOLD必要`;
          messageTimer = 3;
          return;
        }

        gold -= cost;
        upgrades[item.key]++;

        if (item.key === "speed") {
          player.speed = 310 * (1 + upgrades.speed * 0.15);
        }

        shopMessage = `${item.label}: ${item.detail(upgrades[item.key])}`;
        messageTimer = 2.5;
      } else {
        if (menuIndex === 7) {
          showTitle();
          return;
        }

        const selectedStage = menuIndex + 1;

        if (unlockedStages.has(selectedStage)) {
          startRun(selectedStage);
          return;
        }

        const cost = STAGE_COSTS[selectedStage];

        if (gold < cost) {
          shopMessage = `GOLDが足りない！ あと${cost - gold} GOLD必要`;
          messageTimer = 3;
          return;
        }

        gold -= cost;
        unlockedStages.add(selectedStage);
        shopMessage = `STAGE ${selectedStage} UNLOCKED!`;
        messageTimer = 2.5;
      }

      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
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
    if (mode === "adminCode" || mode === "adminPanel") {
      adminInput = "";
      openShop();
    } else if (mode === "playing") {
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
    if (
      mode === "shop" &&
      e.ctrlKey &&
      e.shiftKey &&
      e.code === "Digit5"
    ) {
      e.preventDefault();
      adminInput = "";
      shopMessage = "";
      mode = "adminCode";
      return;
    }

    if (mode === "adminCode") {
      e.preventDefault();

      if (e.code === "Escape") {
        handleEscape();
      } else if (e.code === "Backspace") {
        adminInput = adminInput.slice(0, -1);
      } else if (
        e.code === "Enter" ||
        e.code === "NumpadEnter"
      ) {
        if (adminInput === ADMIN_CODE) {
          adminInput = "";
          shopMessage = "";
          mode = "adminPanel";
        } else {
          adminInput = "";
          shopMessage = "CODE NOT ACCEPTED";
          messageTimer = 2;
        }
      } else if (
        e.key &&
        e.key.length === 1 &&
        adminInput.length < 24
      ) {
        adminInput += e.key;
      }

      return;
    }

    if (mode === "adminPanel") {
      e.preventDefault();

      if (e.code === "Escape") {
        handleEscape();
      } else if (
        e.code === "Digit1" ||
        e.code === "Numpad1"
      ) {
        addGold(100);
      } else if (
        e.code === "Digit2" ||
        e.code === "Numpad2"
      ) {
        addGold(1000);
      } else if (
        e.code === "Digit3" ||
        e.code === "Numpad3"
      ) {
        addGold(10000);
      }

      return;
    }

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

    if (e.repeat && mode !== "playing") return;

    keys.add(e.code);

    if (e.code === "Escape") {
      handleEscape();
      return;
    }

    if (mode === "playing") return;

    if (
      mode === "shop" &&
      (
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight"
      )
    ) {
      shopTab = e.code === "ArrowLeft" ? 0 : 1;
      menuIndex = 0;
      return;
    }

    if (e.code === "ArrowUp") {
      moveMenu(-1);
      return;
    }

    if (e.code === "ArrowDown") {
      moveMenu(1);
      return;
    }

    if (e.code === "ArrowLeft") {
      moveMenu(-1);
      return;
    }

    if (e.code === "ArrowRight") {
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
      const startY = H * 0.25;
      const gap = Math.min(47, H * 0.083);
      const visible = 7;

      const offset = Math.max(
        0,
        Math.min(8 - visible, menuIndex - visible + 1)
      );

      const index = Math.round((y - startY) / gap) + offset;

      if (index >= 0 && index < 8) {
        menuIndex = index;
        confirmMenu();
      }

      return;
    }

    if (mode === "shop") {
      const panelY = H * 0.22;
      const panelH = H * 0.62;
      const margin = 16;
      const colW = (W - margin * 2 - 18) / 2;
      const rightX = margin + colW + 18;

      if (y < panelY || y > panelY + panelH) return;

      const nextTab = x < rightX ? 0 : 1;

      if (nextTab !== shopTab) {
        shopTab = nextTab;
        menuIndex = 0;
      }

      const rowStart = panelY + 58;
      const rowGap = Math.min(64, (panelH - 75) / 7);
      const visibleIndex = Math.round((y - rowStart) / rowGap);
      const total = shopTab === 0 ? ITEM_DEFS.length + 1 : 8;
      const selected = clamp(menuIndex, 0, total - 1);

      const scrollStart = Math.max(
        0,
        Math.min(total - 6, selected - 5)
      );

      const actualIndex = scrollStart + visibleIndex;

      if (
        visibleIndex >= 0 &&
        visibleIndex < Math.min(6, total) &&
        actualIndex < total
      ) {
        menuIndex = actualIndex;
        confirmMenu();
      }
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
