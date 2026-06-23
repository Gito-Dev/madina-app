/* ============================================================
   Kitty Defense - in-game upgrade table
   Upgrades are bought DURING a match with stars and reset each game.
   ============================================================ */
(function (global) {
  "use strict";

  // Each track: max level, per-level multiplier, star cost for the NEXT level,
  // and a short description of the current bonus.
  global.KD_UPGRADES = {
    damage: {
      name: "Damage",
      icon: "&#9876;&#65039;",        // crossed swords
      max: 6,
      mult: (lvl) => 1 + lvl * 0.18,  // +18% per level
      desc: (lvl) => "+" + lvl * 18 + "% tower damage",
      cost: (lvl) => 35 + lvl * 30,
    },
    health: {
      name: "Health",
      icon: "&#10084;&#65039;",        // heart
      max: 6,
      mult: (lvl) => 1 + lvl * 0.25,  // +25% per level
      desc: (lvl) => "+" + lvl * 25 + "% tower health",
      cost: (lvl) => 30 + lvl * 30,
    },
    income: {
      name: "Star Income",
      icon: "&#11088;",                // star
      max: 6,
      mult: (lvl) => 1 + lvl * 0.25,  // +25% star income
      desc: (lvl) => "+" + lvl * 25 + "% star income",
      cost: (lvl) => 40 + lvl * 35,
    },
  };
})(window);
