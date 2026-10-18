const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hpEl = document.getElementById("hp");
const modeEl = document.getElementById("mode");
const startBtn = document.getElementById("startBtn");

const W = canvas.width;
const H = canvas.height;

const player = {
  x: W / 2,
  y: H - 18,
  w: 8,
  h: 8,
  speed: 1.8,
  hp: 10,
  invuln: 0,
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
let patternIndex = 0;
let patternTimer = 0;
let lastTime = 0;

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
  [1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 0, 0]
];

const enemySprite = [
  [0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1],
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

function spawnPattern(index) {
  const bx = enemy.x;
  const by = enemy.y + enemy.h / 2;

  if (index === 0) {
    // 単発・遅い
    if (Math.random() < 0.18) {
      const ang = Math.atan2(player.y - by, player.x - bx);
      bullets.push({
        x: bx,
        y: by,
        vx: Math.cos(ang) * 1.1,
        vy: Math.sin(ang) * 1.1,
        radius: 1.3
      });
    }
  } else if (index === 1) {
    // 密集
    if (Math.random() < 0.28) {
      for (let i = -2; i <= 2; i++) {
        const spread = i * 0.18;
        const ang = Math.atan2(player.y - by, player.x - bx) + spread;
        bullets.push({
          x: bx,
          y: by,
          vx: Math.cos(ang) * 1.5,
          vy: Math.sin(ang) * 1.5,
          radius: 1.3
        });
      }
    }
  } else if (index === 2) {
    // 丸い弾幕
    if (Math.random() < 0.12) {
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i + patternTimer * 0.7;
        bullets.push({
          x: bx,
          y: by,
          vx: Math.cos(a) * 1.6,
          vy: Math.sin(a) * 1.6,
          radius: 1.2
        });
      }
    }
  } else {
    // 速い正面集中
    if (Math.random() < 0.22) {
      const ang = Math.atan2(player.y - by, player.x - bx) + (Math.random() - 0.5) * 0.3;
      bullets.push({
        x: bx,
        y: by,
        vx: Math.cos(ang) * 2.2,
        vy: Math.sin(ang) * 2.2,
        radius: 1.5
      });
    }
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
        player.invuln = 18;
        player.hitFlash = 6;
        beep(180, "sawtooth", 0.1, 0.05);
        if (player.hp <= 0) {
          running = false;
          modeEl.textContent = "Defeat";
          beep(70, "square", 0.25, 0.08);
        }
      }
    }
  }

  if (player.invuln > 0) player.invuln--;
  if (player.hitFlash > 0) player.hitFlash--;
}

function update(dt) {
  if (!running) return;

  patternTimer += dt;

  if (patternTimer > 70) {
    patternTimer = 0;
    patternIndex = (patternIndex + 1) % 4;
    modeEl.textContent = ["Easy", "Dense", "Orbit", "Focus"][patternIndex];
  }

  if (Math.random() < 0.08) {
    spawnPattern(patternIndex);
  }

  updatePlayer();
  updateBullets();
  hpEl.textContent = String(player.hp);
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = "#06111c";
  ctx.fillRect(0, 0, W, H);

  // 敵
  drawSprite(enemySprite, enemy.x, enemy.y, 1);

  // 弾
  for (const b of bullets) {
    ctx.fillStyle = "#9be7ff";
    ctx.fillRect(Math.round(b.x), Math.round(b.y), 2, 2);
  }

  // プレイヤー
  if (player.hitFlash > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(player.x - 6, player.y - 6, 12, 12);
  }
  drawSprite(heartSprite, player.x, player.y, 1);

  // 何もない状態で文字を出す
  if (!running) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Press Start", W / 2, H / 2);
  }
}

function loop(ts) {
  if (!running) {
    draw();
    requestAnimationFrame(loop);
    return;
  }

  const dt = Math.min(30, ts - lastTime || 16);
  lastTime = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function startBattle() {
  player.x = W / 2;
  player.y = H - 18;
  player.hp = 10;
  player.invuln = 0;
  player.hitFlash = 0;
  bullets = [];
  patternIndex = 0;
  patternTimer = 0;
  lastTime = 0;
  running = true;
  modeEl.textContent = "Easy";
  hpEl.textContent = "10";
  beep(820, "triangle", 0.08, 0.04);
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") {
    e.preventDefault();
    if (!running) startBattle();
  }
  keys[k] = true;
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

startBtn.addEventListener("click", () => {
  if (!running) startBattle();
});

document.addEventListener("pointerdown", () => {
  if (!running) startBattle();
});

draw();
