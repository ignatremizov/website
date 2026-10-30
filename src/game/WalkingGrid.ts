import type { PropSolid } from "./LoosePropCollision.ts";

interface Point { x: number; y: number; z: number }

/** Extra coordinate lines, not permission to cross a collider or change floors. */
export interface WalkingGridHints {
  x: readonly number[];
  z: readonly number[];
}

/**
 * A uniform grid can skip a legal corridor narrower than its cell spacing.
 * Add clearance-offset faces of nearby solids to the request's coordinate
 * axes. The ordinary supported/body-clear traces still validate every edge.
 * Nothing is cached across geometry changes or added to the physical world.
 */
export function createWalkingGridHints(
  solids: readonly PropSolid[], start: Point, goal: Point,
  radius: number, bodyHeight: number,
): WalkingGridHints {
  const near = (point: Point, solid: PropSolid): number => Math.hypot(
    Math.max(0, Math.abs(point.x - solid.x) - solid.halfWidth),
    Math.max(0, Math.abs(point.z - solid.z) - solid.halfDepth),
  );
  const minimumFeet = Math.min(start.y, goal.y);
  const maximumHead = Math.max(start.y, goal.y) + bodyHeight;
  const candidates = solids.filter(solid => solid.enabled !== false &&
    solid.y + solid.halfHeight > minimumFeet + 0.015 &&
    solid.y - solid.halfHeight < maximumHead - 0.015)
    .map(solid => ({ solid, distance: near(start, solid) + near(goal, solid) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 24);
  const x = [goal.x];
  const z = [goal.z];
  const clearance = radius + 0.005;
  for (const { solid } of candidates) {
    x.push(solid.x - solid.halfWidth - clearance, solid.x + solid.halfWidth + clearance);
    z.push(solid.z - solid.halfDepth - clearance, solid.z + solid.halfDepth + clearance);
  }
  return { x, z };
}

/**
 * Preserve the start-aligned grid, inserting a bounded set of extra lines.
 * Index zero is still the exact start; beyond the hinted region the original
 * spacing resumes. Short inserted intervals use their real length as A* cost.
 */
export function walkingGridAxis(
  origin: number, spacing: number, hints: readonly number[],
): (index: number) => number {
  const extra: number[] = [];
  for (const value of hints.slice(0, 64)) {
    const offset = (value - origin) / spacing;
    if (!Number.isFinite(offset) || Math.abs(offset) > 128 ||
      Math.abs(offset - Math.round(offset)) * spacing < 1e-7) continue;
    extra.push(value);
  }
  if (extra.length === 0) return index => origin + index * spacing;
  const minimum = Math.min(0, Math.floor((Math.min(...extra) - origin) / spacing) - 1);
  const maximum = Math.max(0, Math.ceil((Math.max(...extra) - origin) / spacing) + 1);
  const values = extra;
  for (let index = minimum; index <= maximum; index++) values.push(origin + index * spacing);
  values.sort((a, b) => a - b);
  const coordinates = values.filter((value, index) => index === 0 || value - values[index - 1]! > 1e-7);
  const zero = coordinates.indexOf(origin);
  return index => {
    const cursor = zero + index;
    if (cursor < 0) return coordinates[0]! + cursor * spacing;
    if (cursor >= coordinates.length) {
      return coordinates.at(-1)! + (cursor - coordinates.length + 1) * spacing;
    }
    return coordinates[cursor]!;
  };
}
