/**
 * A loose crystal overlapping an occupied socket is not a queued replacement.
 * It must leave that socket's capture area before a fresh placement can claim it.
 * Colour deliberately plays no part in occupancy.
 */
export function socketPlacementIsBlocked(
  nearbySocket: string | null,
  blockedSocket: string | null,
  occupiedByAnother: boolean,
): boolean {
  return nearbySocket !== null &&
    (occupiedByAnother || blockedSocket === nearbySocket);
}
