/* ============================================================
   Kitty Defense - tower defense engine
   Coordinates: x is a fraction of the playfield width [0..1].
   x = 0 is the castle (left), x = 1 is the spawn edge (right).
   Enemies move from x=1 toward x=0. Defenders shoot to the right.
   ============================================================ */
(() => {
  "use strict";

  const ROWS = 5;
  const COLS = 9;
  const A = "../assets/";

  // ---------- Config ----------
  const SPEED = 1.5; // global game pace multiplier

  // ---------- Sound effects ----------
  // small pool so rapid hits can overlap without cutting each other off
  const hitPool = [];
  for (let i = 0; i < 5; i++) { const a = new Audio(A + "audio/hit.mp3"); a.volume = 0.3; hitPool.push(a); }
  let hitIdx = 0;
  function playHit() {
    const a = hitPool[(hitIdx = (hitIdx + 1) % hitPool.length)];
    try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
  }

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
      kind: "shooter", interval: 700, damage: 55, projSpeed: 1.15, cooldown: 7000,
      proj: A + "effects/solider-cat-attack.gif", // rapid-fire rifle
    },
    wall: {
      name: "Kitty Wall", cost: 75, hp: 1500, img: A + "characters/wall.gif",
      kind: "wall", cooldown: 8000, // pure blocker: no attack, just soaks damage
    },
  };

  // speed in fraction-of-field per second
  const ENEMIES = {
    fox:  { name: "Fox",  hp: 60,  speed: 0.045, dps: 22, reward: 15, score: 10,  img: A + "characters/fox.gif" },
    bear: { name: "Bear", hp: 170, speed: 0.028, dps: 34, reward: 30, score: 25,  img: A + "characters/bear.gif" },
    boss: { name: "Boss", hp: 650, speed: 0.018, dps: 80, reward: 120, score: 150, img: A + "characters/boss.gif", boss: true },
  };

  // ---------- Rounds (chosen on the main menu, stored in localStorage) ----------
  const ROUNDS = (() => {
    let v = null;
    try { v = localStorage.getItem("kd_rounds"); } catch (e) {}
    if (v === "inf") return Infinity;
    const n = parseInt(v, 10);
    return (n === 8 || n === 10 || n === 15) ? n : 8; // default: 8
  })();

  // Procedurally build a wave that scales with its index (0-based).
  function makeWave(i) {
    const foxCount = 3 + Math.round(i * 1.3);
    const foxGap = Math.max(1.1, 3.4 - i * 0.16);
    const bearCount = i === 0 ? 0 : 1 + Math.round(i * 0.6);
    const bearGap = Math.max(2.4, 6 - i * 0.28);
    const groups = [{ type: "fox", count: foxCount, gap: foxGap }];
    if (bearCount > 0) groups.push({ type: "bear", count: bearCount, gap: bearGap, start: 2 });
    const finalWave = isFinite(ROUNDS) && i === ROUNDS - 1;
    const bossWave = finalWave || (i + 1) % 5 === 0;
    if (bossWave) {
      const bossCount = 1 + Math.floor(i / 10);
      groups.push({ type: "boss", count: bossCount, gap: 6, start: Math.max(8, foxCount * foxGap * 0.5) });
    }
    return { name: "Wave " + (i + 1), groups };
  }

  // ---------- Icons (inline SVG, used instead of emojis) ----------
  const ICON_STAR =
    '<svg class="ic" viewBox="0 0 24 24" width="18" height="18"><path fill="#ffce3d" stroke="#e0a400" stroke-width="1.3" stroke-linejoin="round" d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9 6.2 20.9l1.1-6.45-4.7-4.6 6.5-.95z"/></svg>';
  const ICON_HEART =
    '<svg class="ic heart" viewBox="0 0 24 24" width="15" height="15"><path fill="#ff5b86" stroke="#e23e7a" stroke-width="1.2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>';
  const ICON_FLAG =
    '<svg class="ic" viewBox="0 0 24 24" width="16" height="16"><path fill="#ff7eb3" stroke="#e23e7a" stroke-width="1.4" stroke-linejoin="round" d="M6 3v18M6 4h11l-2.2 3.2L17 11H6z"/></svg>';
  const ICON_TROPHY =
    '<svg class="ic" viewBox="0 0 24 24" width="17" height="17"><path fill="#ffce3d" stroke="#e0a400" stroke-width="1.1" stroke-linejoin="round" d="M7 3h10v3a5 5 0 0 1-10 0zM7 4H3v2a4 4 0 0 0 4 4M17 4h4v2a4 4 0 0 1-4 4M10 11h4v3h-4zM8 20l1-4h6l1 4z"/></svg>';
  const ICON_SHOVEL =
    '<svg class="ic" viewBox="0 0 24 24" width="22" height="22"><path fill="#d98cae" stroke="#b5305f" stroke-width="1.2" stroke-linejoin="round" d="M13 3l8 8-2.5 2.5-3-3-6 6 .5 3-2 2-3.5-3.5 2-2 3-.5 6-6-3-3z"/></svg>';

  // ---------- Playful enemy taunts ----------
  const TAUNTS = [
    "We're coming for you, Madina!",
    "We're gonna eat you, Madina!",
    "Run, Madina, run!",
    "Madina is ours now!",
    "Nibble nibble, Madina!",
    "No escape, Madina!",
    "Here we come, Madina!",
    "Yum yum, Madina!",
    "Surrender, Madina!",
  ];

  // ---------- DOM ----------
  const field = document.getElementById("field");
  const grid = document.getElementById("grid");
  const layer = document.getElementById("layer");
  const ghost = document.getElementById("ghost");
  const ghostImg = ghost.querySelector("img");
  const starsEl = document.getElementById("stars");
  const livesEl = document.getElementById("lives");
  const waveEl = document.getElementById("wave");
  const scoreEl = document.getElementById("score");
  const banner = document.getElementById("banner");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const shop = document.getElementById("shop");

  // ---------- State ----------
  const state = {
    stars: 225,
    lives: 5,
    score: 0,
    waveIndex: -1,
    selected: null,      // defender key or "shovel"
    upg: { damage: 0, health: 0, income: 0 }, // per-game upgrade levels
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    defenders: [],
    enemies: [],
    projectiles: [],
    stars3d: [],         // collectible stars
    floats: [],
    spawnQueue: [],      // {t, type, row}
    waveActive: false,
    waveClock: 0,
    skyTimer: 6,
    running: false,
    paused: false,
    over: false,
    cooldowns: {},       // key -> remaining seconds
  };

  // ---------- Build grid cells ----------
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

  // ---------- Geometry helpers ----------
  // entity x[0..1] -> left%, where x=0 is castle (left side of field)
  const xToLeft = (x) => x * 100;
  const rowToTop = (row) => ((row + 0.5) / ROWS) * 100;
  const colCenterX = (col) => (col + 0.5) / COLS;

  // ---------- In-game upgrades (bought with stars during the match) ----------
  const UPG = window.KD_UPGRADES || {};
  const upM = (key) => (UPG[key] ? UPG[key].mult(state.upg[key] || 0) : 1);
  const ENEMY_HP_GROWTH = 0.12; // enemies gain +12% HP per level/wave

  // ---------- Shop ----------
  // Freeze an <img> to the first frame of its gif so shop cards are static.
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
      freezeImg(card.querySelector("img"), d.img); // static, non-animated shop icon
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

  // ---------- In-game upgrade panel ----------
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
    if (state.stars < cost) { return; }
    spendStars(cost);
    state.upg[key] = lvl + 1;
    recomputeDefenders();
    buildUpgradePanel();
  }

  // Re-apply current upgrade multipliers to all placed defenders.
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
    // pause while the panel is open
    if (opening) {
      state.upgPaused = state.paused;
      state.paused = true;
      buildUpgradePanel();
    } else {
      state.paused = state.upgPaused || false;
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

    // keep selection if still affordable, else clear
    if (state.stars < cfg.cost) { state.selected = null; }
    refreshSelection();
  }

  let defUid = 0; // unique id per placed defender (for per-instance gif urls)
  function placeDefender(key, r, c) {
    const cfg = DEFENDERS[key];
    const el = document.createElement("div");
    el.className = "entity defender def-" + key;
    el.style.left = xToLeft(colCenterX(c)) + "%";
    el.style.top = rowToTop(r) + "%";
    // The flower plays its bloom once and holds the final frame. Browsers share
    // one animation timeline across <img>s with the same gif url, so placing a
    // new flower would restart the others. Give producers a unique url so each
    // animates independently.
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
    // shooters stand still until an enemy enters their lane
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

  // ---------- Static-frame freeze for shooters ----------
  // The flower gif plays once and holds its final (bloomed) frame — it has no
  // loop block, so it never re-animates. Shooters freeze to their first frame
  // when no enemy is in their lane, and play their gif when engaging.
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
        // apply to any defenders already standing idle
        state.defenders.forEach((d) => {
          if (d.key === key && !d.animated && d.img) d.img.src = staticFrames[key];
        });
      } catch (e) { /* tainted canvas (file://): keep gif animated */ }
    };
    im.src = src;
  }

  function setDefenderAnimated(def, on) {
    if (def.cfg.kind === "producer") return; // flower plays once, then holds final frame
    if (def.animated === on) return;
    def.animated = on;
    if (on) def.img.src = def.cfg.img;            // (re)start the gif
    else if (staticFrames[def.key]) def.img.src = staticFrames[def.key];
  }

  function startCooldown(key, ms) {
    state.cooldowns[key] = ms / 1000;
    const card = [...shop.children].find((c) => c.dataset.key === key);
    if (card) card.classList.add("cooling");
  }

  // ---------- Currency ----------
  function spendStars(n) { state.stars -= n; updateHud(); }
  function addStars(n) { state.stars += n; updateHud(); }

  function updateHud() {
    starsEl.textContent = state.stars;
    livesEl.innerHTML = ICON_HEART.repeat(Math.max(0, state.lives));
    scoreEl.textContent = state.score;
    const cur = state.waveIndex < 0 ? 0 : state.waveIndex + 1;
    waveEl.textContent = cur + " / " + (isFinite(ROUNDS) ? ROUNDS : "\u221E");
    // disable unaffordable cards
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

  // ---------- Projectiles ----------
  function fireProjectile(def) {
    const el = document.createElement("div");
    el.className = "entity projectile proj-" + def.key + (def.cfg.arc ? " ball" : "");
    const baseTop = rowToTop(def.row) - 2;
    el.style.left = xToLeft(def.x + 0.03) + "%";
    el.style.top = baseTop + "%";
    el.innerHTML = `<img src="${def.cfg.proj || A + "effects/hello-kitty-shoot.gif"}" alt="shot" />`;
    layer.appendChild(el);
    state.projectiles.push({
      x: def.x + 0.03, row: def.row, speed: def.cfg.projSpeed,
      damage: def.damage, el,
      arc: !!def.cfg.arc, baseTop, yOff: 0,
      vy: def.cfg.arc ? def.cfg.arcVy : 0,  // upward launch velocity (%/s)
      g: def.cfg.arc ? def.cfg.arcG : 0,    // gravity (%/s^2)
    });
  }

  // ---------- Enemies ----------
  function spawnEnemy(type, row) {
    const cfg = ENEMIES[type];
    const hp = Math.round(cfg.hp * (1 + state.waveIndex * ENEMY_HP_GROWTH)); // tougher each level
    const el = document.createElement("div");
    el.className = "entity enemy" + (cfg.boss ? " boss" : "");
    el.style.left = "100%";
    el.style.top = rowToTop(row) + "%";
    el.innerHTML = `<img src="${cfg.img}" alt="${cfg.name}" />` +
                   `<div class="hpbar"><i></i></div>`;
    layer.appendChild(el);
    state.enemies.push({
      type, cfg, row, x: 1.04, hp, maxHp: hp,
      el, bar: el.querySelector(".hpbar > i"),
    });
    maybeTaunt(el, cfg.boss);
  }

  function maybeTaunt(el, isBoss) {
    if (!isBoss && Math.random() > 0.5) return; // ~half of normal enemies talk
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
    playHit();
    en.hp -= dmg;
    en.bar.style.width = Math.max(0, (en.hp / en.maxHp) * 100) + "%";
    en.el.firstElementChild.classList.add("hit-flash");
    setTimeout(() => en.el.firstElementChild.classList.remove("hit-flash"), 150);
    if (en.hp <= 0) killEnemy(en);
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

  function killEnemy(en) {
    state.score += en.cfg.score;
    addStars(Math.round(en.cfg.reward * 0.4));
    floatText("+" + Math.round(en.cfg.reward * 0.4), en.x, rowToTop(en.row) / 100, "#fff");
    if (!en.cfg.boss) spawnMinionDeath(en);
    en.dead = true;
    en.el.style.transition = "opacity .3s, transform .3s";
    en.el.style.opacity = "0";
    en.el.style.transform = "translate(-50%,-50%) scale(.4) rotate(20deg)";
    setTimeout(() => en.el.remove(), 300);
    const i = state.enemies.indexOf(en);
    if (i >= 0) state.enemies.splice(i, 1);
    updateHud();
  }

  // ---------- Waves ----------
  function buildWaveQueue(wave) {
    const q = [];
    wave.groups.forEach((g) => {
      const start = g.start || 0;
      for (let k = 0; k < g.count; k++) {
        q.push({ t: start + k * g.gap, type: g.type, row: Math.floor(Math.random() * ROWS) });
      }
    });
    q.sort((a, b) => a.t - b.t);
    return q;
  }

  function startNextWave() {
    state.waveIndex++;
    if (state.waveIndex >= ROUNDS) return; // finite win handled in update
    state.currentWave = makeWave(state.waveIndex);
    state.spawnQueue = buildWaveQueue(state.currentWave);
    state.waveClock = 0;
    state.waveActive = true;
    showBanner(state.currentWave.name + "!");
    updateHud();
  }

  function showBanner(text) {
    banner.textContent = text;
    banner.classList.remove("show");
    void banner.offsetWidth; // reflow to restart animation
    banner.classList.add("show");
  }

  // ---------- Game flow ----------
  function startGame() {
    if (state.running) return;
    state.running = true;
    startBtn.style.display = "none";
    startNextWave();
  }

  function saveResult(won, score, waves) {
    let newBest = false;
    try {
      const prevHigh = parseInt(localStorage.getItem("kd_highscore") || "0", 10);
      newBest = score >= prevHigh && score > 0;
      localStorage.setItem("kd_highscore", String(Math.max(score, prevHigh)));
      const bw = Math.max(waves, parseInt(localStorage.getItem("kd_bestwave") || "0", 10));
      localStorage.setItem("kd_bestwave", String(bw));
      const hist = JSON.parse(localStorage.getItem("kd_history") || "[]");
      hist.unshift({ t: Date.now(), won, score, waves, mode: isFinite(ROUNDS) ? ROUNDS : "inf" });
      localStorage.setItem("kd_history", JSON.stringify(hist.slice(0, 25)));
    } catch (e) {}
    return newBest;
  }

  function endGame(won) {
    if (state.over) return;
    state.over = true;
    state.running = false;
    const newBest = saveResult(won, state.score, state.waveIndex + 1);
    const url = "Result.html?result=" + (won ? "win" : "lose") +
                "&score=" + state.score +
                "&wave=" + (state.waveIndex + 1) +
                "&mode=" + (isFinite(ROUNDS) ? ROUNDS : "inf") +
                "&best=" + (newBest ? "1" : "0");
    setTimeout(() => { window.location.href = url; }, 1300);
    showBanner(won ? "Victory!" : "Defeat");
  }

  function loseLife() {
    state.lives--;
    updateHud();
    field.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.6) sepia(.4)" },
                   { filter: "brightness(1)" }], { duration: 300 });
    if (state.lives <= 0) endGame(false);
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

    // wave spawning
    if (state.waveActive) {
      state.waveClock += dt;
      while (state.spawnQueue.length && state.waveClock >= state.spawnQueue[0].t) {
        const s = state.spawnQueue.shift();
        spawnEnemy(s.type, s.row);
      }
      if (!state.spawnQueue.length && state.enemies.length === 0) {
        state.waveActive = false;
        if (state.waveIndex >= ROUNDS - 1) { // never true when ROUNDS is Infinity
          endGame(true);
        } else {
          setTimeout(startNextWave, 2600);
        }
      }
    }

    // free sky stars: spawn more rarely as the game progresses
    state.skyTimer -= dt;
    if (state.skyTimer <= 0) {
      state.skyTimer = Math.min(42, 9 + Math.random() * 4 + state.waveIndex * 3);
      spawnStar(0.2 + Math.random() * 0.7, 0.05, 25, true);
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
        // only shoot if an enemy is ahead (to the right) in this row
        const hasTarget = state.enemies.some((e) => e.row === def.row && e.x > def.x - 0.02);
        setDefenderAnimated(def, hasTarget); // freeze when idle, play when engaging
        def.timer += dt * 1000;
        if (hasTarget && def.timer >= def.cfg.interval) {
          def.timer = 0;
          fireProjectile(def);
        }
      }
    }

    // projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.x += p.speed * dt;
      if (p.arc) { p.yOff += p.vy * dt; p.vy += p.g * dt; } // up, then arc down
      let hit = false;
      for (const e of state.enemies) {
        if (e.row === p.row && !e.dead && Math.abs(e.x - p.x) < 0.04) {
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

    // enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.dead) continue;
      const col = Math.floor(e.x * COLS);
      const def = (col >= 0 && col < COLS) ? state.grid[e.row][col] : null;
      if (def) {
        // attack the defender, stop moving
        def.hp -= e.cfg.dps * dt;
        if (def.hp <= 0) removeDefender(def);
      } else {
        e.x -= e.cfg.speed * dt;
      }
      if (e.x <= 0.02) {
        // reached castle
        e.dead = true;
        e.el.remove();
        state.enemies.splice(i, 1);
        loseLife();
        continue;
      }
      e.el.style.left = xToLeft(e.x) + "%";
    }

    // collectible stars: animate fall + expire
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

  // ESC clears selection
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

  // apply the battlefield chosen on the menu (Cherry Blossom / Frozen)
  (function () {
    let map = "maps/map-1.png";
    try { map = localStorage.getItem("kd_map") || map; } catch (e) {}
    if (map.indexOf("/") === -1) map = "maps/" + map; // migrate old saved names
    const bf = document.querySelector(".battlefield");
    if (bf) bf.style.backgroundImage = `url("${A}${map}")`;
  })();

  buildShop();
  updateHud();
  // pre-capture first frames so shooters can freeze when idle
  Object.entries(DEFENDERS).forEach(([key, d]) => {
    if (d.kind === "shooter") captureStatic(key, d.img);
  });
  requestAnimationFrame(loop);
})();
