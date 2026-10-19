// rpg.js — updated: accelerated stage costs, per-stage attack patterns, time-scaling difficulty
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hpEl = document.getElementById("hp");
const modeEl = document.getElementById("mode");
const startBtn = document.getElementById("startBtn");
const goldEl = document.getElementById("gold");
const shopModal = document.getElementById("shopModal");
const menuModal = document.getElementById("menuModal");
const deathModal = document.getElementById("deathModal");
const deathGoldEl = document.getElementById("deathGold");
const giveUpBtn = document.getElementById("giveUpBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const closeShop = document.getElementById("closeShop");
const replayBtn = document.getElementById("replayBtn");
const goShopBtn = document.getElementById("goShopBtn");
const shopItemsEl = document.getElementById("shopItems");
const shopGoldDisplay = document.getElementById("shopGoldDisplay");
const invulnDisplay = document.getElementById("invulnDisplay");
const shopEffects = document.getElementById("shopEffects");
const stageListEl = document.getElementById("stageList");
const stageLabel = document.getElementById("stageLabel");

const W = canvas.width;
const H = canvas.height;

const player = {
  x: W / 2,
  y: H - 18,
  w: 8,
  h: 8,
  speed: 1.8,
  maxHp: 1,
  hp: 1,
  invuln: 0,
  invulnDuration: 18,
  hitFlash: 0
};

const enemy = {
  x: W / 2,
  y: 18,
  w: 18,
  h: 18
};

const keys = {};
let bullets = [];
let running = false;
let paused = false;
let shopOpen = false;
let patternIndex = 0;
let patternTimer = 0;
let lastTime = 0;
let totalGold = 0;
let battleGold = 0; // floating
let battleGoldTimer = 0;
let menuOpen = false;
let deathScreenOpen = false;
let currentStage = 0;
let battleElapsed = 0; // ms elapsed during current battle

// global tuning
const overallIntensity = 1.25; // makes everything more aggressive overall

// shop upgrades state
let goldGainMultiplier = 1.0; // up to 3.0
const goldGainMax = 3.0;
let invulnIncreaseAmount = 0; // added to invulnDuration (frames)
const invulnMax = 60; // frames
let hpIncreaseTotal = 0;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function beep(freq = 440, type = "sine", duration = 0.08, volume = 0.04) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  if (!window.__audioCtx) {
    window.__audioCtx = new AudioCtx();
  }

  const a = window.__audioCtx;
  const osc = a.createOscillator();
  const gain = a.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(volume, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);

  osc.connect(gain);
  gain.connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration);
}

const heartSprite = [
  [0, 0, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1],
  [1,1,1,1,1,1],
  [0,1,1,1,1,0],
  [0,0,1,1,0,0]
];

const enemySprite = [
  [0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1],
  [1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1],
  [1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1],
  [1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0]
];

function drawSprite(sprite, x, y, scale = 1) {
  for (let iy = 0; iy < sprite.length; iy++) {
    for (let ix = 0; ix < sprite[iy].length; ix++) {
      if (!sprite[iy][ix]) continue;
      ctx.fillStyle = sprite[iy][ix] === 1 ? "#ff6b6b" : "#ffd166";
      ctx.fillRect(Math.round(x - sprite[iy].length / 2 + ix) * scale, Math.round(y - sprite.length / 2 + iy) * scale, scale, scale);
    }
  }
}

// Stage definitions (attackType: 0=basic,1=spread,2=spiral,3=burst-homing,4=ring-fast,5=boss)
const stages = [
  { name: 'Stage 1', unlocked: true, baseCost: 0, cost: 0, difficulty: 1.0, spawnMultiplier: 1.0, speedMultiplier: 1.0, attackType: 0 },
  { name: 'Stage 2', unlocked: false, baseCost: 300, cost: 300, difficulty: 1.2, spawnMultiplier: 1.15, speedMultiplier: 1.05, attackType: 1 },
  { name: 'Stage 3', unlocked: false, baseCost: 800, cost: 800, difficulty: 1.6, spawnMultiplier: 1.3, speedMultiplier: 1.12, attackType: 2 },
  { name: 'Stage 4', unlocked: false, baseCost: 2200, cost: 2200, difficulty: 2.2, spawnMultiplier: 1.6, speedMultiplier: 1.3, attackType: 3 },
  { name: 'Stage 5', unlocked: false, baseCost: 6000, cost: 6000, difficulty: 3.5, spawnMultiplier: 2.2, speedMultiplier: 1.6, attackType: 4 },
  { name: 'Stage 6', unlocked: false, baseCost: 18000, cost: 18000, difficulty: 6.0, spawnMultiplier: 3.2, speedMultiplier: 2.2, attackType: 5 }
];

function updateStageLabel() {
  stageLabel.textContent = String(currentStage + 1);
}

function unlockStage(index) {
  if (index <= 0 || index >= stages.length) return false;
  // only allow unlocking the next stage in order
  let highest = 0;
  for (let i = 0; i < stages.length; i++) if (stages[i].unlocked) highest = i;
  if (index !== highest + 1) return false;

  const cost = stages[index].cost;
  const available = totalGold + Math.floor(battleGold);
  if (available < cost) return false;

  let remaining = cost;
  if (totalGold >= remaining) {
    totalGold -= remaining;
    remaining = 0;
  } else {
    remaining -= totalGold;
    totalGold = 0;
  }
  if (remaining > 0) battleGold = Math.max(0, battleGold - remaining);

  stages[index].unlocked = true;
  // increase next stage cost with accelerating increments (use baseCost * 2^(index))
  if (index + 1 < stages.length) {
    stages[index + 1].cost = Math.ceil(stages[index + 1].cost + stages[index + 1].baseCost * Math.pow(2, index));
  }
  populateShopItems();
  updateShopHeader();
  showPurchaseEffect(`ステージ解放: ${stages[index].name}`);
  return true;
}

function selectStage(index) {
  if (!stages[index] || !stages[index].unlocked) return false;
  currentStage = index;
  updateStageLabel();
  populateStageList();
  showPurchaseEffect(`選択: ${stages[index].name}`);
  return true;
}

function setModalVisible(modal, visible) {
  if (!modal) return;
  modal.classList.toggle("show", visible);
  modal.setAttribute("aria-hidden", String(!visible));
}

function updateShopHeader() {
  if (!shopGoldDisplay || !invulnDisplay) return;
  const available = totalGold + Math.floor(battleGold);
  shopGoldDisplay.textContent = String(available);
  const currentInv = clamp(18 + invulnIncreaseAmount, 18, invulnMax);
  const ratio10 = Math.round((currentInv / invulnMax) * 10);
  invulnDisplay.textContent = `無敵時間: ${currentInv}/${invulnMax} frames (${ratio10}/10)`;
}

function showPurchaseEffect(text) {
  if (!shopEffects) return;
  const el = document.createElement('div');
  el.className = 'purchase-effect';
  el.textContent = text;
  shopEffects.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 600);
  }, 800);
}

function openShop() {
  setModalVisible(shopModal, true);
  shopModal.querySelector('.modal-content').classList.add('full');
  running = false; // stop battle while in shop
  paused = true;
  shopOpen = true;
  menuOpen = false;
  deathScreenOpen = false;
  populateShopItems();
  populateStageList();
  updateShopHeader();
}

function closeShopModal() {
  setModalVisible(shopModal, false);
  shopModal.querySelector('.modal-content').classList.remove('full');
  paused = false;
  shopOpen = false;
}

function openMenu() {
  if (!running || deathScreenOpen || menuOpen || shopOpen) return;
  setModalVisible(menuModal, true);
  paused = true;
  menuOpen = true;
}

function closeMenu() {
  setModalVisible(menuModal, false);
  paused = false;
  menuOpen = false;
}

function showDeathResult() {
  const earned = Math.floor(battleGold);
  totalGold += earned;
  battleGold = 0;
  battleGoldTimer = 0;
  goldEl.textContent = String(totalGold);
  deathGoldEl.textContent = String(earned);
  setModalVisible(deathModal, true);
  setModalVisible(menuModal, false);
  deathScreenOpen = true;
  menuOpen = false;
  paused = true;
}

function closeDeathModal() {
  setModalVisible(deathModal, false);
  deathScreenOpen = false;
  paused = false;
}

// Per-stage attack implementations
function spawnAttackBasic(bx, by, spawnMul, speedMul) {
  if (Math.random() < 0.18 * spawnMul * overallIntensity) {
    const ang = Math.atan2(player.y - by, player.x - bx);
    bullets.push({ x: bx, y: by, vx: Math.cos(ang) * 1.1 * speedMul, vy: Math.sin(ang) * 1.1 * speedMul, radius: 1.3 });
  }
}

function spawnAttackSpread(bx, by, spawnMul, speedMul) {
  if (Math.random() < 0.28 * spawnMul * overallIntensity) {
    // wider spread than before
    for (let i = -3; i <= 3; i++) {
      const spread = i * 0.22;
      const ang = Math.atan2(player.y - by, player.x - bx) + spread;
      bullets.push({ x: bx, y: by, vx: Math.cos(ang) * 1.5 * speedMul, vy: Math.sin(ang) * 1.5 * speedMul, radius: 1.3 });
    }
  }
}

function spawnAttackSpiral(bx, by, spawnMul, speedMul) {
  if (Math.random() < 0.12 * spawnMul * overallIntensity) {
    const count = 10; // more bullets for spiral
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 / count) * i + patternTimer * 1.2;
      bullets.push({ x: bx, y: by, vx: Math.cos(a) * 1.6 * speedMul, vy: Math.sin(a) * 1.6 * speedMul, radius: 1.2 });
    }
  }
}

// wide-area attack for Stage 1 enemy
function spawnAttackWide(bx, by, spawnMul, speedMul) {
  // full ring but a bit slower, for wide coverage
  const count = 20;
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 / count) * i;
    bullets.push({ x: bx, y: by, vx: Math.cos(a) * 1.4 * speedMul, vy: Math.sin(a) * 1.4 * speedMul, radius: 1.6 });
  }
}

function spawnAttackBurstHoming(bx, by, spawnMul, speedMul) {
  if (Math.random() < 0.22 * spawnMul * overallIntensity) {
    // burst of fast bullets, a few with homing adjustments
    for (let i = 0; i < 5; i++) {
      const ang = Math.atan2(player.y - by, player.x - bx) + (Math.random() - 0.5) * 0.4;
      bullets.push({ x: bx, y: by, vx: Math.cos(ang) * 2.4 * speedMul, vy: Math.sin(ang) * 2.4 * speedMul, homing: i < 2 ? 0.02 : 0, radius: 1.6 });
    }
  }
}

function spawnAttackRingFast(bx, by, spawnMul, speedMul) {
  if (Math.random() < 0.14 * spawnMul * overallIntensity) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 / count) * i + patternTimer * 2.0;
      bullets.push({ x: bx, y: by, vx: Math.cos(a) * 2.0 * speedMul, vy: Math.sin(a) * 2.0 * speedMul, radius: 1.4 });
    }
  }
}

function spawnAttackBoss(bx, by, spawnMul, speedMul) {
  // combination: spiral + targeted fast missiles
  if (Math.random() < 0.35 * spawnMul * overallIntensity) {
    // targeted missiles
    for (let i = 0; i < 3; i++) {
      const ang = Math.atan2(player.y - by, player.x - bx) + (Math.random() - 0.5) * 0.6;
      bullets.push({ x: bx, y: by, vx: Math.cos(ang) * 2.6 * speedMul, vy: Math.sin(ang) * 2.6 * speedMul, homing: 0.03, radius: 1.8 });
    }
  }
  // occasional large spiral
  if (Math.random() < 0.18 * spawnMul * overallIntensity) {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 / count) * i + patternTimer * 0.9;
      bullets.push({ x: bx, y: by, vx: Math.cos(a) * 1.8 * speedMul, vy: Math.sin(a) * 1.8 * speedMul, radius: 1.3 });
    }
  }
}

function spawnPattern(index) {
  const bx = enemy.x;
  const by = enemy.y + enemy.h / 2;

  // time scaling: difficulty slightly ramps up as battle runs
  const timeScale = 1 + (battleElapsed / 60000) * 0.6; // +60% per minute
  const spawnMul = stages[currentStage].spawnMultiplier * timeScale;
  const speedMul = stages[currentStage].speedMultiplier * timeScale;
  const atkType = stages[currentStage].attackType;

  switch (atkType) {
    case 0:
      spawnAttackBasic(bx, by, spawnMul, speedMul);
      // on Stage 1, occasionally do a wide-area attack
      if (currentStage === 0 && Math.random() < 0.06 * spawnMul * overallIntensity) {
        spawnAttackWide(bx, by, spawnMul, speedMul);
      }
      break;
    case 1: spawnAttackSpread(bx, by, spawnMul, speedMul); break;
    case 2: spawnAttackSpiral(bx, by, spawnMul, speedMul); break;
    case 3: spawnAttackBurstHoming(bx, by, spawnMul, speedMul); break;
    case 4: spawnAttackRingFast(bx, by, spawnMul, speedMul); break;
    case 5: spawnAttackBoss(bx, by, spawnMul, speedMul); break;
    default: spawnAttackBasic(bx, by, spawnMul, speedMul); break;
  }
}

function updatePlayer() {
  if (keys["arrowleft"] || keys["a"]) player.x -= player.speed;
  if (keys["arrowright"] || keys["d"]) player.x += player.speed;
  if (keys["arrowup"] || keys["w"]) player.y -= player.speed;
  if (keys["arrowdown"] || keys["s"]) player.y += player.speed;

  player.x = clamp(player.x, 6, W - 6);
  player.y = clamp(player.y, 10, H - 8);
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    // homing adjustment if present
    if (b.homing) {
      const ang = Math.atan2(player.y - b.y, player.x - b.x);
      const curAng = Math.atan2(b.vy, b.vx);
      const newAng = curAng + (ang - curAng) * b.homing; // interpolate a bit
      const speed = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(newAng) * speed;
      b.vy = Math.sin(newAng) * speed;
    }

    b.x += b.vx;
    b.y += b.vy;

    if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
      bullets.splice(i, 1);
      continue;
    }

    const hit =
      b.x > player.x - player.w / 2 &&
      b.x < player.x + player.w / 2 &&
      b.y > player.y - player.h / 2 &&
      b.y < player.y + player.h / 2;

    if (hit) {
      bullets.splice(i, 1);
      if (player.invuln <= 0) {
        player.hp -= 1;
        player.invuln = player.invulnDuration;
        player.hitFlash = 6;
        beep(180, "sawtooth", 0.1, 0.05);
        if (player.hp <= 0) {
          running = false;
          modeEl.textContent = "Defeat";
          beep(70, "square", 0.25, 0.08);
          showDeathResult();
        }
      }
    }
  }

  if (player.invuln > 0) player.invuln--;
  if (player.hitFlash > 0) player.hitFlash--;
}

function updateGoldEarned(dt) {
  const baseRate = 1.0;
  const patternMultiplier = 1 + patternIndex * 0.5;
  const stageDifficulty = stages[currentStage].difficulty;
  const timeScale = 1 + (battleElapsed / 60000) * 0.6;
  const rate = baseRate * patternMultiplier * goldGainMultiplier * stageDifficulty * timeScale;
  battleGold += rate * (dt / 1000);
}

function update(dt) {
  // if death screen, nothing
  if (deathScreenOpen) return;

  // if shop is open, do not accumulate gold; only update header
  if (shopOpen) {
    updateShopHeader();
    return;
  }

  if (!running || paused) return;

  battleElapsed += dt;
  patternTimer += dt;
  updateGoldEarned(dt);

  if (patternTimer > 70) {
    patternTimer = 0;
    patternIndex = (patternIndex + 1) % 4;
    modeEl.textContent = ["Easy", "Dense", "Orbit", "Focus"][patternIndex];
  }

  // spawn chance is now stronger overall
  if (Math.random() < 0.08 * overallIntensity) {
    spawnPattern(patternIndex);
  }

  updatePlayer();
  updateBullets();
  hpEl.textContent = String(player.hp) + "/" + String(player.maxHp);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#06111c";
  ctx.fillRect(0, 0, W, H);

  drawSprite(enemySprite, enemy.x, enemy.y, 1);

  for (const b of bullets) {
    ctx.fillStyle = "#9be7ff";
    ctx.fillRect(Math.round(b.x), Math.round(b.y), 2, 2);
  }

  if (player.hitFlash > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(player.x - 6, player.y - 6, 12, 12);
  }
  drawSprite(heartSprite, player.x, player.y, 1);

  if (!running && !deathScreenOpen && !menuOpen && !paused && !shopOpen) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Press Start", W / 2, H / 2);
  }

  let displayGold = totalGold + Math.floor(battleGold);
  goldEl.textContent = String(displayGold);
  if (shopModal.classList.contains('show')) updateShopHeader();
}

function loop(ts) {
  const dt = Math.min(30, ts - lastTime || 16);
  lastTime = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function startBattle() {
  if (shopOpen) return; // cannot start while shop open

  player.x = W / 2;
  player.y = H - 18;
  player.hp = player.maxHp;
  player.invuln = 0;
  player.invulnDuration = clamp(18 + invulnIncreaseAmount, 18, invulnMax);
  player.hitFlash = 0;
  bullets = [];
  patternIndex = 0;
  patternTimer = 0;
  lastTime = 0;
  battleGold = 0;
  battleGoldTimer = 0;
  battleElapsed = 0;
  running = true;
  paused = false;
  menuOpen = false;
  deathScreenOpen = false;
  modeEl.textContent = "Easy";
  hpEl.textContent = String(player.hp) + "/" + String(player.maxHp);
  updateStageLabel();
  beep(820, "triangle", 0.08, 0.04);
  requestAnimationFrame(loop);
}

// Shop logic — removed HP and invuln upgrades, only gold multiplier remains
const shopItems = [
  {
    id: 'goldmul',
    title: 'GOLD獲得量UP',
    desc: '+0.25 獲得倍率 (最大 x3)',
    cost: 20,
    purchased: 0,
    maxPurchases: Math.floor((goldGainMax - 1.0) / 0.25),
    costFactor: 1.4,
    apply: () => {
      goldGainMultiplier = Math.min(goldGainMax, +(goldGainMultiplier + 0.25).toFixed(2));
    }
  }
];

function populateStageList() {
  if (!stageListEl) return;
  stageListEl.innerHTML = '';
  // determine highest unlocked index
  let highest = 0; for (let i=0;i<stages.length;i++) if (stages[i].unlocked) highest = i;

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const row = document.createElement('div');
    row.className = 'stage-row';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '6px 0';

    const left = document.createElement('div');
    left.innerHTML = `<strong>${s.name}</strong><div style="font-size:12px;color:var(--muted);">難易度:${s.difficulty.toFixed(1)}</div>`;

    const right = document.createElement('div');

    if (s.unlocked) {
      const sel = document.createElement('button');
      sel.textContent = (currentStage === i) ? 'Selected' : 'Select';
      sel.disabled = (currentStage === i);
      sel.addEventListener('click', () => { selectStage(i); showPurchaseEffect(`選択: ${s.name}`); });
      right.appendChild(sel);
    } else {
      const btn = document.createElement('button');
      // only next stage can be purchased
      btn.disabled = (i !== highest + 1);
      btn.textContent = `Unlock ${s.cost}G`;
      btn.addEventListener('click', () => {
        if (unlockStage(i)) {
          updateStageLabel();
        }
      });
      right.appendChild(btn);
    }

    row.appendChild(left);
    row.appendChild(right);
    stageListEl.appendChild(row);
  }
}

function populateShopItems() {
  if (!shopItemsEl) return;
  shopItemsEl.innerHTML = '';
  const available = totalGold + Math.floor(battleGold);

  for (const it of shopItems) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '10px 0';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.04)';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = it.title + ' - ' + it.desc;
    left.appendChild(title);

    const right = document.createElement('div');
    const cost = document.createElement('div');
    cost.textContent = it.cost + ' G';
    cost.style.marginRight = '10px';
    const btn = document.createElement('button');

    btn.textContent = (it.maxPurchases && it.purchased >= it.maxPurchases) ? 'MAX' : 'Buy';
    btn.disabled = available < it.cost || (it.maxPurchases && it.purchased >= it.maxPurchases);

    btn.addEventListener('click', () => {
      const nowAvailable = totalGold + Math.floor(battleGold);
      if (nowAvailable < it.cost) return;

      let remainingCost = it.cost;
      if (totalGold >= remainingCost) {
        totalGold -= remainingCost;
        remainingCost = 0;
      } else {
        remainingCost -= totalGold;
        totalGold = 0;
      }
      if (remainingCost > 0) {
        battleGold = Math.max(0, battleGold - remainingCost);
      }

      it.apply();
      it.purchased = (it.purchased || 0) + 1;
      // increase price after purchase (scaling factor)
      it.cost = Math.ceil(it.cost * it.costFactor + it.cost);
      // reflect immediate invuln change
      player.invulnDuration = clamp(18 + invulnIncreaseAmount, 18, invulnMax);
      goldEl.textContent = String(totalGold + Math.floor(battleGold));
      updateShopHeader();
      showPurchaseEffect(`購入: ${it.title}`);
      populateShopItems();
      populateStageList();
    });

    right.appendChild(cost);
    right.appendChild(btn);

    row.appendChild(left);
    row.appendChild(right);
    shopItemsEl.appendChild(row);
  }
}

// input handlers

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (k === "escape") {
    e.preventDefault();
    if (shopOpen) return; // don't open menu while in shop
    if (running && !deathScreenOpen) {
      if (menuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }
    return;
  }

  if (k === " ") {
    e.preventDefault();
    if (!running && !deathScreenOpen && !shopOpen) startBattle();
  }

  keys[k] = true;
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

startBtn.addEventListener("click", () => {
  if (!running && !deathScreenOpen && !shopOpen) startBattle();
});

document.addEventListener("pointerdown", () => {
  if (!running && !deathScreenOpen && !shopOpen) startBattle();
});

giveUpBtn.addEventListener("click", () => {
  closeMenu();
  openShop();
});

closeMenuBtn.addEventListener("click", () => {
  closeMenu();
});

closeShop.addEventListener("click", () => {
  closeShopModal();
});

replayBtn.addEventListener("click", () => {
  closeDeathModal();
  startBattle();
});

goShopBtn.addEventListener("click", () => {
  closeDeathModal();
  openShop();
});

// initialize display
goldEl.textContent = String(totalGold);
hpEl.textContent = String(player.hp) + "/" + String(player.maxHp);
updateStageLabel();
populateStageList();
requestAnimationFrame(loop);
