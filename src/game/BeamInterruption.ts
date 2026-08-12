export interface BeamPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface BeamBlocker {
  x: number;
  z: number;
  minY: number;
  maxY: number;
  radius: number;
}

export interface BeamInterruption {
  segmentIndex: number;
  progress: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Finds the first point where an ordered beam route enters a vertical
 * cylindrical blocker. The mutable result keeps this suitable for a render
 * loop without producing garbage every frame.
 */
export function findFirstBeamInterruption(
  starts: readonly BeamPoint3[],
  ends: readonly BeamPoint3[],
  count: number,
  blocker: BeamBlocker,
  result: BeamInterruption,
): boolean {
  result.segmentIndex = -1;
  if (
    count <= 0 ||
    blocker.radius <= 0 ||
    blocker.maxY < blocker.minY
  ) {
    return false;
  }

  const radiusSquared = blocker.radius * blocker.radius;
  const segmentCount = Math.min(count, starts.length, ends.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const start = starts[index];
    const end = ends[index];
    if (!start || !end) continue;

    const directionX = end.x - start.x;
    const directionY = end.y - start.y;
    const directionZ = end.z - start.z;
    const horizontalLengthSquared =
      directionX * directionX + directionZ * directionZ;

    let entry = 0;
    let exit = 1;
    if (horizontalLengthSquared <= 1e-8) {
      const offsetX = start.x - blocker.x;
      const offsetZ = start.z - blocker.z;
      if (
        offsetX * offsetX + offsetZ * offsetZ >
        radiusSquared
      ) {
        continue;
      }
    } else {
      const centerProgress =
        ((blocker.x - start.x) * directionX +
          (blocker.z - start.z) * directionZ) /
        horizontalLengthSquared;
      const nearestX = start.x + directionX * centerProgress;
      const nearestZ = start.z + directionZ * centerProgress;
      const nearestOffsetX = nearestX - blocker.x;
      const nearestOffsetZ = nearestZ - blocker.z;
      const nearestDistanceSquared =
        nearestOffsetX * nearestOffsetX +
        nearestOffsetZ * nearestOffsetZ;
      if (nearestDistanceSquared > radiusSquared) continue;

      const halfSpan = Math.sqrt(
        Math.max(
          0,
          (radiusSquared - nearestDistanceSquared) /
            horizontalLengthSquared,
        ),
      );
      entry = Math.max(entry, centerProgress - halfSpan);
      exit = Math.min(exit, centerProgress + halfSpan);
    }

    if (Math.abs(directionY) <= 1e-8) {
      if (start.y < blocker.minY || start.y > blocker.maxY) {
        continue;
      }
    } else {
      const firstVerticalProgress =
        (blocker.minY - start.y) / directionY;
      const secondVerticalProgress =
        (blocker.maxY - start.y) / directionY;
      entry = Math.max(
        entry,
        Math.min(firstVerticalProgress, secondVerticalProgress),
      );
      exit = Math.min(
        exit,
        Math.max(firstVerticalProgress, secondVerticalProgress),
      );
    }

    entry = Math.max(0, entry);
    exit = Math.min(1, exit);
    if (entry > exit) continue;

    result.segmentIndex = index;
    result.progress = entry;
    result.x = start.x + directionX * entry;
    result.y = start.y + directionY * entry;
    result.z = start.z + directionZ * entry;
    return true;
  }

  return false;
}
