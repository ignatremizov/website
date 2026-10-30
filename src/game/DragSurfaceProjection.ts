import type { SurfaceArea } from "./SurfaceSelection.ts";

interface Point { x: number; y: number; z: number }
interface PointerRay { origin: Point; direction: Point }

/**
 * Change only depth on the CURRENT pointer ray. The old and new rays are
 * compared at the same height, so automatic support-height changes do not
 * become throwing momentum. Outputs are caller-owned scratch records.
 */
export function advanceHeldPropDepth(
  ray: PointerRay, previousRay: PointerRay, grip: Point,
  previousHeight: number, desiredHeight: number, delta: number,
  point: Point, pointerMotion: Point,
): void {
  const currentDistance = (previousHeight + grip.y - ray.origin.y) / ray.direction.y;
  const hasPreviousRay = Math.abs(previousRay.direction.y) >= 0.0001;
  const oldDistance = hasPreviousRay
    ? (previousHeight + grip.y - previousRay.origin.y) / previousRay.direction.y : 0;
  pointerMotion.x = hasPreviousRay ? ray.origin.x + ray.direction.x * currentDistance -
    previousRay.origin.x - previousRay.direction.x * oldDistance : 0;
  pointerMotion.y = 0;
  pointerMotion.z = hasPreviousRay ? ray.origin.z + ray.direction.z * currentDistance -
    previousRay.origin.z - previousRay.direction.z * oldDistance : 0;
  // Bound spatial travel caused by depth changes even for shallow rays.
  const rayScale = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z) /
    Math.max(0.0001, Math.abs(ray.direction.y));
  const step = 6 * Math.max(0, Math.min(0.05, delta)) / rayScale;
  point.y = previousHeight + Math.max(-step, Math.min(step, desiredHeight - previousHeight));
  const distance = (point.y + grip.y - ray.origin.y) / ray.direction.y;
  point.x = ray.origin.x + ray.direction.x * distance - grip.x;
  point.z = ray.origin.z + ray.direction.z * distance - grip.z;
}

function surfaceRayDistance(
  ray: PointerRay,
  surface: SurfaceArea,
  grip: Point,
  bottomOffset: number,
): number | null {
  const originX = ray.origin.x - grip.x;
  const originZ = ray.origin.z - grip.z;
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 2; axis += 1) {
    const origin = axis === 0 ? originX : originZ;
    const direction = axis === 0 ? ray.direction.x : ray.direction.z;
    const center = axis === 0 ? surface.x : surface.z;
    const half = axis === 0 ? surface.halfWidth : surface.halfDepth;
    if (Math.abs(direction) < 0.000001) {
      if (Math.abs(origin - center) > half) return null;
      continue;
    }
    const a = (center - half - origin) / direction;
    const b = (center + half - origin) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (far < near) return null;
  const centerHeight = surface.heightAt(surface.x, surface.z);
  const planeDistance = (centerHeight + bottomOffset + grip.y - ray.origin.y) / ray.direction.y;
  if (planeDistance >= near && planeDistance <= far) {
    const planeHeight = surface.heightAt(
      originX + ray.direction.x * planeDistance,
      originZ + ray.direction.z * planeDistance,
    );
    if (Math.abs(planeHeight - centerHeight) < 0.001) return planeDistance;
  }
  if (!Number.isFinite(far)) return null;

  // The tent roof is steep enough that fixed-point projection oscillates.
  // Bracket its first crossing inside the footprint, then bisect. Sampling
  // also finds the front side of a ridge with both perimeter ends below it.
  let before = near;
  let beforeError = ray.origin.y + ray.direction.y * before - grip.y - bottomOffset -
    surface.heightAt(originX + ray.direction.x * before, originZ + ray.direction.z * before);
  for (let segment = 1; segment <= 8; segment += 1) {
    const after = near + (far - near) * segment / 8;
    const afterError = ray.origin.y + ray.direction.y * after - grip.y - bottomOffset -
      surface.heightAt(originX + ray.direction.x * after, originZ + ray.direction.z * after);
    if (beforeError >= 0 && afterError <= 0) {
      let low = before;
      let high = after;
      for (let pass = 0; pass < 16; pass += 1) {
        const middle = (low + high) / 2;
        const error = ray.origin.y + ray.direction.y * middle - grip.y - bottomOffset -
          surface.heightAt(originX + ray.direction.x * middle, originZ + ray.direction.z * middle);
        if (error > 0) low = middle;
        else high = middle;
      }
      return low; // Stay on the clear side of the surface.
    }
    before = after;
    beforeError = afterError;
  }
  return null;
}

/**
 * Project the grabbed point onto each raised support, including the prop's
 * thickness. Raising Y after projecting XZ on a low plane moves the prop away
 * from the cursor. All three coordinates must come from the same ray distance.
 * The caller keeps the returned point and surface in its existing drag state.
 */
export function projectHeldProp(
  ray: PointerRay,
  surfaces: readonly SurfaceArea[],
  grip: Point,
  bottomOffset: number,
  hoverHeight: number,
  contains: (surface: SurfaceArea, x: number, z: number) => boolean,
  point: Point,
): SurfaceArea | null {
  if (Math.abs(ray.direction.y) < 0.0001) return null;
  const hoverDistance = (hoverHeight + grip.y - ray.origin.y) / ray.direction.y;
  point.x = ray.origin.x + ray.direction.x * hoverDistance - grip.x;
  point.y = hoverHeight;
  point.z = ray.origin.z + ray.direction.z * hoverDistance - grip.z;
  let nearest = Number.POSITIVE_INFINITY;
  let selected: SurfaceArea | null = null;
  for (const surface of surfaces) {
    if (surface.enabled === false) continue;
    const distance = surfaceRayDistance(ray, surface, grip, bottomOffset);
    if (distance === null || distance >= nearest) continue;
    const x = ray.origin.x + ray.direction.x * distance - grip.x;
    const z = ray.origin.z + ray.direction.z * distance - grip.z;
    const y = ray.origin.y + ray.direction.y * distance - grip.y;
    if (
      Math.abs(y - surface.heightAt(x, z) - bottomOffset) > 0.025 ||
      !contains(surface, x, z)
    ) continue;
    selected = surface;
    nearest = distance;
    point.x = x;
    point.y = y;
    point.z = z;
  }
  return selected;
}
