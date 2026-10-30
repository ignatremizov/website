import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AmbientGrid } from "./AmbientGrid";
import {
  canGuidedJump,
  ClickNavigationMarker,
  collectClickNavigationBlockers,
  findGuidedJumpDelay,
  isClickNavigationPassThrough,
  isContinuousClickNavigationGesture,
  isClickNavigationDragGesture,
  playerJumpLaunchVelocity,
  shouldCommitOneShotClickNavigation,
} from "./ClickNavigation";
import { jumpDisplacement, jumpVelocityAfter } from "./JumpMotion";
import { PerformanceMonitor, performanceFlags as perfFlags, type PerformanceCaptureStatus } from "./PerformanceMonitor";
import { CubeRematerialization } from "./CubeRematerialization";
import {
  findNearbyClickLanding, clampClickLandingToBounds, findWallClickSurface, findWallClickLanding,
} from "./ClickNavigationTarget";
import {
  createFieldDesirePathGeometry,
  fieldMapTablePosition,
} from "./FieldDesirePaths";
import {
  FramePacer,
  FrameTimingWindow,
  selectTargetFrameRate,
} from "./FrameTiming";
import {
  InputController,
  type MovementAxes,
} from "./InputController";
import type { Kickable } from "./Kickable";
import { canPlaceHeldBody, loosePropIntersectsSolid, resolveHeldBodyTarget, resolvePropRise } from "./LoosePropCollision";
import {
  findGuidedWalkingRoute,
  hasWalkingClearance,
  selectWalkSupportHeight, type WalkPoint,
} from "./GuidedWalkingRoute";
import {
  navigationSupportPoints, type NavigationPlanningContext,
} from "./NavigationPlanning";
import { NavigationController, type ClickNavigationTarget, type NavigationFrame } from "./NavigationController";
import { createWalkingGridHints } from "./WalkingGrid";
import { clampWorldPoint, insideWorldBounds, worldBoundaryInset } from "./WorldBounds";
import { createWorldEdge } from "./WorldEdge";
import { hasGuidedDropClearance } from "./DropNavigation";
import { NavigationRouteGraph } from "./NavigationRouteGraph";
import { OrderedSpatialIndex } from "./OrderedSpatialIndex";
import { NavigationDebug } from "./NavigationDebug";
import { VisibleOccluders } from "./VisibleOccluders";
import { accelerateStaticBatchRaycast } from "./StaticBatchRaycast";
import { PencilTeleportRitual } from "./PencilTeleportRitual";
import {
  PortalNetwork,
  type PortalHandle,
} from "./PortalNetwork";
import {
  sampleIgnitionPanic,
  type IgnitionPanicFrame,
} from "./PlayerIgnitionPanic";
import { RuneAltar } from "./RuneAltar";
import {
  archiveAtlasPosition,
  ArchiveOrbitPlayground,
} from "./zones/archive/ArchiveOrbitPlayground";
import { ArchiveSignalPuzzle } from "./zones/archive/ArchiveSignalPuzzle";
import { VoidTurtleRide } from "./zones/field/VoidTurtleRide";
import {
  FallsRuneRitual,
  type FallsFishBaitShard,
} from "./zones/falls/FallsRuneRitual";
import { FallsFireflyField } from "./zones/falls/FallsFireflyField";
import { FallsWaterfallMist } from "./zones/falls/FallsWaterfallMist";
import { FallsCrystalFrog } from "./zones/falls/FallsCrystalFrog";
import { frogClearanceRadius } from "./zones/falls/FallsCrystalFrogRoute";
import { fallsNavigationRoutes } from "./zones/falls/FallsNavigationRoutes";
import {
  fallsFoundationRadius,
  fallsLandmarks,
  getFallsTerraceHeight,
  isInsideFallsPool,
  isWadingInFallsPool,
} from "./zones/falls/FallsLayout";
import { addFallsCoveWater, buildFallsTerrain } from "./zones/falls/FallsTerrain";
import {
  addWaterfallCaveLining,
  addWaterfallOutcroppings,
  createLayeredCliffGeometry,
  createWaterfallSheetGeometry,
  shadeFallsStoneGeometry,
} from "./zones/falls/FallsScenery";
import { GridFloorTraffic } from "./zones/grid/GridFloorTraffic";
import { GridServerPatchPuzzle } from "./zones/grid/GridServerPatchPuzzle";
import { HanoiPuzzle } from "./zones/grid/HanoiPuzzle";
import {
  PongChallenge,
  type PongRoguePacketLease,
  type PongVictoryResolution,
} from "./zones/grid/PongChallenge";
import {
  SpellChargeEffect,
  type SpellChargeEffectFrame,
} from "./SpellChargeEffect";
import {
  isWithinWalkingStep,
  selectDescendingLandingSurface,
  selectPropLandingSurface,
  selectSupportedSurfaces,
  selectWalkingStepSurface,
  surfaceOverlapsCircle,
  type SurfaceArea,
  type SurfaceSelection,
  type SurfaceSelectionFrame,
} from "./SurfaceSelection";
import { advanceHeldPropDepth, projectHeldProp } from "./DragSurfaceProjection";
import { TerminalTraversalEffect } from "./TerminalTraversalEffect";
import {
  WorldCollapseSequence,
  type WorldCollapseFrame,
} from "./WorldCollapseSequence";
import {
  executeWorldAction,
  type WorldAction,
} from "./WorldAction";
import { createAvatar, type AvatarRig } from "./createAvatar";
import {
  createFallsRiverRibbonGeometry,
  createFallsRiverSpillGeometry,
  fallsRiverCurve,
  isInsideFallsRiver,
} from "./fallsRiver";
import {
  createArchiveConsoleDisplayTexture,
  createArchiveFloorTexture,
  createFallsCliffTexture,
  createFallsGroundReliefTexture,
  createFallsGroundTexture,
  createFallsWaterTexture,
  createFieldAtlasTexture,
  createFieldCanvasTexture,
  createFieldDesirePathTexture,
  createFieldFoundationTexture,
  createFieldGroundReliefTexture,
  createFieldGroundTexture,
  createFieldShelfTexture,
  createFieldWoodTexture,
  createGridCircuitTexture,
} from "./proceduralTextures";
import { addBox, addCylinder } from "./scenePrimitives";
import { disposeObjectTree } from "./sceneResources";
import type {
  MathInstanceDragSpec,
  MightymaticaZoneRuntime,
} from "./math/types";
import {
  spellRank,
  zoneLabels,
  type QualityTier,
  type SpellStage,
  type WorldProgressState,
  type WorldStatusOptions,
  type ZoneId,
} from "../world/WorldContracts";

export { resolveZone } from "../world/WorldContracts";
export type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
  ZoneId,
} from "../world/WorldContracts";

type WorldCollapseStatusOptions = Omit<WorldStatusOptions, "channel">;

const worldCollapseFarewells: Readonly<
  Record<
    ZoneId,
    {
      message: string;
      options?: WorldCollapseStatusOptions;
    }
  >
> = {
  field: {
    message:
      "The void turtle spreads all four fins against the dark. Its little moons tighten their orbit and refuse the first pull.",
  },
  falls: {
    message:
      "So. The unseen Hand closes at last. Guard thine ember, wanderer. The dark hath learned many names, yet never thine.",
    options: { kind: "speech", speaker: "Archivist" },
  },
  grid: {
    message:
      "An unauthorized final protocol. Magnificent. Mine hand predicts no road beyond it, and therefore I shall call the road a lie.",
    options: { kind: "speech", speaker: "Daemon Controller" },
  },
  archive: {
    message:
      "OBSERVABILITY: traces curve inward; log retention approaches zero; the final signal has no return address.",
  },
  math: {
    message:
      "A singular solution. I had rather hoped thou wouldst show the working.",
    options: { kind: "speech", speaker: "Pythagoras" },
  },
};

export interface GameMetrics {
  fps: number;
  p95FrameMs: number;
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
}

export type PortfolioRevealSource = "standard" | "monument";

export interface ZoneMilestoneProgress {
  unlocked: number;
  total: number;
}

export interface GameHooks {
  onZoneChange: (zone: ZoneId, label: string) => void;
  onInteractionChange: (label: string | null) => void;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  onMetrics: (metrics: GameMetrics) => void;
  onTransition: (active: boolean) => void;
  onRequestMap: () => void;
  onRequestTerminal: () => void;
  onPreparePortfolio: (source?: PortfolioRevealSource) => void;
  onRequestPortfolio: (source?: PortfolioRevealSource) => void;
  onQualityChange: (quality: QualityTier) => void;
  onPongChange: (active: boolean, playerScore: number, daemonScore: number) => void;
  onSpellChange: (stage: SpellStage, packetInterferenceUnlocked: boolean) => void;
  onProgressChange: (progress: WorldProgressState) => void;
  onSpellCharge: (charge: number, charging: boolean) => void;
  onLanternChange: (active: boolean) => void;
  onCompassChange: (owned: boolean, heading: string) => void;
  onTurtleMediaChange: (active: boolean) => void;
  isZoneDiscovered: (zone: ZoneId) => boolean;
  hasAchievement: (title: string) => boolean;
  getZoneMilestoneProgress: (zone: ZoneId) => ZoneMilestoneProgress;
  initialProgress: WorldProgressState;
}

interface Interaction {
  id: string;
  label: string;
  position: THREE.Vector3;
  radius: number;
  action: () => void | Promise<void>;
  requiresLantern: boolean;
  maximumPlayerElevation: number;
  isAvailable?: () => boolean;
}

interface PointerAction {
  object: THREE.Object3D;
  action: () => void | Promise<void>;
  maximumDistance: number;
  isAvailable?: () => boolean;
}

interface MathInstanceDragHit {
  spec: MathInstanceDragSpec;
  instanceId: number;
  point: THREE.Vector3;
  distance: number;
}

interface KickablePointerHit {
  kickable: Kickable;
  distance: number;
}

interface MathInstanceDragHold {
  spec: MathInstanceDragSpec;
  instanceId: number;
  pointerId: number;
  plane: THREE.Plane;
  point: THREE.Vector3;
  currentWorldPosition: THREE.Vector3;
  previousWorldPosition: THREE.Vector3;
  grabOffset: THREE.Vector3;
  velocity: THREE.Vector3;
  previousTime: number;
}

interface AnimatedItem {
  object: THREE.Object3D;
  originY: number;
  phase: number;
  amplitude: number;
  rotationSpeed: number;
  rotationAxis?: "x" | "y" | "z";
  texture?: THREE.Texture;
  textureVelocity?: readonly [x: number, y: number];
}

interface FallsVisualMaterials {
  ground: THREE.MeshStandardMaterial;
  groundDark: THREE.MeshStandardMaterial;
  cliff: THREE.MeshStandardMaterial;
  cliffDark: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  wetRock: THREE.MeshStandardMaterial;
  water: THREE.MeshBasicMaterial;
  foam: THREE.ShaderMaterial;
  flowTexture: THREE.CanvasTexture;
}

interface ZoneBoundsCircle {
  kind: "circle";
  radius: number;
}

interface ZoneBoundsSquare {
  kind: "square";
  halfWidth: number;
  halfDepth: number;
}

type ZoneBounds = ZoneBoundsCircle | ZoneBoundsSquare;

interface StaticCollider {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
  /** Runtime-owned props can temporarily leave collision without re-registering. */
  enabled?: boolean;
  /** Optional exact footprint test used after the cheap axis-aligned bounds. */
  intersectsHorizontal?: (
    x: number,
    z: number,
    radius: number,
  ) => boolean;
  /**
   * An ascending player's feet may cross the collider laterally at this
   * height. Some climbable composites use a forgiving threshold below their
   * rendered crown, so this is deliberately not the solid's physical top.
   */
  clearAbove?: number;
  /**
   * Finite upper boundary used to reject vertical penetration and draw the
   * collision lattice. Undefined colliders remain vertically unbounded.
   */
  solidTop?: number;
  /** Only authored small risers allow grounded step-up; other solids stay strict. */
  stepHeight?: number;
  /** False keeps a movement collider transparent to Archive optical rays. */
  blocksRay?: boolean;
}

interface MathCameraFrame {
  focus: THREE.Vector3;
  zoom: number;
  startedAt: number;
  expiresAt: number;
}

interface FieldRockClusterPart {
  rock: THREE.Mesh;
  originPosition: THREE.Vector3;
  originQuaternion: THREE.Quaternion;
  velocity: THREE.Vector2;
  verticalVelocity: number;
  fallen: boolean;
  repairStartPosition: THREE.Vector3;
  repairStartQuaternion: THREE.Quaternion;
  collider: StaticCollider;
  surface: SurfaceArea;
}

interface FieldRockClusterState {
  group: THREE.Group;
  origin: THREE.Vector2;
  velocity: THREE.Vector2;
  parts: FieldRockClusterPart[];
  contactRadius: number;
  fractured: boolean;
  fractureStrain: number;
  repairing: boolean;
  repairAge: number;
  repairDuration: number;
  verticalVelocity: number;
  fallen: boolean;
}

interface CompassPropState {
  kickable: Kickable;
  origin: THREE.Vector3;
  rotation: THREE.Euler;
  platform: SurfaceArea | null;
}

type PencilVariant = "amber" | "cyan";

interface PencilPropState {
  kickable: Kickable;
  variant: PencilVariant;
  interactionId: string;
  origin: THREE.Vector3;
  rotation: THREE.Euler;
  platform: SurfaceArea | null;
}

interface AttachmentEquipFlight {
  object: THREE.Object3D;
  age: number;
  duration: number;
  arcHeight: number;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  lateral: THREE.Vector3;
}

interface PencilEquipFlight extends AttachmentEquipFlight {
  variant: PencilVariant;
  announce: boolean;
}

interface CompassEquipFlight extends AttachmentEquipFlight {
  announce: boolean;
}

type AsteroidShadow = THREE.Mesh<
  THREE.CircleGeometry,
  THREE.MeshBasicMaterial
>;

interface TravelingAsteroidState {
  object: THREE.Group | null;
  shadow: AsteroidShadow | null;
  zone: ZoneId;
  arrivalFrom: ZoneId | null;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  size: number;
  needsArrivalPlacement: boolean;
  portalCooldownUntil: number;
}

interface AtlasAutopilotState {
  destination: ZoneId;
  nextZone: ZoneId;
  portal: PortalHandle;
  path: THREE.Vector3[];
  waypointIndex: number;
  previousDistance: number;
  stalledFor: number;
}

interface ClickNavigationPress {
  pointerId: number;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  startedAt: number;
  nextRetargetAt: number;
  moved: boolean;
  continuous: boolean;
  focusOnly: boolean;
  target: ClickNavigationTarget;
  /** Display-only latest pick; never aliases an accepted/planning destination. */
  visualTarget: ClickNavigationTarget | null;
}

interface LegacySimulationCubeState {
  capsule: THREE.Group;
  visualRoot: THREE.Group;
  shellMaterial: THREE.MeshStandardMaterial;
  frameMaterial: THREE.LineBasicMaterial;
  core: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  orbit: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  collider: StaticCollider | null;
  rematerialization: CubeRematerialization | null;
  portalRegistered: boolean;
  booting: boolean;
}

interface TelescopeRig {
  position: THREE.Vector3;
  pivot: THREE.Group;
  targetPitch: number;
  pitchVelocity: number;
  raised: boolean;
}

interface ArchiveDataGlassState {
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  topHeight: number;
  collisionHalfWidth: number;
  collisionHalfDepth: number;
}

interface LanternState {
  light: THREE.Mesh;
  pool: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  position: THREE.Vector3;
  litUntil: number;
  targetLightIntensity: number;
  targetLightDistance: number;
}

interface FieldLanternLightLease {
  light: THREE.PointLight;
  lantern: LanternState | null;
}

interface BreakableMonitor {
  crack: THREE.LineSegments;
  position: THREE.Vector3;
  broken: boolean;
}

interface DigitCloud {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  velocities: Float32Array;
  phases: Float32Array;
  count: number;
}

interface SprintDustTrail {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  remainingLife: Float32Array;
  lifetimes: Float32Array;
  phases: Float32Array;
  shades: Float32Array;
  maximumCount: number;
  activeCapacity: number;
  cursor: number;
  emissionRemainder: number;
  activeCount: number;
  randomState: number;
}

interface PlayerIgnitionEffect {
  heatShell: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  flames: THREE.InstancedMesh<
    THREE.ConeGeometry,
    THREE.MeshBasicMaterial
  >;
  flameDummy: THREE.Object3D;
  fireLight: THREE.PointLight;
  embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  emberPositions: Float32Array;
  emberVelocities: Float32Array;
  emberColors: Float32Array;
  emberRemainingLife: Float32Array;
  emberLifetimes: Float32Array;
  maximumEmberCount: number;
  activeEmberCapacity: number;
  emberCursor: number;
  emberEmissionRemainder: number;
  activeEmberCount: number;
  smoke: THREE.InstancedMesh<
    THREE.IcosahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  smokeDummy: THREE.Object3D;
  smokePositions: Float32Array;
  smokeVelocities: Float32Array;
  smokeRemainingLife: Float32Array;
  smokeLifetimes: Float32Array;
  maximumSmokeCount: number;
  activeSmokeCapacity: number;
  smokeCursor: number;
  smokeEmissionRemainder: number;
  activeSmokeCount: number;
  exposure: number;
  burnRemaining: number;
  smolderRemaining: number;
  panicAge: number;
  retriggerReady: boolean;
  panicTurnTarget: number;
  panicTurnVelocity: number;
  panicTurnTimer: number;
  warningIssued: boolean;
  randomState: number;
}

interface WaterSplashBurst {
  drops: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  dummy: THREE.Object3D;
  velocities: Float32Array;
  count: number;
  age: number;
  duration: number;
}

interface ServerRackState {
  bars: THREE.Mesh[];
  cap: THREE.Object3D;
  position: THREE.Vector3;
}

interface TentState {
  x: number;
  z: number;
  inside: boolean;
  surface: SurfaceArea;
  canopy: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  sleepPosition: THREE.Vector3;
  sleepFocus: THREE.Vector3;
  sleepHeading: number;
  resting: boolean;
  restBlend: number;
}

interface LanternReveal {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  range: number;
  /** Optional moving world-space anchor for a reveal nested under a loose prop. */
  position?: THREE.Vector3;
  isAvailable?: () => boolean;
}

interface WanderingNpc {
  group: THREE.Group;
  home: THREE.Vector3;
  feetHeight: number;
  returnPath: WalkPoint[] | null;
  returnWaypoint: number;
  nextReturnPlanAt: number;
  steeringHeading: number;
  detourSide: number;
  detourUntil: number;
  wanderPauseUntil: number;
  interactionId: string;
  crowdingSpeaker: string;
  crowdingQuips: readonly string[];
  crowdingQuipIndex: number;
  crowdingQuipCooldownUntil: number;
  crowdedFromAbove: boolean;
  signalCrystal: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  signalAura: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  speechHalo: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  speechAge: number;
  speechDuration: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  angle: number;
}

interface FlyingFishMagicRecall {
  schoolIndex: number;
  target: THREE.Vector3;
  origins: THREE.Vector3[];
  waterTargets: THREE.Vector3[];
  color: THREE.Color;
  age: number;
  duration: number;
}

interface FishSchool {
  mesh: THREE.InstancedMesh;
  aura: THREE.InstancedMesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  magicPoints: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  magicPositions: Float32Array;
  magicColors: Float32Array;
  magicRecalls: FlyingFishMagicRecall[];
  dummy: THREE.Object3D;
  positions: THREE.Vector3[];
  maximumCount: number;
  waterCount: number;
  flyingCount: number;
  flightAges: Float32Array;
  spellSwarmCenter: THREE.Vector3;
  spellSwarmAge: number;
  spellSwarmDuration: number;
  spellSwarmRadius: number;
  spellSwarmStrength: number;
}

const riverFishCount = 10;
const flyingFishPerShard = 5;
const maximumFlyingFishSchools = 6;
const fishMagicParticlesPerFish = 4;
const maximumFishMagicParticleCount =
  flyingFishPerShard *
  maximumFlyingFishSchools *
  fishMagicParticlesPerFish;
const maximumFishCount =
  riverFishCount + flyingFishPerShard * maximumFlyingFishSchools;

const portalArrivalAnchors: Record<
  ZoneId,
  Partial<Record<ZoneId, { x: number; z: number }>>
> = {
  field: {
    falls: { x: -9.2, z: -6.8 },
    grid: { x: 10.6, z: -4.3 },
    archive: { x: 0, z: 10.3 },
  },
  falls: { field: { x: 0, z: 11.2 } },
  grid: {
    field: { x: 0, z: 10.4 },
    math: { x: -6, z: 1 },
  },
  archive: { field: { x: 0, z: 10.3 } },
  math: { grid: { x: 0, z: 14.45 } },
};

const palette = {
  sky: 0x03080a,
  stone: 0x1a2528,
  stoneWarm: 0x4f4437,
  moss: 0x34483a,
  mossDark: 0x17271f,
  parchment: 0xa6906d,
  teal: 0x0d555c,
  tealDark: 0x082e33,
  wood: 0x4a2d1d,
  brass: 0xb47a32,
  amber: 0xffa928,
  cyan: 0x55dce8,
  coral: 0xf06458,
  green: 0x86c77a,
  violet: 0x9e82ff,
  black: 0x080d10,
  water: 0x25aabd,
};

const npcCrowdingDialogue: Readonly<
  Record<string, { speaker: string; lines: readonly string[] }>
> = {
  archivist: {
    speaker: "Archivist",
    lines: [
      "Mind the marginalia. I am not a footnote.",
      "The record will omit that landing.",
    ],
  },
  keeper: {
    speaker: "Keeper",
    lines: [
      "I keep the old stones. I do not keep your boots.",
      "The river has better manners.",
    ],
  },
  tinkerer: {
    speaker: "Tinkerer",
    lines: [
      "Careful. Those boots are wildly out of calibration.",
      "That is not how one tests a plumbob.",
    ],
  },
  "daemon-controller": {
    speaker: "Daemon Controller",
    lines: [
      "Unauthorized vertical input.",
      "Collision rejected. Dignity packet lost.",
    ],
  },
};

const npcEscapeAngles = [0, 0.52, -0.52, 1.02, -1.02, 1.57, -1.57, 2.18, -2.18] as const;
const emptyDragSurfaces: readonly SurfaceArea[] = [];
const emptyNavigationPath: readonly THREE.Vector3[] = [];
const playerWalkingSpeed = 4.25;
const playerSprintingSpeed = 6.8;
const up = new THREE.Vector3(0, 1, 0);
const avatarPitchAxis = new THREE.Vector3(1, 0, 0);
const avatarLongAxis = new THREE.Vector3(0, 1, 0);
const portablePencilMountPosition = new THREE.Vector3(0, 0.03, 0);
const portablePencilMountQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.08, 0.34, Math.PI - 1.02),
);
const portablePencilMountScale = 1.18;
const fieldCompassMountPosition = new THREE.Vector3(0.065, 0, 0);
const fieldCompassMountQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, -0.16, -Math.PI / 2),
);
const fieldCompassMountScale = 0.96;
const playerOcclusionLayer = 3;
const playerRevealRenderLayer = 4;
const playerOcclusionSampleHeights = [1.95, 1.25, 0.55] as const;
// The avatar and near-field transparent assemblies share this late layer so
// ordinary depth testing, rather than render-pass order, resolves overlaps.
const playerRenderLayer = 5;
const pointerInteractionLayer = 6;
// Ground projections never belong in front of elevated transparent effects.
// Draw them first so an overlapping spell aura can composite over the decal
// while opaque planets and scenery continue to use normal depth occlusion.
const fieldHeartRadius = 1.58;
const fieldHeartChargeThreshold = 0.92;
const fieldRockFallRadius = 19.1;
const fieldEntrySpawn = [-6.4, 1.05, 4.25] as const;
const fieldEntryHeading = Math.PI;
const fieldAmbientGridLandingRegion = {
  zone: "field",
  kind: "circle",
  radius: 17.15,
  surfaceY: 0.16,
} as const;
const compassHeadings = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;
type CompassHeading = (typeof compassHeadings)[number];

function getCompassHeading(yaw: number): CompassHeading {
  // Avatar yaw 0 faces world +Z, while geographic north is world -Z.
  // Reflecting around the east/west axis also keeps clockwise turns clockwise.
  const northReferencedAngle = Math.PI - yaw;
  const normalized =
    ((northReferencedAngle % (Math.PI * 2)) + Math.PI * 2) %
    (Math.PI * 2);
  return (
    compassHeadings[
      Math.round(normalized / (Math.PI / 4)) % compassHeadings.length
    ] ?? "N"
  );
}

const heliographIgnitionDelay = 1.35;
const heliographBurnDuration = 5.8;
const heliographPanicRetriggerDelay = 0.52;
const inactiveIgnitionPanicAge = -1;
// Violet splits, amber amplifies, cyan aligns, and green feeds the carrier
// through observability before returning it to violet.
const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function createMaterials() {
  const standard = (
    color: THREE.ColorRepresentation,
    roughness = 0.82,
    metalness = 0.02,
  ): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const emissive = (
    color: THREE.ColorRepresentation,
    intensity = 1.6,
    opacity = 1,
  ): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity: Math.min(1, opacity * (0.88 + intensity * 0.08)),
      side: THREE.DoubleSide,
    });

  const radialDecal = (
    name: string,
    color: THREE.ColorRepresentation,
    opacity: number,
    blending: THREE.Blending,
  ): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      name,
      uniforms: {
        color: { value: new THREE.Color(color) },
        opacity: { value: opacity },
      },
      vertexShader: `
        varying vec2 radialUv;

        void main() {
          radialUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        varying vec2 radialUv;

        void main() {
          float radius = length((radialUv - 0.5) * 2.0);
          float feather = 1.0 - smoothstep(0.08, 1.0, radius);
          float alpha = pow(max(0.0, feather), 1.65) * opacity;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });

  return {
    ground: standard(palette.stone, 0.95),
    stone: standard(palette.stoneWarm, 0.93),
    darkStone: standard(palette.stone, 0.93),
    gridFloor: new THREE.MeshStandardMaterial({
      color: 0x294044,
      emissive: 0x081719,
      emissiveIntensity: 0.68,
      roughness: 0.94,
      metalness: 0.02,
    }),
    moss: standard(palette.moss, 0.96),
    mossDark: standard(palette.mossDark, 0.98),
    parchment: standard(palette.parchment, 0.88),
    teal: standard(palette.teal, 0.82),
    tealDark: standard(palette.tealDark, 0.9),
    wood: standard(palette.wood, 0.92),
    brass: standard(palette.brass, 0.44, 0.58),
    black: standard(palette.black, 0.86, 0.15),
    cyan: emissive(palette.cyan, 1.75),
    cyanSoft: emissive(palette.cyan, 1.35, 0.78),
    coral: emissive(palette.coral, 1.65),
    amber: emissive(palette.amber, 1.8),
    amberSoft: emissive(palette.amber, 1.4, 0.76),
    green: emissive(palette.green, 1.45),
    violet: emissive(palette.violet, 1.55),
    water: emissive(palette.water, 1.05, 0.66),
    portalGlyph: new THREE.MeshBasicMaterial({
      color: palette.parchment,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    softShadow: radialDecal(
      "soft-world-contact-shadow",
      0x020504,
      0.2,
      THREE.NormalBlending,
    ),
    warmLightPool: radialDecal(
      "field-lantern-warm-light-pool",
      0xff9b36,
      0,
      THREE.AdditiveBlending,
    ),
    npc: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.02,
    }),
    signalLine: new THREE.LineBasicMaterial({
      color: palette.cyan,
      transparent: true,
      opacity: 0.95,
    }),
    marketLine: new THREE.LineBasicMaterial({
      color: palette.amber,
      transparent: true,
      opacity: 0.95,
    }),
  };
}

type Materials = ReturnType<typeof createMaterials>;
type MightymaticaModule = typeof import("./math/MightymaticaZone");

export class PortfolioGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly hooks: GameHooks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 160);
  private topDownDebugEnabled = false;
  private readonly input = new InputController();
  private readonly materials: Materials = createMaterials();
  private readonly sharedMaterials = new Set<THREE.Material>(Object.values(this.materials));
  private readonly cameraFocus = new THREE.Vector3();
  private readonly explorationCameraOffset = new THREE.Vector3(11.5, 14.5, 11.5);
  private readonly cameraOffset = new THREE.Vector3(11.5, 14.5, 11.5);
  private readonly cameraTargetOffset = new THREE.Vector3();
  private readonly cameraTargetFocus = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();
  private readonly cameraRight = new THREE.Vector3();
  private mathCameraFrame: MathCameraFrame | null = null;
  private readonly movement = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  private readonly animatedItems: AnimatedItem[] = [];
  private readonly staticColliders: StaticCollider[] = [];
  private readonly interactions: Interaction[] = [];
  private readonly surfaceAreas: SurfaceArea[] = [];
  private readonly surfaceSelection: SurfaceSelection = {
    active: null,
    landing: null,
    grounded: null,
  };
  private readonly surfaceSelectionFrame: SurfaceSelectionFrame = {
    activeSurface: null,
    x: 0,
    z: 0,
    previousX: 0,
    previousZ: 0,
    feetHeight: 0,
    previousFeetHeight: 0,
    descending: false,
    grounded: false,
  };
  private readonly supportsSurface = (
    surface: SurfaceArea,
    x: number,
    z: number,
  ): boolean => this.isWithinSurfaceSupport(surface, x, z);
  private readonly containsPropSurface = (
    surface: SurfaceArea,
    x: number,
    z: number,
    radius = 0,
  ): boolean =>
    surface.id !== "void-turtle-shell" &&
    (radius > 0 ? surfaceOverlapsCircle(surface, x, z, radius)
      : this.surfaceContainsPoint(surface, x, z));
  private readonly supportsFrogBody = (
    surface: SurfaceArea, x: number, z: number,
  ): boolean => surfaceOverlapsCircle(surface, x, z, frogClearanceRadius);
  private readonly fieldRockClusters: FieldRockClusterState[] = [];
  private lastFieldRockDebugRefresh = 0;
  private readonly kickables: Kickable[] = [];
  private readonly telescopeRigs: TelescopeRig[] = [];
  private readonly lanterns: LanternState[] = [];
  private readonly fieldLanternLightLeases: FieldLanternLightLease[] = [];
  private readonly lanternReveals: LanternReveal[] = [];
  private readonly digitClouds: DigitCloud[] = [];
  private readonly serverRacks: ServerRackState[] = [];
  private readonly wanderingNpcs: WanderingNpc[] = [];
  private readonly playerPosition = new THREE.Vector3(...fieldEntrySpawn);
  private readonly playerRadius = 0.4;
  private readonly playerCollisionHeight = 2.3;
  private readonly staticColliderIndex =
    new OrderedSpatialIndex<StaticCollider>();
  private readonly surfaceAreaIndex = new OrderedSpatialIndex<SurfaceArea>(
    4,
    (surface) => {
      const defaultMargin = surface.requiresJump
        ? this.playerRadius * 0.34
        : 0;
      return Math.max(
        surface.supportMargin ?? defaultMargin,
        surface.edgeGrace ?? defaultMargin,
      );
    },
  );
  private readonly staticColliderCandidates: StaticCollider[] = [];
  private readonly surfaceAreaCandidates: SurfaceArea[] = [];
  private readonly tempWorld = new THREE.Vector3();
  private readonly ambientGridDragTarget = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly mathTravelingBody = {
    position: new THREE.Vector3(),
    radius: 0,
    restingY: 0,
    enabled: false,
    held: false,
    kind: "asteroid" as const,
  };
  private readonly tempBounds = new THREE.Box3();
  private readonly pointer = new THREE.Vector2();
  private readonly pointerRaycaster = new THREE.Raycaster();
  private pointerPickFrameActive = false;
  private pointerPickRayPrepared = false;
  private pointerPickClientX = 0;
  private pointerPickClientY = 0;
  private pendingPointerHover: PointerEvent | null = null;
  private hoverPointerActiveUntil = 0;
  private readonly pointerActionHits: THREE.Intersection[] = [];
  private readonly kickablePickHits: THREE.Intersection[] = [];
  private readonly pointerActions: PointerAction[] = [];
  private readonly clickNavigationVisualHits: THREE.Intersection[] = [];
  private readonly clickNavigationVisualBlockers: THREE.Mesh[] = [];
  private readonly clickNavigationPlane = new THREE.Plane(up);
  private readonly clickNavigationPoint = new THREE.Vector3();
  private readonly clickNavigationMarkerPosition = new THREE.Vector3();
  private readonly mathInstanceDragHits: THREE.Intersection[] = [];
  private readonly mathInstanceDrags: MathInstanceDragSpec[] = [];
  private mathInstanceDragHold: MathInstanceDragHold | null = null;
  private pointerActionReachTarget: THREE.Object3D | null = null;
  private pointerActionReachUntil = 0;
  private readonly playerOcclusionRaycaster = new THREE.Raycaster();
  private readonly playerOcclusionTarget = new THREE.Vector3();
  private readonly playerOcclusionDirection = new THREE.Vector3();
  private readonly playerOccluders = new VisibleOccluders();
  private readonly collisionDebugGroup = new THREE.Group();
  private readonly collisionDebugBlockerMaterial =
    new THREE.LineBasicMaterial({
      color: 0xff6078,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  private readonly collisionDebugSurfaceMaterial =
    new THREE.LineBasicMaterial({
      color: 0x55f3ff,
      transparent: true,
      opacity: 0.94,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  private readonly telekinesisPlane = new THREE.Plane(up);
  private readonly telekinesisPoint = new THREE.Vector3();
  private readonly telekinesisPreviousPoint = new THREE.Vector3();
  private readonly telekinesisGripOffset = new THREE.Vector3();
  private readonly telekinesisPreviousRay = new THREE.Ray();
  private readonly telekinesisPointerMotion = new THREE.Vector3();
  private readonly telekinesisBodyFeet = new THREE.Vector3();
  private telekinesisDragHeight = 0;
  private telekinesisFixedBody = false;
  private telekinesisBodyBottom = 0;
  private telekinesisBodyHeight = 0;
  private telekinesisBodyRadius = 0;
  private telekinesisProjectedSurface: SurfaceArea | null = null;
  private readonly pencilRepairRay = new THREE.Ray();
  private readonly pencilRepairRayOrigin = new THREE.Vector3();
  private readonly pencilRepairDirection = new THREE.Vector3();

  private renderer!: THREE.WebGLRenderer;
  private clickNavigationMarker: ClickNavigationMarker | null = null;
  private clickNavigationHover: ClickNavigationTarget | null = null;
  private clickNavigationPress: ClickNavigationPress | null = null;
  private readonly navigation: NavigationController;
  private navigationFrame: NavigationFrame | null = null;
  private readonly clickNavigationSnapObstacles: StaticCollider[] = [];
  private navigationDebug: NavigationDebug | null = null;
  private readonly navigationDebugFeet = new THREE.Vector3();
  private readonly navigationDebugJump = {
    from: new THREE.Vector3(), to: new THREE.Vector3(), landingIndex: 0,
  };
  private readonly navigationDebugTarget = {
    position: new THREE.Vector3(), unreachable: false,
  };
  private walkingGeometryRevision = 0;
  private fallsNavigationGraph: {
    revision: number;
    graph: NavigationRouteGraph;
  } | null = null;
  private clickNavigationPointerInside = false;
  private clickNavigationPointerClientX = 0;
  private clickNavigationPointerClientY = 0;
  private clickNavigationHoverProjectionDirty = false;
  private clickNavigationHoverProjectionCaptured = false;
  private readonly clickNavigationHoverCameraWorldMatrix =
    new THREE.Matrix4();
  private readonly clickNavigationHoverProjectionMatrix =
    new THREE.Matrix4();
  private readonly clickNavigationHoverPlayerPosition =
    new THREE.Vector3();
  private clickNavigationHoverFeetHeight = 0;
  private ambientGrid: AmbientGrid | null = null;
  private player!: AvatarRig;
  private playerShadow!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private sprintDustTrail: SprintDustTrail | null = null;
  private playerIgnition: PlayerIgnitionEffect | null = null;
  private teleportRitual!: PencilTeleportRitual;
  private terminalTraversal!: TerminalTraversalEffect;
  private spellChargeEffect!: SpellChargeEffect;
  private playerOcclusionOutlineMaterial!: THREE.ShaderMaterial;
  private readonly playerOcclusionOutlines: THREE.Mesh[] = [];
  private playerOcclusionActive = false;
  private spellRing!: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private thunderBolts!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private thunderLight!: THREE.PointLight;
  private lanternLight!: THREE.PointLight;
  private lanternAura!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private zoneGroup = new THREE.Group();
  private decorativeGroup = new THREE.Group();
  private hemisphere!: THREE.HemisphereLight;
  private sunlight!: THREE.DirectionalLight;
  private ambientFill!: THREE.AmbientLight;
  private activeInteraction: Interaction | null = null;
  private splashRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  private splashBurst: WaterSplashBurst | null = null;
  private splashAge = 2;
  private splashDuration = 0.8;
  private splashMagnitude = 1;
  private playerInWater = false;
  private hasSplashed = false;
  private airbornePeakHeight = 0;
  private fallsDiveFromCrown = false;
  private readonly collisionSafeLanding: {
    valid: boolean;
    x: number;
    z: number;
    height: number;
    surface: SurfaceArea | null;
  } = { valid: false, x: 0, z: 0, height: 0, surface: null };
  private waterfallRecoveryAge = -1;
  private readonly waterfallRecoveryDuration = 2.3;
  private surfaceOffset = 0;
  private shadowSurfaceY = 0.16;
  private shadowVerticalDistance = 0;
  private activePlatform: SurfaceArea | null = null;
  private tentState: TentState | null = null;
  private compassProp: CompassPropState | null = null;
  private wornCompass: THREE.Object3D | null = null;
  private compassEquipFlight: CompassEquipFlight | null = null;
  private readonly pencilProps: PencilPropState[] = [];
  private wornPencil: THREE.Object3D | null = null;
  private portablePencilVariant: PencilVariant | null = null;
  private pencilEquipFlight: PencilEquipFlight | null = null;
  private readonly attachmentEquipTargetPosition = new THREE.Vector3();
  private readonly attachmentEquipTargetQuaternion = new THREE.Quaternion();
  private readonly attachmentEquipMountQuaternion = new THREE.Quaternion();
  private readonly attachmentEquipTargetScale = new THREE.Vector3();
  private pencilUnlocked = false;
  private pencilOwned = false;
  private fishSchool: FishSchool | null = null;
  private readonly fallsFlyingFishSchoolColors: number[] = [];
  private fishBaitShard: FallsFishBaitShard | null = null;
  private fishBaitFishIndex = -1;
  private fallsFishFeastAnnounced = false;
  private readonly voidTurtleRide: VoidTurtleRide;
  private readonly hanoiPuzzle: HanoiPuzzle;
  private readonly pongChallenge: PongChallenge;
  private readonly gridFloorTraffic = new GridFloorTraffic();
  private readonly gridServerPatchPuzzle: GridServerPatchPuzzle;
  private readonly archiveOrbitPlayground: ArchiveOrbitPlayground;
  private readonly archiveSignalPuzzle: ArchiveSignalPuzzle;
  private readonly fallsRuneRitual: FallsRuneRitual;
  private readonly fallsFireflyField = new FallsFireflyField();
  private readonly fallsWaterfallMist = new FallsWaterfallMist();
  private readonly fallsCrystalFrog = new FallsCrystalFrog({
    readPlayerFeet: (out) => {
      if (this.currentZone !== "falls" || this.worldCollapse !== null) return false;
      out.x = this.playerPosition.x;
      out.y = this.surfaceOffset + this.jumpHeight;
      out.z = this.playerPosition.z;
      return true;
    },
    isHopClear: (...args) => this.isFallsFrogHopClear(...args),
    floorHeight: (x, z) => this.getFallsFrogFloorHeight(x, z),
    shadowHeight: (x, y, z) => this.getFallsFrogShadowHeight(x, y, z),
    onWaterLanding: (x, y, z) => {
      const pool = isWadingInFallsPool(x, z, y);
      if (pool || (y < 0.05 && isInsideFallsRiver(x, z))) {
        // Creature splashes never award the player's dive or river milestone.
        this.triggerWaterSplashBurst(x, z, pool ? fallsLandmarks.basin.water : 0.205, 0.32);
      }
    },
  });
  private fallsCrystalFrogRoot: THREE.Group | null = null;
  private readonly portalNetwork: PortalNetwork;
  private pongRoguePacketLease: PongRoguePacketLease | null = null;
  private archiveDataGlass: ArchiveDataGlassState | null = null;
  private archiveAsteroid: Kickable | null = null;
  private archiveAsteroidShadow: AsteroidShadow | null = null;
  private travelingAsteroid: TravelingAsteroidState | null = null;
  private archiveMonitorTarget: BreakableMonitor | null = null;
  private archivePinballChallengeComplete = false;
  private pongChallengeComplete = false;
  private cleanPongVictoryComplete = false;
  private mightymaticaModule: MightymaticaModule | null = null;
  private mightymaticaModulePromise: Promise<MightymaticaModule> | null = null;
  private mightymaticaZone: MightymaticaZoneRuntime | null = null;
  private legacySimulationCube: LegacySimulationCubeState | null = null;
  private mathCubeBooted = false;
  private currentZone: ZoneId = "field";
  private bounds: ZoneBounds = { kind: "circle", radius: 18 };
  private spawn = new THREE.Vector3(...fieldEntrySpawn);
  private quality: QualityTier = "medium";
  private initializationStarted = false;
  private initializationComplete = false;
  private listenersConnected = false;
  private running = false;
  private disposed = false;
  private documentVisible = !document.hidden;
  private windowFocused = document.hasFocus();
  private windowFocusRecoveredAt = Number.NEGATIVE_INFINITY;
  private externalInputEnabled = true;
  private transitioning = false;
  private preferReducedMotion = false;
  private noclip = false;
  private collisionDebugEnabled = false;
  private speedMultiplier = 1;
  private elapsed = 0;
  private previousFrame = performance.now();
  private readonly framePacer = new FramePacer();
  private readonly frameTimingWindow = new FrameTimingWindow();
  private performanceMonitor: PerformanceMonitor | null = null;
  private smoothedRotation = Math.PI;
  private jumpHeight = 0;
  private jumpVelocity = 0;
  private spellAge = 2;
  private spellCooldown = 0;
  private spellCharging = false;
  private spellCharge = 0;
  private spellCastCharge = 0;
  private spellCastSequence = 0;
  private highestSpellStage: SpellStage = "spark";
  private spellStage: SpellStage = "spark";
  private activeSpellStage: SpellStage = "spark";
  private readonly spellChargeEffectFrame: SpellChargeEffectFrame = {
    charging: false,
    charge: 0,
    castAge: 2,
    castCharge: 0,
    stage: "spark",
    packetInterferenceUnlocked: false,
    elapsed: 0,
    reducedMotion: false,
    quality: "medium",
  };
  private packetInterferenceUnlocked = false;
  private readonly ignitionPanicFrame: IgnitionPanicFrame = {
    active: false,
    phase: "idle",
    movementSpeed: 0,
    headingOffset: 0,
    proneBlend: 0,
    rollAngle: 0,
    flailStrength: 0,
    flameStrength: 0,
    smokeStrength: 0,
  };
  private ignitionPanicHeading = 0;
  private readonly ignitionSteering = new THREE.Vector3();
  private readonly ignitionYawQuaternion = new THREE.Quaternion();
  private readonly ignitionPitchQuaternion = new THREE.Quaternion();
  private readonly ignitionRollQuaternion = new THREE.Quaternion();
  private digitStormAge = 3;
  private digitStormDuration = 1;
  private digitStormGroundY = 0.2;
  private thunderAge = 2;
  private serverFlickerAge = 3;
  private serverFlickerDuration = 0;
  private serverFlickerStage: SpellStage = "spark";
  private lanternEnabled = false;
  private lanternBlend = 0;
  private runeAltar: RuneAltar | null = null;
  private compassOwned = false;
  private compassHeading: CompassHeading = "N";
  private heldKickable: Kickable | null = null;
  private telekinesisPlacementSurface: SurfaceArea | null = null;
  private telekinesisPointerId: number | null = null;
  private telekinesisPreviousTime = 0;
  private telekinesisPlacementSettledFor = 0;
  private telekinesisStartClientX = 0;
  private telekinesisStartClientY = 0;
  private telekinesisPointerClientX = 0;
  private telekinesisPointerClientY = 0;
  private telekinesisMoved = false;
  private telekinesisPencilWasWorn = false;
  private lastGridPencilReaction = -10;
  private atlasAutopilot: AtlasAutopilotState | null = null;
  private worldCollapse: WorldCollapseSequence | null = null;
  private worldCollapseFrame: WorldCollapseFrame | null = null;
  private worldCollapsePromise: Promise<ZoneId> | null = null;
  private worldCollapseResolve: ((zone: ZoneId) => void) | null = null;
  private worldCollapseReject: ((reason?: unknown) => void) | null = null;
  private worldCollapseCollisionReleased = false;
  private worldCollapseFarewellSent = false;
  private worldCollapseAchievementSent = false;
  private worldCollapseBlackoutStarted = false;
  private readonly worldCollapsePlayerScale = new THREE.Vector3(1, 1, 1);

  private get reduceMotion(): boolean {
    return this.preferReducedMotion || this.reducedMotionQuery.matches;
  }

  constructor(canvas: HTMLCanvasElement, hooks: GameHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    // Bind once so listener teardown retains the same function identity.
    this.handleTelekinesisDown = this.handleTelekinesisDown.bind(this);
    this.handleTelekinesisMove = this.handleTelekinesisMove.bind(this);
    this.handleTelekinesisUp = this.handleTelekinesisUp.bind(this);
    this.voidTurtleRide = new VoidTurtleRide({
      materials: this.materials,
      colors: palette,
      playerRadius: this.playerRadius,
      addInteraction: (...args) => {
        this.addInteraction(...args);
      },
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      moveInteraction: (id, x, z) => {
        const interaction = this.interactions.find(
          (candidate) => candidate.id === id,
        );
        interaction?.position.set(x, 0, z);
      },
      addSurface: (surface) => {
        this.addSurfaceArea(surface, true);
      },
      addAnimatedItem: (item) => {
        this.animatedItems.push(item);
      },
      registerKickable: (...args) => this.registerKickable(...args),
      getKickables: () => this.kickables,
      getHeldKickable: () => this.heldKickable,
      getTravelingAsteroid: () => this.archiveAsteroid,
      getPlayerMovement: () => this.movement,
      getPlayerPosition: () => this.playerPosition,
      setPlayerPosition: (x, y, z) => {
        this.playerPosition.set(x, y, z);
      },
      copyPlayerPosition: (position) => {
        this.playerPosition.copy(position);
      },
      lerpPlayerPosition: (start, end, alpha) => {
        this.playerPosition.lerpVectors(start, end, alpha);
      },
      getSpawnY: () => this.spawn.y,
      getQuality: () => this.quality,
      getElapsed: () => this.elapsed,
      isReducedMotion: () => this.reduceMotion,
      resetJump: () => this.resetJump(),
      setPlayerSupport: (surface, offset) => {
        this.activePlatform = surface;
        this.surfaceOffset = offset;
      },
      setPlayerHeading: (heading) => {
        this.smoothedRotation = heading;
        this.player.group.rotation.y = heading;
      },
      setShadowState: (surfaceY, verticalDistance) => {
        this.shadowSurfaceY = surfaceY;
        this.shadowVerticalDistance = verticalDistance;
      },
      syncLooseToolInteraction: (kickable) => {
        this.syncLooseToolInteraction(kickable);
      },
      finishTelekinesis: (event) => {
        this.finishTurtleBoundTelekinesis(event);
      },
      onMediaChange: (active) => {
        this.hooks.onTurtleMediaChange(active);
      },
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
    });
    this.portalNetwork = new PortalNetwork({
      materials: this.materials,
      colors: palette,
      addInteraction: (id, label, x, z, radius, action) => {
        this.addInteraction(id, label, x, z, radius, action);
      },
      addAnimatedItem: (item) => {
        this.animatedItems.push(item);
      },
      addLanternReveal: (reveal) => {
        this.lanternReveals.push(reveal);
      },
      runWorldAction: (action, failureMessage, onFailure) => {
        this.runWorldAction(action, failureMessage, onFailure);
      },
      travelTo: (destination) => this.teleport(destination, true),
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      getCurrentZone: () => this.currentZone,
      getPlayerPosition: () => this.playerPosition,
      getZoneMilestoneProgress: (zone) =>
        this.hooks.getZoneMilestoneProgress(zone),
      getElapsed: () => this.elapsed,
      isInputEnabled: () => this.externalInputEnabled,
      isTransitioning: () => this.transitioning,
      isPlayerLocked: () => this.isIgnitionPanicActive(),
      isWorldCollapseActive: () => this.worldCollapse !== null,
      isReducedMotion: () => this.reduceMotion,
      getQuality: () => this.quality,
    });
    this.gridServerPatchPuzzle = new GridServerPatchPuzzle({
      materials: this.materials,
      colors: palette,
      registerKickable: (
        object,
        radius,
        restingY,
        gravity,
        friction,
        message,
      ) =>
        this.registerKickable(
          object,
          radius,
          restingY,
          null,
          gravity,
          null,
          friction,
          message,
        ),
      addInteraction: (...args) => {
        this.addInteraction(...args);
      },
      getHeldKickable: () => this.heldKickable,
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      onComplete: () => {
        this.triggerServerRackFlicker("surge");
      },
      hasAchievement: (title) => this.hooks.hasAchievement(title),
      getElapsed: () => this.elapsed,
      isReducedMotion: () => this.reduceMotion,
    });
    this.hanoiPuzzle = new HanoiPuzzle({
      materials: this.materials,
      colors: palette,
      playerRadius: this.playerRadius,
      addStaticBox: (...args) => {
        this.addStaticBox(...args);
      },
      addSurface: (surface) => {
        this.addSurfaceArea(surface, true);
      },
      addInteraction: (id, label, x, z, radius, action) => {
        this.addInteraction(id, label, x, z, radius, action);
      },
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      getElapsed: () => this.elapsed,
      isReducedMotion: () => this.reduceMotion,
      isCollisionDebugEnabled: () => this.collisionDebugEnabled,
      refreshCollisionDebug: () => {
        this.refreshCollisionDebugVisuals();
      },
      getPlayerPosition: () => this.playerPosition,
      getPlayerWorldY: () => this.player.group.position.y,
      getPlayerHeading: () => this.smoothedRotation,
    });
    this.pongChallenge = new PongChallenge({
      canvas: this.canvas,
      materials: this.materials,
      colors: palette,
      pointerRaycaster: this.pointerRaycaster,
      addStaticBox: (...args) => {
        this.addStaticBox(...args);
      },
      addInteraction: (id, label, x, z, radius, action) => {
        this.addInteraction(id, label, x, z, radius, action);
      },
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      registerPlayerOccluder: (object) => {
        this.registerPlayerOccluder(object);
      },
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      onPongChange: (active, playerScore, daemonScore) => {
        this.hooks.onPongChange(active, playerScore, daemonScore);
      },
      onDaemonSpeech: (message) => {
        this.emitNpcSpeech(
          "daemon-controller",
          "Daemon Controller",
          message,
        );
      },
      onServerRackFlicker: (stage) => {
        this.triggerServerRackFlicker(stage);
      },
      onVictory: (cleanVictory) => this.recordPongVictory(cleanVictory),
      getElapsed: () => this.elapsed,
      getHighestSpellStage: () => this.highestSpellStage,
      getPlayerPosition: () => this.playerPosition,
      getPlayerGroup: () => this.player.group,
      getQuality: () => this.quality,
      getSelectedSpellStage: () => this.spellStage,
      isArchivePinballChallengeComplete: () =>
        this.archivePinballChallengeComplete,
      isCleanPongVictoryComplete: () =>
        this.cleanPongVictoryComplete,
      isPacketInterferenceUnlocked: () =>
        this.packetInterferenceUnlocked,
      isPongChallengeComplete: () => this.pongChallengeComplete,
      isReducedMotion: () => this.reduceMotion,
      updatePointerRay: (event) => {
        this.updatePointerRay(event);
      },
      cancelOtherPointerDrags: () => {
        this.cancelNonPongPointerDrags();
      },
      syncPointerCursor: () => {
        this.syncPointerDragCursor();
      },
    });
    this.archiveOrbitPlayground = new ArchiveOrbitPlayground({
      canvas: this.canvas,
      materials: this.materials,
      colors: palette,
      pointerRaycaster: this.pointerRaycaster,
      playerRadius: this.playerRadius,
      addInteraction: (...args) => {
        this.addInteraction(...args);
      },
      addAnimatedItem: (item) => {
        this.animatedItems.push(item);
      },
      registerClimbableBox: (...args) => {
        this.registerClimbableBox(...args);
      },
      updatePointerRay: (event) => {
        this.updatePointerRay(event);
      },
      getKickables: () => this.kickables,
      getHeldKickable: () => this.heldKickable,
      getPlayerPosition: () => this.playerPosition,
      getPlayerMovement: () => this.movement,
      setPlayerHorizontalPosition: (x, z) => {
        this.playerPosition.x = x;
        this.playerPosition.z = z;
        this.constrainToBounds(this.playerPosition);
      },
      offsetPlayerHorizontalPosition: (x, z) => {
        this.playerPosition.x += x;
        this.playerPosition.z += z;
        this.constrainToBounds(this.playerPosition);
      },
      launchPlayer: (minimumHeight, minimumVelocity) => {
        this.jumpHeight = Math.max(this.jumpHeight, minimumHeight);
        this.jumpVelocity = Math.max(
          this.jumpVelocity,
          minimumVelocity,
        );
      },
      getPlayerPeakHeight: () =>
        Math.max(
          this.airbornePeakHeight,
          this.surfaceOffset + this.jumpHeight,
        ),
      isNoclipEnabled: () => this.noclip,
      getQuality: () => this.quality,
      getElapsed: () => this.elapsed,
      isReducedMotion: () => this.reduceMotion,
      hasAchievement: (title) => this.hooks.hasAchievement(title),
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      syncPointerCursor: (idleCursor) => {
        this.syncPointerDragCursor(idleCursor);
      },
    });
    this.archiveSignalPuzzle = new ArchiveSignalPuzzle({
      canvas: this.canvas,
      materials: this.materials,
      colors: palette,
      pointerRaycaster: this.pointerRaycaster,
      pointerInteractionLayer,
      playerRenderLayer,
      playerRadius: this.playerRadius,
      playerCollisionHeight: this.playerCollisionHeight,
      addInteraction: (id, label, x, z, radius, action) => {
        this.addInteraction(id, label, x, z, radius, action);
      },
      addPointerAction: (object, action, maximumDistance) => {
        this.pointerActions.push({ object, action, maximumDistance });
      },
      addStaticBox: (...args) => this.addStaticBox(...args),
      addAnimatedItem: (item) => {
        this.animatedItems.push(item);
      },
      registerClimbableBox: (...args) => {
        this.registerClimbableBox(...args);
      },
      registerPlayerOccluder: (object) => {
        this.registerPlayerOccluder(object);
      },
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      updatePointerRay: (event) => {
        this.updatePointerRay(event);
      },
      getStaticColliders: () => this.staticColliders,
      getPlayerGroup: () => this.player.group,
      getPlayerPosition: () => this.playerPosition,
      getQuality: () => this.quality,
      getSelectedSpellStage: () => this.spellStage,
      getElapsed: () => this.elapsed,
      hasAchievement: (title) => this.hooks.hasAchievement(title),
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      onPortalBeam: () => {
        this.portalNetwork.pulseDestination("field", 1.62);
      },
      setPointerReachTarget: (target, until) => {
        this.pointerActionReachTarget = target;
        this.pointerActionReachUntil = until;
      },
      isOtherPointerDragActive: () =>
        this.telekinesisPointerId !== null ||
        this.mathInstanceDragHold !== null,
      isReducedMotion: () => this.reduceMotion,
      syncPointerCursor: (idleCursor) => {
        this.syncPointerDragCursor(idleCursor);
      },
    });
    this.fallsRuneRitual = new FallsRuneRitual({
      materials: this.materials,
      colors: palette,
      addInteraction: (...args) => this.addInteraction(...args),
      addStaticBox: (...args) => this.addStaticBox(...args),
      registerSolid: (object, id, stepHeight) =>
        this.registerClimbableBox(object, id, undefined, undefined, true, true, stepHeight),
      addRemovableStaticBox: (...args) => {
        const collider = this.addStaticBox(...args);
        return () => {
          this.removeStaticCollider(collider);
        };
      },
      addSurface: (surface) => {
        this.addSurfaceArea(surface);
      },
      addAnimatedItem: (item) => {
        this.animatedItems.push(item);
      },
      registerKickable: (...args) => this.registerKickable(...args),
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      moveInteraction: (id, x, z) => {
        const interaction = this.interactions.find(
          (candidate) => candidate.id === id,
        );
        interaction?.position.set(x, 0, z);
      },
      refreshCollisionDebug: () => {
        this.refreshCollisionDebugVisuals();
      },
      cancelKickableHold: (kickable) => {
        this.cancelTelekinesisHold(kickable);
      },
      recallFlyingFishMagic: (...args) =>
        this.recallFlyingFishMagic(...args),
      settleFlyingFishSchools: () => this.settleFlyingFishSchools(),
      surfaceContainsPoint: (...args) =>
        this.surfaceContainsPoint(...args),
      claimChestReward: () => this.claimFallsChestReward(),
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
      getPlayerPosition: () => this.playerPosition,
      getPlayerFeetHeight: () => this.surfaceOffset + this.jumpHeight,
      getHeldKickable: () => this.heldKickable,
      getTelekinesisPlacementSurface: () =>
        this.telekinesisPlacementSurface,
      getQuality: () => this.quality,
      getElapsed: () => this.elapsed,
      getLanternBlend: () => this.lanternBlend,
      getSpellCastSequence: () => this.spellCastSequence,
      isReducedMotion: () => this.reduceMotion,
    });
    this.pointerRaycaster.layers.enable(pointerInteractionLayer);
    this.playerOcclusionRaycaster.layers.set(playerOcclusionLayer);
    this.collisionDebugGroup.name = "collision-debug";
    this.collisionDebugGroup.visible = false;
    this.highestSpellStage = hooks.initialProgress.spellStage;
    this.spellStage = hooks.initialProgress.selectedSpellStage;
    this.activeSpellStage = this.spellStage;
    this.packetInterferenceUnlocked =
      hooks.initialProgress.packetInterferenceUnlocked ||
      this.highestSpellStage === "thunder";
    this.cleanPongVictoryComplete =
      hooks.initialProgress.cleanPongVictoryComplete;
    this.pongChallengeComplete =
      hooks.initialProgress.pongChallengeComplete ||
      this.cleanPongVictoryComplete;
    this.archivePinballChallengeComplete =
      hooks.initialProgress.archivePinballChallengeComplete;
    if (hooks.initialProgress.travelingAsteroidZone) {
      this.travelingAsteroid = {
        object: null,
        shadow: null,
        zone: hooks.initialProgress.travelingAsteroidZone,
        arrivalFrom:
          hooks.initialProgress.travelingAsteroidFromZone,
        position: new THREE.Vector3(0, 0.66, 0),
        quaternion: new THREE.Quaternion(),
        velocity: new THREE.Vector3(),
        size: 0.66,
        needsArrivalPlacement: true,
        portalCooldownUntil: 0,
      };
    }
    this.mathCubeBooted = hooks.isZoneDiscovered("math");
    this.resizeObserver = new ResizeObserver(this.resize);
    this.navigation = new NavigationController({
      readFrame: () => this.readNavigationFrame(),
      now: () => performance.now(),
      refreshTarget: (target) => this.refreshClickNavigationTarget(target),
      isTargetReachable: (target) => this.isClickNavigationTargetPotentiallyReachable(target),
      distanceToSurface: (target) => this.distanceToClickNavigationSurface(target),
      goalClearance: (target) => this.getClickNavigationGoalClearance(target),
      findLegacyPath: (target, clearance) => this.findGuidedPath(target, clearance),
      createContext: (start, goal) => this.createNavigationPlanningContext(start, goal),
      supportHeight: (point) => this.navigationSupportHeight(point),
      canJumpFrom: (from, to) => this.canGuideJumpFrom(from, to),
      jumpDelay: (from, to) => this.findGuideJumpDelay(from, to),
      canDropFrom: (from, to) => this.canGuideDropFrom(from, to),
      sampleWalkHeight: this.sampleGuidedWalkHeight,
      surfaceContains: (surface, x, z) => this.surfaceContainsPoint(surface, x, z),
      onBegin: () => {
        if (this.tentState?.resting) this.setTentResting(false);
        this.cancelAtlasAutopilot(false);
      },
      onHoverTarget: (target) => { this.clickNavigationHover = target; },
      onClearFeedback: () => {
        this.clickNavigationHover = null;
        this.clickNavigationHoverProjectionDirty = true;
        this.clickNavigationMarker?.hide();
      },
      cancelPress: () => this.cancelClickNavigationPress(),
      onStatus: (message) => this.hooks.onStatus(message),
    });

  }

  async init(initialQuality: QualityTier = "medium"): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot initialize a disposed world runtime.");
    }
    if (this.initializationStarted) {
      throw new Error("The world runtime has already begun initialization.");
    }
    this.initializationStarted = true;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "default",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    // Layered occlusion frames use more than one render call. Reset once per
    // complete frame so diagnostics still report the combined world total.
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.FogExp2(palette.sky, 0.017);
    this.scene.add(
      this.zoneGroup,
      this.decorativeGroup,
      this.collisionDebugGroup,
    );
    this.clickNavigationMarker = new ClickNavigationMarker(this.scene);
    this.navigationDebug = new NavigationDebug(this.scene);
    this.ambientGrid = new AmbientGrid(this.scene);

    this.hemisphere = new THREE.HemisphereLight(
      0x7ac5d1,
      0x101412,
      1.7,
    );
    this.scene.add(this.hemisphere);
    this.ambientFill = new THREE.AmbientLight(0x8fc6ca, 0);
    this.scene.add(this.ambientFill);

    this.sunlight = new THREE.DirectionalLight(0xffd9a3, 2.8);
    this.sunlight.position.set(-10, 18, 8);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.camera.near = 1;
    this.sunlight.shadow.camera.far = 70;
    this.sunlight.shadow.camera.left = -34;
    this.sunlight.shadow.camera.right = 34;
    this.sunlight.shadow.camera.top = 34;
    this.sunlight.shadow.camera.bottom = -34;
    this.sunlight.shadow.bias = -0.00025;
    this.sunlight.shadow.normalBias = 0.035;
    this.scene.add(this.sunlight);

    this.createStars();

    this.player = createAvatar();
    this.player.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
    this.scene.add(this.player.group);
    this.teleportRitual = new PencilTeleportRitual(this.scene);
    this.createPlayerOcclusionOutline();
    this.spellChargeEffect = new SpellChargeEffect(
      this.player.group,
      this.player.leftArm,
      this.player.rightArm,
      this.player.gloveMaterial,
      playerRenderLayer,
    );
    this.createLanternEffects();
    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.68, 18),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(this.spawn.x, this.shadowSurfaceY, this.spawn.z);
    this.playerShadow.renderOrder = 2;
    this.scene.add(this.playerShadow);
    this.terminalTraversal = new TerminalTraversalEffect(
      this.scene,
      this.player.group,
      this.playerShadow,
    );
    this.createSprintDustTrail();
    this.createPlayerIgnitionEffect();
    this.spellRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 32),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.spellRing.rotation.x = -Math.PI / 2;
    this.spellRing.visible = false;
    this.spellRing.renderOrder = 3;
    this.scene.add(this.spellRing);
    this.createDigitStorm();
    this.createThunderEffects();

    this.setQuality(initialQuality);
    this.buildZone("field");
    this.cameraFocus.set(this.spawn.x, 0.75, this.spawn.z);
    this.updateCamera(1, true);
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();

    this.input.connect();
    document.addEventListener("visibilitychange", this.handleVisibility);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("focus", this.handleWindowFocus);
    this.canvas.addEventListener("pointerdown", this.handleTelekinesisDown);
    this.canvas.addEventListener("pointermove", this.handleTelekinesisMove);
    this.canvas.addEventListener("pointerup", this.handleTelekinesisUp);
    this.canvas.addEventListener("pointercancel", this.handleTelekinesisUp);
    this.canvas.addEventListener("lostpointercapture", this.handleTelekinesisUp);
    this.canvas.addEventListener("pointerenter", this.handlePointerEnter);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.listenersConnected = true;
    this.hooks.onSpellChange(this.spellStage, this.packetInterferenceUnlocked);
    this.hooks.onSpellCharge(0, false);
    this.hooks.onLanternChange(this.lanternEnabled);
    this.hooks.onCompassChange(this.compassOwned, this.compassHeading);
    this.renderScene();
    this.initializationComplete = true;
  }

  start(): void {
    if (
      this.running ||
      this.disposed ||
      !this.initializationComplete
    ) {
      return;
    }
    this.running = true;
    this.previousFrame = performance.now();
    this.framePacer.reset();
    this.frameTimingWindow.reset();
    this.performanceMonitor?.discontinuity("resume");
    if (this.documentVisible) this.renderer.setAnimationLoop(this.frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.performanceMonitor?.clear();
    this.performanceMonitor = null;
    this.pendingPointerHover = null;
    this.hoverPointerActiveUntil = 0;
    const fullyInitialized = this.initializationComplete;
    this.completeFieldCompassEquipFlight(false);
    this.completePortablePencilEquipFlight(false);
    this.disposed = true;
    this.running = false;
    this.navigation.cancel("World runtime disposed");
    this.cancelWorldCollapsePromise(
      new Error("The world runtime was disposed before the Event Horizon completed."),
    );
    if (this.renderer) this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    if (this.listenersConnected) {
      document.removeEventListener("visibilitychange", this.handleVisibility);
      window.removeEventListener("blur", this.handleWindowBlur);
      window.removeEventListener("focus", this.handleWindowFocus);
      this.canvas.removeEventListener("pointerdown", this.handleTelekinesisDown);
      this.canvas.removeEventListener("pointermove", this.handleTelekinesisMove);
      this.canvas.removeEventListener("pointerup", this.handleTelekinesisUp);
      this.canvas.removeEventListener("pointercancel", this.handleTelekinesisUp);
      this.canvas.removeEventListener("pointerenter", this.handlePointerEnter);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener(
        "lostpointercapture",
        this.handleTelekinesisUp,
      );
      this.listenersConnected = false;
    }
    this.input.dispose();
    if (this.transitioning) this.hooks.onTransition(false);
    this.transitioning = false;
    if (!fullyInitialized) {
      this.disposePartialInitialization();
      return;
    }
    this.teleportRitual.dispose(this.scene);
    this.terminalTraversal.dispose(this.scene);
    this.spellChargeEffect.dispose();
    this.worldCollapse?.dispose();
    this.worldCollapse = null;
    this.worldCollapseFrame = null;
    this.clickNavigationMarker?.dispose(this.scene);
    this.clickNavigationMarker = null;
    this.navigationDebug?.dispose();
    this.navigationDebug = null;
    this.clearZone();
    this.fallsCrystalFrog.dispose();
    this.disposeTravelingAsteroid();
    this.scene.remove(this.collisionDebugGroup);
    this.collisionDebugBlockerMaterial.dispose();
    this.collisionDebugSurfaceMaterial.dispose();
    this.ambientGrid?.dispose();
    this.ambientGrid = null;
    disposeObjectTree(this.decorativeGroup);
    disposeObjectTree(this.player.group);
    this.scene.remove(this.playerShadow);
    this.playerShadow.geometry.dispose();
    this.playerShadow.material.dispose();
    if (this.sprintDustTrail) {
      this.scene.remove(this.sprintDustTrail.points);
      this.sprintDustTrail.points.geometry.dispose();
      this.sprintDustTrail.points.material.map?.dispose();
      this.sprintDustTrail.points.material.dispose();
      this.sprintDustTrail = null;
    }
    if (this.playerIgnition) {
      this.scene.remove(this.playerIgnition.embers);
      this.scene.remove(this.playerIgnition.smoke);
      this.scene.remove(this.playerIgnition.fireLight);
      this.playerIgnition.embers.geometry.dispose();
      this.playerIgnition.embers.material.map?.dispose();
      this.playerIgnition.embers.material.dispose();
      this.playerIgnition.smoke.dispose();
      this.playerIgnition.smoke.geometry.dispose();
      this.playerIgnition.smoke.material.dispose();
      this.playerIgnition = null;
    }
    this.scene.remove(this.spellRing);
    this.spellRing.geometry.dispose();
    this.spellRing.material.dispose();
    for (const cloud of this.digitClouds) {
      this.scene.remove(cloud.points);
      cloud.points.geometry.dispose();
      cloud.points.material.map?.dispose();
      cloud.points.material.dispose();
    }
    this.digitClouds.length = 0;
    this.scene.remove(this.thunderBolts);
    this.thunderBolts.geometry.dispose();
    this.thunderBolts.material.dispose();
    this.scene.remove(this.thunderLight);
    this.player.lantern.remove(this.lanternLight);
    this.scene.remove(this.lanternAura);
    this.lanternAura.material.map?.dispose();
    this.lanternAura.geometry.dispose();
    this.lanternAura.material.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.renderer.dispose();
  }

  private disposePartialInitialization(): void {
    this.worldCollapse?.dispose();
    this.worldCollapse = null;
    this.worldCollapseFrame = null;
    this.mightymaticaZone?.dispose();
    this.mightymaticaZone = null;
    this.ambientGrid?.dispose();
    this.ambientGrid = null;
    this.clickNavigationMarker?.dispose(this.scene);
    this.clickNavigationMarker = null;
    this.navigationDebug?.dispose();
    this.navigationDebug = null;
    disposeObjectTree(this.scene);
    this.scene.clear();
    this.collisionDebugBlockerMaterial.dispose();
    this.collisionDebugSurfaceMaterial.dispose();
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    if (this.renderer) this.renderer.dispose();
  }

  getCurrentZone(): ZoneId {
    return this.currentZone;
  }

  readGridServerTrace(): readonly string[] | null {
    return this.gridServerPatchPuzzle.getTraceLines();
  }

  hasGridServerPayload(): boolean {
    return this.gridServerPatchPuzzle.isComplete();
  }

  getQuality(): QualityTier {
    return this.quality;
  }

  refreshPortalMilestones(): void {
    this.portalNetwork.refreshMilestones();
  }

  isNoclipEnabled(): boolean {
    return this.noclip;
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  setReducedMotionPreference(reduced: boolean): void {
    const previousReducedMotion = this.reduceMotion;
    this.preferReducedMotion = reduced;
    if (this.reduceMotion !== previousReducedMotion) {
      this.framePacer.reset();
    }
  }

  isWorldCollapseActive(): boolean {
    return this.worldCollapse !== null;
  }

  beginWorldCollapse(): Promise<ZoneId> {
    if (this.disposed) {
      return Promise.reject(
        new Error("The world runtime is already disposed."),
      );
    }
    if (this.transitioning) {
      return Promise.reject(
        new Error(
          "A threshold crossing is still resolving. Let the world settle, then open the Event Horizon again.",
        ),
      );
    }
    if (this.worldCollapsePromise) return this.worldCollapsePromise;

    this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    this.cancelAllPointerDrags(false);
    this.pongChallenge.stopForWorldCollapse();
    this.voidTurtleRide.stopForWorldCollapse();
    // Impact spray has no water source once the terrain starts breaking up.
    this.fallsWaterfallMist.unmount();
    this.fallsCrystalFrog.freezeForWorldCollapse();
    this.activeInteraction = null;
    this.hooks.onInteractionChange(null);
    this.interactions.length = 0;
    this.pointerActions.length = 0;
    this.mathInstanceDrags.length = 0;
    this.portalNetwork.suspendThresholds();
    this.worldCollapseCollisionReleased = false;
    this.worldCollapseFarewellSent = false;
    this.worldCollapseAchievementSent = false;
    this.worldCollapseBlackoutStarted = false;
    this.worldCollapsePlayerScale.copy(this.player.group.scale);
    this.worldCollapse = new WorldCollapseSequence({
      scene: this.scene,
      zoneRoot: this.zoneGroup,
      playerStart: this.player.group.position,
      zone: this.currentZone,
      quality: this.quality,
      reducedMotion: this.reduceMotion,
    });
    this.ambientGrid?.beginWorldCollapse(
      this.worldCollapse.origin,
      this.reduceMotion,
    );
    this.worldCollapseFrame = null;
    this.emitWorldCollapseStatus(
      "The satchel clasp turns inward. A black seed leaves the leather and begins teaching the world a smaller shape.",
    );
    this.worldCollapsePromise = new Promise<ZoneId>((resolve, reject) => {
      this.worldCollapseResolve = resolve;
      this.worldCollapseReject = reject;
    });
    return this.worldCollapsePromise;
  }

  private cancelWorldCollapsePromise(reason: Error): void {
    const reject = this.worldCollapseReject;
    this.worldCollapsePromise = null;
    this.worldCollapseResolve = null;
    this.worldCollapseReject = null;
    reject?.(reason);
  }

  hasEquippedTeleportPencil(): boolean {
    return (
      this.pencilOwned &&
      this.wornPencil !== null &&
      this.portablePencilVariant === "cyan"
    );
  }

  private isNavigationLocked(): boolean {
    return (
      this.disposed ||
      this.transitioning ||
      this.worldCollapse !== null ||
      this.isIgnitionPanicActive()
    );
  }

  private isWorldPointerInteractionLocked(): boolean {
    return !this.externalInputEnabled || this.isNavigationLocked();
  }

  private isIgnitionPanicActive(): boolean {
    return (this.playerIgnition?.panicAge ?? inactiveIgnitionPanicAge) >= 0;
  }

  async travelFromAtlas(
    destination: ZoneId,
  ): Promise<"ritual" | "walking" | "already-here" | "unavailable"> {
    if (this.isNavigationLocked()) return "unavailable";

    const hasRitualPencil =
      this.hasEquippedTeleportPencil() ||
      this.equipNearbyCyanPencilForAtlas();
    if (hasRitualPencil) {
      this.cancelAtlasAutopilot(false);
      const traveled = await this.ritualTeleport(destination);
      return traveled ? "ritual" : "unavailable";
    }

    return this.startGuidedWalk(destination, "atlas");
  }

  walkTo(
    destination: ZoneId,
  ): "walking" | "already-here" | "unavailable" {
    return this.startGuidedWalk(destination, "terminal");
  }

  private startGuidedWalk(
    destination: ZoneId,
    source: "atlas" | "terminal",
  ): "walking" | "already-here" | "unavailable" {
    if (this.isNavigationLocked()) return "unavailable";
    if (destination === this.currentZone) {
      this.hooks.onStatus(
        `${zoneLabels[destination]} is already beneath your feet.`,
      );
      return "already-here";
    }

    return this.beginAtlasAutopilot(destination, source)
      ? "walking"
      : "unavailable";
  }

  private equipNearbyCyanPencilForAtlas(): boolean {
    if (this.pencilOwned) return false;
    const cyanPencil = this.pencilProps.find(
      (state) =>
        state.variant === "cyan" &&
        state.kickable.enabled &&
        state.kickable.object.visible,
    );
    if (!cyanPencil) return false;
    const distanceSquared =
      cyanPencil.kickable.object.position.distanceToSquared(
        this.playerPosition,
      );
    if (distanceSquared > 3.8 * 3.8) return false;
    const equipped = this.acquirePortablePencil(
      cyanPencil.kickable,
      false,
    );
    if (equipped) {
      this.hooks.onStatus(
        "The nearby cyan pencil answers the atlas clasp and slips into your hand.",
      );
    }
    return equipped;
  }

  private setPlayerAttachmentRendering(
    object: THREE.Object3D,
    attached: boolean,
  ): void {
    object.traverse((child) => {
      if (child instanceof THREE.Light) {
        child.layers.set(0);
        if (attached) child.layers.enable(playerRenderLayer);
        return;
      }
      child.layers.set(attached ? playerRenderLayer : 0);
    });
  }

  private holdTeleportPencil(): void {
    this.completePortablePencilEquipFlight();
    if (!this.wornPencil) return;
    this.player.rightArm.attach(this.wornPencil);
    this.setPlayerAttachmentRendering(this.wornPencil, true);
    this.wornPencil.position.set(0.02, -0.82, 0.04);
    this.wornPencil.rotation.set(0.1, -0.16, -1.16);
    this.wornPencil.scale.setScalar(1.04);
  }

  private mountPortablePencil(
    pencil: THREE.Object3D,
  ): void {
    this.player.pencilMount.attach(pencil);
    this.setPlayerAttachmentRendering(pencil, true);
    pencil.position.copy(portablePencilMountPosition);
    pencil.quaternion.copy(portablePencilMountQuaternion);
    pencil.scale.setScalar(portablePencilMountScale);
  }

  private getPortablePencilMountWorldPose(): void {
    this.player.pencilMount.localToWorld(
      this.attachmentEquipTargetPosition.copy(
        portablePencilMountPosition,
      ),
    );
    this.player.pencilMount.getWorldQuaternion(
      this.attachmentEquipMountQuaternion,
    );
    this.attachmentEquipTargetQuaternion
      .copy(this.attachmentEquipMountQuaternion)
      .multiply(portablePencilMountQuaternion);
    this.player.pencilMount.getWorldScale(
      this.attachmentEquipTargetScale,
    );
    this.attachmentEquipTargetScale.multiplyScalar(
      portablePencilMountScale,
    );
  }

  private createAttachmentEquipFlight(
    object: THREE.Object3D,
    fallbackLateral: number,
  ): AttachmentEquipFlight {
    object.updateWorldMatrix(true, false);
    const startPosition = object.getWorldPosition(new THREE.Vector3());
    const startQuaternion = object.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const startScale = object.getWorldScale(new THREE.Vector3());
    const distance = startPosition.distanceTo(
      this.attachmentEquipTargetPosition,
    );
    const lateral = new THREE.Vector3(
      this.attachmentEquipTargetPosition.z - startPosition.z,
      0,
      startPosition.x - this.attachmentEquipTargetPosition.x,
    );
    if (lateral.lengthSq() < 0.0001) {
      lateral.set(fallbackLateral, 0, 0);
    } else {
      lateral.normalize().multiplyScalar(Math.sign(fallbackLateral) || 1);
    }

    // Keep the existing physical prop alive in world space while it crosses
    // into the persistent avatar. The final mount reuses the same object,
    // geometry, and materials.
    this.scene.attach(object);
    this.setPlayerAttachmentRendering(object, false);
    return {
      object,
      age: 0,
      duration: this.reduceMotion
        ? 0.18
        : THREE.MathUtils.clamp(0.46 + distance * 0.055, 0.5, 0.72),
      arcHeight: this.reduceMotion
        ? 0.08
        : THREE.MathUtils.clamp(0.4 + distance * 0.12, 0.48, 1.05),
      startPosition,
      startQuaternion,
      startScale,
      lateral,
    };
  }

  private advanceAttachmentEquipFlight(
    flight: AttachmentEquipFlight,
    delta: number,
  ): boolean {
    flight.age = Math.min(flight.duration, flight.age + delta);
    const progress = Math.min(1, flight.age / flight.duration);
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    const arc = Math.sin(progress * Math.PI);
    flight.object.position.lerpVectors(
      flight.startPosition,
      this.attachmentEquipTargetPosition,
      eased,
    );
    flight.object.position.y += arc * flight.arcHeight;
    flight.object.position.addScaledVector(
      flight.lateral,
      arc * (this.reduceMotion ? 0.025 : 0.22),
    );
    flight.object.quaternion
      .copy(flight.startQuaternion)
      .slerp(this.attachmentEquipTargetQuaternion, eased);
    flight.object.scale.lerpVectors(
      flight.startScale,
      this.attachmentEquipTargetScale,
      eased,
    );
    return progress >= 1;
  }

  private startPortablePencilEquipFlight(
    pencil: THREE.Object3D,
    variant: PencilVariant,
    announce: boolean,
  ): void {
    this.getPortablePencilMountWorldPose();
    this.pencilEquipFlight = {
      ...this.createAttachmentEquipFlight(
        pencil,
        variant === "cyan" ? 1 : -1,
      ),
      variant,
      announce,
    };
  }

  private updatePortablePencilEquipFlight(delta: number): void {
    const flight = this.pencilEquipFlight;
    if (!flight) return;
    this.getPortablePencilMountWorldPose();
    if (this.advanceAttachmentEquipFlight(flight, delta)) {
      this.completePortablePencilEquipFlight();
    }
  }

  private completePortablePencilEquipFlight(
    showAnnouncement = true,
  ): void {
    const flight = this.pencilEquipFlight;
    if (!flight) return;
    this.pencilEquipFlight = null;
    this.mountPortablePencil(flight.object);
    if (showAnnouncement && flight.announce) {
      this.hooks.onStatus(
        `The ${flight.variant} repair pencil settles into the satchel loop, ready for threshold work.`,
      );
    }
  }

  private mountFieldCompass(compass: THREE.Object3D): void {
    this.player.compassMount.attach(compass);
    this.setPlayerAttachmentRendering(compass, true);
    compass.position.copy(fieldCompassMountPosition);
    compass.quaternion.copy(fieldCompassMountQuaternion);
    compass.scale.setScalar(fieldCompassMountScale);
  }

  private getFieldCompassMountWorldPose(): void {
    this.player.compassMount.localToWorld(
      this.attachmentEquipTargetPosition.copy(
        fieldCompassMountPosition,
      ),
    );
    this.player.compassMount.getWorldQuaternion(
      this.attachmentEquipMountQuaternion,
    );
    this.attachmentEquipTargetQuaternion
      .copy(this.attachmentEquipMountQuaternion)
      .multiply(fieldCompassMountQuaternion);
    this.player.compassMount.getWorldScale(
      this.attachmentEquipTargetScale,
    );
    this.attachmentEquipTargetScale.multiplyScalar(
      fieldCompassMountScale,
    );
  }

  private startFieldCompassEquipFlight(
    compass: THREE.Object3D,
    announce: boolean,
  ): void {
    this.getFieldCompassMountWorldPose();
    this.compassEquipFlight = {
      ...this.createAttachmentEquipFlight(compass, -1),
      announce,
    };
  }

  private updateFieldCompassEquipFlight(delta: number): void {
    const flight = this.compassEquipFlight;
    if (!flight) return;
    this.getFieldCompassMountWorldPose();
    if (this.advanceAttachmentEquipFlight(flight, delta)) {
      this.completeFieldCompassEquipFlight();
    }
  }

  private completeFieldCompassEquipFlight(
    showAnnouncement = true,
  ): void {
    const flight = this.compassEquipFlight;
    if (!flight) return;
    this.compassEquipFlight = null;
    this.mountFieldCompass(flight.object);
    this.compassHeading = getCompassHeading(this.smoothedRotation);
    this.hooks.onCompassChange(true, this.compassHeading);
    if (showAnnouncement && flight.announce) {
      this.hooks.onStatus(
        "The field compass arcs into its belt clip. Its needle joins the HUD.",
      );
    }
  }

  private restoreTeleportPencil(): void {
    if (!this.wornPencil || !this.pencilOwned) return;
    this.mountPortablePencil(this.wornPencil);
  }

  setInputEnabled(enabled: boolean): void {
    if (enabled !== this.externalInputEnabled) {
      this.performanceMonitor?.event(enabled ? "world-input-enabled" : "world-input-locked");
    }
    this.externalInputEnabled = enabled;
    if (!enabled) this.cancelAllPointerDrags();
    if (enabled) this.clickNavigationHoverProjectionDirty = true;
    this.syncInputState();
  }

  notifyPortfolioClosed(): void {
    this.runeAltar?.releasePortfolio(this.reduceMotion);
  }

  setTouchAxes(horizontal: number, forward: number): void {
    this.input.setTouchAxes(horizontal, forward);
  }

  jump(): void {
    this.input.queueJump();
  }

  setQuality(quality: QualityTier): void {
    if (quality !== this.quality) this.performanceMonitor?.event("quality-change", undefined, quality);
    const shadowModeChanged =
      (this.quality === "low") !== (quality === "low");
    this.quality = quality;
    if (shadowModeChanged) this.framePacer.reset();
    const dpr = window.devicePixelRatio || 1;
    const cap = quality === "low" ? 1 : quality === "medium" ? 1.25 : 1.5;
    const shadowSize = quality === "high" ? 1024 : 512;
    const shadowsEnabled = quality !== "low";
    if (
      this.sunlight.shadow.map &&
      (!shadowsEnabled ||
        this.sunlight.shadow.mapSize.x !== shadowSize)
    ) {
      this.sunlight.shadow.map.depthTexture?.dispose();
      this.sunlight.shadow.map.dispose();
      this.sunlight.shadow.map = null;
    }
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    // Keep the renderer's material pipeline stable across runtime tier changes.
    // Low quality skips the shadow pass at the only shadow-casting light, while a
    // cheap uniform fill keeps dark PBR geometry legible.
    this.renderer.shadowMap.enabled = true;
    this.sunlight.castShadow = shadowsEnabled;
    this.syncZoneLighting(this.currentZone);
    if (shadowsEnabled) {
      this.sunlight.shadow.mapSize.set(shadowSize, shadowSize);
    }
    this.renderer.shadowMap.needsUpdate = shadowsEnabled;
    if (shadowModeChanged) {
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.needsUpdate = true;
          }
        }
      });
    }
    this.decorativeGroup.visible = quality !== "low";
    const pointLightsVisible = quality !== "low";
    this.lanternLight.visible = pointLightsVisible;
    this.thunderLight.visible = pointLightsVisible;
    for (const lease of this.fieldLanternLightLeases) {
      lease.light.visible = pointLightsVisible;
    }
    this.teleportRitual.setQuality(quality);
    this.ambientGrid?.setQuality(quality);
    this.archiveOrbitPlayground.refreshQuality();
    if (this.fishSchool) {
      const fishCount = this.getFishRenderCount(
        this.fishSchool,
        quality,
      );
      this.fishSchool.mesh.count = fishCount;
      this.fishSchool.aura.count = fishCount;
      this.fishSchool.magicPoints.material.size =
        quality === "low" ? 0.1 : 0.14;
    }
    this.voidTurtleRide.refreshQuality();
    this.setSprintDustQuality(quality);
    this.setPlayerIgnitionQuality(quality);
    this.runeAltar?.setQuality(quality);
    this.archiveSignalPuzzle.refreshQuality();
    this.fallsRuneRitual.refreshQuality();
    this.fallsFireflyField.setQuality(quality);
    this.fallsWaterfallMist.setQuality(quality);
    this.fallsCrystalFrog.setQuality(quality);
    this.pongChallenge.refreshQuality();
    this.gridFloorTraffic.setQuality(quality);
    this.mightymaticaZone?.setQuality(quality);
    this.resize();
    this.hooks.onQualityChange(quality);
  }

  private syncZoneLighting(zone: ZoneId): void {
    const luminousFalls = zone === "falls";
    this.hemisphere.color.setHex(
      luminousFalls ? 0x92b9bf : 0x7ac5d1,
    );
    this.hemisphere.groundColor.setHex(
      luminousFalls ? 0x39303e : 0x101412,
    );
    this.hemisphere.intensity = luminousFalls ? 2 : 1.7;
    this.sunlight.color.setHex(
      luminousFalls ? 0xe5dfff : 0xffd9a3,
    );
    this.sunlight.intensity = luminousFalls ? 2.9 : 2.8;
    this.ambientFill.color.setHex(
      luminousFalls ? 0x7c90af : 0x8fc6ca,
    );
    this.ambientFill.intensity =
      this.quality === "low"
        ? luminousFalls
          ? 0.78
          : 0.92
        : 0;
    this.renderer.toneMappingExposure = luminousFalls ? 1.08 : 1.06;
  }

  setSpeedMultiplier(multiplier: number): number {
    const speed = Math.max(1, Math.min(3, Math.round(multiplier)));
    if (speed !== this.speedMultiplier) {
      this.speedMultiplier = speed;
      // Jump-arc clearance depends on movement speed. Invalidate pending jobs,
      // authored edges and failed requests together, just as for changed solids.
      this.walkingGeometryRevision += 1;
    }
    return this.speedMultiplier;
  }

  toggleNoclip(): boolean {
    this.noclip = !this.noclip;
    this.hooks.onStatus(this.noclip ? "Noclip enabled." : "Noclip disabled.");
    return this.noclip;
  }

  toggleCollisionDebug(force?: boolean): boolean {
    this.collisionDebugEnabled = force ?? !this.collisionDebugEnabled;
    this.refreshCollisionDebugVisuals();
    this.hooks.onStatus(
      this.collisionDebugEnabled
        ? "Collision lattice visible: coral boxes are blockers; cyan plates are landing surfaces."
        : "Collision lattice hidden.",
    );
    return this.collisionDebugEnabled;
  }

  toggleNavigationDebug(force?: boolean): boolean {
    const enabled = this.navigationDebug?.toggle(force) ?? false;
    this.updateNavigationDebug();
    return enabled;
  }

  setNavigationTraceEnabled(enabled: boolean): boolean {
    this.navigation.trace.enabled = enabled;
    return enabled;
  }

  exportNavigationTrace(): string { return this.navigation.trace.export(); }

  clearNavigationTrace(): void { this.navigation.trace.clear(); }

  startPerformanceCapture(seconds = 120): void {
    this.performanceMonitor ??= new PerformanceMonitor(
      () => performance.now(),
      () => this.hooks.onStatus("Performance capture complete. Run debug perf export in the terminal."),
    );
    this.performanceMonitor.start(seconds, {
      build: new URL(import.meta.url).pathname.split("/").at(-1) ?? "unknown",
      threeRevision: THREE.REVISION,
      userAgent: navigator.userAgent,
      viewportWidth: this.canvas.clientWidth,
      viewportHeight: this.canvas.clientHeight,
    });
  }

  stopPerformanceCapture(): void { this.performanceMonitor?.stop(); }

  clearPerformanceCapture(): void { this.performanceMonitor?.clear(); }

  markPerformanceCapture(): void { this.performanceMonitor?.event("user-marker"); }

  getPerformanceCaptureStatus(): PerformanceCaptureStatus | null {
    return this.performanceMonitor?.status() ?? null;
  }

  exportPerformanceCapture(): string | null { return this.performanceMonitor?.export() ?? null; }

  toggleTopDownDebug(force?: boolean): boolean {
    this.topDownDebugEnabled = force ?? !this.topDownDebugEnabled;
    this.updateCamera(0, true);
    return this.topDownDebugEnabled;
  }

  private updateNavigationDebug(): void {
    const debug = this.navigationDebug;
    if (!debug?.enabled) return;
    if (this.worldCollapse || this.transitioning) {
      debug.clear();
      return;
    }
    const route = this.navigation.route;
    this.navigationDebugFeet.set(
      this.playerPosition.x, this.surfaceOffset + this.jumpHeight, this.playerPosition.z,
    );
    let jump = null;
    if (route?.requiresJump && route.path.length > 1) {
      const landingIndex = route.departureLanding ? 1 : route.path.length - 1;
      jump = this.navigationDebugJump;
      jump.landingIndex = landingIndex;
      jump.from.copy(route.waypointIndex >= landingIndex
        ? this.navigationDebugFeet : route.path[landingIndex - 1]!);
      jump.to.copy(route.departureLanding ?? route.target.position);
      // A link marks the committed takeoff/landing, not a guessed ballistic
      // curve. Frog arcs below use the controller's actual parabola.
    }
    const target = this.navigation.pendingTarget ?? route?.target ?? this.clickNavigationHover;
    if (target) {
      this.navigationDebugTarget.position.copy(target.position);
      this.navigationDebugTarget.unreachable = !target.reachable;
    }
    debug.update(
      this.navigationDebugFeet, route?.path ?? emptyNavigationPath, route?.waypointIndex ?? 0,
      jump, this.fallsCrystalFrog.getDebugHop(),
      target ? this.navigationDebugTarget : null,
      route?.legs, (route?.legIndex ?? -1) + 1,
    );
  }

  respawn(): void {
    if (this.disposed || this.transitioning || this.worldCollapse !== null) {
      return;
    }
    this.navigation.clearFailures();
    this.resetAtZoneAnchor();
  }

  private resetAtZoneAnchor(): void {
    this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    this.cancelAllPointerDrags();
    this.cancelSpellCharge();
    const runesReset = this.fallsRuneRitual.reset(false);
    const gridPatchReset =
      this.currentZone === "grid" &&
      this.gridServerPatchPuzzle.resetLooseParts();
    const compassReset = this.resetFieldCompass();
    const pencilReset = this.resetPortablePencil();
    this.resetFieldRockClusters();
    this.resetSprintDustTrail();
    this.resetPlayerIgnition();
    this.resetJump();
    this.surfaceOffset = 0;
    this.activePlatform = null;
    this.playerInWater = false;
    this.airbornePeakHeight = 0;
    this.fallsDiveFromCrown = false;
    this.collisionSafeLanding.valid = false;
    this.waterfallRecoveryAge = -1;
    this.shadowSurfaceY = 0.16;
    this.shadowVerticalDistance = 0;
    this.playerPosition.copy(this.spawn);
    this.player.group.position.set(this.spawn.x, 0, this.spawn.z);
    this.player.group.rotation.x = 0;
    this.player.group.rotation.z = 0;
    this.playerShadow.position.set(this.spawn.x, this.shadowSurfaceY, this.spawn.z);
    this.cameraFocus.set(this.spawn.x, 0.75, this.spawn.z);
    this.updateCamera(1, true);
    this.hooks.onStatus(
      `Respawned at ${zoneLabels[this.currentZone]}.${
        runesReset
          ? this.fallsRuneRitual.isSolved()
            ? " The loose crystal cache re-knits around the awakened sockets."
            : " The fractured runes re-knit and their sequence resets."
          : ""
      }${
        gridPatchReset
          ? " Loose patch plugs and the floppy return beside their source racks."
          : ""
      }${
        compassReset
          ? " The loose field compass returns to a safe resting place."
          : ""
      }${
        pencilReset
          ? this.pencilOwned
            ? " The repair pencil returns to its satchel loop."
            : " The planning pencils return to the atlas table."
          : ""
      }`,
    );
  }

  interact(): void {
    if (
      !this.activeInteraction ||
      this.transitioning ||
      this.isIgnitionPanicActive()
    ) {
      return;
    }
    this.runWorldAction(
      this.activeInteraction.action,
      "The interaction breaks before it can settle. Nothing has been consumed; try it again.",
    );
  }

  private runWorldAction(
    action: WorldAction,
    failureMessage: string,
    onFailure?: () => void,
  ): void {
    const handleFailure = (error: unknown): void => {
      if (this.disposed) return;
      onFailure?.();
      console.error("World action failed", error);
      this.hooks.onStatus(failureMessage);
    };

    executeWorldAction(action, handleFailure);
  }

  private setTentResting(resting: boolean): void {
    const tent = this.tentState;
    if (!tent || resting === tent.resting) return;
    tent.resting = resting;
    this.resetJump();
    this.activePlatform = null;
    if (resting) {
      this.playerPosition.copy(tent.sleepPosition);
      this.smoothedRotation = tent.sleepHeading;
      this.player.group.rotation.y = this.smoothedRotation;
      this.updateInteractionLabel("survey-bedroll", "Wake from the bedroll");
      this.hooks.onStatus(
        "You settle into the field bed. Canvas ticks softly above you; the station keeps watch.",
      );
    } else {
      this.updateInteractionLabel("survey-bedroll", "Sleep on the bedroll");
      this.hooks.onStatus(
        "Rested enough. The strange sky is still exactly where you left it.",
      );
    }
  }

  toggleLantern(force?: boolean): boolean {
    this.lanternEnabled = force ?? !this.lanternEnabled;
    this.hooks.onLanternChange(this.lanternEnabled);
    this.hooks.onStatus(
      this.lanternEnabled
        ? "Lantern raised. Warm light reveals marks that ordinary light ignores."
        : "Lantern stowed. The hidden ink slips back into the floor.",
    );
    return this.lanternEnabled;
  }

  beginSpellCharge(): void {
    if (
      this.disposed ||
      this.spellCharging ||
      this.spellCooldown > 0 ||
      this.transitioning ||
      this.isIgnitionPanicActive()
    ) {
      return;
    }
    this.spellCharging = true;
    this.spellCharge = 0;
    this.hooks.onSpellCharge(0, true);
  }

  releaseSpellCharge(): void {
    if (!this.spellCharging) return;
    const charge = this.spellCharge;
    this.cancelSpellCharge();
    this.castSpell(charge);
  }

  cancelSpellCharge(): void {
    if (!this.spellCharging && this.spellCharge === 0) return;
    this.spellCharging = false;
    this.spellCharge = 0;
    this.hooks.onSpellCharge(0, false);
  }

  private emitProgressChange(): void {
    this.hooks.onProgressChange({
      spellStage: this.highestSpellStage,
      selectedSpellStage: this.spellStage,
      packetInterferenceUnlocked: this.packetInterferenceUnlocked,
      pongChallengeComplete: this.pongChallengeComplete,
      cleanPongVictoryComplete: this.cleanPongVictoryComplete,
      archivePinballChallengeComplete:
        this.archivePinballChallengeComplete,
      travelingAsteroidZone:
        this.travelingAsteroid?.zone ?? null,
      travelingAsteroidFromZone:
        this.travelingAsteroid?.arrivalFrom ?? null,
    });
  }

  grantSpellStage(stage: SpellStage): SpellStage {
    let changed = false;
    if (spellRank[stage] > spellRank[this.highestSpellStage]) {
      this.highestSpellStage = stage;
      this.spellStage = stage;
      this.activeSpellStage = stage;
      changed = true;
    }
    if (stage === "thunder" && !this.packetInterferenceUnlocked) {
      this.packetInterferenceUnlocked = true;
      changed = true;
    }
    if (changed) {
      this.emitProgressChange();
      this.hooks.onSpellChange(this.spellStage, this.packetInterferenceUnlocked);
    }
    return this.highestSpellStage;
  }

  isSpellStageUnlocked(stage: SpellStage): boolean {
    return spellRank[stage] <= spellRank[this.highestSpellStage];
  }

  selectSpellStage(stage: SpellStage): boolean {
    if (!this.isSpellStageUnlocked(stage)) return false;
    if (this.spellStage === stage) return true;
    this.spellStage = stage;
    this.activeSpellStage = stage;
    if (this.spellCharging) {
      this.spellCharging = false;
      this.spellCharge = 0;
      this.hooks.onSpellCharge(0, false);
    }
    this.emitProgressChange();
    this.hooks.onSpellChange(this.spellStage, this.packetInterferenceUnlocked);
    return true;
  }

  grantPacketInterference(): boolean {
    if (this.packetInterferenceUnlocked) return false;
    this.packetInterferenceUnlocked = true;
    this.emitProgressChange();
    this.hooks.onSpellChange(this.spellStage, true);
    return true;
  }

  completeFantasyRitual(): boolean {
    return (
      this.currentZone === "falls" &&
      this.fallsRuneRitual.complete()
    );
  }

  traceFantasyRitual(): boolean {
    return (
      this.currentZone === "falls" &&
      this.fallsRuneRitual.trace()
    );
  }

  private reconcileChallengeRewards(): {
    packetUnlocked: boolean;
    thunderReady: boolean;
  } {
    const packetUnlocked =
      this.archivePinballChallengeComplete &&
      this.highestSpellStage !== "spark" &&
      this.grantPacketInterference();
    const thunderReady =
      this.highestSpellStage === "surge" &&
      this.archivePinballChallengeComplete &&
      this.pongChallengeComplete;
    return { packetUnlocked, thunderReady };
  }

  private claimFallsChestReward(): {
    surgeUnlocked: boolean;
    packetUnlocked: boolean;
    thunderReady: boolean;
  } {
    this.performanceMonitor?.event("chest-opened");
    const surgeUnlocked = this.highestSpellStage === "spark";
    if (surgeUnlocked) this.grantSpellStage("surge");
    return {
      surgeUnlocked,
      ...this.reconcileChallengeRewards(),
    };
  }

  private recordPongVictory(
    cleanVictory: boolean,
  ): PongVictoryResolution {
    const cleanAchievementUnlocked =
      cleanVictory && !this.cleanPongVictoryComplete;
    const progressionChanged =
      !this.pongChallengeComplete || cleanAchievementUnlocked;
    if (cleanVictory) this.cleanPongVictoryComplete = true;
    this.pongChallengeComplete = true;
    if (progressionChanged) this.emitProgressChange();
    const { thunderReady } = this.reconcileChallengeRewards();
    return { cleanAchievementUnlocked, thunderReady };
  }

  private completeArchivePinballChallenge(): void {
    if (this.archivePinballChallengeComplete) return;
    this.archivePinballChallengeComplete = true;
    this.emitProgressChange();
  }

  private getArrivalObservation(): string {
    return {
      field: "Canvas, brass, and three impossible thresholds sit beneath a quiet sky.",
      falls: "Cold spray drifts across old stone. Something moves beneath the water.",
      grid: "The floor hums in straight lines; the machines do not.",
      archive: "A choir of dim screens watches the local astronomy turn.",
      math: "A recursive floor holds a recovered workshop inside the reconstructed cube.",
    }[this.currentZone];
  }

  castSpell(charge = 0.14): void {
    if (
      this.spellCooldown > 0 ||
      this.transitioning ||
      this.isIgnitionPanicActive()
    ) {
      return;
    }
    const castCharge = THREE.MathUtils.clamp(charge, 0, 1);
    this.spellCharging = false;
    this.spellCharge = 0;
    this.hooks.onSpellCharge(0, false);
    this.spellCooldown = 0.55;
    this.spellAge = 0;
    this.spellCastSequence += 1;
    this.spellCastCharge = castCharge;
    this.activeSpellStage = this.spellStage;
    this.triggerDigitStorm(this.spellStage, castCharge);

    const isThunder = this.spellStage === "thunder";
    const isSurge = this.spellStage === "surge";
    this.spellRing.visible = isThunder || isSurge;
    if (isThunder || isSurge) {
      this.spellRing.position.set(
        this.playerPosition.x,
        this.shadowSurfaceY + 0.18,
        this.playerPosition.z,
      );
      this.spellRing.scale.setScalar(isThunder ? 0.7 : 0.48);
      this.spellRing.material.color.setHex(isThunder ? palette.cyan : palette.violet);
      this.spellRing.material.opacity = isThunder ? 0.95 : 0.82;
      if (isThunder) this.triggerThunder();
    }

    const baseRange =
      this.spellStage === "thunder" ? 7 : this.spellStage === "surge" ? 5.6 : 4.8;
    const baseForce =
      this.spellStage === "thunder" ? 9 : this.spellStage === "surge" ? 6.8 : 5.2;
    const chargeMultiplier = 0.82 + castCharge * 0.58;
    const range = baseRange * chargeMultiplier;
    const force = baseForce * chargeMultiplier;
    const gridScrapsAffected =
      this.currentZone === "field"
        ? (this.ambientGrid?.reactToSpell(
            this.playerPosition,
            this.spellStage,
            castCharge,
            range,
          ) ?? 0)
        : 0;
    const fieldRockReaction =
      this.currentZone === "field" && (isSurge || isThunder)
        ? this.pushFieldRockClusters(
            range,
            isThunder ? "thunder" : "surge",
            castCharge,
          )
        : { pushed: 0, fractured: 0 };
    const turtleAwakened =
      isThunder && this.voidTurtleRide.wakeFromThunder(range);
    const turtleAsteroidsPulsed = isThunder
      ? this.voidTurtleRide.pulseCapturedAsteroids(range, castCharge)
      : 0;
    const fullyCharged = castCharge >= fieldHeartChargeThreshold;
    const fieldHeartAttempt =
      this.currentZone === "field" &&
      fullyCharged &&
      Math.hypot(this.playerPosition.x, this.playerPosition.z) <= fieldHeartRadius;
    const fieldCenterCast =
      fieldHeartAttempt && (isSurge || isThunder);
    let lanternsLit = 0;
    for (const lantern of this.lanterns) {
      const distance = lantern.position.distanceToSquared(this.playerPosition);
      if (!fieldCenterCast && distance > range * range) continue;
      lantern.litUntil = this.elapsed + (isThunder ? 7 : 4.5);
      lanternsLit += 1;
    }

    for (const kickable of this.kickables) {
      if (!kickable.enabled) continue;
      const dx = kickable.object.position.x - this.playerPosition.x;
      const dz = kickable.object.position.z - this.playerPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.01 || distance > range) continue;
      const impulse = (1 - distance / (range + 0.2)) * force;
      kickable.velocity.x += (dx / distance) * impulse;
      kickable.velocity.z += (dz / distance) * impulse;
      if (kickable.gravity) {
        kickable.velocity.y = Math.max(kickable.velocity.y, isThunder ? 3.2 : 1.5);
      }
    }

    if (this.currentZone === "falls") {
      this.triggerFishSpellSwarm(
        this.spellStage,
        castCharge,
        range,
      );
      const revealedSockets = this.fallsRuneRitual.pulseFromSpell(
        this.spellStage,
        castCharge,
        range,
      );
      this.hooks.onStatus(
        `${
          this.fallsRuneRitual.isSolved()
            ? isThunder
              ? "Digit thunder rolls through the opened cave."
              : isSurge
              ? "Violet packet-surge spirals through the opened falls."
                : "Binary rain glitters across the opened falls."
            : revealedSockets > 0
              ? "Falling digits catch in old grooves. Buried colours flare, then begin sinking back into grey."
              : "Falling digits vanish against three dark motifs."
        }`,
      );
    } else if (this.currentZone === "grid") {
      if (this.spellStage !== "spark") this.triggerServerRackFlicker(this.spellStage);
      const reliquarySurged =
        isSurge &&
        this.pongChallenge.triggerThunderReliquarySurge(
          range,
          castCharge,
      );
      const interference = this.pongChallenge.activateInterference();
      if (!interference) {
        this.hooks.onStatus(
          `${
            reliquarySurged
              ? "SURGE catches in the glass engine. The captive core swells, and violet lightning lashes the coral cage."
              : isThunder
                ? "THUNDER overload: the strike leaps rack to rack, and every cabinet enters the same reboot cascade."
                : isSurge
                  ? "SURGE pulse: violet packets race outward and the racks lose sync."
                  : "Binary weather crosses the grid. Nearby signals react."
          }`,
        );
      }
    } else if (this.currentZone === "archive") {
      const signalPrismsReached = this.archiveSignalPuzzle.pulseFromSpell(
        this.spellStage,
        castCharge,
        range,
      );
      const orbitObservation =
        this.archiveOrbitPlayground.reactToSpell(
          this.spellStage,
          castCharge,
          range,
        );
      const projectionDisrupted =
        isThunder &&
        signalPrismsReached &&
        this.archiveSignalPuzzle.isSolved();
      this.hooks.onStatus(
        `${orbitObservation}${
          signalPrismsReached
            ? projectionDisrupted
              ? " The fixed prisms keep their bearings. Above them, the decoded sky tears into spectral echoes."
              : " The fixed prisms flare along their present bearings and keep their alignment."
            : ""
        }`,
      );
    } else if (this.currentZone === "math") {
      this.mightymaticaZone?.reactToSpell(this.spellStage, castCharge);
    } else {
      if (fieldHeartAttempt && !fieldCenterCast) return;
      this.hooks.onStatus(
        `${
          turtleAwakened
            ? "Thunder reaches the drifting shell. Two amber eyes open, and the small orbit above it begins to turn."
            : turtleAsteroidsPulsed > 0
              ? `Thunder throws ${turtleAsteroidsPulsed === 1 ? "the captured stone" : `all ${turtleAsteroidsPulsed} captured stones`} into wide arcs. The turtle’s pull is already drawing them home.`
            : fieldCenterCast
            ? `${isThunder ? "Thunder" : "Surge"} crosses the field heart: all ${lanternsLit} lanterns ignite along the visible pulse.`
            : fieldRockReaction.fractured > 0
              ? `Thunder splits ${fieldRockReaction.fractured === 1 ? "a fieldstone cluster" : `${fieldRockReaction.fractured} fieldstone clusters`}. Loose rocks skid away from the fault.`
            : fieldRockReaction.pushed > 0
              ? `${isThunder ? "Thunder" : "Surge"} shoves ${fieldRockReaction.pushed === 1 ? "a fieldstone cluster" : `${fieldRockReaction.pushed} fieldstone clusters`} with a deep scrape.`
            : lanternsLit > 0
            ? `${lanternsLit} field lantern${lanternsLit === 1 ? "" : "s"} answer${lanternsLit === 1 ? "s" : ""} the ${this.spellStage}.`
            : gridScrapsAffected > 0
              ? `${
                  isThunder
                    ? "Thunder"
                    : isSurge
                      ? "Violet digits"
                      : "Binary rain"
                } catches in the loose sky-thread. Its folds recoil, then begin easing open.`
            : isSurge
              ? "A dense violet packet wave expands across the station."
              : "A shower of impossible digits falls across the station."
        }`,
        turtleAwakened
          ? { kind: "achievement", title: "RISE AND SHINE" }
          : undefined,
      );
    }
  }

  private async ensureMightymaticaModule(): Promise<MightymaticaModule> {
    if (this.mightymaticaModule) return this.mightymaticaModule;
    this.mightymaticaModulePromise ??= import("./math/MightymaticaZone");
    try {
      this.mightymaticaModule = await this.mightymaticaModulePromise;
      return this.mightymaticaModule;
    } catch (error) {
      this.mightymaticaModulePromise = null;
      throw error;
    }
  }

  async ritualTeleport(zone: ZoneId): Promise<boolean> {
    if (
      this.isNavigationLocked() ||
      !this.hasEquippedTeleportPencil()
    ) {
      return false;
    }

    this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    const drawingDuration = this.reduceMotion ? 0.14 : 2.35;
    const departureDuration = this.reduceMotion ? 0.06 : 0.72;
    const moduleReady =
      zone === "math"
        ? this.ensureMightymaticaModule().then(() => undefined)
        : Promise.resolve();
    let veilActive = false;
    this.transitioning = true;
    this.syncInputState();
    this.resetJump();
    this.holdTeleportPencil();
    this.teleportRitual.start(
      new THREE.Vector3(
        this.playerPosition.x,
        Math.max(
          this.surfaceOffset + 0.008,
          this.shadowSurfaceY - 0.025,
        ),
        this.playerPosition.z,
      ),
      this.smoothedRotation,
      drawingDuration,
      this.reduceMotion,
    );
    this.hooks.onStatus(
      `The cyan pencil leaves its loop. You kneel and draw ${zoneLabels[zone]} into the floor.`,
    );

    try {
      await Promise.all([
        moduleReady,
        wait(Math.ceil(drawingDuration * 1000)),
      ]);
      if (this.disposed) return false;
      this.teleportRitual.depart(departureDuration);
      const visibleDepartureLead = this.reduceMotion ? 1 : 320;
      await wait(visibleDepartureLead);
      if (this.disposed) return false;
      veilActive = true;
      this.hooks.onTransition(true);
      await wait(
        this.reduceMotion
          ? 1
          : Math.max(
              1,
              departureDuration * 1000 - visibleDepartureLead,
            ),
      );
      if (this.disposed) return false;
      this.teleportRitual.stop();
      this.restoreTeleportPencil();
      this.player.group.rotation.y = this.smoothedRotation;
      if (zone === this.currentZone) {
        this.resetAtZoneAnchor();
      } else {
        this.buildZone(zone);
      }
      await wait(this.reduceMotion ? 1 : 150);
      return true;
    } finally {
      this.teleportRitual.stop();
      this.restoreTeleportPencil();
      this.player.group.rotation.y = this.smoothedRotation;
      this.transitioning = false;
      if (!this.disposed) {
        if (veilActive) this.hooks.onTransition(false);
        this.syncInputState();
      }
    }
  }

  async teleport(zone: ZoneId, viaPortal = false): Promise<void> {
    if (this.isNavigationLocked()) return;
    if (!viaPortal) this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    if (zone === this.currentZone) {
      this.respawn();
      return;
    }

    const arrivalFrom = viaPortal ? this.currentZone : null;
    this.transitioning = true;
    this.syncInputState();
    this.hooks.onTransition(true);
    this.hooks.onStatus(`Following signal to ${zoneLabels[zone]}…`);
    try {
      if (zone === "math") await this.ensureMightymaticaModule();
      if (this.disposed) return;
      await wait(this.reduceMotion ? 1 : 280);
      if (this.disposed) return;
      this.buildZone(zone, arrivalFrom);
      await wait(this.reduceMotion ? 1 : 140);
    } finally {
      this.transitioning = false;
      if (!this.disposed) {
        this.hooks.onTransition(false);
        this.syncInputState();
      }
    }
  }

  async terminalTeleport(zone: ZoneId): Promise<void> {
    if (this.isNavigationLocked()) return;
    this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    if (zone === this.currentZone) {
      this.respawn();
      return;
    }

    this.transitioning = true;
    this.syncInputState();
    this.resetJump();
    this.hooks.onStatus(
      `Shell route mounted. ${zoneLabels[zone]} begins rewriting the current process image.`,
    );
    let veilActive = false;
    try {
      const moduleReady =
        zone === "math"
          ? this.ensureMightymaticaModule().then(() => undefined)
          : Promise.resolve();
      const departureDuration = this.terminalTraversal.startDeparture(
        this.reduceMotion,
        this.quality,
      );
      await Promise.all([
        moduleReady,
        wait(departureDuration),
      ]);
      if (this.disposed) return;
      this.terminalTraversal.holdDissolved();

      veilActive = true;
      this.hooks.onTransition(true);
      await wait(this.reduceMotion ? 1 : 270);
      if (this.disposed) return;
      this.buildZone(zone);
      const arrivalDuration = this.terminalTraversal.startArrival(
        this.reduceMotion,
        this.quality,
      );
      await wait(this.reduceMotion ? 1 : 90);
      if (this.disposed) return;
      veilActive = false;
      this.hooks.onTransition(false);
      await wait(
        this.reduceMotion
          ? arrivalDuration
          : Math.max(1, arrivalDuration - 90),
      );
    } finally {
      this.terminalTraversal.stop();
      this.transitioning = false;
      if (!this.disposed) {
        if (veilActive) this.hooks.onTransition(false);
        this.syncInputState();
      }
    }
  }

  private updateWorldCollapse(delta: number): void {
    const collapse = this.worldCollapse;
    if (!collapse) return;
    const frame = collapse.update(delta, this.elapsed);
    this.worldCollapseFrame = frame;
    this.ambientGrid?.setWorldCollapseProgress(frame.progress);

    if (
      frame.collisionRelease &&
      !this.worldCollapseCollisionReleased
    ) {
      this.worldCollapseCollisionReleased = true;
      this.clearStaticColliders();
      this.clearSurfaceAreas();
      this.activePlatform = null;
      this.refreshCollisionDebugVisuals();
    }

    if (frame.farewell && !this.worldCollapseFarewellSent) {
      this.worldCollapseFarewellSent = true;
      this.emitWorldCollapseFarewell();
    }

    if (frame.lastEmber && !this.worldCollapseAchievementSent) {
      this.worldCollapseAchievementSent = true;
      this.emitWorldCollapseStatus(
        "You asked the world to forget you. Something remembered.",
        {
          kind: "achievement",
          title: "THE LAST EMBER",
        },
      );
    }

    if (frame.blackout && !this.worldCollapseBlackoutStarted) {
      this.worldCollapseBlackoutStarted = true;
      this.hooks.onTransition(true);
    }

    this.updateWorldCollapseSpecials(frame, delta);
    if (frame.pull > 0) {
      const follow = 1 - Math.exp(-delta * (0.8 + frame.pull * 7.5));
      this.playerPosition.x = THREE.MathUtils.lerp(
        this.playerPosition.x,
        collapse.origin.x,
        follow,
      );
      this.playerPosition.z = THREE.MathUtils.lerp(
        this.playerPosition.z,
        collapse.origin.z,
        follow,
      );
      this.player.group.position.x = this.playerPosition.x;
      this.player.group.position.z = this.playerPosition.z;
      this.player.group.position.y = THREE.MathUtils.lerp(
        this.player.group.position.y,
        collapse.origin.y - 0.38,
        follow * (0.42 + frame.pull * 0.58),
      );
      this.player.group.rotation.y += delta * frame.pull * 3.8;
      this.player.group.rotation.z =
        Math.sin(this.elapsed * 7.2) * frame.pull * 0.34;
      this.player.group.scale
        .copy(this.worldCollapsePlayerScale)
        .multiplyScalar(
          Math.max(0.012, 1 - Math.pow(frame.pull, 1.75) * 0.988),
        );
      this.playerShadow.material.opacity *=
        Math.max(0, 1 - frame.pull * 1.2);
    }

    if (frame.complete && this.worldCollapseResolve) {
      const resolve = this.worldCollapseResolve;
      this.worldCollapseResolve = null;
      this.worldCollapseReject = null;
      resolve(this.currentZone);
    }
  }

  private emitWorldCollapseStatus(
    message: string,
    options: WorldCollapseStatusOptions = {},
  ): void {
    this.hooks.onStatus(message, {
      ...options,
      channel: "event-horizon",
    });
  }

  private emitWorldCollapseFarewell(): void {
    const farewell = worldCollapseFarewells[this.currentZone];
    this.emitWorldCollapseStatus(
      farewell.message,
      farewell.options,
    );
  }

  private updateWorldCollapseSpecials(
    frame: WorldCollapseFrame,
    delta: number,
  ): void {
    if (this.reduceMotion) return;
    const { instability } = frame;
    if (this.currentZone === "field") {
      this.voidTurtleRide.reactToWorldCollapse(frame, delta);
    }

    if (this.currentZone === "falls") {
      const water = this.zoneGroup.getObjectByName("falls-river-water");
      if (water) {
        water.rotation.x -= delta * instability * 0.72;
        water.rotation.z =
          Math.sin(this.elapsed * 1.6) * instability * 0.08;
      }
      this.fallsRuneRitual.reactToWorldCollapse(frame, delta);
    }

    if (this.currentZone === "grid") {
      this.pongChallenge.reactToWorldCollapse(
        delta,
        instability,
        frame.progress,
      );
      this.hanoiPuzzle.reactToWorldCollapse(delta, instability);
      for (const [index, rack] of this.serverRacks.entries()) {
        const visible =
          Math.sin(this.elapsed * (11 + index * 1.7)) >
          -0.2 - frame.pull * 0.55;
        for (const bar of rack.bars) bar.visible = visible;
      }
    }

    if (this.currentZone === "archive") {
      this.archiveSignalPuzzle.reactToWorldCollapse(frame);
      this.archiveOrbitPlayground.reactToWorldCollapse(frame, delta);
      if (this.archiveDataGlass) {
        this.archiveDataGlass.material.opacity =
          Math.max(
            0,
            (0.72 + Math.sin(this.elapsed * 17) * 0.24) *
              (1 - frame.pull * 0.85),
          );
      }
    }
  }

  private readonly frame = (time: number): void => {
    if (!this.running || !this.documentVisible) return;
    const monitor = this.performanceMonitor;
    monitor?.callback();

    // DOM overlays lock world input, but the visible world should retain its
    // normal adaptive frame rate while a terminal or dialog is open.
    const activePointerInput =
      this.spellCharging ||
      this.hasActivePointerDrag() ||
      this.clickNavigationPress !== null ||
      (this.clickNavigationPointerInside && this.externalInputEnabled &&
        this.windowFocused && time < this.hoverPointerActiveUntil) ||
      this.elapsed < this.pointerActionReachUntil;
    const activeWorldMotion =
      this.quality !== "low" &&
      (this.input.isActive() ||
        activePointerInput ||
        this.atlasAutopilot !== null ||
        this.navigation.route !== null ||
        this.navigation.hasPending ||
        this.jumpHeight > 0 ||
        this.teleportRitual.active ||
        this.terminalTraversal.active ||
        this.compassEquipFlight !== null ||
        this.pencilEquipFlight !== null ||
        this.pongChallenge.isActive() ||
        this.voidTurtleRide.isRiding() ||
        this.heldKickable !== null ||
        (this.sprintDustTrail?.activeCount ?? 0) > 0 ||
        (this.playerIgnition?.exposure ?? 0) > 0.01 ||
        (this.playerIgnition?.burnRemaining ?? 0) > 0 ||
        (this.playerIgnition?.panicAge ?? -1) >= 0 ||
        (this.playerIgnition?.activeEmberCount ?? 0) > 0 ||
        (this.playerIgnition?.activeSmokeCount ?? 0) > 0 ||
        (this.playerIgnition?.smolderRemaining ?? 0) > 0 ||
        (this.ambientGrid?.hasActiveMotion() ?? false) ||
        this.archiveOrbitPlayground.hasPointerDrag() ||
        this.digitStormAge < this.digitStormDuration ||
        this.thunderBolts.visible ||
        this.waterfallRecoveryAge >= 0 ||
        (this.tentState?.restBlend ?? 0) > 0.002 ||
        this.splashBurst?.drops.visible === true ||
        (this.runeAltar?.hasActiveMotion() ?? false) ||
        this.archiveOrbitPlayground.hasActiveMotion() ||
        this.archiveSignalPuzzle.hasActiveMotion() ||
        this.fallsRuneRitual.hasActiveMotion() ||
        this.fallsCrystalFrog.hasActiveMotion() ||
        this.portalNetwork.hasActiveMotion() ||
        this.mathCameraFrame !== null ||
        this.serverFlickerAge < this.serverFlickerDuration ||
        this.worldCollapse !== null ||
        (this.legacySimulationCube?.rematerialization?.isActive ?? false) ||
        (this.mightymaticaZone?.hasActiveMotion() ?? false));
    const targetFrameRate = selectTargetFrameRate(
      this.quality === "low",
      activePointerInput,
      activeWorldMotion,
    );
    if (!this.framePacer.shouldRender(time, targetFrameRate)) return;
    monitor?.beginFrame(time, this.framePacer.expectedFrameIntervalMs, targetFrameRate);

    const delta = Math.min(
      0.05,
      Math.max(0.001, (time - this.previousFrame) / 1000),
    );
    this.previousFrame = time;
    this.elapsed += delta;

    this.voidTurtleRide.update(delta);
    this.teleportRitual.update(delta);
    this.updatePlayer(delta);
    monitor?.phase(1);
    this.updatePlayerIgnition(delta);
    this.updateFieldCompassEquipFlight(delta);
    this.updatePortablePencilEquipFlight(delta);
    this.updateArchiveAsteroidShadow();
    this.voidTurtleRide.updateOrbiters(delta);
    this.hanoiPuzzle.update(delta, this.elapsed);
    this.gridServerPatchPuzzle.update(delta);
    this.mightymaticaZone?.update(delta, this.elapsed);
    this.legacySimulationCube?.rematerialization?.update(delta, this.elapsed);
    this.portalNetwork.update(delta);
    this.updateTelescopeRigs(delta);
    this.archiveOrbitPlayground.update(delta);
    monitor?.phase(2);
    this.updateWanderingNpcs(delta);
    this.updateFishSchool(delta);
    monitor?.phase(3);
    this.fallsRuneRitual.update(delta);
    monitor?.phase(4);
    this.fallsFireflyField.update(this.elapsed, this.reduceMotion);
    this.fallsWaterfallMist.update(delta, this.elapsed, this.reduceMotion);
    this.fallsCrystalFrog.update(delta, this.elapsed, this.reduceMotion);
    this.runeAltar?.update(delta, this.elapsed, this.reduceMotion);
    monitor?.phase(5);
    this.updateSpell(delta);
    this.updateLantern(delta);
    this.archiveSignalPuzzle.update(delta);
    this.gridFloorTraffic.update(this.elapsed, this.reduceMotion);
    this.updateInteractions();
    monitor?.phase(6);
    this.updateAnimatedItems(delta);
    this.updateArchiveDataGlass(delta);
    this.updateWorldCollapse(delta);
    monitor?.phase(7);
    this.updateCamera(delta, false);
    this.updateHeldKickableFromPointer(delta);
    this.ambientGrid?.update(
      delta,
      this.elapsed,
      this.cameraFocus,
      this.reduceMotion,
      this.playerPosition,
      this.surfaceOffset + this.jumpHeight,
    );
    monitor?.phase(8);
    this.updatePlayerOcclusionOutline();
    this.terminalTraversal.update(delta, this.elapsed);
    monitor?.phase(9);
    this.updatePointerFeedback();
    this.updateNavigationDebug();
    monitor?.phase(10);
    this.renderScene();
    monitor?.phase(11);
    this.updateMetrics(time);
    monitor?.phase(12);
    if (monitor?.recording) this.finishPerformanceFrame(monitor);
  };

  private finishPerformanceFrame(monitor: PerformanceMonitor): void {
    const c = monitor.context;
    c.zone = this.currentZone;
    c.quality = this.quality;
    c.gameTimeS = this.elapsed;
    c.x = this.playerPosition.x;
    c.y = this.surfaceOffset + this.jumpHeight;
    c.z = this.playerPosition.z;
    c.flags = (!this.externalInputEnabled ? perfFlags.inputLocked : 0) |
      (!this.windowFocused ? perfFlags.unfocused : 0) |
      (this.transitioning ? perfFlags.transitioning : 0) |
      (this.clickNavigationPress?.continuous ? perfFlags.heldMovement : 0) |
      (this.heldKickable ? perfFlags.propHeld : 0) |
      (this.navigation.route ? perfFlags.routeActive : 0) |
      (this.navigation.hasPending ? perfFlags.planning : 0) |
      (this.jumpHeight > 0 ? perfFlags.airborne : 0) |
      (this.spellCharging ? perfFlags.spellCharging : 0) |
      (this.playerOcclusionActive ? perfFlags.occlusionPasses : 0) |
      (this.reduceMotion ? perfFlags.reducedMotion : 0) |
      (this.collisionDebugEnabled || this.navigationDebug?.enabled ? perfFlags.visualDebug : 0) |
      (this.navigation.failure ? perfFlags.navigationFailed : 0) |
      (this.fallsRuneRitual.hasActiveMotion() ? perfFlags.fallsMotion : 0) |
      (this.runeAltar?.hasActiveMotion() ? perfFlags.monumentMotion : 0);
    c.requestId = this.navigation.pendingTarget?.requestId ?? this.navigation.route?.target.requestId ?? 0;
    const info = this.renderer.info;
    c.drawCalls = info.render.calls;
    c.triangles = info.render.triangles;
    c.programs = info.programs?.length ?? 0;
    c.geometries = info.memory.geometries;
    c.textures = info.memory.textures;
    c.bufferWidth = this.canvas.width;
    c.bufferHeight = this.canvas.height;
    c.pixelRatio = this.renderer.getPixelRatio();
    c.kickables = this.kickables.length;
    c.colliders = this.staticColliders.length;
    c.surfaces = this.surfaceAreas.length;
    monitor.endFrame();
  }

  private renderScene(): void {
    const previousCameraLayerMask = this.camera.layers.mask;
    const previousAutoClear = this.renderer.autoClear;
    const previousBackground = this.scene.background;
    this.renderer.info.reset();

    try {
      if (!this.playerOcclusionActive) {
        // The common path remains one render pass: world layer zero plus the
        // avatar layer, with the reveal layer excluded.
        this.camera.layers.set(0);
        this.camera.layers.enable(playerRenderLayer);
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // When occluded, establish world depth without the avatar, compare the
      // reveal shell against that depth, then draw the normal avatar last. The
      // reveal can no longer mistake the avatar's own surfaces for occluders.
      this.camera.layers.set(0);
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);

      this.renderer.autoClear = false;
      // A Color background forces WebGLRenderer to clear even when autoClear
      // is disabled. Hide it for the two overlay passes so the outline and
      // normal avatar are composited over the completed world pass.
      this.scene.background = null;
      this.camera.layers.set(playerRevealRenderLayer);
      this.renderer.render(this.scene, this.camera);

      this.camera.layers.set(playerRenderLayer);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.scene.background = previousBackground;
      this.camera.layers.mask = previousCameraLayerMask;
      this.renderer.autoClear = previousAutoClear;
    }
  }

  private syncPlayerRenderLights(): void {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) {
        object.layers.enable(playerRenderLayer);
      }
    });
  }

  private getSpellGestureProgress(): number {
    if (this.spellCharging) {
      return (
        0.28 +
        THREE.MathUtils.smoothstep(this.spellCharge, 0, 1) * 0.72
      );
    }
    if (this.spellAge >= 0.62) return 0;
    const releaseEnvelope =
      1 - THREE.MathUtils.smoothstep(this.spellAge, 0.16, 0.62);
    return (
      releaseEnvelope *
      (0.48 + THREE.MathUtils.smoothstep(this.spellCastCharge, 0, 1) * 0.52)
    );
  }

  private updatePlayer(delta: number): void {
    const axes = this.input.getMovement();
    const manualJumpRequested = this.input.consumeJump();
    const manualMovement =
      Math.abs(axes.horizontal) > 0.01 ||
      Math.abs(axes.forward) > 0.01;
    const continuousManualOverride =
      this.clickNavigationPress?.continuous === true &&
      (manualMovement ||
        this.input.isSpellHeld());
    const queuedNavigationJump = this.navigation.consumeJump();
    const guidedJumpRequested = !continuousManualOverride && queuedNavigationJump;
    const jumpRequested =
      manualJumpRequested || guidedJumpRequested;
    const ignitionEffect = this.playerIgnition;
    sampleIgnitionPanic(
      ignitionEffect?.panicAge ?? inactiveIgnitionPanicAge,
      this.reduceMotion,
      this.ignitionPanicFrame,
    );
    if (
      ignitionEffect &&
      ignitionEffect.panicAge >= 0 &&
      !this.ignitionPanicFrame.active
    ) {
      ignitionEffect.panicAge = inactiveIgnitionPanicAge;
      ignitionEffect.smolderRemaining = Math.max(
        ignitionEffect.smolderRemaining,
        3.2,
      );
      ignitionEffect.retriggerReady = ignitionEffect.exposure <= 0.08;
      // The sampled roll ends after two complete revolutions. Normalize the
      // Euler before normal posing resumes so interpolation cannot visibly
      // unwind those revolutions in reverse.
      this.player.group.rotation.x = 0;
      this.player.group.rotation.z = 0;
    }
    const ignitionPanic = this.ignitionPanicFrame;
    const movementIntent = manualMovement;
    if (
      this.tentState?.resting &&
      (movementIntent || jumpRequested || this.input.isSpellHeld())
    ) {
      this.setTentResting(false);
    }
    if (this.waterfallRecoveryAge >= 0) {
      this.waterfallRecoveryAge += delta;
      if (this.waterfallRecoveryAge >= this.waterfallRecoveryDuration) {
        this.waterfallRecoveryAge = -1;
        this.hooks.onStatus(
          "You push yourself upright, soaked through and entirely unrepentant.",
        );
      }
    }
    if (this.tentState) {
      const target = this.tentState.resting ? 1 : 0;
      const follow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 4.8);
      this.tentState.restBlend = THREE.MathUtils.lerp(
        this.tentState.restBlend,
        target,
        follow,
      );
      if (!this.tentState.resting && this.tentState.restBlend < 0.002) {
        this.tentState.restBlend = 0;
      }
    }
    const ordinaryMovementLocked =
      this.tentState?.resting === true ||
      this.waterfallRecoveryAge >= 0 ||
      this.teleportRitual.active;
    const actionLocked =
      ordinaryMovementLocked || ignitionPanic.active;
    if (this.voidTurtleRide.isRiding()) {
      axes.horizontal = 0;
      axes.forward = 0;
    }
    if (ordinaryMovementLocked) {
      axes.horizontal = 0;
      axes.forward = 0;
    }
    if (!actionLocked && this.input.isSpellHeld()) this.beginSpellCharge();
    const spellReleased = this.input.consumeSpell();
    if (!actionLocked && spellReleased) {
      if (this.spellCharging) this.releaseSpellCharge();
      else this.castSpell(0.05);
    }
    const previousFeetHeight = this.surfaceOffset + this.jumpHeight;
    const manualClickJumpStarted =
      manualJumpRequested &&
      !manualMovement &&
      this.navigation.route !== null &&
      this.jumpHeight <= 0 &&
      this.jumpVelocity <= 0;
    this.updateJump(
      delta,
      jumpRequested &&
        !actionLocked &&
        !this.pongChallenge.isActive() &&
        !this.voidTurtleRide.isRiding(),
    );
    this.pongChallenge.update(delta, -axes.forward);
    if (this.pongChallenge.isActive()) {
      axes.horizontal = 0;
      axes.forward = 0;
    }
    if (this.cameraForward.lengthSq() === 0) {
      this.cameraForward.set(-this.cameraOffset.x, 0, -this.cameraOffset.z).normalize();
      this.cameraRight.crossVectors(this.cameraForward, up).normalize();
    }
    if (
      !actionLocked &&
      !this.pongChallenge.isActive() &&
      !this.voidTurtleRide.isRiding()
    ) {
      const navigationStartedAt = this.performanceMonitor?.recording ? performance.now() : 0;
      this.updateAtlasAutopilotInput(
        axes,
        delta,
        movementIntent,
        manualJumpRequested,
      );
      if (!this.atlasAutopilot) {
        this.navigation.update(
          axes,
          delta,
          movementIntent,
          manualClickJumpStarted,
        );
      }
      if (this.performanceMonitor?.recording) {
        this.performanceMonitor.addNested("navigation", performance.now() - navigationStartedAt);
      }
    } else if (this.navigation.route || this.navigation.hasPending) {
      this.navigation.cancel();
    }
    const panicMoving =
      ignitionPanic.active && ignitionPanic.movementSpeed > 0.01;
    const moving = ignitionPanic.active
      ? panicMoving
      : Math.abs(axes.horizontal) > 0.01 ||
        Math.abs(axes.forward) > 0.01;

    if (ignitionPanic.active) {
      if (panicMoving) {
        if (ignitionEffect) {
          this.updateIgnitionPanicRandomWalk(
            ignitionEffect,
            ignitionPanic,
            delta,
          );
        }
        const heading =
          this.ignitionPanicHeading + ignitionPanic.headingOffset;
        const travelHeading =
          ignitionPanic.phase === "roll"
            ? heading + Math.PI / 2
            : heading;
        this.movement.set(
          Math.sin(travelHeading),
          0,
          Math.cos(travelHeading),
        );
        this.ignitionSteering
          .copy(this.cameraForward)
          .multiplyScalar(axes.forward)
          .addScaledVector(this.cameraRight, axes.horizontal);
        if (this.ignitionSteering.lengthSq() > 0.0001) {
          this.ignitionSteering.normalize();
          const steeringInfluence =
            ignitionPanic.phase === "run" ? 0.28 : 0.12;
          this.movement
            .lerp(this.ignitionSteering, steeringInfluence)
            .normalize();
        }
        this.movement.multiplyScalar(
          ignitionPanic.movementSpeed * delta,
        );
      } else {
        this.movement.set(0, 0, 0);
      }
    } else {
      this.movement
        .copy(this.cameraForward)
        .multiplyScalar(axes.forward)
        .addScaledVector(this.cameraRight, axes.horizontal);
      if (this.movement.lengthSq() > 1) this.movement.normalize();
      const speed =
        (axes.running ? playerSprintingSpeed : playerWalkingSpeed) * this.speedMultiplier;
      this.movement.multiplyScalar(speed * delta);
    }

    const translation = this.playerPosition;
    const previousPlayerX = translation.x;
    const previousPlayerZ = translation.z;
    this.desiredPosition.set(
      translation.x + this.movement.x,
      this.spawn.y,
      translation.z + this.movement.z,
    );
    this.constrainToBounds(this.desiredPosition);

    if (moving) {
      if (this.noclip) {
        this.playerPosition.copy(this.desiredPosition);
      } else {
        this.moveWithCollisions(this.desiredPosition, previousFeetHeight);
      }
    }

    const position = this.playerPosition;
    const walkAmount = moving ? Math.min(1, this.movement.length() / Math.max(delta, 0.001)) : 0;
    const grounded = this.jumpHeight <= 0;
    const worldMotionScale = this.reduceMotion ? 0.32 : 1;
    const turtleDismounting = this.voidTurtleRide.isDismounting();
    const surfaceOffset = turtleDismounting
      ? this.voidTurtleRide.getDismountHeight()
      : this.updateWorldSurface(
          delta,
          position,
          previousFeetHeight,
          previousPlayerX,
          previousPlayerZ,
        );
    const bob =
      !moving || !grounded
        ? 0
        : Math.sin(this.elapsed * 10.5) * 0.045 * worldMotionScale;
    this.player.group.position.set(
      position.x,
      this.jumpHeight + surfaceOffset + bob,
      position.z,
    );
    if (this.jumpHeight > 0.02 || Math.abs(this.jumpVelocity) > 0.02) {
      this.airbornePeakHeight = Math.max(
        this.airbornePeakHeight,
        this.jumpHeight + surfaceOffset,
      );
    } else if (!this.playerInWater && this.waterfallRecoveryAge < 0) {
      this.airbornePeakHeight = 0;
    }

    const restBlend = this.tentState?.restBlend ?? 0;
    const recoveryBlend =
      this.waterfallRecoveryAge < 0
        ? 0
        : THREE.MathUtils.smoothstep(this.waterfallRecoveryAge, 0, 0.2) *
          (1 -
            THREE.MathUtils.smoothstep(
              this.waterfallRecoveryAge,
              1.35,
              this.waterfallRecoveryDuration,
            ));
    const ritualBlend = this.teleportRitual.poseBlend;
    const panicProneBlend = ignitionPanic.proneBlend;
    const proneBlend = Math.max(
      restBlend,
      recoveryBlend,
      panicProneBlend,
    );
    const poseFollow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 12);
    // The avatar faces local +Z. Pitching backward around local X leaves the
    // face upward; rolling around Z was what made the splash pose land sideways.
    this.player.group.rotation.x = THREE.MathUtils.lerp(
      this.player.group.rotation.x,
      -Math.PI * 0.48 * proneBlend + ritualBlend * 0.22,
      poseFollow,
    );
    this.player.group.rotation.z = THREE.MathUtils.lerp(
      this.player.group.rotation.z,
      0,
      poseFollow,
    );
    if (ignitionPanic.active && ignitionPanic.rollAngle > 0) {
      this.player.group.rotation.x =
        -Math.PI * 0.48 * panicProneBlend;
    }
    this.player.group.position.y +=
      restBlend * 0.54 +
      recoveryBlend * 0.42 +
      panicProneBlend * 0.46 -
      ritualBlend * 0.18;
    const shadowScale =
      1 - Math.min(0.28, this.shadowVerticalDistance * 0.075);
    this.playerShadow.position.set(position.x, this.shadowSurfaceY, position.z);
    this.playerShadow.scale.setScalar(shadowScale);
    this.playerShadow.material.opacity =
      0.4 *
      (1 - Math.min(0.55, this.shadowVerticalDistance * 0.11)) *
      (1 - proneBlend * 0.72) *
      (1 - ritualBlend * 0.18);
    const traveledX = position.x - previousPlayerX;
    const traveledZ = position.z - previousPlayerZ;
    this.updateSprintDustTrail(
      delta,
      (axes.running || ignitionPanic.phase === "run") &&
        moving &&
        grounded &&
        !this.playerInWater &&
        traveledX * traveledX + traveledZ * traveledZ > 0.000004,
      traveledX,
      traveledZ,
    );

    const stride =
      !grounded
        ? 0.28
        : ignitionPanic.phase === "run"
          ? Math.sin(this.elapsed * 18.5) * 0.76 * worldMotionScale
        : moving
          ? Math.sin(this.elapsed * 10.5) * 0.5 * worldMotionScale
          : 0;
    const pongReaching = this.pongChallenge.getReachTarget(this.tempWorld);
    const mathInstanceReaching = this.mathInstanceDragHold !== null;
    const pointerActionReaching =
      this.pointerActionReachTarget?.visible === true &&
      this.elapsed < this.pointerActionReachUntil;
    if (!pongReaching && mathInstanceReaching) {
      this.tempWorld.copy(
        this.mathInstanceDragHold?.currentWorldPosition ?? position,
      );
    } else if (!pongReaching && pointerActionReaching) {
      this.pointerActionReachTarget?.getWorldPosition(this.tempWorld);
    }
    const primaryHeldOrbitingPlanet =
      this.archiveOrbitPlayground.getHeldTarget();
    const ambientGridReaching =
      this.ambientGrid?.getDragTarget(this.ambientGridDragTarget) ?? false;
    const reaching =
      !ignitionPanic.active &&
      (this.heldKickable !== null ||
        primaryHeldOrbitingPlanet !== null ||
        ambientGridReaching ||
        this.hanoiPuzzle.isHoldingCoin() ||
        pongReaching ||
        mathInstanceReaching ||
        pointerActionReaching);
    const spellGesture = ignitionPanic.active
      ? 0
      : this.getSpellGestureProgress();
    const armFollow = this.reduceMotion
      ? 1
      : 1 - Math.exp(-delta * (spellGesture > 0.01 ? 15 : 10));
    const leftArmTargetX = THREE.MathUtils.lerp(
      this.lanternEnabled ? -0.68 : stride,
      -0.44,
      spellGesture,
    );
    const rightArmTargetX = THREE.MathUtils.lerp(
      reaching ? -0.88 : -stride,
      -0.44,
      spellGesture,
    );
    this.player.leftArm.rotation.x = THREE.MathUtils.lerp(
      this.player.leftArm.rotation.x,
      leftArmTargetX,
      armFollow,
    );
    this.player.leftArm.rotation.z = THREE.MathUtils.lerp(
      this.player.leftArm.rotation.z,
      THREE.MathUtils.lerp(-0.17, -2.55, spellGesture),
      armFollow,
    );
    this.player.leftArm.scale.y = THREE.MathUtils.lerp(
      this.player.leftArm.scale.y,
      1,
      armFollow,
    );
    this.player.rightArm.rotation.x = THREE.MathUtils.lerp(
      this.player.rightArm.rotation.x,
      rightArmTargetX,
      armFollow,
    );
    this.player.rightArm.rotation.z = THREE.MathUtils.lerp(
      this.player.rightArm.rotation.z,
      THREE.MathUtils.lerp(0.17, 2.55, spellGesture),
      armFollow,
    );
    this.player.rightArm.scale.y = THREE.MathUtils.lerp(
      this.player.rightArm.scale.y,
      THREE.MathUtils.lerp(reaching ? 1.7 : 1, 1, spellGesture),
      armFollow,
    );
    this.player.leftLeg.rotation.x = THREE.MathUtils.lerp(this.player.leftLeg.rotation.x, -stride * 0.7, 0.2);
    this.player.rightLeg.rotation.x = THREE.MathUtils.lerp(this.player.rightLeg.rotation.x, stride * 0.7, 0.2);
    if (proneBlend > 0.01) {
      this.player.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.player.leftArm.rotation.x,
        -0.2,
        proneBlend * 0.24,
      );
      this.player.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.player.rightArm.rotation.x,
        0.28,
        proneBlend * 0.24,
      );
      this.player.leftArm.rotation.z = THREE.MathUtils.lerp(
        this.player.leftArm.rotation.z,
        -0.17,
        proneBlend * 0.3,
      );
      this.player.rightArm.rotation.z = THREE.MathUtils.lerp(
        this.player.rightArm.rotation.z,
        0.17,
        proneBlend * 0.3,
      );
      this.player.leftLeg.rotation.x = THREE.MathUtils.lerp(
        this.player.leftLeg.rotation.x,
        -0.22,
        proneBlend * 0.24,
      );
      this.player.rightLeg.rotation.x = THREE.MathUtils.lerp(
        this.player.rightLeg.rotation.x,
        0.24,
        proneBlend * 0.24,
      );
    }
    if (ritualBlend > 0.01) {
      const ritualPoseFollow = ritualBlend * (this.reduceMotion ? 1 : 0.34);
      this.player.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.player.leftArm.rotation.x,
        -1.05,
        ritualPoseFollow,
      );
      this.player.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.player.rightArm.rotation.x,
        -1.48,
        ritualPoseFollow,
      );
      this.player.leftArm.rotation.z = THREE.MathUtils.lerp(
        this.player.leftArm.rotation.z,
        -0.17,
        ritualPoseFollow,
      );
      this.player.rightArm.rotation.z = THREE.MathUtils.lerp(
        this.player.rightArm.rotation.z,
        0.17,
        ritualPoseFollow,
      );
      this.player.rightArm.scale.y = THREE.MathUtils.lerp(
        this.player.rightArm.scale.y,
        1.18,
        ritualPoseFollow,
      );
      this.player.leftLeg.rotation.x = THREE.MathUtils.lerp(
        this.player.leftLeg.rotation.x,
        -0.92,
        ritualPoseFollow,
      );
      this.player.rightLeg.rotation.x = THREE.MathUtils.lerp(
        this.player.rightLeg.rotation.x,
        0.42,
        ritualPoseFollow,
      );
    }
    if (ignitionPanic.active) {
      const flail = ignitionPanic.flailStrength;
      const flailWave = this.reduceMotion
        ? 0.4
        : Math.sin(this.elapsed * 17.5);
      this.player.leftArm.rotation.x =
        -0.75 - flailWave * 0.82 * flail;
      this.player.rightArm.rotation.x =
        -0.75 + flailWave * 0.82 * flail;
      this.player.leftArm.rotation.z =
        -0.72 - flail * (0.58 + Math.abs(flailWave) * 0.32);
      this.player.rightArm.rotation.z =
        0.72 + flail * (0.58 + Math.abs(flailWave) * 0.32);
      this.player.leftLeg.rotation.x = -stride;
      this.player.rightLeg.rotation.x = stride;
    }
    this.player.lantern.rotation.z =
      !grounded
        ? THREE.MathUtils.clamp(-this.jumpVelocity * 0.035, -0.2, 0.2)
        : this.reduceMotion || !moving
          ? 0
          : Math.sin(this.elapsed * 7.5) *
            0.09 *
            walkAmount *
            worldMotionScale;

    const reachingTarget =
      ignitionPanic.active
        ? undefined
        : (this.heldKickable?.object.position ??
          primaryHeldOrbitingPlanet ??
          (ambientGridReaching
            ? this.ambientGridDragTarget
            : undefined) ??
          (pongReaching ||
          mathInstanceReaching ||
          pointerActionReaching
            ? this.tempWorld
            : undefined));
    if (ignitionPanic.active) {
      const panicYaw =
        ignitionPanic.phase === "roll"
          ? this.ignitionPanicHeading + ignitionPanic.headingOffset
          : this.movement.lengthSq() > 0.0001
          ? Math.atan2(this.movement.x, this.movement.z)
          : this.ignitionPanicHeading + ignitionPanic.headingOffset;
      this.smoothedRotation = panicYaw;
      if (ignitionPanic.rollAngle > 0) {
        // Compose yaw first, then the local pitch/tumble. Assigning Euler X
        // after Y made the roll axis drift as the avatar changed heading.
        this.ignitionYawQuaternion.setFromAxisAngle(up, panicYaw);
        this.ignitionPitchQuaternion.setFromAxisAngle(
          avatarPitchAxis,
          -Math.PI * 0.48 * panicProneBlend,
        );
        this.ignitionRollQuaternion.setFromAxisAngle(
          avatarLongAxis,
          ignitionPanic.rollAngle,
        );
        this.player.group.quaternion
          .copy(this.ignitionYawQuaternion)
          .multiply(this.ignitionPitchQuaternion)
          .multiply(this.ignitionRollQuaternion);
      } else {
        this.player.group.rotation.y = panicYaw;
      }
    } else if (this.teleportRitual.active) {
      this.player.group.rotation.y =
        this.smoothedRotation + this.teleportRitual.avatarSpin;
    } else if ((moving && this.movement.lengthSq() > 0.0001) || reachingTarget) {
      const target = reachingTarget
        ? Math.atan2(
            reachingTarget.x - position.x,
            reachingTarget.z - position.z,
          )
        : Math.atan2(this.movement.x, this.movement.z);
      const deltaRotation = Math.atan2(
        Math.sin(target - this.smoothedRotation),
        Math.cos(target - this.smoothedRotation),
      );
      this.smoothedRotation += deltaRotation * Math.min(1, delta * 12);
      this.player.group.rotation.y = this.smoothedRotation;
    }
    this.updateCompassHeading();
    this.pongChallenge.kickLooseBall(moving);
    const propsStartedAt = this.performanceMonitor?.recording ? performance.now() : 0;
    this.updateKickables(delta, moving);
    this.updateFieldRockClusters(delta, moving);
    this.fallsRuneRitual.updatePlacements();
    if (this.performanceMonitor?.recording) {
      this.performanceMonitor.addNested("props", performance.now() - propsStartedAt);
    }
  }

  private updateIgnitionPanicRandomWalk(
    effect: PlayerIgnitionEffect,
    frame: IgnitionPanicFrame,
    delta: number,
  ): void {
    if (frame.phase !== "run") {
      effect.panicTurnTimer = Math.max(0, effect.panicTurnTimer - delta);
      return;
    }
    effect.panicTurnTimer -= delta;
    if (effect.panicTurnTimer <= 0) {
      const turnSample = this.nextPlayerIgnitionRandom(effect);
      const intervalSample = this.nextPlayerIgnitionRandom(effect);
      effect.panicTurnTarget =
        (turnSample - 0.5) * Math.PI * 1.35;
      effect.panicTurnTimer = 0.18 + intervalSample * 0.34;
    }
    const turnFollow =
      this.reduceMotion ? 1 : 1 - Math.exp(-delta * 4.6);
    effect.panicTurnVelocity = THREE.MathUtils.lerp(
      effect.panicTurnVelocity,
      effect.panicTurnTarget,
      turnFollow,
    );
    this.ignitionPanicHeading += effect.panicTurnVelocity * delta;

    // Bias a wanderer back toward the station centre before the random walk
    // can accidentally steer the joke into open space.
    const distanceFromCentre = Math.hypot(
      this.playerPosition.x,
      this.playerPosition.z,
    );
    if (distanceFromCentre > 9.2) {
      const inwardHeading = Math.atan2(
        -this.playerPosition.x,
        -this.playerPosition.z,
      );
      const difference = Math.atan2(
        Math.sin(inwardHeading - this.ignitionPanicHeading),
        Math.cos(inwardHeading - this.ignitionPanicHeading),
      );
      this.ignitionPanicHeading +=
        difference *
        (1 - Math.exp(-delta * (distanceFromCentre - 8.6) * 1.8));
    }
  }

  private createPlayerIgnitionEffect(): void {
    const heatShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 10, 7),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        wireframe: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    heatShell.name = "player-heliograph-heat-shell";
    heatShell.position.y = 1.42;
    heatShell.scale.set(0.82, 1.38, 0.82);
    heatShell.visible = false;
    heatShell.renderOrder = 8;
    heatShell.layers.set(playerRenderLayer);
    this.player.group.add(heatShell);

    const maximumFlameCount = 16;
    const flameGeometry = new THREE.ConeGeometry(
      0.28,
      1.08,
      6,
      3,
      false,
    );
    const flamePositions = flameGeometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let index = 0; index < flamePositions.count; index += 1) {
      const height = THREE.MathUtils.clamp(
        (flamePositions.getY(index) + 0.54) / 1.08,
        0,
        1,
      );
      // A small upper-body bend makes these read as licks of fire rather than
      // decorative cones, while retaining one cheap shared low-poly mesh.
      flamePositions.setX(
        index,
        flamePositions.getX(index) +
          height * height * 0.16,
      );
    }
    flamePositions.needsUpdate = true;
    const flames = new THREE.InstancedMesh(
      flameGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumFlameCount,
    );
    flames.name = "player-heliograph-flames";
    flames.count = 0;
    flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flames.frustumCulled = false;
    flames.visible = false;
    flames.renderOrder = 9;
    flames.layers.set(playerRenderLayer);
    const flameColors = [
      palette.amber,
      palette.coral,
      0xffd66f,
      palette.cyan,
    ] as const;
    for (let index = 0; index < maximumFlameCount; index += 1) {
      flames.setColorAt(
        index,
        new THREE.Color(
          flameColors[index % flameColors.length] ?? palette.amber,
        ),
      );
    }
    this.player.group.add(flames);

    const fireLight = new THREE.PointLight(
      palette.coral,
      0,
      5.2,
      2,
    );
    fireLight.name = "player-heliograph-fire-light";
    fireLight.position.y = 1.48;
    fireLight.castShadow = false;
    fireLight.layers.set(0);
    fireLight.layers.enable(playerRenderLayer);
    this.scene.add(fireLight);

    const maximumEmberCount = 24;
    const emberPositions = new Float32Array(maximumEmberCount * 3);
    const emberVelocities = new Float32Array(maximumEmberCount * 3);
    const emberColors = new Float32Array(maximumEmberCount * 3);
    for (let index = 0; index < maximumEmberCount; index += 1) {
      emberPositions[index * 3 + 1] = -1000;
    }
    const emberGeometry = new THREE.BufferGeometry();
    const emberPositionAttribute = new THREE.BufferAttribute(
      emberPositions,
      3,
    );
    const emberColorAttribute = new THREE.BufferAttribute(emberColors, 3);
    emberPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    emberColorAttribute.setUsage(THREE.DynamicDrawUsage);
    emberGeometry.setAttribute("position", emberPositionAttribute);
    emberGeometry.setAttribute("color", emberColorAttribute);
    emberGeometry.setDrawRange(0, maximumEmberCount);

    const emberCanvas = document.createElement("canvas");
    emberCanvas.width = 32;
    emberCanvas.height = 32;
    const emberContext = emberCanvas.getContext("2d");
    if (emberContext) {
      const glow = emberContext.createRadialGradient(
        16,
        16,
        1,
        16,
        16,
        15,
      );
      glow.addColorStop(0, "rgba(255,255,255,1)");
      glow.addColorStop(0.18, "rgba(255,218,126,.98)");
      glow.addColorStop(0.52, "rgba(255,111,65,.58)");
      glow.addColorStop(1, "rgba(255,70,35,0)");
      emberContext.fillStyle = glow;
      emberContext.fillRect(0, 0, 32, 32);
    }
    const emberTexture = new THREE.CanvasTexture(emberCanvas);
    emberTexture.colorSpace = THREE.SRGBColorSpace;
    emberTexture.generateMipmaps = false;
    emberTexture.minFilter = THREE.LinearFilter;
    emberTexture.magFilter = THREE.LinearFilter;
    const embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 6,
        map: emberTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        alphaTest: 0.025,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
        toneMapped: false,
      }),
    );
    embers.name = "player-heliograph-embers";
    embers.visible = false;
    embers.frustumCulled = false;
    embers.renderOrder = 8;
    this.scene.add(embers);

    const maximumSmokeCount = 14;
    const smoke = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({
        color: 0x667176,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        fog: true,
        toneMapped: false,
      }),
      maximumSmokeCount,
    );
    smoke.name = "player-heliograph-smoke";
    smoke.count = 0;
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = false;
    smoke.visible = false;
    smoke.renderOrder = 7;
    this.scene.add(smoke);

    this.playerIgnition = {
      heatShell,
      flames,
      flameDummy: new THREE.Object3D(),
      fireLight,
      embers,
      emberPositions,
      emberVelocities,
      emberColors,
      emberRemainingLife: new Float32Array(maximumEmberCount),
      emberLifetimes: new Float32Array(maximumEmberCount),
      maximumEmberCount,
      activeEmberCapacity: maximumEmberCount,
      emberCursor: 0,
      emberEmissionRemainder: 0,
      activeEmberCount: 0,
      smoke,
      smokeDummy: new THREE.Object3D(),
      smokePositions: new Float32Array(maximumSmokeCount * 3),
      smokeVelocities: new Float32Array(maximumSmokeCount * 3),
      smokeRemainingLife: new Float32Array(maximumSmokeCount),
      smokeLifetimes: new Float32Array(maximumSmokeCount),
      maximumSmokeCount,
      activeSmokeCapacity: maximumSmokeCount,
      smokeCursor: 0,
      smokeEmissionRemainder: 0,
      activeSmokeCount: 0,
      exposure: 0,
      burnRemaining: 0,
      smolderRemaining: 0,
      panicAge: inactiveIgnitionPanicAge,
      retriggerReady: true,
      panicTurnTarget: 0,
      panicTurnVelocity: 0,
      panicTurnTimer: 0,
      warningIssued: false,
      randomState: 0x4f1bbcdc,
    };
  }

  private setPlayerIgnitionQuality(quality: QualityTier): void {
    const effect = this.playerIgnition;
    if (!effect) return;
    effect.fireLight.visible = quality !== "low";
    effect.activeEmberCapacity =
      quality === "low"
        ? 12
        : quality === "medium"
          ? 20
          : effect.maximumEmberCount;
    effect.emberCursor %= effect.activeEmberCapacity;
    effect.embers.geometry.setDrawRange(
      0,
      effect.activeEmberCapacity,
    );
    effect.embers.material.size =
      quality === "low" ? 7 : quality === "medium" ? 8 : 9.5;
    effect.activeSmokeCapacity =
      quality === "low"
        ? 6
        : quality === "medium"
          ? 10
          : effect.maximumSmokeCount;
    effect.smokeCursor %= effect.activeSmokeCapacity;
    effect.smoke.material.opacity =
      quality === "low" ? 0.34 : quality === "medium" ? 0.4 : 0.46;
    for (
      let index = effect.activeEmberCapacity;
      index < effect.maximumEmberCount;
      index += 1
    ) {
      const offset = index * 3;
      effect.emberRemainingLife[index] = 0;
      effect.emberPositions[offset + 1] = -1000;
      effect.emberColors[offset] = 0;
      effect.emberColors[offset + 1] = 0;
      effect.emberColors[offset + 2] = 0;
    }
    for (
      let index = effect.activeSmokeCapacity;
      index < effect.maximumSmokeCount;
      index += 1
    ) {
      effect.smokeRemainingLife[index] = 0;
    }
  }

  private resetPlayerIgnition(): void {
    const effect = this.playerIgnition;
    if (!effect) return;
    effect.exposure = 0;
    effect.burnRemaining = 0;
    effect.smolderRemaining = 0;
    effect.panicAge = inactiveIgnitionPanicAge;
    effect.retriggerReady = true;
    effect.panicTurnTarget = 0;
    effect.panicTurnVelocity = 0;
    effect.panicTurnTimer = 0;
    effect.warningIssued = false;
    effect.emberRemainingLife.fill(0);
    effect.emberColors.fill(0);
    for (let index = 0; index < effect.maximumEmberCount; index += 1) {
      effect.emberPositions[index * 3 + 1] = -1000;
    }
    effect.emberCursor = 0;
    effect.emberEmissionRemainder = 0;
    effect.activeEmberCount = 0;
    effect.smokeRemainingLife.fill(0);
    effect.smokeCursor = 0;
    effect.smokeEmissionRemainder = 0;
    effect.activeSmokeCount = 0;
    effect.heatShell.visible = false;
    effect.flames.count = 0;
    effect.flames.visible = false;
    effect.fireLight.intensity = 0;
    effect.embers.visible = false;
    effect.smoke.count = 0;
    effect.smoke.visible = false;
    (
      effect.embers.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      effect.embers.geometry.getAttribute(
        "color",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  private isPlayerInHeliographFocus(): boolean {
    return (
      this.currentZone === "archive" &&
      this.archiveSignalPuzzle.isPlayerInCollectorFocus()
    );
  }

  private updatePlayerIgnition(delta: number): void {
    const effect = this.playerIgnition;
    if (!effect) return;
    const exposed = this.isPlayerInHeliographFocus();
    const wasBurningOrSmoldering =
      effect.burnRemaining > 0 || effect.smolderRemaining > 0;
    if (effect.panicAge >= 0) {
      effect.panicAge += delta;
      if (this.playerInWater) {
        effect.panicAge = inactiveIgnitionPanicAge;
      }
    }
    if (effect.panicAge < 0 && effect.smolderRemaining > 0) {
      effect.smolderRemaining = Math.max(
        0,
        effect.smolderRemaining - delta,
      );
    }
    if (exposed) {
      effect.exposure = Math.min(
        heliographIgnitionDelay + 0.2,
        effect.exposure + delta,
      );
    } else {
      effect.exposure = Math.max(0, effect.exposure - delta * 2.5);
      if (
        effect.panicAge < 0 &&
        effect.exposure <= 0.08
      ) {
        effect.retriggerReady = true;
      }
    }

    if (
      effect.burnRemaining <= 0 &&
      effect.exposure >= 0.52 &&
      !effect.warningIssued
    ) {
      effect.warningIssued = true;
      this.hooks.onStatus(
        "The air around your hat tightens into a very small summer.",
      );
    }
    const initialIgnition =
      effect.burnRemaining <= 0 &&
      effect.panicAge < 0 &&
      effect.exposure >= heliographIgnitionDelay;
    const repeatedIgnition =
      effect.burnRemaining > 0 &&
      effect.panicAge < 0 &&
      effect.retriggerReady &&
      effect.exposure >= heliographPanicRetriggerDelay;
    if (initialIgnition || repeatedIgnition) {
      this.startPlayerIgnitionPanic(effect, repeatedIgnition);
    } else if (effect.burnRemaining > 0) {
      effect.burnRemaining = exposed
        ? Math.max(effect.burnRemaining, heliographBurnDuration)
        : Math.max(0, effect.burnRemaining - delta);
    }

    if (effect.burnRemaining > 0 && this.playerInWater) {
      effect.burnRemaining = 0;
      effect.smolderRemaining = 0;
      effect.exposure = 0;
      effect.panicAge = inactiveIgnitionPanicAge;
      effect.retriggerReady = true;
      this.hooks.onStatus(
        "The river puts the spectral fire out with professional indifference.",
      );
    } else if (
      wasBurningOrSmoldering &&
      effect.burnRemaining <= 0 &&
      effect.smolderRemaining <= 0
    ) {
      this.hooks.onStatus("The last blue ember gives up.");
    }
    if (
      effect.exposure <= 0.01 &&
      effect.burnRemaining <= 0 &&
      effect.smolderRemaining <= 0
    ) {
      effect.warningIssued = false;
    }

    const thermalStrength =
      effect.burnRemaining <= 0
        ? 0
        : THREE.MathUtils.smoothstep(effect.burnRemaining, 0, 0.8);
    const panicFlameStrength =
      effect.panicAge >= 0
        ? this.ignitionPanicFrame.flameStrength
        : 0;
    const flameStrength = thermalStrength * panicFlameStrength;
    const smolderStrength = Math.max(
      this.ignitionPanicFrame.smokeStrength,
      THREE.MathUtils.smoothstep(
        effect.smolderRemaining,
        0,
        3.2,
      ),
    );
    const heatStrength = Math.max(
      Math.min(1, effect.exposure / heliographIgnitionDelay),
      flameStrength * 0.28,
    );
    effect.heatShell.visible = heatStrength > 0.01;
    effect.heatShell.material.opacity =
      heatStrength *
      (0.06 +
        (this.reduceMotion
          ? 0
          : Math.sin(this.elapsed * 8.2) * 0.018));
    effect.heatShell.rotation.y +=
      this.reduceMotion ? 0 : delta * (0.28 + heatStrength * 0.72);
    const heatScale =
      0.86 +
      heatStrength * 0.26 +
      (this.reduceMotion ? 0 : Math.sin(this.elapsed * 5.4) * 0.025);
    effect.heatShell.scale.set(
      heatScale * 1.08,
      1.4 + heatStrength * 0.34,
      heatScale * 1.08,
    );

    const flameCount =
      flameStrength <= 0.025
        ? 0
        : this.reduceMotion || this.quality === "low"
          ? 8
          : this.quality === "medium"
            ? 12
            : 16;
    effect.flames.count = flameCount;
    effect.flames.visible = flameCount > 0;
    effect.flames.material.opacity =
      Math.min(1, 0.72 + flameStrength * 0.28);
    for (let index = 0; index < flameCount; index += 1) {
      const angle =
        index * 2.399963 +
        (this.reduceMotion ? 0 : Math.sin(this.elapsed * 1.7) * 0.08);
      const level = index % 5;
      const radius = 0.58 + (index % 3) * 0.085;
      const flame = effect.flameDummy;
      flame.position.set(
        Math.cos(angle) * radius,
        0.25 + level * 0.48,
        Math.sin(angle) * radius,
      );
      flame.rotation.set(
        (index % 2 === 0 ? -1 : 1) * 0.14,
        -angle,
        Math.sin(angle) * 0.16,
      );
      const flicker = this.reduceMotion
        ? 1
        : 0.78 +
          Math.sin(this.elapsed * 16.5 + index * 1.9) * 0.22;
      const scale =
        flameStrength * flicker * (1.38 + level * 0.1);
      flame.scale.set(
        scale * (0.9 + (index % 2) * 0.18),
        scale * (1.35 + (index % 3) * 0.18),
        scale,
      );
      flame.updateMatrix();
      effect.flames.setMatrixAt(index, flame.matrix);
    }
    if (flameCount > 0) {
      effect.flames.instanceMatrix.needsUpdate = true;
    }
    effect.fireLight.intensity =
      this.quality === "low"
        ? 0
        : flameStrength *
          (5.2 +
            (this.reduceMotion
              ? 0
              : Math.sin(this.elapsed * 14.5) * 1.1)) *
          (this.quality === "medium" ? 0.74 : 1);
    effect.fireLight.position.set(
      this.player.group.position.x,
      this.player.group.position.y + 1.32,
      this.player.group.position.z,
    );

    this.updatePlayerIgnitionEmbers(
      effect,
      delta,
      Math.max(flameStrength, smolderStrength * 0.16),
    );
    this.updatePlayerIgnitionSmoke(effect, delta, smolderStrength);
  }

  private startPlayerIgnitionPanic(
    effect: PlayerIgnitionEffect,
    repeated: boolean,
  ): void {
    effect.burnRemaining = Math.max(
      effect.burnRemaining,
      heliographBurnDuration,
    );
    effect.smolderRemaining = 0;
    effect.panicAge = 0;
    effect.exposure = 0;
    effect.retriggerReady = false;
    effect.panicTurnTarget = 0;
    effect.panicTurnVelocity = 0;
    effect.panicTurnTimer = 0;
    const inwardHeading = Math.atan2(
      -this.playerPosition.x,
      -this.playerPosition.z,
    );
    this.ignitionPanicHeading =
      inwardHeading +
      (this.nextPlayerIgnitionRandom(effect) - 0.5) * 0.5;
    this.cancelAtlasAutopilot(false);
    this.navigation.cancel();
    this.cancelAllPointerDrags(false);
    this.cancelSpellCharge();
    this.resetJump();
    if (this.tentState?.resting) this.setTentResting(false);
    this.hooks.onStatus(
      repeated
        ? "You return to the focus while your coat still smoulders. The lens accepts this as a request for another demonstration."
        : "A lens is, regrettably, still a lens. Your coat catches spectral fire. You exercise the ancient emergency procedure of running about.",
    );
  }

  private updatePlayerIgnitionEmbers(
    effect: PlayerIgnitionEffect,
    delta: number,
    burnStrength: number,
  ): void {
    const hadActiveEmbers = effect.activeEmberCount > 0;
    let activeCount = 0;
    const damping = Math.exp(-delta * 1.8);
    for (
      let index = 0;
      index < effect.activeEmberCapacity;
      index += 1
    ) {
      const remaining =
        (effect.emberRemainingLife[index] ?? 0) - delta;
      const offset = index * 3;
      if (remaining <= 0) {
        if ((effect.emberRemainingLife[index] ?? 0) > 0) {
          effect.emberPositions[offset + 1] = -1000;
          effect.emberColors[offset] = 0;
          effect.emberColors[offset + 1] = 0;
          effect.emberColors[offset + 2] = 0;
        }
        effect.emberRemainingLife[index] = 0;
        continue;
      }
      effect.emberRemainingLife[index] = remaining;
      effect.emberPositions[offset] =
        (effect.emberPositions[offset] ?? 0) +
        (effect.emberVelocities[offset] ?? 0) * delta;
      effect.emberPositions[offset + 1] =
        (effect.emberPositions[offset + 1] ?? 0) +
        (effect.emberVelocities[offset + 1] ?? 0) * delta;
      effect.emberPositions[offset + 2] =
        (effect.emberPositions[offset + 2] ?? 0) +
        (effect.emberVelocities[offset + 2] ?? 0) * delta;
      effect.emberVelocities[offset] =
        (effect.emberVelocities[offset] ?? 0) * damping;
      effect.emberVelocities[offset + 1] =
        (effect.emberVelocities[offset + 1] ?? 0) * damping;
      effect.emberVelocities[offset + 2] =
        (effect.emberVelocities[offset + 2] ?? 0) * damping;
      const lifetime = Math.max(
        0.001,
        effect.emberLifetimes[index] ?? 0.001,
      );
      const fade = Math.min(1, remaining * 5) * (remaining / lifetime);
      const cyan = index % 5 === 0;
      effect.emberColors[offset] = fade * (cyan ? 0.42 : 1);
      effect.emberColors[offset + 1] = fade * (cyan ? 0.94 : 0.5);
      effect.emberColors[offset + 2] = fade * (cyan ? 1 : 0.12);
      activeCount += 1;
    }

    if (burnStrength > 0 && !this.reduceMotion) {
      const density =
        this.quality === "low"
          ? 6
          : this.quality === "medium"
            ? 12
            : 17;
      effect.emberEmissionRemainder = Math.min(
        4,
        effect.emberEmissionRemainder + delta * density * burnStrength,
      );
      const spawnCount = Math.min(
        3,
        Math.floor(effect.emberEmissionRemainder),
      );
      effect.emberEmissionRemainder -= spawnCount;
      for (let index = 0; index < spawnCount; index += 1) {
        if (this.emitPlayerIgnitionEmber(effect)) activeCount += 1;
      }
    } else {
      effect.emberEmissionRemainder = 0;
    }

    effect.activeEmberCount = activeCount;
    effect.embers.visible = activeCount > 0;
    if (activeCount > 0 || hadActiveEmbers) {
      (
        effect.embers.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;
      (
        effect.embers.geometry.getAttribute(
          "color",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;
    }
  }

  private updatePlayerIgnitionSmoke(
    effect: PlayerIgnitionEffect,
    delta: number,
    smolderStrength: number,
  ): void {
    let activeCount = 0;
    const damping = Math.exp(-delta * 0.82);
    for (
      let index = 0;
      index < effect.activeSmokeCapacity;
      index += 1
    ) {
      const remaining =
        (effect.smokeRemainingLife[index] ?? 0) - delta;
      if (remaining <= 0) {
        effect.smokeRemainingLife[index] = 0;
        continue;
      }
      effect.smokeRemainingLife[index] = remaining;
      const offset = index * 3;
      effect.smokePositions[offset] =
        (effect.smokePositions[offset] ?? 0) +
        (effect.smokeVelocities[offset] ?? 0) * delta;
      effect.smokePositions[offset + 1] =
        (effect.smokePositions[offset + 1] ?? 0) +
        (effect.smokeVelocities[offset + 1] ?? 0) * delta;
      effect.smokePositions[offset + 2] =
        (effect.smokePositions[offset + 2] ?? 0) +
        (effect.smokeVelocities[offset + 2] ?? 0) * delta;
      effect.smokeVelocities[offset] =
        (effect.smokeVelocities[offset] ?? 0) * damping;
      effect.smokeVelocities[offset + 2] =
        (effect.smokeVelocities[offset + 2] ?? 0) * damping;
      effect.smokeVelocities[offset + 1] =
        0.22 +
        ((effect.smokeVelocities[offset + 1] ?? 0) - 0.22) *
          damping;

      const lifetime = Math.max(
        0.001,
        effect.smokeLifetimes[index] ?? 0.001,
      );
      const lifeProgress = 1 - remaining / lifetime;
      const fade =
        THREE.MathUtils.smoothstep(lifeProgress, 0, 0.18) *
        (1 - THREE.MathUtils.smoothstep(lifeProgress, 0.68, 1));
      const puff = effect.smokeDummy;
      puff.position.set(
        effect.smokePositions[offset] ?? 0,
        effect.smokePositions[offset + 1] ?? 0,
        effect.smokePositions[offset + 2] ?? 0,
      );
      puff.rotation.set(
        index * 0.73 + lifeProgress,
        index * 1.31 - lifeProgress * 0.7,
        index * 0.47,
      );
      const scale =
        (0.48 + lifeProgress * 1.45) *
        (0.82 + (index % 3) * 0.14);
      puff.scale.set(
        scale * (1 + Math.sin(index * 1.7) * 0.14),
        scale * 0.86,
        scale,
      );
      // Zero scale cheaply hides expired/fading instances without rebuilding
      // the pool or allocating particles during the render loop.
      puff.scale.multiplyScalar(fade);
      puff.updateMatrix();
      effect.smoke.setMatrixAt(activeCount, puff.matrix);
      activeCount += 1;
    }

    if (smolderStrength > 0.02) {
      const density =
        (this.quality === "low"
          ? 2.4
          : this.quality === "medium"
            ? 4.2
            : 5.8) *
        (0.4 + smolderStrength * 0.6);
      effect.smokeEmissionRemainder = Math.min(
        3,
        effect.smokeEmissionRemainder + delta * density,
      );
      const spawnCount = Math.min(
        2,
        Math.floor(effect.smokeEmissionRemainder),
      );
      effect.smokeEmissionRemainder -= spawnCount;
      for (let index = 0; index < spawnCount; index += 1) {
        this.emitPlayerIgnitionSmoke(effect);
      }
    } else {
      effect.smokeEmissionRemainder = 0;
    }

    effect.activeSmokeCount = activeCount;
    effect.smoke.count = activeCount;
    effect.smoke.visible = activeCount > 0;
    if (activeCount > 0) {
      effect.smoke.instanceMatrix.needsUpdate = true;
    }
  }

  private emitPlayerIgnitionSmoke(
    effect: PlayerIgnitionEffect,
  ): void {
    const index = effect.smokeCursor;
    effect.smokeCursor =
      (effect.smokeCursor + 1) % effect.activeSmokeCapacity;
    const offset = index * 3;
    const jitterX = this.nextPlayerIgnitionRandom(effect);
    const jitterZ = this.nextPlayerIgnitionRandom(effect);
    const driftX = this.nextPlayerIgnitionRandom(effect);
    const driftZ = this.nextPlayerIgnitionRandom(effect);
    const lifetimeRandom = this.nextPlayerIgnitionRandom(effect);
    effect.smokePositions[offset] =
      this.player.group.position.x + (jitterX - 0.5) * 0.76;
    effect.smokePositions[offset + 1] =
      this.player.group.position.y + 0.74;
    effect.smokePositions[offset + 2] =
      this.player.group.position.z + (jitterZ - 0.5) * 0.76;
    effect.smokeVelocities[offset] = (driftX - 0.5) * 0.28;
    effect.smokeVelocities[offset + 1] = 0.32;
    effect.smokeVelocities[offset + 2] = (driftZ - 0.5) * 0.28;
    const lifetime = 1.25 + lifetimeRandom * 1.15;
    effect.smokeRemainingLife[index] = lifetime;
    effect.smokeLifetimes[index] = lifetime;
  }

  private emitPlayerIgnitionEmber(
    effect: PlayerIgnitionEffect,
  ): boolean {
    const index = effect.emberCursor;
    effect.emberCursor =
      (effect.emberCursor + 1) % effect.activeEmberCapacity;
    const wasInactive =
      (effect.emberRemainingLife[index] ?? 0) <= 0;
    const offset = index * 3;
    const positionJitterX = this.nextPlayerIgnitionRandom(effect);
    const positionHeight = this.nextPlayerIgnitionRandom(effect);
    const positionJitterZ = this.nextPlayerIgnitionRandom(effect);
    const velocityX = this.nextPlayerIgnitionRandom(effect);
    const velocityY = this.nextPlayerIgnitionRandom(effect);
    const velocityZ = this.nextPlayerIgnitionRandom(effect);
    const lifetimeRandom = this.nextPlayerIgnitionRandom(effect);
    effect.emberPositions[offset] =
      this.player.group.position.x + (positionJitterX - 0.5) * 0.92;
    effect.emberPositions[offset + 1] =
      this.player.group.position.y + 0.28 + positionHeight * 1.82;
    effect.emberPositions[offset + 2] =
      this.player.group.position.z + (positionJitterZ - 0.5) * 0.92;
    effect.emberVelocities[offset] = (velocityX - 0.5) * 1.12;
    effect.emberVelocities[offset + 1] = 0.56 + velocityY * 1.08;
    effect.emberVelocities[offset + 2] = (velocityZ - 0.5) * 1.12;
    const lifetime = 0.52 + lifetimeRandom * 0.58;
    effect.emberRemainingLife[index] = lifetime;
    effect.emberLifetimes[index] = lifetime;
    return wasInactive;
  }

  private nextPlayerIgnitionRandom(
    effect: PlayerIgnitionEffect,
  ): number {
    effect.randomState =
      (Math.imul(effect.randomState, 1664525) + 1013904223) >>> 0;
    return effect.randomState / 4294967296;
  }

  private createSprintDustTrail(): void {
    const maximumCount = 42;
    const positions = new Float32Array(maximumCount * 3);
    const velocities = new Float32Array(maximumCount * 3);
    const colors = new Float32Array(maximumCount * 3);
    for (let index = 0; index < maximumCount; index += 1) {
      positions[index * 3 + 1] = -1000;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("color", colorAttribute);
    geometry.setDrawRange(0, maximumCount);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      const glow = context.createRadialGradient(32, 32, 2, 32, 32, 30);
      glow.addColorStop(0, "rgba(255, 255, 255, 1)");
      glow.addColorStop(0.18, "rgba(226, 232, 235, .92)");
      glow.addColorStop(0.52, "rgba(153, 162, 168, .44)");
      glow.addColorStop(1, "rgba(108, 116, 122, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, 64, 64);
      context.strokeStyle = "rgba(244, 248, 250, .52)";
      context.lineCap = "round";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(32, 8);
      context.lineTo(32, 56);
      context.moveTo(8, 32);
      context.lineTo(56, 32);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 5.5,
        map: texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        alphaTest: 0.025,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
        toneMapped: false,
      }),
    );
    points.name = "player-sprint-dust";
    points.visible = false;
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.scene.add(points);
    this.sprintDustTrail = {
      points,
      positions,
      velocities,
      colors,
      remainingLife: new Float32Array(maximumCount),
      lifetimes: new Float32Array(maximumCount),
      phases: new Float32Array(maximumCount),
      shades: new Float32Array(maximumCount),
      maximumCount,
      activeCapacity: maximumCount,
      cursor: 0,
      emissionRemainder: 0,
      activeCount: 0,
      randomState: 0x6d2b79f5,
    };
  }

  private setSprintDustQuality(quality: QualityTier): void {
    const trail = this.sprintDustTrail;
    if (!trail) return;
    trail.activeCapacity =
      quality === "low" ? 18 : quality === "medium" ? 30 : trail.maximumCount;
    trail.cursor %= trail.activeCapacity;
    trail.points.geometry.setDrawRange(0, trail.activeCapacity);
    trail.points.material.size =
      quality === "low" ? 4.5 : quality === "medium" ? 5.5 : 6.25;

    for (
      let index = trail.activeCapacity;
      index < trail.maximumCount;
      index += 1
    ) {
      const offset = index * 3;
      trail.remainingLife[index] = 0;
      trail.positions[offset + 1] = -1000;
      trail.colors[offset] = 0;
      trail.colors[offset + 1] = 0;
      trail.colors[offset + 2] = 0;
    }
    trail.activeCount = 0;
    for (let index = 0; index < trail.activeCapacity; index += 1) {
      if ((trail.remainingLife[index] ?? 0) > 0) trail.activeCount += 1;
    }
    trail.points.visible = trail.activeCount > 0;
    (
      trail.points.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      trail.points.geometry.getAttribute("color") as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  private resetSprintDustTrail(): void {
    const trail = this.sprintDustTrail;
    if (!trail) return;
    trail.remainingLife.fill(0);
    trail.colors.fill(0);
    for (let index = 0; index < trail.maximumCount; index += 1) {
      trail.positions[index * 3 + 1] = -1000;
    }
    trail.cursor = 0;
    trail.emissionRemainder = 0;
    trail.activeCount = 0;
    trail.points.visible = false;
    (
      trail.points.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      trail.points.geometry.getAttribute("color") as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  private updateSprintDustTrail(
    delta: number,
    sprinting: boolean,
    traveledX: number,
    traveledZ: number,
  ): void {
    const trail = this.sprintDustTrail;
    if (!trail) return;
    const hadActiveParticles = trail.activeCount > 0;
    const planarDamping = Math.exp(-delta * 3.8);
    const verticalDamping = Math.exp(-delta * 2.2);
    let activeCount = 0;

    for (let index = 0; index < trail.activeCapacity; index += 1) {
      const remaining = (trail.remainingLife[index] ?? 0) - delta;
      if (remaining <= 0) {
        if ((trail.remainingLife[index] ?? 0) > 0) {
          const offset = index * 3;
          trail.positions[offset + 1] = -1000;
          trail.colors[offset] = 0;
          trail.colors[offset + 1] = 0;
          trail.colors[offset + 2] = 0;
        }
        trail.remainingLife[index] = 0;
        continue;
      }

      trail.remainingLife[index] = remaining;
      const offset = index * 3;
      trail.positions[offset] =
        (trail.positions[offset] ?? 0) +
        (trail.velocities[offset] ?? 0) * delta;
      trail.positions[offset + 1] =
        (trail.positions[offset + 1] ?? 0) +
        (trail.velocities[offset + 1] ?? 0) * delta;
      trail.positions[offset + 2] =
        (trail.positions[offset + 2] ?? 0) +
        (trail.velocities[offset + 2] ?? 0) * delta;
      trail.velocities[offset] =
        (trail.velocities[offset] ?? 0) * planarDamping;
      trail.velocities[offset + 1] =
        (trail.velocities[offset + 1] ?? 0) * verticalDamping;
      trail.velocities[offset + 2] =
        (trail.velocities[offset + 2] ?? 0) * planarDamping;

      const lifetime = Math.max(
        0.001,
        trail.lifetimes[index] ?? 0.001,
      );
      const lifeRatio = remaining / lifetime;
      const fade = Math.min(1, remaining * 6);
      const twinkle = this.reduceMotion
        ? 0.92
        : 0.78 +
          Math.sin(this.elapsed * 19 + (trail.phases[index] ?? 0)) * 0.22;
      const brightness =
        (trail.shades[index] ?? 0.8) *
        (0.64 + lifeRatio * 0.36) *
        fade *
        twinkle;
      trail.colors[offset] = brightness * 0.82;
      trail.colors[offset + 1] = brightness * 0.9;
      trail.colors[offset + 2] = brightness;
      activeCount += 1;
    }

    const travelDistance = Math.hypot(traveledX, traveledZ);
    if (sprinting && travelDistance > 0.002) {
      const density = this.reduceMotion
        ? 2.8
        : this.quality === "low"
          ? 3.8
          : this.quality === "medium"
            ? 5.2
            : 6.2;
      trail.emissionRemainder = Math.min(
        8,
        trail.emissionRemainder + travelDistance * density,
      );
      const spawnCount = Math.min(7, Math.floor(trail.emissionRemainder));
      trail.emissionRemainder -= spawnCount;
      const directionX = traveledX / travelDistance;
      const directionZ = traveledZ / travelDistance;
      for (let spawn = 0; spawn < spawnCount; spawn += 1) {
        const pathProgress = (spawn + 0.5) / Math.max(1, spawnCount);
        const originX =
          this.playerPosition.x - traveledX * (1 - pathProgress);
        const originZ =
          this.playerPosition.z - traveledZ * (1 - pathProgress);
        if (
          this.emitSprintDustParticle(
            trail,
            originX,
            originZ,
            directionX,
            directionZ,
          )
        ) {
          activeCount += 1;
        }
      }
    } else {
      trail.emissionRemainder = 0;
    }

    trail.activeCount = activeCount;
    trail.points.visible = activeCount > 0;
    if (activeCount > 0 || hadActiveParticles) {
      (
        trail.points.geometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;
      (
        trail.points.geometry.getAttribute("color") as THREE.BufferAttribute
      ).needsUpdate = true;
    }
  }

  private emitSprintDustParticle(
    trail: SprintDustTrail,
    originX: number,
    originZ: number,
    directionX: number,
    directionZ: number,
  ): boolean {
    const index = trail.cursor;
    trail.cursor = (trail.cursor + 1) % trail.activeCapacity;
    const wasInactive = (trail.remainingLife[index] ?? 0) <= 0;
    const offset = index * 3;
    const sideX = -directionZ;
    const sideZ = directionX;
    const sideSign = index % 2 === 0 ? -1 : 1;
    const backDistance =
      0.34 + this.nextSprintDustRandom(trail) * 0.2;
    const sideDistance =
      sideSign * (0.13 + this.nextSprintDustRandom(trail) * 0.15);
    trail.positions[offset] =
      originX - directionX * backDistance + sideX * sideDistance;
    trail.positions[offset + 1] =
      this.shadowSurfaceY + 0.055 + this.nextSprintDustRandom(trail) * 0.1;
    trail.positions[offset + 2] =
      originZ - directionZ * backDistance + sideZ * sideDistance;

    const backwardDrift =
      0.16 + this.nextSprintDustRandom(trail) * 0.38;
    const lateralDrift =
      (this.nextSprintDustRandom(trail) - 0.5) * 0.54;
    trail.velocities[offset] =
      -directionX * backwardDrift + sideX * lateralDrift;
    trail.velocities[offset + 1] =
      0.24 + this.nextSprintDustRandom(trail) * 0.48;
    trail.velocities[offset + 2] =
      -directionZ * backwardDrift + sideZ * lateralDrift;
    const lifetime = 0.46 + this.nextSprintDustRandom(trail) * 0.3;
    trail.remainingLife[index] = lifetime;
    trail.lifetimes[index] = lifetime;
    trail.phases[index] =
      this.nextSprintDustRandom(trail) * Math.PI * 2;
    const shade = 0.78 + this.nextSprintDustRandom(trail) * 0.3;
    trail.shades[index] = shade;
    trail.colors[offset] = shade * 0.82;
    trail.colors[offset + 1] = shade * 0.9;
    trail.colors[offset + 2] = shade;
    return wasInactive;
  }

  private nextSprintDustRandom(trail: SprintDustTrail): number {
    trail.randomState =
      (Math.imul(trail.randomState, 1664525) + 1013904223) >>> 0;
    return trail.randomState / 4294967296;
  }

  private updateJump(delta: number, requested: boolean): void {
    if (requested && this.jumpHeight <= 0) {
      this.jumpVelocity = playerJumpLaunchVelocity;
      this.jumpHeight = 0;
    }

    if (this.jumpHeight <= 0 && this.jumpVelocity <= 0) return;
    // Use the same ballistic motion as the route planner. Velocity-first Euler
    // lost enough jump height at 30 FPS to make accepted ledges unreachable.
    this.jumpHeight += jumpDisplacement(delta, this.jumpVelocity);
    this.jumpVelocity = jumpVelocityAfter(delta, this.jumpVelocity);

    if (this.jumpHeight <= 0) this.resetJump();
  }

  private resetJump(): void {
    this.jumpHeight = 0;
    this.jumpVelocity = 0;
  }

  private updateCompassHeading(): void {
    if (!this.compassOwned || this.compassEquipFlight) return;
    const heading = getCompassHeading(this.smoothedRotation);
    if (heading === this.compassHeading) return;
    this.compassHeading = heading;
    this.hooks.onCompassChange(true, heading);
  }

  private isWithinSurfaceSupport(
    surface: SurfaceArea,
    x: number,
    z: number,
  ): boolean {
    if (surface.enabled === false) return false;
    if (surface.id === "survey-tent" && this.tentState?.inside) return false;
    const supportMargin =
      surface === this.activePlatform
        ? surface.edgeGrace ??
          (surface.requiresJump ? this.playerRadius * 0.34 : 0)
        : surface.supportMargin ??
          (surface.requiresJump ? this.playerRadius * 0.34 : 0);
    return this.surfaceContainsPoint(
      surface,
      x,
      z,
      supportMargin,
    );
  }

  private surfaceContainsPoint(
    surface: SurfaceArea,
    x: number,
    z: number,
    margin = 0,
  ): boolean {
    if (surface.enabled === false) return false;
    return (
      surface.contains?.(x, z, margin) ??
      (Math.abs(x - surface.x) <= surface.halfWidth + margin &&
        Math.abs(z - surface.z) <= surface.halfDepth + margin)
    );
  }

  private hasLandingSurfaceAt(
    x: number,
    z: number,
    height: number,
  ): boolean {
    const candidates = this.surfaceAreaIndex.queryPoint(
      x,
      z,
      0,
      this.surfaceAreaCandidates,
    );
    for (const surface of candidates) {
      if (!this.isWithinSurfaceSupport(surface, x, z)) continue;
      if (Math.abs(surface.heightAt(x, z) - height) <= 0.045) return true;
    }
    return false;
  }

  private findWalkableTakeoffSurface(
    x: number,
    z: number,
    feetHeight: number,
  ): SurfaceArea | null {
    let highestSurface: SurfaceArea | null = null;
    let highestSurfaceHeight = Number.NEGATIVE_INFINITY;
    const candidates = this.surfaceAreaIndex.queryPoint(
      x,
      z,
      0,
      this.surfaceAreaCandidates,
    );
    for (const surface of candidates) {
      if (
        surface.requiresJump ||
        !this.isWithinSurfaceSupport(surface, x, z)
      ) {
        continue;
      }
      const height = surface.heightAt(x, z);
      if (
        Math.abs(height - feetHeight) > 0.34 ||
        height <= highestSurfaceHeight
      ) {
        continue;
      }
      highestSurface = surface;
      highestSurfaceHeight = height;
    }
    return highestSurface;
  }

  private updateWorldSurface(
    delta: number,
    position: { x: number; z: number },
    previousFeetHeight: number,
    previousX: number,
    previousZ: number,
  ): number {
    const diveFromCrown = this.fallsDiveFromCrown;
    const feetHeight = this.surfaceOffset + this.jumpHeight;
    if (!this.noclip) {
      const recoveredToSupport = this.resolveStaticColliderPenetration(
        position,
        feetHeight,
        previousFeetHeight,
      );
      if (recoveredToSupport) {
        this.updateSplash(delta);
        return this.surfaceOffset;
      }
    }

    let terrainOffset = 0;
    let terrainShadowY = 0.16;
    if (this.currentZone === "falls") {
      const inStream = isInsideFallsRiver(position.x, position.z);
      const worldFeetHeight = this.surfaceOffset + this.jumpHeight;
      const inWater = inStream && worldFeetHeight < 0.05;
      // Bridge support is height-aware: X/Z alone must never lift a player
      // from the gorge onto its overhead deck.
      terrainOffset = inWater ? -0.16 : 0;
      terrainShadowY = inStream ? 0.235 : 0.16;

    } else {
      this.playerInWater = false;
    }

    if (this.tentState) {
      const localX = position.x - this.tentState.x;
      const localZ = position.z - this.tentState.z;
      const canopyHeight = this.tentState.surface.heightAt(
        position.x,
        position.z,
      );
      const beneathCanopy = feetHeight < canopyHeight - 0.075;
      const throughOpening =
        Math.abs(localX) < 0.76 &&
        localZ > 0.1 &&
        localZ < 1.95 &&
        beneathCanopy &&
        this.activePlatform !== this.tentState.surface;
      const withinInterior =
        Math.abs(localX) < 1.48 && localZ > -1.22 && localZ < 1.92;
      if (!this.tentState.inside && throughOpening) {
        this.tentState.inside = true;
        this.hooks.onStatus("You duck through the canvas opening. The field noise softens.");
      } else if (this.tentState.inside && !withinInterior) {
        this.tentState.inside = false;
        this.hooks.onStatus("Back under strange skies.");
      }
      const canopyTarget = this.tentState.inside ? 0.24 : 0.9;
      const canopyFollow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 8);
      this.tentState.canopy.material.opacity = THREE.MathUtils.lerp(
        this.tentState.canopy.material.opacity,
        canopyTarget,
        canopyFollow,
      );
    }

    // Walkable slopes can support the visible avatar without becoming the
    // active platform used by jump physics. Recover that support at the exact
    // takeoff point so a tent-roof jump inherits the roof height rather than
    // easing back toward the terrain baseline.
    if (
      !this.activePlatform &&
      this.jumpVelocity > 0 &&
      this.jumpHeight > 0.001
    ) {
      this.activePlatform = this.findWalkableTakeoffSurface(
        previousX,
        previousZ,
        previousFeetHeight,
      );
    }

    // Once the player launches, preserve the takeoff height in world space.
    // Keeping a variable-height support active made slopes and stepped coin
    // stacks pull the jump baseline downward as the player moved laterally.
    if (
      this.activePlatform &&
      this.jumpVelocity > 0 &&
      this.jumpHeight > 0.001
    ) {
      this.releaseActivePlatformIntoAir(terrainOffset);
    }

    let targetOffset = terrainOffset;
    const descending =
      this.jumpVelocity < 0 && feetHeight <= previousFeetHeight + 0.001;
    const grounded = this.jumpHeight <= 0 && this.jumpVelocity <= 0;
    const surfaceFrame = this.surfaceSelectionFrame;
    surfaceFrame.activeSurface = this.activePlatform;
    surfaceFrame.x = position.x;
    surfaceFrame.z = position.z;
    surfaceFrame.previousX = previousX;
    surfaceFrame.previousZ = previousZ;
    surfaceFrame.feetHeight = feetHeight;
    surfaceFrame.previousFeetHeight = previousFeetHeight;
    surfaceFrame.descending = descending;
    surfaceFrame.grounded = grounded;
    const surfaceCandidates = this.surfaceAreaIndex.queryPoint(
      position.x,
      position.z,
      0,
      this.surfaceAreaCandidates,
    );
    const selectedSurfaces = selectSupportedSurfaces(
      surfaceCandidates,
      surfaceFrame,
      this.supportsSurface,
      this.surfaceSelection,
    );
    const activeSurface = selectedSurfaces.active;
    const landingSurface = selectedSurfaces.landing;
    // A higher overlapping ledge must win on the exact frame the player
    // crosses its top. Retaining the lower active platform here made the upper
    // slab intangible for the entire descent.
    let surface = landingSurface ?? activeSurface;
    if (
      grounded &&
      selectedSurfaces.grounded &&
      (!surface ||
        (selectedSurfaces.grounded.stepHeight !== undefined &&
          selectedSurfaces.grounded.heightAt(position.x, position.z) >
            surface.heightAt(position.x, position.z)))
    ) {
      surface = selectedSurfaces.grounded;
    }

    const walkingStep = grounded && surface?.stepHeight !== undefined;
    if (this.activePlatform && !activeSurface && !walkingStep) {
      this.releaseActivePlatformIntoAir(terrainOffset);
      // Preserve the current vertical velocity when converting platform-relative
      // height into world-relative height. Killing a rising jump here made the
      // player visibly snap into a fall the instant they cleared a ledge.
    }

    if (surface) {
      const surfaceHeight = surface.heightAt(position.x, position.z);
      if (landingSurface === surface) {
        const gridTornOnImpact =
          surface.id.startsWith("ambient-grid-") &&
          (this.ambientGrid?.impactSurface(
            surface.id,
            Math.max(0, -this.jumpVelocity),
            this.movement,
          ) ??
            false);
        if (gridTornOnImpact) {
          this.activePlatform = null;
          this.surfaceOffset = terrainOffset;
          this.jumpHeight = Math.max(
            this.jumpHeight,
            surfaceHeight - terrainOffset,
          );
          this.updateSplash(delta);
          return this.surfaceOffset;
        }
        if (surface.id === "void-turtle-shell") {
          const bounce = this.voidTurtleRide.triggerShellBounce();
          if (bounce) {
            // A shell bounce is not a failed landing or permission for the old
            // held command to steer straight back onto the sleeping turtle.
            this.navigation.cancel("Sleeping turtle bounced the player");
            this.cancelClickNavigationPress();
            const pushLength = Math.max(
              0.001,
              Math.hypot(bounce.x, bounce.z),
            );
            this.activePlatform = null;
            this.surfaceOffset = terrainOffset;
            this.jumpHeight = surfaceHeight + 0.08;
            this.jumpVelocity = 9.1;
            this.playerPosition.x -= (bounce.x / pushLength) * 2.8;
            this.playerPosition.z -= (bounce.z / pushLength) * 2.8;
            this.hooks.onStatus(bounce.message);
            this.updateSplash(delta);
            return this.surfaceOffset;
          }
        }
        this.activePlatform = surface;
        this.fallsDiveFromCrown = false;
        this.surfaceOffset = surfaceHeight;
        targetOffset = surfaceHeight;
        this.resetJump();
        surface.onLand?.();
        if (surface.landingMessage) {
          this.hooks.onStatus(
            surface.landingMessage,
            surface.id === "archive-star-atlas"
              ? { toastPolicy: "after-achievement" }
              : undefined,
          );
        }
      } else if (!surface.requiresJump || walkingStep) {
        targetOffset = Math.max(terrainOffset, surfaceHeight);
        if (grounded && surface.snapGroundedHeight === true) {
          // Retain ownership between grounded frames. Besides keeping steep
          // slopes exact, this tells the tent entrance test that the player is
          // standing on the canvas rather than walking beneath it.
          this.activePlatform = surface;
        }
      } else if (this.activePlatform === surface) {
        targetOffset = surfaceHeight;
      }
    }

    const follow = 1 - Math.exp(-delta * 14);
    const snapToGroundedSurface =
      grounded && surface?.snapGroundedHeight === true;
    if (this.activePlatform || snapToGroundedSurface) {
      this.surfaceOffset = targetOffset;
    } else {
      this.surfaceOffset = THREE.MathUtils.lerp(
        this.surfaceOffset,
        targetOffset,
        follow,
      );
    }
    const airborne =
      this.jumpHeight > 0.02 || Math.abs(this.jumpVelocity) > 0.02;
    let projectedShadowOffset = targetOffset;
    if (airborne) {
      projectedShadowOffset = terrainOffset;
      const worldFeetHeight = this.surfaceOffset + this.jumpHeight;
      const shadowCandidates = this.surfaceAreaIndex.queryPoint(
        position.x,
        position.z,
        0,
        this.surfaceAreaCandidates,
      );
      for (const candidate of shadowCandidates) {
        if (
          !this.isWithinSurfaceSupport(
            candidate,
            position.x,
            position.z,
          )
        ) {
          continue;
        }
        const candidateHeight = candidate.heightAt(position.x, position.z);
        if (
          candidateHeight <= worldFeetHeight + 0.02 &&
          candidateHeight > projectedShadowOffset
        ) {
          projectedShadowOffset = candidateHeight;
        }
      }
    }
    if (this.currentZone === "falls") {
      const worldFeet = this.surfaceOffset + this.jumpHeight;
      const inPool = isWadingInFallsPool(position.x, position.z, worldFeet);
      const inRiver = isInsideFallsRiver(position.x, position.z) && worldFeet < 0.05;
      if ((inPool || inRiver) && !this.playerInWater) {
        this.triggerSplash(
          position.x, position.z,
          inPool ? fallsLandmarks.basin.water : 0.205,
          diveFromCrown,
        );
      }
      this.playerInWater = inPool || inRiver;
      if (inPool && this.jumpVelocity < -2.8) {
        // Dissipate the plunge through the water before the feet meet its bed.
        this.jumpVelocity = -2.8;
      }
      if (
        isInsideFallsPool(position.x, position.z) &&
        worldFeet >= fallsLandmarks.basin.floor - 0.04
      ) {
        projectedShadowOffset = Math.max(
          projectedShadowOffset, fallsLandmarks.basin.water,
        );
      }
    }
    this.shadowSurfaceY =
      projectedShadowOffset > terrainOffset + 0.02
        ? projectedShadowOffset + 0.012
        : terrainShadowY;
    this.shadowVerticalDistance = Math.max(
      0,
      this.surfaceOffset + this.jumpHeight - projectedShadowOffset,
    );
    if (
      !this.noclip &&
      this.jumpHeight <= 0 && this.jumpVelocity <= 0 &&
      !this.collidesAt(position.x, position.z, this.surfaceOffset, false)
    ) {
      const safe = this.collisionSafeLanding;
      safe.valid = true;
      safe.x = position.x;
      safe.z = position.z;
      safe.height = this.surfaceOffset;
      safe.surface = this.activePlatform;
    }
    this.updateSplash(delta);
    return this.surfaceOffset;
  }

  private releaseActivePlatformIntoAir(terrainOffset: number): void {
    const previousHeight = this.surfaceOffset;
    const supportId = this.activePlatform?.id;
    this.fallsDiveFromCrown =
      this.currentZone === "falls" &&
      (supportId === "falls-cave-summit" ||
        supportId?.startsWith("falls-waterfall-crown-") === true);
    this.activePlatform = null;
    this.surfaceOffset = terrainOffset;
    this.jumpHeight += Math.max(0, previousHeight - terrainOffset);
  }

  private triggerSplash(
    x: number, z: number, waterY: number, diveFromCrown: boolean,
  ): void {
    if (!this.splashRing) return;
    const isWaterfallDive =
      this.currentZone === "falls" &&
      diveFromCrown &&
      this.airbornePeakHeight >= 3.2;
    const raisedPool = waterY > 1;
    const firstRiverSplash = !raisedPool && !this.hasSplashed;
    if (!raisedPool) this.hasSplashed = true;
    this.splashAge = 0;
    this.splashDuration = isWaterfallDive ? 1.25 : 0.8;
    this.splashMagnitude = isWaterfallDive ? 1.85 : 1;
    this.splashRing.position.set(x, waterY + 0.035, z);
    this.splashRing.scale.setScalar(isWaterfallDive ? 1.05 : 0.7);
    this.splashRing.material.opacity = 0.9;
    this.splashRing.visible = true;
    if (isWaterfallDive) {
      // The water cushions the landing, then the avatar flops onto its back
      // and gets up. Keep the pool's physical bed as the vertical reference.
      this.waterfallRecoveryAge = 0;
      this.spellCharging = false;
      this.spellCharge = 0;
      this.hooks.onSpellCharge(0, false);
      this.triggerWaterSplashBurst(x, z, waterY);
      this.hooks.onStatus(
        raisedPool
          ? "You plunge from the waterfall crown. The pool answers with one enormous, deeply unnecessary splash."
          : "You plunge from the waterfall crown. The river answers with one enormous, deeply unnecessary splash.",
        { kind: "achievement", title: "WORTH IT" },
      );
    } else {
      if (raisedPool) this.triggerWaterSplashBurst(x, z, waterY, 0.5);
      if (firstRiverSplash) this.hooks.onStatus("Splash. The bridge was optional.");
    }
    this.airbornePeakHeight = 0;
  }

  private updateSplash(delta: number): void {
    if (this.splashRing?.visible) {
      this.splashAge += delta;
      const progress = Math.min(1, this.splashAge / this.splashDuration);
      this.splashRing.scale.setScalar(
        (0.7 + progress * 2.8) * this.splashMagnitude,
      );
      this.splashRing.material.opacity =
        (1 - progress) * (this.splashMagnitude > 1 ? 0.96 : 0.82);
      if (progress >= 1) this.splashRing.visible = false;
    }
    this.updateWaterSplashBurst(delta);
  }

  private triggerWaterSplashBurst(
    x: number, z: number, waterY: number, strength = 1,
  ): void {
    const burst = this.splashBurst;
    if (!burst) return;
    burst.age = 0;
    burst.duration = 1.35;
    burst.count =
      this.quality === "low" ? 8 : this.quality === "medium" ? 13 : 18;
    burst.drops.count = burst.count;
    burst.drops.position.set(x, waterY + 0.075, z);
    burst.drops.visible = true;
    for (let index = 0; index < burst.count; index += 1) {
      const angle = index * 2.39996 + 0.27;
      const speed = (1.35 + (index % 5) * 0.28) * strength;
      burst.velocities[index * 3] = Math.cos(angle) * speed;
      burst.velocities[index * 3 + 1] = (3.8 + (index % 4) * 0.48) * strength;
      burst.velocities[index * 3 + 2] = Math.sin(angle) * speed;
    }
  }

  private updateWaterSplashBurst(delta: number): void {
    const burst = this.splashBurst;
    if (!burst || !burst.drops.visible) return;
    burst.age += delta;
    const progress = Math.min(1, burst.age / burst.duration);
    for (let index = 0; index < burst.count; index += 1) {
      const offset = index * 3;
      const velocityX = burst.velocities[offset] ?? 0;
      const velocityY = burst.velocities[offset + 1] ?? 0;
      const velocityZ = burst.velocities[offset + 2] ?? 0;
      const height = Math.max(
        0.02,
        velocityY * burst.age - 5.5 * burst.age * burst.age,
      );
      burst.dummy.position.set(
        velocityX * burst.age,
        height,
        velocityZ * burst.age,
      );
      const scale =
        (0.8 + (index % 3) * 0.18) *
        THREE.MathUtils.clamp((1 - progress) * 1.5, 0, 1);
      burst.dummy.scale.set(
        scale * 0.52,
        scale * (1.15 + (index % 2) * 0.25),
        scale * 0.52,
      );
      burst.dummy.rotation.set(
        burst.age * (3 + (index % 4)),
        index * 0.71,
        burst.age * 2.4,
      );
      burst.dummy.updateMatrix();
      burst.drops.setMatrixAt(index, burst.dummy.matrix);
    }
    burst.drops.instanceMatrix.needsUpdate = true;
    burst.drops.material.opacity = Math.pow(1 - progress, 0.58) * 0.9;
    if (progress >= 1) {
      burst.drops.visible = false;
      burst.drops.count = 0;
    }
  }

  private updateCamera(delta: number, immediate: boolean): void {
    const position = this.playerPosition;
    // Jump takeoff converts platform-relative height to world-relative height.
    // Framing only surfaceOffset sent the camera back to the river each jump.
    const fallsFeet = Math.max(0, this.surfaceOffset + this.jumpHeight);
    this.cameraTargetFocus.set(
      position.x,
      this.currentZone === "falls" ? 0.9 + fallsFeet * 0.96 : 0.72,
      position.z,
    );
    this.cameraTargetOffset.copy(this.explorationCameraOffset);
    let targetZoom = 1;
    let mathCameraFrame = this.mathCameraFrame;
    if (
      mathCameraFrame &&
      (this.currentZone !== "math" ||
        this.elapsed >= mathCameraFrame.expiresAt ||
        (this.elapsed >= mathCameraFrame.startedAt + 0.35 &&
          (this.movement.lengthSq() > 0.0001 || this.jumpHeight > 0.02)))
    ) {
      this.mathCameraFrame = null;
      mathCameraFrame = null;
    }

    if (this.worldCollapse && this.worldCollapseFrame) {
      const collapse = this.worldCollapseFrame;
      const framing = collapse.cameraBlend;
      this.cameraTargetFocus.set(
        THREE.MathUtils.lerp(
          position.x,
          this.worldCollapse.origin.x,
          framing * 0.72,
        ),
        THREE.MathUtils.lerp(
          0.72,
          this.worldCollapse.origin.y * 0.52,
          framing,
        ),
        THREE.MathUtils.lerp(
          position.z,
          this.worldCollapse.origin.z,
          framing * 0.72,
        ),
      );
      this.cameraTargetOffset.set(
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.x,
          15.8,
          framing,
        ),
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.y,
          19.6,
          framing,
        ),
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.z,
          15.8,
          framing,
        ),
      );
      targetZoom = THREE.MathUtils.lerp(
        1,
        0.74 + collapse.pull * 0.12,
        framing,
      );
    } else if (mathCameraFrame) {
      this.cameraTargetFocus.copy(mathCameraFrame.focus);
      this.cameraTargetOffset.copy(this.explorationCameraOffset);
      targetZoom = mathCameraFrame.zoom;
    } else if (this.voidTurtleRide.isRiding()) {
      this.cameraTargetFocus.y = 1.05;
      this.cameraTargetOffset.set(10.2, 17.2, 10.2);
      targetZoom = 0.88;
    } else if ((this.tentState?.restBlend ?? 0) > 0.02 && this.tentState) {
      const restBlend = this.tentState.restBlend;
      this.cameraTargetFocus.set(
        this.tentState.sleepFocus.x,
        0.62,
        this.tentState.sleepFocus.z,
      );
      this.cameraTargetOffset.set(
        THREE.MathUtils.lerp(this.explorationCameraOffset.x, 6.8, restBlend),
        THREE.MathUtils.lerp(this.explorationCameraOffset.y, 8.4, restBlend),
        THREE.MathUtils.lerp(this.explorationCameraOffset.z, 6.8, restBlend),
      );
      targetZoom = THREE.MathUtils.lerp(1, 1.24, restBlend);
    } else if (
      this.pongChallenge.isActive() &&
      this.pongChallenge.getCourtFocus(this.cameraTargetFocus)
    ) {
      this.cameraTargetOffset.set(0, 18, 0.8);
      targetZoom = 1.5;
    } else if (this.currentZone === "falls" && position.z < fallsLandmarks.cave.z + 3.5) {
      const cave = fallsLandmarks.cave;
      const proximity = THREE.MathUtils.clamp((cave.z + 3.5 - position.z) / 4.2, 0, 1);
      const lateralInfluence =
        1 -
        THREE.MathUtils.smoothstep(Math.abs(position.x - cave.x), 2.7, 6.5);
      const alignment = proximity * lateralInfluence;
      this.cameraTargetFocus.set(
        THREE.MathUtils.lerp(position.x, cave.x, 0.32 * alignment),
        0.9 + fallsFeet * 0.96,
        THREE.MathUtils.lerp(
          position.z,
          position.z - 0.35,
          alignment,
        ),
      );
      this.cameraTargetOffset.set(
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.x,
          5.2,
          alignment,
        ),
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.y,
          12.8,
          alignment,
        ),
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.z,
          12.8,
          alignment,
        ),
      );
      targetZoom = THREE.MathUtils.lerp(
        1,
        THREE.MathUtils.lerp(
          this.fallsRuneRitual.isSolved() ? 1.15 : 1.1,
          0.94,
          THREE.MathUtils.smoothstep(fallsFeet, 4.5, 7.5),
        ),
        alignment,
      );
    }

    const topDown = this.topDownDebugEnabled && this.worldCollapse === null;
    if (topDown) {
      // North-up overhead inspection. Use a nonparallel up vector rather than
      // a nearly vertical lookAt perturbation, which makes the view spin.
      this.camera.up.set(0, 0, -1);
      this.cameraTargetFocus.set(position.x, fallsFeet, position.z);
      this.cameraTargetOffset.set(0, 28, 0);
      targetZoom = 0.86;
    } else {
      this.camera.up.copy(up);
    }
    const alpha = immediate || this.reduceMotion ? 1 : 1 - Math.exp(-delta * 5.2);
    const rigAlpha = immediate || this.reduceMotion ? 1 : 1 - Math.exp(-delta * 4.2);
    this.cameraFocus.lerp(this.cameraTargetFocus, alpha);
    this.cameraOffset.lerp(this.cameraTargetOffset, rigAlpha);
    this.camera.position.copy(this.cameraFocus).add(this.cameraOffset);
    this.camera.lookAt(this.cameraFocus);
    const nextZoom = THREE.MathUtils.lerp(this.camera.zoom, targetZoom, rigAlpha);
    if (Math.abs(nextZoom - this.camera.zoom) > 0.0001) {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
    }
    this.cameraForward.set(-this.cameraOffset.x, 0, -this.cameraOffset.z);
    if (this.cameraForward.lengthSq() < 0.0001) this.cameraForward.set(0, 0, -1);
    else this.cameraForward.normalize();
    this.cameraRight.crossVectors(this.cameraForward, up).normalize();
    this.camera.updateMatrixWorld();
  }

  private updateInteractions(): void {
    if (
      this.worldCollapse !== null ||
      this.waterfallRecoveryAge >= 0 ||
      this.isIgnitionPanicActive()
    ) {
      if (this.activeInteraction) {
        this.activeInteraction = null;
        this.hooks.onInteractionChange(null);
      }
      return;
    }
    const playerPosition = this.playerPosition;
    const playerElevation = this.surfaceOffset + this.jumpHeight;
    let closest: Interaction | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const interaction of this.interactions) {
      if (interaction.requiresLantern && !this.lanternEnabled) continue;
      if (interaction.isAvailable && !interaction.isAvailable()) continue;
      if (playerElevation > interaction.maximumPlayerElevation) continue;
      const dx = interaction.position.x - playerPosition.x;
      const dz = interaction.position.z - playerPosition.z;
      const distance = dx * dx + dz * dz;
      const radiusSquared = interaction.radius * interaction.radius;
      if (distance <= radiusSquared && distance < closestDistance) {
        closest = interaction;
        closestDistance = distance;
      }
    }

    if (closest?.id === this.activeInteraction?.id) return;
    this.activeInteraction = closest;
    this.hooks.onInteractionChange(closest?.label ?? null);
  }

  private updateAnimatedItems(delta: number): void {
    const motionScale = this.reduceMotion ? 0.24 : 1;
    for (const item of this.animatedItems) {
      item.object.position.y =
        item.originY +
        Math.sin(this.elapsed * 1.8 * motionScale + item.phase) *
          item.amplitude *
          motionScale;
      item.object.rotation[item.rotationAxis ?? "y"] +=
        item.rotationSpeed * delta * motionScale;
      if (item.texture && item.textureVelocity) {
        item.texture.offset.x =
          (item.texture.offset.x +
            item.textureVelocity[0] * delta * motionScale +
            1) %
          1;
        item.texture.offset.y =
          (item.texture.offset.y +
            item.textureVelocity[1] * delta * motionScale +
            1) %
          1;
        item.texture.updateMatrix();
      }
    }
  }

  private updateArchiveDataGlass(delta: number): void {
    const glass = this.archiveDataGlass;
    if (!glass) return;
    const motionScale = this.reduceMotion ? 0.2 : 1;
    glass.texture.offset.x =
      (glass.texture.offset.x + delta * 0.018 * motionScale) % 1;
    glass.texture.offset.y =
      (glass.texture.offset.y + delta * 0.075 * motionScale) % 1;
    glass.material.opacity =
      0.76 + Math.sin(this.elapsed * 2.15 * motionScale) * 0.055 * motionScale;
  }

  private readonly sampleNpcWalkHeight = (
    x: number, z: number, previousHeight: number,
  ): number | null => this.sampleWalkingHeight(x, z, previousHeight, 0.58, 2.22, false);

  private isFallsFrogHopClear(
    fromX: number, fromY: number, fromZ: number,
    toX: number, toY: number, toZ: number,
    lift: number, radius: number, height: number,
  ): boolean {
    // Once per candidate hop, never in flight. Reuse the broadphase for the
    // entire swept footprint and include furniture plus current NPC positions.
    const solids = this.staticColliderIndex.queryBounds(
      Math.min(fromX, toX) - radius, Math.min(fromZ, toZ) - radius,
      Math.max(fromX, toX) + radius, Math.max(fromZ, toZ) + radius,
      this.staticColliderCandidates,
    );
    const samples = Math.min(96, Math.max(1, Math.ceil(
      (Math.hypot(toX - fromX, toZ - fromZ) + Math.abs(toY - fromY) + lift * 2) / 0.1,
    )));
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples;
      const x = fromX + (toX - fromX) * t;
      const z = fromZ + (toZ - fromZ) * t;
      const feet = fromY + (toY - fromY) * t + 4 * lift * t * (1 - t);
      for (const solid of solids) {
        if (solid.solidTop !== undefined && feet >= solid.solidTop - 0.015) continue;
        if (loosePropIntersectsSolid(x, z, radius, feet, feet + height, solid)) return false;
      }
      for (const npc of this.wanderingNpcs) {
        if (feet + height <= npc.feetHeight || feet >= npc.feetHeight + 2.1) continue;
        if (Math.hypot(x - npc.group.position.x, z - npc.group.position.z) < radius + 0.58) return false;
      }
    }
    return true;
  }

  private getFallsFrogFloorHeight(x: number, z: number): number | null {
    if (x * x + z * z > fallsFoundationRadius * fallsFoundationRadius) return null;
    return isInsideFallsRiver(x, z) ? -0.16 : 0;
  }

  private getFallsFrogShadowHeight(x: number, y: number, z: number): number | null {
    let highest = this.getFallsFrogFloorHeight(x, z);
    for (const surface of this.surfaceAreaIndex.queryPoint(x, z, 0, this.surfaceAreaCandidates)) {
      if (!this.surfaceContainsPoint(surface, x, z)) continue;
      const height = surface.heightAt(x, z);
      if (height <= y + 0.04 && (highest === null || height > highest)) highest = height;
    }
    if (highest === null) return null;
    if (isInsideFallsPool(x, z) && y >= fallsLandmarks.basin.floor - 0.04) {
      return Math.max(highest, fallsLandmarks.basin.water);
    }
    return Math.max(highest, isInsideFallsRiver(x, z) ? 0.205 : 0.16);
  }

  private stepNpc(
    npc: WanderingNpc, directionX: number, directionZ: number, step: number,
    retreat = false,
  ): boolean {
    const length = Math.hypot(directionX, directionZ);
    if (length < 0.001 || step < 0.0001) return false;
    directionX /= length;
    directionZ /= length;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestX = 0;
    let bestZ = 0;
    let bestHeight = npc.feetHeight;
    let bestAngle = 0;
    const detouring = this.elapsed < npc.detourUntil;
    const lookahead = Math.min(length, Math.max(step, 0.55));
    for (const angle of npcEscapeAngles) {
      if (!retreat && Math.abs(angle) > Math.PI / 2) continue;
      if (detouring && angle !== 0 && Math.sign(angle) !== npc.detourSide) continue;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const dx = directionX * cosine - directionZ * sine;
      const dz = directionX * sine + directionZ * cosine;
      const heading = Math.atan2(dx, dz);
      const continuity = Math.cos(heading - npc.steeringHeading);
      const score = cosine * 2 + continuity * 0.85 +
        (angle !== 0 && Math.sign(angle) === npc.detourSide ? 0.08 : 0);
      if (score <= bestScore) continue;
      const nextX = npc.group.position.x + dx * step;
      const nextZ = npc.group.position.z + dz * step;
      const height = this.sampleNpcWalkHeight(nextX, nextZ, npc.feetHeight);
      if (height === null) continue;
      // Check ahead along the same treads. Testing only this frame's tiny
      // displacement lets a robe repeatedly approach and recoil from a wall.
      let aheadHeight: number | null = height;
      const probes = Math.max(1, Math.ceil(lookahead / 0.12));
      for (let probe = 1; probe <= probes && aheadHeight !== null; probe += 1) {
        const distance = step + (lookahead - step) * probe / probes;
        aheadHeight = this.sampleNpcWalkHeight(
          npc.group.position.x + dx * distance,
          npc.group.position.z + dz * distance,
          aheadHeight,
        );
      }
      if (aheadHeight === null) continue;
      let crowdsNeighbour = false;
      for (const other of this.wanderingNpcs) {
        if (other === npc || Math.abs(other.feetHeight - height) > 1.5) continue;
        const distance = Math.hypot(nextX - other.group.position.x, nextZ - other.group.position.z);
        const previousDistance = Math.hypot(
          npc.group.position.x - other.group.position.x,
          npc.group.position.z - other.group.position.z,
        );
        if (distance < 1.3 && distance < previousDistance - 0.0001) {
          crowdsNeighbour = true;
          break;
        }
      }
      if (crowdsNeighbour) continue;
      bestScore = score;
      bestX = nextX;
      bestZ = nextZ;
      bestHeight = height;
      bestAngle = angle;
    }
    if (!Number.isFinite(bestScore)) return false;
    npc.steeringHeading = Math.atan2(
      bestX - npc.group.position.x, bestZ - npc.group.position.z,
    );
    if (bestAngle !== 0) {
      npc.detourSide = Math.sign(bestAngle);
      npc.detourUntil = this.elapsed + 0.8;
    }
    npc.group.position.x = bestX;
    npc.group.position.z = bestZ;
    npc.feetHeight = bestHeight;
    return true;
  }

  private moveNpcOutOfPersonalSpace(
    npc: WanderingNpc,
    delta: number,
    playerDistance: number,
    speaking: boolean,
  ): boolean {
    const playerFeetHeight = this.surfaceOffset + this.jumpHeight - npc.feetHeight;
    const airborneApproach =
      (this.jumpHeight > 0.12 || Math.abs(this.jumpVelocity) > 0.4) &&
      playerFeetHeight < 3.15;
    const personalSpace = airborneApproach ? 1.68 : 1.24;
    const playerCrowded =
      playerFeetHeight >= -0.65 && playerFeetHeight <= 3.15 && playerDistance < personalSpace;
    let awayX = 0;
    let awayZ = 0;
    if (playerCrowded && playerDistance > 0.001) {
      awayX =
        (npc.group.position.x - this.playerPosition.x) / playerDistance;
      awayZ =
        (npc.group.position.z - this.playerPosition.z) / playerDistance;
    } else if (playerCrowded) {
      // If the player lands exactly on the NPC centre, continue through the
      // avatar's heading instead of choosing a visibly arbitrary escape side.
      awayX = Math.sin(this.smoothedRotation);
      awayZ = Math.cos(this.smoothedRotation);
    }
    let neighbourCrowded = false;
    let neighbourOverlap = 0;
    for (const other of this.wanderingNpcs) {
      if (other === npc || Math.abs(other.feetHeight - npc.feetHeight) > 1.5) continue;
      const dx = npc.group.position.x - other.group.position.x;
      const dz = npc.group.position.z - other.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 1.18) continue;
      neighbourCrowded = true;
      neighbourOverlap = Math.max(neighbourOverlap, 1.3 - distance);
      if (distance > 0.001) {
        const weight = (1.3 - distance) / 1.3;
        awayX += dx / distance * weight;
        awayZ += dz / distance * weight;
      } else {
        awayX += npc.interactionId < other.interactionId ? -1 : 1;
      }
    }
    if (!playerCrowded && !neighbourCrowded) return false;
    const urgency = THREE.MathUtils.clamp(
      (personalSpace - playerDistance) / personalSpace,
      0.18,
      1,
    );
    const retreatSpeed = playerCrowded
      ? (this.reduceMotion ? 2.1 : 3.2) + urgency
      : 0.8;
    const step = Math.min(
      playerCrowded ? personalSpace - playerDistance + 0.08 : neighbourOverlap * 0.5,
      retreatSpeed * delta,
      0.14,
    );
    npc.returnPath = null;
    npc.wanderPauseUntil = this.elapsed + 0.65;
    this.stepNpc(npc, awayX, awayZ, step, true);
    if (speaking) npc.steeringHeading = Math.atan2(
      this.playerPosition.x - npc.group.position.x,
      this.playerPosition.z - npc.group.position.z,
    );
    // A blocked retreat still owns movement. Starting the homeward wander in
    // the same frame used to send the NPC straight back into the crowd.
    return true;
  }

  private maybeEmitNpcCrowdingQuip(
    npc: WanderingNpc,
    playerDistance: number,
  ): boolean {
    const playerFeetHeight = this.surfaceOffset + this.jumpHeight - npc.feetHeight;
    const crowdedFromAbove =
      this.jumpVelocity < -0.2 &&
      playerFeetHeight > 0.22 &&
      playerFeetHeight < 3.15 &&
      playerDistance < 1.35;
    if (!crowdedFromAbove) {
      npc.crowdedFromAbove = false;
      return false;
    }
    if (npc.crowdedFromAbove) return false;
    npc.crowdedFromAbove = true;
    if (
      this.elapsed < npc.crowdingQuipCooldownUntil ||
      npc.speechAge < npc.speechDuration ||
      npc.crowdingQuips.length === 0
    ) {
      return false;
    }

    const quip =
      npc.crowdingQuips[
        npc.crowdingQuipIndex % npc.crowdingQuips.length
      ];
    if (!quip) return false;
    npc.crowdingQuipIndex += 1;
    npc.crowdingQuipCooldownUntil = this.elapsed + 5.5;
    this.emitNpcSpeech(
      npc.interactionId,
      npc.crowdingSpeaker,
      quip,
    );
    return true;
  }

  private updateWanderingNpcs(delta: number): void {
    for (const npc of this.wanderingNpcs) {
      npc.speechAge = Math.min(
        npc.speechDuration,
        npc.speechAge + delta,
      );
      let speaking = npc.speechAge < npc.speechDuration;
      const playerDistance = Math.hypot(
        npc.group.position.x - this.playerPosition.x,
        npc.group.position.z - this.playerPosition.z,
      );
      const sameLevel =
        Math.abs(this.surfaceOffset + this.jumpHeight - npc.feetHeight) < 1.5;
      speaking =
        this.maybeEmitNpcCrowdingQuip(npc, playerDistance) ||
        speaking;
      const motionScale = this.reduceMotion ? 0.28 : 1;
      const yielding = this.moveNpcOutOfPersonalSpace(
        npc,
        delta,
        playerDistance,
        speaking,
      );
      if (!yielding && (playerDistance > 2.25 || !sameLevel) && !speaking &&
        this.elapsed >= npc.wanderPauseUntil) {
        npc.angle += npc.speed * delta * motionScale;
        let targetX = npc.home.x + Math.cos(npc.angle) * npc.radiusX;
        let targetZ = npc.home.z + Math.sin(npc.angle * 0.86) * npc.radiusZ;
        const awayFromHome = Math.hypot(
          npc.group.position.x - npc.home.x, npc.group.position.z - npc.home.z,
        ) > 1.65 || Math.abs(npc.feetHeight - npc.home.y) > 0.1;
        if (awayFromHome && !npc.returnPath && this.elapsed >= npc.nextReturnPlanAt) {
          npc.returnPath = findGuidedWalkingRoute(
            { x: npc.group.position.x, y: npc.feetHeight, z: npc.group.position.z },
            npc.home,
            this.sampleNpcWalkHeight,
          );
          npc.returnWaypoint = 1;
          npc.nextReturnPlanAt = this.elapsed + 3;
          if (npc.returnPath.length === 0) npc.returnPath = null;
        }
        if (npc.returnPath) {
          let waypoint = npc.returnPath[npc.returnWaypoint];
          if (waypoint && Math.hypot(
            waypoint.x - npc.group.position.x, waypoint.z - npc.group.position.z,
          ) < 0.2) waypoint = npc.returnPath[++npc.returnWaypoint];
          if (waypoint) {
            targetX = waypoint.x;
            targetZ = waypoint.z;
          } else {
            npc.returnPath = null;
          }
        }
        const previousX = npc.group.position.x;
        const previousZ = npc.group.position.z;
        const follow = 1 - Math.exp(-delta * 3.2);
        let nextX = THREE.MathUtils.lerp(
          previousX,
          targetX,
          follow,
        );
        let nextZ = THREE.MathUtils.lerp(
          previousZ,
          targetZ,
          follow,
        );
        const stepX = nextX - previousX;
        const stepZ = nextZ - previousZ;
        const stepDistance = Math.hypot(stepX, stepZ);
        const maximumStep =
          delta * (this.reduceMotion ? 0.48 : 1.35);
        if (stepDistance > maximumStep) {
          const scale = maximumStep / stepDistance;
          nextX = previousX + stepX * scale;
          nextZ = previousZ + stepZ * scale;
        }
        if (!this.stepNpc(
          npc, targetX - previousX, targetZ - previousZ,
          Math.hypot(nextX - previousX, nextZ - previousZ),
        )) {
          // Pick a stable turn direction per NPC. Reversing the phase by a
          // fixed amount immediately gives the ellipse another candidate
          // instead of repeatedly easing its robe into the same wall.
          const turnDirection =
            (npc.interactionId.length + Math.round(Math.abs(npc.home.x))) %
                2 ===
              0
              ? 1
              : -1;
          npc.angle += turnDirection * 0.68;
          npc.returnPath = null;
          npc.wanderPauseUntil = this.elapsed + 0.8;
          npc.nextReturnPlanAt = Math.max(npc.nextReturnPlanAt, this.elapsed + 1);
        }
      } else if (!yielding && speaking && playerDistance > 0.01) {
        npc.steeringHeading = Math.atan2(
          this.playerPosition.x - npc.group.position.x,
          this.playerPosition.z - npc.group.position.z,
        );
      }
      const facingDelta = Math.atan2(
        Math.sin(npc.steeringHeading - npc.group.rotation.y),
        Math.cos(npc.steeringHeading - npc.group.rotation.y),
      );
      npc.group.rotation.y += facingDelta * (1 - Math.exp(-delta * 7));
      const ambientBob =
        Math.sin(this.elapsed * 3.1 * motionScale + npc.angle) *
        0.035 *
        motionScale;
      const signalPhase = this.elapsed * 1.75 * motionScale + npc.angle;
      npc.signalCrystal.position.y =
        2.38 + Math.sin(signalPhase) * 0.075 * motionScale;
      npc.signalCrystal.rotation.y += delta * 1.35 * motionScale;
      npc.signalCrystal.rotation.z =
        Math.sin(signalPhase * 0.73) * 0.16 * motionScale;
      npc.signalAura.position.y = npc.signalCrystal.position.y;
      npc.signalAura.rotation.x =
        Math.PI / 2 + Math.sin(signalPhase * 0.61) * 0.13 * motionScale;
      npc.signalAura.rotation.y =
        Math.cos(signalPhase * 0.47) * 0.16 * motionScale;
      npc.signalAura.scale.setScalar(
        0.94 + Math.sin(signalPhase * 1.3) * 0.11 * motionScale,
      );
      npc.signalAura.material.opacity =
        0.32 + Math.sin(signalPhase * 1.3) * 0.08 * motionScale;
      let speechHop = 0;
      if (speaking) {
        const progress = npc.speechAge / npc.speechDuration;
        const anticipation =
          progress < 0.14
            ? -Math.sin((progress / 0.14) * Math.PI) * 0.052
            : 0;
        const hopProgress = THREE.MathUtils.clamp(
          (progress - 0.1) / 0.72,
          0,
          1,
        );
        speechHop = this.reduceMotion
          ? 0
          : anticipation + Math.sin(hopProgress * Math.PI) * 0.34;
        const flare = Math.sin(
          THREE.MathUtils.clamp(progress / 0.86, 0, 1) * Math.PI,
        );
        npc.speechHalo.visible = flare > 0.01;
        npc.speechHalo.scale.setScalar(0.72 + progress * 1.65);
        npc.speechHalo.material.opacity = flare * 0.88;
      } else {
        npc.speechHalo.visible = false;
        npc.speechHalo.material.opacity = 0;
      }
      npc.group.position.y = npc.feetHeight + ambientBob + speechHop;
      const interaction = this.interactions.find(
        (candidate) => candidate.id === npc.interactionId,
      );
      interaction?.position.set(npc.group.position.x, npc.feetHeight, npc.group.position.z);
    }
  }

  private emitNpcSpeech(
    interactionId: string,
    speaker: string,
    message: string,
    monospaceTerms?: readonly string[],
  ): void {
    const npc = this.wanderingNpcs.find(
      (candidate) => candidate.interactionId === interactionId,
    );
    if (npc) npc.speechAge = 0;
    this.hooks.onStatus(message, {
      kind: "speech",
      speaker,
      monospaceTerms,
    });
  }

  private getNextAtlasRouteZone(destination: ZoneId): ZoneId | null {
    if (destination === this.currentZone) return null;
    if (this.currentZone === "field") {
      return destination === "math" ? "grid" : destination;
    }
    if (this.currentZone === "falls" || this.currentZone === "archive") {
      return "field";
    }
    if (this.currentZone === "grid") {
      return destination === "math" ? "math" : "field";
    }
    return "grid";
  }

  private beginAtlasAutopilot(
    destination: ZoneId,
    source: "atlas" | "terminal",
  ): boolean {
    if (
      this.transitioning ||
      this.pongChallenge.isActive() ||
      this.voidTurtleRide.isRiding()
    ) {
      this.hooks.onStatus(
        "A guided route cannot take the controls from the current activity.",
      );
      return false;
    }
    this.navigation.cancel();
    if (this.tentState?.resting) this.setTentResting(false);
    const started = this.prepareAtlasAutopilot(destination);
    if (started) {
      this.hooks.onStatus(
        source === "atlas"
          ? `No cyan implement answers nearby. The atlas plots a physical route toward ${zoneLabels[destination]}. Any movement key releases the route.`
          : `The terminal resolves a physical route toward ${zoneLabels[destination]}. Any movement key releases the route.`,
      );
    }
    return started;
  }

  private prepareAtlasAutopilot(destination: ZoneId): boolean {
    const nextZone = this.getNextAtlasRouteZone(destination);
    if (!nextZone) {
      this.atlasAutopilot = null;
      return false;
    }
    const portal = this.portalNetwork.findByDestination(nextZone);
    if (!portal) {
      this.atlasAutopilot = null;
      this.hooks.onStatus(
        `The route cannot resolve a physical threshold toward ${zoneLabels[nextZone]} from here.`,
      );
      return false;
    }
    const path = this.findGuidedPath(portal.position);
    if (path.length === 0) {
      this.atlasAutopilot = null;
      this.hooks.onStatus(
        "The route solver finds no safe walkable line to the threshold.",
      );
      return false;
    }
    this.atlasAutopilot = {
      destination,
      nextZone,
      portal,
      path,
      waypointIndex: path.length > 1 ? 1 : 0,
      previousDistance: Number.POSITIVE_INFINITY,
      stalledFor: 0,
    };
    return true;
  }

  private cancelAtlasAutopilot(announce: boolean): void {
    if (!this.atlasAutopilot) return;
    this.atlasAutopilot = null;
    if (announce) {
      this.hooks.onStatus(
        "Manual movement releases the atlas route. Your feet are yours again.",
      );
    }
  }

  private isGuidedPathPointWalkable(
    x: number,
    z: number,
    start: THREE.Vector3,
    goal: THREE.Vector3,
    goalClearance = 1.46,
  ): boolean {
    const boundaryMargin = this.playerRadius + 0.12;
    if (this.bounds.kind === "circle") {
      const radius = this.bounds.radius - boundaryMargin;
      if (x * x + z * z > radius * radius) return false;
    } else if (
      Math.abs(x) > this.bounds.halfWidth - boundaryMargin ||
      Math.abs(z) > this.bounds.halfDepth - boundaryMargin
    ) {
      return false;
    }

    const startDistanceSquared =
      (x - start.x) * (x - start.x) + (z - start.z) * (z - start.z);
    const goalDistanceSquared =
      (x - goal.x) * (x - goal.x) + (z - goal.z) * (z - goal.z);
    if (
      startDistanceSquared < 0.72 * 0.72 ||
      goalDistanceSquared < goalClearance * goalClearance
    ) {
      return true;
    }

    const padding = this.playerRadius + 0.14;
    const pathFeetHeight =
      this.currentZone === "falls" ? this.surfaceOffset : 0;
    const candidates = this.staticColliderIndex.queryPoint(
      x,
      z,
      padding,
      this.staticColliderCandidates,
    );
    for (const collider of candidates) {
      if (collider.enabled === false) continue;
      const top = collider.y + collider.halfHeight;
      const bottom = collider.y - collider.halfHeight;
      if (
        top <= pathFeetHeight + 0.22 ||
        bottom >= pathFeetHeight + this.playerCollisionHeight ||
        (collider.solidTop !== undefined &&
          (collider.solidTop <= pathFeetHeight + 0.22 ||
            isWithinWalkingStep(pathFeetHeight, collider.solidTop, collider.stepHeight)))
      ) {
        continue;
      }
      if (
        x >= collider.x - collider.halfWidth - padding &&
        x <= collider.x + collider.halfWidth + padding &&
        z >= collider.z - collider.halfDepth - padding &&
        z <= collider.z + collider.halfDepth + padding
      ) {
        return false;
      }
    }
    return true;
  }

  private readonly sampleGuidedWalkHeight = (
    x: number, z: number, previousHeight: number,
  ): number | null => this.sampleWalkingHeight(
    x, z, previousHeight, this.playerRadius + 0.04, this.playerCollisionHeight, true,
  );

  private readonly isGuidedJumpPositionClear = (
    x: number, z: number, feet: number, ascending: boolean, verticalTakeoff = false,
  ): boolean => {
    // A stationary lift needs the real body, not extra lateral steering room.
    // Contact-safe boots must not need to back away from an invisible margin.
    // Horizontal travel retains the existing conservative clearance.
    const radius = this.playerRadius + (verticalTakeoff ? 0 : 0.02);
    const solids = this.staticColliderIndex.queryPoint(x, z, radius, this.staticColliderCandidates);
    for (const solid of solids) {
      if (solid.solidTop !== undefined && feet >= solid.solidTop - 0.015) continue;
      if (ascending && solid.clearAbove !== undefined && feet >= solid.clearAbove - 0.01) continue;
      if (loosePropIntersectsSolid(x, z, radius, feet, feet + this.playerCollisionHeight, solid)) return false;
    }
    return true;
  };

  private findGuideJumpDelay(from: WalkPoint, target: WalkPoint): number | null {
    return findGuidedJumpDelay(
      from, target, playerSprintingSpeed * this.speedMultiplier, this.isGuidedJumpPositionClear,
      this.guidedJumpLandingHeight,
    );
  }

  private canGuideJumpFrom(from: WalkPoint, target: WalkPoint): boolean {
    return this.findGuideJumpDelay(from, target) !== null;
  }

  private canGuideDropFrom(from: WalkPoint, target: WalkPoint): boolean {
    return hasGuidedDropClearance(
      from, target, playerSprintingSpeed * this.speedMultiplier,
      this.sampleGuidedWalkHeight, this.isGuidedJumpPositionClear, this.guidedJumpLandingHeight,
      (x, z) => this.getClickNavigationTerrainFootHeight(x, z),
    );
  }

  private readonly containsJumpLandingSupport = (
    surface: SurfaceArea, x: number, z: number,
  ): boolean => this.surfaceContainsPoint(
    surface, x, z,
    // Airborne players have released their previous platform. Its grounded
    // edge grace must not change future landing tests while a route is solved.
    surface.supportMargin ?? (surface.requiresJump ? this.playerRadius * 0.34 : 0),
  );

  private readonly guidedJumpLandingHeight = (
    previousX: number, previousZ: number, previousFeet: number,
    x: number, z: number, feet: number,
  ): number | null => {
    const candidates = this.surfaceAreaIndex.queryPoint(x, z, 0, this.surfaceAreaCandidates);
    const landing = selectDescendingLandingSurface(
      candidates, previousX, previousZ, previousFeet, x, z, feet,
      this.containsJumpLandingSupport,
    );
    return landing ? landing.heightAt(x, z) : null;
  };

  /** One support/clearance contract for walking routes and displaced NPCs. */
  private sampleWalkingHeight(
    x: number, z: number, previousHeight: number,
    radius: number, bodyHeight: number, allowRiver: boolean,
  ): number | null {
    const margin = radius + 0.04;
    if (this.bounds.kind === "circle") {
      if (Math.hypot(x, z) > this.bounds.radius - margin) return null;
    } else if (
      Math.abs(x) > this.bounds.halfWidth - margin ||
      Math.abs(z) > this.bounds.halfDepth - margin
    ) return null;
    const river = this.currentZone === "falls" && isInsideFallsRiver(x, z);
    const ground = river ? -0.16 : 0;
    const supports = this.surfaceAreaIndex.queryPoint(x, z, 0.12, this.surfaceAreaCandidates);
    const height = selectWalkSupportHeight(
      supports, x, z, previousHeight, allowRiver || !river ? ground : null,
      this.containsWalkingSupport,
    );
    if (height === null) return null;
    const solids = this.staticColliderIndex.queryPoint(x, z, radius, this.staticColliderCandidates);
    return hasWalkingClearance(solids, x, z, height, radius, bodyHeight) ? height : null;
  }

  private readonly containsWalkingSupport = (
    surface: SurfaceArea, x: number, z: number,
  ): boolean => this.isWithinSurfaceSupport(surface, x, z);

  private hasGuidedPathLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    start: THREE.Vector3,
    goal: THREE.Vector3,
    goalClearance: number,
  ): boolean {
    const distance = from.distanceTo(to);
    const steps = Math.max(1, Math.ceil(distance / 0.28));
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const x = THREE.MathUtils.lerp(from.x, to.x, progress);
      const z = THREE.MathUtils.lerp(from.z, to.z, progress);
      if (
        !this.isGuidedPathPointWalkable(
          x,
          z,
          start,
          goal,
          goalClearance,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Plans only when a portal or clicked-surface route is requested or becomes
   * stuck. Runtime movement follows this compact path without invoking the nav
   * solver every frame.
   */
  private findGuidedPath(
    goalPosition: THREE.Vector3,
    goalClearance = 1.46,
  ): THREE.Vector3[] {
    const turtle = this.currentZone === "field" ? this.voidTurtleRide.getShellSurface() : null;
    if (turtle && this.surfaceContainsPoint(turtle, goalPosition.x, goalPosition.z) &&
      !this.isInsidePlayableBounds(goalPosition.x, goalPosition.z)) {
      if (this.activePlatform === turtle) return [this.playerPosition.clone(), goalPosition.clone()];
      // Reach a real island takeoff before the final jump. Never ask the
      // ordinary ground grid to walk across the void to the shell's centre.
      const takeoff = goalPosition.clone();
      clampWorldPoint(takeoff, this.bounds);
      takeoff.multiplyScalar(0.999);
      takeoff.y = this.getClickNavigationTerrainFootHeight(takeoff.x, takeoff.z);
      const approach = this.findGuidedPath(takeoff, 0.3);
      return approach.length ? [...approach, goalPosition.clone()] : [];
    }
    if (this.currentZone === "falls") {
      return findGuidedWalkingRoute(
        { x: this.playerPosition.x, y: this.surfaceOffset + this.jumpHeight, z: this.playerPosition.z },
        goalPosition,
        this.sampleGuidedWalkHeight,
      ).map((point) => new THREE.Vector3(point.x, point.y, point.z));
    }
    const start = new THREE.Vector3(
      this.playerPosition.x,
      0,
      this.playerPosition.z,
    );
    const goal = new THREE.Vector3(goalPosition.x, 0, goalPosition.z);
    if (start.distanceTo(goal) < 0.72) return [start, goal];
    // Exact clear endpoints can lie beside a grid cell whose rounded centre
    // is outside the rim. A checked direct walk need not visit that cell.
    if (this.hasGuidedPathLineOfSight(start, goal, start, goal, goalClearance)) return [start, goal];
    const cellSize = 0.72;
    const minimumX =
      this.bounds.kind === "circle"
        ? -this.bounds.radius
        : -this.bounds.halfWidth;
    const maximumX =
      this.bounds.kind === "circle"
        ? this.bounds.radius
        : this.bounds.halfWidth;
    const minimumZ =
      this.bounds.kind === "circle"
        ? -this.bounds.radius
        : -this.bounds.halfDepth;
    const maximumZ =
      this.bounds.kind === "circle"
        ? this.bounds.radius
        : this.bounds.halfDepth;
    const columns = Math.max(2, Math.floor((maximumX - minimumX) / cellSize) + 1);
    const rows = Math.max(2, Math.floor((maximumZ - minimumZ) / cellSize) + 1);
    const cellCount = columns * rows;
    const toColumn = (x: number): number =>
      THREE.MathUtils.clamp(
        Math.round((x - minimumX) / cellSize),
        0,
        columns - 1,
      );
    const toRow = (z: number): number =>
      THREE.MathUtils.clamp(
        Math.round((z - minimumZ) / cellSize),
        0,
        rows - 1,
      );
    const toIndex = (column: number, row: number): number =>
      row * columns + column;
    const toPoint = (index: number): THREE.Vector3 => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return new THREE.Vector3(
        minimumX + column * cellSize,
        0,
        minimumZ + row * cellSize,
      );
    };

    const startIndex = toIndex(toColumn(start.x), toRow(start.z));
    const goalIndex = toIndex(toColumn(goal.x), toRow(goal.z));
    const scores = new Float32Array(cellCount);
    scores.fill(Number.POSITIVE_INFINITY);
    const estimates = new Float32Array(cellCount);
    estimates.fill(Number.POSITIVE_INFINITY);
    const previous = new Int32Array(cellCount);
    previous.fill(-1);
    const closed = new Uint8Array(cellCount);
    const open: number[] = [startIndex];
    scores[startIndex] = 0;
    estimates[startIndex] = start.distanceTo(goal);

    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const;
    let reached = -1;
    let iterations = 0;

    while (open.length > 0 && iterations < cellCount * 2) {
      iterations += 1;
      let bestOpenIndex = 0;
      for (let index = 1; index < open.length; index += 1) {
        const candidateEstimate =
          estimates[open[index] ?? 0] ?? Number.POSITIVE_INFINITY;
        const bestEstimate =
          estimates[open[bestOpenIndex] ?? 0] ??
          Number.POSITIVE_INFINITY;
        if (candidateEstimate < bestEstimate) {
          bestOpenIndex = index;
        }
      }
      const current = open.splice(bestOpenIndex, 1)[0];
      if (current === undefined || closed[current]) continue;
      if (current === goalIndex) {
        reached = current;
        break;
      }
      closed[current] = 1;
      const currentColumn = current % columns;
      const currentRow = Math.floor(current / columns);

      for (const [columnDelta, rowDelta] of directions) {
        const column = currentColumn + columnDelta;
        const row = currentRow + rowDelta;
        if (
          column < 0 ||
          column >= columns ||
          row < 0 ||
          row >= rows
        ) {
          continue;
        }
        const neighbor = toIndex(column, row);
        if (closed[neighbor]) continue;
        const point = toPoint(neighbor);
        if (
          !this.isGuidedPathPointWalkable(
            point.x,
            point.z,
            start,
            goal,
            goalClearance,
          )
        ) {
          continue;
        }
        if (columnDelta !== 0 && rowDelta !== 0) {
          const sideA = toPoint(
            toIndex(currentColumn + columnDelta, currentRow),
          );
          const sideB = toPoint(
            toIndex(currentColumn, currentRow + rowDelta),
          );
          if (
            !this.isGuidedPathPointWalkable(
              sideA.x,
              sideA.z,
              start,
              goal,
              goalClearance,
            ) ||
            !this.isGuidedPathPointWalkable(
              sideB.x,
              sideB.z,
              start,
              goal,
              goalClearance,
            )
          ) {
            continue;
          }
        }
        const stepCost =
          columnDelta === 0 || rowDelta === 0 ? cellSize : cellSize * Math.SQRT2;
        const nextScore =
          (scores[current] ?? Number.POSITIVE_INFINITY) + stepCost;
        if (
          nextScore >=
          (scores[neighbor] ?? Number.POSITIVE_INFINITY)
        ) {
          continue;
        }
        previous[neighbor] = current;
        scores[neighbor] = nextScore;
        estimates[neighbor] =
          nextScore + Math.hypot(point.x - goal.x, point.z - goal.z);
        if (!open.includes(neighbor)) open.push(neighbor);
      }
    }

    if (reached < 0) return [];
    const reversed: THREE.Vector3[] = [];
    for (let index = reached; index >= 0; index = previous[index] ?? -1) {
      reversed.push(toPoint(index));
      if (index === startIndex) break;
    }
    const reconstructedStart = reversed[reversed.length - 1];
    if (
      !reconstructedStart ||
      reconstructedStart.distanceTo(toPoint(startIndex)) > 0.01
    ) {
      return [];
    }
    const raw = reversed.reverse();
    if (raw.length === 1) return [start, goal];
    raw[0] = start;
    raw[raw.length - 1] = goal;

    const simplified: THREE.Vector3[] = [start];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let next = raw.length - 1;
      while (
        next > anchor + 1 &&
        !this.hasGuidedPathLineOfSight(
          raw[anchor] ?? start,
          raw[next] ?? goal,
          start,
          goal,
          goalClearance,
        )
      ) {
        next -= 1;
      }
      simplified.push((raw[next] ?? goal).clone());
      anchor = next;
    }
    return simplified;
  }

  private updateAtlasAutopilotInput(
    axes: MovementAxes,
    delta: number,
    manualMovement: boolean,
    jumpRequested: boolean,
  ): void {
    const route = this.atlasAutopilot;
    if (!route || !this.externalInputEnabled || this.transitioning) return;
    if (manualMovement || jumpRequested || this.input.isSpellHeld()) {
      this.cancelAtlasAutopilot(true);
      return;
    }
    if (
      route.portal !==
        this.portalNetwork.findByDestination(route.nextZone) ||
      route.path.length === 0
    ) {
      this.prepareAtlasAutopilot(route.destination);
      return;
    }

    let waypoint =
      route.path[Math.min(route.waypointIndex, route.path.length - 1)] ??
      route.portal.position;
    let dx = waypoint.x - this.playerPosition.x;
    let dz = waypoint.z - this.playerPosition.z;
    let distance = Math.hypot(dx, dz);
    while (
      distance < 0.48 &&
      route.waypointIndex < route.path.length - 1
    ) {
      route.waypointIndex += 1;
      waypoint =
        route.path[route.waypointIndex] ?? route.portal.position;
      dx = waypoint.x - this.playerPosition.x;
      dz = waypoint.z - this.playerPosition.z;
      distance = Math.hypot(dx, dz);
      route.previousDistance = Number.POSITIVE_INFINITY;
      route.stalledFor = 0;
    }

    const portalDistance = Math.hypot(
      route.portal.position.x - this.playerPosition.x,
      route.portal.position.z - this.playerPosition.z,
    );
    if (
      route.waypointIndex >= route.path.length - 1 &&
      portalDistance < 0.48
    ) {
      axes.horizontal = 0;
      axes.forward = 0;
      axes.running = false;
      route.stalledFor = 0;
      return;
    }

    if (distance > 0.001) {
      const directionX = dx / distance;
      const directionZ = dz / distance;
      axes.forward =
        directionX * this.cameraForward.x +
        directionZ * this.cameraForward.z;
      axes.horizontal =
        directionX * this.cameraRight.x +
        directionZ * this.cameraRight.z;
      axes.running = portalDistance > 2.6;
    }

    if (distance < route.previousDistance - 0.018) {
      route.stalledFor = 0;
    } else {
      route.stalledFor += delta;
    }
    route.previousDistance = distance;
    if (route.stalledFor > 1.1) {
      this.prepareAtlasAutopilot(route.destination);
    }
  }

  private cloneClickNavigationTarget(
    target: ClickNavigationTarget,
  ): ClickNavigationTarget {
    return {
      ...target,
      position: target.position.clone(),
    };
  }

  private getClickNavigationTerrainFootHeight(
    x: number,
    z: number,
  ): number {
    if (this.currentZone !== "falls") return 0;
    return isInsideFallsRiver(x, z) ? -0.16 : 0;
  }

  private getClickNavigationTerrainMarkerY(
    x: number,
    z: number,
  ): number {
    if (this.currentZone !== "falls") return 0.17;
    return isInsideFallsRiver(x, z) ? 0.238 : 0.17;
  }

  private refreshClickNavigationTarget(
    target: ClickNavigationTarget,
  ): void {
    const surface = target.surface;
    if (!surface) {
      target.position.y = this.getClickNavigationTerrainFootHeight(
        target.position.x,
        target.position.z,
      );
      target.markerY = this.getClickNavigationTerrainMarkerY(
        target.position.x,
        target.position.z,
      );
      return;
    }
    if (surface.enabled === false) {
      target.reachable = false;
      return;
    }
    target.position.x = surface.x + target.surfaceOffsetX;
    target.position.z = surface.z + target.surfaceOffsetZ;
    target.position.y = surface.heightAt(
      target.position.x,
      target.position.z,
    );
    target.markerY = target.position.y + 0.045;
    if (
      this.currentZone === "falls" &&
      isWadingInFallsPool(target.position.x, target.position.z, target.position.y)
    ) {
      target.markerY = fallsLandmarks.basin.water + 0.045;
    }
  }

  /** Endpoint validity is local support/body clearance, never route planning. */
  private sampleClickNavigationLanding(
    surface: SurfaceArea | null,
    x: number,
    z: number,
  ): number | null {
    if (surface && this.currentZone === "field" &&
      surface === this.voidTurtleRide.getShellSurface()) {
      if (surface.enabled === false || !this.surfaceContainsPoint(surface, x, z)) return null;
      const height = surface.heightAt(x, z);
      const radius = this.playerRadius + 0.04;
      return hasWalkingClearance(
        this.staticColliderIndex.queryPoint(x, z, radius, this.staticColliderCandidates),
        x, z, height, radius, this.playerCollisionHeight,
      ) ? height : null;
    }
    if (!this.isInsidePlayableBounds(x, z)) return null;
    if (surface && !this.surfaceContainsPoint(surface, x, z)) return null;
    const height = surface
      ? surface.heightAt(x, z)
      : this.getClickNavigationTerrainFootHeight(x, z);
    const supported = this.sampleGuidedWalkHeight(x, z, height);
    return supported !== null && Math.abs(supported - height) < 0.015
      ? height : null;
  }

  private snapClickNavigationTarget(target: ClickNavigationTarget): void {
    if (target.surface && this.currentZone === "field" &&
      target.surface === this.voidTurtleRide.getShellSurface()) {
      // Only this registered landing may extend beyond the ordinary rim;
      // clamping its point to the island would destroy its support identity.
      const shell = target.surface;
      const shellRadius = Math.hypot(shell.x, shell.z);
      if (this.activePlatform !== shell && shellRadius > 0.001 &&
        Math.hypot(target.position.x, target.position.z) > shellRadius - 0.9) {
        // The far half cannot be reached from the island in one jump. Aim at
        // the station-facing cap, not an impossible full-shell-width leap.
        target.position.x = shell.x - shell.x / shellRadius * 0.9;
        target.position.z = shell.z - shell.z / shellRadius * 0.9;
        target.surfaceOffsetX = target.position.x - shell.x;
        target.surfaceOffsetZ = target.position.z - shell.z;
      }
      target.reachable = this.sampleClickNavigationLanding(
        target.surface, target.position.x, target.position.z,
      ) !== null;
      this.refreshClickNavigationTarget(target);
      return;
    }
    const obstacles = this.staticColliderIndex.queryPoint(
      target.position.x, target.position.z, this.playerRadius + 0.04,
      this.clickNavigationSnapObstacles,
    );
    const landing = findNearbyClickLanding(
      target.position, this.bounds,
      (x, z) => this.sampleClickNavigationLanding(target.surface, x, z),
      obstacles, this.playerRadius + 0.04,
    );
    if (!landing) {
      target.reachable = false;
      return;
    }
    target.position.set(landing.x, landing.y, landing.z);
    target.surfaceOffsetX = target.surface ? landing.x - target.surface.x : 0;
    target.surfaceOffsetZ = target.surface ? landing.z - target.surface.z : 0;
    this.refreshClickNavigationTarget(target);
  }

  private distanceToClickNavigationSurface(
    target: ClickNavigationTarget,
  ): number {
    const surface = target.surface;
    if (!surface) {
      return Math.hypot(
        target.position.x - this.playerPosition.x,
        target.position.z - this.playerPosition.z,
      );
    }
    const dx = Math.max(
      0,
      Math.abs(this.playerPosition.x - surface.x) -
        surface.halfWidth,
    );
    const dz = Math.max(
      0,
      Math.abs(this.playerPosition.z - surface.z) -
        surface.halfDepth,
    );
    return Math.hypot(dx, dz);
  }

  private isClickNavigationTargetPotentiallyReachable(
    target: ClickNavigationTarget,
  ): boolean {
    this.refreshClickNavigationTarget(target);
    if (target.blockedAtPick) return false;
    if (!target.preservePortalTarget &&
      this.sampleClickNavigationLanding(
        target.surface, target.position.x, target.position.z,
      ) === null) return false;
    if (!target.surface) return this.isInsidePlayableBounds(
      target.position.x,
      target.position.z,
    );
    if (target.surface.enabled === false) return false;
    if (this.currentZone === "field" && target.surface === this.voidTurtleRide.getShellSurface()) {
      // The bobbing shell can temporarily rise above the jump apex. Keep the
      // destination and let the final takeoff wait for a clear, reachable arc.
      return true;
    }
    // Falls routes can reach any supported, body-clear endpoint through
    // intermediate terraces or jumps. A single jump from the current position
    // (or ground below the goal) cannot establish that a route is impossible.
    // The on-demand solver validates connectivity when the click is committed.
    if (this.currentZone === "falls") {
      return true;
    }

    const currentFeetHeight =
      this.surfaceOffset + this.jumpHeight;
    const heightDelta = target.position.y - currentFeetHeight;
    const directDistance =
      this.distanceToClickNavigationSurface(target);
    if (
      target.surface === this.activePlatform ||
      canGuidedJump(directDistance, heightDelta)
    ) {
      return true;
    }

    // A distant ledge can still be approached across ordinary terrain before
    // the final jump. Higher parkour remains intentionally manual/stepwise:
    // once the player reaches a nearer ledge, the same target may become
    // reachable through the direct check above.
    const terrainHeight = this.getClickNavigationTerrainFootHeight(
      target.position.x,
      target.position.z,
    );
    return canGuidedJump(
      Math.min(1.05, Math.max(0.5, directDistance)),
      target.position.y - terrainHeight,
    );
  }

  private getClickNavigationGoalClearance(
    target: ClickNavigationTarget,
  ): number {
    if (!target.surface) return 0.3;
    return Math.min(
      5.4,
      Math.max(
        1.46,
        Math.hypot(
          target.surface.halfWidth,
          target.surface.halfDepth,
        ) + 0.48,
      ),
    );
  }

  private readNavigationFrame(): NavigationFrame {
    // Reuse one borrowed view; never allocate or expose the full game as a port.
    const frame = this.navigationFrame ??= {
      position: this.playerPosition, forward: this.cameraForward, right: this.cameraRight,
      zone: this.currentZone, revision: 0, elapsed: 0, surfaceOffset: 0, jumpHeight: 0,
      jumpVelocity: 0, activePlatform: null, speedMultiplier: 1,
      walkingSpeed: playerWalkingSpeed, sprintingSpeed: playerSprintingSpeed,
      inputEnabled: false, transitioning: false, locked: false, collapsing: false,
      spellHeld: false, continuous: false, heldTarget: null,
    };
    frame.zone = this.currentZone;
    frame.revision = this.walkingGeometryRevision;
    frame.elapsed = this.elapsed;
    frame.surfaceOffset = this.surfaceOffset;
    frame.jumpHeight = this.jumpHeight;
    frame.jumpVelocity = this.jumpVelocity;
    frame.activePlatform = this.activePlatform;
    frame.speedMultiplier = this.speedMultiplier;
    frame.inputEnabled = this.externalInputEnabled;
    frame.transitioning = this.transitioning;
    frame.locked = this.isNavigationLocked() || this.pongChallenge.isActive() || this.voidTurtleRide.isRiding();
    frame.collapsing = this.worldCollapse !== null;
    frame.spellHeld = this.input.isSpellHeld();
    frame.continuous = this.clickNavigationPress?.continuous === true;
    frame.heldTarget = frame.continuous ? this.clickNavigationPress!.target : null;
    return frame;
  }

  private navigationSupportHeight(point: WalkPoint): number | null {
    if (!this.isInsidePlayableBounds(point.x, point.z)) return null;
    const supports = this.surfaceAreaIndex.queryPoint(point.x, point.z, 0.12, this.surfaceAreaCandidates);
    const height = selectWalkSupportHeight(
      supports, point.x, point.z, point.y,
      this.getClickNavigationTerrainFootHeight(point.x, point.z), this.containsWalkingSupport,
    );
    if (height === null) return null;
    // This is a resting endpoint, not a falling body. Adjacent walkable risers
    // must not invalidate a stair tread; each actual jump still checks its arc.
    const radius = this.playerRadius + 0.02;
    const solids = this.staticColliderIndex.queryPoint(point.x, point.z, radius, this.staticColliderCandidates);
    return hasWalkingClearance(solids, point.x, point.z, height, radius, this.playerCollisionHeight)
      ? height : null;
  }

  private getNavigationRouteGraph(): NavigationRouteGraph | undefined {
    if (this.currentZone !== "falls") return undefined;
    if (this.fallsNavigationGraph?.revision !== this.walkingGeometryRevision) {
      // Indexing anchors is cheap; actual edge checks yield inside planning.
      // The same revision covers collision changes and jump-speed changes.
      this.fallsNavigationGraph = {
        revision: this.walkingGeometryRevision,
        graph: new NavigationRouteGraph(fallsNavigationRoutes),
      };
    }
    return this.fallsNavigationGraph.graph;
  }

  private createNavigationPlanningContext(start: WalkPoint, goal: WalkPoint): NavigationPlanningContext {
    const supports = navigationSupportPoints(
      this.surfaceAreas, start, goal, (x, z) => this.getClickNavigationTerrainFootHeight(x, z),
    );
    return {
      sample: this.sampleGuidedWalkHeight, supports,
      walkingGrid: createWalkingGridHints(
        this.staticColliders, start, goal, this.playerRadius + 0.04, this.playerCollisionHeight,
      ),
      authoredGraph: this.getNavigationRouteGraph(),
      canLand: (point) => {
        const height = this.navigationSupportHeight(point);
        return height !== null && Math.abs(height - point.y) < 0.08;
      },
      canJump: (from, to) => canGuidedJump(
        Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y,
      ) && this.canGuideJumpFrom(from, to),
      canDrop: (from, to) => this.canGuideDropFrom(from, to),
    };
  }

  private updateClickNavigationMarker(): void {
    this.refreshClickNavigationHoverFromPointer();
    const press = this.clickNavigationPress;
    const followingPointer = press?.continuous === true;
    const heldTarget =
      this.clickNavigationPress?.continuous === true
        ? this.clickNavigationPress.target
        : null;
    const pendingTarget = this.navigation.pendingTarget;
    const target = followingPointer ? press.visualTarget : (
      pendingTarget ??
      this.navigation.failure?.target ??
      this.navigation.route?.target ??
      heldTarget ??
      this.clickNavigationHover);
    const marker = this.clickNavigationMarker;
    if (
      !marker ||
      !this.externalInputEnabled ||
      this.transitioning ||
      this.worldCollapse !== null
    ) {
      marker?.hide();
      return;
    }
    // The small anchor is the endpoint of an actual published path, NOT the
    // newest requested/pending target. It never chases unvalidated cursor input.
    const checked = followingPointer ? this.navigation.route?.target : null;
    if (checked) {
      this.refreshClickNavigationTarget(checked);
      this.clickNavigationMarkerPosition.set(checked.position.x, checked.markerY, checked.position.z);
    }
    if (!target) {
      marker.hide();
      marker.showRouteAnchor(checked ? this.clickNavigationMarkerPosition : null);
      return;
    }
    marker.showRouteAnchor(checked && (
      Math.hypot(checked.position.x - target.position.x, checked.position.z - target.position.z) > 0.18 ||
      Math.abs(checked.markerY - target.markerY) > 0.08
    ) ? this.clickNavigationMarkerPosition : null);
    this.refreshClickNavigationTarget(target);
    this.clickNavigationMarkerPosition.set(
      target.position.x,
      target.markerY,
      target.position.z,
    );
    marker.show(
      this.clickNavigationMarkerPosition,
      followingPointer ? (target.reachable ? "reachable" : "blocked")
        : pendingTarget ? "planning"
        : this.navigation.failure ? "failed"
          : !target.reachable ? "blocked"
          : this.navigation.route || heldTarget ? "active" : "reachable",
      this.navigation.failure?.reason,
    );
    marker.update(this.elapsed, this.reduceMotion);
  }

  private raiseTelescope(rig: TelescopeRig): void {
    rig.raised = true;
    rig.targetPitch = -0.76;
    rig.pitchVelocity -= 0.08;
  }

  private updateTelescopeRigs(delta: number): void {
    for (const rig of this.telescopeRigs) {
      const dx = rig.position.x - this.playerPosition.x;
      const dz = rig.position.z - this.playerPosition.z;
      if (rig.raised && dx * dx + dz * dz > 12.25) {
        rig.raised = false;
        rig.targetPitch = -0.16;
        rig.pitchVelocity += 0.26;
      }
      const force = (rig.targetPitch - rig.pivot.rotation.x) * 24;
      rig.pitchVelocity += force * delta;
      rig.pitchVelocity *= Math.exp(-delta * 8.5);
      rig.pivot.rotation.x += rig.pitchVelocity * delta;
    }
  }

  private updateArchiveAsteroidShadow(): void {
    const asteroid = this.archiveAsteroid;
    const shadow = this.archiveAsteroidShadow;
    if (!asteroid || !shadow) return;
    if (this.pongChallenge.hasRoguePacket(asteroid.object)) {
      shadow.visible = false;
      return;
    }

    const placementSurface =
      asteroid === this.heldKickable
        ? this.telekinesisPlacementSurface
        : asteroid.onPlatform
          ? asteroid.platform
          : null;
    const supportHeight =
      placementSurface?.heightAt(
        asteroid.object.position.x,
        asteroid.object.position.z,
      ) ?? 0;
    const liftedHeight = Math.max(
      0,
      asteroid.object.position.y -
        (supportHeight + asteroid.restingY),
    );
    const floorOffset = placementSurface ? 0.012 : 0.125;
    const scale = 1 - Math.min(0.28, liftedHeight * 0.16);

    shadow.visible = asteroid.enabled && asteroid.object.visible;
    shadow.position.set(
      asteroid.object.position.x,
      supportHeight + floorOffset,
      asteroid.object.position.z,
    );
    shadow.scale.set(scale, scale * 0.82, 1);
    shadow.material.opacity =
      0.44 * (1 - Math.min(0.68, liftedHeight * 0.24));
    const traveling = this.travelingAsteroid;
    if (traveling?.object === asteroid.object) {
      traveling.position.copy(asteroid.object.position);
      traveling.quaternion.copy(asteroid.object.quaternion);
      traveling.velocity.copy(asteroid.velocity);
    }
  }

  private tryCaptureTravelingAsteroidAsPongPacket(
    kickable: Kickable,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): boolean {
    const traveling = this.travelingAsteroid;
    if (
      this.currentZone !== "grid" ||
      this.worldCollapse !== null ||
      kickable !== this.archiveAsteroid ||
      traveling?.object !== kickable.object
    ) {
      return false;
    }
    if (
      !this.pongRoguePacketLease ||
      this.pongRoguePacketLease.object !== kickable.object
    ) {
      const lease: PongRoguePacketLease = {
        object: kickable.object,
        velocity: kickable.velocity,
        radius: kickable.radius,
        restingY: kickable.restingY,
        capture: () => {
          this.cancelTelekinesisHold(kickable);
          kickable.enabled = false;
          kickable.onPlatform = false;
          kickable.platform = null;
          kickable.velocity.set(0, 0, 0);
          if (this.archiveAsteroidShadow) {
            this.archiveAsteroidShadow.visible = false;
          }
        },
        sync: (worldVelocity) => {
          const current = this.travelingAsteroid;
          kickable.object.getWorldPosition(
            current?.position ?? this.tempWorld,
          );
          if (current) {
            kickable.object.getWorldQuaternion(current.quaternion);
            current.velocity.copy(worldVelocity);
          }
          if (this.archiveAsteroidShadow) {
            this.archiveAsteroidShadow.visible = false;
          }
        },
        release: (worldVelocity) => {
          kickable.velocity.copy(worldVelocity);
          kickable.enabled = true;
          kickable.kickCooldown = 0.55;
          kickable.pinballRadius =
            this.getTravelingAsteroidPinballRadius();
          const current = this.travelingAsteroid;
          if (current?.object === kickable.object) {
            current.velocity.copy(worldVelocity);
          }
          if (this.archiveAsteroidShadow) {
            this.archiveAsteroidShadow.visible = true;
          }
        },
      };
      this.pongRoguePacketLease = lease;
    }
    return this.pongChallenge.tryCaptureRoguePacket(
      this.pongRoguePacketLease,
      startX,
      startZ,
      endX,
      endZ,
    );
  }

  private createDigitTexture(digit: "0" | "1"): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, 64, 64);
      context.fillStyle = "#ffffff";
      context.font = "800 50px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(digit, 32, 34);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }

  private createDigitStorm(): void {
    const capacity = 46;
    for (const digit of ["0", "1"] as const) {
      const positions = new Float32Array(capacity * 3);
      const geometry = new THREE.BufferGeometry();
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", positionAttribute);
      geometry.setDrawRange(0, 0);
      const material = new THREE.PointsMaterial({
        color: palette.cyan,
        size: 18,
        map: this.createDigitTexture(digit),
        alphaTest: 0.08,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      points.visible = false;
      points.frustumCulled = false;
      points.renderOrder = 4;
      this.scene.add(points);
      this.digitClouds.push({
        points,
        positions,
        velocities: new Float32Array(capacity * 3),
        phases: new Float32Array(capacity),
        count: 0,
      });
    }
  }

  private createThunderEffects(): void {
    // Reserve enough dynamic vertices for the local sky strikes plus the Grid's
    // rack-to-rack chain. This stays one draw call regardless of chain length.
    const positions = new Float32Array(96 * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setDrawRange(0, 0);
    this.thunderBolts = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.thunderBolts.visible = false;
    this.thunderBolts.frustumCulled = false;
    this.thunderBolts.renderOrder = 5;
    this.scene.add(this.thunderBolts);

    this.thunderLight = new THREE.PointLight(palette.cyan, 0, 13, 2);
    this.thunderLight.castShadow = false;
    this.scene.add(this.thunderLight);
  }

  private triggerDigitStorm(stage: SpellStage, charge: number): void {
    const stageIndex = stage === "thunder" ? 2 : stage === "surge" ? 1 : 0;
    const baseCount = stage === "thunder" ? 60 : stage === "surge" ? 43 : 25;
    const qualityScale = this.quality === "low" ? 0.62 : this.quality === "medium" ? 0.82 : 1;
    const motionScale = this.reduceMotion ? 0.52 : 1;
    const chargeCountScale = 0.7 + charge * 0.82;
    const totalCount = Math.max(
      12,
      Math.round(baseCount * qualityScale * motionScale * chargeCountScale),
    );
    this.digitStormAge = 0;
    this.digitStormDuration =
      (stage === "thunder" ? 2 : stage === "surge" ? 1.6 : 1.3) +
      charge * 0.42;
    this.digitStormGroundY = this.shadowSurfaceY + 0.16;

    for (const [cloudIndex, cloud] of this.digitClouds.entries()) {
      const capacity = cloud.positions.length / 3;
      cloud.count = Math.min(capacity, Math.ceil((totalCount - cloudIndex) / 2));
      cloud.points.geometry.setDrawRange(0, cloud.count);
      const baseSize = stage === "thunder" ? 28 : stage === "surge" ? 24 : 19;
      cloud.points.material.size = baseSize + charge * (stage === "spark" ? 11 : 14);
      cloud.points.material.color.setHex(
        cloudIndex === 0
          ? palette.cyan
          : stage === "thunder"
            ? 0xffffff
            : stage === "surge"
              ? palette.violet
              : palette.amber,
      );
      cloud.points.material.opacity = 1;
      cloud.points.visible = true;

      for (let index = 0; index < cloud.count; index += 1) {
        const key = index + cloudIndex * 31 + this.spellCastSequence * 17;
        const randomA = Math.abs(Math.sin(key * 12.9898) * 43758.5453) % 1;
        const randomB = Math.abs(Math.sin((key + 7) * 5.3983) * 19341.117) % 1;
        const randomC = Math.abs(Math.sin((key + 19) * 9.173) * 12731.731) % 1;
        const angle = key * 2.39996 + this.elapsed * 0.7;
        const radius =
          0.35 +
          randomA * (1.8 + stageIndex * 0.62 + charge * 1.75);
        const offset = index * 3;
        cloud.positions[offset] = this.playerPosition.x + Math.cos(angle) * radius;
        cloud.positions[offset + 1] =
          this.digitStormGroundY +
          1.25 +
          randomB * (2.8 + stageIndex * 0.55 + charge * 1.15);
        cloud.positions[offset + 2] = this.playerPosition.z + Math.sin(angle) * radius;
        cloud.velocities[offset] = Math.cos(angle + Math.PI / 2) * (0.12 + randomC * 0.26);
        cloud.velocities[offset + 1] = -(
          0.85 +
          randomA * 1.35 +
          stageIndex * 0.18 +
          charge * 0.32
        );
        cloud.velocities[offset + 2] =
          Math.sin(angle + Math.PI / 2) * (0.12 + randomC * 0.26);
        cloud.phases[index] = angle + randomB * Math.PI;
      }
      cloud.points.geometry.getAttribute("position").needsUpdate = true;
    }
  }

  private triggerThunder(): void {
    this.thunderAge = 0;
    const positions = this.thunderBolts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const values = positions.array as Float32Array;
    const strikeCount = this.quality === "low" ? 2 : 3;
    let vertex = 0;
    const writeVertex = (x: number, y: number, z: number): void => {
      values[vertex * 3] = x;
      values[vertex * 3 + 1] = y;
      values[vertex * 3 + 2] = z;
      vertex += 1;
    };

    for (let strike = 0; strike < strikeCount; strike += 1) {
      const angle =
        this.spellCastSequence * 1.7 +
        strike * (Math.PI * 2 / strikeCount);
      const radius = 1.1 + strike * 0.72;
      const targetX = this.playerPosition.x + Math.cos(angle) * radius;
      const targetZ = this.playerPosition.z + Math.sin(angle) * radius;
      let previousX = this.playerPosition.x + Math.cos(angle + 0.5) * 0.35;
      let previousY = this.digitStormGroundY + 5.4 + strike * 0.35;
      let previousZ = this.playerPosition.z + Math.sin(angle + 0.5) * 0.35;
      for (let segment = 1; segment <= 7; segment += 1) {
        const progress = segment / 7;
        const taper = 1 - progress;
        const jitter = Math.sin((strike + 1) * 8.2 + segment * 4.7) * 0.46 * taper;
        const nextX =
          THREE.MathUtils.lerp(this.playerPosition.x, targetX, progress) +
          Math.cos(angle + Math.PI / 2) * jitter;
        const nextY = THREE.MathUtils.lerp(
          this.digitStormGroundY + 5.4 + strike * 0.35,
          this.digitStormGroundY,
          progress,
        );
        const nextZ =
          THREE.MathUtils.lerp(this.playerPosition.z, targetZ, progress) +
          Math.sin(angle + Math.PI / 2) * jitter;
        writeVertex(previousX, previousY, previousZ);
        writeVertex(nextX, nextY, nextZ);
        previousX = nextX;
        previousY = nextY;
        previousZ = nextZ;
      }
    }

    if (this.currentZone === "grid" && this.serverRacks.length > 0) {
      const remaining = this.serverRacks.map((rack) => rack.position.clone());
      let chainStart = new THREE.Vector3(
        this.playerPosition.x,
        this.surfaceOffset + this.jumpHeight + 1.55,
        this.playerPosition.z,
      );
      let link = 0;
      while (remaining.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const [index, target] of remaining.entries()) {
          const distance = target.distanceToSquared(chainStart);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        }
        const chainTarget = remaining.splice(nearestIndex, 1)[0];
        if (!chainTarget) break;
        const dx = chainTarget.x - chainStart.x;
        const dz = chainTarget.z - chainStart.z;
        const horizontalLength = Math.max(0.001, Math.hypot(dx, dz));
        const perpendicularX = -dz / horizontalLength;
        const perpendicularZ = dx / horizontalLength;
        let previousX = chainStart.x;
        let previousY = chainStart.y;
        let previousZ = chainStart.z;
        const segments = this.reduceMotion ? 5 : 8;
        for (let segment = 1; segment <= segments; segment += 1) {
          const progress = segment / segments;
          const envelope = Math.sin(progress * Math.PI);
          const jitter =
            Math.sin(
              this.spellCastSequence * 2.1 +
                link * 4.7 +
                segment * 5.35,
            ) *
            0.52 *
            envelope *
            (this.reduceMotion ? 0.28 : 1);
          const nextX =
            THREE.MathUtils.lerp(chainStart.x, chainTarget.x, progress) +
            perpendicularX * jitter;
          const nextY =
            THREE.MathUtils.lerp(chainStart.y, chainTarget.y, progress) +
            envelope * (0.34 + horizontalLength * 0.035);
          const nextZ =
            THREE.MathUtils.lerp(chainStart.z, chainTarget.z, progress) +
            perpendicularZ * jitter;
          writeVertex(previousX, previousY, previousZ);
          writeVertex(nextX, nextY, nextZ);
          previousX = nextX;
          previousY = nextY;
          previousZ = nextZ;
        }
        chainStart = chainTarget;
        link += 1;
      }
    }
    this.thunderBolts.geometry.setDrawRange(0, vertex);
    positions.needsUpdate = true;
    this.thunderBolts.material.opacity = 1;
    this.thunderBolts.visible = true;
    this.thunderLight.position.set(
      this.playerPosition.x,
      this.digitStormGroundY + 2.4,
      this.playerPosition.z,
    );
    this.thunderLight.intensity = 12;
  }

  private updateDigitStorm(delta: number): void {
    if (this.digitStormAge >= this.digitStormDuration) return;
    this.digitStormAge += delta;
    const progress = Math.min(1, this.digitStormAge / this.digitStormDuration);
    const opacity = Math.min(1, this.digitStormAge * 7) * Math.pow(1 - progress, 0.58);
    for (const cloud of this.digitClouds) {
      cloud.points.material.opacity = opacity;
      if (!this.reduceMotion) {
        for (let index = 0; index < cloud.count; index += 1) {
          const offset = index * 3;
          const phase = cloud.phases[index] ?? 0;
          cloud.positions[offset] =
            (cloud.positions[offset] ?? 0) +
            ((cloud.velocities[offset] ?? 0) +
              Math.sin(phase + this.digitStormAge * 5) * 0.12) *
              delta;
          cloud.positions[offset + 1] =
            (cloud.positions[offset + 1] ?? 0) +
            (cloud.velocities[offset + 1] ?? 0) * delta;
          cloud.positions[offset + 2] =
            (cloud.positions[offset + 2] ?? 0) +
            ((cloud.velocities[offset + 2] ?? 0) +
              Math.cos(phase + this.digitStormAge * 4.2) * 0.12) *
              delta;
          if ((cloud.positions[offset + 1] ?? 0) < this.digitStormGroundY) {
            cloud.positions[offset + 1] = this.digitStormGroundY;
            cloud.velocities[offset + 1] = 0;
          }
        }
        cloud.points.geometry.getAttribute("position").needsUpdate = true;
      }
      if (progress >= 1) cloud.points.visible = false;
    }
  }

  private triggerServerRackFlicker(stage: SpellStage): void {
    this.serverFlickerAge = 0;
    this.serverFlickerStage = stage;
    this.serverFlickerDuration = stage === "thunder" ? 2.35 : 1.1;
  }

  private updateServerRackFlicker(delta: number): void {
    if (this.serverFlickerAge >= this.serverFlickerDuration) {
      for (const [rackIndex, rack] of this.serverRacks.entries()) {
        for (const [barIndex, bar] of rack.bars.entries()) {
          bar.visible = true;
          bar.scale.x = this.reduceMotion
            ? 0.92
            : 0.78 +
              (Math.sin(
                this.elapsed * (1.7 + barIndex * 0.23) +
                  rackIndex * 1.9 +
                  barIndex * 2.4,
              ) *
                0.5 +
                0.5) *
                0.22;
        }
        rack.cap.scale.setScalar(1);
      }
      return;
    }
    this.serverFlickerAge += delta;
    const progress = Math.min(1, this.serverFlickerAge / this.serverFlickerDuration);
    for (const [rackIndex, rack] of this.serverRacks.entries()) {
      for (const [barIndex, bar] of rack.bars.entries()) {
        const wave =
          Math.sin(this.serverFlickerAge * 22 - rackIndex * 2.3 - barIndex * 1.7) * 0.5 + 0.5;
        const outage =
          this.serverFlickerStage === "thunder" &&
          Math.sin(this.serverFlickerAge * 41 + rackIndex * 7 + barIndex * 3) < -0.35;
        bar.visible = !outage;
        bar.scale.x = 0.2 + wave * 0.8;
      }
      const capPulse = 1 + Math.sin(this.serverFlickerAge * 18 + rackIndex) * 0.16 * (1 - progress);
      rack.cap.scale.setScalar(capPulse);
    }
    if (progress >= 1) {
      for (const rack of this.serverRacks) {
        for (const bar of rack.bars) {
          bar.visible = true;
          bar.scale.x = 1;
        }
        rack.cap.scale.setScalar(1);
      }
    }
  }

  private updateSpell(delta: number): void {
    this.spellCooldown = Math.max(0, this.spellCooldown - delta);
    if (this.spellCharging) {
      this.spellCharge = Math.min(1, this.spellCharge + delta / 1.3);
      this.hooks.onSpellCharge(this.spellCharge, true);
    }
    this.spellAge = Math.min(3, this.spellAge + delta);
    const effectFrame = this.spellChargeEffectFrame;
    effectFrame.charging = this.spellCharging;
    effectFrame.charge = this.spellCharge;
    effectFrame.castAge = this.spellAge;
    effectFrame.castCharge = this.spellCastCharge;
    effectFrame.stage = this.spellCharging
      ? this.spellStage
      : this.activeSpellStage;
    effectFrame.packetInterferenceUnlocked =
      this.packetInterferenceUnlocked;
    effectFrame.elapsed = this.elapsed;
    effectFrame.reducedMotion = this.reduceMotion;
    effectFrame.quality = this.quality;
    this.spellChargeEffect.update(delta, effectFrame);
    if (this.spellRing.visible) {
      const isThunder = this.activeSpellStage === "thunder";
      const duration = isThunder ? 0.9 : 0.72;
      const progress = Math.min(1, this.spellAge / duration);
      const startScale = isThunder ? 0.7 : 0.48;
      const expansion =
        (isThunder ? 10.5 : 6.4) + this.spellCastCharge * (isThunder ? 3.2 : 4.4);
      this.spellRing.scale.setScalar(startScale + progress * expansion);
      this.spellRing.material.opacity =
        (1 - progress) * (isThunder ? 0.86 : 0.72);
      if (progress >= 1) this.spellRing.visible = false;
    }

    this.updateDigitStorm(delta);
    if (this.thunderBolts.visible) {
      this.thunderAge += delta;
      const thunderDuration = this.currentZone === "grid" ? 1.05 : 0.68;
      const progress = Math.min(1, this.thunderAge / thunderDuration);
      this.thunderBolts.material.opacity =
        (1 - progress) * (0.7 + Math.abs(Math.sin(this.thunderAge * 46)) * 0.3);
      this.thunderLight.intensity = (1 - progress) * (9 + Math.sin(this.thunderAge * 55) * 3);
      if (progress >= 1) {
        this.thunderBolts.visible = false;
        this.thunderLight.intensity = 0;
      }
    }
    this.updateServerRackFlicker(delta);

    let nearestLantern: LanternState | null = null;
    let secondNearestLantern: LanternState | null = null;
    let nearestLanternDistance = Number.POSITIVE_INFINITY;
    let secondNearestLanternDistance = Number.POSITIVE_INFINITY;
    for (const lantern of this.lanterns) {
      const distanceToPlayer =
        lantern.position.distanceToSquared(this.playerPosition);
      if (distanceToPlayer < nearestLanternDistance) {
        secondNearestLantern = nearestLantern;
        secondNearestLanternDistance = nearestLanternDistance;
        nearestLantern = lantern;
        nearestLanternDistance = distanceToPlayer;
      } else if (distanceToPlayer < secondNearestLanternDistance) {
        secondNearestLantern = lantern;
        secondNearestLanternDistance = distanceToPlayer;
      }
      const lit = lantern.litUntil > this.elapsed;
      const target = lit ? 1.65 + Math.sin(this.elapsed * 8) * 0.08 : 1;
      const scale = THREE.MathUtils.lerp(
        lantern.light.scale.x,
        target,
        1 - Math.exp(-delta * 9),
      );
      lantern.light.scale.setScalar(scale);
      const flicker =
        0.96 +
        Math.sin(
          this.elapsed * (lit ? 9.4 : 4.8) +
            lantern.position.x * 0.37 +
            lantern.position.z * 0.21,
        ) *
          (lit ? 0.055 : 0.025);
      const qualityLightScale =
        this.quality === "low"
          ? 0.48
          : this.quality === "medium"
            ? 0.78
            : 1;
      const targetIntensity =
        qualityLightScale * (lit ? 5.4 : 1.85) * flicker;
      lantern.targetLightIntensity = targetIntensity;
      lantern.targetLightDistance = lit ? 6.6 : 4.8;
      const poolOpacity = (lit ? 0.2 : 0.095) * qualityLightScale * flicker;
      lantern.pool.material.uniforms.opacity!.value =
        THREE.MathUtils.lerp(
          Number(lantern.pool.material.uniforms.opacity!.value),
          poolOpacity,
          1 - Math.exp(-delta * 7),
        );
      const poolScale = lit ? 5.4 : 4;
      lantern.pool.scale.setScalar(
        THREE.MathUtils.lerp(
          lantern.pool.scale.x,
          poolScale,
          1 - Math.exp(-delta * 5),
        ),
      );
    }
    this.updateFieldLanternLightPool(
      delta,
      nearestLantern,
      secondNearestLantern,
    );
  }

  private updateFieldLanternLightPool(
    delta: number,
    nearest: LanternState | null,
    secondNearest: LanternState | null,
  ): void {
    const firstLease = this.fieldLanternLightLeases[0];
    const secondLease = this.fieldLanternLightLeases[1];
    if (!firstLease || !secondLease) return;

    let firstTarget =
      firstLease.lantern === nearest ||
      firstLease.lantern === secondNearest
        ? firstLease.lantern
        : null;
    let secondTarget =
      secondLease.lantern !== firstTarget &&
      (secondLease.lantern === nearest ||
        secondLease.lantern === secondNearest)
        ? secondLease.lantern
        : null;

    if (!firstTarget) {
      firstTarget =
        nearest !== secondTarget ? nearest : secondNearest;
    }
    if (!secondTarget) {
      secondTarget =
        nearest !== firstTarget ? nearest : secondNearest;
    }

    this.updateFieldLanternLightLease(firstLease, firstTarget, delta);
    this.updateFieldLanternLightLease(secondLease, secondTarget, delta);
  }

  private updateFieldLanternLightLease(
    lease: FieldLanternLightLease,
    lantern: LanternState | null,
    delta: number,
  ): void {
    const { light } = lease;
    if (lease.lantern !== lantern) {
      lease.lantern = lantern;
      light.intensity = 0;
      if (lantern) {
        light.position.set(
          lantern.position.x,
          2.25,
          lantern.position.z,
        );
        light.distance = lantern.targetLightDistance;
      }
    }
    const pointLightsEnabled = this.quality !== "low";
    const targetIntensity =
      pointLightsEnabled && lantern
        ? lantern.targetLightIntensity
        : 0;
    light.intensity = THREE.MathUtils.lerp(
      light.intensity,
      targetIntensity,
      1 - Math.exp(-delta * 7),
    );
    if (lantern) {
      light.distance = THREE.MathUtils.lerp(
        light.distance,
        lantern.targetLightDistance,
        1 - Math.exp(-delta * 5),
      );
    }
  }

  private createLanternEffects(): void {
    this.lanternLight = new THREE.PointLight(palette.amber, 0, 9, 2);
    this.lanternLight.position.set(0, -0.12, 0.08);
    this.lanternLight.castShadow = false;
    this.player.lantern.add(this.lanternLight);

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 62);
      gradient.addColorStop(0, "rgba(255, 176, 70, 1)");
      gradient.addColorStop(0.28, "rgba(255, 126, 28, .62)");
      gradient.addColorStop(0.72, "rgba(255, 92, 18, .12)");
      gradient.addColorStop(1, "rgba(255, 76, 8, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.lanternAura = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff8a28,
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.lanternAura.rotation.x = -Math.PI / 2;
    this.lanternAura.visible = false;
    this.lanternAura.renderOrder = 2;
    this.scene.add(this.lanternAura);
  }

  private createPlayerOcclusionOutline(): void {
    this.playerOcclusionOutlineMaterial = new THREE.ShaderMaterial({
      name: "player-occluded-fragment-rim",
      uniforms: {
        outlineColor: { value: new THREE.Color(0x55dce8) },
        coreColor: { value: new THREE.Color(0xffdfa0) },
        opacity: { value: 0.94 },
        expansion: { value: 0.035 },
      },
      vertexShader: `
        uniform float expansion;
        varying vec3 viewNormal;
        varying vec3 viewDirection;

        void main() {
          vec3 expandedPosition = position + normalize(normal) * expansion;
          vec4 viewPosition = modelViewMatrix * vec4(expandedPosition, 1.0);
          viewNormal = normalize(normalMatrix * normal);
          viewDirection = normalize(-viewPosition.xyz);
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 outlineColor;
        uniform vec3 coreColor;
        uniform float opacity;
        varying vec3 viewNormal;
        varying vec3 viewDirection;

        void main() {
          float facing = abs(dot(
            normalize(viewNormal),
            normalize(viewDirection)
          ));
          float rim = 1.0 - facing;
          float halo = smoothstep(0.42, 0.84, rim);
          float core = smoothstep(0.78, 0.98, rim);
          float alpha = (halo * 0.56 + core * 0.44) * opacity;
          if (alpha < 0.025) discard;
          gl_FragColor = vec4(
            mix(outlineColor, coreColor, core * 0.72),
            alpha
          );
        }
      `,
      transparent: true,
      // Compare the expanded avatar against the completed scene depth. Visible
      // fragments fail this test; only the portions genuinely behind geometry
      // receive the cyan readability rim.
      depthTest: true,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });

    const avatarMeshes: THREE.Mesh[] = [];
    this.player.group.traverse((object) => {
      if (object instanceof THREE.Mesh) avatarMeshes.push(object);
    });
    for (const [index, source] of avatarMeshes.entries()) {
      source.layers.set(playerRenderLayer);
      const outline = new THREE.Mesh(
        source.geometry,
        this.playerOcclusionOutlineMaterial,
      );
      outline.name = `player-occlusion-outline-${index}`;
      outline.castShadow = false;
      outline.receiveShadow = false;
      outline.frustumCulled = false;
      outline.renderOrder = 1000;
      outline.visible = false;
      outline.layers.set(playerRevealRenderLayer);
      outline.userData.playerOcclusionOutline = true;
      source.add(outline);
      this.playerOcclusionOutlines.push(outline);
    }
  }

  private setPlayerOcclusionOutlineVisible(visible: boolean): void {
    this.playerOcclusionActive = visible;
    for (const outline of this.playerOcclusionOutlines) {
      outline.visible = visible;
    }
  }

  private registerPlayerOccluder(object: THREE.Object3D): void {
    object.traverse((child) => {
      child.layers.enable(playerOcclusionLayer);
    });
    this.playerOccluders.add(object);
  }

  private updatePlayerOcclusionOutline(): void {
    this.player.group.getWorldPosition(this.playerOcclusionTarget);
    const playerBaseY = this.playerOcclusionTarget.y;

    if (this.playerOccluders.objects.length === 0) {
      this.setPlayerOcclusionOutlineVisible(false);
      this.playerShadow.visible = true;
      return;
    }

    this.playerOcclusionRaycaster.camera = this.camera;
    this.playerOcclusionRaycaster.near = 0;
    this.playerOccluders.prepare();

    let occluded = false;
    // A torso-only ray misses cases such as a tree crown hiding the head or a
    // low ledge hiding the boots. Sample the avatar vertically; scene depth
    // still decides exactly which fragments of the duplicate mesh are drawn.
    for (const sampleHeight of playerOcclusionSampleHeights) {
      this.playerOcclusionTarget.y = playerBaseY + sampleHeight;
      const distance = this.camera.position.distanceTo(
        this.playerOcclusionTarget,
      );
      this.playerOcclusionDirection
        .subVectors(this.playerOcclusionTarget, this.camera.position)
        .normalize();
      this.playerOcclusionRaycaster.set(
        this.camera.position,
        this.playerOcclusionDirection,
      );
      // Occluding surfaces can sit almost flush with the avatar when it hugs a
      // cliff or passes beneath a ledge. Keep only a tiny target-side guard so
      // those close surfaces still reveal the silhouette.
      this.playerOcclusionRaycaster.far = Math.max(0, distance - 0.05);

      occluded = this.playerOccluders.intersects(this.playerOcclusionRaycaster);
      if (occluded) break;
    }
    this.setPlayerOcclusionOutlineVisible(occluded);
    // The shadow has its own depth test and can remain naturally visible where
    // the ground is exposed even when only part of the avatar is hidden.
    this.playerShadow.visible = true;
  }

  private updateLantern(delta: number): void {
    const target = this.lanternEnabled ? 1 : 0;
    const follow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 10);
    this.lanternBlend = THREE.MathUtils.lerp(this.lanternBlend, target, follow);

    this.player.lantern.position.set(
      THREE.MathUtils.lerp(-0.62, -0.82, this.lanternBlend),
      THREE.MathUtils.lerp(1.32, 1.08, this.lanternBlend),
      THREE.MathUtils.lerp(-0.22, 0.34, this.lanternBlend),
    );
    const spellStrength =
      this.activeSpellStage === "thunder"
        ? 0.95
        : this.activeSpellStage === "surge"
          ? 0.65
          : 0.42;
    const castPulse =
      this.spellAge < 0.9
        ? Math.sin((this.spellAge / 0.9) * Math.PI) * spellStrength
        : 0;
    const chargePulse =
      this.spellCharging
        ? this.spellCharge * 0.34 + Math.sin(this.elapsed * 13) * this.spellCharge * 0.04
        : 0;
    const lanternScale =
      THREE.MathUtils.lerp(0.66, 1, this.lanternBlend) * (1 + castPulse + chargePulse);
    this.player.lantern.scale.setScalar(lanternScale);
    this.player.lanternCore.material.emissiveIntensity =
      0.12 + this.lanternBlend * 3.8 + castPulse * 2.2 + chargePulse * 3.5;

    const qualityScale = this.quality === "low" ? 0.72 : 1;
    this.lanternLight.intensity =
      this.lanternBlend *
      qualityScale *
      (5.2 + this.spellCharge * 3.8 + Math.sin(this.elapsed * 5.5) * 0.16);
    this.lanternAura.visible = this.lanternBlend > 0.015;
    this.lanternAura.position.set(
      this.playerPosition.x,
      this.shadowSurfaceY + 0.025,
      this.playerPosition.z,
    );
    const auraSize = 7.2 + this.spellCharge * 3.2;
    this.lanternAura.scale.setScalar(auraSize);
    this.lanternAura.material.opacity =
      this.lanternBlend *
      (0.12 + this.spellCharge * 0.065) *
      (0.94 + Math.sin(this.elapsed * 4.2) * 0.06);

    for (const reveal of this.lanternReveals) {
      if (reveal.isAvailable && !reveal.isAvailable()) {
        reveal.mesh.material.opacity = 0;
        reveal.mesh.visible = false;
        continue;
      }
      const revealPosition = reveal.position ?? reveal.mesh.position;
      const dx = revealPosition.x - this.playerPosition.x;
      const dz = revealPosition.z - this.playerPosition.z;
      const proximity = THREE.MathUtils.clamp(
        1 - Math.hypot(dx, dz) / reveal.range,
        0,
        1,
      );
      reveal.mesh.material.opacity =
        this.lanternBlend *
        THREE.MathUtils.smoothstep(proximity, 0.05, 0.72) *
        (0.88 + Math.sin(this.elapsed * 3.4) * 0.08);
      reveal.mesh.visible = reveal.mesh.material.opacity > 0.01;
    }
  }

  private createLanternReveal(
    parent: THREE.Group,
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    rotation: number,
    id: string,
    label: string,
    message: string,
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 224;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "rgba(255, 150, 46, .42)";
      context.lineWidth = 4;
      context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
      context.fillStyle = "#ffb45a";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const lines = text.split("|");
      let fontSize = lines.length > 1 ? 54 : 62;
      const fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, monospace";
      context.font = `800 ${fontSize}px ${fontFamily}`;
      while (
        fontSize > 30 &&
        Math.max(...lines.map((line) => context.measureText(line).width)) >
          canvas.width - 170
      ) {
        fontSize -= 2;
        context.font = `800 ${fontSize}px ${fontFamily}`;
      }
      lines.forEach((line, index) => {
        const lineY = canvas.height / 2 + (index - (lines.length - 1) / 2) * 66;
        context.fillText(line, canvas.width / 2, lineY);
      });
      context.fillStyle = "rgba(255, 190, 94, .7)";
      context.font = `800 46px ${fontFamily}`;
      context.fillText("⌁", 54, canvas.height / 2);
      context.fillText("⌁", canvas.width - 54, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffa33a,
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.292), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(-Math.PI / 2, 0, rotation);
    mesh.visible = false;
    mesh.renderOrder = 3;
    parent.add(mesh);
    this.lanternReveals.push({ mesh, range: 7.2 });
    this.addInteraction(id, label, x, z, 2.2, () => this.hooks.onStatus(message), true);
  }

  private registerKickable(
    object: THREE.Object3D,
    radius: number,
    restingY: number,
    platform: SurfaceArea | null,
    gravity: boolean,
    pinballRadius: number | null,
    friction: number,
    message: string,
  ): Kickable {
    const platformHeight = platform?.heightAt(object.position.x, object.position.z) ?? 0;
    const kickable: Kickable = {
      object,
      velocity: new THREE.Vector3(),
      enabled: true,
      radius,
      restingY,
      platform,
      platformOffset: platform ? object.position.y - platformHeight : 0,
      onPlatform: platform !== null,
      gravity,
      pinballRadius,
      friction,
      kickCooldown: 0,
      message,
    };
    this.kickables.push(kickable);
    return kickable;
  }

  private traceAmbientGridWithPencil(
    kickable: Kickable,
    amount: number,
  ): void {
    if (kickable.object.userData.gridPencil !== true) {
      return;
    }
    const tip = kickable.object.getObjectByName(
      "planning-pencil-repair-tip",
    );
    if (!tip) return;
    kickable.object.updateWorldMatrix(true, true);
    tip.getWorldPosition(this.tempWorld);
    const rockRepairStarted = this.beginFieldRockPencilRepair(
      kickable,
      this.tempWorld,
    );
    if (!this.ambientGrid) return;
    const viewRay =
      kickable === this.heldKickable
        ? this.pencilRepairRay.set(
            this.pencilRepairRayOrigin
              .copy(this.tempWorld)
              .addScaledVector(
                this.camera.getWorldDirection(
                  this.pencilRepairDirection,
                ),
                -80,
              ),
            this.pencilRepairDirection,
          )
        : null;
    const result = this.ambientGrid.redrawWithPencil(
      this.tempWorld,
      amount,
      viewRay,
    );
    if (
      result === "assembly-started" &&
      !rockRepairStarted &&
      this.elapsed - this.lastGridPencilReaction > 3
    ) {
      this.lastGridPencilReaction = this.elapsed;
      this.hooks.onStatus(
        "The pencil catches a severed coordinate. Loose lines begin remembering a rectangle.",
      );
    }
  }

  private findSphericalSupport(
    kickable: Kickable,
    x: number,
    z: number,
  ): SurfaceArea | null {
    let highestSurface: SurfaceArea | null = null;
    let highestSupport = Number.NEGATIVE_INFINITY;
    const candidates = this.surfaceAreaIndex.queryPoint(
      x,
      z,
      0,
      this.surfaceAreaCandidates,
    );
    for (const surface of candidates) {
      if (
        surface.id === "math-mind-reader-loose-orb-top" ||
        !this.surfaceContainsPoint(surface, x, z)
      ) {
        continue;
      }
      const height = surface.heightAt(x, z);
      if (
        height <= kickable.object.position.y + kickable.radius + 0.18 &&
        height > highestSupport
      ) {
        highestSupport = height;
        highestSurface = surface;
      }
    }
    return highestSurface;
  }

  private updateKickables(delta: number, playerMoving: boolean): void {
    for (const kickable of this.kickables) {
      if (!kickable.enabled || kickable === this.heldKickable) continue;
      if (kickable.object.userData.ritualSocketed === true) continue;
      if (this.voidTurtleRide.isOrbitControlled(kickable)) continue;
      const previousY = kickable.object.position.y;
      kickable.kickCooldown = Math.max(0, kickable.kickCooldown - delta);
      const dx = kickable.object.position.x - this.playerPosition.x;
      const dz = kickable.object.position.z - this.playerPosition.z;
      const contact = kickable.radius + this.playerRadius + 0.12;
      if (
        playerMoving &&
        kickable.kickCooldown <= 0 &&
        Math.abs(
          kickable.object.position.y - (this.surfaceOffset + this.jumpHeight),
        ) < this.playerCollisionHeight &&
        dx * dx + dz * dz < contact * contact
      ) {
        const movementLength = Math.hypot(this.movement.x, this.movement.z);
        const fallbackLength = Math.max(0.001, Math.hypot(dx, dz));
        const directionX =
          movementLength > 0.001 ? this.movement.x / movementLength : dx / fallbackLength;
        const directionZ =
          movementLength > 0.001 ? this.movement.z / movementLength : dz / fallbackLength;
        kickable.velocity.x += directionX * (kickable.pinballRadius ? 5.6 : 3.8);
        kickable.velocity.z += directionZ * (kickable.pinballRadius ? 5.6 : 3.8);
        kickable.kickCooldown = 0.42;
        if (kickable.message) {
          this.hooks.onStatus(kickable.message);
          if (kickable.pinballRadius) kickable.message = "";
        }
      } else if (
        kickable.pinballRadius !== null &&
        kickable.kickCooldown <= 0 &&
        dx * dx + dz * dz < contact * contact
      ) {
        const speed = Math.hypot(kickable.velocity.x, kickable.velocity.z);
        if (speed > 0.38) {
          const fallbackLength = Math.max(0.001, Math.hypot(dx, dz));
          const directionX =
            fallbackLength > 0.01 ? dx / fallbackLength : -kickable.velocity.x / speed;
          const directionZ =
            fallbackLength > 0.01 ? dz / fallbackLength : -kickable.velocity.z / speed;
          const approach =
            kickable.velocity.x * directionX +
            kickable.velocity.z * directionZ;
          if (approach < -0.04) {
            kickable.object.position.x =
              this.playerPosition.x + directionX * contact;
            kickable.object.position.z =
              this.playerPosition.z + directionZ * contact;
            kickable.velocity.x -= 1.84 * approach * directionX;
            kickable.velocity.z -= 1.84 * approach * directionZ;
            kickable.kickCooldown = 0.16;
          }
        }
      }

      if (kickable.gravity && !kickable.onPlatform) kickable.velocity.y -= 12 * delta;

      let nextX = kickable.object.position.x + kickable.velocity.x * delta;
      let nextZ = kickable.object.position.z + kickable.velocity.z * delta;
      let sphericalSupport: SurfaceArea | null = null;
      let sphericalSupportSampled = false;
      if (kickable.pinballRadius) {
        const ritualImpact =
          this.currentZone === "falls" &&
          kickable === this.archiveAsteroid
            ? this.fallsRuneRitual.resolvePinballImpact(
                kickable,
                nextX,
                nextZ,
              )
            : null;
        if (ritualImpact) {
          [nextX, nextZ] = ritualImpact;
        }
        const pinballGoal = this.resolvePinballAsteroidGoal(
          kickable,
          nextX,
          nextZ,
        );
        if (pinballGoal === "teleported") continue;
        if (pinballGoal === "monitor") {
          nextX = kickable.object.position.x;
          nextZ = kickable.object.position.z;
        } else {
          if (this.kickableHitsStatic(kickable, nextX, kickable.object.position.z)) {
            kickable.velocity.x *= -0.82;
            nextX = kickable.object.position.x;
          }
          if (this.kickableHitsStatic(kickable, nextX, nextZ)) {
            kickable.velocity.z *= -0.82;
            nextZ = kickable.object.position.z;
          }
        }
        const distance = Math.hypot(nextX, nextZ);
        const limit = kickable.pinballRadius - kickable.radius;
        if (distance > limit) {
          const nx = nextX / distance;
          const nz = nextZ / distance;
          const dot = kickable.velocity.x * nx + kickable.velocity.z * nz;
          kickable.velocity.x -= 1.85 * dot * nx;
          kickable.velocity.z -= 1.85 * dot * nz;
          nextX = nx * limit;
          nextZ = nz * limit;
        }
        if (
          kickable.gravity &&
          kickable.object.userData.sphericalLooseBody === true
        ) {
          sphericalSupport = this.findSphericalSupport(
            kickable,
            nextX,
            nextZ,
          );
          sphericalSupportSampled = true;
          kickable.object.userData.sphericalFloorY =
            sphericalSupport?.heightAt(nextX, nextZ) ?? 0.155;
        }
      } else if (
        kickable.gravity &&
        Math.abs(kickable.velocity.x) + Math.abs(kickable.velocity.z) > 0.001
      ) {
        if (kickable.collisionHeight === undefined) {
          kickable.object.updateWorldMatrix(true, true);
          this.tempBounds.setFromObject(kickable.object);
        }
        const bottom = kickable.collisionHeight === undefined
          ? this.tempBounds.min.y : kickable.object.position.y;
        const top = kickable.collisionHeight === undefined
          ? this.tempBounds.max.y : bottom + kickable.collisionHeight;
        // Swept, axis-separated movement lets kicked crystals slide along
        // risers instead of entering their sides and falling through the bed.
        // Limit each sample to less than a radius, including fast spell hits.
        const distance = Math.hypot(
          nextX - kickable.object.position.x,
          nextZ - kickable.object.position.z,
        );
        const sampleLength = Math.max(0.06, kickable.radius * 0.5);
        const steps = Math.max(1, Math.min(64, Math.ceil(distance / sampleLength)));
        const travelScale = Math.min(1, steps * sampleLength / Math.max(0.001, distance));
        const stepX = (nextX - kickable.object.position.x) * travelScale / steps;
        const stepZ = (nextZ - kickable.object.position.z) * travelScale / steps;
        nextX = kickable.object.position.x;
        nextZ = kickable.object.position.z;
        let hitX = false;
        let hitZ = false;
        for (let step = 0; step < steps; step += 1) {
          if (!hitX) {
            hitX = this.kickableHitsStatic(kickable, nextX + stepX, nextZ, bottom, top);
            if (!hitX) nextX += stepX;
          }
          if (!hitZ) {
            hitZ = this.kickableHitsStatic(kickable, nextX, nextZ + stepZ, bottom, top);
            if (!hitZ) nextZ += stepZ;
          }
        }
        if (hitX) kickable.velocity.x *= -0.32;
        if (hitZ) kickable.velocity.z *= -0.32;
      }

      if (
        this.tryCaptureTravelingAsteroidAsPongPacket(
          kickable,
          kickable.object.position.x,
          kickable.object.position.z,
          nextX,
          nextZ,
        )
      ) {
        continue;
      }

      kickable.object.position.x = nextX;
      kickable.object.position.z = nextZ;
      if (this.fallsCrystalFrog.owns(kickable)) {
        // The shared prop floor is normally infinite. The frog can be flung
        // beyond the island and visibly dissolve while falling into the void.
        kickable.restingY = this.getFallsFrogFloorHeight(nextX, nextZ) ?? Number.NEGATIVE_INFINITY;
      }
      if (
        kickable.onPlatform &&
        kickable.platform &&
        kickable.object.userData.sphericalLooseBody === true &&
        kickable.velocity.y > 0.05
      ) {
        kickable.onPlatform = false;
        kickable.platform = null;
      }
      if (kickable.onPlatform && kickable.platform) {
        const remainsOnPlatform = this.fallsCrystalFrog.owns(kickable)
          ? this.supportsFrogBody(kickable.platform, nextX, nextZ)
          : this.containsPropSurface(kickable.platform, nextX, nextZ,
            kickable.collisionHeight !== undefined ? kickable.radius : 0);
        if (remainsOnPlatform) {
          kickable.object.position.y =
            kickable.platform.heightAt(nextX, nextZ) + kickable.platformOffset;
        } else {
          kickable.onPlatform = false;
          kickable.platform = null;
          kickable.velocity.y = Math.min(kickable.velocity.y, -0.25);
        }
      } else if (kickable.gravity) {
        const desiredY = kickable.object.position.y + kickable.velocity.y * delta;
        if (kickable.collisionHeight !== undefined && kickable.velocity.y > 0) {
          const nextY = resolvePropRise(
            nextX, nextZ, kickable.radius, kickable.object.position.y,
            kickable.collisionHeight, desiredY,
            this.staticColliderIndex.queryPoint(nextX, nextZ, kickable.radius, this.staticColliderCandidates),
          );
          if (nextY < desiredY) kickable.velocity.y = 0;
          kickable.object.position.y = nextY;
        } else {
          kickable.object.position.y = desiredY;
        }
      } else {
        kickable.object.position.y = kickable.restingY;
      }

      const damping = Math.pow(kickable.friction, delta * 60);
      kickable.velocity.x *= damping;
      kickable.velocity.z *= damping;
      if (kickable.object.userData.upright !== true) {
        kickable.object.rotation.x += kickable.velocity.z * delta * 0.8;
        kickable.object.rotation.z -= kickable.velocity.x * delta * 0.8;
      }

      if (kickable.gravity && !kickable.onPlatform) {
        const sphericalLooseBody =
          kickable.object.userData.sphericalLooseBody === true;
        if (sphericalLooseBody && !sphericalSupportSampled) {
          sphericalSupport = this.findSphericalSupport(
            kickable,
            kickable.object.position.x,
            kickable.object.position.z,
          );
          kickable.object.userData.sphericalFloorY =
            sphericalSupport?.heightAt(
              kickable.object.position.x,
              kickable.object.position.z,
            ) ?? 0.155;
        }
        const objectBottom =
          sphericalLooseBody
            ? kickable.object.position.y - kickable.radius
            : kickable.collisionHeight !== undefined
            ? kickable.object.position.y
            : (() => {
                kickable.object.updateWorldMatrix(true, true);
                this.tempBounds.setFromObject(kickable.object);
                return this.tempBounds.min.y;
              })();
        const landingSurface = !sphericalLooseBody && kickable.velocity.y <= 0
          ? selectPropLandingSurface(
              this.surfaceAreaIndex.queryPoint(
                nextX, nextZ,
                kickable.collisionHeight !== undefined ? kickable.radius : 0,
                this.surfaceAreaCandidates,
              ),
              nextX,
              nextZ,
              objectBottom + previousY - kickable.object.position.y,
              objectBottom,
              this.fallsCrystalFrog.owns(kickable)
                ? this.supportsFrogBody : this.containsPropSurface,
              kickable.collisionHeight !== undefined ? kickable.radius : 0,
            )
          : null;
        const floorY = sphericalLooseBody
          ? Number(kickable.object.userData.sphericalFloorY ?? 0)
          : landingSurface?.heightAt(nextX, nextZ) ?? kickable.restingY;
        const penetration = floorY - objectBottom;
        if (penetration >= 0) {
          kickable.object.position.y += penetration;
          kickable.velocity.y =
            Math.abs(kickable.velocity.y) > 1.2 ? -kickable.velocity.y * 0.24 : 0;
          if (
            sphericalSupport &&
            Math.abs(kickable.velocity.y) < 0.05
          ) {
            kickable.platform = sphericalSupport;
            kickable.platformOffset = kickable.radius;
            kickable.onPlatform = true;
          } else if (landingSurface && Math.abs(kickable.velocity.y) < 0.05) {
            kickable.platform = landingSurface;
            kickable.platformOffset = kickable.object.position.y - floorY;
            kickable.onPlatform = true;
          }
        }
      }
      if (
        this.compassProp?.kickable === kickable &&
        kickable.gravity &&
        !kickable.onPlatform &&
        Math.abs(kickable.velocity.y) < 0.05
      ) {
        const settle = 1 - Math.exp(-delta * 9);
        kickable.object.rotation.x = THREE.MathUtils.lerp(
          kickable.object.rotation.x,
          0,
          settle,
        );
        kickable.object.rotation.z = THREE.MathUtils.lerp(
          kickable.object.rotation.z,
          0,
          settle,
        );
      }
      const pencilSpeed = Math.hypot(
        kickable.velocity.x,
        kickable.velocity.z,
      );
      if (pencilSpeed > 0.45) {
        this.traceAmbientGridWithPencil(
          kickable,
          delta * THREE.MathUtils.clamp(pencilSpeed * 0.24, 0.18, 1.35),
        );
      }
      this.syncLooseToolInteraction(kickable);
    }
  }

  private resolvePinballAsteroidGoal(
    kickable: Kickable,
    nextX: number,
    nextZ: number,
  ): "none" | "monitor" | "teleported" {
    if (kickable !== this.archiveAsteroid) return "none";

    const traveling = this.travelingAsteroid;
    const portal =
      !traveling || this.elapsed >= traveling.portalCooldownUntil
        ? this.portalNetwork.findContaining(nextX, nextZ)
        : null;
    if (portal) {
      const firstMisroute =
        this.currentZone === "archive" &&
        this.travelingAsteroid === null;
      this.routeTravelingAsteroid(kickable, portal.destination);
      this.portalNetwork.pulse(portal);
      if (firstMisroute) {
        this.completeArchivePinballChallenge();
        const rewards = this.reconcileChallengeRewards();
        const rewardMessage =
          rewards.thunderReady
            ? "The second circuit closes around Surge. The Daemon Controller’s amber summons burns across the Grid."
            : rewards.packetUnlocked
              ? "A violet hitch enters the packet spell."
              : this.highestSpellStage === "spark"
                ? this.pongChallengeComplete
                  ? "The second circuit answers the Controller, but Spark is too thin to carry what waits."
                  : "Somewhere, an unreadable signal is recorded."
                : this.pongChallengeComplete
                  ? "The Archive signal completes a second circuit. The Controller will have words."
                  : "A small routing indicator turns green.";
        this.hooks.onStatus(
          `The violet portal accepts the wrong address. The asteroid rematerializes beside Field Station’s matching threshold. ${rewardMessage}`,
          { kind: "achievement", title: "WRONG ADDRESS" },
        );
      } else {
        this.hooks.onStatus(
          `The misrouted asteroid folds into the threshold. It will rematerialize beside the matching portal in ${zoneLabels[portal.destination]}.`,
        );
      }
      return "teleported";
    }

    if (this.currentZone !== "archive") return "none";
    const target = this.archiveMonitorTarget;
    if (!target || target.broken || kickable.velocity.lengthSq() < 3.2) return "none";
    const targetDx = nextX - target.position.x;
    const targetDz = nextZ - target.position.z;
    const strikeRadius = kickable.radius + 0.92;
    if (targetDx * targetDx + targetDz * targetDz >= strikeRadius * strikeRadius) {
      return "none";
    }

    target.broken = true;
    target.crack.visible = true;
    kickable.velocity.z = Math.abs(kickable.velocity.z) * 0.84 + 0.6;
    kickable.velocity.x *= -0.72;
    kickable.kickCooldown = 0.5;
    this.updateInteractionLabel("monitor-choir", "Inspect the unscheduled hardware test");
    this.completeArchivePinballChallenge();
    const rewards = this.reconcileChallengeRewards();
    this.hooks.onStatus(
      rewards.thunderReady
        ? "Hardware test complete. The second circuit closes around Surge. The Daemon Controller’s amber summons burns across the Grid."
        : rewards.packetUnlocked
        ? "Hardware test passed messily. A violet hitch enters the packet spell."
        : this.highestSpellStage === "spark"
          ? this.pongChallengeComplete
            ? "Hardware test recorded. The second circuit answers the Controller, but Spark is too thin to carry what waits."
            : "Hardware test recorded. The resulting signal remains unreadable."
          : this.pongChallengeComplete
            ? "The impact completes a second circuit. The Controller will have words."
            : "The striped CRT accepts its unscheduled write. A small indicator turns green.",
      { kind: "achievement", title: "WARRANTY VOID" },
    );
    return "monitor";
  }

  private kickableHitsStatic(
    kickable: Kickable, x: number, z: number,
    objectBottom = kickable.object.position.y - kickable.radius,
    objectTop = kickable.object.position.y + kickable.radius,
  ): boolean {
    const candidates = this.staticColliderIndex.queryPoint(
      x,
      z,
      kickable.radius,
      this.staticColliderCandidates,
    );
    for (const collider of candidates) {
      if (loosePropIntersectsSolid(
        x, z, kickable.radius, objectBottom, objectTop, collider,
      )) return true;
    }
    return false;
  }

  private updateMetrics(time: number): void {
    const timing = this.frameTimingWindow.recordFrame(time);
    if (!timing) return;

    this.hooks.onMetrics({
      ...timing,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    });
  }

  private buildZone(zone: ZoneId, arrivalFrom: ZoneId | null = null): void {
    this.performanceMonitor?.event("zone-change", undefined, zone);
    this.clearZone();
    this.currentZone = zone;
    this.syncZoneLighting(zone);

    const config = {
      field: {
        sky: 0x03090c,
        fog: 0.015,
        spawn: new THREE.Vector3(...fieldEntrySpawn),
      },
      falls: { sky: 0x07111a, fog: 0.019, spawn: new THREE.Vector3(0, 1.05, 9.3) },
      grid: { sky: 0x071216, fog: 0.0125, spawn: new THREE.Vector3(0, 1.05, 8.5) },
      archive: { sky: 0x030510, fog: 0.012, spawn: new THREE.Vector3(0, 1.05, 8.2) },
      math: { sky: 0x09051a, fog: 0.009, spawn: new THREE.Vector3(0, 1.05, 11.8) },
    } satisfies Record<ZoneId, { sky: number; fog: number; spawn: THREE.Vector3 }>;

    const selected = config[zone];
    const arrivalAnchor =
      arrivalFrom === null
        ? undefined
        : portalArrivalAnchors[zone][arrivalFrom];
    const arrivalHeading =
      arrivalAnchor === undefined
        ? zone === "field"
          ? fieldEntryHeading
          : null
        : Math.atan2(-arrivalAnchor.x, -arrivalAnchor.z);
    const arrivalRadius =
      arrivalAnchor === undefined
        ? 1
        : Math.max(0.001, Math.hypot(arrivalAnchor.x, arrivalAnchor.z));
    this.resetJump();
    this.surfaceOffset = 0;
    this.playerInWater = false;
    this.shadowSurfaceY = 0.16;
    this.shadowVerticalDistance = 0;
    this.spawn.copy(selected.spawn);
    if (arrivalAnchor) {
      const inwardDistance = 2.35;
      this.spawn.set(
        arrivalAnchor.x - (arrivalAnchor.x / arrivalRadius) * inwardDistance,
        selected.spawn.y,
        arrivalAnchor.z - (arrivalAnchor.z / arrivalRadius) * inwardDistance,
      );
    }
    this.portalNetwork.guardArrivalsUntil(
      arrivalAnchor === undefined ? 0 : this.elapsed + 0.85,
    );
    this.scene.background = new THREE.Color(selected.sky);
    this.scene.fog = new THREE.FogExp2(selected.sky, selected.fog);
    this.ambientGrid?.setZone(zone);
    this.zoneGroup = new THREE.Group();
    this.zoneGroup.name = `zone-${zone}`;
    this.scene.add(this.zoneGroup);

    if (zone === "field") this.buildFieldStation();
    if (zone === "falls") this.buildLuminousFalls();
    if (zone === "grid") this.buildSignalGrid(arrivalFrom);
    if (zone === "archive") this.buildSpaceArchive();
    if (zone === "math") this.buildMightymatica(arrivalFrom);
    this.zoneGroup.add(createWorldEdge({
      zone, bounds: this.bounds,
      outer: zone === "grid" ? { kind: "square", halfWidth: 15, halfDepth: 13 }
        : zone === "math" ? { kind: "square", halfWidth: 17, halfDepth: 17 }
          : { kind: "circle", radius: zone === "field" ? 20 : zone === "falls" ? 18 : 17 },
      height: zone === "grid" ? 0.125 : zone === "math" ? -0.085 : 0.015,
      omit: zone === "falls" ? (x, z) => isInsideFallsRiver(x, z) : undefined,
    }));
    if (zone === "field" && this.ambientGrid) {
      for (const surface of this.ambientGrid.getLandingSurfaces()) {
        this.addSurfaceArea(surface, true);
      }
    }
    this.mountTravelingAsteroidForCurrentZone();
    this.syncPlayerRenderLights();
    this.batchStaticVisuals();
    this.refreshCollisionDebugVisuals();
    this.renderer.shadowMap.needsUpdate = this.quality !== "low";

    this.playerPosition.copy(this.spawn);
    this.player.group.position.set(this.spawn.x, 0, this.spawn.z);
    this.player.group.rotation.x = 0;
    this.player.group.rotation.z = 0;
    if (arrivalHeading !== null) {
      this.smoothedRotation = arrivalHeading;
      this.player.group.rotation.y = arrivalHeading;
      this.updateCompassHeading();
    }
    this.playerShadow.position.set(this.spawn.x, this.shadowSurfaceY, this.spawn.z);
    this.activeInteraction = null;
    this.hooks.onInteractionChange(null);
    this.cameraFocus.set(this.spawn.x, 0.72, this.spawn.z);
    this.updateCamera(1, true);
    this.ambientGrid?.update(
      0.016,
      this.elapsed,
      this.cameraFocus,
      this.reduceMotion,
    );
    this.hooks.onZoneChange(zone, zoneLabels[zone]);
    const hanoiRestoreNote =
      zone === "grid" ? this.hanoiPuzzle.getRestoreNote() : "";
    const cubeRematerializationNote =
      (zone === "math" && arrivalFrom === "grid") ||
      (zone === "grid" && arrivalFrom === "math")
        ? " The matching cube face completes a rematerialization pass behind you."
        : "";
    this.hooks.onStatus(
      `Arrived at ${zoneLabels[zone]}. ${this.getArrivalObservation()}${cubeRematerializationNote}${hanoiRestoreNote}`,
    );
    const atlasDestination = this.atlasAutopilot?.destination;
    if (atlasDestination) {
      if (zone === atlasDestination) {
        this.atlasAutopilot = null;
      } else {
        this.prepareAtlasAutopilot(atlasDestination);
      }
    }
  }

  private clearZone(): void {
    this.pendingPointerHover = null;
    this.hoverPointerActiveUntil = 0;
    this.kickablePickHits.length = 0;
    this.navigation.cancel();
    this.fallsNavigationGraph = null;
    this.cancelClickNavigationPress();
    this.clickNavigationMarker?.hide();
    this.navigationDebug?.clear();
    this.clickNavigationVisualHits.length = 0;
    this.clickNavigationVisualBlockers.length = 0;
    this.clickNavigationSnapObstacles.length = 0;
    this.archiveSignalPuzzle.unmount();
    this.archiveOrbitPlayground.unmount();
    this.fallsRuneRitual.unmount();
    this.fallsFireflyField.unmount();
    this.fallsWaterfallMist.unmount();
    const frogBody = this.fallsCrystalFrog.getBody();
    if (frogBody) this.cancelTelekinesisHold(frogBody);
    this.fallsCrystalFrog.unmount();
    this.fallsCrystalFrogRoot = null;
    this.pongChallenge.unmount();
    this.stashTravelingAsteroidForZoneTeardown();
    this.clearCollisionDebugVisuals();
    this.stowPortablePencilForTravel();
    this.resetSprintDustTrail();
    this.hanoiPuzzle.unmount();
    this.gridFloorTraffic.unmount();
    this.gridServerPatchPuzzle.unmount();
    this.cancelAllPointerDrags(false);
    this.voidTurtleRide.unmount();
    this.mightymaticaZone?.dispose();
    this.mightymaticaZone = null;
    this.legacySimulationCube = null;
    this.clearStaticColliders();
    this.interactions.length = 0;
    this.pointerActions.length = 0;
    this.mathInstanceDrags.length = 0;
    this.pointerActionReachTarget = null;
    this.pointerActionReachUntil = 0;
    this.animatedItems.length = 0;
    this.clearSurfaceAreas();
    this.fieldRockClusters.length = 0;
    this.lastFieldRockDebugRefresh = 0;
    this.tentState = null;
    this.compassProp = null;
    this.pencilProps.length = 0;
    this.kickables.length = 0;
    this.portalNetwork.clear();
    this.telescopeRigs.length = 0;
    this.playerOccluders.clear();
    this.setPlayerOcclusionOutlineVisible(false);
    this.playerShadow.visible = true;
    this.lanterns.length = 0;
    this.fieldLanternLightLeases.length = 0;
    this.lanternReveals.length = 0;
    this.serverRacks.length = 0;
    this.wanderingNpcs.length = 0;
    this.fishSchool = null;
    this.fishBaitShard = null;
    this.fishBaitFishIndex = -1;
    this.runeAltar = null;
    this.heldKickable = null;
    this.telekinesisPlacementSurface = null;
    this.telekinesisPointerId = null;
    this.telekinesisMoved = false;
    this.telekinesisPencilWasWorn = false;
    this.canvas.style.cursor = "";
    this.serverFlickerAge = 3;
    this.serverFlickerDuration = 0;
    this.pongRoguePacketLease = null;
    this.splashRing = null;
    this.splashBurst = null;
    this.splashAge = 2;
    this.splashDuration = 0.8;
    this.splashMagnitude = 1;
    this.playerInWater = false;
    this.hasSplashed = false;
    this.airbornePeakHeight = 0;
    this.fallsDiveFromCrown = false;
    this.collisionSafeLanding.valid = false;
    this.waterfallRecoveryAge = -1;
    this.surfaceOffset = 0;
    this.activePlatform = null;
    this.shadowSurfaceY = 0.16;
    this.shadowVerticalDistance = 0;
    this.archiveDataGlass = null;
    this.archiveAsteroid = null;
    this.archiveAsteroidShadow = null;
    this.archiveMonitorTarget = null;
    this.spellRing.visible = false;
    this.digitStormAge = this.digitStormDuration;
    for (const cloud of this.digitClouds) cloud.points.visible = false;
    this.thunderBolts.visible = false;
    this.thunderLight.intensity = 0;
    this.hooks.onPongChange(false, 0, 0);
    if (this.zoneGroup.parent) this.scene.remove(this.zoneGroup);
    disposeObjectTree(
      this.zoneGroup,
      (material) => !this.sharedMaterials.has(material),
    );
  }

  private buildFieldStation(): void {
    this.bounds = { kind: "circle", radius: 18.2 };
    const root = this.zoneGroup;
    const maximumAnisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const fieldGroundTexture = createFieldGroundTexture();
    fieldGroundTexture.anisotropy = maximumAnisotropy;
    const fieldGroundReliefTexture = createFieldGroundReliefTexture();
    fieldGroundReliefTexture.anisotropy = maximumAnisotropy;
    const fieldGroundMaterial = this.materials.stone.clone();
    fieldGroundMaterial.name = "field-survey-worn-ground-material";
    fieldGroundMaterial.color.setHex(0xffffff);
    fieldGroundMaterial.map = fieldGroundTexture;
    fieldGroundMaterial.bumpMap = fieldGroundReliefTexture;
    fieldGroundMaterial.bumpScale = 0.055;
    fieldGroundMaterial.roughness = 0.97;
    fieldGroundMaterial.metalness = 0;
    const fieldFoundationTexture = createFieldFoundationTexture();
    fieldFoundationTexture.anisotropy = maximumAnisotropy;
    const fieldFoundationMaterial = this.materials.darkStone.clone();
    fieldFoundationMaterial.name = "field-foundation-material";
    fieldFoundationMaterial.color.setHex(0xffffff);
    fieldFoundationMaterial.map = fieldFoundationTexture;
    fieldFoundationMaterial.emissive.setHex(0x07100d);
    fieldFoundationMaterial.emissiveIntensity = 0.18;
    fieldFoundationMaterial.roughness = 0.98;
    const fieldShelfTexture = createFieldShelfTexture();
    fieldShelfTexture.anisotropy = maximumAnisotropy;
    const fieldShelfMaterial = this.materials.darkStone.clone();
    fieldShelfMaterial.name = "field-outer-shelf-material";
    fieldShelfMaterial.color.setHex(0xffffff);
    fieldShelfMaterial.map = fieldShelfTexture;
    fieldShelfMaterial.roughness = 0.98;
    fieldShelfMaterial.metalness = 0;

    // Cylinder caps and walls have different UV layouts. Keep directional
    // strata on the vertical wall and use a seamless isotropic stone tile on
    // the broad upper shelf instead of stretching one texture across both.
    const foundation = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, 1.8, 18),
      [
        fieldFoundationMaterial,
        fieldShelfMaterial,
        fieldFoundationMaterial,
      ],
    );
    foundation.position.set(0, -0.9, 0);
    foundation.receiveShadow = true;
    root.add(foundation);
    const fieldFloor = addCylinder(
      root,
      11.5,
      11.5,
      0.28,
      24,
      [0, -0.01, 0],
      fieldGroundMaterial,
    );
    foundation.name = "world-terrain-foundation";
    fieldFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    fieldFloor.castShadow = false;

    const desirePathTexture = createFieldDesirePathTexture();
    desirePathTexture.anisotropy = maximumAnisotropy;
    const desirePathMaterial = new THREE.MeshStandardMaterial({
      name: "field-well-worn-desire-path-material",
      color: 0xffffff,
      map: desirePathTexture,
      transparent: true,
      opacity: 0.88,
      alphaTest: 0.018,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
    });
    const desirePaths = new THREE.Mesh(
      createFieldDesirePathGeometry(),
      desirePathMaterial,
    );
    desirePaths.name = "field-desire-path-network";
    desirePaths.castShadow = false;
    desirePaths.receiveShadow = true;
    desirePaths.renderOrder = 1;
    root.add(desirePaths);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.1, 7.34, 40),
      this.materials.parchment,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    ring.receiveShadow = true;
    root.add(ring);

    this.createFieldHeartSigil(root);

    const tent = this.createTent(root, -6.4, 1.5);
    this.addInteraction(
      "survey-tent",
      "Inspect the survey tent",
      tent.x,
      tent.z,
      2.8,
      () => {
        this.hooks.onStatus(
          this.tentState?.inside
            ? "Inside: bedroll, field notes, one lamp, and considerably less weather."
            : "The amber flaps are tied back. The canvas is weathered above and dry beneath.",
        );
      },
    );
    const bedrollInteraction = this.addInteraction(
      "survey-bedroll",
      "Sleep on the bedroll",
      tent.sleepFocus.x,
      tent.sleepFocus.z,
      1.5,
      () => this.setTentResting(!(this.tentState?.resting ?? false)),
      false,
      0.9,
    );
    bedrollInteraction.isAvailable = () =>
      this.tentState?.inside === true || this.tentState?.resting === true;
    this.createMapTable(
      root,
      fieldMapTablePosition.x,
      fieldMapTablePosition.z,
    );
    this.addStaticBox(
      fieldMapTablePosition.x,
      0.72,
      fieldMapTablePosition.z,
      1.16,
      0.72,
      0.73,
      1.24,
      1.34,
    );
    this.addInteraction(
      "map-table",
      "Open atlas",
      fieldMapTablePosition.x,
      fieldMapTablePosition.z,
      2.25,
      this.hooks.onRequestMap,
    );

    this.createTerminal(root, 3.4, -2.5, this.materials.amber);
    this.addInteraction(
      "field-terminal",
      "Open field terminal",
      3.4,
      -2.5,
      2.1,
      this.hooks.onRequestTerminal,
    );
    this.createLanternReveal(
      root,
      "THE EDGE HAS EYES",
      1.2,
      0.165,
      2.65,
      4.3,
      -0.08,
      "lantern-field-clue",
      "Read the lamplit field note",
      "The warm lettering leans northeast. Its last stroke resembles an open eye.",
    );

    const fieldTelescope = this.createTelescope(root, 5.3, 2.2);
    this.addStaticBox(5.3, 0.7, 2.2, 0.7, 0.8, 0.7);
    this.addInteraction("telescope", "Inspect the brass telescope", 5.3, 2.2, 2.6, () => {
      this.raiseTelescope(fieldTelescope);
      this.hooks.onStatus("Bearing: useful, legible, durable. The sky remains suspicious.");
    });

    this.portalNetwork.createThreshold(
      root,
      -9.2,
      -6.8,
      palette.green,
      "Enter Luminous Falls",
      "falls",
    );
    this.portalNetwork.createThreshold(
      root,
      10.6,
      -4.3,
      palette.cyan,
      "Enter Signal Grid",
      "grid",
    );
    this.portalNetwork.createThreshold(
      root,
      0,
      10.3,
      palette.violet,
      "Enter Space Archive",
      "archive",
    );

    for (const [x, z] of [
      [-10, 4],
      [-13, 1],
      [11, 5],
      [13, 1],
      [-6, -11],
      [6, -11],
    ] as const) {
      this.createRockCluster(root, x, z, this.materials.darkStone);
    }

    this.createFieldLanternLightPool(root);
    for (const [x, z] of [
      [-8.5, 5.2],
      [-5, 6.5],
      [7.5, 5.5],
      [5.7, -6],
      [-5.5, -6],
    ] as const) {
      this.createLantern(root, x, z, this.materials.amber);
    }

    this.createStormStone(root, 10.4, 9.5);
    this.voidTurtleRide.mount(root, 15, 15);
  }

  private buildLuminousFalls(): void {
    this.bounds = { kind: "circle", radius: 16.4 };
    const root = this.zoneGroup;
    const maximumAnisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const groundTexture = createFallsGroundTexture();
    const groundReliefTexture = createFallsGroundReliefTexture();
    const cliffTexture = createFallsCliffTexture();
    const flowTexture = createFallsWaterTexture();
    for (const texture of [
      groundTexture,
      groundReliefTexture,
      cliffTexture,
      flowTexture,
    ]) {
      texture.anisotropy = maximumAnisotropy;
    }
    const groundMaterial = this.materials.moss.clone();
    groundMaterial.name = "falls-mossy-ground-material";
    groundMaterial.color.setHex(0xffffff);
    groundMaterial.map = groundTexture;
    groundMaterial.bumpMap = groundReliefTexture;
    groundMaterial.bumpScale = 0.045;
    groundMaterial.roughness = 0.97;
    groundMaterial.metalness = 0;
    groundMaterial.emissive.setHex(0x0c171a);
    groundMaterial.emissiveIntensity = 0.18;
    const groundDarkMaterial = groundMaterial.clone();
    groundDarkMaterial.name = "falls-mossy-outer-shelf-material";
    groundDarkMaterial.color.setHex(0x9aab96);
    groundDarkMaterial.bumpScale = 0.032;
    const cliffMaterial = this.materials.stone.clone();
    cliffMaterial.name = "falls-fractured-slate-material";
    cliffMaterial.color.setHex(0xffffff);
    cliffMaterial.map = cliffTexture;
    cliffMaterial.bumpMap = cliffTexture;
    cliffMaterial.bumpScale = 0.018;
    cliffMaterial.roughness = 0.98;
    cliffMaterial.metalness = 0;
    cliffMaterial.flatShading = true;
    cliffMaterial.vertexColors = true;
    cliffMaterial.emissive.setHex(0x101525);
    cliffMaterial.emissiveIntensity = 0.22;
    const cliffDarkMaterial = cliffMaterial.clone();
    cliffDarkMaterial.name = "falls-deep-cliff-material";
    cliffDarkMaterial.color.setHex(0xa1aba7);
    const rockMaterial = new THREE.MeshStandardMaterial({
      name: "falls-grey-faceted-rock-material",
      color: 0x7f898a,
      emissive: 0x10151d,
      emissiveIntensity: 0.16,
      roughness: 0.96,
      metalness: 0.01,
      flatShading: true,
    });
    const wetRockMaterial = new THREE.MeshStandardMaterial({
      name: "falls-wet-faceted-rock-material",
      color: 0x465b61,
      emissive: 0x0b2028,
      emissiveIntensity: 0.2,
      roughness: 0.68,
      metalness: 0.04,
      flatShading: true,
    });
    const waterMaterial = new THREE.MeshBasicMaterial({
      name: "falls-flowing-water-material",
      color: 0xffffff,
      map: flowTexture,
      transparent: true,
      opacity: 0.78,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const foamMaterial = new THREE.ShaderMaterial({
      name: "falls-waterfall-foam-material",
      uniforms: {
        flowMap: { value: flowTexture },
        flowMapTransform: { value: flowTexture.matrix },
        foamColor: { value: new THREE.Color(0xdffcff) },
        opacity: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 foamUv;

        void main() {
          foamUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D flowMap;
        uniform mat3 flowMapTransform;
        uniform vec3 foamColor;
        uniform float opacity;
        varying vec2 foamUv;

        void main() {
          vec2 flowUv = (flowMapTransform * vec3(foamUv, 1.0)).xy;
          vec4 flow = texture2D(flowMap, flowUv);
          float edgeX = smoothstep(0.0, 0.18, min(foamUv.x, 1.0 - foamUv.x));
          float edgeY = smoothstep(0.0, 0.28, min(foamUv.y, 1.0 - foamUv.y));
          float brokenEdge = edgeX * edgeY;
          float turbulence = 0.48 + flow.r * 0.72;
          float alpha = brokenEdge * turbulence * opacity;
          if (alpha < 0.008) discard;
          gl_FragColor = vec4(foamColor * (0.72 + flow.g * 0.5), alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const visuals: FallsVisualMaterials = {
      ground: groundMaterial,
      groundDark: groundDarkMaterial,
      cliff: cliffMaterial,
      cliffDark: cliffDarkMaterial,
      rock: rockMaterial,
      wetRock: wetRockMaterial,
      water: waterMaterial,
      foam: foamMaterial,
      flowTexture,
    };

    const foundation = new THREE.Mesh(
      shadeFallsStoneGeometry(new THREE.CylinderGeometry(fallsFoundationRadius, fallsFoundationRadius, 1.7, 18), 3),
      [
        visuals.cliffDark,
        visuals.groundDark,
        visuals.cliffDark,
      ],
    );
    foundation.position.set(0, -0.85, 0);
    foundation.receiveShadow = true;
    root.add(foundation);
    const fallsFloor = addCylinder(
      root,
      14.6,
      14.6,
      0.35,
      20,
      [0, -0.05, 0],
      visuals.ground,
    );
    foundation.name = "world-terrain-foundation";
    fallsFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    fallsFloor.castShadow = false;

    this.createFallsRiver(root, visuals);
    this.createFishSchool(root);

    buildFallsTerrain(root, {
      quality: this.quality,
      materials: { ...this.materials, ...visuals },
      registerSolid: (mesh, id, stepHeight) =>
        this.registerClimbableBox(
          mesh, id, undefined, undefined, true, true, stepHeight,
        ),
    });
    const cave = fallsLandmarks.cave;
    this.createWaterfall(
      root, cave.x, cave.z, cave.height, true, visuals, fallsLandmarks.basin.water,
    );
    addFallsCoveWater(root, visuals.water, visuals.foam, this.quality);
    this.fallsWaterfallMist.setQuality(this.quality);
    this.fallsWaterfallMist.mount(root, [
      {
        x: cave.x, y: fallsLandmarks.basin.water, z: cave.z + 1.0,
        radius: 1.3, height: 1.05,
      },
      {
        x: fallsLandmarks.basin.x, y: 0.235,
        z: fallsLandmarks.basin.z + fallsLandmarks.basin.depth / 2 + 0.3,
        radius: fallsLandmarks.basin.spillWidth / 2, height: 0.85,
      },
      { x: -7.0, y: 0.235, z: -3.17, radius: 0.65, height: 0.62 },
      { x: -0.12, y: 0.235, z: -4.75, radius: 0.65, height: 0.65 },
      {
        kind: "lip", x: 4, y: 0.205,
        z: Math.sqrt(18.06 ** 2 - 4 ** 2),
        radius: 1.9, height: 2.2, edgeRadius: 18.06,
      },
    ]);
    const westernWaterfall = fallsLandmarks.westernWaterfall;
    const moonWaterY = fallsLandmarks.sockets.moon.y + 0.025;
    this.createWaterfall(
      root, westernWaterfall.x, westernWaterfall.z, westernWaterfall.height,
      false, visuals, fallsLandmarks.sockets.moon.y,
    );
    // The western spring crosses the Moon terrace in a shallow runnel, then
    // drops off its eastern face into the common basin. Extend its inlet with
    // the moved waterfall, retaining the existing terrace-edge spill position.
    const runnelStart = westernWaterfall.x + 1.2;
    const runnelEnd = -7.12;
    const moonRunnel = new THREE.Mesh(
      new THREE.PlaneGeometry(runnelEnd - runnelStart, 0.8),
      visuals.water,
    );
    moonRunnel.rotation.x = -Math.PI / 2;
    moonRunnel.position.set((runnelStart + runnelEnd) / 2, moonWaterY, -3.17);
    moonRunnel.name = "falls-moon-terrace-runnel";
    root.add(moonRunnel);
    const moonPool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.45, 1),
      visuals.water,
    );
    moonPool.rotation.x = -Math.PI / 2;
    moonPool.position.set(westernWaterfall.x, moonWaterY, -3.15);
    moonPool.name = "falls-moon-terrace-spring-pool";
    root.add(moonPool);
    const moonSpill = new THREE.Mesh(
      createWaterfallSheetGeometry(0.8, 4.2, this.quality, 6),
      visuals.water,
    );
    moonSpill.rotation.y = Math.PI / 2;
    moonSpill.position.set(-7.14, 2.1, -3.17);
    moonSpill.name = "falls-moon-terrace-cascade";
    root.add(moonSpill);
    // The eastern overlook feeds a third, narrower fall directly over its
    // western edge. Its existing terrace provides the rock and collision.
    const tributary = new THREE.Mesh(
      createWaterfallSheetGeometry(1.5, 3.8, this.quality, 4),
      visuals.water,
    );
    tributary.name = "falls-ember-overlook-cascade";
    tributary.position.set(0.14, 1.9, -4.75);
    tributary.rotation.y = -Math.PI / 2;
    tributary.castShadow = false;
    root.add(tributary);
    const tributarySource = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.5),
      visuals.water,
    );
    tributarySource.name = "falls-ember-overlook-spring";
    tributarySource.rotation.x = -Math.PI / 2;
    tributarySource.position.set(0.61, 3.82, -4.75);
    root.add(tributarySource);
    this.createFallsVegetation(root);
    this.fallsFireflyField.mount(root);

    const splashMaterial = new THREE.MeshBasicMaterial({
      color: palette.cyan,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.splashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.5, 24),
      splashMaterial,
    );
    this.splashRing.rotation.x = -Math.PI / 2;
    this.splashRing.visible = false;
    root.add(this.splashRing);

    const maximumSplashDrops = 18;
    const splashDrops = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({
        color: 0xbffaff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      maximumSplashDrops,
    );
    splashDrops.count = 0;
    splashDrops.visible = false;
    splashDrops.frustumCulled = false;
    splashDrops.renderOrder = 5;
    root.add(splashDrops);
    this.splashBurst = {
      drops: splashDrops,
      dummy: new THREE.Object3D(),
      velocities: new Float32Array(maximumSplashDrops * 3),
      count: 0,
      age: 2,
      duration: 1.35,
    };

    const monument = fallsLandmarks.monument;
    this.createRuneAltar(root, monument.x, monument.z);
    this.addStaticBox(monument.x, 0.7, monument.z, 1.25, 0.75, 1.25, 0.7, 0.82);
    this.addSurfaceArea({
      id: "rune-altar",
      x: monument.x,
      z: monument.z,
      halfWidth: 1.08,
      halfDepth: 1.08,
      requiresJump: true,
      landingMessage: "You land atop the rune monument. The river keeps moving below.",
      heightAt: () => 0.82,
    });
    this.addInteraction(
      "rune-altar",
      "Inspect river monument",
      monument.x,
      monument.z,
      2.3,
      () => this.runeAltar?.activate(this.reduceMotion),
    );
    this.createLanternReveal(
      root,
      "☾ | ≋ | △",
      fallsLandmarks.bridge.x,
      fallsLandmarks.bridge.y + 0.03,
      fallsLandmarks.bridge.z - 0.42,
      4.8,
      0,
      "lantern-rune-clue",
      "Inspect the lamplit markings",
      "Three old marks repeat in the varnish: a crescent, three ripples, and a flame-shaped notch.",
    );
    this.createLanternReveal(
      root,
      "DRY STONE | WET COUNTRY",
      fallsLandmarks.bridge.x,
      fallsLandmarks.bridge.y + 0.03,
      fallsLandmarks.bridge.z + 0.42,
      4.4,
      0,
      "lantern-falls-chest",
      "Inspect the lamplit inscription",
      "The stone behind the central fall is less weathered than everything around it.",
    );

    const { archivist, keeper, tinkerer } = fallsLandmarks.npcs;
    this.createNpcMarker(root, archivist.x, archivist.z, this.materials.violet, "archivist", archivist.y);
    this.addLoreNpcInteraction(
      "archivist",
      "Speak with the Archivist",
      "Archivist",
      archivist.x,
      archivist.z,
      [
        "Long before the stone learned moss, the crown above the cataract was broken. Six lights fell. Only three remembered their names.",
        "The first bore a hollow moon. The second, the river's scar. The last kept a coal beneath its tongue. I copied this much; the water destroyed the rest.",
        "Do not mistake brightness for memory. The false shards shine gladly. The true ones are worn where old hands set them down.",
      ],
    );

    this.createNpcMarker(root, keeper.x, keeper.z, this.materials.green, "keeper", keeper.y);
    this.addLoreNpcInteraction(
      "keeper",
      "Speak with the Keeper",
      "Keeper",
      keeper.x,
      keeper.z,
      [
        "I was named Keeper after the keeping was done. A jest, perhaps. Still, the six remain where the river spat them out.",
        "Three are light as lies. Three drag toward the old circles when no eye rests upon them. Even stone remembers its grave.",
        "When the voices rise together, the fall will make a door. Beyond it waits a coffer that has never once been wet.",
      ],
    );

    this.createNpcMarker(root, tinkerer.x, tinkerer.z, this.materials.amber, "tinkerer", tinkerer.y);
    this.addLoreNpcInteraction(
      "tinkerer",
      "Speak with the Tinkerer",
      "Tinkerer",
      tinkerer.x,
      tinkerer.z,
      [
        "Beneath the soil runs an iron scripture. The black mouths call it terminal. It answers words more faithfully than men.",
        "I once fed it ritual. Violet fire walked the circles, yet touched no lock. A rehearsal, perhaps. Or a warning.",
        "Give ritual a second word: open. The pair forces what the stones would have you earn. I have no fondness for stolen answers.",
      ],
      ["ritual"],
    );

    this.fallsRuneRitual.mount(root);
    this.fallsCrystalFrog.setQuality(this.quality);
    this.fallsCrystalFrogRoot = this.fallsCrystalFrog.mount(root);
    const frogBody = this.fallsCrystalFrog.getBody();
    if (frogBody) this.kickables.push(frogBody);

    this.portalNetwork.createThreshold(
      root,
      0,
      11.2,
      palette.green,
      "Return to Field Station",
      "field",
    );
  }

  private buildSignalGrid(arrivalFrom: ZoneId | null): void {
    this.bounds = { kind: "square", halfWidth: 14.2, halfDepth: 12.2 };
    const root = this.zoneGroup;
    const gridFloorTexture = createGridCircuitTexture();
    gridFloorTexture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const gridFloorMaterial = this.materials.gridFloor.clone();
    gridFloorMaterial.name = "grid-etched-circuit-floor-material";
    gridFloorMaterial.color.setHex(0xffffff);
    gridFloorMaterial.map = gridFloorTexture;
    gridFloorMaterial.emissive.setHex(0x164a52);
    gridFloorMaterial.emissiveMap = gridFloorTexture;
    gridFloorMaterial.emissiveIntensity = 0.42;
    gridFloorMaterial.roughness = 0.78;
    gridFloorMaterial.metalness = 0.12;

    const foundation = addBox(
      root,
      [30, 1.2, 26],
      [0, -0.62, 0],
      this.materials.black,
    );
    const gridFloor = addBox(
      root,
      [27.5, 0.16, 23.5],
      [0, 0.04, 0],
      gridFloorMaterial,
    );
    foundation.name = "world-terrain-foundation";
    gridFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    gridFloor.castShadow = false;

    const grid = new THREE.GridHelper(27, 18, palette.cyan, 0x28515a);
    grid.position.y = 0.14;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.27;
    }
    root.add(grid);
    this.gridFloorTraffic.mount(root);

    const serverRackConfigs = [
      [-8.5, -6.5, 5.2, this.materials.cyan],
      [0, -8.5, 6.3, this.materials.cyan],
      [8.5, -6.2, 5.6, this.materials.coral],
    ] as const;
    for (const [index, [x, z, height, material]] of serverRackConfigs.entries()) {
      this.createSignalTower(root, x, z, height, material);
      this.addStaticBox(x, height / 2, z, 1.5, height / 2, 1.5);
      this.addInteraction(`server-rack-${index}`, "Inspect server rack", x, z, 2.45, () => {
        this.hooks.onStatus(
          "Redundant links blink in mirrored pairs. Every fan pauses for the same fraction of a second.",
        );
      });
    }
    this.gridServerPatchPuzzle.mount(root);

    this.hanoiPuzzle.mount(root, -8.3, 7);
    this.createLegacySimulationCapsule(
      root,
      -6,
      1,
      arrivalFrom === "math",
    );

    const pongCourtX = 5.2;
    const pongCourtZ = 1.2;
    const daemonControllerX = 10.2;
    const daemonControllerZ = 4.2;
    // Keep the Controller's caged prize directly beyond the coral paddle.
    // The shared court centreline also places it north of its keeper instead
    // of crowding the player's foreground approach.
    const thunderReliquaryX = daemonControllerX;
    const thunderReliquaryZ = pongCourtZ;
    this.pongChallenge.mount(
      root,
      pongCourtX,
      pongCourtZ,
      thunderReliquaryX,
      thunderReliquaryZ,
    );
    this.createLanternReveal(
      root,
      "STRAIGHT LINES ARE EASIEST TO GUESS",
      4.9,
      0.155,
      4.65,
      4.7,
      0,
      "lantern-grid-clue",
      "Inspect the faded daemon diagram",
      "A maintenance sketch projects one immaculate straight path. Every curved example has been scratched out.",
    );
    this.createLanternReveal(
      root,
      "III | III",
      -0.1,
      0.155,
      7.25,
      4.4,
      0,
      "lantern-grid-score",
      "Inspect the goal-rail tally",
      "Three tally cuts mark each goal rail. One side has been angrily scored over twice.",
    );

    this.createTerminal(root, 0, -2.8, this.materials.cyan);
    this.addInteraction("grid-terminal", "Open grid terminal", 0, -2.8, 2, this.hooks.onRequestTerminal);

    this.createNpcMarker(
      root,
      daemonControllerX,
      daemonControllerZ,
      this.materials.coral,
      "daemon-controller",
    );
    this.addDaemonControllerInteraction(
      daemonControllerX,
      daemonControllerZ,
    );
    this.portalNetwork.createThreshold(
      root,
      0,
      10.4,
      palette.cyan,
      "Return to Field Station",
      "field",
    );
  }

  private createLegacySimulationCapsule(
    parent: THREE.Group,
    x: number,
    z: number,
    rematerializeOnArrival: boolean,
  ): void {
    if (this.hooks.isZoneDiscovered("math")) this.mathCubeBooted = true;
    const pedestal = addCylinder(
      parent,
      1.5,
      1.72,
      0.28,
      8,
      [x, 0.14, z],
      this.materials.darkStone,
    );
    pedestal.castShadow = false;
    const collider = this.mathCubeBooted
      ? null
      : this.addStaticBox(x, 0.9, z, 0.96, 0.9, 0.96);

    const pedestalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.055, 5, 24),
      this.materials.cyan,
    );
    pedestalRing.position.set(x, 0.31, z);
    pedestalRing.rotation.x = Math.PI / 2;
    parent.add(pedestalRing);

    const capsule = new THREE.Group();
    capsule.position.set(x, 1.48, z);
    parent.add(capsule);

    const visualRoot = new THREE.Group();
    visualRoot.name = "legacy-simulation-cube-visuals";
    capsule.add(visualRoot);

    const shellGeometry = new THREE.BoxGeometry(1.62, 1.62, 1.62);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: palette.cyan,
      emissive: palette.teal,
      emissiveIntensity: 1.1,
      metalness: 0.5,
      roughness: 0.22,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.castShadow = false;
    visualRoot.add(shell);

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(shellGeometry),
      new THREE.LineBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0.92,
      }),
    );
    frame.scale.setScalar(1.035);
    visualRoot.add(frame);

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: palette.violet,
      emissive: palette.violet,
      emissiveIntensity: this.mathCubeBooted ? 2.4 : 0.85,
      roughness: 0.28,
      metalness: 0.35,
      transparent: true,
      opacity: this.mathCubeBooted ? 0.88 : 0.72,
    });
    const sealedCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.46, 0),
      coreMaterial,
    );
    sealedCore.rotation.set(0.4, 0.2, 0.18);
    visualRoot.add(sealedCore);

    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: palette.amber,
      transparent: true,
      opacity: this.mathCubeBooted ? 0.94 : 0.5,
    });
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.06, 0.035, 4, 28),
      orbitMaterial,
    );
    orbit.rotation.set(Math.PI / 2, 0.25, 0);
    visualRoot.add(orbit);

    const state: LegacySimulationCubeState = {
      capsule,
      visualRoot,
      shellMaterial,
      frameMaterial: frame.material,
      core: sealedCore,
      orbit,
      collider,
      rematerialization: null,
      portalRegistered: false,
      booting: false,
    };
    this.legacySimulationCube = state;
    this.animatedItems.push({
      object: capsule,
      originY: 1.48,
      phase: 1.7,
      amplitude: 0.1,
      rotationSpeed: 0.26,
    });
    if (this.mathCubeBooted) this.activateLegacySimulationCube(state, false);
    state.rematerialization = new CubeRematerialization({
      parent: capsule,
      target: visualRoot,
      channels: [
        { material: state.shellMaterial, opacity: state.shellMaterial.opacity },
        { material: state.frameMaterial, opacity: state.frameMaterial.opacity },
        { material: state.core.material, opacity: state.core.material.opacity },
        { material: state.orbit.material, opacity: state.orbit.material.opacity },
      ],
      extent: 1.86,
      colors: [palette.amber, palette.violet, palette.cyan],
    });
    if (rematerializeOnArrival && this.mathCubeBooted) {
      state.rematerialization.start(this.reduceMotion);
    }
    this.addInteraction(
      "legacy-simulation-capsule",
      this.mathCubeBooted
        ? "Enter reconstructed Mightymatica aperture"
        : "Reconstruct sealed simulation cube",
      x,
      z,
      2.6,
      () => this.useLegacySimulationCube(state),
    );
  }

  private async useLegacySimulationCube(
    state: LegacySimulationCubeState,
  ): Promise<void> {
    if (state !== this.legacySimulationCube || state.booting) return;
    if (this.mathCubeBooted) {
      await this.teleport("math", true);
      return;
    }

    state.booting = true;
    state.shellMaterial.opacity = 0.42;
    state.shellMaterial.emissiveIntensity = 1.8;
    state.frameMaterial.color.setHex(palette.amber);
    state.core.material.emissiveIntensity = 1.8;
    state.orbit.material.opacity = 0.76;
    this.updateInteractionLabel(
      "legacy-simulation-capsule",
      "Reconstructing Mightymatica signal…",
    );
    this.hooks.onStatus(
      "RECOVERY NODE: reading the preserved Mightymatica carrier and rebuilding a browser-native aperture…",
    );

    try {
      await Promise.all([
        this.ensureMightymaticaModule(),
        wait(this.reduceMotion ? 1 : 640),
      ]);
    } catch {
      if (state === this.legacySimulationCube) {
        state.booting = false;
        state.shellMaterial.opacity = 0.2;
        state.frameMaterial.color.setHex(palette.cyan);
        state.core.material.emissiveIntensity = 0.85;
        state.orbit.material.opacity = 0.5;
        this.updateInteractionLabel(
          "legacy-simulation-capsule",
          "Retry simulation-cube reconstruction",
        );
        this.hooks.onStatus(
          "The recovered carrier is intact. Its modern reconstruction module did not load, so the cube remains safely sealed.",
        );
      }
      return;
    }

    if (state !== this.legacySimulationCube || this.currentZone !== "grid") return;
    this.mathCubeBooted = true;
    state.booting = false;
    this.activateLegacySimulationCube(state, true);
  }

  private activateLegacySimulationCube(
    state: LegacySimulationCubeState,
    announce: boolean,
  ): void {
    state.shellMaterial.opacity = 0.64;
    state.shellMaterial.emissiveIntensity = 2.4;
    state.frameMaterial.color.setHex(palette.amber);
    state.frameMaterial.opacity = 1;
    state.core.material.emissiveIntensity = 2.7;
    state.core.material.opacity = 0.92;
    state.orbit.material.opacity = 0.96;
    state.capsule.scale.setScalar(1.08);
    if (state.collider) {
      this.removeStaticCollider(state.collider);
      state.collider = null;
    }
    if (!state.portalRegistered) {
      state.portalRegistered = true;
      this.portalNetwork.registerAperture({
        x: state.capsule.position.x,
        z: state.capsule.position.z,
        core: state.core,
        destination: "math",
        milestoneParent: state.capsule,
        signParent: this.zoneGroup,
        rotation: Math.PI / 2,
        progressZone: "math",
        orbiting: true,
        action: () => this.teleport("math", true),
        chargeMode: "collapse",
        lockMessage:
          "The reconstructed cube folds inward… remain within its core to enter Mightymatica.",
      });
    }
    this.updateInteractionLabel(
      "legacy-simulation-capsule",
      "Enter reconstructed Mightymatica aperture",
    );
    if (announce) {
      this.hooks.onStatus(
        "Reconstruction complete. The cube now contains a stable sub-dimension; step into its amber-violet core to cross.",
      );
    }
  }

  private buildMightymatica(arrivalFrom: ZoneId | null): void {
    const module = this.mightymaticaModule;
    if (!module) {
      throw new Error("Mightymatica module was not loaded before zone construction.");
    }
    this.bounds = { kind: "square", halfWidth: 16.2, halfDepth: 16.2 };
    const game = this;
    this.mightymaticaZone = module.createMightymaticaZone({
      root: this.zoneGroup,
      quality: this.quality,
      rematerializeOnArrival: arrivalFrom === "grid",
      get reducedMotion() {
        return game.reduceMotion;
      },
      addStaticBox: (...args) => {
        const collider = this.addStaticBox(...args);
        return () => {
          this.removeStaticCollider(collider);
        };
      },
      addJumpSurface: (
        id,
        x,
        z,
        halfWidth,
        halfDepth,
        height,
        landingMessage,
        onLand,
      ) => {
        this.addSurfaceArea({
          id,
          x,
          z,
          halfWidth,
          halfDepth,
          requiresJump: true,
          landingMessage,
          onLand,
          heightAt: () => height,
        });
      },
      addWalkSurface: (
        id,
        x,
        z,
        halfWidth,
        halfDepth,
        height,
      ) => {
        this.addSurfaceArea({
          id,
          x,
          z,
          halfWidth,
          halfDepth,
          requiresJump: false,
          heightAt: () => height,
        });
      },
      registerDynamicBox: (collider) => {
        this.addStaticCollider(collider, true);
        return () => {
          this.removeStaticCollider(collider);
        };
      },
      registerDynamicJumpSurface: (dynamicSurface) => {
        const surface: SurfaceArea = {
          id: dynamicSurface.id,
          get x() {
            return dynamicSurface.x;
          },
          get z() {
            return dynamicSurface.z;
          },
          get halfWidth() {
            return dynamicSurface.halfWidth;
          },
          get halfDepth() {
            return dynamicSurface.halfDepth;
          },
          requiresJump: true,
          get supportMargin() {
            return dynamicSurface.supportMargin;
          },
          get debugResolution() {
            return dynamicSurface.debugResolution;
          },
          get landingMessage() {
            return dynamicSurface.landingMessage;
          },
          get enabled() {
            return dynamicSurface.enabled;
          },
          contains: (x, z, margin) =>
            dynamicSurface.contains?.(x, z, margin) ??
            (Math.abs(x - dynamicSurface.x) <=
              dynamicSurface.halfWidth + margin &&
              Math.abs(z - dynamicSurface.z) <=
                dynamicSurface.halfDepth + margin),
          heightAt: () => dynamicSurface.height,
        };
        this.addSurfaceArea(surface, true);
        return () => {
          this.removeSurfaceArea(surface);
          if (this.activePlatform === surface) {
            this.activePlatform = null;
          }
        };
      },
      refreshCollisionDebug: () => {
        if (this.collisionDebugEnabled) {
          this.refreshCollisionDebugVisuals();
        }
      },
      addInteraction: ({ id, label, x, z, radius, action }) => {
        this.addInteraction(id, label, x, z, radius, action);
      },
      updateInteractionLabel: (id, label) => {
        this.updateInteractionLabel(id, label);
      },
      registerPointerAction: (
        object,
        action,
        maximumDistance = 2.4,
        isAvailable,
      ) => {
        this.pointerActions.push({
          object,
          action,
          maximumDistance,
          isAvailable,
        });
      },
      registerInstanceDrag: (spec) => {
        this.mathInstanceDrags.push(spec);
      },
      registerLooseBody: (spec) => {
        const kickable = this.registerKickable(
          spec.object,
          spec.radius,
          spec.restingY,
          null,
          spec.gravity,
          spec.boundaryRadius,
          spec.friction,
          spec.message,
        );
        kickable.enabled = spec.enabled ?? true;
        // A free spherical body has no authored starting platform from which
        // registerKickable could derive this offset. Preserve its radius so
        // telekinetic placement seats the sphere on top of a selected surface
        // instead of putting its centre inside that surface.
        if (spec.object.userData.sphericalLooseBody === true) {
          kickable.platformOffset = spec.radius;
        }
        let disposed = false;
        const game = this;
        return {
          velocity: kickable.velocity,
          get enabled() {
            return kickable.enabled;
          },
          set enabled(enabled: boolean) {
            kickable.enabled = enabled;
          },
          get radius() {
            return kickable.radius;
          },
          set radius(radius: number) {
            kickable.radius = radius;
          },
          get restingY() {
            return kickable.restingY;
          },
          set restingY(restingY: number) {
            kickable.restingY = restingY;
          },
          get held() {
            return game.heldKickable === kickable;
          },
          dispose: () => {
            if (disposed) return;
            disposed = true;
            kickable.enabled = false;
            const index = this.kickables.indexOf(kickable);
            if (index >= 0) this.kickables.splice(index, 1);
          },
        };
      },
      copyPlayerPosition: (target) => target.copy(this.playerPosition),
      applyPlayerDrift: (x, z) => {
        this.tempDirection.copy(this.playerPosition);
        this.tempDirection.x += x;
        this.tempDirection.z += z;
        this.constrainToBounds(this.tempDirection);
        if (this.noclip) {
          this.playerPosition.copy(this.tempDirection);
          return;
        }
        this.moveWithCollisions(
          this.tempDirection,
          this.surfaceOffset + this.jumpHeight,
        );
      },
      getPlayerFeetHeight: () => this.surfaceOffset + this.jumpHeight,
      getTravelingBody: () => {
        const asteroid = this.archiveAsteroid;
        if (!asteroid) return null;
        this.mathTravelingBody.position.copy(
          asteroid.object.position,
        );
        this.mathTravelingBody.radius = asteroid.radius;
        this.mathTravelingBody.restingY = asteroid.restingY;
        this.mathTravelingBody.enabled =
          asteroid.enabled && asteroid.object.visible;
        this.mathTravelingBody.held =
          asteroid === this.heldKickable;
        return this.mathTravelingBody;
      },
      registerPlayerOccluder: (object) => {
        this.registerPlayerOccluder(object);
      },
      performReachGesture: (target, shouldJump = false) => {
        this.pointerActionReachTarget = target;
        this.pointerActionReachUntil = this.elapsed + 0.82;
        if (shouldJump) this.jump();
      },
      requestCameraFrame: ({ focus, zoom, duration }) => {
        const frame: MathCameraFrame = {
          focus: new THREE.Vector3(focus.x, focus.y, focus.z),
          zoom: THREE.MathUtils.clamp(zoom, 0.65, 2.5),
          startedAt: this.elapsed,
          expiresAt: this.elapsed + Math.max(0.25, duration),
        };
        this.mathCameraFrame = frame;
        return () => {
          if (this.mathCameraFrame === frame) {
            this.mathCameraFrame = null;
          }
        };
      },
      registerReturnAperture: (x, z, core, label) => {
        const action = () => this.teleport("grid", true);
        this.portalNetwork.registerAperture({
          x,
          z,
          core,
          destination: "grid",
          milestoneParent: core,
          signParent: this.zoneGroup,
          rotation: Math.PI,
          progressZone: "math",
          fragmentZone: "math",
          orbiting: true,
          action,
          chargeMode: "collapse",
          lockMessage:
            "The cube core folds inward… remain within the face to return to Signal Grid.",
          interaction: {
            id: "math-cube-return-aperture",
            label,
            radius: 2.65,
          },
        });
      },
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
    });
  }

  private buildSpaceArchive(): void {
    this.bounds = { kind: "circle", radius: 15.2 };
    const root = this.zoneGroup;
    const archiveFloorTexture = createArchiveFloorTexture(
      archiveAtlasPosition.x,
      archiveAtlasPosition.z,
    );
    archiveFloorTexture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const archiveFloorTopMaterial = this.materials.darkStone.clone();
    archiveFloorTopMaterial.name = "archive-polar-deck-top-material";
    archiveFloorTopMaterial.color.setHex(0xffffff);
    archiveFloorTopMaterial.map = archiveFloorTexture;
    archiveFloorTopMaterial.emissive.setHex(0x10182f);
    archiveFloorTopMaterial.emissiveIntensity = 0.3;
    archiveFloorTopMaterial.roughness = 0.74;
    archiveFloorTopMaterial.metalness = 0.22;
    const archiveFloorEdgeMaterial = this.materials.darkStone.clone();
    archiveFloorEdgeMaterial.name = "archive-polar-deck-edge-material";
    archiveFloorEdgeMaterial.color.setHex(0x151d2d);
    archiveFloorEdgeMaterial.emissive.setHex(0x050814);
    archiveFloorEdgeMaterial.emissiveIntensity = 0.2;
    archiveFloorEdgeMaterial.roughness = 0.9;
    archiveFloorEdgeMaterial.metalness = 0.1;

    const foundation = addCylinder(
      root,
      17,
      17,
      1.6,
      18,
      [0, -0.8, 0],
      this.materials.black,
    );
    const archiveFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(13.8, 13.8, 0.32, 20),
      [
        archiveFloorEdgeMaterial,
        archiveFloorTopMaterial,
        archiveFloorEdgeMaterial,
      ],
    );
    archiveFloor.position.set(0, -0.05, 0);
    archiveFloor.receiveShadow = true;
    root.add(archiveFloor);
    foundation.name = "world-terrain-foundation";
    archiveFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    archiveFloor.castShadow = false;

    this.archiveOrbitPlayground.mount(root);

    const archiveTelescope = this.createTelescope(root, -8.2, -2.8);
    this.addStaticBox(-8.2, 0.7, -2.8, 0.7, 0.8, 0.7);
    this.addInteraction("archive-telescope", "Sight a wandering moon", -8.2, -2.8, 2.6, () => {
      this.raiseTelescope(archiveTelescope);
      this.hooks.onStatus("A small moon crosses the ledger line. No material variance detected.");
    });

    this.archiveSignalPuzzle.mount(root);

    this.createMonitorObservatory(root);
    this.createLanternReveal(
      root,
      "FRAGILE | MISROUTED",
      -1.1,
      0.875,
      -5.85,
      4.5,
      0,
      "lantern-archive-clue",
      "Read the phosphor maintenance stencil",
      "The striped CRT has a suspiciously fresh dent. Violet residue rims the nearby threshold.",
    );
    this.createLanternReveal(
      root,
      "ONE STONE | TWO ENDPOINTS",
      -7.4,
      0.165,
      2.25,
      4.5,
      -0.18,
      "lantern-archive-goal",
      "Inspect the old routing sketch",
      "A faded line joins the loose stone, the striped screen, and the violet threshold. Someone circled both endpoints.",
    );
    this.addInteraction("market-console", "Inspect market telemetry", -1.2, -5.8, 2.8, () => {
      this.hooks.onStatus(
        "Simulated market telemetry: prices move; balances, controls, and ledgers still reconcile.",
      );
    });
    this.addInteraction("monitor-choir", "Ping the monitor choir", 4.4, -5.8, 3, () => {
      this.hooks.onStatus("Twelve terminals answer. One appears unreasonably happy to see you. ☺");
    });

    this.createPinballAsteroid(root, -8.2, 1.2, 0.66);
    for (const [x, y, z, size] of [
      [-10.5, 2.1, 3.8, 0.9],
      [11.7, 3.6, -1.8, 0.82],
      [10.6, 1.7, -8.5, 0.7],
      [-5.6, 3.2, -10.6, 0.62],
    ] as const) {
      this.createFloatingAsteroid(root, x, y, z, size);
    }

    this.portalNetwork.createThreshold(
      root,
      0,
      10.3,
      palette.violet,
      "Return to Field Station",
      "field",
    );
  }

  private createStars(): void {
    const count = 620;
    const positions = new Float32Array(count * 3);
    let seed = 7109;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let index = 0; index < count; index += 1) {
      const radius = 45 + random() * 50;
      const angle = random() * Math.PI * 2;
      const height = 8 + random() * 52;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9addec,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.74,
    });
    const stars = new THREE.Points(geometry, material);
    this.decorativeGroup.add(stars);
  }

  private createTent(parent: THREE.Group, x: number, z: number): TentState {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const canvasTexture = createFieldCanvasTexture();
    canvasTexture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const createFabricMaterial = (
      name: string,
      color: THREE.ColorRepresentation,
      emissive: THREE.ColorRepresentation,
    ): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        name,
        color,
        map: canvasTexture,
        emissive,
        emissiveIntensity: 0.08,
        roughness: 0.98,
        metalness: 0,
      });
    const halfWidth = 2.25;
    const halfDepth = 1.7;
    const peak = 2.65;
    const doorHalfWidth = 0.66;
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      this.materials.softShadow,
    );
    contactShadow.name = "survey-tent-soft-contact-shadow";
    contactShadow.position.set(0.32, 0.142, -0.22);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.scale.set(4.85, 3.4, 1);
    contactShadow.castShadow = false;
    contactShadow.receiveShadow = false;
    contactShadow.renderOrder = 1;
    group.add(contactShadow);
    const canopyGeometry = new THREE.BufferGeometry();
    canopyGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -halfWidth, 0, -halfDepth, 0, peak, 0, halfWidth, 0, -halfDepth,
          -halfWidth, 0, halfDepth, 0, peak, 0, -halfWidth, 0, -halfDepth,
          halfWidth, 0, -halfDepth, 0, peak, 0, halfWidth, 0, halfDepth,
          -halfWidth, 0, halfDepth, -doorHalfWidth, 0, halfDepth, 0, peak, 0,
          doorHalfWidth, 0, halfDepth, halfWidth, 0, halfDepth, 0, peak, 0,
        ],
        3,
      ),
    );
    const panelColors = [
      0x0a464b, // rear panel
      0x0d555c, // left panel
      0x12636a, // right panel
      0x0b4d54, // front-left flap
      0x176b70, // front-right flap
    ] as const;
    const panelUvs = new Float32Array(panelColors.length * 6);
    for (let panel = 0; panel < panelColors.length; panel += 1) {
      panelUvs.set([0, 0, 0.5, 1, 1, 0], panel * 6);
    }
    canopyGeometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(panelUvs, 2),
    );
    const vertexColors = new Float32Array(panelColors.length * 9);
    const panelColor = new THREE.Color();
    for (const [panel, colorHex] of panelColors.entries()) {
      panelColor.setHex(colorHex);
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const offset = (panel * 3 + vertex) * 3;
        vertexColors[offset] = panelColor.r;
        vertexColors[offset + 1] = panelColor.g;
        vertexColors[offset + 2] = panelColor.b;
      }
    }
    canopyGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(vertexColors, 3),
    );
    canopyGeometry.computeVertexNormals();
    const canopyMaterial = this.materials.teal.clone();
    canopyMaterial.name = "survey-tent-panel-material";
    canopyMaterial.color.setHex(0xffffff);
    canopyMaterial.map = canvasTexture;
    canopyMaterial.vertexColors = true;
    canopyMaterial.roughness = 0.94;
    canopyMaterial.side = THREE.DoubleSide;
    canopyMaterial.transparent = true;
    canopyMaterial.opacity = 0.9;
    canopyMaterial.depthWrite = false;
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    // Transparent tent panels otherwise enter the shadow map as one opaque
    // triangle and cast a large black wedge across the whole station.
    canopy.castShadow = false;
    group.add(canopy);

    const rug = addBox(
      group,
      [2.55, 0.06, 2.25],
      [0, 0.08, 0.05],
      createFabricMaterial(
        "survey-tent-rug-material",
        0x123d40,
        0x031313,
      ),
    );
    rug.castShadow = false;

    const bedroll = addBox(
      group,
      [0.9, 0.18, 2.5],
      [0, 0.19, 0.5],
      createFabricMaterial(
        "survey-tent-bedroll-material",
        0xb49a73,
        0x21170d,
      ),
    );
    bedroll.castShadow = false;
    const pillow = addBox(
      group,
      [0.68, 0.13, 0.4],
      [0, 0.33, -0.52],
      createFabricMaterial(
        "survey-tent-pillow-material",
        0x4b9fa2,
        0x0b292b,
      ),
    );
    pillow.castShadow = false;
    const blanket = addBox(
      group,
      [0.84, 0.055, 1.05],
      [0, 0.315, 0.45],
      createFabricMaterial(
        "survey-tent-blanket-material",
        0xd47d2d,
        0x351607,
      ),
    );
    blanket.castShadow = false;
    addBox(group, [0.58, 0.5, 0.58], [-0.92, 0.3, -0.5], this.materials.wood);

    for (const side of [-1, 1]) {
      const flap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 1.55, 6),
        this.materials.amber,
      );
      flap.position.set(side * 0.73, 0.74, halfDepth + 0.035);
      flap.rotation.z = -side * 0.36;
      flap.castShadow = false;
      group.add(flap);
    }

    const interiorLamp = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      this.materials.amber,
    );
    interiorLamp.position.set(-0.2, 0.52, -0.78);
    group.add(interiorLamp);

    for (const [px, pz] of [
      [-2.05, -1.52],
      [2.05, -1.52],
      [-2.05, 1.52],
      [2.05, 1.52],
    ] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.35, 6), this.materials.brass);
      pole.position.set(px, 1.05, pz);
      group.add(pole);
    }

    const tentLinePoints: THREE.Vector3[] = [];
    const addTentLine = (
      start: readonly [number, number, number],
      end: readonly [number, number, number],
    ): void => {
      tentLinePoints.push(
        new THREE.Vector3(...start),
        new THREE.Vector3(...end),
      );
    };
    const peakPoint = [0, peak + 0.012, 0] as const;
    const canopyCorners = [
      [-halfWidth, 0.035, -halfDepth],
      [halfWidth, 0.035, -halfDepth],
      [-halfWidth, 0.035, halfDepth],
      [halfWidth, 0.035, halfDepth],
    ] as const;
    for (const corner of canopyCorners) addTentLine(peakPoint, corner);
    addTentLine(canopyCorners[0], canopyCorners[1]);
    addTentLine(canopyCorners[0], canopyCorners[2]);
    addTentLine(canopyCorners[1], canopyCorners[3]);
    addTentLine(
      canopyCorners[2],
      [-doorHalfWidth, 0.035, halfDepth],
    );
    addTentLine(
      [doorHalfWidth, 0.035, halfDepth],
      canopyCorners[3],
    );

    const guyLineAnchors = [
      {
        canopy: [-2.05, 2.15, -1.52],
        ground: [-2.82, 0.08, -2.3],
      },
      {
        canopy: [2.05, 2.15, -1.52],
        ground: [2.82, 0.08, -2.3],
      },
      {
        canopy: [-2.05, 2.15, 1.52],
        ground: [-2.82, 0.08, 2.3],
      },
      {
        canopy: [2.05, 2.15, 1.52],
        ground: [2.82, 0.08, 2.3],
      },
    ] as const;
    for (const anchor of guyLineAnchors) {
      addTentLine(anchor.canopy, anchor.ground);
      const stake = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.065, 0.42, 5),
        this.materials.brass,
      );
      stake.name = "survey-tent-guy-stake";
      stake.position.set(anchor.ground[0], 0.17, anchor.ground[2]);
      stake.rotation.z = anchor.ground[0] < 0 ? -0.18 : 0.18;
      stake.castShadow = false;
      group.add(stake);
    }
    const tentLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tentLinePoints),
      new THREE.LineBasicMaterial({
        color: 0xe0b76d,
        transparent: true,
        opacity: 0.58,
      }),
    );
    tentLines.name = "survey-tent-seams-and-guy-lines";
    tentLines.renderOrder = 1;
    group.add(tentLines);

    parent.add(group);
    const surface: SurfaceArea = {
      id: "survey-tent",
      x,
      z,
      halfWidth,
      halfDepth,
      requiresJump: false,
      snapGroundedHeight: true,
      debugResolution: 6,
      heightAt: (worldX, worldZ) => {
        const slope = Math.max(
          Math.abs(worldX - x) / halfWidth,
          Math.abs(worldZ - z) / halfDepth,
        );
        return Math.max(0, (1 - slope) * peak);
      },
    };
    const state: TentState = {
      x,
      z,
      inside: false,
      surface,
      canopy,
      sleepPosition: new THREE.Vector3(x, 0, z + 1.82),
      sleepFocus: new THREE.Vector3(x, 0, z + 0.5),
      sleepHeading: 0,
      resting: false,
      restBlend: 0,
    };
    this.tentState = state;
    this.addSurfaceArea(surface);
    return state;
  }

  private createMapTable(parent: THREE.Group, x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const woodTexture = createFieldWoodTexture();
    woodTexture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const tableWoodMaterial = this.materials.wood.clone();
    tableWoodMaterial.name = "field-atlas-table-weathered-wood-material";
    tableWoodMaterial.color.setHex(0xffffff);
    tableWoodMaterial.map = woodTexture;
    tableWoodMaterial.roughness = 0.86;
    tableWoodMaterial.metalness = 0.01;
    const tabletop = addBox(
      group,
      [2.3, 0.24, 1.45],
      [0, 1.15, 0],
      tableWoodMaterial,
    );
    tabletop.name = "field-atlas-tabletop";
    addBox(group, [1.95, 0.05, 1.15], [0, 1.3, 0], this.materials.parchment);
    const atlasTexture = createFieldAtlasTexture(
      this.hooks.isZoneDiscovered("math"),
    );
    atlasTexture.anisotropy = Math.min(
      4,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    const atlasMaterial = new THREE.MeshStandardMaterial({
      name: "field-planning-atlas-material",
      color: 0xffffff,
      map: atlasTexture,
      emissive: 0x2d2518,
      emissiveIntensity: 0.12,
      roughness: 0.88,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const atlas = new THREE.Mesh(
      new THREE.PlaneGeometry(1.86, 1.06),
      atlasMaterial,
    );
    atlas.name = "field-planning-atlas-map";
    atlas.rotation.x = -Math.PI / 2;
    atlas.position.set(0, 1.348, 0);
    atlas.castShadow = false;
    atlas.receiveShadow = true;
    group.add(atlas);
    for (const [size, position] of [
      [[2.32, 0.065, 0.055], [0, 1.285, -0.7]],
      [[2.32, 0.065, 0.055], [0, 1.285, 0.7]],
      [[0.055, 0.065, 1.35], [-1.13, 1.285, 0]],
      [[0.055, 0.065, 1.35], [1.13, 1.285, 0]],
    ] as const) {
      const edgeBand = addBox(
        group,
        size,
        position,
        this.materials.brass,
      );
      edgeBand.castShadow = false;
    }
    for (const [px, pz] of [
      [-0.85, -0.5],
      [0.85, -0.5],
      [-0.85, 0.5],
      [0.85, 0.5],
    ] as const) {
      const leg = addBox(
        group,
        [0.16, 1.1, 0.16],
        [px, 0.55, pz],
        tableWoodMaterial,
      );
      leg.castShadow = false;
    }
    for (const [px, pz] of [
      [-1.02, -0.62],
      [1.02, -0.62],
      [-1.02, 0.62],
      [1.02, 0.62],
    ] as const) {
      const rivet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.035, 8),
        this.materials.brass,
      );
      rivet.name = "field-atlas-table-rivet";
      rivet.position.set(px, 1.327, pz);
      rivet.castShadow = false;
      group.add(rivet);
    }
    const longBrace = addBox(
      group,
      [1.78, 0.1, 0.1],
      [0, 0.48, 0],
      tableWoodMaterial,
    );
    const crossBrace = addBox(
      group,
      [0.1, 0.1, 1.02],
      [0, 0.48, 0],
      tableWoodMaterial,
    );
    longBrace.castShadow = false;
    crossBrace.castShadow = false;
    parent.add(group);

    const tableSurface: SurfaceArea = {
      id: "planning-table",
      x,
      z,
      halfWidth: 1.16,
      halfDepth: 0.73,
      requiresJump: true,
      landingMessage: "Boots on the planning table. The compass and pencils look nervous.",
      heightAt: () => 1.34,
    };
    this.addSurfaceArea(tableSurface);
    this.createTabletopKickables(parent, x, z, tableSurface);
  }

  private createTabletopKickables(
    parent: THREE.Group,
    x: number,
    z: number,
    platform: SurfaceArea,
  ): void {
    if (!this.compassOwned) {
      const compass = new THREE.Group();
      compass.position.set(x - 0.42, 1.43, z - 0.08);
      const compassBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.09, 12),
        this.materials.brass,
      );
      compass.add(compassBody);
      const compassNeedle = addBox(
        compass,
        [0.08, 0.06, 0.34],
        [0, 0.08, 0],
        this.materials.coral,
      );
      compassNeedle.castShadow = false;
      compass.rotation.y = 0.35;
      compass.userData.compass = true;
      parent.add(compass);
      const compassKickable = this.registerKickable(
        compass,
        0.3,
        0.145,
        platform,
        true,
        null,
        0.9,
        "Compass overboard. Planning is now directionally approximate.",
      );
      this.compassProp = {
        kickable: compassKickable,
        origin: compass.position.clone(),
        rotation: compass.rotation.clone(),
        platform,
      };
      this.addInteraction(
        "planning-compass",
        "Take the field compass",
        compass.position.x,
        compass.position.z,
        1.45,
        () => {
          this.acquireFieldCompass(compassKickable);
        },
      );
    }

    if (
      !this.pencilUnlocked ||
      this.portablePencilVariant !== "amber"
    ) {
      this.createPencilKickable(
        parent,
        x + 0.34,
        z - 0.18,
        0.24,
        "amber",
        this.materials.amber,
        platform,
      );
    }
    if (
      !this.pencilUnlocked ||
      this.portablePencilVariant !== "cyan"
    ) {
      this.createPencilKickable(
        parent,
        x + 0.52,
        z + 0.22,
        -0.48,
        "cyan",
        this.materials.cyan,
        platform,
      );
    }
  }

  private createPencilKickable(
    parent: THREE.Group,
    x: number,
    z: number,
    rotation: number,
    variant: PencilVariant,
    material: THREE.Material,
    platform: SurfaceArea,
  ): void {
    const pencil = new THREE.Group();
    pencil.userData.gridPencil = true;
    pencil.userData.pencilVariant = variant;
    pencil.position.set(x, 1.44, z);
    pencil.rotation.y = rotation;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.72, 6),
      material,
    );
    shaft.rotation.z = Math.PI / 2;
    pencil.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.16, 6),
      this.materials.parchment,
    );
    tip.name = "planning-pencil-repair-tip";
    tip.position.x = 0.44;
    tip.rotation.z = -Math.PI / 2;
    pencil.add(tip);
    parent.add(pencil);
    const kickable = this.registerKickable(
      pencil,
      0.2,
      0.145,
      platform,
      true,
      null,
      0.86,
      "A planning pencil escapes into the field.",
    );
    const interactionId = `planning-pencil-${variant}`;
    const state: PencilPropState = {
      kickable,
      variant,
      interactionId,
      origin: pencil.position.clone(),
      rotation: pencil.rotation.clone(),
      platform,
    };
    this.pencilProps.push(state);
    if (!this.pencilUnlocked) {
      this.addInteraction(
        interactionId,
        `Stow the ${variant} repair pencil`,
        pencil.position.x,
        pencil.position.z,
        1.35,
        () => {
          this.acquirePortablePencil(kickable);
        },
      );
    }
  }

  private createTerminal(
    parent: THREE.Group,
    x: number,
    z: number,
    accent: THREE.Material,
  ): void {
    const group = new THREE.Group();
    group.name = `world-terminal-${x}-${z}`;
    group.position.set(x, 0, z);
    const base = addBox(
      group,
      [1.15, 1.2, 0.82],
      [0, 0.6, 0],
      this.materials.black,
    );
    const head = addBox(group, [1.45, 0.72, 0.72], [0, 1.45, -0.08], this.materials.black);
    head.rotation.x = -0.18;
    const screen = addBox(group, [0.98, 0.45, 0.035], [0, 1.52, 0.31], accent);
    screen.rotation.x = -0.18;
    screen.castShadow = false;
    parent.add(group);

    // The housing is a high ledge, not an infinitely tall blocker. Keep the
    // lower cabinet finite and derive the landable crown from the rotated
    // monitor geometry so elevated jumps can clear its side and descend onto
    // it. Both terminal variants share this registration.
    this.registerPlayerOccluder(group);
    this.addStaticBox(
      x,
      base.position.y,
      z,
      0.575,
      0.6,
      0.41,
      1.195,
      1.2,
    );
    this.registerClimbableBox(
      head,
      `terminal-top-${x}-${z}`,
      undefined,
      undefined,
      false,
    );
  }

  private createTelescope(parent: THREE.Group, x: number, z: number): TelescopeRig {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -0.55;

    const createStrut = (
      start: THREE.Vector3,
      end: THREE.Vector3,
      radius: number,
      material: THREE.Material,
    ): THREE.Mesh => {
      const direction = end.clone().sub(start);
      const length = direction.length();
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.18, length, 6),
        material,
      );
      strut.position.copy(start).add(end).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(up, direction.normalize());
      strut.castShadow = false;
      group.add(strut);
      return strut;
    };

    const hubHeight = 1.42;
    for (const angle of [0.2, (Math.PI * 2) / 3 + 0.2, (Math.PI * 4) / 3 + 0.2]) {
      createStrut(
        new THREE.Vector3(
          Math.cos(angle) * 0.14,
          hubHeight - 0.05,
          Math.sin(angle) * 0.14,
        ),
        new THREE.Vector3(
          Math.cos(angle) * 0.82,
          0.09,
          Math.sin(angle) * 0.82,
        ),
        0.055,
        this.materials.wood,
      );
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.15, 0.08, 7),
        this.materials.brass,
      );
      foot.position.set(
        Math.cos(angle) * 0.82,
        0.05,
        Math.sin(angle) * 0.82,
      );
      foot.castShadow = false;
      group.add(foot);
    }

    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 0.34, 8),
      this.materials.brass,
    );
    mount.position.y = hubHeight;
    mount.castShadow = false;
    group.add(mount);

    const azimuthRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.045, 5, 18),
      this.materials.parchment,
    );
    azimuthRing.rotation.x = Math.PI / 2;
    azimuthRing.position.y = hubHeight + 0.19;
    azimuthRing.castShadow = false;
    group.add(azimuthRing);

    const pivot = new THREE.Group();
    pivot.position.set(0, hubHeight + 0.28, 0);
    pivot.rotation.x = -0.16;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.24, 1.86, 10),
      this.materials.tealDark,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.18;
    barrel.castShadow = false;
    pivot.add(barrel);

    for (const zPosition of [-0.42, 0.72]) {
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.235, 0.045, 5, 14),
        this.materials.brass,
      );
      collar.position.z = zPosition;
      collar.castShadow = false;
      pivot.add(collar);
    }
    const lensRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.255, 0.065, 5, 16),
      this.materials.brass,
    );
    lensRing.position.z = 1.12;
    pivot.add(lensRing);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.205, 16),
      this.materials.cyanSoft,
    );
    lens.position.z = 1.145;
    pivot.add(lens);
    const eyepiece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.38, 8),
      this.materials.black,
    );
    eyepiece.rotation.x = Math.PI / 2;
    eyepiece.position.z = -0.94;
    pivot.add(eyepiece);
    const focusKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.28, 7),
      this.materials.brass,
    );
    focusKnob.rotation.z = Math.PI / 2;
    focusKnob.position.set(0.28, -0.03, -0.24);
    focusKnob.castShadow = false;
    pivot.add(focusKnob);
    const counterweight = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      this.materials.stone,
    );
    counterweight.position.set(0, -0.46, -0.28);
    counterweight.castShadow = false;
    pivot.add(counterweight);
    group.add(pivot);

    parent.add(group);
    const rig: TelescopeRig = {
      position: new THREE.Vector3(x, 0, z),
      pivot,
      targetPitch: -0.16,
      pitchVelocity: 0,
      raised: false,
    };
    this.telescopeRigs.push(rig);
    return rig;
  }

  private createLantern(
    parent: THREE.Group,
    x: number,
    z: number,
    lightMaterial: THREE.Material,
  ): void {
    const group = new THREE.Group();
    group.name = `world-lantern-${x}-${z}`;
    group.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.7, 6), this.materials.brass);
    pole.position.y = 1.35;
    pole.castShadow = true;
    group.add(pole);
    const light = addBox(group, [0.42, 0.55, 0.42], [0, 2.35, 0], lightMaterial);
    light.castShadow = false;
    const poolMaterial = this.materials.warmLightPool.clone();
    poolMaterial.name = "field-lantern-light-pool-instance";
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      poolMaterial,
    );
    pool.name = "field-lantern-warm-ground-pool";
    pool.position.y = 0.145;
    pool.rotation.x = -Math.PI / 2;
    pool.scale.setScalar(4);
    pool.castShadow = false;
    pool.receiveShadow = false;
    pool.renderOrder = 1;
    group.add(pool);
    parent.add(group);
    this.lanterns.push({
      light,
      pool,
      position: new THREE.Vector3(x, 0, z),
      litUntil: 0,
      targetLightIntensity: 0,
      targetLightDistance: 4.8,
    });
  }

  private createFieldLanternLightPool(parent: THREE.Group): void {
    for (let index = 0; index < 2; index += 1) {
      const light = new THREE.PointLight(palette.amber, 0, 4.8, 2);
      light.name = `field-lantern-point-light-${index + 1}`;
      light.position.set(0, 2.25, 0);
      light.castShadow = false;
      light.visible = this.quality !== "low";
      parent.add(light);
      this.fieldLanternLightLeases.push({
        light,
        lantern: null,
      });
    }
  }

  private createFieldHeartSigil(parent: THREE.Group): void {
    const group = new THREE.Group();
    group.name = "five-point-field-heart";

    const boundary = new THREE.Mesh(
      new THREE.RingGeometry(fieldHeartRadius - 0.14, fieldHeartRadius, 36),
      this.materials.parchment,
    );
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.155;
    boundary.receiveShadow = true;
    group.add(boundary);

    const coreRing = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.54, 24),
      this.materials.violet,
    );
    coreRing.rotation.x = -Math.PI / 2;
    coreRing.position.y = 0.166;
    coreRing.renderOrder = 2;
    group.add(coreRing);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 10),
      this.materials.cyanSoft,
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.17;
    core.renderOrder = 2;
    group.add(core);

    for (let index = 0; index < 5; index += 1) {
      const angle = -Math.PI / 2 + (index / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.025, 0.055),
        this.materials.parchment,
      );
      spoke.position.set(
        Math.cos(angle) * 0.88,
        0.16,
        Math.sin(angle) * 0.88,
      );
      spoke.rotation.y = -angle;
      spoke.receiveShadow = true;
      group.add(spoke);

      const channel = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 5),
        this.materials.amber,
      );
      channel.rotation.x = -Math.PI / 2;
      channel.rotation.z = angle;
      channel.position.set(
        Math.cos(angle) * 1.2,
        0.169,
        Math.sin(angle) * 1.2,
      );
      channel.renderOrder = 2;
      group.add(channel);
    }

    parent.add(group);
  }

  private createRockCluster(
    parent: THREE.Group,
    x: number,
    z: number,
    material: THREE.Material,
  ): void {
    const group = new THREE.Group();
    group.name = "world-rock-cluster";
    group.position.set(x, 0, z);
    const parts: FieldRockClusterPart[] = [];
    for (let index = 0; index < 3; index += 1) {
      const radius = 0.55 + index * 0.18;
      const scaleY = 0.75 + index * 0.16;
      const localX = (index - 1) * 0.55;
      const localY = 0.35 + index * 0.08;
      const localZ = (index % 2) * 0.45;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        material,
      );
      rock.position.set(localX, localY, localZ);
      rock.scale.y = scaleY;
      rock.rotation.set(index * 0.3, index * 0.8, 0);
      rock.castShadow = index === 2;
      rock.receiveShadow = true;
      group.add(rock);

      const top = localY + radius * scaleY;
      const solidTop = top + 0.08;
      const collisionRadius = radius * 0.72;
      const collider = this.addStaticBox(
        x + localX,
        top * 0.5,
        z + localZ,
        collisionRadius,
        top * 0.5,
        collisionRadius,
        top,
        solidTop,
      );
      collider.intersectsHorizontal = (playerX, playerZ, playerRadius) => {
        const dx = playerX - collider.x;
        const dz = playerZ - collider.z;
        const combinedRadius = collisionRadius + playerRadius;
        return dx * dx + dz * dz <= combinedRadius * combinedRadius;
      };
      const surface: SurfaceArea = {
        id: `field-rock-${x}-${z}-${index}`,
        x: x + localX,
        z: z + localZ,
        halfWidth: collisionRadius,
        halfDepth: collisionRadius,
        requiresJump: true,
        supportMargin: 0.2,
        edgeGrace: 0.24,
        contains: (playerX, playerZ, margin) => {
          const supportedRadius = Math.max(0.05, collisionRadius + margin);
          const dx = playerX - surface.x;
          const dz = playerZ - surface.z;
          return dx * dx + dz * dz <= supportedRadius * supportedRadius;
        },
        heightAt: () => solidTop,
      };
      this.addSurfaceArea(surface, true);
      this.staticColliderIndex.markMutable(collider);
      parts.push({
        rock,
        originPosition: rock.position.clone(),
        originQuaternion: rock.quaternion.clone(),
        velocity: new THREE.Vector2(),
        verticalVelocity: 0,
        fallen: false,
        repairStartPosition: rock.position.clone(),
        repairStartQuaternion: rock.quaternion.clone(),
        collider,
        surface,
      });
    }
    parent.add(group);
    this.fieldRockClusters.push({
      group,
      origin: new THREE.Vector2(x, z),
      velocity: new THREE.Vector2(),
      parts,
      contactRadius: 1.62,
      fractured: false,
      fractureStrain: 0,
      repairing: false,
      repairAge: 0,
      repairDuration: 1.15,
      verticalVelocity: 0,
      fallen: false,
    });
  }

  private syncFieldRockClusterPhysics(cluster: FieldRockClusterState): void {
    for (const part of cluster.parts) {
      const worldX = cluster.group.position.x + part.rock.position.x;
      const worldZ = cluster.group.position.z + part.rock.position.z;
      part.collider.x = worldX;
      part.collider.z = worldZ;
      part.surface.x = worldX;
      part.surface.z = worldZ;
    }
  }

  private pushFieldRockClusters(
    range: number,
    stage: Exclude<SpellStage, "spark">,
    charge: number,
  ): { pushed: number; fractured: number } {
    if (this.currentZone !== "field") {
      return { pushed: 0, fractured: 0 };
    }
    let pushed = 0;
    let fractured = 0;
    for (const [index, cluster] of this.fieldRockClusters.entries()) {
      if (cluster.fallen || cluster.repairing) continue;
      if (cluster.fractured) {
        let pushedPiece = false;
        for (const part of cluster.parts) {
          if (part.fallen) continue;
          const worldX = cluster.group.position.x + part.rock.position.x;
          const worldZ = cluster.group.position.z + part.rock.position.z;
          const dx = worldX - this.playerPosition.x;
          const dz = worldZ - this.playerPosition.z;
          const distance = Math.max(0.04, Math.hypot(dx, dz));
          if (distance > range + part.collider.halfWidth) continue;
          const falloff =
            1 -
            THREE.MathUtils.clamp(
              distance / (range + part.collider.halfWidth + 0.2),
              0,
              0.9,
            );
          const stageForce = stage === "thunder" ? 3.55 : 2.05;
          const impulse = stageForce * (0.58 + charge * 0.72) * falloff;
          part.velocity.x += (dx / distance) * impulse;
          part.velocity.y += (dz / distance) * impulse;
          const speed = part.velocity.length();
          if (speed > 4.2) part.velocity.multiplyScalar(4.2 / speed);
          pushedPiece = true;
        }
        if (pushedPiece) pushed += 1;
        continue;
      }

      const dx = cluster.group.position.x - this.playerPosition.x;
      const dz = cluster.group.position.z - this.playerPosition.z;
      const distance = Math.hypot(dx, dz);
      const effectiveRange = range + cluster.contactRadius * 0.55;
      if (distance > effectiveRange) continue;

      const fallbackAngle = index * 2.19 + this.spellCastSequence * 0.31;
      const directionX =
        distance > 0.04 ? dx / distance : Math.cos(fallbackAngle);
      const directionZ =
        distance > 0.04 ? dz / distance : Math.sin(fallbackAngle);
      const falloff = 1 - THREE.MathUtils.clamp(
        distance / (effectiveRange + 0.2),
        0,
        0.9,
      );
      const stageForce = stage === "thunder" ? 3.25 : 1.75;
      const impulse = stageForce * (0.58 + charge * 0.72) * falloff;
      cluster.velocity.x += directionX * impulse;
      cluster.velocity.y += directionZ * impulse;
      const speed = cluster.velocity.length();
      if (speed > 3.6) cluster.velocity.multiplyScalar(3.6 / speed);
      pushed += 1;
      if (stage === "thunder") {
        cluster.fractureStrain +=
          (0.24 + charge * 0.94) * Math.max(0.24, falloff);
        if (
          (charge >= 0.84 && falloff >= 0.18) ||
          cluster.fractureStrain >= 1
        ) {
          this.fractureFieldRockCluster(
            cluster,
            directionX,
            directionZ,
            impulse,
          );
          fractured += 1;
        }
      }
    }
    return { pushed, fractured };
  }

  private fractureFieldRockCluster(
    cluster: FieldRockClusterState,
    directionX: number,
    directionZ: number,
    impulse: number,
  ): void {
    if (cluster.fractured || cluster.fallen) return;
    cluster.fractured = true;
    cluster.fractureStrain = 0;
    cluster.repairing = false;
    for (const [index, part] of cluster.parts.entries()) {
      const radialLength = Math.max(
        0.001,
        Math.hypot(part.rock.position.x, part.rock.position.z),
      );
      const fallbackAngle = index * (Math.PI * 2 / cluster.parts.length);
      const radialX =
        radialLength > 0.04
          ? part.rock.position.x / radialLength
          : Math.cos(fallbackAngle);
      const radialZ =
        radialLength > 0.04
          ? part.rock.position.z / radialLength
          : Math.sin(fallbackAngle);
      const separation = 0.78 + index * 0.16;
      part.velocity.set(
        cluster.velocity.x + radialX * separation + directionX * impulse * 0.2,
        cluster.velocity.y + radialZ * separation + directionZ * impulse * 0.2,
      );
      part.verticalVelocity = 0;
      part.fallen = false;
      part.collider.enabled = true;
      part.surface.enabled = true;
    }
    cluster.velocity.set(0, 0);
  }

  private beginFieldRockPencilRepair(
    kickable: Kickable,
    tipPosition: THREE.Vector3,
  ): boolean {
    if (
      this.currentZone !== "field" ||
      kickable.object.userData.pencilVariant !== "cyan"
    ) {
      return false;
    }

    let target: FieldRockClusterState | null = null;
    let nearestDistanceSquared = 1.75 * 1.75;
    for (const cluster of this.fieldRockClusters) {
      if (!cluster.fractured || cluster.repairing || cluster.fallen) continue;
      for (const part of cluster.parts) {
        if (part.fallen) continue;
        const dx = tipPosition.x - part.collider.x;
        const dy =
          tipPosition.y -
          (cluster.group.position.y + part.rock.position.y);
        const dz = tipPosition.z - part.collider.z;
        const distanceSquared =
          dx * dx + dz * dz + dy * dy * 0.2;
        if (distanceSquared >= nearestDistanceSquared) continue;
        nearestDistanceSquared = distanceSquared;
        target = cluster;
      }
    }
    if (!target) return false;

    target.repairing = true;
    target.repairAge = 0;
    target.velocity.set(0, 0);
    for (const part of target.parts) {
      part.repairStartPosition.copy(part.rock.position);
      part.repairStartQuaternion.copy(part.rock.quaternion);
      part.velocity.set(0, 0);
      part.verticalVelocity = 0;
      part.fallen = false;
      part.collider.enabled = false;
      part.surface.enabled = false;
      if (this.activePlatform === part.surface) {
        this.activePlatform = null;
      }
    }
    this.hooks.onStatus(
      "The cyan line catches a broken joint. Three loose stones begin remembering one another.",
    );
    return true;
  }

  private updateFieldRockClusters(
    delta: number,
    playerMoving: boolean,
  ): void {
    if (this.currentZone !== "field" || this.fieldRockClusters.length === 0) {
      return;
    }

    const intendedSpeed =
      delta > 0
        ? Math.hypot(this.movement.x, this.movement.z) / delta
        : 0;
    const movementLength = Math.hypot(this.movement.x, this.movement.z);
    const movementX =
      movementLength > 0.0001 ? this.movement.x / movementLength : 0;
    const movementZ =
      movementLength > 0.0001 ? this.movement.z / movementLength : 0;
    let anyMoved = false;

    for (const cluster of this.fieldRockClusters) {
      if (cluster.repairing) {
        cluster.repairAge = Math.min(
          cluster.repairDuration,
          cluster.repairAge + delta,
        );
        const progress = cluster.repairAge / cluster.repairDuration;
        const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
        const arc = Math.sin(progress * Math.PI);
        for (const [index, part] of cluster.parts.entries()) {
          part.rock.position.lerpVectors(
            part.repairStartPosition,
            part.originPosition,
            eased,
          );
          part.rock.position.y += arc * (0.24 + index * 0.07);
          part.rock.quaternion
            .copy(part.repairStartQuaternion)
            .slerp(part.originQuaternion, eased);
        }
        this.syncFieldRockClusterPhysics(cluster);
        anyMoved = true;
        if (progress >= 1) {
          cluster.repairing = false;
          cluster.fractured = false;
          cluster.fractureStrain = 0;
          for (const part of cluster.parts) {
            part.rock.position.copy(part.originPosition);
            part.rock.quaternion.copy(part.originQuaternion);
            part.velocity.set(0, 0);
            part.verticalVelocity = 0;
            part.fallen = false;
            part.collider.enabled = true;
            part.surface.enabled = true;
          }
          this.syncFieldRockClusterPhysics(cluster);
        }
        continue;
      }

      if (cluster.fallen) {
        cluster.velocity.multiplyScalar(Math.exp(-delta * 0.35));
        cluster.group.position.x += cluster.velocity.x * delta;
        cluster.group.position.z += cluster.velocity.y * delta;
        cluster.verticalVelocity -= 9.5 * delta;
        cluster.group.position.y += cluster.verticalVelocity * delta;
        if (cluster.group.position.y < -11) {
          cluster.velocity.set(0, 0);
          cluster.verticalVelocity = 0;
        }
        this.syncFieldRockClusterPhysics(cluster);
        anyMoved = true;
        continue;
      }

      if (cluster.fractured) {
        for (const part of cluster.parts) {
          if (part.fallen) {
            part.velocity.multiplyScalar(Math.exp(-delta * 0.35));
            part.rock.position.x += part.velocity.x * delta;
            part.rock.position.z += part.velocity.y * delta;
            part.verticalVelocity -= 9.5 * delta;
            part.rock.position.y += part.verticalVelocity * delta;
            if (part.rock.position.y < -11) {
              part.velocity.set(0, 0);
              part.verticalVelocity = 0;
            }
            anyMoved = true;
            continue;
          }

          const worldX = cluster.group.position.x + part.rock.position.x;
          const worldZ = cluster.group.position.z + part.rock.position.z;
          const dx = worldX - this.playerPosition.x;
          const dz = worldZ - this.playerPosition.z;
          const distance = Math.max(0.001, Math.hypot(dx, dz));
          const playerStandingOnPart = part.surface === this.activePlatform;
          if (
            playerMoving &&
            !playerStandingOnPart &&
            movementLength > 0.0001 &&
            distance <= part.collider.halfWidth + this.playerRadius + 0.08
          ) {
            const approach =
              movementX * (dx / distance) + movementZ * (dz / distance);
            if (approach > 0.16) {
              const effort = THREE.MathUtils.clamp(
                intendedSpeed / 4.25,
                0.72,
                1.4,
              );
              const acceleration = approach * effort * 1.5;
              part.velocity.x += movementX * acceleration * delta;
              part.velocity.y += movementZ * acceleration * delta;
            }
          }

          part.velocity.multiplyScalar(Math.exp(-delta * 2.35));
          if (part.velocity.lengthSq() < 0.000016) {
            part.velocity.set(0, 0);
          } else {
            part.rock.position.x += part.velocity.x * delta;
            part.rock.position.z += part.velocity.y * delta;
            part.rock.rotation.y +=
              part.velocity.length() * delta * (part.velocity.x >= 0 ? 0.42 : -0.42);
            anyMoved = true;
          }

          const nextWorldX =
            cluster.group.position.x + part.rock.position.x;
          const nextWorldZ =
            cluster.group.position.z + part.rock.position.z;
          if (Math.hypot(nextWorldX, nextWorldZ) > fieldRockFallRadius) {
            part.fallen = true;
            part.verticalVelocity = -0.35;
            part.collider.enabled = false;
            part.surface.enabled = false;
            if (this.activePlatform === part.surface) {
              this.activePlatform = null;
            }
            anyMoved = true;
          }
        }
        this.syncFieldRockClusterPhysics(cluster);
        continue;
      }

      const playerStandingOnCluster = cluster.parts.some(
        (part) => part.surface === this.activePlatform,
      );
      const dx = cluster.group.position.x - this.playerPosition.x;
      const dz = cluster.group.position.z - this.playerPosition.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const contactDistance = cluster.contactRadius + this.playerRadius;
      if (
        playerMoving &&
        !playerStandingOnCluster &&
        movementLength > 0.0001 &&
        distance <= contactDistance
      ) {
        const approach =
          movementX * (dx / distance) + movementZ * (dz / distance);
        if (approach > 0.18) {
          const effort = THREE.MathUtils.clamp(intendedSpeed / 4.25, 0.72, 1.35);
          const acceleration = approach * effort * 1.05;
          cluster.velocity.x += movementX * acceleration * delta;
          cluster.velocity.y += movementZ * acceleration * delta;
        }
      }

      const damping = Math.exp(-delta * 2.65);
      cluster.velocity.multiplyScalar(damping);
      if (cluster.velocity.lengthSq() < 0.000016) {
        cluster.velocity.set(0, 0);
        continue;
      }

      cluster.group.position.x += cluster.velocity.x * delta;
      cluster.group.position.z += cluster.velocity.y * delta;
      if (
        Math.hypot(
          cluster.group.position.x,
          cluster.group.position.z,
        ) > fieldRockFallRadius
      ) {
        cluster.fallen = true;
        cluster.verticalVelocity = -0.35;
        for (const part of cluster.parts) {
          part.collider.enabled = false;
          part.surface.enabled = false;
          if (this.activePlatform === part.surface) {
            this.activePlatform = null;
          }
        }
      }
      this.syncFieldRockClusterPhysics(cluster);
      anyMoved = true;
    }

    if (
      anyMoved &&
      this.collisionDebugEnabled &&
      this.elapsed - this.lastFieldRockDebugRefresh >= 0.12
    ) {
      this.lastFieldRockDebugRefresh = this.elapsed;
      this.refreshCollisionDebugVisuals();
    }
  }

  private resetFieldRockClusters(): void {
    let moved = false;
    for (const cluster of this.fieldRockClusters) {
      moved ||=
        cluster.fractured ||
        cluster.repairing ||
        cluster.fallen ||
        cluster.group.position.x !== cluster.origin.x ||
        cluster.group.position.z !== cluster.origin.y ||
        cluster.group.position.y !== 0;
      cluster.group.position.set(cluster.origin.x, 0, cluster.origin.y);
      cluster.velocity.set(0, 0);
      cluster.verticalVelocity = 0;
      cluster.fractured = false;
      cluster.fractureStrain = 0;
      cluster.repairing = false;
      cluster.repairAge = 0;
      cluster.fallen = false;
      for (const part of cluster.parts) {
        part.rock.position.copy(part.originPosition);
        part.rock.quaternion.copy(part.originQuaternion);
        part.velocity.set(0, 0);
        part.verticalVelocity = 0;
        part.fallen = false;
        part.collider.enabled = true;
        part.surface.enabled = true;
      }
      this.syncFieldRockClusterPhysics(cluster);
    }
    if (moved && this.collisionDebugEnabled) {
      this.refreshCollisionDebugVisuals();
    }
  }

  private createStormStone(
    parent: THREE.Group,
    x: number,
    z: number,
  ): void {
    const assembly = new THREE.Group();
    assembly.name = "field-storm-stone";
    // The former world-space mesh was visual-only and clipped slightly into
    // the shelf. Keep the same silhouette, but make the stone and its hidden
    // lightning mark one physical assembly so telekinesis cannot leave the
    // clue behind.
    assembly.position.set(x, 0.53, z);
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.62, 0),
      this.materials.darkStone,
    );
    stone.scale.set(1, 0.62, 0.86);
    stone.rotation.set(0.08, 0.42, -0.06);
    stone.castShadow = false;
    assembly.add(stone);

    const boltShape = new THREE.Shape();
    boltShape.moveTo(-0.1, 0.56);
    boltShape.lineTo(0.22, 0.1);
    boltShape.lineTo(0.03, 0.1);
    boltShape.lineTo(0.17, -0.55);
    boltShape.lineTo(-0.24, -0.04);
    boltShape.lineTo(-0.04, -0.04);
    boltShape.closePath();
    const bolt = new THREE.Mesh(
      new THREE.ShapeGeometry(boltShape),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    bolt.position.set(0, 0.245, 0);
    bolt.rotation.set(-Math.PI / 2, 0, 0.18);
    bolt.scale.setScalar(0.68);
    bolt.visible = false;
    bolt.renderOrder = 4;
    assembly.add(bolt);
    parent.add(assembly);

    this.registerKickable(
      assembly,
      0.58,
      0.145,
      null,
      true,
      fieldRockFallRadius,
      0.988,
      "",
    );
    this.lanternReveals.push({
      mesh: bolt,
      range: 6.4,
      position: assembly.position,
    });
  }

  private syncLooseToolInteraction(kickable: Kickable): void {
    const pencilState = this.pencilProps.find(
      (state) => state.kickable === kickable,
    );
    if (pencilState) {
      const interaction = this.interactions.find(
        (candidate) => candidate.id === pencilState.interactionId,
      );
      interaction?.position.set(
        kickable.object.position.x,
        0,
        kickable.object.position.z,
      );
    }
    if (this.compassProp?.kickable === kickable) {
      const interaction = this.interactions.find(
        (candidate) => candidate.id === "planning-compass",
      );
      interaction?.position.set(
        kickable.object.position.x,
        0,
        kickable.object.position.z,
      );
    }
  }

  private finishTurtleBoundTelekinesis(event: PointerEvent): void {
    this.heldKickable = null;
    this.telekinesisPlacementSurface = null;
    this.telekinesisPointerId = null;
    this.telekinesisMoved = false;
    this.telekinesisPencilWasWorn = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
  }

  private createFishSchool(parent: THREE.Group): void {
    const ensureNonIndexed = (
      geometry: THREE.BufferGeometry,
    ): THREE.BufferGeometry => {
      if (!geometry.index) return geometry;
      const converted = geometry.toNonIndexed();
      geometry.dispose();
      return converted;
    };
    const body = ensureNonIndexed(new THREE.DodecahedronGeometry(0.23, 0));
    body.scale(1, 0.42, 1.65);
    const tail = ensureNonIndexed(new THREE.ConeGeometry(0.21, 0.36, 3));
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, -0.44);
    const geometry = mergeGeometries([body, tail], false);
    body.dispose();
    tail.dispose();
    if (!geometry) return;

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    const maximumCount = maximumFishCount;
    const mesh = new THREE.InstancedMesh(geometry, material, maximumCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    for (let index = 0; index < riverFishCount; index += 1) {
      mesh.setColorAt(
        index,
        new THREE.Color(
          index % 3 === 0
            ? 0xffc35a
            : index % 3 === 1
              ? 0x9ef7ff
              : 0x8fe09c,
        ),
      );
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
    const auraGeometry = new THREE.TorusGeometry(0.34, 0.026, 4, 14);
    auraGeometry.rotateX(Math.PI / 2);
    const aura = new THREE.InstancedMesh(
      auraGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xc79cff,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumCount,
    );
    aura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    aura.name = "enchanted-fish-flight-rings";
    aura.frustumCulled = false;
    aura.renderOrder = 5;
    parent.add(aura);

    const magicPositions = new Float32Array(
      maximumFishMagicParticleCount * 3,
    );
    const magicColors = new Float32Array(
      maximumFishMagicParticleCount * 3,
    );
    const magicGeometry = new THREE.BufferGeometry();
    const magicPositionAttribute = new THREE.BufferAttribute(
      magicPositions,
      3,
    );
    magicPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    magicGeometry.setAttribute("position", magicPositionAttribute);
    const magicColorAttribute = new THREE.BufferAttribute(
      magicColors,
      3,
    );
    magicColorAttribute.setUsage(THREE.DynamicDrawUsage);
    magicGeometry.setAttribute("color", magicColorAttribute);
    magicGeometry.setDrawRange(0, 0);
    const magicPoints = new THREE.Points(
      magicGeometry,
      new THREE.PointsMaterial({
        size: this.quality === "low" ? 0.1 : 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
      }),
    );
    magicPoints.name = "flying-fish-returning-magic";
    magicPoints.visible = false;
    magicPoints.frustumCulled = false;
    magicPoints.renderOrder = 7;
    parent.add(magicPoints);

    const flyingCount = Math.min(
      maximumFlyingFishSchools,
      this.fallsFlyingFishSchoolColors.length,
    ) * flyingFishPerShard;
    const flightAges = new Float32Array(maximumCount);
    flightAges.fill(
      3.2,
      riverFishCount,
      riverFishCount + flyingCount,
    );
    const school: FishSchool = {
      mesh,
      aura,
      magicPoints,
      magicPositions,
      magicColors,
      magicRecalls: [],
      dummy: new THREE.Object3D(),
      positions: Array.from(
        { length: maximumCount },
        () => new THREE.Vector3(),
      ),
      maximumCount,
      waterCount: riverFishCount,
      flyingCount,
      flightAges,
      spellSwarmCenter: new THREE.Vector3(),
      spellSwarmAge: 2,
      spellSwarmDuration: 0,
      spellSwarmRadius: 0,
      spellSwarmStrength: 0,
    };
    this.fishSchool = school;
    for (
      let schoolIndex = 0;
      schoolIndex < this.fallsFlyingFishSchoolColors.length;
      schoolIndex += 1
    ) {
      this.colorFlyingFishSchool(
        school,
        schoolIndex,
        this.fallsFlyingFishSchoolColors[schoolIndex] ?? 0xc79cff,
      );
    }
    const renderCount = this.getFishRenderCount(school);
    mesh.count = renderCount;
    aura.count = renderCount;
    aura.visible = flyingCount > 0;
    this.updateFishSchool(0);
  }

  private getFishRenderCount(
    school: FishSchool,
    quality: QualityTier = this.quality,
  ): number {
    const totalCount = school.waterCount + school.flyingCount;
    if (quality === "low") return Math.min(totalCount, 20);
    if (quality === "medium") return Math.min(totalCount, 30);
    return Math.min(totalCount, school.maximumCount);
  }

  private colorFlyingFishSchool(
    school: FishSchool,
    schoolIndex: number,
    sourceColorValue: THREE.ColorRepresentation,
  ): void {
    const accents = [
      0xff6fd8,
      0x70e8ff,
      0xffd166,
      0xa78bfa,
      0x8dff9b,
    ] as const;
    const sourceColor = new THREE.Color(sourceColorValue);
    const firstIndex =
      school.waterCount + schoolIndex * flyingFishPerShard;
    for (let member = 0; member < flyingFishPerShard; member += 1) {
      const index = firstIndex + member;
      if (index >= school.maximumCount) break;
      const accent = new THREE.Color(
        accents[(schoolIndex + member) % accents.length] ?? 0xffffff,
      );
      const color = sourceColor
        .clone()
        .lerp(accent, 0.48)
        .lerp(new THREE.Color(0xffffff), 0.07);
      school.mesh.setColorAt(index, color);
      school.aura.setColorAt(
        index,
        color.clone().lerp(new THREE.Color(0xffffff), 0.38),
      );
    }
    if (school.mesh.instanceColor) {
      school.mesh.instanceColor.needsUpdate = true;
    }
    if (school.aura.instanceColor) {
      school.aura.instanceColor.needsUpdate = true;
    }
  }

  private triggerFishSpellSwarm(
    stage: SpellStage,
    charge: number,
    range: number,
  ): void {
    const school = this.fishSchool;
    if (!school) return;
    const stageStrength =
      stage === "thunder" ? 0.66 : stage === "surge" ? 0.56 : 0.42;
    school.spellSwarmCenter.set(
      this.playerPosition.x,
      this.digitStormGroundY,
      this.playerPosition.z,
    );
    school.spellSwarmAge = 0;
    school.spellSwarmDuration = this.digitStormDuration + 0.24;
    school.spellSwarmRadius = range * (1.05 + charge * 0.16);
    school.spellSwarmStrength =
      stageStrength *
      (0.82 + charge * 0.28) *
      (this.reduceMotion ? 0.34 : 1);
  }

  private updateFishSchool(delta = 0): void {
    const school = this.fishSchool;
    if (!school) return;
    const baitShard = this.updateFishBaitTarget(school, delta);
    const baitProxy = baitShard?.proxy ?? null;
    const renderCount = this.getFishRenderCount(school);
    school.mesh.count = renderCount;
    school.aura.count = renderCount;
    school.aura.visible = school.flyingCount > 0;
    const motionTime = this.elapsed * (this.reduceMotion ? 0.28 : 1);
    for (const recall of school.magicRecalls) {
      recall.age = Math.min(recall.duration, recall.age + delta);
    }
    school.spellSwarmAge = Math.min(
      school.spellSwarmDuration,
      school.spellSwarmAge + delta,
    );
    const spellSwarmProgress =
      school.spellSwarmDuration > 0
        ? school.spellSwarmAge / school.spellSwarmDuration
        : 1;
    const spellSwarmEnvelope =
      THREE.MathUtils.smoothstep(spellSwarmProgress, 0, 0.16) *
      (1 -
        THREE.MathUtils.smoothstep(
          spellSwarmProgress,
          0.58,
          1,
        ));
    for (let index = 0; index < renderCount; index += 1) {
      const flying = index >= school.waterCount;
      if (flying) {
        school.flightAges[index] = this.reduceMotion
          ? 3.2
          : Math.min(3.2, (school.flightAges[index] ?? 0) + delta);
      }
      const flightBlend = flying
        ? THREE.MathUtils.smoothstep(
            school.flightAges[index] ?? 0,
            0,
            2.8,
          )
        : 0;
      const pathIndex = index % school.waterCount;
      const direction = pathIndex % 2 === 0 ? 1 : -1;
      const speed = 0.035 + (pathIndex % 4) * 0.006;
      const cycle =
        (motionTime * speed + pathIndex * 0.137) % 1;
      const travel = direction > 0 ? cycle : 1 - cycle;
      const pathProgress = 0.1 + travel * 0.78;
      fallsRiverCurve.getPointAt(pathProgress, school.dummy.position);
      fallsRiverCurve.getTangentAt(pathProgress, this.tempDirection);
      const waterDirectionX = this.tempDirection.x * direction;
      const waterDirectionZ = this.tempDirection.z * direction;
      const lateral =
        Math.sin(
          motionTime * (0.65 + pathIndex * 0.04) +
            pathIndex * 1.9,
        ) *
        (0.68 + (pathIndex % 3) * 0.2);
      school.dummy.position.x -= this.tempDirection.z * lateral;
      school.dummy.position.y =
        0.31 +
        Math.sin(motionTime * 2.2 + pathIndex) * 0.045;
      school.dummy.position.z += this.tempDirection.x * lateral;
      let travelX = waterDirectionX;
      let travelY = 0;
      let travelZ = waterDirectionZ;
      let recallProgress = -1;
      if (
        !flying &&
        baitShard &&
        baitProxy &&
        index === this.fishBaitFishIndex
      ) {
        const approach = this.reduceMotion
          ? 0.96
          : THREE.MathUtils.smoothstep(
              baitShard.fishBaitAge,
              0.04,
              0.58,
            ) * 0.92;
        const baitDirectionX =
          baitProxy.position.x - school.dummy.position.x;
        const baitDirectionZ =
          baitProxy.position.z - school.dummy.position.z;
        school.dummy.position.lerp(
          this.tempWorld.set(
            baitProxy.position.x,
            0.31,
            baitProxy.position.z,
          ),
          approach,
        );
        travelX = THREE.MathUtils.lerp(
          waterDirectionX,
          baitDirectionX,
          approach,
        );
        travelZ = THREE.MathUtils.lerp(
          waterDirectionZ,
          baitDirectionZ,
          approach,
        );
      }
      if (flying) {
        const flyingIndex = index - school.waterCount;
        const schoolIndex = Math.floor(
          flyingIndex / flyingFishPerShard,
        );
        const member = flyingIndex % flyingFishPerShard;
        const schoolDirection = schoolIndex % 2 === 0 ? 1 : -1;
        const angle =
          motionTime *
            (0.18 + (schoolIndex % 4) * 0.012) *
            schoolDirection +
          schoolIndex * 1.087 +
          member * 0.075;
        const radiusX = 6.3 + (schoolIndex % 3) * 1.05;
        const radiusZ =
          5.1 + ((schoolIndex + 1) % 3) * 0.92;
        const flightX =
          Math.cos(angle) * radiusX +
          Math.sin(angle * 2.1 + schoolIndex * 0.4) * 1.15;
        const flightY =
          1.72 +
          (schoolIndex % 3) * 0.56 +
          (member - 2) * 0.12 +
          Math.sin(angle * 2.3 + member * 0.52) * 0.62;
        const flightZ =
          -1.8 +
          Math.sin(angle) * radiusZ +
          Math.cos(angle * 1.7 + schoolIndex * 0.32) * 0.95;
        school.dummy.position.lerp(
          this.tempWorld.set(flightX, flightY, flightZ),
          flightBlend,
        );
        const flightDirectionX =
          schoolDirection *
          (-Math.sin(angle) * radiusX +
            Math.cos(angle * 2.1 + schoolIndex * 0.4) *
              2.415);
        const flightDirectionY =
          schoolDirection *
          Math.cos(angle * 2.3 + member * 0.52) *
          1.426;
        const flightDirectionZ =
          schoolDirection *
          (Math.cos(angle) * radiusZ -
            Math.sin(angle * 1.7 + schoolIndex * 0.32) *
              1.615);
        travelX = THREE.MathUtils.lerp(
          waterDirectionX,
          flightDirectionX,
          flightBlend,
        );
        travelY = flightDirectionY * flightBlend;
        travelZ = THREE.MathUtils.lerp(
          waterDirectionZ,
          flightDirectionZ,
          flightBlend,
        );
        const recall = school.magicRecalls.find(
          (candidate) => candidate.schoolIndex === schoolIndex,
        );
        const origin = recall?.origins[member];
        const waterTarget = recall?.waterTargets[member];
        if (recall && origin && waterTarget) {
          recallProgress = THREE.MathUtils.clamp(
            recall.age / recall.duration,
            0,
            1,
          );
          const fall = THREE.MathUtils.smoothstep(
            recallProgress,
            0.26,
            0.94,
          );
          const remainingMagic =
            1 -
            THREE.MathUtils.smoothstep(
              recallProgress,
              0.02,
              0.54,
            );
          const wobble =
            Math.sin(
              recallProgress * Math.PI * 9 +
                member * 1.47,
            ) *
            0.18 *
            remainingMagic;
          school.dummy.position.set(
            THREE.MathUtils.lerp(origin.x, waterTarget.x, fall) +
              wobble,
            THREE.MathUtils.lerp(origin.y, waterTarget.y, fall) +
              Math.sin(fall * Math.PI) * 0.32 +
              Math.cos(
                recallProgress * Math.PI * 11 + member,
              ) *
                0.1 *
                remainingMagic,
            THREE.MathUtils.lerp(origin.z, waterTarget.z, fall) -
              wobble * 0.72,
          );
          travelX = waterTarget.x - origin.x;
          travelY = waterTarget.y - origin.y;
          travelZ = waterTarget.z - origin.z;
        }
      }
      let spellSwarmBlend = 0;
      if (
        recallProgress < 0 &&
        spellSwarmEnvelope > 0 &&
        school.spellSwarmRadius > 0
      ) {
        const centerDx =
          school.spellSwarmCenter.x - school.dummy.position.x;
        const centerDz =
          school.spellSwarmCenter.z - school.dummy.position.z;
        const centerDistance = Math.hypot(centerDx, centerDz);
        if (centerDistance < school.spellSwarmRadius) {
          const proximity = THREE.MathUtils.smoothstep(
            1 - centerDistance / school.spellSwarmRadius,
            0,
            1,
          );
          spellSwarmBlend =
            spellSwarmEnvelope *
            school.spellSwarmStrength *
            (0.28 + proximity * 0.72);
          const swirlDirection = index % 2 === 0 ? 1 : -1;
          const swirlAngle =
            index * 2.39996 +
            school.spellSwarmAge *
              (flying ? 2.1 : 1.35) *
              swirlDirection;
          const swirlRadius =
            (flying ? 1.08 : 0.68) + (index % 4) * 0.12;
          const targetX =
            school.spellSwarmCenter.x +
            Math.cos(swirlAngle) * swirlRadius;
          const targetY = flying
            ? school.spellSwarmCenter.y +
              0.9 +
              (index % 5) * 0.16 +
              Math.sin(swirlAngle * 1.7) * 0.18
            : 0.31;
          const targetZ =
            school.spellSwarmCenter.z +
            Math.sin(swirlAngle) * swirlRadius;
          const swarmTravelX = targetX - school.dummy.position.x;
          const swarmTravelY = targetY - school.dummy.position.y;
          const swarmTravelZ = targetZ - school.dummy.position.z;
          school.dummy.position.lerp(
            this.tempWorld.set(targetX, targetY, targetZ),
            spellSwarmBlend,
          );
          travelX = THREE.MathUtils.lerp(
            travelX,
            swarmTravelX,
            spellSwarmBlend,
          );
          travelY = THREE.MathUtils.lerp(
            travelY,
            swarmTravelY,
            spellSwarmBlend,
          );
          travelZ = THREE.MathUtils.lerp(
            travelZ,
            swarmTravelZ,
            spellSwarmBlend,
          );
        }
      }
      const horizontalTravel = Math.max(
        0.001,
        Math.hypot(travelX, travelZ),
      );
      school.dummy.rotation.set(
        Math.atan2(-travelY, horizontalTravel),
        Math.atan2(travelX, travelZ),
        flying
          ? Math.sin(motionTime * 0.9 + index) * 0.12 * flightBlend
          : 0,
      );
      if (recallProgress >= 0) {
        const flop = THREE.MathUtils.smoothstep(
          recallProgress,
          0.28,
          0.9,
        );
        school.dummy.rotation.x +=
          Math.sin(recallProgress * Math.PI * 5 + index) *
          (1 - flop) *
          0.34;
        school.dummy.rotation.z += flop * Math.PI * 0.47;
      }
      const scale = 0.72 + (index % 4) * 0.1;
      const returnFade =
        recallProgress < 0
          ? 1
          : 1 -
            THREE.MathUtils.smoothstep(
              recallProgress,
              0.88,
              1,
            );
      school.dummy.scale.setScalar(scale * returnFade);
      school.dummy.updateMatrix();
      school.mesh.setMatrixAt(index, school.dummy.matrix);
      school.positions[index]?.copy(school.dummy.position);
      if (flying) {
        school.dummy.scale.setScalar(
          scale *
            returnFade *
            (1.22 +
              Math.sin(motionTime * 2.7 + index * 1.4) * 0.12 +
              spellSwarmBlend * 0.18) *
            (recallProgress < 0
              ? 1
              : 1 -
                THREE.MathUtils.smoothstep(
                  recallProgress,
                  0.02,
                  0.62,
                )),
        );
        school.dummy.updateMatrix();
        school.aura.setMatrixAt(index, school.dummy.matrix);
      } else {
        school.dummy.scale.setScalar(0);
        school.dummy.updateMatrix();
        school.aura.setMatrixAt(index, school.dummy.matrix);
      }
    }
    school.mesh.instanceMatrix.needsUpdate = true;
    if (school.flyingCount > 0) {
      school.aura.instanceMatrix.needsUpdate = true;
    }
    this.updateFlyingFishMagicParticles(school);
    this.finishFlyingFishMagicRecalls(school);
    this.tryFeedFishShard(school);
  }

  private recallFlyingFishMagic(
    target: THREE.Vector3,
    color: THREE.Color,
    maximumSchools: number,
    duration: number,
  ): number {
    const school = this.fishSchool;
    if (!school || maximumSchools <= 0) return 0;

    const targetColor = color.getHex();
    const motionTime = this.elapsed * (this.reduceMotion ? 0.28 : 1);
    let recalled = 0;
    for (
      let schoolIndex = 0;
      schoolIndex < this.fallsFlyingFishSchoolColors.length &&
      recalled < maximumSchools;
      schoolIndex += 1
    ) {
      if (
        this.fallsFlyingFishSchoolColors[schoolIndex] !== targetColor ||
        school.magicRecalls.some(
          (candidate) => candidate.schoolIndex === schoolIndex,
        )
      ) {
        continue;
      }

      const origins: THREE.Vector3[] = [];
      const waterTargets: THREE.Vector3[] = [];
      for (let member = 0; member < flyingFishPerShard; member += 1) {
        const fishIndex =
          school.waterCount +
          schoolIndex * flyingFishPerShard +
          member;
        const renderedPosition = school.positions[fishIndex];
        const origin =
          renderedPosition && renderedPosition.lengthSq() > 0.01
            ? renderedPosition.clone()
            : new THREE.Vector3();
        if (origin.lengthSq() <= 0.01) {
          const schoolDirection = schoolIndex % 2 === 0 ? 1 : -1;
          const angle =
            motionTime *
              (0.18 + (schoolIndex % 4) * 0.012) *
              schoolDirection +
            schoolIndex * 1.087 +
            member * 0.075;
          const radiusX = 6.3 + (schoolIndex % 3) * 1.05;
          const radiusZ =
            5.1 + ((schoolIndex + 1) % 3) * 0.92;
          origin.set(
            Math.cos(angle) * radiusX +
              Math.sin(angle * 2.1 + schoolIndex * 0.4) * 1.15,
            1.72 +
              (schoolIndex % 3) * 0.56 +
              (member - 2) * 0.12 +
              Math.sin(angle * 2.3 + member * 0.52) * 0.62,
            -1.8 +
              Math.sin(angle) * radiusZ +
              Math.cos(angle * 1.7 + schoolIndex * 0.32) * 0.95,
          );
        }
        origins.push(origin);

        const riverProgress =
          0.18 +
          ((schoolIndex * flyingFishPerShard + member) * 0.113) %
            0.66;
        const waterTarget = new THREE.Vector3();
        const waterTangent = new THREE.Vector3();
        fallsRiverCurve.getPointAt(riverProgress, waterTarget);
        fallsRiverCurve.getTangentAt(
          riverProgress,
          waterTangent,
        );
        const spread = (member - 2) * 0.24;
        waterTarget.x -= waterTangent.z * spread;
        waterTarget.y = 0.31;
        waterTarget.z += waterTangent.x * spread;
        waterTargets.push(waterTarget);
      }

      school.magicRecalls.push({
        schoolIndex,
        target: target.clone(),
        origins,
        waterTargets,
        color: color.clone(),
        age: 0,
        duration: Math.max(0.18, duration),
      });
      recalled += 1;
    }
    school.magicPoints.visible = school.magicRecalls.length > 0;
    return recalled;
  }

  private updateFlyingFishMagicParticles(school: FishSchool): void {
    let pointCount = 0;
    for (const recall of school.magicRecalls) {
      const progress = THREE.MathUtils.clamp(
        recall.age / recall.duration,
        0,
        1,
      );
      const emission =
        1 - THREE.MathUtils.smoothstep(progress, 0.7, 0.98);
      if (emission <= 0.002) continue;

      for (
        let member = 0;
        member < flyingFishPerShard;
        member += 1
      ) {
        const fishIndex =
          school.waterCount +
          recall.schoolIndex * flyingFishPerShard +
          member;
        const start =
          school.positions[fishIndex] ?? recall.origins[member];
        if (!start) continue;
        for (
          let particle = 0;
          particle < fishMagicParticlesPerFish;
          particle += 1
        ) {
          const phase =
            progress * 2.65 -
            member * 0.035 -
            particle * 0.19;
          if (phase < 0) continue;
          const travel = phase - Math.floor(phase);
          const fade =
            Math.sin(travel * Math.PI) * emission;
          if (
            fade <= 0.015 ||
            pointCount >= maximumFishMagicParticleCount
          ) {
            continue;
          }

          const inverse = 1 - travel;
          const lateral =
            Math.sin(
              travel * Math.PI * 2 +
                member * 1.7 +
                particle,
            ) *
            0.24 *
            inverse;
          const controlX =
            (start.x + recall.target.x) * 0.5 +
            Math.sin(member * 2.1 + particle) * 0.58;
          const controlY =
            Math.max(start.y, recall.target.y) +
            1.05 +
            member * 0.04;
          const controlZ =
            (start.z + recall.target.z) * 0.5 +
            Math.cos(member * 1.9 + particle) * 0.58;
          const offset = pointCount * 3;
          school.magicPositions[offset] =
            inverse * inverse * start.x +
            2 * inverse * travel * controlX +
            travel * travel * recall.target.x +
            lateral;
          school.magicPositions[offset + 1] =
            inverse * inverse * start.y +
            2 * inverse * travel * controlY +
            travel * travel * recall.target.y;
          school.magicPositions[offset + 2] =
            inverse * inverse * start.z +
            2 * inverse * travel * controlZ +
            travel * travel * recall.target.z -
            lateral * 0.7;
          const whitening = travel * 0.72;
          school.magicColors[offset] =
            THREE.MathUtils.lerp(
              recall.color.r,
              1,
              whitening,
            ) * fade;
          school.magicColors[offset + 1] =
            THREE.MathUtils.lerp(
              recall.color.g,
              1,
              whitening,
            ) * fade;
          school.magicColors[offset + 2] =
            THREE.MathUtils.lerp(
              recall.color.b,
              1,
              whitening,
            ) * fade;
          pointCount += 1;
        }
      }
    }

    school.magicPoints.geometry.setDrawRange(0, pointCount);
    school.magicPoints.visible = pointCount > 0;
    if (pointCount === 0) return;
    (
      school.magicPoints.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      school.magicPoints.geometry.getAttribute(
        "color",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  private finishFlyingFishMagicRecalls(school: FishSchool): void {
    let changed = false;
    while (true) {
      let recall: FlyingFishMagicRecall | null = null;
      for (const candidate of school.magicRecalls) {
        if (
          candidate.age >= candidate.duration &&
          (!recall || candidate.schoolIndex > recall.schoolIndex)
        ) {
          recall = candidate;
        }
      }
      if (!recall) break;
      changed = true;
      const schoolIndex = recall.schoolIndex;
      if (
        schoolIndex < 0 ||
        schoolIndex >= this.fallsFlyingFishSchoolColors.length
      ) {
        school.magicRecalls.splice(
          school.magicRecalls.indexOf(recall),
          1,
        );
        continue;
      }
      const firstFish =
        school.waterCount + schoolIndex * flyingFishPerShard;
      const previousFlyingCount = school.flyingCount;
      const finalFlyingIndex =
        school.waterCount + previousFlyingCount;
      for (
        let fishIndex = firstFish;
        fishIndex < finalFlyingIndex - flyingFishPerShard;
        fishIndex += 1
      ) {
        school.flightAges[fishIndex] =
          school.flightAges[fishIndex + flyingFishPerShard] ?? 0;
      }
      school.flightAges.fill(
        0,
        finalFlyingIndex - flyingFishPerShard,
        finalFlyingIndex,
      );
      school.flyingCount = Math.max(
        0,
        previousFlyingCount - flyingFishPerShard,
      );
      this.fallsFlyingFishSchoolColors.splice(schoolIndex, 1);
      const recallIndex = school.magicRecalls.indexOf(recall);
      if (recallIndex >= 0) {
        school.magicRecalls.splice(recallIndex, 1);
      }
      for (const remaining of school.magicRecalls) {
        if (remaining.schoolIndex > schoolIndex) {
          remaining.schoolIndex -= 1;
        }
      }
    }
    if (!changed) return;

    for (
      let schoolIndex = 0;
      schoolIndex < this.fallsFlyingFishSchoolColors.length;
      schoolIndex += 1
    ) {
      this.colorFlyingFishSchool(
        school,
        schoolIndex,
        this.fallsFlyingFishSchoolColors[schoolIndex] ?? 0xc79cff,
      );
    }
    const renderCount = this.getFishRenderCount(school);
    school.mesh.count = renderCount;
    school.aura.count = renderCount;
    school.aura.visible = school.flyingCount > 0;
    school.magicPoints.visible = school.magicRecalls.length > 0;
    if (
      this.fallsFlyingFishSchoolColors.length <
      maximumFlyingFishSchools
    ) {
      this.fallsFishFeastAnnounced = false;
    }
  }

  private updateFishBaitTarget(
    school: FishSchool,
    delta: number,
  ): FallsFishBaitShard | null {
    const sources = this.fallsRuneRitual.getFishBaitSources();
    const isFishable = (shard: FallsFishBaitShard): boolean => {
      const proxy = shard.proxy;
      const kickable = shard.kickable;
      return (
        shard.fishBaitEligible &&
        !shard.consumed &&
        proxy?.visible === true &&
        kickable?.enabled === true &&
        kickable !== this.heldKickable &&
        proxy.position.y <= 1.05 &&
        isInsideFallsRiver(proxy.position.x, proxy.position.z)
      );
    };

    if (
      !this.fishBaitShard ||
      !isFishable(this.fishBaitShard)
    ) {
      if (this.fishBaitShard) this.fishBaitShard.fishBaitAge = 0;
      this.fishBaitShard = null;
      this.fishBaitFishIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const source of sources) {
        if (!source.broken) continue;
        for (const shard of source.shards) {
          if (!isFishable(shard) || !shard.proxy) continue;
          for (
            let index = 0;
            index < Math.min(school.waterCount, school.mesh.count);
            index += 1
          ) {
            const fishPosition = school.positions[index];
            if (!fishPosition) continue;
            const distance =
              (fishPosition.x - shard.proxy.position.x) ** 2 +
              (fishPosition.z - shard.proxy.position.z) ** 2;
            if (distance >= nearestDistance) continue;
            nearestDistance = distance;
            this.fishBaitShard = shard;
            this.fishBaitFishIndex = index;
          }
        }
      }
    }

    const target = this.fishBaitShard;
    if (!target || this.fishBaitFishIndex < 0) return null;
    target.fishBaitAge = this.reduceMotion
      ? 1
      : Math.min(1, target.fishBaitAge + delta);
    return target;
  }

  private tryFeedFishShard(school: FishSchool): void {
    const sources = this.fallsRuneRitual.getFishBaitSources();
    for (const source of sources) {
      if (!source.broken) continue;
      for (const shard of source.shards) {
        const proxy = shard.proxy;
        const kickable = shard.kickable;
        if (
          !shard.fishBaitEligible ||
          shard.consumed ||
          !proxy?.visible ||
          !kickable?.enabled ||
          kickable === this.heldKickable ||
          proxy.position.y > 1.05 ||
          !isInsideFallsRiver(proxy.position.x, proxy.position.z)
        ) {
          continue;
        }
        let closeToFish = false;
        for (
          let index = 0;
          index < Math.min(school.waterCount, school.mesh.count);
          index += 1
        ) {
          const position = school.positions[index];
          if (
            position &&
            (position.x - proxy.position.x) ** 2 +
                (position.z - proxy.position.z) ** 2 <
              1.35 * 1.35
          ) {
            closeToFish = true;
            break;
          }
        }
        if (!closeToFish && shard.fishBaitAge < 0.62) continue;

        const feedingPosition = proxy.position.clone();
        this.cancelTelekinesisHold(kickable);
        shard.consumed = true;
        shard.fishBaitAge = 0;
        kickable.enabled = false;
        kickable.velocity.set(0, 0, 0);
        proxy.visible = false;
        if (this.fishBaitShard === shard) {
          this.fishBaitShard = null;
          this.fishBaitFishIndex = -1;
        }
        const schoolIndex =
          this.fallsFlyingFishSchoolColors.length;
        const createsFlyingSchool =
          schoolIndex < maximumFlyingFishSchools;
        if (createsFlyingSchool) {
          this.fallsFlyingFishSchoolColors.push(
            source.color.getHex(),
          );
          const firstFlyingIndex =
            school.waterCount + school.flyingCount;
          school.flyingCount = Math.min(
            school.maximumCount - school.waterCount,
            school.flyingCount + flyingFishPerShard,
          );
          for (
            let index = firstFlyingIndex;
            index < school.waterCount + school.flyingCount;
            index += 1
          ) {
            school.flightAges[index] =
              -(index - firstFlyingIndex) * 0.11;
          }
          this.colorFlyingFishSchool(
            school,
            schoolIndex,
            source.color,
          );
          school.aura.visible = true;
        }
        this.fallsRuneRitual.triggerTinkleAt(
          feedingPosition,
          source.color,
          7,
          1.85,
        );
        const airborneCount = school.flyingCount;
        if (!createsFlyingSchool) {
          if (!this.fallsFishFeastAnnounced) {
            this.fallsFishFeastAnnounced = true;
            this.hooks.onStatus(
              "The airborne shoal is already vast. The river fish keep eating every offered facet anyway.",
            );
          }
        } else if (schoolIndex === 0) {
          this.hooks.onStatus(
            "A fish swallows the shining facet. Five bright companions peel away from the river and learn to swim through air.",
            { kind: "achievement", title: "SCHOOL OF MAGIC" },
          );
        } else {
          this.hooks.onStatus(
            `Another facet vanishes beneath the water. Five more fish rise in its colour; ${airborneCount} now swim through the air.`,
          );
        }
        return;
      }
    }
  }

  private createFallsRiver(
    parent: THREE.Group,
    visuals: FallsVisualMaterials,
  ): void {
    const createRibbon = (
      material: THREE.Material,
      y: number,
      bankPadding: number,
      name: string,
    ): THREE.Mesh => {
      const ribbon = new THREE.Mesh(
        createFallsRiverRibbonGeometry(y, bankPadding),
        material,
      );
      ribbon.name = name;
      ribbon.castShadow = false;
      ribbon.receiveShadow = true;
      parent.add(ribbon);
      return ribbon;
    };

    createRibbon(visuals.groundDark, 0.145, 0.3, "falls-riverbank");
    const water = createRibbon(
      visuals.water,
      0.205,
      0,
      "falls-river-water",
    );
    water.renderOrder = 1;
    const spillMaterial = visuals.water.clone();
    spillMaterial.name = "falls-river-void-cascade-material";
    spillMaterial.vertexColors = true;
    spillMaterial.transparent = true;
    spillMaterial.depthWrite = false;
    const spill = new THREE.Mesh(createFallsRiverSpillGeometry(), spillMaterial);
    spill.name = "falls-river-void-cascade";
    spill.castShadow = false;
    spill.renderOrder = 1;
    parent.add(spill);
    this.animatedItems.push({
      object: water,
      originY: water.position.y,
      phase: 0,
      amplitude: 0,
      rotationSpeed: 0,
      texture: visuals.flowTexture,
      textureVelocity: [0.018, -0.16],
    });
  }

  private createFallsVegetation(parent: THREE.Group): void {
    const glowberryPositions: THREE.Vector3[] = [];
    const glowberryColors: THREE.Color[] = [];
    const glowberryStemPositions: number[] = [];
    const plumCanopy = new THREE.MeshStandardMaterial({
      name: "falls-plum-tree-canopy",
      color: 0x655274,
      roughness: 0.94,
      flatShading: true,
    });
    const mauveCanopy = new THREE.MeshStandardMaterial({
      name: "falls-mauve-tree-canopy",
      color: 0x917499,
      roughness: 0.94,
      flatShading: true,
    });
    const trees = [
      // Frame inhabited terraces from their outer edges. The socket circles,
      // crystal bundle, stair mouths, and return aperture stay in open view.
      [-12.2, 3.4, 0.94],
      [10.7, -0.3, 0.9],
      [-12.55, -6.6, 0.94],
      [1.3, -12.4, 0.88],
      [-5.0, 11.6, 0.87],
      [13.7, 4.0, 0.8],
      [8.0, -1.55, 0.68],
      [-0.5, -11.9, 0.78],
      [14.1, 0.8, 0.76],
      [-10.6, 9.5, 0.86],
    ] as const;
    const treeCount =
      this.quality === "low" ? 6 : this.quality === "medium" ? 8 : trees.length;
    for (const [index, [x, z, scale]] of trees.slice(0, treeCount).entries()) {
      const treeScale = scale * 2.08;
      const group = new THREE.Group();
      group.position.set(x, getFallsTerraceHeight(x, z), z);
      group.rotation.y = index * 0.73;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.16 * treeScale,
          0.27 * treeScale,
          1.85 * treeScale,
          6,
        ),
        this.materials.wood,
      );
      trunk.position.y = 0.92 * treeScale;
      trunk.rotation.z = (index % 2 === 0 ? -1 : 1) * 0.055;
      trunk.castShadow = false;
      trunk.receiveShadow = true;
      group.add(trunk);

      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.07 * treeScale,
          0.11 * treeScale,
          0.92 * treeScale,
          5,
        ),
        this.materials.wood,
      );
      branch.position.set(
        (index % 2 === 0 ? -0.28 : 0.28) * treeScale,
        1.43 * treeScale,
        0,
      );
      branch.rotation.z = (index % 2 === 0 ? -1 : 1) * 0.92;
      branch.castShadow = false;
      group.add(branch);

      for (const [layer, [radius, y, material]] of (
        [
          [0.88, 1.75, index % 3 === 1 ? this.materials.mossDark : plumCanopy],
          [0.72, 2.42, index % 3 === 1 ? this.materials.moss : mauveCanopy],
        ] as const
      ).entries()) {
        const crown = new THREE.Mesh(
          new THREE.DodecahedronGeometry(radius * treeScale, 0),
          material,
        );
        crown.position.set(
          (layer === 0 ? -0.12 : 0.15) * treeScale,
          y * treeScale,
          (index % 3 - 1) * 0.08,
        );
        crown.scale.set(1.05, layer === 0 ? 0.78 : 0.9, 0.94);
        crown.rotation.set(0.08 * layer, index * 0.37, -0.05 * index);
        crown.castShadow = false;
        crown.receiveShadow = true;
        crown.userData.clickNavigationPassThrough = true;
        group.add(crown);
      }
      parent.add(group);
      group.updateWorldMatrix(true, true);
      const berryColorValues = [
        palette.amber,
        palette.amber,
        palette.coral,
        palette.violet,
        palette.amber,
        palette.cyan,
      ] as const;
      for (let berry = 0; berry < 4; berry += 1) {
        const localBerry = new THREE.Vector3(
          (-0.48 + berry * 0.31 + (index % 2) * 0.08) * treeScale,
          (1.28 + (berry % 2) * 0.34) * treeScale,
          ((berry % 3) - 1) * 0.22 * treeScale,
        );
        const localStem = localBerry
          .clone()
          .add(new THREE.Vector3(0, 0.28 * treeScale, 0));
        group.localToWorld(localBerry);
        group.localToWorld(localStem);
        glowberryPositions.push(localBerry);
        glowberryColors.push(
          new THREE.Color(
            berryColorValues[(index + berry) % berryColorValues.length]!,
          ),
        );
        glowberryStemPositions.push(
          localStem.x,
          localStem.y,
          localStem.z,
          localBerry.x,
          localBerry.y,
          localBerry.z,
        );
      }
      this.registerPlayerOccluder(group);
      // Keep side collision close to the solid trunk. The leafy crown is a
      // separate landing surface: a high descending jump settles on top rather
      // than inside it, without making the full canopy an oversized wall.
      this.registerClimbableBox(
        trunk,
        null,
        undefined,
        undefined,
        false,
      );
      this.tempBounds.setFromObject(group);
      const crownTop = this.tempBounds.max.y;
      this.tempWorld
        .set(
          0.15 * treeScale,
          0,
          (index % 3 - 1) * 0.08,
        )
        .applyMatrix4(group.matrixWorld);
      this.addSurfaceArea({
        id: `falls-tree-crown-${index}`,
        x: this.tempWorld.x,
        z: this.tempWorld.z,
        halfWidth: 0.48 * treeScale,
        halfDepth: 0.48 * treeScale,
        requiresJump: true,
        supportMargin: 0.08,
        edgeGrace: 0.1,
        heightAt: () => crownTop,
      });
    }

    const glowberryMaterial = new THREE.MeshBasicMaterial({
      // InstancedMesh supplies instanceColor itself. Enabling vertexColors
      // also multiplies by a missing geometry colour attribute, turning black.
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glowberries = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.15, 0),
      glowberryMaterial,
      glowberryPositions.length,
    );
    glowberries.name = "falls-hanging-glowberries";
    glowberries.userData.clickNavigationPassThrough = true;
    glowberries.frustumCulled = false;
    glowberries.renderOrder = 4;
    const berryDummy = new THREE.Object3D();
    for (const [index, position] of glowberryPositions.entries()) {
      berryDummy.position.copy(position);
      const scale = 0.78 + (index % 4) * 0.09;
      berryDummy.scale.set(scale, 1.24 * scale, scale);
      berryDummy.rotation.set(index * 0.31, index * 0.77, index * 0.19);
      berryDummy.updateMatrix();
      glowberries.setMatrixAt(index, berryDummy.matrix);
      glowberries.setColorAt(index, glowberryColors[index]!);
    }
    glowberries.instanceMatrix.needsUpdate = true;
    if (glowberries.instanceColor) {
      glowberries.instanceColor.needsUpdate = true;
    }
    parent.add(glowberries);

    const glowberryStems = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(glowberryStemPositions, 3),
      ),
      new THREE.LineBasicMaterial({
        color: 0x294a37,
        transparent: true,
        opacity: 0.82,
      }),
    );
    glowberryStems.name = "falls-glowberry-hanging-stems";
    parent.add(glowberryStems);

    const bushes = [
      [-10.7, 4.0, 0.8],
      [5.0, 8.5, 0.85],
      [-8.7, 8.2, 0.9],
      [4.1, -6.3, 0.7],
      [10.5, -6.2, 1],
      [11.8, 2.9, 1],
      [-11.4, 6.9, 1],
      [11.0, 7.4, 0.8],
      [-7.8, 10.3, 1],
      [10.9, 10.45, 1],
      [-10.7, -2.8, 0.65],
      [5.0, 2.9, 0.7],
      [-8.1, -11.2, 1],
      [8.2, -11.35, 1],
      [-12.8, 1.6, 1],
      [12.7, 1.5, 1],
      [-3.7, 9.3, 0.9],
      [8.9, -6.1, 0.7],
    ] as const;
    const bushCount =
      this.quality === "low" ? 10 : this.quality === "medium" ? 14 : 18;
    const glowBudGeometry = new THREE.OctahedronGeometry(0.115, 0);
    const glowBudMaterials = [
      new THREE.MeshBasicMaterial({
        color: palette.amber,
        toneMapped: false,
      }),
      new THREE.MeshBasicMaterial({
        color: palette.coral,
        toneMapped: false,
      }),
      new THREE.MeshBasicMaterial({
        color: palette.violet,
        toneMapped: false,
      }),
    ] as const;
    for (const [index, [x, z, scale]] of bushes
      .slice(0, bushCount)
      .entries()) {
      const group = new THREE.Group();
      group.position.set(x, getFallsTerraceHeight(x, z), z);
      group.userData.clickNavigationPassThrough = true;
      for (let lobe = 0; lobe < 3; lobe += 1) {
        const radius =
          (0.34 + ((index + lobe) % 3) * 0.07) * scale;
        const leaf = new THREE.Mesh(
          new THREE.DodecahedronGeometry(radius, 0),
          (index + lobe) % 2 === 0
            ? this.materials.moss
            : this.materials.mossDark,
        );
        leaf.position.set(
          (lobe - 1) * 0.34 * scale,
          (0.28 + (lobe % 2) * 0.13) * scale,
          Math.sin(index + lobe) * 0.22 * scale,
        );
        leaf.scale.y = 0.7;
        leaf.rotation.y = index * 0.4 + lobe;
        leaf.castShadow = false;
        leaf.receiveShadow = true;
        group.add(leaf);
      }
      if (index < (this.quality === "low" ? 5 : 10)) {
        for (let bud = 0; bud < 3; bud += 1) {
          const glowBud = new THREE.Mesh(
            glowBudGeometry,
            glowBudMaterials[(index + bud) % glowBudMaterials.length]!,
          );
          glowBud.position.set(
            (bud - 1) * 0.34 * scale,
            (0.62 + (bud % 2) * 0.14) * scale,
            (bud % 2 === 0 ? -0.14 : 0.18) * scale,
          );
          glowBud.scale.setScalar(0.92 + bud * 0.09);
          glowBud.rotation.set(bud * 0.24, index * 0.61, bud * 0.19);
          glowBud.castShadow = false;
          group.add(glowBud);
        }
      }
      parent.add(group);
    }

    this.createFallsMushroomGrove(parent);

    const vines = [
      [-7.35, 7.85, -5.72, 3.4, -0.18],
      [-3.65, 7.85, -5.72, 4.2, 0.1],
      [-11.85, 5.25, -3.2, 2.2, 0.12],
      [-8.25, 5.25, -3.2, 2.7, -0.16],
    ] as const;
    const vineCount =
      this.quality === "low" ? 4 : this.quality === "medium" ? 6 : vines.length;
    for (const [index, [x, topY, z, length, lean]] of vines
      .slice(0, vineCount)
      .entries()) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.clickNavigationPassThrough = true;
      const segmentLength = length / 3;
      for (let segment = 0; segment < 3; segment += 1) {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.045, segmentLength + 0.08, 5),
          this.materials.mossDark,
        );
        stem.position.set(
          lean * segment * 0.34,
          topY - segmentLength * (segment + 0.5),
          0,
        );
        stem.rotation.z =
          -lean * 0.34 + Math.sin(index * 1.7 + segment) * 0.055;
        stem.castShadow = false;
        group.add(stem);

        if (segment > 0 || index % 2 === 0) {
          const leaf = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.1 + (segment % 2) * 0.025, 0),
            this.materials.moss,
          );
          leaf.position.set(
            lean * segment * 0.34 + (segment % 2 === 0 ? -0.11 : 0.11),
            topY - segmentLength * (segment + 0.72),
            0.025,
          );
          leaf.scale.set(1.25, 0.58, 0.72);
          leaf.castShadow = false;
          group.add(leaf);
        }
      }
      parent.add(group);
    }
  }

  private createFallsMushroomGrove(parent: THREE.Group): void {
    const authoredMushrooms = [
      [-8.9, 6.35, 0.95, palette.amber, "warm"],
      [-8.25, 6.05, 0.62, palette.coral, "warm"],
      [-10.1, 5.65, 0.72, palette.violet, "mystic"],
      [5.9, 5.15, 0.88, palette.amber, "warm"],
      [6.55, 4.85, 0.58, palette.violet, "mystic"],
      [10.85, 4.3, 0.72, palette.coral, "warm"],
      [-10.75, -2.35, 0.82, palette.amber, "warm"],
      [-10.45, -3.05, 0.54, palette.violet, "mystic"],
      [9.15, -1.15, 0.86, palette.coral, "warm"],
      [9.8, -1.55, 0.55, palette.amber, "warm"],
      [-7.5, -4.05, 0.76, palette.violet, "mystic"],
      [-3.7, -4.05, 0.52, palette.amber, "warm"],
      [4.45, -5.65, 0.78, palette.cyan, "mystic"],
      [5.05, -5.25, 0.54, palette.amber, "warm"],
      [-2.7, 6.75, 0.68, palette.amber, "warm"],
      [2.75, 6.9, 0.66, palette.violet, "mystic"],
      [-11.45, 1.25, 0.62, palette.coral, "warm"],
      [11.25, 0.8, 0.68, palette.amber, "warm"],
      [-6.15, 10.25, 0.58, palette.violet, "mystic"],
      [5.45, 10.1, 0.6, palette.amber, "warm"],
      [-7.55, -10.3, 0.64, palette.coral, "warm"],
      [7.65, -10.15, 0.64, palette.violet, "mystic"],
      [-1.8, -6.7, 0.56, palette.amber, "warm"],
      [2.15, -6.55, 0.58, palette.coral, "warm"],
    ] as const;
    const activeCount =
      this.quality === "low"
        ? 10
        : this.quality === "medium"
          ? 18
          : authoredMushrooms.length;
    const mushrooms = authoredMushrooms.slice(0, activeCount);
    const stemMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8b88d,
      toneMapped: false,
    });
    const capMaterial = new THREE.MeshBasicMaterial({
      // Colours belong to instances; the cap has no per-vertex colour data.
      toneMapped: false,
    });
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.048, 0.072, 0.32, 5),
      stemMaterial,
      mushrooms.length,
    );
    stems.name = "falls-mystic-mushroom-stems";
    stems.userData.clickNavigationPassThrough = true;
    const caps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(
        0.28,
        7,
        4,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      capMaterial,
      mushrooms.length,
    );
    caps.name = "falls-mystic-mushroom-caps";
    caps.userData.clickNavigationPassThrough = true;
    caps.renderOrder = 3;
    const dummy = new THREE.Object3D();
    for (const [index, [x, z, scale, color]] of mushrooms.entries()) {
      const terraceY = getFallsTerraceHeight(x, z);
      const groundY = terraceY > 0 ? terraceY + 0.025 : 0.145;
      dummy.position.set(x, groundY + 0.16 * scale, z);
      dummy.rotation.set(0, index * 0.71, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      stems.setMatrixAt(index, dummy.matrix);

      dummy.position.y = groundY + 0.3 * scale;
      dummy.rotation.set(0, index * 0.93, 0);
      dummy.scale.set(scale, scale * 0.68, scale);
      dummy.updateMatrix();
      caps.setMatrixAt(index, dummy.matrix);
      caps.setColorAt(index, new THREE.Color(color));
    }
    stems.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    parent.add(stems, caps);

    const addGlowPools = (
      name: string,
      glow: "warm" | "mystic",
      color: THREE.ColorRepresentation,
      opacity: number,
    ): void => {
      const matching = mushrooms.filter((mushroom) => mushroom[4] === glow);
      if (matching.length === 0) return;
      const material = this.materials.warmLightPool.clone();
      material.name = `${name}-material`;
      material.uniforms.color!.value.set(color);
      material.uniforms.opacity!.value = opacity;
      const pools = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        material,
        matching.length,
      );
      pools.name = name;
      pools.frustumCulled = false;
      pools.renderOrder = 1;
      for (const [index, [x, z, scale]] of matching.entries()) {
        const terraceY = getFallsTerraceHeight(x, z);
        const groundY = terraceY > 0 ? terraceY + 0.025 : 0.145;
        dummy.position.set(x, groundY + 0.012, z);
        dummy.rotation.set(-Math.PI / 2, 0, index * 0.47);
        dummy.scale.set(1.45 * scale, 1.2 * scale, 1);
        dummy.updateMatrix();
        pools.setMatrixAt(index, dummy.matrix);
      }
      pools.instanceMatrix.needsUpdate = true;
      parent.add(pools);
    };
    const poolOpacity =
      this.quality === "low" ? 0.1 : this.quality === "medium" ? 0.16 : 0.2;
    addGlowPools(
      "falls-warm-mushroom-ground-glow",
      "warm",
      0xff9e38,
      poolOpacity,
    );
    addGlowPools(
      "falls-violet-mushroom-ground-glow",
      "mystic",
      0xa276ff,
      poolOpacity * 0.78,
    );
  }

  private createWaterfall(
    parent: THREE.Group,
    x: number,
    z: number,
    height: number,
    hasCave: boolean,
    visuals: FallsVisualMaterials,
    waterBottom = 0,
  ): void {
    const group = new THREE.Group();
    group.name = hasCave
      ? "falls-central-waterfall"
      : `falls-side-waterfall-${x}`;
    group.position.set(x, 0, z);
    let rockMassIndex = 0;
    const addRockMass = (
      size: readonly [number, number, number],
      position: readonly [number, number, number],
      material: THREE.Material,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        createLayeredCliffGeometry(
          size[0],
          size[1],
          size[2],
          this.quality,
          x * 0.47 + height * 1.31 + rockMassIndex * 2.17,
        ),
        material,
      );
      rockMassIndex += 1;
      mesh.position.set(...position);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    if (hasCave) {
      // The cave shell is visually assembled from interlocking cliff masses,
      // but its crown is one continuous route. Let an ascending player clear
      // those vertical colliders shortly before reaching the roof instead of
      // requiring their feet to match several adjacent top planes exactly.
      const summitCollisionClearAbove = height + 0.15;
      for (const side of [-1, 1]) {
        const cavePillar = addRockMass(
          [1.1, height + 0.8, 2.5],
          [side * 1.55, (height + 0.8) / 2, -0.6],
          visuals.cliff,
        );
        this.registerClimbableBox(
          cavePillar,
          null,
          undefined,
          summitCollisionClearAbove,
        );
      }
      const caveCap = addRockMass(
        [2.1, 1.1, 2.5],
        [0, height + 0.25, -0.6],
        visuals.cliff,
      );
      this.registerClimbableBox(
        caveCap,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      this.addSurfaceArea({
        id: "falls-cave-summit",
        x,
        z: z - 1.46,
        halfWidth: 2.08,
        halfDepth: 2.105,
        requiresJump: true,
        supportMargin: 0.12,
        edgeGrace: 0.12,
        landingMessage: "Above the falls, three voices become one river.",
        heightAt: () => height + 0.8,
      });
      const caveFloor = addBox(
        group,
        [2.1, 0.18, 4],
        [0, fallsLandmarks.cave.floor + 0.14, -1.55],
        visuals.cliffDark,
      );
      shadeFallsStoneGeometry(caveFloor.geometry, 19);
      caveFloor.castShadow = false;
      const cavePlinth = addRockMass(
        [2.1, fallsLandmarks.cave.floor, 4],
        [0, fallsLandmarks.cave.floor / 2, -1.55],
        visuals.cliffDark,
      );
      this.registerClimbableBox(cavePlinth, null);
      const caveBack = addRockMass(
        [4.2, height + 0.8, 0.38],
        [0, (height + 0.8) / 2, -3.38],
        visuals.cliffDark,
      );
      this.registerClimbableBox(
        caveBack,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      for (const side of [-1, 1] as const) {
        const sideWall = addRockMass(
          [1.1, height + 0.8, 1.36],
          [side * 1.55, (height + 0.8) / 2, -2.52],
          visuals.cliff,
        );
        this.registerClimbableBox(
          sideWall,
          null,
          undefined,
          summitCollisionClearAbove,
        );
      }
      const rearRoof = addRockMass(
        [2.1, 0.32, 1.36],
        [0, height + 0.64, -2.52],
        visuals.cliff,
      );
      this.registerClimbableBox(
        rearRoof,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      addWaterfallCaveLining(group, height, visuals.cliffDark);
      this.addSurfaceArea({
        id: "falls-cave-floor",
        x,
        z: z - 1.55,
        halfWidth: 1.03,
        halfDepth: 1.98,
        requiresJump: true,
        heightAt: () => fallsLandmarks.cave.floor + 0.23,
      });
    } else {
      const cliff = addRockMass(
        [4.2, height + 0.8, 2.5],
        [0, (height + 0.8) / 2, -0.6],
        visuals.cliff,
      );
      this.registerClimbableBox(
        cliff,
        `falls-waterfall-crown-${x}`,
      );
    }

    addWaterfallOutcroppings(
      group,
      height,
      hasCave,
      {
        cliff: visuals.cliff,
        cliffDark: visuals.cliffDark,
        moss: visuals.ground,
        rock: visuals.rock,
        wetRock: visuals.wetRock,
      },
      x * 0.37 + height,
    );

    // The folds meet the spring at the crown, just forward of the structural
    // rock face so translucent layers cannot intersect the cap.
    const waterfallSheetTop = height + 0.78;
    const waterfallSheetDepth = 0.79;
    if (hasCave) {
      for (const side of [-1, 1] as const) {
        const material = visuals.water.clone();
        material.name = "falls-parting-waterfall-material";
        material.opacity = 0.78;
        // The player reveal material reads scene depth, so the parted
        // waterfall halves must contribute depth before that later pass.
        material.depthWrite = true;
        const panel = new THREE.Mesh(
          createWaterfallSheetGeometry(
            1.16,
            waterfallSheetTop - waterBottom,
            this.quality,
            x + side * 0.73,
          ),
          material,
        );
        panel.position.set(
          side * 0.575,
          waterBottom + (waterfallSheetTop - waterBottom) / 2,
          waterfallSheetDepth,
        );
        panel.userData.side = side;
        group.add(panel);
        this.fallsRuneRitual.registerWaterfallPanel(panel);
        this.registerPlayerOccluder(panel);
      }
    } else {
      const sheetHeight = waterfallSheetTop - waterBottom;
      const water = new THREE.Mesh(
        createWaterfallSheetGeometry(
          2.3,
          sheetHeight,
          this.quality,
          x * 0.47,
        ),
        visuals.water,
      );
      water.position.set(
        0,
        waterBottom + sheetHeight / 2,
        waterfallSheetDepth,
      );
      group.add(water);
      this.registerPlayerOccluder(water);
    }
    const baseFoam = new THREE.Mesh(
      new THREE.PlaneGeometry(hasCave ? 2.65 : 2.85, 0.72, 8, 2),
      visuals.foam,
    );
    baseFoam.name = hasCave
      ? "falls-central-waterfall-base-foam"
      : `falls-side-waterfall-base-foam-${x}`;
    baseFoam.position.set(0, waterBottom + (waterBottom > 0 ? 0.035 : 0.232), 0.88);
    baseFoam.rotation.x = -Math.PI / 2;
    baseFoam.rotation.z = x * 0.035;
    baseFoam.castShadow = false;
    baseFoam.receiveShadow = false;
    baseFoam.renderOrder = 2;
    group.add(baseFoam);
    const spring = new THREE.Mesh(
      new THREE.PlaneGeometry(hasCave ? 1.7 : 1.9, 2.1, 3, 4),
      visuals.water,
    );
    spring.name = "falls-crown-spring";
    spring.rotation.x = -Math.PI / 2;
    spring.position.set(0, height + 0.81, -0.16);
    spring.castShadow = false;
    group.add(spring);
    parent.add(group);
  }

  private acquireFieldCompass(kickable: Kickable): boolean {
    const state = this.compassProp;
    if (
      this.compassOwned ||
      !state ||
      state.kickable !== kickable
    ) {
      return false;
    }

    this.cancelTelekinesisHold(kickable);
    this.voidTurtleRide.releaseCargo(kickable);
    this.compassOwned = true;
    this.compassHeading = getCompassHeading(this.smoothedRotation);
    kickable.enabled = false;
    kickable.onPlatform = false;
    kickable.platform = null;
    kickable.velocity.set(0, 0, 0);
    const kickableIndex = this.kickables.indexOf(kickable);
    if (kickableIndex >= 0) this.kickables.splice(kickableIndex, 1);
    const compass = kickable.object;
    compass.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
    this.wornCompass = compass;
    this.startFieldCompassEquipFlight(compass, true);
    this.compassProp = null;

    const interactionIndex = this.interactions.findIndex(
      (candidate) => candidate.id === "planning-compass",
    );
    if (interactionIndex >= 0) this.interactions.splice(interactionIndex, 1);
    if (this.activeInteraction?.id === "planning-compass") {
      this.activeInteraction = null;
      this.hooks.onInteractionChange(null);
    }

    return true;
  }

  private removePortablePencilInteractions(): void {
    for (let index = this.interactions.length - 1; index >= 0; index -= 1) {
      const id = this.interactions[index]?.id ?? "";
      if (
        id === "portable-pencil" ||
        id.startsWith("planning-pencil-")
      ) {
        this.interactions.splice(index, 1);
      }
    }
    if (
      this.activeInteraction?.id === "portable-pencil" ||
      this.activeInteraction?.id.startsWith("planning-pencil-")
    ) {
      this.activeInteraction = null;
      this.hooks.onInteractionChange(null);
    }
  }

  private acquirePortablePencil(
    kickable: Kickable,
    announce = true,
  ): boolean {
    const state = this.pencilProps.find(
      (candidate) => candidate.kickable === kickable,
    );
    if (
      this.pencilOwned ||
      !state
    ) {
      return false;
    }

    this.cancelTelekinesisHold(kickable);
    this.voidTurtleRide.releaseCargo(kickable);
    this.pencilUnlocked = true;
    this.pencilOwned = true;
    this.portablePencilVariant = state.variant;
    kickable.enabled = false;
    kickable.onPlatform = false;
    kickable.platform = null;
    kickable.velocity.set(0, 0, 0);
    const kickableIndex = this.kickables.indexOf(kickable);
    if (kickableIndex >= 0) this.kickables.splice(kickableIndex, 1);
    const stateIndex = this.pencilProps.indexOf(state);
    if (stateIndex >= 0) this.pencilProps.splice(stateIndex, 1);

    const pencil = kickable.object;
    pencil.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = false;
    });
    this.wornPencil = pencil;
    if (announce) {
      this.startPortablePencilEquipFlight(
        pencil,
        state.variant,
        true,
      );
    } else {
      this.mountPortablePencil(pencil);
    }
    this.removePortablePencilInteractions();

    return true;
  }

  private detachWornPencil(): Kickable | null {
    const pencil = this.wornPencil;
    const variant = this.portablePencilVariant;
    if (!this.pencilOwned || !pencil || !variant) return null;

    this.zoneGroup.attach(pencil);
    this.setPlayerAttachmentRendering(pencil, false);
    pencil.scale.setScalar(0.82);
    const kickable = this.registerKickable(
      pencil,
      0.2,
      0.145,
      null,
      true,
      null,
      0.86,
      "The loose repair pencil scribbles a brief line through the dust.",
    );
    kickable.platformOffset = 0.09;
    const recovery = new THREE.Vector3(
      this.playerPosition.x + Math.sin(this.smoothedRotation) * 0.9,
      0.19,
      this.playerPosition.z + Math.cos(this.smoothedRotation) * 0.9,
    );
    this.constrainToBounds(recovery);
    const state: PencilPropState = {
      kickable,
      variant,
      interactionId: "portable-pencil",
      origin: recovery,
      rotation: new THREE.Euler(0, 0.25, 0),
      platform: null,
    };
    this.pencilProps.push(state);
    this.wornPencil = null;
    this.pencilOwned = false;
    this.addInteraction(
      state.interactionId,
      "Return the repair pencil to its loop",
      pencil.position.x,
      pencil.position.z,
      1.35,
      () => {
        this.acquirePortablePencil(kickable);
      },
    );
    return kickable;
  }

  private resetPortablePencil(): boolean {
    if (this.pencilOwned) return false;
    if (this.pencilUnlocked && this.portablePencilVariant) {
      const portable = this.pencilProps.find(
        (state) => state.variant === this.portablePencilVariant,
      );
      return portable
        ? this.acquirePortablePencil(portable.kickable, false)
        : false;
    }

    let reset = false;
    for (const state of this.pencilProps) {
      const { kickable, origin, rotation, platform } = state;
      const object = kickable.object;
      const moved =
        object.position.distanceToSquared(origin) > 0.0025 ||
        Math.abs(object.rotation.x - rotation.x) > 0.01 ||
        Math.abs(object.rotation.y - rotation.y) > 0.01 ||
        Math.abs(object.rotation.z - rotation.z) > 0.01 ||
        kickable.velocity.lengthSq() > 0.0025 ||
        (platform
          ? !kickable.onPlatform || kickable.platform !== platform
          : kickable.platform !== null);
      if (!moved) continue;
      this.cancelTelekinesisHold(kickable);
      this.voidTurtleRide.releaseCargo(kickable);
      object.position.copy(origin);
      object.rotation.copy(rotation);
      object.visible = true;
      kickable.velocity.set(0, 0, 0);
      kickable.enabled = true;
      kickable.gravity = true;
      kickable.restingY = 0.145;
      kickable.platform = platform;
      kickable.platformOffset =
        platform
          ? origin.y - platform.heightAt(origin.x, origin.z)
          : 0.09;
      kickable.onPlatform = platform !== null;
      kickable.kickCooldown = 0;
      const interaction = this.interactions.find(
        (candidate) => candidate.id === state.interactionId,
      );
      interaction?.position.set(origin.x, 0, origin.z);
      reset = true;
    }
    return reset;
  }

  private stowPortablePencilForTravel(): void {
    if (
      !this.pencilUnlocked ||
      this.pencilOwned ||
      !this.portablePencilVariant
    ) {
      return;
    }
    const portable = this.pencilProps.find(
      (state) => state.variant === this.portablePencilVariant,
    );
    if (portable) {
      this.acquirePortablePencil(portable.kickable, false);
    }
  }

  private resetFieldCompass(): boolean {
    const state = this.compassProp;
    if (!state) return false;
    const { kickable, origin, rotation, platform } = state;
    const object = kickable.object;
    const moved =
      object.position.distanceToSquared(origin) > 0.0025 ||
      Math.abs(object.rotation.x - rotation.x) > 0.01 ||
      Math.abs(object.rotation.y - rotation.y) > 0.01 ||
      Math.abs(object.rotation.z - rotation.z) > 0.01 ||
      kickable.velocity.lengthSq() > 0.0025 ||
      (platform
        ? !kickable.onPlatform || kickable.platform !== platform
        : kickable.platform !== null);
    if (!moved) return false;

    this.cancelTelekinesisHold(kickable);
    this.voidTurtleRide.releaseCargo(kickable);
    object.position.copy(origin);
    object.rotation.copy(rotation);
    object.visible = true;
    kickable.velocity.set(0, 0, 0);
    kickable.enabled = true;
    kickable.gravity = true;
    kickable.restingY = 0.145;
    kickable.platform = platform;
    kickable.platformOffset =
      platform ? origin.y - platform.heightAt(origin.x, origin.z) : 0.09;
    kickable.onPlatform = platform !== null;
    kickable.kickCooldown = 0;
    const interaction = this.interactions.find(
      (candidate) => candidate.id === "planning-compass",
    );
    interaction?.position.set(origin.x, 0, origin.z);
    object.updateMatrixWorld(true);
    return true;
  }

  private detachWornCompass(): Kickable | null {
    const compass = this.wornCompass;
    if (!this.compassOwned || !compass) return null;

    this.zoneGroup.attach(compass);
    this.setPlayerAttachmentRendering(compass, false);
    compass.scale.setScalar(0.82);
    const kickable = this.registerKickable(
      compass,
      0.3,
      0.145,
      null,
      true,
      null,
      0.9,
      "The loose compass skips away. The heading display remains dark.",
    );
    kickable.platformOffset = 0.09;
    const recovery = new THREE.Vector3(
      this.playerPosition.x + Math.sin(this.smoothedRotation) * 0.95,
      0.19,
      this.playerPosition.z + Math.cos(this.smoothedRotation) * 0.95,
    );
    this.constrainToBounds(recovery);
    this.compassProp = {
      kickable,
      origin: recovery,
      rotation: new THREE.Euler(0, 0.35, 0),
      platform: null,
    };
    this.wornCompass = null;
    this.compassOwned = false;
    this.hooks.onCompassChange(false, this.compassHeading);
    this.addInteraction(
      "planning-compass",
      "Take the field compass",
      compass.position.x,
      compass.position.z,
      1.45,
      () => {
        this.acquireFieldCompass(kickable);
      },
    );
    this.hooks.onStatus(
      "The compass comes free of its belt clip. The heading display goes dark.",
    );
    return kickable;
  }

  private cancelTelekinesisHold(target?: Kickable): void {
    if (!this.heldKickable || (target && this.heldKickable !== target)) return;
    this.fallsCrystalFrog.releaseHold(this.heldKickable, true);
    if (this.telekinesisFixedBody) this.heldKickable.velocity.set(0, 0, 0);
    const pointerId = this.telekinesisPointerId;
    this.heldKickable = null;
    this.telekinesisFixedBody = false;
    this.telekinesisPlacementSurface = null;
    this.telekinesisPlacementSettledFor = 0;
    this.telekinesisPointerId = null;
    this.telekinesisMoved = false;
    this.telekinesisPencilWasWorn = false;
    if (
      pointerId !== null &&
      this.canvas.hasPointerCapture(pointerId)
    ) {
      this.canvas.releasePointerCapture(pointerId);
    }
    this.syncPointerDragCursor();
  }

  private hasActivePointerDrag(): boolean {
    return (
      this.telekinesisPointerId !== null ||
      this.pongChallenge.hasPointerDrag() ||
      this.mathInstanceDragHold !== null ||
      this.archiveSignalPuzzle.hasPointerDrag() ||
      this.archiveOrbitPlayground.hasPointerDrag() ||
      (this.ambientGrid?.hasDrag() ?? false)
    );
  }

  private syncPointerDragCursor(idleCursor: "" | "grab" = ""): void {
    this.canvas.style.cursor = this.hasActivePointerDrag()
      ? "grabbing"
      : idleCursor;
  }

  private cancelAllPointerDrags(notifyMath = true): void {
    this.pongChallenge.cancelPointerDrags();
    this.cancelNonPongPointerDrags(notifyMath);
  }

  private cancelNonPongPointerDrags(notifyMath = true): void {
    this.cancelClickNavigationPress();
    if (!this.navigation.route && !this.navigation.hasPending &&
      !this.navigation.pendingTarget && !this.navigation.failure) this.clickNavigationMarker?.hide();
    this.cancelTelekinesisHold();
    this.archiveOrbitPlayground.cancelPointerDrags();
    this.cancelMathInstanceDrag(notifyMath);
    this.archiveSignalPuzzle.cancelPointerDrag();
    this.cancelAmbientGridDrag();
  }

  private settleFlyingFishSchools(): boolean {
    const changed =
      this.fallsFlyingFishSchoolColors.length > 0 ||
      (this.fishSchool?.flyingCount ?? 0) > 0;
    this.fishBaitShard = null;
    this.fishBaitFishIndex = -1;
    this.fallsFishFeastAnnounced = false;
    this.fallsFlyingFishSchoolColors.length = 0;
    if (this.fishSchool) {
      this.fishSchool.flyingCount = 0;
      this.fishSchool.flightAges.fill(0);
      this.fishSchool.magicRecalls.length = 0;
      this.fishSchool.magicPoints.geometry.setDrawRange(0, 0);
      this.fishSchool.magicPoints.visible = false;
      const fishCount = this.getFishRenderCount(this.fishSchool);
      this.fishSchool.mesh.count = fishCount;
      this.fishSchool.aura.count = fishCount;
      this.fishSchool.aura.visible = false;
    }
    return changed;
  }

  private createRuneAltar(parent: THREE.Group, x: number, z: number): void {
    const altar = new RuneAltar(this.materials, {
      onStatus: (message) => this.hooks.onStatus(message),
      getRevealTarget: (target) =>
        this.player.group.localToWorld(target.set(0, 2.46, 0.12)),
      onPreparePortfolio: () =>
        this.hooks.onPreparePortfolio("monument"),
      onRevealPortfolio: () => this.hooks.onRequestPortfolio("monument"),
    });
    altar.setQuality(this.quality);
    altar.object.position.set(x, 0, z);
    parent.add(altar.object);
    this.runeAltar = altar;
  }

  private createNpcMarker(
    parent: THREE.Group,
    x: number,
    z: number,
    accent: THREE.Material,
    interactionId: string,
    elevation = 0,
  ): void {
    const group = new THREE.Group();
    group.position.set(x, elevation, z);
    const crowdingDialogue = npcCrowdingDialogue[interactionId] ?? {
      speaker: "Stranger",
      lines: ["A little room, if the sky permits."],
    };
    const ensureNonIndexed = (
      geometry: THREE.BufferGeometry,
    ): THREE.BufferGeometry => {
      if (!geometry.index) return geometry;
      const converted = geometry.toNonIndexed();
      geometry.dispose();
      return converted;
    };
    const colorGeometry = (
      geometry: THREE.BufferGeometry,
      color: THREE.ColorRepresentation,
    ): THREE.BufferGeometry => {
      const vertexCount = geometry.getAttribute("position").count;
      const value = new THREE.Color(color);
      const colors = new Float32Array(vertexCount * 3);
      for (let index = 0; index < vertexCount; index += 1) {
        colors[index * 3] = value.r;
        colors[index * 3 + 1] = value.g;
        colors[index * 3 + 2] = value.b;
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return geometry;
    };
    const bodyGeometry = colorGeometry(
      ensureNonIndexed(
        new THREE.CylinderGeometry(0.36, 0.55, 1.25, 7),
      ).translate(0, 0.85, 0),
      palette.tealDark,
    );
    const headGeometry = colorGeometry(
      ensureNonIndexed(
        new THREE.DodecahedronGeometry(0.31, 0),
      ).translate(0, 1.72, 0),
      palette.parchment,
    );
    const accentColor =
      "color" in accent && accent.color instanceof THREE.Color
        ? accent.color
        : new THREE.Color(palette.cyan);
    const npcGeometry = mergeGeometries(
      [bodyGeometry, headGeometry],
      false,
    );
    bodyGeometry.dispose();
    headGeometry.dispose();
    if (npcGeometry) {
      const npcMesh = new THREE.Mesh(npcGeometry, this.materials.npc);
      npcMesh.castShadow = false;
      npcMesh.receiveShadow = true;
      group.add(npcMesh);
    }
    const signalCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        toneMapped: false,
      }),
    );
    signalCrystal.name = `${interactionId}-plumbob-crystal`;
    signalCrystal.position.y = 2.38;
    signalCrystal.scale.y = 1.32;
    signalCrystal.castShadow = false;
    signalCrystal.renderOrder = 4;
    group.add(signalCrystal);
    const signalAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.022, 5, 20),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    signalAura.name = `${interactionId}-plumbob-aura`;
    signalAura.position.y = 2.38;
    signalAura.rotation.x = Math.PI / 2;
    signalAura.renderOrder = 4;
    group.add(signalAura);
    const speechHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.025, 5, 18),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    speechHalo.name = `${interactionId}-speech-signal`;
    speechHalo.position.y = 2.35;
    speechHalo.rotation.x = Math.PI / 2;
    speechHalo.visible = false;
    speechHalo.renderOrder = 5;
    group.add(speechHalo);
    parent.add(group);
    const speechDuration = 1.18;
    this.wanderingNpcs.push({
      group,
      home: new THREE.Vector3(x, elevation, z),
      feetHeight: elevation,
      returnPath: null,
      returnWaypoint: 0,
      nextReturnPlanAt: 0,
      steeringHeading: group.rotation.y,
      detourSide: x < 0 ? -1 : 1,
      detourUntil: 0,
      wanderPauseUntil: 0,
      interactionId,
      crowdingSpeaker: crowdingDialogue.speaker,
      crowdingQuips: crowdingDialogue.lines,
      crowdingQuipIndex: 0,
      crowdingQuipCooldownUntil: 0,
      crowdedFromAbove: false,
      signalCrystal,
      signalAura,
      speechHalo,
      speechAge: speechDuration,
      speechDuration,
      radiusX: 0.72 + (Math.abs(x) % 3) * 0.12,
      radiusZ: 0.5 + (Math.abs(z) % 2) * 0.14,
      speed: 0.3 + (Math.abs(x + z) % 4) * 0.035,
      angle: x * 0.37 + z * 0.21,
    });
  }

  private addLoreNpcInteraction(
    id: string,
    label: string,
    speaker: string,
    x: number,
    z: number,
    lines: readonly string[],
    monospaceTerms?: readonly string[],
  ): void {
    let nextLine = 0;
    const interaction = this.addInteraction(id, label, x, z, 2, () => {
      const line = lines[nextLine % lines.length];
      nextLine += 1;
      if (!line) return;
      this.emitNpcSpeech(id, speaker, line, monospaceTerms);
    });
    const npc = this.wanderingNpcs.find((candidate) => candidate.interactionId === id);
    if (npc) {
      interaction.isAvailable = () =>
        Math.abs(this.surfaceOffset + this.jumpHeight - npc.feetHeight) < 1.45;
    }
  }

  private addDaemonControllerInteraction(
    x: number,
    z: number,
  ): void {
    const speaker = "Daemon Controller";
    const challengeLines = [
      "Mine is the coral hand. I forged it for a road without corners; long watching has taught it to mistake prediction for sight.",
      "I offer thee a best of five: mortal hand against mine, preferably without interference. Prevail, and I shall judge thy violet spell. Win cleanly, and the amber seal beneath the caged storm shall bear witness.",
      "Bring Surge when thou wouldst claim the greater power. Spark is bright, aye. The glass vessel beside me cannot hold my storm forever.",
      "Once, a courier struck the northern rail and arrived from the south. The Grid named it blasphemy. I named it a point.",
      "When violet weather enters my hand, tomorrow and yesterday exchange masks. I despise the storm because the storm will not be forecast.",
    ] as const;
    const thunderLines = [
      "The greater mark is thine. Do not ask the straight road where Thunder leads; it has never learned to turn.",
      "Mine hand still sees tomorrow. Thy storm merely teaches tomorrow to lie.",
    ] as const;
    let challengeLine = 0;
    let thunderLine = 0;

    this.addInteraction(
      "daemon-controller",
      "Speak with the Daemon Controller",
      x,
      z,
      2,
      () => {
        let line: string;
        if (this.highestSpellStage === "thunder") {
          line = thunderLines[thunderLine % thunderLines.length] ?? thunderLines[0];
          thunderLine += 1;
        } else if (
          this.pongChallengeComplete &&
          this.highestSpellStage === "spark"
        ) {
          line =
            "Thou hast broken my coral hand, yet bringest me only Spark. Too pale. Let the Falls steep it into violet Surge; then return, and I shall bestow the greater daemonic power.";
        } else if (
          this.pongChallengeComplete &&
          this.archivePinballChallengeComplete &&
          this.highestSpellStage === "surge"
        ) {
          this.pongChallenge.releaseThunderReliquary();
          this.grantSpellStage("thunder");
          line =
            "Thy violet spell bears both scars at last. Kneel. I name the fault not loss, but Thunder. Let the coral cage break; take of my greater power, and let every straight road fear the turn.";
        } else if (this.pongChallengeComplete) {
          line =
            "Thy Surge is worthy, and mine hand remembers defeat. Yet the farther circuit remains dark. Trouble the Archive; return when violet answers amber.";
        } else {
          line =
            challengeLines[challengeLine % challengeLines.length] ??
            challengeLines[0];
          challengeLine += 1;
        }
        this.emitNpcSpeech("daemon-controller", speaker, line);
      },
    );
  }

  /**
   * Resolves a relay's effective optical target. Detents point at authored
   * targets; free aim first catches another prism, then the nearest finite
   * solid collider, and otherwise continues beyond every reachable camera
   * framing. The observability field is deliberately absent from this hit
   * test: light can pass through it.
   */
  private createSignalTower(
    parent: THREE.Group,
    x: number,
    z: number,
    height: number,
    accent: THREE.Material,
  ): void {
    const group = new THREE.Group();
    group.name = `signal-server-rack-${x}-${z}`;
    group.position.set(x, 0, z);

    const cabinet = addBox(
      group,
      [2.7, height, 2.7],
      [0, height / 2, 0],
      this.materials.tealDark,
    );
    cabinet.name = "signal-rack-cabinet";
    cabinet.castShadow = false;
    cabinet.receiveShadow = true;
    const plinth = addBox(
      group,
      [2.98, 0.24, 2.98],
      [0, 0.12, 0],
      this.materials.darkStone,
    );
    plinth.name = "signal-rack-plinth";
    const roof = addBox(
      group,
      [2.92, 0.2, 2.92],
      [0, height - 0.1, 0],
      this.materials.darkStone,
    );
    roof.name = "signal-rack-roof";

    const frontRecess = addBox(
      group,
      [2.3, height - 0.48, 0.16],
      [0, height / 2 - 0.02, 1.37],
      this.materials.black,
    );
    frontRecess.name = "signal-rack-recessed-backplane";
    frontRecess.castShadow = false;
    for (const side of [-1, 1] as const) {
      const frontRail = addBox(
        group,
        [0.13, height - 0.26, 0.2],
        [side * 1.19, height / 2, 1.44],
        this.materials.darkStone,
      );
      frontRail.name = "signal-rack-front-rail";
      const sidePanel = addBox(
        group,
        [0.12, height * 0.6, 1.82],
        [side * 1.39, height * 0.52, 0],
        this.materials.darkStone,
      );
      sidePanel.name = "signal-rack-side-service-panel";
      sidePanel.castShadow = false;
      for (let vent = 0; vent < 4; vent += 1) {
        const ventSlit = addBox(
          group,
          [0.045, 0.075, 1.32],
          [
            side * 1.46,
            height * 0.31 + vent * height * 0.14,
            0,
          ],
          this.materials.black,
        );
        ventSlit.name = "signal-rack-side-vent";
        ventSlit.castShadow = false;
      }
      const sideBus = addBox(
        group,
        [0.04, height * 0.42, 0.08],
        [side * 1.47, height * 0.52, 0.72],
        accent,
      );
      sideBus.name = "signal-rack-side-data-bus";
      sideBus.castShadow = false;
    }

    const bayCount = Math.max(6, Math.round(height * 1.18));
    const bayBottom = 0.48;
    const bayTop = height - 0.72;
    const bayStep = (bayTop - bayBottom) / Math.max(1, bayCount - 1);
    for (let index = 0; index < bayCount; index += 1) {
      const bayY = bayBottom + index * bayStep;
      const bay = addBox(
        group,
        [1.92, Math.min(0.34, bayStep * 0.6), 0.16],
        [0, bayY, 1.48],
        this.materials.darkStone,
      );
      bay.name = "signal-rack-compute-blade";
      bay.castShadow = false;
      const ventWidth = 0.58 + ((index + Math.round(Math.abs(x))) % 3) * 0.13;
      const vent = addBox(
        group,
        [ventWidth, 0.035, 0.035],
        [-0.28, bayY, 1.585],
        this.materials.black,
      );
      vent.name = "signal-rack-blade-vent";
      vent.castShadow = false;
      const indicator = addBox(
        group,
        [0.105, 0.075, 0.04],
        [index % 2 === 0 ? 0.73 : 0.58, bayY, 1.59],
        index % 3 === 1 ? this.materials.parchment : accent,
      );
      indicator.name = "signal-rack-blade-indicator";
      indicator.castShadow = false;
    }

    const dial = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.275, 14),
      accent,
    );
    dial.name = "signal-rack-header-dial";
    dial.position.set(-0.66, height - 0.38, 1.59);
    dial.castShadow = false;
    group.add(dial);
    const dialNeedle = addBox(
      group,
      [0.035, 0.24, 0.035],
      [-0.66, height - 0.38, 1.615],
      this.materials.parchment,
    );
    dialNeedle.name = "signal-rack-header-needle";
    dialNeedle.rotation.z = x < 0 ? -0.72 : x > 0 ? 0.58 : -0.12;
    dialNeedle.castShadow = false;
    for (let glyph = 0; glyph < 3; glyph += 1) {
      const glyphBar = addBox(
        group,
        [0.22 + glyph * 0.08, 0.045, 0.04],
        [0.05 + glyph * 0.31, height - 0.48 + glyph * 0.09, 1.59],
        glyph === 1 ? this.materials.parchment : accent,
      );
      glyphBar.name = "signal-rack-header-glyph";
      glyphBar.castShadow = false;
    }

    const lowerBar = addBox(
      group,
      [2.34, 0.07, 0.12],
      [0, height * 0.33, 1.57],
      accent,
    );
    const upperBar = addBox(
      group,
      [2.34, 0.07, 0.12],
      [0, height * 0.66, 1.57],
      accent,
    );
    const scanBar = addBox(
      group,
      [0.92, 0.055, 0.13],
      [-0.45, height * 0.5, 1.59],
      accent,
    );
    lowerBar.name = "signal-rack-lower-bus";
    upperBar.name = "signal-rack-upper-bus";
    scanBar.name = "signal-rack-scanner";
    for (const bar of [lowerBar, upperBar, scanBar]) {
      bar.castShadow = false;
    }

    addCylinder(
      group,
      0.25,
      0.34,
      0.44,
      8,
      [0, height + 0.18, 0],
      this.materials.brass,
    );
    const capHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.04, 5, 24),
      accent,
    );
    capHalo.name = "signal-rack-cap-halo";
    capHalo.position.y = height + 0.38;
    capHalo.rotation.x = Math.PI / 2;
    capHalo.castShadow = false;
    group.add(capHalo);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.66, 0), accent);
    cap.name = "signal-rack-orbiting-core";
    cap.position.y = height + 0.7;
    cap.rotation.set(0.12, x * 0.08, 0.16);
    cap.castShadow = false;
    group.add(cap);
    this.animatedItems.push({
      object: cap,
      originY: cap.position.y,
      phase: x * 0.3,
      amplitude: 0.11,
      rotationSpeed: 0.35,
    });
    this.serverRacks.push({
      bars: [lowerBar, upperBar, scanBar],
      cap,
      position: new THREE.Vector3(x, height + 0.7, z),
    });
    parent.add(group);
    this.registerPlayerOccluder(group);
  }

  private createArchiveDataGlass(
    parent: THREE.Group,
    x: number,
    z: number,
  ): void {
    const frameTopHeight = 4.29;
    const collisionHalfWidth = 0.16;
    const collisionHalfDepth = 3.6;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      const wash = context.createLinearGradient(0, 0, 512, 256);
      wash.addColorStop(0, "rgba(255, 169, 40, 0.08)");
      wash.addColorStop(0.55, "rgba(255, 199, 92, 0.16)");
      wash.addColorStop(1, "rgba(85, 220, 232, 0.08)");
      context.fillStyle = wash;
      context.fillRect(0, 0, 512, 256);

      context.strokeStyle = "rgba(255, 198, 93, 0.24)";
      context.lineWidth = 1;
      for (let gridX = 0; gridX <= 512; gridX += 64) {
        context.beginPath();
        context.moveTo(gridX + 0.5, 0);
        context.lineTo(gridX + 0.5, 256);
        context.stroke();
      }
      for (let gridY = 0; gridY <= 256; gridY += 32) {
        context.beginPath();
        context.moveTo(0, gridY + 0.5);
        context.lineTo(512, gridY + 0.5);
        context.stroke();
      }

      context.font =
        "700 18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      context.textBaseline = "middle";
      const records = [
        "ORBIT TRAFFIC // LIVE",
        "AST-04  VECTOR +08.2",
        "BODY-02 RADIAL -1.4",
        "LEDGER  91AF:7C2D",
        "LANE-05 SETTLING...",
        "PING    0008 MS",
        "TRACE   WHITE/RABBIT",
        "ORDER   ? ? ? ? ?",
      ];
      for (const [index, record] of records.entries()) {
        const rowY = 18 + index * 31;
        context.fillStyle =
          index === 0
            ? "rgba(255, 214, 126, 0.98)"
            : "rgba(250, 255, 244, 0.9)";
        context.fillText(record, 18 + (index % 2) * 18, rowY);
        context.fillStyle = "rgba(255, 255, 255, 0.34)";
        context.fillRect(
          340,
          rowY - 2,
          32 + ((index * 37) % 118),
          3,
        );
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.08, 1.55);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(7.02, 4.05),
      material,
    );
    glass.name = "archive-orbit-traffic-glass";
    glass.position.set(x - 0.03, 2.13, z);
    glass.rotation.y = Math.PI / 2;
    glass.renderOrder = 2;
    glass.castShadow = false;
    parent.add(glass);

    for (const railZ of [z - 3.56, z + 3.56]) {
      const rail = addBox(
        parent,
        [0.18, 4.35, 0.14],
        [x, 2.12, railZ],
        this.materials.brass,
      );
      rail.castShadow = false;
    }
    for (const railY of [0.12, 4.22]) {
      const rail = addBox(
        parent,
        [0.18, 0.14, 7.12],
        [x, railY, z],
        this.materials.brass,
      );
      rail.castShadow = false;
    }
    for (const cableZ of [z - 1.18, z + 1.18]) {
      const cable = addBox(
        parent,
        [0.1, 4.05, 0.045],
        [x - 0.015, 2.13, cableZ],
        this.materials.darkStone,
      );
      cable.castShadow = false;
    }

    this.archiveDataGlass = {
      texture,
      material,
      x,
      z,
      topHeight: frameTopHeight,
      collisionHalfWidth,
      collisionHalfDepth,
    };
  }

  private createMonitorObservatory(parent: THREE.Group): void {
    const backWall = addBox(
      parent,
      [13.2, 4.9, 1.2],
      [1.1, 2.35, -9],
      this.materials.darkStone,
    );
    this.createArchiveDataGlass(parent, 8.15, -5.8);
    backWall.castShadow = false;
    this.addStaticBox(1.1, 2.35, -9, 6.6, 2.45, 0.6, 4.785);
    this.addSurfaceArea({
      id: "archive-monitor-wall",
      x: 1.1,
      z: -9,
      halfWidth: 6.58,
      halfDepth: 0.585,
      requiresJump: true,
      landingMessage:
        "You reach the observatory wall. The monitors continue arguing below.",
      heightAt: () => 4.8,
    });
    const dataGlass = this.archiveDataGlass;
    if (dataGlass) {
      this.addStaticBox(
        dataGlass.x,
        dataGlass.topHeight / 2,
        dataGlass.z,
        dataGlass.collisionHalfWidth,
        dataGlass.topHeight / 2,
        dataGlass.collisionHalfDepth,
        dataGlass.topHeight - 0.015,
        dataGlass.topHeight,
      );
      this.addSurfaceArea({
        id: "archive-data-glass-cap",
        x: dataGlass.x,
        z: dataGlass.z,
        halfWidth: dataGlass.collisionHalfWidth,
        halfDepth: dataGlass.collisionHalfDepth - 0.025,
        requiresJump: true,
        supportMargin: 0.16,
        edgeGrace: 0.2,
        landingMessage:
          "You balance along the observability traffic frame. Live traces slide beneath your boots.",
        heightAt: () => dataGlass.topHeight,
      });
    }

    const monitorConfigs = [
      [-4.25, 1.22, -8.22, 0, this.materials.tealDark, "chart", 0.92],
      [-1.55, 1.18, -8.22, 0, this.materials.tealDark, "chart", 0.96],
      [1.2, 1.24, -8.22, 0, this.materials.cyanSoft, "signal", 0.9],
      [3.95, 1.18, -8.22, 0, this.materials.tealDark, "chart", 0.96],
      [6.2, 1.3, -8.22, 0, this.materials.cyanSoft, "signal", 0.82],
      [-3, 2.9, -8.2, 0, this.materials.cyanSoft, "signal", 0.86],
      [-0.25, 2.82, -8.2, 0, this.materials.violet, "signal", 0.92],
      [2.55, 2.92, -8.18, 0, this.materials.tealDark, "smiley", 1.02],
      [5.35, 2.82, -8.2, 0, this.materials.tealDark, "chart", 0.92],
      [7.48, 1.35, -6.8, -Math.PI / 2, this.materials.cyanSoft, "signal", 0.88],
      [7.48, 1.62, -4.1, -Math.PI / 2, this.materials.tealDark, "chart", 0.98],
      // Tuck the final side monitor toward the glass frame. At -1.55 it sat
      // inside the camera projection of the authored amber↔green route.
      [7.48, 1.25, -2.38, -Math.PI / 2, this.materials.violet, "signal", 0.84],
    ] as const;
    for (const [
      index,
      [x, y, z, rotationY, material, display, scale],
    ] of monitorConfigs.entries()) {
      const monitor = this.createCrtMonitor(
        parent,
        x,
        y,
        z,
        rotationY,
        material,
        display,
        scale,
      );
      const turned = Math.abs(Math.sin(rotationY)) > 0.5;
      const halfWidth = (turned ? 0.525 : 0.925) * scale;
      const halfDepth = (turned ? 0.925 : 0.525) * scale;
      const halfHeight = 0.71 * scale;
      const top = y + halfHeight;
      this.addStaticBox(
        x,
        y,
        z,
        halfWidth,
        halfHeight,
        halfDepth,
        top - 0.015,
      );
      this.addSurfaceArea({
        id: `archive-monitor-${index}`,
        x,
        z,
        halfWidth: Math.max(0.08, halfWidth - 0.015),
        halfDepth: Math.max(0.08, halfDepth - 0.015),
        requiresJump: true,
        landingMessage:
          display === "smiley"
            ? "You perch above the smiling monitor. It seems delighted by this decision."
            : index === 0
              ? "Boots on the CRT bank. Twelve warranty clauses begin screaming."
              : undefined,
        heightAt: () => top,
      });
      if (x === 3.95 && z === -8.22) this.createArchiveMonitorTarget(monitor, x, z);
    }

    const cornerServiceBox = new THREE.Group();
    cornerServiceBox.name = "archive-monitor-corner-service-box";
    cornerServiceBox.position.set(7.05, 0, -7.42);
    parent.add(cornerServiceBox);
    const serviceBody = addBox(
      cornerServiceBox,
      [1.02, 1.04, 1.16],
      [0, 0.52, 0],
      this.materials.black,
    );
    serviceBody.castShadow = false;
    const serviceBand = addBox(
      cornerServiceBox,
      [1.08, 0.08, 1.22],
      [0, 1.05, 0],
      this.materials.brass,
    );
    serviceBand.name = "archive-monitor-corner-service-band";
    serviceBand.castShadow = false;
    const serviceIndex = addBox(
      cornerServiceBox,
      [0.38, 0.025, 0.18],
      [0, 1.095, -0.22],
      this.materials.cyanSoft,
    );
    serviceIndex.name = "archive-monitor-corner-service-index";
    serviceIndex.castShadow = false;
    this.registerClimbableBox(
      cornerServiceBox,
      "archive-monitor-corner-service-box",
      undefined,
    );

    // Keep the low trunk tucked beneath the monitor bank. Its former position
    // at (6.15, -2.72) sat directly in the camera projection of the authored
    // amber-to-green beam even though the ray cleared it in world space.
    const maintenanceTrunkX = 4.9;
    const maintenanceTrunkZ = -6.48;
    const maintenanceTrunk = addBox(
      parent,
      [1.35, 0.72, 1],
      [maintenanceTrunkX, 0.36, maintenanceTrunkZ],
      this.materials.black,
    );
    maintenanceTrunk.castShadow = false;
    const trunkLatch = addBox(
      parent,
      [0.32, 0.08, 0.18],
      [maintenanceTrunkX, 0.75, maintenanceTrunkZ + 0.52],
      this.materials.brass,
    );
    trunkLatch.castShadow = false;
    this.addStaticBox(
      maintenanceTrunkX,
      0.36,
      maintenanceTrunkZ,
      0.675,
      0.36,
      0.5,
      0.705,
    );
    this.addSurfaceArea({
      id: "archive-maintenance-trunk",
      x: maintenanceTrunkX,
      z: maintenanceTrunkZ,
      halfWidth: 0.66,
      halfDepth: 0.485,
      requiresJump: true,
      heightAt: () => 0.72,
    });
    this.addInteraction(
      "archive-maintenance-trunk",
      "Inspect maintenance trunk",
      maintenanceTrunkX,
      maintenanceTrunkZ,
      1.65,
      () => {
        this.hooks.onStatus(
          "ORBIT TRAFFIC / DO NOT STACK, says the latch. Every nearby machine has ignored it.",
        );
      },
    );

    const consoleBase = addBox(
      parent,
      [6.2, 0.72, 1.7],
      [-1.1, 0.38, -5.85],
      this.materials.black,
    );
    consoleBase.castShadow = false;
    this.createArchiveConsoleDisplay(parent, -2.25, -5.72, "ledger");
    this.createArchiveConsoleDisplay(parent, 0.35, -5.72, "market");

    for (const [index, material] of [
      this.materials.cyan,
      this.materials.parchment,
      this.materials.coral,
    ].entries()) {
      const control = addCylinder(
        parent,
        0.055,
        0.065,
        0.045,
        10,
        [-1.55 + index * 0.34, 0.775, -5.08],
        material,
      );
      control.name = "archive-console-control";
      control.castShadow = false;
    }
    for (const [index, material] of [
      this.materials.amber,
      this.materials.green,
      this.materials.coral,
    ].entries()) {
      const control = addCylinder(
        parent,
        0.055,
        0.065,
        0.045,
        10,
        [0.02 + index * 0.34, 0.775, -5.08],
        material,
      );
      control.name = "archive-console-control";
      control.castShadow = false;
    }
    const centerToggle = addBox(
      parent,
      [0.1, 0.055, 0.32],
      [-0.94, 0.79, -5.08],
      this.materials.brass,
    );
    centerToggle.name = "archive-console-center-toggle";
    centerToggle.rotation.y = -0.18;
    centerToggle.castShadow = false;
    this.addStaticBox(-1.1, 0.4, -5.85, 3.1, 0.42, 0.85, 0.86);
    this.addSurfaceArea({
      id: "archive-console",
      x: -1.1,
      z: -5.85,
      halfWidth: 3,
      halfDepth: 0.78,
      requiresJump: true,
      landingMessage: "You vault onto the market console. The controls survive, for now.",
      heightAt: () => 0.86,
    });
  }

  private createArchiveConsoleDisplay(
    parent: THREE.Group,
    x: number,
    z: number,
    kind: "ledger" | "market",
  ): void {
    const backing = addBox(
      parent,
      [2.38, 0.06, 1.19],
      [x, 0.78, z],
      this.materials.darkStone,
    );
    backing.name = `archive-${kind}-console-bezel`;
    backing.castShadow = false;

    const texture = createArchiveConsoleDisplayTexture(kind);
    const material = new THREE.MeshBasicMaterial({
      name: `archive-${kind}-console-screen`,
      map: texture,
      toneMapped: false,
      side: THREE.FrontSide,
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.18, 1.01),
      material,
    );
    screen.name = `archive-${kind}-console-screen`;
    screen.position.set(x, 0.817, z);
    screen.rotation.x = -Math.PI / 2;
    screen.castShadow = false;
    screen.receiveShadow = false;
    screen.renderOrder = 1;
    parent.add(screen);

    const accent =
      kind === "ledger" ? this.materials.cyan : this.materials.amber;
    for (const edgeZ of [z - 0.56, z + 0.56]) {
      const rail = addBox(
        parent,
        [2.28, 0.025, 0.035],
        [x, 0.825, edgeZ],
        accent,
      );
      rail.name = `archive-${kind}-console-accent-rail`;
      rail.castShadow = false;
    }
    for (const edgeX of [x - 1.13, x + 1.13]) {
      const rail = addBox(
        parent,
        [0.035, 0.025, 1.09],
        [edgeX, 0.825, z],
        accent,
      );
      rail.name = `archive-${kind}-console-accent-rail`;
      rail.castShadow = false;
    }
  }

  private createCrtMonitor(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    screenMaterial: THREE.Material,
    display: "chart" | "signal" | "smiley",
    scale: number,
  ): THREE.Group {
    const monitor = new THREE.Group();
    monitor.position.set(x, y, z);
    monitor.rotation.y = rotationY;
    monitor.scale.setScalar(scale);

    const body = addBox(
      monitor,
      [1.85, 1.42, 1.05],
      [0, 0, 0],
      this.materials.black,
    );
    body.castShadow = false;
    const screenBacking = addBox(
      monitor,
      [1.62, 1.16, 0.1],
      [0, 0.08, 0.56],
      this.materials.darkStone,
    );
    screenBacking.name = "archive-crt-screen-bezel";
    screenBacking.castShadow = false;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.42, 0.96),
      screenMaterial,
    );
    screen.name = "archive-crt-screen-glass";
    screen.position.set(0, 0.08, 0.615);
    screen.castShadow = false;
    screen.receiveShadow = false;
    monitor.add(screen);

    const powerLamp = addBox(
      monitor,
      [0.11, 0.055, 0.055],
      [-0.56, -0.6, 0.58],
      this.materials.cyanSoft,
    );
    powerLamp.name = "archive-crt-power-lamp";
    powerLamp.castShadow = false;
    const tuningKnob = addCylinder(
      monitor,
      0.075,
      0.075,
      0.08,
      10,
      [0.55, -0.6, 0.58],
      this.materials.brass,
    );
    tuningKnob.name = "archive-crt-tuning-knob";
    tuningKnob.rotation.x = Math.PI / 2;
    tuningKnob.castShadow = false;

    if (display === "smiley") this.addMonitorSmiley(monitor);
    else this.addMonitorTrace(monitor, display === "chart");
    parent.add(monitor);
    return monitor;
  }

  private createArchiveMonitorTarget(monitor: THREE.Group, x: number, z: number): void {
    const warning = addBox(
      monitor,
      [0.24, 0.24, 0.07],
      [0.62, 0.5, 0.66],
      this.materials.coral,
    );
    warning.rotation.z = Math.PI / 4;
    warning.castShadow = false;

    const crackGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.06, 0.38, 0.69),
      new THREE.Vector3(0.05, 0.08, 0.69),
      new THREE.Vector3(0.05, 0.08, 0.69),
      new THREE.Vector3(-0.28, -0.18, 0.69),
      new THREE.Vector3(0.05, 0.08, 0.69),
      new THREE.Vector3(0.34, -0.04, 0.69),
      new THREE.Vector3(0.05, 0.08, 0.69),
      new THREE.Vector3(0.16, -0.4, 0.69),
    ]);
    const crack = new THREE.LineSegments(
      crackGeometry,
      new THREE.LineBasicMaterial({ color: palette.coral }),
    );
    crack.visible = false;
    monitor.add(crack);
    this.archiveMonitorTarget = {
      crack,
      position: new THREE.Vector3(x, 0, z + 0.68),
      broken: false,
    };
  }

  private addMonitorTrace(parent: THREE.Group, marketChart: boolean): void {
    const points = marketChart
      ? [
          new THREE.Vector3(-0.58, -0.22, 0.635),
          new THREE.Vector3(-0.34, 0.02, 0.635),
          new THREE.Vector3(-0.1, -0.08, 0.635),
          new THREE.Vector3(0.14, 0.29, 0.635),
          new THREE.Vector3(0.36, 0.12, 0.635),
          new THREE.Vector3(0.58, 0.35, 0.635),
        ]
      : [
          new THREE.Vector3(-0.58, 0.12, 0.635),
          new THREE.Vector3(-0.24, 0.12, 0.635),
          new THREE.Vector3(-0.08, -0.18, 0.635),
          new THREE.Vector3(0.14, 0.28, 0.635),
          new THREE.Vector3(0.3, -0.04, 0.635),
          new THREE.Vector3(0.58, -0.04, 0.635),
        ];
    const segments: THREE.Vector3[] = [];
    for (let index = 1; index < points.length; index += 1) {
      segments.push(points[index - 1]!, points[index]!);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(segments);
    parent.add(
      new THREE.LineSegments(
        geometry,
        marketChart ? this.materials.marketLine : this.materials.signalLine,
      ),
    );
  }

  private addMonitorSmiley(parent: THREE.Group): void {
    const face = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.055, 5, 24),
      this.materials.amber,
    );
    face.position.set(0, 0.08, 0.63);
    parent.add(face);

    for (const x of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 6, 5),
        this.materials.amber,
      );
      eye.position.set(x, 0.18, 0.66);
      parent.add(eye);
    }

    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.04, 4, 14, Math.PI),
      this.materials.amber,
    );
    smile.position.set(0, 0.04, 0.65);
    smile.rotation.z = Math.PI;
    parent.add(smile);
  }

  private createPinballAsteroidShadow(size: number): AsteroidShadow {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.9, 18),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.y = 0.82;
    shadow.renderOrder = 2;
    return shadow;
  }

  private createPinballAsteroidObject(size: number): THREE.Group {
    const asteroid = new THREE.Group();
    asteroid.name = "traveling-archive-pinball";
    asteroid.userData.travelingAsteroid = true;
    const body = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      this.materials.stone,
    );
    body.scale.set(1, 0.82, 0.9);
    body.castShadow = false;
    asteroid.add(body);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.82, 0.045, 4, 18),
      this.materials.cyan,
    );
    band.rotation.x = Math.PI / 2;
    asteroid.add(band);
    return asteroid;
  }

  private getTravelingAsteroidPinballRadius(): number {
    if (this.currentZone === "archive") return 12.2;
    return this.bounds.kind === "circle"
      ? Math.max(2, this.bounds.radius - 0.7)
      : Math.max(
          2,
          Math.min(this.bounds.halfWidth, this.bounds.halfDepth) - 0.7,
        );
  }

  private placeTravelingAsteroidAtArrival(
    state: TravelingAsteroidState,
  ): void {
    const anchor =
      state.arrivalFrom === null
        ? undefined
        : portalArrivalAnchors[this.currentZone][state.arrivalFrom];
    if (!anchor) {
      state.position.set(
        this.spawn.x + 1.15,
        state.size,
        this.spawn.z,
      );
      state.velocity.set(0, 0, 0);
      return;
    }
    const length = Math.max(0.001, Math.hypot(anchor.x, anchor.z));
    const inwardX = -anchor.x / length;
    const inwardZ = -anchor.z / length;
    state.position.set(
      anchor.x + inwardX * 2.65,
      state.size,
      anchor.z + inwardZ * 2.65,
    );
    state.velocity.set(inwardX * 2.6, 0, inwardZ * 2.6);
  }

  private mountTravelingAsteroidForCurrentZone(): void {
    const state = this.travelingAsteroid;
    if (!state || state.zone !== this.currentZone) return;
    state.object ??= this.createPinballAsteroidObject(state.size);
    state.shadow ??= this.createPinballAsteroidShadow(state.size);
    const asteroid = state.object;
    const shadow = state.shadow;
    if (asteroid.parent) {
      this.zoneGroup.attach(asteroid);
    } else {
      this.zoneGroup.add(asteroid);
    }
    if (shadow.parent) {
      this.zoneGroup.attach(shadow);
    } else {
      this.zoneGroup.add(shadow);
    }
    const arriving = state.needsArrivalPlacement;
    if (arriving) {
      this.placeTravelingAsteroidAtArrival(state);
      state.needsArrivalPlacement = false;
    }
    asteroid.position.copy(state.position);
    asteroid.quaternion.copy(state.quaternion);
    asteroid.visible = true;
    shadow.visible = true;
    const kickable = this.registerKickable(
      asteroid,
      state.size * 0.82,
      state.size,
      null,
      false,
      this.getTravelingAsteroidPinballRadius(),
      0.993,
      "The misrouted asteroid is still loose enough to reconsider its address.",
    );
    kickable.velocity.copy(state.velocity);
    kickable.kickCooldown = 0.85;
    state.portalCooldownUntil = this.elapsed + 0.85;
    this.archiveAsteroid = kickable;
    this.archiveAsteroidShadow = shadow;
    if (arriving && state.arrivalFrom) {
      this.portalNetwork.pulseDestination(state.arrivalFrom);
    }
    if (this.currentZone === "archive") {
      this.archiveOrbitPlayground.registerAsteroid(kickable);
    }
  }

  private stashTravelingAsteroidForZoneTeardown(): void {
    const state = this.travelingAsteroid;
    const kickable = this.archiveAsteroid;
    if (
      !state?.object ||
      state.zone !== this.currentZone ||
      kickable?.object !== state.object
    ) {
      return;
    }
    state.object.getWorldPosition(state.position);
    state.object.getWorldQuaternion(state.quaternion);
    state.velocity.copy(kickable.velocity);
    state.needsArrivalPlacement = false;
    this.scene.attach(state.object);
    state.object.visible = false;
    if (state.shadow) {
      this.scene.attach(state.shadow);
      state.shadow.visible = false;
    }
    kickable.enabled = false;
  }

  private routeTravelingAsteroid(
    kickable: Kickable,
    destination: ZoneId,
  ): void {
    const object = kickable.object as THREE.Group;
    const shadow = this.archiveAsteroidShadow;
    const state =
      this.travelingAsteroid ??
      ({
        object,
        shadow,
        zone: destination,
        arrivalFrom: this.currentZone,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        velocity: new THREE.Vector3(),
        size: kickable.restingY,
        needsArrivalPlacement: true,
        portalCooldownUntil: 0,
      } satisfies TravelingAsteroidState);
    this.travelingAsteroid = state;
    object.getWorldQuaternion(state.quaternion);
    state.object = object;
    state.shadow = shadow;
    state.zone = destination;
    state.arrivalFrom = this.currentZone;
    state.velocity.copy(kickable.velocity);
    state.needsArrivalPlacement = true;
    state.portalCooldownUntil = this.elapsed + 1.1;
    this.scene.attach(object);
    object.visible = false;
    if (shadow) {
      this.scene.attach(shadow);
      shadow.visible = false;
    }
    kickable.enabled = false;
    this.archiveAsteroid = null;
    this.archiveAsteroidShadow = null;
    this.emitProgressChange();
  }

  private disposeTravelingAsteroid(): void {
    const state = this.travelingAsteroid;
    if (!state) return;
    if (state.object) {
      this.scene.remove(state.object);
      disposeObjectTree(
        state.object,
        (material) => !this.sharedMaterials.has(material),
      );
    }
    if (state.shadow) {
      this.scene.remove(state.shadow);
      disposeObjectTree(state.shadow);
    }
    state.object = null;
    state.shadow = null;
    this.travelingAsteroid = null;
  }

  private createPinballAsteroid(
    parent: THREE.Group,
    x: number,
    z: number,
    size: number,
  ): void {
    if (this.travelingAsteroid) return;
    const shadow = this.createPinballAsteroidShadow(size);
    shadow.position.set(x, 0.125, z);
    parent.add(shadow);
    this.archiveAsteroidShadow = shadow;

    const asteroid = this.createPinballAsteroidObject(size);
    asteroid.position.set(x, size, z);
    parent.add(asteroid);
    const kickable = this.registerKickable(
      asteroid,
      size * 0.82,
      size,
      null,
      false,
      12.2,
      0.993,
      "The loose asteroid skitters across the floor, faster than its size suggests.",
    );
    this.archiveAsteroid = kickable;
    this.archiveOrbitPlayground.registerAsteroid(kickable);
  }

  private createFloatingAsteroid(
    parent: THREE.Group,
    x: number,
    y: number,
    z: number,
    size: number,
  ): void {
    const asteroid = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      this.materials.darkStone,
    );
    asteroid.position.set(x, y, z);
    asteroid.scale.set(1, 0.78, 0.9);
    asteroid.castShadow = size > 0.85;
    parent.add(asteroid);
    this.animatedItems.push({
      object: asteroid,
      originY: y,
      phase: x * 0.4 + z * 0.2,
      amplitude: 0.18,
      rotationSpeed: 0.12 + size * 0.04,
    });
    const kickable = this.registerKickable(
      asteroid,
      size * 0.78,
      y,
      null,
      false,
      14.2,
      0.997,
      "A floating asteroid slips from its station and glides into the room.",
    );
    this.archiveOrbitPlayground.registerAsteroid(kickable);
  }

  private batchStaticVisuals(): void {
    const protectedObjects = new Set<THREE.Object3D>();
    const occlusionProxyObjects = new Set<THREE.Object3D>();
    const protect = (root: THREE.Object3D | null): void => {
      if (!root) return;
      root.traverse((object) => {
        protectedObjects.add(object);
        if (object instanceof THREE.Mesh) object.castShadow = false;
      });
    };

    for (const item of this.animatedItems) protect(item.object);
    // Keep the original hierarchy as a camera-invisible collision proxy while
    // still merging its visible geometry. Raycasts use a dedicated layer; the
    // camera sees only the world-space batch, so this costs memory rather than
    // additional draw calls and cannot lose a positioned parent's transform.
    for (const occluder of this.playerOccluders.objects) {
      occluder.traverse((object) => {
        object.layers.enable(playerOcclusionLayer);
        occlusionProxyObjects.add(object);
      });
    }
    for (const pointerAction of this.pointerActions) {
      protect(pointerAction.object);
    }
    for (const instanceDrag of this.mathInstanceDrags) {
      protect(instanceDrag.object);
    }
    this.mightymaticaZone?.forEachDynamicObject(protect);
    protect(this.splashRing);
    protect(this.splashBurst?.drops ?? null);
    protect(this.runeAltar?.object ?? null);
    protect(this.fallsCrystalFrogRoot);
    this.fallsRuneRitual.forEachDynamicObject(protect);
    this.archiveOrbitPlayground.forEachDynamicObject(protect);
    this.archiveSignalPuzzle.forEachDynamicObject(protect);
    this.voidTurtleRide.forEachDynamicObject(protect);
    this.hanoiPuzzle.forEachDynamicObject(protect);
    this.gridServerPatchPuzzle.forEachDynamicObject(protect);
    for (const kickable of this.kickables) protect(kickable.object);
    for (const telescope of this.telescopeRigs) protect(telescope.pivot);
    for (const npc of this.wanderingNpcs) protect(npc.group);
    for (const lantern of this.lanterns) {
      protect(lantern.light);
      protect(lantern.pool);
    }
    for (const rack of this.serverRacks) {
      for (const bar of rack.bars) protect(bar);
    }
    this.pongChallenge.forEachDynamicObject(protect);
    for (const terrainName of [
      "world-terrain-foundation",
      "world-terrain-surface",
    ]) {
      protect(this.zoneGroup.getObjectByName(terrainName) ?? null);
    }
    for (const child of this.zoneGroup.children) {
      if (child.name === "world-rock-cluster") protect(child);
    }

    this.zoneGroup.updateMatrixWorld(true);
    const rootInverse = this.zoneGroup.matrixWorld.clone().invert();
    const geometryKey = (geometry: THREE.BufferGeometry): string => {
      const attributes = Object.entries(geometry.attributes)
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${Number(attribute.normalized)}`)
        .sort()
        .join(",");
      return `${geometry.index ? "indexed" : "plain"}|${attributes}`;
    };

    interface MeshBucket {
      material: THREE.Material;
      castShadow: boolean;
      receiveShadow: boolean;
      clickNavigationPassThrough: boolean;
      meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[];
    }

    const meshBuckets = new Map<string, MeshBucket>();
    this.zoneGroup.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        object instanceof THREE.SkinnedMesh ||
        protectedObjects.has(object) ||
        Array.isArray(object.material) ||
        object.material.transparent ||
        Object.keys(object.geometry.morphAttributes).length > 0
      ) {
        return;
      }

      const clickNavigationPassThrough =
        isClickNavigationPassThrough(object);
      const key = [
        object.material.uuid,
        Number(object.castShadow),
        Number(object.receiveShadow),
        Number(clickNavigationPassThrough),
        geometryKey(object.geometry),
      ].join("|");
      const bucket: MeshBucket = meshBuckets.get(key) ?? {
          material: object.material,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
          clickNavigationPassThrough,
          meshes: [],
        };
      bucket.meshes.push(object);
      meshBuckets.set(key, bucket);
    });

    let batchIndex = 0;
    for (const bucket of meshBuckets.values()) {
      if (bucket.meshes.length < 2) continue;
      const copies = bucket.meshes.map((mesh) => {
        const relativeMatrix = new THREE.Matrix4().multiplyMatrices(
          rootInverse,
          mesh.matrixWorld,
        );
        return mesh.geometry.clone().applyMatrix4(relativeMatrix);
      });
      const geometry = mergeGeometries(copies, false);
      if (!geometry) {
        for (const copy of copies) copy.dispose();
        continue;
      }

      const batch = new THREE.Mesh(geometry, bucket.material);
      accelerateStaticBatchRaycast(batch, copies);
      for (const copy of copies) copy.dispose();
      batch.name = `static-mesh-batch-${batchIndex}`;
      batch.castShadow = bucket.castShadow;
      batch.receiveShadow = bucket.receiveShadow;
      batch.userData.clickNavigationPassThrough =
        bucket.clickNavigationPassThrough;
      batchIndex += 1;

      for (const mesh of bucket.meshes) {
        if (occlusionProxyObjects.has(mesh)) {
          mesh.layers.disable(0);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        } else {
          mesh.removeFromParent();
          mesh.geometry.dispose();
        }
      }
      this.zoneGroup.add(batch);
    }

    interface LineBucket {
      material: THREE.Material;
      lines: THREE.LineSegments<THREE.BufferGeometry, THREE.Material>[];
    }

    const lineBuckets = new Map<string, LineBucket>();
    this.zoneGroup.traverse((object) => {
      if (
        !(object instanceof THREE.LineSegments) ||
        protectedObjects.has(object) ||
        Array.isArray(object.material)
      ) {
        return;
      }
      const key = `${object.material.uuid}|${geometryKey(object.geometry)}`;
      const bucket: LineBucket = lineBuckets.get(key) ?? {
          material: object.material,
          lines: [],
        };
      bucket.lines.push(object);
      lineBuckets.set(key, bucket);
    });

    for (const bucket of lineBuckets.values()) {
      if (bucket.lines.length < 2) continue;
      const copies = bucket.lines.map((line) => {
        const relativeMatrix = new THREE.Matrix4().multiplyMatrices(
          rootInverse,
          line.matrixWorld,
        );
        return line.geometry.clone().applyMatrix4(relativeMatrix);
      });
      const geometry = mergeGeometries(copies, false);
      for (const copy of copies) copy.dispose();
      if (!geometry) continue;

      geometry.computeBoundingSphere();
      const batch = new THREE.LineSegments(geometry, bucket.material);
      batch.name = `static-line-batch-${batchIndex}`;
      batchIndex += 1;
      for (const line of bucket.lines) {
        if (occlusionProxyObjects.has(line)) {
          line.layers.disable(0);
        } else {
          line.removeFromParent();
          line.geometry.dispose();
        }
      }
      this.zoneGroup.add(batch);
    }
  }

  private addInteraction(
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
    requiresLantern = false,
    maximumPlayerElevation = Number.POSITIVE_INFINITY,
  ): Interaction {
    const interaction: Interaction = {
      id,
      label,
      position: new THREE.Vector3(x, 0, z),
      radius,
      action,
      requiresLantern,
      maximumPlayerElevation,
    };
    this.interactions.push(interaction);
    return interaction;
  }

  private updateInteractionLabel(id: string, label: string): void {
    const interaction = this.interactions.find((candidate) => candidate.id === id);
    if (!interaction) return;
    interaction.label = label;
    if (this.activeInteraction?.id === id) this.hooks.onInteractionChange(label);
  }

  private moveWithCollisions(
    target: THREE.Vector3,
    previousFeetHeight: number,
  ): void {
    const deltaX = target.x - this.playerPosition.x;
    const deltaZ = target.z - this.playerPosition.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaZ) / 0.22));
    const stepX = deltaX / steps;
    const stepZ = deltaZ / steps;

    for (let step = 0; step < steps; step += 1) {
      const nextX = this.playerPosition.x + stepX;
      if (
        this.tryGroundedStep(nextX, this.playerPosition.z, previousFeetHeight) ||
        !this.collidesAt(
          nextX,
          this.playerPosition.z,
          previousFeetHeight,
        )
      ) {
        this.playerPosition.x = nextX;
      }

      const nextZ = this.playerPosition.z + stepZ;
      if (
        this.tryGroundedStep(this.playerPosition.x, nextZ, previousFeetHeight) ||
        !this.collidesAt(
          this.playerPosition.x,
          nextZ,
          previousFeetHeight,
        )
      ) {
        this.playerPosition.z = nextZ;
      }
    }
    this.playerPosition.y = this.spawn.y;
  }

  private tryGroundedStep(x: number, z: number, previousFeetHeight: number): boolean {
    if (this.jumpHeight > 0 || this.jumpVelocity !== 0) return false;
    const candidates = this.surfaceAreaIndex.queryPoint(
      x, z, 0.12, this.surfaceAreaCandidates,
    );
    const support = selectWalkingStepSurface(
      candidates, x, z, this.surfaceOffset, this.containsWalkingSupport,
    );
    if (!support) return false;
    const height = support.heightAt(x, z);
    if (Math.abs(height - this.surfaceOffset) < 0.001) return false;

    // Test clearance from the next tread, not the lower frame-start floor.
    // The player's radius can already touch the following riser on this move.
    // Commit each legal substep so manual movement agrees with route planning.
    const previousOffset = this.surfaceOffset;
    this.surfaceOffset = height;
    if (this.collidesAt(x, z, previousFeetHeight, false)) {
      this.surfaceOffset = previousOffset;
      return false;
    }
    this.activePlatform = support;
    return true;
  }

  private resolveStaticColliderPenetration(
    position: { x: number; z: number },
    feetHeight: number,
    previousFeetHeight: number,
  ): boolean {
    const radiusSquared = this.playerRadius * this.playerRadius;
    let corrected = false;

    // Composite cliffs can overlap, so repeat a bounded number of times. Each
    // pass moves the player to the nearest boundary of at least one solid.
    for (let pass = 0; pass < 4; pass += 1) {
      let correctedThisPass = false;
      let lastProcessedOrder = -1;
      let candidateIndex = 0;
      this.staticColliderIndex.queryPoint(
        position.x,
        position.z,
        this.playerRadius,
        this.staticColliderCandidates,
      );
      while (candidateIndex < this.staticColliderCandidates.length) {
        const collider =
          this.staticColliderCandidates[candidateIndex];
        candidateIndex += 1;
        if (!collider) continue;
        const colliderOrder =
          this.staticColliderIndex.orderOf(collider);
        if (colliderOrder <= lastProcessedOrder) continue;
        lastProcessedOrder = colliderOrder;
        if (collider.enabled === false) continue;
        const solidTop = collider.solidTop;
        const crossedSolidTop =
          solidTop !== undefined &&
          this.jumpVelocity < 0 &&
          previousFeetHeight >= solidTop - 0.015 &&
          feetHeight <= solidTop + 0.015;
        const colliderBottom = collider.y - collider.halfHeight;
        if (
          !crossedSolidTop &&
          feetHeight + this.playerCollisionHeight <=
            colliderBottom + 0.015
        ) {
          continue;
        }
        if (
          collider.intersectsHorizontal &&
          !collider.intersectsHorizontal(
            position.x,
            position.z,
            this.playerRadius,
          )
        ) {
          continue;
        }

        if (solidTop !== undefined && feetHeight >= solidTop - 0.002) {
          continue;
        }
        if (
          solidTop !== undefined &&
          this.jumpHeight <= 0 && this.jumpVelocity <= 0 &&
          isWithinWalkingStep(feetHeight, solidTop, collider.stepHeight)
        ) continue;
        const ascendingThroughClimbClearance =
          collider.clearAbove !== undefined &&
          this.jumpVelocity > 0 &&
          feetHeight >= collider.clearAbove - 0.01;
        if (ascendingThroughClimbClearance) continue;
        const crossingLandableTop =
          crossedSolidTop &&
          this.hasLandingSurfaceAt(
            position.x,
            position.z,
            solidTop,
          );
        if (crossingLandableTop) continue;

        const nearestX = THREE.MathUtils.clamp(
          position.x,
          collider.x - collider.halfWidth,
          collider.x + collider.halfWidth,
        );
        const nearestZ = THREE.MathUtils.clamp(
          position.z,
          collider.z - collider.halfDepth,
          collider.z + collider.halfDepth,
        );
        const dx = position.x - nearestX;
        const dz = position.z - nearestZ;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= radiusSquared) continue;

        if (distanceSquared > 0.0000001) {
          const distance = Math.sqrt(distanceSquared);
          const separation = this.playerRadius + 0.006;
          position.x = nearestX + (dx / distance) * separation;
          position.z = nearestZ + (dz / distance) * separation;
        } else {
          const minimumX =
            collider.x - collider.halfWidth - this.playerRadius;
          const maximumX =
            collider.x + collider.halfWidth + this.playerRadius;
          const minimumZ =
            collider.z - collider.halfDepth - this.playerRadius;
          const maximumZ =
            collider.z + collider.halfDepth + this.playerRadius;
          const leftDistance = position.x - minimumX;
          const rightDistance = maximumX - position.x;
          const nearDistance = position.z - minimumZ;
          const farDistance = maximumZ - position.z;
          const minimumDistance = Math.min(
            leftDistance,
            rightDistance,
            nearDistance,
            farDistance,
          );
          if (minimumDistance === leftDistance) {
            position.x = minimumX - 0.006;
          } else if (minimumDistance === rightDistance) {
            position.x = maximumX + 0.006;
          } else if (minimumDistance === nearDistance) {
            position.z = minimumZ - 0.006;
          } else {
            position.z = maximumZ + 0.006;
          }
        }
        corrected = true;
        correctedThisPass = true;
        // A correction can move the player into a later collider that was not
        // near the pass's starting point. Re-query live bounds, but never
        // revisit an earlier registration: that exactly mirrors the original
        // insertion-ordered full-array pass.
        this.staticColliderIndex.queryPoint(
          position.x,
          position.z,
          this.playerRadius,
          this.staticColliderCandidates,
        );
        candidateIndex = 0;
      }
      if (!correctedThisPass) break;
    }

    if (corrected) {
      this.constrainToBounds(this.playerPosition);
      // Opposing faces in a narrow gap can undo each other's corrections.
      // Prefer a still-valid grounded pose over that unresolved oscillation.
      if (this.collidesAt(position.x, position.z, previousFeetHeight, false)) {
        return this.restoreCollisionSafeLanding(position);
      }
    }
    return false;
  }

  private restoreCollisionSafeLanding(position: { x: number; z: number }): boolean {
    const safe = this.collisionSafeLanding;
    if (
      !safe.valid ||
      (safe.surface && !this.surfaceContainsPoint(safe.surface, safe.x, safe.z))
    ) return false;
    const previousOffset = this.surfaceOffset;
    const previousJump = this.jumpHeight;
    const previousVelocity = this.jumpVelocity;
    const recoveryX = position.x;
    const recoveryZ = position.z;
    this.surfaceOffset = safe.surface?.heightAt(safe.x, safe.z) ?? safe.height;
    this.resetJump();
    if (this.collidesAt(safe.x, safe.z, this.surfaceOffset, false)) {
      // A movable prop may have occupied the saved position since takeoff.
      this.surfaceOffset = previousOffset;
      this.jumpHeight = previousJump;
      this.jumpVelocity = previousVelocity;
      return false;
    }
    position.x = safe.x;
    position.z = safe.z;
    this.navigation.recordCollisionRecovery(
      recoveryX, previousOffset + previousJump, recoveryZ,
      safe.x, this.surfaceOffset, safe.z, safe.surface?.id ?? null,
    );
    this.activePlatform = safe.surface;
    this.playerInWater =
      this.currentZone === "falls" &&
      (isWadingInFallsPool(safe.x, safe.z, this.surfaceOffset) ||
        (isInsideFallsRiver(safe.x, safe.z) && this.surfaceOffset < 0.05));
    this.shadowSurfaceY = this.playerInWater && this.surfaceOffset > 1
      ? fallsLandmarks.basin.water + 0.016
      : safe.surface
      ? this.surfaceOffset + 0.016
      : this.playerInWater ? 0.235 : 0.16;
    this.shadowVerticalDistance = 0;
    this.airbornePeakHeight = 0;
    this.fallsDiveFromCrown = false;
    return true;
  }

  private collidesAt(
    x: number,
    z: number,
    previousFeetHeight: number,
    allowEscape = true,
  ): boolean {
    const feetHeight = this.surfaceOffset + this.jumpHeight;
    const candidates = this.staticColliderIndex.queryPoint(
      x,
      z,
      this.playerRadius,
      this.staticColliderCandidates,
    );
    for (const collider of candidates) {
      if (collider.enabled === false) continue;
      const solidTop = collider.solidTop;
      if (solidTop !== undefined) {
        const onOrAboveSolid = feetHeight >= solidTop - 0.01;
        const walkingStep =
          this.jumpHeight <= 0 && this.jumpVelocity <= 0 &&
          isWithinWalkingStep(feetHeight, solidTop, collider.stepHeight);
        const ascendingThroughClimbClearance =
          collider.clearAbove !== undefined &&
          this.jumpVelocity > 0 &&
          feetHeight >= collider.clearAbove - 0.01;
        const crossingSolidTopFromAbove =
          this.jumpVelocity < 0 &&
          previousFeetHeight >= solidTop - 0.01 &&
          feetHeight < solidTop - 0.01;
        if (onOrAboveSolid || walkingStep || ascendingThroughClimbClearance) continue;
        if (
          crossingSolidTopFromAbove &&
          this.hasLandingSurfaceAt(x, z, solidTop)
        ) {
          continue;
        }
      }
      const colliderBottom = collider.y - collider.halfHeight;
      if (
        feetHeight + this.playerCollisionHeight <=
        colliderBottom + 0.015
      ) {
        continue;
      }
      const proposedNearestX = THREE.MathUtils.clamp(
        x,
        collider.x - collider.halfWidth,
        collider.x + collider.halfWidth,
      );
      const proposedNearestZ = THREE.MathUtils.clamp(
        z,
        collider.z - collider.halfDepth,
        collider.z + collider.halfDepth,
      );
      const proposedDx = x - proposedNearestX;
      const proposedDz = z - proposedNearestZ;
      const proposedDistance =
        proposedDx * proposedDx + proposedDz * proposedDz;
      const radiusSquared = this.playerRadius * this.playerRadius;
      if (
        collider.intersectsHorizontal &&
        !collider.intersectsHorizontal(x, z, this.playerRadius)
      ) {
        continue;
      }
      if (proposedDistance >= radiusSquared) continue;
      if (!allowEscape) return true;

      const currentNearestX = THREE.MathUtils.clamp(
        this.playerPosition.x,
        collider.x - collider.halfWidth,
        collider.x + collider.halfWidth,
      );
      const currentNearestZ = THREE.MathUtils.clamp(
        this.playerPosition.z,
        collider.z - collider.halfDepth,
        collider.z + collider.halfDepth,
      );
      const currentDx = this.playerPosition.x - currentNearestX;
      const currentDz = this.playerPosition.z - currentNearestZ;
      const currentDistance =
        currentDx * currentDx + currentDz * currentDz;

      // A climbable collider can reactivate while the player is still within
      // its padded edge. Permit motion that reduces an existing overlap so a
      // console, table, or monitor can never become a one-way collision trap.
      const currentIntersects =
        !collider.intersectsHorizontal ||
        collider.intersectsHorizontal(
          this.playerPosition.x,
          this.playerPosition.z,
          this.playerRadius,
        );
      if (currentIntersects && currentDistance < radiusSquared) {
        if (proposedDistance > currentDistance + 0.000001) continue;
        if (currentDistance <= 0.000001 && proposedDistance <= 0.000001) {
          const minimumX =
            collider.x - collider.halfWidth - this.playerRadius;
          const maximumX =
            collider.x + collider.halfWidth + this.playerRadius;
          const minimumZ =
            collider.z - collider.halfDepth - this.playerRadius;
          const maximumZ =
            collider.z + collider.halfDepth + this.playerRadius;
          const currentPenetration = Math.min(
            this.playerPosition.x - minimumX,
            maximumX - this.playerPosition.x,
            this.playerPosition.z - minimumZ,
            maximumZ - this.playerPosition.z,
          );
          const proposedPenetration = Math.min(
            x - minimumX,
            maximumX - x,
            z - minimumZ,
            maximumZ - z,
          );
          if (proposedPenetration < currentPenetration - 0.000001) continue;
        }
      }
      return true;
    }
    return false;
  }

  private clearCollisionDebugVisuals(): void {
    for (const child of [...this.collisionDebugGroup.children]) {
      this.collisionDebugGroup.remove(child);
      if (child instanceof THREE.LineSegments) child.geometry.dispose();
    }
  }

  private refreshCollisionDebugVisuals(): void {
    this.clearCollisionDebugVisuals();
    this.collisionDebugGroup.visible = this.collisionDebugEnabled;
    if (!this.collisionDebugEnabled) return;

    const addMergedBoxes = (
      boxes: readonly {
        x: number;
        y: number;
        z: number;
        width: number;
        height: number;
        depth: number;
      }[],
      material: THREE.LineBasicMaterial,
      name: string,
    ): void => {
      const geometries: THREE.BufferGeometry[] = [];
      for (const box of boxes) {
        const solid = new THREE.BoxGeometry(
          Math.max(0.01, box.width),
          Math.max(0.01, box.height),
          Math.max(0.01, box.depth),
        );
        const edges = new THREE.EdgesGeometry(solid);
        solid.dispose();
        edges.translate(box.x, box.y, box.z);
        geometries.push(edges);
      }
      if (geometries.length === 0) return;
      const geometry = mergeGeometries(geometries, false);
      for (const candidate of geometries) candidate.dispose();
      if (!geometry) return;
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = name;
      lines.frustumCulled = false;
      lines.renderOrder = 3000;
      this.collisionDebugGroup.add(lines);
    };

    addMergedBoxes(
      this.staticColliders
        .filter((collider) => collider.enabled !== false)
        .map((collider) => {
          const bottom = collider.y - collider.halfHeight;
          // Coral is the volume the penetration solver enforces. Side clearance
          // may begin slightly lower, but does not erase this solid on descent.
          const top =
            collider.solidTop ?? collider.y + collider.halfHeight;
          const height = Math.max(0.01, top - bottom);
          return {
            x: collider.x,
            y: bottom + height / 2,
            z: collider.z,
            width: collider.halfWidth * 2,
            height,
            depth: collider.halfDepth * 2,
          };
        }),
      this.collisionDebugBlockerMaterial,
      "collision-debug-blockers",
    );

    const landingSurfacePositions: number[] = [];
    const addLandingSurfaceSegment = (
      surface: SurfaceArea,
      startX: number,
      startZ: number,
      endX: number,
      endZ: number,
    ): void => {
      if (
        surface.contains &&
        !surface.contains(
          (startX + endX) * 0.5,
          (startZ + endZ) * 0.5,
          0,
        )
      ) {
        return;
      }
      landingSurfacePositions.push(
        startX,
        surface.heightAt(startX, startZ) + 0.035,
        startZ,
        endX,
        surface.heightAt(endX, endZ) + 0.035,
        endZ,
      );
    };
    for (const surface of this.surfaceAreas) {
      if (surface.enabled === false) continue;
      if (surface.halfWidth <= 0 || surface.halfDepth <= 0) continue;
      const supportMargin =
        surface.supportMargin ??
        (surface.requiresJump ? this.playerRadius * 0.34 : 0);
      const halfWidth = surface.halfWidth + supportMargin;
      const halfDepth = surface.halfDepth + supportMargin;
      const resolution = THREE.MathUtils.clamp(
        Math.floor(surface.debugResolution ?? 1),
        1,
        16,
      );
      for (let xStep = 0; xStep <= resolution; xStep += 1) {
        const worldX = THREE.MathUtils.lerp(
          surface.x - halfWidth,
          surface.x + halfWidth,
          xStep / resolution,
        );
        for (let zStep = 0; zStep < resolution; zStep += 1) {
          const startZ = THREE.MathUtils.lerp(
            surface.z - halfDepth,
            surface.z + halfDepth,
            zStep / resolution,
          );
          const endZ = THREE.MathUtils.lerp(
            surface.z - halfDepth,
            surface.z + halfDepth,
            (zStep + 1) / resolution,
          );
          addLandingSurfaceSegment(
            surface,
            worldX,
            startZ,
            worldX,
            endZ,
          );
        }
      }
      for (let zStep = 0; zStep <= resolution; zStep += 1) {
        const worldZ = THREE.MathUtils.lerp(
          surface.z - halfDepth,
          surface.z + halfDepth,
          zStep / resolution,
        );
        for (let xStep = 0; xStep < resolution; xStep += 1) {
          const startX = THREE.MathUtils.lerp(
            surface.x - halfWidth,
            surface.x + halfWidth,
            xStep / resolution,
          );
          const endX = THREE.MathUtils.lerp(
            surface.x - halfWidth,
            surface.x + halfWidth,
            (xStep + 1) / resolution,
          );
          addLandingSurfaceSegment(
            surface,
            startX,
            worldZ,
            endX,
            worldZ,
          );
        }
      }
    }
    if (landingSurfacePositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(landingSurfacePositions, 3),
      );
      const lines = new THREE.LineSegments(
        geometry,
        this.collisionDebugSurfaceMaterial,
      );
      lines.name = "collision-debug-landing-surfaces";
      lines.frustumCulled = false;
      lines.renderOrder = 3000;
      this.collisionDebugGroup.add(lines);
    }
  }

  private addStaticCollider(
    collider: StaticCollider,
    mutable = false,
  ): void {
    this.walkingGeometryRevision += 1;
    this.staticColliderIndex.add(collider, mutable);
    this.staticColliders.push(collider);
  }

  private removeStaticCollider(collider: StaticCollider): void {
    this.walkingGeometryRevision += 1;
    const index = this.staticColliders.indexOf(collider);
    if (index < 0) return;
    this.staticColliderIndex.remove(collider);
    this.staticColliders.splice(index, 1);
  }

  private clearStaticColliders(): void {
    this.walkingGeometryRevision += 1;
    this.staticColliders.length = 0;
    this.staticColliderCandidates.length = 0;
    this.staticColliderIndex.clear();
  }

  private addSurfaceArea(
    surface: SurfaceArea,
    mutable = false,
  ): void {
    this.walkingGeometryRevision += 1;
    this.surfaceAreaIndex.add(surface, mutable);
    this.surfaceAreas.push(surface);
  }

  private removeSurfaceArea(surface: SurfaceArea): void {
    this.walkingGeometryRevision += 1;
    const index = this.surfaceAreas.indexOf(surface);
    if (index < 0) return;
    this.surfaceAreaIndex.remove(surface);
    this.surfaceAreas.splice(index, 1);
  }

  private clearSurfaceAreas(): void {
    this.walkingGeometryRevision += 1;
    this.surfaceAreas.length = 0;
    this.surfaceAreaCandidates.length = 0;
    this.surfaceAreaIndex.clear();
  }

  private addStaticBox(
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
    solidTop = clearAbove,
  ): StaticCollider {
    const collider: StaticCollider = {
      x,
      y,
      z,
      halfWidth,
      halfHeight,
      halfDepth,
      clearAbove,
      solidTop,
    };
    this.addStaticCollider(collider);
    return collider;
  }

  private registerClimbableBox(
    object: THREE.Object3D,
    id: string | null,
    landingMessage?: string,
    collisionClearAbove?: number,
    occludesPlayer = true,
    blocksRay = true,
    stepHeight?: number,
  ): SurfaceArea | null {
    // The rendered object and its climb/collision volume describe the same
    // solid. Registering them together prevents cliffs, terraces, monitors,
    // and parkour slabs from hiding the avatar without its silhouette.
    if (occludesPlayer) this.registerPlayerOccluder(object);
    object.updateWorldMatrix(true, true);
    this.tempBounds.setFromObject(object);
    const minimum = this.tempBounds.min;
    const maximum = this.tempBounds.max;
    const halfWidth = Math.max(0.025, (maximum.x - minimum.x) / 2);
    const halfHeight = Math.max(0.025, (maximum.y - minimum.y) / 2);
    const halfDepth = Math.max(0.025, (maximum.z - minimum.z) / 2);
    const x = (minimum.x + maximum.x) / 2;
    const y = (minimum.y + maximum.y) / 2;
    const z = (minimum.z + maximum.z) / 2;
    const top = maximum.y;
    const collider = this.addStaticBox(
      x,
      y,
      z,
      halfWidth,
      halfHeight,
      halfDepth,
      collisionClearAbove ?? top - 0.005,
      top,
    );
    collider.blocksRay = blocksRay;
    collider.stepHeight = stepHeight;
    if (!id) return null;
    const surface: SurfaceArea = {
      id,
      x,
      z,
      halfWidth: Math.max(0.02, halfWidth - 0.005),
      halfDepth: Math.max(0.02, halfDepth - 0.005),
      requiresJump: true,
      supportMargin: 0.12,
      edgeGrace: 0.12,
      landingMessage,
      heightAt: () => top,
    };
    this.addSurfaceArea(surface);
    return surface;
  }

  private constrainToBounds(position: THREE.Vector3): void {
    if (this.bounds.kind === "circle") {
      const distance = Math.hypot(position.x, position.z);
      let maximum = this.bounds.radius - worldBoundaryInset;
      const turtleSurface =
        this.currentZone === "field"
          ? this.voidTurtleRide.getShellSurface()
          : null;
      if (turtleSurface && (this.jumpHeight > 0 || this.activePlatform === turtleSurface) && distance > 0.001) {
        const turtleDistance = Math.hypot(
          turtleSurface.x,
          turtleSurface.z,
        );
        const alignment =
          (position.x * turtleSurface.x +
            position.z * turtleSurface.z) /
          Math.max(0.001, distance * turtleDistance);
        if (alignment > 0.955) {
          maximum = Math.max(maximum, turtleDistance + 2.4);
        }
      }
      if (distance > maximum) {
        const ratio = maximum / distance;
        position.x *= ratio;
        position.z *= ratio;
      }
      return;
    }

    position.x = THREE.MathUtils.clamp(
      position.x,
      -this.bounds.halfWidth + worldBoundaryInset,
      this.bounds.halfWidth - worldBoundaryInset,
    );
    position.z = THREE.MathUtils.clamp(
      position.z,
      -this.bounds.halfDepth + worldBoundaryInset,
      this.bounds.halfDepth - worldBoundaryInset,
    );
  }

  private isInsidePlayableBounds(x: number, z: number): boolean {
    return insideWorldBounds(x, z, this.bounds);
  }

  private readonly resize = (): void => {
    if (!this.renderer) return;
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, parent?.clientHeight ?? window.innerHeight);
    const aspect = width / height;
    const viewHeight = aspect < 0.72 ? 21 : aspect < 1 ? 18 : 15.5;
    const halfHeight = viewHeight / 2;
    const halfWidth = halfHeight * aspect;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly handleVisibility = (): void => {
    this.documentVisible = !document.hidden;
    this.performanceMonitor?.discontinuity(this.documentVisible ? "visible" : "hidden");
    if (!this.documentVisible) {
      this.pendingPointerHover = null;
      this.hoverPointerActiveUntil = 0;
    }
    if (!this.documentVisible && this.heldKickable &&
      this.fallsCrystalFrog.owns(this.heldKickable)) {
      this.cancelTelekinesisHold();
    }
    this.previousFrame = performance.now();
    this.framePacer.reset();
    this.frameTimingWindow.reset();
    if (!this.running) return;
    this.renderer.setAnimationLoop(this.documentVisible ? this.frame : null);
  };

  private readonly handleWindowBlur = (): void => {
    this.performanceMonitor?.event("window-blur");
    this.pendingPointerHover = null;
    this.hoverPointerActiveUntil = 0;
    if (this.heldKickable && this.fallsCrystalFrog.owns(this.heldKickable)) {
      this.cancelTelekinesisHold();
    }
    this.windowFocused = false;
    this.windowFocusRecoveredAt = Number.NEGATIVE_INFINITY;
  };

  private readonly handleWindowFocus = (): void => {
    this.performanceMonitor?.event("window-focus");
    if (!this.windowFocused) {
      this.windowFocusRecoveredAt = performance.now();
    }
    this.windowFocused = true;
  };

  private consumeFocusReclaimPointer(): boolean {
    const now = performance.now();
    const justRecovered =
      now - this.windowFocusRecoveredAt >= 0 &&
      now - this.windowFocusRecoveredAt < 160;
    const focusOnly =
      !this.windowFocused ||
      !document.hasFocus() ||
      justRecovered;
    this.windowFocused = true;
    if (focusOnly) {
      // Consume only the pointer that restored focus. A deliberate second
      // click may navigate immediately, even inside the 160 ms guard.
      this.windowFocusRecoveredAt = Number.NEGATIVE_INFINITY;
    }
    return focusOnly;
  }

  private findPointedMathInstanceDrag(
    event: PointerEvent,
  ): MathInstanceDragHit | null {
    if (this.mathInstanceDrags.length === 0) return null;
    this.updatePointerRay(event);
    let closest: MathInstanceDragHit | null = null;
    const previousLayerMask = this.pointerRaycaster.layers.mask;
    try {
      for (const spec of this.mathInstanceDrags) {
        if (!spec.object.visible) continue;
        spec.object.updateWorldMatrix(true, false);
        // Some interactions use camera-invisible pick volumes. Match the
        // registered object's layer for this isolated raycast, then restore the
        // normal world-picking mask before checking the next input system.
        this.pointerRaycaster.layers.mask = spec.object.layers.mask;
        this.mathInstanceDragHits.length = 0;
        this.pointerRaycaster.intersectObject(
          spec.object,
          false,
          this.mathInstanceDragHits,
        );
        for (const hit of this.mathInstanceDragHits) {
          if (
            hit.instanceId === undefined ||
            (closest && hit.distance >= closest.distance)
          ) {
            continue;
          }
          closest = {
            spec,
            instanceId: hit.instanceId,
            point: hit.point.clone(),
            distance: hit.distance,
          };
        }
      }
    } finally {
      this.pointerRaycaster.layers.mask = previousLayerMask;
    }
    return closest;
  }

  private beginMathInstanceDrag(event: PointerEvent): boolean {
    if (
      this.mathInstanceDragHold ||
      this.telekinesisPointerId !== null
    ) {
      return false;
    }
    const hit = this.findPointedMathInstanceDrag(event);
    if (!hit) return false;
    const kickableHit = this.findPointedKickableHit(event);
    if (kickableHit && kickableHit.distance < hit.distance) return false;

    const currentWorldPosition = hit.spec.getWorldPosition(
      hit.instanceId,
      new THREE.Vector3(),
    );
    const planeY = Math.max(1.05, currentWorldPosition.y + 0.42);
    const plane = new THREE.Plane(up, -planeY);
    const point = new THREE.Vector3();
    this.updatePointerRay(event);
    if (!this.pointerRaycaster.ray.intersectPlane(plane, point)) {
      point.copy(currentWorldPosition);
      point.y = planeY;
    }
    const grabOffset = new THREE.Vector3(
      currentWorldPosition.x - point.x,
      0,
      currentWorldPosition.z - point.z,
    );
    currentWorldPosition.y = planeY;
    const hold: MathInstanceDragHold = {
      spec: hit.spec,
      instanceId: hit.instanceId,
      pointerId: event.pointerId,
      plane,
      point,
      currentWorldPosition,
      previousWorldPosition: currentWorldPosition.clone(),
      grabOffset,
      velocity: new THREE.Vector3(),
      previousTime: event.timeStamp,
    };
    this.mathInstanceDragHold = hold;
    hit.spec.onStart(hit.instanceId);
    hit.spec.onMove(
      hit.instanceId,
      hold.currentWorldPosition,
      hold.velocity,
    );
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updateMathInstanceDrag(event: PointerEvent): boolean {
    const hold = this.mathInstanceDragHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    this.updatePointerRay(event);
    if (!this.pointerRaycaster.ray.intersectPlane(hold.plane, hold.point)) {
      event.preventDefault();
      return true;
    }
    hold.currentWorldPosition
      .copy(hold.point)
      .add(hold.grabOffset);
    this.constrainToBounds(hold.currentWorldPosition);
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (event.timeStamp - hold.previousTime) / 1000),
    );
    hold.velocity
      .subVectors(
        hold.currentWorldPosition,
        hold.previousWorldPosition,
      )
      .divideScalar(deltaTime)
      .clampLength(0, 12);
    hold.spec.onMove(
      hold.instanceId,
      hold.currentWorldPosition,
      hold.velocity,
    );
    hold.previousWorldPosition.copy(hold.currentWorldPosition);
    hold.previousTime = event.timeStamp;
    event.preventDefault();
    return true;
  }

  private releaseMathInstanceDrag(event: PointerEvent): boolean {
    const hold = this.mathInstanceDragHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    if (event.timeStamp - hold.previousTime > 110) {
      hold.velocity.set(0, 0, 0);
    }
    hold.spec.onEnd(hold.instanceId, hold.velocity);
    this.mathInstanceDragHold = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
    return true;
  }

  private cancelMathInstanceDrag(notify = true): void {
    const hold = this.mathInstanceDragHold;
    if (!hold) return;
    if (notify) {
      hold.velocity.set(0, 0, 0);
      hold.spec.onEnd(hold.instanceId, hold.velocity);
    }
    this.mathInstanceDragHold = null;
    if (this.canvas.hasPointerCapture(hold.pointerId)) {
      this.canvas.releasePointerCapture(hold.pointerId);
    }
    this.syncPointerDragCursor();
  }

  private findPointedPointerAction(event: PointerEvent): PointerAction | null {
    if (this.pointerActions.length === 0) return null;
    this.updatePointerRay(event);
    let closest: PointerAction | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const pointerAction of this.pointerActions) {
      if (
        !pointerAction.object.visible ||
        pointerAction.isAvailable?.() === false
      ) {
        continue;
      }
      pointerAction.object.getWorldPosition(this.tempWorld);
      const playerDistance = Math.hypot(
        this.tempWorld.x - this.playerPosition.x,
        this.tempWorld.z - this.playerPosition.z,
      );
      if (playerDistance > pointerAction.maximumDistance) continue;
      pointerAction.object.updateWorldMatrix(true, true);
      this.pointerActionHits.length = 0;
      this.pointerRaycaster.intersectObject(
        pointerAction.object,
        true,
        this.pointerActionHits,
      );
      const hit = this.pointerActionHits[0];
      if (!hit || hit.distance >= closestDistance) continue;
      closest = pointerAction;
      closestDistance = hit.distance;
    }
    return closest;
  }

  private updatePointerRay(event: PointerEvent): void {
    this.updatePointerRayAt(event.clientX, event.clientY);
  }

  private updatePointerRayAt(clientX: number, clientY: number): void {
    // Several hover affordances use this ray in one synchronous frame. Reuse
    // its canvas measurement/projection only inside that scope, never across
    // an input event, a camera move, or a different pointer coordinate.
    if (this.pointerPickFrameActive && this.pointerPickRayPrepared &&
      clientX === this.pointerPickClientX && clientY === this.pointerPickClientY) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.pointerRaycaster.setFromCamera(this.pointer, this.camera);
    if (this.pointerPickFrameActive) {
      this.pointerPickRayPrepared = true;
      this.pointerPickClientX = clientX;
      this.pointerPickClientY = clientY;
    }
  }

  /**
   * Faceted cliff grooves have different rendered depths inside the same
   * physical wall. Anchor fallback targeting to that wall's entry face so the
   * cursor does not dart into each groove or select footing through its back.
   * Only a box containing the actual visible hit may supply the face; unrelated
   * foreground/overhead boxes and custom-shaped solids are not substitutes.
   */
  private projectClickNavigationWallFace(
    ray: THREE.Ray,
    point: { x: number; y: number; z: number },
  ): { x: number; z: number } | null {
    let closestDistance = Infinity;
    let face: { x: number; z: number; normalX: number; normalZ: number } | null = null;
    for (const collider of this.staticColliderIndex.queryPoint(
      point.x, point.z, 0.015, this.clickNavigationSnapObstacles,
    )) {
      if (collider.enabled === false || collider.intersectsHorizontal ||
        Math.abs(point.x - collider.x) > collider.halfWidth + 0.015 ||
        Math.abs(point.z - collider.z) > collider.halfDepth + 0.015 ||
        Math.abs(point.y - collider.y) > collider.halfHeight + 0.015) continue;
      this.tempBounds.min.set(
        collider.x - collider.halfWidth, collider.y - collider.halfHeight,
        collider.z - collider.halfDepth,
      );
      this.tempBounds.max.set(
        collider.x + collider.halfWidth, collider.y + collider.halfHeight,
        collider.z + collider.halfDepth,
      );
      if (!ray.intersectBox(this.tempBounds, this.clickNavigationPoint)) continue;
      const distance = ray.origin.distanceToSquared(this.clickNavigationPoint);
      if (distance >= closestDistance) continue;
      closestDistance = distance;
      const normalX = Math.abs(this.clickNavigationPoint.x - this.tempBounds.min.x) < 1e-5 ? -1
        : Math.abs(this.clickNavigationPoint.x - this.tempBounds.max.x) < 1e-5 ? 1 : 0;
      const normalZ = Math.abs(this.clickNavigationPoint.z - this.tempBounds.min.z) < 1e-5 ? -1
        : Math.abs(this.clickNavigationPoint.z - this.tempBounds.max.z) < 1e-5 ? 1 : 0;
      face = normalX || normalZ ? {
        x: this.clickNavigationPoint.x, z: this.clickNavigationPoint.z, normalX, normalZ,
      } : null;
    }
    if (!face) return null;
    point.x = face.x;
    point.z = face.z;
    // Keep the actual visible Y as the ceiling for lower-support selection.
    return { x: face.normalX, z: face.normalZ };
  }

  private findClickNavigationTargetAt(
    clientX: number,
    clientY: number,
    reusableTarget?: ClickNavigationTarget,
  ): ClickNavigationTarget | null {
    this.updatePointerRayAt(clientX, clientY);
    const ray = this.pointerRaycaster.ray;
    if (Math.abs(ray.direction.y) < 0.0001) return null;

    collectClickNavigationBlockers(
      this.zoneGroup,
      this.clickNavigationVisualBlockers,
    );
    this.clickNavigationVisualHits.length = 0;
    this.pointerRaycaster.intersectObjects(
      this.clickNavigationVisualBlockers,
      false,
      this.clickNavigationVisualHits,
    );
    const firstVisualDistance =
      this.clickNavigationVisualHits[0]?.distance ??
      Number.POSITIVE_INFINITY;
    const portalHit =
      this.portalNetwork.findPointed(this.pointerRaycaster);
    if (
      portalHit &&
      portalHit.distance <= firstVisualDistance + 0.08
    ) {
      const portalPosition = portalHit.portal.position;
      const portalTarget = reusableTarget ?? {
        position: new THREE.Vector3(),
        markerY: 0,
        surface: null,
        surfaceOffsetX: 0,
        surfaceOffsetZ: 0,
        reachable: true,
      };
      portalTarget.position.set(
        portalPosition.x,
        this.getClickNavigationTerrainFootHeight(
          portalPosition.x,
          portalPosition.z,
        ),
        portalPosition.z,
      );
      portalTarget.markerY = this.getClickNavigationTerrainMarkerY(
        portalPosition.x,
        portalPosition.z,
      );
      portalTarget.surface = null;
      portalTarget.surfaceOffsetX = 0;
      portalTarget.surfaceOffsetZ = 0;
      portalTarget.preservePortalTarget = true;
      portalTarget.blockedAtPick = false;
      portalTarget.reachable = true;
      portalTarget.reachable =
        this.isClickNavigationTargetPotentiallyReachable(
          portalTarget,
        );
      return portalTarget;
    }
    let closestDistance = Number.POSITIVE_INFINITY;
    let target: ClickNavigationTarget | null = null;

    for (const surface of this.surfaceAreas) {
      if (surface.enabled === false) continue;
      let surfaceY = surface.heightAt(surface.x, surface.z);
      let intersected = false;
      for (let pass = 0; pass < 2; pass += 1) {
        this.clickNavigationPlane.set(up, -surfaceY);
        if (
          !ray.intersectPlane(
            this.clickNavigationPlane,
            this.clickNavigationPoint,
          )
        ) {
          intersected = false;
          break;
        }
        intersected = true;
        surfaceY = surface.heightAt(
          this.clickNavigationPoint.x,
          this.clickNavigationPoint.z,
        );
      }
      if (
        !intersected ||
        !this.surfaceContainsPoint(
          surface,
          this.clickNavigationPoint.x,
          this.clickNavigationPoint.z,
        )
      ) {
        continue;
      }
      const distance = ray.origin.distanceTo(
        this.clickNavigationPoint,
      );
      if (
        distance >= closestDistance ||
        distance > firstVisualDistance + 0.58
      ) {
        continue;
      }
      closestDistance = distance;
      target = reusableTarget ?? {
        position: new THREE.Vector3(),
        markerY: 0,
        surface: null,
        surfaceOffsetX: 0,
        surfaceOffsetZ: 0,
        reachable: true,
      };
      target.position.set(
        this.clickNavigationPoint.x,
        surfaceY,
        this.clickNavigationPoint.z,
      );
      target.markerY = surfaceY + 0.045;
      target.surface = surface;
      target.surfaceOffsetX =
        this.clickNavigationPoint.x - surface.x;
      target.surfaceOffsetZ =
        this.clickNavigationPoint.z - surface.z;
      target.reachable = true;
      target.preservePortalTarget = false;
      target.blockedAtPick = false;
    }

    // Terrain is not represented by SurfaceArea records because each world
    // already owns its baseline ground rules. Project it separately, including
    // the Falls bridge and river's distinct visible/feet heights.
    this.clickNavigationPlane.set(up, -0.17);
    if (
      ray.intersectPlane(
        this.clickNavigationPlane,
        this.clickNavigationPoint,
      )
    ) {
      const terrainMarkerY =
        this.getClickNavigationTerrainMarkerY(
          this.clickNavigationPoint.x,
          this.clickNavigationPoint.z,
        );
      this.clickNavigationPlane.set(up, -terrainMarkerY);
      if (
        ray.intersectPlane(
          this.clickNavigationPlane,
          this.clickNavigationPoint,
        ) &&
        this.isInsidePlayableBounds(
          this.clickNavigationPoint.x,
          this.clickNavigationPoint.z,
        )
      ) {
        const distance = ray.origin.distanceTo(
          this.clickNavigationPoint,
        );
        if (
          distance < closestDistance &&
          distance <= firstVisualDistance + 0.24
        ) {
          const terrainFootHeight =
            this.getClickNavigationTerrainFootHeight(
              this.clickNavigationPoint.x,
              this.clickNavigationPoint.z,
            );
          target = reusableTarget ?? {
            position: new THREE.Vector3(),
            markerY: 0,
            surface: null,
            surfaceOffsetX: 0,
            surfaceOffsetZ: 0,
            reachable: true,
          };
          target.position.set(
            this.clickNavigationPoint.x,
            terrainFootHeight,
            this.clickNavigationPoint.z,
          );
          target.markerY = terrainMarkerY;
          target.surface = null;
          target.surfaceOffsetX = 0;
          target.surfaceOffsetZ = 0;
          target.reachable = true;
          target.preservePortalTarget = false;
          target.blockedAtPick = false;
        }
      }
    }

    // A visible wall/rim can hide its supporting plane. Use that actual hit,
    // never a ground projection through empty sky. Stay below the hit's height
    // so a wall face beneath a bridge cannot select the bridge above it.
    if (!target) {
      const hit = this.clickNavigationVisualHits[0];
      if (!hit) return null;
      const point = hit.point;
      const projected = { x: point.x, y: point.y, z: point.z };
      const wallFace = this.projectClickNavigationWallFace(ray, projected);
      const wallX = projected.x;
      const wallZ = projected.z;
      clampClickLandingToBounds(projected, this.bounds);
      const groundHeight = this.getClickNavigationTerrainFootHeight(projected.x, projected.z);
      const obstacles = this.staticColliderIndex.queryPoint(
        projected.x, projected.z, 1.2 + this.playerRadius + 0.04,
        this.clickNavigationSnapObstacles,
      );
      const landing = findWallClickLanding(
        projected, this.bounds, this.surfaceAreas,
        (surface, x, z) => {
          if (wallFace && (x - wallX) * wallFace.x + (z - wallZ) * wallFace.z < -0.005) return null;
          return this.sampleClickNavigationLanding(surface, x, z);
        },
        obstacles, this.playerRadius + 0.04,
      );
      // Preserve a blocked marker on its footprint only if every bounded
      // candidate failed. A valid lower floor must participate in the choice.
      const support = landing ? null : findWallClickSurface(projected, groundHeight, this.surfaceAreas);
      const selected = landing?.surface ?? support?.surface ?? null;
      const selectedHeight = landing?.position.y ?? support?.height ?? groundHeight;
      if (landing) {
        projected.x = landing.position.x;
        projected.z = landing.position.z;
      } else if (support) {
        projected.x = support.x;
        projected.z = support.z;
      }
      target = reusableTarget ?? {
        position: new THREE.Vector3(), markerY: 0, surface: null,
        surfaceOffsetX: 0, surfaceOffsetZ: 0, reachable: true,
      };
      target.position.set(projected.x, selectedHeight, projected.z);
      target.surface = selected;
      target.surfaceOffsetX = selected ? projected.x - selected.x : 0;
      target.surfaceOffsetZ = selected ? projected.z - selected.z : 0;
      target.preservePortalTarget = false;
      target.blockedAtPick = landing === null;
      target.reachable = landing !== null;
      target.markerY = selectedHeight + 0.045;
      this.refreshClickNavigationTarget(target);
      target.reachable &&= this.isClickNavigationTargetPotentiallyReachable(target);
      return target;
    }
    this.snapClickNavigationTarget(target);
    target.reachable =
      this.isClickNavigationTargetPotentiallyReachable(target);
    return target;
  }

  private findClickNavigationTarget(
    event: PointerEvent,
  ): ClickNavigationTarget | null {
    return this.findClickNavigationTargetAt(
      event.clientX,
      event.clientY,
    );
  }

  private recordClickNavigationPointer(event: PointerEvent): void {
    if (event.pointerType !== "mouse") return;
    // Publish only the latest coordinates here. Frame-owned hover projection
    // runs after camera movement, coalescing high-rate pointer events instead
    // of raycasting the rebuilt terrain in both event and frame loops.
    if (
      !this.clickNavigationPointerInside ||
      event.clientX !== this.clickNavigationPointerClientX ||
      event.clientY !== this.clickNavigationPointerClientY
    ) {
      this.clickNavigationHoverProjectionDirty = true;
      this.hoverPointerActiveUntil = performance.now() + 150;
    }
    this.clickNavigationPointerInside = true;
    this.clickNavigationPointerClientX = event.clientX;
    this.clickNavigationPointerClientY = event.clientY;
  }

  private captureClickNavigationHoverProjection(): void {
    this.clickNavigationHoverCameraWorldMatrix.copy(
      this.camera.matrixWorld,
    );
    this.clickNavigationHoverProjectionMatrix.copy(
      this.camera.projectionMatrix,
    );
    this.clickNavigationHoverPlayerPosition.copy(
      this.playerPosition,
    );
    this.clickNavigationHoverFeetHeight =
      this.surfaceOffset + this.jumpHeight;
    this.clickNavigationHoverProjectionDirty = false;
    this.clickNavigationHoverProjectionCaptured = true;
  }

  private refreshClickNavigationHoverFromPointer(): void {
    if (
      !this.clickNavigationPointerInside ||
      this.clickNavigationPress ||
      this.navigation.route ||
      this.navigation.hasPending ||
      this.navigation.pendingTarget ||
      this.navigation.failure ||
      !this.externalInputEnabled ||
      this.isNavigationLocked() ||
      this.pongChallenge.isActive() ||
      this.voidTurtleRide.isRiding() ||
      this.hasActivePointerDrag()
    ) {
      return;
    }

    this.camera.updateMatrixWorld();
    const feetHeight = this.surfaceOffset + this.jumpHeight;
    const viewChanged =
      !this.clickNavigationHoverProjectionCaptured ||
      !this.camera.matrixWorld.equals(
        this.clickNavigationHoverCameraWorldMatrix,
      ) ||
      !this.camera.projectionMatrix.equals(
        this.clickNavigationHoverProjectionMatrix,
      ) ||
      this.playerPosition.distanceToSquared(
        this.clickNavigationHoverPlayerPosition,
      ) > 0.0001 ||
      Math.abs(feetHeight - this.clickNavigationHoverFeetHeight) >
        0.0001;
    // Coalesced pointer motion gets one current hit each rendered frame. A
    // second 30 Hz timer caused visible lag even when the world ran at 60 Hz.
    if (!this.clickNavigationHoverProjectionDirty && !viewChanged) return;
    this.clickNavigationHover = this.findClickNavigationTargetAt(
      this.clickNavigationPointerClientX,
      this.clickNavigationPointerClientY,
      this.clickNavigationHover ?? undefined,
    );
    this.captureClickNavigationHoverProjection();
    if (!this.clickNavigationHover) {
      this.clickNavigationMarker?.hide();
    }
  }

  private beginClickNavigationPress(
    event: PointerEvent,
    focusOnly = false,
  ): boolean {
    if (!event.isPrimary) return false;
    const target = this.findClickNavigationTarget(event);
    if (!target) return false;
    this.clickNavigationHover = target;
    this.clickNavigationPress = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      startedAt: this.elapsed,
      nextRetargetAt: Number.NEGATIVE_INFINITY,
      moved: false,
      continuous: false,
      focusOnly,
      target: this.cloneClickNavigationTarget(target),
      visualTarget: this.cloneClickNavigationTarget(target),
    };
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  }

  private updateClickNavigationPress(
    event: PointerEvent,
  ): void {
    const press = this.clickNavigationPress;
    if (!press || press.pointerId !== event.pointerId) return;
    press.currentClientX = event.clientX;
    press.currentClientY = event.clientY;
    const screenDistance = Math.hypot(
      event.clientX - press.startClientX,
      event.clientY - press.startClientY,
    );
    press.moved ||= isClickNavigationDragGesture(screenDistance, press.pointerType);
    if (
      isContinuousClickNavigationGesture(
        this.elapsed - press.startedAt,
        screenDistance,
        press.pointerType,
      )
    ) {
      if (!press.continuous) press.nextRetargetAt = Number.NEGATIVE_INFINITY;
      press.continuous = true;
      this.canvas.style.cursor = "move";
      event.preventDefault();
    }
  }

  private updateClickNavigationHold(): void {
    const press = this.clickNavigationPress;
    if (!press) return;
    if (
      !this.externalInputEnabled ||
      this.isNavigationLocked() ||
      this.pongChallenge.isActive() ||
      this.voidTurtleRide.isRiding()
    ) {
      this.navigation.cancel();
      this.cancelClickNavigationPress();
      return;
    }
    const screenDistance = Math.hypot(
      press.currentClientX - press.startClientX,
      press.currentClientY - press.startClientY,
    );
    if (
      !press.continuous &&
      isContinuousClickNavigationGesture(
        this.elapsed - press.startedAt,
        screenDistance,
        press.pointerType,
      )
    ) {
      press.continuous = true;
      press.nextRetargetAt = Number.NEGATIVE_INFINITY;
      this.canvas.style.cursor = "move";
    }
    if (!press.continuous) return;
    // One local surface pick per rendered frame, after the camera update.
    // Only submission to the route owner remains throttled to 75 ms.
    const target = this.findClickNavigationTargetAt(
      press.currentClientX,
      press.currentClientY,
      press.visualTarget ?? undefined,
    );
    press.visualTarget = target;
    if (this.elapsed < press.nextRetargetAt) return;
    press.nextRetargetAt = this.elapsed + 0.075;
    if (!target) {
      // Camera motion can briefly carry the held screen point across a gap
      // between raycastable surfaces. Keep the last valid destination armed
      // instead of flashing the marker off or abandoning the route.
      return;
    }
    if (this.navigation.retarget(target)) {
      press.target = this.cloneClickNavigationTarget(target);
    }
  }

  private cancelClickNavigationPress(clearHover = true): void {
    const pointerId =
      this.clickNavigationPress?.pointerId ?? null;
    this.clickNavigationPress = null;
    if (
      pointerId !== null &&
      this.canvas.hasPointerCapture(pointerId)
    ) {
      this.canvas.releasePointerCapture(pointerId);
    }
    if (clearHover) {
      this.clickNavigationHover = null;
      this.clickNavigationHoverProjectionDirty = true;
    }
    this.canvas.style.cursor = "";
  }

  private finishClickNavigationPress(
    event: PointerEvent,
  ): boolean {
    const press = this.clickNavigationPress;
    if (!press || press.pointerId !== event.pointerId) return false;
    this.updateClickNavigationPress(event);
    this.clickNavigationPress = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    const shouldNavigate =
      shouldCommitOneShotClickNavigation(
        event.type === "pointerup",
        press.focusOnly,
        press.moved,
        this.elapsed - press.startedAt,
      );
    if (shouldNavigate) {
      this.navigation.begin(press.target);
    } else if (press.continuous) {
      this.navigation.cancel();
      if (
        event.type === "pointerup" &&
        event.pointerType === "mouse"
      ) {
        this.clickNavigationHover = press.visualTarget;
      }
    }
    this.canvas.style.cursor = "";
    event.preventDefault();
    return true;
  }

  private readonly handlePointerEnter = (
    event: PointerEvent,
  ): void => {
    this.recordClickNavigationPointer(event);
  };

  private readonly handlePointerLeave = (
    event: PointerEvent,
  ): void => {
    if (event.pointerType === "mouse") {
      this.pendingPointerHover = null;
      this.hoverPointerActiveUntil = 0;
      this.clickNavigationPointerInside = false;
      this.clickNavigationHoverProjectionDirty = false;
    }
    if (event.buttons !== 0 || this.clickNavigationPress) return;
    this.clickNavigationHover = null;
    if (!this.navigation.route && !this.navigation.hasPending &&
      !this.navigation.pendingTarget && !this.navigation.failure) this.clickNavigationMarker?.hide();
  };

  private findPointedKickable(event: PointerEvent): Kickable | null {
    return this.findPointedKickableHit(event)?.kickable ?? null;
  }

  private findPointedKickableHit(
    event: PointerEvent,
  ): KickablePointerHit | null {
    if (this.kickables.length === 0) return null;
    this.updatePointerRay(event);
    // Telekinesis is screen-space magic: any visible loose prop may be
    // selected regardless of the player's physical distance from it.
    // Query each eligible owner once and keep its nearest hit. This avoids
    // filter/map arrays and searching every prop subtree again for each hit.
    let closest: Kickable | null = null;
    let distance = Infinity;
    for (const kickable of this.kickables) {
      if (!kickable.enabled && !this.fallsCrystalFrog.canGrab(kickable)) continue;
      this.kickablePickHits.length = 0;
      this.pointerRaycaster.intersectObject(kickable.object, true, this.kickablePickHits);
      const hit = this.kickablePickHits[0];
      if (hit && hit.distance < distance) {
        closest = kickable;
        distance = hit.distance;
      }
    }
    this.kickablePickHits.length = 0;
    return closest ? { kickable: closest, distance } : null;
  }

  private isPointingAtWornCompass(event: PointerEvent): boolean {
    if (!this.compassOwned || !this.wornCompass?.visible) return false;
    return this.isPointingAtPlayerAttachment(event, this.wornCompass);
  }

  private isPointingAtWornPencil(event: PointerEvent): boolean {
    if (!this.pencilOwned || !this.wornPencil?.visible) return false;
    return this.isPointingAtPlayerAttachment(event, this.wornPencil);
  }

  private isPointingAtPlayerAttachment(
    event: PointerEvent,
    attachment: THREE.Object3D,
  ): boolean {
    this.updatePointerRay(event);
    const previousLayerMask = this.pointerRaycaster.layers.mask;
    this.pointerRaycaster.layers.set(playerRenderLayer);
    const pointed =
      this.pointerRaycaster.intersectObject(attachment, true).length > 0;
    this.pointerRaycaster.layers.mask = previousLayerMask;
    return pointed;
  }

  private findTelekinesisSurface(x: number, z: number): SurfaceArea | null {
    let highestSurface: SurfaceArea | null = null;
    let highestSurfaceY = Number.NEGATIVE_INFINITY;
    const candidates = this.surfaceAreaIndex.queryPoint(
      x,
      z,
      0,
      this.surfaceAreaCandidates,
    );
    for (const surface of candidates) {
      if (
        surface.id === "void-turtle-shell" ||
        !this.surfaceContainsPoint(surface, x, z)
      ) {
        continue;
      }
      const surfaceY = surface.heightAt(x, z);
      if (surfaceY <= highestSurfaceY) continue;
      highestSurface = surface;
      highestSurfaceY = surfaceY;
    }
    return highestSurface;
  }

  private beginAmbientGridDrag(event: PointerEvent): boolean {
    if (!this.ambientGrid) return false;
    this.updatePointerRay(event);
    if (
      !this.ambientGrid.beginDrag(
        this.pointerRaycaster.ray,
        event.pointerId,
        event.timeStamp,
      )
    ) {
      return false;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updateAmbientGridDrag(event: PointerEvent): boolean {
    if (!this.ambientGrid?.hasDrag(event.pointerId)) return false;
    this.updatePointerRay(event);
    this.ambientGrid.updateDrag(
      this.pointerRaycaster.ray,
      event.pointerId,
      event.timeStamp,
      this.lanterns,
      this.staticColliders,
      this.surfaceAreas,
      this.playerPosition,
    );
    event.preventDefault();
    return true;
  }

  private releaseAmbientGridDrag(event: PointerEvent): boolean {
    if (
      !this.ambientGrid?.releaseDrag(
        event.pointerId,
        event.timeStamp,
        this.currentZone === "field"
          ? fieldAmbientGridLandingRegion
          : null,
      )
    ) {
      return false;
    }
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
    return true;
  }

  private cancelAmbientGridDrag(): void {
    const pointerId = this.ambientGrid?.cancelDrag() ?? null;
    if (
      pointerId !== null &&
      this.canvas.hasPointerCapture(pointerId)
    ) {
      this.canvas.releasePointerCapture(pointerId);
    }
    this.syncPointerDragCursor();
  }

  private isPointingAtAmbientGrid(event: PointerEvent): boolean {
    if (!this.ambientGrid) return false;
    this.updatePointerRay(event);
    this.ambientGrid.observePointerSweep(
      this.pointerRaycaster.ray,
      this.camera,
      event.clientX,
      event.clientY,
      event.pointerType,
      event.timeStamp,
    );
    return this.ambientGrid.isPointedAt(this.pointerRaycaster.ray);
  }

  private handleTelekinesisDown(event: PointerEvent): void {
    const monitor = this.performanceMonitor;
    if (!monitor?.recording) { this.dispatchTelekinesisDown(event); return; }
    const startedAt = monitor.beginInput();
    try { this.dispatchTelekinesisDown(event); }
    finally { monitor.endInput(startedAt, "down"); }
  }

  private dispatchTelekinesisDown(event: PointerEvent): void {
    this.recordClickNavigationPointer(event);
    if (
      event.button !== 0 ||
      this.isWorldPointerInteractionLocked()
    ) {
      return;
    }
    const focusOnly =
      event.pointerType === "mouse" &&
      this.consumeFocusReclaimPointer();
    this.pendingPointerHover = null;
    // A press is not yet a replacement destination. Preserve the checked route
    // through pointerup/hold classification so consecutive clicks can extend it
    // just like held steering. Only an accepted non-navigation interaction (or
    // an empty pick) takes ownership away from the navigation controller.
    this.cancelClickNavigationPress(false);
    if (focusOnly) {
      this.navigation.cancel("Window focus reclaimed");
      this.canvas.focus({ preventScroll: true });
      this.beginClickNavigationPress(event, true);
      event.preventDefault();
      return;
    }
    if (this.pongChallenge.isMounted()) {
      if (this.pongChallenge.beginBallDrag(event)) {
        this.navigation.cancel("Pong ball interaction");
        return;
      }
      if (this.pongChallenge.isActive()) {
        if (this.pongChallenge.beginPaddleDrag(event)) {
          this.navigation.cancel("Pong paddle interaction");
          return;
        }
        // Wrong Address remains a world object until it physically strikes
        // the packet. It is the one loose prop the player may drag while the
        // court owns movement input.
        if (
          !this.archiveAsteroid ||
          this.findPointedKickable(event) !== this.archiveAsteroid
        ) {
          this.navigation.cancel("Pong owns movement");
          return;
        }
      }
    }
    if (this.beginMathInstanceDrag(event)) {
      this.navigation.cancel("Math exhibit interaction");
      return;
    }
    if (this.archiveSignalPuzzle.beginPointerDrag(event)) {
      this.navigation.cancel("Optics interaction");
      return;
    }
    const pointerAction = this.findPointedPointerAction(event);
    if (pointerAction) {
      this.navigation.cancel("World mechanism interaction");
      this.pointerActionReachTarget = pointerAction.object;
      this.pointerActionReachUntil = this.elapsed + 0.52;
      this.runWorldAction(
        pointerAction.action,
        "The distant mechanism answers, then loses the signal. Try it again.",
      );
      event.preventDefault();
      return;
    }
    const canDetachWearable = this.telekinesisPointerId === null;
    const detachedCompass =
      canDetachWearable && this.isPointingAtWornCompass(event)
      ? this.detachWornCompass()
      : null;
    const detachedPencil =
      canDetachWearable &&
      !detachedCompass &&
      this.isPointingAtWornPencil(event)
        ? this.detachWornPencil()
        : null;
    const detachedFromBelt =
      detachedCompass !== null || detachedPencil !== null;
    if (
      !detachedFromBelt &&
      this.archiveOrbitPlayground.beginPointerDrag(event)
    ) {
      this.navigation.cancel("Orbit interaction");
      return;
    }
    if (this.telekinesisPointerId !== null) {
      this.navigation.cancel("Telekinesis owns pointer interaction");
      return;
    }
    const kickable =
      detachedCompass ??
      detachedPencil ??
      this.findPointedKickable(event);
    if (!kickable) {
      if (this.beginAmbientGridDrag(event)) {
        this.navigation.cancel("Ambient fabric interaction");
        return;
      }
      if (!this.beginClickNavigationPress(event)) {
        this.navigation.cancel("No navigable destination");
      }
      return;
    }
    this.navigation.cancel("Loose-object interaction");
    if (!detachedFromBelt && this.compassProp?.kickable === kickable) {
      this.acquireFieldCompass(kickable);
      event.preventDefault();
      return;
    }

    this.fallsCrystalFrog.beginHold(kickable);
    this.fallsRuneRitual.unseatKickable(kickable);
    this.heldKickable = kickable;
    this.telekinesisMoved = false;
    this.telekinesisPlacementSettledFor = 0;
    this.telekinesisPencilWasWorn = detachedPencil !== null;
    this.telekinesisStartClientX = event.clientX;
    this.telekinesisStartClientY = event.clientY;
    this.telekinesisPointerClientX = event.clientX;
    this.telekinesisPointerClientY = event.clientY;
    const turtleBound = this.voidTurtleRide.isBoundKickable(kickable);
    this.telekinesisPlacementSurface = turtleBound
      ? null
      : this.findTelekinesisSurface(
          kickable.object.position.x,
          kickable.object.position.z,
        );
    this.telekinesisPointerId = event.pointerId;
    kickable.onPlatform = false;
    kickable.velocity.set(0, 0, 0);
    const hoverY = Math.max(
      1.05,
      kickable.object.position.y + 0.58,
    );
    this.telekinesisPlane.set(up, -hoverY);
    this.updatePointerRay(event);
    kickable.object.updateWorldMatrix(true, true);
    this.telekinesisFixedBody = kickable.collisionHeight !== undefined;
    if (this.telekinesisFixedBody) {
      this.telekinesisBodyBottom = 0;
      this.telekinesisBodyHeight = kickable.collisionHeight!;
      this.telekinesisBodyRadius = kickable.radius;
      // A borrowed old platform is not a new landing after a drag. In
      // particular, the shadow must not keep describing the original bridge.
      kickable.platform = null;
    }
    this.telekinesisDragHeight = kickable.object.position.y;
    this.telekinesisPreviousRay.copy(this.pointerRaycaster.ray);
    this.pointerActionHits.length = 0;
    this.pointerRaycaster.intersectObject(kickable.object, true, this.pointerActionHits);
    this.telekinesisGripOffset.set(0, 0, 0);
    const gripHit = this.pointerActionHits[0];
    if (gripHit) {
      this.telekinesisGripOffset.copy(gripHit.point).sub(kickable.object.position);
    }
    this.telekinesisPreviousPoint.copy(kickable.object.position);
    if (this.projectHeldKickableFromPointer()) {
      this.applyHeldKickableTarget(this.telekinesisPoint, 1 / 60, false);
    }
    this.telekinesisPreviousTime = event.timeStamp;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
  }

  private applyHeldKickableTarget(
    projectedPoint: THREE.Vector3,
    deltaTime: number,
    updateReleaseVelocity: boolean,
  ): void {
    const kickable = this.heldKickable;
    if (!kickable) return;
    const previousObjectX = kickable.object.position.x;
    const previousObjectZ = kickable.object.position.z;
    this.tempDirection.set(
      projectedPoint.x,
      projectedPoint.y,
      projectedPoint.z,
    );
    if (this.telekinesisFixedBody) {
      advanceHeldPropDepth(
        this.pointerRaycaster.ray, this.telekinesisPreviousRay, this.telekinesisGripOffset,
        this.telekinesisDragHeight, projectedPoint.y, deltaTime,
        this.tempDirection, this.telekinesisPointerMotion,
      );
      this.telekinesisDragHeight = this.tempDirection.y;
      this.telekinesisPreviousRay.copy(this.pointerRaycaster.ray);
    }
    const turtleBound = this.voidTurtleRide.isBoundKickable(kickable);
    const frog = this.fallsCrystalFrog.owns(kickable);
    const repairPencil =
      kickable.object.userData.gridPencil === true;
    const desiredX = this.tempDirection.x;
    const desiredZ = this.tempDirection.z;
    if (repairPencil || frog) {
      // The pencil reaches distant scraps; the frog can be thrown into the
      // void for its glitch recovery. Keep only a distant numerical guard.
      this.tempDirection.x = THREE.MathUtils.clamp(
        this.tempDirection.x,
        -38,
        38,
      );
      this.tempDirection.z = THREE.MathUtils.clamp(
        this.tempDirection.z,
        -38,
        38,
      );
    } else if (!turtleBound) {
      this.constrainToBounds(this.tempDirection);
    }

    if (this.telekinesisFixedBody) {
      this.telekinesisBodyFeet.copy(kickable.object.position);
      this.telekinesisBodyFeet.y += this.telekinesisBodyBottom;
      this.tempDirection.y += this.telekinesisBodyBottom;
      resolveHeldBodyTarget(
        this.telekinesisBodyFeet, this.tempDirection, this.telekinesisBodyRadius,
        this.telekinesisBodyHeight,
        this.staticColliderIndex.queryBounds(
          Math.min(previousObjectX, this.tempDirection.x) - this.telekinesisBodyRadius,
          Math.min(previousObjectZ, this.tempDirection.z) - this.telekinesisBodyRadius,
          Math.max(previousObjectX, this.tempDirection.x) + this.telekinesisBodyRadius,
          Math.max(previousObjectZ, this.tempDirection.z) + this.telekinesisBodyRadius,
          this.staticColliderCandidates,
        ),
        this.tempDirection,
      );
      this.tempDirection.y -= this.telekinesisBodyBottom;
      this.telekinesisDragHeight = this.tempDirection.y;
    }

    if (updateReleaseVelocity) {
      kickable.velocity.set(
        (this.telekinesisFixedBody
          ? (Math.abs(this.tempDirection.x - desiredX) < 0.001 ? this.telekinesisPointerMotion.x : 0)
          : this.tempDirection.x - this.telekinesisPreviousPoint.x) /
          deltaTime,
        0,
        (this.telekinesisFixedBody
          ? (Math.abs(this.tempDirection.z - desiredZ) < 0.001 ? this.telekinesisPointerMotion.z : 0)
          : this.tempDirection.z - this.telekinesisPreviousPoint.z) /
          deltaTime,
      );
      const releaseSpeed = Math.hypot(
        kickable.velocity.x,
        kickable.velocity.z,
      );
      if (releaseSpeed > 12) {
        const ratio = 12 / releaseSpeed;
        kickable.velocity.x *= ratio;
        kickable.velocity.z *= ratio;
      }
    }

    if (
      this.tryCaptureTravelingAsteroidAsPongPacket(
        kickable,
        previousObjectX,
        previousObjectZ,
        this.tempDirection.x,
        this.tempDirection.z,
      )
    ) {
      return;
    }

    kickable.object.position.x = this.tempDirection.x;
    kickable.object.position.z = this.tempDirection.z;
    const previousPlacementSurface = this.telekinesisPlacementSurface;
    kickable.object.position.y = this.tempDirection.y;
    const projectedSurface = this.telekinesisProjectedSurface;
    // The cursor can project an upper deck while collision keeps the body
    // underneath it. Do not advertise that unachieved floor as placement/shadow.
    this.telekinesisPlacementSurface = projectedSurface &&
      (!this.telekinesisFixedBody || (
        this.tempDirection.y + this.telekinesisBodyBottom >=
          projectedSurface.heightAt(this.tempDirection.x, this.tempDirection.z) - 0.025 &&
        this.surfaceContainsPoint(projectedSurface, this.tempDirection.x, this.tempDirection.z)
      )) ? projectedSurface : null;

    const actualSpeed = Math.hypot(
      kickable.object.position.x - previousObjectX,
      kickable.object.position.z - previousObjectZ,
    ) / Math.max(1 / 120, deltaTime);
    if (
      this.telekinesisPlacementSurface &&
      this.telekinesisPlacementSurface === previousPlacementSurface &&
      actualSpeed < 0.72
    ) {
      this.telekinesisPlacementSettledFor = Math.min(
        1,
        this.telekinesisPlacementSettledFor + deltaTime,
      );
    } else {
      this.telekinesisPlacementSettledFor = 0;
    }
    if (actualSpeed > 0.18) {
      this.traceAmbientGridWithPencil(
        kickable,
        deltaTime *
          THREE.MathUtils.clamp(actualSpeed * 0.32, 0.24, 1.8),
      );
    }
    this.telekinesisPreviousPoint.set(
      this.tempDirection.x,
      kickable.object.position.y,
      this.tempDirection.z,
    );
  }

  private readonly containsTelekinesisSupport = (
    surface: SurfaceArea, x: number, z: number,
  ): boolean => surface.id !== "void-turtle-shell" && this.surfaceContainsPoint(surface, x, z);

  private projectHeldKickableFromPointer(): boolean {
    const kickable = this.heldKickable;
    if (!kickable || Math.abs(this.pointerRaycaster.ray.direction.y) < 0.0001) return false;
    if (!this.telekinesisFixedBody) {
      kickable.object.updateWorldMatrix(true, true);
      this.tempBounds.setFromObject(kickable.object);
    }
    // Carry fixed bodies above low parapets, like the frog, instead of scraping
    // their bases along every tread. Release uses this same physical envelope.
    const bottomOffset = this.telekinesisFixedBody
      ? -this.telekinesisBodyBottom + 0.62
      : kickable.object.position.y - this.tempBounds.min.y + 0.01;
    this.telekinesisProjectedSurface = projectHeldProp(
      this.pointerRaycaster.ray,
      this.voidTurtleRide.isBoundKickable(kickable) ? emptyDragSurfaces : this.surfaceAreas,
      this.telekinesisGripOffset,
      bottomOffset,
      -this.telekinesisPlane.constant,
      this.containsTelekinesisSupport,
      this.telekinesisPoint,
    );
    return true;
  }

  private updateHeldKickableFromPointer(delta: number): void {
    if (
      !this.heldKickable ||
      this.telekinesisPointerId === null ||
      !this.externalInputEnabled ||
      this.transitioning
    ) {
      return;
    }
    this.updatePointerRayAt(
      this.telekinesisPointerClientX,
      this.telekinesisPointerClientY,
    );
    if (!this.projectHeldKickableFromPointer()) return;
    this.applyHeldKickableTarget(
      this.telekinesisPoint,
      Math.max(1 / 120, delta),
      false,
    );
  }

  private handleTelekinesisMove(event: PointerEvent): void {
    const monitor = this.performanceMonitor;
    if (!monitor?.recording) { this.dispatchTelekinesisMove(event); return; }
    const startedAt = monitor.beginInput();
    try { this.dispatchTelekinesisMove(event); }
    finally { monitor.endInput(startedAt, "move"); }
  }

  private dispatchTelekinesisMove(event: PointerEvent): void {
    this.recordClickNavigationPointer(event);
    if (this.isWorldPointerInteractionLocked()) {
      this.canvas.style.cursor = "";
      return;
    }
    this.updateClickNavigationPress(event);
    if (
      this.clickNavigationPress?.pointerId === event.pointerId
    ) {
      if (this.clickNavigationPress.continuous) {
        this.canvas.style.cursor = "move";
      }
      event.preventDefault();
      return;
    }
    if (event.buttons === 0 && !this.hasActivePointerDrag()) {
      // Hardware mice can deliver hundreds of events per second. Hover is
      // read-only feedback: process only the newest sample after camera update.
      // Captured dragging and click/hold classification remain synchronous.
      this.pendingPointerHover = event;
      return;
    }
    if (this.updateAmbientGridDrag(event)) return;
    if (this.pongChallenge.updateBallDrag(event)) return;
    if (this.updateMathInstanceDrag(event)) return;
    if (this.archiveSignalPuzzle.updatePointerDrag(event)) return;
    if (this.pongChallenge.isActive() && !this.heldKickable) {
      if (this.pongChallenge.updatePaddleDrag(event)) return;
      if (!this.pongChallenge.hasPointerDrag()) {
        this.canvas.style.cursor =
          this.pongChallenge.isPointingAtBall(event) ||
          this.pongChallenge.isPointingAtPaddle(event)
            ? "grab"
            : "";
      }
      return;
    }
    if (this.archiveOrbitPlayground.updatePointerDrag(event)) return;
    if (
      !this.heldKickable ||
      this.telekinesisPointerId !== event.pointerId
    ) {
      this.pendingPointerHover = event;
      return;
    }
    this.telekinesisPointerClientX = event.clientX;
    this.telekinesisPointerClientY = event.clientY;
    if (
      !this.telekinesisMoved &&
      Math.hypot(
        event.clientX - this.telekinesisStartClientX,
        event.clientY - this.telekinesisStartClientY,
      ) >=
        (event.pointerType === "touch" ? 11 : 5)
    ) {
      this.telekinesisMoved = true;
    }
    this.updatePointerRay(event);
    if (!this.projectHeldKickableFromPointer()) return;
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (event.timeStamp - this.telekinesisPreviousTime) / 1000),
    );
    this.applyHeldKickableTarget(
      this.telekinesisPoint,
      deltaTime,
      true,
    );
    this.telekinesisPreviousTime = event.timeStamp;
    event.preventDefault();
  }

  private updatePointerFeedback(): void {
    this.camera.updateMatrixWorld();
    this.pointerPickFrameActive = true;
    this.pointerPickRayPrepared = false;
    try {
      const event = this.pendingPointerHover;
      this.pendingPointerHover = null;
      this.updateClickNavigationHold();
      if (event && !this.isWorldPointerInteractionLocked() &&
        !this.clickNavigationPress && !this.hasActivePointerDrag()) {
        if (this.pongChallenge.isActive()) {
          this.canvas.style.cursor = this.pongChallenge.isPointingAtBall(event) ||
            this.pongChallenge.isPointingAtPaddle(event) ? "grab" : "";
        } else if (this.findPointedPointerAction(event)) {
          this.canvas.style.cursor = "pointer";
        } else {
          this.canvas.style.cursor =
            this.archiveSignalPuzzle.isPointingAtRelay(event) ||
            this.isPointingAtWornCompass(event) ||
            this.isPointingAtWornPencil(event) ||
            this.pongChallenge.isPointingAtBall(event) ||
            this.findPointedMathInstanceDrag(event) ||
            this.archiveOrbitPlayground.isPointingAtPlanet(event) ||
            this.findPointedKickable(event) ||
            this.isPointingAtAmbientGrid(event) ? "grab" : "";
        }
      }
      this.updateClickNavigationMarker();
    } finally {
      this.pointerPickFrameActive = false;
      this.pointerPickRayPrepared = false;
    }
  }

  private handleTelekinesisUp(event: PointerEvent): void {
    const monitor = this.performanceMonitor;
    if (!monitor?.recording) { this.dispatchTelekinesisUp(event); return; }
    const startedAt = monitor.beginInput();
    try { this.dispatchTelekinesisUp(event); }
    finally { monitor.endInput(startedAt, "up"); }
  }

  private dispatchTelekinesisUp(event: PointerEvent): void {
    if (this.pongChallenge.releaseBallDrag(event)) return;
    if (this.pongChallenge.releasePaddleDrag(event)) return;
    if (this.releaseMathInstanceDrag(event)) return;
    if (this.archiveSignalPuzzle.releasePointerDrag(event)) return;
    if (this.archiveOrbitPlayground.releasePointerDrag(event)) return;
    if (this.releaseAmbientGridDrag(event)) return;
    if (this.finishClickNavigationPress(event)) return;
    if (
      !this.heldKickable ||
      this.telekinesisPointerId !== event.pointerId
    ) {
      return;
    }
    const kickable = this.heldKickable;
    const pencilState = this.pencilProps.find(
      (state) => state.kickable === kickable,
    );
    const pencilDropX =
      kickable.object.position.x - this.playerPosition.x;
    const pencilDropZ =
      kickable.object.position.z - this.playerPosition.z;
    const droppedOnPlayer =
      pencilState !== undefined &&
      this.telekinesisMoved &&
      pencilDropX * pencilDropX + pencilDropZ * pencilDropZ <=
        1.08 * 1.08;
    if (
      pencilState &&
      (!this.telekinesisMoved || droppedOnPlayer) &&
      this.acquirePortablePencil(
        kickable,
        droppedOnPlayer || !this.telekinesisPencilWasWorn,
      )
    ) {
      this.telekinesisPencilWasWorn = false;
      event.preventDefault();
      return;
    }
    const staleVelocity =
      (this.telekinesisFixedBody && event.type !== "pointerup") ||
      event.timeStamp - this.telekinesisPreviousTime > 110;
    const planarSpeed = staleVelocity
      ? 0
      : Math.hypot(kickable.velocity.x, kickable.velocity.z);
    if (staleVelocity) kickable.velocity.set(0, 0, 0);
    if (this.fallsCrystalFrog.releaseHold(kickable, event.type !== "pointerup")) {
      this.cancelTelekinesisHold(kickable);
      this.syncPointerDragCursor("grab");
      event.preventDefault();
      return;
    }
    if (
      this.voidTurtleRide.releaseAsteroidTelekinesis(
        kickable,
        event,
      )
    ) {
      return;
    }
    if (
      this.voidTurtleRide.releaseCargoTelekinesis(kickable, event)
    ) {
      return;
    }
    const placementCandidate =
      planarSpeed < 2.2 &&
      (!this.telekinesisMoved ||
        this.telekinesisPlacementSettledFor >= 0.14)
        ? this.telekinesisPlacementSurface
        : null;
    let placedSurface =
      placementCandidate &&
      placementCandidate === this.telekinesisProjectedSurface &&
      placementCandidate.enabled !== false &&
      this.surfaceContainsPoint(
        placementCandidate,
        kickable.object.position.x,
        kickable.object.position.z,
      )
        ? placementCandidate
        : null;
    if (placedSurface && kickable.pinballRadius === null) {
      if (!this.telekinesisFixedBody) {
        kickable.object.updateWorldMatrix(true, true);
        this.tempBounds.setFromObject(kickable.object);
      }
      const feet = this.telekinesisFixedBody
        ? kickable.object.position.y + this.telekinesisBodyBottom : this.tempBounds.min.y;
      const height = this.telekinesisFixedBody
        ? this.telekinesisBodyHeight : this.tempBounds.max.y - this.tempBounds.min.y;
      const radius = this.telekinesisFixedBody ? this.telekinesisBodyRadius : kickable.radius;
      if (!canPlaceHeldBody(
        kickable.object.position.x, kickable.object.position.z, radius, feet, height,
        placedSurface.heightAt(kickable.object.position.x, kickable.object.position.z),
        this.staticColliderIndex.queryPoint(
          kickable.object.position.x, kickable.object.position.z, radius, this.staticColliderCandidates,
        ),
      )) placedSurface = null;
    }
    const pencilOutsideIsland =
      pencilState !== undefined &&
      !this.isInsidePlayableBounds(
        kickable.object.position.x,
        kickable.object.position.z,
      );
    if (pencilState) {
      if (pencilOutsideIsland) {
        kickable.gravity = false;
        kickable.restingY = kickable.object.position.y;
        kickable.velocity.y = 0;
      } else {
        kickable.gravity = true;
        kickable.restingY = 0.145;
      }
    }
    if (placedSurface) {
      kickable.platform = placedSurface;
      if (!this.telekinesisFixedBody) {
        kickable.object.updateWorldMatrix(true, true);
        this.tempBounds.setFromObject(kickable.object);
      }
      kickable.platformOffset = this.telekinesisFixedBody
        ? -this.telekinesisBodyBottom + 0.01
        : kickable.object.position.y - this.tempBounds.min.y + 0.01;
      kickable.onPlatform = true;
      kickable.object.position.y =
        placedSurface.heightAt(
          kickable.object.position.x,
          kickable.object.position.z,
        ) + kickable.platformOffset;
      if (pencilOutsideIsland) {
        kickable.restingY = kickable.object.position.y;
      }
      if (this.compassProp?.kickable === kickable) {
        kickable.object.rotation.x = 0;
        kickable.object.rotation.z = 0;
      }
      kickable.velocity.set(0, 0, 0);
      this.hooks.onStatus(
        placedSurface.id === "planning-table"
          ? "Object returned to the planning table. Order is temporarily restored."
          : "Object placed on a stable surface.",
      );
    }
    kickable.velocity.x *= 1.12;
    kickable.velocity.z *= 1.12;
    if (kickable.gravity && !placedSurface) {
      // A gentle release drops from carrying height; it does not inject an
      // upward bounce into a nearby ceiling. Only a real fling adds lift.
      kickable.velocity.y = this.telekinesisFixedBody
        ? Math.min(3.5, planarSpeed * 0.18)
        : Math.min(4.2, 1.1 + planarSpeed * 0.22);
    } else if (!kickable.gravity && !placedSurface) {
      kickable.object.position.y = kickable.restingY;
    }
    kickable.kickCooldown = 0.28;
    this.heldKickable = null;
    this.telekinesisFixedBody = false;
    this.telekinesisPlacementSurface = null;
    this.telekinesisPlacementSettledFor = 0;
    this.telekinesisPointerId = null;
    this.telekinesisMoved = false;
    this.telekinesisPencilWasWorn = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
  }

  private syncInputState(): void {
    const enabled = this.externalInputEnabled && !this.transitioning;
    this.input.setEnabled(enabled);
    if (!enabled) this.cancelSpellCharge();
  }

}
