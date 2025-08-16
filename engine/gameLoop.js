/**
 * Game loop and battle simulation.
 * Orchestrates physics, AI, combat, and rendering.
 */

import {
  initPhysics,
  step as physicsStep,
  makeFighterBody,
  makeProjectileBody,
  steerTowards,
  clampVelocity,
  applyRadialForce,
  distance
} from "./physics.js";
import {
  getWeaponDef
} from "./weapons.js";
import {
  desiredMovePoint,
  getNearestEnemy,
  isInMeleeRange,
  isInRangedRange,
  hasAnyEnemyAlive
} from "./ai.js";

/**
 * Factory for the game simulation.
 * - canvas: HTMLCanvasElement
 * - options: { showHPBars: boolean, showDamage: boolean, timeScale: number }
 * - callbacks: { onWin: (winnerText) => void }
 */
export function createGame({ canvas, options = {}, callbacks = {} }) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const showHPBars = { value: options.showHPBars ?? true };
  const showDamage = { value: options.showDamage ?? true };
  const timeScale = { value: options.timeScale ?? 1 };

  const onWin = callbacks.onWin ?? (() => {});

  // Physics
  const physics = initPhysics({ width, height, gravityY: 0 });

  // State
  let rafId = null;
  let running = false;
  let lastTime = 0;

  let fighters = [];        // Alive fighters
  let corpses = [];         // Dead fighters drawn faintly
  let projectiles = [];     // Active projectiles
  let effects = [];         // Visual effects (AOE rings, etc.)
  let floaters = [];        // Floating texts (damage/heal)

  // For replay
  let lastMatchConfig = null;
  let lastMatchTeams = null; // remember initial team assignment for correct win logic

  // ============ Fighter and projectile helpers ============

  function spawnFighter({ id, team, defKey, x, y, bossMultiplier = 1 }) {
    const def = getWeaponDef(defKey);
    if (!def) throw new Error("Unknown weapon: " + defKey);
    const body = makeFighterBody({
      x, y, radius: def.radius ?? 16
    });
    body.renderColor = def.color;
    body.label = "fighter";
    const maxHp = Math.round(def.hp * bossMultiplier);
    const fighter = {
      id,
      team,
      def,
      hp: maxHp,
      maxHp,
      body,
      lastAttackAt: 0,
      name: def.name
    };
    physics.add(body);
    fighters.push(fighter);
    return fighter;
  }

  function fireProjectile(owner, targetPos) {
    const def = owner.def;
    const radius = def.projectileRadius ?? 4;

    const projBody = makeProjectileBody({
      x: owner.body.position.x,
      y: owner.body.position.y,
      radius
    });
    projBody.label = "projectile";

    // Set velocity toward target
    const dx = targetPos.x - owner.body.position.x;
    const dy = targetPos.y - owner.body.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = def.projectileSpeed ?? 0.03;
    const vx = (dx / len) * (speed * 1000); // roughly px/s -> Matter units per step; tune with Engine.update
    const vy = (dy / len) * (speed * 1000);
    // Using Body.setVelocity is okay but direct assignment is fine via setVelocity alternative; we can set after add
    Matter.Body.setVelocity(projBody, { x: vx, y: vy });

    physics.add(projBody);

    const proj = {
      id: Date.now() + Math.random(),
      team: owner.team,
      ownerId: owner.id,
      power: def.attackPower,
      knockback: def.knockback ?? 0.01,
      color: def.color,
      radius,
      body: projBody,
      bornAt: performance.now(),
      lifeMs: 4000
    };
    projectiles.push(proj);
    return proj;
  }

  function addFloater(x, y, text, color = "#fff") {
    if (!showDamage.value) return;
    floaters.push({
      x, y, text, color,
      age: 0,
      duration: 800,
      vy: -0.035
    });
  }

  function addAoeRing(x, y, radius, color) {
    effects.push({
      type: "ring",
      x, y, radius,
      age: 0,
      duration: 300,
      color
    });
  }

  function dealDamage(target, amount, hitPoint, color = "#fff") {
    if (target.hp <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    addFloater(hitPoint.x, hitPoint.y, `-${amount}`, color);
    if (target.hp <= 0) {
      // Move to corpses and remove body
      corpses.push(target);
      physics.remove(target.body);
      fighters = fighters.filter(f => f.id !== target.id);
    }
  }

  function applyHeal(target, amount, atPoint) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const gained = Math.round(target.hp - before);
    if (gained > 0) {
      addFloater(atPoint.x, atPoint.y, `+${gained}`, "#10b981");
    }
  }

  // ============ Collisions ============

  physics.onCollisionStart((evt) => {
    const pairs = evt.pairs;
    for (const p of pairs) {
      const a = p.bodyA;
      const b = p.bodyB;

      // projectile <-> fighter
      const proj = findProjectileByBody(a) || findProjectileByBody(b);
      const fighter = findFighterByBody(a) || findFighterByBody(b);
      if (proj && fighter) {
        // team check
        if (proj.team !== fighter.team && fighter.hp > 0) {
          // Hit point approximate: collision midpoint
          const hx = (p.collision.supports[0]?.x ?? fighter.body.position.x);
          const hy = (p.collision.supports[0]?.y ?? fighter.body.position.y);

          const dmg = Math.round(proj.power);
          dealDamage(fighter, dmg, { x: hx, y: hy }, "#ffd166");

          // Knockback away from projectile
          applyRadialForce(fighter.body, proj.body.position, proj.knockback ?? 0.01);

          // Remove projectile
          removeProjectile(proj);
        } else {
          // Same team or dead, let it pass (optional: remove)
        }
      }
    }
  });

  function findFighterByBody(body) {
    return fighters.find(f => f.body === body) || null;
  }
  function findProjectileByBody(body) {
    return projectiles.find(p => p.body === body) || null;
  }
  function removeProjectile(proj) {
    physics.remove(proj.body);
    projectiles = projectiles.filter(p => p.id !== proj.id);
  }

  // ============ Match lifecycle ============

  function startMatch(config) {
    stop(); // ensure previous stopped
    lastMatchConfig = config;

    // Clear state (keep walls)
    physics.clear();
    fighters = [];
    corpses = [];
    projectiles = [];
    effects = [];
    floaters = [];

    // Spawn fighters
    const { mode, roster } = config;
    const n = roster.length;
    const teams = assignTeams(mode, n);
    // remember initial teams so we can correctly evaluate team wins later
    lastMatchTeams = teams.slice();
    const spawnPoints = computeSpawnPoints(mode, teams, n, width, height);

    for (let i = 0; i < n; i++) {
      const team = teams[i];
      const pos = spawnPoints[i];
      const isBoss = (mode === "raid" && team === 0 && i === 0);
      const bossMul = isBoss ? 2.0 : 1.0; // Boss gets extra HP
      spawnFighter({
        id: i + 1,
        team,
        defKey: roster[i],
        x: pos.x,
        y: pos.y,
        bossMultiplier: bossMul
      });
    }

    lastTime = performance.now();
    running = true;
    loop(lastTime);
  }

  function stop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    running = false;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(32, now - lastTime); // clamp dt
    lastTime = now;

    // Update world
    thinkAndAct(now, dt);
    physicsStep(physics.engine, dt, timeScale.value);
    postStep(now, dt);

    // Render
    render(now, dt);

    // Win check
    const winner = evaluateWin();
    if (winner) {
      running = false;
      onWin(winner);
      return;
    }

    rafId = requestAnimationFrame(loop);
  }

  function thinkAndAct(now, dt) {
    // Steering + attacks per fighter
    for (const f of fighters) {
      // Movement desire
      const targetPoint = desiredMovePoint(f, fighters);
      if (targetPoint) {
        steerTowards(f.body, targetPoint, f.def.speed ?? 0.0016);
      }
      clampVelocity(f.body, 16);

      const enemy = getNearestEnemy(f, fighters);
      if (!enemy) continue;

      // Attack intents by type
      if (f.def.type === "melee") {
        if (now - f.lastAttackAt >= (f.def.attackCooldown ?? 800)) {
          if (isInMeleeRange(f, enemy)) {
            f.lastAttackAt = now;
            const dmg = Math.round(f.def.attackPower);
            const hitPoint = midpoint(f.body.position, enemy.body.position);
            dealDamage(enemy, dmg, hitPoint, "#fca5a5");

            // Knockback both a bit
            applyRadialForce(enemy.body, f.body.position, f.def.knockback ?? 0.012);
            applyRadialForce(f.body, enemy.body.position, (f.def.knockback ?? 0.012) * 0.5);
          }
        }
      } else if (f.def.type === "ranged") {
        if (now - f.lastAttackAt >= (f.def.attackCooldown ?? 900)) {
          if (isInRangedRange(f, enemy)) {
            f.lastAttackAt = now;
            fireProjectile(f, enemy.body.position);
          }
        }
      } else if (f.def.type === "aoe") {
        if (now - f.lastAttackAt >= (f.def.attackCooldown ?? 1400)) {
          f.lastAttackAt = now;
          // Burst damages enemies in radius
          const R = f.def.aoeRadius ?? 90;
          const K = f.def.aoeForce ?? 0.02;
          addAoeRing(f.body.position.x, f.body.position.y, R, f.def.color);
          for (const t of fighters) {
            if (t.team === f.team || t.id === f.id || t.hp <= 0) continue;
            const d = distance(f.body.position, t.body.position);
            if (d <= R + (t.def.radius ?? 16)) {
              const dmg = Math.round(f.def.attackPower);
              dealDamage(t, dmg, t.body.position, "#a78bfa");
              applyRadialForce(t.body, f.body.position, K);
            }
          }
        }
      } else if (f.def.type === "support") {
        if (now - f.lastAttackAt >= (f.def.attackCooldown ?? 1200)) {
          f.lastAttackAt = now;
          // Heal nearest low HP ally in range
          // Reuse enemy var for positioning; healing logic is simple: closest ally in range
          let best = null;
          let bestRatio = 1.01;
          const R = f.def.range ?? 180;
          for (const a of fighters) {
            if (a.team !== f.team || a.id === f.id || a.hp <= 0) continue;
            const r = a.hp / a.maxHp;
            if (r >= 1) continue;
            const d = distance(f.body.position, a.body.position);
            if (d > R) continue;
            if (r < bestRatio) {
              best = a;
              bestRatio = r;
            }
          }
          if (best) {
            applyHeal(best, Math.round(f.def.healAmount ?? 10), best.body.position);
            // Small push away from nearest enemy if close
            if (enemy && distance(f.body.position, enemy.body.position) < (f.def.range ?? 160) * 0.7) {
              applyRadialForce(f.body, enemy.body.position, (f.def.knockback ?? 0.006));
            }
          }
        }
      }
    }
  }

  function postStep(now, dt) {
    // Cull old projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (now - p.bornAt > p.lifeMs) {
        removeProjectile(p);
      }
    }

    // Animate floaters/effects
    for (let i = floaters.length - 1; i >= 0; i--) {
      const ft = floaters[i];
      ft.age += dt;
      ft.y += ft.vy * dt;
      if (ft.age >= ft.duration) {
        floaters.splice(i, 1);
      }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.age += dt;
      if (e.age >= e.duration) effects.splice(i, 1);
    }
  }

  function evaluateWin() {
    const aliveCount = fighters.length;
    if (aliveCount === 0) return "No winners";

    // If only one fighter alive -> that fighter wins (covers FFA and 1v1 cases)
    if (aliveCount === 1) {
      const winner = fighters[0];
      return `${winner.name} wins!`;
    }

    // More than one alive: check team elimination
    const aliveTeams = new Set(fighters.map(f => f.team));

    // If all alive fighters belong to the same team, and the match started with multiple teams,
    // declare that team the winner (e.g., team vs team modes).
    if (aliveTeams.size === 1) {
      const team = [...aliveTeams][0];
      const remaining = aliveCount;
      const originalTeams = new Set(lastMatchTeams ?? []);
      if (originalTeams.size > 1) {
        return `Team ${team + 1} wins (${remaining} alive)`;
      }
      // If originalTeams.size <= 1, fall through (no valid multi-team elimination)
    }

    // Otherwise no winner yet
    return null;
  }

  // ============ Rendering ============

  function render(now, dt) {
    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background grid
    drawBackground(ctx, width, height);

    // Corpses (faint)
    for (const f of corpses) {
      const pos = f.body.position;
      drawBall(ctx, pos.x, pos.y, f.def.radius ?? 16, f.def.color, 0.25);
    }

    // Projectiles
    for (const p of projectiles) {
      const pos = p.body.position;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Fighters + HP bars
    for (const f of fighters) {
      const pos = f.body.position;
      drawBall(ctx, pos.x, pos.y, f.def.radius ?? 16, f.def.color, 1.0);
      if (showHPBars.value) {
        drawHpBar(ctx, pos.x, pos.y - (f.def.radius ?? 16) - 12, 36, 5, f.hp / f.maxHp);
      }
    }

    // Effects (rings)
    for (const e of effects) {
      if (e.type === "ring") {
        const t = e.age / e.duration;
        const alpha = 1 - t;
        ctx.save();
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 0.45 * alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * (0.9 + 0.25 * t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Floaters
    for (const ft of floaters) {
      const alpha = 1 - (ft.age / ft.duration);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = ft.color;
      ctx.font = "bold 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  function drawBackground(ctx, w, h) {
    // Subtle grid
    ctx.save();
    ctx.fillStyle = "rgba(15,18,32,1)";
    ctx.fillRect(0, 0, w, h);
    const step = 40;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBall(ctx, x, y, r, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // outer glow
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.3);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0.06)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHpBar(ctx, x, y, w, h, ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, x - w / 2, y, w, h, 3, true, false);
    ctx.fillStyle = r > 0.5 ? "#22c55e" : r > 0.25 ? "#f59e0b" : "#ef4444";
    roundRect(ctx, x - w / 2, y, w * r, h, 3, true, false);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ============ Teaming and spawns ============

  function isFFA(mode) {
    return mode === "ffa";
  }

  function assignTeams(mode, count) {
    const teams = new Array(count).fill(0);

    if (mode === "ffa") {
      // each fighter unique team (use separate teams so last-man-standing works)
      for (let i = 0; i < count; i++) teams[i] = i;
    } else if (mode === "1v1") {
      // explicit 1v1: first two fighters opposing teams
      if (count >= 2) {
        teams[0] = 0;
        teams[1] = 1;
        // any extras (shouldn't happen) alternate
        for (let i = 2; i < count; i++) teams[i] = i % 2;
      } else {
        for (let i = 0; i < count; i++) teams[i] = 0;
      }
    } else if (mode === "2v2" || mode === "4v4") {
      // two teams: alternate assignment
      for (let i = 0; i < count; i++) teams[i] = i % 2;
    } else if (mode === "raid") {
      // first fighter is boss team 0, others team 1
      if (count > 0) teams[0] = 0;
      for (let i = 1; i < count; i++) teams[i] = 1;
    }
    return teams;
  }

  function computeSpawnPoints(mode, teams, count, w, h) {
    const pts = new Array(count);

    // Free-for-all: for small counts prefer corner/quadrant starts, otherwise circle
    if (mode === "ffa") {
      const cx = w / 2, cy = h / 2;
      if (count === 1) {
        pts[0] = { x: cx, y: cy };
        return pts;
      }
      if (count <= 4) {
        // corners: TL, TR, BL, BR (in that order)
        const corners = [
          { x: w * 0.15, y: h * 0.15 },
          { x: w * 0.85, y: h * 0.15 },
          { x: w * 0.15, y: h * 0.85 },
          { x: w * 0.85, y: h * 0.85 }
        ];
        for (let i = 0; i < count; i++) {
          pts[i] = applyJitter(corners[i], i);
        }
        return pts;
      }
      // default: circle around center for larger free-for-all
      const R = Math.min(w, h) * 0.35;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        pts[i] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
      }
      return pts;
    }

    // Raid: boss on left, others spread on right area
    if (mode === "raid") {
      const bossPos = { x: w * 0.25, y: h * 0.5 };
      if (count > 0) pts[0] = bossPos;
      const rest = count - 1;
      for (let i = 0; i < rest; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = w * 0.62 + (col - 1) * 60;
        const y = h * 0.35 + row * 80;
        pts[i + 1] = { x, y };
      }
      return pts;
    }

    // 1v1: put fighters in opposite corners so movement uses both axes
    if (mode === "1v1") {
      pts[0] = { x: w * 0.15, y: h * 0.20 }; // top-left
      pts[1] = { x: w * 0.85, y: h * 0.80 }; // bottom-right
      return pts;
    }

    // 2v2: put each team in opposite corners (top/bottom) to encourage 2D movement
    if (mode === "2v2") {
      const leftCorners = [{ x: w * 0.15, y: h * 0.2 }, { x: w * 0.15, y: h * 0.8 }];
      const rightCorners = [{ x: w * 0.85, y: h * 0.2 }, { x: w * 0.85, y: h * 0.8 }];
      let l = 0, r = 0;
      for (let i = 0; i < count; i++) {
        if (teams[i] === 0) pts[i] = leftCorners[l++] || { x: w * 0.2 + (l * 20), y: h * 0.5 };
        else pts[i] = rightCorners[r++] || { x: w * 0.8 - (r * 20), y: h * 0.5 };
      }
      return pts;
    }

    // Default team placement: split left/right but stagger rows and add small jitter
    const team0 = [];
    const team1 = [];
    for (let i = 0; i < count; i++) {
      if (teams[i] === 0) team0.push(i);
      else team1.push(i);
    }

    // create grids but with adaptive cols/rows based on team size
    const makeGrid = (cx, cy, n) => {
      const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(n))));
      const rows = Math.ceil(n / cols);
      const dx = Math.min(80, (w * 0.12));
      const dy = Math.min(90, (h * 0.12));
      return gridPositions(cx, cy, cols, rows, dx, dy, n);
    };

    const leftGrid = makeGrid(w * 0.22, h * 0.5, team0.length);
    const rightGrid = makeGrid(w * 0.78, h * 0.5, team1.length);

    team0.forEach((idx, k) => {
      const base = leftGrid[k];
      pts[idx] = applyJitter(base, k);
    });
    team1.forEach((idx, k) => {
      const base = rightGrid[k];
      pts[idx] = applyJitter(base, k);
    });

    return pts;
  }

  // small deterministic jitter so fighters aren't perfectly aligned
  function applyJitter(pt, seedIndex) {
    const jitterX = ((seedIndex * 37) % 7) - 3; // -3..3
    const jitterY = ((seedIndex * 59) % 7) - 3;
    return { x: pt.x + jitterX * 6, y: pt.y + jitterY * 6 };
  }

  function gridPositions(cx, cy, cols, rows, dx, dy, n) {
    const pts = [];
    const halfCols = (cols - 1) / 2;
    const halfRows = (rows - 1) / 2;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = cx + (col - halfCols) * dx;
      const y = cy + (row - halfRows) * dy;
      pts.push({ x, y });
    }
    return pts;
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // ============ Public API ============

  return {
    startMatch,
    stop,
    setTimeScale: (v) => timeScale.value = Math.max(0.05, Number(v) || 1),
    setOptions: (opts) => {
      if (opts.showHPBars != null) showHPBars.value = !!opts.showHPBars;
      if (opts.showDamage != null) showDamage.value = !!opts.showDamage;
    },
    replay: () => {
      if (lastMatchConfig) startMatch(lastMatchConfig);
    }
  };
}
