export interface PropSolid {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  enabled?: boolean;
  intersectsHorizontal?: (x: number, z: number, radius: number) => boolean;
}

function overlapsFootprint(x: number, z: number, radius: number, solid: PropSolid): boolean {
  if (solid.intersectsHorizontal) return solid.intersectsHorizontal(x, z, radius);
  const dx = Math.max(0, Math.abs(x - solid.x) - solid.halfWidth);
  const dz = Math.max(0, Math.abs(z - solid.z) - solid.halfDepth);
  return dx * dx + dz * dz < radius * radius;
}

/**
 * Prop origins need not be their centres (a crystal's origin is at its base).
 * Use physical vertical bounds so a supporting tread is clear while its
 * taller neighbour and the underside of an overhead deck remain solid.
 */
export function loosePropIntersectsSolid(
  x: number,
  z: number,
  radius: number,
  bottom: number,
  top: number,
  solid: PropSolid,
): boolean {
  if (
    solid.enabled === false ||
    bottom >= solid.y + solid.halfHeight - 0.025 ||
    top <= solid.y - solid.halfHeight + 0.025
  ) return false;
  return overlapsFootprint(x, z, radius, solid);
}

/** Clamp a feet-origin body's upward sweep at the first solid underside. */
export function resolvePropRise(
  x: number, z: number, radius: number, feet: number, height: number,
  desiredFeet: number, solids: readonly PropSolid[],
): number {
  if (desiredFeet <= feet) return desiredFeet;
  let resolved = desiredFeet;
  for (const solid of solids) {
    if (solid.enabled === false) continue;
    const underside = solid.y - solid.halfHeight;
    if (underside < feet + height - 0.025 || underside >= resolved + height) continue;
    if (!overlapsFootprint(x, z, radius, solid)) continue;
    // A tiny pre-existing contact tolerance must not pull the body downward.
    resolved = Math.max(feet, underside - height - 0.005);
  }
  return resolved;
}

/** The downward counterpart catches thin table tops even during a fast drag. */
export function resolvePropDescent(
  x: number, z: number, radius: number, feet: number,
  desiredFeet: number, solids: readonly PropSolid[],
): number {
  if (desiredFeet >= feet) return desiredFeet;
  let resolved = desiredFeet;
  for (const solid of solids) {
    if (solid.enabled === false) continue;
    const top = solid.y + solid.halfHeight;
    if (top > feet + 0.025 || top < resolved) continue;
    if (!overlapsFootprint(x, z, radius, solid)) continue;
    resolved = Math.min(feet, top);
  }
  return resolved;
}

interface BodyPoint { x: number; y: number; z: number }

/** A release may settle a contact, but cannot teleport to an unrelated top. */
export function canPlaceHeldBody(
  x: number, z: number, radius: number, feet: number, height: number,
  supportHeight: number, solids: readonly PropSolid[],
): boolean {
  if (!Number.isFinite(supportHeight) || Math.abs(feet - supportHeight) > 0.035) return false;
  for (const solid of solids) {
    if (
      loosePropIntersectsSolid(x, z, radius, feet, feet + height, solid) ||
      loosePropIntersectsSolid(x, z, radius, supportHeight + 0.01, supportHeight + 0.01 + height, solid)
    ) return false;
  }
  return true;
}

/**
 * Telekinesis supplies a desired pose, not permission to cross solid scenery.
 * Sweep a fixed feet-origin body and slide its unblocked axes. Vertical sweeps
 * catch thin books/decks; bounded horizontal steps cannot skip a body-width
 * wall. Large pointer jumps make bounded progress and continue next frame.
 * `out` may alias either input. Callers supply the swept broadphase candidates.
 */
export function resolveHeldBodyTarget(
  from: BodyPoint, target: BodyPoint, radius: number, height: number,
  solids: readonly PropSolid[], out: BodyPoint,
): void {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.z - from.z;
  let x = from.x;
  let y = from.y;
  let z = from.z;
  const distance = Math.hypot(dx, dy, dz);
  const sampleLength = Math.max(0.025, Math.min(0.18, radius * 0.4));
  const steps = Math.max(1, Math.min(128, Math.ceil(distance / sampleLength)));
  const fraction = Math.min(1, steps * sampleLength / Math.max(0.001, distance));
  const stepX = dx * fraction / steps;
  const stepY = dy * fraction / steps;
  const stepZ = dz * fraction / steps;

  for (let step = 0; step < steps; step += 1) {
    // Lift before moving over a ledge; descend only after moving off it.
    if (stepY > 0) y = resolvePropRise(x, z, radius, y, height, y + stepY, solids);
    let blockedX = false;
    for (const solid of solids) {
      if (loosePropIntersectsSolid(x + stepX, z, radius, y, y + height, solid)) {
        blockedX = true;
        break;
      }
    }
    if (!blockedX) x += stepX;
    let blockedZ = false;
    for (const solid of solids) {
      if (loosePropIntersectsSolid(x, z + stepZ, radius, y, y + height, solid)) {
        blockedZ = true;
        break;
      }
    }
    if (!blockedZ) z += stepZ;
    if (stepY < 0) y = resolvePropDescent(x, z, radius, y, y + stepY, solids);
  }
  out.x = x;
  out.y = y;
  out.z = z;
}
