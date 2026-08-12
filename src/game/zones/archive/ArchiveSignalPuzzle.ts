import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  findFirstBeamInterruption,
  type BeamBlocker,
  type BeamInterruption,
} from "../../BeamInterruption";
import {
  findFirstHorizontalRayBoxDistance,
  type HorizontalRayBox,
} from "../../HorizontalRaycast";
import { addCylinder } from "../../scenePrimitives";
import type { WorldCollapseFrame } from "../../WorldCollapseSequence";
import type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
} from "../../../world/WorldContracts";

const up = new THREE.Vector3(0, 1, 0);
const beamForward = new THREE.Vector3(0, 0, 1);

export interface ArchiveSignalPuzzleHost {
  canvas: HTMLCanvasElement;
  materials: Readonly<{
    brass: THREE.Material;
    cyan: THREE.Material;
    cyanSoft: THREE.Material;
    darkStone: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    brass: number;
    coral: number;
    cyan: number;
    green: number;
    violet: number;
  }>;
  pointerRaycaster: THREE.Raycaster;
  pointerInteractionLayer: number;
  playerRenderLayer: number;
  playerRadius: number;
  playerCollisionHeight: number;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  addPointerAction: (
    object: THREE.Object3D,
    action: () => void | Promise<void>,
    maximumDistance: number,
  ) => void;
  addStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
    solidTop?: number,
  ) => HorizontalRayBox;
  addAnimatedItem: (item: {
    object: THREE.Object3D;
    originY: number;
    phase: number;
    amplitude: number;
    rotationSpeed: number;
  }) => void;
  registerClimbableBox: (
    object: THREE.Object3D,
    id: string | null,
    landingMessage?: string,
    collisionClearAbove?: number,
    occludesPlayer?: boolean,
  ) => void;
  registerPlayerOccluder: (object: THREE.Object3D) => void;
  updateInteractionLabel: (id: string, label: string) => void;
  updatePointerRay: (event: PointerEvent) => void;
  getStaticColliders: () => readonly HorizontalRayBox[];
  getPlayerGroup: () => THREE.Group;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getQuality: () => QualityTier;
  getSelectedSpellStage: () => SpellStage;
  getElapsed: () => number;
  hasAchievement: (title: string) => boolean;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  setPointerReachTarget: (
    target: THREE.Object3D | null,
    until: number,
  ) => void;
  isOtherPointerDragActive: () => boolean;
  isReducedMotion: () => boolean;
  syncPointerCursor: (idleCursor?: "" | "grab") => void;
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


interface ArchiveSignalPuzzleState {
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


const archiveFeedbackResolvedColor = new THREE.Color(0xf4ffff);

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
  { start: 0, end: 1, color: "violet" },
  { start: 1, end: 2, color: "violet" },
  { start: 2, end: 3, color: "amber" },
  { start: 3, end: 4, color: "amber" },
  { start: 4, end: 5, color: "cyan" },
  { start: 5, end: 6, color: "cyan" },
  { start: 6, end: 7, color: "green" },
  { start: 7, end: 0, color: "green" },
  { start: 4, end: 8, color: "resolved" },
  { start: 8, end: 9, color: "cyan" },
] as const;
const archiveDecodedSkyStarPositions = [
  new THREE.Vector3(-2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(-1.34, 5.96, -0.98),
  new THREE.Vector3(1.34, 5.96, -0.98),
  new THREE.Vector3(2.55, archiveDecodedSkyBodyY, 0),
  new THREE.Vector3(0, 5.92, 1.32),
  new THREE.Vector3(0, archiveDecodedSkyBodyY, 0),
] as const;


export class ArchiveSignalPuzzle {
  private state: ArchiveSignalPuzzleState | null = null;
  private targets: [number, number, number, number] = [
    ...archiveSignalInitialTargets,
  ];
  private readonly manualYaws: [
    number | null,
    number | null,
    number | null,
    number | null,
  ] = [null, null, null, null];
  private dragHold: ArchiveRelayDragHold | null = null;
  private routeDirty = false;
  private everSolved: boolean;
  private powered = false;
  private observabilityPulse: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private observabilityPulseAge = 2;
  private observabilityPulsePeakOpacity = 0.86;
  private observabilityLogCascade: ObservabilityLogCascade | null = null;
  private observabilityGroup: THREE.Group | null = null;
  private collapseFrame: WorldCollapseFrame | null = null;
  private readonly pointerActionHits: THREE.Intersection[] = [];
  private readonly feedbackVioletColor: THREE.Color;
  private readonly feedbackGreenColor: THREE.Color;
  private readonly decodedSegmentColors: Readonly<
    Record<
      (typeof archiveDecodedSkySegments)[number]["color"],
      THREE.Color
    >
  >;

  constructor(private readonly host: ArchiveSignalPuzzleHost) {
    this.feedbackVioletColor = new THREE.Color(host.colors.violet);
    this.feedbackGreenColor = new THREE.Color(host.colors.green);
    this.decodedSegmentColors = {
      violet: this.feedbackVioletColor,
      amber: new THREE.Color(host.colors.amber),
      cyan: new THREE.Color(host.colors.cyan),
      green: this.feedbackGreenColor,
      resolved: archiveFeedbackResolvedColor,
    };
    this.everSolved = host.hasAchievement(archiveSignalAchievement);
    if (this.everSolved) {
      this.targets = [...archiveSignalResolvedTargets];
      this.powered = true;
    }
  }

  private get archiveSignalPuzzle(): ArchiveSignalPuzzleState | null {
    return this.state;
  }

  private set archiveSignalPuzzle(
    value: ArchiveSignalPuzzleState | null,
  ) {
    this.state = value;
  }

  private get archiveSignalTargets(): [number, number, number, number] {
    return this.targets;
  }

  private get archiveSignalManualYaws(): [
    number | null,
    number | null,
    number | null,
    number | null,
  ] {
    return this.manualYaws;
  }

  private get archiveRelayDragHold(): ArchiveRelayDragHold | null {
    return this.dragHold;
  }

  private set archiveRelayDragHold(value: ArchiveRelayDragHold | null) {
    this.dragHold = value;
  }

  private get archiveSignalRouteDirty(): boolean {
    return this.routeDirty;
  }

  private set archiveSignalRouteDirty(value: boolean) {
    this.routeDirty = value;
  }

  private get archiveSignalEverSolved(): boolean {
    return this.everSolved;
  }

  private set archiveSignalEverSolved(value: boolean) {
    this.everSolved = value;
  }

  private get archiveSignalPowered(): boolean {
    return this.powered;
  }

  private set archiveSignalPowered(value: boolean) {
    this.powered = value;
  }

  private get elapsed(): number {
    return this.host.getElapsed();
  }

  private get quality(): QualityTier {
    return this.host.getQuality();
  }

  private get reduceMotion(): boolean {
    return this.host.isReducedMotion();
  }

  private get spellStage(): SpellStage {
    return this.host.getSelectedSpellStage();
  }

  private get playerPosition(): Readonly<THREE.Vector3> {
    return this.host.getPlayerPosition();
  }

  private get playerCollisionHeight(): number {
    return this.host.playerCollisionHeight;
  }

  private get playerRadius(): number {
    return this.host.playerRadius;
  }

  private get canvas(): HTMLCanvasElement {
    return this.host.canvas;
  }

  private get pointerRaycaster(): THREE.Raycaster {
    return this.host.pointerRaycaster;
  }

  mount(parent: THREE.Group): void {
    if (this.state) {
      throw new Error("The Archive signal puzzle is already mounted.");
    }
    this.createObservabilityRing(parent, 6.3, 1.4);
    this.createArchiveSignalPuzzle(parent);
    this.host.addInteraction(
      "observability",
      "Inspect archive observability lens",
      6.3,
      1.4,
      2.5,
      () => this.inspectObservability(),
    );
  }

  unmount(): void {
    this.cancelPointerDrag();
    this.state = null;
    this.observabilityPulse = null;
    this.observabilityPulseAge = 2;
    this.observabilityPulsePeakOpacity = 0.86;
    this.observabilityLogCascade = null;
    this.observabilityGroup = null;
    this.collapseFrame = null;
    this.routeDirty = false;
  }

  update(delta: number): void {
    this.updateObservabilityPulse(delta);
    this.updateArchiveSignalPuzzle(delta);
  }

  hasActiveMotion(): boolean {
    const puzzle = this.state;
    return (
      Math.abs(
        (puzzle?.powerBlend ?? 0) -
          (puzzle?.powerTarget ?? 0),
      ) > 0.001
    );
  }

  hasPointerDrag(): boolean {
    return this.dragHold !== null;
  }

  isSolved(): boolean {
    return this.state?.solved ?? false;
  }

  isPlayerInCollectorFocus(): boolean {
    const puzzle = this.state;
    if (
      !puzzle ||
      (this.collapseFrame?.age ?? 0) >= 2.15 ||
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

    const player = this.host.getPlayerGroup().position;
    for (const localHeight of [0.58, 1.18, 1.82] as const) {
      const playerY = player.y + localHeight;
      const progress = THREE.MathUtils.clamp(
        ((player.x - start.x) * directionX +
          (playerY - start.y) * directionY +
          (player.z - start.z) * directionZ) /
          lengthSquared,
        0,
        1,
      );
      if (progress <= 0.015 || progress >= 0.985) continue;
      const closestX = start.x + directionX * progress;
      const closestY = start.y + directionY * progress;
      const closestZ = start.z + directionZ * progress;
      const distance = Math.hypot(
        player.x - closestX,
        playerY - closestY,
        player.z - closestZ,
      );
      const beamRadius = THREE.MathUtils.lerp(0.11, 1.78, progress);
      if (distance <= beamRadius + 0.22) return true;
    }
    return false;
  }

  inspectObservability(): void {
    const puzzle = this.state;
    if ((puzzle?.powerBlend ?? 0) >= 0.1) {
      this.triggerObservabilityScan();
    }
    this.host.onStatus(
      (puzzle?.powerBlend ?? 0) < 0.1
        ? "The observability field is dark. Far across the room, the heliograph’s suspended collector holds only a faint, unfocused glimmer."
        : puzzle?.solved
          ? "The ordered carrier crosses this field on every green-to-violet return. Above it, the decoded sky holds an eclipsed world inside an eye-shaped constellation. One cold pulse escapes on a bearing absent from the atlas."
          : puzzle?.lensOutcome === "cyan-monitor"
            ? "Cyan enters as a narrow carrier and leaves narrower still. A hard line continues from the field into the rear monitor bank, where telemetry flares and stops."
            : puzzle?.lensOutcome === "amber-void"
              ? "Amber crosses the field at full gain. Nothing in the ring turns it; the carrier clears the Archive rim and remains visible in the dark."
              : puzzle?.result === "incomplete"
                ? puzzle.visitedCount === puzzle.relays.length
                  ? "Every crystal color reaches the field, but their phase order cancels before observability can resolve it."
                  : "The lens catches a thin carrier, but the waveform arrives with crystal voices missing."
                : this.spellStage === "thunder"
                  ? "THUNDER observatory: warnings, logs, metrics, and traces cascade beneath the orbiting archive."
                  : this.spellStage === "surge"
                    ? "Archive telemetry resolves into a live metrics, logs, and traces cascade."
                    : "The lens emits one thin pulse. The surrounding archive remains stubbornly silent.",
    );
  }

  pulseFromSpell(
    stage: SpellStage,
    charge: number,
    range: number,
  ): boolean {
    this.triggerObservabilityScan();
    return this.pulseArchiveSignalPuzzle(stage, charge, range);
  }

  reactToWorldCollapse(frame: WorldCollapseFrame): void {
    this.collapseFrame = frame;
    const observability = this.observabilityGroup;
    if (!observability) return;
    observability.scale.x = 1 + frame.instability * 1.45;
    observability.scale.z = Math.max(
      0.18,
      1 - frame.instability * 0.72,
    );
  }

  beginPointerDrag(event: PointerEvent): boolean {
    return this.beginArchiveRelayDrag(event);
  }

  updatePointerDrag(event: PointerEvent): boolean {
    return this.updateArchiveRelayDrag(event);
  }

  releasePointerDrag(event: PointerEvent): boolean {
    return this.releaseArchiveRelayDrag(event);
  }

  cancelPointerDrag(): void {
    this.cancelArchiveRelayDrag();
  }

  isPointingAtRelay(event: PointerEvent): boolean {
    return this.findPointedArchiveSignalRelay(event) !== null;
  }

  forEachDynamicObject(
    visit: (object: THREE.Object3D) => void,
  ): void {
    const pulse = this.observabilityPulse;
    const logs = this.observabilityLogCascade?.points;
    const collector = this.state?.collectorRoot;
    if (pulse) visit(pulse);
    if (logs) visit(logs);
    if (collector) visit(collector);
  }

  refreshQuality(): void {
    const cascade = this.observabilityLogCascade;
    if (!cascade) return;
    cascade.points.material.size =
      (this.quality === "low"
        ? 34
        : this.quality === "medium"
          ? 40
          : 46) +
      (cascade.stage === "thunder" ? 4 : 0);
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
          ? new THREE.Color(index % 10 === 0 ? this.host.colors.coral : this.host.colors.amber)
          : new THREE.Color(
              index % 3 === 0
                ? this.host.colors.cyan
                : index % 3 === 1
                  ? this.host.colors.green
                  : this.host.colors.violet,
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


  private createArchiveSignalPuzzle(parent: THREE.Group): void {
    const root = new THREE.Group();
    root.name = "archive-sunless-heliograph";
    parent.add(root);

    const relayConfigs = [
      {
        name: "violet",
        x: -8,
        z: 4,
        color: this.host.colors.violet,
        targets: [1, 2, 3] as const,
      },
      {
        name: "cyan",
        x: 8,
        z: 5,
        color: this.host.colors.cyan,
        targets: [0, 2, 3, "lens"] as const,
      },
      {
        name: "amber",
        x: -6,
        z: -6,
        color: this.host.colors.amber,
        targets: [0, 1, 3, "lens"] as const,
      },
      {
        name: "green",
        x: 10.2,
        z: 0.4,
        color: this.host.colors.green,
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
      this.host.materials.darkStone,
    );
    sourceBase.castShadow = false;
    const sourceDeck = addCylinder(
      source,
      0.94,
      1.05,
      0.12,
      12,
      [0, 0.41, 0],
      this.host.materials.brass,
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
        this.host.materials.brass,
      );
      brace.rotation.y = index * 0.55;
      sourceGimbal.add(brace);
    }
    const sourceRings = [
      new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.032, 5, 36),
        new THREE.MeshBasicMaterial({
          color: this.host.colors.amber,
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
          color: this.host.colors.cyan,
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
        emissive: this.host.colors.amber,
        emissiveIntensity: 1.45,
        roughness: 0.2,
        metalness: 0.18,
        flatShading: true,
      }),
    );
    sourceCore.scale.y = 1.35;
    sourceGimbal.add(sourceCore);
    const sourceLight = new THREE.PointLight(this.host.colors.amber, 0, 6.5, 2);
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
        this.host.materials.brass,
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
      this.host.colors.violet,
      this.host.colors.amber,
      this.host.colors.cyan,
      this.host.colors.green,
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
        color: this.host.colors.cyan,
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
        color: this.host.colors.cyan,
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
        color: this.host.colors.cyan,
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
        color: this.host.colors.cyan,
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
        color: this.host.colors.cyan,
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
        color: this.host.colors.cyan,
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
      this.host.colors.cyan,
      this.host.colors.violet,
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
        color: this.host.colors.amber,
        arc: Math.PI * 1.62,
        rotation: new THREE.Euler(Math.PI / 2 + 0.18, 0.34, 0.15),
      },
      {
        radius: 1.46,
        color: this.host.colors.cyan,
        arc: Math.PI * 1.42,
        rotation: new THREE.Euler(Math.PI / 2 - 0.25, -0.42, 1.68),
      },
      {
        radius: 1.72,
        color: this.host.colors.violet,
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
      this.host.colors.violet,
      this.host.colors.amber,
      this.host.colors.cyan,
      this.host.colors.green,
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

    this.host.registerClimbableBox(
      sourceBase,
      "archive-heliograph-base",
      "You balance on the heliograph plinth. Four relay seals wait below.",
      undefined,
      false,
    );
    for (const occluder of [sourceBase, sourceDeck, sourceGimbal]) {
      this.host.registerPlayerOccluder(occluder);
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
        object.layers.set(this.host.playerRenderLayer);
      });
    }
    // Preserve direct pointer activation after moving the visible dish away
    // from the ordinary world layer.
    collectorDish.layers.enable(this.host.pointerInteractionLayer);
    const toggleSource = () => this.toggleArchiveSignalEmitter();
    this.host.addInteraction(
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
      this.host.addPointerAction(object, toggleSource, 5.4);
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
      this.host.materials.darkStone,
    );
    base.castShadow = false;
    const brassRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.67, 0.05, 5, 24),
      this.host.materials.brass,
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
    pointerProxy.layers.set(this.host.pointerInteractionLayer);
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
    this.host.addInteraction(
      `archive-signal-prism-${id}`,
      "Turn archive prism",
      x,
      z,
      1.95,
      turnRelay,
    );
    this.host.registerClimbableBox(
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
    const relayCollider = this.host.addStaticBox(
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
    this.host.registerPlayerOccluder(group);
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
    this.host.updateInteractionLabel(
      "archive-signal-source",
      this.archiveSignalPowered
        ? "Quench the sunless heliograph"
        : "Wake the sunless heliograph",
    );
    this.host.onStatus(
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
      this.host.getStaticColliders(),
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
        const segmentColor =
          this.decodedSegmentColors[segment.color];
        this.writeArchiveSignalRibbonSegment(
          puzzle.constellationPositions,
          puzzle.constellationColors,
          index,
          start,
          end,
          segmentColor,
          0.075,
        );
        this.writeArchiveSignalRibbonSegment(
          puzzle.constellationAuraPositions,
          puzzle.constellationAuraColors,
          index,
          start,
          end,
          segmentColor,
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
      this.host.onStatus(
        `${turnObservation} Its crystal face remains dark; no carrier reaches it from the current chain.`,
      );
      return;
    }
    if (puzzle.powerTarget < 0.5 || puzzle.powerBlend < 0.88) {
      this.host.onStatus(
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
        this.host.onStatus(
          `${turnObservation} Violet, amber, cyan, and green lock in phase. Green crosses the observability center and returns the carrier to violet. The route vanishes from the projection. An eclipsed world opens its eye, and one cold pulse leaves the mapped sky.`,
          {
            kind: "achievement",
            title: archiveSignalAchievement,
          },
        );
      } else {
        this.host.onStatus(
          `${turnObservation} The amplified phase locks again. The distant eclipse opens above the lens and resumes its unanswered transmission.`,
        );
      }
      return;
    }
    if (puzzle.lensOutcome === "cyan-monitor") {
      this.triggerObservabilityScan();
      this.host.onStatus(
        `${turnObservation} Cyan converges through the ring and strikes the monitor bank. One shrill block of telemetry blooms across the glass, then the trace ends.`,
      );
      return;
    }
    if (puzzle.lensOutcome === "amber-void") {
      this.triggerObservabilityScan();
      this.host.onStatus(
        `${turnObservation} Amber crosses the ring undaunted. The overdriven carrier clears the Archive rim and keeps burning into the void.`,
      );
      return;
    }
    if (puzzle.result === "incomplete") {
      this.triggerObservabilityScan();
      const missing = puzzle.relays.length - puzzle.visitedCount;
      this.host.onStatus(
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
      this.host.onStatus(
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
      this.host.onStatus(
        twoColorLoop
          ? `${turnObservation} Green returns the split violet carrier almost through the observability center. The two-color loop climbs into a violent resonance, but without amber gain and cyan alignment it cannot stabilize.`
          : `${turnObservation} The return crosses observability with enormous raw gain, but its incomplete phase order turns feedback into a bright, unstable whine.`,
      );
      return;
    }
    if (puzzle.feedbackStrength > 0) {
      this.triggerObservabilityScan();
    }
    this.host.onStatus(
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
    const collapseFrame = this.collapseFrame;
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
        this.feedbackVioletColor,
        this.feedbackGreenColor,
        colorBlend,
      );
      puzzle.feedbackColumn.material.color.lerpColors(
        this.feedbackGreenColor,
        this.feedbackVioletColor,
        colorBlend,
      );
    } else {
      puzzle.receiverHalo.material.color.setHex(this.host.colors.cyan);
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
    puzzle: ArchiveSignalPuzzleState,
    enabled: boolean,
  ): number {
    const effect = puzzle.interruption;
    const player = this.host.getPlayerGroup().position;
    effect.blocker.x = player.x;
    effect.blocker.z = player.z;
    effect.blocker.minY = player.y + 0.08;
    effect.blocker.maxY =
      player.y + this.playerCollisionHeight * 0.78;
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
    puzzle: ArchiveSignalPuzzleState,
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
    const player = this.host.getPlayerGroup().position;
    effect.bodyShimmer.position.set(
      player.x - effect.result.x,
      player.y +
        this.playerCollisionHeight * 0.42 -
        effect.result.y,
      player.z - effect.result.z,
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
    puzzle: ArchiveSignalPuzzleState,
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


  private createObservabilityRing(parent: THREE.Group, x: number, z: number): void {
    const group = new THREE.Group();
    group.name = "archive-observability-ring";
    group.position.set(x, 0, z);
    this.observabilityGroup = group;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.15, 6, 22), this.host.materials.cyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    group.add(ring);
    const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.host.materials.cyanSoft);
    signal.position.y = 1.35;
    group.add(signal);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(1.72, 1.86, 28),
      new THREE.MeshBasicMaterial({
        color: this.host.colors.cyan,
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
    this.host.addAnimatedItem({
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


  private findPointedArchiveSignalRelay(
    event: PointerEvent,
  ): ArchiveSignalRelay | null {
    const puzzle = this.archiveSignalPuzzle;
    if (!puzzle) return null;
    this.host.updatePointerRay(event);
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
      this.host.isOtherPointerDragActive()
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
    this.host.setPointerReachTarget(
      relay.pointerProxy,
      this.elapsed + 0.42,
    );
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
    this.host.updatePointerRay(event);
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
    this.host.setPointerReachTarget(
      hold.relay.pointerProxy,
      this.elapsed + 0.16,
    );
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
    this.host.syncPointerCursor("grab");
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
    this.host.syncPointerCursor();
  }


}
