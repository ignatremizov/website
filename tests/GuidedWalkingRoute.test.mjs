import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceWalkingWaypoint, departureLandingState, FailedWalkingRequestCache, findGuidedWalkingRoute,
  hasWalkingClearance, planDepartureJumpRoute, planGuidedRoute, retargetDepartureJumpRoute,
  retargetWalkingRoute, selectWalkSupportHeight, traceWalkSegment,
} from "../src/game/GuidedWalkingRoute.ts";
import { forEachFallsTerrainBlock } from "../src/game/zones/falls/FallsLayout.ts";
import { isInsideFallsRiver } from "../src/game/fallsRiver.ts";
import { canGuidedJump, getGuidedJumpRange, hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { NavigationJob, planNavigationWork } from "../src/game/NavigationPlanning.ts";

const stairHeight = (x) => x < 0 ? 0 : Math.min(1.4, (Math.floor(x / 0.55) + 1) * 0.2);
const sampleStairs = (x, z, previous) => {
  if (Math.abs(z) > 0.8 || x < -1 || x > 5) return null;
  const height = stairHeight(x);
  return Math.abs(height - previous) < 0.29 ? height : null;
};

test("the monument's semantic top is walkable without treating its gem's coarse box as a ceiling", () => {
  const monument = {
    x: 2.05, z: 5.15, y: 0.7,
    halfWidth: 1.16, halfDepth: 1.16, halfHeight: 0.75,
    solidTop: 0.82, clearAbove: 0.7,
  };
  assert.equal(hasWalkingClearance([monument], 2.05, 5.15, 0.82, 0.44, 2.3), true);
  assert.equal(hasWalkingClearance([monument], 2.05, 5.15, -0.16, 0.44, 2.3), false);
  const overheadDeck = {
    x: 2.05, z: 5.15, y: 2.535,
    halfWidth: 2, halfDepth: 1, halfHeight: 0.165, solidTop: 2.7,
  };
  assert.equal(hasWalkingClearance([monument, overheadDeck], 2.05, 5.15, 0.82, 0.44, 2.3), false);
});

test("departure landing waits for river support easing after updateJump grounds the player", () => {
  const landing = { x: 0.25, y: -0.16, z: 5.15 };
  const position = { x: 0.2366667, y: 0, z: 5.15 };
  const delta = 1 / 60;
  let settlingFor = 0;
  let state;
  for (let frame = 56; frame < 77; frame += 1) {
    // updateJump has set jumpHeight/velocity=0. Navigation reads the prior
    // surfaceOffset; updateWorldSurface eases it only later in this frame.
    const before = { ...position };
    state = departureLandingState(position, landing, -0.16, settlingFor);
    assert.deepEqual(position, before, "navigation never snaps position or support offset");
    if (frame === 56) assert.equal(state, "settling");
    assert.notEqual(state, "invalid");
    if (state === "landed") break;
    settlingFor += delta;
    position.y += (-0.16 - position.y) * (1 - Math.exp(-delta * 14));
  }
  assert.equal(state, "landed");
  assert.ok(position.y > -0.16, "walking resumes after tolerance is met, not an injected final height");
  assert.ok(Math.abs(position.y - landing.y) < 0.08);
});

test("departure support settling rejects wrong levels, missing support, and an offset that never settles", () => {
  const landing = { x: 0.25, y: -0.16, z: 5.15 };
  const position = { x: 0.2366667, y: 0, z: 5.15 };
  assert.equal(departureLandingState(position, landing, 0, 0), "invalid");
  assert.equal(departureLandingState(position, landing, 2.7, 0), "invalid");
  assert.equal(departureLandingState(position, landing, null, 0), "invalid");
  assert.equal(departureLandingState({ ...position, y: 0.82 }, landing, -0.16, 0), "invalid");
  assert.equal(departureLandingState({ ...position, x: 1 }, landing, -0.16, 0), "invalid");
  assert.equal(departureLandingState(position, landing, -0.16, 0.34), "settling");
  assert.equal(departureLandingState(position, landing, -0.16, 0.35), "invalid");
});

test("a walkable stair flight carries height between treads in both directions", () => {
  const bottom = { x: -0.5, y: 0, z: 0 };
  const top = { x: 4.2, y: 1.4, z: 0 };
  assert.equal(traceWalkSegment(bottom, top.x, top.z, sampleStairs), 1.4);
  assert.equal(traceWalkSegment(top, bottom.x, bottom.z, sampleStairs), 0);
  assert.deepEqual(findGuidedWalkingRoute(bottom, top, sampleStairs), [bottom, top]);
  assert.deepEqual(findGuidedWalkingRoute(top, bottom, sampleStairs), [top, bottom]);
});

test("the follower reaches a narrow entrance before cutting toward the next waypoint", () => {
  const path = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }];
  const sample = (x, z) => (
    (Math.abs(x) <= 0.1 && z >= -1 && z <= 1.1) ||
    (z >= 0.9 && z <= 1.1 && x >= -0.1 && x <= 2.1)
  ) ? 0 : null;
  assert.equal(advanceWalkingWaypoint(path, 1, { x: 0, y: 0, z: 0.6 }, sample, false), 1);
  assert.equal(advanceWalkingWaypoint(path, 1, { x: 0, y: 0, z: 0.96 }, sample, false), 2);
});

test("a final jump retains its takeoff waypoint until the player reaches its height and position", () => {
  const path = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 1.1, z: 1 }];
  const sample = () => 0;
  assert.equal(advanceWalkingWaypoint(path, 1, { x: 0, y: 0, z: 0.7 }, sample, true), 1);
  assert.equal(advanceWalkingWaypoint(path, 1, { x: 0, y: 0.2, z: 1 }, sample, true), 1);
  assert.equal(advanceWalkingWaypoint(path, 1, { x: 0, y: 0, z: 0.99 }, sample, true), 2);
});

test("routing distinguishes a bridge deck from the path underneath at the same XZ", () => {
  // The elevated lane is reached via stairs on the right; an opaque wall on
  // the left rules out treating a same-XZ destination as an immediate arrival.
  const sample = (x, z, previous) => {
    if (x < -1 || x > 5.5 || z < -1 || z > 4.5) return null;
    let height = 0;
    if (x >= 3.7 && x <= 5 && z >= 0) height = Math.min(1.4, Math.floor(z / 0.5) * 0.2);
    if (previous > 1.1 && x < 4 && z >= 3.4) height = 1.4;
    if (x < 3.7 && previous < 1.1) height = 0;
    return Math.abs(previous - height) < 0.29 ? height : null;
  };
  const start = { x: 0, y: 0, z: 3.7 };
  const goal = { x: 0, y: 1.4, z: 3.7 };
  const path = findGuidedWalkingRoute(start, goal, sample);
  assert.ok(path.length > 2);
  assert.ok(path.some((point) => point.x > 3.7));
  assert.deepEqual(path.at(-1), goal);
  for (let i = 1; i < path.length; i += 1) {
    assert.ok(Math.abs(traceWalkSegment(path[i - 1], path[i].x, path[i].z, sample) - path[i].y) < 0.08);
  }
});

test("walking does not grant a jump or shortcut through an impassable riser", () => {
  const sample = (x, z, previous) => {
    if (x < -1 || x > 1 || Math.abs(z) > 0.5) return null;
    const height = x > 0 ? 1 : 0;
    return Math.abs(previous - height) < 0.29 ? height : null;
  };
  assert.deepEqual(findGuidedWalkingRoute(
    { x: -0.5, y: 0, z: 0 }, { x: 0.5, y: 1, z: 0 }, sample,
  ), []);
});

test("a distant isolated plinth can be approached on foot before the final jump", () => {
  const start = { x: -7, y: 0, z: 0 };
  const goal = { x: 0, y: 1.1, z: 0 };
  const sample = (x, z, height) =>
    Math.abs(x) > 9 || Math.abs(z) > 2 || Math.hypot(x, z) < 1 || height > 0.29 ? null : 0;
  const path = findGuidedWalkingRoute(
    start, goal, sample,
    (point) => Math.hypot(point.x - goal.x, point.z - goal.z) <= 2,
  );
  assert.ok(path.length >= 2);
  assert.ok(path.every((point) => point.y === 0));
  assert.ok(Math.hypot(path.at(-1).x, path.at(-1).z) <= 2);
  assert.ok(Math.hypot(path.at(-1).x, path.at(-1).z) >= 1);
});

test("failed held destinations are reused until player, target, or terrain changes", () => {
  const cache = new FailedWalkingRequestCache();
  const start = { x: 0, y: 0, z: 0 };
  const goal = { x: 7, y: 4, z: 3 };
  cache.remember(start, goal, "ledge", 5);
  assert.equal(cache.matches(start, goal, "ledge", 5), true);
  assert.equal(cache.matches(start, { ...goal, x: 7.05 }, "ledge", 5), true);
  assert.equal(cache.matches({ ...start, x: 0.4 }, goal, "ledge", 5), false);
  assert.equal(cache.matches(start, { ...goal, y: 4.2 }, "ledge", 5), false);
  assert.equal(cache.matches(start, goal, "other-ledge", 5), false);
  assert.equal(cache.matches(start, goal, "ledge", 6), false);
  cache.clear();
  assert.equal(cache.matches(start, goal, "ledge", 5), false);
});

test("retargeting preserves unconsumed bends but rejects blocked tails and wrong support heights", () => {
  const path = [
    { x: -2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 2 }, { x: 2, y: 0, z: 2 },
  ];
  const position = { x: 0, y: 0, z: 0.8 };
  const goal = { x: 2.4, y: 0, z: 2 };
  const sample = (x, z) => (Math.abs(x) < 0.2 || z > 1.8) ? 0 : null;
  assert.deepEqual(retargetWalkingRoute(path, 2, position, goal, sample),
    [position, path[2], goal]);
  assert.equal(retargetWalkingRoute(path, 2, position, { ...goal, y: 1 }, sample), null);
  assert.equal(retargetWalkingRoute(path, 2, position, goal,
    (x, z) => x > 1 && x < 1.3 ? null : sample(x, z)), null);
  assert.equal(retargetWalkingRoute(path, 2, position, goal,
    (x, z) => z > 1.2 && z < 1.5 ? null : sample(x, z)), null);
});

test("walking wins over an available takeoff even when it needs a detour", () => {
  const sample = (x, z) => Math.abs(x) > 3 || Math.abs(z) > 3 ||
    (Math.abs(x) < 0.4 && Math.abs(z) < 1) ? null : 0;
  let arcs = 0;
  const result = planGuidedRoute(
    { x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, sample,
    () => { arcs += 1; return true; },
  );
  assert.equal(result.kind, "walking");
  assert.equal(arcs, 0);
});

test("nearby jump retargets retain every walking bend and exact takeoff but reject a newly blocked arc", () => {
  const position = { x: 0, y: 0, z: 0.8 };
  const takeoff = { x: 1, y: 0, z: 2 };
  const landing = { x: 2.06, y: 0.82, z: 2 };
  const path = [
    { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, takeoff,
    { ...landing, x: 2.05 },
  ];
  let walkingSamples = 0;
  const sample = (x, z) => {
    walkingSamples += 1;
    return x <= 1 && (Math.abs(x) < 0.2 || z > 1.8) ? 0 : null;
  };
  let blocked = false;
  let arcChecks = 0;
  const acceptJump = (from, to) => {
    arcChecks += 1;
    assert.deepEqual(from, takeoff);
    return canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
      hasGuidedJumpClearance(from, to, 6.8,
        (x, _z, feet) => !(blocked && x > 1.3 && x < 1.8 && feet > 0.1));
  };
  assert.deepEqual(retargetWalkingRoute(path, 1, position, landing, sample, acceptJump),
    [position, path[1], takeoff, landing]);
  assert.ok(walkingSamples < 30, "only the remaining walking approach is sampled");
  blocked = true;
  assert.equal(retargetWalkingRoute(path, 1, position, landing, sample, acceptJump), null);
  assert.equal(arcChecks, 2, "each retarget freshly checks the landing arc");
  assert.equal(retargetWalkingRoute(path, 1, position, { ...landing, y: 3 }, sample, acceptJump), null);
  assert.equal(retargetWalkingRoute(path, 1, position, landing,
    (x, z) => z > 1.2 && z < 1.5 ? null : sample(x, z), acceptJump), null);
});

test("final jump approach uses current supported takeoff without walking back to the consumed waypoint", () => {
  const path = [
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
    { x: 2.05, y: 0.82, z: 0 },
  ];
  const position = { x: 1.02, y: 0, z: 0 };
  const landing = { ...path[2], x: 2.06 };
  let checkedFrom;
  const acceptJump = (from, to) => {
    checkedFrom = { ...from };
    return canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
      hasGuidedJumpClearance(from, to, 6.8, () => true);
  };
  const sample = (x) => x >= position.x ? 0 : null;
  assert.deepEqual(retargetWalkingRoute(path, 2, position, landing, sample, acceptJump),
    [position, landing]);
  assert.deepEqual(checkedFrom, position);
  checkedFrom = undefined;
  assert.equal(retargetWalkingRoute(path, 2, position, landing, () => null, acceptJump), null);
  assert.equal(checkedFrom, undefined, "lost takeoff support rejects reuse before testing the arc");
});

test("failed walking reuses reachable parent chains and checks jump acceptance afresh", () => {
  const start = { x: -3, y: 0, z: 0 };
  const goal = { x: 0, y: 1, z: 0 };
  let samples = 0;
  const sample = (x, z) => {
    samples += 1;
    return Math.abs(x) > 4 || Math.abs(z) > 1 || x > -0.7 ? null : 0;
  };
  assert.equal(planGuidedRoute(start, goal, sample).kind, "unreachable");
  const failedSamples = samples;
  samples = 0;
  const result = planGuidedRoute(start, goal, sample, (point) => point.x > -1.5);
  assert.equal(result.kind, "jump");
  assert.ok(result.path.at(-1).x > -1.5);
  assert.ok(samples < failedSamples + 100, "only path smoothing adds walking probes");
  for (let i = 1; i < result.path.length; i += 1) {
    assert.equal(traceWalkSegment(result.path[i - 1], result.path[i].x, result.path[i].z, sample), 0);
  }
  samples = 0;
  assert.equal(planGuidedRoute(start, goal, sample, () => false).kind, "unreachable");
  assert.equal(samples, failedSamples, "rejected arcs must not launch another terrain search");
});

function createFallsWalkingFixture() {
  const surfaces = [];
  const solids = [];
  forEachFallsTerrainBlock((block) => {
    const bottom = block.bottom ?? 0;
    surfaces.push({
      id: block.id, x: block.x, z: block.z,
      halfWidth: block.width / 2, halfDepth: block.depth / 2,
      requiresJump: false, stepHeight: 0.28, heightAt: () => block.top,
      supportMargin: block.kind === "step" ? 0.015 : 0.12,
    });
    solids.push({
      x: block.x, z: block.z, y: (block.top + bottom) / 2,
      halfWidth: block.width / 2, halfDepth: block.depth / 2,
      halfHeight: (block.top - bottom) / 2, solidTop: block.top, stepHeight: 0.28,
    });
  });
  for (const x of [-6.4, 2.2]) {
    solids.push({ x, z: 2.4, y: 1.185, halfWidth: 0.31, halfDepth: 1.2, halfHeight: 1.185 });
  }
  solids.push({
    x: 2.05, y: 0.7, z: 5.15,
    halfWidth: 1.25, halfHeight: 0.75, halfDepth: 1.25, solidTop: 0.82,
  });
  const contains = (surface, x, z) =>
    Math.abs(x - surface.x) < surface.halfWidth + surface.supportMargin &&
    Math.abs(z - surface.z) < surface.halfDepth + surface.supportMargin;
  const sample = (x, z, previous) => {
    if (Math.hypot(x, z) > 15.95) return null;
    const height = selectWalkSupportHeight(
      surfaces, x, z, previous, isInsideFallsRiver(x, z) ? -0.16 : 0, contains,
    );
    return height !== null && hasWalkingClearance(solids, x, z, height, 0.44, 2.3) ? height : null;
  };
  return { sample, surfaces, solids };
}

test("the Falls route can leave the underpass via the garden and walk the right-hand stair flight", () => {
  const { sample } = createFallsWalkingFixture();
  const underBridge = { x: 1.3, y: -0.16, z: 3.4 };
  const rightStair = { x: 5.6, y: 1.05 + (2.7 - 1.05) / 7 * 4, z: 5.9 };
  const path = findGuidedWalkingRoute(underBridge, rightStair, sample);
  assert.ok(path.length > 2, "the raised stairs require a physical approach, not a jump through the abutment");
  assert.ok(path.some((point) => point.z > 9.3), "reach the garden via its entry stairs");
  let retargetSamples = 0;
  const adjacentStair = { ...rightStair, z: rightStair.z - 0.6,
    y: 1.05 + (2.7 - 1.05) / 7 * 5 };
  const reused = retargetWalkingRoute(path, 1, underBridge, adjacentStair, (...args) => {
    retargetSamples += 1;
    return sample(...args);
  });
  assert.ok(reused, "adjacent higher tread reuses the garden approach");
  assert.ok(retargetSamples < 400, `bounded retarget used ${retargetSamples} walking samples`);
  for (let i = 1; i < path.length; i += 1) {
    const height = traceWalkSegment(path[i - 1], path[i].x, path[i].z, sample);
    assert.notEqual(height, null);
    assert.ok(Math.abs(height - path[i].y) < 0.08);
  }
  // Follow the route, including the waypoint acceptance radius. A valid A*
  // path alone did not catch the corner-cutting that wedged the player here.
  const position = { ...underBridge };
  let waypointIndex = 1;
  for (let frame = 0; frame < 900; frame += 1) {
    waypointIndex = advanceWalkingWaypoint(path, waypointIndex, position, sample, false);
    const waypoint = path[waypointIndex];
    const distance = Math.hypot(waypoint.x - position.x, waypoint.z - position.z);
    if (waypointIndex === path.length - 1 && distance < 0.025) break;
    const fraction = Math.min(1, 6.8 / 60 / distance);
    const x = position.x + (waypoint.x - position.x) * fraction;
    const z = position.z + (waypoint.z - position.z) * fraction;
    const height = traceWalkSegment(position, x, z, sample);
    assert.notEqual(height, null, `walkable follower segment at frame ${frame}`);
    Object.assign(position, { x, y: height, z });
  }
  assert.ok(Math.hypot(position.x - rightStair.x, position.z - rightStair.z) < 0.025);
  assert.ok(Math.abs(position.y - rightStair.y) < 0.08);
  // A final jump can be out of range at departure, then become possible
  // after a walking approach climbs the Ember stairs.
  const keeper = { x: 6.1, y: 2.7, z: 1.2 };
  const crown = { x: 0.25, y: 4.6, z: -7.8 };
  assert.equal(getGuidedJumpRange(crown.y - keeper.y), 0);
  const approach = findGuidedWalkingRoute(keeper, crown, sample, (point) => {
    const range = getGuidedJumpRange(crown.y - point.y);
    return range > 0 && Math.hypot(point.x - crown.x, point.z - crown.z) <= Math.min(2.4, range * 0.58);
  });
  assert.ok(approach.length >= 2);
  assert.equal(approach.at(-1).y, 3.8);
  assert.ok(getGuidedJumpRange(crown.y - approach.at(-1).y) > 0);
});

test("a slightly shifted underpass start still finds the narrow exit to the reading stairs", (t) => {
  const { sample } = createFallsWalkingFixture();
  const start = { x: 1.47, y: -0.16, z: 3.4 };
  const goal = { x: -8, y: 1.575, z: 7.9 };
  assert.equal(traceWalkSegment(start, 1.3, 3.4, sample), -0.16);
  let samples = 0;
  const result = planGuidedRoute(start, goal, (...args) => { samples += 1; return sample(...args); });
  assert.equal(result.kind, "walking");
  assert.deepEqual(result.path.at(-1), goal);
  for (let i = 1; i < result.path.length; i += 1) {
    const height = traceWalkSegment(result.path[i - 1], result.path[i].x, result.path[i].z, sample);
    assert.notEqual(height, null);
    assert.ok(Math.abs(height - result.path[i].y) < 0.08);
  }
  assert.ok(samples < 180000, `bounded recovery used ${samples} samples`);
  t.diagnostic(`shifted-underpass walking recovery: ${samples} samples, ${result.path.length} waypoints`);
  const position = { ...start };
  let index = 1;
  for (let frame = 0; frame < 1800; frame += 1) {
    index = advanceWalkingWaypoint(result.path, index, position, sample, false);
    const next = result.path[index];
    const distance = Math.hypot(next.x - position.x, next.z - position.z);
    if (index === result.path.length - 1 && distance < 0.025) break;
    const fraction = Math.min(1, 6.8 / 60 / distance);
    const x = position.x + (next.x - position.x) * fraction;
    const z = position.z + (next.z - position.z) * fraction;
    const y = traceWalkSegment(position, x, z, sample);
    assert.notEqual(y, null, `shifted route remains executable at frame ${frame}`);
    Object.assign(position, { x, y, z });
  }
  assert.ok(Math.hypot(position.x - goal.x, position.z - goal.z) < 0.025);
  assert.ok(Math.abs(position.y - goal.y) < 0.08);
});

test("narrow-passage fine recovery remains resumable through the final smoothed route", () => {
  const { sample } = createFallsWalkingFixture();
  let samples = 0;
  const job = new NavigationJob(planNavigationWork(
    { x: 1.47, y: -0.16, z: 3.4 }, { x: -8, y: 1.575, z: 7.9 },
    {
      sample: (...args) => { samples += 1; return sample(...args); },
      supports: [], canLand: () => true, canJump: () => false,
    },
  ));
  let calls = 0;
  while (!job.done && calls < 5000) {
    const before = samples;
    job.advance(17);
    assert.ok(samples - before <= 17, "fine retry and smoothing cannot exceed the frame work cap");
    calls += 1;
  }
  assert.equal(job.done, true);
  assert.equal(job.result[0].kind, "walk");
  assert.deepEqual(job.result[0].path.at(-1), { x: -8, y: 1.575, z: 7.9 });
});

test("monument departure jumps clear of the bridge then walks to the river without treating the drop as a step", (t) => {
  const { sample, surfaces, solids } = createFallsWalkingFixture();
  surfaces.push({
    id: "altar", x: 2.05, z: 5.15, halfWidth: 1.08, halfDepth: 1.08,
    supportMargin: 0, requiresJump: true, heightAt: () => 0.82,
  });
  const start = { x: 2.05, y: 0.82, z: 5.15 };
  const goal = { x: 0, y: -0.16, z: 0 };
  const acceptJump = (from, to) =>
    canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
    hasGuidedJumpClearance(from, to, 6.8, (x, z, feet) =>
      solids.every((solid) => (solid.solidTop !== undefined && feet >= solid.solidTop - 0.015) ||
        !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, solid)));
  assert.equal(planGuidedRoute(start, goal, sample).kind, "unreachable");
  assert.equal(acceptJump(start, goal), false, "the direct jump hits the bridge");
  assert.equal(acceptJump(start, { x: 0, y: -0.16, z: 5.15 }), true);
  let landingProbes = 0;
  const sampleLanding = (x, z) => {
    landingProbes += 1;
    return sample(x, z, isInsideFallsRiver(x, z) ? -0.16 : 0);
  };
  let routeSamples = 0;
  const result = planDepartureJumpRoute(start, goal,
    (...args) => { routeSamples += 1; return sample(...args); }, sampleLanding, acceptJump);
  assert.equal(result.kind, "departure-jump");
  assert.ok(landingProbes <= 32);
  t.diagnostic(`monument departure: ${landingProbes} landing probes, ${routeSamples} route samples; landing ${JSON.stringify(result.path[1])}`);
  assert.equal(acceptJump(start, result.path[1]), true);
  assert.equal(traceWalkSegment(start, result.path[1].x, result.path[1].z, sample), null);
  for (let i = 2; i < result.path.length; i += 1) {
    assert.equal(traceWalkSegment(result.path[i - 1], result.path[i].x, result.path[i].z, sample),
      result.path[i].y);
  }
  const nextGoal = { ...goal, x: 0.01 };
  const reused = retargetDepartureJumpRoute(result.path, start, nextGoal, sample, acceptJump);
  assert.ok(reused);
  assert.deepEqual(reused[1], result.path[1], "held target changes retain the departure landing");
  assert.equal(retargetDepartureJumpRoute(result.path, start, nextGoal, sample, () => false), null);
  assert.equal(retargetDepartureJumpRoute(result.path, start, nextGoal,
    (x, z, y) => z < 1 ? null : sample(x, z, y), acceptJump), null);
  assert.equal(planDepartureJumpRoute(start, goal, sample, sampleLanding, () => false).kind, "unreachable");
  assert.equal(planDepartureJumpRoute(start, goal, sample, () => null, acceptJump).kind, "unreachable");
});
