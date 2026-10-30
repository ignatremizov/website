/** The ordinary player-centre limit, shared by picking and boundary scenery. */
export const worldBoundaryInset = 0.55;

export type WorldBounds =
  | { kind: "circle"; radius: number }
  | { kind: "square"; halfWidth: number; halfDepth: number };

export function insideWorldBounds(x: number, z: number, bounds: WorldBounds): boolean {
  // A clamped point at an arbitrary bearing can round a few ulps outside a
  // circle. This tolerance is numerical, not additional playable terrain.
  const epsilon = 1e-7;
  return bounds.kind === "circle"
    ? Math.hypot(x, z) <= Math.max(0, bounds.radius - worldBoundaryInset) + epsilon
    : Math.abs(x) <= Math.max(0, bounds.halfWidth - worldBoundaryInset) + epsilon &&
      Math.abs(z) <= Math.max(0, bounds.halfDepth - worldBoundaryInset) + epsilon;
}

export function clampWorldPoint(point: { x: number; z: number }, bounds: WorldBounds): void {
  if (bounds.kind === "circle") {
    const distance = Math.hypot(point.x, point.z);
    const maximum = Math.max(0, bounds.radius - worldBoundaryInset);
    if (distance > maximum) {
      point.x *= maximum / distance;
      point.z *= maximum / distance;
    }
  } else {
    const width = Math.max(0, bounds.halfWidth - worldBoundaryInset);
    const depth = Math.max(0, bounds.halfDepth - worldBoundaryInset);
    point.x = Math.max(-width, Math.min(width, point.x));
    point.z = Math.max(-depth, Math.min(depth, point.z));
  }
}
