import assert from "node:assert/strict";
import test from "node:test";
import { createWalkingGridHints, walkingGridAxis } from "../src/game/WalkingGrid.ts";
import { hasWalkingClearance, traceWalkSegment } from "../src/game/GuidedWalkingRoute.ts";
import { NavigationJob, planNavigationWork, validateNavigationWork } from "../src/game/NavigationPlanning.ts";

function finish(work) {
  const job = new NavigationJob(work);
  for (let slice = 0; !job.done && slice < 2000; slice++) {
    const before = job.workDone;
    job.advance(192);
    assert.ok(job.workDone - before <= 192, "extra coordinate lines retain the cooperative work limit");
  }
  assert.equal(job.done, true);
  return job.result;
}

test("sub-cell walking passages remain reachable from shifted starts without weakening live clearance", () => {
  // Two solid walls leave a 1 m corridor: a radius-.44 body has only .12 m
  // of lateral freedom. Neither an ordinary .48 m nor .24 m lattice is
  // guaranteed to put a column inside it. The courtyard is not a tiny island.
  const solids = [
    { x: -4, z: -4, y: 1.5, halfWidth: 4, halfDepth: 4, halfHeight: 1.5 },
    { x: 4.5, z: -4, y: 1.5, halfWidth: 3.5, halfDepth: 4, halfHeight: 1.5 },
  ];
  const sample = (x, z, previous) => Math.abs(x) <= 8.4 && z >= -6 && z <= 8 &&
    Math.abs(previous) <= .08 && hasWalkingClearance(solids, x, z, 0, .44, 2.3) ? 0 : null;
  const goal = { x: .5, y: 0, z: -5.5 };
  for (const x of [-5.17, -2.39, 2.21, 3.23, 4.13]) {
    const start = { x, y: 0, z: 3 };
    const context = { sample, supports: [], canLand: p => sample(p.x, p.z, p.y) !== null,
      canJump: () => false, walkingGrid: createWalkingGridHints(solids, start, goal, .44, 2.3) };
    const result = finish(planNavigationWork(start, goal, context));
    assert.ok(result?.length, `start x=${x} must not make the corridor disappear`);
    assert.ok(result.every(leg => leg.kind === "walk"));
    for (const leg of result) for (let i = 1; i < leg.path.length; i++) {
      assert.equal(traceWalkSegment(leg.path[i - 1], leg.path[i].x, leg.path[i].z, sample), 0);
    }
    // A cached coordinate is not cached permission. A newly closed passage
    // must invalidate publication using the existing live sampler.
    solids.push({ x: .5, z: -3, y: 1.5, halfWidth: .51, halfDepth: .1, halfHeight: 1.5 });
    assert.equal(finish(validateNavigationWork(result, start, goal, context)), null);
    solids.pop();
  }
});

test("clearance lines retain the exact start and ordinary lattice on both sides of the origin", () => {
  for (const origin of [-13.23, 0, 13.23]) {
    for (const spacing of [.48, .24]) {
      const hints = [origin - 1.731, origin - .051, origin + .079, origin + 1.731];
      const axis = walkingGridAxis(origin, spacing, [...hints, ...hints, NaN, Infinity, 1e10]);
      assert.equal(axis(0), origin);
      const points = Array.from({ length: 101 }, (_, i) => axis(i - 50));
      for (let i = 1; i < points.length; i++) {
        assert.ok(points[i] > points[i - 1], "insertions cannot reverse or duplicate grid intervals");
        assert.ok(points[i] - points[i - 1] <= spacing + 1e-7);
      }
      for (const point of hints) assert.ok(points.includes(point));
      for (let i = -20; i <= 20; i++) {
        assert.ok(points.some(p => Math.abs(p - (origin + i * spacing)) < 1e-7),
          "adding a clearance line must not remove a previously searchable row");
      }
    }
  }
});
