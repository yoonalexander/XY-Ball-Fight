/**
 * Basic AI helpers for fighter decision making.
 * Keep these functions stateless and pure where possible.
 *
 * Fighter shape expected by these helpers (as used in gameLoop.js):
 * {
 *   id: number,
 *   team: number,
 *   def: WeaponDef,
 *   hp: number,
 *   maxHp: number,
 *   body: Matter.Body
 * }
 *
 * WeaponDef key fields used:
 * - type: 'melee' | 'ranged' | 'aoe' | 'support'
 * - range: number
 */

import { distance } from "./physics.js";

/**
 * Get the nearest enemy to 'self' among alive fighters.
 */
export function getNearestEnemy(self, fighters) {
  let best = null;
  let bestDist = Infinity;
  for (const f of fighters) {
    if (f.id === self.id) continue;
    if (f.team === self.team) continue;
    if (f.hp <= 0) continue;
    const d = distance(self.body.position, f.body.position);
    if (d < bestDist) {
      best = f;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Find the lowest HP ratio ally within an optional maxRange.
 * If maxRange is not provided, search all allies.
 */
export function getLowestHpAlly(self, fighters, maxRange = null) {
  let best = null;
  let bestRatio = 1.01;
  for (const f of fighters) {
    if (f.team !== self.team) continue;
    if (f.id === self.id) continue;
    if (f.hp <= 0) continue;
    if (maxRange != null) {
      const d = distance(self.body.position, f.body.position);
      if (d > maxRange) continue;
    }
    const ratio = f.hp / f.maxHp;
    if (ratio < bestRatio) {
      best = f;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * For support: prefer an ally in range to heal, otherwise fallback to lowest HP ally overall.
 */
export function pickSupportTarget(self, fighters, healRange) {
  const inRange = getLowestHpAlly(self, fighters, healRange);
  if (inRange) return inRange;
  return getLowestHpAlly(self, fighters, null);
}

/**
 * Decide a desired point to move toward for the current fighter based on weapon type.
 * - melee: chase enemy
 * - ranged: kite if too close, close distance if too far
 * - aoe: keep moderate distance (hover near edge of range)
 * - support: move toward ally to heal; otherwise keep distance from enemies
 *
 * Returns { x, y } point in world coords, or null if no movement desired.
 */
export function desiredMovePoint(self, fighters) {
  const def = self.def;
  const myPos = self.body.position;

  const enemy = getNearestEnemy(self, fighters);

  if (def.type === "support") {
    const ally = pickSupportTarget(self, fighters, def.range ?? 160);
    if (ally) {
      // If ally far, move toward; if already close, try to steer away from nearest enemy a bit.
      const dAlly = distance(myPos, ally.body.position);
      if (dAlly > (def.range ?? 160) * 0.7) {
        return ally.body.position;
      }
      if (enemy) {
        // Step a bit away from the enemy to avoid danger
        const away = pointAway(myPos, enemy.body.position, 120);
        return away;
      }
      return null;
    }
    // No ally found, just avoid enemy if any
    if (enemy) {
      return pointAway(myPos, enemy.body.position, 160);
    }
    return null;
  }

  // Non-support
  if (!enemy) return null;

  const r = def.range ?? 100;
  const d = distance(myPos, enemy.body.position);

  if (def.type === "ranged") {
    // Kite: if too close (< 70% of range), back off; if too far (> 100% of range), move in
    if (d < r * 0.7) {
      return pointAway(myPos, enemy.body.position, r);
    } else if (d > r) {
      return enemy.body.position;
    }
    return null; // good distance, hover
  }

  if (def.type === "aoe") {
    // Prefer to hover near edge of range
    if (d > r * 0.9) return enemy.body.position;
    if (d < r * 0.6) return pointAway(myPos, enemy.body.position, r);
    return null;
  }

  // melee default: chase
  return enemy.body.position;
}

/**
 * Simple range checks for various action intents.
 */
export function isInMeleeRange(self, target) {
  const r = self.def.range ?? 28;
  return distance(self.body.position, target.body.position) <= r + (self.def.radius ?? 16) + (target.def?.radius ?? 16);
}

export function isInRangedRange(self, target) {
  const r = self.def.range ?? 200;
  return distance(self.body.position, target.body.position) <= r;
}

export function hasAnyEnemyAlive(self, fighters) {
  return fighters.some(f => f.team !== self.team && f.hp > 0);
}

/**
 * Helper: compute a point away from 'from' toward the opposite of 'to',
 * at a specified desired distance from 'to'.
 */
function pointAway(from, to, desiredDistance = 100) {
  const vx = from.x - to.x;
  const vy = from.y - to.y;
  const len = Math.hypot(vx, vy) || 1;
  const nx = vx / len;
  const ny = vy / len;
  return {
    x: to.x + nx * desiredDistance,
    y: to.y + ny * desiredDistance
  };
}
