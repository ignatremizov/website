import type { SurfaceArea } from "./SurfaceSelection.ts";
import { isWithinWalkingStep } from "./SurfaceSelection.ts";
import { loosePropIntersectsSolid, type PropSolid } from "./LoosePropCollision.ts";
import { walkingGridAxis, type WalkingGridHints } from "./WalkingGrid.ts";

export interface WalkPoint { x: number; y: number; z: number }
export type SampleWalkHeight = (x: number, z: number, previousHeight: number) => number | null;

/** A held pointer must not repeatedly search the same unreachable request. */
export class FailedWalkingRequestCache {
  private failure: {
    start: WalkPoint; goal: WalkPoint; surfaceId: string | null; revision: number;
  } | null = null;

  matches(start: WalkPoint, goal: WalkPoint, surfaceId: string | null, revision: number): boolean {
    const failure = this.failure;
    const close = (a: WalkPoint, b: WalkPoint): boolean =>
      Math.hypot(a.x - b.x, a.z - b.z) < 0.24 && Math.abs(a.y - b.y) < 0.08;
    return failure !== null && failure.surfaceId === surfaceId &&
      failure.revision === revision && close(start, failure.start) && close(goal, failure.goal);
  }

  remember(start: WalkPoint, goal: WalkPoint, surfaceId: string | null, revision: number): void {
    this.failure = { start: { ...start }, goal: { ...goal }, surfaceId, revision };
  }

  clear(): void { this.failure = null; }
}

export function selectWalkSupportHeight(
  surfaces: readonly SurfaceArea[],
  x: number, z: number, previousHeight: number, ground: number | null,
  contains: (surface: SurfaceArea, x: number, z: number) => boolean,
): number | null {
  let height = ground !== null && Math.abs(ground - previousHeight) <= 0.295 ? ground : null;
  for (const surface of surfaces) {
    if (surface.enabled === false || !contains(surface, x, z)) continue;
    const top = surface.heightAt(x, z);
    const step = surface.stepHeight ?? 0.08;
    if (Math.abs(top - previousHeight) <= step + 0.015 && (height === null || top > height)) {
      height = top;
    }
  }
  return height;
}

export function hasWalkingClearance(
  solids: readonly (PropSolid & { solidTop?: number; stepHeight?: number })[],
  x: number, z: number, height: number, radius: number, bodyHeight: number,
): boolean {
  for (const solid of solids) {
    // A coarse prop box may enclose decoration above its physical top (the
    // monument's suspended gem). Use the same resting top as jump clearance,
    // while still checking separate overhead solids such as the bridge.
    if (solid.solidTop !== undefined &&
      (height >= solid.solidTop - 0.015 ||
        isWithinWalkingStep(height, solid.solidTop, solid.stepHeight))) continue;
    if (loosePropIntersectsSolid(x, z, radius, height, height + bodyHeight, solid)) return false;
  }
  return true;
}

/**
 * Trace the actual treads along a line, rather than testing every point at the
 * departure height. Samples are closer than a stair tread or a player's radius.
 */
export function traceWalkSegment(
  from: WalkPoint,
  x: number,
  z: number,
  sample: SampleWalkHeight,
): number | null {
  const samples = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.12));
  let height = from.y;
  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    const next = sample(from.x + (x - from.x) * t, from.z + (z - from.z) * t, height);
    if (next === null) return null;
    height = next;
  }
  return height;
}

/** Each yield is one bounded unit of scene-query work, including smoothing. */
export function* traceWalkingWork(
  from: WalkPoint, x: number, z: number, sample: SampleWalkHeight,
): Generator<void, number | null> {
  const samples = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.12));
  let height = from.y;
  for (let index = 1; index <= samples; index += 1) {
    yield;
    const t = index / samples;
    const next = sample(from.x + (x - from.x) * t, from.z + (z - from.z) * t, height);
    if (next === null) return null;
    height = next;
  }
  return height;
}

function finishWalkingWork<T>(work: Generator<void, T>): T {
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}

/**
 * Near a bend is not necessarily past it. Skipping the entrance waypoint of
 * stairs (or a corner beside a plinth) is safe only if the shortcut is walkable
 * from the player's current height. A jump keeps its precise takeoff waypoint.
 */
export function advanceWalkingWaypoint(
  path: readonly WalkPoint[],
  index: number,
  position: WalkPoint,
  sample: SampleWalkHeight,
  lastLegIsJump: boolean,
): number {
  while (index < path.length - 1) {
    const waypoint = path[index]!;
    const distance = Math.hypot(waypoint.x - position.x, waypoint.z - position.z);
    if (distance > 0.46 || Math.abs(waypoint.y - position.y) > 0.08) break;
    if (lastLegIsJump && index === path.length - 2) {
      if (distance > 0.025) break;
    } else {
      const next = path[index + 1]!;
      const height = traceWalkSegment(position, next.x, next.z, sample);
      if (height === null || Math.abs(height - next.y) > 0.08) break;
    }
    index += 1;
  }
  return index;
}

interface WalkNode extends WalkPoint {
  column: number;
  row: number;
  cost: number;
  estimate: number;
  previous: WalkNode | null;
  closed: boolean;
}

/** Request-local parent chains reused for intermediate jump approaches. */
export class WalkingReachability {
  private readonly nodes: WalkNode[] = [];

  record(node: WalkNode): void { this.nodes.push(node); }

  get size(): number { return this.nodes.length; }

  *approach(
    goal: WalkPoint, sample: SampleWalkHeight,
    acceptJump: (from: WalkPoint, to: WalkPoint) => boolean,
    firstNode = 0,
  ): Generator<void, WalkPoint[] | null> {
    for (let index = firstNode; index < this.nodes.length; index += 1) {
      const node = this.nodes[index]!;
      yield;
      if (!acceptJump(node, goal)) continue;
      return yield* compactWalkingPathWork(node, node, sample);
    }
    return null;
  }
}

/**
 * Revalidate the remaining walking legs. A jump retains the exact unconsumed
 * takeoff; once it is consumed, the current supported position is the takeoff.
 * The caller checks the final jump's range and arc against current geometry.
 */
export function retargetWalkingRoute(
  path: readonly WalkPoint[], index: number, position: WalkPoint,
  goal: WalkPoint, sample: SampleWalkHeight,
  acceptJump?: (takeoff: WalkPoint, landing: WalkPoint) => boolean,
): WalkPoint[] | null {
  if (index < 0 || index >= path.length) return null;
  const result: WalkPoint[] = [{ ...position }];
  let from = position;
  for (let cursor = index; cursor < path.length - 1; cursor += 1) {
    const point = path[cursor]!;
    const height = traceWalkSegment(from, point.x, point.z, sample);
    if (height === null || Math.abs(height - point.y) >= 0.08) return null;
    result.push({ ...point });
    from = point;
  }
  if (acceptJump) {
    // Also validate support when no walking leg remains (direct/final approach).
    const height = sample(from.x, from.z, from.y);
    if (height === null || Math.abs(height - from.y) >= 0.08 ||
      !acceptJump(from, goal)) return null;
  } else {
    const height = traceWalkSegment(from, goal.x, goal.z, sample);
    if (height === null || Math.abs(height - goal.y) >= 0.08) return null;
  }
  result.push({ ...goal });
  return result;
}

export interface GuidedRoute {
  kind: "walking" | "jump" | "departure-jump" | "unreachable";
  path: WalkPoint[];
}

/**
 * Navigation runs before the grounded support offset settles. Wait briefly
 * only when the sampler selects the intended landing support; do not accept
 * the stale rendered height or substitute the planned height for physics.
 */
export function departureLandingState(
  position: WalkPoint, landing: WalkPoint, support: number | null, settlingFor: number,
): "landed" | "settling" | "invalid" {
  if (support === null || Math.abs(support - landing.y) >= 0.08 ||
    Math.hypot(position.x - landing.x, position.z - landing.z) >= 0.35) return "invalid";
  if (Math.abs(position.y - support) < 0.08 && Math.abs(position.y - landing.y) < 0.08) {
    return "landed";
  }
  return settlingFor < 0.35 && Math.abs(position.y - support) <= 0.295
    ? "settling" : "invalid";
}

const directions = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

/**
 * On-demand, bounded A* over reachable support heights. The height belongs in
 * the node key: the river and bridge can occupy the very same horizontal cell.
 * Scene ownership, body clearance, and bounds remain with the caller's sampler.
 */
export function findGuidedWalkingRoute(
  start: WalkPoint,
  goal: WalkPoint,
  sample: SampleWalkHeight,
  acceptTakeoff?: (point: WalkPoint) => boolean,
): WalkPoint[] {
  return planGuidedRoute(start, goal, sample, acceptTakeoff).path;
}

/** One request-local terrain search; jump arcs are considered only after walking fails. */
export function planGuidedRoute(
  start: WalkPoint,
  goal: WalkPoint,
  sample: SampleWalkHeight,
  acceptTakeoff?: (point: WalkPoint) => boolean,
): GuidedRoute {
  return finishWalkingWork(planGuidedRouteWork(start, goal, sample, acceptTakeoff));
}

export function* planGuidedRouteWork(
  start: WalkPoint, goal: WalkPoint, sample: SampleWalkHeight,
  acceptTakeoff?: (point: WalkPoint) => boolean,
  reachability?: WalkingReachability,
  gridHints?: WalkingGridHints,
): Generator<void, GuidedRoute> {
  return yield* searchGuidedRouteWork(start, goal, sample, acceptTakeoff, 0.48, 12000, true, reachability, gridHints);
}

function* searchGuidedRouteWork(
  start: WalkPoint, goal: WalkPoint, sample: SampleWalkHeight,
  acceptTakeoff: ((point: WalkPoint) => boolean) | undefined,
  cellSize: number, iterationLimit: number, recover: boolean,
  reachability?: WalkingReachability,
  gridHints?: WalkingGridHints,
): Generator<void, GuidedRoute> {
  const direct = yield* traceWalkingWork(start, goal.x, goal.z, sample);
  if (direct !== null && Math.abs(direct - goal.y) < 0.08) {
    return { kind: "walking", path: [{ ...start }, { ...goal }] };
  }
  const pointX = walkingGridAxis(start.x, cellSize, gridHints?.x ?? []);
  const pointZ = walkingGridAxis(start.z, cellSize, gridHints?.z ?? []);
  const key = (column: number, row: number, height: number): string =>
    `${column}:${row}:${Math.round(height * 20)}`;
  const nodes = new Map<string, WalkNode>();
  const open: WalkNode[] = [];
  const push = (node: WalkNode): void => {
    let index = open.length;
    open.push(node);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (open[parent]!.estimate <= node.estimate) break;
      open[index] = open[parent]!;
      index = parent;
    }
    open[index] = node;
  };
  const pop = (): WalkNode => {
    const best = open[0]!;
    const last = open.pop()!;
    if (open.length > 0) {
      let index = 0;
      while (index * 2 + 1 < open.length) {
        let child = index * 2 + 1;
        if (child + 1 < open.length && open[child + 1]!.estimate < open[child]!.estimate) child += 1;
        if (open[child]!.estimate >= last.estimate) break;
        open[index] = open[child]!;
        index = child;
      }
      open[index] = last;
    }
    return best;
  };
  const first: WalkNode = {
    ...start, column: 0, row: 0, cost: 0,
    estimate: Math.hypot(goal.x - start.x, goal.z - start.z),
    previous: null, closed: false,
  };
  nodes.set(key(0, 0, start.y), first);
  push(first);
  let reached: WalkNode | null = null;
  let end = goal;
  const reachable: WalkNode[] = [];
  let kind: GuidedRoute["kind"] = "walking";
  let expanded = 0;
  for (let iteration = 0; open.length > 0 && iteration < iterationLimit; iteration += 1) {
    yield;
    const current = pop();
    if (current.closed || nodes.get(key(current.column, current.row, current.y)) !== current) continue;
    current.closed = true;
    reachability?.record(current);
    expanded += 1;
    if (acceptTakeoff) reachable.push(current);
    if (Math.hypot(goal.x - current.x, goal.z - current.z) < cellSize * 1.5) {
      const arrival = yield* traceWalkingWork(current, goal.x, goal.z, sample);
      if (arrival !== null && Math.abs(arrival - goal.y) < 0.08) {
        reached = current;
        break;
      }
    }
    for (const [dc, dr] of directions) {
      const column = current.column + dc;
      const row = current.row + dr;
      const x = pointX(column);
      const z = pointZ(row);
      const y = yield* traceWalkingWork(current, x, z, sample);
      if (y === null) continue;
      const id = key(column, row, y);
      const cost = current.cost + Math.hypot(x - current.x, z - current.z);
      const known = nodes.get(id);
      if (known && known.cost <= cost) continue;
      const node: WalkNode = {
        x, y, z, column, row, cost,
        estimate: cost + Math.hypot(goal.x - x, goal.z - z),
        previous: current, closed: false,
      };
      nodes.set(id, node);
      push(node);
    }
  }
  // A coarse lattice can miss a narrow exit depending on the player's origin.
  // Recover only a small, exhausted component, never a budget-limited search.
  if (!reached && recover && open.length === 0 && expanded <= 512) {
    const finer = yield* searchGuidedRouteWork(start, goal, sample, acceptTakeoff, 0.24, 6000, false, reachability, gridHints);
    if (finer.kind !== "unreachable") return finer;
  }
  if (!reached && acceptTakeoff) {
    for (const node of reachable) {
      yield;
      if (!acceptTakeoff(node)) continue;
      reached = node;
      end = node;
      kind = "jump";
      break;
    }
  }
  if (!reached) return { kind: "unreachable", path: [] };
  return { kind, path: yield* compactWalkingPathWork(reached, end, sample) };
}

function* compactWalkingPathWork(
  reached: WalkNode, end: WalkPoint, sample: SampleWalkHeight,
): Generator<void, WalkPoint[]> {
  const raw: WalkPoint[] = [{ x: end.x, y: end.y, z: end.z }];
  for (let node: WalkNode | null = reached; node; node = node.previous) {
    yield;
    raw.push({ x: node.x, y: node.y, z: node.z });
  }
  raw.reverse();
  const result: WalkPoint[] = [raw[0]!];
  for (let anchor = 0; anchor < raw.length - 1;) {
    let next = raw.length - 1;
    while (next > anchor + 1) {
      const target = raw[next]!;
      const height = yield* traceWalkingWork(raw[anchor]!, target.x, target.z, sample);
      if (height !== null && Math.abs(height - target.y) < 0.08) break;
      next -= 1;
    }
    result.push(raw[next]!);
    anchor = next;
  }
  return result;
}

/**
 * Bounded jump-first recovery after walking/arrival-jump planning fails.
 * Probe 32 nearby ground landings, prefer a direct walking continuation, then
 * allow at most four 1500-iteration walking searches. No chained jumps.
 * The caller supplies the actual supported departure position; authored
 * jump-only platforms need not be traversable by the walking sampler.
 */
export function planDepartureJumpRoute(
  start: WalkPoint, goal: WalkPoint, sample: SampleWalkHeight,
  sampleLanding: (x: number, z: number) => number | null,
  acceptJump: (from: WalkPoint, to: WalkPoint) => boolean,
): GuidedRoute {
  const candidates: WalkPoint[] = [];
  for (const radius of [1.2, 1.8, 2.4, 3]) {
    for (const [dx, dz] of directions) {
      const length = Math.hypot(dx, dz);
      const x = start.x + dx / length * radius;
      const z = start.z + dz / length * radius;
      const y = sampleLanding(x, z);
      if (y === null || Math.abs(y - start.y) <= 0.295) continue;
      const landing = { x, y, z };
      const support = sample(x, z, y);
      if (support === null || Math.abs(support - y) >= 0.08 || !acceptJump(start, landing)) continue;
      const arrival = traceWalkSegment(landing, goal.x, goal.z, sample);
      if (arrival !== null && Math.abs(arrival - goal.y) < 0.08) {
        return { kind: "departure-jump", path: [{ ...start }, landing, { ...goal }] };
      }
      candidates.push(landing);
    }
  }
  candidates.sort((a, b) =>
    Math.hypot(a.x - goal.x, a.z - goal.z) - Math.hypot(b.x - goal.x, b.z - goal.z));
  for (const landing of candidates.slice(0, 4)) {
    const tail = finishWalkingWork(searchGuidedRouteWork(landing, goal, sample, undefined, 0.48, 1500, false));
    if (tail.kind === "walking") {
      return { kind: "departure-jump", path: [{ ...start }, ...tail.path] };
    }
  }
  return { kind: "unreachable", path: [] };
}

/** A retarget keeps the departure landing fixed and validates the whole tail. */
export function retargetDepartureJumpRoute(
  path: readonly WalkPoint[], position: WalkPoint, goal: WalkPoint,
  sample: SampleWalkHeight, acceptJump: (from: WalkPoint, to: WalkPoint) => boolean,
): WalkPoint[] | null {
  const landing = path[1];
  if (!landing || path.length < 3) return null;
  const support = sample(landing.x, landing.z, landing.y);
  if (support === null || Math.abs(support - landing.y) >= 0.08 ||
    !acceptJump(position, landing)) return null;
  const tail = retargetWalkingRoute(path, 2, landing, goal, sample);
  return tail ? [{ ...position }, ...tail] : null;
}
