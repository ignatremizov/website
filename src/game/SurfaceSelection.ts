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
      const previousHeight = surface.heightAt(
        frame.previousX,
        frame.previousZ,
      );
      const crossedSurface =
        frame.previousFeetHeight >= previousHeight - 0.015 &&
        frame.feetHeight <= height + 0.015;
      if (crossedSurface && height > highestLanding) {
        highestLanding = height;
        selection.landing = surface;
      }
    }

    if (
      frame.grounded &&
      !surface.requiresJump &&
      height > highestGrounded
    ) {
      highestGrounded = height;
      selection.grounded = surface;
    }
  }

  return selection;
}
