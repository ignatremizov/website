import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  canGuideDropWithRunup,
  canGuidedJump,
  clickNavigationHoldDelay,
  collectClickNavigationBlockers,
  getGuidedJumpRange,
  hasCrossedGuidedLandingPlane,
  isClickNavigationPassThrough,
  isContinuousClickNavigationGesture,
  playerJumpGravity,
  playerJumpLaunchVelocity,
  shouldCommitOneShotClickNavigation,
} from "../src/game/ClickNavigation.ts";

test("click navigation accepts ordinary ledges but rejects rises above the real jump apex", () => {
  const jumpApex =
    (playerJumpLaunchVelocity * playerJumpLaunchVelocity) /
    (2 * playerJumpGravity);

  assert.ok(getGuidedJumpRange(0) > 5);
  assert.ok(canGuidedJump(3, 1.2));
  assert.equal(getGuidedJumpRange(jumpApex + 0.01), 0);
  assert.equal(canGuidedJump(0.5, jumpApex + 0.01), false);
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

test("a focus-reclaiming click does not commit a one-shot route", () => {
  assert.equal(
    shouldCommitOneShotClickNavigation(true, false, false, false),
    true,
  );
  assert.equal(
    shouldCommitOneShotClickNavigation(true, true, false, false),
    false,
  );
  assert.equal(
    shouldCommitOneShotClickNavigation(true, true, true, true),
    false,
  );
  assert.equal(
    shouldCommitOneShotClickNavigation(false, false, false, false),
    false,
  );
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
