import assert from "node:assert/strict";
import test from "node:test";
import { NavigationRouteGraph } from "../src/game/NavigationRouteGraph.ts";
import { NavigationJob, planNavigationWork } from "../src/game/NavigationPlanning.ts";
import { fallsNavigationRoutes } from "../src/game/zones/falls/FallsNavigationRoutes.ts";
import { hasWalkingClearance, selectWalkSupportHeight } from "../src/game/GuidedWalkingRoute.ts";
import { canGuidedJump, hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { isInsideFallsRiver } from "../src/game/fallsRiver.ts";

const a = { x: 0, y: 0, z: 0 };
const corner = { x: 0, y: 0, z: 6 };
const goal = { x: 6, y: 0, z: 6 };
const definition = {
  nodes: [{ id: "entry", point: a }, { id: "corner", point: corner }, { id: "exit", point: goal }],
  edges: [
    { from: "entry", to: "corner", kind: "walk" },
    { from: "corner", to: "exit", kind: "walk" },
  ],
};

function corridor() {
  let blocked = false;
  let interiorSamples = 0;
  const ports = {
    sample(x, z, previous) {
      if (x === 0 && z > 2 && z < 4) interiorSamples += 1;
      if (blocked && Math.abs(x) < 0.3 && z > 2 && z < 4) return null;
      if (Math.abs(previous) > 0.08) return null;
      return (Math.abs(x) < 0.3 && z >= -0.2 && z <= 6.2) ||
        (Math.abs(z - 6) < 0.3 && x >= -0.2 && x <= 6.2) ? 0 : null;
    },
    canLand: point => point.y === 0,
    canJump: () => false,
  };
  return {
    ports,
    block: value => { blocked = value; },
    resetSamples: () => { interiorSamples = 0; },
    get samples() { return interiorSamples; },
  };
}

function finish(work, budget = 11, inspect = () => {}) {
  const job = new NavigationJob(work);
  for (let update = 0; !job.done && update < 20000; update += 1) {
    job.advance(budget);
    inspect();
  }
  assert.equal(job.done, true);
  return job.result;
}

test("authored corners are directed, cached per generation, and never exposed to route mutation", () => {
  const fixture = corridor();
  const graph = new NavigationRouteGraph(definition);
  const first = finish(graph.plan(a, goal, fixture.ports));
  assert.deepEqual(first.map(leg => leg.path), [[a, corner], [corner, goal]]);
  assert.ok(fixture.samples > 0, "validate the authored edge on first use");
  first[0].path[1].x = 100;
  fixture.resetSamples();
  const second = finish(graph.plan(a, goal, fixture.ports));
  assert.deepEqual(second.map(leg => leg.path), [[a, corner], [corner, goal]]);
  assert.equal(fixture.samples, 0, "warm graph reuses static edge checks, not request connectors");
  assert.equal(finish(graph.plan(goal, a, fixture.ports)), null,
    "reverse traversal requires an explicitly authored reverse edge");
  fixture.block(true);
  assert.equal(finish(new NavigationRouteGraph(definition).plan(a, goal, fixture.ports)), null,
    "a new geometry generation does not inherit a previously valid edge");
});

test("distance plus jump cost prefers the clear walking corridor over an unnecessary two-jump shortcut", () => {
  const fixture = corridor();
  const upper = { x: 3, y: 1, z: 3 };
  const graph = new NavigationRouteGraph({
    nodes: [...definition.nodes, { id: "upper", point: upper }],
    edges: [...definition.edges,
      { from: "entry", to: "upper", kind: "jump" },
      { from: "upper", to: "exit", kind: "jump" }],
  });
  const ports = {
    ...fixture.ports,
    canLand: point => point.y === 0 || point.y === 1,
    canJump: (from, to) => from.y !== to.y,
  };
  const result = finish(graph.plan(a, goal, ports));
  assert.deepEqual(result.map(leg => leg.kind), ["walk", "walk"]);
  assert.deepEqual(result.at(-1).path.at(-1), goal);
});

test("same-XZ upper floors cannot become connectors without legal support or a clear jump", () => {
  const fixture = corridor();
  const graph = new NavigationRouteGraph({
    nodes: definition.nodes.map(node => ({ ...node, point: { ...node.point, y: 2.7 } })),
    edges: definition.edges,
  });
  const ports = {
    ...fixture.ports,
    canLand: () => true,
    sample: (x, z, previous) => previous === 2.7 ? 2.7 : fixture.ports.sample(x, z, previous),
  };
  assert.equal(finish(graph.plan(a, goal, ports)), null);
});

test("planner live validation rejects a stale cached corridor instead of publishing it", () => {
  const fixture = corridor();
  const graph = new NavigationRouteGraph(definition);
  assert.ok(finish(graph.plan(a, goal, fixture.ports)));
  fixture.block(true);
  const context = { ...fixture.ports, supports: [], authoredGraph: graph };
  assert.equal(finish(planNavigationWork(a, goal, context)), null);
  fixture.block(false);
  assert.ok(finish(planNavigationWork(a, goal, { ...context, authoredGraph: new NavigationRouteGraph(definition) })));
});

test("graph validation and connectors yield within the owner budget; unknown areas retain terrain fallback", () => {
  const fixture = corridor();
  let samples = 0;
  const context = {
    ...fixture.ports, supports: [],
    sample: (...args) => { samples += 1; return fixture.ports.sample(...args); },
    authoredGraph: new NavigationRouteGraph(definition),
  };
  let previous = 0;
  const result = finish(planNavigationWork(a, goal, context), 5, () => {
    assert.ok(samples - previous <= 5, "graph work cannot hide a synchronous path trace");
    previous = samples;
  });
  assert.deepEqual(result.at(-1).path.at(-1), goal);
  const fallback = finish(planNavigationWork(a, goal, {
    ...context, authoredGraph: new NavigationRouteGraph({ nodes: [], edges: [] }),
  }));
  assert.ok(fallback);
  assert.deepEqual(fallback.at(-1).path.at(-1), goal);
});

test("authored monument descent uses the river corner and respects the bridge's low headroom", () => {
  const start = { x: 2.05, y: 0.82, z: 5.15 };
  const target = { x: 1, y: -0.16, z: 3.455 };
  const surfaces = [
    { id: "rune-altar", x: 2.05, z: 5.15, halfWidth: 1.08, halfDepth: 1.08,
      requiresJump: true, heightAt: () => 0.82 },
    { id: "gorge-bridge", x: -2.1, z: 2.4, halfWidth: 4.745, halfDepth: 1.095,
      requiresJump: false, stepHeight: 0.28, heightAt: () => 2.7 },
  ];
  const solids = [
    { x: 2.05, y: 0.7, z: 5.15, halfWidth: 1.25, halfHeight: 0.75, halfDepth: 1.25,
      clearAbove: 0.7, solidTop: 0.82 },
    { x: -2.1, y: 2.535, z: 2.4, halfWidth: 4.75, halfHeight: 0.165, halfDepth: 1.1,
      clearAbove: 2.695, solidTop: 2.7, stepHeight: 0.28 },
  ];
  let samples = 0;
  const sample = (x, z, previous) => {
    samples += 1;
    const height = selectWalkSupportHeight(surfaces, x, z, previous,
      isInsideFallsRiver(x, z) ? -0.16 : 0,
      (surface, px, pz) => Math.abs(px - surface.x) <= surface.halfWidth &&
        Math.abs(pz - surface.z) <= surface.halfDepth);
    return height !== null && hasWalkingClearance(solids, x, z, height, 0.44, 2.3) ? height : null;
  };
  const context = {
    sample, supports: [], authoredGraph: new NavigationRouteGraph(fallsNavigationRoutes),
    canLand: point => {
      const height = sample(point.x, point.z, point.y);
      return height !== null && Math.abs(height - point.y) < 0.08;
    },
    canJump: (from, to) =>
      canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
      hasGuidedJumpClearance(from, to, 6.8, (x, z, feet, ascending) => solids.every(solid =>
        feet >= solid.solidTop - 0.015 ||
        (ascending && feet >= solid.clearAbove - 0.01) ||
        !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, solid))),
  };
  assert.equal(context.canJump(start, target), false, "the tempting direct arc hits the bridge");
  const result = finish(planNavigationWork(start, target, context));
  assert.ok(result);
  assert.equal(result.filter(leg => leg.kind === "jump").length, 1);
  assert.ok(result.flatMap(leg => leg.path).some(point =>
    Math.abs(point.x - 0.353) < 0.001 && Math.abs(point.z - 3.453) < 0.001),
  "retain the clear corner west of the monument rather than cutting through its body");
  assert.deepEqual(result.at(-1).path.at(-1), target);
  assert.ok(samples < 1000, "this local authored route must not rediscover the whole river");
});

test("cove descent lands outside the bridge before walking underneath its separate deck", () => {
  const point = id => fallsNavigationRoutes.nodes.find(node => node.id === id).point;
  const start = point("cove-second");
  const target = point("underpass-south");
  const bridge = {
    x: -2.1, y: 2.535, z: 2.4, halfWidth: 4.75, halfHeight: 0.165, halfDepth: 1.1,
    clearAbove: 2.695, solidTop: 2.7,
  };
  const sample = (x, z, previous) => {
    if (Math.hypot(x - start.x, z - start.z) < 0.1 && Math.abs(previous - start.y) < 0.08)
      return start.y;
    const height = isInsideFallsRiver(x, z) ? -0.16 : 0;
    if (Math.abs(previous - height) > 0.28) return null;
    return hasWalkingClearance([bridge], x, z, height, 0.44, 2.3) ? height : null;
  };
  const ports = {
    sample,
    canLand: p => {
      const height = sample(p.x, p.z, p.y);
      return height !== null && Math.abs(height - p.y) < 0.08;
    },
    canJump: (from, to) =>
      canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
      hasGuidedJumpClearance(from, to, 6.8, (x, z, feet, ascending) =>
        feet >= bridge.solidTop - 0.015 ||
        (ascending && feet >= bridge.clearAbove - 0.01) ||
        !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, bridge)),
  };
  assert.equal(ports.canJump(point("cove-first-south"), point("underpass-north")), false,
    "the old reverse ascent arc reaches the low bridge while still airborne");
  assert.equal(ports.canJump(start, point("river-cove-landing")), true);
  const graph = new NavigationRouteGraph(fallsNavigationRoutes);
  for (let request = 0; request < 2; request += 1) {
    const result = finish(graph.plan(start, target, ports));
    assert.ok(result, "cold and warm requests both retain the clear descent");
    assert.equal(result.filter(leg => leg.kind === "jump").length, 1);
    assert.ok(result.flatMap(leg => leg.path).some(p =>
      p.x === -1.2 && p.y === -0.16 && p.z === 0.4));
    assert.deepEqual(result.at(-1).path.at(-1), target);
    assert.equal(result.flatMap(leg => leg.path).some(p => p.y === 2.7), false,
      "the nearby bridge deck is not interchangeable with river support");
  }
});
