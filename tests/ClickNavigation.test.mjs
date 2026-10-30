import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  canGuideDropWithRunup,
  canGuidedJump,
  clickNavigationHoldDelay,
  collectClickNavigationBlockers,
  getGuidedJumpRange,
  findGuidedJumpDelay,
  hasCrossedGuidedLandingPlane,
  hasGuidedJumpClearance,
  isClickNavigationPassThrough,
  isClickNavigationDragGesture,
  isContinuousClickNavigationGesture,
  playerJumpGravity,
  playerJumpLaunchVelocity,
  shouldCommitOneShotClickNavigation,
} from "../src/game/ClickNavigation.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { selectDescendingLandingSurface } from "../src/game/SurfaceSelection.ts";

function landingProbe(surfaces) {
  const contains = (surface, x, z) =>
    Math.abs(x - surface.x) <= surface.halfWidth + (surface.supportMargin ?? 0) &&
    Math.abs(z - surface.z) <= surface.halfDepth + (surface.supportMargin ?? 0);
  return (previousX, previousZ, previousFeet, x, z, feet) => {
    const landing = selectDescendingLandingSurface(
      surfaces, previousX, previousZ, previousFeet, x, z, feet, contains,
    );
    return landing?.heightAt(x, z) ?? null;
  };
}

test("a short ledge jump may rise first, but cannot ignore ceilings, landing interception, or flight time", () => {
  const from = { x: 1.7167451451269071, y: -0.16, z: 6.824321326906388 };
  const to = { x: 2.0988782901473773, y: 0.82, z: 5.272540106231773 };
  const altar = { x: 2.05, z: 5.15, y: 0.7, halfWidth: 1.25, halfDepth: 1.25,
    halfHeight: 0.75, solidTop: 0.82, clearAbove: 0.7 };
  const surface = { x: 2.05, z: 5.15, halfWidth: 1.08, halfDepth: 1.08, heightAt: () => .82 };
  const isClear = (x, z, feet, ascending) => feet >= altar.solidTop - .015 ||
    (ascending && feet >= altar.clearAbove - .01) ||
    !loosePropIntersectsSolid(x, z, .42, feet, feet + 2.3, altar);
  let firstBlocked;
  assert.equal(hasGuidedJumpClearance(from, to, 6.8, (x, z, feet, ascending) => {
    const clear = isClear(x, z, feet, ascending);
    if (!clear) firstBlocked = { x, z, feet };
    return clear;
  }, landingProbe([surface])), false);
  assert.ok(firstBlocked.feet < altar.clearAbove - .01,
    "the running arc touches the near side before its feet clear the top");
  let probes = 0;
  const delay = findGuidedJumpDelay(from, to, 6.8, (...args) => {
    probes++; return isClear(...args);
  }, landingProbe([surface]));
  assert.ok(delay > 0 && delay < .2);
  assert.ok(probes <= 322, "only two bounded arc candidates, not an unbounded timing search");
  assert.equal(hasGuidedJumpClearance(from, to, 6.8, isClear, landingProbe([surface]), delay), true);
  assert.equal(findGuidedJumpDelay(from, to, 6.8, () => true, landingProbe([surface])), 0,
    "already clear running arcs retain their original timing");
  assert.equal(findGuidedJumpDelay(from, to, 3, isClear, landingProbe([surface])), null,
    "lifting cannot extend available airtime or horizontal speed");
  const ceiling = { x: from.x, z: from.z, y: 2.5, halfWidth: .2, halfDepth: .2, halfHeight: .05 };
  assert.equal(findGuidedJumpDelay(from, to, 6.8, (x, z, feet, ascending) =>
    isClear(x, z, feet, ascending) && !loosePropIntersectsSolid(x, z, .42, feet, feet + 2.3, ceiling),
  landingProbe([surface])), null, "the full stationary lift needs headroom too");
  const upper = { ...surface, heightAt: () => 1.2 };
  assert.equal(findGuidedJumpDelay(from, to, 6.8, isClear, landingProbe([surface, upper])), null,
    "the first descending support must still be the intended landing");
  assert.equal(findGuidedJumpDelay(from, { ...to, y: 2 }, 6.8, () => true), null);
  for (const invalidDelay of [-1, NaN, Infinity, 1]) {
    assert.equal(hasGuidedJumpClearance(from, to, 6.8, isClear, undefined, invalidDelay), false);
  }
});

test("a jump cannot promise a lower canopy when an overlapping higher canopy catches the player", () => {
  const from = { x: 0.25, y: 4.6, z: -7.8 };
  const to = { x: 0.2929850893, y: 5.2763019035, z: -11.6756248354 };
  const lower = {
    id: "tree-7", x: to.x, z: to.z, halfWidth: 0.5, halfDepth: 0.5,
    heightAt: () => to.y,
  };
  const upper = {
    id: "tree-3", x: to.x, z: -12.05, halfWidth: 0.5, halfDepth: 0.43144,
    supportMargin: 0.08, heightAt: () => 5.6756872071,
  };
  assert.equal(hasGuidedJumpClearance(from, to, 6.8, () => true, landingProbe([lower])), true);
  assert.equal(hasGuidedJumpClearance(from, to, 6.8, () => true, landingProbe([lower, upper])), false);
  assert.equal(hasGuidedJumpClearance(
    from, to, 6.8, () => true, landingProbe([lower, { ...upper, enabled: false }]),
  ), true, "retired supports cannot intercept a route");
});

test("jump clearance follows descending crossings without snapping onto overhead or ascending supports", () => {
  const from = { x: 0, y: 0, z: 0 };
  const to = { x: 5, y: 0, z: 0 };
  const overhead = {
    id: "overhead", x: 3, z: 0, halfWidth: 4, halfDepth: 1, heightAt: () => 3,
  };
  const risingOnly = {
    id: "ascending-shelf", x: 0.8, z: 0, halfWidth: 0.2, halfDepth: 1, heightAt: () => 0.6,
  };
  const catchesDescent = {
    id: "intermediate-ledge", x: 4.2, z: 0, halfWidth: 0.35, halfDepth: 1, heightAt: () => 1.25,
  };
  assert.equal(hasGuidedJumpClearance(
    from, to, 6.8, () => true, landingProbe([overhead, risingOnly]),
  ), true, "support above the arc or crossed while rising cannot own the landing");
  assert.equal(hasGuidedJumpClearance(
    from, to, 6.8, () => true, landingProbe([catchesDescent]),
  ), false, "a shelf catching the descent invalidates a farther floor destination");
});

test("click navigation accepts ordinary ledges but rejects rises above the real jump apex", () => {
  const jumpApex =
    (playerJumpLaunchVelocity * playerJumpLaunchVelocity) /
    (2 * playerJumpGravity);

  assert.ok(getGuidedJumpRange(0) > 5);
  assert.ok(canGuidedJump(3, 1.2));
  assert.equal(getGuidedJumpRange(jumpApex + 0.01), 0);
  assert.equal(canGuidedJump(0.5, jumpApex + 0.01), false);
});

test("a monument jump under the Falls bridge requires a takeoff with overhead clearance", () => {
  const bridge = {
    x: -2.1, z: 2.4, y: (2.7 + 2.37) / 2,
    halfWidth: 4.75, halfDepth: 1.1, halfHeight: (2.7 - 2.37) / 2,
  };
  const isClear = (x, z, feet) =>
    !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, bridge);
  const monument = { x: 2.05, y: 0.82, z: 5.15 };
  assert.equal(hasGuidedJumpClearance(
    { x: 1.3, y: -0.16, z: 3.4 }, monument, 6.8, isClear,
  ), false);
  assert.equal(hasGuidedJumpClearance(
    { x: 1.3, y: -0.16, z: 4.25 }, monument, 6.8, isClear,
  ), true);
});

test("guided jump steering stops after crossing the landing plane", () => {
  assert.equal(
    hasCrossedGuidedLandingPlane(1.2, 0.3, 1, 0),
    false,
  );
  assert.equal(
    hasCrossedGuidedLandingPlane(0.05, 0.8, 1, 0),
    true,
  );
  assert.equal(
    hasCrossedGuidedLandingPlane(-0.2, -0.4, 1, 0),
    true,
  );
});

test("click navigation can approach a ledge before committing to a bounded drop", () => {
  assert.equal(canGuideDropWithRunup(7.4, -5.8), true);
  assert.equal(canGuideDropWithRunup(9.2, -5.8), false);
  assert.equal(canGuideDropWithRunup(3, -6.3), false);
  assert.equal(canGuideDropWithRunup(3, 0.2), false);
});

test("click navigation distinguishes a one-shot click from hold or drag steering", () => {
  assert.equal(
    isContinuousClickNavigationGesture(
      clickNavigationHoldDelay - 0.01,
      4.9,
      "mouse",
    ),
    false,
  );
  assert.equal(
    isContinuousClickNavigationGesture(0.03, 5, "mouse"),
    true,
  );
  assert.equal(
    isContinuousClickNavigationGesture(
      clickNavigationHoldDelay,
      0,
      "mouse",
    ),
    true,
  );
  assert.equal(
    isContinuousClickNavigationGesture(0.03, 10.9, "touch"),
    false,
  );
  assert.equal(
    isContinuousClickNavigationGesture(0.03, 11, "touch"),
    true,
  );
});

test("normal stationary releases commit even after early hold activation", () => {
  for (const heldFor of [0.12, 0.16, 0.20, 0.25, 0.35]) {
    for (const [pointerType, screenDistance] of [["mouse", 4.9], ["touch", 10.9]]) {
      const moved = isClickNavigationDragGesture(screenDistance, pointerType);
      assert.equal(moved, false, "elapsed time does not turn pointer jitter into a drag");
      assert.equal(isContinuousClickNavigationGesture(heldFor, screenDistance, pointerType),
        heldFor >= clickNavigationHoldDelay, "held steering still activates early");
      assert.equal(shouldCommitOneShotClickNavigation(true, false, moved, heldFor), true,
        `${heldFor}s ${pointerType} release retains a one-shot destination`);
    }
  }
});

test("deliberate holds and real drags stop instead of committing on release", () => {
  for (const heldFor of [0.351, 0.5, 1]) {
    assert.equal(shouldCommitOneShotClickNavigation(true, false, false, heldFor), false);
  }
  for (const [pointerType, screenDistance] of [["mouse", 5], ["touch", 11]]) {
    const moved = isClickNavigationDragGesture(screenDistance, pointerType);
    assert.equal(moved, true);
    for (const heldFor of [0.03, 0.16, 0.20, 0.25, 0.35]) {
      assert.equal(shouldCommitOneShotClickNavigation(true, false, moved, heldFor), false,
        "a threshold-crossing drag never becomes a one-shot destination");
    }
  }
});

test("focus-reclaiming and canceled presses never commit a one-shot route", () => {
  for (const heldFor of [0.12, 0.16, 0.20, 0.25, 0.35, 0.5]) {
    for (const moved of [false, true]) {
      assert.equal(shouldCommitOneShotClickNavigation(true, true, moved, heldFor), false);
      assert.equal(shouldCommitOneShotClickNavigation(false, false, moved, heldFor), false);
      assert.equal(shouldCommitOneShotClickNavigation(false, true, moved, heldFor), false);
    }
  }
});

test("opening the waterfall and hiding crystal remnants removes their click barriers", () => {
  const root = new THREE.Group();
  const floor = new THREE.Mesh();
  const seal = new THREE.Group();
  const sealStone = new THREE.Mesh();
  const crystal = new THREE.Mesh();
  seal.add(sealStone);
  root.add(floor, seal, crystal);
  const blockers = [];

  collectClickNavigationBlockers(root, blockers);
  assert.deepEqual(blockers, [floor, sealStone, crystal]);

  seal.visible = false;
  crystal.visible = false;
  collectClickNavigationBlockers(root, blockers);
  assert.deepEqual(blockers, [floor]);

  seal.visible = true;
  collectClickNavigationBlockers(root, blockers);
  assert.deepEqual(blockers, [floor, sealStone]);
});

test("navigation picks through foliage and effects while preserving solid props", () => {
  const root = new THREE.Group();
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh();
  const foliage = new THREE.Group();
  const leaf = new THREE.Mesh();
  foliage.userData.clickNavigationPassThrough = true;
  foliage.add(leaf);
  tree.add(trunk, foliage);
  const transparentGlow = new THREE.Mesh(
    undefined,
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  const depthProxy = new THREE.Mesh(
    undefined,
    new THREE.MeshBasicMaterial({ colorWrite: false }),
  );
  root.add(tree, transparentGlow, depthProxy, new THREE.LineSegments(), new THREE.Points());
  const blockers = [];

  collectClickNavigationBlockers(root, blockers);
  assert.deepEqual(blockers, [trunk]);
  assert.equal(isClickNavigationPassThrough(leaf), true);
  assert.equal(isClickNavigationPassThrough(trunk), false);
});
