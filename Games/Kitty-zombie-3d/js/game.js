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
  const Z_CONTACT_DIST = 86;      // world px to be "touching" the kitty
  const Z_HIT_RADIUS   = 56;      // bullet collision radius
  const MAX_ALIVE      = 24;
  const SPAWN_INTERVAL = 850;     // ms between spawns within a wave
  const NEXT_WAVE_MS   = 2600;    // pause between waves

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

  /* ---------------- DOM ---------------- */
  const world    = document.getElementById("world");
  const player   = document.getElementById("player");
  const knob     = document.getElementById("knob");
  const aimKnob  = document.getElementById("aimKnob");
  const joyEl    = document.getElementById("joystick");
  const aimEl    = document.getElementById("aimStick");
  const shootBtn = document.getElementById("shootBtn");
  const hpFill   = document.getElementById("hpFill");
  const waveNum  = document.getElementById("waveNum");
  const waveSub  = document.getElementById("waveSub");
  const killsEl  = document.getElementById("kills");
  const banner   = document.getElementById("banner");
  const overlay  = document.getElementById("overlay");
  const overTitle= document.getElementById("overTitle");
  const overSub  = document.getElementById("overSub");
  const restartBtn = document.getElementById("restartBtn");

  /* ---------------- Game state ---------------- */
  let player_state, zombies, bullets, wave, spawnRemaining, spawnTimer,
      nextWaveTimer, waveActive, kills, fireTimer, facing, lastDir, running;

  function freshState() {
    player_state = { x: WORLD_W / 2, y: WORLD_H / 2, hp: PLAYER_MAX_HP };
    // remove any leftover DOM nodes
    if (zombies) zombies.forEach((z) => z.el.remove());
    if (bullets) bullets.forEach((b) => b.el.remove());
    zombies = [];
    bullets = [];
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

  /* ---------------- Shoot button ---------------- */
  let shootHeld = false;
  let spaceHeld = false;
  const press = (e) => { e.preventDefault(); shootHeld = true; };
  const release = (e) => { if (e) e.preventDefault(); shootHeld = false; };
  shootBtn.addEventListener("touchstart", press, { passive: false });
  shootBtn.addEventListener("touchend", release);
  shootBtn.addEventListener("touchcancel", release);
  shootBtn.addEventListener("mousedown", press);
  window.addEventListener("mouseup", () => (shootHeld = false));

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
    const el = document.createElement("div");
    el.className = "projectile";
    world.appendChild(el);
    const b = {
      x: player_state.x + m.x,
      y: player_state.y + m.y,
      vx: nx * BULLET_SPEED,
      vy: ny * BULLET_SPEED,
      life: BULLET_LIFE_MS,
      el,
    };
    el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    bullets.push(b);
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
    const ringR = Math.max(window.innerWidth, window.innerHeight) / 2 + 140;
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

  function zSetSprite(z, dir, n) {
    const bg = zombieSprites[dir][n];
    if (bg !== z.curBg) { z.sprite.style.backgroundImage = bg; z.curBg = bg; }
  }

  function killZombie(z, i) {
    z.el.style.setProperty("--zx", `${z.x}px`);
    z.el.style.setProperty("--zy", `${z.y}px`);
    z.el.classList.add("dying");
    const el = z.el;
    setTimeout(() => el.remove(), 300);
    zombies.splice(i, 1);
    kills++;
    updateHUD();
  }

  /* ---------------- HUD / banner ---------------- */
  function updateHUD() {
    hpFill.style.width = `${Math.max(0, player_state.hp) / PLAYER_MAX_HP * 100}%`;
    killsEl.textContent = kills;
    const remaining = spawnRemaining + zombies.length;
    waveSub.textContent = waveActive ? `Zombies left: ${remaining}` : "Get ready…";
  }
  let bannerTimer = null;
  function showBanner(text) {
    banner.textContent = text;
    banner.classList.remove("show");
    void banner.offsetWidth;            // restart the animation
    banner.classList.add("show");
  }

  function gameOver() {
    running = false;
    shootHeld = false;
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
      player_state.x = Math.max(0, Math.min(WORLD_W, player_state.x + mvx * PLAYER_SPEED));
      player_state.y = Math.max(0, Math.min(WORLD_H, player_state.y + mvy * PLAYER_SPEED));
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
    const wantsFire = aiming || shootHeld || spaceHeld;
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
            z.hpfill.style.width = `${Math.max(0, z.hp) / z.maxHp * 100}%`;
            z.el.classList.add("hurt");
            const ze = z.el;
            setTimeout(() => ze.classList.remove("hurt"), 80);
            dead = true;
            if (z.hp <= 0) killZombie(z, j);
            break;
          }
        }
      }
      if (dead) { b.el.remove(); bullets.splice(i, 1); }
      else b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
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
      } else {
        // in contact: attack the kitty
        zSetSprite(z, z.facing, 1);
        z.attackTimer += dt;
        if (z.attackTimer >= Z_ATTACK_MS) {
          z.attackTimer = 0;
          player_state.hp -= Z_CONTACT_DMG;
          updateHUD();
          if (player_state.hp <= 0) { gameOver(); break; }
        }
      }
      z.el.style.transform = `translate(${z.x}px, ${z.y}px)`;
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

  freshState();
  requestAnimationFrame(tick);
})();
