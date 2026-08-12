export interface HorizontalRayBox {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  enabled?: boolean;
  solidTop?: number;
  /** False keeps a movement collider transparent to optical/gameplay rays. */
  blocksRay?: boolean;
}

function axisInterval(
  origin: number,
  direction: number,
  minimum: number,
  maximum: number,
): readonly [number, number] | null {
  if (Math.abs(direction) <= 1e-9) {
    return origin >= minimum && origin <= maximum
      ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      : null;
  }
  const first = (minimum - origin) / direction;
  const second = (maximum - origin) / direction;
  return first <= second ? [first, second] : [second, first];
}

/**
 * Finds the first entry into a finite-height axis-aligned box along a
 * horizontal ray. Boxes containing the origin are deliberately ignored:
 * callers use `minimumDistance` to clear the emitter's own collision proxy.
 */
export function findFirstHorizontalRayBoxDistance(
  originX: number,
  originZ: number,
  directionX: number,
  directionZ: number,
  height: number,
  boxes: readonly HorizontalRayBox[],
  minimumDistance = 0,
  maximumDistance = Number.POSITIVE_INFINITY,
): number | null {
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength <= 1e-9 || maximumDistance < minimumDistance) {
    return null;
  }
  const normalizedX = directionX / directionLength;
  const normalizedZ = directionZ / directionLength;
  let nearestDistance = maximumDistance;
  let found = false;

  for (const box of boxes) {
    if (box.enabled === false || box.blocksRay === false) continue;
    const minimumY = box.y - box.halfHeight;
    const maximumY = box.solidTop ?? box.y + box.halfHeight;
    if (height < minimumY - 1e-6 || height > maximumY + 1e-6) {
      continue;
    }

    const xInterval = axisInterval(
      originX,
      normalizedX,
      box.x - box.halfWidth,
      box.x + box.halfWidth,
    );
    if (!xInterval) continue;
    const zInterval = axisInterval(
      originZ,
      normalizedZ,
      box.z - box.halfDepth,
      box.z + box.halfDepth,
    );
    if (!zInterval) continue;

    const entryDistance = Math.max(xInterval[0], zInterval[0]);
    const exitDistance = Math.min(xInterval[1], zInterval[1]);
    if (
      exitDistance < entryDistance ||
      entryDistance < minimumDistance ||
      entryDistance > nearestDistance
    ) {
      continue;
    }
    nearestDistance = entryDistance;
    found = true;
  }

  return found ? nearestDistance : null;
}
