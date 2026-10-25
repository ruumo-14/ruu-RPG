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
  let world = 1;
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
  let strikeWarnings = [];
  let triangles = [];
  let gravityVelocity = 0;
  let jumpHoldTime = 0;
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
    { id: 3, cost: 150, reward: 7, name: "スパイラル", color: "#78e0ae" },
    { id: 4, cost: 400, reward: 15, name: "レインストーム", color: "#ffad55" },
    { id: 5, cost: 1200, reward: 30, name: "ウェーブ", color: "#ff6575" },
    { id: 6, cost: 3300, reward: 50, name: "回転バー", color: "#75c9ff" },
    { id: 7, cost: 9000, reward: 100, name: "カオス", color: "#a78bfa" },
    { id: 8, cost: 25000, reward: 160, name: "深淵の門", color: "#ff465e" },
    { id: 9, cost: 70000, reward: 260, name: "星屑の嵐", color: "#75c9ff" },
    { id: 10, cost: 190000, reward: 420, name: "紫電回廊", color: "#a78bfa" },
    { id: 11, cost: 520000, reward: 0, name: "WORLD 2 解放", color: "#bca5ff", worldUnlock: true }
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
            demoGoldGranted: false,
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
        // 一時的な体験用ボーナス。後でこの処理とフラグを削除すること。
        if (!accounts[username].demoGoldGranted) { gold += 100000000; accounts[username].demoGoldGranted = true; saveAccounts(accounts); saveUserProgress(); }

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

  function resetUpgrades() {
    for (const key of Object.keys(upgrades)) upgrades[key] = 0;
  }

  function loadProgressValues(progress) {
    gold = Number(progress.gold) || 0;
    unlockedStages.clear();
    for (const s of progress.unlockedStages || [1]) { if (Number(s) >= 1 && Number(s) <= 10) unlockedStages.add(Number(s)); }
    unlockedStages.add(1);

    const old = progress.upgrades || {};
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

  function loadUserProgress(account) {
    world = Number(account.currentWorld) === 2 ? 2 : 1;
    if (world === 2) {
      loadProgressValues(account.world2Progress || { gold: 0, unlockedStages: [1], upgrades: {} });
    } else {
      loadProgressValues(account);
    }

    // 旧セーブのStage 11〜15はWorld 1のステージ解放として読み込まない。
  }

  function saveUserProgress() {
    if (!currentUser) return;
    const accounts = readAccounts();
    if (!accounts[currentUser]) return;
    const account = accounts[currentUser];

    if (world === 1) {
      account.gold = gold;
      account.unlockedStages = [...unlockedStages];
      account.upgrades = { ...upgrades };
      account.currentWorld = 1;
    } else {
      account.world2Progress = {
        gold,
        unlockedStages: [...unlockedStages],
        upgrades: { ...upgrades }
      };
      account.currentWorld = 2;
      account.world2Unlocked = true;
    }
    saveAccounts(accounts);
  }

  function switchToWorld2() {
    if (world === 2) return;
    world = 2;
    gold = 0;
    runGold = 0;
    elapsed = 0;
    goldTimer = 0;
    resetUpgrades();
    unlockedStages.clear();
    unlockedStages.add(1);
    bullets = [];
    particles = [];
    edgeWarnings = [];
    strikeWarnings = [];
    triangles = [];
    stage = 1;
    saveUserProgress();
    mode = "stageSelect";
    menuIndex = 0;
    shopScroll = 0;
    upgradeScroll = 0;
    showMessage("WORLD 2 解放！GOLD・強化・能力はすべて初期状態です");
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
    gravityVelocity = 0;
    jumpHoldTime = 0;
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
      enemies = [
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
    if (s === 11 && world === 1) { showMessage("ショップのステージ11欄からWORLD 2を解放してね"); mode = "shop"; return; }
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
    strikeWarnings = [];
    triangles = [];
    gravityVelocity = 0;
    jumpHoldTime = 0;

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
    const adjustedSpeed =
      speed *
      Math.max(0.68, 1 - upgrades.bulletSlow * 0.08) *
      bulletSpeedMultiplier;

    const world2 = world === 2;
    bullets.push({
      x, y,
      vx: Math.cos(angle) * adjustedSpeed,
      vy: Math.sin(angle) * adjustedSpeed,
      r: radius,
      color,
      dead: false,
      // WORLD 2の弾は重力で軌道が曲がり、床で跳ね返る。
      gravity: world2,
      gravityAccel: world2 ? 250 + stage * 18 : 0,
      bounce: world2,
      bounceCount: 0,
      stomped: false,
      stompLife: 0,
      stompable: world2 && radius >= 9
    });
  }

  function aimedShot(enemy, speed, color = C.pink) {
    const angle = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );
    fire(enemy.x, enemy.y, angle, speed, color);
  }

  function fireHoming(enemy, speed, color = C.pink) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const adjustedSpeed = speed * Math.max(0.68, 1 - upgrades.bulletSlow * 0.08) * bulletSpeedMultiplier;
    bullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * adjustedSpeed, vy: Math.sin(angle) * adjustedSpeed, r: 5, color, dead: false, homing: true, homingSpeed: adjustedSpeed });
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
    const tier = speedTier;
    bulletSpeedMultiplier = Math.pow(1.5, speedTier);
    // 30秒ごとに弾速・弾数・発射頻度を上げる。
    bulletCountBonus = Math.min(48, speedTier * 3);
    // 30秒ごとに発射頻度を25%ずつ上げる。
    const attackRateMultiplier = 1 + speedTier * 0.25;

    player.invuln = Math.max(0, player.invuln - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    const previousPlayerY = player.y;
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

    player.x = clamp(player.x + dx * player.speed * speedMultiplier * dt, 12, W - 12);
    if (world === 1) {
      player.y = clamp(player.y + dy * player.speed * speedMultiplier * dt, 45, H - 18);
      gravityVelocity = 0;
    } else {
      const stompPlatform = bullets.find(b =>
        b.stomped && Math.abs(player.x - b.x) < player.r + b.r * 0.78 &&
        Math.abs((player.y + player.r) - (b.y - b.r)) < 6
      );
      const grounded = player.y >= H - 19 || !!stompPlatform;
      const jumpHeld = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space") || touchDirs.has("up");
      if (grounded) {
        player.y = stompPlatform ? stompPlatform.y - stompPlatform.r - player.r : H - 19;
        if (jumpHeld) {
          gravityVelocity = -300;
          jumpHoldTime = 0;
        } else {
          gravityVelocity = 0;
        }
      }
      if (!grounded || gravityVelocity < 0) {
        if (gravityVelocity < 0 && jumpHeld && jumpHoldTime < 0.42) {
          // 押し続けている間だけ上昇を長く維持。短押しならすぐ落下へ。
          jumpHoldTime += dt;
          gravityVelocity += 190 * dt;
        } else {
          if (gravityVelocity < -110 && !jumpHeld) gravityVelocity *= 0.82;
          gravityVelocity += 900 * dt;
        }
      }
      player.y = clamp(player.y + gravityVelocity * dt, 45, H - 19);
      if (player.y >= H - 19) { gravityVelocity = 0; jumpHoldTime = 0; }
    }

    if (world === 2) {
      // WORLD 2は全10ステージを専用攻撃で構成。
      const e = enemies[0] || { x: W * 0.5, y: H * 0.2 };
      shotTimers[0] = (shotTimers[0] ?? 0) - dt * attackRateMultiplier;
      radialTimers[0] = (radialTimers[0] ?? 0) - dt * attackRateMultiplier;
      if (stage === 1) {
        if (shotTimers[0] <= 0) {
          for (let k=0;k<6;k++) { const a=patternTick*0.55+k*Math.PI/3; fire(e.x,e.y,a,155+tier*8,"#7cecff",4); fire(e.x,e.y,a+Math.PI/6,115+tier*6,"#bca5ff",3); }
          shotTimers[0]=Math.max(0.42,1.05-tier*0.04);
        }
      } else if (stage === 2) {
        if (shotTimers[0] <= 0) {
          const count=9+Math.min(9,tier);
          for(let k=0;k<count;k++){const a=patternTick*0.9+k*Math.PI*2/count;fire(0,H*0.5,a,135+tier*9,"#7cecff",4);fire(W,H*0.5,a+Math.PI,135+tier*9,"#bca5ff",4);}
          shotTimers[0]=Math.max(0.55,1.3-tier*0.04);
        }
      } else if (stage === 3) {
        if(shotTimers[0]<=0){const angle=Math.sin(patternTick*1.7)*0.6;for(let k=-4;k<=4;k++)fire(e.x,e.y,Math.PI/2+angle+k*0.16,175+tier*10,"#bca5ff",4);shotTimers[0]=Math.max(0.3,0.82-tier*0.035);}
      } else if (stage === 4) {
        if(shotTimers[0]<=0){for(let k=0,count=Math.min(24,8+tier*2);k<count;k++)fire(rand(12,W-12),42,Math.PI/2+rand(-0.5,0.5),160+tier*12,"#ffad55",4);shotTimers[0]=Math.max(0.38,1.1-tier*0.04);}
      } else if (stage === 5) {
        if(shotTimers[0]<=0){radialShot(e,20+Math.min(16,tier*2),115+tier*8,patternTick*0.3,"#7cecff");radialShot(e,12+Math.min(12,tier),175+tier*9,-patternTick*0.22,"#bca5ff");shotTimers[0]=Math.max(0.7,1.65-tier*0.045);}
      } else if (stage === 6) {
        if(shotTimers[0]<=0){const corners=[[0,45,0.55],[W,45,Math.PI-0.55],[0,H,-0.55],[W,H,Math.PI+0.55]];for(const [x,y,a] of corners)for(let k=-2;k<=2;k++)fire(x,y,a+k*0.08,210+tier*12,"#7cecff",4);shotTimers[0]=Math.max(0.6,1.45-tier*0.04);}
      } else if (stage === 7) {
        if(shotTimers[0]<=0){const count=Math.min(7,2+Math.floor(tier/2));for(let k=0;k<count;k++)fireHoming({x:rand(30,W-30),y:rand(55,H*0.45)},125+tier*10,k%2?"#bca5ff":"#7cecff");shotTimers[0]=Math.max(0.42,1-tier*0.035);}
      } else if (stage === 8) {
        // 画面内のランダムな地点から、重力で曲がる小さな弾の群れが噴き出す。
        if (shotTimers[0] <= 0) {
          const portals = Math.min(9, 3 + Math.floor(tier / 2));
          for (let p = 0; p < portals; p++) {
            const x = rand(35, W - 35), y = rand(65, H - 70);
            const count = 5 + Math.min(5, tier);
            const base = rand(0, Math.PI * 2);
            for (let k = 0; k < count; k++) {
              fire(x, y, base + k * Math.PI * 2 / count, 115 + tier * 9, "#7cecff", 4);
            }
          }
          shotTimers[0] = Math.max(0.38, 1.0 - tier * 0.04);
        }
      } else if (stage === 9) {
        if(shotTimers[0]<=0){const count=Math.min(24,8+tier*2);for(let k=0;k<count;k++){const t=(k+0.5)/count;fire(-8,t*H,rand(-0.32,0.32),210+tier*14,"#7cecff",4);fire(W+8,t*H,Math.PI+rand(-0.32,0.32),210+tier*14,"#bca5ff",4);fire(t*W,-8,Math.PI/2+rand(-0.32,0.32),210+tier*14,"#ffad55",4);fire(t*W,H+8,-Math.PI/2+rand(-0.32,0.32),210+tier*14,"#ff6575",4);}shotTimers[0]=Math.max(0.5,1.25-tier*0.04);}
      } else if (stage === 10) {
        // SANS風の最終戦：骨の壁が床からせり上がり、巨大な重力球が上から落ちる。
        if (shotTimers[0] <= 0) {
          const lanes = Math.min(8, 3 + Math.floor(tier / 2));
          const safeLane = Math.floor(rand(0, lanes));
          for (let lane = 0; lane < lanes; lane++) {
            if (lane === safeLane) continue;
            const x = (lane + 0.5) * W / lanes;
            bullets.push({
              x, y: H + 12, vx: 0, vy: -(250 + tier * 14),
              r: 7, color: "#e8edf4", dead: false, gravity: false,
              boneWall: true, waveSide: "top", waveStopY: H * 0.43,
              waveLife: 0.65, stompable: false
            });
          }
          // 落下する大きな球は踏むと即ジャンプできる。
          const ballCount = Math.min(4, 1 + Math.floor(tier / 2));
          for (let k = 0; k < ballCount; k++) {
            const x = rand(35, W - 35);
            bullets.push({
              x, y: 50, vx: rand(-35, 35), vy: 35,
              r: 10 + Math.min(8, tier), color: "#7cecff",
              dead: false, gravity: true, gravityAccel: 520 + tier * 24,
              stompable: true, stomped: false, stompLife: 0, heavyBall: true
            });
          }
          shotTimers[0] = Math.max(0.72, 1.55 - tier * 0.05);
        }
        // 交互に左右から飛ぶ骨の列。重力で少しずつ落ちる。
        if (radialTimers[0] <= 0) {
          const fromLeft = Math.random() < 0.5;
          const y = rand(H * 0.42, H - 48);
          for (let k = 0; k < 5; k++) {
            bullets.push({
              x: fromLeft ? -12 : W + 12, y: y - k * 17,
              vx: fromLeft ? 255 + tier * 12 : -255 - tier * 12,
              vy: -25 + k * 10, r: 6, color: "#e8edf4",
              dead: false, gravity: true, gravityAccel: 85,
              stompable: false
            });
          }
          radialTimers[0] = Math.max(0.9, 2.0 - tier * 0.055);
        }
      }
    } else {
      // WORLD 1のステージ攻撃ロジック
    // ステージ1
    if (stage === 1) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];

        shotTimers[i] -= dt * attackRateMultiplier;
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

        radialTimers[i] -= dt * attackRateMultiplier;
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
      radialTimers[0] -= dt * attackRateMultiplier;

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
        shotTimers[i] -= dt * attackRateMultiplier;

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

      edgeTimer -= dt * attackRateMultiplier;

      if (edgeTimer <= 0) {
        edgeAttack();
        edgeTimer = rand(1.1, 1.8);
      }
    }

    // ステージ3：左右にも敵を配置し、3体が渦巻き状に弾を放つ
    if (stage === 3) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];

        shotTimers[i] -= dt * attackRateMultiplier;
        if (shotTimers[i] <= 0) {
          const base =
            patternTick * (i === 1 ? -1 : 1) * 1.35 + i * 0.7;

          for (let n = 0; n < 3 + Math.floor(elapsed / 30); n++) {
            const a = base + n * Math.PI * 2 / 3;
            fire(e.x, e.y, a, 145, C.green);
          }

          shotTimers[i] = 0.18;
        }

        radialTimers[i] -= dt * attackRateMultiplier;
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
      stage4RainTimer -= dt * attackRateMultiplier;

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
      stage5WaveTimer -= dt * attackRateMultiplier;

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

      shotTimers[0] -= dt * attackRateMultiplier;

      if (shotTimers[0] <= 0) {
        aimedShot(
          enemies[0],
          190 + Math.min(100, elapsed * 1.5),
          C.purple
        );

        shotTimers[0] = Math.max(0.38, 0.95 - elapsed * 0.004);
      }
    }

    // ステージ6：回転バーは30秒ごとに3回だけ加速し、その速度を維持。
    // 90秒以降はバーを加速させず、中央から出る弾幕を増やして難易度を上げる。
    if (stage === 6) {
      const speedLevel = Math.min(3, Math.floor(elapsed / 30));
      const rotationSpeed = 1.15 + speedLevel * 0.35;
      stage6Angle += dt * rotationSpeed;

      const lateTier = Math.max(0, Math.floor((elapsed - 90) / 30));
      stage6BurstTimer -= dt * attackRateMultiplier;

      if (stage6BurstTimer <= 0) {
        radialShot(
          enemies[0],
          24 + speedLevel * 4 + Math.min(36, lateTier * 4),
          175 + speedLevel * 12 + Math.min(90, lateTier * 8),
          patternTick * (0.13 + lateTier * 0.025),
          C.blue
        );

        stage6BurstTimer = Math.max(
          0.65,
          rand(3.2, 4.5) - speedLevel * 0.15 - lateTier * 0.22
        );

        if (lateTier > 0 && Math.random() < Math.min(0.8, 0.2 + lateTier * 0.12)) {
          radialShot(
            enemies[0],
            12 + Math.min(24, lateTier * 3),
            190 + Math.min(70, lateTier * 7),
            patternTick * -0.18,
            C.purple
          );
        }
      }

      for (let i = 1; i <= 4; i++) {
        shotTimers[i] -= dt * attackRateMultiplier;

        if (shotTimers[i] <= 0) {
          aimedShot(
            enemies[i],
            185 + Math.min(100, elapsed * 1.4),
            i % 2 === 0 ? C.orange : C.pink
          );
          shotTimers[i] = Math.max(0.28, 1.15 - elapsed * 0.006);
          if (speedLevel >= 1) {
            fanShot(enemies[i], 3 + Math.min(9, speedLevel * 2 + lateTier), 0.35, 150 + speedLevel * 15, C.orange);
          }
        }
      }
    }

    // WORLD 1 Stage 7〜10：4種類の異なる攻撃。
    if (world === 1 && stage === 7) {
      // 最初は10個。30秒ごとに2個増やし、同時に速度も上げる。
      const tier = Math.floor(elapsed / 30);
      const wanted = Math.min(40, 10 + tier * 2);
      const speed = 165 + tier * 32;
      while (triangles.length < wanted) {
        const a = rand(0, Math.PI * 2);
        triangles.push({ x: rand(0, W), y: rand(45, H), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: 48 + Math.min(16, tier * 3), spin: rand(0, Math.PI * 2) });
      }
      for (const t of triangles) {
        t.size = Math.max(t.size, 48 + Math.min(16, tier * 3));
        const currentSpeed = Math.hypot(t.vx, t.vy) || speed;
        const nextSpeed = Math.max(currentSpeed, speed);
        t.vx = t.vx / currentSpeed * nextSpeed; t.vy = t.vy / currentSpeed * nextSpeed;
        t.x += t.vx * dt; t.y += t.vy * dt; t.spin += dt * 0.65;
        // 中心が端まで行くので、プレイヤーが画面端に隠れても三角形が届く。
        if (t.x < 0 || t.x > W) { t.vx *= -1; t.x = clamp(t.x, 0, W); }
        if (t.y < 45 || t.y > H) { t.vy *= -1; t.y = clamp(t.y, 45, H); }
      }
      // 中央の敵が、追尾弾と全方向攻撃をランダムに発射。
      shotTimers[0] -= dt * attackRateMultiplier;
      radialTimers[0] -= dt * attackRateMultiplier;
      if (shotTimers[0] <= 0) {
        fireHoming(enemies[0], 165 + tier * 9, C.cyan);
        if (Math.random() < 0.3) fireHoming(enemies[0], 150 + tier * 8, C.pink);
        shotTimers[0] = rand(1.15, 2.35);
      }
      if (radialTimers[0] <= 0) {
        radialShot(enemies[0], 18 + Math.min(18, tier * 2), 125 + tier * 8, rand(0, Math.PI * 2), C.orange);
        radialTimers[0] = rand(2.2, 4.0);
      }
    } else if (stage === 8) {
      shotTimers[0] -= dt * attackRateMultiplier;
      if (shotTimers[0] <= 0) {
        // 画面端に限定せず、戦闘画面のどこにでも警告ポータルを出す。
        // 最初は4個。30秒ごとに少しずつ増えていく。
        const count = Math.min(22, 4 + tier * 2);
        for (let n = 0; n < count; n++) strikeWarnings.push({ x: rand(30, W - 30), y: rand(65, H - 35), life: rand(0.55, 0.9), fired: false });
        shotTimers[0] = Math.max(0.28, 0.92 - tier * 0.055);
      }
    } else if (stage === 9) {
      shotTimers[0] -= dt * attackRateMultiplier;
      radialTimers[0] -= dt * attackRateMultiplier;
      if (shotTimers[0] <= 0) {
        // 4ポイントから始まり、時間とともに増加。上下左右から同時に迫る。
        const points = Math.min(28, 4 + tier * 3);
        const gapX = clamp(player.x + rand(-W * 0.28, W * 0.28), W * 0.12, W * 0.88);
        const gapY = clamp(player.y + rand(-H * 0.28, H * 0.18), H * 0.16, H * 0.84);
        for (let n = 0; n < points; n++) {
          const t = (n + 0.5) / points, x = t * W, y = t * H;
          if (Math.abs(x - gapX) > Math.max(30, 76 - tier * 2)) {
            fire(-8, rand(35, H - 18), 0, 250 + tier * 16, C.blue, 4);
            fire(W + 8, rand(35, H - 18), Math.PI, 250 + tier * 16, C.cyan, 4);
          }
          if (Math.abs(y - gapY) > Math.max(26, 65 - tier * 2)) {
            fire(rand(10, W - 10), -8, Math.PI / 2, 245 + tier * 16, C.pink, 4);
            fire(rand(10, W - 10), H + 8, -Math.PI / 2, 245 + tier * 16, C.orange, 4);
          }
          if (n % 2 === 0) {
            fire(-8, y, Math.atan2(y - player.y, W * 0.45), 205 + tier * 13, C.purple, 3);
            fire(W + 8, H - y, Math.atan2(player.y - (H - y), -W * 0.45), 205 + tier * 13, C.purple, 3);
          }
        }
        shotTimers[0] = Math.max(0.42, 1.25 - tier * 0.055);
      }
      if (radialTimers[0] <= 0) {
        radialShot(enemies[0], 14 + Math.min(20, tier * 2), 120 + tier * 9, rand(0, Math.PI * 2), C.pink);
        radialTimers[0] = Math.max(0.65, rand(1.35, 2.0) - tier * 0.04);
      }
    } else if (stage === 10) {
      shotTimers[0] -= dt * attackRateMultiplier; radialTimers[0] -= dt * attackRateMultiplier;
      if (shotTimers[0] <= 0) {
        const lanes = Math.min(14, 5 + tier), gapLane = Math.floor((patternTick * 0.7) % lanes);
        for (let lane = 0; lane < lanes; lane++) { if (lane === gapLane) continue; const x = (lane + 0.5) * W / lanes; fire(x, H + 8, -Math.PI / 2, 190 + tier * 12, C.purple, 4); if (tier >= 2 && lane % 2 === 0) fire(x + 8, H + 8, -Math.PI / 2, 225 + tier * 12, C.blue, 3); }
        shotTimers[0] = Math.max(0.62, 1.35 - tier * 0.06);
      }
      if (radialTimers[0] <= 0) { radialShot(enemies[0], 10 + tier * 2, 105 + tier * 8, patternTick * 0.38, C.orange); radialTimers[0] = Math.max(1.05, 2.6 - tier * 0.08); }
    }

    // Stage 8: 警告マークが消えた位置から放射状に弾を発射。
    for (const warning of strikeWarnings) {
      warning.life -= dt;
      if (warning.life <= 0 && !warning.fired) { warning.fired = true; for (let k = 0, count = 14 + Math.min(8, Math.floor(elapsed / 30) * 2); k < count; k++) fire(warning.x, warning.y, k * Math.PI * 2 / count, 175 + Math.floor(elapsed / 30) * 12, C.red, 4); }
    }
    strikeWarnings = strikeWarnings.filter(w => w.life > -0.12);
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

    if (world === 1 && stage === 7 && player.invuln <= 0) {
      for (const t of triangles) {
        const verts = [[0, -t.size], [t.size * 0.88, t.size * 0.72], [-t.size * 0.88, t.size * 0.72]].map(([x, y]) => ({ x: t.x + x * Math.cos(t.spin) - y * Math.sin(t.spin), y: t.y + x * Math.sin(t.spin) + y * Math.cos(t.spin) }));
        const [a, b, c] = verts;
        const d1 = (player.x - b.x) * (a.y - b.y) - (a.x - b.x) * (player.y - b.y);
        const d2 = (player.x - c.x) * (b.y - c.y) - (b.x - c.x) * (player.y - c.y);
        const d3 = (player.x - a.x) * (c.y - a.y) - (c.x - a.x) * (player.y - a.y);
        const inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
        const nearSegment = (p, q) => { const vx = q.x-p.x, vy = q.y-p.y; const f = clamp(((player.x-p.x)*vx+(player.y-p.y)*vy)/(vx*vx+vy*vy||1),0,1); return Math.hypot(player.x-(p.x+vx*f),player.y-(p.y+vy*f)) <= player.r+4; };
        if (inside || nearSegment(a,b) || nearSegment(b,c) || nearSegment(c,a)) {
          player.lives--; player.invuln = 1.15 + upgrades.guard * 0.35; hitFlash = 0.2;
          if (player.lives <= 0 && upgrades.revive > 0 && !reviveUsed) { reviveUsed=true; player.lives=1; player.invuln=2.5; bullets=[]; edgeWarnings=[]; triangles=[]; showMessage("リバイブ発動！"); }
          else if (player.lives <= 0) { mode="gameover"; menuIndex=0; bullets=[]; edgeWarnings=[]; triangles=[]; saveUserProgress(); }
          break;
        }
      }
    }
    } // WORLD 1 attack patterns end

    for (const bullet of bullets) {
      // 発射時に速度倍率を適用済みなので、移動中は倍率を掛けない。
      if (bullet.homing && !bullet.dead) {
        const speed = bullet.homingSpeed || Math.hypot(bullet.vx, bullet.vy) || 1;
        const current = Math.atan2(bullet.vy, bullet.vx);
        const target = Math.atan2(player.y - bullet.y, player.x - bullet.x);
        let delta = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        delta = clamp(delta, -1.7 * dt, 1.7 * dt);
        const angle = current + delta;
        bullet.vx = Math.cos(angle) * speed;
        bullet.vy = Math.sin(angle) * speed;
      }
      const previousBulletY = bullet.y;
      if (bullet.gravity && !bullet.stomped) bullet.vy += (bullet.gravityAccel || 260) * dt;
      if (bullet.stomped) {
        bullet.stompLife = (bullet.stompLife ?? 0.12) - dt;
        if (bullet.stompLife <= 0) bullet.dead = true;
      } else {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      }

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

      // WORLD 2では、落下中の弾の上に着地して踏める。踏まれた弾は短時間だけ足場になる。
      const fallingOntoBall =
        world === 2 && bullet.stompable && !bullet.dead && !bullet.stomped &&
        gravityVelocity >= 0 && bullet.vy >= 0 &&
        previousPlayerY + player.r <= bullet.y - bullet.r + 8 &&
        player.y + player.r >= bullet.y - bullet.r &&
        Math.abs(player.x - bullet.x) < player.r + bullet.r * 0.78;
      if (fallingOntoBall) {
        player.y = bullet.y - bullet.r - player.r;
        // 踏んだ瞬間に自動ジャンプ。キーを押していなければ最小ジャンプ、
        // 長押しすれば上昇時間が延びて飛距離が伸びる。
        gravityVelocity = -300;
        jumpHoldTime = 0;
        bullet.stomped = true;
        bullet.stompLife = 0.12;
        bullet.vx = 0;
        bullet.vy = 0;
        continue;
      }

      if (
        !bullet.dead &&
        !bullet.stomped &&
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

    if (world === 1 && stage === 6 && player.invuln <= 0) {
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
      !b.dead && b.x > -70 && b.x < W + 70 &&
      b.y > -70 && b.y < H + 70
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

    // 高額アップグレード：一定時間ごとに短時間のバリアを付与する
    if (upgrades.bulletPulse > 0) {
      pulseTimer += dt;
      const pulseInterval = Math.max(18, 60 - upgrades.bulletPulse * 14);
      if (pulseTimer >= pulseInterval) {
        pulseTimer = 0;
        // 画面上の弾は消さず、短時間のバリアだけを付与する。
        player.invuln = Math.max(player.invuln, 1.2 + upgrades.bulletPulse * 0.3);
        showMessage("BULLET PULSE：バリア発動！");
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
    if (world === 1) {
      // WORLD 1：元の暗い青色と四角いグリッドを維持。
      rect(0, 0, W, H, C.bg);
      ctx.strokeStyle = C.line;
      ctx.strokeRect(1, 1, W - 2, H - 2);
      ctx.globalAlpha = 0.13;
      for (let x = 20; x < W; x += 32) rect(x, 0, 1, H, "#1d3042");
      for (let y = 20; y < H; y += 32) rect(0, y, W, 1, "#1d3042");
      ctx.globalAlpha = 1;
      return;
    }

    // WORLD 2：紫の星雲、シアンの軌道、星屑で別世界の雰囲気にする。
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, "#100821");
    gradient.addColorStop(0.48, "#21103c");
    gradient.addColorStop(1, "#061c31");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#7137a8";
    ctx.beginPath();
    ctx.ellipse(W * 0.24, H * 0.28, W * 0.27, H * 0.22, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#087c9b";
    ctx.beginPath();
    ctx.ellipse(W * 0.78, H * 0.72, W * 0.3, H * 0.24, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#62eaff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * 0.5, 90 + i * 65, 28 + i * 23, -0.22, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.62;
    for (let i = 0; i < 100; i++) {
      const x = (i * 137.5 + (i % 7) * 19) % W;
      const y = (i * 73.7 + (i % 11) * 13) % H;
      const size = i % 9 === 0 ? 3 : (i % 3 === 0 ? 2 : 1);
      rect(x, y, size, size, i % 4 === 0 ? "#bca5ff" : "#7cecff");
    }
    ctx.restore();

    ctx.strokeStyle = "#4b2d72";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.strokeStyle = "#2b8198";
    ctx.lineWidth = 1;
    ctx.strokeRect(9, 9, W - 18, H - 18);

    // World名を全画面メニューで常に表示し、切り替わったことを明確にする。
    text("WORLD 2  //  VOID FRONTIER", W / 2, H - 8, 9, "#7cecff", "center");
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
      world === 2
        ? (selected ? "#39245b" : "#17172f")
        : (selected ? "#1b3850" : C.panel)
    );

    ctx.strokeStyle = world === 2
      ? (selected ? "#7cecff" : "#594276")
      : (selected ? C.blue : C.line);
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

    text(world === 2 ? "RUU RPG  -  WORLD 2" : "RUU RPG  -  WORLD 1", W / 2, H * 0.29, 34, world === 2 ? "#bca5ff" : C.white, "center");
    if (world === 2) text("VOID FRONTIER  ·  NEW UNIVERSE", W / 2, H * 0.335, 11, "#7cecff", "center");
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
    text("WORLD " + world + "  /  ステージ選択", W / 2, 36, 25, world === 2 ? "#bca5ff" : C.white, "center");
    if (world === 2) text("VOID FRONTIER  ·  独立した新しい冒険", W / 2, 51, 9, "#7cecff", "center");
    text(`GOLD: ${gold}`, W / 2, 68, 13, C.gold, "center");

    const playableStages = STAGES.filter(s => !s.worldUnlock);
    const gap = Math.min(53, (H - 145) / 6);
    const startY = 105;
    for (let i = 0; i < playableStages.length; i++) {
      const s = playableStages[i];
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
      desc: level => level ? `${Math.max(18, 60 - level * 14)}秒ごとに短時間バリア` : "一定時間ごとに短時間バリア",
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
    rect(leftX, top, leftW, availableH, world === 2 ? "#17132b" : "#0b1927");
    ctx.strokeStyle = world === 2 ? "#594276" : C.line;
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
    rect(rightX, top, rightW, availableH, world === 2 ? "#111c30" : "#0b1927");
    ctx.strokeStyle = world === 2 ? "#2b8198" : C.line;
    ctx.strokeRect(rightX, top, rightW, availableH);
    text("ステージ購入", rightX + rightW / 2, top + 19, 14, C.orange, "center");

    const listTop = top + 44;
    const rowH = 43;
    const visibleRows = Math.max(1, Math.floor((availableH - 49) / rowH));
    const shopStageList = world === 1 ? STAGES : STAGES.filter(s => !s.worldUnlock);
    const maxScroll = Math.max(0, shopStageList.length - visibleRows);
    shopScroll = clamp(shopScroll, 0, maxScroll);

    for (let row = 0; row < visibleRows; row++) {
      const i = row + shopScroll;
      const s = shopStageList[i];
      if (!s) continue;

      const y = listTop + row * rowH;
      const selected = menuIndex === UPGRADE_ITEMS.length + i;
      const owned = s.worldUnlock ? world === 2 : unlockedStages.has(s.id);

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
        s.worldUnlock ? (world === 2 ? "解放済み" : `${s.cost}G / WORLD 2を解放`) :
        (owned ? `購入済み / 報酬 ${s.reward}G` : `${s.cost}G / 報酬 ${s.reward}G`),
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

    for (const warning of strikeWarnings) {
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 65) * 0.3; ctx.strokeStyle = C.red; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(warning.x, warning.y, 18 + (0.95 - warning.life) * 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(warning.x - 9, warning.y - 9); ctx.lineTo(warning.x + 9, warning.y + 9); ctx.moveTo(warning.x + 9, warning.y - 9); ctx.lineTo(warning.x - 9, warning.y + 9); ctx.stroke(); ctx.restore();
    }
    for (const t of triangles) { ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.spin); ctx.fillStyle = "rgba(255,70,94,0.15)"; ctx.strokeStyle = C.purple; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -t.size); ctx.lineTo(t.size * 0.88, t.size * 0.72); ctx.lineTo(-t.size * 0.88, t.size * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    for (const warning of edgeWarnings) {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 80) * 0.25;
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.arc(warning.x, warning.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (world === 1 && stage === 6 && enemies[0]) {
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

    for (const bullet of bullets) {
      if (bullet.stomped) {
        ctx.globalAlpha = 0.75;
        rect(bullet.x - bullet.r - 2, bullet.y - bullet.r - 2, (bullet.r + 2) * 2, (bullet.r + 2) * 2, "#7cecff");
        ctx.globalAlpha = 1;
      }
      drawBullet(bullet);
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
      rect(p.x, p.y, 3, 3, p.color);
      ctx.globalAlpha = 1;
    }

    drawPlayer();

    text(`WORLD ${world}  ·  STAGE ${stage}`, 14, 20, 13);
    text(`TIME ${elapsed.toFixed(1)}s`, 14, 40, 11, C.muted);
    text(`GOLD ${gold}`, W - 14, 20, 13, C.gold, "right");

    text(
      `HP ${"♥".repeat(Math.max(0, player.lives))}${"♡".repeat(Math.max(0, player.maxLives - player.lives))}`,
      14, 60, 13, C.pink
    );

    text(
      world === 2 ? "MOVE: A/D OR ARROWS   JUMP: W / UP   ESC: PAUSE" : "MOVE: WASD / ARROWS   ESC: PAUSE",
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
    const parts = raw.trim().split(/\s+/);
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
    if (s === 11 && world === 1) {
      if (gold < 520000) { showMessage("520000 GOLD必要です"); return; }
      gold -= 520000; saveUserProgress(); switchToWorld2(); return;
    }
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

    showMessage("ステージ" + s + "を購入しました！");
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
      const s = STAGES.filter(item => !item.worldUnlock)[menuIndex];

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
      menuIndex = clamp(menuIndex + direction, 0, STAGES.filter(s => !s.worldUnlock).length - 1);

      const visibleRows = Math.max(
        1,
        Math.floor((H - 160) / Math.min(53, (H - 145) / 6))
      );

      shopScroll = clamp(
        menuIndex - visibleRows + 1,
        0,
        STAGES.filter(s => !s.worldUnlock).length - visibleRows
      );
    } else if (mode === "shop") {
      menuIndex = clamp(
        menuIndex + direction,
        0,
        UPGRADE_ITEMS.length + (world === 1 ? STAGES.length : STAGES.filter(s => !s.worldUnlock).length) - 1
      );

      if (menuIndex >= UPGRADE_ITEMS.length) {
        const stageIndex = menuIndex - UPGRADE_ITEMS.length;
        const visibleRows = Math.max(1, Math.floor((H - 150) / 43));
        shopScroll = clamp(
          stageIndex - visibleRows + 1,
          0,
          Math.max(0, (world === 1 ? STAGES.length : STAGES.filter(s => !s.worldUnlock).length) - visibleRows)
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
        shopScroll = clamp(shopScroll + delta, 0, Math.max(0, (world === 1 ? STAGES.length : STAGES.filter(s => !s.worldUnlock).length) - 1));
        menuIndex = stageStart + shopScroll;
      }
    } else {
      shopScroll = clamp(shopScroll + delta, 0, Math.max(0, STAGES.filter(s => !s.worldUnlock).length - 1));
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
      // 一時的な体験用ボーナス。後でこの処理とフラグを削除すること。
      if (!accounts[savedUsername].demoGoldGranted) { gold += 100000000; accounts[savedUsername].demoGoldGranted = true; saveAccounts(accounts); saveUserProgress(); }
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
