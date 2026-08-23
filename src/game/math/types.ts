import type * as THREE from "three";
import type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
} from "../../world/WorldContracts";

export type MathQualityTier = QualityTier;
export type MathSpellStage = SpellStage;
export type MathWorldStatusOptions = WorldStatusOptions;

export interface MathInteractionSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  action: () => void | Promise<void>;
}

export interface MathInstanceDragSpec {
  object: THREE.InstancedMesh;
  getWorldPosition: (
    instanceId: number,
    target: THREE.Vector3,
  ) => THREE.Vector3;
  onStart: (instanceId: number) => void;
  onMove: (
    instanceId: number,
    worldPosition: THREE.Vector3,
    worldVelocity: THREE.Vector3,
  ) => void;
  onEnd: (instanceId: number, worldVelocity: THREE.Vector3) => void;
}

export interface MathDynamicBoxCollider {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  clearAbove?: number;
  solidTop?: number;
  enabled?: boolean;
  intersectsHorizontal?: (
    x: number,
    z: number,
    radius: number,
  ) => boolean;
}

export interface MathDynamicJumpSurface {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  height: number;
  supportMargin?: number;
  debugResolution?: number;
  landingMessage?: string;
  enabled?: boolean;
  contains?: (x: number, z: number, margin: number) => boolean;
}

export interface MathTravelingBody {
  position: Readonly<THREE.Vector3>;
  radius: number;
  restingY: number;
  enabled: boolean;
  held: boolean;
  kind?: "asteroid" | "wisdom-orb";
}

export interface MathLooseBodySpec {
  object: THREE.Object3D;
  radius: number;
  restingY: number;
  gravity: boolean;
  boundaryRadius: number | null;
  friction: number;
  message: string;
  enabled?: boolean;
}

/**
 * Narrow handle over the host's shared kickable physics. Math exhibits can
 * launch and observe a loose prop without importing PortfolioGame or its
 * world-owned Kickable record across the lazy-loading boundary.
 */
export interface MathLooseBodyHandle {
  readonly velocity: THREE.Vector3;
  enabled: boolean;
  radius: number;
  restingY: number;
  readonly held: boolean;
  dispose: () => void;
}

export interface MathCameraFrameSpec {
  focus: Readonly<THREE.Vector3>;
  zoom: number;
  duration: number;
}

export interface MightymaticaZoneContext {
  root: THREE.Group;
  quality: MathQualityTier;
  reducedMotion: boolean;
  rematerializeOnArrival: boolean;
  addStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
  ) => () => void;
  addJumpSurface: (
    id: string,
    x: number,
    z: number,
    halfWidth: number,
    halfDepth: number,
    height: number,
    landingMessage?: string,
    onLand?: () => void,
  ) => void;
  addWalkSurface: (
    id: string,
    x: number,
    z: number,
    halfWidth: number,
    halfDepth: number,
    height: number,
  ) => void;
  registerDynamicBox: (
    collider: MathDynamicBoxCollider,
  ) => () => void;
  registerDynamicJumpSurface: (
    surface: MathDynamicJumpSurface,
  ) => () => void;
  refreshCollisionDebug: () => void;
  addInteraction: (interaction: MathInteractionSpec) => void;
  updateInteractionLabel: (id: string, label: string) => void;
  registerPointerAction: (
    object: THREE.Object3D,
    action: () => void | Promise<void>,
    maximumDistance?: number,
    isAvailable?: () => boolean,
  ) => void;
  registerInstanceDrag: (spec: MathInstanceDragSpec) => void;
  registerLooseBody: (spec: MathLooseBodySpec) => MathLooseBodyHandle;
  copyPlayerPosition: (target: THREE.Vector3) => THREE.Vector3;
  /**
   * Applies a small world-space displacement through the host's normal bounds
   * and collision resolution. Reserved for exhibit-authored environmental
   * forces rather than ordinary player locomotion.
   */
  applyPlayerDrift: (x: number, z: number) => void;
  getPlayerFeetHeight: () => number;
  getTravelingBody: () => MathTravelingBody | null;
  registerPlayerOccluder: (object: THREE.Object3D) => void;
  performReachGesture: (target: THREE.Object3D, jump?: boolean) => void;
  requestCameraFrame: (spec: MathCameraFrameSpec) => () => void;
  registerReturnAperture: (
    x: number,
    z: number,
    core: THREE.Object3D,
    label: string,
  ) => void;
  onStatus: (message: string, options?: MathWorldStatusOptions) => void;
}

export interface MightymaticaZoneRuntime {
  update: (delta: number, elapsed: number) => void;
  setQuality: (quality: MathQualityTier) => void;
  reactToSpell: (stage: MathSpellStage, charge: number) => void;
  hasActiveMotion: () => boolean;
  forEachDynamicObject: (visitor: (object: THREE.Object3D) => void) => void;
  dispose: () => void;
}
