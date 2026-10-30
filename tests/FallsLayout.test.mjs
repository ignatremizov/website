import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { isInsideFallsRiver } from "../src/game/fallsRiver.ts";
import { canGuidedJump, playerJumpGravity, playerJumpLaunchVelocity } from "../src/game/ClickNavigation.ts";
import { createLayeredCliffGeometry } from "../src/game/zones/falls/FallsScenery.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { hasWalkingClearance, selectWalkSupportHeight } from "../src/game/GuidedWalkingRoute.ts";
import {
  fallsLandmarks,
  fallsTerrainBlocks,
  getFallsTerraceHeight,
  isAtFallsSocketHeight,
  isInsideFallsPool,
  isWadingInFallsPool,
} from "../src/game/zones/falls/FallsLayout.ts";

test("socket capture follows its terrace height and rejects crystals beneath it", () => {
  for (const { y } of Object.values(fallsLandmarks.sockets)) {
    assert.equal(isAtFallsSocketHeight(y, y), true);
    assert.equal(isAtFallsSocketHeight(y + 1.8, y), true);
    assert.equal(isAtFallsSocketHeight(y - 0.5, y), false);
    assert.equal(isAtFallsSocketHeight(y + 3, y), false);
  }
  assert.equal(isAtFallsSocketHeight(0.5, fallsLandmarks.sockets.moon.y), false);
});

test("the cove bed reaches behind the closed seal without a narrow collision crevice", () => {
  const basin = fallsTerrainBlocks.find((block) => block.id === "cove-basin");
  const caveFloorFront = fallsLandmarks.cave.z + 0.45;
  const seamZ = fallsLandmarks.cave.z + 0.95;
  assert.ok(basin.z - basin.depth / 2 < caveFloorFront);
  assert.equal(getFallsTerraceHeight(fallsLandmarks.cave.x, seamZ), basin.top);
  assert.equal(
    getFallsTerraceHeight(fallsLandmarks.cave.x, caveFloorFront),
    fallsLandmarks.cave.floor + 0.23,
    "the raised northern bank still joins the cave floor",
  );
});

test("the raised pool wets submerged feet but not its rim or the gorge below", () => {
  const { x, z, floor, water, rim, width } = fallsLandmarks.basin;
  assert.ok(floor < water && water < rim);
  assert.equal(isWadingInFallsPool(x, z, floor), true);
  assert.equal(isWadingInFallsPool(x, z, water + 0.1), false);
  assert.equal(isWadingInFallsPool(x, z, 0), false);
  assert.equal(isInsideFallsPool(x + width / 2 - 0.1, z), false);
  assert.equal(isWadingInFallsPool(x + width / 2 - 0.1, z, rim), false);
  const steps = fallsTerrainBlocks
    .filter((block) => block.id.startsWith("cove-pool-exit-"));
  let previousTop = floor;
  for (const step of steps) {
    assert.ok(step.top > previousTop && step.top - previousTop <= 0.28);
    previousTop = step.top;
  }
  assert.ok(rim - previousTop <= 0.28, "wading out does not require a jump");
});

test("descending beside the underwater exit leaves a full-body channel behind the treads", () => {
  const bank = fallsTerrainBlocks.find((block) => block.id === "cove-pool-cave-bank");
  const steps = fallsTerrainBlocks.filter((block) => block.id.startsWith("cove-pool-exit-"));
  const radius = 0.4;
  const bankFront = bank.z + bank.depth / 2;
  // This position was reachable by jumping from the pool, but triggered
  // opposing bank/tread pushes when the feet descended below the first tread.
  const x = -4.613026368925087;
  const z = -5.443999997019768;
  for (const step of steps) {
    assert.ok(step.z - step.depth / 2 - bankFront >= radius * 2 + 0.1,
      "the rear channel needs body clearance, not merely a center-line gap");
    const solid = {
      ...step, y: (step.top + step.bottom) / 2,
      halfWidth: step.width / 2, halfDepth: step.depth / 2,
      halfHeight: (step.top - step.bottom) / 2,
    };
    for (const feet of [2.222361111111109, 2.170833333333331, fallsLandmarks.basin.floor]) {
      assert.equal(loosePropIntersectsSolid(x, z, radius, feet, feet + 2.3, solid), false,
        "the same XZ stays clear throughout descent instead of invoking the grounded fallback");
    }
  }
});

test("the underwater exit can be walked across its centerline without catching the front corner", () => {
  const blocks = fallsTerrainBlocks.filter((block) =>
    block.id === "cove-basin" || block.id.startsWith("cove-pool-"));
  const surfaces = blocks.map((block) => ({
    id: block.id, x: block.x, z: block.z,
    halfWidth: block.width / 2 - 0.005, halfDepth: block.depth / 2 - 0.005,
    requiresJump: false, stepHeight: 0.28,
    supportMargin: block.kind === "step" ? 0.015 : 0.12,
    heightAt: () => block.top,
  }));
  const solids = blocks.map((block) => ({
    x: block.x, z: block.z, y: (block.top + (block.bottom ?? 0)) / 2,
    halfWidth: block.width / 2, halfDepth: block.depth / 2,
    halfHeight: (block.top - (block.bottom ?? 0)) / 2,
    solidTop: block.top, stepHeight: 0.28,
  }));
  const contains = (surface, x, z) =>
    Math.abs(x - surface.x) <= surface.halfWidth + surface.supportMargin &&
    Math.abs(z - surface.z) <= surface.halfDepth + surface.supportMargin;
  const firstStep = blocks.find((block) => block.id === "cove-pool-exit-0");
  for (const z of [firstStep.z, firstStep.z - 0.15, firstStep.z - 0.3]) {
    let feet = firstStep.top;
    for (let x = -4.8; x < -3.4; x += 0.035) {
      feet = selectWalkSupportHeight(surfaces, x, z, feet, fallsLandmarks.basin.floor, contains);
      assert.notEqual(feet, null, "the exit has continuous step-height support");
      assert.equal(hasWalkingClearance(solids, x, z, feet, 0.4, 2.3), true,
        `full-body clearance at (${x}, ${z}), including the tall front corner`);
    }
    assert.equal(feet, fallsLandmarks.basin.rim);
  }
});

test("the gorge retains lower terrain beneath the independent bridge deck", () => {
  const { x, y, z } = fallsLandmarks.bridge;
  const ground = getFallsTerraceHeight(x, z);
  assert.ok(y - ground > 2.3, "a standing player fits beneath the raised route");
  for (const point of Object.values(fallsLandmarks.sockets)) {
    assert.equal(
      getFallsTerraceHeight(point.x, point.z),
      point.y,
      "a socket must sit on its own terrace, not underneath an overlapping step",
    );
  }
});

test("the western apron has a gorge approach and a broad supported turn beside the pool", () => {
  const route = fallsTerrainBlocks.filter((block) => block.id.startsWith("cove-west-escape-"));
  assert.equal(route.length, 3);
  let previousTop = 0;
  for (const [index, block] of route.entries()) {
    assert.ok(canGuidedJump(0, block.top - previousTop));
    if (index > 0) {
      const previous = route[index - 1];
      assert.ok(Math.abs(previous.x - block.x) < (previous.width + block.width) / 2);
      assert.ok(Math.abs(previous.z - block.z) < (previous.depth + block.depth) / 2,
        "successive supports overlap rather than leaving a crevice");
    }
    previousTop = block.top;
  }
  const last = route.at(-1);
  const pool = fallsLandmarks.basin;
  assert.ok(last.x + last.width / 2 > pool.x - pool.width / 2,
    "the final foothold meets the west pool bank");
  assert.ok(pool.rim - last.top <= 0.28, "the apron meets the rim within a walking riser");
  // This is the exposed turn, not the apron center hidden inside the western
  // rock proxy. A full standing footprint must remain supported here.
  for (const x of [-7.8, -7.0]) {
    for (const z of [-5.35, -4.55]) {
      assert.ok(getFallsTerraceHeight(x, z) >= last.top);
    }
  }
});

test("the western escape clears real waterfall boxes and the Moon shelf at player height", () => {
  const playerRadius = 0.4;
  const playerHeight = 2.3;
  const jumpRise = playerJumpLaunchVelocity ** 2 / (2 * playerJumpGravity);
  const cave = fallsLandmarks.cave;
  const western = fallsLandmarks.westernWaterfall;
  // Mirror createWaterfall's authored masses and registerClimbableBox's
  // setFromObject bounds. Use the production geometry at every quality tier.
  const masses = [
    { size: [4.2, western.height + 0.8, 2.5], at: [western.x, (western.height + 0.8) / 2, western.z - 0.6], seed: western.x * 0.47 + western.height * 1.31 },
    { size: [1.1, cave.height + 0.8, 2.5], at: [cave.x - 1.55, (cave.height + 0.8) / 2, cave.z - 0.6], seed: cave.x * 0.47 + cave.height * 1.31 },
    { size: [2.1, 1.1, 2.5], at: [cave.x, cave.height + 0.25, cave.z - 0.6], seed: cave.x * 0.47 + cave.height * 1.31 + 2 * 2.17 },
  ];
  const moon = fallsTerrainBlocks.find((block) => block.id === "moon-shrine");
  const waypoints = [
    [-6.6, -1.5], [-6.6, -2.7], [-6.6, -3.6],
    [-7.0, -4.95], [-7.4, -4.95], [-6.7, -4.95], [-6.0, -4.95],
  ];
  for (const quality of ["low", "medium", "high"]) {
    const boxes = masses.map(({ size, at, seed }) => {
      const geometry = createLayeredCliffGeometry(...size, quality, seed);
      const bounds = geometry.boundingBox.clone().translate(new THREE.Vector3(...at));
      geometry.dispose();
      return bounds;
    });
    boxes.push(new THREE.Box3(
      new THREE.Vector3(moon.x - moon.width / 2, 0, moon.z - moon.depth / 2),
      new THREE.Vector3(moon.x + moon.width / 2, moon.top, moon.z + moon.depth / 2),
    ));
    for (let segment = 1; segment < waypoints.length; segment += 1) {
      const [ax, az] = waypoints[segment - 1];
      const [bx, bz] = waypoints[segment];
      const from = getFallsTerraceHeight(ax, az);
      const to = getFallsTerraceHeight(bx, bz);
      assert.ok(canGuidedJump(Math.hypot(bx - ax, bz - az), to - from));
      for (let sample = 0; sample <= 40; sample += 1) {
        const t = sample / 40;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const feet = Math.min(from, to);
        // Conservative swept height covers standing and the whole jump apex.
        const head = Math.max(from, to) + jumpRise + playerHeight;
        for (const box of boxes) {
          if (feet >= box.max.y || head <= box.min.y) continue;
          const dx = x - Math.max(box.min.x, Math.min(x, box.max.x));
          const dz = z - Math.max(box.min.z, Math.min(z, box.max.z));
          assert.ok(dx * dx + dz * dz > playerRadius ** 2,
            `${quality}: the standing/jumping player must clear rock at (${x}, ${z})`);
        }
      }
    }
    const slitWidth = boxes[1].min.x - boxes[0].max.x;
    assert.ok(slitWidth >= playerRadius * 2 + 0.1,
      "the visible slit must admit the full player, even with rectangular proxies");
    const slitX = (boxes[0].max.x + boxes[1].min.x) / 2;
    // Escape from the original northern pinch, then turn east into the pool.
    const escape = [[slitX, -5.8], [slitX, -5.15], [-7.0, -4.95], [-6.0, -4.95]];
    for (let segment = 1; segment < escape.length; segment += 1) {
      const [ax, az] = escape[segment - 1];
      const [bx, bz] = escape[segment];
      for (let sample = 0; sample <= 30; sample += 1) {
        const t = sample / 30;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        assert.ok(getFallsTerraceHeight(x, z) >= fallsLandmarks.basin.floor,
          "the escape turn stays above the gorge on continuous stone");
        for (const box of boxes) {
          const dx = x - Math.max(box.min.x, Math.min(x, box.max.x));
          const dz = z - Math.max(box.min.z, Math.min(z, box.max.z));
          assert.ok(dx * dx + dz * dz > playerRadius ** 2,
            `${quality}: the original nook has an unobstructed route past the rounded stone`);
        }
      }
    }
  }
});

test("the river footprint stays continuous across the former mouth to the island edge", () => {
  for (const x of [2.5, 4, 5.5]) {
    const edgeZ = Math.sqrt(18 ** 2 - x ** 2);
    for (const z of [10.9, 11, 11.1, 14, edgeZ]) {
      assert.equal(isInsideFallsRiver(x, z), true,
        `the channel must not leave a dry shelf at (${x}, ${z})`);
    }
    assert.equal(isInsideFallsRiver(x, edgeZ + 0.2), false,
      "the horizontal river ends at the void cascade");
  }
  assert.equal(isInsideFallsRiver(1.5, 15), false);
  assert.equal(isInsideFallsRiver(6.5, 15), false);
});

test("the rear Moon-pillar nook catches falls and permits a hop to the pool and Moon escape ledge", () => {
  const cave = fallsLandmarks.cave;
  const western = fallsLandmarks.westernWaterfall;
  const footing = fallsTerrainBlocks.find(block => block.id === "cove-moon-pillar-footing");
  const nook = fallsTerrainBlocks.find(block => block.id === "cove-moon-pillar-nook");
  assert.ok(footing, "fill the inner nook above the lower western apron");
  assert.equal(footing.bottom ?? 0, 0, "solid infill must not leave a trap underneath");
  const from = { x: -7.8, z: -5.2, y: getFallsTerraceHeight(-7.8, -5.2) };
  assert.ok(from.y > fallsLandmarks.basin.rim);
  assert.ok(footing.top - nook.top > 1.2 && canGuidedJump(0, footing.top - nook.top),
    "the deeper nook remains within the player's jump-out height");
  for (const [x, z] of [[-8.05, -5.5], [-7.8, -5.2], [-7.4, -4.7]]) {
    assert.ok(getFallsTerraceHeight(x, z) >= footing.top,
      "the inner cleft must have a continuous high floor, not a low pocket");
  }
  const rearPocket = [[-8.9, -6.65], [-8.5, -6.8], [-8.1, -6.6]];
  for (const [x, z] of rearPocket) {
    assert.ok(fallsTerrainBlocks.some(block =>
      Math.abs(x - block.x) <= block.width / 2 &&
      Math.abs(z - block.z) <= block.depth / 2 &&
      block.top === nook.top && (block.bottom ?? 0) === 0),
    "the rear nook needs a grounded shallow floor, not a floating lid");
    assert.equal(getFallsTerraceHeight(x, z), nook.top);
  }
  assert.equal(getFallsTerraceHeight(-7.9, -8.0),
    fallsTerrainBlocks.find(block => block.id === "western-crown-3").top,
    "the body-narrow northern slot closes at crown height instead of forming a drop trap");
  const massSpecs = [
    [[4.2, western.height + 0.8, 2.5], [western.x, (western.height + 0.8) / 2, western.z - 0.6]],
    [[1.1, cave.height + 0.8, 2.5], [cave.x - 1.55, (cave.height + 0.8) / 2, cave.z - 0.6]],
    [[2.1, 1.1, 2.5], [cave.x, cave.height + 0.25, cave.z - 0.6]],
  ];
  for (const quality of ["low", "medium", "high"]) {
    const solids = fallsTerrainBlocks.map(block => ({
      x: block.x, z: block.z, y: (block.top + (block.bottom ?? 0)) / 2,
      halfWidth: block.width / 2, halfDepth: block.depth / 2,
      halfHeight: (block.top - (block.bottom ?? 0)) / 2,
    }));
    for (const [size, at] of massSpecs) {
      const geometry = createLayeredCliffGeometry(...size, quality, 17);
      const bounds = geometry.boundingBox.clone().translate(new THREE.Vector3(...at));
      const center = bounds.getCenter(new THREE.Vector3());
      const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      solids.push({ x: center.x, y: center.y, z: center.z,
        halfWidth: half.x, halfHeight: half.y, halfDepth: half.z });
      geometry.dispose();
    }
    for (const [x, z] of [[-8.05, -6.6], [from.x, from.z]]) {
      const floor = getFallsTerraceHeight(x, z);
      assert.ok(solids.every(solid => !loosePropIntersectsSolid(
        x, z, 0.4, floor, floor + 2.3, solid)),
      `${quality}: both nook and footing have room for the whole standing player`);
    }
    for (const [x, z] of rearPocket) {
      for (const feet of [footing.top + 1, footing.top, nook.top + 0.25, nook.top]) {
        assert.ok(solids.every(solid => !loosePropIntersectsSolid(
          x, z, 0.4, feet, feet + 2.3, solid)),
        `${quality}: falling onto the rear infill must not embed the player in a neighboring crown block`);
      }
    }
    // Launch from the rear so the whole body rises above the front lip before
    // reaching it; landing near the lip leaves room to walk onto the old exit.
    const exit = [[-8.85, -6.6], [-8.075, -6.9], [-8.075, -5.65], [from.x, from.z]];
    for (let leg = 1; leg < exit.length; leg += 1) {
      const [ax, az] = exit[leg - 1];
      const [bx, bz] = exit[leg];
      const rise = getFallsTerraceHeight(bx, bz) - getFallsTerraceHeight(ax, az);
      assert.ok(canGuidedJump(Math.hypot(bx - ax, bz - az), rise));
      const duration = (playerJumpLaunchVelocity +
        Math.sqrt(playerJumpLaunchVelocity ** 2 - 2 * playerJumpGravity * rise)) / playerJumpGravity;
      if (rise > 0) {
        const lipZ = footing.z - footing.depth / 2;
        const contactTime = (lipZ - 0.44 - az) / (bz - az) * duration;
        assert.ok(contactTime < playerJumpLaunchVelocity / playerJumpGravity,
          "the leading body edge reaches the front lip before the jump apex");
        assert.ok(nook.top + playerJumpLaunchVelocity * contactTime -
          playerJumpGravity * contactTime ** 2 / 2 >= footing.top,
        "the feet already clear the physical lip when the body first crosses it");
      }
      for (let sample = 0; sample <= 40; sample += 1) {
        const t = sample / 40;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        const floor = getFallsTerraceHeight(x, z);
        assert.ok(floor >= nook.top && floor <= footing.top,
          "the rear escape remains supported above the gorge");
        const time = duration * t;
        const feet = rise > 0
          ? nook.top + playerJumpLaunchVelocity * time - playerJumpGravity * time ** 2 / 2
          : floor;
        assert.ok(solids.every(solid => !loosePropIntersectsSolid(
          x, z, 0.44, feet, feet + 2.3, solid)),
        `${quality}: the crown/waterfall passage clears both the player and guided walking margin`);
      }
    }
    for (const [x, z] of [[-6.0, -4.95], [-7.8, -3.6]]) {
      const targetY = getFallsTerraceHeight(x, z);
      const rise = targetY - from.y;
      assert.ok(canGuidedJump(Math.hypot(x - from.x, z - from.z), rise));
      const duration = (playerJumpLaunchVelocity +
        Math.sqrt(playerJumpLaunchVelocity ** 2 - 2 * playerJumpGravity * rise)) / playerJumpGravity;
      for (let sample = 0; sample <= 80; sample += 1) {
        const t = sample / 80;
        const time = duration * t;
        const feet = from.y + playerJumpLaunchVelocity * time - playerJumpGravity * time ** 2 / 2;
        assert.ok(solids.every(solid => !loosePropIntersectsSolid(
          from.x + (x - from.x) * t, from.z + (z - from.z) * t,
          0.4, feet, feet + 2.3, solid)),
        `${quality}: jump to (${x}, ${z}) clears the pillar, Moon wall and apron throughout its arc`);
      }
    }
  }
});
