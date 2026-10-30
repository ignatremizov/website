import { traceWalkingWork, type SampleWalkHeight, type WalkPoint } from "./GuidedWalkingRoute.ts";

export interface NavigationRouteGraphDefinition {
  nodes: readonly { id: string; point: WalkPoint }[];
  edges: readonly {
    from: string;
    to: string;
    kind: "walk" | "jump";
    via?: readonly WalkPoint[];
  }[];
}

interface GraphLeg {
  kind: "walk" | "jump" | "drop";
  path: WalkPoint[];
}

interface GraphPorts {
  sample: SampleWalkHeight;
  canLand: (point: WalkPoint) => boolean;
  canJump: (from: WalkPoint, to: WalkPoint) => boolean;
  canDrop?: (from: WalkPoint, to: WalkPoint) => boolean;
}

interface GraphEdge {
  to: number;
  leg: GraphLeg;
  cost: number;
  valid?: boolean;
}

const connectorCount = 6;
const connectorRadius = 5;
const jumpCost = 3;

function legCost(leg: GraphLeg): number {
  let distance = leg.kind === "jump" ? jumpCost : 0;
  for (let index = 1; index < leg.path.length; index += 1) {
    const from = leg.path[index - 1]!;
    const to = leg.path[index]!;
    distance += Math.hypot(to.x - from.x, to.z - from.z);
  }
  return distance;
}

/**
 * A small authored topology, not an all-pairs visibility graph. The host must
 * create a new instance when the zone, geometry revision, or jump speed changes.
 * Only authored edge validity is retained; request connectors are always live.
 */
export class NavigationRouteGraph {
  private readonly points: WalkPoint[];
  private readonly outgoing: GraphEdge[][];

  constructor(definition: NavigationRouteGraphDefinition) {
    const ids = new Map<string, number>();
    this.points = definition.nodes.map(({ id, point }, index) => {
      if (ids.has(id)) throw new Error(`Duplicate navigation anchor: ${id}`);
      ids.set(id, index);
      return { ...point };
    });
    this.outgoing = this.points.map(() => []);
    for (const edge of definition.edges) {
      const from = ids.get(edge.from);
      const to = ids.get(edge.to);
      if (from === undefined || to === undefined) {
        throw new Error(`Unknown navigation edge: ${edge.from} -> ${edge.to}`);
      }
      if (edge.kind === "jump" && edge.via?.length) {
        throw new Error("A navigation jump must have exactly one takeoff and landing");
      }
      const leg: GraphLeg = {
        kind: edge.kind,
        path: [this.points[from]!, ...(edge.via ?? []).map(point => ({ ...point })), this.points[to]!],
      };
      this.outgoing[from]!.push({ to, leg, cost: legCost(leg) });
    }
  }

  private closest(point: WalkPoint): number[] {
    return this.points.map((candidate, index) => ({
      index,
      distance: Math.hypot(candidate.x - point.x, candidate.z - point.z),
      score: Math.hypot(candidate.x - point.x, candidate.z - point.z) +
        Math.abs(candidate.y - point.y) * 2,
    })).filter(candidate => candidate.distance <= connectorRadius)
      .sort((a, b) => a.score - b.score)
      .slice(0, connectorCount).map(candidate => candidate.index);
  }

  private *validate(leg: GraphLeg, ports: GraphPorts): Generator<void, boolean> {
    const from = leg.path[0]!;
    const to = leg.path.at(-1)!;
    yield;
    if (!ports.canLand(from) || !ports.canLand(to)) return false;
    if (leg.kind !== "walk") {
      yield;
      return leg.kind === "drop" ? ports.canDrop?.(from, to) === true : ports.canJump(from, to);
    }
    for (let index = 1; index < leg.path.length; index += 1) {
      const end = leg.path[index]!;
      const height = yield* traceWalkingWork(leg.path[index - 1]!, end.x, end.z, ports.sample);
      if (height === null || Math.abs(height - end.y) >= 0.08) return false;
    }
    return true;
  }

  private *connect(
    from: WalkPoint, to: WalkPoint, ports: GraphPorts,
  ): Generator<void, GraphLeg | null> {
    const walking: GraphLeg = { kind: "walk", path: [from, to] };
    if (yield* this.validate(walking, ports)) return walking;
    if (ports.canDrop) {
      const dropping: GraphLeg = { kind: "drop", path: [from, to] };
      if (yield* this.validate(dropping, ports)) return dropping;
    }
    const jumping: GraphLeg = { kind: "jump", path: [from, to] };
    return (yield* this.validate(jumping, ports)) ? jumping : null;
  }

  *plan(
    start: WalkPoint, goal: WalkPoint, ports: GraphPorts,
  ): Generator<void, GraphLeg[] | null> {
    const count = this.points.length;
    const costs = new Float64Array(count).fill(Infinity);
    const visited = new Uint8Array(count);
    const previous = new Int32Array(count).fill(-1);
    const incoming: (GraphLeg | null)[] = this.points.map(() => null);
    const endings = new Map<number, GraphLeg>();
    for (const index of this.closest(start)) {
      const connector = yield* this.connect(start, this.points[index]!, ports);
      if (!connector) continue;
      costs[index] = legCost(connector);
      incoming[index] = connector;
    }
    for (const index of this.closest(goal)) {
      const connector = yield* this.connect(this.points[index]!, goal, ports);
      if (connector) endings.set(index, connector);
    }
    if (!endings.size) return null;
    let best = -1;
    let bestCost = Infinity;
    for (let expanded = 0; expanded < count; expanded += 1) {
      yield;
      let current = -1;
      for (let index = 0; index < count; index += 1) {
        if (!visited[index] && costs[index]! < bestCost &&
          (current < 0 || costs[index]! < costs[current]!)) current = index;
      }
      if (current < 0) break;
      visited[current] = 1;
      const ending = endings.get(current);
      if (ending && costs[current]! + legCost(ending) < bestCost) {
        best = current;
        bestCost = costs[current]! + legCost(ending);
      }
      for (const edge of this.outgoing[current]!) {
        yield;
        if (visited[edge.to]) continue;
        if (edge.valid === undefined) {
          // Authored jumps name connections, not a compulsory button press.
          // Resolve a legal walk/drop first, then cache its actual cost/kind.
          if (edge.leg.kind === "jump") {
            const resolved = yield* this.connect(edge.leg.path[0]!, edge.leg.path.at(-1)!, ports);
            edge.valid = resolved !== null;
            if (resolved) { edge.leg = resolved; edge.cost = legCost(resolved); }
          } else edge.valid = yield* this.validate(edge.leg, ports);
        }
        if (!edge.valid) continue;
        const cost = costs[current]! + edge.cost;
        if (visited[edge.to] || cost >= costs[edge.to]! || cost >= bestCost) continue;
        costs[edge.to] = cost;
        previous[edge.to] = current;
        incoming[edge.to] = edge.leg;
      }
    }
    if (best < 0) return null;
    const reversed: GraphLeg[] = [endings.get(best)!];
    for (let index = best; index >= 0; index = previous[index]!) {
      yield;
      const leg = incoming[index];
      if (leg) reversed.push(leg);
    }
    // Never expose cached waypoint objects to route execution or retargeting.
    return reversed.reverse().filter(leg => leg.kind !== "walk" ||
      leg.path.some(point => Math.hypot(point.x - leg.path[0]!.x, point.z - leg.path[0]!.z) > 0.001 ||
        Math.abs(point.y - leg.path[0]!.y) > 0.001))
      .map(leg => ({ kind: leg.kind, path: leg.path.map(point => ({ ...point })) }));
  }
}
