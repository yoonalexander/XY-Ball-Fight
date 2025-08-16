/**
 * UI controller for fighter selection and options.
 *
 * Usage:
 *   import { initUI } from "./engine/ui.js";
 *   const ui = initUI({ weaponsList, onStart, onReplay, onBack, onOptionsChange });
 *
 * This module only manipulates DOM controls already present in index.html.
 */

export function initUI({
  weaponsList = [],
  onStart = () => {},
  onReplay = () => {},
  onBack = () => {},
  onOptionsChange = () => {},
  maxSelectable = 8
} = {}) {
  const fightersListEl = document.getElementById("fightersList");
  const selectedCountEl = document.getElementById("selectedCount");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const overlay = document.getElementById("overlay");
  const winnerText = document.getElementById("winnerText");
  const replayBtn = document.getElementById("replayBtn");
  const backBtn = document.getElementById("backBtn");
  const timeScaleEl = document.getElementById("timeScale");
  const toggleHPEl = document.getElementById("toggleHP");
  const toggleDamageEl = document.getElementById("toggleDamage");
  const modeEls = Array.from(document.querySelectorAll('input[name="mode"]'));

  let selected = []; // array of weapon keys in selection order

  function renderFighterCards() {
    fightersListEl.innerHTML = "";
    for (const w of weaponsList) {
      const el = document.createElement("div");
      el.className = "fighter-card";
      el.dataset.key = w.key;

      const top = document.createElement("div");
      top.className = "fighter-top";

      const swatch = document.createElement("div");
      swatch.className = "fighter-swatch";
      swatch.style.background = w.color;

      const nameWrap = document.createElement("div");
      const name = document.createElement("div");
      name.className = "fighter-name";
      name.textContent = w.name;
      const type = document.createElement("div");
      type.className = "fighter-type";
      type.textContent = w.type;

      nameWrap.appendChild(name);
      nameWrap.appendChild(type);

      top.appendChild(swatch);
      top.appendChild(nameWrap);

      const stats = document.createElement("div");
      stats.className = "fighter-stats";
      stats.innerHTML = `
        <div class="stat">HP: ${w.hp}</div>
        <div class="stat">ATK: ${w.attackPower ?? 0}</div>
        <div class="stat">CD: ${w.attackCooldown ?? 0}ms</div>
      `;

      el.appendChild(top);
      el.appendChild(stats);

      el.addEventListener("click", () => toggleSelect(w.key, el));

      fightersListEl.appendChild(el);
    }
    updateSelectedCount();
  }

  function toggleSelect(key, el) {
    const idx = selected.indexOf(key);
    if (idx >= 0) {
      // deselect
      selected.splice(idx, 1);
      el.classList.remove("selected");
    } else {
      if (selected.length >= maxSelectable) {
        // flash or small feedback
        el.animate([{ transform: "translateY(-4px)" }, { transform: "translateY(0)" }], { duration: 180 });
        return;
      }
      selected.push(key);
      el.classList.add("selected");
    }
    updateSelectedCount();
  }

  function updateSelectedCount() {
    selectedCountEl.textContent = `${selected.length} selected`;
  }

  function getSelectedRoster() {
    return selected.slice();
  }

  function getMode() {
    const checked = modeEls.find(m => m.checked);
    return checked?.value ?? "ffa";
  }

  function startClicked() {
    const mode = getMode();
    const roster = getSelectedRoster();
    // Basic validation
    if (roster.length < 2) {
      alert("Select at least 2 fighters to start the battle.");
      return;
    }
    // In team modes, require even number or at least 2 teams - but keep loose: auto assignment will handle it.
    startBtn.disabled = true;
    restartBtn.disabled = false;
    onStart({ mode, roster });
  }

  function restartClicked() {
    onReplay();
  }

  function replayClicked() {
    hideOverlay();
    onReplay();
  }

  function backClicked() {
    hideOverlay();
    onBack();
  }

  function showOverlay(text) {
    if (winnerText) winnerText.textContent = text;
    if (overlay) overlay.hidden = false;
  }

  function hideOverlay() {
    if (overlay) overlay.hidden = true;
  }

  function attachControls() {
    startBtn.addEventListener("click", startClicked);
    restartBtn.addEventListener("click", restartClicked);
    replayBtn.addEventListener("click", replayClicked);
    backBtn.addEventListener("click", backClicked);

    timeScaleEl.addEventListener("change", () => {
      const v = parseFloat(timeScaleEl.value || "1");
      onOptionsChange({ timeScale: v });
    });

    toggleHPEl.addEventListener("change", () => {
      onOptionsChange({ showHPBars: !!toggleHPEl.checked });
    });
    toggleDamageEl.addEventListener("change", () => {
      onOptionsChange({ showDamage: !!toggleDamageEl.checked });
    });

    // allow clicking mode radios to show/hide constraints in future
    modeEls.forEach(m => m.addEventListener("change", () => {
      // Could add mode-specific UI hints here
    }));
  }

  function resetSelection() {
    selected = [];
    const cards = Array.from(fightersListEl.querySelectorAll(".fighter-card"));
    for (const c of cards) c.classList.remove("selected");
    updateSelectedCount();
    startBtn.disabled = false;
    restartBtn.disabled = true;
  }

  // Exposed API for main.js to control UI
  const api = {
    showOverlay,
    hideOverlay,
    resetSelection,
    setWinnerText: (t) => {
      if (winnerText) winnerText.textContent = t;
    },
    setWeaponsList: (list) => {
      weaponsList = list;
      renderFighterCards();
    },
    getSelection: () => getSelectedRoster(),
    setMaxSelectable: (n) => { maxSelectable = n; }
  };

  // Initialize
  renderFighterCards();
  attachControls();

  return api;
}
