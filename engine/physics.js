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
export function initPhysics({ width, height, gravityY = 0 }) {
  const engine = Engine.create({
    gravity: { x: 0, y: gravityY, scale: 0.001 }
  });
  const world = engine.world;

  // Arena bounds (thick static walls just outside the canvas)
  const wallThickness = 200;
  const halfW = width / 2;
  const halfH = height / 2;

  const walls = [
    Bodies.rectangle(halfW, -wallThickness / 2, width, wallThickness, { isStatic: true, restitution: 0.6, label: "wall_top" }),
    Bodies.rectangle(halfW, height + wallThickness / 2, width, wallThickness, { isStatic: true, restitution: 0.6, label: "wall_bottom" }),
    Bodies.rectangle(-wallThickness / 2, halfH, wallThickness, height, { isStatic: true, restitution: 0.6, label: "wall_left" }),
    Bodies.rectangle(width + wallThickness / 2, halfH, wallThickness, height, { isStatic: true, restitution: 0.6, label: "wall_right" })
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
  restitution = 0.9,
  frictionAir = 0.025,
  density = 0.0018,
  label = "fighter"
}) {
  const body = Bodies.circle(x, y, radius, {
    restitution,
    frictionAir,
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
  restitution = 0.8,
  frictionAir = 0.01,
  density = 0.0005,
  label = "projectile"
}) {
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
