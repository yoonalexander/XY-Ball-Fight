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
export function initPhysics({ width, height, gravityY = 1, inset = 0.14, gravityScale = 0.0006 } = {}) {
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
      restitution: 1.0,
      friction: 0,
      frictionStatic: 0,
      label: "wall_top"
    }),
    Bodies.rectangle(cx, cy + playH / 2 + wallThickness / 2, playW, wallThickness, {
      isStatic: true,
      restitution: 1.0,
      friction: 0,
      frictionStatic: 0,
      label: "wall_bottom"
    }),
    Bodies.rectangle(cx - playW / 2 - wallThickness / 2, cy, wallThickness, playH, {
      isStatic: true,
      restitution: 1.0,
      friction: 0,
      frictionStatic: 0,
      label: "wall_left"
    }),
    Bodies.rectangle(cx + playW / 2 + wallThickness / 2, cy, wallThickness, playH, {
      isStatic: true,
      restitution: 1.0,
      friction: 0,
      frictionStatic: 0,
      label: "wall_right"
    })
  ];
  World.add(world, walls);

  return {
    engine,
    world,
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
  restitution = 1.0,
  frictionAir = 0.005,
  density = 0.0025,
  label = "fighter"
}) {
  // Max bounciness: restitution 1.0, zero surface friction and minimal air drag so balls
  // bounce without losing kinetic energy from friction. This creates near-elastic collisions.
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
  restitution = 1.0,
  frictionAir = 0.01,
  density = 0.0006,
  label = "projectile"
}) {
  // Projectiles set to full restitution so they bounce off walls when needed and arc under gravity.
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
