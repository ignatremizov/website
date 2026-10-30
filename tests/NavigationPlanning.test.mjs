import assert from "node:assert/strict";
import test from "node:test";
import { canGuidedJump } from "../src/game/ClickNavigation.ts";
import {
  NavigationJob, navigationSupportPoints, planNavigationWork, validateNavigationWork,
} from "../src/game/NavigationPlanning.ts";
import { hasWalkingClearance } from "../src/game/GuidedWalkingRoute.ts";
import { fallsBackgroundPillars } from "../src/game/zones/falls/FallsLayout.ts";

function finish(job, budget = 31, inspect = () => {}) {
  for (let frame = 0; !job.done && frame < 100000; frame += 1) {
    job.advance(budget);
    inspect();
  }
  assert.equal(job.done, true, "bounded request must eventually finish");
  return job.result;
}

test("expensive detours and smoothing yield to a deterministic per-frame sample budget", () => {
  let samples = 0;
  const sample = (x, z) => {
    samples += 1;
    return Math.abs(x) > 5 || Math.abs(z) > 4 || (Math.abs(x) < 0.7 && Math.abs(z) < 2) ? null : 0;
  };
  const context = { sample, supports: [], canLand: () => true, canJump: () => false };
  const job = new NavigationJob(planNavigationWork({ x: -3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, context));
  let previous = 0;
  let frames = 0;
  const result = finish(job, 7, () => {
    assert.ok(samples - previous <= 7, "no hidden synchronous trace or smoothing pass");
    previous = samples;
    frames += 1;
  });
  assert.ok(frames > 20);
  assert.equal(result[0].kind, "walk");
  assert.ok(result[0].path.length > 2);
});

test("cheap direct routes finish promptly; owner deadlines and cancellation stop further queries", () => {
  let samples = 0;
  const context = {
    sample: () => { samples += 1; return 0; }, supports: [],
    canLand: () => true, canJump: () => false,
  };
  const start = { x: 0, y: 0, z: 0 };
  const goal = { x: 1, y: 0, z: 0 };
  const cheap = new NavigationJob(planNavigationWork(start, goal, context));
  cheap.advance(64);
  assert.equal(cheap.done, true);
  assert.deepEqual(cheap.result[0].path, [start, goal]);
  const limited = new NavigationJob(planNavigationWork(start, { ...goal, x: 20 }, context));
  let deadlineChecks = 0;
  const before = samples;
  limited.advance(192, () => deadlineChecks++ >= 4);
  assert.equal(limited.done, false);
  assert.ok(samples - before <= 4);
  limited.cancel();
  const cancelledSamples = samples;
  limited.advance(192);
  assert.equal(samples, cancelledSamples);
  assert.equal(limited.result, null);
  let closed = false;
  const cancellable = new NavigationJob((function* () {
    try { yield; yield; return null; }
    finally { closed = true; }
  })());
  cancellable.advance(1);
  cancellable.cancel();
  assert.equal(closed, true, "cancellation closes suspended generators, including their cleanup");
});

test("a clear ledge descent jumps directly instead of exhaustively routing around the stairs", () => {
  const start = { x: 0, y: 1.2, z: 0 };
  const goal = { x: 2, y: 0, z: 0 };
  const context = {
    sample: (x, z, previous) => {
      // A real walking detour exists via six small risers at the far end.
      if (x < -1 || x > 3 || Math.abs(z) > 6) return null;
      const height = z > 4 ? Math.max(0, 1.2 - Math.max(0, x) * 0.6) : x < 1 ? 1.2 : 0;
      return Math.abs(previous - height) < 0.295 ? height : null;
    },
    supports: [], canLand: () => true, canJump: () => true,
  };
  const job = new NavigationJob(planNavigationWork(start, goal, context));
  assert.deepEqual(finish(job), [{ kind: "jump", path: [start, goal] }]);
  assert.ok(job.workDone < 32, "do not search an island-wide detour for a clear drop");
  const blockedArc = { ...context, canJump: () => false };
  const detour = finish(new NavigationJob(planNavigationWork(start, goal, blockedArc)));
  assert.equal(detour[0].kind, "walk", "overhead obstruction still requires the walking route");
  assert.ok(detour[0].path.some((point) => point.z > 4));
});

test("ordinary stair treads stay a direct walk even when a jump could also reach them", () => {
  const start = { x: -0.2, y: 0, z: 0 };
  const goal = { x: 2.9, y: 1.2, z: 0 };
  let jumpChecks = 0;
  const context = {
    sample: (x, z, previous) => {
      const height = Math.min(1.2, Math.max(0, Math.ceil(x / 0.5) * 0.2));
      return Math.abs(previous - height) < 0.295 ? height : null;
    },
    supports: [], canLand: () => true,
    canJump: () => { jumpChecks += 1; return true; },
  };
  assert.equal(finish(new NavigationJob(planNavigationWork(start, goal, context)))[0].kind, "walk");
  assert.equal(jumpChecks, 0);
});

test("crown routes can chain five supported jumps without skipping intervening landings", () => {
  const surfaces = Array.from({ length: 6 }, (_, index) => ({
    id: `crown-${index}`, x: index * 2.1, z: index % 2 * 0.6,
    halfWidth: 0.5, halfDepth: 0.5, requiresJump: true, heightAt: () => index * 0.9,
  }));
  const start = { x: 0, y: 0, z: 0 };
  const goal = { x: 10.5, y: 4.5, z: 0.6 };
  const supports = navigationSupportPoints(surfaces, start, goal, () => -100);
  const surfaceAt = (point) => surfaces.find((surface) =>
    Math.abs(point.x - surface.x) <= surface.halfWidth &&
    Math.abs(point.z - surface.z) <= surface.halfDepth &&
    Math.abs(point.y - surface.heightAt()) < 0.08);
  const context = {
    supports,
    sample: (x, z, previous) => surfaceAt({ x, y: previous, z })?.heightAt() ?? null,
    canLand: (point) => Boolean(surfaceAt(point)),
    canJump: (from, to) => canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y),
  };
  const result = finish(new NavigationJob(planNavigationWork(start, goal, context)));
  assert.ok(result, "five individually valid jumps must not exceed the route's hop limit");
  const jumps = result.filter((leg) => leg.kind === "jump");
  assert.equal(jumps.length, 5);
  assert.deepEqual(result.at(-1).path.at(-1), goal);
  for (const leg of result) {
    assert.ok(leg.path.every(context.canLand));
    if (leg.kind === "jump") assert.ok(context.canJump(leg.path[0], leg.path[1]));
  }
});

test("support samples retain the exposed front of a narrow shaft beside its taller pillar", () => {
  const pillar = fallsBackgroundPillars[0];
  const foot = {
    id: "falls-rear-pillar-foot-0",
    x: pillar.x - pillar.width * 0.32, z: pillar.z + pillar.depth * 0.46,
    halfWidth: pillar.width * 0.46 / 2 - 0.005,
    halfDepth: pillar.depth * 0.58 / 2 - 0.005,
    requiresJump: true, heightAt: () => pillar.top * 0.63,
  };
  const parent = {
    x: pillar.x, z: pillar.z, y: pillar.top / 2,
    halfWidth: pillar.width / 2, halfDepth: pillar.depth / 2, halfHeight: pillar.top / 2,
    solidTop: pillar.top,
  };
  const start = { x: 7.6, y: 4.9, z: -5.75 };
  const goal = { x: 11.75, y: 7.3, z: -5.55 };
  const points = navigationSupportPoints([foot], start, goal, () => 0)
    .filter((point) => point.y === foot.heightAt());
  const clear = (point) => hasWalkingClearance([parent], point.x, point.z, point.y, 0.44, 2.3);
  assert.equal(clear({ x: foot.x, z: foot.z + foot.halfDepth - 0.5, y: foot.heightAt() }), false);
  assert.ok(points.some(clear), "sample exposed edge/corners instead of only the blocked center");
});

function readingContext() {
  const book = { x: -7.25, y: 3.832579109, z: 1.2 };
  const height = (x, z) => {
    if (Math.abs(x - book.x) < 0.4 && Math.abs(z - book.z) < 0.4) return book.y;
    if (x >= -11 && x <= -6 && z >= 0 && z <= 4) return 2.7;
    if (x >= -11 && x <= -7 && z >= -3.5 && z <= -1) return 4.2;
    return null;
  };
  const context = {
    sample: (x, z, previous) => {
      const top = height(x, z);
      return top !== null && Math.abs(top - previous) < 0.295 ? top : null;
    },
    supports: [{ ...book, requiresJump: true }],
    canLand: (point) => height(point.x, point.z) === point.y,
    // Model the fixture's blocked low takeoffs toward Moon; the higher book
    // clears the obstruction. Actual geometry is covered by the host harness.
    canJump: (from, to) => !(from.y === 2.7 && to.y === 4.2) &&
      canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y),
  };
  return { context, book };
}

test("reading-to-Moon routes use the book as an explicit intermediate jump, while descent stays direct", () => {
  const reading = { x: -7.25, y: 2.7, z: 2.4 };
  const moon = { x: -9.3, y: 4.2, z: -1.75 };
  const { context, book } = readingContext();
  assert.equal(context.canJump(reading, moon), false);
  const route = finish(new NavigationJob(planNavigationWork(reading, moon, context)));
  assert.deepEqual(route.map((leg) => leg.kind), ["jump", "jump"]);
  assert.deepEqual(route[0].path, [reading, book]);
  assert.deepEqual(route[1].path, [book, moon]);
  const reverse = finish(new NavigationJob(planNavigationWork(moon, reading, context)));
  assert.equal(reverse.filter((leg) => leg.kind === "jump").length, 1);
  assert.deepEqual(reverse.at(-1).path.at(-1), reading);
});

test("intermediate support or arc removal rejects a chain rather than inventing a height transition", () => {
  const reading = { x: -7.25, y: 2.7, z: 2.4 };
  const moon = { x: -9.3, y: 4.2, z: -1.75 };
  const { context, book } = readingContext();
  const blocked = { ...context, canJump: (from, to) => to.y !== book.y && context.canJump(from, to) };
  assert.equal(finish(new NavigationJob(planNavigationWork(reading, moon, blocked))), null);
  const missing = { ...context, canLand: (point) => point.y !== book.y && context.canLand(point) };
  assert.equal(finish(new NavigationJob(planNavigationWork(reading, moon, missing))), null);
});

test("a book climb retains the walk-back run-up from the first search before either jump", () => {
  const reading = { x: -7.25, y: 2.7, z: 2.4 };
  const moon = { x: -9.3, y: 4.2, z: -1.75 };
  const { context, book } = readingContext();
  const originalJump = context.canJump;
  context.canJump = (from, to) =>
    (to.y !== book.y || from.z >= 3.2) && originalJump(from, to);
  assert.equal(context.canJump(reading, book), false);
  const route = finish(new NavigationJob(planNavigationWork(reading, moon, context)), 13);
  assert.deepEqual(route.map((leg) => leg.kind), ["walk", "jump", "jump"]);
  const takeoff = route[0].path.at(-1);
  assert.ok(takeoff.z >= 3.2, "reach a clear takeoff behind the initial reading position");
  assert.deepEqual(route[1].path, [takeoff, book]);
  assert.deepEqual(route[2].path, [book, moon]);
});

test("coalesced completion validation keeps intermediate takeoffs and uses only the latest final goal", () => {
  const reading = { x: -7.25, y: 2.7, z: 2.4 };
  const moon = { x: -9.3, y: 4.2, z: -1.75 };
  const { context, book } = readingContext();
  const route = finish(new NavigationJob(planNavigationWork(reading, moon, context)));
  const latest = { ...moon, x: -9.31 };
  const updated = finish(new NavigationJob(validateNavigationWork(route, reading, latest, context)), 1);
  assert.deepEqual(updated[0].path.at(-1), book);
  assert.deepEqual(updated.at(-1).path.at(-1), latest);
  assert.deepEqual(route.at(-1).path.at(-1), moon, "the running route is not mutated by pending validation");
  const blocked = { ...context, canJump: () => false };
  assert.equal(finish(new NavigationJob(validateNavigationWork(route, reading, latest, blocked))), null);
});

test("a low stair can walk down to a river takeoff before jumping to a distant intermediate stone", () => {
  const start = { x: 0, y: 0.225, z: 0 };
  const stone = { x: 8.5, y: 0.75, z: 0 };
  const goal = { x: 10, y: 1.6, z: 0 };
  let samples = 0;
  const sample = (x, z, previous) => {
    samples += 1;
    if (x < -0.5 || x > 7.5 || Math.abs(z) > 0.2) return null;
    const height = x < 1 ? 0.225 : x < 2 ? 0 : -0.16;
    return Math.abs(height - previous) <= 0.295 ? height : null;
  };
  const context = {
    sample, supports: [{ ...stone, requiresJump: true }], canLand: () => true,
    canJump: (from, to) =>
      (from.y === -0.16 && to.y === stone.y && Math.abs(to.x - from.x) <= 2) ||
      (from.y === stone.y && to.y === goal.y),
  };
  assert.equal(sample(7.3, 0, start.y), null, "the start height cannot sample a distant lower river");
  const job = new NavigationJob(planNavigationWork(start, goal, context));
  let previousSamples = samples;
  const result = finish(job, 7, () => {
    assert.ok(samples - previousSamples <= 7, "long approaches remain cooperatively sampled");
    previousSamples = samples;
  });
  assert.deepEqual(result.map(leg => leg.kind), ["walk", "jump", "jump"]);
  const takeoff = result[0].path.at(-1);
  assert.equal(takeoff.y, -0.16, "takeoff uses the height reached through the whole walking trace");
  assert.ok(takeoff.x > 6.5);
  assert.deepEqual(result[1].path, [takeoff, stone]);
  assert.deepEqual(result.at(-1).path.at(-1), goal);
});

test("newly discovered walking parents finish a two-jump route before exhaustive graph fallback", () => {
  const start = { x: 0, y: 0, z: 0 };
  const stone = { x: 12, y: 1, z: 0 };
  const goal = { x: 14, y: 2, z: 0 };
  let samples = 0;
  let jumpChecks = 0;
  const context = {
    sample: (x, z, previous) => {
      samples += 1;
      if (x < -1 || x > 11 || Math.abs(z) > 6 ||
        (x > 4 && x < 5 && z < 4) || Math.abs(previous) > 0.295) return null;
      return 0;
    },
    supports: [{ ...stone, requiresJump: true }], canLand: () => true,
    canJump: (from, to) => {
      jumpChecks += 1;
      return (from.y === 0 && to.y === 1 && from.x > 10 && Math.abs(from.z) < 1) ||
        (from.y === 1 && to.y === 2);
    },
  };
  const job = new NavigationJob(planNavigationWork(start, goal, context));
  let previousSamples = 0;
  let previousJumpChecks = 0;
  const result = finish(job, 13, () => {
    assert.ok(samples - previousSamples <= 13, "fallback cannot hide synchronous traces");
    assert.ok(jumpChecks - previousJumpChecks <= 13, "every new-parent arc check yields");
    previousSamples = samples;
    previousJumpChecks = jumpChecks;
  });
  assert.ok(job.workDone > 4096, "the approach must be discovered after the early graph window");
  assert.ok(job.workDone < 25000, "use the reached detour without exhausting the room and both graphs");
  assert.deepEqual(result.map(leg => leg.kind), ["walk", "jump", "jump"]);
  assert.ok(result[0].path.some(point => point.z >= 4), "keep the actual detour around the wall");
  assert.ok(result[0].path.at(-1).x > 10);
  assert.deepEqual(result.at(-1).path.at(-1), goal);
});
