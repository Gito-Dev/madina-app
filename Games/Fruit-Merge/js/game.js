/* ============================================================
   FRUIT MERGE — a Suika-style merge game for Madina 💗
   Dependency-free: custom circle physics + canvas render.
   ============================================================ */
(function () {
  "use strict";

  /* ----------------------------- Config ----------------------------- */
  var W = 640, H = 820;                 // wider aspect so the jar shows wide on screen
  // a big, self-drawn basket
  var WALL_L = 26, WALL_R = 614;        // interior walls (588 wide)
  var RIM_TOP = 128;                    // top of the basket interior
  var FLOOR = 772;                      // basket floor (644 tall interior)
  var LINE_Y = RIM_TOP + 56;            // game-over warning line
  var DROP_Y = 84;                      // where the current ball hovers (above the rim)
  var ASSET = "../assets/";

  // Evolution chain (small -> large) mapped to the real assets.
  // `fill`/`fillH` = fraction of the PNG width/height covered by the fruit
  // (rest is transparent padding). `fill` sizes the in-jar sprite to the
  // physics circle; max(fill,fillH) sizes clipped UI thumbnails without cutting.
  var FRUITS = [
    { name: "Blueberry",  img: "blueberry.png",  r: 18,  score: 5,    coins: 1,  color: "#3a7bff", fill: 0.34, fillH: 0.36 },
    { name: "Radish",     img: "radish.png",     r: 25,  score: 10,   coins: 1,  color: "#ff3f93", fill: 0.35, fillH: 0.39 },
    { name: "Strawberry", img: "straberry.png",  r: 32,  score: 20,   coins: 2,  color: "#ff5a5a", fill: 0.37, fillH: 0.43 },
    { name: "Onion",      img: "onion.png",      r: 40,  score: 35,   coins: 2,  color: "#ff9ec4", fill: 0.40, fillH: 0.42 },
    { name: "Orange",     img: "orange.png",     r: 49,  score: 55,   coins: 3,  color: "#ffa233", fill: 0.38, fillH: 0.42 },
    { name: "Apple",      img: "apple.png",      r: 58,  score: 80,   coins: 4,  color: "#ff5040", fill: 0.43, fillH: 0.45 },
    { name: "Coconut",    img: "coconut.png",    r: 68,  score: 120,  coins: 6,  color: "#b9824f", fill: 0.41, fillH: 0.44 },
    { name: "Pineapple",  img: "pineapple.png",  r: 79,  score: 200,  coins: 8,  color: "#ffd23a", fill: 0.36, fillH: 0.45 },
    { name: "Watermelon", img: "watermelon.png", r: 91,  score: 500,  coins: 15, color: "#49c04f", fill: 0.44, fillH: 0.47 },
    { name: "Gito",       img: "gito-ball.png",  r: 104, score: 1000, coins: 30, color: "#ff5fa8", fill: 0.35, fillH: 0.34 },
    { name: "Madina",     img: "madina-ball.png",r: 122, score: 5000, coins: 60, color: "#ff7eb3", fill: 0.44, fillH: 0.46 },
  ];
  var MAX = FRUITS.length - 1;
  var SPAWN_MAX = 4;                    // only the first 5 fruits spawn from the chute
  var SPRITE = 1.0;                     // sprite matches the circle: fruit touch edge-to-edge, no overlap
  var BOMB_FILL = 0.40;
  var BOMB_CHANCE = 0;                  // bombs never fall from the chute — buy them only
  var BOMB_RADIUS = 130;

  // physics
  var GRAV = 2900, REST = 0.12, WALL_REST = 0.06, AIR = 0.999;
  var SUBSTEPS = 6, ITER = 6;
  var FIXED = 1 / 60;

  var POWERUPS = {
    hammer: { cost: 25,  mode: true },
    bomb:   { cost: 200, mode: true },   // precious: you start with 1, buying more is pricey
    shrink: { cost: 15,  mode: true },
    grow:   { cost: 15,  mode: true },
    undo:   { cost: 35,  mode: false },
    reroll: { cost: 8,   mode: false },
  };

  /* ----------------------------- State ------------------------------ */
  var canvas, ctx, dpr = 1;
  var images = {};
  var bodies = [];
  var idCounter = 1;
  var particles = [];
  var floaters = [];
  var snapshots = [];

  var score = 0, coins = 0, hiScore = 0, biggest = 0, bombs = 1;
  var current = null, next = null;      // droppable descriptors
  var hoverX = W / 2;
  var dropCooldown = 0;
  var overTimer = 0;
  var comboCount = 0, comboTimer = 0;
  var shakeT = 0, shakeMag = 0;
  var toolMode = null;                  // 'hammer' | 'bomb' | 'shrink' | 'grow' | null
  var paused = false, gameOver = false, started = false;
  var acc = 0, lastT = 0;

  /* --------------------------- Utilities ---------------------------- */
  function rand(n) { return Math.floor(Math.random() * n); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function $(id) { return document.getElementById(id); }

  function randDroppable() {
    if (Math.random() < BOMB_CHANCE && started) return { bomb: true };
    return { type: rand(SPAWN_MAX + 1) };
  }

  function massOf(r) { return (r * r) / 260; }

  function makeBody(type, x, y, vx, vy, r) {
    var rr = r || FRUITS[type].r;
    return {
      id: idCounter++, type: type, x: x, y: y, vx: vx || 0, vy: vy || 0,
      r: rr, mass: massOf(rr), invMass: 1 / massOf(rr),
      appear: 0, age: 0, bomb: false, landed: false, dead: false,
      wob: 0, wobPhase: 0, preSpeed: 0, angle: 0, spin: 0,
    };
  }
  function makeBomb(x, y) {
    var b = makeBody(0, x, y, 0, 0, 30);
    b.bomb = true; b.type = -1;
    return b;
  }

  /* --------------------------- Persistence -------------------------- */
  function load() {
    hiScore = parseInt(localStorage.getItem("fm_hi") || "0", 10);
    biggest = parseInt(localStorage.getItem("fm_biggest") || "0", 10);
    var c = localStorage.getItem("fm_coins");
    coins = c === null ? 60 : parseInt(c, 10);   // welcome gift for first run
    var b = localStorage.getItem("fm_bombs");
    bombs = b === null ? 1 : parseInt(b, 10);    // everyone starts with one bomb
  }
  function saveCoins() { localStorage.setItem("fm_coins", String(coins)); }
  function saveBombs() { localStorage.setItem("fm_bombs", String(bombs)); }
  function saveProgress() {
    if (score > hiScore) { hiScore = score; localStorage.setItem("fm_hi", String(hiScore)); }
    localStorage.setItem("fm_biggest", String(biggest));
    saveCoins();
  }

  /* ----------------------------- Assets ----------------------------- */
  function preload(done) {
    var list = FRUITS.map(function (f) { return f.img; }).concat(["bomb.png"]);
    var left = list.length;
    list.forEach(function (src) {
      var im = new Image();
      im.onload = im.onerror = function () { if (--left === 0) done(); };
      im.src = ASSET + src;
      images[src] = im;
    });
  }

  /* ---------------------------- Physics ----------------------------- */
  function integrate(h) {
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      b.vy += GRAV * h;
      b.vx *= AIR; b.vy *= AIR;
      // clamp to avoid tunnelling
      var sp = Math.hypot(b.vx, b.vy), MAXV = 3400;
      if (sp > MAXV) { b.vx = b.vx / sp * MAXV; b.vy = b.vy / sp * MAXV; }
      b.x += b.vx * h; b.y += b.vy * h;
    }
  }

  function resolveWalls(b) {
    if (b.x - b.r < WALL_L) { b.x = WALL_L + b.r; if (b.vx < 0) b.vx = -b.vx * WALL_REST; }
    if (b.x + b.r > WALL_R) { b.x = WALL_R - b.r; if (b.vx > 0) b.vx = -b.vx * WALL_REST; }
    if (b.y + b.r > FLOOR) {
      b.y = FLOOR - b.r;
      if (b.vy > 0) b.vy = -b.vy * WALL_REST;
      b.vx *= 0.88;                 // floor friction
      if (b.bomb) b.landed = true;
    }
  }

  function resolvePair(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    if (d === 0) { dx = 0.01; dy = -0.01; d = 0.0141; }
    var overlap = a.r + b.r - d;
    if (overlap <= 0) return;
    var nx = dx / d, ny = dy / d;
    var tot = a.invMass + b.invMass;
    var corr = (overlap / tot) * 0.8;
    a.x -= nx * corr * a.invMass; a.y -= ny * corr * a.invMass;
    b.x += nx * corr * b.invMass; b.y += ny * corr * b.invMass;
    var velN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (velN < 0) {
      var j = (-(1 + REST) * velN) / tot;
      a.vx -= j * nx * a.invMass; a.vy -= j * ny * a.invMass;
      b.vx += j * nx * b.invMass; b.vy += j * ny * b.invMass;
      // tangential (Coulomb) friction so fruits grip each other and stop rolling
      var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      var tvx = rvx - (rvx * nx + rvy * ny) * nx;
      var tvy = rvy - (rvx * nx + rvy * ny) * ny;
      var tl = Math.hypot(tvx, tvy);
      if (tl > 0.001) {
        var tx = tvx / tl, ty = tvy / tl;
        var jt = clamp(-(rvx * tx + rvy * ty) / tot, -j * 0.6, j * 0.6);
        a.vx -= jt * tx * a.invMass; a.vy -= jt * ty * a.invMass;
        b.vx += jt * tx * b.invMass; b.vy += jt * ty * b.invMass;
      }
    }
    if (a.bomb || b.bomb) { a.landed = a.bomb || a.landed; b.landed = b.bomb || b.landed; }
  }

  function collide() {
    for (var it = 0; it < ITER; it++) {
      for (var i = 0; i < bodies.length; i++) resolveWalls(bodies[i]);
      for (i = 0; i < bodies.length; i++)
        for (var k = i + 1; k < bodies.length; k++)
          resolvePair(bodies[i], bodies[k]);
    }
  }

  function physicsStep(dt) {
    var i, b;
    for (i = 0; i < bodies.length; i++) bodies[i].preSpeed = Math.hypot(bodies[i].vx, bodies[i].vy);
    var h = dt / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) { integrate(h); collide(); }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.age += dt;
      if (b.appear < 1) b.appear = Math.min(1, b.appear + dt / 0.18);
      // decay any existing wobble
      if (b.wob > 0.001) { b.wob *= 0.90; b.wobPhase += dt; } else b.wob = 0;
      // a sudden stop = an impact -> trigger a little jelly wobble
      var sp = Math.hypot(b.vx, b.vy);
      if (b.preSpeed - sp > 170 && b.preSpeed > 230 && !b.bomb) {
        b.wob = clamp(b.preSpeed / 2400, 0.07, 0.32); b.wobPhase = 0;
      }
      // kill micro-drift so settled fruits stay put
      if (sp < 14) { b.vx *= 0.5; b.vy *= 0.5; }
      // rolling: spin follows horizontal motion (roll-without-slip), eases to rest
      var targetSpin = b.vx / b.r;
      b.spin += (targetSpin - b.spin) * 0.25;
      if (Math.abs(b.spin) < 0.02) b.spin = 0;
      b.angle += b.spin * dt;
    }
    handleBombs();
    handleMerges();
    checkGameOver(dt);
    if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) comboCount = 0; }
  }

  /* --------------------------- Merging ------------------------------ */
  function handleMerges() {
    var consumed = {};
    var spawns = [];
    for (var i = 0; i < bodies.length; i++) {
      var a = bodies[i];
      if (a.bomb || consumed[a.id]) continue;
      for (var k = i + 1; k < bodies.length; k++) {
        var b = bodies[k];
        if (b.bomb || consumed[b.id] || a.type !== b.type) continue;
        if (dist(a.x, a.y, b.x, b.y) <= a.r + b.r + 2) {
          consumed[a.id] = consumed[b.id] = true;
          spawns.push({ a: a, b: b, type: a.type });
          break;
        }
      }
    }
    if (!spawns.length) return;
    bodies = bodies.filter(function (b) { return !consumed[b.id]; });
    spawns.forEach(function (m) { doMerge(m.a, m.b, m.type); });
  }

  function doMerge(a, b, type) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

    // combo bookkeeping (chained merges within the window stack up)
    comboCount = comboTimer > 0 ? comboCount + 1 : 1;
    comboTimer = 0.7;
    var mult = comboCount;

    if (type >= MAX) {
      // Two Gito balls -> SUPERNOVA (no asset beyond this tier)
      var gain = 20000 * mult;
      score += gain; coins += 1;
      addFloater(mx, my, "SUPERNOVA!", "#ffe066", 28);
      addFloater(mx, my + 30, "+" + gain, "#fff", 18);
      burst(mx, my, "#ffe066", 60); burst(mx, my, "#ff7eb3", 40);
      explode(mx, my, 220, true);
      shake(26, 0.6);
      if (window.SFX) SFX.legendary();
      bumpHud(); return;
    }

    var nt = type + 1;
    var nb = makeBody(nt, mx, my, (a.vx + b.vx) * 0.4, (a.vy + b.vy) * 0.4 - 40);
    nb.appear = 0; nb.wob = 0.32; nb.wobPhase = 0;
    bodies.push(nb);

    var gain = FRUITS[nt].score * mult;
    score += gain;
    coins += 1;                          // exactly one coin per merge
    if (nt > biggest) biggest = nt;

    burst(mx, my, FRUITS[type].color, 12 + type * 2);
    ring(mx, my, FRUITS[nt].color, FRUITS[nt].r * 0.5);
    addFloater(mx, my, "+" + gain, "#fff", 14 + Math.min(type, 8));

    if (window.SFX) { SFX.pop(nt); SFX.coin(); }

    if (mult >= 3) {
      var bonus = 100 * mult;
      score += bonus;
      addFloater(mx, my - 34, "COMBO x" + mult + "  +" + bonus, "#5ef1ff", 18);
      burst(mx, my, "#5ef1ff", 24);
      shake(10 + mult, 0.4);
      if (window.SFX) SFX.combo(mult);
    }
    if (nt >= 9) {                       // special-ball reveal
      addFloater(mx, my - 30, FRUITS[nt].name + "!", FRUITS[nt].color, 22);
      burst(mx, my, FRUITS[nt].color, 40);
      shake(16, 0.5);
      if (window.SFX) SFX.legendary();
    }
    bumpHud();
  }

  /* ----------------------------- Bombs ------------------------------ */
  function handleBombs() {
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.bomb && b.landed && b.age > 0.15) {
        explode(b.x, b.y, BOMB_RADIUS, false);
        b.dead = true;
      }
    }
    if (bodies.some(function (b) { return b.dead; }))
      bodies = bodies.filter(function (b) { return !b.dead; });
  }

  function explode(x, y, radius, megablast) {
    var gain = 0, n = 0;
    bodies = bodies.filter(function (b) {
      if (b.bomb) return true;
      if (!megablast && b.type >= 9) return true;   // bombs spare the special balls
      if (dist(x, y, b.x, b.y) <= radius + b.r) {
        gain += Math.max(3, FRUITS[b.type] ? FRUITS[b.type].score / 4 : 3);
        burst(b.x, b.y, FRUITS[b.type] ? FRUITS[b.type].color : "#ff8a3a", 10);
        n++;
        return false;
      }
      return true;
    });
    // shockwave nudge
    bodies.forEach(function (b) {
      var d = dist(x, y, b.x, b.y);
      if (d < radius * 2 && d > 0) {
        var f = (1 - d / (radius * 2)) * 900;
        b.vx += ((b.x - x) / d) * f; b.vy += ((b.y - y) / d) * f;
      }
    });
    score += Math.round(gain);
    burst(x, y, "#ffae3a", 40); burst(x, y, "#fff", 20);
    smoke(x, y);
    shake(18, 0.5);
    if (window.SFX) SFX.bomb();
    if (n) addFloater(x, y, "BOOM +" + Math.round(gain), "#ffae3a", 18);
    bumpHud();
  }

  /* --------------------------- Game over ---------------------------- */
  function checkGameOver(dt) {
    var danger = false;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.bomb) continue;
      var settled = Math.hypot(b.vx, b.vy) < 45;
      if (b.age > 0.8 && settled && b.y - b.r < LINE_Y) { danger = true; break; }
    }
    if (danger) {
      overTimer += dt;
      if (overTimer >= 3) endGame();
    } else if (overTimer > 0) {
      overTimer = Math.max(0, overTimer - dt * 1.5);
    }
  }

  function endGame() {
    if (gameOver) return;
    gameOver = true;
    saveProgress();
    if (window.SFX) SFX.over();
    $("finalScore").textContent = score;
    $("finalHi").textContent = hiScore;
    $("finalCoins").textContent = coins;
    $("finalBig").textContent = FRUITS[biggest] ? FRUITS[biggest].name : "Blueberry";
    $("overlay").classList.add("show");
  }

  /* ----------------------------- Effects ---------------------------- */
  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 280;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0, max: 0.5 + Math.random() * 0.5, color: color,
        r: 2 + Math.random() * 4, kind: "spark",
      });
    }
  }
  function ring(x, y, color, r0) {
    particles.push({ x: x, y: y, vx: 0, vy: 0, life: 0, max: 0.42, color: color, r: r0 || 8, kind: "ring" });
  }
  function smoke(x, y) {
    for (var i = 0; i < 14; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 80,
        life: 0, max: 0.7 + Math.random() * 0.6, color: "rgba(120,120,130,0.6)",
        r: 10 + Math.random() * 18, kind: "smoke",
      });
    }
  }
  function addFloater(x, y, text, color, size) {
    floaters.push({ x: x, y: y, text: text, color: color, size: size || 16, life: 0, max: 1.1 });
  }
  function shake(mag, t) { shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, t); }

  function stepEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      if (p.kind === "ring") { p.r += 520 * dt; continue; }
      p.vy += (p.kind === "smoke" ? -20 : 700) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.98;
    }
    for (i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life += dt; f.y -= 24 * dt;
      if (f.life >= f.max) floaters.splice(i, 1);
    }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
  }

  /* --------------------------- Dropping ----------------------------- */
  function canDrop() {
    return !gameOver && !paused && !toolMode && dropCooldown <= 0 && started;
  }
  function drop() {
    if (!canDrop()) return;
    snapshot();
    var b;
    if (current.bomb) b = makeBomb(hoverX, DROP_Y);
    else b = makeBody(current.type, hoverX, DROP_Y, 0, 30);
    bodies.push(b);
    if (window.SFX) SFX.drop();
    current = next; next = randDroppable();
    dropCooldown = 0.42;
    renderNext();
  }

  /* ----------------------------- Tools ------------------------------ */
  function pickBody(x, y) {
    for (var i = bodies.length - 1; i >= 0; i--) {
      var b = bodies[i];
      if (dist(x, y, b.x, b.y) <= b.r) return b;
    }
    return null;
  }
  function canAfford(name) {
    if (name === "bomb" && bombs > 0) return true;   // spend inventory first
    return coins >= POWERUPS[name].cost;
  }
  function setTool(name) {
    if (gameOver || paused || !started) return;
    if (toolMode === name) { cancelTool(); return; }
    if (!canAfford(name)) { flashCoins(); if (window.SFX) SFX.error(); return; }
    if (!POWERUPS[name].mode) { instantPower(name); return; }
    toolMode = name;
    $("toolHint").textContent = "TAP A FRUIT  •  " + name.toUpperCase();
    $("toolHint").classList.add("show");
    updateToolButtons();
  }
  function cancelTool() {
    toolMode = null;
    $("toolHint").classList.remove("show");
    updateToolButtons();
  }
  function applyToolAt(x, y) {
    var name = toolMode;
    if (name === "bomb") {
      if (!canAfford("bomb")) return cancelTool();
      snapshot();
      if (bombs > 0) { bombs--; saveBombs(); }   // use a stocked bomb…
      else { coins -= POWERUPS.bomb.cost; saveCoins(); }   // …otherwise buy one
      explode(x, y, BOMB_RADIUS, false);
      if (window.SFX) SFX.powerup();
      cancelTool(); bumpHud(); return;
    }
    var b = pickBody(x, y);
    if (!b || b.bomb) { return; }      // miss: keep tool armed
    if (coins < POWERUPS[name].cost) return cancelTool();
    snapshot(); coins -= POWERUPS[name].cost; saveCoins();
    if (name === "hammer") {
      burst(b.x, b.y, FRUITS[b.type] ? FRUITS[b.type].color : "#fff", 24);
      b.dead = true;
      bodies = bodies.filter(function (x) { return !x.dead; });
    } else if (name === "shrink") {
      b.r = Math.max(FRUITS[0].r * 0.8, b.r * 0.7);
      b.mass = massOf(b.r); b.invMass = 1 / b.mass; b.appear = 0.6;
      burst(b.x, b.y, "#7CFC00", 14);
    } else if (name === "grow") {
      b.r = b.r * 1.32;
      b.mass = massOf(b.r); b.invMass = 1 / b.mass; b.appear = 0.6;
      burst(b.x, b.y, "#ffd23a", 14);
    }
    if (window.SFX) SFX.powerup();
    cancelTool(); bumpHud();
  }
  function instantPower(name) {
    if (name === "reroll") {
      coins -= POWERUPS.reroll.cost; saveCoins();
      current = randDroppable();
      if (window.SFX) SFX.powerup();
      bumpHud(); return;
    }
    if (name === "undo") {
      if (!snapshots.length) { if (window.SFX) SFX.error(); return; }
      coins -= POWERUPS.undo.cost; saveCoins();
      restore(snapshots.pop());
      if (window.SFX) SFX.powerup();
      bumpHud();
    }
  }

  /* --------------------------- Snapshots ---------------------------- */
  function snapshot() {
    snapshots.push({
      bodies: bodies.map(function (b) {
        return { type: b.type, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, bomb: b.bomb };
      }),
      score: score, coins: coins, biggest: biggest, bombs: bombs,
      current: current, next: next,
    });
    if (snapshots.length > 3) snapshots.shift();
  }
  function restore(s) {
    bodies = s.bodies.map(function (d) {
      var b = d.bomb ? makeBomb(d.x, d.y) : makeBody(d.type, d.x, d.y, d.vx, d.vy, d.r);
      b.appear = 1; return b;
    });
    score = s.score; biggest = s.biggest;
    if (s.bombs !== undefined) { bombs = s.bombs; saveBombs(); }
    current = s.current; next = s.next;
    overTimer = 0; comboCount = 0; comboTimer = 0;
    renderNext();
  }

  /* ---------------------------- Rendering --------------------------- */
  // jar metrics shared by the back and front passes
  function jarM() {
    var L = WALL_L, R = WALL_R;
    return { L: L, R: R, top: RIM_TOP, bot: FLOOR, cx: (L + R) / 2, halfW: (R - L) / 2, ry: 19, botR: 56 };
  }
  // trace the jar body: straight sides, rounded bowl bottom, open at the top
  function jarBody(m) {
    ctx.beginPath();
    ctx.moveTo(m.L, m.top);
    ctx.lineTo(m.L, m.bot - m.botR);
    ctx.arcTo(m.L, m.bot, m.L + m.botR, m.bot, m.botR);
    ctx.lineTo(m.R - m.botR, m.bot);
    ctx.arcTo(m.R, m.bot, m.R, m.bot - m.botR, m.botR);
    ctx.lineTo(m.R, m.top);
  }

  // back of the jar — drawn BEFORE the fruit (interior, walls, far lip)
  function drawJarBack() {
    var m = jarM();
    ctx.save();
    // glossy interior
    var g = ctx.createLinearGradient(0, m.top, 0, m.bot);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(0.5, "rgba(255,200,225,0.12)");
    g.addColorStop(1, "rgba(255,150,200,0.22)");
    jarBody(m); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    // mouth opening (slightly deeper tint = depth)
    ctx.beginPath(); ctx.ellipse(m.cx, m.top, m.halfW, m.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,168,205,0.28)"; ctx.fill();

    // weave slats + glass shine, clipped to the body
    ctx.save(); jarBody(m); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 2;
    for (var sx = m.L + 24; sx < m.R; sx += 36) {
      ctx.beginPath(); ctx.moveTo(sx, m.top); ctx.lineTo(sx, m.bot); ctx.stroke();
    }
    var hg = ctx.createLinearGradient(m.L, 0, m.L + m.halfW, 0);
    hg.addColorStop(0, "rgba(255,255,255,0.22)"); hg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hg; ctx.fillRect(m.L, m.top, m.halfW * 0.55, m.bot - m.top);
    ctx.restore();

    // glowing wall (open top)
    ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,126,179,0.92)";
    ctx.shadowColor = "rgba(255,126,179,0.6)"; ctx.shadowBlur = 16;
    jarBody(m); ctx.stroke();
    ctx.shadowBlur = 0;

    // far lip (top half of the mouth) behind the fruit
    ctx.lineWidth = 11;
    ctx.strokeStyle = "rgba(255,143,190,0.95)";
    ctx.beginPath(); ctx.ellipse(m.cx, m.top, m.halfW, m.ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // front of the jar — drawn AFTER the fruit so they slip in under the near lip
  function drawJarFront() {
    var m = jarM();
    ctx.save();
    ctx.lineCap = "round";
    // near lip (bottom half of the mouth)
    ctx.lineWidth = 13;
    ctx.strokeStyle = "rgba(255,126,179,0.98)";
    ctx.shadowColor = "rgba(255,126,179,0.55)"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(m.cx, m.top, m.halfW, m.ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // glossy shine on the lip
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.ellipse(m.cx, m.top, m.halfW - 3, m.ry - 3, 0, Math.PI * 0.12, Math.PI * 0.5);
    ctx.stroke();
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLine() {
    var warn = overTimer > 0;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    var pulse = warn ? 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 120)) : 0.45;
    ctx.strokeStyle = warn ? "rgba(255,60,90," + pulse + ")" : "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.moveTo(WALL_L, LINE_Y); ctx.lineTo(WALL_R, LINE_Y); ctx.stroke();
    ctx.restore();
    if (warn) {
      ctx.save();
      ctx.fillStyle = "rgba(255,60,90," + pulse + ")";
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("! DANGER !", W / 2, LINE_Y - 10);
      ctx.restore();
    }
  }

  function drawBody(b) {
    var pop = b.appear < 1 ? easeOutBack(b.appear) : 1;
    var fill = b.bomb ? BOMB_FILL : FRUITS[b.type].fill;
    var img = b.bomb ? images["bomb.png"] : images[FRUITS[b.type].img];
    // wobble = a squash/stretch that preserves area (lands flat, springs back)
    var osc = b.wob > 0.001 ? Math.cos(b.wobPhase * 22) * b.wob : 0;
    var sx = pop * (1 + osc * 0.7);
    var sy = pop * (1 - osc * 0.7);
    // draw the sprite big enough that its opaque content matches the physics circle
    var vis = (b.r * SPRITE) / fill;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(sx, sy);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -vis, -vis, vis * 2, vis * 2);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.bomb ? "#333" : FRUITS[b.type].color; ctx.fill();
    }
    ctx.restore();
  }

  function drawHover() {
    if (!current || !canDrop()) {
      // still show a dimmed preview during cooldown
    }
    var r = current.bomb ? 30 : FRUITS[current.type].r;
    var x = clamp(hoverX, WALL_L + r, WALL_R - r);
    // guide line
    ctx.save();
    ctx.setLineDash([4, 10]); ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, DROP_Y + r); ctx.lineTo(x, FLOOR); ctx.stroke();
    ctx.restore();
    var img = current.bomb ? images["bomb.png"] : images[FRUITS[current.type].img];
    var fill = current.bomb ? BOMB_FILL : FRUITS[current.type].fill;
    var vis = (r * SPRITE) / fill;
    var a = canDrop() ? 1 : 0.5;
    ctx.save(); ctx.globalAlpha = a;
    if (img && img.complete) ctx.drawImage(img, x - vis, DROP_Y - vis, vis * 2, vis * 2);
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], t = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, t);
      if (p.kind === "ring") {
        ctx.lineWidth = 4 * t + 1;
        ctx.strokeStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (p.kind === "smoke" ? 1 + (1 - t) : 1), 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i], t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - Math.max(0, (t - 0.6) / 0.4);
      ctx.font = f.size + "px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeMag > 0) {
      var s = shakeMag * (shakeT > 0 ? 1 : 0);
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawJarBack();
    drawLine();
    for (var i = 0; i < bodies.length; i++) drawBody(bodies[i]);
    if (started && !gameOver) drawHover();
    drawJarFront();              // rim drawn over fruit -> they slip in through the entrance
    drawParticles();
    drawFloaters();
    ctx.restore();
  }

  /* ------------------------------ HUD ------------------------------- */
  var hudDirty = true;
  function bumpHud() { hudDirty = true; }
  function syncHud() {
    if (!hudDirty) return;
    hudDirty = false;
    if (score > hiScore) { hiScore = score; localStorage.setItem("fm_hi", String(hiScore)); }
    $("score").textContent = score;
    $("coins").textContent = coins;
    $("hi").textContent = hiScore;
    updateToolButtons();
    updateGuide();
  }
  function buildGuide() {
    var g = $("guide");
    if (!g) return;
    g.innerHTML = "";
    FRUITS.forEach(function (f, i) {
      var s = document.createElement("span");
      s.className = "g-fruit";
      s.style.backgroundImage = "url(" + ASSET + f.img + ")";
      s.style.backgroundSize = Math.round(92 / Math.max(f.fill, f.fillH)) + "%";
      s.dataset.i = i;
      g.appendChild(s);
    });
  }
  function updateGuide() {
    var g = $("guide");
    if (!g) return;
    [].forEach.call(g.children, function (s) {
      s.classList.toggle("reached", parseInt(s.dataset.i, 10) <= biggest);
    });
  }
  function renderNext() {
    if (!next) return;
    var f = next.bomb ? null : FRUITS[next.type];
    var img = next.bomb ? "bomb.png" : f.img;
    var maxFill = next.bomb ? BOMB_FILL : Math.max(f.fill, f.fillH);
    var box = $("nextImg");
    box.style.backgroundImage = "url(" + ASSET + img + ")";
    box.style.backgroundSize = Math.round(94 / maxFill) + "%";  // fit whole fruit, no clipping
  }
  function updateToolButtons() {
    [].forEach.call(document.querySelectorAll(".pu"), function (el) {
      var name = el.dataset.pu;
      el.classList.toggle("disabled", !canAfford(name));
      el.classList.toggle("armed", toolMode === name);
    });
    // bomb shows its stock as a badge; price only appears once you're out
    var puBomb = document.querySelector('.pu[data-pu="bomb"]');
    var badge = $("bombBadge"), bcost = puBomb.querySelector(".cost");
    if (bombs > 0) {
      badge.style.display = "block"; badge.textContent = "x" + bombs;
      bcost.style.display = "none";
    } else {
      badge.style.display = "none";
      bcost.style.display = ""; bcost.textContent = POWERUPS.bomb.cost;
    }
  }
  function flashCoins() {
    var c = $("coinChip");
    c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
  }

  /* ----------------------------- Input ------------------------------ */
  function toLocal(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return { x: (cx - rect.left) / rect.width * W, y: (cy - rect.top) / rect.height * H };
  }
  var suppressNextDrop = false;
  function onMove(e) {
    var p = toLocal(e);
    hoverX = clamp(p.x, WALL_L, WALL_R);
  }
  function onDown(e) {
    if (window.SFX) SFX.resume();
    var p = toLocal(e);
    if (toolMode) { applyToolAt(p.x, p.y); suppressNextDrop = true; e.preventDefault(); return; }
    hoverX = clamp(p.x, WALL_L, WALL_R);
  }
  function onUp(e) {
    if (suppressNextDrop) { suppressNextDrop = false; return; }
    if (toolMode || gameOver || paused) return;
    drop();
  }

  /* ---------------------------- New game ---------------------------- */
  function newGame() {
    bodies = []; particles = []; floaters = []; snapshots = [];
    score = 0; biggest = 0; comboCount = 0; comboTimer = 0;
    overTimer = 0; dropCooldown = 0; toolMode = null;
    gameOver = false; paused = false; started = true;
    current = randDroppable(); next = randDroppable();
    $("overlay").classList.remove("show");
    cancelTool();
    renderNext();
    bumpHud();
  }

  /* ---------------------------- Main loop --------------------------- */
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = lastT ? (t - lastT) / 1000 : 0;
    lastT = t;
    dt = Math.min(dt, 0.05);
    if (!paused && started && !gameOver) {
      if (dropCooldown > 0) dropCooldown -= dt;
      acc += dt;
      var guard = 0;
      while (acc >= FIXED && guard++ < 5) { physicsStep(FIXED); acc -= FIXED; }
    }
    stepEffects(dt);
    syncHud();
    render();
  }

  /* ------------------------------ Setup ----------------------------- */
  function resize() {
    // measure the surrounding UI so the jar fills the remaining space exactly
    // (robust across phones and iPad, where the bars/fonts are taller)
    function h(sel) { var el = document.querySelector(sel); return el ? el.offsetHeight : 0; }
    var chromeH = h(".hud") + h("#guide") + h(".bar-title") + h(".powerbar") + 56;
    var maxW = Math.min(window.innerWidth - 16, 900);
    var maxH = window.innerHeight - chromeH;
    var scale = Math.min(maxW / W, maxH / H);
    var dw = Math.round(W * scale), dh = Math.round(H * scale);
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
    // align the HUD / guide / power bar to the exact jar width
    var wrap = document.querySelector(".wrap");
    if (wrap) wrap.style.setProperty("--game-w", dw + "px");
  }

  function setupCanvas() {
    canvas = $("game");
    ctx = canvas.getContext("2d");
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    resize();
  }

  function bindUI() {
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("touchmove", function (e) { onMove(e); e.preventDefault(); }, { passive: false });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && started && !gameOver) {
        paused = true;
        $("pauseBtn").textContent = "▶";
        $("pauseOverlay").classList.add("show");
      }
    });

    [].forEach.call(document.querySelectorAll(".pu"), function (el) {
      el.addEventListener("click", function () { setTool(el.dataset.pu); });
    });

    $("pauseBtn").addEventListener("click", function () {
      paused = !paused;
      $("pauseBtn").textContent = paused ? "▶" : "❚❚";
      $("pauseOverlay").classList.toggle("show", paused);
    });
    $("resumeBtn").addEventListener("click", function () {
      paused = false; $("pauseBtn").textContent = "❚❚";
      $("pauseOverlay").classList.remove("show");
    });
    $("muteBtn").addEventListener("click", function () {
      var m = !(window.SFX && SFX.isMuted());
      if (window.SFX) SFX.setMuted(m);
      $("muteBtn").textContent = m ? "🔇" : "🔊";
    });
    if (window.SFX) $("muteBtn").textContent = SFX.isMuted() ? "🔇" : "🔊";

    $("againBtn").addEventListener("click", newGame);
    $("startBtn").addEventListener("click", function () {
      $("intro").classList.remove("show");
      if (window.SFX) SFX.resume();
      newGame();
    });

    // cancel an armed tool by tapping outside the canvas/powerups
    document.addEventListener("pointerdown", function (e) {
      if (!toolMode) return;
      if (e.target.closest("#game") || e.target.closest(".pu")) return;
      cancelTool();
    });
  }

  function start() {
    load();
    setupCanvas();
    buildGuide();
    bindUI();
    $("hi").textContent = hiScore;
    $("coins").textContent = coins;
    $("intro").classList.add("show");
    // re-fit once the pixel font loads (it changes bar heights)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
    window.addEventListener("load", resize);
    preload(function () { resize(); requestAnimationFrame(loop); });
  }

  document.addEventListener("DOMContentLoaded", start);
})();
