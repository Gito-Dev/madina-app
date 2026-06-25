/* =====================================================================
   Kitty vs Zombie 3D
   - Roam the full map (camera follows the kitty).
   - Left stick / arrows = walk.  Right stick = aim & auto-fire pink balls.
   - Shoot button = fire in the way you're facing.
   - Zombies spawn in waves, chase the kitty, and deal contact damage.
   ===================================================================== */
(() => {
  "use strict";

  /* ---------------- World / map ---------------- */
  const WORLD_W = 2914;
  const WORLD_H = 1440;

  /* ---------------- Tunables ---------------- */
  const PLAYER_SPEED   = 5.2;     // world px / frame
  const PLAYER_MAX_HP  = 100;
  const WALK_FRAME_MS  = 120;
  const WALK_FRAMES    = [2, 3, 4, 5];

  const BULLET_SPEED   = 13;      // px / frame
  const BULLET_LIFE_MS = 900;
  const BULLET_DMG     = 10;
  const FIRE_INTERVAL  = 200;     // ms between shots while holding

  const Z_BASE_HP      = 30;      // +5 per wave
  const Z_HP_PER_WAVE  = 5;
  const Z_BASE_SPEED   = 1.5;     // +0.12 per wave (capped)
  const Z_SPEED_CAP    = 3.2;
  const Z_CONTACT_DMG  = 8;       // per hit
  const Z_ATTACK_MS    = 700;     // ms between contact hits
  const Z_CONTACT_DIST = 58;      // world px to be "touching" the kitty
  const Z_HIT_RADIUS   = 56;      // bullet collision radius
  const MAX_ALIVE      = 24;
  const SPAWN_INTERVAL = 850;     // ms between spawns within a wave
  const NEXT_WAVE_MS   = 2600;    // pause between waves

  /* ---------------- Perks / drops ---------------- */
  const DROP_CHANCE    = 0.22;    // chance a killed zombie drops an item
  const PICKUP_RADIUS  = 62;      // walk this close to collect
  const HEAL_AMOUNT    = 50;      // health pickup
  const SPEED_MULT     = 1.8;     // boot speed multiplier
  const SPEED_DUR_MS   = 60000;   // boot lasts 1 minute
  const ENTER_RADIUS   = 170;     // how close to the dungeon to show ENTER

  const ITEM_IMG = { health: "health.png", speed: "speed-up.png", nuke: "nuke.png" };
  for (const t in ITEM_IMG) new Image().src = `../Assets/effects/${ITEM_IMG[t]}`;

  // Three dungeons w/ colored glow. dungeons-2 (green) is the biohazard portal.
  const DUNGEONS = [
    { img: "dungeons-1.png", glow: "red",   portal: false },
    { img: "dungeons-2.png", glow: "green", portal: true  },
    { img: "dungeons-3.png", glow: "blue",  portal: false },
  ];
  for (const d of DUNGEONS) new Image().src = `../Assets/map/${d.img}`;
  const MAP_OVER = `url("../Assets/map/3d-map.webp")`;
  const MAP_BIO  = `url("../Assets/map/biohazard-map.webp")`;
  new Image().src = "../Assets/map/biohazard-map.webp";

  /* ---------------- Audio ---------------- */
  // Pool of shot sounds so rapid fire overlaps instead of cutting itself off.
  const SHOOT_SRC = "../Assets/audio/shooting.mp3";
  const SFX_POOL_SIZE = 6;
  const shootPool = [];
  for (let i = 0; i < SFX_POOL_SIZE; i++) {
    const a = new Audio(SHOOT_SRC);
    a.volume = 0.15;
    shootPool.push(a);
  }
  let shootIdx = 0;
  function playShoot() {
    const a = shootPool[shootIdx];
    shootIdx = (shootIdx + 1) % SFX_POOL_SIZE;
    try { a.currentTime = 0; a.play(); } catch (e) { /* autoplay not ready yet */ }
  }

  /* ---------------- Sprites ---------------- */
  const CHAR_DIR = "../Assets/character";          // <dir>-<n>.png  (1 idle, 2..5 walk)
  const Z_DIR    = "../Assets/basic-zombie";       // <dir>-<n>.png
  const DIRS = ["down", "up", "left", "right"];
  const Z_FRAMES = { down: 4, up: 4, left: 4, right: 5 };

  const charSprites = {};
  for (const dir of DIRS) {
    charSprites[dir] = {};
    for (let n = 1; n <= 5; n++) {
      const url = `${CHAR_DIR}/${dir}-${n}.png`;
      new Image().src = url;
      charSprites[dir][n] = `url("${url}")`;
    }
  }
  const zombieSprites = {};
  for (const dir of DIRS) {
    zombieSprites[dir] = {};
    for (let n = 1; n <= Z_FRAMES[dir]; n++) {
      const url = `${Z_DIR}/${dir}-${n}.png`;
      new Image().src = url;
      zombieSprites[dir][n] = `url("${url}")`;
    }
  }
  const Z_DYING_FRAMES = 5;
  const Z_DEATH_FRAME_MS = 110;        // per dying frame
  const zombieDying = [];              // dying-1 .. dying-5
  for (let n = 1; n <= Z_DYING_FRAMES; n++) {
    const url = `${Z_DIR}/dying-${n}.png`;
    new Image().src = url;
    zombieDying.push(`url("${url}")`);
  }
  // Attack swing frames (left / right / up — no "down" art, falls back to idle)
  const zombieAttack = {};
  for (const dir of ["left", "right", "up"]) {
    zombieAttack[dir] = [];
    for (let n = 1; n <= 2; n++) {
      const url = `${Z_DIR}/attack-${dir}-${n}.png`;
      new Image().src = url;
      zombieAttack[dir].push(`url("${url}")`);
    }
  }

  /* ---------------- DOM ---------------- */
  const world    = document.getElementById("world");
  const player   = document.getElementById("player");
  const knob     = document.getElementById("knob");
  const aimKnob  = document.getElementById("aimKnob");
  const joyEl    = document.getElementById("joystick");
  const aimEl    = document.getElementById("aimStick");
  const hpFill   = document.getElementById("hpFill");
  const hpText   = document.getElementById("hpText");
  const waveNum  = document.getElementById("waveNum");
  const waveSub  = document.getElementById("waveSub");
  const killsEl  = document.getElementById("kills");
  const banner   = document.getElementById("banner");
  const overlay  = document.getElementById("overlay");
  const overTitle= document.getElementById("overTitle");
  const overSub  = document.getElementById("overSub");
  const restartBtn = document.getElementById("restartBtn");
  const speedPerk = document.getElementById("speedPerk");
  const speedTime = document.getElementById("speedTime");
  const nukeFlash = document.getElementById("nukeFlash");
  const enterBtn  = document.getElementById("enterBtn");
  const invEl     = document.getElementById("inv");
  const useBtn    = document.getElementById("useBtn");

  /* ---------------- Game state ---------------- */
  let player_state, zombies, bullets, shells, pickups, wave, spawnRemaining, spawnTimer,
      nextWaveTimer, waveActive, kills, fireTimer, facing, lastDir, running,
      speedTimer, inBiohazard, portal, lastDrop, slots, selectedSlot;

  /* ---------------- Inventory ---------------- */
  const INV_SLOTS = 10;       // bottom-center slots
  const MAX_PER_ITEM = 5;     // up to 5 of each item (10 x 5 = 50 total)
  const slotEls = [];
  function buildInventory() {
    invEl.innerHTML = "";
    slotEls.length = 0;
    for (let i = 0; i < INV_SLOTS; i++) {
      const s = document.createElement("div");
      s.className = "slot";
      s.innerHTML = '<div class="ico"></div><span class="cnt"></span>';
      s.addEventListener("click", () => selectSlot(i));
      invEl.appendChild(s);
      slotEls.push(s);
    }
  }
  function renderInventory() {
    for (let i = 0; i < INV_SLOTS; i++) {
      const el = slotEls[i];
      const s = slots[i];
      const ico = el.querySelector(".ico");
      const cnt = el.querySelector(".cnt");
      if (s) {
        el.classList.add("filled");
        ico.style.backgroundImage = `url("../Assets/effects/${ITEM_IMG[s.type]}")`;
        cnt.textContent = "x" + s.count;
        cnt.style.display = "";
      } else {
        el.classList.remove("filled");
        ico.style.backgroundImage = "";
        cnt.style.display = "none";
      }
      el.classList.toggle("selected", i === selectedSlot && !!s);
    }
    useBtn.classList.toggle("show", selectedSlot >= 0 && !!slots[selectedSlot]);
  }
  // Returns false if there's no room (stack full / no empty slot).
  function addItem(type) {
    const stack = slots.find((s) => s && s.type === type);
    if (stack) {
      if (stack.count >= MAX_PER_ITEM) return false;
      stack.count++;
    } else {
      const idx = slots.indexOf(null);
      if (idx === -1) return false;
      slots[idx] = { type, count: 1 };
    }
    renderInventory();
    return true;
  }
  function selectSlot(i) {
    selectedSlot = (selectedSlot === i || !slots[i]) ? -1 : i;
    renderInventory();
  }
  function useSelected() {
    if (selectedSlot < 0) return;
    const s = slots[selectedSlot];
    if (!s) { selectedSlot = -1; renderInventory(); return; }
    applyItem(s.type, player_state.x, player_state.y - 40);
    s.count--;
    if (s.count <= 0) { slots[selectedSlot] = null; selectedSlot = -1; }
    renderInventory();
  }
  useBtn.addEventListener("click", useSelected);

  function freshState() {
    player_state = { x: WORLD_W / 2, y: WORLD_H / 2, hp: PLAYER_MAX_HP };
    // remove any leftover DOM nodes
    if (zombies) zombies.forEach((z) => z.el.remove());
    if (bullets) bullets.forEach((b) => b.el.remove());
    if (shells) shells.forEach((s) => s.el.remove());
    if (pickups) pickups.forEach((p) => p.el.remove());
    zombies = [];
    bullets = [];
    shells = [];
    pickups = [];
    wave = 0;
    spawnRemaining = 0;
    spawnTimer = 0;
    nextWaveTimer = 1200;     // brief intro before wave 1
    waveActive = false;
    kills = 0;
    fireTimer = 0;
    facing = "down";
    lastDir = { x: 0, y: 1 };
    running = true;
    currentBg = "";
    walkIndex = 0;
    walkTimer = 0;
    // reset inventory + perks + back to the overworld map
    slots = new Array(INV_SLOTS).fill(null);
    selectedSlot = -1;
    renderInventory();
    lastDrop = null;
    speedTimer = 0;
    speedPerk.style.display = "none";
    inBiohazard = false;
    world.style.backgroundImage = MAP_OVER;
    document.querySelectorAll(".dungeon").forEach((d) => (d.style.display = ""));
    enterBtn.classList.remove("show");
    setSprite("down", 1);
    overlay.classList.remove("show");
    updateHUD();
  }

  /* ---------------- Player sprite ---------------- */
  let currentBg = "";
  let walkIndex = 0;
  let walkTimer = 0;
  function setSprite(dir, n) {
    const bg = charSprites[dir][n];
    if (bg !== currentBg) { player.style.backgroundImage = bg; currentBg = bg; }
  }

  function dirFromVec(x, y) {
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }

  /* ---------------- Joystick factory (multi-touch + mouse) ---------------- */
  function makeJoystick(el, knobEl) {
    const RADIUS = 55;
    const s = { x: 0, y: 0, active: false, id: null };
    function set(cx, cy) {
      const r = el.getBoundingClientRect();
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height / 2;
      const dx = cx - ox, dy = cy - oy;
      const dist = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(dist, RADIUS);
      const nx = dx / dist, ny = dy / dist;
      knobEl.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
      const mag = clamped / RADIUS;
      if (mag < 0.2) { s.x = 0; s.y = 0; }
      else { s.x = nx * mag; s.y = ny * mag; }
    }
    function reset() {
      s.active = false; s.id = null; s.x = 0; s.y = 0;
      knobEl.style.transform = "translate(0px, 0px)";
    }
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      s.active = true; s.id = t.identifier; set(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener("touchmove", (e) => {
      if (!s.active) return;
      for (const t of e.changedTouches)
        if (t.identifier === s.id) { e.preventDefault(); set(t.clientX, t.clientY); }
    }, { passive: false });
    window.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) if (t.identifier === s.id) reset();
    });
    window.addEventListener("touchcancel", (e) => {
      for (const t of e.changedTouches) if (t.identifier === s.id) reset();
    });
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); s.active = true; s.id = "mouse"; set(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      if (s.active && s.id === "mouse") set(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => { if (s.id === "mouse") reset(); });
    return s;
  }
  const moveStick = makeJoystick(joyEl, knob);
  const aimStick  = makeJoystick(aimEl, aimKnob);

  /* ---------------- Keyboard ---------------- */
  const held = new Set();
  const keyVec = { x: 0, y: 0 };
  const KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  };
  function recomputeKeys() {
    keyVec.x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    keyVec.y = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
  }
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { spaceHeld = true; e.preventDefault(); return; }
    const d = KEYMAP[e.code];
    if (!d) return;
    e.preventDefault(); held.add(d); recomputeKeys();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceHeld = false; return; }
    const d = KEYMAP[e.code];
    if (!d) return;
    held.delete(d); recomputeKeys();
  });

  /* ---------------- Spacebar fire (desktop) ---------------- */
  let spaceHeld = false;

  /* ---------------- Firing ---------------- */
  // Muzzle offset from the kitty's centre, per shoot direction, so the
  // ball leaves the gun instead of the feet.
  const MUZZLE = {
    right: { x: 42, y: -12 },   // gun points right, around chest height
    left:  { x: -42, y: -12 },
    up:    { x: 8, y: -48 },    // up near the head
    down:  { x: -8, y: 10 },
  };
  function fire(dx, dy) {
    const mag = Math.hypot(dx, dy) || 1;
    const nx = dx / mag, ny = dy / mag;
    const m = MUZZLE[dirFromVec(dx, dy)];
    const sx = player_state.x + m.x;
    const sy = player_state.y + m.y;
    const angle = Math.atan2(ny, nx) * 180 / Math.PI;   // bullet art points right
    const el = document.createElement("div");
    el.className = "projectile";
    world.appendChild(el);
    const b = {
      x: sx, y: sy,
      vx: nx * BULLET_SPEED, vy: ny * BULLET_SPEED,
      angle, life: BULLET_LIFE_MS, el,
    };
    el.style.transform = `translate(${sx}px, ${sy}px) rotate(${angle}deg)`;
    bullets.push(b);
    ejectShell(sx, sy, nx, ny);
    playShoot();
  }

  // Spit a shell casing backwards out of the gun with a little arc.
  function ejectShell(x, y, nx, ny) {
    const el = document.createElement("div");
    el.className = "shell";
    world.appendChild(el);
    const s = {
      x, y,
      vx: -nx * (1.4 + Math.random()) + (Math.random() - 0.5) * 1.6,
      vy: -2.4 - Math.random() * 1.2,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 40,
      life: 600,
      el,
    };
    el.style.transform = `translate(${x}px, ${y}px) rotate(${s.rot}deg)`;
    shells.push(s);
  }

  /* ---------------- Zombie spawning ---------------- */
  function startWave(n) {
    wave = n;
    spawnRemaining = 3 + n * 2;          // wave 1 = 5, wave 2 = 7, ...
    spawnTimer = 0;
    waveActive = true;
    waveNum.textContent = n;
    showBanner(`WAVE ${n}`);
    updateHUD();
  }

  function spawnZombie() {
    const angle = Math.random() * Math.PI * 2;
    const ringR = 280 + Math.random() * 150;   // spawn close to the kitty
    let x = player_state.x + Math.cos(angle) * ringR;
    let y = player_state.y + Math.sin(angle) * ringR;
    x = Math.max(40, Math.min(WORLD_W - 40, x));
    y = Math.max(40, Math.min(WORLD_H - 40, y));

    const el = document.createElement("div");
    el.className = "zombie";
    el.innerHTML =
      '<div class="z-sprite"></div><div class="z-hp"><div class="z-hp-fill"></div></div>';
    world.appendChild(el);

    const maxHp = Z_BASE_HP + (wave - 1) * Z_HP_PER_WAVE;
    const speed = Math.min(Z_SPEED_CAP, Z_BASE_SPEED + (wave - 1) * 0.12);
    const z = {
      x, y, hp: maxHp, maxHp, speed,
      facing: "down", frame: 1, frameTimer: 0, attackTimer: 0,
      el,
      sprite: el.querySelector(".z-sprite"),
      hpfill: el.querySelector(".z-hp-fill"),
      curBg: "",
    };
    zombies.push(z);
  }

  function zSetBg(z, bg) {
    if (bg !== z.curBg) { z.sprite.style.backgroundImage = bg; z.curBg = bg; }
  }
  function zSetSprite(z, dir, n) { zSetBg(z, zombieSprites[dir][n]); }

  function killZombie(z, i) {
    zombies.splice(i, 1);     // out of play: no more chasing / hits / damage
    kills++;
    updateHUD();
    playDeath(z);
  }

  // Animate dying-1 .. dying-5 where the zombie fell, then fade out.
  function playDeath(z) {
    const el = z.el;
    el.classList.remove("hurt");
    const hpbar = el.querySelector(".z-hp");
    if (hpbar) hpbar.style.display = "none";
    let f = 0;
    z.sprite.style.backgroundImage = zombieDying[0];
    const step = () => {
      f++;
      if (f < zombieDying.length) {
        z.sprite.style.backgroundImage = zombieDying[f];
        setTimeout(step, Z_DEATH_FRAME_MS);
      } else {
        el.classList.add("fade-out");
        setTimeout(() => el.remove(), 280);
      }
    };
    setTimeout(step, Z_DEATH_FRAME_MS);
  }

  /* ---------------- HUD / banner ---------------- */
  function updateHUD() {
    const hp = Math.max(0, Math.ceil(player_state.hp));
    hpFill.style.width = `${hp / PLAYER_MAX_HP * 100}%`;
    hpText.textContent = `${hp} / ${PLAYER_MAX_HP}`;
    killsEl.textContent = kills;
    const remaining = spawnRemaining + zombies.length;
    waveSub.textContent = waveActive ? `Zombies left: ${remaining}` : "Get ready…";
  }

  // Floating combat number at a world position.
  function spawnDmg(x, y, amount, isPlayer, isHeal) {
    const el = document.createElement("div");
    el.className = "dmg-num" + (isHeal ? " heal" : isPlayer ? " player" : "");
    el.textContent = (isHeal ? "+" : "-") + amount;
    el.style.setProperty("--dx", `${x}px`);
    el.style.setProperty("--dy", `${y}px`);
    world.appendChild(el);
    setTimeout(() => el.remove(), 720);
  }

  /* ---------------- Items / perks ---------------- */
  function spawnPickup(x, y, type) {
    const el = document.createElement("div");
    el.className = `pickup item-${type}`;
    const inner = document.createElement("div");
    inner.className = "pickup-inner";
    inner.style.backgroundImage = `url("../Assets/effects/${ITEM_IMG[type]}")`;
    el.appendChild(inner);
    el.style.transform = `translate(${x}px, ${y}px)`;
    world.appendChild(el);
    pickups.push({ x, y, type, el });
  }

  const DROP_WEIGHTS = { health: 3, speed: 2, nuke: 2 };
  function maybeDrop(x, y) {
    if (Math.random() > DROP_CHANCE) return;
    // never drop the same item twice in a row (no double-hearts)
    const types = Object.keys(DROP_WEIGHTS).filter((t) => t !== lastDrop);
    let total = 0;
    for (const t of types) total += DROP_WEIGHTS[t];
    let r = Math.random() * total;
    let chosen = types[types.length - 1];
    for (const t of types) { r -= DROP_WEIGHTS[t]; if (r <= 0) { chosen = t; break; } }
    lastDrop = chosen;
    spawnPickup(x, y, chosen);
  }

  function applyItem(type, x, y) {
    if (type === "health") {
      player_state.hp = Math.min(PLAYER_MAX_HP, player_state.hp + HEAL_AMOUNT);
      spawnDmg(x, y - 30, HEAL_AMOUNT, false, true);
      updateHUD();
    } else if (type === "speed") {
      speedTimer = SPEED_DUR_MS;
      speedPerk.style.display = "flex";
      speedTime.textContent = "60s";
      showBanner("SPEED UP!");
    } else if (type === "nuke") {
      nukeAll();
    }
  }

  function nukeAll() {
    nukeFlash.classList.remove("go");
    void nukeFlash.offsetWidth;
    nukeFlash.classList.add("go");
    showBanner("BOOM!");
    for (let i = zombies.length - 1; i >= 0; i--) killZombie(zombies[i], i);
  }

  /* ---------------- Dungeons + biohazard portal ---------------- */
  function placeDungeons() {
    // Each dungeon goes in its own quadrant (so two are never on the same
    // side / clustered) and well clear of the centre where the kitty spawns.
    const m = 280;              // edge margin
    const gapX = 420, gapY = 180;   // clearance from the centre
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    const quads = [
      { x0: m, x1: cx - gapX, y0: m, y1: cy - gapY },                   // top-left
      { x0: cx + gapX, x1: WORLD_W - m, y0: m, y1: cy - gapY },         // top-right
      { x0: m, x1: cx - gapX, y0: cy + gapY, y1: WORLD_H - m },         // bottom-left
      { x0: cx + gapX, x1: WORLD_W - m, y0: cy + gapY, y1: WORLD_H - m },// bottom-right
    ];
    // shuffle, then take one quadrant per dungeon
    for (let i = quads.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [quads[i], quads[j]] = [quads[j], quads[i]];
    }
    DUNGEONS.forEach((d, idx) => {
      const q = quads[idx];
      const x = q.x0 + Math.random() * (q.x1 - q.x0);
      const y = q.y0 + Math.random() * (q.y1 - q.y0);
      const el = document.createElement("div");
      el.className = `dungeon glow-${d.glow}`;
      el.style.backgroundImage = `url("../Assets/map/${d.img}")`;
      el.style.transform = `translate(${x}px, ${y}px)`;
      world.appendChild(el);
      if (d.portal) portal = { x, y };
    });
  }

  function enterBiohazard() {
    inBiohazard = true;
    world.style.backgroundImage = MAP_BIO;
    document.querySelectorAll(".dungeon").forEach((d) => (d.style.display = "none"));
    enterBtn.classList.remove("show");
    // clear the overworld fight and drop the kitty into the new map
    zombies.forEach((z) => z.el.remove()); zombies = [];
    bullets.forEach((b) => b.el.remove()); bullets = [];
    shells.forEach((s) => s.el.remove()); shells = [];
    pickups.forEach((p) => p.el.remove()); pickups = [];
    player_state.x = WORLD_W / 2;
    player_state.y = WORLD_H / 2;
    waveActive = false;
    spawnRemaining = 0;
    nextWaveTimer = 1600;
    showBanner("BIOHAZARD ZONE");
  }
  enterBtn.addEventListener("click", () => { if (!inBiohazard) enterBiohazard(); });
  let bannerTimer = null;
  function showBanner(text) {
    banner.textContent = text;
    banner.classList.remove("show");
    void banner.offsetWidth;            // restart the animation
    banner.classList.add("show");
  }

  function gameOver() {
    running = false;
    overTitle.textContent = "Game Over";
    overSub.innerHTML = `You reached <b>Wave ${wave}</b><br/>Zombies splatted: <b>${kills}</b>`;
    overlay.classList.add("show");
  }
  restartBtn.addEventListener("click", () => { freshState(); });

  /* ---------------- Main loop ---------------- */
  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;
    requestAnimationFrame(tick);
    if (!running) return;

    /* --- movement --- */
    let mvx = moveStick.active ? moveStick.x : keyVec.x;
    let mvy = moveStick.active ? moveStick.y : keyVec.y;
    const mmag = Math.hypot(mvx, mvy);
    const moving = mmag > 0.01;
    if (moving) {
      const scale = Math.min(mmag, 1) / mmag;
      mvx *= scale; mvy *= scale;
      const sp = PLAYER_SPEED * (speedTimer > 0 ? SPEED_MULT : 1);
      player_state.x = Math.max(0, Math.min(WORLD_W, player_state.x + mvx * sp));
      player_state.y = Math.max(0, Math.min(WORLD_H, player_state.y + mvy * sp));
      lastDir = { x: mvx, y: mvy };
    }

    /* --- aiming / facing --- */
    const aiming = aimStick.active && (Math.abs(aimStick.x) + Math.abs(aimStick.y)) > 0.05;
    if (aiming) {
      facing = dirFromVec(aimStick.x, aimStick.y);
      lastDir = { x: aimStick.x, y: aimStick.y };
    } else if (moving) {
      facing = dirFromVec(mvx, mvy);
    }

    /* --- player animation --- */
    if (moving) {
      walkTimer += dt;
      if (walkTimer >= WALK_FRAME_MS) {
        walkTimer = 0;
        walkIndex = (walkIndex + 1) % WALK_FRAMES.length;
      }
      setSprite(facing, WALK_FRAMES[walkIndex]);
    } else {
      walkTimer = 0; walkIndex = 0;
      setSprite(facing, 1);
    }
    player.style.transform = `translate(${player_state.x}px, ${player_state.y}px)`;

    /* --- firing --- */
    fireTimer += dt;
    const wantsFire = aiming || spaceHeld;
    if (wantsFire && fireTimer >= FIRE_INTERVAL) {
      fireTimer = 0;
      if (aiming) fire(aimStick.x, aimStick.y);
      else fire(lastDir.x, lastDir.y);
    }

    /* --- bullets --- */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx; b.y += b.vy; b.life -= dt;
      let dead = b.life <= 0 || b.x < -50 || b.y < -50 || b.x > WORLD_W + 50 || b.y > WORLD_H + 50;
      if (!dead) {
        for (let j = 0; j < zombies.length; j++) {
          const z = zombies[j];
          if (Math.hypot(b.x - z.x, b.y - z.y) < Z_HIT_RADIUS) {
            z.hp -= BULLET_DMG;
            spawnDmg(z.x, z.y - 44, BULLET_DMG, false);
            z.hpfill.style.width = `${Math.max(0, z.hp) / z.maxHp * 100}%`;
            z.el.classList.add("hurt");
            const ze = z.el;
            setTimeout(() => ze.classList.remove("hurt"), 80);
            dead = true;
            if (z.hp <= 0) { maybeDrop(z.x, z.y); killZombie(z, j); }
            break;
          }
        }
      }
      if (dead) { b.el.remove(); bullets.splice(i, 1); }
      else b.el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${b.angle}deg)`;
    }

    /* --- shell casings (gravity + spin + fade) --- */
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.vy += 0.28;                      // gravity
      s.x += s.vx; s.y += s.vy; s.rot += s.vr;
      s.life -= dt;
      if (s.life <= 0) { s.el.remove(); shells.splice(i, 1); continue; }
      s.el.style.opacity = Math.min(1, s.life / 220);
      s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`;
    }

    /* --- zombies --- */
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i];
      const dx = player_state.x - z.x;
      const dy = player_state.y - z.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (dist > Z_CONTACT_DIST) {
        z.x += (dx / dist) * z.speed;
        z.y += (dy / dist) * z.speed;
        z.facing = dirFromVec(dx, dy);
        z.frameTimer += dt;
        if (z.frameTimer >= 160) {
          z.frameTimer = 0;
          z.frame = (z.frame % Z_FRAMES[z.facing]) + 1;
        }
        zSetSprite(z, z.facing, z.frame);
        z.attackTimer = 0;            // fresh wind-up when it next reaches the kitty
      } else {
        // in contact: swing at the kitty, strike at the end of the swing
        z.attackTimer += dt;
        const atk = zombieAttack[z.facing];      // no art for "down"
        if (atk) zSetBg(z, z.attackTimer < Z_ATTACK_MS / 2 ? atk[0] : atk[1]);
        else zSetSprite(z, z.facing, 1);
        if (z.attackTimer >= Z_ATTACK_MS) {
          z.attackTimer = 0;
          player_state.hp -= Z_CONTACT_DMG;
          spawnDmg(player_state.x, player_state.y - 54, Z_CONTACT_DMG, true);
          updateHUD();
          if (player_state.hp <= 0) { gameOver(); break; }
        }
      }
      z.el.style.transform = `translate(${z.x}px, ${z.y}px)`;
    }

    /* --- speed perk countdown --- */
    if (speedTimer > 0) {
      speedTimer -= dt;
      if (speedTimer <= 0) { speedTimer = 0; speedPerk.style.display = "none"; }
      else speedTime.textContent = `${Math.ceil(speedTimer / 1000)}s`;
    }

    /* --- pickups: walk over to store in the inventory (max 5 each) --- */
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (Math.hypot(player_state.x - p.x, player_state.y - p.y) < PICKUP_RADIUS) {
        if (addItem(p.type)) {       // leave it on the ground if that stack is full
          p.el.remove();
          pickups.splice(i, 1);
        }
      }
    }

    /* --- biohazard portal: show ENTER when near the green dungeon --- */
    if (!inBiohazard && portal) {
      const near = Math.hypot(player_state.x - portal.x, player_state.y - portal.y) < ENTER_RADIUS;
      enterBtn.classList.toggle("show", near);
    }

    /* --- wave control --- */
    if (running) {
      if (waveActive) {
        if (spawnRemaining > 0 && zombies.length < MAX_ALIVE) {
          spawnTimer += dt;
          if (spawnTimer >= SPAWN_INTERVAL) {
            spawnTimer = 0;
            spawnZombie();
            spawnRemaining--;
            updateHUD();
          }
        } else if (spawnRemaining === 0 && zombies.length === 0) {
          waveActive = false;
          nextWaveTimer = NEXT_WAVE_MS;
          showBanner(`Wave ${wave} cleared!`);
          updateHUD();
        }
      } else {
        nextWaveTimer -= dt;
        if (nextWaveTimer <= 0) startWave(wave + 1);
      }
    }

    /* --- camera follows the kitty, clamped to map --- */
    const vw = window.innerWidth, vh = window.innerHeight;
    let camX = vw / 2 - player_state.x;
    let camY = vh / 2 - player_state.y;
    camX = Math.min(0, Math.max(vw - WORLD_W, camX));
    camY = Math.min(0, Math.max(vh - WORLD_H, camY));
    world.style.transform = `translate(${camX}px, ${camY}px)`;
  }

  buildInventory();   // 10 empty slots (once)
  placeDungeons();    // overworld decor + the green biohazard portal (once)
  freshState();
  requestAnimationFrame(tick);
})();
