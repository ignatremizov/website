import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { FallsCrystalFrog } from "../src/game/zones/falls/FallsCrystalFrog.ts";
import {
  createFallsFrogRoutes, frogArcClearsBlock,
} from "../src/game/zones/falls/FallsCrystalFrogRoute.ts";
import { forEachFallsTerrainBlock, fallsLandmarks } from "../src/game/zones/falls/FallsLayout.ts";
import { isInsideFallsRiver } from "../src/game/fallsRiver.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";

function fixture(t) {
  t.mock.method(Math, "random", () => 0.37);
  const calls = [];
  let clear = true;
  let landings = 0;
  let elapsed = 0;
  const root = new THREE.Group();
  const frog = new FallsCrystalFrog({
    readPlayerFeet: () => false,
    isHopClear: (...args) => { calls.push(args); return clear; },
    floorHeight: (x, z) => Math.hypot(x, z) > 18 ? null : 0,
    shadowHeight: (x, _y, z) => Math.hypot(x, z) > 18 ? null : 0,
    onWaterLanding: () => { landings += 1; },
  });
  frog.mount(root);
  t.after(() => frog.dispose());
  const step = (frames = 1, reduced = false) => {
    for (let i = 0; i < frames; i += 1) {
      elapsed += 1 / 60;
      frog.update(1 / 60, elapsed, reduced);
    }
  };
  return {
    frog, root, calls, step,
    setClear: value => { clear = value; },
    landings: () => landings,
  };
}

test("catching a hopping frog suspends its route until released, including reduced motion", t => {
  const { frog, calls, step } = fixture(t);
  const body = frog.getBody();
  const start = body.object.position.clone();
  for (let frame = 0; frame < 240 && start.distanceTo(body.object.position) < 0.1; frame += 1) step();
  assert.ok(start.distanceTo(body.object.position) >= 0.1, "fixture reaches a moving hop");
  assert.equal(frog.beginHold(body), true);
  body.object.position.set(8.8, 5.6, 5);
  const held = body.object.position.clone();
  const oldCalls = calls.length;
  for (const reduced of [false, true]) {
    frog.setQuality(reduced ? "low" : "high");
    step(90, reduced);
    assert.deepEqual(body.object.position, held, "roaming must not fight the pointer");
    assert.equal(body.enabled, false, "shared free-body physics must not move a held frog");
  }
  assert.equal(calls.length, oldCalls, "holding does not repeatedly plan escape routes");
  body.velocity.set(25, 0, -25);
  assert.equal(frog.releaseHold(body), true);
  assert.ok(Math.hypot(body.velocity.x, body.velocity.z) <= 10.00001);
  assert.ok(body.velocity.x > 0 && body.velocity.z < 0, "recent throw direction survives release");
  assert.equal(body.enabled, true);
  assert.equal(frog.beginHold(body), true, "a frog can be caught again during free flight");
  body.velocity.set(8, 0, 3);
  assert.equal(frog.releaseHold(body, true), true);
  assert.equal(body.velocity.lengthSq(), 0, "cancellation must not synthesize a fling");
  assert.equal(frog.releaseHold(body), false, "late duplicate pointerup does not release twice");
});

test("a released frog reconnects from its actual landing without snapping to its old perch", t => {
  const { frog, calls, step, landings } = fixture(t);
  const body = frog.getBody();
  const original = body.object.position.clone();
  const { nodes, edges } = createFallsFrogRoutes();
  const target = nodes.find((node, index) => edges[index].length > 3 &&
    original.distanceTo(new THREE.Vector3(node.x, node.y, node.z)) > 6);
  assert.ok(target);
  frog.beginHold(body);
  body.object.position.set(target.x + 0.12, target.y, target.z + 0.12);
  frog.releaseHold(body);
  const dropped = body.object.position.clone();
  // The shared physics owner reports a real supported landing.
  body.onPlatform = true;
  body.platform = { id: "test-landing" };
  body.velocity.set(0, 0, 0);
  calls.length = 0;
  step(6);
  assert.equal(body.enabled, false, "route ownership resumes only after physics settles");
  assert.deepEqual(body.object.position, dropped);
  assert.equal(landings(), 1);
  let previous = body.object.position.clone();
  for (let frame = 0; frame < 150; frame += 1) {
    step();
    assert.ok(body.object.position.distanceTo(previous) < 0.6,
      "returning to the graph must follow a hop, not teleport");
    previous.copy(body.object.position);
  }
  const rejoin = calls.find(args => Math.hypot(args[3] - args[0], args[5] - args[2]) > 0.01);
  assert.ok(rejoin);
  assert.deepEqual(rejoin.slice(0, 3), [dropped.x, dropped.y, dropped.z]);
});

test("void recovery dissolves before relocating and waits for a currently clear respawn", t => {
  const { frog, calls, step, setClear } = fixture(t);
  const body = frog.getBody();
  frog.beginHold(body);
  body.object.position.set(25, 2, 0);
  const outside = body.object.position.clone();
  frog.releaseHold(body);
  step(20);
  assert.equal(frog.canGrab(body), false);
  assert.equal(body.enabled, false);
  assert.deepEqual(body.object.position, outside, "dissolve starts where it was thrown");
  setClear(false);
  calls.length = 0;
  step(150);
  assert.deepEqual(body.object.position, outside, "blocked respawn cannot choose an unsafe perch");
  assert.ok(calls.length < 1000, "blocked spawn retries are throttled, not every frame");
  assert.equal(body.object.children[0].scale.lengthSq(), 0, "waiting keeps the frog fully dissolved");
  setClear(true);
  let moved = false;
  for (let frame = 0; frame < 120; frame += 1) {
    step();
    if (!moved && !body.object.position.equals(outside)) {
      moved = true;
      assert.equal(frog.canGrab(body), false, "relocation remains unpickable during rematerialization");
      assert.equal(body.object.children[0].scale.lengthSq(), 0, "relocation occurs only while invisible");
    }
  }
  assert.equal(moved, true);
  assert.equal(frog.canGrab(body), true);
  assert.ok(Math.hypot(body.object.position.x, body.object.position.z) < 18);
});

test("collapse and teardown revoke a borrowed frog without reviving its old route", t => {
  const { frog, root, step } = fixture(t);
  const body = frog.getBody();
  frog.beginHold(body);
  frog.releaseHold(body);
  frog.freezeForWorldCollapse();
  const frozen = body.object.position.clone();
  assert.equal(body.enabled, false);
  assert.equal(frog.canGrab(body), false);
  step(120);
  assert.deepEqual(body.object.position, frozen);
  frog.setQuality("low");
  assert.equal(frog.canGrab(body), false);
  frog.unmount();
  assert.equal(frog.getBody(), null);
  frog.mount(root);
  assert.notEqual(frog.getBody(), body);
  assert.equal(body.enabled, false);
  assert.equal(frog.canGrab(frog.getBody()), true);
});

test("a frog dropped under the bridge takes floor steps and rejoins without glitching, also with reduced motion", t => {
  t.mock.method(Math, "random", () => 0.37);
  const blocks = [];
  forEachFallsTerrainBlock(block => blocks.push({ bottom: 0, ...block }));
  for (const x of [-6.4, 2.2]) {
    blocks.push({ x, z: 2.4, width: 0.62, depth: 2.4, bottom: 0, top: 2.37 });
  }
  for (const z of [1.33, 3.47]) {
    blocks.push({ x: -2.1, z, width: 9.5, depth: 0.2, bottom: 2.7, top: 3.08 });
  }
  blocks.push({
    ...fallsLandmarks.monument, width: 2.5, depth: 2.5, bottom: -0.05, top: 1.45,
  });
  for (const npc of Object.values(fallsLandmarks.npcs)) {
    blocks.push({ x: npc.x, z: npc.z, width: 1.16, depth: 1.16, bottom: npc.y, top: npc.y + 2.1 });
  }
  const floor = (x, z) => Math.hypot(x, z) > 18 ? null : isInsideFallsRiver(x, z) ? -0.16 : 0;
  const { nodes } = createFallsFrogRoutes();
  for (const reduced of [false, true]) {
    const accepted = [];
    const frog = new FallsCrystalFrog({
      readPlayerFeet(out) {
        Object.assign(out, { ...fallsLandmarks.monument, y: 0.82 });
        return true;
      },
      isHopClear(x, y, z, tx, ty, tz, lift, radius, height) {
        const from = { x, y, z }, to = { x: tx, y: ty, z: tz };
        const clear = blocks.every(block => {
          if (lift > 0) return frogArcClearsBlock(from, to, lift, block);
          return !loosePropIntersectsSolid(x, z, radius, y, y + height, {
            x: block.x, z: block.z, y: (block.top + block.bottom) / 2,
            halfWidth: block.width / 2, halfDepth: block.depth / 2,
            halfHeight: (block.top - block.bottom) / 2,
          });
        });
        if (clear && Math.hypot(tx - x, tz - z) > 0.01) accepted.push({ from, to, lift });
        return clear;
      },
      floorHeight: floor, shadowHeight: (x, _y, z) => floor(x, z), onWaterLanding() {},
    });
    t.after(() => frog.dispose());
    frog.mount(new THREE.Group());
    const body = frog.getBody();
    frog.beginHold(body);
    body.object.position.set(1, -0.16, 2.4);
    frog.releaseHold(body, true);
    let rejoined = false;
    const previous = body.object.position.clone();
    for (let frame = 0; frame < 600; frame += 1) {
      frog.update(1 / 60, frame / 60, reduced);
      const debug = frog.getDebugHop();
      if (debug) {
        const selected = accepted.at(-1);
        assert.deepEqual([debug.from.x, debug.from.y, debug.from.z],
          [selected.from.x, selected.from.y, selected.from.z]);
        assert.deepEqual([debug.to.x, debug.to.y, debug.to.z],
          [selected.to.x, selected.to.y, selected.to.z]);
        assert.equal(debug.lift, selected.lift, "debug draws the selected low/high arc, not a new plan");
        assert.equal(frog.getDebugHop(), debug, "debug queries borrow the same wrapper");
      }
      assert.equal(frog.canGrab(body), true, "ordinary escape must never enter dissolve/reform");
      assert.ok(body.object.position.distanceTo(previous) < 0.6, "rejoin has no position snap");
      previous.copy(body.object.position);
      if (nodes.some(node => body.object.position.distanceToSquared(
        new THREE.Vector3(node.x, node.y, node.z)) < 1e-10)) {
        rejoined = true;
        break;
      }
    }
    assert.equal(rejoined, true);
    assert.ok(accepted.length >= 2, "a short floor step precedes the graph rejoin");
    assert.equal(accepted[0].to.y, -0.16);
    assert.deepEqual(accepted[1].from, accepted[0].to, "the next hop starts at the actual floor landing");
    assert.equal(body.enabled, false);
    frog.beginHold(body);
    assert.equal(frog.getDebugHop(), null, "holding revokes the debug route too");
  }
});

test("a safely landed frog waits for a blocked exit instead of glitching to another perch", t => {
  t.mock.method(Math, "random", () => 0.37);
  let blocked = true;
  let checks = 0;
  const frog = new FallsCrystalFrog({
    readPlayerFeet: () => false,
    isHopClear(x, y, z, tx, ty, tz) {
      checks += 1;
      return !blocked || (x === tx && y === ty && z === tz);
    },
    floorHeight: () => -0.16, shadowHeight: () => 0.205, onWaterLanding() {},
  });
  t.after(() => frog.dispose());
  frog.mount(new THREE.Group());
  const body = frog.getBody();
  frog.beginHold(body);
  body.object.position.set(1, -0.16, 2.4);
  frog.releaseHold(body, true);
  const landing = body.object.position.clone();
  checks = 0;
  for (let frame = 0; frame < 720; frame += 1) {
    frog.update(1 / 60, frame / 60, false);
    assert.equal(frog.canGrab(body), true);
  }
  assert.deepEqual(body.object.position, landing);
  assert.ok(checks < 300, "blocked exits are retried on decisions, not on every frame");
  blocked = false;
  for (let frame = 720; frame < 960; frame += 1) frog.update(1 / 60, frame / 60, false);
  assert.ok(body.object.position.distanceTo(landing) > 0.5, "fresh host clearance allows departure");
});
