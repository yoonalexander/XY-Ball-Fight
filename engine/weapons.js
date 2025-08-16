/**
 * Weapon and fighter definitions (data-driven).
 * Add new entries here to expand the roster.
 *
 * Common fields:
 * - key: unique id
 * - name: display name
 * - type: 'melee' | 'ranged' | 'aoe' | 'support'
 * - color: render color of the ball
 * - hp: base health points
 * - radius: visual/physics radius (px)
 * - speed: movement force scalar (higher = faster acceleration)
 * - attackPower: damage per attack
 * - attackCooldown: ms between attacks
 * - range: preferred range (for aiming/behavior), also used for melee reach
 * - knockback: applied on hit (force magnitude scalar)
 *
 * Type-specific fields:
 * - ranged: projectileSpeed, projectileRadius
 * - aoe: aoeRadius, aoeForce
 * - support: healAmount, buff multipliers (optional)
 */

export const weapons = {
  sword: {
    key: "sword",
    name: "Sword",
    type: "melee",
    color: "#ef4444",
    hp: 110,
    radius: 16,
    speed: 0.00185,
    attackPower: 16,
    attackCooldown: 650,
    range: 28, // melee touch distance
    knockback: 0.015
  },

  spear: {
    key: "spear",
    name: "Spear",
    type: "melee",
    color: "#f59e0b",
    hp: 95,
    radius: 15,
    speed: 0.0021,
    attackPower: 13,
    attackCooldown: 480,
    range: 34,
    knockback: 0.012
  },

  hammer: {
    key: "hammer",
    name: "Hammer",
    type: "melee",
    color: "#7c3aed",
    hp: 135,
    radius: 18,
    speed: 0.0015,
    attackPower: 22,
    attackCooldown: 900,
    range: 28,
    knockback: 0.022
  },

  bow: {
    key: "bow",
    name: "Bow",
    type: "ranged",
    color: "#22c55e",
    hp: 85,
    radius: 15,
    speed: 0.0016,
    attackPower: 11,
    attackCooldown: 900,
    range: 240,
    projectileSpeed: 0.035,
    projectileRadius: 5,
    knockback: 0.01
  },

  blaster: {
    key: "blaster",
    name: "Blaster",
    type: "ranged",
    color: "#3b82f6",
    hp: 100,
    radius: 16,
    speed: 0.00155,
    attackPower: 9,
    attackCooldown: 220,
    range: 200,
    projectileSpeed: 0.028,
    projectileRadius: 4,
    knockback: 0.006
  },

  mage: {
    key: "mage",
    name: "Arcane Burst",
    type: "aoe",
    color: "#a855f7",
    hp: 95,
    radius: 16,
    speed: 0.0015,
    attackPower: 14,
    attackCooldown: 1400,
    range: 120, // tries to keep some distance
    aoeRadius: 90,
    aoeForce: 0.02,
    knockback: 0.02
  },

  healer: {
    key: "healer",
    name: "Support Drone",
    type: "support",
    color: "#eab308",
    hp: 90,
    radius: 15,
    speed: 0.0018,
    attackPower: 0,
    attackCooldown: 1200, // heal cooldown
    range: 180,
    healAmount: 12,
    knockback: 0.004
  },

  cannon: {
    key: "cannon",
    name: "Cannon",
    type: "ranged",
    color: "#94a3b8",
    hp: 125,
    radius: 18,
    speed: 0.0012,
    attackPower: 20,
    attackCooldown: 1400,
    range: 260,
    projectileSpeed: 0.04,
    projectileRadius: 6,
    knockback: 0.02
  }
};

/**
 * Lightweight meta for UI.
 */
export function listWeapons() {
  return Object.values(weapons).map(w => ({
    key: w.key,
    name: w.name,
    type: w.type,
    color: w.color,
    hp: w.hp,
    speed: w.speed,
    attackPower: w.attackPower,
    attackCooldown: w.attackCooldown,
    range: w.range ?? null
  }));
}

/**
 * Convenience for external modules to get by key with a safe clone.
 */
export function getWeaponDef(key) {
  const def = weapons[key];
  if (!def) return null;
  return JSON.parse(JSON.stringify(def));
}
