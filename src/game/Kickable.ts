import type * as THREE from "three";

import type { SurfaceArea } from "./SurfaceSelection";

/**
 * Mutable runtime record for props handled by PortfolioGame's shared
 * lightweight physics and telekinesis systems.
 */
export interface Kickable {
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  enabled: boolean;
  radius: number;
  restingY: number;
  platform: SurfaceArea | null;
  platformOffset: number;
  onPlatform: boolean;
  gravity: boolean;
  pinballRadius: number | null;
  friction: number;
  kickCooldown: number;
  message: string;
}
