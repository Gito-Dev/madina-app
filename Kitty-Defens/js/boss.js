/* ============================================================
   Kitty Defense — BOSS BATTLE (standalone mini-game)
   A single arena fight on a 3-lane haunted map against the Mega
   Boss. Place defenders, survive its shots & summoned minions,
   and drain its big health bar to zero. Self-contained: own win/
   lose screen, does not touch the normal rounds engine.
   ============================================================ */
(() => {
  "use strict";

  const ROWS = 3;          // three stone lanes on the boss map
  const COLS = 9;
  const A = "../assets/";
  const B = A + "Boss-ryuk/";
  const SPEED = 1.5;

  // ---------- Defenders (same roster as the main game) ----------
  const DEFENDERS = {
    sunflower: {
      name: "Rose Bud", cost: 50, hp: 200, img: A + "characters/sunflower.gif",
      kind: "producer", interval: 5200, produce: 25, cooldown: 4000,
    },
    kitty: {
      name: "Kitty Mage", cost: 100, hp: 180, img: A + "characters/hellokitty.gif",
      kind: "shooter", interval: 1400, damage: 34, projSpeed: 0.95, cooldown: 5000,
      proj: A + "effects/hello-kitty-shoot.gif",
    },
    canon: {
      name: "Cannon", cost: 175, hp: 300, img: A + "characters/canon.gif",
      kind: "shooter", interval: 2400, damage: 110, projSpeed: 0.75, cooldown: 9000,
      proj: A + "effects/canon-ball.gif", arc: true, arcVy: -34, arcG: 70,
    },
    soldier: {
      name: "Soldier Cat", cost: 200, hp: 220, img: A + "characters/soldier-cat-charachter.gif",
      kind: "shooter", interval: 700, damage: 38, projSpeed: 1.15, cooldown: 7000,
      proj: A + "effects/solider-cat-attack.gif", // rapid-fire rifle
    },
    wall: {
      name: "Kitty Wall", cost: 75, hp: 1500, img: A + "characters/wall.gif",
      kind: "wall", cooldown: 8000,
    },
  };

  // ---------- Minions the boss summons ----------
  const MINIONS = {
    fox:  { name: "Fox",  hp: 60,  speed: 0.045, dps: 22, reward: 15, score: 10, img: A + "characters/fox.gif" },
    bear: { name: "Bear", hp: 170, speed: 0.028, dps: 34, reward: 30, score: 25, img: A + "characters/bear.gif" },
  };

  // ---------- The Mega Boss ----------
  const MEGA = {
    name: "Ryuk — God of Death", hp: 5000, speed: 0.008, dps: 170, reward: 800, score: 1500,
    img: B + "mega-boss.gif", boss: true, mega: true,
    shootInterval: 2600, shootDamage: 58, projSpeed: 0.5, proj: B + "boss-shoot.gif",
    summonInterval: 6500, laneSwapMs: 3600, death: B + "mega-boss-death-effect.gif",
  };

  // ---------- Icons (inline SVG) ----------
  const ICON_STAR =
    '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path fill="#ffce3d" stroke="#e0a400" stroke-width="1.3" stroke-linejoin="round" d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9 6.2 20.9l1.1-6.45-4.7-4.6 6.5-.95z"/></svg>';
  const ICON_HEART =
    '<svg class="ic heart" viewBox="0 0 24 24" width="15" height="15"><path fill="#ff5b86" stroke="#e23e7a" stroke-width="1.2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>';
  const ICON_SHOVEL =
    '<svg class="ic" viewBox="0 0 24 24" width="22" height="22"><path fill="#d98cae" stroke="#b5305f" stroke-width="1.2" stroke-linejoin="round" d="M13 3l8 8-2.5 2.5-3-3-6 6 .5 3-2 2-3.5-3.5 2-2 3-.5 6-6-3-3z"/></svg>';

  // ---------- Boss taunts ----------
  const TAUNTS = [
    "Your kingdom is mine, Madina!",
    "Bow before me, Madina!",
    "Darkness comes for you, Madina!",
    "You cannot stop me, Madina!",
    "Despair, Madina!",
  ];

  // ---------- DOM ----------
  const field = document.getElementById("field");
  const grid = document.getElementById("grid");
  const layer = document.getElementById("layer");
  const ghost = document.getElementById("ghost");
  const ghostImg = ghost.querySelector("img");
  const starsEl = document.getElementById("stars");
  const scoreEl = document.getElementById("score");
  const banner = document.getElementById("banner");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const shop = document.getElementById("shop");

  // ---------- State ----------
  const state = {
    stars: 425,
    castleHp: 250,
    castleMaxHp: 250,
    score: 0,
    selected: null,
    upg: { damage: 0, health: 0, income: 0 },
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    defenders: [],
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    stars3d: [],
    skyTimer: 5,
    running: false,
    paused: false,
    over: false,
    cooldowns: {},
    boss: null,
    bossSpawned: false,
    bossCountdown: 0,
  };

  // ---------- Build grid ----------
  grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", () => onCellClick(r, c));
      grid.appendChild(cell);
    }
  }

  // ---------- Geometry ----------
  const xToLeft = (x) => x * 100;
  const rowToTop = (row) => ((row + 0.5) / ROWS) * 100;
  const colCenterX = (col) => (col + 0.5) / COLS;

  // ---------- Upgrades (bought with stars during the fight) ----------
  const UPG = window.KD_UPGRADES || {};
  const upM = (key) => (UPG[key] ? UPG[key].mult(state.upg[key] || 0) : 1);

  // ---------- Shop ----------
  function freezeImg(imgEl, src) {
    const im = new Image();
    im.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = im.naturalWidth || 80;
        cv.height = im.naturalHeight || 80;
        cv.getContext("2d").drawImage(im, 0, 0);
        imgEl.src = cv.toDataURL("image/png");
      } catch (e) { /* tainted canvas (file://): keep gif */ }
    };
    im.src = src;
  }

  function buildShop() {
    Object.entries(DEFENDERS).forEach(([key, d]) => {
      const card = document.createElement("div");
      card.className = "shop-card";
      card.dataset.key = key;
      card.innerHTML =
        `<img src="${d.img}" alt="${d.name}" />` +
        `<div class="name">${d.name}</div>` +
        `<div class="cost">${ICON_STAR} ${d.cost}</div>` +
        `<div class="cd"></div>`;
      freezeImg(card.querySelector("img"), d.img);
      card.addEventListener("click", () => selectDefender(key));
      shop.appendChild(card);
    });
    const tool = document.createElement("div");
    tool.className = "shop-card tool";
    tool.dataset.key = "shovel";
    tool.innerHTML = `<div>${ICON_SHOVEL}</div><div class="name">Remove</div>`;
    tool.addEventListener("click", () => selectShovel());
    shop.appendChild(tool);
  }

  function selectDefender(key) {
    if (state.over) return;
    const d = DEFENDERS[key];
    if (state.cooldowns[key] > 0) return;
    if (state.stars < d.cost) { flashCard(key); return; }
    state.selected = state.selected === key ? null : key;
    refreshSelection();
  }

  function selectShovel() {
    if (state.over) return;
    state.selected = state.selected === "shovel" ? null : "shovel";
    refreshSelection();
  }

  function refreshSelection() {
    [...shop.children].forEach((c) =>
      c.classList.toggle("selected", c.dataset.key === state.selected)
    );
    field.classList.toggle("placing", !!state.selected && state.selected !== "shovel");
    field.classList.toggle("removing", state.selected === "shovel");
    if (state.selected && state.selected !== "shovel") {
      ghostImg.src = DEFENDERS[state.selected].img;
    } else {
      ghost.style.display = "none";
    }
  }

  function flashCard(key) {
    const card = [...shop.children].find((c) => c.dataset.key === key);
    if (!card) return;
    card.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" },
       { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 220 }
    );
  }

  // ---------- Upgrade panel ----------
  function buildUpgradePanel() {
    const list = document.getElementById("upgList");
    if (!list) return;
    list.innerHTML = "";
    Object.keys(UPG).forEach((key) => {
      const u = UPG[key];
      const lvl = state.upg[key] || 0;
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      const afford = state.stars >= cost;
      let pips = "";
      for (let i = 0; i < u.max; i++) pips += `<span class="pip${i < lvl ? " on" : ""}"></span>`;
      const row = document.createElement("div");
      row.className = "upg-row";
      row.innerHTML =
        `<div class="upg-icon">${u.icon}</div>` +
        `<div class="upg-info">` +
          `<div class="upg-name">${u.name} <span class="upg-lvl">Lv ${lvl}/${u.max}</span></div>` +
          `<div class="upg-desc">${u.desc(lvl)}</div>` +
          `<div class="upg-pips">${pips}</div>` +
        `</div>` +
        `<button class="upg-buy" data-key="${key}"${(maxed || !afford) ? " disabled" : ""}>` +
          (maxed ? "MAX" : `${ICON_STAR} ${cost}`) +
        `</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll(".upg-buy").forEach((b) =>
      b.addEventListener("click", () => buyUpgrade(b.dataset.key))
    );
  }

  function buyUpgrade(key) {
    const u = UPG[key];
    if (!u) return;
    const lvl = state.upg[key] || 0;
    if (lvl >= u.max) return;
    const cost = u.cost(lvl);
    if (state.stars < cost) return;
    spendStars(cost);
    state.upg[key] = lvl + 1;
    recomputeDefenders();
    buildUpgradePanel();
  }

  function recomputeDefenders() {
    state.defenders.forEach((def) => {
      def.damage = Math.round((def.cfg.damage || 0) * upM("damage"));
      def.produce = Math.round((def.cfg.produce || 0) * upM("income"));
      const newMax = Math.round(def.cfg.hp * upM("health"));
      const ratio = def.maxHp ? def.hp / def.maxHp : 1;
      def.maxHp = newMax;
      def.hp = Math.min(newMax, Math.round(newMax * ratio));
      if (def.bar) def.bar.style.width = (def.hp / def.maxHp) * 100 + "%";
    });
  }

  function toggleUpgrades() {
    if (state.over) return;
    const ov = document.getElementById("upgOverlay");
    if (!ov) return;
    const opening = !ov.classList.contains("show");
    ov.classList.toggle("show", opening);
    if (opening) {
      state.upgPaused = state.paused;
      state.paused = true;
      buildUpgradePanel();
    } else {
      state.paused = state.upgPaused || false;
    }
  }

  // ---------- Placement ----------
  function onCellClick(r, c) {
    if (state.over) return;
    if (state.selected === "shovel") {
      const d = state.grid[r][c];
      if (d) removeDefender(d);
      return;
    }
    if (!state.selected) return;
    if (state.grid[r][c]) return;
    const key = state.selected;
    const cfg = DEFENDERS[key];
    if (state.stars < cfg.cost) { flashCard(key); return; }
    spendStars(cfg.cost);
    placeDefender(key, r, c);
    startCooldown(key, cfg.cooldown);
    if (state.stars < cfg.cost) state.selected = null;
    refreshSelection();
  }

  let defUid = 0;
  function placeDefender(key, r, c) {
    const cfg = DEFENDERS[key];
    const el = document.createElement("div");
    el.className = "entity defender def-" + key;
    el.style.left = xToLeft(colCenterX(c)) + "%";
    el.style.top = rowToTop(r) + "%";
    const imgSrc = cfg.kind === "producer" ? cfg.img + "?i=" + (++defUid) : cfg.img;
    el.innerHTML = `<img src="${imgSrc}" alt="${cfg.name}" />` +
                   `<div class="hpbar"><i></i></div>`;
    layer.appendChild(el);
    const maxHp = Math.round(cfg.hp * upM("health"));
    const def = {
      key, cfg, row: r, col: c, x: colCenterX(c),
      hp: maxHp, maxHp, el,
      damage: Math.round((cfg.damage || 0) * upM("damage")),
      produce: Math.round((cfg.produce || 0) * upM("income")),
      bar: el.querySelector(".hpbar > i"),
      img: el.querySelector("img"),
      animated: true,
      timer: cfg.kind === "producer" ? cfg.interval * 0.5 : 0,
    };
    state.grid[r][c] = def;
    state.defenders.push(def);
    if (cfg.kind === "shooter") setDefenderAnimated(def, false);
    el.animate([{ transform: "translate(-50%,-50%) scale(0)" },
                { transform: "translate(-50%,-50%) scale(1.15)" },
                { transform: "translate(-50%,-50%) scale(1)" }],
               { duration: 260, easing: "ease-out" });
  }

  function removeDefender(def) {
    state.grid[def.row][def.col] = null;
    const i = state.defenders.indexOf(def);
    if (i >= 0) state.defenders.splice(i, 1);
    def.el.remove();
  }

  // ---------- Static-frame freeze for idle shooters ----------
  const staticFrames = {};
  function captureStatic(key, src) {
    const im = new Image();
    im.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = im.naturalWidth || 80;
        cv.height = im.naturalHeight || 80;
        cv.getContext("2d").drawImage(im, 0, 0);
        staticFrames[key] = cv.toDataURL("image/png");
        state.defenders.forEach((d) => {
          if (d.key === key && !d.animated && d.img) d.img.src = staticFrames[key];
        });
      } catch (e) { /* tainted canvas (file://): keep gif animated */ }
    };
    im.src = src;
  }

  function setDefenderAnimated(def, on) {
    if (def.cfg.kind === "producer") return;
    if (def.animated === on) return;
    def.animated = on;
    if (on) def.img.src = def.cfg.img;
    else if (staticFrames[def.key]) def.img.src = staticFrames[def.key];
  }

  function startCooldown(key, ms) {
    state.cooldowns[key] = ms / 1000;
    const card = [...shop.children].find((c) => c.dataset.key === key);
    if (card) card.classList.add("cooling");
  }

  // ---------- Currency / HUD ----------
  function spendStars(n) { state.stars -= n; updateHud(); }
  function addStars(n) { state.stars += n; updateHud(); }

  function updateHud() {
    starsEl.textContent = state.stars;
    scoreEl.textContent = state.score;
    [...shop.children].forEach((c) => {
      const key = c.dataset.key;
      if (key === "shovel") return;
      const cfg = DEFENDERS[key];
      c.classList.toggle("disabled", state.stars < cfg.cost || state.cooldowns[key] > 0);
    });
  }

  // ---------- Collectible stars ----------
  function spawnStar(xFrac, yFrac, amount, fall) {
    const el = document.createElement("div");
    el.className = "star";
    el.innerHTML = `<img src="${A}effects/star.gif" alt="star" />`;
    el.style.left = xFrac * 100 + "%";
    el.style.top = yFrac * 100 + "%";
    field.appendChild(el);
    const s = { el, amount, x: xFrac, y: yFrac,
                targetY: fall ? Math.min(0.92, yFrac + 0.25 + Math.random() * 0.2) : yFrac,
                life: 9 };
    el.addEventListener("click", () => collectStar(s));
    state.stars3d.push(s);
  }

  function collectStar(s) {
    if (s.collected) return;
    s.collected = true;
    addStars(s.amount);
    floatText("+" + s.amount, s.x, s.y, "#ffd36e");
    s.el.remove();
    const i = state.stars3d.indexOf(s);
    if (i >= 0) state.stars3d.splice(i, 1);
  }

  function floatText(txt, xFrac, yFrac, color) {
    const el = document.createElement("div");
    el.className = "floattext";
    el.textContent = txt;
    if (color) el.style.color = color;
    el.style.left = xFrac * 100 + "%";
    el.style.top = yFrac * 100 + "%";
    field.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ---------- Defender projectiles ----------
  function fireProjectile(def) {
    const el = document.createElement("div");
    el.className = "entity projectile" + (def.cfg.arc ? " ball" : "");
    const baseTop = rowToTop(def.row) - 2;
    el.style.left = xToLeft(def.x + 0.03) + "%";
    el.style.top = baseTop + "%";
    el.innerHTML = `<img src="${def.cfg.proj || A + "effects/hello-kitty-shoot.gif"}" alt="shot" />`;
    layer.appendChild(el);
    state.projectiles.push({
      x: def.x + 0.03, row: def.row, speed: def.cfg.projSpeed,
      damage: def.damage, el,
      arc: !!def.cfg.arc, baseTop, yOff: 0,
      vy: def.cfg.arc ? def.cfg.arcVy : 0,
      g: def.cfg.arc ? def.cfg.arcG : 0,
    });
  }

  // ---------- Enemies ----------
  function spawnEnemy(cfg, row, startX) {
    const x0 = (typeof startX === "number") ? startX : 1.04;
    const el = document.createElement("div");
    el.className = "entity enemy" + (cfg.boss ? " boss" : "") + (cfg.mega ? " mega" : "");
    el.style.left = xToLeft(x0) + "%";
    el.style.top = rowToTop(row) + "%";
    el.innerHTML = `<img src="${cfg.img}" alt="${cfg.name}" />` +
                   `<div class="hpbar"><i></i></div>`;
    layer.appendChild(el);
    const en = {
      cfg, row, x: x0, hp: cfg.hp, maxHp: cfg.hp,
      el, bar: el.querySelector(".hpbar > i"), mega: !!cfg.mega,
    };
    if (cfg.mega) {
      en.shootTimer = cfg.shootInterval;
      en.summonTimer = cfg.summonInterval;
      en.topRow = row;        // smooth vertical position (fractional lane)
      en.targetRow = row;     // lane it is drifting toward
      en.laneDir = 1;
      en.laneTimer = cfg.laneSwapMs;
      el.animate([{ transform: "translate(-50%,-50%) scale(0)", opacity: 0 },
                  { transform: "translate(-50%,-50%) scale(1.12)", opacity: 1 },
                  { transform: "translate(-50%,-50%) scale(1)" }],
                 { duration: 600, easing: "ease-out" });
    }
    state.enemies.push(en);
    if (cfg.mega) { showBossBar(en); state.boss = en; state.bossSpawned = true; }
    maybeTaunt(el, cfg.boss);
    return en;
  }

  function maybeTaunt(el, isBoss) {
    if (!isBoss && Math.random() > 0.4) return;
    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
    el.appendChild(b);
    setTimeout(() => {
      b.classList.add("hide");
      setTimeout(() => b.remove(), 400);
    }, 3200);
  }

  function damageEnemy(en, dmg) {
    en.hp -= dmg;
    en.bar.style.width = Math.max(0, (en.hp / en.maxHp) * 100) + "%";
    en.el.firstElementChild.classList.add("hit-flash");
    setTimeout(() => en.el.firstElementChild.classList.remove("hit-flash"), 150);
    if (en.hp <= 0) killEnemy(en);
  }

  function killEnemy(en) {
    if (en.dead) return;
    state.score += en.cfg.score;
    addStars(Math.round(en.cfg.reward * 0.4));
    floatText("+" + Math.round(en.cfg.reward * 0.4), en.x, rowToTop(en.row) / 100, "#fff");
    en.dead = true;
    const i = state.enemies.indexOf(en);
    if (i >= 0) state.enemies.splice(i, 1);
    if (en.mega) {
      spawnDeathEffect(en);
      hideBossBar();
      state.boss = null;
      en.el.remove();
      // the boss falling clears its surviving minions
      for (let k = state.enemies.length - 1; k >= 0; k--) {
        state.enemies[k].el.remove();
        state.enemies.splice(k, 1);
      }
      setTimeout(() => endFight(true), 1400);
    } else {
      spawnMinionDeath(en);
      en.el.style.transition = "opacity .3s, transform .3s";
      en.el.style.opacity = "0";
      en.el.style.transform = "translate(-50%,-50%) scale(.4) rotate(20deg)";
      setTimeout(() => en.el.remove(), 300);
    }
    updateHud();
  }

  // ---------- Mega-boss helpers ----------
  let bossBarEl = null, bossBarFill = null, bossBarName = null;
  function ensureBossBar() {
    if (bossBarEl) return;
    bossBarEl = document.createElement("div");
    bossBarEl.className = "boss-bar";
    bossBarEl.innerHTML =
      '<div class="boss-bar-name"></div>' +
      '<div class="boss-bar-track"><i></i></div>';
    document.body.appendChild(bossBarEl);
    bossBarFill = bossBarEl.querySelector("i");
    bossBarName = bossBarEl.querySelector(".boss-bar-name");
  }
  function showBossBar(en) {
    ensureBossBar();
    bossBarName.textContent = en.cfg.name;
    bossBarFill.style.width = "100%";
    bossBarEl.classList.add("show");
  }
  function hideBossBar() {
    if (bossBarEl) bossBarEl.classList.remove("show");
  }

  function fireEnemyProjectile(boss) {
    // target priority: lanes with a wall/flower first, then any defender,
    // and only if nothing is defending does the shot fly on to the castle.
    const wallFlowerRows = [], anyDefRows = [];
    for (let r = 0; r < ROWS; r++) {
      let hasWF = false, hasAny = false;
      for (let c = 0; c < COLS; c++) {
        const d = state.grid[r][c];
        if (!d) continue;
        hasAny = true;
        if (d.cfg.kind === "wall" || d.cfg.kind === "producer") hasWF = true;
      }
      if (hasWF) wallFlowerRows.push(r);
      if (hasAny) anyDefRows.push(r);
    }
    const pool = wallFlowerRows.length ? wallFlowerRows
               : (anyDefRows.length ? anyDefRows : null);
    const row = pool ? pool[Math.floor(Math.random() * pool.length)]
                     : Math.floor(Math.random() * ROWS);
    const x = boss.x - 0.05;
    const el = document.createElement("div");
    el.className = "entity enemy-proj";
    el.style.left = xToLeft(x) + "%";
    el.style.top = rowToTop(row) + "%";
    el.innerHTML = `<img src="${boss.cfg.proj}" alt="" />`;
    layer.appendChild(el);
    state.enemyProjectiles.push({
      x, row, speed: boss.cfg.projSpeed, damage: boss.cfg.shootDamage, el,
    });
  }

  function summonMinions(boss) {
    const count = 1 + Math.floor(Math.random() * 2); // 1–2
    for (let k = 0; k < count; k++) {
      let row = boss.row + (k === 0 ? 0 : (Math.random() < 0.5 ? -1 : 1));
      row = Math.max(0, Math.min(ROWS - 1, row));
      const cfg = Math.random() < 0.7 ? MINIONS.fox : MINIONS.bear;
      spawnEnemy(cfg, row, Math.max(0.5, boss.x - 0.04));
    }
    floatText("Minions!", boss.x, rowToTop(boss.row) / 100 - 0.08, "#c77dff");
  }

  function spawnDeathEffect(en) {
    const el = document.createElement("div");
    el.className = "entity death-fx";
    el.style.left = en.el.style.left;
    el.style.top = en.el.style.top;
    el.innerHTML = `<img src="${en.cfg.death}" alt="" />`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // burst shown when a normal minion (fox/bear) dies
  function spawnMinionDeath(en) {
    const el = document.createElement("div");
    el.className = "entity minion-death";
    el.style.left = en.el.style.left;
    el.style.top = en.el.style.top;
    el.innerHTML = `<img src="${A}effects/minion-death-efect.gif" alt="" />`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  // ---------- Banner ----------
  function showBanner(text, warn) {
    banner.textContent = text;
    banner.classList.toggle("warning", !!warn);
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
  }

  // ---------- Fight flow ----------
  function startGame() {
    if (state.running || state.over) return;
    state.running = true;
    startBtn.style.display = "none";
    state.bossCountdown = 5; // prep time before the boss enters
    showBanner("⚠ MEGA BOSS INCOMING! ⚠", true);
  }

  function endFight(won) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    let best = 0;
    try {
      best = parseInt(localStorage.getItem("kd_boss_best") || "0", 10);
      if (state.score > best) { best = state.score; localStorage.setItem("kd_boss_best", String(best)); }
    } catch (e) {}
    const ov = document.getElementById("bossResult");
    document.getElementById("brEmoji").textContent = won ? "👑" : "💀";
    document.getElementById("brTitle").textContent = won ? "Boss Defeated!" : "The Castle Fell";
    document.getElementById("brSub").innerHTML = won
      ? `You banished the Mega Boss, Madina!<br>Score ${state.score} &middot; Best ${best}`
      : `The Mega Boss overran the castle.<br>Score ${state.score} &middot; Best ${best}`;
    if (ov) ov.classList.add("show");
    showBanner(won ? "Victory!" : "Defeat", !won);
  }

  // ---------- Castle integrity ----------
  let castleBarEl = null, castleBarFill = null;
  function ensureCastleBar() {
    if (castleBarEl) return;
    castleBarEl = document.createElement("div");
    castleBarEl.className = "castle-bar";
    castleBarEl.innerHTML =
      '<div class="castle-bar-label">\u{1F3F0} CASTLE</div>' +
      '<div class="castle-bar-track"><i></i></div>';
    document.body.appendChild(castleBarEl);
    castleBarFill = castleBarEl.querySelector("i");
    updateCastleBar();
  }
  function updateCastleBar() {
    if (!castleBarFill) return;
    const pct = Math.max(0, (state.castleHp / state.castleMaxHp) * 100);
    castleBarFill.style.width = pct + "%";
    castleBarEl.classList.toggle("low", pct <= 30);
  }
  function damageCastle(dmg, flash) {
    if (state.over) return;
    state.castleHp = Math.max(0, state.castleHp - dmg);
    updateCastleBar();
    if (flash) {
      field.animate([{ filter: "brightness(1)" },
                     { filter: "brightness(1.5) hue-rotate(-20deg)" },
                     { filter: "brightness(1)" }], { duration: 250 });
    }
    if (state.castleHp <= 0) endFight(false);
  }

  function togglePause() {
    if (!state.running || state.over) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle("show", state.paused);
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * SPEED;
    last = now;
    if (state.running && !state.paused && !state.over) update(dt);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // cooldowns
    for (const key in state.cooldowns) {
      if (state.cooldowns[key] > 0) {
        state.cooldowns[key] -= dt;
        if (state.cooldowns[key] <= 0) {
          state.cooldowns[key] = 0;
          const card = [...shop.children].find((c) => c.dataset.key === key);
          if (card) card.classList.remove("cooling");
        }
      }
    }

    // boss entrance
    if (!state.bossSpawned) {
      state.bossCountdown -= dt;
      if (state.bossCountdown <= 0) {
        spawnEnemy(MEGA, Math.floor(ROWS / 2), 1.04);
        showBanner(MEGA.name + "!", true);
      }
    }

    // free sky stars
    state.skyTimer -= dt;
    if (state.skyTimer <= 0) {
      state.skyTimer = 8 + Math.random() * 4;
      spawnStar(0.2 + Math.random() * 0.6, 0.05, 25, true);
    }

    // defenders
    for (const def of state.defenders) {
      def.bar.style.width = (def.hp / def.maxHp) * 100 + "%";
      if (def.cfg.kind === "producer") {
        def.timer += dt * 1000;
        if (def.timer >= def.cfg.interval) {
          def.timer = 0;
          spawnStar(def.x, rowToTop(def.row) / 100, def.produce, true);
        }
      } else if (def.cfg.kind === "shooter") {
        // fire at lane enemies — and at the boss from ANY lane (it's huge)
        const hasTarget = state.enemies.some((e) =>
          !e.dead && (e.mega || e.row === def.row) && e.x > def.x - 0.02);
        setDefenderAnimated(def, hasTarget);
        def.timer += dt * 1000;
        if (hasTarget && def.timer >= def.cfg.interval) {
          def.timer = 0;
          fireProjectile(def);
        }
      }
    }

    // defender projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.x += p.speed * dt;
      if (p.arc) { p.yOff += p.vy * dt; p.vy += p.g * dt; }
      let hit = false;
      for (const e of state.enemies) {
        if (e.dead) continue;
        const inRow = e.mega || e.row === p.row;       // the boss spans every lane
        const radius = e.mega ? 0.08 : 0.04;
        if (inRow && Math.abs(e.x - p.x) < radius) {
          damageEnemy(e, p.damage);
          hit = true;
          break;
        }
      }
      if (hit || p.x > 1.1) {
        p.el.remove();
        state.projectiles.splice(i, 1);
      } else {
        p.el.style.left = xToLeft(p.x) + "%";
        if (p.arc) p.el.style.top = (p.baseTop + p.yOff) + "%";
      }
    }

    // enemy projectiles (boss shots travel left toward defenders)
    for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = state.enemyProjectiles[i];
      p.x -= p.speed * dt;
      let done = false;
      const col = Math.floor(p.x * COLS);
      const def = (col >= 0 && col < COLS) ? state.grid[p.row][col] : null;
      if (def) {
        def.hp -= p.damage;
        if (def.img) {
          def.img.classList.add("hit-flash");
          setTimeout(() => def.img && def.img.classList.remove("hit-flash"), 150);
        }
        if (def.hp <= 0) removeDefender(def);
        done = true;
      } else if (p.x <= 0.01) {
        damageCastle(p.damage, true); // shot reached the far-left castle
        done = true;
      }
      if (done) {
        p.el.remove();
        state.enemyProjectiles.splice(i, 1);
      } else {
        p.el.style.left = xToLeft(p.x) + "%";
      }
    }

    // enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.dead) continue;

      if (e.mega) {
        e.shootTimer -= dt * 1000;
        if (e.shootTimer <= 0) { e.shootTimer = e.cfg.shootInterval; fireEnemyProjectile(e); }
        e.summonTimer -= dt * 1000;
        if (e.summonTimer <= 0) { e.summonTimer = e.cfg.summonInterval; summonMinions(e); }
        // drift slowly up and down across all lanes
        e.laneTimer -= dt * 1000;
        if (e.laneTimer <= 0) {
          e.laneTimer = e.cfg.laneSwapMs;
          let next = e.targetRow + e.laneDir;
          if (next < 0 || next > ROWS - 1) { e.laneDir *= -1; next = e.targetRow + e.laneDir; }
          e.targetRow = next;
        }
        const vstep = 0.7 * dt; // lanes per second
        if (e.topRow < e.targetRow) e.topRow = Math.min(e.targetRow, e.topRow + vstep);
        else if (e.topRow > e.targetRow) e.topRow = Math.max(e.targetRow, e.topRow - vstep);
        e.row = Math.round(e.topRow);
        e.el.style.top = rowToTop(e.topRow) + "%";
      }

      const col = Math.floor(e.x * COLS);
      const def = (col >= 0 && col < COLS) ? state.grid[e.row][col] : null;
      if (def) {
        def.hp -= e.cfg.dps * dt;
        if (def.hp <= 0) removeDefender(def);
      } else if (e.mega && e.x <= 0.06) {
        // the boss has broken through — it batters the castle gate
        damageCastle(e.cfg.dps * dt);
      } else {
        e.x -= e.cfg.speed * dt;
      }

      // minions that slip past the defenders strike the castle directly
      if (!e.mega && e.x <= 0.02) {
        damageCastle(e.cfg === MINIONS.bear ? 18 : 10, true);
        e.dead = true; e.el.remove(); state.enemies.splice(i, 1);
        continue;
      }
      e.el.style.left = xToLeft(e.x) + "%";
    }

    // boss health bar
    if (state.boss && !state.boss.dead && bossBarFill) {
      bossBarFill.style.width = Math.max(0, (state.boss.hp / state.boss.maxHp) * 100) + "%";
    }

    // collectible stars
    for (let i = state.stars3d.length - 1; i >= 0; i--) {
      const s = state.stars3d[i];
      if (s.y < s.targetY) {
        s.y = Math.min(s.targetY, s.y + 0.5 * dt);
        s.el.style.top = s.y * 100 + "%";
      }
      s.life -= dt;
      if (s.life < 2) s.el.style.opacity = String(Math.max(0.2, s.life / 2));
      if (s.life <= 0) {
        s.el.remove();
        state.stars3d.splice(i, 1);
      }
    }

    updateHud();
  }

  // ---------- Pointer ghost ----------
  document.addEventListener("mousemove", (ev) => {
    if (state.selected && state.selected !== "shovel") {
      ghost.style.display = "block";
      ghost.style.left = ev.clientX + "px";
      ghost.style.top = ev.clientY + "px";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { state.selected = null; refreshSelection(); }
    if (e.key === "p" || e.key === "P") togglePause();
    if (e.key === "u" || e.key === "U") toggleUpgrades();
  });

  // ---------- Wire up ----------
  startBtn.addEventListener("click", startGame);
  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", togglePause);
  const upgBtn = document.getElementById("upgBtn");
  const upgClose = document.getElementById("upgClose");
  if (upgBtn) upgBtn.addEventListener("click", toggleUpgrades);
  if (upgClose) upgClose.addEventListener("click", toggleUpgrades);
  const retry = document.getElementById("brRetry");
  if (retry) retry.addEventListener("click", () => location.reload());

  buildShop();
  updateHud();
  ensureCastleBar();
  Object.entries(DEFENDERS).forEach(([key, d]) => {
    if (d.kind === "shooter") captureStatic(key, d.img);
  });
  requestAnimationFrame(loop);
})();
