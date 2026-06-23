/* ---------------------------------------------------------------
   Background music + always-visible mute button & volume control.
   Looping game track (default 40% volume), shared across all pages.
   State (muted + volume + playback position) persists via
   localStorage so the music carries over seamlessly between pages.
--------------------------------------------------------------- */
(function () {
  "use strict";

  var SRC = "../assets/audio/game-track.mp3";
  var VOLUME = 0.4;
  var KEY_MUTED = "kd_music_muted";
  var KEY_TIME = "kd_music_time";
  var KEY_VOL = "kd_music_vol";

  // ---------- audio ----------
  var audio = new Audio(SRC);
  audio.loop = true;
  audio.preload = "auto";

  var vol = parseFloat(localStorage.getItem(KEY_VOL));
  if (isNaN(vol)) vol = VOLUME;
  vol = Math.max(0, Math.min(1, vol));
  audio.volume = vol;

  var muted = localStorage.getItem(KEY_MUTED) === "1";
  audio.muted = muted;

  // resume from where the track was on the previous page
  var savedTime = parseFloat(localStorage.getItem(KEY_TIME) || "0");
  if (savedTime > 0) {
    audio.addEventListener("loadedmetadata", function () {
      if (isFinite(audio.duration) && savedTime < audio.duration) {
        try { audio.currentTime = savedTime; } catch (e) {}
      }
    });
  }

  function tryPlay() {
    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        // Autoplay blocked — start on the first user interaction.
        var resume = function () {
          audio.play().catch(function () {});
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
          window.removeEventListener("touchstart", resume);
        };
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
        window.addEventListener("touchstart", resume);
      });
    }
  }

  // keep the playback position fresh for the next page
  setInterval(function () {
    if (!audio.paused) localStorage.setItem(KEY_TIME, String(audio.currentTime));
  }, 1000);
  window.addEventListener("pagehide", function () {
    localStorage.setItem(KEY_TIME, String(audio.currentTime));
  });

  // ---------- styles ----------
  var css =
    ".kd-mute-btn{" +
      "position:fixed;top:14px;right:14px;z-index:9999;" +
      "width:48px;height:48px;cursor:pointer;" +
      "display:flex;align-items:center;justify-content:center;" +
      "font-family:'Press Start 2P',monospace;font-size:1.1rem;line-height:1;" +
      "color:#fff;background:linear-gradient(180deg,#ff7eb3 0%,#e23e7a 100%);" +
      "border:3px solid #5b2740;border-radius:0;" +
      "box-shadow:3px 3px 0 rgba(91,39,64,.45);" +
      "text-shadow:1px 1px 0 rgba(91,39,64,.5);" +
      "-webkit-user-select:none;user-select:none;transition:transform .08s ease,box-shadow .08s ease;" +
    "}" +
    ".kd-mute-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 rgba(91,39,64,.45);}" +
    ".kd-mute-btn.muted{background:linear-gradient(180deg,#d9c2cf 0%,#a98aa0 100%);}" +
    // diagonal slash shown when muted
    ".kd-mute-btn.muted::after{content:'';position:absolute;width:54px;height:4px;" +
      "background:#fff;box-shadow:0 0 0 2px #5b2740;transform:rotate(-45deg);}" +
    // volume control sitting just left of the mute button
    ".kd-vol{position:fixed;top:14px;right:72px;z-index:9999;height:48px;" +
      "display:flex;align-items:center;gap:8px;padding:0 12px;" +
      "background:linear-gradient(180deg,#fff0f7 0%,#ffd9ec 100%);" +
      "border:3px solid #5b2740;box-shadow:3px 3px 0 rgba(91,39,64,.45);" +
      "font-family:'Press Start 2P',monospace;color:#e23e7a;}" +
    ".kd-vol .kd-vol-ic{font-size:.7rem;line-height:1;}" +
    ".kd-vol input[type=range]{-webkit-appearance:none;appearance:none;" +
      "width:96px;height:8px;margin:0;background:#fff;border:2px solid #5b2740;" +
      "outline:none;cursor:pointer;}" +
    ".kd-vol input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;" +
      "width:14px;height:20px;background:linear-gradient(180deg,#ff7eb3,#e23e7a);" +
      "border:2px solid #5b2740;cursor:pointer;}" +
    ".kd-vol input[type=range]::-moz-range-thumb{width:14px;height:20px;border-radius:0;" +
      "background:linear-gradient(180deg,#ff7eb3,#e23e7a);border:2px solid #5b2740;cursor:pointer;}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- controls ----------
  function build() {
    // volume slider
    var vbox = document.createElement("div");
    vbox.className = "kd-vol";

    var vic = document.createElement("span");
    vic.className = "kd-vol-ic";
    vic.innerHTML = "&#9834;"; // ♪

    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.05";
    slider.value = String(vol);
    slider.setAttribute("aria-label", "Music volume");
    slider.title = "Music volume";
    slider.addEventListener("input", function () {
      vol = parseFloat(slider.value);
      audio.volume = vol;
      localStorage.setItem(KEY_VOL, String(vol));
    });

    vbox.appendChild(vic);
    vbox.appendChild(slider);
    document.body.appendChild(vbox);

    // mute button
    var btn = document.createElement("button");
    btn.className = "kd-mute-btn" + (muted ? " muted" : "");
    btn.type = "button";
    btn.innerHTML = "&#9835;"; // music note ♫
    btn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    btn.title = muted ? "Unmute music" : "Mute music";

    btn.addEventListener("click", function () {
      muted = !muted;
      audio.muted = muted;
      localStorage.setItem(KEY_MUTED, muted ? "1" : "0");
      btn.classList.toggle("muted", muted);
      btn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
      btn.title = muted ? "Unmute music" : "Mute music";
      // a click is a user gesture — make sure playback is running
      audio.play().catch(function () {});
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  tryPlay();
})();
