(() => {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) {
    console.error('canvas id="game" が見つかりません。');
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 960, H = 540, dpr = 1;
  let lastTime = 0;
  let mode = "title";
  let stage = 1;
  let gold = 0, runGold = 0, elapsed = 0;
  let goldTimer = 0, edgeTimer = 2, patternTick = 0;
  let bulletSpeedMultiplier = 1;
  let bulletCountBonus = 0;
  let reviveUsed = false;
  let pulseTimer = 0;
  let stage4SwitchTimer = 0, stage4RainTimer = 0, stage4Direction = 0;
  let stage5WaveTimer = 0, stage5SafeY = 0, stage6Angle = 0, stage6BurstTimer = 0;
  let hitFlash = 0, healTimer = 0, guardTimer = 0;
  let menuIndex = 0;
  let shopMessage = "", messageTimer = 0;
  let shopScroll = 0;
  let upgradeScroll = 0;
  let adminInput = "";
  const ADMIN_CODE = "O0p-@^";

  const C = {
    bg: "#07111b",
    panel: "#101f30",
    line: "#26384b",
    white: "#e8edf4",
    muted: "#9eafc1",
    pink: "#ff6575",
    red: "#ff465e",
    orange: "#ffad55",
    gold: "#ffd166",
    blue: "#75c9ff",
    green: "#78e0ae",
    purple: "#a78bfa"
  };

  const keys = new Set();
  const touchDirs = new Set();
  let bullets = [];
  let particles = [];
  let edgeWarnings = [];
  let enemies = [];
  let shotTimers = [];
  let radialTimers = [];

  const player = {
    x: 0, y: 0, r: 5, speed: 310,
    lives: 3, maxLives: 3, invuln: 0
  };

  const upgrades = {
    speed: 0,
    hearts: 0,
    bulletSlow: 0,
    goldBonus: 0,
    guard: 0,
    regen: 0,
    fortune: 0,
    revive: 0,
    startingShield: 0,
    bulletPulse: 0
  };

  const UPGRADE_COSTS = {
    speed: [35, 55, 80, 110],
    hearts: [45, 75, 110],
    bulletSlow: [65, 95, 130, 170],
    goldBonus: [80, 120, 170, 230],
    guard: [70, 105, 150],
    regen: [100, 150, 220],
    fortune: [1500, 3500, 8000],
    revive: [6000],
    startingShield: [1800, 4000, 9000],
    bulletPulse: [2500, 6000, 12000]
  };

  const STAGES = [
    { id: 1, cost: 0, reward: 1, name: "はじまりのステージ", color: "#ff6575" },
    { id: 2, cost: 50, reward: 3, name: "エッジアタック", color: "#a78bfa" },
    { id: 3, cost: 100, reward: 7, name: "スパイラル", color: "#78e0ae" },
    { id: 4, cost: 200, reward: 15, name: "レインストーム", color: "#ffad55" },
    { id: 5, cost: 350, reward: 30, name: "ウェーブ", color: "#ff6575" },
    { id: 6, cost: 500, reward: 50, name: "回転バー", color: "#75c9ff" },
    { id: 7, cost: 800, reward: 100, name: "カオス", color: "#a78bfa" },
    { id: 8, cost: 1300, reward: 160, name: "深淵の門", color: "#ff465e" },
    { id: 9, cost: 2200, reward: 260, name: "星屑の嵐", color: "#75c9ff" },
    { id: 10, cost: 3600, reward: 420, name: "紫電回廊", color: "#a78bfa" },
    { id: 11, cost: 5800, reward: 680, name: "灼熱地獄", color: "#ffad55" },
    { id: 12, cost: 9000, reward: 1050, name: "無限螺旋", color: "#78e0ae" },
    { id: 13, cost: 14000, reward: 1650, name: "終焉の雨", color: "#ff6575" },
    { id: 14, cost: 22000, reward: 2600, name: "虚空の王", color: "#a78bfa" },
    { id: 15, cost: 35000, reward: 4200, name: "ラスト・カオス", color: "#ffd166" }
  ];

  const unlockedStages = new Set([1]);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // ============================================================
  // ログイン・新規登録
  // ============================================================

  // ブラウザ内だけで動く試作版です。
  // 本番用の認証にはサーバー側のアカウント管理が必要です。
  const AUTH_KEY = "ruuRpgAccountsV1";
  const SESSION_KEY = "ruuRpgCurrentUserV1";
  let currentUser = null;
  let authRoot = null;

  const AUTH_BACKUP_KEY = "ruuRpgAccountsBackupV1";

  function readAccounts() {
    const isValidAccounts = value =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0;

    try {
      const primary = JSON.parse(
        localStorage.getItem(AUTH_KEY) || "{}"
      );

      if (isValidAccounts(primary)) {
        return primary;
      }

      const backup = JSON.parse(
        localStorage.getItem(AUTH_BACKUP_KEY) || "{}"
      );

      if (isValidAccounts(backup)) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(backup));
        return backup;
      }

      return {};
    } catch {
      try {
        const backup = JSON.parse(
          localStorage.getItem(AUTH_BACKUP_KEY) || "{}"
        );

        return isValidAccounts(backup) ? backup : {};
      } catch {
        return {};
      }
    }
  }

  function saveAccounts(accounts) {
    const data = JSON.stringify(accounts);

    localStorage.setItem(AUTH_KEY, data);
    localStorage.setItem(AUTH_BACKUP_KEY, data);
  }

  async function hashPassword(password) {
    if (!crypto.subtle) {
      throw new Error(
        "安全なパスワード処理を利用できません。HTTPSまたはlocalhostで開いてください。"
      );
    }

    const bytes = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function makeAuthScreen() {
    if (authRoot) authRoot.remove();

    authRoot = document.createElement("div");
    authRoot.id = "ruu-auth";
    authRoot.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      display:flex; align-items:center; justify-content:center;
      padding:20px; box-sizing:border-box;
      background:#07111b; color:#e8edf4;
      font-family:system-ui,sans-serif;
    `;

    authRoot.innerHTML = `
      <div style="
        width:min(420px,100%); box-sizing:border-box;
        padding:28px; border:1px solid #26384b;
        border-radius:16px; background:#101f30;
        box-shadow:0 20px 80px #0008;
      ">
        <h1 style="text-align:center;margin:0 0 8px;font-size:30px">
          RUU RPG
        </h1>
        <p style="text-align:center;color:#9eafc1;margin:0 0 24px">
          ログインして冒険を始めよう
        </p>

        <div style="display:flex;gap:8px;margin-bottom:18px">
          <button type="button" data-auth-mode="login"
            style="flex:1;padding:11px;border:0;border-radius:8px;
            background:#75c9ff;color:#07111b;font-weight:bold;cursor:pointer">
            ログイン
          </button>
          <button type="button" data-auth-mode="register"
            style="flex:1;padding:11px;border:1px solid #26384b;
            border-radius:8px;background:#07111b;color:#e8edf4;cursor:pointer">
            新規登録
          </button>
        </div>

        <form id="ruu-auth-form">
          <label for="ruu-username" style="display:block;margin-bottom:6px">
            ユーザーネーム
          </label>
          <input id="ruu-username" name="username" required
            maxlength="20" autocomplete="username"
            style="box-sizing:border-box;width:100%;padding:12px;
            margin-bottom:16px;border-radius:8px;border:1px solid #35495e;
            background:#07111b;color:white;font-size:16px">

          <label for="ruu-password" style="display:block;margin-bottom:6px">
            パスワード
          </label>
          <input id="ruu-password" name="password" type="password"
            required minlength="4" maxlength="100"
            autocomplete="current-password"
            style="box-sizing:border-box;width:100%;padding:12px;
            margin-bottom:18px;border-radius:8px;border:1px solid #35495e;
            background:#07111b;color:white;font-size:16px">

          <button id="ruu-auth-submit" type="submit"
            style="width:100%;padding:13px;border:0;border-radius:8px;
            background:#ffd166;color:#07111b;font-weight:bold;
            font-size:16px;cursor:pointer">
            ログイン
          </button>
        </form>

        <p id="ruu-auth-message" role="status"
          style="min-height:24px;color:#ffad55;text-align:center;
          font-size:13px;margin-bottom:0"></p>
        <p style="color:#9eafc1;font-size:11px;line-height:1.6">
          この試作版のアカウントは、登録したブラウザ内に保存されます。
          ブラウザのデータを消すとアカウント情報も失われる場合があります。
        </p>
      </div>
    `;

    document.body.appendChild(authRoot);

    let authMode = "login";

    const loginTab = authRoot.querySelector('[data-auth-mode="login"]');
    const registerTab = authRoot.querySelector('[data-auth-mode="register"]');
    const form = authRoot.querySelector("#ruu-auth-form");
    const message = authRoot.querySelector("#ruu-auth-message");
    const submit = authRoot.querySelector("#ruu-auth-submit");
    const passwordInput = authRoot.querySelector("#ruu-password");

    function setAuthMode(nextMode) {
      authMode = nextMode;

      loginTab.style.background =
        nextMode === "login" ? "#75c9ff" : "#07111b";
      loginTab.style.color =
        nextMode === "login" ? "#07111b" : "#e8edf4";
      registerTab.style.background =
        nextMode === "register" ? "#75c9ff" : "#07111b";
      registerTab.style.color =
        nextMode === "register" ? "#07111b" : "#e8edf4";

      submit.textContent = nextMode === "login" ? "ログイン" : "新規登録";
      passwordInput.autocomplete =
        nextMode === "login" ? "current-password" : "new-password";
      message.textContent = "";
    }

    loginTab.addEventListener("click", () => setAuthMode("login"));
    registerTab.addEventListener("click", () => setAuthMode("register"));

    form.addEventListener("submit", async e => {
      e.preventDefault();

      const username = authRoot.querySelector("#ruu-username").value.trim();
      const password = passwordInput.value;

      if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(username)) {
        message.textContent =
          "ユーザーネームは2〜20文字。文字・数字・_・- が使えます。";
        return;
      }

      if (password.length < 4) {
        message.textContent = "パスワードは4文字以上にしてください。";
        return;
      }

      submit.disabled = true;
      submit.textContent = "処理中…";

      try {
        const accounts = readAccounts();
        const passwordHash = await hashPassword(password);

        if (authMode === "register") {
          if (accounts[username]) {
            message.textContent = "このユーザーネームは登録済みです。";
            return;
          }

          accounts[username] = {
            passwordHash,
            gold: 0,
            unlockedStages: [1],
            upgrades: {
              speed: 0,
              hearts: 0,
              bulletSlow: 0,
              goldBonus: 0,
              guard: 0,
              regen: 0,
              fortune: 0,
              revive: 0,
              startingShield: 0,
              bulletPulse: 0
            },
            banned: false
          };

          saveAccounts(accounts);
        } else {
          if (
            !accounts[username] ||
            accounts[username].passwordHash !== passwordHash
          ) {
            message.textContent =
              "ユーザーネームまたはパスワードが違います。";
            return;
          }
          if (accounts[username].banned) {
            message.textContent = "このアカウントはBANされています。";
            return;
          }
        }

        currentUser = username;
        localStorage.setItem(SESSION_KEY, username);
        loadUserProgress(accounts[username]);

        authRoot.remove();
        authRoot = null;
        showTitle();
        draw();
      } catch (err) {
        message.textContent = err.message || "処理に失敗しました。";
      } finally {
        if (submit.isConnected) {
          submit.disabled = false;
          submit.textContent =
            authMode === "login" ? "ログイン" : "新規登録";
        }
      }
    });
  }

  function loadUserProgress(account) {
    gold = Number(account.gold) || 0;

    unlockedStages.clear();
    for (const s of account.unlockedStages || [1]) {
      unlockedStages.add(Number(s));
    }
    unlockedStages.add(1);

    const old = account.upgrades || {};
    Object.assign(upgrades, {
      speed: Number(old.speed) || 0,
      hearts: Number(old.hearts) || 0,
      bulletSlow: Number(old.bulletSlow) || 0,
      goldBonus: Number(old.goldBonus) || 0,
      guard: Number(old.guard) || 0,
      regen: Number(old.regen) || 0,
      fortune: Number(old.fortune) || 0,
      revive: Number(old.revive) || 0,
      startingShield: Number(old.startingShield) || 0,
      bulletPulse: Number(old.bulletPulse) || 0
    });
  }

  function saveUserProgress() {
    if (!currentUser) return;

    const accounts = readAccounts();
    if (!accounts[currentUser]) return;

    accounts[currentUser].gold = gold;
    accounts[currentUser].unlockedStages = [...unlockedStages];
    accounts[currentUser].upgrades = { ...upgrades };
    saveAccounts(accounts);
  }

  function logout() {
    saveUserProgress();
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    mode = "auth";
    makeAuthScreen();
  }

  // ============================================================
  // 画面サイズ・共通UI
  // ============================================================

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

  function resetPlayer() {
    player.x = W / 2;
    player.y = H * 0.78;
  }

  function showTitle() {
    mode = "title";
    menuIndex = 0;
  }

  function showMessage(message) {
    shopMessage = message;
    messageTimer = 2.5;
  }

  function addGold(amount) {
    const goldTier = Math.floor(elapsed / 30);

    amount = Math.max(
      1,
      Math.round(
        amount *
        (1 + upgrades.goldBonus * 0.25) *
        (1 + upgrades.fortune * 0.5) *
        Math.pow(2, goldTier)
      )
    );

    gold += amount;
    runGold += amount;
    saveUserProgress();
  }

  function positionEnemies() {
    if (stage === 1) {
      enemies = [
        { x: W * 0.5, y: H * 0.16 },
        { x: W * 0.19, y: H * 0.29 },
        { x: W * 0.81, y: H * 0.29 }
      ];
    } else if (stage === 2) {
      enemies = [
        { x: W * 0.5, y: H * 0.18 },
        { x: W * 0.13, y: H * 0.32 },
        { x: W * 0.87, y: H * 0.32 }
      ];
    } else if (stage === 3) {
      enemies = [
        { x: W * 0.25, y: H * 0.16 },
        { x: W * 0.5, y: H * 0.16 },
        { x: W * 0.75, y: H * 0.16 },
        { x: W * 0.25, y: H * 0.34 },
        { x: W * 0.5, y: H * 0.34 },
        { x: W * 0.75, y: H * 0.34 }
      ];
    } else if (stage === 6) {

            { x: W * 0.5, y: H * 0.5 },
        { x: 24, y: 24 },
        { x: W - 24, y: 24 },
        { x: 24, y: H - 24 },
        { x: W - 24, y: H - 24 }
      ];
    } else {
      enemies = [{ x: W * 0.5, y: H * 0.18 }];
    }
  }

  // ============================================================
  // ステージ開始
  // ============================================================

  function startRun(s) {
    if (!unlockedStages.has(s)) {
      showMessage("先にショップでこのステージを購入してね");
      mode = "shop";
      return;
    }

    stage = s;
    elapsed = 0;
    goldTimer = 0;
    bulletSpeedMultiplier = 1;
    bulletCountBonus = 0;
    reviveUsed = false;
    pulseTimer = 0;
    runGold = 0;
    hitFlash = 0;
    healTimer = 0;
    guardTimer = 0;
    patternTick = 0;

    bullets = [];
    particles = [];
    edgeWarnings = [];

    edgeTimer = stage === 2 ? 1.2 : 2.8;
    stage4SwitchTimer = 0.25;
    stage4RainTimer = 0;
    stage4Direction = Math.floor(Math.random() * 4);
    stage5WaveTimer = 0.7;
    stage5SafeY = H * 0.5;
    stage6Angle = 0;
    stage6BurstTimer = 3.2;

    player.maxLives = 3 + upgrades.hearts;
    player.lives = player.maxLives;
    player.invuln = 1.5 + upgrades.startingShield * 1.5;

    resetPlayer();
    positionEnemies();

    shotTimers = enemies.map((_, i) => 0.6 + i * 0.3);
    radialTimers = enemies.map((_, i) => 1.2 + i * 0.4);

    mode = "playing";
  }

  // ============================================================
  // 攻撃
  // ============================================================

  function fire(x, y, angle, speed, color = C.pink, radius = 4) {
    // 発射時点の倍率を速度に適用する。
    // これにより、すでに飛んでいる弾は後から加速しない。
    const adjustedSpeed =
      speed *
      Math.max(0.68, 1 - upgrades.bulletSlow * 0.08) *
      bulletSpeedMultiplier;

    bullets.push({
      x, y,
      vx: Math.cos(angle) * adjustedSpeed,
      vy: Math.sin(angle) * adjustedSpeed,
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
    count = Math.min(120, count + bulletCountBonus);
    for (let i = 0; i < count; i++) {
      const angle = offset + i * Math.PI * 2 / count;
      fire(
        enemy.x, enemy.y, angle, speed,
        i % 4 === 0 ? C.orange : color
      );
    }
  }

  function fanShot(enemy, count, spread, speed, color = C.purple) {
    count = Math.min(100, count + bulletCountBonus);
    const base = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );

    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const angle = base - spread / 2 + spread * t;
      fire(enemy.x, enemy.y, angle, speed, color);
    }
  }

  function rainShot(count, speed) {
    for (let i = 0; i < count; i++) {
      const x = rand(18, W - 18);
      const y = -rand(10, H * 0.3);
      fire(x, y, Math.PI / 2 + rand(-0.16, 0.16), speed, C.orange, 3.5);
    }
  }

  function fanShot(enemy, count, spread, speed, color = C.orange) {
    count = Math.min(100, count + bulletCountBonus);
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
      life: stage === 2 ? 0.55 : 0.65,
      fired: false
    });
  }

  function edgeAttack() {
    const count = Math.min(
      12,
      (stage === 2
        ? Math.floor(rand(1, 3))
        : Math.floor(rand(2, Math.min(6, stage + 2)))) +
        Math.floor(elapsed / 30)
    );

    for (let i = 0; i < count; i++) {
      const delay = stage === 2 ? i * rand(0.35, 0.75) : i * 0.2;
      edgeBurst();

      const warning = edgeWarnings[edgeWarnings.length - 1];
      warning.life += delay;
    }
  }

  // ============================================================
  // 更新処理
  // ============================================================

  function update(dt) {
    if (messageTimer > 0) {
      messageTimer = Math.max(0, messageTimer - dt);
    }

    if (mode !== "playing") return;

    elapsed += dt;
    patternTick += dt;

    // 30秒ごとに弾速倍率を1.5倍にする。
    // 倍率は新しく発射される弾にだけ適用される。
    const speedTier = Math.floor(elapsed / 30);
    bulletSpeedMultiplier = Math.pow(1.5, speedTier);
    bulletCountBonus = speedTier * 2;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    let dx = 0, dy = 0;

    if (keys.has("ArrowLeft") || keys.has("KeyA") || touchDirs.has("left")) dx--;
    if (keys.has("ArrowRight") || keys.has("KeyD") || touchDirs.has("right")) dx++;
    if (keys.has("ArrowUp") || keys.has("KeyW") || touchDirs.has("up")) dy--;
    if (keys.has("ArrowDown") || keys.has("KeyS") || touchDirs.has("down")) dy++;

    if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    const speedMultiplier = 1 + upgrades.speed * 0.15;

    player.x = clamp(
      player.x + dx * player.speed * speedMultiplier * dt,
      12, W - 12
    );

    player.y = clamp(
      player.y + dy * player.speed * speedMultiplier * dt,
      45, H - 18
    );

    // ステージ1
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
            0.5,
            (i === 0 ? 1.1 : 1.35) - elapsed * 0.002
          );
        }

        radialTimers[i] -= dt;
        if (radialTimers[i] <= 0) {
          if (i === 0) {
            radialShot(
              enemy, 12, 135 + Math.min(35, elapsed * 0.5),
              patternTick * 0.25, C.pink
            );
            radialTimers[i] = 3.2;
          } else {
            fanShot(
              enemy, 9, 1.4,
              150 + Math.min(35, elapsed * 0.5), C.orange
            );
            radialTimers[i] = 3.5;
          }
        }
      }
    }

    // ステージ2：放射攻撃と画面端攻撃
    if (stage === 2) {
      radialTimers[0] -= dt;

      if (radialTimers[0] <= 0) {
        radialShot(
          enemies[0],
          18 + Math.min(10, Math.floor(elapsed / 8)),
          155 + Math.min(45, elapsed * 0.6),
          patternTick * 0.16,
          C.purple
        );

        radialTimers[0] = 1.55;

        if (Math.random() < 0.35) {
          fanShot(enemies[0], 7, 1.5, 160, C.orange);
        }
      }

      // 左右の敵がプレイヤーを狙って弾を撃つ
      for (let i = 1; i <= 2; i++) {
        shotTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          aimedShot(
            enemies[i],
            210 + Math.min(90, elapsed * 1.2),
            i === 1 ? C.orange : C.pink
          );

          // 時間が経つほど発射間隔を短くする
          shotTimers[i] = Math.max(0.42, 1.05 - elapsed * 0.006);
        }

        // ときどき狙い撃ちを2連射する
        if (Math.random() < dt * 0.18) {
          fanShot(enemies[i], 3, 0.32, 175, C.orange);
        }
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeAttack();
        edgeTimer = rand(1.1, 1.8);
      }
    }

    // ステージ3：左右にも敵を配置し、3体が渦巻き状に弾を放つ
    if (stage === 3) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];

        shotTimers[i] -= dt;
        if (shotTimers[i] <= 0) {
          const base =
            patternTick * (i === 1 ? -1 : 1) * 1.35 + i * 0.7;

          for (let n = 0; n < 3 + Math.floor(elapsed / 30); n++) {
            const a = base + n * Math.PI * 2 / 3;
            fire(e.x, e.y, a, 145, C.green);
          }

          shotTimers[i] = 0.18;
        }

        radialTimers[i] -= dt;
        if (radialTimers[i] <= 0) {
          radialShot(
            e, 10, 125,
            patternTick * (i === 1 ? -0.55 : 0.55) + i,
            C.green
          );
          radialTimers[i] = 2.8;
        }
      }
    }

    // ステージ4：雨の向きが不定期に上・右・下・左へ切り替わる
    if (stage === 4) {
      stage4SwitchTimer -= dt;
      stage4RainTimer -= dt;

      if (stage4SwitchTimer <= 0) {
        stage4Direction = Math.floor(Math.random() * 4);
        stage4SwitchTimer = rand(0.45, 1.35);
      }

      if (stage4RainTimer <= 0) {
        const n = Math.min(45, Math.floor(rand(5, 10)) + bulletCountBonus);

        for (let i = 0; i < n; i++) {
          let x, y, angle;
          const t = rand(0, 1);

          if (stage4Direction === 0) {
            x = t * W;
            y = -8;
            angle = Math.PI / 2 + rand(-0.22, 0.22);
          } else if (stage4Direction === 1) {
            x = W + 8;
            y = t * H;
            angle = Math.PI + rand(-0.22, 0.22);
          } else if (stage4Direction === 2) {
            x = t * W;
            y = H + 8;
            angle = -Math.PI / 2 + rand(-0.22, 0.22);
          } else {
            x = -8;
            y = t * H;
            angle = rand(-0.22, 0.22);
          }

          fire(x, y, angle, rand(190, 290), C.orange, 4);
        }

        stage4RainTimer = rand(0.13, 0.28);
      }
    }

    // ステージ5：安全地帯が動く左右横断弾幕＋ボスの狙い撃ち
    if (stage === 5) {
      stage5WaveTimer -= dt;

      if (stage5WaveTimer <= 0) {
        stage5SafeY = rand(H * 0.18, H * 0.82);
        const spacing = Math.max(12, 30 - Math.floor(elapsed / 30) * 2);

        for (let y = 55; y < H - 25; y += spacing) {
          if (Math.abs(y - stage5SafeY) < 52) continue;

          const speed =
            (190 + Math.min(100, elapsed * 1.5)) *
            bulletSpeedMultiplier;

          bullets.push({
            x: -8,
            y,
            vx: speed,
            vy: rand(-12, 12) * bulletSpeedMultiplier,
            r: 5,
            color: C.pink,
            dead: false
          });

          bullets.push({
            x: W + 8,
            y: clamp(y + rand(-8, 8), 45, H - 12),
            vx: -speed,
            vy: rand(-12, 12) * bulletSpeedMultiplier,
            r: 5,
            color: C.orange,
            dead: false
          });
        }

        stage5WaveTimer = Math.max(
          0.42,
          rand(0.95, 1.3) - elapsed * 0.004
        );
      }

      shotTimers[0] -= dt;

      if (shotTimers[0] <= 0) {
        aimedShot(
          enemies[0],
          190 + Math.min(100, elapsed * 1.5),
          C.purple
        );

        shotTimers[0] = Math.max(0.38, 0.95 - elapsed * 0.004);
      }
    }

    // ステージ6：30秒ごとに加速する回転バー＋四隅の狙い撃ち
    if (stage === 6) {
      // 30秒経過するごとに回転速度を上げる
      const speedLevel = Math.floor(elapsed / 30);
      const rotationSpeed = 1.15 + speedLevel * 0.35;

      stage6Angle += dt * rotationSpeed;

      // 中央から全方位に弾を発射
      stage6BurstTimer -= dt;

      if (stage6BurstTimer <= 0) {
        radialShot(
          enemies[0],
          24 + Math.min(16, speedLevel * 2),
          175 + speedLevel * 12,
          patternTick * 0.13,
          C.blue
        );

        stage6BurstTimer = Math.max(1.4, rand(3.2, 4.5) - speedLevel * 0.15);
      }

      // 四隅の敵がプレイヤーを狙い撃ちする
      for (let i = 1; i <= 4; i++) {
        shotTimers[i] -= dt;

        if (shotTimers[i] <= 0) {
          aimedShot(
            enemies[i],
            185 + Math.min(100, elapsed * 1.4),
            i % 2 === 0 ? C.orange : C.pink
          );

          // 時間経過で連射間隔も短くなる
          shotTimers[i] = Math.max(0.38, 1.15 - elapsed * 0.006);
        }
      }
    }

    // ステージ7：高密度の扇形・放射攻撃
    if (stage >= 7) {
      const boss = enemies[0];
      shotTimers[0] -= dt;
      radialTimers[0] -= dt;

      if (shotTimers[0] <= 0) {
        fanShot(
          boss, 13 + stage, 1.9, 175 + stage * 10,
          STAGES[stage - 1]?.color || C.pink
        );
        shotTimers[0] = 0.42;
      }

          if (radialTimers[0] <= 0) {
        radialShot(
          boss, 22 + stage * 2, 160 + stage * 10,
          patternTick * 0.7, C.purple
        );
        radialTimers[0] = 1.15;
      }

      edgeTimer -= dt;

      if (edgeTimer <= 0) {
        edgeAttack();
        edgeTimer = rand(0.55, 1.0);
      }
    }

    // 予告終了後に画面端から発射
    for (const warning of edgeWarnings) {
      warning.life -= dt;

      if (warning.life <= 0 && !warning.fired) {

              warning.fired = true;

        const count = stage === 2 ? 7 : 5 + stage * 2;
        const spread = stage === 2 ? 0.2 : 0.14;

        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * spread;

          fire(
            warning.x, warning.y,
            warning.angle + offset,
            220 + stage * 15,
            stage >= 4 ? C.pink : C.orange
          );
        }
      }
    }

    edgeWarnings = edgeWarnings.filter(w => w.life > -0.6);

    for (const bullet of bullets) {
      // 発射時に速度倍率を適用済みなので、移動中は倍率を掛けない。
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (bullet.waveSide === "top" && bullet.y >= bullet.waveStopY) {
        bullet.y = bullet.waveStopY;
        bullet.vx = 0;
        bullet.vy = 0;
        bullet.waveSide = "stopped";
      }

      if (bullet.waveSide === "bottom" && bullet.y <= bullet.waveStopY) {
        bullet.y = bullet.waveStopY;
        bullet.vx = 0;
        bullet.vy = 0;
        bullet.waveSide = "stopped";
      }

      if (bullet.waveSide === "stopped") {
        bullet.waveLife -= dt;
        if (bullet.waveLife <= 0) bullet.dead = true;
      }

      if (
        !bullet.dead &&
        player.invuln <= 0 &&
        Math.hypot(player.x - bullet.x, player.y - bullet.y) <
          player.r + bullet.r
      ) {
        bullet.dead = true;
        player.lives--;
        player.invuln = 1.15 + upgrades.guard * 0.35;
        hitFlash = 0.2;

        for (let i = 0; i < 8; i++) {
          particles.push({
            x: player.x, y: player.y,
            vx: rand(-65, 65), vy: rand(-65, 65),
            life: 0.35, color: C.pink
          });
        }

        if (player.lives <= 0 && upgrades.revive > 0 && !reviveUsed) {
          reviveUsed = true;
          player.lives = 1;
          player.invuln = 2.5;
          bullets = [];
          edgeWarnings = [];
          showMessage("リバイブ発動！");
        } else if (player.lives <= 0) {
          mode = "gameover";
          menuIndex = 0;
          bullets = [];
          edgeWarnings = [];
          saveUserProgress();
          break;
        }
      }
    }

    if (stage === 6 && player.invuln <= 0) {
      const cx = enemies[0].x, cy = enemies[0].y;
      const length = Math.hypot(W, H) * 1.25;
      const x1 = cx - Math.cos(stage6Angle) * length;
      const y1 = cy - Math.sin(stage6Angle) * length;
      const x2 = cx + Math.cos(stage6Angle) * length;
      const y2 = cy + Math.sin(stage6Angle) * length;
      const vx = x2 - x1, vy = y2 - y1;

      const t = clamp(
        ((player.x - x1) * vx + (player.y - y1) * vy) /
          (vx * vx + vy * vy),
        0, 1
      );

      const px = x1 + t * vx, py = y1 + t * vy;

      if (Math.hypot(player.x - px, player.y - py) < player.r + 7) {
        player.lives--;
        player.invuln = 1.15 + upgrades.guard * 0.35;
        hitFlash = 0.2;

        if (player.lives <= 0 && upgrades.revive > 0 && !reviveUsed) {
          reviveUsed = true;
          player.lives = 1;
          player.invuln = 2.5;
          bullets = [];
          edgeWarnings = [];
          showMessage("リバイブ発動！");
        } else if (player.lives <= 0) {
          mode = "gameover";
          menuIndex = 0;
          bullets = [];
          edgeWarnings = [];
          saveUserProgress();
        }
      }
    }

    bullets = bullets.filter(b =>
      !b.dead && b.x > -40 && b.x < W + 40 &&
      b.y > -40 && b.y < H + 40
    );

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    particles = particles.filter(p => p.life > 0);

    // AUTO HEAL：Lv.1は60秒、Lv.2は45秒、Lv.3は30秒ごとに回復
    if (upgrades.regen > 0 && player.lives < player.maxLives) {
      healTimer += dt;

      const regenIntervals = [0, 60, 45, 30];
      const healInterval = regenIntervals[upgrades.regen];

      if (healTimer >= healInterval) {
        player.lives = Math.min(
          player.maxLives,
          player.lives + 1
        );

        healTimer = 0;
      }
    } else {
      healTimer = 0;
    }

    // 高額アップグレード：一定時間ごとに画面上の敵弾を消す
    if (upgrades.bulletPulse > 0) {
      pulseTimer += dt;
      const pulseInterval = Math.max(18, 60 - upgrades.bulletPulse * 14);
      if (pulseTimer >= pulseInterval) {
        pulseTimer = 0;
        bullets = [];
        edgeWarnings = [];
        showMessage("BULLET PULSE 発動！");
      }
    }

    goldTimer += dt;

    while (goldTimer >= 10) {
      goldTimer -= 10;
      const reward = STAGES.find(s => s.id === stage)?.reward || 1;
      addGold(reward);
    }
  }

  // ============================================================
  // 描画
  // ============================================================

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function text(value, x, y, size = 16, color = C.white, align = "left") {
    ctx.save();
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(String(value), Math.round(x), Math.round(y));
    ctx.restore();
  }

  function drawBackground() {
    rect(0, 0, W, H, C.bg);

    ctx.strokeStyle = C.line;
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

  function drawDemon(x, y, color = C.red) {
    rect(x - 5, y - 21, 5, 8, C.orange);
    rect(x + 1, y - 21, 5, 8, C.orange);
    rect(x - 17, y - 13, 34, 26, color);
    rect(x - 22, y - 5, 5, 12, color);
    rect(x + 17, y - 5, 5, 12, color);
    rect(x - 10, y - 5, 6, 6, C.bg);
    rect(x + 4, y - 5, 6, 6, C.bg);
    rect(x - 5, y + 6, 10, 3, C.bg);
    rect(x - 11, y + 13, 7, 5, C.orange);
    rect(x + 4, y + 13, 7, 5, C.orange);
  }

  function drawEnemy(enemy) {
    if (stage === 1) {
      drawDemon(enemy.x, enemy.y, C.red);
      return;
    }

    const color = STAGES[stage - 1]?.color || C.pink;
    const x = enemy.x, y = enemy.y;

    rect(x - 9, y - 26, 7, 12, color);
    rect(x + 2, y - 26, 7, 12, color);
    rect(x - 24, y - 15, 48, 30, color);
    rect(x - 30, y - 5, 6, 16, C.purple);
    rect(x + 24, y - 5, 6, 16, C.purple);
    rect(x - 13, y - 6, 7, 7, C.bg);
    rect(x + 6, y - 6, 7, 7, C.bg);
    rect(x - 9, y + 8, 18, 4, C.bg);
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) {
      return;
    }

    rect(player.x - 3, player.y - 7, 6, 14, C.red);
    rect(player.x - 7, player.y - 3, 14, 6, C.red);
    rect(player.x - 2, player.y - 2, 4, 4, "#ff9aa5");
  }

  function drawBullet(b) {
    rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, b.color);
    rect(b.x - 1, b.y - 1, 2, 2, "#fff0d0");
  }

  function drawButton(label, x, y, selected, width = 300, height = 44) {
    rect(
      x - width / 2, y - height / 2, width, height,
      selected ? "#1b3850" : C.panel
    );

    ctx.strokeStyle = selected ? C.blue : C.line;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    text(
      `${selected ? "> " : ""}${label}`,
      x, y, Math.min(16, width * 0.05),
      selected ? C.gold : C.white, "center"
    );
  }

  function drawTitle() {
    drawDemon(W / 2, H * 0.16);

    text("RUU RPG", W / 2, H * 0.29, 38, C.white, "center");
    text(
      "DODGE - SURVIVE - COLLECT GOLD",
      W / 2, H * 0.37, 13, C.muted, "center"
    );

    drawButton(
      "ステージ選択", W / 2, H * 0.49,
      menuIndex === 0, Math.min(W - 40, 360), 42
    );

    drawButton(
      "ショップ", W / 2, H * 0.59,
      menuIndex === 1, Math.min(W - 40, 300), 38
    );

    drawButton(
      "ログアウト", W / 2, H * 0.77,
      menuIndex === 3, Math.min(W - 40, 260), 36
    );

    text(`ユーザー: ${currentUser || "未ログイン"}  |  Ctrl+Shift+5: 管理者`, 16, 20, 12, C.muted);
    text(`GOLD ${gold}`, W - 18, 22, 15, C.gold, "right");
  }

  function drawStageSelect() {
    text("ステージ選択", W / 2, 36, 25, C.white, "center");
    text(`GOLD: ${gold}`, W / 2, 68, 13, C.gold, "center");

    const gap = Math.min(53, (H - 145) / 6);
    const startY = 105;

    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i];
      const y = startY + i * gap - shopScroll * gap;

      if (y < 85 || y > H - 48) continue;

      drawButton(
        `${s.id}. ${unlockedStages.has(s.id) ? "PLAY" : "LOCKED"} - ${s.name} / ${s.reward}G`,
        W / 2, y, menuIndex === i,
        Math.min(W - 30, 420), 34
      );
    }

    text("マウスホイールでスクロール", W / 2, H - 24, 11, C.muted, "center");
  }

  // ============================================================
  // ショップ：左に強化、右にステージ購入
  // ============================================================

  const UPGRADE_ITEMS = [
    {
      id: "speed",
      name: "SPEED BOOST",
      desc: level => `移動速度 +${level * 15}%`,
      color: C.blue
    },
    {
      id: "hearts",
      name: "EXTRA HEART",
      desc: level => `最大HP +${level * 33}%`,
      color: C.pink
    },
    {
      id: "bulletSlow",
      name: "BULLET SLOW",
      desc: level => `敵弾速度 -${level * 8}%`,
      color: C.green
    },
    {
      id: "goldBonus",
      name: "GOLD BONUS",
      desc: level => `獲得GOLD +${level * 25}%`,
      color: C.gold
    },
    {
      id: "guard",
      name: "LONG GUARD",
      desc: level => `無敵時間 +${(level * 0.35).toFixed(2)}秒`,
      color: C.purple
    },
    {
      id: "regen",
      name: "AUTO HEAL",
      desc: level => {
        const intervals = [0, 60, 45, 30];
        return level === 0
          ? "購入すると自動回復"
          : `${intervals[level]}秒ごとにHP回復`;
      },
      color: C.green
    },
    {
      id: "fortune",
      name: "LATE-GAME FORTUNE",
      desc: level => `獲得GOLD +${level * 50}%`,
      color: C.gold
    },
    {
      id: "revive",
      name: "ONE-TIME REVIVE",
      desc: level => level ? "1ランにつき1回だけ復活" : "死亡時にHP1で復活",
      color: C.pink
    },
    {
      id: "startingShield",
      name: "START SHIELD",
      desc: level => `開始時の無敵 +${(level * 1.5).toFixed(1)}秒`,
      color: C.blue
    },
    {
      id: "bulletPulse",
      name: "BULLET PULSE",
      desc: level => level ? `${Math.max(18, 60 - level * 14)}秒ごとに敵弾消去` : "一定時間ごとに敵弾を消去",
      color: C.purple
    }
  ];

  function drawShop() {

    const margin = 12;
    const top = 54;
    const bottom = H - 55;
    const availableH = bottom - top;

    const leftX = margin;
    const leftW = W * 0.43 - margin;
    const rightX = W * 0.45;
    const rightW = W - rightX - margin;

    // 左側：アイテム・アップグレード
    rect(leftX, top, leftW, availableH, "#0b1927");
    ctx.strokeStyle = C.line;
    ctx.strokeRect(leftX, top, leftW, availableH);
    text("アイテム・強化", leftX + leftW / 2, top + 19, 14, C.blue, "center");

    const itemTop = top + 44;
    const itemH = 48;
    const visibleUpgradeRows = Math.max(1, Math.floor((availableH - 50) / itemH));
    upgradeScroll = clamp(upgradeScroll, 0, Math.max(0, UPGRADE_ITEMS.length - visibleUpgradeRows));

    for (let row = 0; row < visibleUpgradeRows; row++) {
      const i = row + upgradeScroll;
      const item = UPGRADE_ITEMS[i];
      if (!item) continue;
      const y = itemTop + row * itemH;
      const level = upgrades[item.id];
      const costs = UPGRADE_COSTS[item.id];
      const maxed = level >= costs.length;
      const cost = maxed ? null : costs[level];

      rect(leftX + 7, y, leftW - 14, itemH - 4, C.panel);

      ctx.strokeStyle = menuIndex === i ? C.blue : C.line;
      ctx.lineWidth = menuIndex === i ? 2 : 1;
      ctx.strokeRect(leftX + 7, y, leftW - 14, itemH - 4);
      rect(leftX + 14, y + 7, 4, itemH - 18, item.color);

      const textX = leftX + 24;
      const maxTextW = Math.max(50, leftW - 38);
      ctx.save();
      ctx.beginPath();
      ctx.rect(textX, y + 1, maxTextW, itemH - 5);
      ctx.clip();

      text(item.name, textX, y + 9, 10, C.white);
      text(`Lv. ${level}/${costs.length}  ·  ${maxed ? "MAX" : `${cost}G`}`,
        textX, y + 22, 10, maxed ? C.green : C.gold);
      text(item.desc(level), textX, y + 35, 8, C.muted);
      ctx.restore();
    }

    // 右側：ステージ一覧はアイテムを選択していても表示
    rect(rightX, top, rightW, availableH, "#0b1927");
    ctx.strokeStyle = C.line;
    ctx.strokeRect(rightX, top, rightW, availableH);
    text("ステージ購入", rightX + rightW / 2, top + 19, 14, C.orange, "center");

    const listTop = top + 44;
    const rowH = 43;
    const visibleRows = Math.max(1, Math.floor((availableH - 49) / rowH));
    const maxScroll = Math.max(0, STAGES.length - visibleRows);
    shopScroll = clamp(shopScroll, 0, maxScroll);

    for (let row = 0; row < visibleRows; row++) {
      const i = row + shopScroll;
      const s = STAGES[i];
      if (!s) continue;

      const y = listTop + row * rowH;
      const selected = menuIndex === UPGRADE_ITEMS.length + i;
      const owned = unlockedStages.has(s.id);

      rect(
        rightX + 6, y, rightW - 12, rowH - 4,
        selected ? "#1b3850" : C.panel
      );

          ctx.strokeStyle = selected ? C.blue : C.line;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(rightX + 6, y, rightW - 12, rowH - 4);

      rect(rightX + 12, y + 8, 4, rowH - 20, s.color);

      const labelX = rightX + 22;
      const availableTextW = Math.max(40, rightW - 35);

      ctx.save();
      ctx.beginPath();
      ctx.rect(labelX, y + 1, availableTextW, rowH - 5);
      ctx.clip();

      text(`${s.id}. ${s.name}`, labelX, y + 11, 11, C.white);
      text(
        owned
          ? `購入済み / 報酬 ${s.reward}G`
          : `${s.cost}G / 報酬 ${s.reward}G`,
        labelX, y + 27, 10,
        owned ? C.green : C.gold
      );

      ctx.restore();
    }

    text(
      "↓ さらに下に購入できるアイテム・ステージがあります ↓",
      W / 2, H - 37, 11, C.orange, "center"
    );

    text(
      "クリックで選択・購入 / ホイールで一覧をスクロール / ESCで戻る",
      W / 2, H - 16, 9, C.muted, "center"
    );

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H - 68, 11, C.orange, "center");
    }
  }

  function drawBattle() {
    for (const enemy of enemies) drawEnemy(enemy);

    for (const warning of edgeWarnings) {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 80) * 0.25;
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.arc(warning.x, warning.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (stage === 6 && enemies[0]) {
      const cx = enemies[0].x, cy = enemies[0].y;
      const length = Math.hypot(W, H) * 1.25;

      ctx.save();
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.3;

      ctx.beginPath();
      ctx.moveTo(
        cx - Math.cos(stage6Angle) * length,
        cy - Math.sin(stage6Angle) * length
      );
      ctx.lineTo(
        cx + Math.cos(stage6Angle) * length,
        cy + Math.sin(stage6Angle) * length
      );
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.moveTo(
        cx - Math.cos(stage6Angle) * length,
        cy - Math.sin(stage6Angle) * length
      );
      ctx.lineTo(
        cx + Math.cos(stage6Angle) * length,
        cy + Math.sin(stage6Angle) * length
      );
      ctx.stroke();
      ctx.restore();
    }

    for (const bullet of bullets) drawBullet(bullet);

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
      rect(p.x, p.y, 3, 3, p.color);
      ctx.globalAlpha = 1;
    }

    drawPlayer();

    text(`STAGE ${stage}`, 14, 20, 13);
    text(`TIME ${elapsed.toFixed(1)}s`, 14, 40, 11, C.muted);
    text(`GOLD ${gold}`, W - 14, 20, 13, C.gold, "right");

    text(
      `HP ${"♥".repeat(Math.max(0, player.lives))}${"♡".repeat(Math.max(0, player.maxLives - player.lives))}`,
      14, 60, 13, C.pink
    );

    text(
      "MOVE: WASD / ARROWS   ESC: PAUSE",
      W / 2, H - 12, 10, C.muted, "center"
    );

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255,50,80,${hitFlash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawGameOver() {
    text("GAME OVER", W / 2, H * 0.25, 32, C.pink, "center");
    text(`生存時間 ${elapsed.toFixed(1)} 秒`, W / 2, H * 0.36, 14, C.white, "center");
    text(`GOLD ${gold}`, W / 2, H * 0.43, 14, C.gold, "center");

    drawButton("もう一度", W / 2, H * 0.56, menuIndex === 0);
    drawButton("ショップへ", W / 2, H * 0.67, menuIndex === 1);
    drawButton("タイトルへ", W / 2, H * 0.78, menuIndex === 2);
  }

  function drawPause() {
    text("PAUSED", W / 2, H * 0.3, 30, C.white, "center");
    drawButton("再開", W / 2, H * 0.45, menuIndex === 0);
    drawButton("ショップへ", W / 2, H * 0.57, menuIndex === 1);
  }

  function drawAdminCode() {
    text("管理者ログイン", W / 2, H * 0.3, 26, C.purple, "center");
    text("管理者コードを入力して Enter", W / 2, H * 0.4, 13, C.muted, "center");

    rect(W / 2 - 150, H * 0.46, 300, 44, C.panel);
    ctx.strokeStyle = C.blue;
    ctx.strokeRect(W / 2 - 150, H * 0.46, 300, 44);

    text(
      "*".repeat(adminInput.length),
      W / 2, H * 0.46 + 22, 22, C.white, "center"
    );

    text(
      "Backspace：1文字削除 / Esc：戻る",
      W / 2, H * 0.59, 12, C.muted, "center"
    );

    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H * 0.72, 13, C.orange, "center");
    }
  }

  function drawAdminPanel() {
    text("管理者コマンドパネル", W / 2, 35, 24, C.gold, "center");
    text("このブラウザに保存されたアカウントだけを管理します", W / 2, 63, 11, C.muted, "center");
    rect(18, 88, W - 36, 56, C.panel);
    ctx.strokeStyle = C.blue;
    ctx.strokeRect(18, 88, W - 36, 56);
    text(`> ${adminInput || "help"}`, 30, 116, 14, C.white);

    text("コマンド例：list / ban ユーザー名 / unban ユーザー名", 24, 170, 12, C.blue);
    text("delete ユーザー名 / gold ユーザー名 数量 / exit", 24, 193, 12, C.blue);

    const accounts = readAccounts();
    const names = Object.keys(accounts);
    text(`登録アカウント数：${names.length}`, 24, 230, 13, C.gold);
    const visible = Math.min(names.length, 8);
    for (let i = 0; i < visible; i++) {
      const name = names[i];
      const acc = accounts[name];
      text(`${name}  |  ${acc.banned ? "BAN中" : "有効"}  |  GOLD ${Number(acc.gold) || 0}`,
        28, 260 + i * 24, 12, acc.banned ? C.pink : C.white);
    }
    if (names.length === 0) text("アカウントがありません", 28, 260, 12, C.muted);
    if (messageTimer > 0 && shopMessage) {
      text(shopMessage, W / 2, H - 28, 12, C.orange, "center");
    }
    text("Enter：実行 / Backspace：削除 / Esc：終了", W / 2, H - 8, 10, C.muted, "center");
  }

  function runAdminCommand(raw) {
    const parts = raw.trim().split(/\\s+/);
    const command = (parts.shift() || "").toLowerCase();
    const accounts = readAccounts();

    if (!command || command === "help") {
      showMessage("list / ban name / unban name / delete name / gold name amount / exit");
      return;
    }
    if (command === "exit") {
      mode = "shop";
      adminInput = "";
      return;
    }
    if (command === "list") {
      showMessage(`登録アカウント数：${Object.keys(accounts).length}`);
      return;
    }

    const target = parts[0];
    if (!target || !accounts[target]) {
      showMessage("対象ユーザーが見つかりません");
      return;
    }

    if (command === "ban") {
      if (target === currentUser) {
        showMessage("ログイン中の管理者自身はBANできません");
        return;
      }
      accounts[target].banned = true;
      saveAccounts(accounts);
      showMessage(`${target} をBANしました`);
    } else if (command === "unban") {
      accounts[target].banned = false;
      saveAccounts(accounts);
      showMessage(`${target} のBANを解除しました`);
    } else if (command === "delete") {
      if (target === currentUser) {
        showMessage("ログイン中の管理者自身は削除できません");
        return;
      }
      delete accounts[target];
      saveAccounts(accounts);
      showMessage(`${target} のアカウントを削除しました`);
    } else if (command === "gold") {
      const amount = Number(parts[1]);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) {
        showMessage("数量は0〜100000000の数値にしてください");
        return;
      }
      accounts[target].gold = Math.floor(amount);
      if (target === currentUser) gold = Math.floor(amount);
      saveAccounts(accounts);
      if (target === currentUser) saveUserProgress();
      showMessage(`${target} のGOLDを ${Math.floor(amount)} に設定しました`);
    } else {
      showMessage("不明なコマンドです。help と入力してください");
      return;
    }
  }

  function draw() {
    if (mode === "auth") return;

    drawBackground();

    if (mode === "title") drawTitle();
    else if (mode === "stageSelect") drawStageSelect();
    else if (mode === "shop") drawShop();
    else if (mode === "playing") drawBattle();
    else if (mode === "pause") drawPause();
    else if (mode === "gameover") drawGameOver();
    else if (mode === "adminCode") drawAdminCode();
    else if (mode === "adminPanel") drawAdminPanel();
  }

  // ============================================================
  // 購入処理
  // ============================================================

  function buyStage(s) {
    if (unlockedStages.has(s)) {
      startRun(s);
      return;
    }

    const info = STAGES.find(x => x.id === s);
    if (!info) return;

    if (gold < info.cost) {
      showMessage(`${info.cost} GOLD必要です`);
      return;
    }

    gold -= info.cost;
    unlockedStages.add(s);
    saveUserProgress();
    showMessage(`ステージ${s}を購入しました！`);
  }

  function buyUpgrade(id) {
    const level = upgrades[id];
    const costs = UPGRADE_COSTS[id];

    if (level >= costs.length) {
      showMessage("すでに最大レベルです");
      return;
    }

    const cost = costs[level];

    if (gold < cost) {
      showMessage(`${cost} GOLD必要です`);
      return;
    }

    gold -= cost;
    upgrades[id]++;
    saveUserProgress();
    showMessage("アップグレード成功！");
  }

  function shopActivate(index) {
    if (index < UPGRADE_ITEMS.length) {
      buyUpgrade(UPGRADE_ITEMS[index].id);
      return;
    }

    const s = STAGES[index - UPGRADE_ITEMS.length];
    if (s) buyStage(s.id);
  }

  function confirmMenu() {
    if (mode === "title") {

          if (menuIndex === 0) {
        mode = "stageSelect";
        menuIndex = 0;
        shopScroll = 0;
      } else if (menuIndex === 1) {
        mode = "shop";
        menuIndex = 0;
        shopScroll = 0;
        upgradeScroll = 0;
      } else {
        logout();
      }
      return;
    }

    if (mode === "stageSelect") {
      const s = STAGES[menuIndex];

      if (s) {
        if (unlockedStages.has(s.id)) {
          startRun(s.id);
        } else {
          mode = "shop";
          menuIndex = UPGRADE_ITEMS.length + menuIndex;
          shopScroll = Math.max(0, menuIndex - UPGRADE_ITEMS.length);
        }
      }
      return;
    }

    if (mode === "shop") {
      shopActivate(menuIndex);
      return;
    }

    if (mode === "pause") {
      if (menuIndex === 0) {
        mode = "playing";
      } else {
        mode = "shop";
        menuIndex = 0;
      }
      return;
    }

    if (mode === "gameover") {
      if (menuIndex === 0) {
        startRun(stage);
      } else if (menuIndex === 1) {
        mode = "shop";
        menuIndex = 0;
      } else {
        showTitle();
      }
      return;
    }

    if (mode === "adminPanel") {
      if (menuIndex === 0) gold += 100;
      else if (menuIndex === 1) gold += 1000;
      else if (menuIndex === 2) gold += 10000;
      else mode = "shop";

      saveUserProgress();
    }
  }

  function moveMenu(direction) {
    if (mode === "title") {
      menuIndex = clamp(menuIndex + direction, 0, 2);
    } else if (mode === "stageSelect") {
      menuIndex = clamp(menuIndex + direction, 0, STAGES.length - 1);

      const visibleRows = Math.max(
        1,
        Math.floor((H - 160) / Math.min(53, (H - 145) / 6))
      );

      shopScroll = clamp(
        menuIndex - visibleRows + 1,
        0,
        STAGES.length - visibleRows
      );
    } else if (mode === "shop") {
      menuIndex = clamp(
        menuIndex + direction,
        0,
        UPGRADE_ITEMS.length + STAGES.length - 1
      );

      if (menuIndex >= UPGRADE_ITEMS.length) {
        const stageIndex = menuIndex - UPGRADE_ITEMS.length;
        const visibleRows = Math.max(1, Math.floor((H - 150) / 43));
        shopScroll = clamp(
          stageIndex - visibleRows + 1,
          0,
          Math.max(0, STAGES.length - visibleRows)
        );
      } else {
        const visibleUpgradeRows = Math.max(1, Math.floor((H - 109 - 50) / 48));
        upgradeScroll = clamp(
          menuIndex - visibleUpgradeRows + 1,
          0,
          Math.max(0, UPGRADE_ITEMS.length - visibleUpgradeRows)
        );
      }
    } else if (mode === "pause") {
      menuIndex = clamp(menuIndex + direction, 0, 1);
    } else if (mode === "gameover") {
      menuIndex = clamp(menuIndex + direction, 0, 2);
    } else if (mode === "adminPanel") {
      menuIndex = clamp(menuIndex + direction, 0, 3);
    }
  }

  // ============================================================
  // キーボード・マウス・タッチ
  // ============================================================

  window.addEventListener("keydown", e => {
    if (e.code.startsWith("Arrow") || e.code === "Space") {
      e.preventDefault();
    }

    keys.add(e.code);

    if (e.ctrlKey && e.shiftKey && e.code === "Digit5") {
      mode = "adminCode";
      adminInput = "";
      return;
    }

    if (mode === "auth") return;

    if (mode === "adminCode") {
      if (e.code === "Escape") {
        mode = "shop";
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
        mode = "shop";
        adminInput = "";
        return;
      }
      if (e.code === "Backspace") {
        adminInput = adminInput.slice(0, -1);
        return;
      }
      if (e.code === "Enter") {

              const command = adminInput;
        adminInput = "";
        runAdminCommand(command);
        return;
      }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        adminInput += e.key;
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

    if (e.code === "Escape") {
      if (mode === "shop" || mode === "stageSelect") {
        showTitle();
      } else if (mode === "pause") {
        mode = "playing";
      } else if (mode === "gameover") {
        showTitle();
      }
      return;
    }

    if (mode === "shop" &&
        (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      if (menuIndex < UPGRADE_ITEMS.length) {
        menuIndex =
          UPGRADE_ITEMS.length + clamp(menuIndex, 0, STAGES.length - 1);
      } else {
        menuIndex = clamp(
          menuIndex - UPGRADE_ITEMS.length,
          0,
          UPGRADE_ITEMS.length - 1
        );
      }
      return;
    }

    if (e.code === "ArrowUp") moveMenu(-1);
    else if (e.code === "ArrowDown") moveMenu(1);
    else if (e.code === "ArrowLeft") moveMenu(-1);
    else if (e.code === "ArrowRight") moveMenu(1);
    else if (e.code === "Enter" || e.code === "Space") confirmMenu();
  });

  window.addEventListener("keyup", e => keys.delete(e.code));

  canvas.addEventListener("wheel", e => {
    if (mode !== "shop" && mode !== "stageSelect") return;

    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;

    if (mode === "shop") {
      const bounds = canvas.getBoundingClientRect();
      const pointerX = e.clientX - bounds.left;
      if (pointerX < W * 0.45) {
        const availableH = H - 109;
        const visibleUpgradeRows = Math.max(1, Math.floor((availableH - 50) / 48));
        upgradeScroll = clamp(
          upgradeScroll + delta,
          0,
          Math.max(0, UPGRADE_ITEMS.length - visibleUpgradeRows)
        );
        menuIndex = upgradeScroll;
      } else {
        const stageStart = UPGRADE_ITEMS.length;
        shopScroll = clamp(shopScroll + delta, 0, Math.max(0, STAGES.length - 1));
        menuIndex = stageStart + shopScroll;
      }
    } else {
      shopScroll = clamp(shopScroll + delta, 0, Math.max(0, STAGES.length - 1));
      menuIndex = shopScroll;
    }
  }, { passive: false });

  canvas.addEventListener("pointerdown", e => {
    if (mode === "auth") return;

    const bounds = canvas.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    if (mode === "playing") {
      mode = "pause";
      menuIndex = 0;
      return;
    }

    if (mode === "title") {
      if (y > H * 0.44 && y < H * 0.54) {
        menuIndex = 0;
      } else if (y >= H * 0.54 && y < H * 0.64) {
        menuIndex = 1;
      } else if (y >= H * 0.64 && y < H * 0.75) {
        menuIndex = 2;
      } else {
        return;
      }

      confirmMenu();
      return;
    }

    if (mode === "shop") {
      const top = 54;
      const bottom = H - 55;
      const availableH = bottom - top;
      const leftW = W * 0.43 - 12;
      const rightX = W * 0.45;
      const rightW = W - rightX - 12;

      if (x < 12 + leftW && y >= top + 44 && y <= bottom) {
        const itemH = 48;
        const row = Math.floor((y - (top + 44)) / itemH);
        const visibleUpgradeRows = Math.max(1, Math.floor((availableH - 50) / itemH));
        const index = row + upgradeScroll;

        if (row >= 0 && row < visibleUpgradeRows && index < UPGRADE_ITEMS.length) {
          menuIndex = index;
          shopActivate(index);
        }
        return;
      }

      if (
        x >= rightX &&
        x <= rightX + rightW &&
        y >= top + 44 &&
        y <= bottom
      ) {
        const rowH = 43;
        const row = Math.floor((y - (top + 44)) / rowH);
        const visibleRows = Math.max(1, Math.floor((availableH - 49) / rowH));
        const stageIndex = row + shopScroll;

        if (row >= 0 && row < visibleRows && stageIndex < STAGES.length) {
          menuIndex = UPGRADE_ITEMS.length + stageIndex;
          shopActivate(menuIndex);
        }
      }

      return;
    }

    if (mode === "stageSelect") {
      const gap = Math.min(53, (H - 145) / 6);
      const index = Math.round((y - 105) / gap) + shopScroll;

      if (index >= 0 && index < STAGES.length) {
        menuIndex = index;
        confirmMenu();
      }

      return;
    }

    if (mode === "pause") {
      menuIndex = Math.abs(y - H * 0.45) < 30 ? 0 : 1;
      confirmMenu();
      return;
    }

    if (mode === "gameover") {
      if (Math.abs(y - H * 0.56) < 25) {
        menuIndex = 0;
      } else if (Math.abs(y - H * 0.67) < 25) {
        menuIndex = 1;
      } else if (Math.abs(y - H * 0.78) < 25) {
        menuIndex = 2;
      } else {
        return;
      }

      confirmMenu();
    }
  });

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

  const touchStart = document.getElementById("touch-start");

  if (touchStart) {
    touchStart.addEventListener("click", () => {
      if (mode === "playing") return;

      if (mode === "pause") {
        mode = "playing";
      } else if (mode === "title") {
        mode = "stageSelect";
        menuIndex = 0;
      } else {
        confirmMenu();
      }
    });
  }

  // ============================================================
  // ゲームループと起動
  // ============================================================

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.04);
    lastTime = timestamp;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resize();

  // 前回ログインしていたユーザーを確認する
  try {
    const savedUsername = localStorage.getItem(SESSION_KEY);
    const accounts = readAccounts();

    if (savedUsername && accounts[savedUsername] && !accounts[savedUsername].banned) {
      currentUser = savedUsername;
      loadUserProgress(accounts[savedUsername]);
      showTitle();
    } else {
      currentUser = null;
      mode = "auth";
      makeAuthScreen();
    }
  } catch {
    currentUser = null;
    mode = "auth";
    makeAuthScreen();
  }

  requestAnimationFrame(loop);
})();
