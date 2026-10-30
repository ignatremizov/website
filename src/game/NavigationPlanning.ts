import {
  planGuidedRouteWork, traceWalkingWork, WalkingReachability,
  type GuidedRoute, type SampleWalkHeight, type WalkPoint,
} from "./GuidedWalkingRoute.ts";
import type { SurfaceArea } from "./SurfaceSelection.ts";
import type { NavigationRouteGraph } from "./NavigationRouteGraph.ts";
import type { WalkingGridHints } from "./WalkingGrid.ts";

export interface NavigationLeg {
  kind: "walk" | "jump" | "drop";
  path: WalkPoint[];
}

export interface NavigationPlanningContext {
  sample: SampleWalkHeight;
  supports: readonly (WalkPoint & { requiresJump?: boolean })[];
  canLand: (point: WalkPoint) => boolean;
  canJump: (from: WalkPoint, to: WalkPoint) => boolean;
  canDrop?: (from: WalkPoint, to: WalkPoint) => boolean;
  authoredGraph?: NavigationRouteGraph;
  walkingGrid?: WalkingGridHints;
}

export const maximumNavigationSupports = 240;
const maximumJumpLegs = 8;

/**
 * Sample usable edges as well as centers. A half-meter inset erased narrow
 * pillar caps and the run-up corners needed by the waterfall crown route.
 * This is request construction only; live landing/arc checks remain with jobs.
 */
export function navigationSupportPoints(
  surfaces: readonly SurfaceArea[], start: WalkPoint, goal: WalkPoint,
  groundHeight: (x: number, z: number) => number,
): (WalkPoint & { requiresJump?: boolean })[] {
  const ranked = surfaces.filter((surface) => surface.enabled !== false).map((surface) => ({
    surface, score: Math.hypot(surface.x - start.x, surface.z - start.z) +
      Math.hypot(surface.x - goal.x, surface.z - goal.z),
  })).sort((a, b) => a.score - b.score).slice(0, 24);
  const points: (WalkPoint & { requiresJump?: boolean })[] = [];
  const offsets = [
    [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ] as const;
  // Emit centers first so a bounded consumer retains all represented surfaces.
  for (const [dx, dz] of offsets) {
    for (const { surface } of ranked) {
      const x = surface.x + dx * Math.max(0, surface.halfWidth - 0.08);
      const z = surface.z + dz * Math.max(0, surface.halfDepth - 0.08);
      const y = surface.heightAt(x, z);
      if (Number.isFinite(y)) points.push({ x, y, z, requiresJump: surface.requiresJump });
    }
  }
  for (const radius of [1.8, 2.4]) {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      const x = start.x + Math.cos(angle) * radius;
      const z = start.z + Math.sin(angle) * radius;
      points.push({ x, y: groundHeight(x, z), z });
    }
  }
  return points;
}

/** No timers or promises: the frame owner supplies both a work cap and deadline. */
export class NavigationJob {
  private work: Generator<void, NavigationLeg[] | null> | null;
  done = false;
  result: NavigationLeg[] | null = null;
  workDone = 0;

  constructor(work: Generator<void, NavigationLeg[] | null>) { this.work = work; }

  advance(maxWork: number, shouldYield: () => boolean = () => false): void {
    for (let count = 0; this.work && count < maxWork; count += 1) {
      if (shouldYield()) return;
      this.workDone += 1;
      const next = this.work.next();
      if (next.done) {
        this.result = next.value;
        this.done = true;
        this.work = null;
        return;
      }
    }
  }

  cancel(): void {
    this.work?.return(null);
    this.work = null;
    this.result = null;
    this.done = true;
  }
}

/**
 * Walk a clear direct line, or jump it when the full arc is safe. This keeps
 * ordinary stairs walkable without sending ledge descents around the island.
 * After a bounded walking search, try connected supports before exhausting the
 * whole room; retain that same walking search if the support graph has no route.
 * Every trace, search, smoothing step and graph check cooperatively yields.
 * Jump arcs remain one bounded host call (at most 160 physical arc samples).
 */
export function* planNavigationWork(
  start: WalkPoint, goal: WalkPoint, context: NavigationPlanningContext,
): Generator<void, NavigationLeg[] | null> {
  yield;
  if (!context.canLand(goal)) return null;
  const direct = yield* traceWalkingWork(start, goal.x, goal.z, context.sample);
  if (direct !== null && Math.abs(direct - goal.y) < 0.08) {
    return [{ kind: "walk", path: [{ ...start }, { ...goal }] }];
  }
  yield;
  if (context.canDrop?.(start, goal)) {
    return [{ kind: "drop", path: [{ ...start }, { ...goal }] }];
  }
  yield;
  if (context.canJump(start, goal)) {
    return [{ kind: "jump", path: [{ ...start }, { ...goal }] }];
  }
  if (context.authoredGraph) {
    const candidate = yield* context.authoredGraph.plan(start, goal, context);
    if (candidate?.length) {
      const validated = yield* validateNavigationWork(candidate, start, goal, context);
      if (validated) return validated;
    }
  }
  const reachability = new WalkingReachability();
  const continuations: WalkPoint[] = [];
  for (const candidate of context.supports) {
    yield;
    if (candidate.y <= start.y + 0.295 || candidate.y >= goal.y - 0.08 ||
      !context.canLand(candidate)) continue;
    yield;
    if (!context.canJump(candidate, goal)) continue;
    continuations.push({ x: candidate.x, y: candidate.y, z: candidate.z });
    if (continuations.length === 8) break;
  }
  let checkedWalkingSize = 0;
  const checkNewApproaches = function* (): Generator<void, NavigationLeg[] | null> {
    if (checkedWalkingSize === reachability.size) return null;
    const nextSize = reachability.size;
    for (const candidate of continuations) {
      const path = yield* reachability.approach(
        candidate, context.sample, context.canJump, checkedWalkingSize,
      );
      if (!path) continue;
      yield;
      if (!context.canLand(candidate) || !context.canLand(goal) ||
        !context.canJump(candidate, goal)) continue;
      const result: NavigationLeg[] = [];
      if (path.some(point => Math.hypot(point.x - start.x, point.z - start.z) > 0.001)) {
        result.push({ kind: "walk", path });
      }
      result.push(
        { kind: "jump", path: [{ ...path.at(-1)! }, { ...candidate }] },
        { kind: "jump", path: [{ ...candidate }, { ...goal }] },
      );
      return result;
    }
    checkedWalkingSize = nextSize;
    return null;
  };
  const walking = planGuidedRouteWork(start, goal, context.sample, (point) => {
    const distance = Math.hypot(point.x - goal.x, point.z - goal.z);
    if (distance > 2.4 &&
      (point.x !== start.x || point.z !== start.z || point.y !== start.y)) return false;
    return context.canLand(goal) && context.canJump(point, goal);
  }, reachability, context.walkingGrid);
  let walk: GuidedRoute;
  let graphSearched = false;
  let graphWalkingSize = 0;
  try {
    let progress: IteratorResult<void, GuidedRoute>;
    let firstWork = 0;
    do {
      yield;
      progress = walking.next();
      firstWork += 1;
      if (!progress.done) {
        const continuation = yield* checkNewApproaches();
        if (continuation) return continuation;
      }
    } while (!progress.done && firstWork < 4096);
    if (!progress.done) {
      const early = yield* knownIntermediateRouteWork(start, goal, context, reachability);
      if (early) return early;
      graphWalkingSize = reachability.size;
      graphSearched = true;
      const graph = supportGraphRouteWork(start, goal, context, reachability);
      try {
        // Neither fallback may starve the retained walking frontier. New
        // parents can prove a short continuation while the graph is working.
        for (;;) {
          yield;
          const connected = graph.next();
          if (connected.done) {
            if (connected.value) return connected.value;
            break;
          }
          if (progress.done) continue;
          yield;
          progress = walking.next();
          if (progress.done && progress.value.kind !== "unreachable") break;
          const continuation = yield* checkNewApproaches();
          if (continuation) return continuation;
        }
      } finally {
        graph.return(null);
      }
      while (!progress.done) {
        yield;
        progress = walking.next();
        if (!progress.done) {
          const continuation = yield* checkNewApproaches();
          if (continuation) return continuation;
        }
      }
    }
    walk = progress.value;
  } finally {
    // Close retained parent chains on early success and on owner cancellation.
    walking.return({ kind: "unreachable", path: [] });
  }
  if (walk.kind === "walking") return [{ kind: "walk", path: walk.path }];
  if (walk.kind === "jump") {
    const takeoff = walk.path.at(-1)!;
    return [
      { kind: "walk", path: walk.path },
      { kind: "jump", path: [{ ...takeoff }, { ...goal }] },
    ];
  }

  // The early graph only knows the walking prefix explored so far. Retry once,
  // after that retained search finishes, if new approach nodes became known.
  // A failed early graph must not permanently discard later reachable takeoffs.
  return graphSearched && reachability.size <= graphWalkingSize
    ? null : yield* supportGraphRouteWork(start, goal, context, reachability);
}

/** A bounded height-aware graph; node identity includes each landing's height. */
function* supportGraphRouteWork(
  start: WalkPoint, goal: WalkPoint, context: NavigationPlanningContext,
  reachability: WalkingReachability,
): Generator<void, NavigationLeg[] | null> {
  // The host supplies a bounded, relevant set of support centers/edge insets
  // and nearby ground landings. Height is part of identity (bridge vs river).
  const points: WalkPoint[] = [{ ...start }, { ...goal }];
  for (const point of context.supports.slice(0, maximumNavigationSupports)) {
    yield;
    if (!context.canLand(point) || points.some((known) =>
      Math.hypot(known.x - point.x, known.z - point.z) < 0.12 &&
      Math.abs(known.y - point.y) < 0.08)) continue;
    points.push({ x: point.x, y: point.y, z: point.z });
  }
  interface Node { index: number; jumps: number; cost: number; estimate: number; previous: Node | null; legs: NavigationLeg[] }
  const first: Node = {
    index: 0, jumps: 0, cost: 0, estimate: Math.hypot(goal.x - start.x, goal.z - start.z),
    previous: null, legs: [],
  };
  const open: Node[] = [first];
  const costs = Array.from(
    { length: points.length },
    () => new Float64Array(maximumJumpLegs + 1).fill(Number.POSITIVE_INFINITY),
  );
  costs[0]![0] = 0;
  const dominated = (index: number, jumps: number, cost: number): boolean => {
    for (let used = 0; used <= jumps; used += 1) {
      if (costs[index]![used]! <= cost) return true;
    }
    return false;
  };
  let approachSearches = 0;
  for (let expanded = 0; open.length && expanded < 256; expanded += 1) {
    yield;
    let best = 0;
    for (let index = 1; index < open.length; index += 1) {
      if (open[index]!.estimate < open[best]!.estimate) best = index;
    }
    const current = open.splice(best, 1)[0]!;
    if (costs[current.index]![current.jumps] !== current.cost ||
      dominated(current.index, current.jumps - 1, current.cost)) continue;
    if (current.index === 1) {
      const legs: NavigationLeg[] = [];
      for (let node: Node | null = current; node?.previous; node = node.previous) {
        yield;
        legs.push(...node.legs.slice().reverse());
      }
      return legs.reverse();
    }
    const from = points[current.index]!;
    for (let index = 1; index < points.length; index += 1) {
      yield;
      if (index === current.index) continue;
      const to = points[index]!;
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      // Keep ordinary graph edges local. Only the original start can recover
      // a longer walking approach followed by a short, validated jump below.
      if (distance > 8 && current.index !== 0) continue;
      if (dominated(index, current.jumps, current.cost + distance)) continue;
      const height = distance <= 8
        ? yield* traceWalkingWork(from, to.x, to.z, context.sample) : null;
      let kind: "walk" | "jump" = "walk";
      let approach: WalkPoint[] | null = null;
      if (height === null || Math.abs(height - to.y) >= 0.08) {
        if (current.jumps >= maximumJumpLegs) continue;
        yield;
        if (!context.canLand(to)) continue;
        if (distance > 8 || !context.canJump(from, to)) {
          if (current.index !== 0 || index === 1 || approachSearches >= 8 ||
            to.y <= start.y + 0.295 || to.y >= goal.y - 0.08) continue;
          approachSearches += 1;
          approach = yield* findJumpApproachWork(start, to, context, reachability);
          if (!approach) continue;
        }
        kind = "jump";
      }
      const jumps = current.jumps + (kind === "jump" ? 1 : 0);
      const legs: NavigationLeg[] = approach
        ? [{ kind: "walk", path: approach }, { kind: "jump", path: [{ ...approach.at(-1)! }, { ...to }] }]
        : [{ kind, path: [{ ...from }, { ...to }] }];
      let cost = current.cost + (kind === "jump" ? 3 : 0);
      for (const leg of legs) {
        for (let point = 1; point < leg.path.length; point += 1) {
          cost += Math.hypot(
            leg.path[point]!.x - leg.path[point - 1]!.x,
            leg.path[point]!.z - leg.path[point - 1]!.z,
          );
        }
      }
      // Revisiting a ledge with extra jumps and a higher cost cannot improve
      // its continuation. Without this, walking loops exhaust the graph cap
      // across eight copies of the same lower-platform states.
      if (dominated(index, jumps, cost)) continue;
      costs[index]![jumps] = cost;
      open.push({
        index, jumps, cost, estimate: cost + Math.hypot(goal.x - to.x, goal.z - to.z),
        previous: current, legs,
      });
    }
  }
  return null;
}

/**
 * A nearby authored jump-only prop can be an obvious intermediate climb.
 * Try it after a useful walking prefix, before proving an entire room has no
 * walking route. Ordinary stair supports are deliberately not early shortcuts.
 */
function* knownIntermediateRouteWork(
  start: WalkPoint, goal: WalkPoint, context: NavigationPlanningContext,
  reachability: WalkingReachability,
): Generator<void, NavigationLeg[] | null> {
  if (goal.y - start.y < 1.35) return null;
  let candidates = 0;
  for (const candidate of context.supports) {
    yield;
    if (!candidate.requiresJump || candidate.y <= start.y + 0.295 ||
      candidate.y >= goal.y - 0.08 || Math.hypot(candidate.x - start.x, candidate.z - start.z) > 5) continue;
    if (candidates++ >= 8) break;
    const support = { x: candidate.x, y: candidate.y, z: candidate.z };
    if (!context.canLand(support) || !context.canLand(goal)) continue;
    const onward = yield* traceWalkingWork(support, goal.x, goal.z, context.sample);
    const lastKind = onward !== null && Math.abs(onward - goal.y) < 0.08 ? "walk" : "jump";
    if (lastKind === "jump") {
      yield;
      if (!context.canJump(support, goal)) continue;
    }
    const finish = (approach: WalkPoint[]): NavigationLeg[] => {
      const legs: NavigationLeg[] = [];
      if (approach.some((point) => Math.hypot(point.x - start.x, point.z - start.z) > 0.001)) {
        legs.push({ kind: "walk", path: approach });
      }
      legs.push(
        { kind: "jump", path: [{ ...approach.at(-1)! }, support] },
        { kind: lastKind, path: [support, { ...goal }] },
      );
      return legs;
    };
    yield;
    if (context.canJump(start, support)) return finish([{ ...start }, { ...start }]);
    const approach = yield* findJumpApproachWork(start, support, context, reachability);
    if (approach) return finish(approach);
  }
  return null;
}

function* findJumpApproachWork(
  start: WalkPoint, support: WalkPoint, context: NavigationPlanningContext,
  reachability: WalkingReachability,
): Generator<void, WalkPoint[] | null> {
  // A valid takeoff may be behind the starting point (for example the book).
  // Probe a bounded local run-up, then reuse the retained walking parent chains.
  for (const radius of [1.2, 1.8, 2.4]) {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      yield;
      const x = support.x + dx * radius;
      const z = support.z + dz * radius;
      // Carry support height through the complete walking approach. Sampling
      // the destination at the starting stair height rejects legal descents
      // into the river (or ascents through successive treads).
      const y = yield* traceWalkingWork(start, x, z, context.sample);
      if (y === null) continue;
      const takeoff = { x, y, z };
      yield;
      if (!context.canJump(takeoff, support)) continue;
      return [{ ...start }, takeoff];
    }
  }
  return yield* reachability.approach(support, context.sample, context.canJump);
}

/** Fresh validation also adapts a completed job to the latest held goal. */
export function* validateNavigationWork(
  legs: readonly NavigationLeg[], position: WalkPoint, goal: WalkPoint,
  context: NavigationPlanningContext,
): Generator<void, NavigationLeg[] | null> {
  const result: NavigationLeg[] = [];
  let from = { ...position };
  for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
    const leg = legs[legIndex]!;
    const path: WalkPoint[] = [{ ...from }];
    for (let index = 1; index < leg.path.length; index += 1) {
      const to = legIndex === legs.length - 1 && index === leg.path.length - 1
        ? goal : leg.path[index]!;
      if (leg.kind !== "walk") {
        yield;
        if (!context.canLand(to) || !(leg.kind === "drop"
          ? context.canDrop?.(from, to) : context.canJump(from, to))) return null;
      } else {
        const height = yield* traceWalkingWork(from, to.x, to.z, context.sample);
        if (height === null || Math.abs(height - to.y) >= 0.08) return null;
      }
      path.push({ ...to });
      from = { ...to };
    }
    result.push({ kind: leg.kind, path });
  }
  return result.length ? result : null;
}
