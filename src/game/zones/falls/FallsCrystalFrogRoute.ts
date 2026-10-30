import {
  fallsLandmarks,
  forEachFallsTerrainBlock,
  type FallsTerrainBlock,
} from "./FallsLayout.ts";

export interface FrogNode {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly cluster: string;
}

export interface FrogHop {
  readonly to: number;
  /** Feet follow lerp(from, to, t) + 4 * lift * t * (1 - t). */
  readonly lift: number;
  readonly distance: number;
  /** Rejoin-only: try the low arc first, then this higher arc if obstructed. */
  readonly fallbackLift?: number;
  /** Short recovery step, not arrival at the authored node named by `to`. */
  readonly landing?: FrogNode;
}

// Includes spread hind feet and the takeoff squash, not just the torso.
export const frogClearanceRadius = 0.55;
export const frogClearanceHeight = 0.72;
const horizontalAxes = ["x", "z"] as const;

export function frogHopHeight(from: FrogNode, to: FrogNode, lift: number, t: number): number {
  return from.y + (to.y - from.y) * t + 4 * lift * t * (1 - t);
}

/**
 * A carried frog rejoins from its actual landing, not its old route node.
 * These are proposals only: the host must check their current swept clearance.
 * Allocate once after landing, never while held or on each airborne frame.
 */
export function createFrogRejoinHops(
  from: FrogNode, nodes: readonly FrogNode[], edges: readonly (readonly FrogHop[])[],
): FrogHop[] {
  const hops: FrogHop[] = [];
  for (let target = 0; target < nodes.length; target += 1) {
    const to = nodes[target]!;
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const rise = Math.abs(to.y - from.y);
    if (!edges[target]?.length || distance > 5.5 || rise > 2.4) continue;
    hops.push({
      to: target, distance,
      lift: 0.18 + rise * 0.3,
      fallbackLift: 0.65 + distance * 0.13 + rise * 0.55,
    });
  }
  return hops;
}

/**
 * When no direct rejoin works, take a short floor hop toward the graph first.
 * Six nearby connected goals, three headings each: at most 18 proposals.
 * These are landing-time numeric proposals, not a second scene/path registry.
 * The host must validate every swept arc, including its floor endpoint.
 */
export function createFrogRejoinSteps(
  from: FrogNode, nodes: readonly FrogNode[], edges: readonly (readonly FrogHop[])[],
  floorHeight: (x: number, z: number) => number | null,
  previous: FrogNode | null = null,
): FrogHop[] {
  const goals: { to: number; distance: number }[] = [];
  for (let to = 0; to < nodes.length; to += 1) {
    const node = nodes[to]!;
    const distance = Math.hypot(node.x - from.x, node.z - from.z);
    if (!edges[to]?.length || distance < 1 || distance > 12 ||
      Math.abs(node.y - from.y) > 2.4) continue;
    goals.push({ to, distance });
  }
  goals.sort((a, b) => a.distance - b.distance);
  const steps: FrogHop[] = [];
  for (const goal of goals.slice(0, 6)) {
    const node = nodes[goal.to]!;
    const heading = Math.atan2(node.z - from.z, node.x - from.x);
    const distance = Math.min(2.2, goal.distance * 0.7);
    for (const turn of [0, -Math.PI / 4, Math.PI / 4]) {
      const x = from.x + Math.cos(heading + turn) * distance;
      const z = from.z + Math.sin(heading + turn) * distance;
      if (previous && Math.hypot(x - previous.x, z - previous.z) < 0.8) continue;
      if (steps.some((step) => Math.hypot(x - step.landing!.x, z - step.landing!.z) < 0.65)) continue;
      const y = floorHeight(x, z);
      if (y === null || !Number.isFinite(y) || Math.abs(y - from.y) > 2.4) continue;
      const rise = Math.abs(y - from.y);
      steps.push({
        to: goal.to, distance, lift: 0.18 + rise * 0.3,
        fallbackLift: 0.65 + distance * 0.13 + rise * 0.55,
        landing: { x, y, z, cluster: "gorge" },
      });
    }
  }
  return steps;
}

/** Exact horizontal slab interval; the concave parabola's minimum is at an end. */
export function frogArcClearsBlock(
  from: FrogNode, to: FrogNode, lift: number, block: FallsTerrainBlock,
): boolean {
  let enter = 0;
  let exit = 1;
  for (const axis of horizontalAxes) {
    const half = (axis === "x" ? block.width : block.depth) / 2 + frogClearanceRadius;
    const offset = from[axis] - block[axis];
    const velocity = to[axis] - from[axis];
    if (Math.abs(velocity) < 1e-8) {
      if (Math.abs(offset) > half) return true;
    } else {
      const a = (-half - offset) / velocity;
      const b = (half - offset) / velocity;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return true;
    }
  }
  const low = Math.min(
    frogHopHeight(from, to, lift, enter), frogHopHeight(from, to, lift, exit),
  );
  if (low >= block.top - 0.015) return true;
  const apex = Math.max(enter, Math.min(exit, 0.5 + (to.y - from.y) / (8 * lift)));
  return frogHopHeight(from, to, lift, apex) + frogClearanceHeight <
    (block.bottom ?? -1);
}

/** Mount-time only. No route searches, terrain scans, or allocations in flight. */
export function createFallsFrogRoutes(): { nodes: FrogNode[]; edges: FrogHop[][] } {
  const blocks: FallsTerrainBlock[] = [];
  forEachFallsTerrainBlock((block) => blocks.push(block));
  const nodes: FrogNode[] = [];
  for (const block of blocks) {
    if (block.kind === "pool" ||
      (block.id.startsWith("cove-pool-") && block.top < fallsLandmarks.basin.water)) continue;
    const columns = Math.min(5, Math.max(1, Math.ceil((block.width - 0.4) / 1.6)));
    // Bridge rails occupy the edge rows. Keep perches on the clear deck
    // centerline so the host's scenery checks don't disconnect the two banks.
    const rows = block.kind === "bridge"
      ? 1
      : Math.min(4, Math.max(1, Math.ceil((block.depth - 0.4) / 1.6)));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = block.x + (columns === 1 ? 0 : (column / (columns - 1) - 0.5) * (block.width - 0.5));
        const z = block.z + (rows === 1 ? 0 : (row / (rows - 1) - 0.5) * (block.depth - 0.5));
        if (blocks.some((other) => other.top > block.top + 0.015 &&
          (other.bottom ?? -1) < block.top + frogClearanceHeight &&
          Math.abs(x - other.x) < other.width / 2 + frogClearanceRadius &&
          Math.abs(z - other.z) < other.depth / 2 + frogClearanceRadius)) continue;
        if (nodes.length >= 256) throw new RangeError("Falls frog route exceeds 256 landing nodes");
        nodes.push({ x, y: block.top, z, cluster: block.id });
      }
    }
  }
  const edges: FrogHop[][] = nodes.map(() => []);
  for (let index = 0; index < nodes.length; index += 1) {
    const from = nodes[index]!;
    for (let target = index + 1; target < nodes.length; target += 1) {
      const to = nodes[target]!;
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      if (distance < 0.45 || distance > 3.25 ||
        Math.abs(to.y - from.y) > 1.7) continue;
      const lift = 0.65 + distance * 0.13 + Math.abs(to.y - from.y) * 0.55;
      // Reversing t traces exactly the same swept terrain arc. Dynamic host
      // clearance remains directional and is checked afresh at hop selection.
      if (blocks.every((block) => frogArcClearsBlock(from, to, lift, block))) {
        edges[index]!.push({ to: target, lift, distance });
        edges[target]!.push({ to: index, lift, distance });
      }
    }
  }
  return { nodes, edges };
}

/**
 * Draw and remove one weighted proposal from caller-owned scratch storage.
 * Validate only that proposal; on rejection draw again, stopping at the first
 * clear candidate. This gives the same weighted distribution among clear
 * candidates as validating them all first, without caching dynamic clearance.
 * Each candidate can be checked at most once per decision; -1 means exhausted.
 * Weights must be finite/nonnegative and random must be in [0, 1).
 */
export function takeWeightedFrogCandidate(
  weights: Float64Array, count: number, random: number,
): number {
  let total = 0;
  for (let index = 0; index < count; index += 1) total += weights[index]!;
  if (total <= 0) return -1;
  let ticket = random * total;
  let last = -1;
  for (let index = 0; index < count; index += 1) {
    const weight = weights[index]!;
    if (weight <= 0) continue;
    last = index;
    if (ticket < weight) {
      weights[index] = 0;
      return index;
    }
    ticket -= weight;
  }
  // Floating-point accumulation can put a ticket just beyond the final bin.
  weights[last] = 0;
  return last;
}

/** Zero means wait, never bounce straight back or hop closer to a nearby player. */
export function frogRouteWeight(
  from: FrogNode, to: FrogNode, target: number, recent: readonly number[],
  playerX: number, playerZ: number, fleeing: boolean,
): number {
  if (recent.length > 1 && recent[recent.length - 2] === target) return 0;
  const gain = fleeing
    ? Math.hypot(to.x - playerX, to.z - playerZ) -
      Math.hypot(from.x - playerX, from.z - playerZ)
    : 0;
  if (fleeing && gain < 0.2) return 0;
  const seen = recent.lastIndexOf(target);
  const novelty = seen < 0 ? 1 : 0.08 + (recent.length - 1 - seen) * 0.04;
  return novelty * (from.cluster === to.cluster ? 1 : 1.8) *
    (fleeing ? 1 + gain * gain : 1);
}
