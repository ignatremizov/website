/** One vertical model for player execution and navigation prediction. */
export const playerJumpLaunchVelocity = 7.4;
export const playerJumpGravity = 17.5;

/** Exact displacement over a step; composes across different frame cadences. */
export function jumpDisplacement(
  time: number,
  velocity = playerJumpLaunchVelocity,
): number {
  return velocity * time - playerJumpGravity * time * time / 2;
}

export function jumpVelocityAfter(
  time: number,
  velocity = playerJumpLaunchVelocity,
): number {
  return velocity - playerJumpGravity * time;
}

/** Time of the descending crossing, or null when the rise is unreachable. */
export function descendingJumpTime(heightDelta: number): number | null {
  if (!Number.isFinite(heightDelta)) return null;
  const discriminant = playerJumpLaunchVelocity ** 2 - 2 * playerJumpGravity * heightDelta;
  if (discriminant < 0) return null;
  return (playerJumpLaunchVelocity + Math.sqrt(discriminant)) / playerJumpGravity;
}

/** The rising crossing used to clear a nearby ledge before translating. */
export function ascendingJumpTime(heightDelta: number): number | null {
  if (!Number.isFinite(heightDelta) || heightDelta < 0) return null;
  const discriminant = playerJumpLaunchVelocity ** 2 - 2 * playerJumpGravity * heightDelta;
  if (discriminant < 0) return null;
  return (playerJumpLaunchVelocity - Math.sqrt(discriminant)) / playerJumpGravity;
}

/**
 * Horizontal time available in this physical step after a rise-only phase.
 * Velocity is read AFTER vertical integration, so fractional boundary frames
 * agree with prediction at 30/60 FPS and do not depend on renderer timestamps.
 */
export function guidedJumpHorizontalSeconds(
  velocityAfterStep: number, delta: number, horizontalDelay: number,
): number {
  const time = (playerJumpLaunchVelocity - velocityAfterStep) / playerJumpGravity;
  return Math.max(0, Math.min(delta, time - horizontalDelay));
}
