
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) {
    console.error('Canvas "#game" が見つかりません。');
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
    panel: "#101f30"
  };

  let W = 960, H = 540, dpr = 1, lastTime = 0;
  let mode = "login";
  let menuIndex = 0;
  let shopTab = 0;
  let shopMessage = "";
  let messageTimer = 0;

  // --------------------------------------------------
  // Login / account
  // This is local browser storage, not server authentication.
  // --------------------------------------------------

  const ACCOUNT_KEY = "ruuRpgAccountsV1";
  const SESSION_KEY = "ruuRpgCurrentUserV1";

  let accounts = {};
  let currentUser = "";
  let loginTab = 0; // 0 = login, 1 = register
  let loginField = 0; // 0 = username, 1 = password
  let loginName = "";
  let loginPassword = "";
  let loginMessage = "";

  try {
    accounts = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "{}");
    if (!accounts || typeof accounts !== "object") accounts = {};
    currentUser = localStorage.getItem(SESSION_KEY) || "";

    if (currentUser && accounts[currentUser]) {
      loadAccount(currentUser);
      mode = "title";
    } else {
      currentUser = "";
      mode = "login";
    }
  } catch {
    accounts = {};
    currentUser = "";
    mode = "login";
  }

  function saveAccounts() {
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
      if (currentUser) localStorage.setItem(SESSION_KEY, currentUser);
    } catch {
      loginMessage = "保存できません。ブラウザの設定を確認してください。";
    }
  }

  function defaultSave() {
    return {
      gold: 0,
      unlockedStages: [1],
      upgrades: { speed: 0, heart: 0, slow: 0, gold: 0 }
    };
  }

  let gold = 0;
  let unlockedStages = new Set([1]);
  const upgrades = { speed: 0, heart: 0, slow: 0, gold: 0 };

  function loadAccount(name) {
    currentUser = name;
    const data = accounts[name]?.save || defaultSave();

    gold = Math.max(0, Number(data.gold) || 0);
    unlockedStages = new Set(
      Array.isArray(data.unlockedStages) ? data.unlockedStages : [1]
    );
    unlockedStages.add(1);

    for (const key of Object.keys(upgrades)) {
      upgrades[key] = Math.max(0, Number(data.upgrades?.[key]) || 0);
    }

    try {
      localStorage.setItem(SESSION_KEY, name);
    } catch {}
  }

  function saveProgress() {
    if (!currentUser || !accounts[currentUser]) return;

    accounts[currentUser].save = {
      gold,
      unlockedStages: [...unlockedStages],
      upgrades: { ...upgrades }
    };
    saveAccounts();
  }

  function submitLogin() {
    const name = loginName.trim();
    const password = loginPassword;

    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(name)) {
      loginMessage = "名前は英数字・_・- の3〜20文字にしてください。";
      return;
    }

    if (password.length < 4 || password.length > 64) {
      loginMessage = "パスワードは4〜64文字にしてください。";
      return;
    }

    if (loginTab === 1) {
      if (accounts[name]) {
        loginMessage = "そのユーザー名は既に使われています。";
        return;
      }

      accounts[name] = {
        // Simple local-only password storage; not suitable for public services.
        password,
        save: defaultSave()
      };
      saveAccounts();
      loadAccount(name);
      loginPassword = "";
      loginMessage = "";
      showTitle();
      return;
    }

    if (!accounts[name] || accounts[name].password !== password) {
      loginMessage = "ユーザー名かパスワードが違います。";
      return;
    }

    loadAccount(name);
    loginPassword = "";
    loginMessage = "";
    showTitle();
  }

  function logout() {
    saveProgress();
    currentUser = "";
    loginName = "";
    loginPassword = "";
    loginMessage = "";
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    mode = "login";
    menuIndex = 0;
  }

  // --------------------------------------------------
  // Game state
  // --------------------------------------------------

  let stage = 1;
  let runGold = 0;
  let elapsed = 0;
  let goldTimer = 0;
  let hitFlash = 0;
  let bulletSpeedMultiplier = 1;

  const keys = new Set();
  const touchDirs = new Set();

  let bullets = [];
  let particles = [];
  let edgeWarnings = [];
  let enemies = [];
  let shotTimers = [];
  let radialTimers = [];

  let edgeTimer = 2.25;
  let patternTick = 0;
  let spiralTimer = 0;
  let rainTimer = 0;
  let waveTimer = 0;
  let rotatingBarAngle = 0;
  let stage6BurstTimer = 5;
  let stage6Warning = 0;

  let waveGapY = 0.5;
  let waveGapTarget = 0.5;
  let waveDirectionTimer = 1.5;
  let stage4RainDirection = 1;
  let stage4RainMode = 0;
  let stage4NextDirection = 0;
  let stage4DirectionTimer = 0;

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
      detail: level => `BULLET SPEED -${level * 8}%`,
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
    x: 0, y: 0, r: 5,
    speed: 310, lives: 3, invuln: 0
  };

  const STAGE_COSTS = {
    1: 0, 2: 50, 3: 100, 4: 200,
    5: 350, 6: 500, 7: 800
  };

  const STAGE_REWARDS = {
    1: 1, 2: 3, 3: 7, 4: 15,
    5: 30, 6: 50, 7: 100
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);

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
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  function resetPlayer() {
    player.x = W / 2;
    player.y = H * 0.78;
  }

  function positionEnemies() {
    if (stage === 1 || stage === 3) {
      enemies = [
        { x: W * 0.5, y: H * 0.16, name: "CENTER" },
        { x: W * 0.19, y: H * 0.29, name: "LEFT" },
        { x: W * 0.81, y: H * 0.29, name: "RIGHT" }
      ];
    } else {
      enemies = [{
        x: W * 0.5,
        y: stage === 6 ? H * 0.5 : H * 0.18,
        name: "CENTER"
      }];
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
      shopTab = 1;
      menuIndex = selectedStage - 1;
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

    edgeTimer = 2.25;
    patternTick = 0;
    spiralTimer = 0.15;
    rainTimer = 0.2;
    waveTimer = 0.5;
    rotatingBarAngle = 0;
    stage6BurstTimer = 5;
    stage6Warning = 0;

    waveGapY = 0.5;
    waveGapTarget = 0.5;
    waveDirectionTimer = 1.2;

    stage4RainDirection = 1;
    stage4RainMode = 0;
    stage4NextDirection = 0;
    stage4DirectionTimer = 1.5;

    player.lives = 3 + upgrades.heart;
    player.speed = 310 * (1 + upgrades.speed * 0.15);
    player.invuln = 1.2;

    resetPlayer();
    positionEnemies();

    shotTimers = enemies.map((_, i) => 0.6 + i * 0.35);
    radialTimers = enemies.map((_, i) => 1.5 + i * 0.8);

    mode = "playing";
  }

  function addGold(amount) {
    gold += amount;
    runGold += amount;
    saveProgress();
  }

  function fire(x, y, angle, speed, color = C.pink, radius = 4, limitY = null) {
    const slow = Math.max(0.68, 1 - upgrades.slow * 0.08);

    bullets.push({
      x, y,
      vx: Math.cos(angle) * speed * bulletSpeedMultiplier * slow,
      vy: Math.sin(angle) * speed * bulletSpeedMultiplier * slow,
      r: radius, color, limitY, dead: false
    });
  }

  function aimedShot(enemy, speed, color = C.pink) {
    fire(
      enemy.x, enemy.y,
      Math.atan2(player.y - enemy.y, player.x - enemy.x),
      speed, color
    );
  }

  function radialShot(enemy, count, speed, offset = 0, color = C.pink) {
    for (let i = 0; i < count; i++) {
      fire(
        enemy.x, enemy.y,
        offset + i * Math.PI * 2 / count,
        speed,
        i % 3 === 0 ? C.orange : color
      );
    }
  }

  function fanShot(enemy, count, spread, speed, color = C.orange) {
    const base = Math.atan2(player.y - enemy.y, player.x - enemy.x);

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : -spread / 2 + spread * i / (count - 1);
      fire(enemy.x, enemy.y, base + offset, speed, color);
    }
  }

  function edgeBurst() {
    const side = Math.floor(Math.random() * 4);
    let x, y, angle;

    if (side === 0) {
      x = rand(25, W - 25); y = 18; angle = Math.PI / 2;
    } else if (side === 1) {
      x = W - 18; y = rand(45, H - 25); angle = Math.PI;
    } else if (side === 2) {
      x = rand(25, W - 25); y = H - 18; angle = -Math.PI / 2;
    } else {
      x = 18; y = rand(45, H - 25); angle = 0;
    }

    edgeWarnings.push({ x, y, angle, life: 0.55, fired: false });
  }

  // Stage 4: incoming rain from all four directions.
  function stage4Rain() {
    const mode = stage4RainMode;
    const count = 9 + Math.floor(Math.random() * 6);

    for (let i = 0; i < count; i++) {
      const color = i % 3 === 0 ? C.orange : C.blue;

      if (mode === 0) {
        // From above, falling down.
        fire(rand(10, W - 10), 15, Math.PI / 2 + rand(-0.12, 0.12),
          rand(180, 245), color, 4);
      } else if (mode === 1) {
        // From the right, moving left.
        fire(W - 15, rand(50, H - 10), Math.PI + rand(-0.15, 0.15),
          rand(180, 245), color, 4);
      } else if (mode === 2) {
        // From below, moving up.
        fire(rand(10, W - 10), H - 15, -Math.PI / 2 + rand(-0.12, 0.12),
          rand(180, 245), color, 4);
      } else {
        // From the left, moving right.
        fire(15, rand(50, H - 10), rand(-0.15, 0.15),
          rand(180, 245), color, 4);
      }
    }
  }

  // Stage 5: Sans-inspired horizontal bone waves.
  // Safe gaps shift vertically between volleys.
  function stage5Wave() {
    const gapSize = Math.max(90, H * 0.2);
    const gapCenter = H * waveGapY;
    const gapTop = gapCenter - gapSize / 2;
    const gapBottom = gapCenter + gapSize / 2;
    const spacing = 22;

    // Top and bottom walls move horizontally toward the player.
    // Gaps are represented by missing bone projectiles.
    for (let y = 65; y < H - 25; y += spacing) {
      if (y > gapTop && y < gapBottom) continue;

      // Bones approach from the left.
      fire(8, y, 0, 230, C.white, 6);
    }

    for (let y = 65; y < H - 25; y += spacing) {
      if (y > gapTop && y < gapBottom) continue;

      // Bones approach from the right.
      fire(W - 8, y, Math.PI, 230, C.white, 6);
    }

    // A small alternating set of faster pink bones adds pressure.
    if (Math.random() < 0.55) {
      const y = rand(55, H - 30);
      if (y < gapTop || y > gapBottom) {
        fire(8, y, 0, 285, C.pink, 5);
        fire(W - 8, y, Math.PI, 285, C.pink, 5);
      }
    }
  }

  function damagePlayer() {
    if (player.invuln > 0) return;

    player.lives--;
    player.invuln = 1.25;
    hitFlash = 0.2;

    for (let i = 0; i < 8; i++) {
      particles.push({
        x: player.x, y: player.y,
        vx: rand(-65, 65), vy: rand(-65, 65),
        life: 0.35, color: C.pink
      });
    }

    if (player.lives <= 0) {
      mode = "gameover";
      menuIndex = 0;
      bullets = [];
      edgeWarnings = [];
      saveProgress();
    }
  }

  function update(dt) {
    if (messageTimer > 0) messageTimer -= dt;
    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    const tier = Math.floor(elapsed / 30);
    bulletSpeedMultiplier =
      1 + 0.65 * tier + 0.15 * tier * (tier - 1) / 2;

    let dx = 0, dy = 0;

    if (keys.has("ArrowLeft") || keys.has("KeyA") || touchDirs.has("left")) dx--;
    if (keys.has("ArrowRight") || keys.has("KeyD") || touchDirs.has("right")) dx++;
    if (keys.has("ArrowUp") || keys.has("KeyW") || touchDirs.has("up")) dy--;
    if (keys.has("ArrowDown") || keys.has("KeyS") || touchDirs.has("down")) dy++;

    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    player.x = clamp(player.x + dx * player.speed * dt, 12, W - 12);
    player.y = clamp(player.y + dy * player.speed * dt, 45, H - 18);

    // Stage 1: three enemies.
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        shotTimers[i] -= dt;
        radialTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          aimedShot(e, i === 0 ? 205 : 190, i === 0 ? C.pink : C.orange);
          shotTimers[i] = i === 0 ? 0.92 : 1.2;
        }

        if (radialTimers[i] <= 0) {
          if (i === 0) radialShot(e, 12, 135, patternTick * 0.25, C.pink);
          else fanShot(e, 11, 1.65, 155, C.orange);
          radialTimers[i] = i === 0 ? 3.1 : 3.8;
        }
      }
    }

    // Stage 2: central radial attacks and frequent edge attacks.
    if (stage === 2) {
      radialTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(enemies[0], 18 + Math.min(10, Math.floor(elapsed / 8)),
          155 + Math.min(45, elapsed * 0.6), patternTick * 0.16);
        radialTimers[0] = 1.9;
      }

      edgeTimer -= dt;
      if (edgeTimer <= 0) {
        edgeBurst();
        if (Math.random() < 0.35) edgeBurst();
        if (Math.random() < 0.12) edgeBurst();
        edgeTimer = rand(1.25, 2.4);
      }
    }

    // Stage 3: left, center and right enemies all fire spirals.
    if (stage === 3) {
      spiralTimer -= dt;

      if (spiralTimer <= 0) {
        const speed = 125 + Math.min(45, elapsed * 0.5);

        enemies.forEach((e, i) => {
          const a = patternTick * 2.1 + i * Math.PI * 2 / 3;
          fire(e.x, e.y, a, speed, C.pink, 4);
          fire(e.x, e.y, a + Math.PI, speed, C.blue, 4);
        });

        spiralTimer = 0.075;
      }

      radialTimers[0] -= dt;
      if (radialTimers[0] <= 0) {
        enemies.forEach((e, i) => {
          radialShot(e, 9, 145, patternTick * 0.4 + i * 0.7, C.orange);
        });
        radialTimers[0] = 4.5;
      }
    }

    // Stage 4: direction changes unpredictably between all four sides.
    if (stage === 4) {
      rainTimer -= dt;
      stage4DirectionTimer -= dt;

      if (stage4DirectionTimer <= 0) {
        stage4RainMode = Math.floor(Math.random() * 4);
        stage4DirectionTimer = rand(0.8, 2.3);
        rainTimer = Math.min(rainTimer, 0.08);
      }

      if (rainTimer <= 0) {
        stage4Rain();
        rainTimer = rand(0.25, 0.55);
      }
    }

    // Stage 5: horizontal bone waves with moving safe corridor.
    if (stage === 5) {
      waveTimer -= dt;
      waveDirectionTimer -= dt;

      if (waveDirectionTimer <= 0) {
        waveGapTarget = rand(0.25, 0.75);
        waveDirectionTimer = rand(0.7, 1.35);
      }

      waveGapY += (waveGapTarget - waveGapY) * Math.min(1, dt * 1.7);

      if (waveTimer <= 0) {
        stage5Wave();
        waveTimer = rand(0.48, 0.75);
      }
    }

    // Stage 6: extra-long rotating bar and periodic radial burst.
    if (stage === 6) {
      rotatingBarAngle += dt * 1.35;
      const e = enemies[0];

      // Length is based on the canvas diagonal so the bar reaches corners.
      const barLength = Math.hypot(W, H) * 0.72;
      const ux = Math.cos(rotatingBarAngle);
      const uy = Math.sin(rotatingBarAngle);

      const ax = e.x - ux * barLength;
      const ay = e.y - uy * barLength;
      const bx = e.x + ux * barLength;
      const by = e.y + uy * barLength;

      const vx = bx - ax;
      const vy = by - ay;
      const denom = vx * vx + vy * vy || 1;
      const t = clamp(((player.x - ax) * vx + (player.y - ay) * vy) / denom, 0, 1);
      const cx = ax + t * vx;
      const cy = ay + t * vy;

      if (player.invuln <= 0 && Math.hypot(player.x - cx, player.y - cy) < 12) {
        damagePlayer();
      }

      stage6BurstTimer -= dt;

      if (stage6Warning > 0) {
        stage6Warning -= dt;
        if (stage6Warning <= 0) {
          radialShot(e, 28, 195, patternTick * 0.12, C.orange);
        }
      }

      if (stage6BurstTimer <= 0 && stage6Warning <= 0) {
        stage6Warning = 0.8;
        stage6BurstTimer = rand(6, 9);
      }
    }

    // Stage 7: fast radial attack plus aimed shots.
    if (stage === 7) {
      radialTimers[0] -= dt;
      shotTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(enemies[0], 32, 185, patternTick * 0.22, C.blue);
        radialTimers[0] = 2.1;
      }

      if (shotTimers[0] <= 0) {
        aimedShot(enemies[0], 225, C.pink);
        shotTimers[0] = 0.65;
      }
    }

    // Edge warning markers fire a fan.
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {
        warning.fired = true;
        for (let i = -3; i <= 3; i++) {
          fire(warning.x, warning.y, warning.angle + i * 0.15, 235, C.orange);
        }
      }
    }

    edgeWarnings = edgeWarnings.filter(w => w.life > -0.8);

    // Move projectiles and check collisions.
    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.limitY !== null && b.limitY !== undefined) {
        if ((b.vy > 0 && b.y >= b.limitY) || (b.vy < 0 && b.y <= b.limitY)) {
          b.dead = true;
        }
      }

      if (!b.dead && player.invuln <= 0 &&
          Math.hypot(player.x - b.x, player.y - b.y) < player.r + b.r) {
        b.dead = true;
        damagePlayer();
        if (mode === "gameover") break;
      }
    }

    bullets = bullets.filter(b =>
      !b.dead && b.x > -50 && b.x < W + 50 &&
      b.y > -50 && b.y < H + 50
    );

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);

    // GOLD every 10 seconds.
    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;
      const goldTier = Math.floor(elapsed / 30);
      const reward = STAGE_REWARDS[stage] || 1;

      addGold(Math.round(
        reward * (1 + upgrades.gold * 0.25) * Math.pow(2, goldTier)
      ));
    }
  }

  // --------------------------------------------------
  // Drawing helpers
  // --------------------------------------------------

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(value, x, y, size = 16, color = C.white, align = "left") {
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

    for (let x = 20; x < W; x += 32) rect(x, 0, 1, H, "#1d3042");
    for (let y = 20; y < H; y += 32) rect(0, y, W, 1, "#1d3042");

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
      rect(x - 13, y - 17, 6, 6, C.pink);
      rect(x + 7, y - 17, 6, 6, C.pink);
      rect(x - 12, y - 5, 7, 7, C.bg);
      rect(x + 5, y - 5, 7, 7, C.bg);
      rect(x - 6, y + 7, 12, 4, C.bg);
      rect(x - 9, y + 15, 18, 5, "#56d9ff");
      return;
    }

    const body = stage === 3
      ? (index === 1 ? C.blue : index === 2 ? C.green : C.pink)
      : C.red;

    rect(x - 5, y - 21, 5, 8, C.orange);
    rect(x + 1, y - 21, 5, 8, C.orange);
    rect(x - 17, y - 13, 34, 26, body);
    rect(x - 22, y - 5, 5, 12, body);
    rect(x + 17, y - 5, 5, 12, body);
    rect(x - 10, y - 5, 6, 6, C.bg);
    rect(x + 4, y - 5, 6, 6, C.bg);
    rect(x - 5, y + 6, 10, 3, C.bg);
    rect(x - 11, y + 13, 7, 5, C.orange);
    rect(x + 4, y + 13, 7, 5, C.orange);
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    rect(player.x - 3, player.y - 7, 6, 14, C.red);
    rect(player.x - 7, player.y - 3, 14, 6, C.red);
    rect(player.x - 2, player.y - 2, 4, 4, "#ff9aa5");
  }

  function drawBullet(b) {
    if (stage === 5) {
      // Bone-like horizontal projectiles.
      rect(b.x - 10, b.y - 3, 20, 6, b.color);
      rect(b.x - 12, b.y - 5, 4, 10, b.color);
      rect(b.x + 8, b.y - 5, 4, 10, b.color);
    } else {
      rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, b.color);
      rect(b.x - 1, b.y - 1, 2, 2, "#fff0d0");
    }
  }

  function drawButton(label, x, y, selected, width = 300, height = 48) {
    rect(x - width / 2, y - height / 2, width, height,
      selected ? "#1b3850" : C.panel);

    ctx.strokeStyle = selected ? C.blue : C.line;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    text(`${selected ? "> " : "  "}${label}`, x, y,
      Math.min(18, width * 0.052),
      selected ? C.gold : C.white, "center");
  }

  // --------------------------------------------------
  // Screens
  // --------------------------------------------------

  function drawLogin() {
    text("RUU RPG", W / 2, H * 0.16, Math.min(38, W * 0.05), C.white, "center");
    text("LOGIN / CREATE ACCOUNT", W / 2, H * 0.25, 15, C.muted, "center");

    drawButton("LOGIN", W * 0.35, H * 0.34, loginTab === 0, Math.min(W * 0.38, 230), 42);
    drawButton("REGISTER", W * 0.65, H * 0.34, loginTab === 1, Math.min(W * 0.38, 230), 42);

    const boxW = Math.min(W - 50, 420);
    const left = W / 2 - boxW / 2;
    const nameY = H * 0.47;
    const passY = H * 0.59;

    rect(left, nameY - 20, boxW, 40, C.panel);
    ctx.strokeStyle = loginField === 0 ? C.blue : C.line;
    ctx.strokeRect(left, nameY - 20, boxW, 40);
    text(`USER: ${loginName || "_"}`, W / 2, nameY, 16, C.white, "center");

    rect(left, passY - 20, boxW, 40, C.panel);
    ctx.strokeStyle = loginField === 1 ? C.blue : C.line;
    ctx.strokeRect(left, passY - 20, boxW, 40);
    text(`PASS: ${"*".repeat(loginPassword.length) || "_"}`,
      W / 2, passY, 16, C.white, "center");

    drawButton("CONFIRM", W / 2, H * 0.72, true, Math.min(W - 50, 300), 44);

    text("TAB: SWITCH FIELD   ENTER: CONFIRM",
      W / 2, H * 0.82, 11, C.muted, "center");

    text("Username: 3-20 letters/numbers/_/-",
      W / 2, H * 0.87, 10, C.muted, "center");

    if (loginMessage) {
      text(loginMessage, W / 2, H * 0.94, 11, C.orange, "center");
    }
  }

  function drawTitle() {
    drawEnemy({ x: W / 2, y: H * 0.16 }, 0);
    text("RUU RPG", W / 2, H * 0.29, Math.min(38, W * 0.05), C.white, "center");
    text(`USER: ${currentUser}`, W / 2, H * 0.36, 12, C.muted, "center");
    text("DODGE - SURVIVE - COLLECT GOLD", W / 2, H * 0.41,
      Math.min(15, W * 0.02), C.muted, "center");

    drawButton("GAME START", W / 2, H * 0.53, menuIndex === 0,
      Math.min(W - 40, 380), 56);
    drawButton("SHOP", W / 2, H * 0.66, menuIndex === 1,
      Math.min(W - 40, 300), 44);
    drawButton("LOG OUT", W / 2, H * 0.77, menuIndex === 2,
      Math.min(W - 40, 260), 38);

    text(`GOLD ${gold}`, W - 20, 24, 16, C.gold, "right");
    text("UP / DOWN: SELECT   SPACE: CONFIRM", W / 2, H * 0.9, 11, C.muted, "center");
  }

  function drawStageSelect() {
    text("SELECT STAGE", W / 2, H * 0.08, 25, C.white, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.14, 15, C.gold, "center");

    const items = Array.from({ length: 7 }, (_, i) => i + 1).map(n => ({
      label: `STAGE ${n} ${unlockedStages.has(n) ? "- PLAY" : "- LOCKED"}`,
      detail: `FIRST REWARD: ${STAGE_REWARDS[n]} GOLD${
        unlockedStages.has(n) ? "" : ` | SHOP COST ${STAGE_COSTS[n]}G`
      }`,
      unlocked: unlockedStages.has(n)
    }));
    items.push({ label: "BACK", detail: "RETURN TO TITLE", unlocked: true });

    const rowGap = Math.min(46, H * 0.08);
    const startY = H * 0.22;
    const visible = 7;
    const offset = Math.max(0, Math.min(items.length - visible, menuIndex - visible + 1));

    items.slice(offset, offset + visible).forEach((item, i) => {
      const index = offset + i;
      drawButton(item.label, W / 2, startY + i * rowGap,
        menuIndex === index, Math.min(W - 36, 460), 29);
      text(item.detail, W / 2, startY + i * rowGap + 16, 9,
        item.unlocked ? C.muted : C.orange, "center");
    });

    text("UP / DOWN: SELECT   ENTER: CONFIRM   ESC: BACK",
      W / 2, H * 0.95, 10, C.muted, "center");
  }

  function drawShop() {
    text("SHOP", W / 2, H * 0.08, 28, C.gold, "center");
    text(`YOUR GOLD: ${gold}`, W / 2, H * 0.15, 15, C.white, "center");

    const margin = 16, gap = 18;
    const colW = (W - margin * 2 - gap) / 2;
    const panelY = H * 0.21, panelH = H * 0.65;
    const leftX = margin, rightX = margin + colW + gap;

    rect(leftX, panelY, colW, panelH, shopTab === 0 ? "#122b3d" : C.panel);
    rect(rightX, panelY, colW, panelH, shopTab === 1 ? "#122b3d" : C.panel);

    ctx.strokeStyle = shopTab === 0 ? C.blue : C.line;
    ctx.strokeRect(leftX, panelY, colW, panelH);
    ctx.strokeStyle = shopTab === 1 ? C.blue : C.line;
    ctx.strokeRect(rightX, panelY, colW, panelH);

    text(`${shopTab === 0 ? "> " : ""}ITEMS`, leftX + colW / 2,
      panelY + 20, 15, shopTab === 0 ? C.gold : C.white, "center");
    text(`${shopTab === 1 ? "> " : ""}STAGES`, rightX + colW / 2,
      panelY + 20, 15, shopTab === 1 ? C.gold : C.white, "center");

    const items = ITEM_DEFS.map(item => {
      const level = upgrades[item.key];
      const cost = item.base * (level + 1);
      return {
        kind: "item",
        label: `${item.label} Lv.${level}/${item.max}`,
        detail: level >= item.max ? "MAX LEVEL" :
          `${item.detail(level + 1)} | COST ${cost}G`,
        cost,
        maxed: level >= item.max
      };
    });
    items.push({ kind: "back", label: "BACK TO TITLE", detail: "RETURN TO MAIN MENU" });

    const stages = Array.from({ length: 7 }, (_, i) => i + 1).map(n => {
      const owned = unlockedStages.has(n);
      return {
        kind: "stage", stage: n,
        label: `STAGE ${n} ${owned ? "- OWNED" : "- LOCKED"}`,
        detail: `FIRST REWARD: ${STAGE_REWARDS[n]} GOLD` +
          (n === 1 ? " | FREE" : owned ? " | PLAY FREE" : ` | COST ${STAGE_COSTS[n]}G`),
        unlocked: owned,
        cost: STAGE_COSTS[n]
      };
    });
    stages.push({ kind: "back", label: "BACK TO TITLE", detail: "RETURN TO MAIN MENU" });

    const active = shopTab === 0 ? items : stages;
    const selected = clamp(menuIndex, 0, active.length - 1);
    const visibleCount = 6;
    const scrollStart = Math.max(0, Math.min(active.length - visibleCount, selected - visibleCount + 1));
    const rowStart = panelY + 56;
    const rowGap = Math.min(63, (panelH - 70) / 6);

    active.slice(scrollStart, scrollStart + visibleCount).forEach((item, i) => {
      const index = scrollStart + i;
      const x = shopTab === 0 ? leftX : rightX;
      const y = rowStart + i * rowGap;
      const selectedRow = index === selected;
      const disabled = item.maxed || (item.kind === "stage" && !item.unlocked && gold < item.cost);

      rect(x + 7, y - 15, colW - 14, 30, selectedRow ? "#1b3850" : "#0c1926");
      ctx.strokeStyle = selectedRow ? C.blue : C.line;
      ctx.strokeRect(x + 7, y - 15, colW - 14, 30);

      text(`${selectedRow ? "> " : ""}${item.label}`, x + colW / 2,
        y - 5, Math.min(11, colW * 0.035),
        disabled ? C.muted : C.white, "center");

      text(item.detail, x + colW / 2, y + 14,
        Math.min(9, colW * 0.029),
        disabled ? C.orange : C.muted, "center");
    });

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.89, 11, C.orange, "center");
    }

    text("LEFT / RIGHT: SWITCH PANEL   UP / DOWN: SELECT   ENTER: BUY / PLAY",
      W / 2, H * 0.95, Math.min(10, W * 0.014), C.muted, "center");
  }

  function drawPause() {
    text("PAUSED", W / 2, H * 0.3, 30, C.white, "center");
    drawButton("RESUME", W / 2, H * 0.45, menuIndex === 0);
    drawButton("GIVE UP - GO TO SHOP", W / 2, H * 0.56, menuIndex === 1,
      Math.min(W - 30, 340));
    text("UP / DOWN: SELECT   SPACE: CONFIRM", W / 2, H * 0.69, 12, C.muted, "center");
  }

  function drawGameOver() {
    text("GAME OVER", W / 2, H * 0.26, 32, C.pink, "center");
    text(`SURVIVED ${elapsed.toFixed(1)}s`, W / 2, H * 0.35, 15, C.white, "center");
    text(`GOLD: ${gold} (+${runGold})`, W / 2, H * 0.42, 15, C.gold, "center");
    drawButton("RETRY", W / 2, H * 0.55, menuIndex === 0);
    drawButton("GO TO SHOP", W / 2, H * 0.65, menuIndex === 1);
    text("UP / DOWN: SELECT   SPACE: CONFIRM", W / 2, H * 0.78, 12, C.muted, "center");
  }

  function drawBattle() {
    text(`STAGE ${stage}`, 18, 22, 15, C.white);
    text(`GOLD ${gold}`, W - 18, 22, 15, C.gold, "right");
    text(`HP ${"♥".repeat(Math.max(0, player.lives))}`, 18, 45, 14, C.pink);
    text(`TIME ${elapsed.toFixed(1)}s`, W / 2, 23, 14, C.white, "center");
    text(`BULLET x${bulletSpeedMultiplier.toFixed(2)}`, W / 2, 44, 11, C.orange, "center");

    if (stage === 5) {
      const gapSize = Math.max(90, H * 0.2);
      const gapCenter = H * waveGapY;
      rect(0, 50, 7, Math.max(0, gapCenter - gapSize / 2 - 50), C.white);
      rect(0, gapCenter + gapSize / 2, 7, H - gapCenter - gapSize / 2, C.white);
      rect(W - 7, 50, 7, Math.max(0, gapCenter - gapSize / 2 - 50), C.white);
      rect(W - 7, gapCenter + gapSize / 2, 7, H - gapCenter - gapSize / 2, C.white);
    }

    if (stage === 6 && enemies[0]) {
      const e = enemies[0];
      const length = Math.hypot(W, H) * 0.72;
      const bx = Math.cos(rotatingBarAngle) * length;
      const by = Math.sin(rotatingBarAngle) * length;

      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(e.x - bx, e.y - by);
      ctx.lineTo(e.x + bx, e.y + by);
      ctx.stroke();

      if (stage6Warning > 0) {
        ctx.strokeStyle = C.red;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.min(W, H) * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        text("WIDE ATTACK!", W / 2, H * 0.13, 13, C.red, "center");
      }
    }

    enemies.forEach((e, i) => drawEnemy(e, i));

    for (const w of edgeWarnings) {
      if (w.life > 0) {
        ctx.globalAlpha = Math.floor(performance.now() / 100) % 2 ? 0.8 : 0.3;
        rect(w.x - 7, w.y - 7, 14, 14, C.orange);
        ctx.globalAlpha = 1;
      }
    }

    bullets.forEach(drawBullet);
    particles.forEach(p => rect(p.x, p.y, 3, 3, p.color));
    drawPlayer();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();

    if (mode === "login") return drawLogin();
    if (mode === "title") return drawTitle();
    if (mode === "stageSelect") return drawStageSelect();
    if (mode === "shop") return drawShop();

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

  // --------------------------------------------------
  // Menu and input
  // --------------------------------------------------

  function menuLength() {
    if (mode === "title") return 3;
    if (mode === "stageSelect") return 8;
    if (mode === "shop") return shopTab === 0 ? ITEM_DEFS.length + 1 : 8;
    if (mode === "pause" || mode === "gameover") return 2;
    return 0;
  }

  function moveMenu(direction) {
    const length = menuLength();
    if (!length) return;
    menuIndex = (menuIndex + direction + length) % length;
  }

  function confirmMenu() {
    if (mode === "login") {
      submitLogin();
      return;
    }

    if (mode === "title") {
      if (menuIndex === 0) showStageSelect();
      else if (menuIndex === 1) openShop();
      else logout();
      return;
    }

    if (mode === "stageSelect") {
      if (menuIndex <= 6) {
        const n = menuIndex + 1;
        if (unlockedStages.has(n)) startRun(n);
        else {
          openShop();
          shopTab = 1;
          menuIndex = n - 1;
          shopMessage = `STAGE ${n} を購入してね`;
          messageTimer = 3;
        }
      } else {
        showTitle();
      }
      return;
    }

    if (mode === "shop") {
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
        saveProgress();
      } else {
        if (menuIndex === 7) {
          showTitle();
          return;
        }

        const n = menuIndex + 1;
        if (unlockedStages.has(n)) {
          startRun(n);
          return;
        }

        const cost = STAGE_COSTS[n];
        if (gold < cost) {
          shopMessage = `GOLDが足りない！ あと${cost - gold} GOLD必要`;
          messageTimer = 3;
          return;
        }

        gold -= cost;
        unlockedStages.add(n);
        shopMessage = `STAGE ${n} UNLOCKED!`;
        messageTimer = 2.5;
        saveProgress();
      }
      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) mode = "playing";
      else {
        bullets = [];
        edgeWarnings = [];
        openShop();
      }
      return;
    }

    if (mode === "gameover") {
      if (menuIndex === 0) startRun(stage);
      else openShop();
    }
  }

  function handleEscape() {
    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
    } else if (mode === "pause") {
      mode = "playing";
    } else if (mode === "shop" || mode === "stageSelect" || mode === "gameover") {
      showTitle();
    } else if (mode === "login") {
      loginField = 0;
      loginPassword = "";
    }
  }

  function keyDown(e) {
    if (mode === "login") {
      if (e.code === "Tab") {
        e.preventDefault();
        loginField = 1 - loginField;
        return;
      }

      if (e.code === "Escape") {
        loginPassword = "";
        return;
      }

      if (e.code === "Backspace") {
        e.preventDefault();
        if (loginField === 0) loginName = loginName.slice(0, -1);
        else loginPassword = loginPassword.slice(0, -1);
        return;
      }

      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        submitLogin();
        return;
      }

      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        loginTab = e.code === "ArrowLeft" ? 0 : 1;
        return;
      }

      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (loginField === 0 && loginName.length < 20) loginName += e.key;
        else if (loginField === 1 && loginPassword.length < 64) loginPassword += e.key;
      }
      return;
    }

    const menuKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "Escape", "Enter"];

    if (menuKeys.includes(e.code)) e.preventDefault();
    if (e.repeat && mode !== "playing") return;

    keys.add(e.code);

    if (e.code === "Escape") {
      handleEscape();
      return;
    }

    if (mode === "playing") return;

    if (mode === "shop" && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
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

    if (e.code === "ArrowLeft" || e.code === "ArrowRight") return;

    if (e.code === "Space" || e.code === "Enter") confirmMenu();
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
      if (mode === "pause") mode = "playing";
      else if (mode === "login") submitLogin();
      else if (mode === "title") confirmMenu();
      else if (mode === "stageSelect" || mode === "shop" || mode === "gameover") confirmMenu();
    });
  }

  canvas.addEventListener("pointerdown", e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "login") {
      if (y > H * 0.28 && y < H * 0.4) {
        loginTab = x < W / 2 ? 0 : 1;
      } else if (y > H * 0.42 && y < H * 0.52) {
        loginField = 0;
      } else if (y > H * 0.54 && y < H * 0.64) {
        loginField = 1;
      } else if (y > H * 0.67 && y < H * 0.78) {
        submitLogin();
      }
      return;
    }

    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
      return;
    }

    if (mode === "title") {
      if (y > H * 0.47 && y < H * 0.59) {
        menuIndex = 0;
        confirmMenu();
      } else if (y >= H * 0.6 && y < H * 0.72) {
        menuIndex = 1;
        confirmMenu();
      } else if (y >= H * 0.72 && y < H * 0.83) {
        menuIndex = 2;
        confirmMenu();
      }
      return;
    }

    if (mode === "shop") {
      const panelY = H * 0.21;
      const panelH = H * 0.65;
      const margin = 16;
      const colW = (W - margin * 2 - 18) / 2;
      const rightX = margin + colW + 18;

      if (y < panelY || y > panelY + panelH) return;

      shopTab = x < rightX ? 0 : 1;
      const total = shopTab === 0 ? ITEM_DEFS.length + 1 : 8;
      const rowStart = panelY + 56;
      const rowGap = Math.min(63, (panelH - 70) / 6);
      const index = Math.round((y - rowStart) / rowGap);
      if (index >= 0 && index < 6) {
        const selected = clamp(menuIndex, 0, total - 1);
        const scrollStart = Math.max(0, Math.min(total - 6, selected - 5));
        menuIndex = clamp(scrollStart + index, 0, total - 1);
        confirmMenu();
      }
      return;
    }

    if (mode === "stageSelect") {
      const startY = H * 0.22;
      const gap = Math.min(46, H * 0.08);
      const offset = Math.max(0, Math.min(8 - 7, menuIndex - 6));
      const index = Math.round((y - startY) / gap) + offset;
      if (index >= 0 && index < 8) {
        menuIndex = index;
        confirmMenu();
      }
      return;
    }

    if (mode === "pause" || mode === "gameover") {
      const ys = mode === "pause" ? [H * 0.45, H * 0.56] : [H * 0.55, H * 0.65];
      const found = ys.findIndex(yy => Math.abs(y - yy) < 28 &&
        Math.abs(x - W / 2) < Math.min(W * 0.45, 210));
      if (found >= 0) {
        menuIndex = found;
        confirmMenu();
      }
    }
  });

  function frame(now) {
    const dt = Math.min(0.035, (now - (lastTime || now)) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
