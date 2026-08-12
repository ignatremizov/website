export interface PlanarPoint {
  x: number;
  z: number;
}

/**
 * Tests the whole movement segment so a quickly flung world object cannot
 * tunnel through Pong's much smaller packet between rendered frames.
 */
export function findSweptCircleContactProgress(
  start: PlanarPoint,
  end: PlanarPoint,
  point: PlanarPoint,
  radius: number,
): number | null {
  const movementX = end.x - start.x;
  const movementZ = end.z - start.z;
  const movementLengthSquared =
    movementX * movementX + movementZ * movementZ;
  const relativeX = start.x - point.x;
  const relativeZ = start.z - point.z;
  const radiusSquared = radius * radius;
  if (
    relativeX * relativeX + relativeZ * relativeZ <=
    radiusSquared
  ) {
    return 0;
  }
  if (movementLengthSquared <= Number.EPSILON) return null;

  const halfLinear =
    relativeX * movementX + relativeZ * movementZ;
  const constant =
    relativeX * relativeX +
    relativeZ * relativeZ -
    radiusSquared;
  const discriminant =
    halfLinear * halfLinear -
    movementLengthSquared * constant;
  if (discriminant < 0) return null;
  const progress =
    (-halfLinear - Math.sqrt(discriminant)) /
    movementLengthSquared;
  return progress >= 0 && progress <= 1 ? progress : null;
}

/**
 * A gentle collision should still produce a viable rally, while a hard throw
 * retains its direction and most of its character without becoming impossible
 * for either paddle to intercept.
 */
export function resolveRoguePacketVelocity(
  incoming: PlanarPoint,
  displacedPacket: PlanarPoint,
): PlanarPoint {
  let x = incoming.x;
  let z = incoming.z;
  const incomingSpeed = Math.hypot(x, z);
  if (incomingSpeed < 0.72) {
    x = displacedPacket.x;
    z = displacedPacket.z;
  }

  const maximumSpeed = 6.15;
  const speed = Math.hypot(x, z);
  if (speed > maximumSpeed) {
    const scale = maximumSpeed / speed;
    x *= scale;
    z *= scale;
  }

  const fallbackDirection = displacedPacket.x < 0 ? -1 : 1;
  const longitudinalDirection =
    Math.abs(x) > 0.08 ? Math.sign(x) : fallbackDirection;
  x =
    longitudinalDirection *
    Math.max(2.35, Math.min(5.45, Math.abs(x)));
  const maximumLateralSpeed = Math.sqrt(
    Math.max(0, maximumSpeed * maximumSpeed - x * x),
  );
  z = Math.max(
    -Math.min(4.55, maximumLateralSpeed),
    Math.min(Math.min(4.55, maximumLateralSpeed), z),
  );
  return { x, z };
}
