/* ============================================================
   Fruit Merge — tiny Web Audio SFX engine (no audio files)
   All sounds are synthesised so the game stays dependency-free.
   ============================================================ */
(function () {
  "use strict";

  var ctx = null;
  var master = null;
  var muted = localStorage.getItem("fm_muted") === "1";

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  // Browsers suspend audio until a gesture — resume on first interaction.
  function resume() {
    var c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    var c = ensure();
    if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, lp) {
    var c = ensure();
    if (!c || muted) return;
    var t0 = c.currentTime;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lp || 1200;
    var g = c.createGain();
    g.gain.value = vol || 0.4;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0);
  }

  var SFX = {
    resume: resume,
    // Merge pop — pitch climbs with the fruit tier for a satisfying scale.
    pop: function (tier) {
      var base = 320 + tier * 55;
      tone(base, 0.18, "sine", 0.32, base * 1.7);
      tone(base * 1.5, 0.12, "triangle", 0.16, base * 2.2, 0.02);
    },
    drop: function () {
      tone(180, 0.1, "sine", 0.22, 110);
      noise(0.06, 0.12, 700);
    },
    bomb: function () {
      noise(0.5, 0.6, 900);
      tone(90, 0.45, "sawtooth", 0.4, 40);
    },
    powerup: function () {
      tone(520, 0.1, "square", 0.18, 880);
      tone(880, 0.12, "square", 0.16, 1320, 0.08);
    },
    coin: function () {
      tone(1050, 0.07, "square", 0.14, 1400);
    },
    combo: function (n) {
      var b = 440 + n * 80;
      tone(b, 0.12, "triangle", 0.25, b * 1.5);
      tone(b * 1.5, 0.14, "sine", 0.2, b * 2, 0.07);
    },
    legendary: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone(f, 0.5, "triangle", 0.26, f, i * 0.1);
      });
    },
    over: function () {
      [440, 349, 261, 174].forEach(function (f, i) {
        tone(f, 0.4, "sawtooth", 0.28, f * 0.9, i * 0.16);
      });
    },
    error: function () {
      tone(200, 0.12, "square", 0.18, 140);
    },
    setMuted: function (m) {
      muted = m;
      localStorage.setItem("fm_muted", m ? "1" : "0");
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted: function () {
      return muted;
    },
  };

  window.SFX = SFX;
})();
