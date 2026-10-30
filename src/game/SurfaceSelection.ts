export interface SurfaceArea {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  requiresJump: boolean;
  /**
   * Variable-height walkable surfaces should keep grounded feet directly on
   * their rendered geometry.
   */
  snapGroundedHeight?: boolean;
  /** Explicit stair/terrace opt-in; never lift grounded feet by more than this. */
  stepHeight?: number;
  supportMargin?: number;
  edgeGrace?: number;
  debugResolution?: number;
  landingMessage?: string;
  onLand?: () => void;
  enabled?: boolean;
  contains?: (x: number, z: number, margin: number) => boolean;
  heightAt: (x: number, z: number) => number;
}

export interface SurfaceSelection {
  active: SurfaceArea | null;
  landing: SurfaceArea | null;
  grounded: SurfaceArea | null;
}

export interface SurfaceSelectionFrame {
  activeSurface: SurfaceArea | null;
  x: number;
  z: number;
  previousX: number;
  previousZ: number;
  feetHeight: number;
  previousFeetHeight: number;
  descending: boolean;
  grounded: boolean;
}

type SurfaceSupportTest = (
  surface: SurfaceArea,
  x: number,
  z: number,
) => boolean;

/** Wide feet can rest across a ledge even while the origin is just outside it. */
export function surfaceOverlapsCircle(
  surface: SurfaceArea, x: number, z: number, radius: number,
): boolean {
  if (surface.enabled === false) return false;
  if (surface.contains) return surface.contains(x, z, radius);
  const dx = Math.max(0, Math.abs(x - surface.x) - surface.halfWidth);
  const dz = Math.max(0, Math.abs(z - surface.z) - surface.halfDepth);
  return dx * dx + dz * dz < radius * radius;
}

export function isWithinWalkingStep(
  feetHeight: number,
  top: number,
  stepHeight: number | undefined,
): boolean {
  return stepHeight !== undefined &&
    Math.abs(top - feetHeight) <= stepHeight + 0.015;
}

/** Only explicitly authored steps may change grounded height before a move. */
export function selectWalkingStepSurface(
  surfaces: readonly SurfaceArea[],
  x: number,
  z: number,
  feetHeight: number,
  contains: SurfaceSupportTest,
): SurfaceArea | null {
  let selected: SurfaceArea | null = null;
  let highest = Number.NEGATIVE_INFINITY;
  for (const surface of surfaces) {
    if (surface.enabled === false || !contains(surface, x, z)) continue;
    const height = surface.heightAt(x, z);
    if (height > highest && isWithinWalkingStep(feetHeight, height, surface.stepHeight)) {
      selected = surface;
      highest = height;
    }
  }
  return selected;
}

/**
 * A loose prop can land on any crossed deck, not only its original platform.
 * Test the swept bottom height so fast falls catch thin bridges, while objects
 * already beneath a bridge stay beneath it.
 */
export function selectPropLandingSurface(
  surfaces: readonly SurfaceArea[],
  x: number,
  z: number,
  previousBottom: number,
  bottom: number,
  contains: (surface: SurfaceArea, x: number, z: number, radius: number) => boolean,
  radius = 0,
): SurfaceArea | null {
  if (bottom > previousBottom + 0.015) return null;
  let landing: SurfaceArea | null = null;
  let highest = Number.NEGATIVE_INFINITY;
  for (const surface of surfaces) {
    if (surface.enabled === false || !contains(surface, x, z, radius)) continue;
    const top = surface.heightAt(x, z);
    if (previousBottom >= top - 0.025 && bottom <= top + 0.025 && top > highest) {
      highest = top;
      landing = surface;
    }
  }
  return landing;
}

function crossesSurfaceTop(
  surface: SurfaceArea,
  previousX: number,
  previousZ: number,
  previousFeetHeight: number,
  feetHeight: number,
  height: number,
): boolean {
  return previousFeetHeight >= surface.heightAt(previousX, previousZ) - 0.015 &&
    feetHeight <= height + 0.015;
}

/**
 * Landing-only query for planned flight segments. Use the same crossing rule
 * as the player: an overlapping canopy may catch a descent before its chosen
 * lower destination, but an overhead deck cannot pull a jump up from below.
 */
export function selectDescendingLandingSurface(
  surfaces: readonly SurfaceArea[],
  previousX: number, previousZ: number, previousFeetHeight: number,
  x: number, z: number, feetHeight: number,
  isSupported: SurfaceSupportTest,
): SurfaceArea | null {
  if (feetHeight > previousFeetHeight + 0.001) return null;
  let landing: SurfaceArea | null = null;
  let highest = Number.NEGATIVE_INFINITY;
  for (const surface of surfaces) {
    if (surface.enabled === false || !isSupported(surface, x, z)) continue;
    const height = surface.heightAt(x, z);
    if (height > highest && crossesSurfaceTop(
      surface, previousX, previousZ, previousFeetHeight, feetHeight, height,
    )) {
      highest = height;
      landing = surface;
    }
  }
  return landing;
}

/**
 * Finds the relevant overlapping surfaces without allocating candidate arrays
 * or sorting them in the player frame loop.
 */
export function selectSupportedSurfaces(
  surfaces: readonly SurfaceArea[],
  frame: SurfaceSelectionFrame,
  isSupported: SurfaceSupportTest,
  selection: SurfaceSelection,
): SurfaceSelection {
  selection.active = null;
  selection.landing = null;
  selection.grounded = null;
  let highestLanding = Number.NEGATIVE_INFINITY;
  let highestGrounded = Number.NEGATIVE_INFINITY;

  for (const surface of surfaces) {
    if (!isSupported(surface, frame.x, frame.z)) continue;
    if (surface === frame.activeSurface) selection.active = surface;

    const height = surface.heightAt(frame.x, frame.z);
    if (frame.descending) {
      const crossedSurface = crossesSurfaceTop(
        surface, frame.previousX, frame.previousZ,
        frame.previousFeetHeight, frame.feetHeight, height,
      );
      if (crossedSurface && height > highestLanding) {
        highestLanding = height;
        selection.landing = surface;
      }
    }

    if (
      frame.grounded &&
      (surface.stepHeight !== undefined
        ? isWithinWalkingStep(frame.feetHeight, height, surface.stepHeight)
        : !surface.requiresJump) &&
      height > highestGrounded
    ) {
      highestGrounded = height;
      selection.grounded = surface;
    }
  }

  return selection;
}
