import { listWeapons } from "./engine/weapons.js";
import { initUI } from "./engine/ui.js";
import { createGame } from "./engine/gameLoop.js";

/**
 * Application bootstrap.
 * Wires UI <-> Game loop and handles options.
 */

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");

  // Prepare weapons list for UI
  const weaponsList = listWeapons();

  // Create game instance (uses canvas size at creation time)
  const game = createGame({
    canvas,
    options: {
      showHPBars: true,
      showDamage: true,
      timeScale: 1
    },
    callbacks: {
      onWin: (winnerText) => {
        ui.showOverlay(winnerText);
        ui.setWinnerText(winnerText);
      }
    }
  });

  // Initialize UI and wire callbacks
  const ui = initUI({
    weaponsList,
    onStart: ({ mode, roster }) => {
      // Normalize roster (array of weapon keys)
      const config = { mode, roster };
      // start the match
      game.startMatch(config);
    },
    onReplay: () => {
      game.replay();
    },
    onBack: () => {
      // Stop running simulation and reset UI to allow new selection
      try { game.stop(); } catch (e) { /* ignore */ }
      ui.hideOverlay();
      ui.resetSelection();
    },
    onOptionsChange: (opts) => {
      if (opts.timeScale != null) game.setTimeScale(opts.timeScale);
      game.setOptions({
        showHPBars: opts.showHPBars,
        showDamage: opts.showDamage
      });
    }
  });

  // Responsive canvas sizing (attempt to match CSS layout)
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    // Use devicePixelRatio for crisp rendering on hi-dpi
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    // Scale context
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Note: physics world bounds are static for this demo (set at init). For best results,
    // reload the page if you resize drastically; a future improvement is to rebuild physics bounds.
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
  });
  // initial size
  resizeCanvas();

  // Small helper: pre-select a few fighters for convenience
  // (Select first two by default)
  // This is optional and non-destructive; UI.resetSelection can clear it.
  // If you want auto-population, uncomment below:
  // setTimeout(() => { ui.setWeaponsList(weaponsList); }, 40);
});
