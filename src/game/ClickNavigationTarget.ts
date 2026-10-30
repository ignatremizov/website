import type { SurfaceArea } from "./SurfaceSelection.ts";
import { clampWorldPoint } from "./WorldBounds.ts";

export interface LandingPoint {
  x: number;
  y: number;
  z: number;
}

type LandingBounds =
  | { kind: "circle"; radius: number }
  | { kind: "square"; halfWidth: number; halfDepth: number };

interface LandingObstacle {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  enabled?: boolean;
}

/**
 * A wall's visible side selects the closest support below it, never an
 * overhead deck. Height breaks distance ties; a taller neighboring ledge must
 * not steal the endpoint as the pointer crosses its local search radius.
 */
export function findWallClickSurface(
  point: LandingPoint,
  groundHeight: number,
  surfaces: readonly SurfaceArea[],
): { surface: SurfaceArea; height: number; x: number; z: number } | null {
  let selected: { surface: SurfaceArea; height: number; x: number; z: number } | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const surface of surfaces) {
    if (surface.enabled === false) continue;
    const x = Math.max(surface.x - surface.halfWidth, Math.min(surface.x + surface.halfWidth, point.x));
    const z = Math.max(surface.z - surface.halfDepth, Math.min(surface.z + surface.halfDepth, point.z));
    const distance = Math.hypot(x - point.x, z - point.z);
    if (distance > 1.2 || distance > closestDistance ||
      surface.contains?.(x, z, 0) === false) continue;
    const height = surface.heightAt(x, z);
    if (height > point.y + 0.08 || height <= groundHeight ||
      (distance === closestDistance && height <= (selected?.height ?? groundHeight))) continue;
    selected = { surface, height, x, z };
    closestDistance = distance;
  }
  return selected;
}

/**
 * Wall clicks compete on cleared endpoints, including the ordinary ground.
 * Choosing a raised footprint first can send the marker through the wall to a
 * distant bank even when the ground beside the visible face is much closer.
 * Only six nearest footprints receive a clearance search; this is local
 * targeting, not another path planner.
 */
export function findWallClickLanding(
  point: LandingPoint,
  bounds: LandingBounds,
  surfaces: readonly SurfaceArea[],
  sample: (surface: SurfaceArea | null, x: number, z: number) => number | null,
  obstacles: readonly LandingObstacle[],
  clearanceRadius = 0.44,
): { surface: SurfaceArea | null; position: LandingPoint } | null {
  const anchor = { ...point };
  clampClickLandingToBounds(anchor, bounds);
  let best: { surface: SurfaceArea | null; position: LandingPoint } | null = null;
  let bestDistance = 1.2 + 1e-6;
  const consider = (surface: SurfaceArea | null, x: number, z: number): void => {
    const position = findNearbyClickLanding(
      { x, y: point.y, z }, bounds,
      (px, pz) => {
        if (Math.hypot(px - anchor.x, pz - anchor.z) > 1.2 + 1e-6) return null;
        const height = sample(surface, px, pz);
        // Check the final sampled height too: a sloped support can rise above
        // the wall hit while the local clearance search moves along it.
        return height !== null && height <= point.y + 0.08 ? height : null;
      },
      obstacles, clearanceRadius,
    );
    if (!position) return;
    const distance = Math.hypot(position.x - anchor.x, position.z - anchor.z);
    if (distance > bestDistance + 1e-6 ||
      (Math.abs(distance - bestDistance) < 1e-6 &&
        position.y <= (best?.position.y ?? -Infinity))) return;
    best = { surface, position };
    bestDistance = distance;
  };
  consider(null, anchor.x, anchor.z);

  const candidates: {
    surface: SurfaceArea; x: number; z: number; distance: number;
  }[] = [];
  for (const surface of surfaces) {
    if (surface.enabled === false) continue;
    const x = Math.max(surface.x - surface.halfWidth, Math.min(surface.x + surface.halfWidth, anchor.x));
    const z = Math.max(surface.z - surface.halfDepth, Math.min(surface.z + surface.halfDepth, anchor.z));
    const distance = Math.hypot(x - anchor.x, z - anchor.z);
    if (distance > bestDistance + 1e-6 ||
      surface.contains?.(x, z, 0) === false ||
      surface.heightAt(x, z) > point.y + 0.08) continue;
    const index = candidates.findIndex((candidate) => candidate.distance > distance + 1e-6);
    if (index < 0 && candidates.length === 6) continue;
    candidates.splice(index < 0 ? candidates.length : index, 0, { surface, x, z, distance });
    if (candidates.length > 6) candidates.pop();
  }
  for (const candidate of candidates) {
    // Footprint distance is a lower bound. A closer *blocked* footprint must
    // not suppress a farther clear one, but a finalized landing can prune it.
    if (candidate.distance > bestDistance + 1e-6) break;
    consider(candidate.surface, candidate.x, candidate.z);
  }
  return best;
}

/** Same ordinary player inset as constrainToBounds; no airborne turtle exception. */
export function clampClickLandingToBounds(
  point: LandingPoint,
  bounds: LandingBounds,
): void {
  clampWorldPoint(point, bounds);
}

/**
 * Closest clear candidate from bounded face projections and a 37-probe radial
 * fallback, not a route search.
 * Clamp the visible foundation/rim first: its art can extend beyond movement
 * bounds by more than the local clearance radius. The host sampler preserves
 * the selected support/height and checks the actual body's clearance.
 */
export function findNearbyClickLanding(
  requested: LandingPoint,
  bounds: LandingBounds,
  sample: (x: number, z: number) => number | null,
  obstacles: readonly LandingObstacle[] = [],
  clearanceRadius = 0.44,
): LandingPoint | null {
  const center = { ...requested };
  clampClickLandingToBounds(center, bounds);
  const direct = sample(center.x, center.z);
  if (direct !== null && Number.isFinite(direct)) return { ...center, y: direct };
  const candidate = { ...center };
  let best: LandingPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const consider = (x: number, z: number): void => {
    candidate.x = x;
    candidate.z = z;
    clampClickLandingToBounds(candidate, bounds);
    const distance = Math.hypot(candidate.x - center.x, candidate.z - center.z);
    // Floating-point ties between radial candidates used to flip the marker
    // across a wall by a meter after a millimeter of pointer movement.
    if (distance > 1.2 + 1e-6 || distance >= bestDistance - 1e-6) return;
    const height = sample(candidate.x, candidate.z);
    if (height === null || !Number.isFinite(height)) return;
    best = { x: candidate.x, y: height, z: candidate.z };
    bestDistance = distance;
  };
  // Use the actual nearby obstacle faces before the radial fallback. A fixed
  // ring of candidates can only hop between coarse compass directions; face
  // projections slide continuously along walls. Full support/headroom sampling
  // still decides validity, including custom/circular collision footprints.
  let probes = 0;
  const radius = clearanceRadius + 0.005;
  for (const obstacle of obstacles) {
    if (obstacle.enabled === false) continue;
    if (probes + 5 > 60) break;
    const left = obstacle.x - obstacle.halfWidth;
    const right = obstacle.x + obstacle.halfWidth;
    const near = obstacle.z - obstacle.halfDepth;
    const far = obstacle.z + obstacle.halfDepth;
    const dx = center.x - Math.max(left, Math.min(right, center.x));
    const dz = center.z - Math.max(near, Math.min(far, center.z));
    const distance = Math.hypot(dx, dz);
    if (distance > radius) continue;
    if (distance > 1e-6) {
      consider(center.x + dx * (radius / distance - 1),
        center.z + dz * (radius / distance - 1));
    }
    consider(left - radius, center.z);
    consider(right + radius, center.z);
    consider(center.x, near - radius);
    consider(center.x, far + radius);
    probes += 5;
  }
  for (const radius of [0.2, 0.55, 1.2]) {
    for (let direction = 0; direction < 12; direction += 1) {
      const angle = direction * Math.PI / 6;
      consider(center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
    }
  }
  return best;
}
