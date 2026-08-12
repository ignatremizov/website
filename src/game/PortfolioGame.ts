import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AmbientGrid } from "./AmbientGrid";
import {
  findFirstBeamInterruption,
  type BeamBlocker,
  type BeamInterruption,
} from "./BeamInterruption";
import { CubeRematerialization } from "./CubeRematerialization";
import {
  createFieldDesirePathGeometry,
  fieldMapTablePosition,
} from "./FieldDesirePaths";
import {
  InputController,
  type MovementAxes,
} from "./InputController";
import { findFirstHorizontalRayBoxDistance } from "./HorizontalRaycast";
import { PencilTeleportRitual } from "./PencilTeleportRitual";
import {
  sampleIgnitionPanic,
  type IgnitionPanicFrame,
} from "./PlayerIgnitionPanic";
import { RuneAltar } from "./RuneAltar";
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
  selectSupportedSurfaces,
  type SurfaceArea,
  type SurfaceSelection,
  type SurfaceSelectionFrame,
} from "./SurfaceSelection";
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
  fallsRiverCurve,
  isInsideFallsRiver,
} from "./fallsRiver";
import {
  createFieldAtlasTexture,
  createFieldDesirePathTexture,
  createFieldGroundTexture,
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

type RuneId = "moon" | "tide" | "ember";
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
}

interface MathInstanceDragHit {
  spec: MathInstanceDragSpec;
  instanceId: number;
  point: THREE.Vector3;
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
  /** False keeps a movement collider transparent to Archive optical rays. */
  blocksRay?: boolean;
}

interface Kickable {
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

interface RitualCrystalCarry {
  id: string;
  affinity: RuneId | null;
  object: THREE.Object3D;
  kickable: Kickable;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  shadowRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  origin: THREE.Vector3;
  socketedAt: RuneId | null;
  shatteredAtSocket: RuneId | null;
  impactCooldownUntil: number;
}

interface PortalState {
  position: THREE.Vector3;
  core: THREE.Object3D;
  destination: ZoneId;
  milestones: PortalMilestoneDisplay | null;
  action: () => void | Promise<void>;
  dwell: number;
  announced: boolean;
  triggered: boolean;
  chargeMode?: "pulse" | "collapse";
  lockMessage?: string;
}

interface PortalMilestoneDisplay {
  progressZone: ZoneId;
  fragmentZone: ZoneId;
  root: THREE.Group;
  facets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  cores: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  completionCircuit: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  fragmentSign: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  dummy: THREE.Object3D;
  growth: Float32Array;
  colors: THREE.Color[];
  colorScratch: THREE.Color;
  total: number;
  targetUnlocked: number;
  completion: number;
  orbiting: boolean;
  phase: number;
}

interface PortalMilestoneOptions {
  progressZone: ZoneId;
  fragmentZone?: ZoneId;
  orbiting: boolean;
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
  portal: PortalState;
  path: THREE.Vector3[];
  waypointIndex: number;
  previousDistance: number;
  stalledFor: number;
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

interface OrbitingPlanet {
  pivot: THREE.Group;
  planet: THREE.Object3D;
  bodyMaterial: THREE.MeshStandardMaterial;
  speed: number;
  detail: number;
  radius: number;
  collisionRadius: number;
  orbitalBoost: number;
  radialOffset: number;
  radialVelocity: number;
  tiltVelocity: number;
  impact: number;
  collisionCooldown: number;
  playerContact: boolean;
  rigidity: number;
  rigidUntil: number;
  worldPosition: THREE.Vector3;
}

interface OrbitTelekinesisHold {
  planet: OrbitingPlanet;
  plane: THREE.Plane;
  point: THREE.Vector3;
  previousPoint: THREE.Vector3;
  velocity: THREE.Vector3;
  grabOffset: THREE.Vector3;
  previousTime: number;
  moved: boolean;
}

interface ArchiveAtlasState {
  globe: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  orbit: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  star: THREE.Group;
  starMaterial: THREE.MeshBasicMaterial;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  pulseAge: number;
  ascensionBlend: number;
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

type ArchiveSignalTarget = number | "lens" | "void";
type ArchiveSignalRouteResult =
  | "loop"
  | "open"
  | "incomplete"
  | "resolved";
type ArchiveSignalLensOutcome = "cyan-monitor" | "amber-void" | null;

interface ArchiveSignalRelay {
  id: number;
  name: string;
  group: THREE.Group;
  aimPivot: THREE.Group;
  pointerProxy: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  position: THREE.Vector3;
  beamHeight: number;
  targetOptions: readonly ArchiveSignalTarget[];
  targetIndex: number;
  manualYaw: number | null;
  aimTarget: ArchiveSignalTarget;
  aimPosition: THREE.Vector3;
  targetYaw: number;
  currentYaw: number;
  accent: THREE.Color;
  facetMaterial: THREE.MeshStandardMaterial;
  coreMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  indicatorMaterial: THREE.MeshBasicMaterial;
  active: boolean;
  activeBlend: number;
  pulseAge: number;
}

interface ArchiveRelayDragHold {
  pointerId: number;
  relay: ArchiveSignalRelay;
  plane: THREE.Plane;
  point: THREE.Vector3;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface ArchiveSignalBeamBatch {
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  aura: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  corePositions: Float32Array;
  coreColors: Float32Array;
  auraPositions: Float32Array;
  auraColors: Float32Array;
  packets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  packetDummy: THREE.Object3D;
  starts: THREE.Vector3[];
  ends: THREE.Vector3[];
  colors: THREE.Color[];
  coreWidths: Float32Array;
  auraWidths: Float32Array;
  count: number;
}

interface ArchiveSignalInterruptionEffect {
  partialCore: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  partialAura: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  partialCorePositions: Float32Array;
  partialCoreColors: Float32Array;
  partialAuraPositions: Float32Array;
  partialAuraColors: Float32Array;
  impactRoot: THREE.Group;
  impactCore: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  impactRing: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  impactFragments: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  impactFragmentDummy: THREE.Object3D;
  bodyShimmer: THREE.Mesh<
    THREE.DodecahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  result: BeamInterruption;
  blocker: BeamBlocker;
  direction: THREE.Vector3;
  partialEnd: THREE.Vector3;
  active: boolean;
  blend: number;
}

interface ArchiveSignalPuzzle {
  root: THREE.Group;
  source: THREE.Group;
  sourceCore: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshStandardMaterial
  >;
  sourceRings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[];
  sourceLight: THREE.PointLight;
  collectorRoot: THREE.Group;
  collectorTrim: THREE.Group;
  collectorDish: THREE.Mesh<
    THREE.LatheGeometry,
    THREE.MeshStandardMaterial
  >;
  collectorRimGlow: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  collectorIncomingBeam: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  collectorFocusBeam: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  collectorFocusCore: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  collectorFocusPoint: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  collectorFocusStart: THREE.Vector3;
  collectorFocusEnd: THREE.Vector3;
  collectorIncomingStart: THREE.Vector3;
  collectorIncomingEnd: THREE.Vector3;
  collapseBeamFragments: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  collapseBeamFragmentDummy: THREE.Object3D;
  powerBlend: number;
  powerTarget: number;
  powerAnnouncementPending: boolean;
  progressPips: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  progressPipPositions: THREE.Vector3[];
  progressPipColors: THREE.Color[];
  progressPipDummy: THREE.Object3D;
  progressPipColorScratch: THREE.Color;
  relays: ArchiveSignalRelay[];
  beams: ArchiveSignalBeamBatch;
  interruption: ArchiveSignalInterruptionEffect;
  phaseRails: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  phaseRailPositions: Float32Array;
  phaseRailColors: Float32Array;
  phaseRailCount: number;
  phasePackets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  phasePacketDummy: THREE.Object3D;
  phasePacketStarts: THREE.Vector3[];
  phasePacketEnds: THREE.Vector3[];
  phasePacketOffsets: Float32Array;
  phasePacketOrigins: number[];
  phasePacketRouteSegments: number[];
  phasePacketCount: number;
  lensPosition: THREE.Vector3;
  receiverHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  resolvedColumn: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  feedbackColumn: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  lensOutcomeRoot: THREE.Group;
  lensOutcomeCore: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  lensOutcomeRing: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  lensOutcomeFragments: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  lensOutcomeDummy: THREE.Object3D;
  lensOutcome: ArchiveSignalLensOutcome;
  freeAimImpactRoot: THREE.Group;
  freeAimImpactCore: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  freeAimImpactRing: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  freeAimImpactActive: boolean;
  constellationRoot: THREE.Group;
  constellation: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  constellationPositions: Float32Array;
  constellationColors: Float32Array;
  constellationAura: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  constellationAuraPositions: Float32Array;
  constellationAuraColors: Float32Array;
  constellationSegmentCount: number;
  constellationBody: THREE.Mesh<
    THREE.IcosahedronGeometry,
    THREE.MeshStandardMaterial
  >;
  constellationShell: THREE.Mesh<
    THREE.IcosahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  constellationEchoes: THREE.Mesh<
    THREE.IcosahedronGeometry,
    THREE.MeshBasicMaterial
  >[];
  constellationOrbits: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >[];
  constellationStars: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  constellationStarPositions: THREE.Vector3[];
  constellationStarDummy: THREE.Object3D;
  route: THREE.Vector3[];
  routeRelayOrder: number[];
  result: ArchiveSignalRouteResult;
  visitedCount: number;
  matchedPhaseCount: number;
  feedbackStrength: number;
  feedbackBlend: number;
  feedbackPoint: THREE.Vector3;
  feedbackSegmentIndex: number;
  unstableFeedback: boolean;
  unstablePulseBudget: number;
  solved: boolean;
  resolutionBlend: number;
  pulseAge: number;
  spellPulseAge: number;
  projectionDisruptionAge: number;
  projectionDisruptionStrength: number;
}

interface LanternState {
  light: THREE.Mesh;
  position: THREE.Vector3;
  litUntil: number;
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

interface ObservabilityLogCascade {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  colors: Float32Array;
  phases: Float32Array;
  maximumCount: number;
  count: number;
  age: number;
  duration: number;
  stage: Exclude<SpellStage, "spark">;
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
  isAvailable?: () => boolean;
}

interface WanderingNpc {
  group: THREE.Group;
  origin: THREE.Vector3;
  interactionId: string;
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

interface RuneShard {
  origin: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  proxy: THREE.Mesh | null;
  kickable: Kickable | null;
  consumed: boolean;
  fishBaitAge: number;
}

interface RuneCrystalState {
  id: RuneId;
  label: string;
  group: THREE.Group;
  facets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshStandardMaterial
  >;
  inner: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  facetMaterial: THREE.MeshStandardMaterial;
  innerMaterial: THREE.MeshBasicMaterial;
  aura: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  groundGlow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  cracks: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  shards: RuneShard[];
  dummy: THREE.Object3D;
  color: THREE.Color;
  socketPosition: THREE.Vector3;
  carry: RitualCrystalCarry;
  placed: boolean;
  hits: number;
  pulseAge: number;
  breakAge: number;
  activated: boolean;
  broken: boolean;
}

interface RuneSocketRoot {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface RuneSocketState {
  id: RuneId;
  position: THREE.Vector3;
  color: THREE.Color;
  dormantColor: THREE.Color;
  symbolMaterial: THREE.MeshBasicMaterial;
  roots: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshStandardMaterial
  >;
  rootShards: RuneSocketRoot[];
  dummy: THREE.Object3D;
  reveal: number;
  revealUntil: number;
  growth: number;
}

interface RitualDecoyCrystalState {
  id: string;
  carry: RitualCrystalCarry;
  group: THREE.Group;
  facets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshStandardMaterial
  >;
  inner: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  aura: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  groundGlow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  cracks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  shards: RuneShard[];
  color: THREE.Color;
  hits: number;
  pulseAge: number;
  breakAge: number;
  broken: boolean;
}

interface RuneSparklePool {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  lifetimes: Float32Array;
  cursor: number;
  maximumCount: number;
}

interface RuneDiagnosticTrace {
  path: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  packet: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  positions: Float32Array;
  targets: RitualCrystalCarry[];
  pointCount: number;
  age: number;
  duration: number;
  nextTargetIndex: number;
  active: boolean;
}

interface FishSchool {
  mesh: THREE.InstancedMesh;
  aura: THREE.InstancedMesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
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
const maximumFishCount =
  riverFishCount + flyingFishPerShard * maximumFlyingFishSchools;

type VoidTurtleRidePhase =
  | "parked"
  | "departing"
  | "cruising"
  | "returning"
  | "dismounting";

interface VoidRideEffects {
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.InstancedMesh<
    THREE.DodecahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  trailPositions: Float32Array;
  trailDummy: THREE.Object3D;
  maximumTrailCount: number;
  meteors: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  meteorPositions: Float32Array;
  maximumMeteorCount: number;
}

interface VoidTurtleFin {
  pivot: THREE.Group;
  side: -1 | 1;
  phase: number;
  rear: boolean;
}

interface VoidTurtleState {
  group: THREE.Group;
  moonOrbit: THREE.Group;
  fins: VoidTurtleFin[];
  eyes: THREE.InstancedMesh;
  sleepEyes: THREE.LineSegments;
  awake: boolean;
  surface: SurfaceArea;
  interactionId: string;
  stationAngle: number;
  stationRadius: number;
  rideAngle: number;
  rideTravel: number;
  riding: boolean;
  ridePhase: VoidTurtleRidePhase;
  phaseAge: number;
  returnStartAngle: number;
  returnStartRadius: number;
  returnTargetAngle: number;
  dismountStart: THREE.Vector3;
  dismountTarget: THREE.Vector3;
  dismountHeight: number;
  buckAge: number;
  effects: VoidRideEffects;
}

interface TurtleAsteroidState {
  index: number;
  object: THREE.Group;
  band: THREE.Mesh;
  kickable: Kickable;
  collected: boolean;
  idleY: number;
  verticalPhase: number;
  orbitAngle: number;
  orbitRadius: number;
  targetRadius: number;
  orbitSpeed: number;
  baseOrbitSpeed: number;
  radialVelocity: number;
}

interface TurtleCargoOrbiterState {
  kickable: Kickable;
  orbitAngle: number;
  orbitRadius: number;
  targetRadius: number;
  orbitSpeed: number;
  radialVelocity: number;
  verticalPhase: number;
  originalGravity: boolean;
  originalRestingY: number;
}

interface ChestBurst {
  coins: THREE.InstancedMesh;
  light: THREE.PointLight;
  dummy: THREE.Object3D;
  velocities: Float32Array;
  age: number;
  count: number;
}

const runeCrystalDescriptors: Record<
  RuneId,
  { color: string; symbol: string; title: string }
> = {
  moon: { color: "violet", symbol: "crescent", title: "Moon" },
  tide: { color: "cyan", symbol: "current", title: "Tide" },
  ember: { color: "amber", symbol: "flame", title: "Ember" },
};

const runeCrystalShardTemplates = [
  {
    origin: [-0.36, 0.78, 0.02],
    scale: [0.22, 0.7, 0.22],
    rotation: [0.08, -0.18, -0.12],
    velocity: [-0.86, 1.52, 0.14],
    spin: [2.4, -1.8, 1.2],
  },
  {
    origin: [0, 1.08, 0],
    scale: [0.29, 1.01, 0.29],
    rotation: [-0.04, 0.14, 0.05],
    velocity: [0.12, 1.92, -0.25],
    spin: [-1.6, 2.2, 1.4],
  },
  {
    origin: [0.38, 0.65, 0.1],
    scale: [0.2, 0.56, 0.2],
    rotation: [0.05, 0.44, 0.17],
    velocity: [0.92, 1.32, 0.36],
    spin: [2, 1.7, -2.4],
  },
  {
    origin: [-0.16, 0.46, 0.3],
    scale: [0.15, 0.39, 0.15],
    rotation: [-0.12, 0.72, -0.2],
    velocity: [-0.42, 1.1, 0.84],
    spin: [-2.6, 1.2, 2],
  },
  {
    origin: [0.22, 0.43, -0.24],
    scale: [0.14, 0.36, 0.14],
    rotation: [0.14, -0.58, 0.2],
    velocity: [0.48, 1.18, -0.82],
    spin: [1.8, -2.5, -1.7],
  },
] as const;

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

const zoneMilestoneColors: Readonly<Record<ZoneId, readonly number[]>> = {
  field: [palette.amber, palette.green],
  falls: [palette.green, palette.cyan, palette.violet, palette.amber],
  grid: [palette.cyan, palette.coral, palette.violet, palette.amber],
  archive: [palette.violet, palette.cyan, palette.amber, palette.green],
  math: [
    palette.amber,
    palette.violet,
    palette.cyan,
    palette.green,
    palette.coral,
  ],
};

const zoneCollapseCommandFragments: Readonly<
  Record<ZoneId, { order: string; command: string }>
> = {
  // SUDO is the hub-level completion unlock rather than a portal fragment.
  field: { order: "01", command: "SUDO" },
  falls: { order: "02", command: "COLLAPSE" },
  grid: { order: "03", command: "WORLD" },
  archive: { order: "04", command: "--EVENT-HORIZON" },
  math: { order: "05", command: "--ARM" },
};
const portalDormantMilestoneShade = new THREE.Color(0x172227);

const up = new THREE.Vector3(0, 1, 0);
const avatarPitchAxis = new THREE.Vector3(1, 0, 0);
const avatarLongAxis = new THREE.Vector3(0, 1, 0);
const beamForward = new THREE.Vector3(0, 0, 1);
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
// The avatar and near-field transparent assemblies share this late layer so
// ordinary depth testing, rather than render-pass order, resolves overlaps.
const playerRenderLayer = 5;
const pointerInteractionLayer = 6;
// Ground projections never belong in front of elevated transparent effects.
// Draw them first so an overlapping spell aura can composite over the decal
// while opaque planets and scenery continue to use normal depth occlusion.
const groundProjectionRenderOrder = -10;
const voidTurtleRideSpeed = 0.25;
const voidTurtleCruiseOffset = 5.8;
const voidTurtleDepartureDuration = 2.7;
const voidTurtleReturnDuration = 2.4;
const voidTurtleDismountDuration = 0.92;
const voidTurtleAsteroidConfigs = [
  [1.3, 25.6, 1.2, 0.56],
  [2.36, 26.8, 1.75, 0.68],
  [3.43, 25.9, 1.35, 0.5],
  [4.52, 27.1, 2.05, 0.63],
  [5.62, 26.2, 1.55, 0.58],
  [0.48, 25.4, 1.3, 0.52],
] as const;
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

function createPortalMilestoneCrystalGeometry(
  radius: number,
): THREE.OctahedronGeometry {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  const normals = geometry.getAttribute("normal");
  const faceShades = new Float32Array(normals.count * 3);
  for (let vertex = 0; vertex < normals.count; vertex += 1) {
    const shade = THREE.MathUtils.clamp(
      0.76 +
        normals.getY(vertex) * 0.16 +
        normals.getX(vertex) * 0.07 -
        normals.getZ(vertex) * 0.05,
      0.58,
      1,
    );
    faceShades[vertex * 3] = shade;
    faceShades[vertex * 3 + 1] = shade;
    faceShades[vertex * 3 + 2] = shade;
  }
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(faceShades, 3),
  );
  return geometry;
}

const archiveAtlasX = -2;
const archiveAtlasZ = -1.1;
const archiveAtlasBarrierRadius = 2.08;
const archiveAtlasRestColor = new THREE.Color(0x081521);
const archiveAtlasRestEmissive = new THREE.Color(0x0b3040);
const archiveAtlasSilverColor = new THREE.Color(0xb9c7cd);
const archiveAtlasSilverEmissive = new THREE.Color(0x8ab9c6);
const archiveAtlasRestOrbitColor = new THREE.Color(palette.brass);
const archiveAtlasSilverOrbitColor = new THREE.Color(0xe0eaed);
const archiveAtlasRestLightColor = new THREE.Color(palette.cyan);
const archiveAtlasSilverLightColor = new THREE.Color(0xf2fdff);
const archiveFeedbackVioletColor = new THREE.Color(palette.violet);
const archiveFeedbackGreenColor = new THREE.Color(palette.green);
const archiveFeedbackResolvedColor = new THREE.Color(0xf4ffff);
const archiveOrbitOuterRadius = 13.1;
const archiveAscensionHeight = 5.55;
const archiveGravityLockDuration = 10;
const archiveGravityLockMotionScale = 0.045;
const archiveGravityLockImpulseScale = 0.12;
const archiveSignalAchievement = "THE LONG LISTEN";
const archiveSignalPhaseOrder = [0, 2, 1, 3] as const;
const archiveSignalInitialTargets = [0, 3, 0, 2] as const;
// The amber false route has no receiver: carry it beyond the orthographic
// camera's far plane so every reachable view clips the beam into open space.
const archiveSignalAmberVoidRadius = 220;
const archiveSignalFreeAimMinimumDistance = 0.48;
const archiveSignalSolidHitInset = 0.08;
const archiveSignalRelayCollisionBottom = 0.32;
const archiveSignalRelayCollisionTop = 1.42;
const archiveProjectionDisruptionDuration = 2.2;
const archiveDecodedSkyBodyY = 5.88;
const archiveSignalCyanMonitorEndpoint = new THREE.Vector3(
  1.82,
  1.35,
  -8.05,
);
const heliographIgnitionDelay = 1.35;
const heliographBurnDuration = 5.8;
const heliographPanicRetriggerDelay = 0.52;
const inactiveIgnitionPanicAge = -1;
// Violet splits, amber amplifies, cyan aligns, and green feeds the carrier
// through observability before returning it to violet.
const archiveSignalResolvedTargets = [1, 2, 1, 0] as const;
// A correct circuit reveals an authored sky rather than projecting the relay
// route back at the player. The closed eye contour surrounds an eclipsed world;
// its final two segments carry one decoded pulse beyond the mapped boundary.
const archiveDecodedSkyPoints = [
  new THREE.Vector3(-2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(-1.34, 5.96, -0.98),
  new THREE.Vector3(0, 5.84, -1.32),
  new THREE.Vector3(1.34, 5.96, -0.98),
  new THREE.Vector3(2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(1.34, 5.78, 0.98),
  new THREE.Vector3(0, 5.92, 1.32),
  new THREE.Vector3(-1.34, 5.78, 0.98),
  new THREE.Vector3(3.12, 6.08, 0.18),
  new THREE.Vector3(3.92, 5.7, -0.12),
] as const;
const archiveDecodedSkySegments = [
  { start: 0, end: 1, color: new THREE.Color(palette.violet) },
  { start: 1, end: 2, color: new THREE.Color(palette.violet) },
  { start: 2, end: 3, color: new THREE.Color(palette.amber) },
  { start: 3, end: 4, color: new THREE.Color(palette.amber) },
  { start: 4, end: 5, color: new THREE.Color(palette.cyan) },
  { start: 5, end: 6, color: new THREE.Color(palette.cyan) },
  { start: 6, end: 7, color: new THREE.Color(palette.green) },
  { start: 7, end: 0, color: new THREE.Color(palette.green) },
  { start: 4, end: 8, color: new THREE.Color(0xf4ffff) },
  { start: 8, end: 9, color: new THREE.Color(palette.cyan) },
] as const;
const archiveDecodedSkyStarPositions = [
  new THREE.Vector3(-2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(-1.34, 5.96, -0.98),
  new THREE.Vector3(1.34, 5.96, -0.98),
  new THREE.Vector3(2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(0, 5.92, 1.32),
  new THREE.Vector3(0, archiveDecodedSkyBodyY, 0),
] as const;
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
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
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
  private readonly fieldRockClusters: FieldRockClusterState[] = [];
  private lastFieldRockDebugRefresh = 0;
  private readonly kickables: Kickable[] = [];
  private readonly portalStates: PortalState[] = [];
  private readonly telescopeRigs: TelescopeRig[] = [];
  private readonly orbitingPlanets: OrbitingPlanet[] = [];
  private readonly lanterns: LanternState[] = [];
  private readonly lanternReveals: LanternReveal[] = [];
  private readonly digitClouds: DigitCloud[] = [];
  private readonly serverRacks: ServerRackState[] = [];
  private readonly wanderingNpcs: WanderingNpc[] = [];
  private readonly playerPosition = new THREE.Vector3(...fieldEntrySpawn);
  private readonly playerRadius = 0.4;
  private readonly playerCollisionHeight = 2.3;
  private readonly tempWorld = new THREE.Vector3();
  private readonly ambientGridDragTarget = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempOrbitPosition = new THREE.Vector2();
  private readonly tempOrbitPositionB = new THREE.Vector2();
  private readonly tempBounds = new THREE.Box3();
  private readonly pointer = new THREE.Vector2();
  private readonly pointerRaycaster = new THREE.Raycaster();
  private readonly pointerActionHits: THREE.Intersection[] = [];
  private readonly pointerActions: PointerAction[] = [];
  private readonly mathInstanceDragHits: THREE.Intersection[] = [];
  private readonly mathInstanceDrags: MathInstanceDragSpec[] = [];
  private mathInstanceDragHold: MathInstanceDragHold | null = null;
  private pointerActionReachTarget: THREE.Object3D | null = null;
  private pointerActionReachUntil = 0;
  private readonly playerOcclusionRaycaster = new THREE.Raycaster();
  private readonly playerOcclusionTarget = new THREE.Vector3();
  private readonly playerOcclusionDirection = new THREE.Vector3();
  private readonly playerOcclusionHits: THREE.Intersection[] = [];
  private readonly playerOccluders: THREE.Object3D[] = [];
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
  private readonly pencilRepairRay = new THREE.Ray();
  private readonly pencilRepairRayOrigin = new THREE.Vector3();
  private readonly pencilRepairDirection = new THREE.Vector3();
  private readonly orbitTelekinesisHolds = new Map<
    number,
    OrbitTelekinesisHold
  >();
  private readonly heldOrbitingPlanets = new Set<OrbitingPlanet>();

  private renderer!: THREE.WebGLRenderer;
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
  private fishBaitShard: RuneShard | null = null;
  private fishBaitFishIndex = -1;
  private fallsFishFeastAnnounced = false;
  private voidTurtle: VoidTurtleState | null = null;
  private voidTurtleAwakened = false;
  private readonly turtleAsteroids: TurtleAsteroidState[] = [];
  private readonly turtleCargoOrbiters: TurtleCargoOrbiterState[] = [];
  private readonly capturedTurtleAsteroidIndices = new Set<number>();
  private turtleAsteroidFlingAnnounced = false;
  private turtleCargoCaptureAnnounced = false;
  private readonly hanoiPuzzle: HanoiPuzzle;
  private readonly pongChallenge: PongChallenge;
  private pongRoguePacketLease: PongRoguePacketLease | null = null;
  private chestLid: THREE.Group | null = null;
  private chestPrize: THREE.Mesh | null = null;
  private chestBurst: ChestBurst | null = null;
  private chestOpened = false;
  private caveSeal: THREE.Group | null = null;
  private caveSealCollider: StaticCollider | null = null;
  private readonly puzzleWaterfallPanels: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private waterfallOpening = 0;
  private readonly runeStones = new Map<RuneId, RuneCrystalState>();
  private readonly runeSockets = new Map<RuneId, RuneSocketState>();
  private readonly ritualDecoys = new Map<string, RitualDecoyCrystalState>();
  private readonly ritualCrystals: RitualCrystalCarry[] = [];
  private runeSparkles: RuneSparklePool | null = null;
  private runeTinkleLight: THREE.PointLight | null = null;
  private runeTinkleAge = 2;
  private runeTinklePeakIntensity = 0;
  private runeDiagnosticTrace: RuneDiagnosticTrace | null = null;
  private runeProgress = 0;
  private fantasyPuzzleSolved = false;
  private observabilityPulse: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private observabilityPulseAge = 2;
  private observabilityPulsePeakOpacity = 0.86;
  private observabilityLogCascade: ObservabilityLogCascade | null = null;
  private archiveAtlas: ArchiveAtlasState | null = null;
  private archiveDataGlass: ArchiveDataGlassState | null = null;
  private archiveSignalPuzzle: ArchiveSignalPuzzle | null = null;
  private archiveSignalTargets: [number, number, number, number] = [
    ...archiveSignalInitialTargets,
  ];
  private readonly archiveSignalManualYaws: [
    number | null,
    number | null,
    number | null,
    number | null,
  ] = [null, null, null, null];
  private archiveRelayDragHold: ArchiveRelayDragHold | null = null;
  private archiveSignalRouteDirty = false;
  private archiveSignalEverSolved = false;
  private archiveSignalPowered = false;
  private archivePlanetFootprints: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private readonly archivePlanetFootprintDummy = new THREE.Object3D();
  private readonly archivePlanetFootprintColor = new THREE.Color();
  private readonly archivePlanetFootprintRestColor = new THREE.Color(
    palette.cyan,
  );
  private readonly archivePlanetFootprintLockColor = new THREE.Color(0xffefb2);
  private archiveOrbitDisturbed = false;
  private archiveOrbitRestoreDwell = 0;
  private archiveOrbitTelekinesisAnnounced = false;
  private readonly archiveSpaceAsteroids: Kickable[] = [];
  private archiveAsteroid: Kickable | null = null;
  private archiveAsteroidShadow: AsteroidShadow | null = null;
  private travelingAsteroid: TravelingAsteroidState | null = null;
  private archiveMonitorTarget: BreakableMonitor | null = null;
  private archiveOrbitPinballAnnounced = false;
  private archiveAscensionComplete = false;
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
  private externalInputEnabled = true;
  private transitioning = false;
  private preferReducedMotion = false;
  private portalArrivalGuardUntil = 0;
  private noclip = false;
  private collisionDebugEnabled = false;
  private speedMultiplier = 1;
  private elapsed = 0;
  private previousFrame = performance.now();
  private lastRenderedFrame = 0;
  private frameCount = 0;
  private metricElapsed = 0;
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
    this.hanoiPuzzle = new HanoiPuzzle({
      materials: this.materials,
      colors: palette,
      playerRadius: this.playerRadius,
      addStaticBox: (...args) => {
        this.addStaticBox(...args);
      },
      addSurface: (surface) => {
        this.surfaceAreas.push(surface);
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
    this.archiveAscensionComplete = hooks.hasAchievement("TO THE MOON");
    this.archiveSignalEverSolved = hooks.hasAchievement(
      archiveSignalAchievement,
    );
    if (this.archiveSignalEverSolved) {
      this.archiveSignalTargets = [...archiveSignalResolvedTargets];
      this.archiveSignalPowered = true;
    }
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
    this.ambientGrid = new AmbientGrid(this.scene);

    const hemisphere = new THREE.HemisphereLight(0x7ac5d1, 0x101412, 1.7);
    this.scene.add(hemisphere);
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
    this.canvas.addEventListener("pointerdown", this.handleTelekinesisDown);
    this.canvas.addEventListener("pointermove", this.handleTelekinesisMove);
    this.canvas.addEventListener("pointerup", this.handleTelekinesisUp);
    this.canvas.addEventListener("pointercancel", this.handleTelekinesisUp);
    this.canvas.addEventListener("lostpointercapture", this.handleTelekinesisUp);
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
    this.lastRenderedFrame = 0;
    if (this.documentVisible) this.renderer.setAnimationLoop(this.frame);
  }

  dispose(): void {
    if (this.disposed) return;
    const fullyInitialized = this.initializationComplete;
    this.completeFieldCompassEquipFlight(false);
    this.completePortablePencilEquipFlight(false);
    this.disposed = true;
    this.running = false;
    if (this.renderer) this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    if (this.listenersConnected) {
      document.removeEventListener("visibilitychange", this.handleVisibility);
      this.canvas.removeEventListener("pointerdown", this.handleTelekinesisDown);
      this.canvas.removeEventListener("pointermove", this.handleTelekinesisMove);
      this.canvas.removeEventListener("pointerup", this.handleTelekinesisUp);
      this.canvas.removeEventListener("pointercancel", this.handleTelekinesisUp);
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
    this.clearZone();
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

  getQuality(): QualityTier {
    return this.quality;
  }

  isNoclipEnabled(): boolean {
    return this.noclip;
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  setReducedMotionPreference(reduced: boolean): void {
    this.preferReducedMotion = reduced;
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
    this.cancelAllPointerDrags(false);
    this.pongChallenge.stopForWorldCollapse();
    if (this.voidTurtle?.riding) {
      this.voidTurtle.riding = false;
      this.voidTurtle.ridePhase = "parked";
      this.hooks.onTurtleMediaChange(false);
    }
    this.activeInteraction = null;
    this.hooks.onInteractionChange(null);
    this.interactions.length = 0;
    this.pointerActions.length = 0;
    this.mathInstanceDrags.length = 0;
    this.portalArrivalGuardUntil = Number.POSITIVE_INFINITY;
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
    this.worldCollapsePromise = new Promise<ZoneId>((resolve) => {
      this.worldCollapseResolve = resolve;
    });
    return this.worldCollapsePromise;
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
    this.externalInputEnabled = enabled;
    if (!enabled) this.cancelAllPointerDrags();
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
    const shadowModeChanged =
      (this.quality === "low") !== (quality === "low");
    this.quality = quality;
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
    this.ambientFill.intensity = shadowsEnabled ? 0 : 0.92;
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
    this.ambientGrid?.setQuality(quality);
    for (const planet of this.orbitingPlanets) {
      planet.pivot.visible =
        this.heldOrbitingPlanets.has(planet) ||
        quality === "high" ||
        (quality === "medium" && planet.detail < 4) ||
        planet.detail < 2;
    }
    if (this.fishSchool) {
      const fishCount = this.getFishRenderCount(
        this.fishSchool,
        quality,
      );
      this.fishSchool.mesh.count = fishCount;
      this.fishSchool.aura.count = fishCount;
    }
    if (this.chestBurst && this.chestBurst.age >= 2.2) {
      this.chestBurst.count = quality === "low" ? 10 : 18;
      this.chestBurst.coins.count = this.chestBurst.count;
    }
    if (this.voidTurtle) {
      const effects = this.voidTurtle.effects;
      effects.trail.count =
        quality === "low"
          ? Math.min(12, effects.maximumTrailCount)
          : quality === "medium"
            ? Math.min(18, effects.maximumTrailCount)
            : effects.maximumTrailCount;
      const meteorCount =
        quality === "low"
          ? Math.min(3, effects.maximumMeteorCount)
          : quality === "medium"
            ? Math.min(5, effects.maximumMeteorCount)
            : effects.maximumMeteorCount;
      effects.meteors.geometry.setDrawRange(0, meteorCount * 2);
    }
    if (this.runeSparkles) {
      this.runeSparkles.points.material.size =
        quality === "low" ? 0.1 : quality === "medium" ? 0.13 : 0.15;
    }
    this.setSprintDustQuality(quality);
    this.setPlayerIgnitionQuality(quality);
    if (this.observabilityLogCascade) {
      this.observabilityLogCascade.points.material.size =
        (quality === "low" ? 34 : quality === "medium" ? 40 : 46) +
        (this.observabilityLogCascade.stage === "thunder" ? 4 : 0);
    }
    this.pongChallenge.refreshQuality();
    this.mightymaticaZone?.setQuality(quality);
    this.resize();
    this.hooks.onQualityChange(quality);
  }

  setSpeedMultiplier(multiplier: number): number {
    this.speedMultiplier = Math.max(1, Math.min(3, Math.round(multiplier)));
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

  respawn(): void {
    if (this.disposed || this.transitioning || this.worldCollapse !== null) {
      return;
    }
    this.resetAtZoneAnchor();
  }

  private resetAtZoneAnchor(): void {
    this.cancelAtlasAutopilot(false);
    this.cancelAllPointerDrags();
    this.cancelSpellCharge();
    const runesReset = this.resetFantasyRunes(false);
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
          ? this.fantasyPuzzleSolved
            ? " The loose crystal cache re-knits around the awakened sockets."
            : " The fractured runes re-knit and their sequence resets."
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
      isThunder && this.wakeVoidTurtleFromThunder(range);
    const turtleAsteroidsPulsed = isThunder
      ? this.pulseCapturedTurtleAsteroids(range, castCharge)
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
      this.twinkleNearbyRitualCrystals(
        range,
        this.spellStage,
        castCharge,
      );
      const revealedSockets = this.revealRuneSockets(
        range,
        1.45 + castCharge * 1.8,
      );
      this.hooks.onStatus(
        `${
          this.fantasyPuzzleSolved
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
      this.triggerObservabilityScan();
      const signalPrismsReached = this.pulseArchiveSignalPuzzle(
        this.spellStage,
        castCharge,
        range,
      );
      this.markArchiveOrbitDisturbed();
      let gravityLocked = 0;
      let worldsPushed = 0;
      for (const planet of this.orbitingPlanets) {
        if (!planet.pivot.visible) continue;
        planet.planet.getWorldPosition(this.tempWorld);
        const awayX = this.tempWorld.x - this.playerPosition.x;
        const awayZ = this.tempWorld.z - this.playerPosition.z;
        const distance = Math.hypot(awayX, awayZ);
        if (distance <= 0.01 || distance > range) continue;

        if (isThunder) {
          const lockDuration =
            archiveGravityLockDuration * (0.42 + castCharge * 0.58);
          planet.rigidUntil = Math.max(
            planet.rigidUntil,
            this.elapsed + lockDuration,
          );
          planet.rigidity = Math.max(
            planet.rigidity,
            0.78 + castCharge * 0.2,
          );
          planet.radialVelocity *= THREE.MathUtils.lerp(
            0.3,
            0.045,
            castCharge,
          );
          planet.orbitalBoost *= THREE.MathUtils.lerp(
            0.26,
            0.035,
            castCharge,
          );
          planet.tiltVelocity *= THREE.MathUtils.lerp(
            0.34,
            0.08,
            castCharge,
          );
          gravityLocked += 1;
          continue;
        }

        // Spark and Surge are kinetic casts. They break any existing gravity
        // lock, push away from the caster, and add tangential speed without
        planet.rigidUntil = this.elapsed;
        planet.rigidity = Math.min(planet.rigidity, 0.12);
        const direction = Math.sign(planet.speed) || 1;
        const stageForce = isSurge ? 1.28 : 0.72;
        const chargeForce = 0.68 + castCharge * 0.78;
        const tiltDirection = planet.detail % 2 === 0 ? 1 : -1;
        this.applyOrbitingPlanetImpulse(
          planet,
          awayX / distance,
          awayZ / distance,
          (isSurge ? 5.2 : 3.4) * chargeForce,
        );
        planet.orbitalBoost = THREE.MathUtils.clamp(
          planet.orbitalBoost + direction * stageForce * chargeForce,
          -2.4,
          2.4,
        );
        planet.tiltVelocity = THREE.MathUtils.clamp(
          planet.tiltVelocity +
            tiltDirection * (0.16 + stageForce * 0.13) * chargeForce,
          -0.72,
          0.72,
        );
        worldsPushed += 1;
      }
      const orbitObservation = isThunder
        ? gravityLocked > 0
          ? `Thunder catches ${gravityLocked} nearby ${
              gravityLocked === 1 ? "world" : "worlds"
            }. Gold contact-rings harden as the orbits slow almost to stillness.`
          : "Thunder rolls into the dark; no nearby world answers its weight."
        : worldsPushed > 0
          ? `${
              isSurge ? "Packet Surge" : "Binary rain"
            } drives ${worldsPushed} nearby ${
              worldsPushed === 1 ? "world" : "worlds"
            } outward into fast new arcs.`
          : `${
              isSurge ? "Packet Surge" : "Binary rain"
            } scatters before reaching an orbit.`;
      const projectionDisrupted =
        isThunder &&
        signalPrismsReached &&
        this.archiveSignalPuzzle?.solved === true;
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

  completeFantasyRitual(): boolean {
    if (this.currentZone !== "falls" || this.fantasyPuzzleSolved) {
      return this.fantasyPuzzleSolved;
    }
    this.resetFantasyRunes(false);
    for (const id of ["moon", "tide", "ember"] as const) {
      const rune = this.runeStones.get(id);
      if (rune) this.seatRuneCrystal(rune, false);
    }
    for (const id of ["moon", "tide", "ember"] as const) {
      this.activateFantasyRune(id);
    }
    return this.fantasyPuzzleSolved;
  }

  traceFantasyRitual(): boolean {
    const trace = this.runeDiagnosticTrace;
    const orderedRunes = (["moon", "tide", "ember"] as const)
      .map((id) => this.runeStones.get(id))
      .filter((rune): rune is RuneCrystalState => rune !== undefined);
    if (
      this.currentZone !== "falls" ||
      !trace ||
      orderedRunes.length !== 3
    ) {
      return false;
    }

    const targets = [
      ...orderedRunes.map((rune) => rune.carry),
      ...[...this.ritualDecoys.values()]
        .filter((crystal) => crystal.broken)
        .map((crystal) => crystal.carry),
    ];
    const targetObjects = targets.map((carry) =>
      this.getRitualCrystalTargetObject(carry),
    );
    const brokenCount = targets.filter((carry) =>
      this.isRitualCrystalBroken(carry),
    ).length;
    const segmentSteps = 12;
    let pointIndex = 0;
    for (let segment = 0; segment < targets.length; segment += 1) {
      const end = targetObjects[segment];
      if (!end) continue;
      const previous = targetObjects[segment - 1];
      const startX =
        segment === 0
          ? this.playerPosition.x
          : previous?.position.x ?? this.playerPosition.x;
      const startZ =
        segment === 0
          ? this.playerPosition.z
          : previous?.position.z ?? this.playerPosition.z;
      for (let step = segment === 0 ? 0 : 1; step <= segmentSteps; step += 1) {
        const progress = step / segmentSteps;
        const offset = pointIndex * 3;
        trace.positions[offset] = THREE.MathUtils.lerp(
          startX,
          end.position.x,
          progress,
        );
        trace.positions[offset + 1] =
          1.12 + Math.sin(progress * Math.PI) * 0.72;
        trace.positions[offset + 2] = THREE.MathUtils.lerp(
          startZ,
          end.position.z,
          progress,
        );
        pointIndex += 1;
      }
    }

    trace.targets = targets;
    trace.pointCount = pointIndex;
    trace.age = 0;
    trace.duration = this.reduceMotion
      ? Math.max(1.45, targets.length * 0.38)
      : 0.65 + targets.length * 0.7;
    trace.nextTargetIndex = 0;
    trace.active = true;
    trace.path.material.color.setHex(palette.violet);
    trace.path.material.opacity = 0.92;
    trace.path.geometry.setDrawRange(
      0,
      this.reduceMotion ? trace.pointCount : 1,
    );
    (
      trace.path.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    trace.path.visible = true;
    trace.packet.visible = !this.reduceMotion;
    trace.packet.position.set(
      trace.positions[0] ?? this.playerPosition.x,
      trace.positions[1] ?? 1.12,
      trace.positions[2] ?? this.playerPosition.z,
    );
    this.hooks.onStatus(
      brokenCount === 0
        ? "A violet command trace escapes the terminal and enters the physical rune circuit."
        : `A violet command trace enters the physical circuit. ${
            brokenCount === 1
              ? "One broken cluster waits somewhere along its route."
              : `${brokenCount} broken clusters wait along its route.`
          }`,
    );
    return true;
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
      this.staticColliders.length = 0;
      this.surfaceAreas.length = 0;
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
    if (this.currentZone === "field" && this.voidTurtle) {
      const turtle = this.voidTurtle;
      for (const fin of turtle.fins) {
        const struggle =
          Math.sin(this.elapsed * (8.5 + Number(fin.rear) * 1.7) + fin.phase) *
          instability;
        fin.pivot.rotation.z =
          fin.side * struggle * (0.22 + frame.pull * 0.64);
        fin.pivot.rotation.x =
          Math.cos(this.elapsed * 7.2 + fin.phase) *
          instability *
          0.16;
      }
      turtle.moonOrbit.rotation.y +=
        delta * instability * (3.6 + frame.pull * 9.6);
    }

    if (this.currentZone === "falls") {
      const water = this.zoneGroup.getObjectByName("falls-river-water");
      if (water) {
        water.rotation.x -= delta * instability * 0.72;
        water.rotation.z =
          Math.sin(this.elapsed * 1.6) * instability * 0.08;
      }
      for (const panel of this.puzzleWaterfallPanels) {
        panel.rotation.z +=
          Math.sin(this.elapsed * 2.1 + panel.position.x) *
          instability *
          delta *
          1.08;
      }
      for (const rune of this.runeStones.values()) {
        rune.facetMaterial.emissiveIntensity =
          0.7 +
          instability *
            (1.4 + Math.sin(this.elapsed * 7 + rune.group.position.x) * 0.5);
      }
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
      for (const [index, planet] of this.orbitingPlanets.entries()) {
        planet.pivot.rotation.y +=
          delta * instability * (1.5 + index * 0.42);
        planet.pivot.rotation.z =
          Math.sin(this.elapsed * 0.8 + index) *
          instability *
          0.28;
      }
      const observability = this.zoneGroup.getObjectByName(
        "archive-observability-ring",
      );
      if (observability) {
        observability.scale.x = 1 + instability * 1.45;
        observability.scale.z = Math.max(0.18, 1 - instability * 0.72);
      }
      if (this.archiveAtlas) {
        this.archiveAtlas.light.intensity = Math.max(
          this.archiveAtlas.light.intensity,
          instability * (2.4 + Math.sin(this.elapsed * 8) * 0.8),
        );
        this.archiveAtlas.orbit.rotation.z +=
          delta * instability * 2.4;
      }
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

    // DOM overlays lock world input, but the visible world should retain its
    // normal adaptive frame rate while a terminal or dialog is open.
    const activePointerInput =
      this.spellCharging ||
      this.hasActivePointerDrag() ||
      this.elapsed < this.pointerActionReachUntil;
    const targetFps =
      this.quality === "low"
        ? activePointerInput
          ? 60
          : 30
        : this.input.isActive() ||
            activePointerInput ||
            this.atlasAutopilot !== null ||
            this.jumpHeight > 0 ||
            this.teleportRitual.active ||
            this.terminalTraversal.active ||
            this.compassEquipFlight !== null ||
            this.pencilEquipFlight !== null ||
            this.pongChallenge.isActive() ||
            this.voidTurtle?.riding ||
            this.heldKickable !== null ||
            (this.sprintDustTrail?.activeCount ?? 0) > 0 ||
            (this.playerIgnition?.exposure ?? 0) > 0.01 ||
            (this.playerIgnition?.burnRemaining ?? 0) > 0 ||
            (this.playerIgnition?.panicAge ?? -1) >= 0 ||
            (this.playerIgnition?.activeEmberCount ?? 0) > 0 ||
            (this.playerIgnition?.activeSmokeCount ?? 0) > 0 ||
            (this.playerIgnition?.smolderRemaining ?? 0) > 0 ||
            (this.ambientGrid?.hasActiveMotion() ?? false) ||
            this.orbitTelekinesisHolds.size > 0 ||
            this.digitStormAge < this.digitStormDuration ||
            this.thunderBolts.visible ||
            this.waterfallRecoveryAge >= 0 ||
            (this.tentState?.restBlend ?? 0) > 0.002 ||
            this.splashBurst?.drops.visible === true ||
            (this.runeAltar?.hasActiveMotion() ?? false) ||
            (this.archiveAtlas?.pulseAge ?? 2) < 1.65 ||
            Math.abs(
              (this.archiveSignalPuzzle?.powerBlend ?? 0) -
                (this.archiveSignalPuzzle?.powerTarget ?? 0),
            ) > 0.001 ||
            (this.chestBurst?.age ?? 3) < 2.2 ||
            this.serverFlickerAge < this.serverFlickerDuration ||
            this.worldCollapse !== null ||
            (this.legacySimulationCube?.rematerialization?.isActive ?? false) ||
            (this.mightymaticaZone?.hasActiveMotion() ?? false)
          ? 60
          : 30;
    const minimumFrameTime = 1000 / targetFps;
    if (
      this.lastRenderedFrame > 0 &&
      time - this.lastRenderedFrame < minimumFrameTime - 1
    ) {
      return;
    }
    this.lastRenderedFrame = time;

    const delta = Math.min(0.05, Math.max(0.001, (time - this.previousFrame) / 1000));
    this.previousFrame = time;
    this.elapsed += delta;

    this.updateVoidTurtle(delta);
    this.teleportRitual.update(delta);
    this.updatePlayer(delta);
    this.updatePlayerIgnition(delta);
    this.updateFieldCompassEquipFlight(delta);
    this.updatePortablePencilEquipFlight(delta);
    this.updateArchiveAsteroidShadow();
    this.updateTurtleAsteroids(delta);
    this.hanoiPuzzle.update(delta, this.elapsed);
    this.mightymaticaZone?.update(delta, this.elapsed);
    this.legacySimulationCube?.rematerialization?.update(delta, this.elapsed);
    this.updatePortals(delta);
    this.updatePortalMilestones(delta);
    this.updateTelescopeRigs(delta);
    this.updateOrbitingPlanets(delta);
    this.updateWanderingNpcs(delta);
    this.updateFishSchool(delta);
    this.updateChestBurst(delta);
    this.updateFantasyWaterfall(delta);
    this.updateRuneEffects(delta);
    this.runeAltar?.update(delta, this.elapsed, this.reduceMotion);
    this.updateSpell(delta);
    this.updateLantern(delta);
    this.updateObservabilityPulse(delta);
    this.updateArchiveSignalPuzzle(delta);
    this.updateInteractions();
    this.updateAnimatedItems(delta);
    this.updateArchiveDataGlass(delta);
    this.updateWorldCollapse(delta);
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
    this.updatePlayerOcclusionOutline();
    this.terminalTraversal.update(delta, this.elapsed);
    this.renderScene();
    this.updateMetrics(delta);
  };

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
    const jumpRequested = this.input.consumeJump();
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
    const movementIntent =
      Math.abs(axes.horizontal) > 0.01 || Math.abs(axes.forward) > 0.01;
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
    if (this.voidTurtle?.riding) {
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
    this.updateJump(
      delta,
      jumpRequested &&
        !actionLocked &&
        !this.pongChallenge.isActive() &&
        !this.voidTurtle?.riding,
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
      !this.voidTurtle?.riding
    ) {
      this.updateAtlasAutopilotInput(
        axes,
        delta,
        movementIntent,
        jumpRequested,
      );
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
        (axes.running ? 6.8 : 4.25) * this.speedMultiplier;
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
    const turtleDismounting =
      this.voidTurtle?.riding === true &&
      this.voidTurtle.ridePhase === "dismounting";
    const surfaceOffset = turtleDismounting
      ? this.voidTurtle?.dismountHeight ?? 0
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
    const primaryHeldOrbitingPlanet = this.getPrimaryHeldOrbitingPlanet();
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
          primaryHeldOrbitingPlanet?.worldPosition ??
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
    this.updateKickables(delta, moving);
    this.updateFieldRockClusters(delta, moving);
    this.updateRitualCrystalPlacements();
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
    const puzzle = this.archiveSignalPuzzle;
    if (
      this.currentZone !== "archive" ||
      !puzzle ||
      (this.worldCollapseFrame?.age ?? 0) >= 2.15 ||
      THREE.MathUtils.smoothstep(puzzle.powerBlend, 0.48, 0.86) <
        0.88
    ) {
      return false;
    }
    const start = puzzle.collectorFocusStart;
    const end = puzzle.collectorFocusEnd;
    const directionX = end.x - start.x;
    const directionY = end.y - start.y;
    const directionZ = end.z - start.z;
    const lengthSquared =
      directionX * directionX +
      directionY * directionY +
      directionZ * directionZ;
    if (lengthSquared <= 0.001) return false;

    for (const localHeight of [0.58, 1.18, 1.82] as const) {
      const playerX = this.player.group.position.x;
      const playerY = this.player.group.position.y + localHeight;
      const playerZ = this.player.group.position.z;
      const progress = THREE.MathUtils.clamp(
        ((playerX - start.x) * directionX +
          (playerY - start.y) * directionY +
          (playerZ - start.z) * directionZ) /
          lengthSquared,
        0,
        1,
      );
      if (progress <= 0.015 || progress >= 0.985) continue;
      const closestX = start.x + directionX * progress;
      const closestY = start.y + directionY * progress;
      const closestZ = start.z + directionZ * progress;
      const distance = Math.hypot(
        playerX - closestX,
        playerY - closestY,
        playerZ - closestZ,
      );
      const beamRadius = THREE.MathUtils.lerp(0.11, 1.78, progress);
      if (distance <= beamRadius + 0.22) return true;
    }
    return false;
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
      this.jumpVelocity = 7.4;
      this.jumpHeight = 0.01;
    }

    if (this.jumpHeight <= 0 && this.jumpVelocity <= 0) return;
    this.jumpVelocity -= 17.5 * delta;
    this.jumpHeight += this.jumpVelocity * delta;

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
    for (const surface of this.surfaceAreas) {
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
    for (const surface of this.surfaceAreas) {
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
    const feetHeight = this.surfaceOffset + this.jumpHeight;
    if (!this.noclip) {
      this.resolveStaticColliderPenetration(
        position,
        feetHeight,
        previousFeetHeight,
      );
    }

    let terrainOffset = 0;
    let terrainShadowY = 0.16;
    if (this.currentZone === "falls") {
      const inStream = isInsideFallsRiver(position.x, position.z);
      const onBridge =
        Math.abs(position.x) < 3.9 && Math.abs(position.z - 2.4) < 1.52;
      const worldFeetHeight = this.surfaceOffset + this.jumpHeight;
      const inWater =
        inStream && !onBridge && worldFeetHeight < 0.05;
      terrainOffset = onBridge ? 0.42 : inWater ? -0.16 : 0;
      terrainShadowY = onBridge ? 0.535 : inStream ? 0.235 : 0.16;

      if (inWater && !this.playerInWater) this.triggerSplash(position.x, position.z);
      this.playerInWater = inWater;
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
    const selectedSurfaces = selectSupportedSurfaces(
      this.surfaceAreas,
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
    if (!surface && grounded) {
      surface = selectedSurfaces.grounded;
    }

    if (this.activePlatform && !activeSurface) {
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
        if (surface.id === "void-turtle-shell" && !this.voidTurtle?.riding) {
          const pushLength = Math.max(0.001, Math.hypot(surface.x, surface.z));
          this.activePlatform = null;
          this.surfaceOffset = terrainOffset;
          this.jumpHeight = surfaceHeight + 0.08;
          this.jumpVelocity = 9.1;
          this.playerPosition.x -= (surface.x / pushLength) * 2.8;
          this.playerPosition.z -= (surface.z / pushLength) * 2.8;
          if (this.voidTurtle) this.voidTurtle.buckAge = 0;
          this.hooks.onStatus(
            this.voidTurtle?.awake
              ? "The wakeful turtle snaps its shell upward. You arc back toward the station."
              : "The sleeping turtle flinches beneath your boots. Its shell throws you back toward the station.",
          );
          this.updateSplash(delta);
          return this.surfaceOffset;
        }
        this.activePlatform = surface;
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
      } else if (!surface.requiresJump) {
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
      for (const candidate of this.surfaceAreas) {
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
    this.shadowSurfaceY =
      projectedShadowOffset > terrainOffset + 0.02
        ? projectedShadowOffset + 0.012
        : terrainShadowY;
    this.shadowVerticalDistance = Math.max(
      0,
      this.surfaceOffset + this.jumpHeight - projectedShadowOffset,
    );
    this.updateSplash(delta);
    return this.surfaceOffset;
  }

  private releaseActivePlatformIntoAir(terrainOffset: number): void {
    const previousHeight = this.surfaceOffset;
    this.activePlatform = null;
    this.surfaceOffset = terrainOffset;
    this.jumpHeight += Math.max(0, previousHeight - terrainOffset);
  }

  private triggerSplash(x: number, z: number): void {
    if (!this.splashRing) return;
    const isWaterfallDive =
      this.currentZone === "falls" && this.airbornePeakHeight >= 3.2;
    const firstSplash = !this.hasSplashed;
    this.hasSplashed = true;
    this.splashAge = 0;
    this.splashDuration = isWaterfallDive ? 1.25 : 0.8;
    this.splashMagnitude = isWaterfallDive ? 1.85 : 1;
    this.splashRing.position.set(x, 0.24, z);
    this.splashRing.scale.setScalar(isWaterfallDive ? 1.05 : 0.7);
    this.splashRing.material.opacity = 0.9;
    this.splashRing.visible = true;
    if (isWaterfallDive) {
      this.waterfallRecoveryAge = 0;
      this.resetJump();
      this.spellCharging = false;
      this.spellCharge = 0;
      this.hooks.onSpellCharge(0, false);
      this.triggerWaterSplashBurst(x, z);
      this.hooks.onStatus(
        "You plunge from the waterfall crown. The river answers with one enormous, deeply unnecessary splash.",
        { kind: "achievement", title: "WORTH IT" },
      );
    } else if (firstSplash) {
      this.hooks.onStatus("Splash. The bridge was optional.");
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

  private triggerWaterSplashBurst(x: number, z: number): void {
    const burst = this.splashBurst;
    if (!burst) return;
    burst.age = 0;
    burst.duration = 1.35;
    burst.count =
      this.quality === "low" ? 8 : this.quality === "medium" ? 13 : 18;
    burst.drops.count = burst.count;
    burst.drops.position.set(x, 0.28, z);
    burst.drops.visible = true;
    for (let index = 0; index < burst.count; index += 1) {
      const angle = index * 2.39996 + 0.27;
      const speed = 1.35 + (index % 5) * 0.28;
      burst.velocities[index * 3] = Math.cos(angle) * speed;
      burst.velocities[index * 3 + 1] = 3.8 + (index % 4) * 0.48;
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
    this.cameraTargetFocus.set(position.x, 0.72, position.z);
    this.cameraTargetOffset.copy(this.explorationCameraOffset);
    let targetZoom = 1;

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
    } else if (this.voidTurtle?.riding) {
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
    } else if (this.currentZone === "falls" && position.z < -5.6) {
      const proximity = THREE.MathUtils.clamp((-position.z - 5.6) / 4.2, 0, 1);
      const lateralInfluence =
        1 -
        THREE.MathUtils.smoothstep(Math.abs(position.x), 4.2, 9.4);
      const alignment = proximity * lateralInfluence;
      this.cameraTargetFocus.set(
        THREE.MathUtils.lerp(position.x, 0, 0.42 * alignment),
        THREE.MathUtils.lerp(
          0.72,
          0.82 + this.surfaceOffset * 0.52,
          alignment,
        ),
        THREE.MathUtils.lerp(
          position.z,
          Math.max(-10.6, position.z - 0.9 - proximity * 0.45),
          alignment,
        ),
      );
      this.cameraTargetOffset.set(
        THREE.MathUtils.lerp(
          this.explorationCameraOffset.x,
          0,
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
        1.16 + proximity * (this.fantasyPuzzleSolved ? 0.12 : 0.07),
        alignment,
      );
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

  private updateWanderingNpcs(delta: number): void {
    for (const npc of this.wanderingNpcs) {
      npc.speechAge = Math.min(
        npc.speechDuration,
        npc.speechAge + delta,
      );
      const speaking = npc.speechAge < npc.speechDuration;
      const playerDistance = Math.hypot(
        npc.group.position.x - this.playerPosition.x,
        npc.group.position.z - this.playerPosition.z,
      );
      const motionScale = this.reduceMotion ? 0.28 : 1;
      if (playerDistance > 2.25 && !speaking) {
        npc.angle += npc.speed * delta * motionScale;
        const targetX = npc.origin.x + Math.cos(npc.angle) * npc.radiusX;
        const targetZ = npc.origin.z + Math.sin(npc.angle * 0.86) * npc.radiusZ;
        const previousX = npc.group.position.x;
        const previousZ = npc.group.position.z;
        const follow = 1 - Math.exp(-delta * 3.2);
        npc.group.position.x = THREE.MathUtils.lerp(
          npc.group.position.x,
          targetX,
          follow,
        );
        npc.group.position.z = THREE.MathUtils.lerp(
          npc.group.position.z,
          targetZ,
          follow,
        );
        const movementX = npc.group.position.x - previousX;
        const movementZ = npc.group.position.z - previousZ;
        if (movementX * movementX + movementZ * movementZ > 0.000001) {
          npc.group.rotation.y = Math.atan2(movementX, movementZ);
        }
      } else if (speaking && playerDistance > 0.01) {
        npc.group.rotation.y = Math.atan2(
          this.playerPosition.x - npc.group.position.x,
          this.playerPosition.z - npc.group.position.z,
        );
      }
      const ambientBob =
        Math.sin(this.elapsed * 3.1 * motionScale + npc.angle) *
        0.035 *
        motionScale;
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
      npc.group.position.y = ambientBob + speechHop;
      const interaction = this.interactions.find(
        (candidate) => candidate.id === npc.interactionId,
      );
      interaction?.position.set(npc.group.position.x, 0, npc.group.position.z);
    }
  }

  private emitNpcSpeech(
    interactionId: string,
    speaker: string,
    message: string,
  ): void {
    const npc = this.wanderingNpcs.find(
      (candidate) => candidate.interactionId === interactionId,
    );
    if (npc) npc.speechAge = 0;
    this.hooks.onStatus(message, { kind: "speech", speaker });
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
      this.voidTurtle?.riding
    ) {
      this.hooks.onStatus(
        "A guided route cannot take the controls from the current activity.",
      );
      return false;
    }
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
    const portal = this.portalStates.find(
      (candidate) => candidate.destination === nextZone,
    );
    if (!portal) {
      this.atlasAutopilot = null;
      this.hooks.onStatus(
        `The route cannot resolve a physical threshold toward ${zoneLabels[nextZone]} from here.`,
      );
      return false;
    }
    const path = this.findAtlasAutopilotPath(portal.position);
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

  private isAtlasPathPointWalkable(
    x: number,
    z: number,
    start: THREE.Vector3,
    goal: THREE.Vector3,
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
    if (startDistanceSquared < 0.72 * 0.72 || goalDistanceSquared < 1.46 * 1.46) {
      return true;
    }

    const padding = this.playerRadius + 0.14;
    for (const collider of this.staticColliders) {
      const top = collider.y + collider.halfHeight;
      const bottom = collider.y - collider.halfHeight;
      if (
        top <= 0.22 ||
        bottom >= this.playerCollisionHeight ||
        (collider.solidTop !== undefined && collider.solidTop <= 0.22)
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

  private hasAtlasPathLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    start: THREE.Vector3,
    goal: THREE.Vector3,
  ): boolean {
    const distance = from.distanceTo(to);
    const steps = Math.max(1, Math.ceil(distance / 0.28));
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const x = THREE.MathUtils.lerp(from.x, to.x, progress);
      const z = THREE.MathUtils.lerp(from.z, to.z, progress);
      if (!this.isAtlasPathPointWalkable(x, z, start, goal)) return false;
    }
    return true;
  }

  /**
   * Plans only when a folio route is requested or becomes stuck. The runtime
   * walk loop then follows this compact path, avoiding a per-frame nav solver.
   */
  private findAtlasAutopilotPath(goalPosition: THREE.Vector3): THREE.Vector3[] {
    const start = new THREE.Vector3(
      this.playerPosition.x,
      0,
      this.playerPosition.z,
    );
    const goal = new THREE.Vector3(goalPosition.x, 0, goalPosition.z);
    if (start.distanceTo(goal) < 0.72) return [start, goal];
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
        if (!this.isAtlasPathPointWalkable(point.x, point.z, start, goal)) {
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
            !this.isAtlasPathPointWalkable(sideA.x, sideA.z, start, goal) ||
            !this.isAtlasPathPointWalkable(sideB.x, sideB.z, start, goal)
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
        !this.hasAtlasPathLineOfSight(raw[anchor] ?? start, raw[next] ?? goal, start, goal)
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
        this.portalStates.find(
          (candidate) => candidate.destination === route.nextZone,
        ) ||
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

  private updatePortals(delta: number): void {
    if (this.worldCollapse) return;
    for (const portal of this.portalStates) {
      const dx = portal.position.x - this.playerPosition.x;
      const dz = portal.position.z - this.playerPosition.z;
      const inside = dx * dx + dz * dz < 1.42 * 1.42;
      if (
        !inside ||
        !this.externalInputEnabled ||
        this.transitioning ||
        this.isIgnitionPanicActive() ||
        this.elapsed < this.portalArrivalGuardUntil
      ) {
        portal.dwell = 0;
        portal.announced = false;
        portal.triggered = false;
        portal.core.scale.lerp(this.tempDirection.set(1, 1, 1), Math.min(1, delta * 8));
        continue;
      }

      portal.dwell += delta;
      const charge = Math.min(1, portal.dwell / 1.25);
      const pulse =
        portal.chargeMode === "collapse"
          ? 1 - charge * 0.42 + Math.sin(this.elapsed * 9) * 0.008
          : 1 + charge * 0.12 + Math.sin(this.elapsed * 9) * 0.015;
      portal.core.scale.setScalar(pulse);
      if (portal.dwell > 0.42 && !portal.announced) {
        portal.announced = true;
        this.hooks.onStatus(
          portal.lockMessage ?? "Portal lock forming… remain inside to travel.",
        );
      }
      if (portal.dwell >= 1.25 && !portal.triggered) {
        portal.triggered = true;
        this.runWorldAction(
          portal.action,
          "The threshold loses its lock before the route settles. Remain nearby and let it form again.",
          () => {
            portal.dwell = 0;
            portal.announced = false;
            portal.triggered = false;
          },
        );
        return;
      }
    }
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

  private updateOrbitingPlanets(delta: number): void {
    for (
      let planetIndex = 0;
      planetIndex < this.orbitingPlanets.length;
      planetIndex += 1
    ) {
      const planet = this.orbitingPlanets[planetIndex];
      if (!planet) continue;
      planet.collisionCooldown = Math.max(0, planet.collisionCooldown - delta);
      const rigidityTarget = this.elapsed < planet.rigidUntil ? 1 : 0;
      const rigidityRate = rigidityTarget > planet.rigidity ? 9.5 : 2.2;
      planet.rigidity +=
        (rigidityTarget - planet.rigidity) *
        (1 - Math.exp(-delta * rigidityRate));
      if (rigidityTarget === 0 && planet.rigidity < 0.002) {
        planet.rigidity = 0;
      }
      const held = this.heldOrbitingPlanets.has(planet);
      if (held) {
        planet.impact = 1;
        planet.collisionCooldown = 0.3;
      } else {
        planet.orbitalBoost *= Math.exp(
          -delta * THREE.MathUtils.lerp(1.08, 4.8, planet.rigidity),
        );
        planet.impact *= Math.exp(-delta * 5.8);

        const radialAcceleration = THREE.MathUtils.clamp(
          planet.radialOffset * 2.8,
          -8.5,
          8.5,
        ) * (1 - planet.rigidity * 0.92);
        planet.radialVelocity -= radialAcceleration * delta;
        planet.radialVelocity *= Math.exp(
          -delta * THREE.MathUtils.lerp(0.72, 5.4, planet.rigidity),
        );
        planet.radialVelocity = THREE.MathUtils.clamp(
          planet.radialVelocity,
          -6.4,
          6.4,
        );
        planet.radialOffset += planet.radialVelocity * delta;
        const minimumOffset =
          this.getArchiveOrbitMinimumRadius(planet) - planet.radius;
        const maximumOffset =
          this.getArchiveOrbitMaximumRadius(planet) - planet.radius;
        if (planet.radialOffset < minimumOffset) {
          planet.radialOffset = minimumOffset;
          planet.radialVelocity =
            Math.abs(planet.radialVelocity) *
            THREE.MathUtils.lerp(0.58, 0.08, planet.rigidity);
        } else if (planet.radialOffset > maximumOffset) {
          planet.radialOffset = maximumOffset;
          planet.radialVelocity =
            -Math.abs(planet.radialVelocity) *
            THREE.MathUtils.lerp(0.58, 0.08, planet.rigidity);
        }
        planet.planet.position.x = planet.radius + planet.radialOffset;

        const orbitalSpeed = planet.speed + planet.orbitalBoost;
        const motionScale =
          (this.reduceMotion ? 0.24 : 1) *
          THREE.MathUtils.lerp(
            1,
            archiveGravityLockMotionScale,
            planet.rigidity,
          );
        planet.pivot.rotation.y += orbitalSpeed * delta * motionScale;
        planet.planet.rotation.y += orbitalSpeed * delta * 2.4 * motionScale;
        planet.planet.rotation.x += orbitalSpeed * delta * 0.35 * motionScale;
        planet.tiltVelocity -= planet.pivot.rotation.z * 4.2 * delta;
        planet.tiltVelocity *= Math.exp(
          -delta * THREE.MathUtils.lerp(1.45, 5.2, planet.rigidity),
        );
        planet.pivot.rotation.z += planet.tiltVelocity * delta;
      }

      const impactScale = planet.impact * (this.reduceMotion ? 0.045 : 0.12);
      planet.planet.scale.set(
        1 + impactScale,
        1 - impactScale * 0.62,
        1 + impactScale,
      );
      planet.bodyMaterial.emissiveIntensity =
        0.7 + planet.impact * 1.45 + planet.rigidity * 0.72;

      planet.planet.getWorldPosition(planet.worldPosition);
      this.updateArchivePlanetFootprint(planet, planetIndex);
      if (!planet.pivot.visible) {
        planet.playerContact = false;
        continue;
      }
      if (held) {
        planet.playerContact = false;
        continue;
      }

      const playerDx = planet.worldPosition.x - this.playerPosition.x;
      const playerDz = planet.worldPosition.z - this.playerPosition.z;
      const playerContactRadius =
        planet.collisionRadius + this.playerRadius + 0.12;
      const playerContact =
        playerDx * playerDx + playerDz * playerDz <
        playerContactRadius ** 2;
      const playerMoving = this.movement.lengthSq() > 0.0001;
      const rigidContact = planet.rigidity >= 0.72;
      const canRebound =
        rigidContact
          ? planet.collisionCooldown <= 0
          : !planet.playerContact;
      if (rigidContact && playerContact) {
        const contactDistance = Math.max(
          0.001,
          Math.hypot(playerDx, playerDz),
        );
        const movementLength = Math.max(
          0.001,
          Math.hypot(this.movement.x, this.movement.z),
        );
        const awayX =
          contactDistance > 0.001
            ? -playerDx / contactDistance
            : -this.movement.x / movementLength;
        const awayZ =
          contactDistance > 0.001
            ? -playerDz / contactDistance
            : -this.movement.z / movementLength;
        this.playerPosition.set(
          planet.worldPosition.x +
            awayX * (playerContactRadius + 0.025),
          this.playerPosition.y,
          planet.worldPosition.z +
            awayZ * (playerContactRadius + 0.025),
        );
        this.constrainToBounds(this.playerPosition);
      }
      if (playerMoving && playerContact && canRebound) {
        const movementLength = Math.max(
          0.001,
          Math.hypot(this.movement.x, this.movement.z),
        );
        const directionX = this.movement.x / movementLength;
        const directionZ = this.movement.z / movementLength;
        const movementSpeed = movementLength / Math.max(delta, 0.001);
        this.applyOrbitingPlanetImpulse(
          planet,
          directionX,
          directionZ,
          THREE.MathUtils.clamp(movementSpeed * 0.88, 2.8, 6.2),
        );
        if (!rigidContact) {
          const playerRecoil = THREE.MathUtils.lerp(
            0.2,
            0.055,
            planet.rigidity,
          );
          this.playerPosition.x -= directionX * playerRecoil;
          this.playerPosition.z -= directionZ * playerRecoil;
          this.constrainToBounds(this.playerPosition);
        }
        this.jumpHeight = Math.max(this.jumpHeight, 0.025);
        this.jumpVelocity = Math.max(
          this.jumpVelocity,
          2.5 + planet.rigidity * 1.12,
        );
        this.announceArchiveOrbitPinball(
          "Your boot catches the little world. Its neat orbit buckles sideways.",
        );
      }
      // A locked world resolves the overlap immediately. Keeping this false
      // allows another deliberate approach after the short impact cooldown,
      // reproducing the climbable chain-bounce without firing every frame.
      planet.playerContact = rigidContact ? false : playerContact;
    }
    if (this.archivePlanetFootprints) {
      this.archivePlanetFootprints.instanceMatrix.needsUpdate = true;
      if (this.archivePlanetFootprints.instanceColor) {
        this.archivePlanetFootprints.instanceColor.needsUpdate = true;
      }
    }

    this.resolveArchiveAsteroidPlanetCollisions();
    this.resolveOrbitingPlanetCollisions();
    this.updateArchiveOrbitOrder(delta);
    this.updateArchiveAtlas(delta);
    this.updateArchiveAscensionMilestone();
  }

  private getArchiveOrbitMinimumRadius(
    planet: OrbitingPlanet,
  ): number {
    return (
      archiveAtlasBarrierRadius +
      planet.collisionRadius +
      0.08
    );
  }

  private getArchiveOrbitMaximumRadius(
    planet: OrbitingPlanet,
  ): number {
    return Math.max(
      this.getArchiveOrbitMinimumRadius(planet),
      archiveOrbitOuterRadius - planet.collisionRadius,
    );
  }

  private getArchiveOrbitRelativePosition(
    worldPosition: THREE.Vector3,
    target: THREE.Vector2,
  ): THREE.Vector2 {
    return target.set(
      worldPosition.x - archiveAtlasX,
      worldPosition.z - archiveAtlasZ,
    );
  }

  private updateArchivePlanetFootprint(
    planet: OrbitingPlanet,
    index: number,
  ): void {
    const footprints = this.archivePlanetFootprints;
    if (!footprints) return;

    const contactRadius =
      planet.collisionRadius + this.playerRadius + 0.12;
    const visibleScale = planet.pivot.visible ? contactRadius : 0.0001;
    this.archivePlanetFootprintDummy.position.set(
      planet.worldPosition.x,
      0.125,
      planet.worldPosition.z,
    );
    this.archivePlanetFootprintDummy.rotation.set(-Math.PI / 2, 0, 0);
    this.archivePlanetFootprintDummy.scale.set(
      visibleScale,
      visibleScale,
      visibleScale,
    );
    this.archivePlanetFootprintDummy.updateMatrix();
    footprints.setMatrixAt(index, this.archivePlanetFootprintDummy.matrix);
    this.archivePlanetFootprintColor
      .copy(this.archivePlanetFootprintRestColor)
      .lerp(this.archivePlanetFootprintLockColor, planet.rigidity);
    footprints.setColorAt(index, this.archivePlanetFootprintColor);
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
      asteroid.object.position.y - (supportHeight + asteroid.restingY),
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

  /**
   * Height is route-agnostic: moving, clumped, or Thunder-locked planets can all
   * form the ladder. The Archive update runs after planet contact chatter so the
   * milestone remains the final status emitted on the qualifying frame.
   */
  private updateArchiveAscensionMilestone(): void {
    if (
      this.currentZone !== "archive" ||
      this.archiveAscensionComplete ||
      this.noclip ||
      Math.max(
        this.airbornePeakHeight,
        this.surfaceOffset + this.jumpHeight,
      ) < archiveAscensionHeight
    ) {
      return;
    }
    this.archiveAscensionComplete = true;
    this.activateArchiveAscensionAtlas();
    this.hooks.onStatus(
      "The moving worlds hand you beyond the highest orbit. For one impossible moment, the Archive has a moon of its own.",
      { kind: "achievement", title: "TO THE MOON" },
    );
  }

  private activateArchiveAscensionAtlas(): void {
    const atlas = this.archiveAtlas;
    if (!atlas) return;
    atlas.pulseAge = 0;
    atlas.pulse.material.color.copy(archiveAtlasSilverLightColor);
    atlas.pulse.visible = true;
  }

  private applyOrbitingPlanetImpulse(
    planet: OrbitingPlanet,
    directionX: number,
    directionZ: number,
    strength: number,
  ): void {
    const directionLength = Math.max(0.001, Math.hypot(directionX, directionZ));
    const normalizedX = directionX / directionLength;
    const normalizedZ = directionZ / directionLength;
    const relativePosition = this.getArchiveOrbitRelativePosition(
      planet.worldPosition,
      this.tempOrbitPosition,
    );
    const radialLength = Math.max(
      0.001,
      relativePosition.length(),
    );
    const radialX = relativePosition.x / radialLength;
    const radialZ = relativePosition.y / radialLength;
    const tangentX = radialZ;
    const tangentZ = -radialX;
    const radialImpulse = normalizedX * radialX + normalizedZ * radialZ;
    const tangentImpulse = normalizedX * tangentX + normalizedZ * tangentZ;
    const responsiveStrength =
      strength *
      THREE.MathUtils.lerp(
        1,
        archiveGravityLockImpulseScale,
        planet.rigidity,
      );

    planet.radialVelocity = THREE.MathUtils.clamp(
      planet.radialVelocity + radialImpulse * responsiveStrength * 0.82,
      -4.8,
      4.8,
    );
    planet.orbitalBoost = THREE.MathUtils.clamp(
      planet.orbitalBoost + tangentImpulse * responsiveStrength * 0.15,
      -2.4,
      2.4,
    );
    const tiltSign = planet.detail % 2 === 0 ? 1 : -1;
    planet.tiltVelocity = THREE.MathUtils.clamp(
      planet.tiltVelocity +
        tangentImpulse * responsiveStrength * 0.055 +
        radialImpulse * responsiveStrength * 0.028 * tiltSign,
      -0.9,
      0.9,
    );
    planet.impact = 1;
    planet.collisionCooldown = Math.max(planet.collisionCooldown, 0.24);
    this.markArchiveOrbitDisturbed();
  }

  private resolveArchiveAsteroidPlanetCollisions(): void {
    for (const asteroid of this.archiveSpaceAsteroids) {
      if (
        !asteroid.enabled ||
        asteroid === this.heldKickable ||
        asteroid.velocity.lengthSq() < 0.2
      ) {
        continue;
      }

      for (const planet of this.orbitingPlanets) {
        if (!planet.pivot.visible || planet.collisionCooldown > 0) continue;
        const dx = asteroid.object.position.x - planet.worldPosition.x;
        const dz = asteroid.object.position.z - planet.worldPosition.z;
        const contact = asteroid.radius + planet.collisionRadius;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= contact * contact) continue;

        const distance = Math.max(0.001, Math.sqrt(distanceSquared));
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const incoming =
          asteroid.velocity.x * normalX + asteroid.velocity.z * normalZ;
        if (incoming >= -0.08) continue;

        const incomingX = asteroid.velocity.x;
        const incomingZ = asteroid.velocity.z;
        const speed = Math.max(0.001, Math.hypot(incomingX, incomingZ));
        asteroid.velocity.x -= incoming * normalX * 1.9;
        asteroid.velocity.z -= incoming * normalZ * 1.9;
        asteroid.velocity.multiplyScalar(1.02);
        asteroid.object.position.x =
          planet.worldPosition.x + normalX * (contact + 0.035);
        asteroid.object.position.z =
          planet.worldPosition.z + normalZ * (contact + 0.035);
        asteroid.kickCooldown = Math.max(asteroid.kickCooldown, 0.2);
        this.applyOrbitingPlanetImpulse(
          planet,
          incomingX / speed,
          incomingZ / speed,
          THREE.MathUtils.clamp(speed * 0.72, 2.4, 6.4),
        );
        planet.collisionCooldown = 0.42;
        this.announceArchiveOrbitPinball(
          "Stone meets world with a bright, impossible clack. Both paths change.",
        );
      }
    }
  }

  private resolveOrbitingPlanetCollisions(): void {
    for (let leftIndex = 0; leftIndex < this.orbitingPlanets.length; leftIndex += 1) {
      const left = this.orbitingPlanets[leftIndex];
      if (!left?.pivot.visible || left.collisionCooldown > 0) continue;

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < this.orbitingPlanets.length;
        rightIndex += 1
      ) {
        const right = this.orbitingPlanets[rightIndex];
        if (!right?.pivot.visible || right.collisionCooldown > 0) continue;
        const collisionChainActive =
          Math.abs(left.radialOffset) > 0.08 ||
          Math.abs(left.radialVelocity) > 0.18 ||
          Math.abs(left.orbitalBoost) > 0.08 ||
          left.impact > 0.08 ||
          Math.abs(right.radialOffset) > 0.08 ||
          Math.abs(right.radialVelocity) > 0.18 ||
          Math.abs(right.orbitalBoost) > 0.08 ||
          right.impact > 0.08;
        if (!collisionChainActive) continue;
        const dx = right.worldPosition.x - left.worldPosition.x;
        const dz = right.worldPosition.z - left.worldPosition.z;
        const contact = (left.collisionRadius + right.collisionRadius) * 0.92;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= contact * contact) continue;

        const distance = Math.max(0.001, Math.sqrt(distanceSquared));
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const leftRelative = this.getArchiveOrbitRelativePosition(
          left.worldPosition,
          this.tempOrbitPosition,
        );
        const rightRelative = this.getArchiveOrbitRelativePosition(
          right.worldPosition,
          this.tempOrbitPositionB,
        );
        const leftRadius = Math.max(
          0.001,
          leftRelative.length(),
        );
        const rightRadius = Math.max(
          0.001,
          rightRelative.length(),
        );
        const leftTangentX = leftRelative.y / leftRadius;
        const leftTangentZ = -leftRelative.x / leftRadius;
        const rightTangentX = rightRelative.y / rightRadius;
        const rightTangentZ = -rightRelative.x / rightRadius;
        const baseMotionScale = this.reduceMotion ? 0.24 : 1;
        const leftMotionScale =
          baseMotionScale *
          THREE.MathUtils.lerp(
            1,
            archiveGravityLockMotionScale,
            left.rigidity,
          );
        const rightMotionScale =
          baseMotionScale *
          THREE.MathUtils.lerp(
            1,
            archiveGravityLockMotionScale,
            right.rigidity,
          );
        const leftVelocityX =
          leftTangentX *
            (left.speed + left.orbitalBoost) *
            leftRadius *
            leftMotionScale +
          (leftRelative.x / leftRadius) * left.radialVelocity;
        const leftVelocityZ =
          leftTangentZ *
            (left.speed + left.orbitalBoost) *
            leftRadius *
            leftMotionScale +
          (leftRelative.y / leftRadius) * left.radialVelocity;
        const rightVelocityX =
          rightTangentX *
            (right.speed + right.orbitalBoost) *
            rightRadius *
            rightMotionScale +
          (rightRelative.x / rightRadius) * right.radialVelocity;
        const rightVelocityZ =
          rightTangentZ *
            (right.speed + right.orbitalBoost) *
            rightRadius *
            rightMotionScale +
          (rightRelative.y / rightRadius) * right.radialVelocity;
        const closingSpeed =
          (leftVelocityX - rightVelocityX) * normalX +
          (leftVelocityZ - rightVelocityZ) * normalZ;
        const overlap = contact - distance;
        if (closingSpeed <= 0.04 && overlap < 0.16) continue;

        const impactStrength = THREE.MathUtils.clamp(
          Math.max(1.6, closingSpeed * 0.58),
          1.6,
          5.4,
        );
        this.applyOrbitingPlanetImpulse(
          left,
          -normalX,
          -normalZ,
          impactStrength,
        );
        this.applyOrbitingPlanetImpulse(
          right,
          normalX,
          normalZ,
          impactStrength,
        );
        const leftMobility = THREE.MathUtils.lerp(
          1,
          archiveGravityLockImpulseScale,
          left.rigidity,
        );
        const rightMobility = THREE.MathUtils.lerp(
          1,
          archiveGravityLockImpulseScale,
          right.rigidity,
        );
        const totalMobility = Math.max(0.001, leftMobility + rightMobility);
        const correction =
          overlap * 0.68 * Math.max(leftMobility, rightMobility);
        const leftCorrection =
          correction * (leftMobility / totalMobility);
        const rightCorrection =
          correction * (rightMobility / totalMobility);
        if (leftRadius <= rightRadius) {
          left.radialOffset -= leftCorrection;
          right.radialOffset += rightCorrection;
        } else {
          left.radialOffset += leftCorrection;
          right.radialOffset -= rightCorrection;
        }
        left.collisionCooldown = 0.46;
        right.collisionCooldown = 0.46;
        this.announceArchiveOrbitPinball(
          "Two wandering worlds meet. Their paths trade momentum.",
        );
      }
    }
  }

  private announceArchiveOrbitPinball(message: string): void {
    if (this.archiveOrbitPinballAnnounced) return;
    this.archiveOrbitPinballAnnounced = true;
    this.hooks.onStatus(message);
  }

  private markArchiveOrbitDisturbed(): void {
    this.archiveOrbitDisturbed = true;
    this.archiveOrbitRestoreDwell = 0;
    const atlas = this.archiveAtlas;
    if (!atlas || atlas.pulseAge >= 1.65) return;
    atlas.pulseAge = 1.65;
    atlas.globe.material.emissiveIntensity = 0.9;
    atlas.orbit.material.emissiveIntensity = 0;
    atlas.light.intensity = 0;
    atlas.pulse.visible = false;
  }

  private updateArchiveOrbitOrder(delta: number): void {
    if (
      !this.archiveAtlas ||
      !this.archiveOrbitDisturbed ||
      this.orbitTelekinesisHolds.size > 0
    ) {
      this.archiveOrbitRestoreDwell = 0;
      return;
    }
    const ordered = this.orbitingPlanets.every(
      (planet) =>
        Math.abs(planet.radialOffset) < 0.065 &&
        Math.abs(planet.radialVelocity) < 0.14 &&
        Math.abs(planet.orbitalBoost) < 0.035 &&
        Math.abs(planet.tiltVelocity) < 0.045 &&
        Math.abs(planet.pivot.rotation.z) < 0.045,
    );
    this.archiveOrbitRestoreDwell = ordered
      ? this.archiveOrbitRestoreDwell + delta
      : 0;
    if (this.archiveOrbitRestoreDwell < 0.82) return;

    this.archiveOrbitDisturbed = false;
    this.archiveOrbitRestoreDwell = 0;
    this.archiveAtlas.pulseAge = 0;
    this.archiveAtlas.pulse.material.color.setHex(palette.cyan);
    this.archiveAtlas.pulse.visible = true;
    this.hooks.onStatus(
      "The last wandering world finds its old line. The atlas answers in cyan.",
    );
  }

  private updateArchiveAtlas(delta: number): void {
    const atlas = this.archiveAtlas;
    if (!atlas) return;
    const ascensionTarget = this.archiveAscensionComplete ? 1 : 0;
    const ascensionFollow = this.reduceMotion
      ? 1
      : 1 - Math.exp(-delta * 2.4);
    atlas.ascensionBlend = THREE.MathUtils.lerp(
      atlas.ascensionBlend,
      ascensionTarget,
      ascensionFollow,
    );
    const ascension = THREE.MathUtils.smoothstep(
      atlas.ascensionBlend,
      0,
      1,
    );

    let flare = 0;
    if (atlas.pulseAge < 1.65) {
      atlas.pulseAge += delta;
      const progress = Math.min(1, atlas.pulseAge / 1.65);
      flare = Math.sin(progress * Math.PI);
      atlas.pulse.material.opacity = (1 - progress) * 0.78;
      atlas.pulse.scale.setScalar(
        this.reduceMotion ? 1.2 : 0.72 + progress * 2.15,
      );
      if (progress >= 1) atlas.pulse.visible = false;
    }

    atlas.globe.material.color.lerpColors(
      archiveAtlasRestColor,
      archiveAtlasSilverColor,
      ascension,
    );
    atlas.globe.material.emissive.lerpColors(
      archiveAtlasRestEmissive,
      archiveAtlasSilverEmissive,
      ascension,
    );
    atlas.globe.material.metalness = THREE.MathUtils.lerp(
      0.25,
      0.88,
      ascension,
    );
    atlas.globe.material.roughness = THREE.MathUtils.lerp(
      0.38,
      0.18,
      ascension,
    );
    atlas.globe.material.emissiveIntensity =
      0.9 + ascension * 0.62 + flare * 2.7;
    atlas.orbit.material.color.lerpColors(
      archiveAtlasRestOrbitColor,
      archiveAtlasSilverOrbitColor,
      ascension,
    );
    atlas.orbit.material.emissive.lerpColors(
      archiveAtlasRestLightColor,
      archiveAtlasSilverLightColor,
      ascension,
    );
    atlas.orbit.material.emissiveIntensity =
      ascension * 0.48 + flare * 2.2;
    atlas.star.visible = ascension > 0.005;
    atlas.starMaterial.opacity = ascension * (0.8 + flare * 0.2);
    const starBreath =
      this.reduceMotion
        ? 1
        : 1 + Math.sin(this.elapsed * 2.2) * 0.065 * ascension;
    atlas.star.scale.setScalar(
      THREE.MathUtils.lerp(0.3, starBreath, ascension),
    );
    atlas.star.rotation.y +=
      delta * (this.reduceMotion ? 0.08 : 0.42) * ascension;
    atlas.light.color.lerpColors(
      archiveAtlasRestLightColor,
      archiveAtlasSilverLightColor,
      ascension,
    );
    const persistentLight =
      ascension * (this.quality === "low" ? 1.35 : 2.35);
    atlas.light.intensity =
      persistentLight + flare * (this.quality === "low" ? 3.8 : 6.2);
  }

  private updateFantasyWaterfall(delta: number): void {
    if (this.puzzleWaterfallPanels.length === 0) return;
    const target = this.fantasyPuzzleSolved ? 1 : 0;
    const follow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 3.6);
    this.waterfallOpening = THREE.MathUtils.lerp(
      this.waterfallOpening,
      target,
      follow,
    );
    for (const panel of this.puzzleWaterfallPanels) {
      const side = Math.sign(panel.userData.side as number) || 1;
      panel.position.x = side * (0.575 + this.waterfallOpening * 0.92);
      panel.rotation.z = -side * this.waterfallOpening * 0.1;
      panel.material.opacity = 0.78 - this.waterfallOpening * 0.24;
    }
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
    if (this.serverFlickerAge >= this.serverFlickerDuration) return;
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

    for (const lantern of this.lanterns) {
      const lit = lantern.litUntil > this.elapsed;
      const target = lit ? 1.65 + Math.sin(this.elapsed * 8) * 0.08 : 1;
      const scale = THREE.MathUtils.lerp(
        lantern.light.scale.x,
        target,
        1 - Math.exp(-delta * 9),
      );
      lantern.light.scale.setScalar(scale);
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
    if (!this.playerOccluders.includes(object)) {
      object.traverse((child) => {
        child.layers.enable(playerOcclusionLayer);
      });
      this.playerOccluders.push(object);
    }
  }

  private updatePlayerOcclusionOutline(): void {
    this.player.group.getWorldPosition(this.playerOcclusionTarget);
    const playerBaseY = this.playerOcclusionTarget.y;

    if (this.playerOccluders.length === 0) {
      this.setPlayerOcclusionOutlineVisible(false);
      this.playerShadow.visible = true;
      return;
    }

    this.playerOcclusionRaycaster.camera = this.camera;
    this.playerOcclusionRaycaster.near = 0;
    for (const occluder of this.playerOccluders) {
      if (occluder.visible) occluder.updateWorldMatrix(true, true);
    }

    let occluded = false;
    // A torso-only ray misses cases such as a tree crown hiding the head or a
    // low ledge hiding the boots. Sample the avatar vertically; scene depth
    // still decides exactly which fragments of the duplicate mesh are drawn.
    for (const sampleHeight of [1.95, 1.25, 0.55] as const) {
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

      for (const occluder of this.playerOccluders) {
        if (!occluder.visible) continue;
        this.playerOcclusionHits.length = 0;
        this.playerOcclusionRaycaster.intersectObject(
          occluder,
          true,
          this.playerOcclusionHits,
        );
        if (this.playerOcclusionHits.length > 0) {
          occluded = true;
          break;
        }
      }
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
      const dx = reveal.mesh.position.x - this.playerPosition.x;
      const dz = reveal.mesh.position.z - this.playerPosition.z;
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

  private triggerObservabilityScan(forceCascade = false): void {
    if (!this.observabilityPulse) return;
    this.observabilityPulseAge = 0;
    this.observabilityPulsePeakOpacity = 0.9;
    this.observabilityPulse.visible = true;
    this.observabilityPulse.scale.setScalar(0.7);
    this.observabilityPulse.material.opacity = 0.9;

    const cascade = this.observabilityLogCascade;
    if (!cascade || (this.spellStage === "spark" && !forceCascade)) return;
    const stage: Exclude<SpellStage, "spark"> =
      this.spellStage === "thunder" ? "thunder" : "surge";
    const qualityScale =
      this.quality === "low" ? 0.56 : this.quality === "medium" ? 0.78 : 1;
    const motionScale = this.reduceMotion ? 0.62 : 1;
    const requestedCount = stage === "thunder" ? 30 : 24;
    cascade.stage = stage;
    cascade.count = Math.max(
      10,
      Math.min(
        cascade.maximumCount,
        Math.round(requestedCount * qualityScale * motionScale),
      ),
    );
    cascade.age = 0;
    cascade.duration =
      (stage === "thunder" ? 3.05 : 2.35) * (this.reduceMotion ? 0.78 : 1);
    cascade.points.material.size =
      (this.quality === "low" ? 34 : this.quality === "medium" ? 40 : 46) +
      (stage === "thunder" ? 4 : 0);
    cascade.points.material.opacity = 0;
    cascade.points.geometry.setDrawRange(0, cascade.count);
    cascade.points.visible = true;

    const colorAttribute = cascade.points.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    for (let index = 0; index < cascade.count; index += 1) {
      const color =
        stage === "thunder" && index % 5 === 0
          ? new THREE.Color(index % 10 === 0 ? palette.coral : palette.amber)
          : new THREE.Color(
              index % 3 === 0
                ? palette.cyan
                : index % 3 === 1
                  ? palette.green
                  : palette.violet,
            );
      const offset = index * 3;
      cascade.colors[offset] = color.r;
      cascade.colors[offset + 1] = color.g;
      cascade.colors[offset + 2] = color.b;
    }
    colorAttribute.needsUpdate = true;
    this.updateObservabilityLogCascade(0);
  }

  private updateObservabilityPulse(delta: number): void {
    if (this.observabilityPulse?.visible) {
      this.observabilityPulseAge += delta;
      const progress = Math.min(1, this.observabilityPulseAge / 1.05);
      this.observabilityPulse.scale.setScalar(0.7 + progress * 2.6);
      this.observabilityPulse.material.opacity =
        (1 - progress) * this.observabilityPulsePeakOpacity;
      if (progress >= 1) this.observabilityPulse.visible = false;
    }
    this.updateObservabilityLogCascade(delta);
  }

  private updateObservabilityLogCascade(delta: number): void {
    const cascade = this.observabilityLogCascade;
    if (!cascade?.points.visible) return;
    cascade.age = Math.min(cascade.duration, cascade.age + delta);
    const progress = Math.min(1, cascade.age / cascade.duration);
    const fadeIn = Math.min(1, cascade.age / 0.18);
    const fadeOut =
      1 - THREE.MathUtils.smoothstep(progress, 0.68, 1);
    cascade.points.material.opacity =
      fadeIn * fadeOut * (cascade.stage === "thunder" ? 0.98 : 0.84);
    const travel =
      progress *
      (this.reduceMotion ? 0 : cascade.stage === "thunder" ? 1.65 : 1.2);
    const turn =
      progress *
      (this.reduceMotion ? 0 : cascade.stage === "thunder" ? 1.05 : 0.56);
    for (let index = 0; index < cascade.count; index += 1) {
      const phase = ((cascade.phases[index] ?? 0) + travel) % 1;
      const angle = index * 2.39996 + turn;
      const radius =
        2.05 +
        phase * (cascade.stage === "thunder" ? 3.65 : 3.05) +
        (index % 3) * 0.13;
      const offset = index * 3;
      cascade.positions[offset] = Math.cos(angle) * radius;
      cascade.positions[offset + 1] =
        0.48 +
        (1 - phase) * (cascade.stage === "thunder" ? 3.2 : 2.65);
      cascade.positions[offset + 2] = Math.sin(angle) * radius;
    }
    (
      cascade.points.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    if (progress >= 1) {
      cascade.points.visible = false;
      cascade.points.geometry.setDrawRange(0, 0);
    }
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

  private updateKickables(delta: number, playerMoving: boolean): void {
    for (const kickable of this.kickables) {
      if (!kickable.enabled || kickable === this.heldKickable) continue;
      if (kickable.object.userData.ritualSocketed === true) continue;
      if (this.getTurtleAsteroidState(kickable)?.collected) continue;
      if (this.getTurtleCargoOrbiter(kickable)) continue;
      kickable.kickCooldown = Math.max(0, kickable.kickCooldown - delta);
      const dx = kickable.object.position.x - this.playerPosition.x;
      const dz = kickable.object.position.z - this.playerPosition.z;
      const contact = kickable.radius + this.playerRadius + 0.12;
      if (
        playerMoving &&
        kickable.kickCooldown <= 0 &&
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
      if (kickable.pinballRadius) {
        const ritualImpact = this.resolvePinballRitualCrystalImpact(
          kickable,
          nextX,
          nextZ,
        );
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
      if (kickable.onPlatform && kickable.platform) {
        const remainsOnPlatform = this.surfaceContainsPoint(
          kickable.platform,
          nextX,
          nextZ,
        );
        if (remainsOnPlatform) {
          kickable.object.position.y =
            kickable.platform.heightAt(nextX, nextZ) + kickable.platformOffset;
        } else {
          kickable.onPlatform = false;
          kickable.velocity.y = Math.min(kickable.velocity.y, -0.25);
        }
      } else if (kickable.gravity) {
        kickable.object.position.y += kickable.velocity.y * delta;
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
        kickable.object.updateWorldMatrix(true, true);
        this.tempBounds.setFromObject(kickable.object);
        const penetration = kickable.restingY - this.tempBounds.min.y;
        if (penetration >= 0) {
          kickable.object.position.y += penetration;
          kickable.velocity.y =
            Math.abs(kickable.velocity.y) > 1.2 ? -kickable.velocity.y * 0.24 : 0;
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

  private resolvePinballRitualCrystalImpact(
    kickable: Kickable,
    nextX: number,
    nextZ: number,
  ): [number, number] | null {
    if (
      this.currentZone !== "falls" ||
      kickable !== this.archiveAsteroid
    ) {
      return null;
    }
    const speed = Math.hypot(kickable.velocity.x, kickable.velocity.z);
    if (speed < 0.34) return null;

    for (const carry of this.ritualCrystals) {
      if (
        this.isRitualCrystalBroken(carry) ||
        this.elapsed < carry.impactCooldownUntil
      ) {
        continue;
      }
      const contact = kickable.radius + carry.kickable.radius * 0.84;
      const dx = nextX - carry.object.position.x;
      const dz = nextZ - carry.object.position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > contact * contact) continue;

      const distance = Math.sqrt(Math.max(0.0001, distanceSquared));
      const normalX =
        distance > 0.01 ? dx / distance : -kickable.velocity.x / speed;
      const normalZ =
        distance > 0.01 ? dz / distance : -kickable.velocity.z / speed;
      const approach =
        kickable.velocity.x * normalX +
        kickable.velocity.z * normalZ;
      if (approach > 0.08 && distance > contact * 0.76) continue;

      const incomingX = kickable.velocity.x;
      const incomingZ = kickable.velocity.z;
      const shatteringImpact = speed >= 4.8;
      carry.impactCooldownUntil = this.elapsed + 0.46;
      this.soundRitualCrystal(carry, shatteringImpact);

      if (shatteringImpact) {
        // A hard throw behaves like a bowling ball: the cluster gives way and
        // its facets inherit part of the incoming momentum instead of sending
        // the asteroid directly back along its path.
        kickable.velocity.x *= 0.78;
        kickable.velocity.z *= 0.78;
        const shards =
          this.getRuneForCarry(carry)?.shards ??
          this.getDecoyForCarry(carry)?.shards ??
          [];
        for (const shard of shards) {
          if (!shard.kickable?.enabled) continue;
          shard.kickable.velocity.x += incomingX * 0.34;
          shard.kickable.velocity.z += incomingZ * 0.34;
          shard.kickable.velocity.y += Math.min(2.2, speed * 0.18);
        }
        return [nextX, nextZ];
      }

      if (approach < 0) {
        kickable.velocity.x -= 1.82 * approach * normalX;
        kickable.velocity.z -= 1.82 * approach * normalZ;
      }
      if (!carry.socketedAt && !this.isRitualCrystalBroken(carry)) {
        carry.kickable.velocity.x -= normalX * Math.max(0.8, speed * 0.5);
        carry.kickable.velocity.z -= normalZ * Math.max(0.8, speed * 0.5);
        carry.kickable.velocity.y = Math.max(
          carry.kickable.velocity.y,
          Math.min(1.4, speed * 0.14),
        );
        carry.kickable.kickCooldown = 0.2;
      }
      return [
        carry.object.position.x + normalX * contact,
        carry.object.position.z + normalZ * contact,
      ];
    }
    return null;
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
        ? this.portalStates.find((candidate) => {
            const portalDx = nextX - candidate.position.x;
            const portalDz = nextZ - candidate.position.z;
            return (
              portalDx * portalDx + portalDz * portalDz <
              1.55 * 1.55
            );
          })
        : undefined;
    if (portal) {
      const firstMisroute =
        this.currentZone === "archive" &&
        this.travelingAsteroid === null;
      this.routeTravelingAsteroid(kickable, portal.destination);
      portal.core.scale.setScalar(1.28);
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

  private kickableHitsStatic(kickable: Kickable, x: number, z: number): boolean {
    for (const collider of this.staticColliders) {
      const nearestX = THREE.MathUtils.clamp(
        x,
        collider.x - collider.halfWidth,
        collider.x + collider.halfWidth,
      );
      const nearestZ = THREE.MathUtils.clamp(
        z,
        collider.z - collider.halfDepth,
        collider.z + collider.halfDepth,
      );
      const dx = x - nearestX;
      const dz = z - nearestZ;
      if (dx * dx + dz * dz < kickable.radius * kickable.radius) return true;
    }
    return false;
  }

  private updateMetrics(delta: number): void {
    this.frameCount += 1;
    this.metricElapsed += delta;
    if (this.metricElapsed < 1) return;

    this.hooks.onMetrics({
      fps: Math.round(this.frameCount / this.metricElapsed),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    });
    this.frameCount = 0;
    this.metricElapsed = 0;
  }

  private buildZone(zone: ZoneId, arrivalFrom: ZoneId | null = null): void {
    this.clearZone();
    this.currentZone = zone;

    const config = {
      field: {
        sky: 0x03090c,
        fog: 0.015,
        spawn: new THREE.Vector3(...fieldEntrySpawn),
      },
      falls: { sky: 0x04100f, fog: 0.019, spawn: new THREE.Vector3(-3.3, 1.05, 8.5) },
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
    this.portalArrivalGuardUntil =
      arrivalAnchor === undefined ? 0 : this.elapsed + 0.85;
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
    if (zone === "field" && this.ambientGrid) {
      this.surfaceAreas.push(...this.ambientGrid.getLandingSurfaces());
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
    this.hooks.onTurtleMediaChange(false);
    this.pongChallenge.unmount();
    this.stashTravelingAsteroidForZoneTeardown();
    this.clearCollisionDebugVisuals();
    this.stowPortablePencilForTravel();
    this.resetSprintDustTrail();
    this.hanoiPuzzle.unmount();
    this.cancelAllPointerDrags(false);
    this.mightymaticaZone?.dispose();
    this.mightymaticaZone = null;
    this.legacySimulationCube = null;
    this.staticColliders.length = 0;
    this.interactions.length = 0;
    this.pointerActions.length = 0;
    this.mathInstanceDrags.length = 0;
    this.pointerActionReachTarget = null;
    this.pointerActionReachUntil = 0;
    this.animatedItems.length = 0;
    this.surfaceAreas.length = 0;
    this.fieldRockClusters.length = 0;
    this.lastFieldRockDebugRefresh = 0;
    this.tentState = null;
    this.compassProp = null;
    this.pencilProps.length = 0;
    this.kickables.length = 0;
    this.portalStates.length = 0;
    this.telescopeRigs.length = 0;
    this.orbitingPlanets.length = 0;
    this.playerOccluders.length = 0;
    this.setPlayerOcclusionOutlineVisible(false);
    this.playerShadow.visible = true;
    this.lanterns.length = 0;
    this.lanternReveals.length = 0;
    this.serverRacks.length = 0;
    this.wanderingNpcs.length = 0;
    this.fishSchool = null;
    this.fishBaitShard = null;
    this.fishBaitFishIndex = -1;
    this.runeAltar = null;
    this.voidTurtle = null;
    this.turtleAsteroids.length = 0;
    this.turtleCargoOrbiters.length = 0;
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
    this.waterfallRecoveryAge = -1;
    this.surfaceOffset = 0;
    this.activePlatform = null;
    this.shadowSurfaceY = 0.16;
    this.shadowVerticalDistance = 0;
    this.chestLid = null;
    this.chestPrize = null;
    this.chestBurst = null;
    this.chestOpened = false;
    this.caveSeal = null;
    this.caveSealCollider = null;
    this.puzzleWaterfallPanels.length = 0;
    this.waterfallOpening = 0;
    this.runeStones.clear();
    this.runeSockets.clear();
    this.ritualDecoys.clear();
    this.ritualCrystals.length = 0;
    this.runeSparkles = null;
    this.runeTinkleLight = null;
    this.runeTinkleAge = 2;
    this.runeTinklePeakIntensity = 0;
    this.runeDiagnosticTrace = null;
    this.runeProgress = 0;
    this.fantasyPuzzleSolved = false;
    this.observabilityPulse = null;
    this.observabilityPulseAge = 2;
    this.observabilityPulsePeakOpacity = 0.86;
    this.observabilityLogCascade = null;
    this.archiveAtlas = null;
    this.archiveDataGlass = null;
    this.archiveSignalPuzzle = null;
    this.archiveSignalRouteDirty = false;
    this.archivePlanetFootprints = null;
    this.archiveOrbitDisturbed = false;
    this.archiveOrbitRestoreDwell = 0;
    this.archiveOrbitTelekinesisAnnounced = false;
    this.archiveSpaceAsteroids.length = 0;
    this.archiveAsteroid = null;
    this.archiveAsteroidShadow = null;
    this.archiveMonitorTarget = null;
    this.archiveOrbitPinballAnnounced = false;
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
    const fieldGroundMaterial = this.materials.stone.clone();
    fieldGroundMaterial.name = "field-survey-worn-ground-material";
    fieldGroundMaterial.color.setHex(0xffffff);
    fieldGroundMaterial.map = fieldGroundTexture;
    fieldGroundMaterial.roughness = 0.97;
    fieldGroundMaterial.metalness = 0;
    const fieldFoundationMaterial = this.materials.darkStone.clone();
    fieldFoundationMaterial.name = "field-foundation-material";
    fieldFoundationMaterial.color.setHex(0x2f3c36);
    fieldFoundationMaterial.emissive.setHex(0x07100d);
    fieldFoundationMaterial.emissiveIntensity = 0.28;
    fieldFoundationMaterial.roughness = 0.98;

    const foundation = addCylinder(
      root,
      20,
      20,
      1.8,
      18,
      [0, -0.9, 0],
      fieldFoundationMaterial,
    );
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

    this.createPortal(
      root,
      -9.2,
      -6.8,
      palette.green,
      "Enter Luminous Falls",
      "falls",
    );
    this.createPortal(
      root,
      10.6,
      -4.3,
      palette.cyan,
      "Enter Signal Grid",
      "grid",
    );
    this.createPortal(
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
    this.createVoidTurtle(root, 15, 15);
    this.addInteraction(
      "void-turtle",
      this.voidTurtleAwakened
        ? "Greet the wakeful void turtle"
        : "Observe the sleeping void turtle",
      15,
      15,
      5.2,
      () => this.interactVoidTurtle(),
    );
    this.createVoidTurtleAsteroids(root);
  }

  private buildLuminousFalls(): void {
    this.bounds = { kind: "circle", radius: 16.4 };
    const root = this.zoneGroup;

    const foundation = addCylinder(
      root,
      18,
      18,
      1.7,
      18,
      [0, -0.85, 0],
      this.materials.mossDark,
    );
    const fallsFloor = addCylinder(
      root,
      14.6,
      14.6,
      0.35,
      20,
      [0, -0.05, 0],
      this.materials.moss,
    );
    foundation.name = "world-terrain-foundation";
    fallsFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    fallsFloor.castShadow = false;

    this.createFallsRiver(root);
    this.createFishSchool(root);

    this.createBridge(root, 0, 2.4);
    this.createWaterfall(root, -4.5, -8, 3.6);
    this.createWaterfall(root, 0, -9.5, 5, true);
    this.createWaterfall(root, 4.5, -8, 3.1);

    for (const [index, [x, y, z, sx, sy, sz]] of ([
      [-7, 1.35, -8, 4, 2.7, 4],
      [7, 1.15, -8, 4, 2.3, 4],
      [-11, 0.8, -1, 2.4, 1.7, 6],
      [11, 0.8, -1, 2.4, 1.7, 6],
    ] as const).entries()) {
      const terrace = addBox(
        root,
        [sx, sy, sz],
        [x, y - 0.15, z],
        this.materials.moss,
      );
      terrace.castShadow = false;
      this.registerClimbableBox(
        terrace,
        `falls-moss-terrace-${index}`,
      );
    }
    this.createFallsParkour(root);
    this.createFallsVegetation(root);

    this.createHiddenChest(root, 0, -11.65);
    // Cap this collider near the modeled lid so the summit route above it
    // remains traversable.
    this.addStaticBox(
      0,
      0.45,
      -11.65,
      0.85,
      0.5,
      0.6,
      1.2,
    );
    const chestInteraction = this.addInteraction(
      "waterfall-chest",
      "Inspect weathered chest",
      0,
      -11.65,
      1.9,
      () => this.openHiddenChest(),
      false,
      1.35,
    );
    chestInteraction.isAvailable = () => this.fantasyPuzzleSolved;
    this.createCaveSeal(root, 0, -9.12);

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

    this.createRuneAltar(root, 0, -4.2);
    this.addStaticBox(0, 0.7, -4.2, 1.25, 0.75, 1.25, 0.7, 0.82);
    this.surfaceAreas.push({
      id: "rune-altar",
      x: 0,
      z: -4.2,
      halfWidth: 1.08,
      halfDepth: 1.08,
      requiresJump: true,
      landingMessage: "You land atop the rune monument. The river keeps moving below.",
      heightAt: () => 0.82,
    });
    this.addInteraction(
      "rune-altar",
      "Inspect river monument",
      0,
      -4.2,
      2.3,
      () => this.runeAltar?.activate(this.reduceMotion),
    );
    this.createLanternReveal(
      root,
      "☾ | ≋ | △",
      0,
      0.54,
      1.66,
      4.8,
      0,
      "lantern-rune-clue",
      "Inspect the lamplit markings",
      "Three old marks repeat in the varnish: a crescent, three ripples, and a flame-shaped notch.",
    );
    this.createLanternReveal(
      root,
      "DRY STONE | WET COUNTRY",
      0,
      0.54,
      3.12,
      4.4,
      0,
      "lantern-falls-chest",
      "Inspect the lamplit inscription",
      "The stone behind the central fall is less weathered than everything around it.",
    );

    this.createNpcMarker(root, -8, 3, this.materials.violet, "archivist");
    this.addLoreNpcInteraction(
      "archivist",
      "Speak with the Archivist",
      "Archivist",
      -8,
      3,
      [
        "Long before the stone learned moss, the crown above the cataract was broken. Six lights fell. Only three remembered their names.",
        "The first bore a hollow moon. The second, the river's scar. The last kept a coal beneath its tongue. I copied this much; the water destroyed the rest.",
        "Do not mistake brightness for memory. The false shards shine gladly. The true ones are worn where old hands set them down.",
      ],
    );

    this.createNpcMarker(root, 7.6, 1.8, this.materials.green, "keeper");
    this.addLoreNpcInteraction(
      "keeper",
      "Speak with the Keeper",
      "Keeper",
      7.6,
      1.8,
      [
        "I was named Keeper after the keeping was done. A jest, perhaps. Still, the six remain where the river spat them out.",
        "Three are light as lies. Three drag toward the old circles when no eye rests upon them. Even stone remembers its grave.",
        "When the voices rise together, the fall will make a door. Beyond it waits a coffer that has never once been wet.",
      ],
    );

    this.createNpcMarker(root, 7.5, -4.5, this.materials.amber, "tinkerer");
    this.addLoreNpcInteraction(
      "tinkerer",
      "Speak with the Tinkerer",
      "Tinkerer",
      7.5,
      -4.5,
      [
        "Beneath the soil runs an iron scripture. The black mouths call it terminal. It answers words more faithfully than men.",
        "I once fed it ritual. Violet fire walked the circles, yet touched no lock. A rehearsal, perhaps. Or a warning.",
        "Give ritual a second word: open. The pair forces what the stones would have you earn. I have no fondness for stolen answers.",
      ],
    );

    this.createRuneEffects(root);
    const crystalCache = this.createRitualCrystalCache(root, 8.4, 6.3);
    const runeConfigs = [
      ["moon", -7.3, -3.7, 9.65, 6.85, palette.violet],
      ["tide", -6, 7, 7.15, 5.48, palette.cyan],
      ["ember", 5, -4.4, 8.4, 7.22, palette.amber],
    ] as const;

    for (const [id, socketX, socketZ, sourceX, sourceZ, color] of runeConfigs) {
      const label = "Inspect socket";
      this.createRuneSocket(root, id, socketX, socketZ, color);
      const rune = this.createRuneCrystal(
        root,
        id,
        label,
        sourceX,
        sourceZ,
        socketX,
        socketZ,
        color,
        crystalCache,
      );
      this.runeStones.set(id, rune);
      const looseCrystalInteraction = this.addInteraction(
        `ritual-crystal-${id}`,
        "Touch loose crystal",
        sourceX,
        sourceZ,
        1.55,
        () => this.soundLooseRuneCrystal(id),
      );
      looseCrystalInteraction.isAvailable = () =>
        rune.carry.socketedAt === null &&
        (!rune.broken ||
          this.getRitualCrystalAnchorShard(rune.carry) !== null);
      this.addInteraction(`rune-${id}`, label, socketX, socketZ, 2.15, () =>
        this.inspectOrActivateRuneSocket(id),
      );
    }
    this.createRitualDecoyCrystal(
      root,
      "verdant",
      7.03,
      6.86,
      this.materials.green,
      crystalCache,
    );
    this.createRitualDecoyCrystal(
      root,
      "coral",
      9.72,
      5.55,
      this.materials.coral,
      crystalCache,
    );
    this.createRitualDecoyCrystal(
      root,
      "pale",
      8.45,
      5.28,
      this.materials.parchment,
      crystalCache,
    );
    this.syncRitualSocketPlacementStates();
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();

    this.createPortal(
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
      this.materials.gridFloor,
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
      material.opacity = 0.42;
    }
    root.add(grid);

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
    this.createPortal(
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
      const index = this.staticColliders.indexOf(state.collider);
      if (index >= 0) this.staticColliders.splice(index, 1);
      state.collider = null;
    }
    if (!state.portalRegistered) {
      state.portalRegistered = true;
      const milestones = this.createPortalMilestoneDisplay(
        state.capsule,
        this.zoneGroup,
        state.capsule.position.x,
        state.capsule.position.z,
        Math.PI / 2,
        {
          progressZone: "math",
          orbiting: true,
        },
      );
      this.portalStates.push({
        position: new THREE.Vector3(
          state.capsule.position.x,
          0,
          state.capsule.position.z,
        ),
        core: state.core,
        destination: "math",
        milestones,
        action: () => this.teleport("math", true),
        dwell: 0,
        announced: false,
        triggered: false,
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
          const index = this.staticColliders.indexOf(collider);
          if (index >= 0) this.staticColliders.splice(index, 1);
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
        this.surfaceAreas.push({
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
        this.surfaceAreas.push({
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
        this.staticColliders.push(collider);
        return () => {
          const index = this.staticColliders.indexOf(collider);
          if (index >= 0) this.staticColliders.splice(index, 1);
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
        this.surfaceAreas.push(surface);
        return () => {
          const index = this.surfaceAreas.indexOf(surface);
          if (index >= 0) this.surfaceAreas.splice(index, 1);
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
      ) => {
        this.pointerActions.push({ object, action, maximumDistance });
      },
      registerInstanceDrag: (spec) => {
        this.mathInstanceDrags.push(spec);
      },
      copyPlayerPosition: (target) => target.copy(this.playerPosition),
      getPlayerFeetHeight: () => this.surfaceOffset + this.jumpHeight,
      registerPlayerOccluder: (object) => {
        this.registerPlayerOccluder(object);
      },
      registerReturnAperture: (x, z, core, label) => {
        const action = () => this.teleport("grid", true);
        const milestones = this.createPortalMilestoneDisplay(
          core,
          this.zoneGroup,
          x,
          z,
          Math.PI,
          {
            progressZone: "math",
            fragmentZone: "math",
            orbiting: true,
          },
        );
        this.portalStates.push({
          position: new THREE.Vector3(x, 0, z),
          core,
          destination: "grid",
          milestones,
          action,
          dwell: 0,
          announced: false,
          triggered: false,
          chargeMode: "collapse",
          lockMessage:
            "The cube core folds inward… remain within the face to return to Signal Grid.",
        });
        this.addInteraction(
          "math-cube-return-aperture",
          label,
          x,
          z,
          2.65,
          action,
        );
      },
      onStatus: (message, options) => {
        this.hooks.onStatus(message, options);
      },
    });
  }

  private buildSpaceArchive(): void {
    this.bounds = { kind: "circle", radius: 15.2 };
    const root = this.zoneGroup;

    const foundation = addCylinder(
      root,
      17,
      17,
      1.6,
      18,
      [0, -0.8, 0],
      this.materials.black,
    );
    const archiveFloor = addCylinder(
      root,
      13.8,
      13.8,
      0.32,
      20,
      [0, -0.05, 0],
      this.materials.darkStone,
    );
    foundation.name = "world-terrain-foundation";
    archiveFloor.name = "world-terrain-surface";
    foundation.castShadow = false;
    archiveFloor.castShadow = false;

    const starAtlas = this.createStarGlobe(
      root,
      archiveAtlasX,
      archiveAtlasZ,
    );
    this.registerClimbableBox(
      starAtlas,
      "archive-star-atlas",
      "You balance atop the turning atlas. Its brass orbit circles beneath your boots.",
      undefined,
      false,
    );
    this.addInteraction(
      "star-globe",
      "Read the star atlas",
      archiveAtlasX,
      archiveAtlasZ,
      2.7,
      () => {
        this.hooks.onStatus(
          this.archiveAscensionComplete
            ? "A cold star burns inside the silver atlas. Its wireframe sky has taken your impossible ascent for a new coordinate."
            : "A dark wireframe sky turns inside the atlas, charting no familiar stars.",
        );
      },
    );

    const archiveTelescope = this.createTelescope(root, -8.2, -2.8);
    this.addStaticBox(-8.2, 0.7, -2.8, 0.7, 0.8, 0.7);
    this.addInteraction("archive-telescope", "Sight a wandering moon", -8.2, -2.8, 2.6, () => {
      this.raiseTelescope(archiveTelescope);
      this.hooks.onStatus("A small moon crosses the ledger line. No material variance detected.");
    });

    this.createObservabilityRing(root, 6.3, 1.4);
    this.createArchiveSignalPuzzle(root);
    this.addInteraction(
      "observability",
      "Inspect archive observability lens",
      6.3,
      1.4,
      2.5,
      () => {
        if ((this.archiveSignalPuzzle?.powerBlend ?? 0) >= 0.1) {
          this.triggerObservabilityScan();
        }
        this.hooks.onStatus(
          (this.archiveSignalPuzzle?.powerBlend ?? 0) < 0.1
            ? "The observability field is dark. Far across the room, the heliograph’s suspended collector holds only a faint, unfocused glimmer."
          : this.archiveSignalPuzzle?.solved
            ? "The ordered carrier crosses this field on every green-to-violet return. Above it, the decoded sky holds an eclipsed world inside an eye-shaped constellation. One cold pulse escapes on a bearing absent from the atlas."
            : this.archiveSignalPuzzle?.lensOutcome === "cyan-monitor"
              ? "Cyan enters as a narrow carrier and leaves narrower still. A hard line continues from the field into the rear monitor bank, where telemetry flares and stops."
              : this.archiveSignalPuzzle?.lensOutcome === "amber-void"
                ? "Amber crosses the field at full gain. Nothing in the ring turns it; the carrier clears the Archive rim and remains visible in the dark."
            : this.archiveSignalPuzzle?.result === "incomplete"
              ? this.archiveSignalPuzzle.visitedCount ===
                this.archiveSignalPuzzle.relays.length
                ? "Every crystal color reaches the field, but their phase order cancels before observability can resolve it."
                : "The lens catches a thin carrier, but the waveform arrives with crystal voices missing."
              : this.spellStage === "thunder"
                ? "THUNDER observatory: warnings, logs, metrics, and traces cascade beneath the orbiting archive."
                : this.spellStage === "surge"
                  ? "Archive telemetry resolves into a live metrics, logs, and traces cascade."
                  : "The lens emits one thin pulse. The surrounding archive remains stubbornly silent.",
        );
      },
    );

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

    this.createOrbitingMoon(root, -8.4, -7.2);
    for (const [radius, height, size, material, phase, speed, ringed, detail] of [
      [9.6, 3.4, 0.82, this.materials.cyan, 0.2, 0.11, true, 0],
      [7.2, 4.35, 0.58, this.materials.violet, 1.45, -0.16, false, 1],
      [11.4, 2.75, 0.74, this.materials.amber, 2.7, 0.085, true, 2],
      [5.4, 3.05, 0.46, this.materials.green, 4.1, -0.21, false, 3],
      [12.2, 4.7, 0.52, this.materials.coral, 5.25, 0.13, false, 4],
    ] as const) {
      this.createRoomPlanet(
        root,
        radius,
        height,
        size,
        material,
        phase,
        speed,
        ringed,
        detail,
      );
    }
    this.createArchivePlanetFootprints(root);
    this.createPinballAsteroid(root, -8.2, 1.2, 0.66);
    for (const [x, y, z, size] of [
      [-10.5, 2.1, 3.8, 0.9],
      [11.7, 3.6, -1.8, 0.82],
      [10.6, 1.7, -8.5, 0.7],
      [-5.6, 3.2, -10.6, 0.62],
    ] as const) {
      this.createFloatingAsteroid(root, x, y, z, size);
    }

    this.createPortal(
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

  refreshPortalMilestones(): void {
    for (const portal of this.portalStates) {
      const display = portal.milestones;
      if (!display) continue;
      const progress = this.hooks.getZoneMilestoneProgress(
        display.progressZone,
      );
      display.targetUnlocked = THREE.MathUtils.clamp(
        progress.unlocked,
        0,
        display.total,
      );
    }
  }

  private createPortalFragmentSign(
    parent: THREE.Group,
    x: number,
    z: number,
    rotation: number,
    destination: ZoneId,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const fragment = zoneCollapseCommandFragments[destination];
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const wash = context.createLinearGradient(0, 0, canvas.width, 0);
      wash.addColorStop(0, "rgba(255, 171, 65, 0)");
      wash.addColorStop(0.16, "rgba(255, 171, 65, 0.13)");
      wash.addColorStop(0.84, "rgba(98, 220, 232, 0.13)");
      wash.addColorStop(1, "rgba(98, 220, 232, 0)");
      context.fillStyle = wash;
      context.fillRect(0, 42, canvas.width, canvas.height - 84);
      context.strokeStyle = "rgba(255, 194, 96, 0.52)";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(70, 58);
      context.lineTo(34, 160);
      context.lineTo(70, 262);
      context.moveTo(canvas.width - 70, 58);
      context.lineTo(canvas.width - 34, 160);
      context.lineTo(canvas.width - 70, 262);
      context.stroke();
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.fillStyle = "#ffbd55";
      context.font = "800 62px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(fragment.order, 94, 160);
      context.fillStyle = "#eaffff";
      let fontSize = 66;
      const fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, monospace";
      context.font = `800 ${fontSize}px ${fontFamily}`;
      while (
        fontSize > 42 &&
        context.measureText(fragment.command).width > 710
      ) {
        fontSize -= 2;
        context.font = `800 ${fontSize}px ${fontFamily}`;
      }
      context.lineWidth = 9;
      context.strokeStyle = "rgba(3, 8, 12, 0.88)";
      context.strokeText(fragment.command, 244, 160);
      context.fillText(fragment.command, 244, 160);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `portal-collapse-fragment-${destination}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const width = destination === "archive" ? 6.6 : 4.5;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.3125),
      material,
    );
    sign.name = `portal-collapse-fragment-sign-${destination}`;
    const length = Math.max(0.001, Math.hypot(x, z));
    const inwardX = -x / length;
    const inwardZ = -z / length;
    sign.position.set(
      x + inwardX * 2.45,
      0.17,
      z + inwardZ * 2.45,
    );
    sign.rotation.set(-Math.PI / 2, 0, rotation);
    sign.visible = false;
    sign.renderOrder = 4;
    parent.add(sign);
    return sign;
  }

  private createPortalMilestoneDisplay(
    parent: THREE.Object3D,
    signParent: THREE.Group,
    x: number,
    z: number,
    rotation: number,
    options: PortalMilestoneOptions,
  ): PortalMilestoneDisplay {
    const { progressZone, orbiting } = options;
    const fragmentZone = options.fragmentZone ?? progressZone;
    const progress = this.hooks.getZoneMilestoneProgress(progressZone);
    const total = Math.max(1, progress.total);
    const root = new THREE.Group();
    root.name = `portal-milestones-${progressZone}`;
    if (!orbiting) root.position.set(0, 2.05, 0.34);
    parent.add(root);

    const facetGeometry = createPortalMilestoneCrystalGeometry(0.34);
    const facetMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
    });

    const facets = new THREE.InstancedMesh(
      facetGeometry,
      facetMaterial,
      total,
    );
    facets.name = `portal-milestone-facets-${progressZone}`;
    facets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    facets.frustumCulled = false;
    facets.castShadow = false;
    root.add(facets);

    const cores = new THREE.InstancedMesh(
      facetGeometry.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      total,
    );
    cores.name = `portal-milestone-cores-${progressZone}`;
    cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cores.frustumCulled = false;
    cores.renderOrder = 3;
    root.add(cores);

    const completionCircuit = new THREE.Mesh(
      new THREE.TorusGeometry(
        orbiting ? 1.38 : 1.86,
        orbiting ? 0.035 : 0.052,
        5,
        orbiting ? 28 : 36,
      ),
      new THREE.MeshBasicMaterial({
        color:
          zoneMilestoneColors[progressZone][0] ?? palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    completionCircuit.name =
      `portal-milestone-complete-circuit-${progressZone}`;
    if (orbiting) completionCircuit.rotation.x = Math.PI / 2;
    completionCircuit.visible = false;
    completionCircuit.renderOrder = 3;
    root.add(completionCircuit);

    const fragmentSign = this.createPortalFragmentSign(
      signParent,
      x,
      z,
      rotation,
      fragmentZone,
    );
    const colors = Array.from(
      { length: total },
      (_, index) =>
        new THREE.Color(
          zoneMilestoneColors[progressZone][
            index % zoneMilestoneColors[progressZone].length
          ] ?? palette.cyan,
        ),
    );
    const display: PortalMilestoneDisplay = {
      progressZone,
      fragmentZone,
      root,
      facets,
      cores,
      completionCircuit,
      fragmentSign,
      dummy: new THREE.Object3D(),
      growth: new Float32Array(total),
      colors,
      colorScratch: new THREE.Color(),
      total,
      targetUnlocked: THREE.MathUtils.clamp(
        progress.unlocked,
        0,
        total,
      ),
      completion: progress.unlocked >= total ? 1 : 0,
      orbiting,
      phase: (Math.abs(x * 0.31 + z * 0.17) % 1) * Math.PI * 2,
    };
    for (let index = 0; index < total; index += 1) {
      display.growth[index] =
        index < display.targetUnlocked ? 1 : 0;
    }
    this.lanternReveals.push({
      mesh: fragmentSign,
      range: 8.4,
      isAvailable: () => {
        const fragmentProgress =
          this.hooks.getZoneMilestoneProgress(fragmentZone);
        return (
          fragmentProgress.total > 0 &&
          fragmentProgress.unlocked >= fragmentProgress.total
        );
      },
    });
    this.updatePortalMilestoneDisplay(display, 0, true);
    return display;
  }

  private updatePortalMilestoneDisplay(
    display: PortalMilestoneDisplay,
    delta: number,
    immediate = false,
  ): void {
    const follow =
      immediate || this.reduceMotion
        ? 1
        : 1 - Math.exp(-delta * 5.6);
    for (let index = 0; index < display.total; index += 1) {
      const target = index < display.targetUnlocked ? 1 : 0;
      const growth = THREE.MathUtils.lerp(
        display.growth[index] ?? 0,
        target,
        follow,
      );
      display.growth[index] = growth;
      const color = display.colorScratch
        .copy(display.colors[index] ?? display.colors[0]!)
        .lerp(portalDormantMilestoneShade, (1 - growth) * 0.46);
      display.facets.setColorAt(index, color);
      display.cores.setColorAt(index, color);

      const dummy = display.dummy;
      if (display.orbiting) {
        const angle =
          display.phase +
          (index / display.total) * Math.PI * 2 +
          this.elapsed * (0.16 + index * 0.018);
        const radius = 1.48 + (index % 2) * 0.32;
        dummy.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.7 + display.phase) * 0.46,
          Math.sin(angle) * radius,
        );
        dummy.rotation.set(
          angle * 0.42 + index,
          -angle * 0.68,
          angle + index * 0.4,
        );
      } else {
        const angle =
          display.total === 1
            ? Math.PI / 2
            : THREE.MathUtils.lerp(
                -Math.PI * 0.08,
                Math.PI * 1.08,
                index / (display.total - 1),
              );
        dummy.position.set(
          Math.cos(angle) * 1.86,
          Math.sin(angle) * 1.86,
          0,
        );
        dummy.rotation.set(0, 0, angle - Math.PI / 2);
      }
      const seedScale = 0.42 + growth * 0.58;
      const shardHeight = 1.32 + (index % 3) * 0.15;
      dummy.scale.set(
        0.78 * seedScale,
        shardHeight * seedScale,
        0.78 * seedScale,
      );
      dummy.updateMatrix();
      display.facets.setMatrixAt(index, dummy.matrix);

      dummy.scale.set(
        0.88 * seedScale,
        shardHeight * 1.1 * seedScale,
        0.88 * seedScale,
      );
      dummy.updateMatrix();
      display.cores.setMatrixAt(index, dummy.matrix);
    }
    display.facets.instanceMatrix.needsUpdate = true;
    display.cores.instanceMatrix.needsUpdate = true;
    if (display.facets.instanceColor) {
      display.facets.instanceColor.needsUpdate = true;
    }
    if (display.cores.instanceColor) {
      display.cores.instanceColor.needsUpdate = true;
    }

    const completeTarget =
      display.targetUnlocked >= display.total ? 1 : 0;
    display.completion = THREE.MathUtils.lerp(
      display.completion,
      completeTarget,
      immediate || this.reduceMotion
        ? 1
        : 1 - Math.exp(-delta * 3.2),
    );
    display.completionCircuit.visible = display.completion > 0.005;
    display.completionCircuit.material.opacity =
      display.completion *
      (0.68 + Math.sin(this.elapsed * 2.8 + display.phase) * 0.12);
    display.completionCircuit.scale.setScalar(
      1 + display.completion * Math.sin(this.elapsed * 1.9) * 0.018,
    );
  }

  private updatePortalMilestones(delta: number): void {
    for (const portal of this.portalStates) {
      if (!portal.milestones) continue;
      this.updatePortalMilestoneDisplay(portal.milestones, delta);
    }
  }

  private createPortal(
    parent: THREE.Group,
    x: number,
    z: number,
    color: number,
    label: string,
    destination: ZoneId,
  ): void {
    const action = () => this.teleport(destination, true);
    const group = new THREE.Group();
    group.name = `portal-to-${destination}`;
    group.position.set(x, 0, z);
    // Keep every threshold tangent to the island edge, with its step facing
    // inward. The Archive portal already looked close at 0/π; the diagonal
    // Field portals need this radial yaw to avoid appearing offset.
    group.rotation.y = Math.atan2(-x, -z);

    const portalMaterial =
      color === palette.green
        ? this.materials.green
        : color === palette.cyan
          ? this.materials.cyan
          : color === palette.violet
            ? this.materials.violet
            : this.materials.amber;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.36, 6, 18), this.materials.stone);
    ring.name = `portal-stone-ring-${destination}`;
    ring.position.y = 2.05;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);

    const coreMaterial = portalMaterial.clone();
    coreMaterial.transparent = true;
    coreMaterial.opacity = 0.64;
    coreMaterial.depthWrite = false;
    coreMaterial.side = THREE.DoubleSide;
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.48, 28), coreMaterial);
    core.position.set(0, 2.05, -0.02);
    core.renderOrder = 0;
    group.add(core);

    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.055, 5, 24, Math.PI * 1.55),
      this.materials.portalGlyph,
    );
    swirl.position.set(0, 2.05, 0);
    swirl.rotation.z = Math.abs(x * 0.2 + z * 0.13);
    swirl.castShadow = false;
    swirl.renderOrder = 2;
    group.add(swirl);

    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.3, 0.9), this.materials.stone);
      base.position.set(side * 1.42, 0.65, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
    }

    const step = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 1.6), this.materials.parchment);
    step.position.set(0, 0.08, 0.45);
    step.receiveShadow = true;
    group.add(step);

    parent.add(group);
    const isReturnThreshold =
      destination === "field" && this.currentZone !== "field";
    const milestones = this.createPortalMilestoneDisplay(
      group,
      parent,
      x,
      z,
      group.rotation.y,
      {
        progressZone: isReturnThreshold
          ? this.currentZone
          : destination,
        // Both faces of a threshold teach the same world-owned fragment.
        // Return portals therefore mirror the world being left, not Field.
        fragmentZone: isReturnThreshold
          ? this.currentZone
          : destination,
        orbiting: false,
      },
    );
    this.animatedItems.push({
      object: core,
      originY: core.position.y,
      phase: Math.abs(x * 0.4 + z * 0.7),
      amplitude: 0.045,
      rotationSpeed: 0,
    });
    this.animatedItems.push({
      object: swirl,
      originY: swirl.position.y,
      phase: Math.abs(z * 0.3),
      amplitude: 0,
      rotationSpeed: 0.42,
      rotationAxis: "z",
    });
    this.portalStates.push({
      position: new THREE.Vector3(x, 0, z),
      core,
      destination,
      milestones,
      action,
      dwell: 0,
      announced: false,
      triggered: false,
    });
    this.addInteraction(`portal-${label}`, label, x, z, 2.65, action);
  }

  private createTent(parent: THREE.Group, x: number, z: number): TentState {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const halfWidth = 2.25;
    const halfDepth = 1.7;
    const peak = 2.65;
    const doorHalfWidth = 0.66;
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
    canopyMaterial.vertexColors = true;
    canopyMaterial.roughness = 0.94;
    canopyMaterial.side = THREE.DoubleSide;
    canopyMaterial.transparent = true;
    canopyMaterial.opacity = 0.9;
    canopyMaterial.depthWrite = false;
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.castShadow = true;
    group.add(canopy);

    const rug = addBox(
      group,
      [2.55, 0.06, 2.25],
      [0, 0.08, 0.05],
      this.materials.tealDark,
    );
    rug.castShadow = false;

    const bedroll = addBox(
      group,
      [0.9, 0.18, 2.5],
      [0, 0.19, 0.5],
      this.materials.parchment,
    );
    bedroll.castShadow = false;
    const pillow = addBox(
      group,
      [0.68, 0.13, 0.4],
      [0, 0.33, -0.52],
      this.materials.cyanSoft,
    );
    pillow.castShadow = false;
    const blanket = addBox(
      group,
      [0.84, 0.055, 1.05],
      [0, 0.315, 0.45],
      this.materials.amber,
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
    this.surfaceAreas.push(surface);
    return state;
  }

  private createMapTable(parent: THREE.Group, x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    addBox(group, [2.3, 0.24, 1.45], [0, 1.15, 0], this.materials.wood);
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
        this.materials.wood,
      );
      leg.castShadow = false;
    }
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
    this.surfaceAreas.push(tableSurface);
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
    parent.add(group);
    this.lanterns.push({
      light,
      position: new THREE.Vector3(x, 0, z),
      litUntil: 0,
    });
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
      this.surfaceAreas.push(surface);
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

  private createVoidRideEffects(
    parent: THREE.Group,
    turtle: THREE.Group,
  ): VoidRideEffects {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.72, 4.35, 48, 1, 0.18, Math.PI * 1.72),
      new THREE.MeshBasicMaterial({
        color: palette.violet,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    halo.name = "void-turtle-galaxy-halo";
    halo.position.y = 0.28;
    halo.rotation.x = -Math.PI / 2;
    halo.renderOrder = 3;
    halo.visible = false;
    turtle.add(halo);

    const maximumTrailCount = 24;
    const trail = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
      maximumTrailCount,
    );
    trail.name = "void-turtle-comet-trail";
    trail.frustumCulled = false;
    trail.renderOrder = 3;
    trail.visible = false;
    trail.count =
      this.quality === "low"
        ? 12
        : this.quality === "medium"
          ? 18
          : maximumTrailCount;
    const trailPositions = new Float32Array(maximumTrailCount * 3);
    const trailDummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cyan = new THREE.Color(palette.cyan);
    const violet = new THREE.Color(palette.violet);
    for (let index = 0; index < maximumTrailCount; index += 1) {
      trailDummy.scale.setScalar(0.001);
      trailDummy.updateMatrix();
      trail.setMatrixAt(index, trailDummy.matrix);
      color.lerpColors(cyan, violet, index / Math.max(1, maximumTrailCount - 1));
      trail.setColorAt(index, color);
    }
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trail.instanceMatrix.needsUpdate = true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
    parent.add(trail);

    const maximumMeteorCount = 6;
    const meteorPositions = new Float32Array(maximumMeteorCount * 2 * 3);
    const meteorColors = new Float32Array(maximumMeteorCount * 2 * 3);
    for (let index = 0; index < maximumMeteorCount; index += 1) {
      color.lerpColors(
        index % 2 === 0 ? cyan : violet,
        index % 2 === 0 ? violet : cyan,
        0.32,
      );
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        const offset = (index * 2 + endpoint) * 3;
        meteorColors[offset] = color.r;
        meteorColors[offset + 1] = color.g;
        meteorColors[offset + 2] = color.b;
      }
    }
    const meteorGeometry = new THREE.BufferGeometry();
    const meteorPositionAttribute = new THREE.BufferAttribute(meteorPositions, 3);
    meteorPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    meteorGeometry.setAttribute("position", meteorPositionAttribute);
    meteorGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(meteorColors, 3),
    );
    const meteorCount =
      this.quality === "low"
        ? 3
        : this.quality === "medium"
          ? 5
          : maximumMeteorCount;
    meteorGeometry.setDrawRange(0, meteorCount * 2);
    const meteors = new THREE.LineSegments(
      meteorGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    meteors.name = "void-ride-meteorite-drift";
    meteors.frustumCulled = false;
    meteors.renderOrder = 3;
    meteors.visible = false;
    parent.add(meteors);

    return {
      halo,
      trail,
      trailPositions,
      trailDummy,
      maximumTrailCount,
      meteors,
      meteorPositions,
      maximumMeteorCount,
    };
  }

  private resetVoidRideEffects(turtle: VoidTurtleState): void {
    const effects = turtle.effects;
    const tangentX = -Math.sin(turtle.rideAngle);
    const tangentZ = Math.cos(turtle.rideAngle);
    for (let index = 0; index < effects.maximumTrailCount; index += 1) {
      const distance = 1.7 + index * 0.34;
      const offset = index * 3;
      effects.trailPositions[offset] =
        turtle.group.position.x - tangentX * distance;
      effects.trailPositions[offset + 1] = turtle.group.position.y + 0.58;
      effects.trailPositions[offset + 2] =
        turtle.group.position.z - tangentZ * distance;
    }
  }

  private updateVoidRideEffects(
    turtle: VoidTurtleState,
    delta: number,
  ): void {
    const effects = turtle.effects;
    effects.halo.visible = turtle.riding;
    effects.trail.visible = turtle.riding;
    effects.meteors.visible = turtle.riding;
    if (!turtle.riding) return;

    const dismountFade =
      turtle.ridePhase === "dismounting"
        ? Math.max(0, 1 - turtle.phaseAge / (this.reduceMotion ? 0.36 : 0.92))
        : 1;
    const pulse = 1 + Math.sin(this.elapsed * 1.7) * 0.055;
    effects.halo.scale.setScalar(pulse);
    effects.halo.material.opacity =
      (0.13 + Math.sin(this.elapsed * 1.1) * 0.025) * dismountFade;
    if (!this.reduceMotion) effects.halo.rotation.z += delta * 0.16;

    const tangentX = -Math.sin(turtle.rideAngle);
    const tangentZ = Math.cos(turtle.rideAngle);
    const headX = turtle.group.position.x - tangentX * 1.85;
    const headY = turtle.group.position.y + 0.58;
    const headZ = turtle.group.position.z - tangentZ * 1.85;
    for (let index = 0; index < effects.maximumTrailCount; index += 1) {
      const offset = index * 3;
      const targetOffset = Math.max(0, offset - 3);
      const targetX =
        index === 0 ? headX : effects.trailPositions[targetOffset]!;
      const targetY =
        index === 0 ? headY : effects.trailPositions[targetOffset + 1]!;
      const targetZ =
        index === 0 ? headZ : effects.trailPositions[targetOffset + 2]!;
      const follow = 1 - Math.exp(-delta * (index === 0 ? 11 : 7.2));
      effects.trailPositions[offset] = THREE.MathUtils.lerp(
        effects.trailPositions[offset]!,
        targetX,
        follow,
      );
      effects.trailPositions[offset + 1] = THREE.MathUtils.lerp(
        effects.trailPositions[offset + 1]!,
        targetY,
        follow,
      );
      effects.trailPositions[offset + 2] = THREE.MathUtils.lerp(
        effects.trailPositions[offset + 2]!,
        targetZ,
        follow,
      );

      const taper = 1 - index / effects.maximumTrailCount;
      const shimmer =
        0.86 + Math.sin(this.elapsed * 5.2 - index * 0.63) * 0.14;
      effects.trailDummy.position.set(
        effects.trailPositions[offset]!,
        effects.trailPositions[offset + 1]!,
        effects.trailPositions[offset + 2]!,
      );
      effects.trailDummy.rotation.set(
        this.elapsed * 0.34 + index * 0.21,
        -this.elapsed * 0.27 + index * 0.33,
        index * 0.19,
      );
      effects.trailDummy.scale.setScalar(
        (0.2 + Math.pow(taper, 1.35) * 1.18) * shimmer * dismountFade,
      );
      effects.trailDummy.updateMatrix();
      effects.trail.setMatrixAt(index, effects.trailDummy.matrix);
    }
    effects.trail.instanceMatrix.needsUpdate = true;
    effects.trail.material.opacity = 0.68 * dismountFade;

    for (let index = 0; index < effects.maximumMeteorCount; index += 1) {
      const speed = this.reduceMotion ? 0 : 0.025 + index * 0.003;
      const phase = (this.elapsed * speed + index * 0.173) % 1;
      const lane = (index - (effects.maximumMeteorCount - 1) / 2) * 2.35;
      const x = turtle.group.position.x - 14 + phase * 28 + lane * 0.45;
      const y = 2.6 + (index % 3) * 1.15 + Math.sin(index * 1.7) * 0.3;
      const z = turtle.group.position.z + 11 - phase * 22 + lane;
      const length = 1.7 + (index % 3) * 0.55;
      const offset = index * 6;
      effects.meteorPositions[offset] = x;
      effects.meteorPositions[offset + 1] = y;
      effects.meteorPositions[offset + 2] = z;
      effects.meteorPositions[offset + 3] = x - length;
      effects.meteorPositions[offset + 4] = y + length * 0.42;
      effects.meteorPositions[offset + 5] = z + length * 0.78;
    }
    const positionAttribute = effects.meteors.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
    effects.meteors.material.opacity =
      (0.46 + Math.sin(this.elapsed * 1.3) * 0.08) * dismountFade;
  }

  private createStormStone(
    parent: THREE.Group,
    x: number,
    z: number,
  ): void {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.62, 0),
      this.materials.darkStone,
    );
    stone.position.set(x, 0.38, z);
    stone.scale.set(1, 0.62, 0.86);
    stone.rotation.set(0.08, 0.42, -0.06);
    stone.castShadow = false;
    parent.add(stone);

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
    bolt.position.set(x, 0.775, z);
    bolt.rotation.set(-Math.PI / 2, 0, 0.18);
    bolt.scale.setScalar(0.68);
    bolt.visible = false;
    bolt.renderOrder = 4;
    parent.add(bolt);
    this.lanternReveals.push({ mesh: bolt, range: 6.4 });
  }

  private createVoidTurtle(parent: THREE.Group, x: number, z: number): void {
    const turtle = new THREE.Group();
    turtle.name = "void-turtle-world-body";
    turtle.position.set(x, 0.08, z);
    // Face away from the station so the head does not occupy the jump/landing lane.
    turtle.rotation.y = Math.atan2(x, z);

    const shell = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.05, 1),
      this.materials.mossDark,
    );
    shell.scale.set(1.24, 0.48, 1.46);
    shell.position.y = 0.38;
    shell.castShadow = false;
    turtle.add(shell);

    const head = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.72, 0),
      this.materials.moss,
    );
    head.position.set(0, 0.25, 3.02);
    head.scale.set(1, 0.78, 1.08);
    head.castShadow = false;
    turtle.add(head);

    const fins: VoidTurtleFin[] = [];
    for (const [side, rear] of [
      [-1, false],
      [1, false],
      [-1, true],
      [1, true],
    ] as const) {
      const pivot = new THREE.Group();
      const radius = rear ? 0.62 : 0.72;
      const centerX = rear ? 2.05 : 2.35;
      const jointX = rear ? 1.35 : 1.48;
      const z = rear ? -1.55 : 0.78;
      pivot.position.set(side * jointX, rear ? 0.02 : 0.05, z);

      const fin = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        this.materials.moss,
      );
      fin.position.x = side * (centerX - jointX);
      fin.scale.set(
        rear ? 1.18 : 1.35,
        rear ? 0.2 : 0.24,
        rear ? 0.62 : 0.72,
      );
      fin.rotation.y = side * (rear ? -0.35 : 0.35);
      fin.castShadow = false;
      pivot.add(fin);
      turtle.add(pivot);
      fins.push({
        pivot,
        side,
        phase: rear ? Math.PI * 0.72 : 0,
        rear,
      });
    }

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2.48, 0.055, 5, 30),
      this.materials.cyanSoft,
    );
    orbit.position.y = 0.68;
    orbit.rotation.set(Math.PI / 2, 0.16, 0.12);
    orbit.scale.z = 1.15;
    turtle.add(orbit);

    const moonOrbit = new THREE.Group();
    moonOrbit.position.y = 0.72;
    const moon = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.24, 0),
      this.materials.violet,
    );
    moon.position.x = 2.48;
    moonOrbit.add(moon);
    turtle.add(moonOrbit);

    const eyes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      this.materials.amber,
      2,
    );
    const eyeTransform = new THREE.Object3D();
    for (const [index, eyeX] of [-0.23, 0.23].entries()) {
      eyeTransform.position.set(eyeX, 0.43, 3.62);
      eyeTransform.updateMatrix();
      eyes.setMatrixAt(index, eyeTransform.matrix);
    }
    eyes.instanceMatrix.needsUpdate = true;
    const turtleAwake = this.voidTurtleAwakened;
    eyes.visible = turtleAwake;
    turtle.add(eyes);

    const sleepEyes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.35, 0.43, 3.64),
        new THREE.Vector3(-0.11, 0.43, 3.64),
        new THREE.Vector3(0.11, 0.43, 3.64),
        new THREE.Vector3(0.35, 0.43, 3.64),
      ]),
      new THREE.LineBasicMaterial({
        color: palette.amber,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
      }),
    );
    sleepEyes.visible = !turtleAwake;
    sleepEyes.renderOrder = 4;
    turtle.add(sleepEyes);

    parent.add(turtle);
    const effects = this.createVoidRideEffects(parent, turtle);
    this.animatedItems.push({
      object: turtle,
      originY: turtle.position.y,
      phase: 0.7,
      amplitude: 0.16,
      rotationSpeed: 0,
    });
    const shellSurface: SurfaceArea = {
      id: "void-turtle-shell",
      x,
      z,
      halfWidth: 2.2,
      halfDepth: 2.35,
      requiresJump: true,
      // Follow the floating shell instead of letting the rider's feet and
      // lantern sink into its highest facets as the turtle bobs.
      heightAt: () => turtle.position.y + 1.38,
    };
    this.surfaceAreas.push(shellSurface);
    const stationAngle = Math.atan2(z, x);
    const stationRadius = Math.hypot(x, z);
    this.voidTurtle = {
      group: turtle,
      moonOrbit,
      fins,
      eyes,
      sleepEyes,
      awake: turtleAwake,
      surface: shellSurface,
      interactionId: "void-turtle",
      stationAngle,
      stationRadius,
      rideAngle: stationAngle,
      rideTravel: 0,
      riding: false,
      ridePhase: "parked",
      phaseAge: 0,
      returnStartAngle: stationAngle,
      returnStartRadius: stationRadius,
      returnTargetAngle: stationAngle,
      dismountStart: new THREE.Vector3(x, 0, z),
      dismountTarget: new THREE.Vector3(x, 0, z),
      dismountHeight: 0,
      buckAge: 2,
      effects,
    };
  }

  private createVoidTurtleAsteroids(parent: THREE.Group): void {
    for (const [
      index,
      [angle, radius, idleY, size],
    ] of voidTurtleAsteroidConfigs.entries()) {
      const asteroid = new THREE.Group();
      asteroid.name = `void-turtle-asteroid-${index}`;
      asteroid.position.set(
        Math.cos(angle) * radius,
        idleY,
        Math.sin(angle) * radius,
      );
      asteroid.rotation.set(index * 0.31, index * 0.67, -index * 0.18);

      const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        this.materials.darkStone,
      );
      body.scale.set(1, 0.76 + (index % 3) * 0.08, 0.9);
      body.castShadow = false;
      asteroid.add(body);

      const band = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.76, 0.028, 4, 16),
        this.materials.cyanSoft,
      );
      band.rotation.set(Math.PI / 2, index * 0.23, 0.18);
      band.visible = this.capturedTurtleAsteroidIndices.has(index);
      band.castShadow = false;
      asteroid.add(band);
      parent.add(asteroid);

      const kickable = this.registerKickable(
        asteroid,
        size * 0.88,
        idleY,
        null,
        false,
        null,
        0.996,
        "",
      );
      const baseOrbitSpeed = 0.34 + (index % 3) * 0.055;
      this.turtleAsteroids.push({
        index,
        object: asteroid,
        band,
        kickable,
        collected: this.capturedTurtleAsteroidIndices.has(index),
        idleY,
        verticalPhase: index * 1.37,
        orbitAngle: angle,
        orbitRadius: 3.45 + (index % 3) * 0.62,
        targetRadius: 3.45 + (index % 3) * 0.62,
        orbitSpeed: baseOrbitSpeed,
        baseOrbitSpeed,
        radialVelocity: 0,
      });
    }
    this.updateTurtleAsteroids(0);
  }

  private getTurtleAsteroidState(
    kickable: Kickable,
  ): TurtleAsteroidState | null {
    return (
      this.turtleAsteroids.find(
        (asteroid) => asteroid.kickable === kickable,
      ) ?? null
    );
  }

  private captureTurtleAsteroid(
    asteroid: TurtleAsteroidState,
    turtle: VoidTurtleState,
  ): void {
    const dx = asteroid.object.position.x - turtle.group.position.x;
    const dz = asteroid.object.position.z - turtle.group.position.z;
    asteroid.collected = true;
    asteroid.band.visible = true;
    asteroid.orbitAngle = Math.atan2(dz, dx);
    asteroid.orbitRadius = THREE.MathUtils.clamp(
      Math.hypot(dx, dz),
      3.05,
      6.8,
    );
    asteroid.radialVelocity = 0;
    asteroid.kickable.velocity.set(0, 0, 0);
    asteroid.kickable.platform = null;
    asteroid.kickable.onPlatform = false;
    this.capturedTurtleAsteroidIndices.add(asteroid.index);

    if (this.capturedTurtleAsteroidIndices.size === 1) {
      this.hooks.onStatus(
        "A loose asteroid catches the turtle’s wake and settles into a small orbit.",
      );
    } else if (
      this.capturedTurtleAsteroidIndices.size ===
      voidTurtleAsteroidConfigs.length
    ) {
      this.hooks.onStatus(
        "The last wandering stone joins the turtle’s little moving system.",
        { kind: "achievement", title: "ROCK COLLECTOR" },
      );
    }
  }

  private getTurtleCargoOrbiter(
    kickable: Kickable,
  ): TurtleCargoOrbiterState | null {
    return (
      this.turtleCargoOrbiters.find(
        (orbiter) => orbiter.kickable === kickable,
      ) ?? null
    );
  }

  private isTurtleBoundKickable(kickable: Kickable): boolean {
    return (
      this.getTurtleAsteroidState(kickable) !== null ||
      this.getTurtleCargoOrbiter(kickable) !== null
    );
  }

  private removeTurtleCargoOrbiter(
    kickable: Kickable,
    restorePhysics = true,
  ): boolean {
    const index = this.turtleCargoOrbiters.findIndex(
      (orbiter) => orbiter.kickable === kickable,
    );
    if (index < 0) return false;
    const [orbiter] = this.turtleCargoOrbiters.splice(index, 1);
    if (orbiter && restorePhysics) {
      kickable.gravity = orbiter.originalGravity;
      kickable.restingY = orbiter.originalRestingY;
    }
    kickable.object.userData.turtleCargo = false;
    return true;
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

  private captureTurtleCargoOrbiter(
    kickable: Kickable,
    turtle: VoidTurtleState,
  ): TurtleCargoOrbiterState {
    const existing = this.getTurtleCargoOrbiter(kickable);
    if (existing) return existing;
    const dx = kickable.object.position.x - turtle.group.position.x;
    const dz = kickable.object.position.z - turtle.group.position.z;
    const cargoIndex = this.turtleCargoOrbiters.length;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    const direction = cargoIndex % 2 === 0 ? 1 : -1;
    const orbiter: TurtleCargoOrbiterState = {
      kickable,
      orbitAngle: Math.atan2(dz, dx),
      orbitRadius: THREE.MathUtils.clamp(rawRadius, 2.65, 6.8),
      targetRadius: 2.85 + (cargoIndex % 5) * 0.54,
      orbitSpeed: direction * (0.4 + (cargoIndex % 4) * 0.055),
      radialVelocity: 0,
      verticalPhase: cargoIndex * 1.73 + kickable.radius,
      originalGravity: kickable.gravity,
      originalRestingY: kickable.restingY,
    };
    kickable.gravity = false;
    kickable.velocity.set(0, 0, 0);
    kickable.platform = null;
    kickable.onPlatform = false;
    kickable.object.userData.turtleCargo = true;
    this.turtleCargoOrbiters.push(orbiter);
    if (!this.turtleCargoCaptureAnnounced) {
      this.turtleCargoCaptureAnnounced = true;
      this.hooks.onStatus(
        kickable === this.archiveAsteroid
          ? "The misrouted asteroid catches the turtle’s wake and begins circling with the stones."
          : "A loose tool catches the turtle’s wake and begins circling with the stones.",
      );
    }
    return orbiter;
  }

  private updateTurtleCargoOrbiters(
    delta: number,
    turtle: VoidTurtleState,
  ): void {
    if (turtle.riding) {
      for (const kickable of this.kickables) {
        if (
          !kickable.enabled ||
          kickable === this.heldKickable ||
          (kickable.pinballRadius !== null &&
            kickable !== this.archiveAsteroid) ||
          this.getTurtleAsteroidState(kickable) ||
          this.getTurtleCargoOrbiter(kickable)
        ) {
          continue;
        }
        const dx = kickable.object.position.x - turtle.group.position.x;
        const dz = kickable.object.position.z - turtle.group.position.z;
        const captureDistance = 3.45 + kickable.radius;
        if (dx * dx + dz * dz <= captureDistance * captureDistance) {
          this.captureTurtleCargoOrbiter(kickable, turtle);
        }
      }
    }

    for (const orbiter of this.turtleCargoOrbiters) {
      const { kickable } = orbiter;
      if (!kickable.enabled || kickable === this.heldKickable) continue;
      const spring = (orbiter.targetRadius - orbiter.orbitRadius) * 1.55;
      orbiter.radialVelocity += spring * delta;
      orbiter.radialVelocity *= Math.exp(-delta * 1.18);
      const maximumOrbitRadius =
        kickable === this.archiveAsteroid && turtle.riding ? 11.5 : 7.4;
      orbiter.orbitRadius = THREE.MathUtils.clamp(
        orbiter.orbitRadius + orbiter.radialVelocity * delta,
        2.55,
        maximumOrbitRadius,
      );
      orbiter.orbitAngle += orbiter.orbitSpeed * delta;
      kickable.object.position.set(
        turtle.group.position.x +
          Math.cos(orbiter.orbitAngle) * orbiter.orbitRadius,
        turtle.group.position.y +
          1.05 +
          Math.sin(
            orbiter.orbitAngle * 1.7 + orbiter.verticalPhase,
          ) *
            0.48,
        turtle.group.position.z +
          Math.sin(orbiter.orbitAngle) * orbiter.orbitRadius,
      );
      kickable.object.rotation.y += delta * (0.7 + kickable.radius * 0.2);
      if (kickable.object.userData.upright !== true) {
        kickable.object.rotation.z += delta * 0.42;
      }
      this.syncLooseToolInteraction(kickable);
    }
  }

  private updateTurtleAsteroids(delta: number): void {
    const turtle = this.voidTurtle;
    if (!turtle || this.currentZone !== "field") return;

    for (const asteroid of this.turtleAsteroids) {
      if (!asteroid.collected) {
        if (asteroid.kickable !== this.heldKickable) {
          asteroid.object.position.y =
            asteroid.idleY +
            Math.sin(this.elapsed * 0.72 + asteroid.verticalPhase) * 0.16;
          asteroid.object.rotation.y += delta * (0.18 + asteroid.index * 0.018);
        }
        if (!turtle.riding || asteroid.kickable === this.heldKickable) continue;
        const dx = asteroid.object.position.x - turtle.group.position.x;
        const dz = asteroid.object.position.z - turtle.group.position.z;
        const captureDistance = 3.45 + asteroid.kickable.radius;
        if (dx * dx + dz * dz > captureDistance * captureDistance) continue;
        this.captureTurtleAsteroid(asteroid, turtle);
      }

      if (asteroid.kickable === this.heldKickable) continue;
      const spring = (asteroid.targetRadius - asteroid.orbitRadius) * 1.75;
      asteroid.radialVelocity += spring * delta;
      asteroid.radialVelocity *= Math.exp(-delta * 1.15);
      asteroid.orbitRadius = THREE.MathUtils.clamp(
        asteroid.orbitRadius + asteroid.radialVelocity * delta,
        3.05,
        7.6,
      );
      asteroid.orbitSpeed = THREE.MathUtils.lerp(
        asteroid.orbitSpeed,
        asteroid.baseOrbitSpeed,
        1 - Math.exp(-delta * 0.07),
      );
      asteroid.orbitAngle += asteroid.orbitSpeed * delta;
      asteroid.object.position.set(
        turtle.group.position.x +
          Math.cos(asteroid.orbitAngle) * asteroid.orbitRadius,
        turtle.group.position.y +
          0.92 +
          Math.sin(
            asteroid.orbitAngle * 1.8 + asteroid.verticalPhase,
          ) *
            0.62,
        turtle.group.position.z +
          Math.sin(asteroid.orbitAngle) * asteroid.orbitRadius,
      );
      asteroid.object.rotation.x += delta * (0.24 + asteroid.index * 0.025);
      asteroid.object.rotation.y += delta * (0.38 + asteroid.index * 0.02);
      this.kickCapturedTurtleAsteroid(asteroid, turtle, delta);
    }
    this.updateTurtleCargoOrbiters(delta, turtle);
  }

  private kickCapturedTurtleAsteroid(
    asteroid: TurtleAsteroidState,
    turtle: VoidTurtleState,
    delta: number,
  ): void {
    asteroid.kickable.kickCooldown = Math.max(
      0,
      asteroid.kickable.kickCooldown - delta,
    );
    if (
      turtle.riding ||
      asteroid.kickable.kickCooldown > 0 ||
      this.movement.lengthSq() <= 0.0001
    ) {
      return;
    }
    const dx = asteroid.object.position.x - this.playerPosition.x;
    const dz = asteroid.object.position.z - this.playerPosition.z;
    const contact =
      asteroid.kickable.radius + this.playerRadius + 0.14;
    if (dx * dx + dz * dz > contact * contact) return;

    const movementLength = Math.max(
      0.001,
      Math.hypot(this.movement.x, this.movement.z),
    );
    const directionX = this.movement.x / movementLength;
    const directionZ = this.movement.z / movementLength;
    const radialX = Math.cos(asteroid.orbitAngle);
    const radialZ = Math.sin(asteroid.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialPush = directionX * radialX + directionZ * radialZ;
    const tangentialPush =
      directionX * tangentX + directionZ * tangentZ;
    asteroid.radialVelocity = THREE.MathUtils.clamp(
      asteroid.radialVelocity + radialPush * 3.9,
      -4.8,
      7.1,
    );
    asteroid.orbitSpeed = THREE.MathUtils.clamp(
      asteroid.orbitSpeed +
        (tangentialPush * 2.8) /
          Math.max(3.05, asteroid.orbitRadius),
      -1.8,
      1.8,
    );
    asteroid.kickable.kickCooldown = 0.38;
    if (!this.turtleAsteroidFlingAnnounced) {
      this.turtleAsteroidFlingAnnounced = true;
      this.hooks.onStatus(
        "The kicked stone keeps the shove, but the turtle’s curve refuses to let it go.",
      );
    }
  }

  private releaseTurtleAsteroidTelekinesis(
    kickable: Kickable,
    event: PointerEvent,
  ): boolean {
    const asteroid = this.getTurtleAsteroidState(kickable);
    const turtle = this.voidTurtle;
    if (!asteroid?.collected || !turtle) return false;

    const dx = asteroid.object.position.x - turtle.group.position.x;
    const dz = asteroid.object.position.z - turtle.group.position.z;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    asteroid.orbitAngle = Math.atan2(dz, dx);
    asteroid.orbitRadius = THREE.MathUtils.clamp(rawRadius, 3.05, 7.6);
    const radialX = Math.cos(asteroid.orbitAngle);
    const radialZ = Math.sin(asteroid.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialSpeed =
      kickable.velocity.x * radialX + kickable.velocity.z * radialZ;
    const tangentialSpeed =
      kickable.velocity.x * tangentX + kickable.velocity.z * tangentZ;
    asteroid.radialVelocity = THREE.MathUtils.clamp(
      radialSpeed,
      -4.8,
      4.8,
    );
    asteroid.orbitSpeed = THREE.MathUtils.clamp(
      asteroid.orbitSpeed +
        tangentialSpeed / Math.max(3.05, asteroid.orbitRadius),
      -1.8,
      1.8,
    );
    asteroid.object.position.x =
      turtle.group.position.x + radialX * asteroid.orbitRadius;
    asteroid.object.position.z =
      turtle.group.position.z + radialZ * asteroid.orbitRadius;
    kickable.velocity.set(0, 0, 0);
    kickable.kickCooldown = 0.28;

    if (!this.turtleAsteroidFlingAnnounced) {
      this.turtleAsteroidFlingAnnounced = true;
      this.hooks.onStatus(
        "The released stone catches the turtle’s curve and keeps the speed you gave it.",
      );
    }

    this.finishTurtleBoundTelekinesis(event);
    return true;
  }

  private releaseTurtleCargoTelekinesis(
    kickable: Kickable,
    event: PointerEvent,
  ): boolean {
    const turtle = this.voidTurtle;
    if (!turtle || this.getTurtleAsteroidState(kickable)) return false;
    let orbiter = this.getTurtleCargoOrbiter(kickable);
    if (!orbiter) {
      if (!turtle.riding) return false;
      const dx = kickable.object.position.x - turtle.group.position.x;
      const dz = kickable.object.position.z - turtle.group.position.z;
      const captureDistance = 3.45 + kickable.radius;
      if (dx * dx + dz * dz > captureDistance * captureDistance) {
        return false;
      }
      orbiter = this.captureTurtleCargoOrbiter(kickable, turtle);
    }

    const dx = kickable.object.position.x - turtle.group.position.x;
    const dz = kickable.object.position.z - turtle.group.position.z;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    orbiter.orbitAngle = Math.atan2(dz, dx);
    const maximumOrbitRadius =
      kickable === this.archiveAsteroid && turtle.riding ? 11.5 : 7.4;
    orbiter.orbitRadius = THREE.MathUtils.clamp(
      rawRadius,
      2.55,
      maximumOrbitRadius,
    );
    const radialX = Math.cos(orbiter.orbitAngle);
    const radialZ = Math.sin(orbiter.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialSpeed =
      kickable.velocity.x * radialX + kickable.velocity.z * radialZ;
    const tangentialSpeed =
      kickable.velocity.x * tangentX + kickable.velocity.z * tangentZ;
    orbiter.radialVelocity = THREE.MathUtils.clamp(
      radialSpeed,
      -4.4,
      4.4,
    );
    orbiter.orbitSpeed = THREE.MathUtils.clamp(
      orbiter.orbitSpeed +
        tangentialSpeed / Math.max(2.55, orbiter.orbitRadius),
      -1.7,
      1.7,
    );
    kickable.gravity = false;
    kickable.velocity.set(0, 0, 0);
    kickable.platform = null;
    kickable.onPlatform = false;
    kickable.kickCooldown = 0.28;
    this.finishTurtleBoundTelekinesis(event);
    return true;
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

  private interactVoidTurtle(): void {
    const turtle = this.voidTurtle;
    if (!turtle) return;
    if (turtle.riding) {
      this.beginVoidTurtleReturn();
      return;
    }
    if (!turtle.awake) {
      this.hooks.onStatus(
        "The turtle sleeps on, limbs drifting in the dark. Its shell rises and falls in a very slow tide.",
      );
      return;
    }

    turtle.riding = true;
    turtle.ridePhase = "departing";
    turtle.phaseAge = 0;
    turtle.stationAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideTravel = 0;
    turtle.returnStartAngle = turtle.rideAngle;
    turtle.returnStartRadius = turtle.stationRadius;
    turtle.returnTargetAngle = turtle.rideAngle;
    turtle.dismountHeight = turtle.surface.heightAt(
      turtle.surface.x,
      turtle.surface.z,
    );
    this.resetVoidRideEffects(turtle);
    this.resetJump();
    this.activePlatform = turtle.surface;
    this.surfaceOffset = turtle.surface.heightAt(
      turtle.surface.x,
      turtle.surface.z,
    );
    this.playerPosition.set(turtle.surface.x, this.spawn.y, turtle.surface.z);
    this.updateInteractionLabel(
      turtle.interactionId,
      "Dismount at the current bearing",
    );
    this.hooks.onStatus(
      "The turtle answers your approach. The void bends into a slow orbit, and music arrives from somewhere beyond it.",
    );
    this.hooks.onTurtleMediaChange(true);
  }

  private wakeVoidTurtleFromThunder(range: number): boolean {
    const turtle = this.voidTurtle;
    if (
      this.currentZone !== "field" ||
      !turtle ||
      this.voidTurtleAwakened
    ) {
      return false;
    }
    const distance = Math.hypot(
      turtle.group.position.x - this.playerPosition.x,
      turtle.group.position.z - this.playerPosition.z,
    );
    const shellReach = 2.15;
    if (distance > range + shellReach) return false;

    this.voidTurtleAwakened = true;
    turtle.awake = true;
    turtle.eyes.visible = true;
    turtle.sleepEyes.visible = false;
    turtle.buckAge = 0;
    this.updateInteractionLabel(
      turtle.interactionId,
      "Greet the wakeful void turtle",
    );
    return true;
  }

  private pulseCapturedTurtleAsteroids(
    range: number,
    charge: number,
  ): number {
    const turtle = this.voidTurtle;
    if (this.currentZone !== "field" || !turtle) return 0;
    const distance = Math.hypot(
      turtle.group.position.x - this.playerPosition.x,
      turtle.group.position.z - this.playerPosition.z,
    );
    if (distance > range + 2.15) return 0;

    let pulsed = 0;
    for (const asteroid of this.turtleAsteroids) {
      if (!asteroid.collected || asteroid.kickable === this.heldKickable) {
        continue;
      }
      const stagger = (asteroid.index % 3) * 0.22;
      asteroid.radialVelocity = THREE.MathUtils.clamp(
        Math.max(
          asteroid.radialVelocity,
          4.15 + charge * 2.25 + stagger,
        ),
        -4.8,
        7.1,
      );
      const scatterDirection = asteroid.index % 2 === 0 ? 1 : -1;
      asteroid.orbitSpeed = THREE.MathUtils.clamp(
        asteroid.orbitSpeed +
          scatterDirection * (0.12 + charge * 0.18),
        -1.8,
        1.8,
      );
      asteroid.kickable.velocity.set(0, 0, 0);
      pulsed += 1;
    }
    return pulsed;
  }

  private beginVoidTurtleReturn(): void {
    const turtle = this.voidTurtle;
    if (!turtle?.riding) return;
    if (
      turtle.ridePhase === "returning" ||
      turtle.ridePhase === "dismounting"
    ) {
      this.hooks.onStatus(
        "Return vector already locked. Soft landing in progress.",
      );
      return;
    }

    turtle.ridePhase = "returning";
    turtle.phaseAge = 0;
    turtle.returnStartAngle = turtle.rideAngle;
    turtle.returnStartRadius = Math.hypot(
      turtle.group.position.x,
      turtle.group.position.z,
    );
    const returnDuration = this.reduceMotion ? 0.36 : voidTurtleReturnDuration;
    turtle.returnTargetAngle =
      turtle.returnStartAngle + (voidTurtleRideSpeed * returnDuration) / 2;
    this.updateInteractionLabel(
      turtle.interactionId,
      "Returning to the station…",
    );
    this.hooks.onStatus(
      "Return vector locked. The turtle arcs gently toward the platform; stay aboard for the soft landing.",
    );
  }

  private beginVoidTurtleDismount(turtle: VoidTurtleState): void {
    turtle.ridePhase = "dismounting";
    turtle.phaseAge = 0;
    turtle.stationAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideAngle = turtle.stationAngle;
    turtle.dismountStart.set(
      turtle.group.position.x,
      this.spawn.y,
      turtle.group.position.z,
    );
    const platformRadius = Math.max(0, turtle.stationRadius - 4.15);
    turtle.dismountTarget.set(
      Math.cos(turtle.stationAngle) * platformRadius,
      this.spawn.y,
      Math.sin(turtle.stationAngle) * platformRadius,
    );
    turtle.dismountHeight = turtle.surface.heightAt(
      turtle.surface.x,
      turtle.surface.z,
    );
    this.activePlatform = null;
    this.surfaceOffset = 0;
    this.resetJump();
    this.smoothedRotation = Math.atan2(
      turtle.dismountTarget.x - turtle.dismountStart.x,
      turtle.dismountTarget.z - turtle.dismountStart.z,
    );
    this.player.group.rotation.y = this.smoothedRotation;
    this.updateInteractionLabel(turtle.interactionId, "Stepping off…");
  }

  private completeVoidTurtleDismount(turtle: VoidTurtleState): void {
    turtle.riding = false;
    turtle.ridePhase = "parked";
    turtle.phaseAge = 0;
    turtle.rideTravel = 0;
    this.hooks.onTurtleMediaChange(false);
    turtle.group.position.x =
      Math.cos(turtle.stationAngle) * turtle.stationRadius;
    turtle.group.position.z =
      Math.sin(turtle.stationAngle) * turtle.stationRadius;
    turtle.group.rotation.y = Math.atan2(
      turtle.group.position.x,
      turtle.group.position.z,
    );
    turtle.surface.x = turtle.group.position.x;
    turtle.surface.z = turtle.group.position.z;
    const interaction = this.interactions.find(
      (candidate) => candidate.id === turtle.interactionId,
    );
    interaction?.position.set(turtle.surface.x, 0, turtle.surface.z);
    this.updateInteractionLabel(turtle.interactionId, "Ride the void turtle");
    this.playerPosition.copy(turtle.dismountTarget);
    this.player.group.rotation.y = this.smoothedRotation;
    this.activePlatform = null;
    this.surfaceOffset = 0;
    this.resetJump();
    this.shadowSurfaceY = 0.16;
    this.shadowVerticalDistance = 0;
    this.updateVoidRideEffects(turtle, 0);
    this.hooks.onStatus(
      "Soft landing. The turtle settles beside the station at this bearing and waits.",
    );
  }

  private updateVoidTurtle(delta: number): void {
    const turtle = this.voidTurtle;
    if (!turtle) return;
    const shouldBeAwake = this.voidTurtleAwakened || turtle.riding;
    if (shouldBeAwake !== turtle.awake) {
      turtle.awake = shouldBeAwake;
      turtle.eyes.visible = shouldBeAwake;
      turtle.sleepEyes.visible = !shouldBeAwake;
      if (!turtle.riding) {
        this.updateInteractionLabel(
          turtle.interactionId,
          shouldBeAwake
            ? "Greet the wakeful void turtle"
            : "Observe the sleeping void turtle",
        );
      }
    }
    const ambientMotionScale = this.reduceMotion ? 0.24 : 1;
    if (turtle.awake) {
      turtle.moonOrbit.rotation.y += delta * 0.22 * ambientMotionScale;
    }
    const finAmplitude =
      (turtle.riding
        ? turtle.ridePhase === "dismounting"
          ? 0.16
          : 0.34
        : turtle.awake
          ? 0.065
          : 0.018) * ambientMotionScale;
    const finSpeed = turtle.riding ? 3.4 : turtle.awake ? 1.25 : 0.72;
    for (const fin of turtle.fins) {
      const stroke = Math.sin(this.elapsed * finSpeed + fin.phase);
      fin.pivot.rotation.z = fin.side * stroke * finAmplitude;
      fin.pivot.rotation.x =
        Math.cos(this.elapsed * finSpeed * 0.82 + fin.phase) *
        finAmplitude *
        (fin.rear ? -0.14 : 0.1);
    }
    turtle.buckAge = Math.min(2, turtle.buckAge + delta);
    const buckProgress = Math.min(1, turtle.buckAge / 0.72);
    const buck = Math.sin(buckProgress * Math.PI) * (1 - buckProgress);
    turtle.group.rotation.x = -buck * 0.3;
    turtle.group.rotation.z = buck * 0.2;

    if (turtle.riding) {
      turtle.phaseAge += delta;
      let radius = Math.hypot(
        turtle.group.position.x,
        turtle.group.position.z,
      );

      if (turtle.ridePhase === "departing") {
        turtle.rideTravel += voidTurtleRideSpeed * delta;
        turtle.rideAngle = turtle.stationAngle + turtle.rideTravel;
        const duration = this.reduceMotion ? 0.36 : voidTurtleDepartureDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const eased = progress * progress * (3 - 2 * progress);
        radius =
          turtle.stationRadius + voidTurtleCruiseOffset * eased;
        if (progress >= 1) {
          turtle.ridePhase = "cruising";
          turtle.phaseAge = 0;
        }
      } else if (turtle.ridePhase === "cruising") {
        turtle.rideTravel += voidTurtleRideSpeed * delta;
        turtle.rideAngle = turtle.stationAngle + turtle.rideTravel;
        radius = turtle.stationRadius + voidTurtleCruiseOffset;
      } else if (turtle.ridePhase === "returning") {
        const duration = this.reduceMotion ? 0.36 : voidTurtleReturnDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const radialEase = progress * progress * (3 - 2 * progress);
        const angularEase = 1 - (1 - progress) * (1 - progress);
        turtle.rideAngle = THREE.MathUtils.lerp(
          turtle.returnStartAngle,
          turtle.returnTargetAngle,
          angularEase,
        );
        radius = THREE.MathUtils.lerp(
          turtle.returnStartRadius,
          turtle.stationRadius,
          radialEase,
        );
        if (progress >= 1) this.beginVoidTurtleDismount(turtle);
      }

      if (turtle.ridePhase !== "dismounting") {
        turtle.group.position.x = Math.cos(turtle.rideAngle) * radius;
        turtle.group.position.z = Math.sin(turtle.rideAngle) * radius;
        let turtleYaw = -turtle.rideAngle;
        if (turtle.ridePhase === "departing") {
          const parkedYaw = Math.atan2(
            Math.cos(turtle.stationAngle),
            Math.sin(turtle.stationAngle),
          );
          const targetYaw = -turtle.rideAngle;
          const yawDelta = Math.atan2(
            Math.sin(targetYaw - parkedYaw),
            Math.cos(targetYaw - parkedYaw),
          );
          const turnDuration = this.reduceMotion ? 0.18 : 0.82;
          const turnProgress = Math.min(1, turtle.phaseAge / turnDuration);
          const turnEase =
            turnProgress * turnProgress * (3 - 2 * turnProgress);
          turtleYaw = parkedYaw + yawDelta * turnEase;
        }
        turtle.group.rotation.y = turtleYaw;
        this.smoothedRotation = turtle.group.rotation.y;
        this.player.group.rotation.y = this.smoothedRotation;
        this.playerPosition.set(
          turtle.group.position.x,
          this.spawn.y,
          turtle.group.position.z,
        );
        this.activePlatform = turtle.surface;
        this.surfaceOffset = turtle.surface.heightAt(
          turtle.surface.x,
          turtle.surface.z,
        );
      } else {
        const duration = this.reduceMotion ? 0.36 : voidTurtleDismountDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const eased = progress * progress * (3 - 2 * progress);
        this.playerPosition.lerpVectors(
          turtle.dismountStart,
          turtle.dismountTarget,
          eased,
        );
        const shellHeight = turtle.surface.heightAt(
          turtle.surface.x,
          turtle.surface.z,
        );
        const groundHeight = THREE.MathUtils.lerp(shellHeight, 0, eased);
        const hop = Math.sin(progress * Math.PI) * (this.reduceMotion ? 0.08 : 0.5);
        turtle.dismountHeight = groundHeight + hop;
        this.shadowSurfaceY = THREE.MathUtils.lerp(
          shellHeight + 0.012,
          0.16,
          eased,
        );
        this.shadowVerticalDistance = Math.max(0, hop);

        const startYaw = -turtle.stationAngle;
        const targetYaw = Math.atan2(
          turtle.group.position.x,
          turtle.group.position.z,
        );
        const yawDelta = Math.atan2(
          Math.sin(targetYaw - startYaw),
          Math.cos(targetYaw - startYaw),
        );
        turtle.group.rotation.y = startYaw + yawDelta * eased;
        if (progress >= 1) this.completeVoidTurtleDismount(turtle);
      }

      turtle.surface.x = turtle.group.position.x;
      turtle.surface.z = turtle.group.position.z;
      const interaction = this.interactions.find(
        (candidate) => candidate.id === turtle.interactionId,
      );
      interaction?.position.set(turtle.surface.x, 0, turtle.surface.z);
      this.updateVoidRideEffects(turtle, delta);
      return;
    }

    turtle.surface.x = turtle.group.position.x;
    turtle.surface.z = turtle.group.position.z;
    this.updateVoidRideEffects(turtle, delta);
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
      }
      let spellSwarmBlend = 0;
      if (
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
      const scale = 0.72 + (index % 4) * 0.1;
      school.dummy.scale.setScalar(scale);
      school.dummy.updateMatrix();
      school.mesh.setMatrixAt(index, school.dummy.matrix);
      school.positions[index]?.copy(school.dummy.position);
      if (flying) {
        school.dummy.scale.setScalar(
          scale *
            (1.22 +
              Math.sin(motionTime * 2.7 + index * 1.4) * 0.12 +
              spellSwarmBlend * 0.18),
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
    this.tryFeedFishShard(school);
  }

  private updateFishBaitTarget(
    school: FishSchool,
    delta: number,
  ): RuneShard | null {
    const sources: Array<{
      broken: boolean;
      color: THREE.Color;
      shards: RuneShard[];
    }> = [
      ...this.runeStones.values(),
      ...this.ritualDecoys.values(),
    ];
    const isFishable = (shard: RuneShard): boolean => {
      const proxy = shard.proxy;
      const kickable = shard.kickable;
      return (
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
    const sources: Array<{
      broken: boolean;
      color: THREE.Color;
      shards: RuneShard[];
    }> = [
      ...this.runeStones.values(),
      ...this.ritualDecoys.values(),
    ];
    for (const source of sources) {
      if (!source.broken) continue;
      for (const shard of source.shards) {
        const proxy = shard.proxy;
        const kickable = shard.kickable;
        if (
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
        this.triggerCrystalTinkle(
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

  private createFallsRiver(parent: THREE.Group): void {
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

    createRibbon(this.materials.mossDark, 0.145, 0.3, "falls-riverbank");
    const water = createRibbon(
      this.materials.water,
      0.205,
      0,
      "falls-river-water",
    );
    water.renderOrder = 1;
  }

  private createBridge(parent: THREE.Group, x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    for (let index = -3; index <= 3; index += 1) {
      const plank = addBox(
        group,
        [1.1, 0.28, 2.9],
        [index * 1.05, 0.38, 0],
        this.materials.stone,
      );
      plank.castShadow = index % 2 === 0;
    }
    parent.add(group);
  }

  private createFallsParkour(parent: THREE.Group): void {
    const ledges = [
      [10.15, -4.25, 2.25, 1.72, 0.72],
      [9.25, -5.55, 2.08, 1.65, 1.38],
      [5.65, -6.65, 2.16, 1.72, 3.05],
      [2.68, -9.92, 1.9, 1.58, 4.82],
      [-2.68, -9.92, 1.9, 1.58, 4.95],
      [-5.7, -6.68, 2.16, 1.72, 3.48],
      [-9.25, -5.55, 2.08, 1.65, 1.58],
      [-10.2, -4.2, 2.25, 1.72, 0.78],
    ] as const;

    for (const [index, [x, z, width, depth, top]] of ledges.entries()) {
      const slab = addBox(
        parent,
        [width, 0.28, depth],
        [x, top - 0.14, z],
        index % 2 === 0 ? this.materials.stone : this.materials.moss,
      );
      slab.castShadow = false;
      const rootRadius = Math.min(width, depth) * 0.42;
      const root = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rootRadius, 0),
        this.materials.mossDark,
      );
      root.position.set(
        x + (index % 2 === 0 ? -0.08 : 0.08),
        Math.max(rootRadius * 0.68, top - 0.44),
        z,
      );
      root.scale.set(0.9, 0.68, 0.82);
      root.rotation.y = index * 0.61;
      root.castShadow = false;
      root.receiveShadow = true;
      parent.add(root);

      const routeMark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        index % 3 === 0 ? this.materials.amber : this.materials.parchment,
      );
      routeMark.position.set(
        x + (index % 2 === 0 ? -width * 0.24 : width * 0.24),
        top + 0.12,
        z,
      );
      routeMark.rotation.y = index * 0.7;
      routeMark.castShadow = false;
      parent.add(routeMark);

      this.registerClimbableBox(
        slab,
        `falls-parkour-ledge-${index}`,
      );
    }

    const summitMark = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.41, 18),
      this.materials.parchment,
    );
    summitMark.position.set(0, 5.825, -10.1);
    summitMark.rotation.x = -Math.PI / 2;
    summitMark.castShadow = false;
    summitMark.receiveShadow = true;
    parent.add(summitMark);
  }

  private createFallsVegetation(parent: THREE.Group): void {
    const trees = [
      [-12.1, -8.8, 1.08],
      [12.05, -9.05, 1.02],
      [-12.55, 5.15, 0.96],
      [12.35, 5.45, 1.06],
      [-9.8, 9.85, 1.02],
      [9.9, 9.65, 0.94],
      [-4.9, 12.2, 0.88],
      [4.95, 12.05, 0.92],
      [-13.05, -1.5, 0.9],
      [13, -1.35, 0.94],
    ] as const;
    const treeCount =
      this.quality === "low" ? 6 : this.quality === "medium" ? 8 : trees.length;
    for (const [index, [x, z, scale]] of trees.slice(0, treeCount).entries()) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = index * 0.73;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.16 * scale,
          0.27 * scale,
          1.85 * scale,
          6,
        ),
        this.materials.wood,
      );
      trunk.position.y = 0.92 * scale;
      trunk.rotation.z = (index % 2 === 0 ? -1 : 1) * 0.055;
      trunk.castShadow = false;
      trunk.receiveShadow = true;
      group.add(trunk);

      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.07 * scale,
          0.11 * scale,
          0.92 * scale,
          5,
        ),
        this.materials.wood,
      );
      branch.position.set(
        (index % 2 === 0 ? -0.28 : 0.28) * scale,
        1.43 * scale,
        0,
      );
      branch.rotation.z = (index % 2 === 0 ? -1 : 1) * 0.92;
      branch.castShadow = false;
      group.add(branch);

      for (const [layer, [radius, y, material]] of (
        [
          [0.88, 1.75, this.materials.mossDark],
          [0.72, 2.42, this.materials.moss],
        ] as const
      ).entries()) {
        const crown = new THREE.Mesh(
          new THREE.DodecahedronGeometry(radius * scale, 0),
          material,
        );
        crown.position.set(
          (layer === 0 ? -0.12 : 0.15) * scale,
          y * scale,
          (index % 3 - 1) * 0.08,
        );
        crown.scale.set(1.05, layer === 0 ? 0.78 : 0.9, 0.94);
        crown.rotation.set(0.08 * layer, index * 0.37, -0.05 * index);
        crown.castShadow = false;
        crown.receiveShadow = true;
        group.add(crown);
      }
      parent.add(group);
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
      group.updateWorldMatrix(true, true);
      this.tempBounds.setFromObject(group);
      const crownTop = this.tempBounds.max.y;
      this.tempWorld
        .set(
          0.15 * scale,
          0,
          (index % 3 - 1) * 0.08,
        )
        .applyMatrix4(group.matrixWorld);
      this.surfaceAreas.push({
        id: `falls-tree-crown-${index}`,
        x: this.tempWorld.x,
        z: this.tempWorld.z,
        halfWidth: 0.48 * scale,
        halfDepth: 0.48 * scale,
        requiresJump: true,
        supportMargin: 0.08,
        edgeGrace: 0.1,
        heightAt: () => crownTop,
      });
    }

    const bushes = [
      [-10.3, -6.2],
      [10.4, -6.1],
      [-11.9, -3.2],
      [11.8, -3.1],
      [-10.5, 6.9],
      [10.8, 7.4],
      [-7.8, 10.3],
      [7.7, 10.25],
      [-3.8, 8.7],
      [7.05, 9.05],
      [-6.4, 1.1],
      [5.2, 2.9],
      [-8.1, -11.2],
      [8.2, -11.35],
      [-12.8, 1.6],
      [12.7, 1.5],
      [-4.7, -6.7],
      [4.9, -6.2],
    ] as const;
    const bushCount =
      this.quality === "low" ? 10 : this.quality === "medium" ? 14 : bushes.length;
    for (const [index, [x, z]] of bushes.slice(0, bushCount).entries()) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      for (let lobe = 0; lobe < 3; lobe += 1) {
        const radius = 0.34 + ((index + lobe) % 3) * 0.07;
        const leaf = new THREE.Mesh(
          new THREE.DodecahedronGeometry(radius, 0),
          (index + lobe) % 2 === 0
            ? this.materials.moss
            : this.materials.mossDark,
        );
        leaf.position.set(
          (lobe - 1) * 0.34,
          0.28 + (lobe % 2) * 0.13,
          Math.sin(index + lobe) * 0.22,
        );
        leaf.scale.y = 0.7;
        leaf.rotation.y = index * 0.4 + lobe;
        leaf.castShadow = false;
        leaf.receiveShadow = true;
        group.add(leaf);
      }
      parent.add(group);
    }

    const vines = [
      [-6, 4.25, -7.22, 2.9, -0.18],
      [6, 3.65, -7.22, 2.1, 0.1],
      [-4.7, 4.15, -7.2, 2.2, 0.12],
      [4.7, 3.72, -7.2, 2.7, -0.16],
      [-3.3, 4.1, -7.22, 2.6, -0.1],
      [3.3, 3.75, -7.22, 2.2, 0.12],
      [-1.75, 5.6, -8.72, 3.6, 0.15],
      [1.75, 5.5, -8.72, 3.2, -0.18],
    ] as const;
    const vineCount =
      this.quality === "low" ? 4 : this.quality === "medium" ? 6 : vines.length;
    for (const [index, [x, topY, z, length, lean]] of vines
      .slice(0, vineCount)
      .entries()) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
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

  private createWaterfall(
    parent: THREE.Group,
    x: number,
    z: number,
    height: number,
    hasCave = false,
  ): void {
    const group = new THREE.Group();
    group.name = hasCave
      ? "falls-central-waterfall"
      : `falls-side-waterfall-${x}`;
    group.position.set(x, 0, z);

    if (hasCave) {
      // The cave shell is visually assembled from several boxes, but its crown
      // is one continuous route. Let an ascending player clear those vertical
      // colliders shortly before reaching the roof instead of requiring their
      // feet to match several adjacent top planes to the millimetre.
      const summitCollisionClearAbove = height + 0.15;
      for (const side of [-1, 1]) {
        const cavePillar = addBox(
          group,
          [1.1, height + 0.8, 2.5],
          [side * 1.55, (height + 0.8) / 2, -0.6],
          this.materials.moss,
        );
        cavePillar.castShadow = false;
        this.registerClimbableBox(
          cavePillar,
          null,
          undefined,
          summitCollisionClearAbove,
        );
      }
      const caveCap = addBox(
        group,
        [2.1, 1.1, 2.5],
        [0, height + 0.25, -0.6],
        this.materials.moss,
      );
      caveCap.castShadow = false;
      this.registerClimbableBox(
        caveCap,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      this.surfaceAreas.push({
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
        [0, 0.14, -1.55],
        this.materials.darkStone,
      );
      caveFloor.castShadow = false;
      const caveBack = addBox(
        group,
        [4.2, height + 0.8, 0.38],
        [0, (height + 0.8) / 2, -3.38],
        this.materials.moss,
      );
      caveBack.castShadow = false;
      this.registerClimbableBox(
        caveBack,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      for (const side of [-1, 1] as const) {
        const sideWall = addBox(
          group,
          [1.1, height + 0.8, 1.36],
          [side * 1.55, (height + 0.8) / 2, -2.52],
          this.materials.moss,
        );
        sideWall.castShadow = false;
        this.registerClimbableBox(
          sideWall,
          null,
          undefined,
          summitCollisionClearAbove,
        );
      }
      const rearRoof = addBox(
        group,
        [2.1, 0.32, 1.36],
        [0, height + 0.64, -2.52],
        this.materials.moss,
      );
      rearRoof.castShadow = false;
      this.registerClimbableBox(
        rearRoof,
        null,
        undefined,
        summitCollisionClearAbove,
      );
      this.surfaceAreas.push({
        id: "falls-cave-floor",
        x,
        z: z - 1.55,
        halfWidth: 1.03,
        halfDepth: 1.98,
        requiresJump: false,
        heightAt: () => 0.23,
      });
    } else {
      const cliff = addBox(
        group,
        [4.2, height + 0.8, 2.5],
        [0, (height + 0.8) / 2, -0.6],
        this.materials.moss,
      );
      cliff.castShadow = true;
      this.registerClimbableBox(
        cliff,
        `falls-waterfall-crown-${x}`,
      );
    }

    if (hasCave) {
      for (const side of [-1, 1] as const) {
        const material = new THREE.MeshBasicMaterial({
          color: palette.water,
          transparent: true,
          opacity: 0.78,
          // The player reveal material reads scene depth, so the parted
          // waterfall halves must contribute depth before that later pass.
          depthWrite: true,
          side: THREE.DoubleSide,
        });
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.16, height),
          material,
        );
        panel.position.set(side * 0.575, height / 2, 0.68);
        panel.userData.side = side;
        group.add(panel);
        this.puzzleWaterfallPanels.push(panel);
        this.registerPlayerOccluder(panel);
      }
    } else {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, height),
        this.materials.water,
      );
      water.position.set(0, height / 2, 0.68);
      group.add(water);
      this.registerPlayerOccluder(water);
      this.animatedItems.push({
        object: water,
        originY: water.position.y,
        phase: x,
        amplitude: 0.035,
        rotationSpeed: 0,
      });
    }
    parent.add(group);
  }

  private createHiddenChest(parent: THREE.Group, x: number, z: number): void {
    const chest = new THREE.Group();
    chest.position.set(x, 0, z);
    addBox(chest, [1.55, 0.66, 1], [0, 0.38, 0], this.materials.wood);
    addBox(
      chest,
      [1.68, 0.12, 1.08],
      [0, 0.18, 0],
      this.materials.brass,
    ).castShadow = false;
    addBox(
      chest,
      [0.15, 0.68, 1.08],
      [0, 0.42, 0],
      this.materials.brass,
    ).castShadow = false;

    const lid = new THREE.Group();
    lid.position.set(0, 0.72, -0.45);
    addBox(lid, [1.62, 0.32, 1.02], [0, 0.15, 0.45], this.materials.wood);
    addBox(
      lid,
      [0.16, 0.38, 1.08],
      [0, 0.16, 0.45],
      this.materials.brass,
    ).castShadow = false;
    chest.add(lid);
    this.chestLid = lid;

    const prize = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.27, 0),
      this.materials.amber,
    );
    prize.position.y = 1.18;
    prize.visible = false;
    chest.add(prize);
    this.chestPrize = prize;
    this.animatedItems.push({
      object: prize,
      originY: prize.position.y,
      phase: 4,
      amplitude: 0.13,
      rotationSpeed: 0.85,
    });

    const maximumCoins = 18;
    const coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8),
      this.materials.amber,
      maximumCoins,
    );
    coins.count = this.quality === "low" ? 10 : maximumCoins;
    coins.visible = false;
    coins.frustumCulled = false;
    coins.renderOrder = 5;
    chest.add(coins);
    const burstLight = new THREE.PointLight(palette.amber, 0, 8, 2);
    burstLight.position.set(0, 1.2, 0);
    burstLight.castShadow = false;
    burstLight.visible = false;
    chest.add(burstLight);
    this.chestBurst = {
      coins,
      light: burstLight,
      dummy: new THREE.Object3D(),
      velocities: new Float32Array(maximumCoins * 3),
      age: 3,
      count: coins.count,
    };
    parent.add(chest);
  }

  private openHiddenChest(): void {
    if (!this.chestLid || !this.chestPrize) return;
    if (!this.fantasyPuzzleSolved) {
      this.hooks.onStatus(
        "The lid does not move. Beneath the wet wood, three faint harmonics answer and fade.",
      );
      return;
    }
    if (this.chestOpened) {
      this.hooks.onStatus(
        "The coin rain has settled. The recovered signal still reads: keep exploring.",
      );
      return;
    }
    this.chestOpened = true;
    this.chestLid.rotation.x = -1.02;
    this.chestPrize.visible = true;
    this.triggerChestBurst();
    this.updateInteractionLabel("waterfall-chest", "Inspect open chest");
    const surgeUnlocked = this.highestSpellStage === "spark";
    if (surgeUnlocked) this.grantSpellStage("surge");
    const rewards = this.reconcileChallengeRewards();
    this.hooks.onStatus(
      `Cache opened: coins, warm light, and one improbably dry checksum erupt from the falls.${
        rewards.thunderReady
          ? " Surge catches both completed circuits. An amber summons points back toward the Daemon Controller."
          : surgeUnlocked
            ? ` The dry signal dissolves into violet rain. Spark deepens into Surge.${
                rewards.packetUnlocked
                  ? " An Archive fault follows it into the spell."
                  : ""
              }`
            : rewards.packetUnlocked
              ? " An Archive fault follows the recovered signal into the spell."
              : ""
      }`,
      { kind: "achievement", title: "DRY SPELL" },
    );
  }

  private triggerChestBurst(): void {
    const burst = this.chestBurst;
    if (!burst) return;
    burst.age = 0;
    burst.count = this.quality === "low" ? 10 : 18;
    burst.coins.count = burst.count;
    burst.coins.visible = true;
    burst.light.visible = true;
    burst.light.intensity = 13;
    for (let index = 0; index < burst.count; index += 1) {
      const angle = index * 2.39996 + 0.35;
      const speed = 0.85 + (index % 5) * 0.18;
      burst.velocities[index * 3] = Math.cos(angle) * speed;
      burst.velocities[index * 3 + 1] = 3.5 + (index % 4) * 0.52;
      burst.velocities[index * 3 + 2] = Math.sin(angle) * speed;
    }
  }

  private updateChestBurst(delta: number): void {
    const burst = this.chestBurst;
    if (!burst || burst.age >= 2.2) return;
    burst.age += delta;
    const time = burst.age;
    const fade = THREE.MathUtils.clamp(1 - time / 2.2, 0, 1);
    for (let index = 0; index < burst.count; index += 1) {
      const velocityX = burst.velocities[index * 3] ?? 0;
      const velocityY = burst.velocities[index * 3 + 1] ?? 0;
      const velocityZ = burst.velocities[index * 3 + 2] ?? 0;
      const floorY = 0.23 + (index % 3) * 0.025;
      const y = Math.max(
        floorY,
        1.05 + velocityY * time - 4.9 * time * time,
      );
      burst.dummy.position.set(
        velocityX * time,
        y,
        velocityZ * time,
      );
      burst.dummy.rotation.set(
        time * (5 + (index % 4)),
        index * 0.7 + time * 3,
        time * 7,
      );
      burst.dummy.scale.setScalar(
        fade < 0.22 ? fade / 0.22 : 1,
      );
      burst.dummy.updateMatrix();
      burst.coins.setMatrixAt(index, burst.dummy.matrix);
    }
    burst.coins.instanceMatrix.needsUpdate = true;
    burst.light.intensity =
      fade * (7 + Math.max(0, Math.sin(time * 18)) * 6);
    if (burst.age >= 2.2) {
      burst.coins.visible = false;
      burst.light.intensity = 0;
      burst.light.visible = false;
    }
  }

  private createCaveSeal(parent: THREE.Group, x: number, z: number): void {
    const seal = new THREE.Group();
    seal.position.set(x, 0, z);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: palette.violet,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.93, 24), coreMaterial);
    core.position.y = 1.22;
    seal.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.08, 5, 24),
      this.materials.violet,
    );
    ring.position.y = 1.22;
    seal.add(ring);
    parent.add(seal);
    this.caveSeal = seal;
    // Block the unsolved cave entrance only across the seal's visible height;
    // the waterfall crown above it must remain traversable.
    this.caveSealCollider = this.addStaticBox(
      x,
      1.22,
      z,
      0.92,
      1.22,
      0.16,
      2.44,
    );
  }

  private createRuneEffects(parent: THREE.Group): void {
    const maximumCount = 36;
    const positions = new Float32Array(maximumCount * 3);
    const velocities = new Float32Array(maximumCount * 3);
    const ages = new Float32Array(maximumCount);
    const lifetimes = new Float32Array(maximumCount);
    const colors = new Float32Array(maximumCount * 3);
    ages.fill(-1);
    for (let index = 0; index < maximumCount; index += 1) {
      positions[index * 3 + 1] = -100;
    }
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: this.quality === "low" ? 0.1 : this.quality === "medium" ? 0.13 : 0.15,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
      }),
    );
    points.name = "rune-tinkle-pool";
    points.frustumCulled = false;
    points.renderOrder = 5;
    parent.add(points);
    this.runeSparkles = {
      points,
      positions,
      velocities,
      ages,
      lifetimes,
      cursor: 0,
      maximumCount,
    };

    this.runeTinkleLight = new THREE.PointLight(palette.cyan, 0, 4.8, 2);
    this.runeTinkleLight.name = "rune-tinkle-light";
    this.runeTinkleLight.castShadow = false;
    parent.add(this.runeTinkleLight);
    this.runeTinkleAge = 2;
    this.runeTinklePeakIntensity = 0;

    // Three named runes always participate. Broken decoys may be appended to
    // the route, so retain enough vertices for all six physical clusters.
    const tracePointCount = 73;
    const tracePositions = new Float32Array(tracePointCount * 3);
    const traceGeometry = new THREE.BufferGeometry();
    const tracePositionAttribute = new THREE.BufferAttribute(tracePositions, 3);
    tracePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    traceGeometry.setAttribute("position", tracePositionAttribute);
    traceGeometry.setDrawRange(0, 0);
    const tracePath = new THREE.Line(
      traceGeometry,
      new THREE.LineBasicMaterial({
        color: palette.violet,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    tracePath.name = "terminal-rune-trace";
    tracePath.visible = false;
    tracePath.frustumCulled = false;
    tracePath.renderOrder = 5;
    parent.add(tracePath);

    const tracePacket = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      this.materials.cyan,
    );
    tracePacket.name = "terminal-rune-packet";
    tracePacket.visible = false;
    tracePacket.castShadow = false;
    tracePacket.renderOrder = 5;
    parent.add(tracePacket);
    this.runeDiagnosticTrace = {
      path: tracePath,
      packet: tracePacket,
      positions: tracePositions,
      targets: [],
      pointCount: 0,
      age: 3,
      duration: 2.75,
      nextTargetIndex: 0,
      active: false,
    };
  }

  private createRitualCrystalCache(
    parent: THREE.Group,
    x: number,
    z: number,
  ): SurfaceArea {
    const base = addBox(
      parent,
      [4.7, 0.24, 3.25],
      [x, 0.12, z],
      this.materials.darkStone,
    );
    base.castShadow = false;
    const deck = addBox(
      parent,
      [4.38, 0.07, 2.93],
      [x, 0.275, z],
      this.materials.mossDark,
    );
    deck.castShadow = false;

    for (const [offsetX, offsetZ] of [
      [-2.08, -1.36],
      [2.08, -1.36],
      [-2.08, 1.36],
      [2.08, 1.36],
    ] as const) {
      const marker = addCylinder(
        parent,
        0.12,
        0.16,
        0.38,
        6,
        [x + offsetX, 0.42, z + offsetZ],
        this.materials.brass,
      );
      marker.castShadow = false;
    }

    const cacheRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.68, 0.045, 4, 30),
      this.materials.violet,
    );
    cacheRing.position.set(x, 0.33, z);
    cacheRing.rotation.x = Math.PI / 2;
    cacheRing.scale.y = 0.68;
    cacheRing.castShadow = false;
    parent.add(cacheRing);

    const surface: SurfaceArea = {
      id: "ritual-crystal-cache",
      x,
      z,
      halfWidth: 2.18,
      halfDepth: 1.46,
      requiresJump: false,
      heightAt: () => 0.32,
    };
    this.surfaceAreas.push(surface);
    this.addInteraction(
      "ritual-crystal-cache",
      "Inspect crystal cache",
      x,
      z,
      3,
      () => this.inspectRitualCrystalCache(surface),
    );
    return surface;
  }

  private inspectRitualCrystalCache(cache: SurfaceArea): void {
    let inside = 0;
    let socketed = 0;
    let displaced = 0;
    let shattered = 0;

    for (const carry of this.ritualCrystals) {
      const broken =
        carry.affinity !== null
          ? (this.runeStones.get(carry.affinity)?.broken ?? false)
          : (this.ritualDecoys.get(carry.id)?.broken ?? false);
      if (broken) {
        shattered += 1;
        continue;
      }
      if (carry.socketedAt !== null) {
        socketed += 1;
        continue;
      }
      const withinCache =
        Math.abs(carry.object.position.x - cache.x) <= cache.halfWidth &&
        Math.abs(carry.object.position.z - cache.z) <= cache.halfDepth;
      if (withinCache) inside += 1;
      else displaced += 1;
    }

    if (inside === this.ritualCrystals.length) {
      this.hooks.onStatus(
        "Six crystal clusters rest inside the violet boundary. Water has softened every edge; their colours remain stubbornly distinct.",
      );
      return;
    }

    const observations = [
      inside === 0
        ? "The violet boundary stands empty."
        : `${inside} intact crystal cluster${inside === 1 ? "" : "s"} remain${inside === 1 ? "s" : ""} inside the violet boundary.`,
    ];
    if (socketed > 0) {
      observations.push(
        `${socketed} ${socketed === 1 ? "rests" : "rest"} in the old sockets.`,
      );
    }
    if (displaced > 0) {
      observations.push(
        `${displaced} intact cluster${displaced === 1 ? " lies" : "s lie"} beyond the cache.`,
      );
    }
    if (shattered > 0) {
      observations.push(
        `${shattered} cluster${shattered === 1 ? " survives" : "s survive"} only as loose facets.`,
      );
    }
    this.hooks.onStatus(observations.join(" "));
  }

  private createRuneSocket(
    parent: THREE.Group,
    id: RuneId,
    x: number,
    z: number,
    colorValue: THREE.ColorRepresentation,
  ): void {
    const group = new THREE.Group();
    group.name = `rune-socket-${id}`;
    group.position.set(x, 0, z);

    const base = addCylinder(
      group,
      0.92,
      1.08,
      0.18,
      14,
      [0, 0.12, 0],
      this.materials.darkStone,
    );
    base.castShadow = false;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.73, 0.07, 5, 24),
      this.materials.parchment,
    );
    ring.position.y = 0.24;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    group.add(ring);

    const socketColor = new THREE.Color(colorValue);
    const dormantColor = new THREE.Color(0x747c78);
    const symbolMaterial = new THREE.MeshBasicMaterial({
      color: dormantColor,
      toneMapped: false,
    });
    const symbol = new THREE.Group();
    symbol.position.y = 0.265;
    const addInlay = (
      shape: THREE.Shape,
      material: THREE.Material = symbolMaterial,
      y = 0,
    ): THREE.Mesh => {
      const inlay = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
      inlay.position.y = y;
      inlay.rotation.x = -Math.PI / 2;
      inlay.castShadow = false;
      inlay.receiveShadow = false;
      symbol.add(inlay);
      return inlay;
    };

    if (id === "moon") {
      const crescentPoints: THREE.Vector2[] = [];
      const outerStart = 1.124;
      const outerEnd = Math.PI * 2 - outerStart;
      for (let point = 0; point <= 22; point += 1) {
        const angle =
          outerStart + (outerEnd - outerStart) * (point / 22);
        crescentPoints.push(
          new THREE.Vector2(Math.cos(angle) * 0.46, Math.sin(angle) * 0.46),
        );
      }
      const innerStart = 4.838;
      const innerEnd = 1.445;
      for (let point = 0; point <= 18; point += 1) {
        const angle =
          innerStart + (innerEnd - innerStart) * (point / 18);
        crescentPoints.push(
          new THREE.Vector2(
            0.14 + Math.cos(angle) * 0.4,
            Math.sin(angle) * 0.4,
          ),
        );
      }
      addInlay(new THREE.Shape(crescentPoints));
    } else if (id === "tide") {
      for (const row of [-0.25, 0, 0.25]) {
        const upper: THREE.Vector2[] = [];
        const lower: THREE.Vector2[] = [];
        for (let point = 0; point <= 18; point += 1) {
          const progress = point / 18;
          const waveY =
            row + Math.sin(progress * Math.PI * 2) * 0.075;
          const x = THREE.MathUtils.lerp(-0.54, 0.54, progress);
          upper.push(new THREE.Vector2(x, waveY + 0.045));
          lower.unshift(new THREE.Vector2(x, waveY - 0.045));
        }
        addInlay(new THREE.Shape([...upper, ...lower]));
      }
    } else {
      const flame = new THREE.Shape();
      flame.moveTo(0, 0.52);
      flame.bezierCurveTo(-0.08, 0.3, -0.37, 0.12, -0.35, -0.17);
      flame.bezierCurveTo(-0.33, -0.41, -0.17, -0.52, 0.01, -0.52);
      flame.bezierCurveTo(0.27, -0.52, 0.4, -0.33, 0.36, -0.08);
      flame.bezierCurveTo(0.33, 0.1, 0.23, 0.23, 0.2, 0.35);
      flame.bezierCurveTo(0.11, 0.2, 0.07, 0.07, 0.02, -0.02);
      flame.bezierCurveTo(-0.03, 0.14, 0.04, 0.35, 0, 0.52);
      flame.closePath();
      addInlay(flame);

      const innerFlame = new THREE.Shape();
      innerFlame.moveTo(0.02, 0.08);
      innerFlame.bezierCurveTo(-0.13, -0.08, -0.14, -0.28, 0, -0.34);
      innerFlame.bezierCurveTo(0.15, -0.3, 0.18, -0.11, 0.02, 0.08);
      innerFlame.closePath();
      addInlay(innerFlame, this.materials.darkStone, 0.008);
    }
    group.add(symbol);

    const identityStone = addBox(
      group,
      [0.17, 0.54, 0.17],
      [0, 0.34, -1.02],
      this.materials.brass,
    );
    identityStone.castShadow = false;
    const identityGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      symbolMaterial,
    );
    identityGem.position.set(0, 0.7, -1.02);
    group.add(identityGem);

    const rootShards: RuneSocketRoot[] = [
      {
        position: new THREE.Vector3(-0.5, 0.33, -0.28),
        rotation: new THREE.Euler(-0.18, 0.2, -0.45),
        scale: new THREE.Vector3(0.14, 0.48, 0.14),
      },
      {
        position: new THREE.Vector3(0.47, 0.26, -0.36),
        rotation: new THREE.Euler(0.15, -0.4, 0.42),
        scale: new THREE.Vector3(0.12, 0.34, 0.12),
      },
      {
        position: new THREE.Vector3(-0.58, 0.22, 0.26),
        rotation: new THREE.Euler(0.2, 0.1, -0.6),
        scale: new THREE.Vector3(0.11, 0.3, 0.11),
      },
      {
        position: new THREE.Vector3(0.55, 0.31, 0.2),
        rotation: new THREE.Euler(-0.16, 0.8, 0.52),
        scale: new THREE.Vector3(0.14, 0.43, 0.14),
      },
      {
        position: new THREE.Vector3(-0.18, 0.23, 0.56),
        rotation: new THREE.Euler(0.55, 0.2, -0.12),
        scale: new THREE.Vector3(0.1, 0.28, 0.1),
      },
      {
        position: new THREE.Vector3(0.18, 0.28, 0.52),
        rotation: new THREE.Euler(0.46, -0.5, 0.14),
        scale: new THREE.Vector3(0.12, 0.36, 0.12),
      },
      {
        position: new THREE.Vector3(0, 0.22, -0.58),
        rotation: new THREE.Euler(-0.55, 0.3, 0.05),
        scale: new THREE.Vector3(0.11, 0.31, 0.11),
      },
    ];
    const rootMaterial = new THREE.MeshStandardMaterial({
      color: socketColor.clone().multiplyScalar(0.76),
      emissive: socketColor,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.08,
      flatShading: true,
    });
    const roots = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      rootMaterial,
      rootShards.length,
    );
    roots.name = `rune-socket-roots-${id}`;
    roots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    roots.frustumCulled = false;
    roots.castShadow = false;
    roots.visible = false;
    group.add(roots);

    parent.add(group);
    this.runeSockets.set(id, {
      id,
      position: new THREE.Vector3(x, 0, z),
      color: socketColor,
      dormantColor,
      symbolMaterial,
      roots,
      rootShards,
      dummy: new THREE.Object3D(),
      reveal: 0,
      revealUntil: 0,
      growth: 0,
    });
  }

  private createRitualCrystalShadow(
    parent: THREE.Group,
    color: THREE.Color,
  ): Pick<RitualCrystalCarry, "shadow" | "shadowRing"> {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 24),
      new THREE.MeshBasicMaterial({
        color: 0x020707,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    shadow.name = "ritual-crystal-shadow";
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;
    parent.add(shadow);

    const shadowRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.66, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    shadowRing.name = "ritual-crystal-placement-ring";
    shadowRing.rotation.x = -Math.PI / 2;
    shadowRing.renderOrder = 2;
    parent.add(shadowRing);
    return { shadow, shadowRing };
  }

  private createRitualDecoyCrystal(
    parent: THREE.Group,
    id: string,
    x: number,
    z: number,
    material: THREE.Material,
    cache: SurfaceArea,
  ): void {
    const color =
      "color" in material && material.color instanceof THREE.Color
        ? material.color
        : new THREE.Color(palette.green);
    const group = new THREE.Group();
    group.name = `ritual-decoy-${id}`;
    group.position.set(x, cache.heightAt(x, z), z);
    group.userData.upright = true;
    const cluster = new THREE.Group();
    cluster.name = `ritual-decoy-cluster-${id}`;
    cluster.rotation.y = (id.length % 3 - 1) * 0.09;
    group.add(cluster);

    const facetMaterial = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.78),
      emissive: color,
      emissiveIntensity: 0.62,
      roughness: 0.28,
      metalness: 0.08,
      flatShading: true,
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const facets = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      facetMaterial,
      runeCrystalShardTemplates.length,
    );
    const inner = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      innerMaterial,
      runeCrystalShardTemplates.length,
    );
    const dummy = new THREE.Object3D();
    for (const [index, shard] of runeCrystalShardTemplates.entries()) {
      dummy.position.set(shard.origin[0], shard.origin[1], shard.origin[2]);
      dummy.rotation.set(
        shard.rotation[0],
        shard.rotation[1],
        shard.rotation[2],
      );
      dummy.scale.set(shard.scale[0], shard.scale[1], shard.scale[2]);
      dummy.updateMatrix();
      facets.setMatrixAt(index, dummy.matrix);
      dummy.scale.multiplyScalar(0.58);
      dummy.updateMatrix();
      inner.setMatrixAt(index, dummy.matrix);
    }
    facets.castShadow = false;
    facets.frustumCulled = false;
    inner.castShadow = false;
    inner.frustumCulled = false;
    inner.renderOrder = 3;
    cluster.add(facets, inner);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 10, 7),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    aura.position.y = 1.02;
    aura.scale.y = 1.42;
    aura.renderOrder = 2;
    cluster.add(aura);

    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.17;
    groundGlow.renderOrder = 2;
    group.add(groundGlow);

    const crackGeometry = new THREE.BufferGeometry();
    crackGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.13, 0.52, 0.29, 0.04, 0.78, 0.3,
          0.04, 0.78, 0.3, -0.09, 1.02, 0.27,
          -0.09, 1.02, 0.27, 0.08, 1.28, 0.21,
          0.13, 0.6, 0.27, 0.24, 0.82, 0.21,
          -0.34, 0.47, 0.18, -0.23, 0.68, 0.2,
        ],
        3,
      ),
    );
    const cracks = new THREE.LineSegments(
      crackGeometry,
      new THREE.LineBasicMaterial({
        color: 0xfff1c8,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cracks.visible = false;
    cracks.renderOrder = 5;
    group.add(cracks);

    this.animatedItems.push({
      object: cluster,
      originY: 0,
      phase: id.length * 0.71,
      amplitude: 0.018,
      rotationSpeed: 0.035,
    });
    parent.add(group);
    const kickable = this.registerKickable(
      group,
      0.64,
      0.16,
      cache,
      true,
      null,
      0.91,
      "",
    );
    const { shadow, shadowRing } = this.createRitualCrystalShadow(parent, color);
    const carry: RitualCrystalCarry = {
      id,
      affinity: null,
      object: group,
      kickable,
      shadow,
      shadowRing,
      origin: group.position.clone(),
      socketedAt: null,
      shatteredAtSocket: null,
      impactCooldownUntil: 0,
    };
    this.ritualCrystals.push(carry);

    const shards: RuneShard[] = runeCrystalShardTemplates.map((shard) => ({
      origin: new THREE.Vector3(...shard.origin),
      scale: new THREE.Vector3(...shard.scale),
      rotation: new THREE.Euler(...shard.rotation),
      velocity: new THREE.Vector3(...shard.velocity),
      spin: new THREE.Vector3(...shard.spin),
      proxy: null,
      kickable: null,
      consumed: false,
      fishBaitAge: 0,
    }));
    const proxyGeometry = new THREE.OctahedronGeometry(1, 0);
    const proxyMaterial = facetMaterial.clone();
    for (const [index, shard] of shards.entries()) {
      const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
      proxy.name = `ritual-decoy-shard-${id}-${index}`;
      proxy.position.set(
        group.position.x + shard.origin.x,
        group.position.y + shard.origin.y,
        group.position.z + shard.origin.z,
      );
      proxy.rotation.copy(shard.rotation);
      proxy.scale.copy(shard.scale);
      proxy.visible = false;
      proxy.castShadow = false;
      parent.add(proxy);
      const shardKickable = this.registerKickable(
        proxy,
        Math.max(shard.scale.x, shard.scale.z) + 0.08,
        0.16,
        null,
        true,
        null,
        0.93,
        "",
      );
      shardKickable.enabled = false;
      shard.proxy = proxy;
      shard.kickable = shardKickable;
    }

    const state: RitualDecoyCrystalState = {
      id,
      carry,
      group,
      facets,
      inner,
      aura,
      groundGlow,
      cracks,
      shards,
      color,
      hits: 0,
      pulseAge: 2,
      breakAge: 2,
      broken: false,
    };
    this.ritualDecoys.set(id, state);
    const interaction = this.addInteraction(
      `ritual-crystal-${id}`,
      "Touch loose crystal",
      x,
      z,
      1.55,
      () => this.soundLooseDecoyCrystal(id),
    );
    interaction.isAvailable = () =>
      carry.socketedAt === null &&
      (!state.broken ||
        this.getRitualCrystalAnchorShard(carry) !== null);
  }

  private createRuneCrystal(
    parent: THREE.Group,
    id: RuneId,
    label: string,
    sourceX: number,
    sourceZ: number,
    socketX: number,
    socketZ: number,
    colorValue: THREE.ColorRepresentation,
    cache: SurfaceArea,
  ): RuneCrystalState {
    const color = new THREE.Color(colorValue);
    const group = new THREE.Group();
    group.name = `rune-crystal-${id}`;
    group.position.set(sourceX, cache.heightAt(sourceX, sourceZ), sourceZ);
    group.userData.upright = true;
    group.userData.ritualCrystalId = id;

    const facetMaterial = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.78),
      emissive: color,
      emissiveIntensity: 0.65,
      roughness: 0.28,
      metalness: 0.08,
      flatShading: true,
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shards: RuneShard[] = runeCrystalShardTemplates.map((shard) => ({
      origin: new THREE.Vector3(...shard.origin),
      scale: new THREE.Vector3(...shard.scale),
      rotation: new THREE.Euler(...shard.rotation),
      velocity: new THREE.Vector3(...shard.velocity),
      spin: new THREE.Vector3(...shard.spin),
      proxy: null,
      kickable: null,
      consumed: false,
      fishBaitAge: 0,
    }));
    const facets = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      facetMaterial,
      shards.length,
    );
    facets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    facets.castShadow = false;
    facets.frustumCulled = false;
    group.add(facets);
    const inner = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      innerMaterial,
      shards.length,
    );
    inner.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inner.castShadow = false;
    inner.frustumCulled = false;
    inner.renderOrder = 3;
    group.add(inner);

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 10, 7),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    aura.position.y = 1.02;
    aura.scale.y = 1.42;
    aura.renderOrder = 2;
    group.add(aura);

    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.17;
    groundGlow.renderOrder = 2;
    group.add(groundGlow);

    const crackGeometry = new THREE.BufferGeometry();
    crackGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.13, 0.52, 0.29, 0.04, 0.78, 0.3,
          0.04, 0.78, 0.3, -0.09, 1.02, 0.27,
          -0.09, 1.02, 0.27, 0.08, 1.28, 0.21,
          0.13, 0.6, 0.27, 0.24, 0.82, 0.21,
          -0.34, 0.47, 0.18, -0.23, 0.68, 0.2,
        ],
        3,
      ),
    );
    const cracks = new THREE.LineSegments(
      crackGeometry,
      new THREE.LineBasicMaterial({
        color: 0xfff1c8,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cracks.visible = false;
    cracks.renderOrder = 5;
    group.add(cracks);

    parent.add(group);
    const crystalKickable = this.registerKickable(
      group,
      0.64,
      0.16,
      cache,
      true,
      null,
      0.91,
      "",
    );
    const { shadow, shadowRing } = this.createRitualCrystalShadow(parent, color);
    const carry: RitualCrystalCarry = {
      id,
      affinity: id,
      object: group,
      kickable: crystalKickable,
      shadow,
      shadowRing,
      origin: group.position.clone(),
      socketedAt: null,
      shatteredAtSocket: null,
      impactCooldownUntil: 0,
    };
    this.ritualCrystals.push(carry);

    const proxyGeometry = new THREE.OctahedronGeometry(1, 0);
    const proxyMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
    });
    for (const [index, shard] of shards.entries()) {
      const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
      proxy.name = `rune-shard-${id}-${index}`;
      proxy.position.set(
        group.position.x + shard.origin.x,
        group.position.y + shard.origin.y,
        group.position.z + shard.origin.z,
      );
      proxy.rotation.copy(shard.rotation);
      proxy.scale.copy(shard.scale);
      proxy.visible = false;
      proxy.castShadow = false;
      proxy.userData.runeShard = id;
      parent.add(proxy);
      const shardKickable = this.registerKickable(
        proxy,
        Math.max(shard.scale.x, shard.scale.z) + 0.08,
        0.16,
        null,
        true,
        null,
        0.93,
        "",
      );
      shardKickable.enabled = false;
      shard.proxy = proxy;
      shard.kickable = shardKickable;
    }

    const state: RuneCrystalState = {
      id,
      label,
      group,
      facets,
      inner,
      facetMaterial,
      innerMaterial,
      aura,
      groundGlow,
      cracks,
      shards,
      dummy: new THREE.Object3D(),
      color,
      socketPosition: new THREE.Vector3(socketX, 0, socketZ),
      carry,
      placed: false,
      hits: 0,
      pulseAge: 2,
      breakAge: 2,
      activated: false,
      broken: false,
    };
    this.updateRuneCrystalMatrices(state);
    return state;
  }

  private updateRuneCrystalMatrices(rune: RuneCrystalState): void {
    const pulseProgress = Math.min(1, rune.pulseAge / 0.72);
    const pulse =
      rune.pulseAge < 0.72
        ? Math.sin(pulseProgress * Math.PI)
        : 0;
    const activationScale = rune.activated ? 1.12 : 1;
    const breakTime = Math.min(1.45, rune.breakAge);
    for (const [index, shard] of rune.shards.entries()) {
      const bob =
        !rune.broken && !this.reduceMotion
          ? Math.sin(this.elapsed * 2.15 + index * 1.27) * 0.018
          : 0;
      if (rune.broken && shard.proxy) {
        rune.dummy.position.set(
          shard.proxy.position.x - rune.group.position.x,
          shard.proxy.position.y - rune.group.position.y,
          shard.proxy.position.z - rune.group.position.z,
        );
        rune.dummy.rotation.copy(shard.proxy.rotation);
      } else {
        rune.dummy.position.set(
          shard.origin.x,
          shard.origin.y + bob,
          shard.origin.z,
        );
        rune.dummy.rotation.set(
          shard.rotation.x,
          shard.rotation.y + this.elapsed * (0.06 + index * 0.01),
          shard.rotation.z,
        );
      }
      const scale =
        (activationScale + pulse * 0.16) *
        (rune.broken ? Math.max(0.76, 1 - breakTime * 0.08) : 1);
      if (shard.consumed) {
        rune.dummy.scale.setScalar(0);
      } else {
        rune.dummy.scale.copy(shard.scale).multiplyScalar(scale);
      }
      rune.dummy.updateMatrix();
      rune.facets.setMatrixAt(index, rune.dummy.matrix);
      rune.dummy.scale.multiplyScalar(0.58);
      rune.dummy.updateMatrix();
      rune.inner.setMatrixAt(index, rune.dummy.matrix);
    }
    rune.facets.instanceMatrix.needsUpdate = true;
    rune.inner.instanceMatrix.needsUpdate = true;
    rune.facetMaterial.emissiveIntensity =
      rune.broken ? 0.08 : 0.62 + Number(rune.activated) * 0.78 + pulse * 2.1;
    rune.innerMaterial.opacity =
      rune.broken ? 0.035 : 0.18 + Number(rune.activated) * 0.14 + pulse * 0.28;
    rune.aura.material.opacity =
      rune.broken ? 0 : 0.04 + Number(rune.activated) * 0.06 + pulse * 0.11;
    rune.groundGlow.material.opacity =
      rune.broken ? 0.018 : 0.075 + Number(rune.activated) * 0.08 + pulse * 0.16;
    rune.cracks.visible = rune.hits >= 3 && !rune.broken;
  }

  private updateRitualCrystalPlacements(): void {
    if (this.currentZone !== "falls" || this.ritualCrystals.length === 0) return;
    const socketRadiusSquared = 1.28 * 1.28;

    for (const carry of this.ritualCrystals) {
      if (
        !carry.kickable.enabled ||
        carry.kickable === this.heldKickable ||
        carry.socketedAt
      ) {
        continue;
      }

      let nearestRune: RuneCrystalState | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const rune of this.runeStones.values()) {
        if (this.getRitualSocketOccupant(rune.id)) continue;
        const dx = carry.object.position.x - rune.socketPosition.x;
        const dz = carry.object.position.z - rune.socketPosition.z;
        const distance = dx * dx + dz * dz;
        if (distance < socketRadiusSquared && distance < nearestDistance) {
          nearestRune = rune;
          nearestDistance = distance;
        }
      }

      if (!nearestRune) {
        continue;
      }
      const planarSpeedSquared =
        carry.kickable.velocity.x * carry.kickable.velocity.x +
        carry.kickable.velocity.z * carry.kickable.velocity.z;
      // Telekinesis holds the cluster by its visual centre, well above its
      // physical base. A generous vertical capture volume lets the visible
      // centre align with the socket instead of requiring an invisible offset.
      if (planarSpeedSquared > 4.84 || carry.object.position.y > 2.55) continue;

      this.seatRitualCrystal(carry, nearestRune.id, true);
    }
  }

  private seatRuneCrystal(rune: RuneCrystalState, announce: boolean): void {
    this.seatRitualCrystal(rune.carry, rune.id, announce);
  }

  private seatRitualCrystal(
    carry: RitualCrystalCarry,
    socketId: RuneId,
    announce: boolean,
  ): boolean {
    if (this.isRitualCrystalBroken(carry)) return false;
    const socket = this.runeStones.get(socketId);
    const occupant = this.getRitualSocketOccupant(socketId);
    if (!socket || (occupant && occupant !== carry)) return false;

    if (carry.socketedAt && carry.socketedAt !== socketId) {
      carry.socketedAt = null;
      carry.object.userData.ritualSocketed = false;
    }
    carry.object.position.copy(socket.socketPosition);
    carry.object.rotation.set(0, 0, 0);
    carry.object.userData.ritualSocketed = true;
    carry.kickable.velocity.set(0, 0, 0);
    carry.kickable.onPlatform = false;
    carry.socketedAt = socketId;
    carry.shatteredAtSocket = null;
    this.syncRitualSocketPlacementStates();
    this.triggerRitualCrystalTinkle(carry, 0.82);
    this.updateRuneInteractionLabels();
    if (!announce) return true;
    const descriptor = runeCrystalDescriptors[socketId];
    const correct = carry.affinity === socketId;
    const remaining = [...this.runeStones.values()].filter(
      (candidate) => !candidate.placed,
    ).length;
    this.hooks.onStatus(
      correct
        ? `${descriptor.title}'s ${descriptor.color} crystal settles into the ${descriptor.symbol} socket.${
            remaining === 0
              ? " All three motifs hold light. A low chord waits without resolving."
              : ` ${remaining === 1 ? "One neighboring motif remains dark." : "Two neighboring motifs remain dark."}`
          }`
        : `The cluster settles into the ${descriptor.symbol} socket. Its weight holds, but the mineral roots beneath it remain still.`,
    );
    return true;
  }

  private getRitualSocketOccupant(id: RuneId): RitualCrystalCarry | null {
    return (
      this.ritualCrystals.find((carry) => carry.socketedAt === id) ?? null
    );
  }

  private syncRitualSocketPlacementStates(): void {
    for (const rune of this.runeStones.values()) {
      rune.placed =
        !rune.broken &&
        rune.carry.socketedAt === rune.id &&
        this.getRitualSocketOccupant(rune.id) === rune.carry;
    }
  }

  private unseatRitualCrystal(kickable: Kickable): void {
    const carry = this.ritualCrystals.find(
      (candidate) => candidate.kickable === kickable,
    );
    if (!carry?.socketedAt) return;
    carry.socketedAt = null;
    carry.object.userData.ritualSocketed = false;
    this.syncRitualSocketPlacementStates();

    const interrupted = [...this.runeStones.values()].some(
      (candidate) => candidate.activated,
    );
    if (interrupted) {
      this.runeProgress = 0;
      for (const candidate of this.runeStones.values()) {
        candidate.activated = false;
      }
      this.syncRuneCrystalLocks();
      this.hooks.onStatus(
        "A seated crystal leaves its symbol. The unfinished chord falls silent.",
      );
    }
    this.updateRuneInteractionLabels();
  }

  private syncRuneCrystalLocks(): void {
    for (const carry of this.ritualCrystals) {
      const rune =
        carry.affinity === null
          ? null
          : this.runeStones.get(carry.affinity) ?? null;
      carry.kickable.enabled =
        !this.isRitualCrystalBroken(carry) && !(rune?.activated ?? false);
    }
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
    this.removeTurtleCargoOrbiter(kickable);
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
    this.removeTurtleCargoOrbiter(kickable);
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
      this.removeTurtleCargoOrbiter(kickable);
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
    this.removeTurtleCargoOrbiter(kickable);
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
    const pointerId = this.telekinesisPointerId;
    this.heldKickable = null;
    this.telekinesisPlacementSurface = null;
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
      this.archiveRelayDragHold !== null ||
      this.orbitTelekinesisHolds.size > 0 ||
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
    this.cancelTelekinesisHold();
    this.cancelAllOrbitingPlanetTelekinesis();
    this.cancelMathInstanceDrag(notifyMath);
    this.cancelArchiveRelayDrag();
    this.cancelAmbientGridDrag();
  }

  private emitCrystalSparkles(
    position: THREE.Vector3,
    color: THREE.Color,
    hits: number,
    requestedCount: number,
  ): void {
    const pool = this.runeSparkles;
    if (!pool) return;
    const count =
      this.quality === "low"
        ? Math.min(7, requestedCount)
        : requestedCount;
    const colorAttribute = pool.points.geometry.getAttribute(
      "color",
    ) as THREE.BufferAttribute;
    for (let emitted = 0; emitted < count; emitted += 1) {
      const index = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.maximumCount;
      const offset = index * 3;
      const angle =
        emitted * 2.39996 + hits * 0.73 + index * 0.11;
      const radius = 0.18 + (emitted % 3) * 0.12;
      pool.positions[offset] =
        position.x + Math.cos(angle) * radius;
      pool.positions[offset + 1] =
        position.y + 0.62 + (emitted % 4) * 0.24;
      pool.positions[offset + 2] =
        position.z + Math.sin(angle) * radius;
      pool.velocities[offset] = Math.cos(angle) * (0.28 + (emitted % 2) * 0.12);
      pool.velocities[offset + 1] = 0.72 + (emitted % 4) * 0.16;
      pool.velocities[offset + 2] = Math.sin(angle) * (0.28 + (emitted % 3) * 0.08);
      pool.ages[index] = 0;
      pool.lifetimes[index] = 0.58 + (emitted % 5) * 0.08;
      colorAttribute.setXYZ(
        index,
        Math.min(1, color.r * 1.35 + 0.18),
        Math.min(1, color.g * 1.35 + 0.18),
        Math.min(1, color.b * 1.35 + 0.18),
      );
    }
    (
      pool.points.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    colorAttribute.needsUpdate = true;
  }

  private triggerRuneTinkle(
    rune: RuneCrystalState,
    strength = 1,
  ): void {
    rune.pulseAge = 0;
    this.triggerCrystalTinkle(
      rune.group.position,
      rune.color,
      rune.hits,
      strength,
    );
  }

  private twinkleNearbyRitualCrystals(
    range: number,
    stage: SpellStage,
    charge: number,
  ): number {
    const rangeSquared = range * range;
    const stageStrength =
      stage === "thunder" ? 1.35 : stage === "surge" ? 1.15 : 0.92;
    const sparkleCount =
      this.quality === "low"
        ? 3
        : this.quality === "medium"
          ? stage === "spark"
            ? 4
            : 5
          : stage === "spark"
            ? 5
            : 6;
    let twinkled = 0;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    let colorR = 0;
    let colorG = 0;
    let colorB = 0;
    const twinkle = (
      crystal: RuneCrystalState | RitualDecoyCrystalState,
    ): void => {
      if (crystal.broken) return;
      const dx = crystal.group.position.x - this.playerPosition.x;
      const dz = crystal.group.position.z - this.playerPosition.z;
      if (dx * dx + dz * dz > rangeSquared) return;
      crystal.pulseAge = 0;
      this.emitCrystalSparkles(
        crystal.group.position,
        crystal.color,
        crystal.hits + this.spellCastSequence + twinkled,
        sparkleCount,
      );
      centerX += crystal.group.position.x;
      centerY += crystal.group.position.y;
      centerZ += crystal.group.position.z;
      colorR += crystal.color.r;
      colorG += crystal.color.g;
      colorB += crystal.color.b;
      twinkled += 1;
    };

    for (const rune of this.runeStones.values()) twinkle(rune);
    for (const decoy of this.ritualDecoys.values()) twinkle(decoy);

    if (twinkled > 0 && this.runeTinkleLight) {
      this.runeTinkleLight.position.set(
        centerX / twinkled,
        centerY / twinkled + 1.15,
        centerZ / twinkled,
      );
      this.runeTinkleLight.color.setRGB(
        colorR / twinkled,
        colorG / twinkled,
        colorB / twinkled,
      );
      this.runeTinklePeakIntensity =
        (this.quality === "low" ? 0.75 : 1.2) *
        stageStrength *
        (0.85 + charge * 0.25);
      this.runeTinkleLight.intensity = this.runeTinklePeakIntensity;
      this.runeTinkleAge = 0;
    }
    return twinkled;
  }

  private triggerCrystalTinkle(
    position: THREE.Vector3,
    color: THREE.Color,
    hits: number,
    strength = 1,
  ): void {
    this.emitCrystalSparkles(
      position,
      color,
      hits,
      Math.round(9 * strength),
    );
    if (!this.runeTinkleLight) return;
    this.runeTinkleLight.color.copy(color);
    this.runeTinkleLight.position.set(
      position.x,
      position.y + 1.15,
      position.z,
    );
    this.runeTinklePeakIntensity =
      (this.quality === "low" ? 0.75 : 1.2) * strength;
    this.runeTinkleLight.intensity = this.runeTinklePeakIntensity;
    this.runeTinkleAge = 0;
  }

  private getRuneForCarry(carry: RitualCrystalCarry): RuneCrystalState | null {
    return carry.affinity === null
      ? null
      : this.runeStones.get(carry.affinity) ?? null;
  }

  private getDecoyForCarry(
    carry: RitualCrystalCarry,
  ): RitualDecoyCrystalState | null {
    return carry.affinity === null
      ? this.ritualDecoys.get(carry.id) ?? null
      : null;
  }

  private isRitualCrystalBroken(carry: RitualCrystalCarry): boolean {
    return (
      this.getRuneForCarry(carry)?.broken ??
      this.getDecoyForCarry(carry)?.broken ??
      false
    );
  }

  /**
   * A fractured cluster no longer lives at its former group origin. Its
   * largest surviving facet becomes the physical anchor for inspection,
   * diagnostic traces, and eventual reconstruction.
   */
  private getRitualCrystalAnchorShard(
    carry: RitualCrystalCarry,
  ): RuneShard | null {
    const shards =
      this.getRuneForCarry(carry)?.shards ??
      this.getDecoyForCarry(carry)?.shards ??
      [];
    let anchor: RuneShard | null = null;
    let anchorScale = Number.NEGATIVE_INFINITY;
    for (const shard of shards) {
      if (
        shard.consumed ||
        !shard.proxy?.visible ||
        !shard.kickable?.enabled
      ) {
        continue;
      }
      const scale = shard.scale.x * shard.scale.y * shard.scale.z;
      if (scale <= anchorScale) continue;
      anchor = shard;
      anchorScale = scale;
    }
    return anchor;
  }

  private getRitualCrystalTargetObject(
    carry: RitualCrystalCarry,
  ): THREE.Object3D {
    if (!this.isRitualCrystalBroken(carry)) return carry.object;
    return this.getRitualCrystalAnchorShard(carry)?.proxy ?? carry.object;
  }

  private triggerRitualCrystalTinkle(
    carry: RitualCrystalCarry,
    strength = 1,
  ): void {
    const rune = this.getRuneForCarry(carry);
    if (rune) {
      this.triggerRuneTinkle(rune, strength);
      return;
    }
    const decoy = this.getDecoyForCarry(carry);
    if (!decoy) return;
    decoy.pulseAge = 0;
    this.triggerCrystalTinkle(
      decoy.group.position,
      decoy.color,
      decoy.hits,
      strength,
    );
  }

  private updateRuneInteractionLabels(): void {
    const allPlaced =
      this.runeStones.size === 3 &&
      [...this.runeStones.values()].every((rune) => rune.placed);
    for (const rune of this.runeStones.values()) {
      const occupant = this.getRitualSocketOccupant(rune.id);
      let label = rune.label;
      if (this.fantasyPuzzleSolved) {
        label = "Listen to awakened rune";
      } else if (!occupant) {
        label = "Inspect socket";
      } else if (occupant.affinity !== rune.id) {
        label = "Inspect seated crystal";
      } else if (!allPlaced) {
        label = "Inspect seated crystal";
      } else if (rune.activated) {
        label = "Listen to resonant rune";
      } else {
        label = "Touch crystal";
      }
      this.updateInteractionLabel(`rune-${rune.id}`, label);
      this.updateInteractionLabel(
        `ritual-crystal-${rune.id}`,
        rune.broken
          ? "Inspect largest facet"
          : rune.hits >= 3
            ? "Inspect fractured crystal"
            : "Touch loose crystal",
      );
    }
    for (const decoy of this.ritualDecoys.values()) {
      this.updateInteractionLabel(
        `ritual-crystal-${decoy.id}`,
        decoy.broken
          ? "Inspect largest facet"
          : decoy.hits >= 3
            ? "Inspect fractured crystal"
            : "Touch loose crystal",
      );
    }
  }

  private breakFantasyRune(rune: RuneCrystalState): void {
    const wasPlaced = rune.carry.socketedAt !== null;
    rune.broken = true;
    rune.placed = false;
    rune.activated = false;
    rune.breakAge = 0;
    rune.carry.shatteredAtSocket = rune.carry.socketedAt;
    rune.carry.socketedAt = null;
    rune.carry.object.userData.ritualSocketed = false;
    rune.carry.kickable.enabled = false;
    rune.carry.kickable.velocity.set(0, 0, 0);
    this.runeProgress = 0;
    for (const candidate of this.runeStones.values()) {
      candidate.activated = false;
    }
    this.syncRitualSocketPlacementStates();
    for (const shard of rune.shards) {
      if (!shard.proxy || !shard.kickable) continue;
      shard.consumed = false;
      shard.fishBaitAge = 0;
      shard.proxy.position.set(
        rune.group.position.x + shard.origin.x,
        rune.group.position.y + shard.origin.y,
        rune.group.position.z + shard.origin.z,
      );
      shard.proxy.rotation.copy(shard.rotation);
      shard.proxy.visible = true;
      shard.kickable.enabled = true;
      shard.kickable.onPlatform = false;
      shard.kickable.velocity.copy(shard.velocity);
      shard.kickable.kickCooldown = 0.3;
    }
    this.syncRuneCrystalLocks();
    this.triggerRuneTinkle(rune, 1.55);
    this.updateRuneInteractionLabels();
    this.hooks.onStatus(
      `The ${wasPlaced ? "seated" : "loose"} crystal gives one bright, regrettable tinkle and shatters. Five pieces scatter, each still tugging faintly at the unseen hand.`,
    );
  }

  private soundLooseRuneCrystal(id: RuneId): void {
    const rune = this.runeStones.get(id);
    if (!rune) return;
    if (rune.broken) {
      const anchor = this.getRitualCrystalAnchorShard(rune.carry);
      if (!anchor?.proxy) return;
      this.triggerCrystalTinkle(
        anchor.proxy.position,
        rune.color,
        rune.hits,
        0.62,
      );
      this.hooks.onStatus(
        "The largest facet still carries the cluster's impossible light. Four lesser pieces answer it from wherever they have fallen.",
      );
      return;
    }

    rune.hits += 1;
    this.triggerRuneTinkle(rune);
    if (rune.hits >= 4) {
      this.breakFantasyRune(rune);
      return;
    }
    this.updateRuneInteractionLabels();
    this.hooks.onStatus(
      rune.hits === 1
        ? "The loose cluster answers with a clear, glass-small note."
        : rune.hits === 2
          ? "The note returns brighter. A tremor passes between the joined facets."
          : "Hairline light branches beneath the surface. Another touch seems unwise.",
    );
  }

  private soundLooseDecoyCrystal(id: string): void {
    const crystal = this.ritualDecoys.get(id);
    if (!crystal) return;
    if (crystal.broken) {
      const anchor = this.getRitualCrystalAnchorShard(crystal.carry);
      if (!anchor?.proxy) return;
      this.triggerCrystalTinkle(
        anchor.proxy.position,
        crystal.color,
        crystal.hits,
        0.62,
      );
      this.hooks.onStatus(
        "The largest facet still shines with borrowed colour. Four lesser pieces answer it faintly from wherever they fell.",
      );
      return;
    }

    crystal.hits += 1;
    crystal.pulseAge = 0;
    this.triggerCrystalTinkle(
      crystal.group.position,
      crystal.color,
      crystal.hits,
    );
    if (crystal.hits >= 4) {
      this.breakLooseDecoyCrystal(crystal);
      return;
    }
    this.updateRuneInteractionLabels();
    this.hooks.onStatus(
      crystal.hits === 1
        ? "The loose cluster answers with a clear, glass-small note."
        : crystal.hits === 2
          ? "The note returns brighter. A tremor passes between the joined facets."
          : "Hairline light branches beneath the surface. Another touch seems unwise.",
    );
  }

  private soundRitualCrystal(
    carry: RitualCrystalCarry,
    forceBreak = false,
  ): void {
    const rune = this.getRuneForCarry(carry);
    if (rune) {
      if (forceBreak && !rune.broken) rune.hits = Math.max(3, rune.hits);
      this.soundLooseRuneCrystal(rune.id);
      return;
    }
    const decoy = this.getDecoyForCarry(carry);
    if (!decoy) return;
    if (forceBreak && !decoy.broken) {
      decoy.hits = Math.max(3, decoy.hits);
    }
    this.soundLooseDecoyCrystal(decoy.id);
  }

  private breakLooseDecoyCrystal(crystal: RitualDecoyCrystalState): void {
    const wasPlaced = crystal.carry.socketedAt !== null;
    crystal.broken = true;
    crystal.breakAge = 0;
    crystal.carry.shatteredAtSocket = crystal.carry.socketedAt;
    crystal.carry.socketedAt = null;
    crystal.group.userData.ritualSocketed = false;
    crystal.carry.kickable.enabled = false;
    crystal.carry.kickable.velocity.set(0, 0, 0);
    crystal.facets.visible = false;
    crystal.inner.visible = false;
    crystal.aura.visible = false;
    crystal.groundGlow.visible = false;
    crystal.cracks.visible = false;
    for (const shard of crystal.shards) {
      if (!shard.proxy || !shard.kickable) continue;
      shard.consumed = false;
      shard.fishBaitAge = 0;
      shard.proxy.position.set(
        crystal.group.position.x + shard.origin.x,
        crystal.group.position.y + shard.origin.y,
        crystal.group.position.z + shard.origin.z,
      );
      shard.proxy.rotation.copy(shard.rotation);
      shard.proxy.visible = true;
      shard.kickable.enabled = true;
      shard.kickable.onPlatform = false;
      shard.kickable.velocity.copy(shard.velocity);
      shard.kickable.kickCooldown = 0.3;
    }
    this.triggerCrystalTinkle(
      crystal.group.position,
      crystal.color,
      crystal.hits,
      1.55,
    );
    this.syncRitualSocketPlacementStates();
    this.updateRuneInteractionLabels();
    this.hooks.onStatus(
      `The ${wasPlaced ? "seated" : "loose"} crystal gives one bright, regrettable tinkle and shatters. Five pieces scatter across the stone.`,
    );
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
      const fishCount = this.getFishRenderCount(this.fishSchool);
      this.fishSchool.mesh.count = fishCount;
      this.fishSchool.aura.count = fishCount;
      this.fishSchool.aura.visible = false;
    }
    return changed;
  }

  private recallRitualCrystalShards(
    shards: RuneShard[],
    center: THREE.Vector3,
  ): number {
    let consumedShards = 0;
    for (const shard of shards) {
      if (!shard.proxy || !shard.kickable) continue;
      if (shard.consumed) consumedShards += 1;
      this.cancelTelekinesisHold(shard.kickable);
      shard.consumed = false;
      shard.fishBaitAge = 0;
      shard.kickable.enabled = false;
      shard.kickable.velocity.set(0, 0, 0);
      shard.kickable.kickCooldown = 0;
      shard.proxy.visible = false;
      shard.proxy.position.set(
        center.x + shard.origin.x,
        center.y + shard.origin.y,
        center.z + shard.origin.z,
      );
      shard.proxy.rotation.copy(shard.rotation);
    }
    return consumedShards;
  }

  private restoreBrokenRitualCrystal(
    carry: RitualCrystalCarry,
  ): { restored: boolean; consumedShards: number } {
    const rune = this.getRuneForCarry(carry);
    const decoy = this.getDecoyForCarry(carry);
    if (!(rune?.broken ?? decoy?.broken ?? false)) {
      return { restored: false, consumedShards: 0 };
    }

    const shards = rune?.shards ?? decoy?.shards ?? [];
    const restoreCenter = this.getRitualCrystalTargetObject(
      carry,
    ).position.clone();
    const consumedShards = this.recallRitualCrystalShards(
      shards,
      restoreCenter,
    );
    this.cancelTelekinesisHold(carry.kickable);
    carry.object.position.copy(restoreCenter);
    carry.kickable.enabled = true;
    carry.kickable.velocity.set(0, 0, 0);
    carry.kickable.kickCooldown = 0.2;
    carry.kickable.onPlatform = false;

    if (rune) {
      rune.hits = 0;
      rune.broken = false;
      rune.activated = false;
      rune.pulseAge = 0;
      rune.breakAge = 2;
      rune.cracks.visible = false;
      this.updateRuneCrystalMatrices(rune);
    } else if (decoy) {
      decoy.hits = 0;
      decoy.broken = false;
      decoy.pulseAge = 0;
      decoy.breakAge = 2;
      decoy.facets.visible = true;
      decoy.inner.visible = true;
      decoy.aura.visible = true;
      decoy.groundGlow.visible = true;
      decoy.cracks.visible = false;
      decoy.facets.material.emissiveIntensity = 0.62;
      decoy.inner.material.opacity = 0.18;
      decoy.aura.material.opacity = 0.04;
      decoy.groundGlow.material.opacity = 0.075;
    }

    const restoreSocket = carry.shatteredAtSocket;
    carry.shatteredAtSocket = null;
    if (restoreSocket && !this.getRitualSocketOccupant(restoreSocket)) {
      const socket = this.runeStones.get(restoreSocket);
      if (socket) {
        carry.object.position.copy(socket.socketPosition);
        carry.object.rotation.set(0, 0, 0);
        carry.object.userData.ritualSocketed = true;
        carry.socketedAt = restoreSocket;
      }
    } else {
      carry.object.userData.ritualSocketed = false;
      carry.socketedAt = null;
      if (restoreSocket) {
        const angle = carry.id.length * 1.37;
        carry.object.position.x += Math.cos(angle) * 1.35;
        carry.object.position.z += Math.sin(angle) * 1.35;
        carry.object.position.y = carry.kickable.restingY;
      }
    }

    if (consumedShards > 0) this.settleFlyingFishSchools();
    this.syncRitualSocketPlacementStates();
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    return { restored: true, consumedShards };
  }

  private resetFantasyRunes(announce: boolean): boolean {
    if (
      this.currentZone !== "falls" ||
      this.runeStones.size === 0
    ) {
      return false;
    }
    const preserveSolvedRitual = this.fantasyPuzzleSolved;
    let changed = !preserveSolvedRitual && this.runeProgress > 0;
    const flyingFishReset = this.settleFlyingFishSchools();
    changed ||= flyingFishReset;
    if (!preserveSolvedRitual) this.runeProgress = 0;
    const carriesToReset = preserveSolvedRitual
      ? [...this.ritualDecoys.values()].map((crystal) => crystal.carry)
      : this.ritualCrystals;
    for (const carry of carriesToReset) {
      changed ||=
        carry.socketedAt !== null ||
        carry.object.position.distanceToSquared(carry.origin) > 0.0025;
      this.cancelTelekinesisHold(carry.kickable);
      carry.object.position.copy(carry.origin);
      carry.object.rotation.set(0, 0, 0);
      carry.object.userData.ritualSocketed = false;
      carry.kickable.enabled = true;
      carry.kickable.velocity.set(0, 0, 0);
      carry.kickable.onPlatform = carry.kickable.platform !== null;
      carry.kickable.kickCooldown = 0;
      carry.socketedAt = null;
      carry.shatteredAtSocket = null;
      carry.impactCooldownUntil = 0;
    }
    for (const crystal of this.ritualDecoys.values()) {
      changed ||= crystal.hits > 0 || crystal.broken;
      for (const shard of crystal.shards) {
        if (!shard.proxy || !shard.kickable) continue;
        shard.consumed = false;
        shard.fishBaitAge = 0;
        changed ||= shard.kickable.enabled;
        this.cancelTelekinesisHold(shard.kickable);
        shard.kickable.enabled = false;
        shard.kickable.velocity.set(0, 0, 0);
        shard.proxy.visible = false;
        shard.proxy.position.set(
          crystal.carry.origin.x + shard.origin.x,
          crystal.carry.origin.y + shard.origin.y,
          crystal.carry.origin.z + shard.origin.z,
        );
        shard.proxy.rotation.copy(shard.rotation);
      }
      crystal.hits = 0;
      crystal.broken = false;
      crystal.pulseAge = 2;
      crystal.breakAge = 2;
      crystal.facets.visible = true;
      crystal.inner.visible = true;
      crystal.aura.visible = true;
      crystal.groundGlow.visible = true;
      crystal.cracks.visible = false;
      crystal.facets.material.emissiveIntensity = 0.62;
      crystal.inner.material.opacity = 0.18;
      crystal.aura.material.opacity = 0.04;
      crystal.groundGlow.material.opacity = 0.075;
    }
    if (!preserveSolvedRitual) {
      for (const rune of this.runeStones.values()) {
        changed ||= rune.hits > 0 || rune.broken || rune.activated;
        for (const shard of rune.shards) {
          if (!shard.proxy || !shard.kickable) continue;
          shard.consumed = false;
          shard.fishBaitAge = 0;
          changed ||= shard.kickable.enabled;
          this.cancelTelekinesisHold(shard.kickable);
          shard.kickable.enabled = false;
          shard.kickable.velocity.set(0, 0, 0);
          shard.proxy.visible = false;
          shard.proxy.position.set(
            rune.carry.origin.x + shard.origin.x,
            rune.carry.origin.y + shard.origin.y,
            rune.carry.origin.z + shard.origin.z,
          );
          shard.proxy.rotation.copy(shard.rotation);
        }
        rune.hits = 0;
        rune.broken = false;
        rune.placed = false;
        rune.activated = false;
        rune.pulseAge = 2;
        rune.breakAge = 2;
        rune.cracks.visible = false;
        this.updateRuneCrystalMatrices(rune);
      }
    }
    this.syncRitualSocketPlacementStates();
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    if (announce && changed) {
      this.hooks.onStatus(
        flyingFishReset
          ? "The loose shards re-knit with three soft chimes. Their borrowed colour rains from the flying schools, which settle quietly back into the river."
          : preserveSolvedRitual
            ? "The loose shards re-knit with three soft chimes. The awakened sockets do not surrender their roots."
            : "The shards re-knit with three soft chimes. Every loose crystal is back where the cache remembers it.",
      );
    }
    return changed;
  }

  private revealRuneSockets(range: number, duration: number): number {
    let revealed = 0;
    const rangeSquared = range * range;
    for (const socket of this.runeSockets.values()) {
      const dx = socket.position.x - this.playerPosition.x;
      const dz = socket.position.z - this.playerPosition.z;
      if (dx * dx + dz * dz > rangeSquared) continue;
      socket.revealUntil = Math.max(
        socket.revealUntil,
        this.elapsed + duration,
      );
      socket.reveal = Math.max(socket.reveal, 0.72);
      revealed += 1;
    }
    return revealed;
  }

  private updateRuneSocketEffects(delta: number): void {
    for (const socket of this.runeSockets.values()) {
      const rune = this.runeStones.get(socket.id);
      const dx = socket.position.x - this.playerPosition.x;
      const dz = socket.position.z - this.playerPosition.z;
      const lanternProximity = THREE.MathUtils.clamp(
        1 - Math.hypot(dx, dz) / 5.4,
        0,
        1,
      );
      const lanternReveal =
        this.lanternBlend *
        THREE.MathUtils.smoothstep(lanternProximity, 0.04, 0.68);
      const spellReveal = this.elapsed < socket.revealUntil ? 1 : 0;
      const awakenedReveal = rune?.activated ? 0.18 : 0;
      const revealTarget = Math.max(
        lanternReveal,
        spellReveal,
        awakenedReveal,
      );
      const revealFollow = this.reduceMotion
        ? 1
        : 1 - Math.exp(-delta * (revealTarget > socket.reveal ? 12 : 2.7));
      socket.reveal = THREE.MathUtils.lerp(
        socket.reveal,
        revealTarget,
        revealFollow,
      );
      socket.symbolMaterial.color
        .copy(socket.dormantColor)
        .lerp(socket.color, socket.reveal);

      const growthTarget = rune?.placed && !rune.broken ? 1 : 0;
      const growthFollow = this.reduceMotion
        ? 1
        : 1 - Math.exp(-delta * (growthTarget > socket.growth ? 4.6 : 7.2));
      socket.growth = THREE.MathUtils.lerp(
        socket.growth,
        growthTarget,
        growthFollow,
      );
      socket.roots.visible = socket.growth > 0.003;
      if (!socket.roots.visible) continue;

      for (const [index, root] of socket.rootShards.entries()) {
        const staggeredGrowth = THREE.MathUtils.clamp(
          socket.growth * 1.38 - index * 0.055,
          0,
          1,
        );
        const easedGrowth = THREE.MathUtils.smoothstep(
          staggeredGrowth,
          0,
          1,
        );
        socket.dummy.position.copy(root.position);
        socket.dummy.position.y -= (1 - easedGrowth) * 0.2;
        socket.dummy.rotation.copy(root.rotation);
        socket.dummy.scale.set(
          root.scale.x * (0.24 + easedGrowth * 0.76),
          root.scale.y * Math.max(0.001, easedGrowth),
          root.scale.z * (0.24 + easedGrowth * 0.76),
        );
        socket.dummy.updateMatrix();
        socket.roots.setMatrixAt(index, socket.dummy.matrix);
      }
      socket.roots.instanceMatrix.needsUpdate = true;
      const runePulse =
        rune && rune.pulseAge < 0.72
          ? Math.sin((rune.pulseAge / 0.72) * Math.PI)
          : 0;
      socket.roots.material.emissiveIntensity =
        0.42 +
        socket.reveal * 0.88 +
        Number(rune?.activated ?? false) * 0.46 +
        runePulse * 1.15;
    }
  }

  private updateRitualCrystalShadow(carry: RitualCrystalCarry): void {
    const broken = this.isRitualCrystalBroken(carry);
    const visible = !broken && carry.object.visible;
    carry.shadow.visible = visible;
    carry.shadowRing.visible = visible;
    if (!visible) return;

    const surface = carry.socketedAt
      ? null
      : carry.kickable === this.heldKickable
        ? this.telekinesisPlacementSurface
        : carry.kickable.platform;
    const insideSurface =
      surface !== null &&
      this.surfaceContainsPoint(
        surface,
        carry.object.position.x,
        carry.object.position.z,
      );
    const supportHeight = carry.socketedAt
      ? 0.17
      : insideSurface && surface
        ? surface.heightAt(carry.object.position.x, carry.object.position.z) +
          0.012
        : 0.17;
    const restingBase = insideSurface && surface
      ? surface.heightAt(carry.object.position.x, carry.object.position.z)
      : carry.kickable.restingY;
    const liftedHeight = Math.max(
      0,
      carry.object.position.y - restingBase,
    );

    carry.shadow.position.set(
      carry.object.position.x,
      supportHeight,
      carry.object.position.z,
    );
    carry.shadowRing.position.copy(carry.shadow.position);

    let socketProximity = 0;
    if (!carry.socketedAt && carry.object.position.y <= 2.55) {
      for (const rune of this.runeStones.values()) {
        const occupant = this.getRitualSocketOccupant(rune.id);
        if (occupant && occupant !== carry) continue;
        const distance = Math.hypot(
          carry.object.position.x - rune.socketPosition.x,
          carry.object.position.z - rune.socketPosition.z,
        );
        socketProximity = Math.max(
          socketProximity,
          1 - THREE.MathUtils.clamp(distance / 1.7, 0, 1),
        );
      }
    }
    if (socketProximity > 0.2 && !insideSurface) {
      const socketTop = THREE.MathUtils.lerp(
        supportHeight,
        0.285,
        THREE.MathUtils.smoothstep(socketProximity, 0.2, 0.72),
      );
      carry.shadow.position.y = socketTop;
      carry.shadowRing.position.y = socketTop + 0.002;
    }

    const liftScale = 1 - Math.min(0.25, liftedHeight * 0.12);
    carry.shadow.scale.set(liftScale, liftScale, 1);
    carry.shadow.material.opacity =
      0.34 * (1 - Math.min(0.72, liftedHeight * 0.2));
    const ringPulse =
      socketProximity > 0 && !this.reduceMotion
        ? (Math.sin(this.elapsed * 7.5) + 1) * 0.04
        : 0;
    const ringScale = liftScale * (1 + socketProximity * 0.3 + ringPulse);
    carry.shadowRing.scale.set(ringScale, ringScale, 1);
    carry.shadowRing.material.opacity =
      carry.socketedAt !== null
        ? 0.14
        : 0.2 + socketProximity * 0.52;
  }

  private updateRuneEffects(delta: number): void {
    this.updateRuneSocketEffects(delta);
    for (const carry of this.ritualCrystals) {
      this.updateRitualCrystalShadow(carry);
    }
    for (const rune of this.runeStones.values()) {
      const interaction = this.interactions.find(
        (candidate) => candidate.id === `ritual-crystal-${rune.id}`,
      );
      const interactionTarget = this.getRitualCrystalTargetObject(
        rune.carry,
      );
      interaction?.position.set(
        interactionTarget.position.x,
        0,
        interactionTarget.position.z,
      );
      rune.pulseAge = Math.min(2, rune.pulseAge + delta);
      if (rune.broken) {
        rune.breakAge = Math.min(2, rune.breakAge + delta);
        const spinScale = Math.max(0, 1 - rune.breakAge / 1.35);
        for (const shard of rune.shards) {
          if (
            !shard.proxy ||
            !shard.kickable?.enabled ||
            shard.kickable === this.heldKickable
          ) {
            continue;
          }
          shard.proxy.rotation.x += shard.spin.x * delta * spinScale;
          shard.proxy.rotation.y += shard.spin.y * delta * spinScale;
          shard.proxy.rotation.z += shard.spin.z * delta * spinScale;
        }
      }
      this.updateRuneCrystalMatrices(rune);
    }

    for (const crystal of this.ritualDecoys.values()) {
      const interaction = this.interactions.find(
        (candidate) => candidate.id === `ritual-crystal-${crystal.id}`,
      );
      const interactionTarget = this.getRitualCrystalTargetObject(
        crystal.carry,
      );
      interaction?.position.set(
        interactionTarget.position.x,
        0,
        interactionTarget.position.z,
      );
      crystal.pulseAge = Math.min(2, crystal.pulseAge + delta);
      if (crystal.broken) {
        crystal.breakAge = Math.min(2, crystal.breakAge + delta);
        const spinScale = Math.max(0, 1 - crystal.breakAge / 1.35);
        for (const shard of crystal.shards) {
          if (
            !shard.proxy ||
            !shard.kickable?.enabled ||
            shard.kickable === this.heldKickable
          ) {
            continue;
          }
          shard.proxy.rotation.x += shard.spin.x * delta * spinScale;
          shard.proxy.rotation.y += shard.spin.y * delta * spinScale;
          shard.proxy.rotation.z += shard.spin.z * delta * spinScale;
        }
        continue;
      }
      const pulseProgress = Math.min(1, crystal.pulseAge / 0.72);
      const pulse =
        crystal.pulseAge < 0.72
          ? Math.sin(pulseProgress * Math.PI)
          : 0;
      crystal.facets.material.emissiveIntensity = 0.62 + pulse * 2.1;
      crystal.inner.material.opacity = 0.18 + pulse * 0.28;
      crystal.aura.material.opacity = 0.04 + pulse * 0.11;
      crystal.groundGlow.material.opacity = 0.075 + pulse * 0.16;
      crystal.cracks.visible = crystal.hits >= 3;
    }

    const pool = this.runeSparkles;
    if (pool) {
      let changed = false;
      for (let index = 0; index < pool.maximumCount; index += 1) {
        const age = pool.ages[index] ?? -1;
        if (age < 0) continue;
        changed = true;
        const nextAge = age + delta;
        pool.ages[index] = nextAge;
        const offset = index * 3;
        if (nextAge >= (pool.lifetimes[index] ?? 0)) {
          pool.ages[index] = -1;
          pool.positions[offset + 1] = -100;
          continue;
        }
        pool.velocities[offset + 1] =
          (pool.velocities[offset + 1] ?? 0) - delta * 0.92;
        pool.positions[offset] =
          (pool.positions[offset] ?? 0) +
          (pool.velocities[offset] ?? 0) * delta;
        pool.positions[offset + 1] =
          (pool.positions[offset + 1] ?? 0) +
          (pool.velocities[offset + 1] ?? 0) * delta;
        pool.positions[offset + 2] =
          (pool.positions[offset + 2] ?? 0) +
          (pool.velocities[offset + 2] ?? 0) * delta;
      }
      if (changed) {
        (
          pool.points.geometry.getAttribute("position") as THREE.BufferAttribute
        ).needsUpdate = true;
      }
    }

    if (this.runeTinkleLight) {
      this.runeTinkleAge = Math.min(2, this.runeTinkleAge + delta);
      const progress = Math.min(1, this.runeTinkleAge / 0.62);
      const fade = Math.max(0, 1 - progress);
      this.runeTinkleLight.intensity = this.reduceMotion
        ? 0
        : this.runeTinklePeakIntensity * fade * fade;
    }
    this.updateRuneDiagnosticTrace(delta);
  }

  private updateRuneDiagnosticTrace(delta: number): void {
    const trace = this.runeDiagnosticTrace;
    if (!trace?.active || trace.pointCount < 2) return;
    trace.age = Math.min(trace.duration, trace.age + delta);
    const travelDuration = trace.duration * 0.82;
    const progress = Math.min(1, trace.age / travelDuration);
    const visiblePoints = this.reduceMotion
      ? trace.pointCount
      : Math.max(1, Math.ceil(progress * trace.pointCount));
    trace.path.geometry.setDrawRange(0, visiblePoints);
    const fadeProgress = THREE.MathUtils.smoothstep(
      trace.age,
      trace.duration * 0.72,
      trace.duration,
    );
    trace.path.material.opacity = (1 - fadeProgress) * 0.92;

    if (!this.reduceMotion) {
      const scaledIndex = progress * (trace.pointCount - 1);
      const lowerIndex = Math.min(
        trace.pointCount - 1,
        Math.floor(scaledIndex),
      );
      const upperIndex = Math.min(trace.pointCount - 1, lowerIndex + 1);
      const blend = scaledIndex - lowerIndex;
      const lowerOffset = lowerIndex * 3;
      const upperOffset = upperIndex * 3;
      trace.packet.position.set(
        THREE.MathUtils.lerp(
          trace.positions[lowerOffset] ?? 0,
          trace.positions[upperOffset] ?? 0,
          blend,
        ),
        THREE.MathUtils.lerp(
          trace.positions[lowerOffset + 1] ?? 1.12,
          trace.positions[upperOffset + 1] ?? 1.12,
          blend,
        ),
        THREE.MathUtils.lerp(
          trace.positions[lowerOffset + 2] ?? 0,
          trace.positions[upperOffset + 2] ?? 0,
          blend,
        ),
      );
      trace.packet.rotation.y += delta * 5.2;
      trace.packet.rotation.x += delta * 2.3;
    }

    while (
      trace.nextTargetIndex < trace.targets.length &&
      progress >= (trace.nextTargetIndex + 1) / trace.targets.length
    ) {
      const carry = trace.targets[trace.nextTargetIndex];
      if (!carry) break;
      const wasBroken = this.isRitualCrystalBroken(carry);
      const restoration = wasBroken
        ? this.restoreBrokenRitualCrystal(carry)
        : { restored: false, consumedShards: 0 };
      this.triggerRitualCrystalTinkle(carry, wasBroken ? 1.45 : 0.92);
      if (restoration.restored) {
        trace.path.material.color.setHex(palette.coral);
        const descriptor =
          carry.affinity === null
            ? null
            : runeCrystalDescriptors[carry.affinity];
        this.hooks.onStatus(
          `${descriptor ? `The trace reaches ${descriptor.title}` : "The trace finds an unnamed cluster"}. Its scattered facets pull together behind the packet.${
            restoration.consumedShards > 0
              ? " Borrowed colour rains from the flying shoal."
              : ""
          }`,
        );
      }
      trace.nextTargetIndex += 1;
    }

    if (trace.age >= trace.duration) {
      trace.active = false;
      trace.targets = [];
      trace.path.visible = false;
      trace.packet.visible = false;
      trace.path.geometry.setDrawRange(0, 0);
    }
  }

  private inspectOrActivateRuneSocket(id: RuneId): void {
    const rune = this.runeStones.get(id);
    if (!rune) return;
    const occupant = this.getRitualSocketOccupant(id);
    if (occupant?.affinity === id) {
      this.activateFantasyRune(id);
      return;
    }
    if (occupant) {
      this.soundRitualCrystal(occupant);
      return;
    }
    const colorRevealed = (this.runeSockets.get(id)?.reveal ?? 0) > 0.34;
    const observations: Record<RuneId, string> = {
      moon: colorRevealed
        ? "A crescent is cut into the socket. Dust in its deepest edge burns violet beneath the borrowed light."
        : "A crescent is cut into the socket. Grey mineral dust has gathered in its deepest edge.",
      tide: colorRevealed
        ? "Three shallow currents cross the socket. Cyan grit glimmers between the lines."
        : "Three shallow currents cross the socket. Dull grit rests between the lines.",
      ember: colorRevealed
        ? "A flame-shaped hollow marks the socket. Amber grains cling to its narrow point."
        : "A flame-shaped hollow marks the socket. Cold ash clings to its narrow point.",
    };
    this.hooks.onStatus(observations[id]);
  }

  private activateFantasyRune(id: RuneId): void {
    const rune = this.runeStones.get(id);
    if (!rune) return;
    if (this.fantasyPuzzleSolved) {
      this.triggerRuneTinkle(rune, 0.72);
      this.hooks.onStatus("The rune holds its note. The waterfall cave is open.");
      return;
    }

    rune.hits += 1;
    this.triggerRuneTinkle(rune);
    if (rune.hits >= 4) {
      this.breakFantasyRune(rune);
      return;
    }
    const fractureWarning =
      rune.hits === 3
        ? " Hairline light fractures across it; another strike seems unwise."
        : "";

    for (const candidate of this.runeStones.values()) {
      if (candidate.broken) {
        this.hooks.onStatus(
          "The ritual cannot carry a broken note. Loose facets glimmer where one voice used to stand.",
        );
        return;
      }
    }

    const missingRunes = [...this.runeStones.values()].filter(
      (candidate) => !candidate.placed,
    );
    if (missingRunes.length > 0) {
      const missingSymbols = missingRunes
        .map((candidate) => runeCrystalDescriptors[candidate.id].symbol)
        .join(", ");
      this.hooks.onStatus(
        `The ${rune.id} crystal gives a dry click. No rooted light answers from: ${missingSymbols}.${fractureWarning}`,
      );
      return;
    }

    const sequence = ["moon", "tide", "ember"];
    const expected = sequence[this.runeProgress];
    if (id !== expected) {
      for (const candidate of this.runeStones.values()) {
        candidate.activated = false;
      }
      this.runeProgress = id === "moon" ? 1 : 0;
      if (id === "moon") rune.activated = true;
      this.syncRuneCrystalLocks();
      this.updateRuneInteractionLabels();
      this.hooks.onStatus(
        `${
          id === "moon"
            ? "Moon rune awake. Its note curls low, like water under stone."
            : "The runes dim together. A pale crescent is the last mark to disappear."
        }${fractureWarning}`,
      );
      return;
    }

    rune.activated = true;
    this.runeProgress += 1;
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    if (this.runeProgress < sequence.length) {
      const hints = {
        moon: "Moon rune awake. Its note curls low, like water under stone.",
        tide: "Tide rune awake. Amber reflections tremble across the final crystal.",
      } as const;
      this.hooks.onStatus(
        `${hints[id as keyof typeof hints] ?? "A rune answers."}${fractureWarning}`,
      );
      return;
    }

    this.fantasyPuzzleSolved = true;
    this.syncRuneCrystalLocks();
    if (this.caveSealCollider) {
      const colliderIndex = this.staticColliders.indexOf(this.caveSealCollider);
      if (colliderIndex >= 0) this.staticColliders.splice(colliderIndex, 1);
      this.caveSealCollider = null;
      this.refreshCollisionDebugVisuals();
    }
    if (this.caveSeal) this.caveSeal.visible = false;
    this.updateInteractionLabel("waterfall-chest", "Open chest");
    this.updateRuneInteractionLabels();
    this.hooks.onStatus(
      "Moon, tide, ember. The center waterfall parts. Warm light moves behind the water.",
      { kind: "achievement", title: "OPEN SESAME" },
    );
  }

  private createRuneAltar(parent: THREE.Group, x: number, z: number): void {
    const altar = new RuneAltar(this.materials, {
      onStatus: (message) => this.hooks.onStatus(message),
      getRevealTarget: (target) =>
        this.player.group.localToWorld(target.set(0, 2.46, 0.12)),
      onRevealPortfolio: () => this.hooks.onRequestPortfolio("monument"),
    });
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
  ): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
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
    const signalGeometry = colorGeometry(
      ensureNonIndexed(
        new THREE.OctahedronGeometry(0.15, 0),
      ).translate(0, 2.35, 0),
      accentColor,
    );
    const npcGeometry = mergeGeometries(
      [bodyGeometry, headGeometry, signalGeometry],
      false,
    );
    bodyGeometry.dispose();
    headGeometry.dispose();
    signalGeometry.dispose();
    if (npcGeometry) {
      const npcMesh = new THREE.Mesh(npcGeometry, this.materials.npc);
      npcMesh.castShadow = false;
      npcMesh.receiveShadow = true;
      group.add(npcMesh);
    }
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
      origin: new THREE.Vector3(x, 0, z),
      interactionId,
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
  ): void {
    let nextLine = 0;
    this.addInteraction(id, label, x, z, 2, () => {
      const line = lines[nextLine % lines.length];
      nextLine += 1;
      if (!line) return;
      this.emitNpcSpeech(id, speaker, line);
    });
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

  private createArchiveSignalPuzzle(parent: THREE.Group): void {
    const root = new THREE.Group();
    root.name = "archive-sunless-heliograph";
    parent.add(root);

    const relayConfigs = [
      {
        name: "violet",
        x: -8,
        z: 4,
        color: palette.violet,
        targets: [1, 2, 3] as const,
      },
      {
        name: "cyan",
        x: 8,
        z: 5,
        color: palette.cyan,
        targets: [0, 2, 3, "lens"] as const,
      },
      {
        name: "amber",
        x: -6,
        z: -6,
        color: palette.amber,
        targets: [0, 1, 3, "lens"] as const,
      },
      {
        name: "green",
        x: 10.2,
        z: 0.4,
        color: palette.green,
        targets: [0, 1, 2] as const,
      },
    ] as const;
    const relays = relayConfigs.map((config, id) =>
      this.createArchiveSignalRelay(
        root,
        id,
        config.name,
        config.x,
        config.z,
        config.color,
        config.targets,
        this.archiveSignalTargets[id] ?? 0,
        this.archiveSignalManualYaws[id] ?? null,
      ),
    );

    const source = new THREE.Group();
    source.name = "archive-sunless-emitter";
    source.position.set(-9.55, 0, 7.25);
    root.add(source);
    const sourceBase = addCylinder(
      source,
      1.12,
      1.38,
      0.36,
      12,
      [0, 0.18, 0],
      this.materials.darkStone,
    );
    sourceBase.castShadow = false;
    const sourceDeck = addCylinder(
      source,
      0.94,
      1.05,
      0.12,
      12,
      [0, 0.41, 0],
      this.materials.brass,
    );
    sourceDeck.castShadow = false;

    const sourceHeading = Math.atan2(
      relays[0]!.position.x - source.position.x,
      relays[0]!.position.z - source.position.z,
    );
    const sourceGimbal = new THREE.Group();
    sourceGimbal.position.y = 1.48;
    sourceGimbal.rotation.y = sourceHeading;
    source.add(sourceGimbal);
    for (const [index, radius] of [0.9, 0.67, 0.48].entries()) {
      const brace = new THREE.Mesh(
        new THREE.TorusGeometry(radius, index === 0 ? 0.075 : 0.045, 6, 32),
        this.materials.brass,
      );
      brace.rotation.y = index * 0.55;
      sourceGimbal.add(brace);
    }
    const sourceRings = [
      new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.032, 5, 36),
        new THREE.MeshBasicMaterial({
          color: palette.amber,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
      new THREE.Mesh(
        new THREE.TorusGeometry(0.57, 0.025, 5, 30),
        new THREE.MeshBasicMaterial({
          color: palette.cyan,
          transparent: true,
          opacity: 0.54,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    ];
    sourceRings[0]!.rotation.y = 0.34;
    sourceRings[1]!.rotation.y = -0.52;
    sourceGimbal.add(...sourceRings);
    const sourceCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffd381,
        emissive: palette.amber,
        emissiveIntensity: 1.45,
        roughness: 0.2,
        metalness: 0.18,
        flatShading: true,
      }),
    );
    sourceCore.scale.y = 1.35;
    sourceGimbal.add(sourceCore);
    const sourceLight = new THREE.PointLight(palette.amber, 0, 6.5, 2);
    sourceLight.castShadow = false;
    sourceGimbal.add(sourceLight);

    const collectorFocusPosition = new THREE.Vector3(0, 1.48, 0);
    const collectorPosition = new THREE.Vector3(1.08, 6.15, -0.78);
    const collectorAxis = collectorPosition
      .clone()
      .sub(collectorFocusPosition)
      .normalize();
    const collectorRoot = new THREE.Group();
    collectorRoot.name = "archive-heliograph-glass-collector";
    collectorRoot.position.copy(collectorPosition);
    collectorRoot.quaternion.setFromUnitVectors(up, collectorAxis);
    source.add(collectorRoot);

    const dishProfile = [
      new THREE.Vector2(0, -0.64),
      new THREE.Vector2(0.38, -0.615),
      new THREE.Vector2(0.78, -0.545),
      new THREE.Vector2(1.18, -0.415),
      new THREE.Vector2(1.58, -0.22),
      new THREE.Vector2(2.02, 0.055),
    ];
    const collectorDish = new THREE.Mesh(
      new THREE.LatheGeometry(dishProfile, 28),
      new THREE.MeshStandardMaterial({
        color: 0x9debf2,
        emissive: 0x5fddea,
        emissiveIntensity: 0.08,
        roughness: 0.12,
        metalness: 0.06,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    collectorDish.name = "archive-heliograph-glass-parabola";
    collectorDish.castShadow = false;
    collectorDish.receiveShadow = false;
    collectorDish.renderOrder = 3;
    collectorRoot.add(collectorDish);

    const collectorTrim = new THREE.Group();
    collectorTrim.name = "archive-heliograph-collector-trim";
    collectorRoot.add(collectorTrim);
    const collectorTrimGeometries: THREE.BufferGeometry[] = [];
    for (const [radius, tube, y, radialSegments] of [
      [2.03, 0.055, 0.055, 40],
      [1.58, 0.022, -0.215, 32],
      [1.18, 0.022, -0.41, 32],
      [0.78, 0.022, -0.54, 32],
    ] as const) {
      const contour = new THREE.TorusGeometry(
        radius,
        tube,
        radius === 2.03 ? 6 : 4,
        radialSegments,
      );
      contour.rotateX(Math.PI / 2);
      contour.translate(0, y, 0);
      collectorTrimGeometries.push(contour);
    }
    // Three asymmetric index tabs make the contour spin visually readable.
    for (let index = 0; index < 3; index += 1) {
      const angle = index * ((Math.PI * 2) / 3) + 0.24;
      const tab = new THREE.BoxGeometry(0.14, 0.11, 0.42);
      tab.rotateY(angle);
      tab.translate(
        Math.cos(angle) * 2.04,
        0.085,
        Math.sin(angle) * 2.04,
      );
      collectorTrimGeometries.push(tab);
    }
    const collectorTrimGeometry = mergeGeometries(
      collectorTrimGeometries,
      false,
    );
    for (const geometry of collectorTrimGeometries) geometry.dispose();
    if (collectorTrimGeometry) {
      const trim = new THREE.Mesh(
        collectorTrimGeometry,
        this.materials.brass,
      );
      trim.castShadow = false;
      collectorTrim.add(trim);
    }
    const ribPositions: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      ribPositions.push(
        0,
        -0.64,
        0,
        Math.cos(angle) * 2.02,
        0.055,
        Math.sin(angle) * 2.02,
      );
    }
    const ribGeometry = new THREE.BufferGeometry();
    ribGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(ribPositions, 3),
    );
    const collectorRibs = new THREE.LineSegments(
      ribGeometry,
      new THREE.LineBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    collectorRibs.renderOrder = 4;
    collectorRoot.add(collectorRibs);
    const collectorRimGlow = new THREE.Mesh(
      new THREE.TorusGeometry(2.04, 0.095, 6, 40),
      new THREE.MeshBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    collectorRimGlow.rotation.x = Math.PI / 2;
    collectorRimGlow.position.y = 0.055;
    collectorRimGlow.renderOrder = 5;
    collectorRoot.add(collectorRimGlow);
    const collectorFocusPoint = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({
        color: 0xf4ffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    collectorFocusPoint.position.y = -0.58;
    collectorFocusPoint.renderOrder = 6;
    collectorRoot.add(collectorFocusPoint);

    const createCollectorShaft = (
      start: THREE.Vector3,
      end: THREE.Vector3,
      startRadius: number,
      endRadius: number,
      opacity: number,
    ): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> => {
      const direction = end.clone().sub(start);
      const length = direction.length();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(
          endRadius,
          startRadius,
          length,
          12,
          1,
          true,
        ),
        new THREE.MeshBasicMaterial({
          color: 0xe8ffff,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      shaft.position.copy(start).add(end).multiplyScalar(0.5);
      shaft.quaternion.setFromUnitVectors(up, direction.normalize());
      shaft.castShadow = false;
      shaft.renderOrder = 2;
      source.add(shaft);
      return shaft;
    };
    const distantLightPosition = collectorPosition
      .clone()
      .addScaledVector(collectorAxis, 9.5);
    const collectorIncomingBeam = createCollectorShaft(
      collectorPosition,
      distantLightPosition,
      0.78,
      0.52,
      0.025,
    );
    collectorIncomingBeam.name = "archive-heliograph-incoming-starlight";
    const collectorFocusBeam = createCollectorShaft(
      collectorFocusPosition,
      collectorPosition,
      0.075,
      1.86,
      0,
    );
    collectorFocusBeam.name = "archive-heliograph-focus-cone";
    const collectorFocusCore = createCollectorShaft(
      collectorFocusPosition,
      collectorPosition,
      0.035,
      0.12,
      0,
    );
    collectorFocusCore.name = "archive-heliograph-focus-core";
    collectorFocusCore.renderOrder = 5;

    const collapseBeamFragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      24,
    );
    collapseBeamFragments.name =
      "archive-heliograph-collapse-light-fragments";
    collapseBeamFragments.count = 0;
    collapseBeamFragments.instanceMatrix.setUsage(
      THREE.DynamicDrawUsage,
    );
    collapseBeamFragments.frustumCulled = false;
    collapseBeamFragments.visible = false;
    collapseBeamFragments.renderOrder = 8;
    root.add(collapseBeamFragments);

    const progressColors = [
      palette.violet,
      palette.amber,
      palette.cyan,
      palette.green,
    ] as const;
    const progressPipPositions: THREE.Vector3[] = [];
    const progressPipColors = progressColors.map(
      (color) => new THREE.Color(color),
    );
    const progressPipDummy = new THREE.Object3D();
    const progressPips = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      4,
    );
    progressPips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    progressPips.frustumCulled = false;
    progressPips.renderOrder = 4;
    for (let index = 0; index < 4; index += 1) {
      const angle = THREE.MathUtils.lerp(
        -Math.PI * 0.72,
        Math.PI * 0.72,
        index / 3,
      );
      const position = new THREE.Vector3(
        Math.sin(angle) * 0.76,
        0.52,
        Math.cos(angle) * 0.76,
      );
      progressPipPositions.push(position);
      progressPipDummy.position.copy(position);
      progressPipDummy.rotation.y = angle;
      progressPipDummy.scale.setScalar(0.72);
      progressPipDummy.updateMatrix();
      progressPips.setMatrixAt(index, progressPipDummy.matrix);
      progressPips.setColorAt(
        index,
        progressPipColors[index]!.clone().multiplyScalar(0.18),
      );
    }
    source.add(progressPips);

    // Four relays can be followed by a lens pass and one visible failure
    // continuation, so keep one bounded segment beyond the solved loop.
    const maximumBeamSegments = 6;
    const createBeamRibbon = (maximumSegments: number): {
      mesh: ArchiveSignalBeamBatch["core"];
      positions: Float32Array;
      colors: Float32Array;
    } => {
      const positions = new Float32Array(maximumSegments * 4 * 3);
      const colors = new Float32Array(maximumSegments * 4 * 3);
      const indices = new Uint16Array(maximumSegments * 6);
      for (let index = 0; index < maximumSegments; index += 1) {
        const vertex = index * 4;
        const offset = index * 6;
        indices[offset] = vertex;
        indices[offset + 1] = vertex + 1;
        indices[offset + 2] = vertex + 2;
        indices[offset + 3] = vertex + 2;
        indices[offset + 4] = vertex + 1;
        indices[offset + 5] = vertex + 3;
      }
      const geometry = new THREE.BufferGeometry();
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", positionAttribute);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      mesh.frustumCulled = false;
      return { mesh, positions, colors };
    };
    const coreRibbon = createBeamRibbon(maximumBeamSegments);
    coreRibbon.mesh.name = "archive-signal-beam-core";
    coreRibbon.mesh.renderOrder = 4;
    root.add(coreRibbon.mesh);
    const auraRibbon = createBeamRibbon(maximumBeamSegments);
    auraRibbon.mesh.name = "archive-signal-beam-aura";
    auraRibbon.mesh.renderOrder = 3;
    root.add(auraRibbon.mesh);
    const beamPackets = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumBeamSegments,
    );
    beamPackets.name = "archive-signal-packets";
    beamPackets.count = 0;
    beamPackets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    beamPackets.frustumCulled = false;
    beamPackets.renderOrder = 5;
    root.add(beamPackets);
    const beams: ArchiveSignalBeamBatch = {
      core: coreRibbon.mesh,
      aura: auraRibbon.mesh,
      corePositions: coreRibbon.positions,
      coreColors: coreRibbon.colors,
      auraPositions: auraRibbon.positions,
      auraColors: auraRibbon.colors,
      packets: beamPackets,
      packetDummy: new THREE.Object3D(),
      starts: Array.from(
        { length: maximumBeamSegments },
        () => new THREE.Vector3(),
      ),
      ends: Array.from(
        { length: maximumBeamSegments },
        () => new THREE.Vector3(),
      ),
      colors: Array.from(
        { length: maximumBeamSegments },
        () => new THREE.Color(),
      ),
      coreWidths: new Float32Array(maximumBeamSegments),
      auraWidths: new Float32Array(maximumBeamSegments),
      count: 0,
    };

    const partialCoreRibbon = createBeamRibbon(1);
    partialCoreRibbon.mesh.name =
      "archive-signal-player-interruption-core";
    partialCoreRibbon.mesh.renderOrder = 7;
    partialCoreRibbon.mesh.visible = false;
    root.add(partialCoreRibbon.mesh);
    const partialAuraRibbon = createBeamRibbon(1);
    partialAuraRibbon.mesh.name =
      "archive-signal-player-interruption-aura";
    partialAuraRibbon.mesh.renderOrder = 6;
    partialAuraRibbon.mesh.visible = false;
    root.add(partialAuraRibbon.mesh);

    const impactRoot = new THREE.Group();
    impactRoot.name = "archive-signal-player-impact";
    impactRoot.visible = false;
    root.add(impactRoot);
    const impactCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    impactCore.renderOrder = 9;
    impactRoot.add(impactCore);
    const impactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.028, 5, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    impactRing.renderOrder = 8;
    impactRoot.add(impactRing);
    const impactFragments = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.055, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      8,
    );
    impactFragments.name =
      "archive-signal-player-impact-fragments";
    impactFragments.count = 0;
    impactFragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    impactFragments.frustumCulled = false;
    impactFragments.renderOrder = 9;
    impactRoot.add(impactFragments);
    const bodyShimmer = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.58, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    bodyShimmer.name = "archive-signal-player-body-shimmer";
    bodyShimmer.scale.set(1, 1.45, 1);
    bodyShimmer.renderOrder = 8;
    impactRoot.add(bodyShimmer);
    const interruption: ArchiveSignalInterruptionEffect = {
      partialCore: partialCoreRibbon.mesh,
      partialAura: partialAuraRibbon.mesh,
      partialCorePositions: partialCoreRibbon.positions,
      partialCoreColors: partialCoreRibbon.colors,
      partialAuraPositions: partialAuraRibbon.positions,
      partialAuraColors: partialAuraRibbon.colors,
      impactRoot,
      impactCore,
      impactRing,
      impactFragments,
      impactFragmentDummy: new THREE.Object3D(),
      bodyShimmer,
      result: {
        segmentIndex: -1,
        progress: 0,
        x: 0,
        y: 0,
        z: 0,
      },
      blocker: {
        x: 0,
        z: 0,
        minY: 0,
        maxY: 0,
        radius: this.playerRadius * 0.92,
      },
      direction: new THREE.Vector3(),
      partialEnd: new THREE.Vector3(),
      active: false,
      blend: 0,
    };

    const maximumPhaseRails = 6;
    const phaseRailRibbon = createBeamRibbon(maximumPhaseRails);
    const phaseRails = phaseRailRibbon.mesh;
    phaseRails.name = "archive-signal-phase-rails";
    phaseRails.renderOrder = 5;
    root.add(phaseRails);
    const phasePackets = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.085, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumPhaseRails,
    );
    phasePackets.name = "archive-signal-phase-packets";
    phasePackets.count = 0;
    phasePackets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    phasePackets.frustumCulled = false;
    phasePackets.renderOrder = 6;
    root.add(phasePackets);

    const lensPosition = new THREE.Vector3(6.3, 1.35, 1.4);
    const receiverHalo = new THREE.Mesh(
      new THREE.TorusGeometry(2.16, 0.055, 6, 42),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    receiverHalo.position.set(lensPosition.x, 0.38, lensPosition.z);
    receiverHalo.rotation.x = Math.PI / 2;
    receiverHalo.visible = false;
    receiverHalo.renderOrder = 3;
    root.add(receiverHalo);
    const resolvedColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.18, 6.2, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    resolvedColumn.position.set(lensPosition.x, 4.42, lensPosition.z);
    resolvedColumn.visible = false;
    resolvedColumn.renderOrder = 3;
    root.add(resolvedColumn);

    const feedbackColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.2, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xf4ffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    feedbackColumn.visible = false;
    feedbackColumn.renderOrder = 5;
    root.add(feedbackColumn);

    const lensOutcomeRoot = new THREE.Group();
    lensOutcomeRoot.name = "archive-signal-lens-outcome";
    lensOutcomeRoot.visible = false;
    root.add(lensOutcomeRoot);
    const lensOutcomeCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.19, 0),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    lensOutcomeCore.renderOrder = 7;
    lensOutcomeRoot.add(lensOutcomeCore);
    const lensOutcomeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.035, 5, 24),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    lensOutcomeRing.renderOrder = 6;
    lensOutcomeRoot.add(lensOutcomeRing);
    const lensOutcomeFragments = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      8,
    );
    lensOutcomeFragments.name = "archive-signal-lens-outcome-fragments";
    lensOutcomeFragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lensOutcomeFragments.frustumCulled = false;
    lensOutcomeFragments.renderOrder = 7;
    lensOutcomeRoot.add(lensOutcomeFragments);

    const freeAimImpactRoot = new THREE.Group();
    freeAimImpactRoot.name = "archive-signal-free-aim-impact";
    freeAimImpactRoot.visible = false;
    root.add(freeAimImpactRoot);
    const freeAimImpactCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    freeAimImpactCore.renderOrder = 7;
    freeAimImpactRoot.add(freeAimImpactCore);
    const freeAimImpactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.026, 5, 20),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    freeAimImpactRing.renderOrder = 6;
    freeAimImpactRoot.add(freeAimImpactRing);

    const constellationRoot = new THREE.Group();
    constellationRoot.name = "archive-resolved-constellation-root";
    constellationRoot.position.set(lensPosition.x, 0, lensPosition.z);
    root.add(constellationRoot);
    const constellationBodyGeometry = new THREE.IcosahedronGeometry(
      0.88,
      1,
    );
    const constellationBody = new THREE.Mesh(
      constellationBodyGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x070914,
        emissive: 0x211845,
        emissiveIntensity: 0.28,
        roughness: 0.62,
        metalness: 0.18,
        flatShading: true,
        transparent: true,
        opacity: 0,
        depthWrite: true,
      }),
    );
    constellationBody.name = "archive-decoded-eclipsed-world";
    constellationBody.position.y = archiveDecodedSkyBodyY;
    constellationBody.visible = false;
    constellationBody.renderOrder = 7;
    constellationRoot.add(constellationBody);
    const constellationShell = new THREE.Mesh(
      constellationBodyGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xbfefff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    constellationShell.name = "archive-decoded-world-limb";
    constellationShell.position.copy(constellationBody.position);
    constellationShell.scale.setScalar(1.16);
    constellationShell.visible = false;
    constellationShell.renderOrder = 8;
    constellationRoot.add(constellationShell);
    const constellationEchoes = [
      0xff4f8b,
      palette.cyan,
      palette.violet,
    ].map((color, index) => {
      const echo = new THREE.Mesh(
        constellationBodyGeometry,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          wireframe: index === 2,
        }),
      );
      echo.name = `archive-decoded-world-thunder-echo-${index}`;
      echo.position.copy(constellationBody.position);
      echo.visible = false;
      echo.renderOrder = 9;
      constellationRoot.add(echo);
      return echo;
    });
    const constellationOrbitConfigs = [
      {
        radius: 1.18,
        color: palette.amber,
        arc: Math.PI * 1.62,
        rotation: new THREE.Euler(Math.PI / 2 + 0.18, 0.34, 0.15),
      },
      {
        radius: 1.46,
        color: palette.cyan,
        arc: Math.PI * 1.42,
        rotation: new THREE.Euler(Math.PI / 2 - 0.25, -0.42, 1.68),
      },
      {
        radius: 1.72,
        color: palette.violet,
        arc: Math.PI * 1.18,
        rotation: new THREE.Euler(Math.PI / 2 + 0.38, 0.22, 3.04),
      },
    ] as const;
    const constellationOrbits = constellationOrbitConfigs.map(
      ({ radius, color, arc, rotation }, index) => {
        const orbit = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.035, 5, 38, arc),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          }),
        );
        orbit.name = `archive-decoded-orbit-${index}`;
        orbit.position.copy(constellationBody.position);
        orbit.rotation.copy(rotation);
        orbit.visible = false;
        orbit.renderOrder = 8;
        constellationRoot.add(orbit);
        return orbit;
      },
    );
    const maximumConstellationSegments =
      archiveDecodedSkySegments.length;
    const constellationRibbon = createBeamRibbon(
      maximumConstellationSegments,
    );
    const constellation = constellationRibbon.mesh;
    constellation.name = "archive-resolved-constellation";
    constellation.visible = false;
    constellation.renderOrder = 6;
    constellationRoot.add(constellation);
    const constellationAuraRibbon = createBeamRibbon(
      maximumConstellationSegments,
    );
    const constellationAura = constellationAuraRibbon.mesh;
    constellationAura.name = "archive-resolved-constellation-aura";
    constellationAura.visible = false;
    constellationAura.renderOrder = 5;
    constellationRoot.add(constellationAura);
    const constellationStarPositions = Array.from(
      { length: 6 },
      () => new THREE.Vector3(),
    );
    const constellationStarDummy = new THREE.Object3D();
    const constellationStars = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      6,
    );
    constellationStars.name = "archive-resolved-constellation-stars";
    constellationStars.count = 0;
    constellationStars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    constellationStars.frustumCulled = false;
    constellationStars.renderOrder = 7;
    constellationRoot.add(constellationStars);
    const constellationNodeColors = [
      0xf4ffff,
      palette.violet,
      palette.amber,
      palette.cyan,
      palette.green,
      0xf4ffff,
    ] as const;
    for (let index = 0; index < 6; index += 1) {
      constellationStars.setColorAt(
        index,
        new THREE.Color(
          constellationNodeColors[index] ?? 0xf4ffff,
        ),
      );
    }

    this.archiveSignalPuzzle = {
      root,
      source,
      sourceCore,
      sourceRings,
      sourceLight,
      collectorRoot,
      collectorTrim,
      collectorDish,
      collectorRimGlow,
      collectorIncomingBeam,
      collectorFocusBeam,
      collectorFocusCore,
      collectorFocusPoint,
      collectorFocusStart: collectorFocusPosition
        .clone()
        .add(source.position),
      collectorFocusEnd: collectorPosition.clone().add(source.position),
      collectorIncomingStart: collectorPosition
        .clone()
        .add(source.position),
      collectorIncomingEnd: distantLightPosition
        .clone()
        .add(source.position),
      collapseBeamFragments,
      collapseBeamFragmentDummy: new THREE.Object3D(),
      powerBlend: this.archiveSignalPowered ? 1 : 0,
      powerTarget: this.archiveSignalPowered ? 1 : 0,
      powerAnnouncementPending: false,
      progressPips,
      progressPipPositions,
      progressPipColors,
      progressPipDummy,
      progressPipColorScratch: new THREE.Color(),
      relays,
      beams,
      interruption,
      phaseRails,
      phaseRailPositions: phaseRailRibbon.positions,
      phaseRailColors: phaseRailRibbon.colors,
      phaseRailCount: 0,
      phasePackets,
      phasePacketDummy: new THREE.Object3D(),
      phasePacketStarts: Array.from(
        { length: maximumPhaseRails },
        () => new THREE.Vector3(),
      ),
      phasePacketEnds: Array.from(
        { length: maximumPhaseRails },
        () => new THREE.Vector3(),
      ),
      phasePacketOffsets: new Float32Array(maximumPhaseRails),
      phasePacketOrigins: Array.from(
        { length: maximumPhaseRails },
        () => -1,
      ),
      phasePacketRouteSegments: Array.from(
        { length: maximumPhaseRails },
        () => -1,
      ),
      phasePacketCount: 0,
      lensPosition,
      receiverHalo,
      resolvedColumn,
      feedbackColumn,
      lensOutcomeRoot,
      lensOutcomeCore,
      lensOutcomeRing,
      lensOutcomeFragments,
      lensOutcomeDummy: new THREE.Object3D(),
      lensOutcome: null,
      freeAimImpactRoot,
      freeAimImpactCore,
      freeAimImpactRing,
      freeAimImpactActive: false,
      constellationRoot,
      constellation,
      constellationPositions: constellationRibbon.positions,
      constellationColors: constellationRibbon.colors,
      constellationAura,
      constellationAuraPositions: constellationAuraRibbon.positions,
      constellationAuraColors: constellationAuraRibbon.colors,
      constellationSegmentCount: 0,
      constellationBody,
      constellationShell,
      constellationEchoes,
      constellationOrbits,
      constellationStars,
      constellationStarPositions,
      constellationStarDummy,
      route: [],
      routeRelayOrder: [],
      result: "loop",
      visitedCount: 0,
      matchedPhaseCount: 0,
      feedbackStrength: 0,
      feedbackBlend: 0,
      feedbackPoint: new THREE.Vector3(),
      feedbackSegmentIndex: -1,
      unstableFeedback: false,
      unstablePulseBudget: 0,
      solved: false,
      resolutionBlend: 0,
      pulseAge: 2,
      spellPulseAge: 2,
      projectionDisruptionAge: archiveProjectionDisruptionDuration,
      projectionDisruptionStrength: 0,
    };

    this.registerClimbableBox(
      sourceBase,
      "archive-heliograph-base",
      "You balance on the heliograph plinth. Four relay seals wait below.",
      undefined,
      false,
    );
    for (const occluder of [sourceBase, sourceDeck, sourceGimbal]) {
      this.registerPlayerOccluder(occluder);
    }
    // The collector must be sorted in the same late pass as the avatar.
    // Otherwise enabling the occlusion reveal pass while the player stands on
    // the plinth draws the avatar over the glass regardless of their actual
    // depth. Keeping both here lets the opaque avatar populate depth before
    // Three.js composites the transparent dish, ribs, and shafts.
    const lateDepthAssemblies: THREE.Object3D[] = [
      collectorRoot,
      collectorIncomingBeam,
      collectorFocusBeam,
      collectorFocusCore,
    ];
    for (const assembly of lateDepthAssemblies) {
      assembly.traverse((object) => {
        object.layers.set(playerRenderLayer);
      });
    }
    // Preserve direct pointer activation after moving the visible dish away
    // from the ordinary world layer.
    collectorDish.layers.enable(pointerInteractionLayer);
    const toggleSource = () => this.toggleArchiveSignalEmitter();
    this.addInteraction(
      "archive-signal-source",
      this.archiveSignalPowered
        ? "Quench the sunless heliograph"
        : "Wake the sunless heliograph",
      source.position.x,
      source.position.z,
      2.35,
      toggleSource,
    );
    for (const object of [sourceCore, collectorDish]) {
      this.pointerActions.push({
        object,
        action: toggleSource,
        maximumDistance: 5.4,
      });
    }

    this.rebuildArchiveSignalRoute(false);
    this.updateArchiveSignalPuzzle(0);
  }

  private createArchiveSignalRelay(
    parent: THREE.Group,
    id: number,
    name: string,
    x: number,
    z: number,
    color: number,
    targetOptions: readonly ArchiveSignalTarget[],
    targetIndex: number,
    manualYaw: number | null,
  ): ArchiveSignalRelay {
    const accent = new THREE.Color(color);
    const facetMaterial = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.64),
      emissive: accent,
      emissiveIntensity: 0.28,
      roughness: 0.24,
      metalness: 0.12,
      flatShading: true,
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    const group = new THREE.Group();
    group.name = `archive-${name}-signal-prism`;
    group.position.set(x, 0, z);
    parent.add(group);
    const base = addCylinder(
      group,
      0.72,
      0.88,
      0.3,
      8,
      [0, 0.15, 0],
      this.materials.darkStone,
    );
    base.castShadow = false;
    const brassRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.67, 0.05, 5, 24),
      this.materials.brass,
    );
    brassRing.rotation.x = Math.PI / 2;
    brassRing.position.y = 0.33;
    group.add(brassRing);
    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.84, 20),
      glowMaterial,
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.32;
    groundGlow.renderOrder = 2;
    group.add(groundGlow);

    const aimPivot = new THREE.Group();
    group.add(aimPivot);
    const shardGeometry = new THREE.OctahedronGeometry(0.3, 0);
    const centerShard = new THREE.Mesh(shardGeometry, facetMaterial);
    centerShard.position.set(0, 0.98, 0);
    centerShard.rotation.x = -0.28;
    centerShard.scale.set(0.86, 1.82, 0.86);
    group.add(centerShard);
    const centerCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      coreMaterial,
    );
    centerCore.position.copy(centerShard.position);
    centerCore.rotation.copy(centerShard.rotation);
    centerCore.scale.set(0.92, 2.12, 0.92);
    centerCore.renderOrder = 3;
    group.add(centerCore);
    for (const [index, side] of [-1, 1].entries()) {
      const shard = new THREE.Mesh(shardGeometry, facetMaterial);
      shard.position.set(side * 0.31, 0.62 + index * 0.06, -0.08);
      shard.rotation.set(-0.18, side * 0.2, side * 0.16);
      shard.scale.set(0.52, 1.12 - index * 0.08, 0.52);
      group.add(shard);
    }
    const indicatorBarGeometry = new THREE.BoxGeometry(0.07, 0.06, 0.78);
    indicatorBarGeometry.translate(0, 0.49, 0.34);
    const apertureGeometry = new THREE.TorusGeometry(0.22, 0.035, 5, 20);
    apertureGeometry.translate(0, 1.1, 0.4);
    const indicatorGeometry = mergeGeometries(
      [indicatorBarGeometry, apertureGeometry],
      false,
    );
    indicatorBarGeometry.dispose();
    apertureGeometry.dispose();
    if (indicatorGeometry) {
      const indicator = new THREE.Mesh(
        indicatorGeometry,
        indicatorMaterial,
      );
      indicator.castShadow = false;
      indicator.receiveShadow = false;
      indicator.renderOrder = 3;
      aimPivot.add(indicator);
    }
    const normalizedTargetIndex = THREE.MathUtils.euclideanModulo(
      targetIndex,
      targetOptions.length,
    );
    const pointerProxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    pointerProxy.name = `archive-signal-prism-pointer-${id}`;
    pointerProxy.position.set(x, 0.92, z);
    pointerProxy.scale.y = 1.35;
    pointerProxy.layers.set(pointerInteractionLayer);
    parent.add(pointerProxy);
    const relay: ArchiveSignalRelay = {
      id,
      name,
      group,
      aimPivot,
      pointerProxy,
      position: new THREE.Vector3(x, 1.1, z),
      beamHeight: 1.1,
      targetOptions,
      targetIndex: normalizedTargetIndex,
      manualYaw,
      aimTarget:
        targetOptions[normalizedTargetIndex] ??
        targetOptions[0] ??
        "void",
      aimPosition: new THREE.Vector3(),
      targetYaw: 0,
      currentYaw: 0,
      accent,
      facetMaterial,
      coreMaterial,
      glowMaterial,
      indicatorMaterial,
      active: false,
      activeBlend: 0,
      pulseAge: 2,
    };
    const turnRelay = () => this.turnArchiveSignalRelay(id);
    this.addInteraction(
      `archive-signal-prism-${id}`,
      "Turn archive prism",
      x,
      z,
      1.95,
      turnRelay,
    );
    this.registerClimbableBox(
      base,
      `archive-signal-prism-base-${id}`,
      undefined,
      undefined,
      false,
    );
    const relayCollisionHalfHeight =
      (archiveSignalRelayCollisionTop -
        archiveSignalRelayCollisionBottom) /
      2;
    const relayCollider = this.addStaticBox(
      x,
      archiveSignalRelayCollisionBottom + relayCollisionHalfHeight,
      z,
      0.34,
      relayCollisionHalfHeight,
      0.34,
      archiveSignalRelayCollisionTop,
      archiveSignalRelayCollisionTop,
    );
    // Relay faces use the wider authored optical target above. Excluding their
    // small movement boxes prevents a valid crystal hit from being reported as
    // generic hardware impact just before reaching its centre.
    relayCollider.blocksRay = false;
    this.registerPlayerOccluder(group);
    return relay;
  }

  private toggleArchiveSignalEmitter(): void {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return;
    this.archiveSignalPowered = !this.archiveSignalPowered;
    puzzle.powerTarget = this.archiveSignalPowered ? 1 : 0;
    puzzle.powerAnnouncementPending = this.archiveSignalPowered;
    puzzle.pulseAge = 0;
    for (const relay of puzzle.relays) {
      relay.pulseAge = Math.min(relay.pulseAge, 0.18);
    }
    this.updateInteractionLabel(
      "archive-signal-source",
      this.archiveSignalPowered
        ? "Quench the sunless heliograph"
        : "Wake the sunless heliograph",
    );
    this.hooks.onStatus(
      this.archiveSignalPowered
        ? "The suspended glass catches a pale ray from beyond the Archive. Brass contours answer one by one as the parabola begins to concentrate it."
        : "The aperture closes first. Routed light withdraws toward the collector while its brass contours coast into silence.",
    );
  }

  private turnArchiveSignalRelay(id: number): void {
    const puzzle = this.archiveSignalPuzzle;
    const relay = puzzle?.relays[id];
    if (!puzzle || !relay) return;
    if (relay.manualYaw === null) {
      relay.targetIndex =
        (relay.targetIndex + 1) % relay.targetOptions.length;
    } else {
      let nearestIndex = relay.targetIndex;
      let nearestDifference = Number.POSITIVE_INFINITY;
      for (const [index, target] of relay.targetOptions.entries()) {
        const targetPosition =
          this.getArchiveSignalTargetPosition(target);
        if (!targetPosition) continue;
        const yaw = Math.atan2(
          targetPosition.x - relay.position.x,
          targetPosition.z - relay.position.z,
        );
        const difference = Math.abs(
          Math.atan2(
            Math.sin(yaw - relay.manualYaw),
            Math.cos(yaw - relay.manualYaw),
          ),
        );
        if (difference >= nearestDifference) continue;
        nearestDifference = difference;
        nearestIndex = index;
      }
      relay.targetIndex = nearestIndex;
    }
    relay.manualYaw = null;
    this.archiveSignalManualYaws[id] = null;
    this.archiveSignalTargets[id] = relay.targetIndex;
    relay.pulseAge = 0;
    puzzle.pulseAge = 0;
    this.rebuildArchiveSignalRoute(true, relay);
  }

  private getArchiveSignalTargetPosition(
    target: ArchiveSignalTarget,
  ): THREE.Vector3 | null {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return null;
    if (target === "lens") return puzzle.lensPosition;
    if (target === "void") return null;
    return puzzle.relays[target]?.position ?? null;
  }

  private getArchiveSignalTargetName(target: ArchiveSignalTarget): string {
    if (target === "lens") return "the observability lens";
    if (target === "void") return "an unmarked bearing";
    const relay = this.archiveSignalPuzzle?.relays[target];
    return relay ? `the ${relay.name} prism` : "an empty bearing";
  }

  /**
   * Resolves a relay's effective optical target. Detents point at authored
   * targets; free aim first catches another prism, then the nearest finite
   * solid collider, and otherwise continues beyond every reachable camera
   * framing. The observability field is deliberately absent from this hit
   * test: light can pass through it.
   */
  private resolveArchiveSignalRelayAim(
    relay: ArchiveSignalRelay,
  ): ArchiveSignalTarget {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return "void";
    if (relay.manualYaw === null) {
      const target =
        relay.targetOptions[relay.targetIndex] ??
        relay.targetOptions[0] ??
        "void";
      const targetPosition =
        this.getArchiveSignalTargetPosition(target);
      relay.aimTarget = target;
      if (targetPosition) {
        relay.aimPosition.copy(targetPosition);
        relay.targetYaw = Math.atan2(
          targetPosition.x - relay.position.x,
          targetPosition.z - relay.position.z,
        );
      }
      return target;
    }

    const directionX = Math.sin(relay.manualYaw);
    const directionZ = Math.cos(relay.manualYaw);
    let nearestRelay: ArchiveSignalRelay | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of puzzle.relays) {
      if (candidate.id === relay.id) continue;
      const offsetX = candidate.position.x - relay.position.x;
      const offsetZ = candidate.position.z - relay.position.z;
      const distanceAlongRay =
        offsetX * directionX + offsetZ * directionZ;
      if (
        distanceAlongRay <= 0.48 ||
        distanceAlongRay >= nearestDistance
      ) {
        continue;
      }
      const perpendicularDistance = Math.abs(
        offsetX * directionZ - offsetZ * directionX,
      );
      if (perpendicularDistance > 0.86) continue;
      nearestRelay = candidate;
      nearestDistance = distanceAlongRay;
    }
    relay.targetYaw = relay.manualYaw;
    const solidDistance = findFirstHorizontalRayBoxDistance(
      relay.position.x,
      relay.position.z,
      directionX,
      directionZ,
      relay.beamHeight,
      this.staticColliders,
      archiveSignalFreeAimMinimumDistance,
      archiveSignalAmberVoidRadius,
    );
    if (
      nearestRelay &&
      (solidDistance === null || nearestDistance <= solidDistance)
    ) {
      relay.aimTarget = nearestRelay.id;
      relay.aimPosition.copy(nearestRelay.position);
      return nearestRelay.id;
    }

    const distance =
      solidDistance === null
        ? archiveSignalAmberVoidRadius
        : Math.max(
            archiveSignalFreeAimMinimumDistance,
            solidDistance - archiveSignalSolidHitInset,
          );
    relay.aimTarget = "void";
    relay.aimPosition.set(
      relay.position.x + directionX * distance,
      relay.beamHeight,
      relay.position.z + directionZ * distance,
    );
    return "void";
  }

  private getArchiveSignalLensContinuation(
    relay: ArchiveSignalRelay,
    endpoint: THREE.Vector3,
  ): ArchiveSignalLensOutcome {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return null;
    if (relay.id === 1) {
      endpoint.copy(archiveSignalCyanMonitorEndpoint);
      return "cyan-monitor";
    }
    if (relay.id !== 2) return null;

    const directionX = puzzle.lensPosition.x - relay.position.x;
    const directionZ = puzzle.lensPosition.z - relay.position.z;
    const length = Math.max(
      0.001,
      Math.hypot(directionX, directionZ),
    );
    const normalizedX = directionX / length;
    const normalizedZ = directionZ / length;
    const projection =
      puzzle.lensPosition.x * normalizedX +
      puzzle.lensPosition.z * normalizedZ;
    const radialSquared =
      puzzle.lensPosition.x * puzzle.lensPosition.x +
      puzzle.lensPosition.z * puzzle.lensPosition.z;
    const distanceToVoid =
      -projection +
      Math.sqrt(
        Math.max(
          0,
          projection * projection +
            archiveSignalAmberVoidRadius * archiveSignalAmberVoidRadius -
            radialSquared,
        ),
      );
    endpoint.set(
      puzzle.lensPosition.x + normalizedX * distanceToVoid,
      relay.beamHeight,
      puzzle.lensPosition.z + normalizedZ * distanceToVoid,
    );
    return "amber-void";
  }

  private writeArchiveSignalRibbonSegment(
    positions: Float32Array,
    colors: Float32Array,
    index: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color,
    width: number,
  ): void {
    const directionX = end.x - start.x;
    const directionZ = end.z - start.z;
    const horizontalLength = Math.max(
      0.001,
      Math.hypot(directionX, directionZ),
    );
    const perpendicularX = (-directionZ / horizontalLength) * width;
    const perpendicularZ = (directionX / horizontalLength) * width;
    const offset = index * 12;
    positions[offset] = start.x + perpendicularX;
    positions[offset + 1] = start.y;
    positions[offset + 2] = start.z + perpendicularZ;
    positions[offset + 3] = start.x - perpendicularX;
    positions[offset + 4] = start.y;
    positions[offset + 5] = start.z - perpendicularZ;
    positions[offset + 6] = end.x + perpendicularX;
    positions[offset + 7] = end.y;
    positions[offset + 8] = end.z + perpendicularZ;
    positions[offset + 9] = end.x - perpendicularX;
    positions[offset + 10] = end.y;
    positions[offset + 11] = end.z - perpendicularZ;
    for (let component = 0; component < 12; component += 3) {
      colors[offset + component] = color.r;
      colors[offset + component + 1] = color.g;
      colors[offset + component + 2] = color.b;
    }
  }

  private setArchiveSignalBeamSegment(
    beams: ArchiveSignalBeamBatch,
    index: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: THREE.Color,
    energy = 1,
    coreScale = 1,
    clipEnd = true,
  ): void {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length <= 0.01) return;
    direction.divideScalar(length);
    const clippedStart = start
      .clone()
      .addScaledVector(direction, 0.42);
    const clippedEnd = clipEnd
      ? end.clone().addScaledVector(direction, -0.42)
      : end.clone();
    const coreWidth = 0.045 * energy * coreScale;
    const auraWidth = 0.14 * (0.82 + energy * 0.18);
    beams.starts[index]?.copy(clippedStart);
    beams.ends[index]?.copy(clippedEnd);
    beams.colors[index]?.copy(color);
    beams.coreWidths[index] = coreWidth;
    beams.auraWidths[index] = auraWidth;
    this.writeArchiveSignalRibbonSegment(
      beams.corePositions,
      beams.coreColors,
      index,
      clippedStart,
      clippedEnd,
      color,
      coreWidth,
    );
    this.writeArchiveSignalRibbonSegment(
      beams.auraPositions,
      beams.auraColors,
      index,
      clippedStart,
      clippedEnd,
      color,
      auraWidth,
    );
    beams.packets.setColorAt(index, color);
  }

  private findArchiveSignalFeedback(
    route: readonly THREE.Vector3[],
  ): {
    strength: number;
    point: THREE.Vector3;
    segmentIndex: number;
  } {
    const lens = this.archiveSignalPuzzle?.lensPosition;
    const best = {
      strength: 0,
      point: new THREE.Vector3(),
      segmentIndex: -1,
    };
    if (!lens) return best;
    const captureRadius = 2.05;
    for (let index = 0; index < route.length - 1; index += 1) {
      const start = route[index];
      const end = route[index + 1];
      if (!start || !end) continue;
      // A segment ending at the lens is reception. Feedback must cross the
      // field and continue onward, as the green-to-violet return does.
      if (
        Math.hypot(end.x - lens.x, end.z - lens.z) <= 0.05
      ) {
        continue;
      }
      const directionX = end.x - start.x;
      const directionZ = end.z - start.z;
      const lengthSquared =
        directionX * directionX + directionZ * directionZ;
      if (lengthSquared <= 0.0001) continue;
      const progress = THREE.MathUtils.clamp(
        ((lens.x - start.x) * directionX +
          (lens.z - start.z) * directionZ) /
          lengthSquared,
        0,
        1,
      );
      if (progress <= 0.06 || progress >= 0.94) continue;
      const pointX = start.x + directionX * progress;
      const pointZ = start.z + directionZ * progress;
      const centerDistance = Math.hypot(
        pointX - lens.x,
        pointZ - lens.z,
      );
      if (centerDistance >= captureRadius) continue;
      // Center crossings carry the strongest raw amplification. Phase order is
      // evaluated separately, so a bright wrong route still cannot resolve.
      const strength =
        1 -
        THREE.MathUtils.smoothstep(
          centerDistance,
          0.05,
          captureRadius,
        );
      if (strength <= best.strength) continue;
      best.strength = strength;
      best.segmentIndex = index;
      best.point.set(
        pointX,
        THREE.MathUtils.lerp(start.y, end.y, progress),
        pointZ,
      );
    }
    return best;
  }

  private rebuildArchiveSignalRoute(
    announce: boolean,
    turnedRelay?: ArchiveSignalRelay,
    announcementSource: "relay" | "power" = "relay",
  ): void {
    this.archiveSignalRouteDirty = false;
    const puzzle = this.archiveSignalPuzzle;
    const firstRelay = puzzle?.relays[0];
    if (!puzzle || !firstRelay) return;
    const sourcePoint = new THREE.Vector3(
      puzzle.source.position.x,
      1.48,
      puzzle.source.position.z,
    );
    const route = [sourcePoint, firstRelay.position.clone()];
    const visited = new Set<number>();
    const visitedOrder: number[] = [];
    const colors = [new THREE.Color(0xf4ffff)];
    let current = firstRelay;
    let result: ArchiveSignalRouteResult = "loop";
    let reachedLens = false;
    let closedAtRelay: number | null = null;
    let lensOutcome: ArchiveSignalLensOutcome = null;
    const turnedRelayWasReceiving =
      turnedRelay === undefined ||
      turnedRelay.id === firstRelay.id ||
      puzzle.routeRelayOrder.includes(turnedRelay.id);

    for (let step = 0; step < puzzle.relays.length; step += 1) {
      visited.add(current.id);
      visitedOrder.push(current.id);
      current.active = true;
      const target = this.resolveArchiveSignalRelayAim(current);
      route.push(current.aimPosition.clone());
      colors.push(current.accent);
      if (target === "void") {
        result = "open";
        break;
      }
      if (target === "lens") {
        reachedLens = true;
        result = "incomplete";
        const continuation = new THREE.Vector3();
        lensOutcome = this.getArchiveSignalLensContinuation(
          current,
          continuation,
        );
        if (lensOutcome) {
          route.push(continuation);
          colors.push(current.accent);
          result =
            lensOutcome === "amber-void" ? "open" : "incomplete";
        }
        break;
      }
      if (visited.has(target)) {
        closedAtRelay = target;
        result = "loop";
        break;
      }
      const next = puzzle.relays[target];
      if (!next) break;
      current = next;
    }

    let matchedPhaseCount = 0;
    while (
      matchedPhaseCount < visitedOrder.length &&
      visitedOrder[matchedPhaseCount] ===
        archiveSignalPhaseOrder[matchedPhaseCount]
    ) {
      matchedPhaseCount += 1;
    }
    const phaseOrderResolved =
      visitedOrder.length === archiveSignalPhaseOrder.length &&
      matchedPhaseCount === archiveSignalPhaseOrder.length;
    const feedback = this.findArchiveSignalFeedback(route);
    const feedbackLoopClosed =
      !reachedLens &&
      closedAtRelay === firstRelay.id &&
      feedback.strength >= 0.75;
    if (feedbackLoopClosed && phaseOrderResolved) {
      result = "resolved";
    }

    for (const relay of puzzle.relays) {
      relay.active = visited.has(relay.id);
      this.resolveArchiveSignalRelayAim(relay);
      if (relay.currentYaw === 0 && puzzle.route.length === 0) {
        relay.currentYaw = relay.targetYaw;
        relay.aimPivot.rotation.y = relay.currentYaw;
      }
    }

    let phaseRailCount = 0;
    for (
      let segmentIndex = 1;
      segmentIndex < route.length - 1;
      segmentIndex += 1
    ) {
      const originRelay = visitedOrder[segmentIndex - 1];
      if (
        originRelay !== 0 &&
        originRelay !== 2 &&
        originRelay !== 1
      ) {
        continue;
      }
      const start = route[segmentIndex];
      const end = route[segmentIndex + 1];
      const relay = puzzle.relays[originRelay];
      if (!start || !end || !relay) continue;
      const direction = new THREE.Vector3().subVectors(end, start);
      const distance = direction.length();
      if (distance <= 0.01) continue;
      direction.divideScalar(distance);
      const clippedStart = start
        .clone()
        .addScaledVector(direction, 0.43);
      const clippedEnd = end
        .clone()
        .addScaledVector(direction, -0.43);
      const horizontalLength = Math.max(
        0.001,
        Math.hypot(direction.x, direction.z),
      );
      const perpendicularX = -direction.z / horizontalLength;
      const perpendicularZ = direction.x / horizontalLength;
      const startSpread =
        originRelay === 0 ? 0.025 : originRelay === 2 ? 0.16 : 0.24;
      const endSpread =
        originRelay === 0 ? 0.16 : originRelay === 2 ? 0.24 : 0.025;
      const railWidth =
        originRelay === 2 ? 0.048 : originRelay === 1 ? 0.038 : 0.03;
      for (const side of [-1, 1] as const) {
        if (phaseRailCount >= puzzle.phasePacketStarts.length) break;
        const railStart = clippedStart.clone();
        railStart.x += perpendicularX * startSpread * side;
        railStart.z += perpendicularZ * startSpread * side;
        const railEnd = clippedEnd.clone();
        railEnd.x += perpendicularX * endSpread * side;
        railEnd.z += perpendicularZ * endSpread * side;
        this.writeArchiveSignalRibbonSegment(
          puzzle.phaseRailPositions,
          puzzle.phaseRailColors,
          phaseRailCount,
          railStart,
          railEnd,
          relay.accent,
          railWidth,
        );
        puzzle.phasePacketStarts[phaseRailCount]?.copy(railStart);
        puzzle.phasePacketEnds[phaseRailCount]?.copy(railEnd);
        puzzle.phasePacketOrigins[phaseRailCount] = originRelay;
        puzzle.phasePacketRouteSegments[phaseRailCount] =
          segmentIndex;
        puzzle.phasePacketOffsets[phaseRailCount] =
          originRelay === 2
            ? side === -1
              ? 0
              : 0.5
            : side === -1
              ? 0
              : originRelay === 0
                ? 0.06
                : 0.18;
        puzzle.phasePackets.setColorAt(
          phaseRailCount,
          relay.accent,
        );
        phaseRailCount += 1;
      }
    }
    puzzle.phaseRailCount = phaseRailCount;
    puzzle.phasePacketCount = phaseRailCount;
    puzzle.phaseRails.geometry.setDrawRange(0, phaseRailCount * 6);
    (
      puzzle.phaseRails.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    (
      puzzle.phaseRails.geometry.getAttribute(
        "color",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    puzzle.phaseRails.visible = phaseRailCount > 0;
    puzzle.phasePackets.count = phaseRailCount;
    if (puzzle.phasePackets.instanceColor) {
      puzzle.phasePackets.instanceColor.needsUpdate = true;
    }

    const beamCount = Math.min(
      puzzle.beams.starts.length,
      Math.max(0, route.length - 1),
    );
    const feedbackWhite = new THREE.Color(0xf4ffff);
    for (let index = 0; index < beamCount; index += 1) {
      const start = route[index];
      const end = route[index + 1];
      if (!start || !end) continue;
      const downstream =
        feedback.segmentIndex >= 0 &&
        index > feedback.segmentIndex;
      const originRelay =
        index === 0 ? null : visitedOrder[index - 1] ?? null;
      const splitCoreScale =
        originRelay === 0
          ? 0.26
          : originRelay === 2
            ? 0.32
            : originRelay === 1
              ? 0.58
              : 1;
      const circulating = result === "resolved";
      const segmentColor = (
        colors[index] ?? colors[colors.length - 1]!
      ).clone();
      if (circulating) {
        segmentColor.lerp(
          feedbackWhite,
          feedback.strength * 0.12,
        );
      } else if (downstream) {
        segmentColor.lerp(
          feedbackWhite,
          feedback.strength * 0.28,
        );
      }
      this.setArchiveSignalBeamSegment(
        puzzle.beams,
        index,
        start,
        end,
        segmentColor,
        circulating
          ? 1 + feedback.strength * 0.72
          : downstream
            ? 1 + feedback.strength * 0.78
            : index === feedback.segmentIndex
              ? 1.18
              : 1,
        splitCoreScale,
        !(result === "open" && index === beamCount - 1),
      );
    }
    puzzle.beams.count = beamCount;
    puzzle.beams.core.geometry.setDrawRange(0, beamCount * 6);
    puzzle.beams.aura.geometry.setDrawRange(0, beamCount * 6);
    puzzle.beams.packets.count = beamCount;
    for (const mesh of [puzzle.beams.core, puzzle.beams.aura]) {
      (
        mesh.geometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;
      (
        mesh.geometry.getAttribute("color") as THREE.BufferAttribute
      ).needsUpdate = true;
      mesh.visible = beamCount > 0;
    }
    if (puzzle.beams.packets.instanceColor) {
      puzzle.beams.packets.instanceColor.needsUpdate = true;
    }

    puzzle.route = route;
    puzzle.routeRelayOrder = visitedOrder;
    puzzle.result = result;
    puzzle.visitedCount = visited.size;
    puzzle.matchedPhaseCount = matchedPhaseCount;
    puzzle.feedbackStrength = feedback.strength;
    puzzle.feedbackPoint.copy(feedback.point);
    puzzle.feedbackSegmentIndex = feedback.segmentIndex;
    const wasUnstable = puzzle.unstableFeedback;
    puzzle.unstableFeedback =
      feedbackLoopClosed && result !== "resolved";
    if (puzzle.unstableFeedback && !wasUnstable) {
      // Wrong loops flare several times, then settle. An earlier implementation
      // restarted the observability pulse forever, keeping its cascade hot.
      puzzle.unstablePulseBudget = 2;
    } else if (!puzzle.unstableFeedback) {
      puzzle.unstablePulseBudget = 0;
    }
    puzzle.lensOutcome = lensOutcome;
    if (lensOutcome) {
      const endpoint = route.at(-1);
      const lens = puzzle.lensPosition;
      if (endpoint) {
        puzzle.lensOutcomeRoot.position.copy(endpoint);
        puzzle.lensOutcomeRoot.rotation.set(
          0,
          Math.atan2(endpoint.x - lens.x, endpoint.z - lens.z),
          0,
        );
      }
      const color =
        lensOutcome === "cyan-monitor"
          ? puzzle.relays[1]?.accent
          : puzzle.relays[2]?.accent;
      if (color) {
        puzzle.lensOutcomeCore.material.color.copy(color);
        puzzle.lensOutcomeRing.material.color.copy(color);
        puzzle.lensOutcomeFragments.material.color.copy(color);
      }
    }
    const terminalRelayId =
      visitedOrder[visitedOrder.length - 1] ?? firstRelay.id;
    const terminalRelay = puzzle.relays[terminalRelayId];
    const terminalDistance =
      terminalRelay && route.length >= 2
        ? terminalRelay.position.distanceTo(route[route.length - 1]!)
        : archiveSignalAmberVoidRadius;
    puzzle.freeAimImpactActive =
      result === "open" &&
      terminalRelay?.manualYaw !== null &&
      terminalDistance < archiveSignalAmberVoidRadius - 1;
    if (puzzle.freeAimImpactActive && terminalRelay) {
      const endpoint = route.at(-1);
      if (endpoint) {
        puzzle.freeAimImpactRoot.position.copy(endpoint);
        puzzle.freeAimImpactRing.quaternion.setFromUnitVectors(
          beamForward,
          endpoint.clone().sub(terminalRelay.position).normalize(),
        );
        puzzle.freeAimImpactCore.material.color.copy(
          terminalRelay.accent,
        );
        puzzle.freeAimImpactRing.material.color.copy(
          terminalRelay.accent,
        );
      }
    }
    if (feedback.segmentIndex >= 0) {
      const fieldFloorY = 0.38;
      const columnHeight = Math.max(
        0.18,
        feedback.point.y - fieldFloorY,
      );
      puzzle.feedbackColumn.position.set(
        feedback.point.x,
        fieldFloorY + columnHeight / 2,
        feedback.point.z,
      );
      puzzle.feedbackColumn.scale.set(1, columnHeight, 1);
    }
    puzzle.solved = result === "resolved";
    puzzle.pulseAge = 0;

    if (puzzle.solved) {
      puzzle.constellationSegmentCount =
        archiveDecodedSkySegments.length;
      for (const [index, segment] of archiveDecodedSkySegments.entries()) {
        const start = archiveDecodedSkyPoints[segment.start];
        const end = archiveDecodedSkyPoints[segment.end];
        if (!start || !end) continue;
        this.writeArchiveSignalRibbonSegment(
          puzzle.constellationPositions,
          puzzle.constellationColors,
          index,
          start,
          end,
          segment.color,
          0.075,
        );
        this.writeArchiveSignalRibbonSegment(
          puzzle.constellationAuraPositions,
          puzzle.constellationAuraColors,
          index,
          start,
          end,
          segment.color,
          0.23,
        );
      }
      for (const mesh of [
        puzzle.constellation,
        puzzle.constellationAura,
      ]) {
        (
          mesh.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute
        ).needsUpdate = true;
        (
          mesh.geometry.getAttribute(
            "color",
          ) as THREE.BufferAttribute
        ).needsUpdate = true;
        mesh.geometry.setDrawRange(
          0,
          puzzle.constellationSegmentCount * 6,
        );
      }
      puzzle.constellationStars.count =
        archiveDecodedSkyStarPositions.length;
      for (
        let index = 0;
        index < puzzle.constellationStarPositions.length;
        index += 1
      ) {
        const point = archiveDecodedSkyStarPositions[index];
        if (point) {
          puzzle.constellationStarPositions[index]?.copy(point);
        }
      }
    }

    if (!announce) return;
    const target = turnedRelay?.aimTarget ?? "lens";
    const turnObservation =
      announcementSource === "power"
        ? "The collector’s final contour locks. Concentrated starlight reaches the aperture."
        : turnedRelay
          ? turnedRelay.manualYaw === null
            ? `The ${turnedRelay.name} prism settles toward ${this.getArchiveSignalTargetName(target)}.`
            : `The ${turnedRelay.name} prism holds where your hand leaves it, aimed toward ${this.getArchiveSignalTargetName(target)}.`
          : "The heliograph changes bearing.";
    if (
      announcementSource === "relay" &&
      turnedRelay &&
      !turnedRelayWasReceiving
    ) {
      this.hooks.onStatus(
        `${turnObservation} Its crystal face remains dark; no carrier reaches it from the current chain.`,
      );
      return;
    }
    if (puzzle.powerTarget < 0.5 || puzzle.powerBlend < 0.88) {
      this.hooks.onStatus(
        `${turnObservation} No carrier has reached the relay circuit yet.`,
      );
      return;
    }
    if (announcementSource === "relay") {
      puzzle.powerAnnouncementPending = false;
    }
    if (puzzle.solved) {
      this.triggerObservabilityScan(true);
      if (!this.archiveSignalEverSolved) {
        this.archiveSignalEverSolved = true;
        this.hooks.onStatus(
          `${turnObservation} Violet, amber, cyan, and green lock in phase. Green crosses the observability center and returns the carrier to violet. The route vanishes from the projection. An eclipsed world opens its eye, and one cold pulse leaves the mapped sky.`,
          {
            kind: "achievement",
            title: archiveSignalAchievement,
          },
        );
      } else {
        this.hooks.onStatus(
          `${turnObservation} The amplified phase locks again. The distant eclipse opens above the lens and resumes its unanswered transmission.`,
        );
      }
      return;
    }
    if (puzzle.lensOutcome === "cyan-monitor") {
      this.triggerObservabilityScan();
      this.hooks.onStatus(
        `${turnObservation} Cyan converges through the ring and strikes the monitor bank. One shrill block of telemetry blooms across the glass, then the trace ends.`,
      );
      return;
    }
    if (puzzle.lensOutcome === "amber-void") {
      this.triggerObservabilityScan();
      this.hooks.onStatus(
        `${turnObservation} Amber crosses the ring undaunted. The overdriven carrier clears the Archive rim and keeps burning into the void.`,
      );
      return;
    }
    if (puzzle.result === "incomplete") {
      this.triggerObservabilityScan();
      const missing = puzzle.relays.length - puzzle.visitedCount;
      this.hooks.onStatus(
        missing === 0
          ? puzzle.matchedPhaseCount === puzzle.relays.length
            ? `${turnObservation} Every phase arrives in order, but green ends the route at the lens. Without a return through violet, the light cannot circulate and build feedback.`
            : `${turnObservation} Every color reaches the lens, but the phases arrive in the wrong order and cancel into pale noise.`
          : `${turnObservation} The lens catches the route, then loses ${
              missing === 1
                ? "one crystal voice"
                : `${missing} crystal voices`
            }.`,
      );
      return;
    }
    if (puzzle.result === "open") {
      this.hooks.onStatus(
        puzzle.freeAimImpactActive
          ? `${turnObservation} The carrier reaches no crystal face and diffracts against solid Archive hardware.`
          : `${turnObservation} The carrier reaches no crystal face and continues into the void.`,
      );
      return;
    }
    if (puzzle.unstableFeedback) {
      this.triggerObservabilityScan(true);
      const twoColorLoop =
        puzzle.routeRelayOrder.length === 2 &&
        puzzle.routeRelayOrder[0] === 0 &&
        puzzle.routeRelayOrder[1] === 3;
      this.hooks.onStatus(
        twoColorLoop
          ? `${turnObservation} Green returns the split violet carrier almost through the observability center. The two-color loop climbs into a violent resonance, but without amber gain and cyan alignment it cannot stabilize.`
          : `${turnObservation} The return crosses observability with enormous raw gain, but its incomplete phase order turns feedback into a bright, unstable whine.`,
      );
      return;
    }
    if (puzzle.feedbackStrength > 0) {
      this.triggerObservabilityScan();
    }
    this.hooks.onStatus(
      `${turnObservation} The beam folds back through a prism it has already lit.${
        puzzle.feedbackStrength > 0
          ? " Its observability pass amplifies the loop into a bright, unstable whine."
          : ""
      }`,
    );
  }

  private updateArchiveSignalPuzzle(delta: number): void {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return;
    if (this.archiveSignalRouteDirty) {
      this.rebuildArchiveSignalRoute(false);
    }
    if (this.reduceMotion) {
      puzzle.powerBlend = puzzle.powerTarget;
    } else if (puzzle.powerBlend < puzzle.powerTarget) {
      puzzle.powerBlend = Math.min(
        puzzle.powerTarget,
        puzzle.powerBlend + delta / 1.75,
      );
    } else if (puzzle.powerBlend > puzzle.powerTarget) {
      puzzle.powerBlend = Math.max(
        puzzle.powerTarget,
        puzzle.powerBlend - delta / 1.25,
      );
    }
    const collectorPower = THREE.MathUtils.smoothstep(
      puzzle.powerBlend,
      0.06,
      0.52,
    );
    const outerRingPower = THREE.MathUtils.smoothstep(
      puzzle.powerBlend,
      0.12,
      0.5,
    );
    const innerRingPower = THREE.MathUtils.smoothstep(
      puzzle.powerBlend,
      0.34,
      0.74,
    );
    const focusPower = THREE.MathUtils.smoothstep(
      puzzle.powerBlend,
      0.48,
      0.86,
    );
    const beamPower = THREE.MathUtils.smoothstep(
      puzzle.powerBlend,
      0.76,
      0.98,
    );
    const collapseFrame =
      this.currentZone === "archive" ? this.worldCollapseFrame : null;
    const opticalFracture = collapseFrame
      ? this.reduceMotion
        ? THREE.MathUtils.smoothstep(
            collapseFrame.progress,
            0.12,
            0.55,
          )
        : THREE.MathUtils.smoothstep(collapseFrame.age, 2.15, 3.75)
      : 0;
    const opticalContinuity = 1 - opticalFracture;
    if (
      puzzle.powerAnnouncementPending &&
      puzzle.powerTarget > 0.5 &&
      !collapseFrame &&
      puzzle.powerBlend >= 0.999
    ) {
      puzzle.powerAnnouncementPending = false;
      this.rebuildArchiveSignalRoute(true, undefined, "power");
    }
    const blockingSegment = this.detectArchiveSignalPlayerInterruption(
      puzzle,
      beamPower > 0.01 &&
        opticalContinuity > 0.01 &&
        collapseFrame === null,
    );
    const downstreamContinuity =
      blockingSegment >= 0 ? 0 : opticalContinuity;

    puzzle.pulseAge = Math.min(3, puzzle.pulseAge + delta);
    puzzle.spellPulseAge = Math.min(3, puzzle.spellPulseAge + delta);
    puzzle.projectionDisruptionAge = Math.min(
      archiveProjectionDisruptionDuration,
      puzzle.projectionDisruptionAge + delta,
    );
    if (
      puzzle.projectionDisruptionAge >=
      archiveProjectionDisruptionDuration
    ) {
      puzzle.projectionDisruptionStrength = 0;
    }
    const routePulse =
      puzzle.pulseAge < 1.25
        ? Math.sin((puzzle.pulseAge / 1.25) * Math.PI)
        : 0;
    const spellPulse =
      puzzle.spellPulseAge < 1.4
        ? Math.sin((puzzle.spellPulseAge / 1.4) * Math.PI)
        : 0;
    const sourcePulse =
      0.82 + Math.sin(this.elapsed * 4.2) * 0.12 + routePulse * 0.7;
    if (!this.reduceMotion) {
      puzzle.sourceRings[0]!.rotation.z +=
        delta * (0.025 + outerRingPower * 1.55);
      puzzle.sourceRings[1]!.rotation.z -=
        delta * (0.018 + innerRingPower * 2.15);
      puzzle.sourceCore.rotation.y +=
        delta * (0.06 + focusPower * 0.62);
      puzzle.collectorTrim.rotation.y +=
        delta * (0.025 + collectorPower * 0.48);
      puzzle.collectorFocusPoint.rotation.y -=
        delta * (0.08 + focusPower * 2.4);
    }
    puzzle.sourceRings[0]!.rotation.x =
      (1 - outerRingPower) * 0.52;
    puzzle.sourceRings[0]!.rotation.y =
      0.34 + (1 - outerRingPower) * 0.36;
    puzzle.sourceRings[1]!.rotation.x =
      -(1 - innerRingPower) * 0.66;
    puzzle.sourceRings[1]!.rotation.y =
      -0.52 - (1 - innerRingPower) * 0.28;
    puzzle.sourceRings[0]!.material.opacity =
      0.07 + outerRingPower * 0.55;
    puzzle.sourceRings[1]!.material.opacity =
      0.055 + innerRingPower * 0.49;
    puzzle.collectorDish.material.opacity =
      0.13 + collectorPower * 0.16;
    puzzle.collectorDish.material.emissiveIntensity =
      0.04 + collectorPower * (0.22 + routePulse * 0.08);
    puzzle.collectorRimGlow.material.opacity =
      collectorPower *
      (0.2 +
        (this.reduceMotion
          ? 0
          : Math.sin(this.elapsed * 3.4) * 0.055));
    puzzle.collectorIncomingBeam.material.opacity =
      (0.018 + collectorPower * 0.075) * opticalContinuity;
    puzzle.collectorIncomingBeam.visible = opticalContinuity > 0.003;
    puzzle.collectorFocusBeam.visible =
      this.quality !== "low" &&
      focusPower > 0.003 &&
      opticalContinuity > 0.003;
    puzzle.collectorFocusBeam.material.opacity =
      focusPower *
      (0.1 + routePulse * 0.045) *
      opticalContinuity;
    puzzle.collectorFocusCore.visible =
      focusPower > 0.003 && opticalContinuity > 0.003;
    puzzle.collectorFocusCore.material.opacity =
      focusPower *
      (0.5 +
        (this.reduceMotion
          ? 0
          : Math.sin(this.elapsed * 8.5) * 0.12)) *
      opticalContinuity;
    puzzle.collectorFocusPoint.material.opacity =
      focusPower *
      (0.72 +
        (this.reduceMotion
          ? 0
          : Math.sin(this.elapsed * 6.8) * 0.18)) *
      opticalContinuity;
    puzzle.collectorFocusPoint.visible =
      focusPower > 0.003 && opticalContinuity > 0.003;
    puzzle.collectorFocusPoint.scale.setScalar(
      0.55 + focusPower * (0.75 + routePulse * 0.35),
    );
    puzzle.sourceCore.scale.y =
      1.04 +
      focusPower *
        (0.31 +
          (this.reduceMotion ? 0 : Math.sin(this.elapsed * 3.1)) *
            0.06) +
      spellPulse * 0.16;
    puzzle.sourceCore.material.emissiveIntensity =
      0.12 + focusPower * (0.78 + sourcePulse) + spellPulse * 1.8;
    puzzle.sourceLight.intensity =
      this.quality === "low"
        ? 0
        : (1.8 + routePulse * 2.5 + spellPulse * 3.2) *
          focusPower *
          opticalContinuity *
          (this.quality === "medium" ? 0.72 : 1);

    const angleFollow =
      this.reduceMotion ? 1 : 1 - Math.exp(-delta * 8.5);
    for (const relay of puzzle.relays) {
      const angleDifference = Math.atan2(
        Math.sin(relay.targetYaw - relay.currentYaw),
        Math.cos(relay.targetYaw - relay.currentYaw),
      );
      relay.currentYaw += angleDifference * angleFollow;
      relay.aimPivot.rotation.y = relay.currentYaw;
      relay.pulseAge = Math.min(2, relay.pulseAge + delta);
      const routePosition = puzzle.routeRelayOrder.indexOf(relay.id);
      const reachedBeforeInterruption =
        blockingSegment < 0 ||
        (routePosition >= 0 && routePosition < blockingSegment);
      relay.activeBlend = THREE.MathUtils.lerp(
        relay.activeBlend,
        relay.active && reachedBeforeInterruption
          ? beamPower * opticalContinuity
          : 0,
        this.reduceMotion ? 1 : 1 - Math.exp(-delta * 7),
      );
      const turnPulse =
        relay.pulseAge < 0.9
          ? Math.sin((relay.pulseAge / 0.9) * Math.PI)
          : 0;
      const strength =
        0.08 +
        relay.activeBlend * 1.28 +
        turnPulse * (0.22 + beamPower * 1.33) +
        spellPulse * 1.25;
      relay.facetMaterial.emissiveIntensity = 0.22 + strength;
      relay.coreMaterial.opacity =
        0.12 + relay.activeBlend * 0.34 + turnPulse * 0.26;
      relay.glowMaterial.opacity =
        0.035 + relay.activeBlend * 0.12 + spellPulse * 0.08;
      relay.indicatorMaterial.opacity =
        0.24 + relay.activeBlend * 0.54 + turnPulse * 0.18;
    }

    for (let index = 0; index < puzzle.progressPipPositions.length; index += 1) {
      const reachedPhaseCount =
        blockingSegment < 0
          ? puzzle.matchedPhaseCount
          : Math.min(puzzle.matchedPhaseCount, blockingSegment);
      const active =
        index < reachedPhaseCount &&
        beamPower * opticalContinuity > 0.05;
      const position = puzzle.progressPipPositions[index];
      const color = puzzle.progressPipColors[index];
      if (!position || !color) continue;
      const pip = puzzle.progressPipDummy;
      pip.position.copy(position);
      pip.rotation.set(
        0,
        Math.atan2(position.x, position.z) +
          (!this.reduceMotion && active ? this.elapsed * 0.7 : 0),
        0,
      );
      pip.scale.setScalar(active ? 1 + routePulse * 0.18 : 0.72);
      pip.updateMatrix();
      puzzle.progressPips.setMatrixAt(index, pip.matrix);
      const brightness = active
        ? beamPower *
          opticalContinuity *
          (0.76 + Math.sin(this.elapsed * 3.8 + index) * 0.12)
        : 0.09;
      puzzle.progressPips.setColorAt(
        index,
        puzzle.progressPipColorScratch
          .copy(color)
          .multiplyScalar(brightness),
      );
    }
    puzzle.progressPips.instanceMatrix.needsUpdate = true;
    if (puzzle.progressPips.instanceColor) {
      puzzle.progressPips.instanceColor.needsUpdate = true;
    }

    const beamFlicker = puzzle.unstableFeedback
      ? 0.52 + Math.abs(Math.sin(this.elapsed * 15.5)) * 0.48
      : 0.84 + Math.sin(this.elapsed * 11) * 0.1;
    puzzle.beams.core.material.opacity =
      (0.7 +
        routePulse * 0.2 +
        spellPulse * 0.08 +
        puzzle.feedbackStrength * 0.08) *
      beamFlicker *
      beamPower *
      opticalContinuity;
    puzzle.beams.aura.material.opacity =
      (0.09 +
        routePulse * 0.08 +
        spellPulse * 0.12 +
        puzzle.feedbackStrength * 0.06) *
      beamPower *
      opticalContinuity;
    this.updateArchiveSignalInterruptionEffect(
      puzzle,
      delta,
      beamPower,
      opticalContinuity,
    );
    const routeVisible =
      puzzle.beams.count > 0 &&
      beamPower * opticalContinuity > 0.003;
    puzzle.beams.core.visible =
      routeVisible &&
      (!puzzle.interruption.active ||
        puzzle.interruption.result.segmentIndex > 0);
    puzzle.beams.aura.visible = puzzle.beams.core.visible;
    puzzle.beams.packets.visible =
      routeVisible &&
      puzzle.beams.packets.count > 0 &&
      beamPower > 0.1 &&
      !this.reduceMotion &&
      this.quality !== "low";
    if (puzzle.beams.packets.visible) {
      for (
        let index = 0;
        index < puzzle.beams.packets.count;
        index += 1
      ) {
        const start = puzzle.beams.starts[index];
        const end = puzzle.beams.ends[index];
        if (!start || !end) continue;
        const travel =
          (this.elapsed * (puzzle.solved ? 0.72 : 0.52) -
            index * 0.17 +
            10) %
          1;
        const packet = puzzle.beams.packetDummy;
        packet.position.lerpVectors(start, end, travel);
        packet.rotation.set(
          this.elapsed * 1.8 + index,
          this.elapsed * 2.3 - index * 0.4,
          index * 0.3,
        );
        const originRelay =
          index === 0
            ? null
            : puzzle.routeRelayOrder[index - 1] ?? null;
        const centralPacketScale =
          originRelay === 0
            ? 0.24
            : originRelay === 2
              ? 0.3
              : 1;
        packet.scale.setScalar(
          (0.72 +
            (0.82 +
              Math.sin(this.elapsed * 11 + index * 1.7) * 0.12) *
              0.34) *
            centralPacketScale *
            (puzzle.feedbackSegmentIndex >= 0 &&
            index > puzzle.feedbackSegmentIndex
              ? 1 + puzzle.feedbackStrength * 0.45
              : 1),
        );
        packet.updateMatrix();
        puzzle.beams.packets.setMatrixAt(index, packet.matrix);
      }
      puzzle.beams.packets.instanceMatrix.needsUpdate = true;
    }
    puzzle.phaseRails.material.opacity =
      puzzle.phasePackets.count > 0
        ? puzzle.unstableFeedback
          ? beamPower *
            opticalContinuity *
            (0.58 +
              (this.reduceMotion
                ? 0.18
                : Math.abs(Math.sin(this.elapsed * 13.2)) * 0.38))
          : beamPower *
            opticalContinuity *
            (0.82 +
              (this.reduceMotion ? 0 : Math.sin(this.elapsed * 8.4)) *
                0.1)
        : 0;
    puzzle.phaseRails.visible =
      puzzle.phasePackets.count > 0 &&
      beamPower * opticalContinuity > 0.003;
    puzzle.phasePackets.visible =
      puzzle.phasePackets.count > 0 &&
      beamPower * opticalContinuity > 0.1 &&
      !this.reduceMotion &&
      this.quality !== "low";
    if (puzzle.phasePackets.visible) {
      for (
        let index = 0;
        index < puzzle.phasePackets.count;
        index += 1
      ) {
        const start = puzzle.phasePacketStarts[index];
        const end = puzzle.phasePacketEnds[index];
        const originRelay = puzzle.phasePacketOrigins[index];
        if (!start || !end || originRelay === undefined) continue;
        const speed =
          originRelay === 2 ? 0.92 : originRelay === 1 ? 0.72 : 0.58;
        const travel =
          (this.elapsed * speed +
            (puzzle.phasePacketOffsets[index] ?? 0)) %
          1;
        const packet = puzzle.phasePacketDummy;
        packet.position.lerpVectors(start, end, travel);
        packet.rotation.set(
          this.elapsed * (originRelay === 2 ? 3.2 : 2.1) + index,
          this.elapsed * 2.7 - index,
          travel * Math.PI * 2,
        );
        packet.scale.setScalar(
          originRelay === 2
            ? 1.55 + Math.sin(this.elapsed * 12 + index) * 0.22
            : originRelay === 1
              ? 1.18
              : 0.92,
        );
        packet.updateMatrix();
        puzzle.phasePackets.setMatrixAt(index, packet.matrix);
      }
      puzzle.phasePackets.instanceMatrix.needsUpdate = true;
    }

    const lensOutcome = puzzle.lensOutcome;
    puzzle.lensOutcomeRoot.visible =
      lensOutcome === "cyan-monitor" &&
      beamPower * downstreamContinuity > 0.01;
    if (lensOutcome === "cyan-monitor") {
      const outcomeWave = this.reduceMotion
        ? 0.5
        : (Math.sin(this.elapsed * 18) + 1) / 2;
      puzzle.lensOutcomeCore.material.opacity =
        beamPower *
        downstreamContinuity *
        (0.68 + outcomeWave * 0.28);
      puzzle.lensOutcomeRing.material.opacity =
        beamPower *
        downstreamContinuity *
        (0.42 + outcomeWave * 0.2);
      puzzle.lensOutcomeCore.scale.setScalar(
        0.92 + outcomeWave * 0.48,
      );
      puzzle.lensOutcomeRing.scale.setScalar(
        0.82 + outcomeWave * 0.5,
      );
      if (!this.reduceMotion) {
        puzzle.lensOutcomeCore.rotation.x += delta * 4.8;
        puzzle.lensOutcomeCore.rotation.y -= delta * 6.2;
        puzzle.lensOutcomeRing.rotation.z += delta * 2.7;
      }
      const fragmentCount = this.quality === "low" ? 4 : 8;
      puzzle.lensOutcomeFragments.count = fragmentCount;
      puzzle.lensOutcomeFragments.material.opacity =
        beamPower * downstreamContinuity * 0.76;
      for (let index = 0; index < fragmentCount; index += 1) {
        const phase = index / fragmentCount;
        const angle =
          phase * Math.PI * 2 +
          (this.reduceMotion ? 0 : this.elapsed * 1.8);
        const radius =
          0.32 +
          ((index * 5) % 4) * 0.1 +
          outcomeWave * 0.08;
        const fragment = puzzle.lensOutcomeDummy;
        fragment.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          Math.sin(this.elapsed * 13 + index * 2.1) * 0.13,
        );
        fragment.rotation.set(
          angle,
          this.elapsed * 1.4 + index,
          -angle * 0.7,
        );
        fragment.scale.setScalar(0.82 + outcomeWave * 0.36);
        fragment.updateMatrix();
        puzzle.lensOutcomeFragments.setMatrixAt(
          index,
          fragment.matrix,
        );
      }
      puzzle.lensOutcomeFragments.instanceMatrix.needsUpdate = true;
    }
    puzzle.freeAimImpactRoot.visible =
      puzzle.freeAimImpactActive &&
      beamPower * downstreamContinuity > 0.01;
    if (puzzle.freeAimImpactRoot.visible) {
      const impactWave = this.reduceMotion
        ? 0.5
        : (Math.sin(this.elapsed * 16) + 1) / 2;
      puzzle.freeAimImpactCore.material.opacity =
        beamPower *
        downstreamContinuity *
        (0.64 + impactWave * 0.26);
      puzzle.freeAimImpactRing.material.opacity =
        beamPower *
        downstreamContinuity *
        (0.4 + impactWave * 0.18);
      puzzle.freeAimImpactCore.scale.setScalar(
        0.9 + impactWave * 0.42,
      );
      puzzle.freeAimImpactRing.scale.setScalar(
        0.82 + impactWave * 0.38,
      );
      if (!this.reduceMotion) {
        puzzle.freeAimImpactCore.rotation.x += delta * 4.2;
        puzzle.freeAimImpactCore.rotation.y -= delta * 5.4;
        puzzle.freeAimImpactRing.rotation.z += delta * 2.2;
      }
    }

    this.updateArchiveCollapseBeamFragments(
      puzzle,
      collapseFrame,
      opticalFracture,
      beamPower,
    );
    if (collapseFrame) {
      if (this.observabilityPulse?.visible) {
        this.observabilityPulse.material.opacity *=
          opticalContinuity;
        if (opticalContinuity <= 0.003) {
          this.observabilityPulse.visible = false;
        }
      }
      if (this.observabilityLogCascade?.points.visible) {
        this.observabilityLogCascade.points.material.opacity *=
          opticalContinuity;
        if (opticalContinuity <= 0.003) {
          this.observabilityLogCascade.points.visible = false;
        }
      }
    }

    puzzle.resolutionBlend = THREE.MathUtils.lerp(
      puzzle.resolutionBlend,
      puzzle.solved ? beamPower * downstreamContinuity : 0,
      this.reduceMotion
        ? 1
        : 1 -
          Math.exp(-delta * (collapseFrame ? 9.5 : 2.4)),
    );
    puzzle.feedbackBlend = THREE.MathUtils.lerp(
      puzzle.feedbackBlend,
      puzzle.feedbackStrength * beamPower * downstreamContinuity,
      this.reduceMotion
        ? 1
        : 1 -
          Math.exp(-delta * (collapseFrame ? 11 : 5.2)),
    );
    const resolved = puzzle.resolutionBlend;
    const feedback = puzzle.feedbackBlend;
    const unstable = puzzle.unstableFeedback;
    if (
      unstable &&
      beamPower * downstreamContinuity > 0.9 &&
      puzzle.unstablePulseBudget > 0 &&
      !this.reduceMotion &&
      this.observabilityPulse &&
      this.observabilityPulseAge >= 1.05
    ) {
      const pulseStrength =
        0.34 + puzzle.unstablePulseBudget * 0.18;
      puzzle.unstablePulseBudget -= 1;
      this.observabilityPulseAge = 0;
      this.observabilityPulsePeakOpacity = pulseStrength;
      this.observabilityPulse.visible = true;
      this.observabilityPulse.scale.setScalar(0.72);
      this.observabilityPulse.material.opacity = pulseStrength;
    }
    const receiverEnergy = Math.max(
      resolved,
      feedback * (unstable ? 0.96 : 0.58),
    );
    if (resolved > 0.5) {
      puzzle.receiverHalo.material.color.copy(
        archiveFeedbackResolvedColor,
      );
      puzzle.feedbackColumn.material.color.copy(
        archiveFeedbackResolvedColor,
      );
    } else if (unstable) {
      const colorBlend =
        this.reduceMotion
          ? 0.5
          : (Math.sin(this.elapsed * 9.6) + 1) / 2;
      puzzle.receiverHalo.material.color.lerpColors(
        archiveFeedbackVioletColor,
        archiveFeedbackGreenColor,
        colorBlend,
      );
      puzzle.feedbackColumn.material.color.lerpColors(
        archiveFeedbackGreenColor,
        archiveFeedbackVioletColor,
        colorBlend,
      );
    } else {
      puzzle.receiverHalo.material.color.setHex(palette.cyan);
      puzzle.feedbackColumn.material.color.setHex(0xf4ffff);
    }
    const receiverWave = this.reduceMotion
      ? 0
      : Math.sin(
          this.elapsed *
            (unstable ? 11.6 : resolved > 0.5 ? 4.2 : 7.4),
        );
    puzzle.receiverHalo.visible = receiverEnergy > 0.005;
    puzzle.feedbackColumn.visible = feedback > 0.005;
    puzzle.resolvedColumn.visible = resolved > 0.005;
    puzzle.constellation.visible = resolved > 0.005;
    puzzle.constellationAura.visible = resolved > 0.005;
    puzzle.constellationBody.visible = resolved > 0.005;
    puzzle.constellationShell.visible = resolved > 0.005;
    const disruptionProgress = THREE.MathUtils.clamp(
      puzzle.projectionDisruptionAge /
        archiveProjectionDisruptionDuration,
      0,
      1,
    );
    const disruptionEnvelope =
      puzzle.projectionDisruptionStrength *
      (1 - THREE.MathUtils.smoothstep(disruptionProgress, 0.18, 1));
    const disruptionFlicker =
      disruptionEnvelope <= 0 || this.reduceMotion
        ? 1
        : 0.48 +
          Math.abs(
            Math.sin(
              puzzle.projectionDisruptionAge * 31 +
                Math.floor(
                  puzzle.projectionDisruptionAge * 13,
                ) *
                  0.73,
            ),
          ) *
            0.52;
    for (const [index, echo] of puzzle.constellationEchoes.entries()) {
      const visible =
        resolved > 0.005 &&
        disruptionEnvelope > 0.015 &&
        (!this.reduceMotion || index === 1);
      echo.visible = visible;
      if (!visible) {
        echo.material.opacity = 0;
        continue;
      }
      const direction = index % 2 === 0 ? -1 : 1;
      const phase = this.reduceMotion
        ? index * 2.17
        : puzzle.projectionDisruptionAge * (18 + index * 3.5) +
          index * 2.17;
      echo.position.set(
        direction *
          disruptionEnvelope *
          (0.16 + Math.sin(phase) * 0.09),
        archiveDecodedSkyBodyY +
          disruptionEnvelope *
            (Math.cos(phase * 0.74) * 0.12 +
              (index - 1) * 0.055),
        disruptionEnvelope *
          Math.sin(phase * 0.47 + index) *
          0.16,
      );
      echo.rotation.copy(puzzle.constellationBody.rotation);
      echo.rotation.z +=
        direction * disruptionEnvelope * (0.07 + index * 0.035);
      echo.scale.copy(puzzle.constellationBody.scale);
      echo.scale.x *= 1 + direction * disruptionEnvelope * 0.12;
      echo.scale.y *= 1 - disruptionEnvelope * (0.04 + index * 0.025);
      echo.material.opacity =
        resolved *
        disruptionEnvelope *
        disruptionFlicker *
        (index === 2 ? 0.42 : 0.28);
    }
    for (const orbit of puzzle.constellationOrbits) {
      orbit.visible = resolved > 0.005;
    }
    puzzle.receiverHalo.material.opacity =
      receiverEnergy *
      (0.42 + receiverWave * 0.1);
    puzzle.receiverHalo.scale.setScalar(
      1 +
        (this.reduceMotion
          ? 0
          : Math.sin(this.elapsed * (resolved > 0.5 ? 2.15 : 5.8))) *
          0.035 *
          receiverEnergy,
    );
    if (!this.reduceMotion) {
      puzzle.receiverHalo.rotation.z += delta * 0.16;
    }
    puzzle.feedbackColumn.material.opacity =
      feedback *
      (0.22 +
        (this.reduceMotion ? 0 : Math.sin(this.elapsed * 9.2)) * 0.07);
    const feedbackColumnHeight = puzzle.feedbackColumn.scale.y;
    const feedbackColumnWidth =
      1 +
      feedback *
        ((unstable ? 0.72 : 0.32) +
          (this.reduceMotion ? 0 : Math.sin(this.elapsed * 7.6)) * 0.12);
    puzzle.feedbackColumn.scale.set(
      feedbackColumnWidth,
      feedbackColumnHeight,
      feedbackColumnWidth,
    );
    puzzle.resolvedColumn.material.opacity =
      resolved * (0.3 + Math.sin(this.elapsed * 5.4) * 0.07);
    puzzle.constellation.material.opacity =
      resolved *
      (0.76 + Math.sin(this.elapsed * 3.4) * 0.12) *
      (1 - disruptionEnvelope * (1 - disruptionFlicker) * 0.72);
    puzzle.constellationAura.material.opacity =
      resolved *
      (0.12 +
        Math.sin(this.elapsed * 2.7) * 0.035 +
        disruptionEnvelope * disruptionFlicker * 0.34);
    const decodedSkyWave =
      this.reduceMotion ? 0 : Math.sin(this.elapsed * 2.3) * 0.055;
    puzzle.constellationBody.material.opacity =
      resolved *
      (0.82 + decodedSkyWave) *
      (1 - disruptionEnvelope * (1 - disruptionFlicker) * 0.64);
    puzzle.constellationShell.material.opacity =
      resolved *
      (0.34 +
        (this.reduceMotion ? 0 : Math.sin(this.elapsed * 3.7)) * 0.07 +
        disruptionEnvelope * disruptionFlicker * 0.34);
    puzzle.constellationBody.scale.setScalar(
      0.72 + resolved * (0.28 + decodedSkyWave * 0.35),
    );
    puzzle.constellationShell.scale.setScalar(
      1.16 + resolved * decodedSkyWave * 0.18,
    );
    for (const [index, orbit] of puzzle.constellationOrbits.entries()) {
      orbit.material.opacity =
        resolved *
        (0.48 +
          (this.reduceMotion
            ? 0
            : Math.sin(this.elapsed * (2.1 + index * 0.35) + index) *
              0.1)) *
        (1 -
          disruptionEnvelope *
            (0.22 +
              (this.reduceMotion
                ? 0
                : Math.abs(
                    Math.sin(
                      puzzle.projectionDisruptionAge * 22 + index,
                    ),
                  ) * 0.56)));
      const orbitPulse =
        1 +
        resolved *
          (this.reduceMotion
            ? 0
            : Math.sin(this.elapsed * 1.6 + index * 1.8) * 0.025);
      orbit.scale.setScalar(orbitPulse);
    }
    puzzle.constellationRoot.position.y =
      this.reduceMotion
        ? 0
        : resolved * Math.sin(this.elapsed * 1.7) * 0.14 +
          disruptionEnvelope *
            Math.sin(puzzle.projectionDisruptionAge * 27) *
            0.11;
    puzzle.constellationRoot.position.x =
      puzzle.lensPosition.x +
      (this.reduceMotion
        ? 0
        : disruptionEnvelope *
          Math.sin(puzzle.projectionDisruptionAge * 34) *
          0.13);
    puzzle.constellationRoot.position.z =
      puzzle.lensPosition.z +
      (this.reduceMotion
        ? 0
        : disruptionEnvelope *
          Math.cos(puzzle.projectionDisruptionAge * 25) *
          0.08);
    if (!this.reduceMotion) {
      puzzle.constellationRoot.rotation.y += delta * 0.11 * resolved;
      puzzle.constellationBody.rotation.y += delta * 0.22 * resolved;
      puzzle.constellationBody.rotation.x += delta * 0.055 * resolved;
      puzzle.constellationShell.rotation.y -= delta * 0.31 * resolved;
      for (const [index, orbit] of puzzle.constellationOrbits.entries()) {
        orbit.rotation.z +=
          delta * (index % 2 === 0 ? 0.19 : -0.16) * resolved;
      }
    }
    puzzle.constellationStars.visible = resolved > 0.005;
    puzzle.constellationStars.material.opacity =
      resolved *
      (0.88 + Math.sin(this.elapsed * 4.5) * 0.1) *
      (1 - disruptionEnvelope * (1 - disruptionFlicker) * 0.76);
    for (
      let index = 0;
      index < puzzle.constellationStars.count;
      index += 1
    ) {
      const position = puzzle.constellationStarPositions[index];
      if (!position) continue;
      const star = puzzle.constellationStarDummy;
      if (index === puzzle.constellationStars.count - 1) {
        const pulseStart = archiveDecodedSkyPoints[8];
        const pulseEnd = archiveDecodedSkyPoints[9];
        star.position.lerpVectors(
          pulseStart,
          pulseEnd,
          this.reduceMotion ? 0.72 : (this.elapsed * 0.34) % 1,
        );
      } else {
        star.position.copy(position);
      }
      star.rotation.set(
        this.reduceMotion ? 0 : this.elapsed * (0.24 + index * 0.02),
        this.reduceMotion ? 0 : -this.elapsed * (0.32 + index * 0.025),
        index * 0.2,
      );
      star.scale.setScalar(
        resolved *
          (index === puzzle.constellationStars.count - 1 ? 1.55 : 1.2) *
          (0.9 +
            (this.reduceMotion
              ? 0
              : Math.sin(this.elapsed * 3.2 + index)) *
              0.15),
      );
      star.updateMatrix();
      puzzle.constellationStars.setMatrixAt(index, star.matrix);
    }
    puzzle.constellationStars.instanceMatrix.needsUpdate = true;
  }

  private detectArchiveSignalPlayerInterruption(
    puzzle: ArchiveSignalPuzzle,
    enabled: boolean,
  ): number {
    const effect = puzzle.interruption;
    effect.blocker.x = this.player.group.position.x;
    effect.blocker.z = this.player.group.position.z;
    effect.blocker.minY = this.player.group.position.y + 0.08;
    effect.blocker.maxY =
      this.player.group.position.y +
      this.playerCollisionHeight * 0.78;
    effect.active =
      enabled &&
      findFirstBeamInterruption(
        puzzle.beams.starts,
        puzzle.beams.ends,
        puzzle.beams.count,
        effect.blocker,
        effect.result,
      );

    const visibleBeamCount = effect.active
      ? effect.result.segmentIndex
      : puzzle.beams.count;
    puzzle.beams.core.geometry.setDrawRange(
      0,
      visibleBeamCount * 6,
    );
    puzzle.beams.aura.geometry.setDrawRange(
      0,
      visibleBeamCount * 6,
    );
    puzzle.beams.packets.count = visibleBeamCount;

    let visiblePhaseRailCount = puzzle.phaseRailCount;
    if (effect.active) {
      visiblePhaseRailCount = 0;
      while (
        visiblePhaseRailCount < puzzle.phaseRailCount &&
        (puzzle.phasePacketRouteSegments[visiblePhaseRailCount] ??
          Number.POSITIVE_INFINITY) < effect.result.segmentIndex
      ) {
        visiblePhaseRailCount += 1;
      }
    }
    puzzle.phaseRails.geometry.setDrawRange(
      0,
      visiblePhaseRailCount * 6,
    );
    puzzle.phasePackets.count = visiblePhaseRailCount;

    return effect.active ? effect.result.segmentIndex : -1;
  }

  private updateArchiveSignalInterruptionEffect(
    puzzle: ArchiveSignalPuzzle,
    delta: number,
    beamPower: number,
    opticalContinuity: number,
  ): void {
    const effect = puzzle.interruption;
    const targetBlend = effect.active
      ? beamPower * opticalContinuity
      : 0;
    effect.blend = THREE.MathUtils.lerp(
      effect.blend,
      targetBlend,
      this.reduceMotion ? 1 : 1 - Math.exp(-delta * 18),
    );

    if (!effect.active || effect.blend <= 0.003) {
      effect.partialCore.visible = false;
      effect.partialAura.visible = false;
      effect.impactRoot.visible = false;
      effect.impactFragments.count = 0;
      return;
    }

    const segmentIndex = effect.result.segmentIndex;
    const start = puzzle.beams.starts[segmentIndex];
    const end = puzzle.beams.ends[segmentIndex];
    const color = puzzle.beams.colors[segmentIndex];
    if (!start || !end || !color) {
      effect.active = false;
      return;
    }
    effect.direction.subVectors(end, start);
    const segmentLength = effect.direction.length();
    if (segmentLength <= 0.001) {
      effect.active = false;
      return;
    }
    effect.direction.divideScalar(segmentLength);
    effect.partialEnd
      .set(effect.result.x, effect.result.y, effect.result.z)
      .addScaledVector(effect.direction, -0.05);

    this.writeArchiveSignalRibbonSegment(
      effect.partialCorePositions,
      effect.partialCoreColors,
      0,
      start,
      effect.partialEnd,
      color,
      puzzle.beams.coreWidths[segmentIndex] ?? 0.045,
    );
    this.writeArchiveSignalRibbonSegment(
      effect.partialAuraPositions,
      effect.partialAuraColors,
      0,
      start,
      effect.partialEnd,
      color,
      (puzzle.beams.auraWidths[segmentIndex] ?? 0.14) * 1.18,
    );
    for (const ribbon of [effect.partialCore, effect.partialAura]) {
      ribbon.geometry.setDrawRange(0, 6);
      (
        ribbon.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;
      (
        ribbon.geometry.getAttribute(
          "color",
        ) as THREE.BufferAttribute
      ).needsUpdate = true;
      ribbon.visible = true;
    }
    effect.partialCore.material.opacity =
      puzzle.beams.core.material.opacity *
      (0.9 + effect.blend * 0.18);
    effect.partialAura.material.opacity =
      puzzle.beams.aura.material.opacity *
      (1.15 + effect.blend * 0.65);

    effect.impactRoot.visible = true;
    effect.impactRoot.position.set(
      effect.result.x,
      effect.result.y,
      effect.result.z,
    );
    effect.impactRing.quaternion.setFromUnitVectors(
      beamForward,
      effect.direction,
    );
    effect.impactCore.material.color.copy(color);
    effect.impactRing.material.color.copy(color);
    effect.impactFragments.material.color.copy(color);
    effect.bodyShimmer.material.color.copy(color);

    const impactWave = this.reduceMotion
      ? 0.5
      : (Math.sin(this.elapsed * 18) + 1) * 0.5;
    effect.impactCore.material.opacity =
      effect.blend * (0.72 + impactWave * 0.24);
    effect.impactCore.scale.setScalar(
      0.9 + effect.blend * (0.55 + impactWave * 0.22),
    );
    effect.impactRing.material.opacity =
      effect.blend * (0.48 + impactWave * 0.2);
    effect.impactRing.scale.setScalar(0.82 + impactWave * 0.4);
    effect.bodyShimmer.position.set(
      this.player.group.position.x - effect.result.x,
      this.player.group.position.y +
        this.playerCollisionHeight * 0.42 -
        effect.result.y,
      this.player.group.position.z - effect.result.z,
    );
    effect.bodyShimmer.material.opacity =
      effect.blend * (0.08 + impactWave * 0.055);
    effect.bodyShimmer.scale.set(
      0.88 + impactWave * 0.08,
      1.34,
      0.88 + impactWave * 0.08,
    );
    if (!this.reduceMotion) {
      effect.impactCore.rotation.x += delta * 5.8;
      effect.impactCore.rotation.y -= delta * 7.2;
      effect.impactRing.rotation.z += delta * 3.6;
      effect.bodyShimmer.rotation.y -= delta * 1.4;
    }

    const fragmentCount =
      this.reduceMotion ? 0 : this.quality === "low" ? 3 : 8;
    effect.impactFragments.count = fragmentCount;
    effect.impactFragments.material.opacity = effect.blend * 0.76;
    for (let index = 0; index < fragmentCount; index += 1) {
      const angle =
        (index / fragmentCount) * Math.PI * 2 +
        this.elapsed * (index % 2 === 0 ? 2.4 : -1.9);
      const radius = 0.24 + (index % 3) * 0.085;
      const fragment = effect.impactFragmentDummy;
      fragment.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 1.7) * 0.22,
        Math.sin(angle) * radius,
      );
      fragment.rotation.set(
        angle * 0.7,
        this.elapsed * 2.8 + index,
        -angle,
      );
      fragment.scale.setScalar(0.68 + impactWave * 0.42);
      fragment.updateMatrix();
      effect.impactFragments.setMatrixAt(index, fragment.matrix);
    }
    effect.impactFragments.instanceMatrix.needsUpdate = true;
  }

  private updateArchiveCollapseBeamFragments(
    puzzle: ArchiveSignalPuzzle,
    frame: WorldCollapseFrame | null,
    fracture: number,
    beamPower: number,
  ): void {
    const mesh = puzzle.collapseBeamFragments;
    if (!frame || fracture <= 0.002 || beamPower <= 0.01) {
      mesh.count = 0;
      mesh.visible = false;
      return;
    }
    const fade = this.reduceMotion
      ? 1 - THREE.MathUtils.smoothstep(frame.progress, 0.62, 0.9)
      : 1 - THREE.MathUtils.smoothstep(frame.age, 7.2, 11.6);
    const strength = fracture * fade * beamPower;
    if (strength <= 0.003) {
      mesh.count = 0;
      mesh.visible = false;
      return;
    }

    const fragmentsPerSegment =
      this.quality === "low"
        ? 1
        : this.quality === "medium"
          ? 2
          : 3;
    const routeSegmentCount = Math.min(
      puzzle.beams.count,
      Math.max(0, puzzle.route.length - 1),
    );
    const segmentCount = routeSegmentCount + 2;
    const dummy = puzzle.collapseBeamFragmentDummy;
    let fragmentIndex = 0;
    for (
      let segmentIndex = 0;
      segmentIndex < segmentCount;
      segmentIndex += 1
    ) {
      const routeSegment = segmentIndex < routeSegmentCount;
      const focusSegment = segmentIndex === routeSegmentCount;
      const start = routeSegment
        ? puzzle.route[segmentIndex]
        : focusSegment
          ? puzzle.collectorFocusStart
          : puzzle.collectorIncomingStart;
      const end = routeSegment
        ? puzzle.route[segmentIndex + 1]
        : focusSegment
          ? puzzle.collectorFocusEnd
          : puzzle.collectorIncomingEnd;
      if (!start || !end) continue;
      const directionX = end.x - start.x;
      const directionY = end.y - start.y;
      const directionZ = end.z - start.z;
      const segmentLength = Math.max(
        0.01,
        Math.hypot(directionX, directionY, directionZ),
      );
      const yaw = Math.atan2(directionX, directionZ);
      const pitch = Math.atan2(
        directionY,
        Math.max(0.001, Math.hypot(directionX, directionZ)),
      );
      const color =
        routeSegment && segmentIndex > 0
          ? puzzle.relays[
              puzzle.routeRelayOrder[segmentIndex - 1] ?? -1
            ]?.accent ?? archiveFeedbackResolvedColor
          : archiveFeedbackResolvedColor;
      for (
        let piece = 0;
        piece < fragmentsPerSegment && fragmentIndex < 24;
        piece += 1
      ) {
        const along = (piece + 1) / (fragmentsPerSegment + 1);
        const phase =
          segmentIndex * 1.731 + piece * 2.417 + frame.age * 0.82;
        const drift = fracture * (0.18 + (piece % 2) * 0.16);
        dummy.position.set(
          THREE.MathUtils.lerp(start.x, end.x, along) +
            Math.cos(phase * 1.7) * drift,
          THREE.MathUtils.lerp(start.y, end.y, along) +
            Math.sin(phase * 1.25) * drift * 0.72,
          THREE.MathUtils.lerp(start.z, end.z, along) +
            Math.sin(phase * 1.9) * drift,
        );
        dummy.rotation.set(
          -pitch + Math.sin(phase) * fracture * 0.42,
          yaw + Math.cos(phase * 0.8) * fracture * 0.55,
          Math.sin(phase * 1.3) * fracture * 0.72,
        );
        const flicker =
          this.reduceMotion ||
          Math.sin(this.elapsed * 19 + phase * 2.1) >
            -0.42 + fracture * 0.38
            ? 1
            : 0.08;
        const pieceLength =
          Math.min(
            1.25,
            segmentLength / (fragmentsPerSegment + 1.6),
          ) *
          (1 - fracture * 0.48) *
          flicker;
        const thickness =
          (0.038 + (segmentIndex % 2) * 0.012) *
          strength *
          flicker;
        dummy.scale.set(
          Math.max(0.003, thickness),
          Math.max(0.003, thickness),
          Math.max(0.012, pieceLength),
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(fragmentIndex, dummy.matrix);
        mesh.setColorAt(fragmentIndex, color);
        fragmentIndex += 1;
      }
    }
    mesh.count = fragmentIndex;
    mesh.visible = fragmentIndex > 0;
    mesh.material.opacity =
      strength *
      (0.68 +
        (this.reduceMotion
          ? 0
          : Math.abs(Math.sin(this.elapsed * 12.5)) * 0.24));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private pulseArchiveSignalPuzzle(
    stage: SpellStage,
    charge: number,
    range: number,
  ): boolean {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return false;
    const candidates = [
      puzzle.source.position,
      puzzle.lensPosition,
      ...puzzle.relays.map((relay) => relay.position),
    ];
    const reached = candidates.some(
      (position) =>
        Math.hypot(
          position.x - this.playerPosition.x,
          position.z - this.playerPosition.z,
        ) <= range,
    );
    if (!reached) return false;
    puzzle.spellPulseAge = 0;
    puzzle.pulseAge = Math.min(puzzle.pulseAge, 0.12);
    if (stage === "thunder" && puzzle.solved) {
      puzzle.projectionDisruptionAge = 0;
      puzzle.projectionDisruptionStrength = Math.max(
        puzzle.projectionDisruptionStrength,
        0.52 + charge * 0.48,
      );
    }
    for (const relay of puzzle.relays) {
      const distance = Math.hypot(
        relay.position.x - this.playerPosition.x,
        relay.position.z - this.playerPosition.z,
      );
      if (distance <= range) relay.pulseAge = 0;
    }
    const stageScale =
      stage === "thunder" ? 1 : stage === "surge" ? 0.72 : 0.45;
    puzzle.sourceLight.intensity += charge * stageScale * 3;
    return true;
  }

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
    addBox(group, [2.7, height, 2.7], [0, height / 2, 0], this.materials.black);
    const lowerBar = addBox(
      group,
      [2.9, 0.12, 0.18],
      [0, height * 0.33, 1.42],
      accent,
    );
    const upperBar = addBox(
      group,
      [2.9, 0.12, 0.18],
      [0, height * 0.66, 1.42],
      accent,
    );
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), accent);
    cap.position.y = height + 0.7;
    group.add(cap);
    this.animatedItems.push({
      object: cap,
      originY: cap.position.y,
      phase: x * 0.3,
      amplitude: 0.11,
      rotationSpeed: 0.35,
    });
    this.serverRacks.push({
      bars: [lowerBar, upperBar],
      cap,
      position: new THREE.Vector3(x, height + 0.7, z),
    });
    parent.add(group);
    this.registerPlayerOccluder(group);
  }

  private createObservabilityRing(parent: THREE.Group, x: number, z: number): void {
    const group = new THREE.Group();
    group.name = "archive-observability-ring";
    group.position.set(x, 0, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.15, 6, 22), this.materials.cyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    group.add(ring);
    const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.materials.cyanSoft);
    signal.position.y = 1.35;
    group.add(signal);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(1.72, 1.86, 28),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.35;
    pulse.visible = false;
    group.add(pulse);
    this.observabilityPulse = pulse;
    this.createObservabilityLogCascade(group);
    this.animatedItems.push({
      object: signal,
      originY: signal.position.y,
      phase: 1,
      amplitude: 0.15,
      rotationSpeed: 0.5,
    });
    parent.add(group);
  }

  private createObservabilityLogCascade(parent: THREE.Group): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(3, 10, 13, .78)";
      context.fillRect(5, 82, 246, 92);
      context.strokeStyle = "rgba(255, 255, 255, .82)";
      context.lineWidth = 5;
      context.strokeRect(8, 85, 240, 86);
      context.fillStyle = "#ffffff";
      context.font =
        "800 25px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText("INFO 00:42", 22, 112);
      context.globalAlpha = 0.76;
      context.fillRect(22, 139, 34, 7);
      context.fillRect(66, 139, 64, 7);
      context.fillRect(140, 139, 86, 7);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const maximumCount = 30;
    const positions = new Float32Array(maximumCount * 3);
    const colors = new Float32Array(maximumCount * 3);
    const phases = new Float32Array(maximumCount);
    for (let index = 0; index < maximumCount; index += 1) {
      positions[index * 3 + 1] = -100;
      phases[index] = (index * 0.61803398875) % 1;
    }
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: this.quality === "low" ? 34 : this.quality === "medium" ? 40 : 46,
        map: texture,
        alphaTest: 0.045,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
      }),
    );
    points.name = "observability-log-cascade";
    points.visible = false;
    points.frustumCulled = false;
    points.renderOrder = 5;
    parent.add(points);
    this.observabilityLogCascade = {
      points,
      positions,
      colors,
      phases,
      maximumCount,
      count: 0,
      age: 3,
      duration: 2.35,
      stage: "surge",
    };
  }

  private createStarGlobe(
    parent: THREE.Group,
    x: number,
    z: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "archive-star-atlas";
    group.position.set(x, 0, z);
    const globeMaterial = new THREE.MeshStandardMaterial({
      color: 0x081521,
      emissive: 0x0b3040,
      emissiveIntensity: 0.9,
      roughness: 0.38,
      metalness: 0.25,
      wireframe: true,
    });
    const globe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.65, 2),
      globeMaterial,
    );
    globe.position.y = 2.2;
    group.add(globe);
    const orbitMaterial = new THREE.MeshStandardMaterial({
      color: palette.brass,
      emissive: palette.cyan,
      emissiveIntensity: 0,
      roughness: 0.44,
      metalness: 0.58,
    });
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.08, 5, 32),
      orbitMaterial,
    );
    orbit.position.y = 2.2;
    orbit.rotation.x = 0.6;
    orbit.rotation.y = 0.3;
    group.add(orbit);

    const starShape = new THREE.Shape();
    for (let point = 0; point < 8; point += 1) {
      const radius = point % 2 === 0 ? 0.52 : 0.15;
      const angle = Math.PI / 2 + (point / 8) * Math.PI * 2;
      const pointX = Math.cos(angle) * radius;
      const pointY = Math.sin(angle) * radius;
      if (point === 0) starShape.moveTo(pointX, pointY);
      else starShape.lineTo(pointX, pointY);
    }
    starShape.closePath();
    const starMaterial = new THREE.MeshBasicMaterial({
      color: archiveAtlasSilverLightColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const star = new THREE.Group();
    star.name = "archive-ascension-star";
    star.position.y = 2.2;
    star.visible = this.archiveAscensionComplete;
    const starFace = new THREE.Mesh(
      new THREE.ShapeGeometry(starShape),
      starMaterial,
    );
    starFace.rotation.x = -Math.PI / 2;
    starFace.renderOrder = 3;
    star.add(starFace);
    group.add(star);

    const base = addCylinder(
      group,
      1.2,
      1.5,
      0.45,
      10,
      [0, 0.22, 0],
      this.materials.brass,
    );
    base.castShadow = false;

    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.68, 32),
      new THREE.MeshBasicMaterial({
        color: palette.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.47;
    pulse.visible = false;
    pulse.renderOrder = 4;
    group.add(pulse);

    const light = new THREE.PointLight(palette.cyan, 0, 8.5, 2);
    light.position.y = 2.2;
    light.castShadow = false;
    group.add(light);

    this.animatedItems.push({
      object: globe,
      originY: globe.position.y,
      phase: 0,
      amplitude: 0.04,
      rotationSpeed: 0.16,
    });
    parent.add(group);
    this.archiveAtlas = {
      globe,
      orbit,
      star,
      starMaterial,
      pulse,
      light,
      pulseAge: 2,
      ascensionBlend: this.archiveAscensionComplete ? 1 : 0,
    };
    this.updateArchiveAtlas(0);
    return group;
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
    this.surfaceAreas.push({
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
      this.surfaceAreas.push({
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
      [7.48, 1.25, -1.55, -Math.PI / 2, this.materials.violet, "signal", 0.84],
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
      this.surfaceAreas.push({
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

    const maintenanceTrunk = addBox(
      parent,
      [1.35, 0.72, 1],
      [6.15, 0.36, -2.72],
      this.materials.black,
    );
    maintenanceTrunk.castShadow = false;
    const trunkLatch = addBox(
      parent,
      [0.32, 0.08, 0.18],
      [6.15, 0.75, -2.2],
      this.materials.brass,
    );
    trunkLatch.castShadow = false;
    this.addStaticBox(6.15, 0.36, -2.72, 0.675, 0.36, 0.5, 0.705);
    this.surfaceAreas.push({
      id: "archive-maintenance-trunk",
      x: 6.15,
      z: -2.72,
      halfWidth: 0.66,
      halfDepth: 0.485,
      requiresJump: true,
      heightAt: () => 0.72,
    });
    this.addInteraction(
      "archive-maintenance-trunk",
      "Inspect maintenance trunk",
      6.15,
      -2.72,
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
    const ledgerScreen = addBox(
      parent,
      [2.2, 0.08, 1.05],
      [-2.25, 0.78, -5.72],
      this.materials.cyanSoft,
    );
    const marketScreen = addBox(
      parent,
      [2.2, 0.08, 1.05],
      [0.35, 0.78, -5.72],
      this.materials.amberSoft,
    );
    ledgerScreen.castShadow = false;
    marketScreen.castShadow = false;
    this.addStaticBox(-1.1, 0.4, -5.85, 3.1, 0.42, 0.85, 0.86);
    this.surfaceAreas.push({
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
    const screen = addBox(
      monitor,
      [1.42, 0.96, 0.08],
      [0, 0.08, 0.56],
      screenMaterial,
    );
    screen.castShadow = false;

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
          new THREE.Vector3(-0.58, -0.22, 0.62),
          new THREE.Vector3(-0.34, 0.02, 0.62),
          new THREE.Vector3(-0.1, -0.08, 0.62),
          new THREE.Vector3(0.14, 0.29, 0.62),
          new THREE.Vector3(0.36, 0.12, 0.62),
          new THREE.Vector3(0.58, 0.35, 0.62),
        ]
      : [
          new THREE.Vector3(-0.58, 0.12, 0.62),
          new THREE.Vector3(-0.24, 0.12, 0.62),
          new THREE.Vector3(-0.08, -0.18, 0.62),
          new THREE.Vector3(0.14, 0.28, 0.62),
          new THREE.Vector3(0.3, -0.04, 0.62),
          new THREE.Vector3(0.58, -0.04, 0.62),
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

  private createOrbitingMoon(parent: THREE.Group, x: number, z: number): void {
    const moonSystem = new THREE.Group();
    moonSystem.position.set(x, 0, z);
    const moon = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.15, 1),
      this.materials.stone,
    );
    moon.position.y = 3;
    moon.scale.set(1, 0.92, 1);
    moon.castShadow = false;
    moonSystem.add(moon);
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.045, 5, 28),
      this.materials.cyanSoft,
    );
    orbit.position.y = 3;
    orbit.rotation.set(0.72, 0.18, 0.1);
    moonSystem.add(orbit);
    parent.add(moonSystem);
    this.animatedItems.push({
      object: moonSystem,
      originY: moonSystem.position.y,
      phase: 2.8,
      amplitude: 0.12,
      rotationSpeed: 0.08,
    });
  }

  private createRoomPlanet(
    parent: THREE.Group,
    radius: number,
    height: number,
    size: number,
    material: THREE.Material,
    phase: number,
    speed: number,
    ringed: boolean,
    detail: number,
  ): void {
    const pivot = new THREE.Group();
    pivot.position.set(archiveAtlasX, 0, archiveAtlasZ);
    pivot.rotation.y = phase;
    const planet = new THREE.Group();
    planet.position.set(radius, height, 0);
    const sourceColor =
      material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshStandardMaterial
        ? material.color.clone()
        : new THREE.Color(palette.cyan);
    const geometry = new THREE.DodecahedronGeometry(size, 0);
    const positions = geometry.getAttribute("position");
    const faceColors = new Float32Array(positions.count * 3);
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const face = Math.floor(vertex / 3);
      const shade = 0.58 + ((face + detail * 2) % 5) * 0.085;
      const faceColor = sourceColor.clone().multiplyScalar(shade);
      faceColors[vertex * 3] = faceColor.r;
      faceColors[vertex * 3 + 1] = faceColor.g;
      faceColors[vertex * 3 + 2] = faceColor.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(faceColors, 3));
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: sourceColor.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.7,
      flatShading: true,
      roughness: 0.68,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(
      geometry,
      bodyMaterial,
    );
    body.scale.set(1, 0.92, 1);
    body.rotation.set(phase * 0.11, phase * 0.17, detail * 0.19);
    body.castShadow = false;
    body.receiveShadow = true;
    planet.add(body);
    if (ringed) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(size * 1.42, size * 0.075, 5, 24),
        this.materials.parchment,
      );
      ring.rotation.set(0.8, 0.15, 0.2);
      ring.castShadow = false;
      planet.add(ring);
    }
    pivot.add(planet);
    parent.add(pivot);
    pivot.visible =
      this.quality === "high" ||
      (this.quality === "medium" && detail < 4) ||
      detail < 2;
    this.orbitingPlanets.push({
      pivot,
      planet,
      bodyMaterial,
      speed,
      detail,
      radius,
      collisionRadius: size * (ringed ? 1.34 : 1.04),
      orbitalBoost: 0,
      radialOffset: 0,
      radialVelocity: 0,
      tiltVelocity: 0,
      impact: 0,
      collisionCooldown: 0,
      playerContact: false,
      rigidity: 0,
      rigidUntil: 0,
      worldPosition: new THREE.Vector3(),
    });
  }

  private createArchivePlanetFootprints(parent: THREE.Group): void {
    if (this.orbitingPlanets.length === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const shadow = context.createRadialGradient(64, 64, 3, 64, 64, 61);
      shadow.addColorStop(0, "rgba(2, 7, 10, 0.54)");
      shadow.addColorStop(0.64, "rgba(2, 7, 10, 0.34)");
      shadow.addColorStop(0.88, "rgba(2, 7, 10, 0.12)");
      shadow.addColorStop(0.96, "rgba(2, 7, 10, 0)");
      context.fillStyle = shadow;
      context.beginPath();
      context.arc(64, 64, 62, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(232, 253, 255, 0.95)";
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(64, 64, 61, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = "rgba(238, 254, 255, 0.92)";
      context.beginPath();
      context.arc(64, 64, 3.5, 0, Math.PI * 2);
      context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      vertexColors: true,
    });
    const footprints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2),
      material,
      this.orbitingPlanets.length,
    );
    footprints.frustumCulled = false;
    footprints.renderOrder = groundProjectionRenderOrder;
    footprints.count = this.orbitingPlanets.length;
    parent.add(footprints);
    this.archivePlanetFootprints = footprints;
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
      const receivingPortal = this.portalStates.find(
        (portal) => portal.destination === state.arrivalFrom,
      );
      receivingPortal?.core.scale.setScalar(1.28);
    }
    if (this.currentZone === "archive") {
      this.archiveSpaceAsteroids.push(kickable);
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
    this.archiveSpaceAsteroids.push(kickable);
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
    this.archiveSpaceAsteroids.push(kickable);
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
    for (const occluder of this.playerOccluders) {
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
    protect(this.splashRing);
    protect(this.splashBurst?.drops ?? null);
    protect(this.runeAltar?.object ?? null);
    protect(this.chestLid);
    protect(this.chestPrize);
    protect(this.caveSeal);
    protect(this.observabilityPulse);
    protect(this.observabilityLogCascade?.points ?? null);
    protect(this.archiveAtlas?.pulse ?? null);
    protect(this.archiveSignalPuzzle?.collectorRoot ?? null);
    if (this.voidTurtle) {
      protect(this.voidTurtle.group);
      protect(this.voidTurtle.effects.trail);
      protect(this.voidTurtle.effects.meteors);
    }
    this.hanoiPuzzle.forEachDynamicObject(protect);
    for (const panel of this.puzzleWaterfallPanels) protect(panel);
    for (const kickable of this.kickables) protect(kickable.object);
    for (const telescope of this.telescopeRigs) protect(telescope.pivot);
    for (const planet of this.orbitingPlanets) protect(planet.pivot);
    for (const npc of this.wanderingNpcs) protect(npc.group);
    for (const lantern of this.lanterns) protect(lantern.light);
    for (const rack of this.serverRacks) {
      for (const bar of rack.bars) protect(bar);
    }
    for (const rune of this.runeStones.values()) protect(rune.group);
    protect(this.runeDiagnosticTrace?.path ?? null);
    protect(this.runeDiagnosticTrace?.packet ?? null);
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

      const key = [
        object.material.uuid,
        Number(object.castShadow),
        Number(object.receiveShadow),
        geometryKey(object.geometry),
      ].join("|");
      const bucket: MeshBucket = meshBuckets.get(key) ?? {
          material: object.material,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
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
      for (const copy of copies) copy.dispose();
      if (!geometry) continue;

      geometry.computeBoundingSphere();
      const batch = new THREE.Mesh(geometry, bucket.material);
      batch.name = `static-mesh-batch-${batchIndex}`;
      batch.castShadow = bucket.castShadow;
      batch.receiveShadow = bucket.receiveShadow;
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

  private resolveStaticColliderPenetration(
    position: { x: number; z: number },
    feetHeight: number,
    previousFeetHeight: number,
  ): void {
    const radiusSquared = this.playerRadius * this.playerRadius;
    let corrected = false;

    // Composite cliffs can overlap, so repeat a bounded number of times. Each
    // pass moves the player to the nearest boundary of at least one solid.
    for (let pass = 0; pass < 4; pass += 1) {
      let correctedThisPass = false;
      for (const collider of this.staticColliders) {
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
      }
      if (!correctedThisPass) break;
    }

    if (corrected) this.constrainToBounds(this.playerPosition);
  }

  private collidesAt(
    x: number,
    z: number,
    previousFeetHeight: number,
  ): boolean {
    const feetHeight = this.surfaceOffset + this.jumpHeight;
    for (const collider of this.staticColliders) {
      if (collider.enabled === false) continue;
      const solidTop = collider.solidTop;
      if (solidTop !== undefined) {
        const onOrAboveSolid = feetHeight >= solidTop - 0.01;
        const ascendingThroughClimbClearance =
          collider.clearAbove !== undefined &&
          this.jumpVelocity > 0 &&
          feetHeight >= collider.clearAbove - 0.01;
        const crossingSolidTopFromAbove =
          this.jumpVelocity < 0 &&
          previousFeetHeight >= solidTop - 0.01 &&
          feetHeight < solidTop - 0.01;
        if (onOrAboveSolid || ascendingThroughClimbClearance) continue;
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
    this.staticColliders.push(collider);
    return collider;
  }

  private registerClimbableBox(
    object: THREE.Object3D,
    id: string | null,
    landingMessage?: string,
    collisionClearAbove?: number,
    occludesPlayer = true,
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
    this.addStaticBox(
      x,
      y,
      z,
      halfWidth,
      halfHeight,
      halfDepth,
      collisionClearAbove ?? top - 0.005,
      top,
    );
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
    this.surfaceAreas.push(surface);
    return surface;
  }

  private constrainToBounds(position: THREE.Vector3): void {
    if (this.bounds.kind === "circle") {
      const distance = Math.hypot(position.x, position.z);
      let maximum = this.bounds.radius - 0.55;
      const turtle = this.currentZone === "field" ? this.voidTurtle : null;
      if (turtle && this.jumpHeight > 0 && distance > 0.001) {
        const turtleDistance = Math.hypot(
          turtle.surface.x,
          turtle.surface.z,
        );
        const alignment =
          (position.x * turtle.surface.x + position.z * turtle.surface.z) /
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
      -this.bounds.halfWidth + 0.55,
      this.bounds.halfWidth - 0.55,
    );
    position.z = THREE.MathUtils.clamp(
      position.z,
      -this.bounds.halfDepth + 0.55,
      this.bounds.halfDepth - 0.55,
    );
  }

  private isInsidePlayableBounds(x: number, z: number): boolean {
    if (this.bounds.kind === "circle") {
      const maximum = this.bounds.radius - 0.55;
      return x * x + z * z <= maximum * maximum;
    }
    return (
      x >= -this.bounds.halfWidth + 0.55 &&
      x <= this.bounds.halfWidth - 0.55 &&
      z >= -this.bounds.halfDepth + 0.55 &&
      z <= this.bounds.halfDepth - 0.55
    );
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
    this.previousFrame = performance.now();
    this.lastRenderedFrame = 0;
    if (!this.running) return;
    this.renderer.setAnimationLoop(this.documentVisible ? this.frame : null);
  };

  private findPointedArchiveSignalRelay(
    event: PointerEvent,
  ): ArchiveSignalRelay | null {
    const puzzle = this.archiveSignalPuzzle;
    if (this.currentZone !== "archive" || !puzzle) return null;
    this.updatePointerRay(event);
    let closest: ArchiveSignalRelay | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const relay of puzzle.relays) {
      relay.pointerProxy.updateWorldMatrix(true, false);
      this.pointerActionHits.length = 0;
      this.pointerRaycaster.intersectObject(
        relay.pointerProxy,
        false,
        this.pointerActionHits,
      );
      const hit = this.pointerActionHits[0];
      if (!hit || hit.distance >= closestDistance) continue;
      closest = relay;
      closestDistance = hit.distance;
    }
    return closest;
  }

  private beginArchiveRelayDrag(event: PointerEvent): boolean {
    if (
      this.archiveRelayDragHold ||
      this.telekinesisPointerId !== null ||
      this.mathInstanceDragHold
    ) {
      return false;
    }
    const relay = this.findPointedArchiveSignalRelay(event);
    if (!relay) return false;
    const plane = new THREE.Plane(up, -relay.beamHeight);
    const point = new THREE.Vector3();
    if (!this.pointerRaycaster.ray.intersectPlane(plane, point)) {
      point.copy(relay.position);
    }
    this.archiveRelayDragHold = {
      pointerId: event.pointerId,
      relay,
      plane,
      point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    this.pointerActionReachTarget = relay.pointerProxy;
    this.pointerActionReachUntil = this.elapsed + 0.42;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updateArchiveRelayDrag(event: PointerEvent): boolean {
    const hold = this.archiveRelayDragHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    if (
      !hold.moved &&
      Math.hypot(
        event.clientX - hold.startClientX,
        event.clientY - hold.startClientY,
      ) >=
        (event.pointerType === "touch" ? 11 : 5)
    ) {
      hold.moved = true;
    }
    if (!hold.moved) {
      event.preventDefault();
      return true;
    }
    this.updatePointerRay(event);
    if (
      !this.pointerRaycaster.ray.intersectPlane(
        hold.plane,
        hold.point,
      )
    ) {
      event.preventDefault();
      return true;
    }
    const offsetX = hold.point.x - hold.relay.position.x;
    const offsetZ = hold.point.z - hold.relay.position.z;
    if (Math.hypot(offsetX, offsetZ) > 0.45) {
      const yaw = Math.atan2(offsetX, offsetZ);
      const yawDifference = Math.abs(
        Math.atan2(
          Math.sin(yaw - hold.relay.currentYaw),
          Math.cos(yaw - hold.relay.currentYaw),
        ),
      );
      if (yawDifference >= 0.0015) {
        hold.relay.manualYaw = yaw;
        hold.relay.targetYaw = yaw;
        hold.relay.currentYaw = yaw;
        hold.relay.aimPivot.rotation.y = yaw;
        hold.relay.pulseAge = 0;
        this.archiveSignalManualYaws[hold.relay.id] = yaw;
        if (this.archiveSignalPuzzle) {
          this.archiveSignalPuzzle.pulseAge = 0;
        }
        this.archiveSignalRouteDirty = true;
      }
    }
    this.pointerActionReachTarget = hold.relay.pointerProxy;
    this.pointerActionReachUntil = this.elapsed + 0.16;
    event.preventDefault();
    return true;
  }

  private releaseArchiveRelayDrag(event: PointerEvent): boolean {
    const hold = this.archiveRelayDragHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    this.archiveRelayDragHold = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (event.type === "pointerup") {
      if (hold.moved) {
        this.rebuildArchiveSignalRoute(true, hold.relay);
      } else {
        this.turnArchiveSignalRelay(hold.relay.id);
      }
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
    return true;
  }

  private cancelArchiveRelayDrag(): void {
    const hold = this.archiveRelayDragHold;
    if (!hold) return;
    this.archiveRelayDragHold = null;
    if (this.canvas.hasPointerCapture(hold.pointerId)) {
      this.canvas.releasePointerCapture(hold.pointerId);
    }
    this.syncPointerDragCursor();
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
          spec.getWorldPosition(hit.instanceId, this.tempWorld);
          const playerDistance = Math.hypot(
            this.tempWorld.x - this.playerPosition.x,
            this.tempWorld.z - this.playerPosition.z,
          );
          if (playerDistance > (spec.maximumDistance ?? 8.5)) continue;
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
      if (!pointerAction.object.visible) continue;
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
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.pointerRaycaster.setFromCamera(this.pointer, this.camera);
  }

  private findPointedKickable(event: PointerEvent): Kickable | null {
    if (this.kickables.length === 0) return null;
    this.updatePointerRay(event);
    const hits = this.pointerRaycaster.intersectObjects(
      this.kickables
        .filter((kickable) => kickable.enabled)
        .map((kickable) => kickable.object),
      true,
    );
    for (const hit of hits) {
      const kickable = this.kickables.find(
        (candidate) =>
          candidate.enabled &&
          (hit.object === candidate.object ||
            candidate.object.getObjectById(hit.object.id) !== undefined),
      );
      if (kickable) return kickable;
    }
    return null;
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

  private getPrimaryHeldOrbitingPlanet(): OrbitingPlanet | null {
    for (const hold of this.orbitTelekinesisHolds.values()) {
      return hold.planet;
    }
    return null;
  }

  private isOrbitingPlanetVisibleAtQuality(planet: OrbitingPlanet): boolean {
    return (
      this.quality === "high" ||
      (this.quality === "medium" && planet.detail < 4) ||
      planet.detail < 2
    );
  }

  private findPointedOrbitingPlanet(
    event: PointerEvent,
  ): OrbitingPlanet | null {
    if (this.currentZone !== "archive" || this.orbitingPlanets.length === 0) {
      return null;
    }
    const candidates = this.orbitingPlanets.filter(
      (planet) => planet.pivot.visible,
    );
    if (candidates.length === 0) return null;
    this.updatePointerRay(event);
    const kickableObjects = this.kickables
      .filter((kickable) => kickable.enabled)
      .map((kickable) => kickable.object);
    const hits = this.pointerRaycaster.intersectObjects(
      [
        ...candidates.map((planet) => planet.planet),
        ...kickableObjects,
      ],
      true,
    );
    for (const hit of hits) {
      const planet = candidates.find(
        (candidate) =>
          hit.object === candidate.planet ||
          candidate.planet.getObjectById(hit.object.id) !== undefined,
      );
      if (planet) {
        return this.heldOrbitingPlanets.has(planet) ? null : planet;
      }
      if (
        kickableObjects.some(
          (object) =>
            hit.object === object ||
            object.getObjectById(hit.object.id) !== undefined,
        )
      ) {
        return null;
      }
    }
    return null;
  }

  private beginOrbitingPlanetTelekinesis(
    planet: OrbitingPlanet,
    event: PointerEvent,
  ): boolean {
    if (
      this.orbitTelekinesisHolds.has(event.pointerId) ||
      this.heldOrbitingPlanets.has(planet)
    ) {
      return false;
    }
    planet.planet.getWorldPosition(planet.worldPosition);
    const relativePosition = this.getArchiveOrbitRelativePosition(
      planet.worldPosition,
      this.tempOrbitPosition,
    );
    const currentRadius = THREE.MathUtils.clamp(
      relativePosition.length(),
      this.getArchiveOrbitMinimumRadius(planet),
      this.getArchiveOrbitMaximumRadius(planet),
    );
    planet.pivot.rotation.z = 0;
    planet.tiltVelocity = 0;
    planet.pivot.rotation.y = Math.atan2(
      -relativePosition.y,
      relativePosition.x,
    );
    planet.radialOffset = currentRadius - planet.radius;
    planet.radialVelocity = 0;
    planet.planet.position.x = currentRadius;
    planet.planet.getWorldPosition(planet.worldPosition);

    const hold: OrbitTelekinesisHold = {
      planet,
      plane: new THREE.Plane(up, -planet.worldPosition.y),
      point: new THREE.Vector3(),
      previousPoint: planet.worldPosition.clone(),
      velocity: new THREE.Vector3(),
      grabOffset: new THREE.Vector3(),
      previousTime: event.timeStamp,
      moved: false,
    };
    this.updatePointerRay(event);
    if (
      this.pointerRaycaster.ray.intersectPlane(
        hold.plane,
        hold.point,
      )
    ) {
      hold.grabOffset.set(
        planet.worldPosition.x - hold.point.x,
        0,
        planet.worldPosition.z - hold.point.z,
      );
    }
    this.orbitTelekinesisHolds.set(event.pointerId, hold);
    this.heldOrbitingPlanets.add(planet);
    planet.pivot.visible = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updateOrbitingPlanetTelekinesis(event: PointerEvent): void {
    const hold = this.orbitTelekinesisHolds.get(event.pointerId);
    if (!hold) return;
    const { planet } = hold;
    this.updatePointerRay(event);
    if (
      !this.pointerRaycaster.ray.intersectPlane(
        hold.plane,
        hold.point,
      )
    ) {
      return;
    }

    const rawWorldX = hold.point.x + hold.grabOffset.x;
    const rawWorldZ = hold.point.z + hold.grabOffset.z;
    const rawRelativeX = rawWorldX - archiveAtlasX;
    const rawRelativeZ = rawWorldZ - archiveAtlasZ;
    const rawRadius = Math.max(
      0.001,
      Math.hypot(rawRelativeX, rawRelativeZ),
    );
    const radius = THREE.MathUtils.clamp(
      rawRadius,
      this.getArchiveOrbitMinimumRadius(planet),
      this.getArchiveOrbitMaximumRadius(planet),
    );
    const targetX =
      archiveAtlasX + (rawRelativeX / rawRadius) * radius;
    const targetZ =
      archiveAtlasZ + (rawRelativeZ / rawRadius) * radius;
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (event.timeStamp - hold.previousTime) / 1000),
    );
    hold.velocity.set(
      (targetX - hold.previousPoint.x) / deltaTime,
      0,
      (targetZ - hold.previousPoint.z) / deltaTime,
    );
    const speed = Math.hypot(hold.velocity.x, hold.velocity.z);
    if (speed > 12) {
      hold.velocity.multiplyScalar(12 / speed);
    }

    const movementSquared =
      (targetX - hold.previousPoint.x) ** 2 +
      (targetZ - hold.previousPoint.z) ** 2;
    if (movementSquared > 0.0004) {
      hold.moved = true;
      this.markArchiveOrbitDisturbed();
    }
    planet.pivot.rotation.y = Math.atan2(
      -(targetZ - archiveAtlasZ),
      targetX - archiveAtlasX,
    );
    planet.pivot.rotation.z = 0;
    planet.radialOffset = radius - planet.radius;
    planet.radialVelocity = 0;
    planet.tiltVelocity = 0;
    planet.planet.position.x = radius;
    planet.impact = 1;
    planet.planet.getWorldPosition(planet.worldPosition);
    hold.previousPoint.copy(planet.worldPosition);
    hold.previousTime = event.timeStamp;
    event.preventDefault();
  }

  private releaseOrbitingPlanetTelekinesis(event: PointerEvent): boolean {
    const hold = this.orbitTelekinesisHolds.get(event.pointerId);
    if (!hold) return false;
    const { planet } = hold;

    const staleVelocity = event.timeStamp - hold.previousTime > 110;
    if (staleVelocity) hold.velocity.set(0, 0, 0);
    if (hold.moved) {
      planet.planet.getWorldPosition(planet.worldPosition);
      const relativePosition = this.getArchiveOrbitRelativePosition(
        planet.worldPosition,
        this.tempOrbitPosition,
      );
      const radius = Math.max(
        0.001,
        relativePosition.length(),
      );
      const radialX = relativePosition.x / radius;
      const radialZ = relativePosition.y / radius;
      const tangentX = radialZ;
      const tangentZ = -radialX;
      const radialSpeed =
        hold.velocity.x * radialX + hold.velocity.z * radialZ;
      const tangentialSpeed =
        hold.velocity.x * tangentX + hold.velocity.z * tangentZ;
      const releaseMobility = THREE.MathUtils.lerp(
        1,
        archiveGravityLockImpulseScale,
        planet.rigidity,
      );
      planet.radialVelocity = THREE.MathUtils.clamp(
        radialSpeed * releaseMobility,
        -6.4,
        6.4,
      );
      planet.orbitalBoost = THREE.MathUtils.clamp(
        planet.orbitalBoost +
          (tangentialSpeed /
            Math.max(this.getArchiveOrbitMinimumRadius(planet), radius)) *
            releaseMobility,
        -2.4,
        2.4,
      );
      planet.tiltVelocity = THREE.MathUtils.clamp(
        tangentialSpeed * 0.035 * releaseMobility,
        -0.72,
        0.72,
      );
      planet.impact = 1;
      planet.collisionCooldown = 0.42;
      this.markArchiveOrbitDisturbed();
      if (!this.archiveOrbitTelekinesisAnnounced) {
        this.archiveOrbitTelekinesisAnnounced = true;
        this.hooks.onStatus(
          "The released world catches the atlas curve. Its new speed remains entirely your fault.",
        );
      }
    }

    this.orbitTelekinesisHolds.delete(event.pointerId);
    this.heldOrbitingPlanets.delete(planet);
    planet.pivot.visible = this.isOrbitingPlanetVisibleAtQuality(planet);
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.syncPointerDragCursor("grab");
    event.preventDefault();
    return true;
  }

  private cancelAllOrbitingPlanetTelekinesis(): void {
    if (this.orbitTelekinesisHolds.size === 0) return;
    const holds = [...this.orbitTelekinesisHolds.entries()];
    this.orbitTelekinesisHolds.clear();
    this.heldOrbitingPlanets.clear();
    for (const [pointerId, hold] of holds) {
      hold.planet.pivot.visible = this.isOrbitingPlanetVisibleAtQuality(
        hold.planet,
      );
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    }
    this.syncPointerDragCursor();
  }

  private findTelekinesisSurface(x: number, z: number): SurfaceArea | null {
    let highestSurface: SurfaceArea | null = null;
    let highestSurfaceY = Number.NEGATIVE_INFINITY;
    for (const surface of this.surfaceAreas) {
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

  private readonly handleTelekinesisDown = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      !this.externalInputEnabled ||
      this.transitioning ||
      this.isIgnitionPanicActive()
    ) {
      return;
    }
    if (this.pongChallenge.isMounted()) {
      if (this.pongChallenge.beginBallDrag(event)) return;
      if (this.pongChallenge.isActive()) {
        if (this.pongChallenge.beginPaddleDrag(event)) return;
        // Wrong Address remains a world object until it physically strikes
        // the packet. It is the one loose prop the player may drag while the
        // court owns movement input.
        if (
          !this.archiveAsteroid ||
          this.findPointedKickable(event) !== this.archiveAsteroid
        ) {
          return;
        }
      }
    }
    if (this.beginMathInstanceDrag(event)) return;
    if (this.beginArchiveRelayDrag(event)) return;
    const pointerAction = this.findPointedPointerAction(event);
    if (pointerAction) {
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
    if (!detachedFromBelt) {
      const orbitingPlanet = this.findPointedOrbitingPlanet(event);
      if (
        orbitingPlanet &&
        this.beginOrbitingPlanetTelekinesis(orbitingPlanet, event)
      ) {
        return;
      }
    }
    if (this.telekinesisPointerId !== null) return;
    const kickable =
      detachedCompass ??
      detachedPencil ??
      this.findPointedKickable(event);
    if (!kickable) {
      this.beginAmbientGridDrag(event);
      return;
    }
    if (!detachedFromBelt && this.compassProp?.kickable === kickable) {
      this.acquireFieldCompass(kickable);
      event.preventDefault();
      return;
    }

    this.unseatRitualCrystal(kickable);
    this.heldKickable = kickable;
    this.telekinesisMoved = false;
    this.telekinesisPencilWasWorn = detachedPencil !== null;
    this.telekinesisStartClientX = event.clientX;
    this.telekinesisStartClientY = event.clientY;
    this.telekinesisPointerClientX = event.clientX;
    this.telekinesisPointerClientY = event.clientY;
    const turtleBound = this.isTurtleBoundKickable(kickable);
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
    if (
      !this.pointerRaycaster.ray.intersectPlane(
        this.telekinesisPlane,
        this.telekinesisPreviousPoint,
      )
    ) {
      this.telekinesisPreviousPoint.copy(kickable.object.position);
    }
    kickable.object.position.y = hoverY;
    this.telekinesisPreviousTime = event.timeStamp;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
  };

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
      this.spawn.y,
      projectedPoint.z,
    );
    const turtleBound = this.isTurtleBoundKickable(kickable);
    const repairPencil =
      kickable.object.userData.gridPencil === true;
    if (repairPencil) {
      // Grid scraps live beyond the playable island. Let the repair pencil
      // reach that wider workspace while retaining a distant numerical guard;
      // released inertia remains unconstrained and R can always recover it.
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

    if (updateReleaseVelocity) {
      kickable.velocity.set(
        (this.tempDirection.x - this.telekinesisPreviousPoint.x) /
          deltaTime,
        0,
        (this.tempDirection.z - this.telekinesisPreviousPoint.z) /
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
    this.telekinesisPlacementSurface = turtleBound
      ? null
      : this.findTelekinesisSurface(
          this.tempDirection.x,
          this.tempDirection.z,
        );
    const surfaceOffset =
      kickable.platform !== null
        ? kickable.platformOffset
        : kickable.restingY;
    const heldY = this.telekinesisPlacementSurface
      ? this.telekinesisPlacementSurface.heightAt(
          this.tempDirection.x,
          this.tempDirection.z,
        ) + surfaceOffset
      : -this.telekinesisPlane.constant;
    kickable.object.position.y = THREE.MathUtils.lerp(
      kickable.object.position.y,
      heldY,
      0.38,
    );

    const actualSpeed = Math.hypot(
      kickable.object.position.x - previousObjectX,
      kickable.object.position.z - previousObjectZ,
    ) / Math.max(1 / 120, deltaTime);
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
    if (
      !this.pointerRaycaster.ray.intersectPlane(
        this.telekinesisPlane,
        this.telekinesisPoint,
      )
    ) {
      return;
    }
    this.applyHeldKickableTarget(
      this.telekinesisPoint,
      Math.max(1 / 120, delta),
      false,
    );
  }

  private readonly handleTelekinesisMove = (event: PointerEvent): void => {
    if (this.updateAmbientGridDrag(event)) return;
    if (this.pongChallenge.updateBallDrag(event)) return;
    if (this.updateMathInstanceDrag(event)) return;
    if (this.updateArchiveRelayDrag(event)) return;
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
    if (this.orbitTelekinesisHolds.has(event.pointerId)) {
      this.updateOrbitingPlanetTelekinesis(event);
      return;
    }
    if (
      !this.heldKickable ||
      this.telekinesisPointerId !== event.pointerId
    ) {
      if (this.findPointedPointerAction(event)) {
        this.canvas.style.cursor = "pointer";
      } else {
        this.canvas.style.cursor =
          this.findPointedArchiveSignalRelay(event) ||
          this.isPointingAtWornCompass(event) ||
          this.isPointingAtWornPencil(event) ||
          this.pongChallenge.isPointingAtBall(event) ||
          this.findPointedMathInstanceDrag(event) ||
          this.findPointedOrbitingPlanet(event) ||
          this.findPointedKickable(event) ||
          this.isPointingAtAmbientGrid(event)
            ? "grab"
            : "";
      }
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
    if (
      !this.pointerRaycaster.ray.intersectPlane(
        this.telekinesisPlane,
        this.telekinesisPoint,
      )
    ) {
      return;
    }
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
  };

  private readonly handleTelekinesisUp = (event: PointerEvent): void => {
    if (this.pongChallenge.releaseBallDrag(event)) return;
    if (this.pongChallenge.releasePaddleDrag(event)) return;
    if (this.releaseMathInstanceDrag(event)) return;
    if (this.releaseArchiveRelayDrag(event)) return;
    if (this.releaseOrbitingPlanetTelekinesis(event)) return;
    if (this.releaseAmbientGridDrag(event)) return;
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
      event.timeStamp - this.telekinesisPreviousTime > 110;
    const planarSpeed = staleVelocity
      ? 0
      : Math.hypot(kickable.velocity.x, kickable.velocity.z);
    if (staleVelocity) kickable.velocity.set(0, 0, 0);
    if (this.releaseTurtleAsteroidTelekinesis(kickable, event)) return;
    if (this.releaseTurtleCargoTelekinesis(kickable, event)) return;
    const placementCandidate =
      planarSpeed < 3.6
        ? this.telekinesisPlacementSurface
        : null;
    const placedSurface =
      placementCandidate &&
      this.surfaceContainsPoint(
        placementCandidate,
        kickable.object.position.x,
        kickable.object.position.z,
      )
        ? placementCandidate
        : null;
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
      if (!kickable.gravity) kickable.platformOffset = kickable.restingY;
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
      kickable.velocity.y = Math.min(4.2, 1.1 + planarSpeed * 0.22);
    } else if (!kickable.gravity && !placedSurface) {
      kickable.object.position.y = kickable.restingY;
    }
    kickable.kickCooldown = 0.28;
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
  };

  private syncInputState(): void {
    const enabled = this.externalInputEnabled && !this.transitioning;
    this.input.setEnabled(enabled);
    if (!enabled) this.cancelSpellCharge();
  }

}
