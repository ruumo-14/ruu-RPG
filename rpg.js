// rpg.js — ドット絵／回避バトル（簡易）
// 小さな論理キャンバス(160x120)で描き、CSSで拡大してピクセル化表示

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hpEl = document.getElementById('hp');
  const msgEl = document.getElementById('msg');
  const startBtn = document.getElementById('startBtn');

  // Audio
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  function sfx(freq=440, type='sine', dur=0.08, vol=0.08){
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now+dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now+dur);
  }

  // Logical size
  const W = canvas.width; // 160
  const H = canvas.height; // 120

  // Player (heart)
  const player = {
    x: W/2, y: H - 30,
    w: 6, h: 6, // sprite size in pixels
    speed: 2.2,
    hp: 10,
    invuln: 0 // frames of invulnerability after hit
  };

  // Enemy (static top center)
  const enemy = {
    x: W/2 - 8, y: 12,
    w: 16, h: 16,
    phase: 0
  };

  // bullets
  let bullets = [];

  // state
  let running = false;
  let last = 0;
  let patternTimer = 0;
  let patternIndex = 0;

  // Input
  const keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (audioCtx.state === 'suspended') audioCtx.resume();
  });
  document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // Touch and mouse: move player by pointer
  let pointerDown = false;
  canvas.addEventListener('mousedown', e => { pointerDown = true; handlePointer(e); if (audioCtx.state==='suspended') audioCtx.resume(); });
  canvas.addEventListener('mousemove', e => { if (pointerDown) handlePointer(e); });
  window.addEventListener('mouseup', ()=> pointerDown = false);
  canvas.addEventListener('touchstart', e => { pointerDown = true; handlePointer(e.touches[0]); }, {passive:false});
  canvas.addEventListener('touchmove', e => { handlePointer(e.touches[0]); }, {passive:false});
  canvas.addEventListener('touchend', ()=> pointerDown=false, {passive:false});
  function handlePointer(ev){
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const cx = (ev.clientX - rect.left) * scaleX;
    const cy = (ev.clientY - rect.top) * scaleY;
    player.x = clamp(cx, player.w/2, W - player.w/2);
    player.y = clamp(cy, player.h/2 + 30, H - player.h/2);
  }

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // Pixel sprites: small arrays (colors as hex)
  // Player heart 6x6 (0 = transparent)
  const heartSprite = [
    [0,0,'#ff3366','#ff3366',0,0],
    [0,'#ff3366','#ff99aa','#ff99aa','#ff3366',0],
    ['#ff3366','#ff99aa','#ff99aa','#ff99aa','#ff99aa','#ff3366'],
    ['#ff3366','#ff99aa','#ff99aa','#ff99aa','#ff99aa','#ff3366'],
    [0,'#ff3366','#ff99aa','#ff99aa','#ff3366',0],
    [0,0,'#ff3366','#ff3366',0,0]
  ];

  // Enemy simple 16x16 (two-color)
  const enemySprite = (() => {
    const arr = [];
    for (let y=0;y<16;y++){
      const row = [];
      for (let x=0;x<16;x++){
        const inBody = (x>2 && x<13 && y>2 && y<13);
        row.push(inBody ? '#ffd166' : 0);
      }
      arr.push(row);
    }
    // add eyes
    arr[6][5] = '#222'; arr[6][10] = '#222';
    return arr;
  })();

  // draw pixel sprite at (cx,cy) centered. sprite is 2D array; scale=1 means one logical pixel.
  function drawSprite(sprite, cx, cy, scale=1){
    const h = sprite.length, w = sprite[0].length;
    const startX = Math.round(cx - w/2);
    const startY = Math.round(cy - h/2);
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const c = sprite[y][x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect((startX + x) | 0, (startY + y) | 0, Math.max(1, scale), Math.max(1, scale));
      }
    }
  }

  // Bullet constructor
  function spawnBullet(x,y,vx,vy,size=1,damage=1,color='#9bf6ff'){
    bullets.push({x,y,vx,vy,size,damage,color,life:999});
  }

  // Patterns: each pattern runs for some seconds, spawns bullets in different ways
  function spawnPattern(id, t){
    if (id === 0){
      // single slow homing-ish shots (easy)
      if (t % 20 === 0){
        const px = player.x, py = player.y;
        const ex = enemy.x + 8, ey = enemy.y + 12;
        const ang = Math.atan2(py - ey, px - ex) + (Math.random()-0.5)*0.4;
        spawnBullet(ex, ey, Math.cos(ang)*0.9, Math.sin(ang)*0.9, 1.2, 1, '#bde0fe');
      }
    } else if (id === 1){
      // dense rain from top (harder) — many small bullets downward
      if (t % 6 === 0){
        for (let i=-2;i<=2;i++){
          const sx = enemy.x + 8 + i*3 + (Math.random()-0.5)*6;
          spawnBullet(sx, enemy.y+10, (Math.random()-0.5)*0.3, 1.5 + Math.random()*0.6, 1, 1, '#ffd6a5');
        }
      }
    } else if (id === 2){
      // rotating circular burst (medium)
      const angBase = (t/30);
      if (t % 8 === 0){
        for (let k=0;k<8;k++){
          const a = angBase + (k * Math.PI * 2 / 8);
          spawnBullet(enemy.x+8, enemy.y+8, Math.cos(a)*1.6, Math.sin(a)*1.6, 1.4, 1, '#ffb4a2');
        }
      }
    } else if (id === 3){
      // focused stream aimed at player, but faster (very dangerous if close)
      if (t % 4 === 0){
        const ang = Math.atan2(player.y - (enemy.y+8), player.x - (enemy.x+8)) + (Math.random()-0.5)*0.15;
        spawnBullet(enemy.x+8, enemy.y+8, Math.cos(ang)*2.2, Math.sin(ang)*2.2, 1.6, 1, '#caffbf');
      }
    }
  }

  function stepPattern(dt){
    patternTimer += dt;
    // every 3.5 seconds change pattern
    if (patternTimer > 3.5){
      patternTimer = 0;
      patternIndex = (patternIndex + 1) % 4;
      msgEl.textContent = ['Easy','Rain','Burst','Focus'][patternIndex];
      sfx(880, 'sine', 0.08, 0.06);
    }
    // spawn bullets per frame time; use frame counter t
    spawnPattern(patternIndex, Math.floor(perf/16));
  }

  // Collision: bullets are points with size; player is a box centered at x,y of size player.w/player.h
  function update(dt){
    // control
    if (keys['arrowleft'] || keys['a']) player.x -= player.speed * dt;
    if (keys['arrowright'] || keys['d']) player.x += player.speed * dt;
    if (keys['arrowup'] || keys['w']) player.y -= player.speed * dt;
    if (keys['arrowdown'] || keys['s']) player.y += player.speed * dt;
    player.x = clamp(player.x, player.w/2, W - player.w/2);
    player.y = clamp(player.y, player.h/2 + 20, H - player.h/2);

    // bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life--;
      // remove if off screen
      if (b.x < -10 || b.x > W+10 || b.y < -10 || b.y > H+10 || b.life<=0){
        bullets.splice(i,1); continue;
      }
      // collision with player
      if (player.invuln <= 0){
        const px0 = player.x - player.w/2, px1 = player.x + player.w/2;
        const py0 = player.y - player.h/2, py1 = player.y + player.h/2;
        if (b.x > px0 && b.x < px1 && b.y > py0 && b.y < py1){
          // hit!
          player.hp -= b.damage;
          player.invuln = 12; // short invuln frames to prevent instant multiple frames? But we want sometimes to allow many hits:
          // To allow multiple hits when bullets are dense/overlapping, we set short invuln so close bullets may still hit on subsequent frames.
          sfx(220, 'sawtooth', 0.06, 0.12);
          // visual feedback: create small flash by tinting player for a few frames
          player.hitFlash = 6;
          // remove bullet on hit
          bullets.splice(i,1);
          if (player.hp <= 0){
            endBattle(false);
            return;
          }
        }
      }
    }

    if (player.invuln > 0) player.invuln -= dt;
    if (player.hitFlash > 0) player.hitFlash -= dt;
  }

  // render
  function draw(){
    // clear small canvas
    ctx.clearRect(0,0,W,H);
    // background grid
    ctx.fillStyle = '#041220';
    ctx.fillRect(0,0,W,H);

    // enemy
    drawSprite(enemySprite, enemy.x+8, enemy.y+8, 1);

    // bullets
    for (const b of bullets){
      ctx.fillStyle = b.color;
      // draw 1x1 or 2x2 pixels for visibility
      ctx.fillRect(Math.round(b.x), Math.round(b.y), Math.max(1, Math.round(b.size)), Math.max(1, Math.round(b.size)));
    }

    // player (heart) with possible flash
    if (player.hitFlash > 0) {
      // slightly larger white border when hit
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(player.x - player.w/2)-1, Math.round(player.y - player.h/2)-1, player.w+2, player.h+2);
    }
    drawSprite(heartSprite, player.x, player.y, 1);

    // UI overlay small
    ctx.fillStyle = '#ffffffaa';
    ctx.font = '8px monospace';
    ctx.fillText(`HP:${player.hp}`, 4, 10);
    ctx.fillText(`Pattern:${patternIndex}`, 4, 18);
  }

  // battle control
  let perf = 0;
  function loop(ts){
    if (!running) return;
    if (!last) last = ts;
    const dtMs = Math.min(40, ts - last);
    const dt = dtMs / 16.67; // normalized (1 ~= 60fps)
    last = ts;
    perf += dtMs;
    // update and spawn
    stepPattern(dtMs/1000);
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function startBattle(){
    // reset
    player.hp = 10;
    player.x = W/2; player.y = H - 30;
    player.invuln = 0; player.hitFlash = 0;
    bullets = [];
    patternTimer = 0; patternIndex = 0;
    msgEl.textContent = 'Battle!';
    hpEl.textContent = `HP: ${player.hp}`;
    running = true;
    last = 0;
    sfx(880, 'sine', 0.08, 0.06);
    requestAnimationFrame(loop);
    // small intro spawn
    spawnBullet(enemy.x+8, enemy.y+8, 0, 0.6, 1.2, 1, '#bde0fe');
  }

  function endBattle(win){
    running = false;
    msgEl.textContent = win ? 'Victory!' : 'Defeated';
    sfx(win?1000:150, 'triangle', 0.24, 0.1);
    // clear bullets
    bullets = [];
  }

  // external controls:
  startBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!running) startBattle();
    else { endBattle(true); } // stop
  });

  // update HP display periodically
  setInterval(()=> {
    hpEl.textContent = `HP: ${player.hp}`;
  }, 120);

  // keyboard serve: space to start
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      if (!running) startBattle();
      else endBattle(true);
      e.preventDefault();
    }
  });

  // initial draw
  draw();
})();
