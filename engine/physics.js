/**
 * Physics setup using Matter.js (loaded globally via index.html).
 * Provides helpers to initialize the engine, world bounds, and create bodies.
 */

const {
  Engine,
  World,
  Bodies,
  Body,
  Composite,
  Events,
  Vector
} = Matter;

/**
 * Initialize Matter.js engine and static world bounds based on canvas size.
 * gravityY is 0 for top-down arena.
 */
export function initPhysics({ width, height, gravityY = 1, inset = 0.14, gravityScale = 0.0006, collisionHorizontalBoost = 0.003 } = {}) {
  // Gravity-enabled scene (vertical). Defaults use Matter's typical gravity scale.
  // gravityY is the gravity direction scalar (1 is Earth-like), gravityScale tunes acceleration.
  // Reduced gravityScale to produce gentler falling so bounces are visible and not too fast.
  const engine = Engine.create({
    gravity: { x: 0, y: gravityY, scale: gravityScale }
  });
  const world = engine.world;

  // Arena bounds (walls inset to create a smaller "room" for a zoomed-in feel)
  // Increase wall restitution and remove friction so balls bounce cleanly off walls.
  const wallThickness = 160;
  const cx = width / 2;
  const cy = height / 2;
  const playW = Math.max(200, Math.floor(width * (1 - inset)));
  const playH = Math.max(200, Math.floor(height * (1 - inset)));

  const walls = [
    Bodies.rectangle(cx, cy - playH / 2 - wallThickness / 2, playW, wallThickness, {
      isStatic: true,
      // restitution > 1 will amplify energy on bounce; set per request
      restitution: 1.5,
      friction: 0,
      frictionStatic: 0,
      label: "wall_top"
    }),
    Bodies.rectangle(cx, cy + playH / 2 + wallThickness / 2, playW, wallThickness, {
      isStatic: true,
      restitution: 1.5,
      friction: 0,
      frictionStatic: 0,
      label: "wall_bottom"
    }),
    Bodies.rectangle(cx - playW / 2 - wallThickness / 2, cy, wallThickness, playH, {
      isStatic: true,
      restitution: 1.5,
      friction: 0,
      frictionStatic: 0,
      label: "wall_left"
    }),
    Bodies.rectangle(cx + playW / 2 + wallThickness / 2, cy, wallThickness, playH, {
      isStatic: true,
      restitution: 1.5,
      friction: 0,
      frictionStatic: 0,
      label: "wall_right"
    })
  ];
  World.add(world, walls);

  // Anti-stalemate collision handler:
  // When a non-static circular body (fighter/projectile) collides with a wall or another ball,
  // apply a small horizontal force to nudge it out of near-zero horizontal velocity.
  Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const handle = (body, other) => {
        if (body.isStatic) return;
        const isWall = other.isStatic && typeof other.label === 'string' && other.label.startsWith('wall');
        const isBall = typeof body.label === 'string' && (body.label.includes('fighter') || body.label.includes('projectile') || body.label === 'ball');
        const otherIsBall = typeof other.label === 'string' && (other.label.includes('fighter') || other.label.includes('projectile') || other.label === 'ball');
        if (!isBall) return;
        if (isWall || otherIsBall) {
          const vx = body.velocity.x || 0;
          // If horizontal velocity is near zero, choose a random horizontal direction to break stalemate.
          let dir = Math.abs(vx) < 0.02 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(vx);
          // Apply a small horizontal force scaled by an adjustable boost parameter.
          const boost = collisionHorizontalBoost || 0.003;
          Body.applyForce(body, body.position, { x: dir * boost, y: 0 });
        }
      };
      handle(bodyA, bodyB);
      handle(bodyB, bodyA);
    }
  });

  return {
    engine,
    world,
    // Expose the play area rectangle so render + spawning can align with the visual room.
    playArea: {
      x: cx - playW / 2,
      y: cy - playH / 2,
      w: playW,
      h: playH
    },
    add: (body) => World.add(world, body),
    addAll: (bodies) => World.add(world, bodies),
    remove: (body) => Composite.remove(world, body),
    clear: () => {
      // Remove all non-static bodies (keep walls)
      Composite.allBodies(world)
        .filter((b) => !b.isStatic)
        .forEach((b) => Composite.remove(world, b));
    },
    setCanvasBounds: (w, h) => {
      // For now walls remain; could rebuild if needed
      // Not rebuilding to keep it simple.
    },
    onCollisionStart: (cb) => Events.on(engine, "collisionStart", cb),
    onCollisionActive: (cb) => Events.on(engine, "collisionActive", cb),
    onCollisionEnd: (cb) => Events.on(engine, "collisionEnd", cb)
  };
}

/**
 * Step simulation by deltaMs * timeScale.
 */
export function step(engine, deltaMs, timeScale = 1) {
  Engine.update(engine, deltaMs * Math.max(0.01, timeScale));
}

/**
 * Create a circular "fighter" body.
 */
export function makeFighterBody({
  x,
  y,
  radius = 16,
  restitution = 1.5,
  frictionAir = 0.0,
  density = 0.0032,
  label = "fighter"
}) {
  // Preserve horizontal momentum: zero air drag and minimal surface friction,
  // slightly higher density for more inertia so horizontal velocity persists after bounces.
  const body = Bodies.circle(x, y, radius, {
    restitution,
    frictionAir,
    friction: 0,
    density,
    label
  });
  return body;
}

/**
 * Create a circular projectile.
 */
export function makeProjectileBody({
  x,
  y,
  radius = 4,
  restitution = 1.5,
  frictionAir = 0.008,
  density = 0.0006,
  label = "projectile"
}) {
  // Projectiles with very high restitution so they bounce energetically off walls and objects.
  const body = Bodies.circle(x, y, radius, {
    restitution,
    frictionAir,
    density,
    label
  });
  return body;
}

/**
 * Apply a capped force towards a target point.
 */
export function steerTowards(body, target, magnitude = 0.0015) {
  const dir = Vector.normalise({
    x: target.x - body.position.x,
    y: target.y - body.position.y
  });
  Body.applyForce(body, body.position, {
    x: dir.x * magnitude,
    y: dir.y * magnitude
  });
  return dir;
}

/**
 * Apply a horizontal-only steering force towards target.x.
 * This is useful in a gravity-enabled scene where vertical movement should be driven by gravity,
 * and agents should only control their horizontal movement.
 */
export function steerHorizontal(body, target, magnitude = 0.0006) {
  const vx = target.x - body.position.x;
  const dirx = vx === 0 ? 0 : vx / Math.hypot(vx, target.y - body.position.y || 1);
  Body.applyForce(body, body.position, {
    x: dirx * magnitude,
    y: 0
  });
  return { x: dirx, y: 0 };
}

/**
 * Apply a knockback force away from a source point.
 */
export function applyRadialForce(body, fromPoint, strength = 0.02) {
  const dir = Vector.normalise({
    x: body.position.x - fromPoint.x,
    y: body.position.y - fromPoint.y
  });
  Body.applyForce(body, body.position, {
    x: dir.x * strength,
    y: dir.y * strength
  });
}

/**
 * Clamp a body velocity to a max speed (m/s in Matter units ~ px/s).
 */
export function clampVelocity(body, maxSpeed = 20) {
  const v = body.velocity;
  const speed = Math.hypot(v.x, v.y);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    Body.setVelocity(body, { x: v.x * scale, y: v.y * scale });
  }
}

/**
 * Utility distance between two points.
 */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
