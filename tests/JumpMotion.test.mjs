import assert from "node:assert/strict";
import test from "node:test";
import {
  ascendingJumpTime, descendingJumpTime, guidedJumpHorizontalSeconds,
  jumpDisplacement, jumpVelocityAfter, playerJumpLaunchVelocity,
} from "../src/game/JumpMotion.ts";
import { canGuidedJump, hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { selectDescendingLandingSurface } from "../src/game/SurfaceSelection.ts";

const cadences = [
  [1 / 120], [1 / 60], [1 / 30], [1 / 20], [0.011, 0.033, 0.05, 0.016],
];

test("rise-first horizontal movement consumes only the post-lift part of a crossing frame", () => {
  const delay = ascendingJumpTime(.98);
  assert.ok(delay > .16 && delay < .17);
  assert.ok(Math.abs(jumpDisplacement(delay) - .98) < 1e-12);
  for (const cadence of cadences) {
    let time = 0;
    let velocity = playerJumpLaunchVelocity;
    let distance = 0;
    let partial = false;
    for (let index = 0; time < .6; index++) {
      const delta = Math.min(cadence[index % cadence.length], .6 - time);
      velocity = jumpVelocityAfter(delta, velocity);
      time += delta;
      const moving = guidedJumpHorizontalSeconds(velocity, delta, delay);
      assert.ok(moving >= 0 && moving <= delta);
      if (time < delay) assert.equal(moving, 0);
      if (time > delay && time - delta < delay) {
        assert.ok(moving > 0 && moving < delta);
        partial = true;
      }
      distance += 6.8 * moving;
      assert.ok(Math.abs(distance - 6.8 * Math.max(0, time - delay)) < 1e-10,
        `delay crossing must not add or lose a frame of movement at ${cadence}`);
    }
    assert.equal(partial, true);
  }
  for (const invalid of [NaN, Infinity, -1, 2]) assert.equal(ascendingJumpTime(invalid), null);
});

test("a planner-approved 1.5m ledge is reached at Low quality and uneven frame cadences", () => {
  const from = { x: 0, y: 0, z: 0 };
  const goal = { x: 3, y: 1.5, z: 0 };
  const shelf = { id: "raised-shelf", heightAt: () => 1.5 };
  const contains = (_surface, x) => x >= 2.98;
  const landingHeight = (px, pz, py, x, z, y) => {
    const hit = selectDescendingLandingSurface([shelf], px, pz, py, x, z, y, contains);
    return hit ? hit.heightAt(x, z) : null;
  };
  assert.ok(canGuidedJump(3, 1.5));
  assert.ok(hasGuidedJumpClearance(from, goal, 6.8,
    (x, _z, feet) => x < 2.98 || feet >= 1.485, landingHeight));

  for (const cadence of cadences) {
    let x = 0;
    let height = 0;
    let velocity = playerJumpLaunchVelocity;
    let landed = null;
    for (let frame = 0; frame < 240 && landed === null; frame += 1) {
      const delta = cadence[frame % cadence.length];
      const previousX = x;
      const previousHeight = height;
      // The production player uses these same two motion functions; landing
      // uses the actual support selector, not a separate test-only equation.
      height += jumpDisplacement(delta, velocity);
      velocity = jumpVelocityAfter(delta, velocity);
      x = Math.min(goal.x, x + 6.8 * delta);
      assert.ok(x < 2.98 || height >= 1.485 || velocity < 0);
      if (velocity < 0) landed = landingHeight(previousX, 0, previousHeight, x, 0, height);
    }
    assert.equal(landed, 1.5, `planned landing must survive cadence ${cadence}`);
    assert.equal(x, 3);
  }
});

test("vertical motion composes to the same position and velocity at the same elapsed time", () => {
  for (const initialVelocity of [playerJumpLaunchVelocity, 9.1, -2.8, 0]) {
    for (const cadence of cadences) {
      const end = 0.61;
      let time = 0;
      let height = 4.2;
      let velocity = initialVelocity;
      for (let frame = 0; time < end; frame += 1) {
        const delta = Math.min(cadence[frame % cadence.length], end - time);
        height += jumpDisplacement(delta, velocity);
        velocity = jumpVelocityAfter(delta, velocity);
        time += delta;
      }
      assert.ok(Math.abs(height - (4.2 + jumpDisplacement(end, initialVelocity))) < 1e-11);
      assert.ok(Math.abs(velocity - jumpVelocityAfter(end, initialVelocity)) < 1e-11);
    }
  }
});

test("planning rejects nonfinite coordinates and impossible vertical-only jumps", () => {
  for (const rise of [NaN, Infinity, -Infinity, 2, -7]) assert.equal(canGuidedJump(0, rise), false);
  assert.equal(descendingJumpTime(2), null);
  assert.equal(canGuidedJump(Infinity, 0), false);
  assert.equal(hasGuidedJumpClearance({ x: NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 6.8, () => true), false);
  assert.equal(hasGuidedJumpClearance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, Infinity, () => true), false);
});
