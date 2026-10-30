import assert from "node:assert/strict";
import test from "node:test";
import { advanceHeldPropDepth, projectHeldProp } from "../src/game/DragSurfaceProjection.ts";

const contains = (s, x, z) =>
  Math.abs(x - s.x) <= s.halfWidth && Math.abs(z - s.z) <= s.halfDepth;
const surface = (id, x, z, height, size = 2) => ({
  id, x, z, halfWidth: size, halfDepth: size,
  requiresJump: true, heightAt: () => height,
});
const grip = { x: 0.2, y: 0.7, z: -0.1 };
const bottomOffset = 0.4;

test("crossing a terrace silhouette slews along the current ray without manufacturing a fling", () => {
  const terrace = surface("terrace", 0, 0, 3, 1);
  const grip = { x: 0, y: 0, z: 0 };
  const before = { origin: { x: -7.381, y: 10, z: 0 }, direction: { x: 1, y: -1, z: 0 } };
  const after = { origin: { x: -7.379, y: 10, z: 0 }, direction: before.direction };
  const desired = { x: 0, y: 0, z: 0 }, point = { ...desired }, motion = { ...desired };
  projectHeldProp(after, [terrace], grip, .62, .62, contains, desired);
  assert.equal(desired.y, 3.62);
  advanceHeldPropDepth(after, before, grip, .62, desired.y, 1 / 60, point, motion);
  assert.ok(Math.hypot(point.x - 2.001, point.y - .62) <= .100001);
  assert.ok(Math.abs(motion.x - .002) < 1e-9);
  assert.ok(Math.abs(point.x - (after.origin.x + 10 - point.y)) < 1e-9);
  // A stationary pointer keeps settling but contributes no throw velocity.
  for (let frame = 0; frame < 90; frame++) {
    advanceHeldPropDepth(after, after, grip, point.y, desired.y, 1 / 60, point, motion);
    assert.ok(Math.abs(motion.x) < 1e-9);
  }
  assert.equal(point.y, desired.y);
  const height = point.y;
  advanceHeldPropDepth(before, after, grip, height, .62, 10, point, motion);
  assert.ok(Math.hypot(point.x - (before.origin.x + 10 - height), point.y - height) <= .300001,
    "a delayed frame cannot snap down from the terrace");
  assert.ok(Math.abs(motion.x + .002) < 1e-9);
});

test("real pointer gestures retain momentum independently of automatic drag depth", () => {
  const before = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: -1, z: 0 } };
  const after = { origin: { x: 1, y: 10, z: .5 }, direction: before.direction };
  const point = { x: 0, y: 0, z: 0 }, motion = { ...point };
  advanceHeldPropDepth(after, before, { x: 0, y: 0, z: 0 }, 1, 8, 1 / 60, point, motion);
  assert.deepEqual(motion, { x: 1, y: 0, z: .5 });
  assert.equal(point.x, 1);
  assert.equal(point.z, .5);
  assert.ok(point.y < 1.11);
});

function pointerAt(point, direction = { x: -0.6, y: -0.8, z: -0.5 }) {
  return {
    origin: {
      x: point.x + grip.x - direction.x * 20,
      y: point.y + grip.y - direction.y * 20,
      z: point.z + grip.z - direction.z * 20,
    },
    direction,
  };
}

function assertGripUnderPointer(ray, point) {
  const t = (point.y + grip.y - ray.origin.y) / ray.direction.y;
  assert.ok(Math.abs(point.x + grip.x - ray.origin.x - ray.direction.x * t) < 1e-9);
  assert.ok(Math.abs(point.z + grip.z - ray.origin.z - ray.direction.z * t) < 1e-9);
}

test("a raised cliff changes drag depth without displacing the grabbed crystal from the cursor", () => {
  const cliff = surface("cliff", -5.5, -6.5, 7.2);
  const lower = surface("terrace", -5.5, -6.5, 1.35, 15);
  const target = { x: -5.5, y: 7.2 + bottomOffset, z: -6.5 };
  const ray = pointerAt(target);
  const point = { x: 0, y: 0, z: 0 };
  assert.equal(projectHeldProp(ray, [lower, cliff], grip, bottomOffset, 1.5, contains, point), cliff);
  assert.ok(Math.abs(point.y - target.y) < 1e-9);
  assertGripUnderPointer(ray, point);
  assert.ok(Math.abs(point.x - target.x) < 1e-9);
  assert.ok(Math.abs(point.z - target.z) < 1e-9);
});

test("dragged props can return to a lower deck without retaining their old hover height", () => {
  const deck = surface("deck", 2, 1, 1.05);
  const target = { x: 2, y: 1.05 + bottomOffset, z: 1 };
  const point = { x: 0, y: 0, z: 0 };
  for (const direction of [
    { x: -0.6, y: -0.8, z: -0.5 },
    { x: 0.3, y: -0.9, z: -0.6 },
  ]) {
    const ray = pointerAt(target, direction);
    assert.equal(projectHeldProp(ray, [deck], grip, bottomOffset, 9, contains, point), deck);
    assert.ok(Math.abs(point.y - target.y) < 1e-9);
    assertGripUnderPointer(ray, point);
  }
});

test("disabled supports do not catch a held pencil in the void", () => {
  const point = { x: 0, y: 0, z: 0 };
  const ray = pointerAt({ x: 1, y: 2.1, z: 2 });
  const disabled = { ...surface("removed", 1, 2, 1.7), enabled: false };
  assert.equal(projectHeldProp(ray, [disabled], grip, bottomOffset, 2.1, contains, point), null);
  assert.equal(point.y, 2.1);
  assertGripUnderPointer(ray, point);
});

test("a prop rests on the sloped tent roof instead of falling back inside its canvas", () => {
  const tent = {
    ...surface("survey-tent", -6.4, 1.5, 0),
    halfWidth: 2.25, halfDepth: 1.7,
    heightAt(x, z) {
      const slope = Math.max(Math.abs(x + 6.4) / 2.25, Math.abs(z - 1.5) / 1.7);
      return Math.max(0, (1 - slope) * 2.65);
    },
  };
  const target = { x: -6.4, y: tent.heightAt(-6.4, 2.3) + 0.21, z: 2.3 };
  const ray = {
    origin: { x: target.x + 11.5, y: target.y + 14.5, z: target.z + 11.5 },
    direction: { x: -11.5, y: -14.5, z: -11.5 },
  };
  const point = { x: 0, y: 0, z: 0 };
  assert.equal(
    projectHeldProp(ray, [tent], { x: 0, y: 0, z: 0 }, 0.21, 1.05, contains, point),
    tent,
  );
  assert.ok(Math.abs(point.x - target.x) < 0.001);
  assert.ok(Math.abs(point.z - target.z) < 0.001);
  assert.ok(Math.abs(point.y - 0.21 - tent.heightAt(point.x, point.z)) < 0.001);
});
