import assert from "node:assert/strict";
import test from "node:test";
import { canPlaceHeldBody, loosePropIntersectsSolid, resolveHeldBodyTarget, resolvePropRise } from "../src/game/LoosePropCollision.ts";

const stair = { x: 0, y: 0.5, z: 0, halfWidth: 1, halfHeight: 0.5, halfDepth: 0.25 };

test("a crystal cannot be declared stably placed while its side clips the next riser", () => {
  const riser = { x: 1.3, y: 1.5, z: 0, halfWidth: .3, halfHeight: 1.5, halfDepth: 2 };
  assert.equal(canPlaceHeldBody(.9, 0, .4, 1.01, 1, 1, [riser]), false);
  assert.equal(canPlaceHeldBody(.5, 0, .4, 1.01, 1, 1, [riser]), true);
  assert.equal(canPlaceHeldBody(.5, 0, .4, .5, 1, 1, [riser]), false,
    "a collision-blocked pose cannot snap back up to the projected support");
  assert.equal(canPlaceHeldBody(.5, 0, .4, 2, 1, 1, []), false,
    "an old placement record cannot pull a hovering crystal down");
  const feet = { x: -1, y: 1.01, z: 0 };
  resolveHeldBodyTarget(feet, { x: .9, y: 1.01, z: 0 }, .4, 1, [riser], feet);
  assert.ok(feet.x <= .6);
  assert.equal(loosePropIntersectsSolid(feet.x, feet.z, .4, feet.y, feet.y + 1, riser), false);
  assert.equal(canPlaceHeldBody(feet.x, feet.z, .4, feet.y, 1, 1, [riser]), true);
});

test("loose crystals clear their supporting tread but cannot enter a taller riser", () => {
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 1, 2.4, stair), false);
  assert.equal(loosePropIntersectsSolid(0, 0.5, 0.4, 0.7, 2.1, stair), true);
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 0.2, 1.6, stair), true);
  assert.equal(loosePropIntersectsSolid(0, 0.7, 0.4, 0.7, 2.1, stair), false);
});

test("props pass below a bridge, while disabled and shaped solids retain their meaning", () => {
  const bridge = { ...stair, y: 2.55, halfHeight: 0.18 };
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 0.2, 1.6, bridge), false);
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 1.9, 2.5, bridge), true);
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 0.2, 1.6, { ...stair, enabled: false }), false);
  assert.equal(loosePropIntersectsSolid(0, 0, 0.4, 0.2, 1.6, {
    ...stair, intersectsHorizontal: () => false,
  }), false);
});

test("a thrown frog hits the bridge underside instead of entering its deck", () => {
  const bridge = { ...stair, y: 2.535, halfHeight: 0.165 };
  let feet = 1.63;
  let velocity = 2.28;
  const height = 0.72;
  const step = delta => {
    velocity -= 12 * delta;
    const desired = feet + velocity * delta;
    const resolved = resolvePropRise(0, 0, 0.55, feet, height, desired, [bridge]);
    if (resolved < desired) velocity = 0;
    feet = resolved;
  };
  step(1 / 60);
  assert.ok(feet > 1.63, "the remaining clear headroom can still be used");
  assert.ok(feet + height < 2.37, "the swept head must stop below the deck");
  assert.equal(velocity, 0);
  const contact = feet;
  step(1 / 60);
  assert.ok(feet < contact, "gravity resumes below the ceiling without a top-side landing");
  assert.equal(resolvePropRise(0, 0, 0.55, 1.63, height, 2.8, [
    { ...bridge, y: 3.5 }, bridge,
  ]), resolvePropRise(0, 0, 0.55, 1.63, height, 2.8, [bridge]),
  "the nearest underside wins even if registered after a higher one");
  for (const ignored of [{ ...bridge, enabled: false }, {
    ...bridge, intersectsHorizontal: () => false,
  }]) {
    assert.equal(resolvePropRise(0, 0, 0.55, 1.63, height, 2, [ignored]), 2);
  }
});

test("dragging a frog across furniture slides along sides instead of tunnelling", () => {
  const bench = { x: 0, y: 1.25, z: 0, halfWidth: 0.1, halfHeight: 0.25, halfDepth: 2 };
  const point = { x: -2, y: 0.7, z: -1 };
  const target = { x: 2, y: 0.7, z: 1 };
  resolveHeldBodyTarget(point, target, 0.55, 0.72, [bench], point);
  assert.ok(point.x < -0.6, "even a large pointer movement stops at the near side");
  assert.ok(Math.abs(point.z - target.z) < 1e-8, "the free axis still slides with the cursor");
  assert.equal(loosePropIntersectsSolid(point.x, point.z, 0.55, point.y, point.y + 0.72, bench), false);
  for (const ignored of [{ ...bench, enabled: false }, { ...bench, intersectsHorizontal: () => false }]) {
    resolveHeldBodyTarget({ x: -2, y: 0.7, z: -1 }, target, 0.55, 0.72, [ignored], point);
    assert.ok(Math.hypot(point.x - target.x, point.z - target.z) < 1e-8);
  }
});

test("a held frog can be lifted over a table but cannot be dragged through its top or underside", () => {
  const table = { x: 0, y: 2.5, z: 0, halfWidth: 1, halfHeight: 0.03, halfDepth: 1 };
  const point = { x: 0, y: 4, z: 0 };
  resolveHeldBodyTarget(point, { x: 0, y: 0, z: 0 }, 0.55, 0.72, [table], point);
  assert.ok(Math.abs(point.y - 2.53) < 1e-8, "a thin tabletop catches a fast downward drag");
  point.y = 0;
  resolveHeldBodyTarget(point, { x: 0, y: 4, z: 0 }, 0.55, 0.72, [table], point);
  assert.ok(point.y + 0.72 < 2.47);
  resolveHeldBodyTarget({ x: -2, y: 1, z: 0 }, { x: -2, y: 3, z: 0 }, 0.55, 0.72, [table], point);
  resolveHeldBodyTarget(point, { x: 0, y: 3, z: 0 }, 0.55, 0.72, [table], point);
  resolveHeldBodyTarget(point, { x: 0, y: 0, z: 0 }, 0.55, 0.72, [table], point);
  assert.ok(Math.abs(point.x) < 1e-8 && Math.abs(point.y - 2.53) < 1e-8,
    "lifting around the edge still allows placing it on the tabletop");
});
