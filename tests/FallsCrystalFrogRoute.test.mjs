import assert from "node:assert/strict";
import test from "node:test";

import {
  createFallsFrogRoutes,
  createFrogRejoinHops,
  createFrogRejoinSteps,
  frogArcClearsBlock,
  frogHopHeight,
  frogRouteWeight,
  takeWeightedFrogCandidate,
} from "../src/game/zones/falls/FallsCrystalFrogRoute.ts";
import { forEachFallsTerrainBlock } from "../src/game/zones/falls/FallsLayout.ts";

const node = (x, y = 0, z = 0, cluster = "bank") => ({ x, y, z, cluster });

test("a displaced frog proposes reachable rejoin hops from its landing, not its old node", () => {
  const landing = node(10, 2, 5);
  const nodes = [node(10.5, 2, 5), node(2), node(10, 8, 5), node(11, 2, 5)];
  const edges = [[{ to: 3 }], [{ to: 0 }], [{ to: 0 }], []];
  const hops = createFrogRejoinHops(landing, nodes, edges);
  assert.deepEqual(hops.map(hop => hop.to), [0],
    "distant, over-high, and dead-end destinations cannot claim the released frog");
  assert.equal(frogHopHeight(landing, nodes[0], hops[0].lift, 0), landing.y);
  assert.equal(frogHopHeight(landing, nodes[0], hops[0].lift, 1), nodes[0].y);
});

test("a frog under the bridge can rejoin the bank with a low arc instead of hitting the deck", () => {
  const landing = node(0, -0.16, 2.4);
  const bank = node(-4.05, 1.35, 4.75);
  const [hop] = createFrogRejoinHops(landing, [bank], [[{ to: 0 }]]);
  const deck = {
    id: "bridge", x: -2.1, z: 2.4, width: 9.5, depth: 2.2, top: 2.7, bottom: 2.37,
  };
  const terrace = {
    id: "bank", x: -6.5, z: 6.7, width: 5.4, depth: 4.4, top: 1.35, bottom: 0,
  };
  assert.equal(frogArcClearsBlock(landing, bank, hop.fallbackLift, deck), false,
    "the old high rejoin arc intersects the bridge overhead");
  for (const block of [deck, terrace]) {
    assert.equal(frogArcClearsBlock(landing, bank, hop.lift, block), true);
  }
});

test("short rejoin steps stay supported, bounded, and do not reverse the previous floor hop", () => {
  const landing = node(1, -0.16, 2.4);
  const bank = node(-4.05, 1.35, 4.75);
  const edges = [[{ to: 0 }]];
  assert.equal(createFrogRejoinHops(landing, [bank], edges).length, 0,
    "the bank is outside direct rejoin range");
  const steps = createFrogRejoinSteps(landing, [bank], edges, () => -0.16);
  assert.ok(steps.length > 0 && steps.length <= 18);
  for (const hop of steps) {
    assert.ok(hop.distance <= 2.2);
    assert.equal(hop.landing.y, -0.16);
    assert.ok(Math.hypot(hop.landing.x - bank.x, hop.landing.z - bank.z) <
      Math.hypot(landing.x - bank.x, landing.z - bank.z));
    assert.ok(createFrogRejoinHops(hop.landing, [bank], edges).length > 0);
  }
  const previous = steps[0].landing;
  const withoutReversal = createFrogRejoinSteps(landing, [bank], edges, () => -0.16, previous);
  assert.ok(withoutReversal.every(hop =>
    Math.hypot(hop.landing.x - previous.x, hop.landing.z - previous.z) >= 0.8));
  assert.deepEqual(createFrogRejoinSteps(landing, [bank], edges, () => null), [],
    "void is not a stepping stone");
});

test("rejoin proposals retain a higher fallback when the low arc cannot clear a riser", () => {
  const landing = node(0);
  const target = node(3, 1);
  const [hop] = createFrogRejoinHops(landing, [target], [[{ to: 0 }]]);
  const riser = { id: "riser", x: 1.5, z: 0, width: 0.1, depth: 1, bottom: 0, top: 0.95 };
  assert.equal(frogArcClearsBlock(landing, target, hop.lift, riser), false);
  assert.equal(frogArcClearsBlock(landing, target, hop.fallbackLift, riser), true);
});

test("frog hops clear cliff faces continuously, including thin obstacles between sample points", () => {
  const from = node(0);
  const to = node(3, 1);
  const cliff = { id: "cliff", x: 2.6, z: 0, width: 0.8, depth: 2, top: 1 };
  assert.equal(frogArcClearsBlock(from, to, 1.3, cliff), true);
  assert.equal(frogArcClearsBlock(from, to, 0.1, cliff), false);
  assert.equal(frogArcClearsBlock(from, to, 1.3, {
    ...cliff, x: 1.1234, width: 0.001, top: 8,
  }), false);
  assert.equal(frogHopHeight(from, to, 1.3, 0), from.y);
  assert.equal(frogHopHeight(from, to, 1.3, 1), to.y);
});

test("bridge clearance includes the frog's head and the arc apex", () => {
  const bridge = { id: "bridge", x: 1.5, z: 0, width: 4, depth: 2, top: 3, bottom: 2.5 };
  assert.equal(frogArcClearsBlock(node(0), node(3), 1, bridge), true);
  assert.equal(frogArcClearsBlock(node(0), node(3), 2, bridge), false);
});

test("startled frogs favor outward routes without immediate reversal or closer landings", () => {
  const from = node(2);
  assert.equal(frogRouteWeight(from, node(1), 2, [0, 1], 0, 0, true), 0);
  assert.equal(frogRouteWeight(from, node(4), 0, [0, 1], 0, 0, true), 0);
  assert.ok(frogRouteWeight(from, node(4), 2, [0, 1], 0, 0, true) >
    frogRouteWeight(from, node(3), 3, [0, 1], 0, 0, true));
  assert.ok(frogRouteWeight(from, node(4), 2, [2, 3, 0, 1], 0, 0, false) <
    frogRouteWeight(from, node(4), 4, [2, 3, 0, 1], 0, 0, false));
});

test("authored Falls routes allow a roaming frog to journey from gardens to both upper terraces and pool banks", () => {
  const { nodes, edges } = createFallsFrogRoutes();
  // The scenery pass adds rails above the deck. Terrain-only reachability
  // previously passed even though every bridge perch overlapped a parapet.
  const parapets = [1.33, 3.47].map((z) => ({
    id: "bridge-parapet", x: -2.1, z, width: 9.5, depth: 0.2, bottom: 2.7, top: 3.08,
  }));
  assert.ok(nodes.length <= 256);
  const start = nodes.findIndex((n) => n.cluster === "crystal-garden");
  assert.ok(start >= 0);
  const visited = new Set([start]);
  const queue = [start];
  for (const current of queue) {
    for (const hop of edges[current]) {
      if (visited.has(hop.to)) continue;
      if (!parapets.every((rail) => frogArcClearsBlock(nodes[current], nodes[hop.to], hop.lift, rail))) continue;
      visited.add(hop.to);
      queue.push(hop.to);
    }
  }
  const clusters = new Set(queue.map((index) => nodes[index].cluster));
  for (const cluster of ["reading-terrace", "keeper-terrace", "moon-shrine",
    "ember-overlook", "cove-pool-cave-bank"]) {
    assert.ok(clusters.has(cluster), `frog can reach ${cluster} without teleporting`);
  }
  assert.ok(edges.some((options) => options.length >= 3), "junctions offer non-cyclic choices");
  assert.ok(!nodes.some((n) => n.cluster === "cove-basin"), "frog rests on banks, not submerged pool bed");
});

test("lazy clearance stops after the first clear proposal and never retries a blocked candidate", () => {
  const weights = new Float64Array([1, 2, 3]);
  const checked = [];
  let selected = -1;
  for (;;) {
    const index = takeWeightedFrogCandidate(weights, 3, 0);
    if (index < 0) break;
    checked.push(index);
    if (index === 1) {
      selected = index;
      break;
    }
  }
  assert.equal(selected, 1);
  assert.deepEqual(checked, [0, 1], "the unneeded third host check is skipped");
  assert.equal(weights[2], 3, "unvisited candidates remain available");

  weights.set([1, 2, 3]);
  const rejected = [];
  for (;;) {
    const index = takeWeightedFrogCandidate(weights, 3, 0.9);
    if (index < 0) break;
    rejected.push(index);
  }
  assert.deepEqual(rejected, [2, 1, 0], "an all-blocked decision terminates without duplicate checks");

  weights.set([1, 2, 3]);
  assert.equal(takeWeightedFrogCandidate(weights, 3, 0), 0,
    "a previously blocked candidate is reconsidered in the next decision");
});

test("rejecting blocked proposals preserves exact relative weights among clear destinations", () => {
  // Enumerate each possible weighted bin, not an unseeded frequency test.
  const probabilities = [0, 0, 0];
  function visit(weights, probability) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let prefix = 0;
    for (let candidate = 0; candidate < weights.length; candidate += 1) {
      const weight = weights[candidate];
      if (weight === 0) continue;
      const scratch = new Float64Array(weights);
      const selected = takeWeightedFrogCandidate(scratch, weights.length, (prefix + weight / 2) / total);
      assert.equal(selected, candidate);
      const branch = probability * weight / total;
      if (selected === 1) visit(scratch, branch);
      else probabilities[selected] += branch;
      prefix += weight;
    }
  }
  visit(new Float64Array([1, 2, 3]), 1);
  assert.ok(Math.abs(probabilities[0] - 0.25) < 1e-12);
  assert.equal(probabilities[1], 0);
  assert.ok(Math.abs(probabilities[2] - 0.75) < 1e-12);
});

test("lazy escape selection never proposes reversal or movement toward the player", () => {
  const from = node(2);
  const targets = [node(4), node(1), node(3), node(5)];
  const scratch = new Float64Array(targets.map((to, index) =>
    frogRouteWeight(from, to, index, [0, 5], 0, 0, true)));
  const proposed = [];
  for (;;) {
    const index = takeWeightedFrogCandidate(scratch, targets.length, 0);
    if (index < 0) break;
    proposed.push(index);
  }
  assert.deepEqual(proposed, [2, 3]);
  scratch.set([0, 0, 0, 99]);
  assert.equal(takeWeightedFrogCandidate(scratch, 3, 0.5), -1,
    "stale scratch entries from a larger previous decision are ignored");
});

test("checking terrain arcs once per pair preserves both directed routes", () => {
  const { nodes, edges } = createFallsFrogRoutes();
  const blocks = [];
  forEachFallsTerrainBlock(block => blocks.push(block));
  for (let i = 0; i < nodes.length; i += 1) {
    const from = nodes[i];
    const targets = new Set(edges[i].map(hop => hop.to));
    for (let j = 0; j < nodes.length; j += 1) {
      const to = nodes[j];
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      const rise = Math.abs(to.y - from.y);
      const lift = 0.65 + distance * 0.13 + rise * 0.55;
      const expected = i !== j && distance >= 0.45 && distance <= 3.25 &&
        rise <= 1.7 && blocks.every(block => frogArcClearsBlock(from, to, lift, block));
      assert.equal(targets.has(j), expected, `${from.cluster} → ${to.cluster}`);
    }
  }
});
