
"use strict";

/* ========================================
   Ruu RPG - Game Engine
   ======================================== */

(() => {
  // ---------- HTML要素 ----------

  const $ = (id) => document.getElementById(id);

  const ui = {
    message: $("game-message"),

    level: $("player-level"),
    hp: $("player-hp"),
    maxHp: $("player-max-hp"),
    hpBar: $("player-hp-bar"),
    gold: $("player-gold"),
    exp: $("player-exp"),

    enemyIcon: $("enemy-icon"),
    enemyName: $("enemy-name"),
    enemyHp: $("enemy-hp"),
    enemyMaxHp: $("enemy-max-hp"),
    enemyHpBar: $("enemy-hp-bar"),

    battleLog: $("battle-log"),

    attack: $("attack-button"),
    heal: $("heal-button"),
    defend: $("defend-button"),

    shopGold: $("shop-gold"),
    buyPotion: $("buy-potion-button"),
    potionCount: $("potion-count"),

    gameOver: $("game-over-screen"),
    restart: $("restart-button")
  };

  // HTMLの不足によるエラーを早期に発見する
  for (const [name, element] of Object.entries(ui)) {
    if (!element) {
      console.error(`Ruu RPG: HTML要素が見つかりません: ${name}`);
      return;
    }
  }

  // ---------- ゲーム設定 ----------

  const CONFIG = {
    startingHp: 100,
    startingGold: 50,
    startingPotions: 1,

    potionPrice: 20,
    potionHeal: 35,

    basePlayerAttack: 12,
    baseEnemyAttack: 8,

    expPerLevel: 100,
    levelHpBonus: 20,
    levelAttackBonus: 3
  };

  const ENEMIES = [
    {
      name: "スライム",
      icon: "🟢",
      hp: 30,
      attack: 6,
      exp: 25,
      gold: 15
    },
    {
      name: "ゴブリン",
      icon: "👺",
      hp: 50,
      attack: 10,
      exp: 40,
      gold: 25
    },
    {
      name: "オオカミ",
      icon: "🐺",
      hp: 70,
      attack: 13,
      exp: 55,
      gold: 35
    },
    {
      name: "ドラゴン",
      icon: "🐉",
      hp: 120,
      attack: 18,
      exp: 100,
      gold: 60
    }
  ];

  // ---------- ゲーム状態 ----------

  const state = {
    started: false,
    gameOver: false,
    busy: false,
    defending: false,

    level: 1,
    hp: CONFIG.startingHp,
    maxHp: CONFIG.startingHp,
    attack: CONFIG.basePlayerAttack,

    exp: 0,
    gold: CONFIG.startingGold,
    potions: CONFIG.startingPotions,

    enemy: null,
    enemyIndex: 0,
    battleGold: 0,

    // 敵の攻撃タイマーを戦闘ごとに管理する
    enemyAttackTimer: null,
    battleId: 0
  };

  // ---------- 表示更新 ----------

  function render() {
    ui.level.textContent = state.level;
    ui.hp.textContent = state.hp;
    ui.maxHp.textContent = state.maxHp;
    ui.hpBar.max = state.maxHp;
    ui.hpBar.value = state.hp;

    ui.gold.textContent = state.gold;
    ui.shopGold.textContent = state.gold;
    ui.exp.textContent = state.exp;
    ui.potionCount.textContent = state.potions;

    if (state.enemy) {
      ui.enemyName.textContent = state.enemy.name;
      ui.enemyIcon.textContent = state.enemy.icon;
      ui.enemyHp.textContent = state.enemy.hp;
      ui.enemyMaxHp.textContent = state.enemy.maxHp;

      ui.enemyHpBar.max = state.enemy.maxHp;
      ui.enemyHpBar.value = state.enemy.hp;
    }

    const disabled =
      !state.started ||
      state.gameOver ||
      state.busy ||
      !state.enemy;

    ui.attack.disabled = disabled;
    ui.heal.disabled = disabled || state.potions <= 0;
    ui.defend.disabled = disabled;

    ui.buyPotion.disabled =
      !state.started ||
      state.gameOver ||
      state.gold < CONFIG.potionPrice;

    ui.gameOver.hidden = !state.gameOver;
  }

  // ---------- 戦闘ログ ----------

  function log(message) {
    const p = document.createElement("p");
    p.textContent = message;

    ui.battleLog.appendChild(p);

    // ログが増えすぎないようにする
    while (ui.battleLog.children.length > 8) {
      ui.battleLog.removeChild(ui.battleLog.firstElementChild);
    }

    ui.battleLog.scrollTop = ui.battleLog.scrollHeight;
  }

  function setMessage(message) {
    ui.message.textContent = message;
  }

  // ---------- タイマー管理 ----------

  function clearEnemyTimer() {
    if (state.enemyAttackTimer !== null) {
      clearTimeout(state.enemyAttackTimer);
      state.enemyAttackTimer = null;
    }
  }

  function resetBattleTimer() {
    clearEnemyTimer();
    state.battleId += 1;
  }

  // ---------- ゲーム開始 ----------

  function startGame() {
    if (state.started) return;

    state.started = true;
    setMessage("冒険が始まった！");
    render();

    startBattle(0);
  }

  // ---------- 戦闘開始 ----------

  function startBattle(index) {
    if (state.gameOver) return;

    resetBattleTimer();

    state.busy = false;
    state.defending = false;
    state.battleGold = 0;
    state.enemyIndex = index % ENEMIES.length;

    const template = ENEMIES[state.enemyIndex];

    const scale = Math.floor(index / ENEMIES.length);

    state.enemy = {
      name: scale > 0
        ? `${template.name} Lv.${scale + 1}`
        : template.name,

      icon: template.icon,
      maxHp: template.hp + scale * 20,
      hp: template.hp + scale * 20,
      attack: template.attack + scale * 2,
      exp: template.exp + scale * 10,
      gold: template.gold + scale * 5
    };

    ui.battleLog.replaceChildren();

    setMessage(`${state.enemy.name} が現れた！`);
    log(`${state.enemy.name} との戦闘開始！`);

    render();
    scheduleEnemyAttack();
  }

  // ---------- 敵の攻撃 ----------

  function scheduleEnemyAttack() {
    clearEnemyTimer();

    if (
      !state.started ||
      state.gameOver ||
      !state.enemy ||
      state.busy
    ) {
      return;
    }

    const currentBattleId = state.battleId;

    // 1.5秒後に敵が攻撃する
    state.enemyAttackTimer = setTimeout(() => {
      state.enemyAttackTimer = null;

      if (
        currentBattleId !== state.battleId ||
        state.gameOver ||
        !state.enemy ||
        state.busy
      ) {
        return;
      }

      enemyAttack();
    }, 1500);
  }

  function enemyAttack() {
    if (state.gameOver || !state.enemy || state.busy) {
      return;
    }

    let damage = state.enemy.attack;

    if (state.defending) {
      damage = Math.max(1, Math.floor(damage / 2));
      state.defending = false;
      log("防御成功！ ダメージを半減した！");
    }

    state.hp = Math.max(0, state.hp - damage);

    log(`${state.enemy.name} の攻撃！ ${damage} ダメージ！`);

    if (state.hp <= 0) {
      endGame();
      return;
    }

    render();
    scheduleEnemyAttack();
  }

  // ---------- プレイヤーの攻撃 ----------

  function playerAttack() {
    if (!canAct()) return;

    state.defending = false;

    const damage = state.attack + randomInt(0, 5);

    state.enemy.hp = Math.max(0, state.enemy.hp - damage);

    log(`あなたの攻撃！ ${damage} ダメージ！`);

    if (state.enemy.hp <= 0) {
      winBattle();
      return;
    }

    render();
  }

  // ---------- 回復 ----------

  function healPlayer() {
    if (!canAct() || state.potions <= 0) return;

    if (state.hp >= state.maxHp) {
      log("HPはすでに満タンだ！");
      return;
    }

    state.potions -= 1;

    const before = state.hp;
    state.hp = Math.min(
      state.maxHp,
      state.hp + CONFIG.potionHeal
    );

    log(`HPが ${state.hp - before} 回復した！`);

    render();
  }

  // ---------- 防御 ----------

  function defendPlayer() {
    if (!canAct()) return;

    state.defending = true;

    log("防御の構えをとった！ 次の敵の攻撃を半減する！");
    render();
  }

  function canAct() {
    return (
      state.started &&
      !state.gameOver &&
      !state.busy &&
      Boolean(state.enemy)
    );
  }

  // ---------- 戦闘勝利 ----------

  function winBattle() {
    if (!state.enemy || state.gameOver) return;

    resetBattleTimer();

    state.busy = true;
    state.defending = false;

    const defeatedEnemy = state.enemy;

    // 戦闘報酬を今回の戦闘分として計算する
    state.battleGold = defeatedEnemy.gold;

    state.gold += state.battleGold;
    state.exp += defeatedEnemy.exp;

    log(`${defeatedEnemy.name} を倒した！`);
    log(`${state.battleGold} G を獲得！`);
    log(`${defeatedEnemy.exp} EXP を獲得！`);

    levelUpIfNeeded();

    state.enemy = null;

    setMessage("勝利！ 次の敵が待っている……");
    render();

    const completedBattleId = state.battleId;

    state.enemyAttackTimer = setTimeout(() => {
      state.enemyAttackTimer = null;

      if (
        completedBattleId !== state.battleId ||
        state.gameOver
      ) {
        return;
      }

      startBattle(state.enemyIndex + 1);
    }, 1200);
  }

  // ---------- レベルアップ ----------

  function levelUpIfNeeded() {
    while (state.exp >= CONFIG.expPerLevel) {
      state.exp -= CONFIG.expPerLevel;
      state.level += 1;

      state.maxHp += CONFIG.levelHpBonus;
      state.hp = state.maxHp;
      state.attack += CONFIG.levelAttackBonus;

      log(`レベルアップ！ Lv.${state.level} になった！`);
      log("最大HP・攻撃力が上がり、HPが全回復！");
    }
  }

  // ---------- ショップ ----------

  function buyPotion() {
    if (
      !state.started ||
      state.gameOver ||
      state.gold < CONFIG.potionPrice
    ) {
      return;
    }

    state.gold -= CONFIG.potionPrice;
    state.potions += 1;

    log("回復アイテムを購入した！");
    setMessage("ショップでアイテムを購入した。");

    render();
  }

  // ---------- ゲームオーバー ----------

  function endGame() {
    resetBattleTimer();

    state.gameOver = true;
    state.busy = false;
    state.defending = false;

    setMessage("ゲームオーバー");
    log("HPがなくなった…… 冒険は終了した。");

    render();
  }

  // ---------- リスタート ----------

  function restartGame() {
    resetBattleTimer();

    state.started = true;
    state.gameOver = false;
    state.busy = false;
    state.defending = false;

    state.level = 1;
    state.hp = CONFIG.startingHp;
    state.maxHp = CONFIG.startingHp;
    state.attack = CONFIG.basePlayerAttack;

    state.exp = 0;
    state.gold = CONFIG.startingGold;
    state.potions = CONFIG.startingPotions;

    state.enemy = null;
    state.enemyIndex = 0;
    state.battleGold = 0;

    startBattle(0);
  }

  // ---------- 共通処理 ----------

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ---------- イベント登録 ----------

  ui.attack.addEventListener("click", playerAttack);
  ui.heal.addEventListener("click", healPlayer);
  ui.defend.addEventListener("click", defendPlayer);
  ui.buyPotion.addEventListener("click", buyPotion);
  ui.restart.addEventListener("click", restartGame);

  // index.html のタイトル画面から開始する
  // rpg.html を直接開いた場合も Space キーで開始できる
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;

    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (
        target.isContentEditable ||
        ["BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
    ) {
      return;
    }

    event.preventDefault();

    if (!state.started && !state.gameOver) {
      startGame();
    }
  });

  // ---------- 初期化 ----------

  state.started = false;
  state.enemy = {
    name: ENEMIES[0].name,
    icon: ENEMIES[0].icon,
    hp: ENEMIES[0].hp,
    maxHp: ENEMIES[0].hp,
    attack: ENEMIES[0].attack,
    exp: ENEMIES[0].exp,
    gold: ENEMIES[0].gold
  };

  setMessage("Spaceキーを押して冒険を始めよう！");
  log("準備ができたら Space キーを押そう！");

  render();
})();
