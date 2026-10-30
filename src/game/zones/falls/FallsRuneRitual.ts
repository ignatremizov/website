import * as THREE from "three";

import type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
} from "../../../world/WorldContracts";
import type { Kickable } from "../../Kickable";
import { surfaceOverlapsCircle, type SurfaceArea } from "../../SurfaceSelection.ts";
import type { WorldCollapseFrame } from "../../WorldCollapseSequence";
import { addBox, addCylinder } from "../../scenePrimitives.ts";
import {
  fallsRitualLightCapacity,
  getFallsPointLightBudget,
} from "./FallsLightBudget.ts";
import { fallsLandmarks, getFallsTerraceHeight, isAtFallsSocketHeight } from "./FallsLayout.ts";
import { socketPlacementIsBlocked } from "./FallsSocketSelection.ts";

type RuneId = "moon" | "tide" | "ember";

interface FallsInteractionHandle {
  isAvailable?: () => boolean;
}

interface FallsAnimatedItem {
  object: THREE.Object3D;
  originY: number;
  phase: number;
  amplitude: number;
  rotationSpeed: number;
  rotationAxis?: "x" | "y" | "z";
}

export interface FallsRitualFishBaitSource {
  readonly broken: boolean;
  readonly color: THREE.Color;
  readonly shards: readonly FallsFishBaitShard[];
}

export interface FallsFishBaitShard {
  proxy: THREE.Mesh | null;
  kickable: Kickable | null;
  readonly fishBaitEligible: boolean;
  consumed: boolean;
  fishBaitAge: number;
}

export interface FallsChestRewardResolution {
  surgeUnlocked: boolean;
  packetUnlocked: boolean;
  thunderReady: boolean;
}

export interface FallsRuneRitualHost {
  materials: Readonly<{
    amber: THREE.Material;
    brass: THREE.Material;
    cyan: THREE.MeshBasicMaterial;
    darkStone: THREE.Material;
    green: THREE.Material;
    coral: THREE.Material;
    mossDark: THREE.Material;
    parchment: THREE.Material;
    violet: THREE.Material;
    wood: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    coral: number;
    cyan: number;
    green: number;
    violet: number;
  }>;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
    requiresLantern?: boolean,
    maximumPlayerElevation?: number,
  ) => FallsInteractionHandle;
  addStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
    solidTop?: number,
  ) => {
    stepHeight?: number;
    intersectsHorizontal?: (x: number, z: number, radius: number) => boolean;
  };
  registerSolid: (
    object: THREE.Object3D,
    id: string | null,
    stepHeight?: number,
  ) => SurfaceArea | null;
  addRemovableStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
    solidTop?: number,
  ) => () => void;
  addSurface: (surface: SurfaceArea) => void;
  addAnimatedItem: (item: FallsAnimatedItem) => void;
  registerKickable: (
    object: THREE.Object3D,
    radius: number,
    restingY: number,
    platform: SurfaceArea | null,
    gravity: boolean,
    pinballRadius: number | null,
    friction: number,
    message: string,
  ) => Kickable;
  updateInteractionLabel: (id: string, label: string) => void;
  moveInteraction: (id: string, x: number, z: number) => void;
  refreshCollisionDebug: () => void;
  cancelKickableHold: (kickable: Kickable) => void;
  recallFlyingFishMagic: (
    target: THREE.Vector3,
    color: THREE.Color,
    maximumSchools: number,
    duration: number,
  ) => number;
  settleFlyingFishSchools: () => boolean;
  surfaceContainsPoint: (
    surface: SurfaceArea,
    x: number,
    z: number,
    margin?: number,
  ) => boolean;
  claimChestReward: () => FallsChestRewardResolution;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getPlayerFeetHeight: () => number;
  getHeldKickable: () => Kickable | null;
  getTelekinesisPlacementSurface: () => SurfaceArea | null;
  getQuality: () => QualityTier;
  getElapsed: () => number;
  getLanternBlend: () => number;
  getSpellCastSequence: () => number;
  isReducedMotion: () => boolean;
}

interface RitualCrystalCarry {
  id: string;
  affinity: RuneId | null;
  color: THREE.Color;
  object: THREE.Object3D;
  kickable: Kickable;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  shadowRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  origin: THREE.Vector3;
  socketedAt: RuneId | null;
  blockedSocket: RuneId | null;
  shatteredAtSocket: RuneId | null;
  impactCooldownUntil: number;
  restorationAge: number;
  restorationDuration: number;
}

interface RitualLightSlot {
  light: THREE.PointLight;
  target: RitualCrystalCarry | null;
}

interface FallsRuneShard extends FallsFishBaitShard {
  origin: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  lastMatrixPosition: THREE.Vector3;
  lastMatrixRotation: THREE.Euler;
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
  shards: FallsRuneShard[];
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
  ambientRotation: number;
  matrixDirty: boolean;
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
  /** Last rendered growth, capped when every root has reached full size. */
  rootMatrixGrowth: number;
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
  shards: FallsRuneShard[];
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
  restorations: (RitualCrystalRestorationResult | null)[];
  pointCount: number;
  age: number;
  duration: number;
  nextRestorationIndex: number;
  nextTargetIndex: number;
  active: boolean;
}

interface RitualCrystalRestorationResult {
  restored: boolean;
  consumedShards: number;
}

interface ChestBurst {
  coins: THREE.InstancedMesh;
  lightPosition: THREE.Vector3;
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

// Intact clusters have a base-origin body, independent of breathing facets,
// restoration scale, and the aura extending below the visible mineral tips.
// Use the same envelope while held, released, and resting (as the frog does).
const ritualCrystalCollisionHeight = 2.15;

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

// The tallest central facet is the fractured cluster's persistent physical
// anchor. It remains movable and traceable, but the fish may only consume the
// four smaller loose facets around it.
const runeCrystalAnchorShardIndex = 1;

export class FallsRuneRitual {
  private root: THREE.Group | null = null;
  private chestLid: THREE.Group | null = null;
  private chestPrize: THREE.Mesh | null = null;
  private chestBurst: ChestBurst | null = null;
  private chestOpened = false;
  private chestLightLeased = false;
  private caveSeal: THREE.Group | null = null;
  private releaseCaveSealCollision: (() => void) | null = null;
  private readonly puzzleWaterfallPanels: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private waterfallOpening = 0;
  private readonly runeStones = new Map<RuneId, RuneCrystalState>();
  private readonly runeSockets = new Map<RuneId, RuneSocketState>();
  private readonly ritualDecoys = new Map<string, RitualDecoyCrystalState>();
  private readonly ritualCrystals: RitualCrystalCarry[] = [];
  private readonly fishBaitSources: FallsRitualFishBaitSource[] = [];
  private runeSparkles: RuneSparklePool | null = null;
  private readonly ritualLightSlots: RitualLightSlot[] = [];
  private runeGroundGlowTexture: THREE.CanvasTexture | null = null;
  private runeTinkleAge = 2;
  private runeTinkleBaseIntensity = 0;
  private runeTinkleLightLeased = false;
  private runeTinklePeakIntensity = 0;
  private socketRootWarmupFrames = 0;
  private runeDiagnosticTrace: RuneDiagnosticTrace | null = null;
  private runeProgress = 0;
  private fantasyPuzzleSolved = false;

  private readonly host: FallsRuneRitualHost;

  constructor(host: FallsRuneRitualHost) {
    this.host = host;
  }

  registerWaterfallPanel(
    panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  ): void {
    this.puzzleWaterfallPanels.push(panel);
  }

  mount(parent: THREE.Group): void {
    if (this.root) {
      throw new Error("The Falls rune ritual is already mounted.");
    }
    this.root = parent;
    const chest = fallsLandmarks.chest;
    this.createHiddenChest(parent, chest.x, chest.z, chest.y);
    this.host.addStaticBox(chest.x, chest.y + 0.45, chest.z, 0.85, 0.5, 0.6, chest.y + 1.2);
    const chestInteraction = this.host.addInteraction(
      "waterfall-chest",
      "Inspect weathered chest",
      chest.x,
      chest.z,
      1.9,
      () => this.openHiddenChest(),
      false,
      chest.y + 1.35,
    );
    chestInteraction.isAvailable = () =>
      this.fantasyPuzzleSolved && this.host.getPlayerFeetHeight() >= chest.y - 0.2;
    this.createCaveSeal(parent, fallsLandmarks.cave.x, fallsLandmarks.cave.z + 0.38, chest.y);

    this.createRuneEffects(parent);
    const cache = fallsLandmarks.cache;
    const crystalCache = this.createRitualCrystalCache(parent, cache.x, cache.z, cache.y);
    const runeConfigs = [
      ["moon", fallsLandmarks.sockets.moon, cache.x + 1.05, cache.z + 0.65, this.host.colors.violet],
      ["tide", fallsLandmarks.sockets.tide, cache.x - 1.05, cache.z - 0.65, this.host.colors.cyan],
      ["ember", fallsLandmarks.sockets.ember, cache.x, cache.z + 0.65, this.host.colors.amber],
    ] as const;

    for (const [id, socket, sourceX, sourceZ, color] of runeConfigs) {
      const { x: socketX, z: socketZ, y: socketY } = socket;
      const label = "Inspect socket";
      this.createRuneSocket(parent, id, socketX, socketZ, color, socketY);
      const rune = this.createRuneCrystal(
        parent,
        id,
        label,
        sourceX,
        sourceZ,
        socketX,
        socketZ,
        color,
        crystalCache,
        socketY,
      );
      this.runeStones.set(id, rune);
      this.fishBaitSources.push(rune);
      const looseCrystalInteraction = this.host.addInteraction(
        `ritual-crystal-${id}`,
        "Touch loose crystal",
        sourceX,
        sourceZ,
        1.55,
        () => this.soundLooseRuneCrystal(id),
      );
      looseCrystalInteraction.isAvailable = () =>
        rune.carry.socketedAt === null &&
        Math.abs(this.host.getPlayerFeetHeight() - this.getRitualCrystalTargetObject(rune.carry).position.y) < 1.7 &&
        (!rune.broken ||
          this.getRitualCrystalAnchorShard(rune.carry) !== null);
      const socketInteraction = this.host.addInteraction(
        `rune-${id}`,
        label,
        socketX,
        socketZ,
        2.15,
        () => this.inspectOrActivateRuneSocket(id),
      );
      socketInteraction.isAvailable = () =>
        Math.abs(this.host.getPlayerFeetHeight() - socketY) < 1.3;
    }
    this.createRitualDecoyCrystal(
      parent,
      "verdant",
      cache.x - 1.05,
      cache.z + 0.65,
      this.host.materials.green,
      crystalCache,
    );
    this.createRitualDecoyCrystal(
      parent,
      "coral",
      cache.x + 1.05,
      cache.z - 0.65,
      this.host.materials.coral,
      crystalCache,
    );
    this.createRitualDecoyCrystal(
      parent,
      "pale",
      cache.x,
      cache.z - 0.65,
      this.host.materials.parchment,
      crystalCache,
    );
    this.syncRitualSocketPlacementStates();
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    this.socketRootWarmupFrames = 2;
  }

  unmount(): void {
    this.releaseCaveSealCollision?.();
    this.root = null;
    this.chestLid = null;
    this.chestPrize = null;
    this.chestBurst = null;
    this.chestOpened = false;
    this.chestLightLeased = false;
    this.caveSeal = null;
    this.releaseCaveSealCollision = null;
    this.puzzleWaterfallPanels.length = 0;
    this.waterfallOpening = 0;
    this.runeStones.clear();
    this.runeSockets.clear();
    this.ritualDecoys.clear();
    this.ritualCrystals.length = 0;
    this.fishBaitSources.length = 0;
    this.runeSparkles = null;
    this.ritualLightSlots.length = 0;
    this.runeGroundGlowTexture = null;
    this.runeTinkleAge = 2;
    this.runeTinkleBaseIntensity = 0;
    this.runeTinkleLightLeased = false;
    this.runeTinklePeakIntensity = 0;
    this.socketRootWarmupFrames = 0;
    this.runeDiagnosticTrace = null;
    this.runeProgress = 0;
    this.fantasyPuzzleSolved = false;
  }

  update(delta: number): void {
    this.updateChestBurst(delta);
    this.updateFantasyWaterfall(delta);
    this.updateRuneEffects(delta);
  }

  updatePlacements(): void {
    this.updateRitualCrystalPlacements();
  }

  refreshQuality(): void {
    if (this.chestBurst && this.chestBurst.age >= 2.2) {
      this.chestBurst.count =
        this.host.getQuality() === "low" ? 10 : 18;
    }
    if (this.runeSparkles) {
      const quality = this.host.getQuality();
      this.runeSparkles.points.material.size =
        quality === "low" ? 0.1 : quality === "medium" ? 0.13 : 0.15;
    }
    this.syncRitualLightVisibility();
  }

  private syncRitualLightVisibility(): void {
    const budget = getFallsPointLightBudget(this.host.getQuality());
    const tinkleActive =
      this.runeTinkleLightLeased &&
      !this.host.isReducedMotion() &&
      this.runeTinkleAge < 0.62;
    if (budget.ritualAmbientSlots === 0) {
      this.runeTinkleBaseIntensity = 0;
    }
    for (const [index, slot] of this.ritualLightSlots.entries()) {
      // This is the only ritual-light visibility write. It runs at mount and
      // on explicit quality changes, never during a crystal interaction.
      slot.light.visible = index < budget.ritualVisibleSlots;
      if (
        index >= budget.ritualAmbientSlots &&
        !(index === 0 && (tinkleActive || (this.chestBurst?.age ?? 3) < 2.2))
      ) {
        slot.light.intensity = 0;
        slot.target = null;
      }
    }
  }

  hasActiveMotion(): boolean {
    const waterfallTarget = this.fantasyPuzzleSolved ? 1 : 0;
    return (
      (this.chestBurst?.age ?? 3) < 2.2 ||
      Math.abs(this.waterfallOpening - waterfallTarget) > 0.002 ||
      (this.runeDiagnosticTrace?.active ?? false) ||
      this.runeTinkleAge < 0.7
    );
  }

  isSolved(): boolean {
    return this.fantasyPuzzleSolved;
  }

  pulseFromSpell(
    stage: SpellStage,
    charge: number,
    range: number,
  ): number {
    this.twinkleNearbyRitualCrystals(range, stage, charge);
    return this.revealRuneSockets(range, 1.45 + charge * 1.8);
  }

  getFishBaitSources(): readonly FallsRitualFishBaitSource[] {
    return this.fishBaitSources;
  }

  triggerTinkleAt(
    position: THREE.Vector3,
    color: THREE.Color,
    hits: number,
    strength = 1,
  ): void {
    this.triggerCrystalTinkle(position, color, hits, strength);
  }

  reactToWorldCollapse(
    frame: WorldCollapseFrame,
    delta: number,
  ): void {
    for (const panel of this.puzzleWaterfallPanels) {
      panel.rotation.z +=
        Math.sin(this.host.getElapsed() * 2.1 + panel.position.x) *
        frame.instability *
        delta *
        1.08;
    }
    for (const rune of this.runeStones.values()) {
      rune.facetMaterial.emissiveIntensity =
        0.7 +
        frame.instability *
          (1.4 +
            Math.sin(this.host.getElapsed() * 7 + rune.group.position.x) *
              0.5);
    }
  }

  forEachDynamicObject(
    visit: (object: THREE.Object3D | null) => void,
  ): void {
    visit(this.chestLid);
    visit(this.chestPrize);
    visit(this.caveSeal);
    for (const panel of this.puzzleWaterfallPanels) visit(panel);
    for (const rune of this.runeStones.values()) visit(rune.group);
    for (const decoy of this.ritualDecoys.values()) visit(decoy.group);
    visit(this.runeSparkles?.points ?? null);
    visit(this.runeDiagnosticTrace?.path ?? null);
    visit(this.runeDiagnosticTrace?.packet ?? null);
  }

  complete(): boolean {
    if (!this.root || this.fantasyPuzzleSolved) {
      return this.fantasyPuzzleSolved;
    }
    this.reset(false);
    for (const id of ["moon", "tide", "ember"] as const) {
      const rune = this.runeStones.get(id);
      if (rune) this.seatRuneCrystal(rune, false);
    }
    for (const id of ["moon", "tide", "ember"] as const) {
      this.activateFantasyRune(id);
    }
    return this.fantasyPuzzleSolved;
  }

  trace(): boolean {
    const trace = this.runeDiagnosticTrace;
    const orderedRunes = (["moon", "tide", "ember"] as const)
      .map((id) => this.runeStones.get(id))
      .filter((rune): rune is RuneCrystalState => rune !== undefined);
    if (
      !this.root ||
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
          ? this.host.getPlayerPosition().x
          : previous?.position.x ?? this.host.getPlayerPosition().x;
      const startZ =
        segment === 0
          ? this.host.getPlayerPosition().z
          : previous?.position.z ?? this.host.getPlayerPosition().z;
      for (let step = segment === 0 ? 0 : 1; step <= segmentSteps; step += 1) {
        const progress = step / segmentSteps;
        const offset = pointIndex * 3;
        trace.positions[offset] = THREE.MathUtils.lerp(
          startX,
          end.position.x,
          progress,
        );
        trace.positions[offset + 1] =
          THREE.MathUtils.lerp(
            segment === 0 ? this.host.getPlayerFeetHeight() : previous?.position.y ?? 0,
            end.position.y,
            progress,
          ) + 1.12 + Math.sin(progress * Math.PI) * 0.72;
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
    trace.duration = this.host.isReducedMotion()
      ? Math.max(1.45, targets.length * 0.38)
      : 0.65 + targets.length * 0.7;
    trace.restorations = Array.from(
      { length: targets.length },
      () => null,
    );
    trace.nextRestorationIndex = 0;
    trace.nextTargetIndex = 0;
    trace.active = true;
    trace.path.material.color.setHex(this.host.colors.violet);
    trace.path.material.opacity = 0.92;
    trace.path.geometry.setDrawRange(
      0,
      this.host.isReducedMotion() ? trace.pointCount : 1,
    );
    (
      trace.path.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    trace.path.visible = true;
    trace.packet.visible = !this.host.isReducedMotion();
    trace.packet.position.set(
      trace.positions[0] ?? this.host.getPlayerPosition().x,
      trace.positions[1] ?? 1.12,
      trace.positions[2] ?? this.host.getPlayerPosition().z,
    );
    this.host.onStatus(
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

  resolvePinballImpact(
    kickable: Kickable,
    nextX: number,
    nextZ: number,
  ): [number, number] | null {
    const speed = Math.hypot(kickable.velocity.x, kickable.velocity.z);
    if (speed < 0.34) return null;

    for (const carry of this.ritualCrystals) {
      if (
        this.isRitualCrystalBroken(carry) ||
        this.host.getElapsed() < carry.impactCooldownUntil
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
      carry.impactCooldownUntil = this.host.getElapsed() + 0.46;
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

  private updateFantasyWaterfall(delta: number): void {
    if (this.puzzleWaterfallPanels.length === 0) return;
    const target = this.fantasyPuzzleSolved ? 1 : 0;
    const follow = this.host.isReducedMotion() ? 1 : 1 - Math.exp(-delta * 3.6);
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

  private createHiddenChest(parent: THREE.Group, x: number, z: number, y: number): void {
    const chest = new THREE.Group();
    chest.position.set(x, y, z);
    addBox(chest, [1.55, 0.66, 1], [0, 0.38, 0], this.host.materials.wood);
    addBox(
      chest,
      [1.68, 0.12, 1.08],
      [0, 0.18, 0],
      this.host.materials.brass,
    ).castShadow = false;
    addBox(
      chest,
      [0.15, 0.68, 1.08],
      [0, 0.42, 0],
      this.host.materials.brass,
    ).castShadow = false;

    const lid = new THREE.Group();
    lid.position.set(0, 0.72, -0.45);
    addBox(lid, [1.62, 0.32, 1.02], [0, 0.15, 0.45], this.host.materials.wood);
    addBox(
      lid,
      [0.16, 0.38, 1.08],
      [0, 0.16, 0.45],
      this.host.materials.brass,
    ).castShadow = false;
    chest.add(lid);
    this.chestLid = lid;

    const prize = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.27, 0),
      this.host.materials.amber,
    );
    prize.position.y = 1.18;
    prize.visible = false;
    chest.add(prize);
    this.chestPrize = prize;
    this.host.addAnimatedItem({
      object: prize,
      originY: prize.position.y,
      phase: 4,
      amplitude: 0.13,
      rotationSpeed: 0.85,
    });

    const maximumCoins = 18;
    const coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.035, 8),
      this.host.materials.amber,
      maximumCoins,
    );
    // Keep the zero-instance mesh in the render list from zone entry. This
    // prepares its instanced material/buffers before the reward's first frame,
    // without drawing coins or changing the scene's lighting at interaction time.
    coins.count = 0;
    coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    coins.frustumCulled = false;
    coins.renderOrder = 5;
    coins.userData.clickNavigationPassThrough = true;
    chest.add(coins);
    this.chestBurst = {
      coins,
      lightPosition: new THREE.Vector3(x, y + 1.2, z),
      dummy: new THREE.Object3D(),
      velocities: new Float32Array(maximumCoins * 3),
      age: 3,
      count: this.host.getQuality() === "low" ? 10 : maximumCoins,
    };
    parent.add(chest);
  }

  private openHiddenChest(): void {
    if (!this.chestLid || !this.chestPrize) return;
    if (!this.fantasyPuzzleSolved) {
      this.host.onStatus(
        "The lid does not move. Beneath the wet wood, three faint harmonics answer and fade.",
      );
      return;
    }
    if (this.chestOpened) {
      this.host.onStatus(
        "The coin rain has settled. The recovered signal still reads: keep exploring.",
      );
      return;
    }
    this.chestOpened = true;
    this.chestLid.rotation.x = -1.02;
    this.chestPrize.visible = true;
    this.triggerChestBurst();
    this.host.updateInteractionLabel("waterfall-chest", "Inspect open chest");
    const rewards = this.host.claimChestReward();
    this.host.onStatus(
      `Cache opened: coins, warm light, and one improbably dry checksum erupt from the falls.${
        rewards.thunderReady
          ? " Surge catches both completed circuits. An amber summons points back toward the Daemon Controller."
          : rewards.surgeUnlocked
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
    burst.count = this.host.getQuality() === "low" ? 10 : 18;
    burst.coins.count = burst.count;
    // Slot zero is already compiled into every quality tier. The reward
    // temporarily takes priority over tinkle/ambient light instead of adding
    // a new point-light shader variant for every lit material in the world.
    this.runeTinkleLightLeased = false;
    this.runeTinkleAge = 2;
    this.runeTinkleBaseIntensity = 0;
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
    if (burst.age >= 2.2) {
      burst.coins.count = 0;
    }
  }

  private createCaveSeal(parent: THREE.Group, x: number, z: number, y: number): void {
    const seal = new THREE.Group();
    seal.position.set(x, y, z);
    // A damp fracture face hides behind the falling water, not a portal.
    // Keep all decoration in the seal group so unlocking removes it together.
    const stone = new THREE.MeshStandardMaterial({
      color: 0x455b5b,
      roughness: 0.72,
      flatShading: true,
    });
    const outline = new THREE.Shape([
      new THREE.Vector2(-0.96, 0),
      new THREE.Vector2(0.96, 0),
      new THREE.Vector2(0.99, 0.72),
      new THREE.Vector2(0.92, 1.64),
      new THREE.Vector2(0.68, 2.34),
      new THREE.Vector2(0.12, 2.48),
      new THREE.Vector2(-0.64, 2.38),
      new THREE.Vector2(-0.98, 1.7),
      new THREE.Vector2(-1.02, 0.64),
    ]);
    const core = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, { depth: 0.22, bevelEnabled: false, steps: 1 }),
      stone,
    );
    core.position.z = -0.14;
    seal.add(core);
    const glyphMaterial = new THREE.MeshStandardMaterial({
      color: 0x738e83,
      emissive: 0x324e46,
      emissiveIntensity: 0.12,
      roughness: 0.85,
    });
    const strokeGeometry = new THREE.BoxGeometry(0.025, 0.22, 0.012);
    for (let index = 0; index < 5; index += 1) {
      const stroke = new THREE.Mesh(strokeGeometry, glyphMaterial);
      stroke.position.set(-0.18 + index * 0.09, 1.15 + (index % 2) * 0.13, 0.09);
      stroke.rotation.z = index % 2 ? -0.45 : 0.45;
      seal.add(stroke);
    }
    parent.add(seal);
    this.caveSeal = seal;
    // Block the unsolved cave entrance only across the seal's visible height;
    // the waterfall crown above it must remain traversable.
    this.releaseCaveSealCollision = this.host.addRemovableStaticBox(
      x,
      y + 1.22,
      z,
      0.92,
      1.22,
      0.16,
      y + 2.44,
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
        size: this.host.getQuality() === "low" ? 0.1 : this.host.getQuality() === "medium" ? 0.13 : 0.15,
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

    for (let index = 0; index < fallsRitualLightCapacity; index += 1) {
      const light = new THREE.PointLight(this.host.colors.cyan, 0, 5.8, 2);
      light.name =
        index === 0
          ? "falls-shared-rune-tinkle-light"
          : `falls-pooled-ritual-light-${index + 1}`;
      light.castShadow = false;
      parent.add(light);
      this.ritualLightSlots.push({ light, target: null });
    }
    this.syncRitualLightVisibility();
    this.runeTinkleAge = 2;
    this.runeTinkleBaseIntensity = 0;
    this.runeTinkleLightLeased = false;
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
        color: this.host.colors.violet,
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
      this.host.materials.cyan,
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
      restorations: [],
      pointCount: 0,
      age: 3,
      duration: 2.75,
      nextRestorationIndex: 0,
      nextTargetIndex: 0,
      active: false,
    };
  }

  private createRitualCrystalCache(
    parent: THREE.Group,
    x: number,
    z: number,
    y: number,
  ): SurfaceArea {
    const base = addBox(
      parent,
      [3.6, 0.24, 3.25],
      [x, y + 0.12, z],
      this.host.materials.darkStone,
    );
    base.castShadow = false;
    // The upper deck touches an approaching body's radius before its centre
    // reaches the narrow base tread. Keep its physical top within one 0.28
    // step from the terrace, without changing the crystal source plane.
    const deck = addBox(
      parent,
      [3.28, 0.04, 2.93],
      [x, y + 0.26, z],
      this.host.materials.mossDark,
    );
    deck.castShadow = false;
    const baseSupport = this.host.registerSolid(base, "ritual-crystal-cache-base", 0.28);
    if (baseSupport) {
      baseSupport.requiresJump = false;
      baseSupport.stepHeight = 0.28;
      baseSupport.snapGroundedHeight = true;
      baseSupport.supportMargin = 0;
      baseSupport.edgeGrace = 0;
    }
    // Keep the established +0.32 cache/source plane near the decorative ring;
    // the deck adds solid sides/underside without a competing top surface.
    this.host.registerSolid(deck, null, 0.28);

    for (const [offsetX, offsetZ] of [
      [-1.54, -1.36],
      [1.54, -1.36],
      [-1.54, 1.36],
      [1.54, 1.36],
    ] as const) {
      const marker = addCylinder(
        parent,
        0.12,
        0.16,
        0.38,
        6,
        [x + offsetX, y + 0.42, z + offsetZ],
        this.host.materials.brass,
      );
      marker.castShadow = false;
    }

    const cacheRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.045, 4, 30),
      this.host.materials.violet,
    );
    cacheRing.position.set(x, y + 0.33, z);
    cacheRing.rotation.x = Math.PI / 2;
    cacheRing.scale.y = 0.84;
    cacheRing.castShadow = false;
    parent.add(cacheRing);

    const surface: SurfaceArea = {
      id: "ritual-crystal-cache",
      x,
      z,
      halfWidth: 1.63,
      halfDepth: 1.46,
      requiresJump: false,
      stepHeight: 0.28,
      snapGroundedHeight: true,
      supportMargin: 0,
      edgeGrace: 0,
      heightAt: () => y + 0.32,
    };
    this.host.addSurface(surface);
    const interaction = this.host.addInteraction(
      "ritual-crystal-cache",
      "Inspect crystal cache",
      x,
      z,
      3,
      () => this.inspectRitualCrystalCache(surface),
    );
    interaction.isAvailable = () => Math.abs(this.host.getPlayerFeetHeight() - y) < 1.2;
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
      this.host.onStatus(
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
    this.host.onStatus(observations.join(" "));
  }

  private createRuneSocket(
    parent: THREE.Group,
    id: RuneId,
    x: number,
    z: number,
    colorValue: THREE.ColorRepresentation,
    y: number,
  ): void {
    const group = new THREE.Group();
    group.name = `rune-socket-${id}`;
    group.position.set(x, y, z);

    const base = addCylinder(
      group,
      0.92,
      1.08,
      0.18,
      14,
      [0, 0.12, 0],
      this.host.materials.darkStone,
    );
    base.castShadow = false;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.73, 0.07, 5, 24),
      this.host.materials.parchment,
    );
    // Keep the entire lip within one walking step from the terrace. A body's
    // radius touches this ring before its centre reaches the narrow base rim.
    ring.position.y = 0.21;
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
    symbol.position.y = 0.235;
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
      addInlay(innerFlame, this.host.materials.darkStone, 0.008);
    }
    group.add(symbol);

    const identityStone = addBox(
      group,
      [0.17, 0.54, 0.17],
      [0, 0.34, -1.02],
      this.host.materials.brass,
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
    // Two count-zero warmup frames compile this instanced PBR variant during
    // zone entry instead of on the first correctly seated crystal.
    roots.count = 0;
    roots.visible = true;
    group.add(roots);

    parent.add(group);
    // Round footprints avoid filling the square corners of the cylinder's
    // AABB. The shallow bowl is supported at its lip so released bodies do
    // not sink through the inlay; puzzle seating still uses socketPosition.
    for (const [suffix, radius, bottom, top] of [
      ["base", 1.08, 0.03, 0.21],
      ["bowl", 0.8, 0.21, 0.28],
    ] as const) {
      const collider = this.host.addStaticBox(
        x, y + (bottom + top) / 2, z,
        radius, (top - bottom) / 2, radius,
        y + top - 0.005, y + top,
      );
      collider.stepHeight = 0.28;
      collider.intersectsHorizontal = (px, pz, bodyRadius) =>
        (px - x) ** 2 + (pz - z) ** 2 < (radius + bodyRadius) ** 2;
      const supportRadius = suffix === "base" ? 0.92 : radius;
      this.host.addSurface({
        id: `ritual-socket-${id}-${suffix}`,
        x, z, halfWidth: supportRadius, halfDepth: supportRadius,
        requiresJump: false, stepHeight: 0.28, snapGroundedHeight: true,
        supportMargin: 0, edgeGrace: 0, debugResolution: 8,
        contains: (px, pz, margin) =>
          Math.hypot(px - x, pz - z) <= Math.max(0, supportRadius + margin),
        heightAt: () => y + top,
      });
    }
    this.runeSockets.set(id, {
      id,
      position: new THREE.Vector3(x, y, z),
      color: socketColor,
      dormantColor,
      symbolMaterial,
      roots,
      rootShards,
      dummy: new THREE.Object3D(),
      reveal: 0,
      revealUntil: 0,
      growth: 0,
      rootMatrixGrowth: Number.NaN,
    });
  }

  private getRuneGroundGlowTexture(): THREE.CanvasTexture {
    if (this.runeGroundGlowTexture) {
      return this.runeGroundGlowTexture;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#000";
      context.fillRect(0, 0, 64, 64);
      const gradient = context.createRadialGradient(
        32,
        32,
        1,
        32,
        32,
        31,
      );
      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(0.28, "#e8e8e8");
      gradient.addColorStop(0.68, "#686868");
      gradient.addColorStop(1, "#000");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = "falls-rune-ground-glow-gradient";
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    this.runeGroundGlowTexture = texture;
    return texture;
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
        : new THREE.Color(this.host.colors.green);
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
      new THREE.CircleGeometry(1.48, 28),
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: this.getRuneGroundGlowTexture(),
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
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

    this.host.addAnimatedItem({
      object: cluster,
      originY: 0,
      phase: id.length * 0.71,
      amplitude: 0.018,
      rotationSpeed: 0.035,
    });
    parent.add(group);
    const kickable = this.host.registerKickable(
      group,
      0.64,
      0.16,
      cache,
      true,
      null,
      0.91,
      "",
    );
    kickable.collisionHeight = ritualCrystalCollisionHeight;
    const { shadow, shadowRing } = this.createRitualCrystalShadow(parent, color);
    const carry: RitualCrystalCarry = {
      id,
      affinity: null,
      color: color.clone(),
      object: group,
      kickable,
      shadow,
      shadowRing,
      origin: group.position.clone(),
      socketedAt: null,
      blockedSocket: null,
      shatteredAtSocket: null,
      impactCooldownUntil: 0,
      restorationAge: 0,
      restorationDuration: 0,
    };
    this.ritualCrystals.push(carry);

    const shards: FallsRuneShard[] = runeCrystalShardTemplates.map(
      (shard, index) => ({
        origin: new THREE.Vector3(...shard.origin),
        scale: new THREE.Vector3(...shard.scale),
        rotation: new THREE.Euler(...shard.rotation),
        velocity: new THREE.Vector3(...shard.velocity),
        spin: new THREE.Vector3(...shard.spin),
        lastMatrixPosition: new THREE.Vector3(),
        lastMatrixRotation: new THREE.Euler(),
        proxy: null,
        kickable: null,
        fishBaitEligible: index !== runeCrystalAnchorShardIndex,
        consumed: false,
        fishBaitAge: 0,
      }),
    );
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
      const shardKickable = this.host.registerKickable(
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
    this.fishBaitSources.push(state);
    const interaction = this.host.addInteraction(
      `ritual-crystal-${id}`,
      "Touch loose crystal",
      x,
      z,
      1.55,
      () => this.soundLooseDecoyCrystal(id),
    );
    interaction.isAvailable = () =>
      carry.socketedAt === null &&
      Math.abs(
        this.host.getPlayerFeetHeight() -
          this.getRitualCrystalTargetObject(carry).position.y,
      ) < 1.7 &&
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
    socketY: number,
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
    const shards: FallsRuneShard[] = runeCrystalShardTemplates.map(
      (shard, index) => ({
        origin: new THREE.Vector3(...shard.origin),
        scale: new THREE.Vector3(...shard.scale),
        rotation: new THREE.Euler(...shard.rotation),
        velocity: new THREE.Vector3(...shard.velocity),
        spin: new THREE.Vector3(...shard.spin),
        lastMatrixPosition: new THREE.Vector3(),
        lastMatrixRotation: new THREE.Euler(),
        proxy: null,
        kickable: null,
        fishBaitEligible: index !== runeCrystalAnchorShardIndex,
        consumed: false,
        fishBaitAge: 0,
      }),
    );
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
      new THREE.CircleGeometry(1.48, 28),
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: this.getRuneGroundGlowTexture(),
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
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
    const crystalKickable = this.host.registerKickable(
      group,
      0.64,
      0.16,
      cache,
      true,
      null,
      0.91,
      "",
    );
    crystalKickable.collisionHeight = ritualCrystalCollisionHeight;
    const { shadow, shadowRing } = this.createRitualCrystalShadow(parent, color);
    const carry: RitualCrystalCarry = {
      id,
      affinity: id,
      color: color.clone(),
      object: group,
      kickable: crystalKickable,
      shadow,
      shadowRing,
      origin: group.position.clone(),
      socketedAt: null,
      blockedSocket: null,
      shatteredAtSocket: null,
      impactCooldownUntil: 0,
      restorationAge: 0,
      restorationDuration: 0,
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
      const shardKickable = this.host.registerKickable(
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
      socketPosition: new THREE.Vector3(socketX, socketY, socketZ),
      carry,
      placed: false,
      hits: 0,
      pulseAge: 2,
      breakAge: 2,
      activated: false,
      broken: false,
      ambientRotation: 0,
      matrixDirty: true,
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
        !rune.broken && !this.host.isReducedMotion()
          ? Math.sin(this.host.getElapsed() * 2.15 + index * 1.27) * 0.018
          : 0;
      if (rune.broken && shard.proxy) {
        rune.dummy.position.set(
          shard.proxy.position.x - rune.group.position.x,
          shard.proxy.position.y - rune.group.position.y,
          shard.proxy.position.z - rune.group.position.z,
        );
        rune.dummy.rotation.copy(shard.proxy.rotation);
        shard.lastMatrixPosition.copy(shard.proxy.position);
        shard.lastMatrixRotation.copy(shard.proxy.rotation);
      } else {
        rune.dummy.position.set(
          shard.origin.x,
          shard.origin.y + bob,
          shard.origin.z,
        );
        rune.dummy.rotation.set(
          shard.rotation.x,
          shard.rotation.y +
            rune.ambientRotation * (0.06 + index * 0.01),
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
      rune.broken
        ? 0.025
        : 0.2 + Number(rune.activated) * 0.12 + pulse * 0.2;
    rune.cracks.visible = rune.hits >= 3 && !rune.broken;
    rune.matrixDirty = false;
  }

  private updateRitualCrystalPlacements(): void {
    if (!this.root || this.ritualCrystals.length === 0) return;
    const socketRadiusSquared = 1.28 * 1.28;

    for (const carry of this.ritualCrystals) {
      if (
        !carry.kickable.enabled ||
        carry.socketedAt
      ) {
        continue;
      }

      let nearestRune: RuneCrystalState | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const rune of this.runeStones.values()) {
        if (!isAtFallsSocketHeight(carry.object.position.y, rune.socketPosition.y)) continue;
        const dx = carry.object.position.x - rune.socketPosition.x;
        const dz = carry.object.position.z - rune.socketPosition.z;
        const distance = dx * dx + dz * dz;
        if (distance < socketRadiusSquared && distance < nearestDistance) {
          nearestRune = rune;
          nearestDistance = distance;
        }
      }

      const blocked = socketPlacementIsBlocked(
        nearestRune?.id ?? null,
        carry.blockedSocket,
        nearestRune !== null && this.getRitualSocketOccupant(nearestRune.id) !== null,
      );
      carry.blockedSocket = blocked ? nearestRune!.id : null;
      if (!nearestRune || blocked || carry.kickable === this.host.getHeldKickable()) {
        continue;
      }
      const planarSpeedSquared =
        carry.kickable.velocity.x * carry.kickable.velocity.x +
        carry.kickable.velocity.z * carry.kickable.velocity.z;
      // Crystal origins sit above their physical bases. The height check above
      // accepts their visible placement; wait for a gentle release before seating.
      if (planarSpeedSquared > 4.84) continue;

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
    carry.blockedSocket = null;
    carry.shatteredAtSocket = null;
    this.blockOverlappingSocketCandidates(socketId);
    this.syncRitualSocketPlacementStates();
    this.triggerRitualCrystalTinkle(carry, 0.82);
    this.updateRuneInteractionLabels();
    if (!announce) return true;
    const descriptor = runeCrystalDescriptors[socketId];
    const correct = carry.affinity === socketId;
    const remaining = [...this.runeStones.values()].filter(
      (candidate) => !candidate.placed,
    ).length;
    this.host.onStatus(
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

  private blockOverlappingSocketCandidates(id: RuneId): void {
    const socket = this.runeStones.get(id)?.socketPosition;
    if (!socket) return;
    for (const candidate of this.ritualCrystals) {
      if (candidate.socketedAt || this.isRitualCrystalBroken(candidate)) continue;
      const position = candidate.object.position;
      if (
        isAtFallsSocketHeight(position.y, socket.y) &&
        (position.x - socket.x) ** 2 + (position.z - socket.z) ** 2 < 1.28 ** 2
      ) {
        candidate.blockedSocket = id;
      }
    }
  }

  private syncRitualSocketPlacementStates(): void {
    for (const rune of this.runeStones.values()) {
      rune.placed =
        !rune.broken &&
        rune.carry.socketedAt === rune.id &&
        this.getRitualSocketOccupant(rune.id) === rune.carry;
    }
  }

  unseatKickable(kickable: Kickable): void {
    const carry = this.ritualCrystals.find(
      (candidate) => candidate.kickable === kickable,
    );
    if (!carry?.socketedAt) return;
    // Pointer-down releases ownership before click/drag is resolved by the host.
    // Do not let a buried crystal inherit that temporary vacancy.
    this.blockOverlappingSocketCandidates(carry.socketedAt);
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
        candidate.matrixDirty = true;
      }
      this.syncRuneCrystalLocks();
      this.host.onStatus(
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

  private emitCrystalSparkles(
    position: THREE.Vector3,
    color: THREE.Color,
    hits: number,
    requestedCount: number,
  ): void {
    const pool = this.runeSparkles;
    if (!pool) return;
    const count =
      this.host.getQuality() === "low"
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
    rune.matrixDirty = true;
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
      this.host.getQuality() === "low"
        ? 3
        : this.host.getQuality() === "medium"
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
      const dx = crystal.group.position.x - this.host.getPlayerPosition().x;
      const dz = crystal.group.position.z - this.host.getPlayerPosition().z;
      const dy = crystal.group.position.y - this.host.getPlayerFeetHeight();
      if (dx * dx + dy * dy + dz * dz > rangeSquared) return;
      crystal.pulseAge = 0;
      this.emitCrystalSparkles(
        crystal.group.position,
        crystal.color,
        crystal.hits + this.host.getSpellCastSequence() + twinkled,
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

    const tinkleLight = this.ritualLightSlots[0]?.light;
    if (twinkled > 0 && tinkleLight && (this.chestBurst?.age ?? 3) >= 2.2) {
      this.runeTinklePeakIntensity =
        (this.host.getQuality() === "low" ? 0.75 : 1.2) *
        stageStrength *
        (0.85 + charge * 0.25);
      this.runeTinkleAge = 0;
      if (!this.host.isReducedMotion()) {
        if (!this.runeTinkleLightLeased) {
          this.runeTinkleBaseIntensity = tinkleLight.intensity;
        }
        this.runeTinkleLightLeased = true;
        tinkleLight.position.set(
          centerX / twinkled,
          centerY / twinkled + 1.15,
          centerZ / twinkled,
        );
        tinkleLight.color.setRGB(
          colorR / twinkled,
          colorG / twinkled,
          colorB / twinkled,
        );
        tinkleLight.distance = 4.8;
        tinkleLight.intensity =
          this.runeTinkleBaseIntensity + this.runeTinklePeakIntensity;
      }
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
    const tinkleLight = this.ritualLightSlots[0]?.light;
    if (!tinkleLight) return;
    this.runeTinklePeakIntensity =
      (this.host.getQuality() === "low" ? 0.75 : 1.2) * strength;
    this.runeTinkleAge = 0;
    if (this.host.isReducedMotion() || (this.chestBurst?.age ?? 3) < 2.2) return;
    if (!this.runeTinkleLightLeased) {
      this.runeTinkleBaseIntensity = tinkleLight.intensity;
    }
    this.runeTinkleLightLeased = true;
    tinkleLight.color.copy(color);
    tinkleLight.position.set(
      position.x,
      position.y + 1.15,
      position.z,
    );
    tinkleLight.distance = 4.8;
    tinkleLight.intensity =
      this.runeTinkleBaseIntensity + this.runeTinklePeakIntensity;
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
  ): FallsRuneShard | null {
    const shards =
      this.getRuneForCarry(carry)?.shards ??
      this.getDecoyForCarry(carry)?.shards ??
      [];
    let anchor: FallsRuneShard | null = null;
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

  private describeRemainingLesserFacets(
    carry: RitualCrystalCarry,
    faintly: boolean,
  ): string {
    const shards =
      this.getRuneForCarry(carry)?.shards ??
      this.getDecoyForCarry(carry)?.shards ??
      [];
    const anchor = this.getRitualCrystalAnchorShard(carry);
    const remaining = shards.filter(
      (shard) =>
        shard !== anchor &&
        !shard.consumed &&
        shard.proxy?.visible === true &&
        shard.kickable?.enabled === true,
    ).length;
    if (remaining === 0) {
      return "No lesser piece answers. The river's bright mouths have swallowed every facet they could take.";
    }
    const count =
      ["No", "One", "Two", "Three", "Four"][remaining] ??
      String(remaining);
    const noun = remaining === 1 ? "piece" : "pieces";
    const verb = remaining === 1 ? "answers" : "answer";
    const pronoun = remaining === 1 ? "it has" : "they have";
    return `${count} lesser ${noun} ${verb} it${faintly ? " faintly" : ""} from wherever ${pronoun} fallen.`;
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
      this.host.updateInteractionLabel(`rune-${rune.id}`, label);
      this.host.updateInteractionLabel(
        `ritual-crystal-${rune.id}`,
        rune.broken
          ? "Inspect largest facet"
          : rune.hits >= 3
            ? "Inspect fractured crystal"
            : "Touch loose crystal",
      );
    }
    for (const decoy of this.ritualDecoys.values()) {
      this.host.updateInteractionLabel(
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
    rune.carry.restorationAge = 0;
    rune.carry.restorationDuration = 0;
    rune.carry.object.scale.setScalar(1);
    rune.broken = true;
    rune.placed = false;
    rune.activated = false;
    rune.breakAge = 0;
    rune.matrixDirty = true;
    rune.carry.shatteredAtSocket = rune.carry.socketedAt;
    if (rune.carry.socketedAt) this.blockOverlappingSocketCandidates(rune.carry.socketedAt);
    rune.carry.socketedAt = null;
    rune.carry.object.userData.ritualSocketed = false;
    rune.carry.kickable.enabled = false;
    rune.carry.kickable.velocity.set(0, 0, 0);
    this.runeProgress = 0;
    for (const candidate of this.runeStones.values()) {
      candidate.activated = false;
      candidate.matrixDirty = true;
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
    this.host.onStatus(
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
      this.host.onStatus(
        `The largest facet still carries the cluster's impossible light. ${this.describeRemainingLesserFacets(rune.carry, false)}`,
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
    this.host.onStatus(
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
      this.host.onStatus(
        `The largest facet still shines with borrowed colour. ${this.describeRemainingLesserFacets(crystal.carry, true)}`,
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
    this.host.onStatus(
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
    crystal.carry.restorationAge = 0;
    crystal.carry.restorationDuration = 0;
    crystal.carry.object.scale.setScalar(1);
    crystal.broken = true;
    crystal.breakAge = 0;
    crystal.carry.shatteredAtSocket = crystal.carry.socketedAt;
    if (crystal.carry.socketedAt) this.blockOverlappingSocketCandidates(crystal.carry.socketedAt);
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
    this.host.onStatus(
      `The ${wasPlaced ? "seated" : "loose"} crystal gives one bright, regrettable tinkle and shatters. Five pieces scatter across the stone.`,
    );
  }

  private recallRitualCrystalShards(
    shards: FallsRuneShard[],
    center: THREE.Vector3,
  ): number {
    let consumedShards = 0;
    for (const shard of shards) {
      if (!shard.proxy || !shard.kickable) continue;
      if (shard.consumed) consumedShards += 1;
      this.host.cancelKickableHold(shard.kickable);
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
    duration: number,
  ): RitualCrystalRestorationResult {
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
    this.host.cancelKickableHold(carry.kickable);
    carry.object.position.copy(restoreCenter);
    carry.restorationAge = 0;
    carry.restorationDuration = this.host.isReducedMotion() ? 0 : duration;
    carry.object.scale.setScalar(
      carry.restorationDuration > 0 ? 0.04 : 1,
    );
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
      decoy.groundGlow.material.opacity = 0.2;
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
        carry.blockedSocket = null;
        this.blockOverlappingSocketCandidates(restoreSocket);
      }
    } else {
      carry.object.userData.ritualSocketed = false;
      carry.socketedAt = null;
      if (restoreSocket) {
        const angle = carry.id.length * 1.37;
        carry.object.position.x += Math.cos(angle) * 1.35;
        carry.object.position.z += Math.sin(angle) * 1.35;
        // A different crystal can occupy the remembered socket during repair.
        // Keep the displaced crystal above its local terrace, then let the
        // shared prop solver land it; never restore it inside the old floor.
        carry.object.position.y = Math.max(
          carry.object.position.y,
          getFallsTerraceHeight(carry.object.position.x, carry.object.position.z),
        );
      }
    }

    this.syncRitualSocketPlacementStates();
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    return { restored: true, consumedShards };
  }

  reset(announce: boolean): boolean {
    if (
      !this.root ||
      this.runeStones.size === 0
    ) {
      return false;
    }
    const preserveSolvedRitual = this.fantasyPuzzleSolved;
    let changed = !preserveSolvedRitual && this.runeProgress > 0;
    const flyingFishReset = this.host.settleFlyingFishSchools();
    changed ||= flyingFishReset;
    if (!preserveSolvedRitual) this.runeProgress = 0;
    const carriesToReset = preserveSolvedRitual
      ? [...this.ritualDecoys.values()].map((crystal) => crystal.carry)
      : this.ritualCrystals;
    for (const carry of carriesToReset) {
      changed ||=
        carry.socketedAt !== null ||
        carry.object.position.distanceToSquared(carry.origin) > 0.0025;
      this.host.cancelKickableHold(carry.kickable);
      carry.object.position.copy(carry.origin);
      carry.object.rotation.set(0, 0, 0);
      carry.object.userData.ritualSocketed = false;
      carry.kickable.enabled = true;
      carry.kickable.velocity.set(0, 0, 0);
      carry.kickable.onPlatform = carry.kickable.platform !== null;
      carry.kickable.kickCooldown = 0;
      carry.socketedAt = null;
      carry.shatteredAtSocket = null;
      carry.blockedSocket = null;
      carry.impactCooldownUntil = 0;
      carry.restorationAge = 0;
      carry.restorationDuration = 0;
      carry.object.scale.setScalar(1);
    }
    for (const crystal of this.ritualDecoys.values()) {
      changed ||= crystal.hits > 0 || crystal.broken;
      for (const shard of crystal.shards) {
        if (!shard.proxy || !shard.kickable) continue;
        shard.consumed = false;
        shard.fishBaitAge = 0;
        changed ||= shard.kickable.enabled;
        this.host.cancelKickableHold(shard.kickable);
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
      crystal.groundGlow.material.opacity = 0.2;
    }
    if (!preserveSolvedRitual) {
      for (const rune of this.runeStones.values()) {
        changed ||= rune.hits > 0 || rune.broken || rune.activated;
        for (const shard of rune.shards) {
          if (!shard.proxy || !shard.kickable) continue;
          shard.consumed = false;
          shard.fishBaitAge = 0;
          changed ||= shard.kickable.enabled;
          this.host.cancelKickableHold(shard.kickable);
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
      this.host.onStatus(
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
      const dx = socket.position.x - this.host.getPlayerPosition().x;
      const dz = socket.position.z - this.host.getPlayerPosition().z;
      const dy = socket.position.y - this.host.getPlayerFeetHeight();
      if (dx * dx + dy * dy + dz * dz > rangeSquared) continue;
      socket.revealUntil = Math.max(
        socket.revealUntil,
        this.host.getElapsed() + duration,
      );
      socket.reveal = Math.max(socket.reveal, 0.72);
      revealed += 1;
    }
    return revealed;
  }

  private updateRuneSocketEffects(delta: number): void {
    for (const socket of this.runeSockets.values()) {
      const rune = this.runeStones.get(socket.id);
      const dx = socket.position.x - this.host.getPlayerPosition().x;
      const dz = socket.position.z - this.host.getPlayerPosition().z;
      const dy = socket.position.y - this.host.getPlayerFeetHeight();
      const lanternProximity = THREE.MathUtils.clamp(
        1 - Math.hypot(dx, dy, dz) / 5.4,
        0,
        1,
      );
      const lanternReveal =
        this.host.getLanternBlend() *
        THREE.MathUtils.smoothstep(lanternProximity, 0.04, 0.68);
      const spellReveal = this.host.getElapsed() < socket.revealUntil ? 1 : 0;
      const awakenedReveal = rune?.activated ? 0.18 : 0;
      const revealTarget = Math.max(
        lanternReveal,
        spellReveal,
        awakenedReveal,
      );
      const revealFollow = this.host.isReducedMotion()
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
      const growthFollow = this.host.isReducedMotion()
        ? 1
        : 1 - Math.exp(-delta * (growthTarget > socket.growth ? 4.6 : 7.2));
      socket.growth = THREE.MathUtils.lerp(
        socket.growth,
        growthTarget,
        growthFollow,
      );
      const rootsActive = socket.growth > 0.003;
      socket.roots.visible =
        rootsActive || this.socketRootWarmupFrames > 0;
      socket.roots.count = rootsActive
        ? socket.rootShards.length
        : 0;
      if (!rootsActive) continue;

      // Growth keeps approaching its target asymptotically, but every root
      // has already saturated before growth=1. Cache that effective state,
      // not raw growth, so settled sockets stop uploading identical matrices.
      // Shrink/reseat automatically changes this key; a new socket starts NaN.
      const matrixGrowth = Math.min(
        socket.growth,
        (1 + (socket.rootShards.length - 1) * 0.055) / 1.38,
      );
      if (socket.rootMatrixGrowth !== matrixGrowth) {
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
        socket.rootMatrixGrowth = matrixGrowth;
      }
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
    if (this.socketRootWarmupFrames > 0) {
      this.socketRootWarmupFrames -= 1;
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
      : carry.kickable === this.host.getHeldKickable()
        ? this.host.getTelekinesisPlacementSurface()
        : carry.kickable.platform;
    const insideSurface =
      surface !== null &&
      (carry.kickable.collisionHeight !== undefined
        ? surfaceOverlapsCircle(surface, carry.object.position.x, carry.object.position.z, carry.kickable.radius)
        : this.host.surfaceContainsPoint(surface, carry.object.position.x, carry.object.position.z)) &&
      carry.object.position.y >= surface.heightAt(carry.object.position.x, carry.object.position.z) - 0.025;
    const socketHeight = carry.socketedAt
      ? this.runeSockets.get(carry.socketedAt)?.position.y ?? 0
      : 0;
    // Socket/platform support is authoritative. Only unsupported crystals
    // need the fallback scan; no cached height can survive a move or reseat.
    const terrainHeight = carry.socketedAt || insideSurface
      ? 0
      : getFallsTerraceHeight(carry.object.position.x, carry.object.position.z);
    const groundHeight = terrainHeight <= carry.object.position.y + 0.28 ? terrainHeight : 0;
    const supportHeight = carry.socketedAt
      ? socketHeight + 0.17
      : insideSurface && surface
        ? surface.heightAt(carry.object.position.x, carry.object.position.z) +
          0.012
        : groundHeight + 0.17;
    const restingBase = carry.socketedAt
      ? socketHeight
      : insideSurface && surface
        ? surface.heightAt(carry.object.position.x, carry.object.position.z)
        : Math.max(groundHeight, carry.kickable.restingY);
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
    let nearestSocketHeight = 0;
    if (!carry.socketedAt) {
      for (const rune of this.runeStones.values()) {
        const occupant = this.getRitualSocketOccupant(rune.id);
        if (occupant && occupant !== carry) continue;
        if (!isAtFallsSocketHeight(carry.object.position.y, rune.socketPosition.y)) continue;
        const distance = Math.hypot(
          carry.object.position.x - rune.socketPosition.x,
          carry.object.position.z - rune.socketPosition.z,
        );
        const proximity = 1 - THREE.MathUtils.clamp(distance / 1.7, 0, 1);
        if (proximity > socketProximity) {
          socketProximity = proximity;
          nearestSocketHeight = rune.socketPosition.y;
        }
      }
    }
    if (socketProximity > 0.2 && !insideSurface) {
      const socketTop = THREE.MathUtils.lerp(
        supportHeight,
        nearestSocketHeight + 0.285,
        THREE.MathUtils.smoothstep(socketProximity, 0.2, 0.72),
      );
      carry.shadow.position.y = socketTop;
      carry.shadowRing.position.y = socketTop + 0.002;
    }

    const restorationScale = Math.min(1, carry.object.scale.x);
    const liftScale =
      (1 - Math.min(0.25, liftedHeight * 0.12)) * restorationScale;
    carry.shadow.scale.set(liftScale, liftScale, 1);
    carry.shadow.material.opacity =
      0.34 *
      restorationScale *
      (1 - Math.min(0.72, liftedHeight * 0.2));
    const ringPulse =
      socketProximity > 0 && !this.host.isReducedMotion()
        ? (Math.sin(this.host.getElapsed() * 7.5) + 1) * 0.04
        : 0;
    const ringScale = liftScale * (1 + socketProximity * 0.3 + ringPulse);
    carry.shadowRing.scale.set(ringScale, ringScale, 1);
    carry.shadowRing.material.opacity =
      restorationScale *
      (carry.socketedAt !== null
        ? 0.14
        : 0.2 + socketProximity * 0.52);
  }

  private updateRitualCrystalRestoration(
    carry: RitualCrystalCarry,
    delta: number,
  ): void {
    if (carry.restorationDuration <= 0) return;
    carry.restorationAge = Math.min(
      carry.restorationDuration,
      carry.restorationAge + delta,
    );
    const progress = carry.restorationAge / carry.restorationDuration;
    const growth = THREE.MathUtils.smoothstep(progress, 0, 1);
    const resonance = Math.sin(progress * Math.PI) * 0.08;
    carry.object.scale.setScalar(
      THREE.MathUtils.lerp(0.04, 1, growth) * (1 + resonance),
    );
    if (progress < 1) return;
    carry.object.scale.setScalar(1);
    carry.restorationAge = 0;
    carry.restorationDuration = 0;
  }

  private selectRitualLightTarget(
    slotIndex: number,
    ambientSlotCount: number,
  ): RitualCrystalCarry | null {
    const previousTarget = this.ritualLightSlots[slotIndex]?.target ?? null;
    const previousTargetIndex = previousTarget
      ? this.ritualCrystals.indexOf(previousTarget)
      : -1;
    if (
      previousTarget &&
      previousTargetIndex >= 0 &&
      previousTargetIndex % ambientSlotCount === slotIndex &&
      !this.isRitualCrystalBroken(previousTarget) &&
      previousTarget.object.visible
    ) {
      return previousTarget;
    }

    // Distribute the three named crystals across the available tier slots,
    // then pair decoys with them. A slot retains its intact target until that
    // crystal disappears or breaks; player movement and crystal crossings must
    // never reshuffle coloured lights between otherwise unchanged clusters.
    for (
      let crystalIndex = slotIndex;
      crystalIndex < this.ritualCrystals.length;
      crystalIndex += ambientSlotCount
    ) {
      const carry = this.ritualCrystals[crystalIndex];
      if (
        !carry ||
        this.isRitualCrystalBroken(carry) ||
        !carry.object.visible
      ) {
        continue;
      }
      return carry;
    }
    return null;
  }

  private updateRitualAmbientLight(
    slot: RitualLightSlot,
    target: RitualCrystalCarry | null,
    qualityScale: number,
    delta: number,
  ): void {
    const light = slot.light;
    slot.target = target;
    light.distance = 5.8;
    const intensityFollow = this.host.isReducedMotion()
      ? 1
      : 1 - Math.exp(-delta * 5.2);
    if (!target) {
      light.intensity = THREE.MathUtils.lerp(
        light.intensity,
        0,
        intensityFollow,
      );
      return;
    }

    const seated = target.socketedAt !== null;
    const targetIntensity =
      qualityScale *
      ((seated ? 2.15 : 1.8) +
        Math.sin(
          this.host.getElapsed() * 2.15 +
            target.origin.x * 0.37 +
            target.origin.z * 0.19,
        ) *
          (this.host.isReducedMotion()
            ? seated
              ? 0.06
              : 0.05
            : seated
              ? 0.24
              : 0.18));
    const targetY =
      target.object.position.y + 0.82 * Math.max(0.04, target.object.scale.y);
    const positionFollow =
      this.host.isReducedMotion() || light.intensity < 0.02
        ? 1
        : 1 - Math.exp(-delta * 8.5);
    light.position.x = THREE.MathUtils.lerp(
      light.position.x,
      target.object.position.x,
      positionFollow,
    );
    light.position.y = THREE.MathUtils.lerp(
      light.position.y,
      targetY,
      positionFollow,
    );
    light.position.z = THREE.MathUtils.lerp(
      light.position.z,
      target.object.position.z,
      positionFollow,
    );
    light.color.lerp(target.color, positionFollow);
    light.intensity = THREE.MathUtils.lerp(
      light.intensity,
      targetIntensity,
      intensityFollow,
    );
  }

  private updateRitualLights(delta: number): void {
    const quality = this.host.getQuality();
    const budget = getFallsPointLightBudget(quality);
    const tinkleLight = this.ritualLightSlots[0]?.light;
    const burst = this.chestBurst;
    const chestActive = burst !== null && burst.age < 2.2;
    if (tinkleLight && chestActive) {
      this.chestLightLeased = true;
      this.runeTinkleLightLeased = false;
      tinkleLight.position.copy(burst.lightPosition);
      tinkleLight.color.set(this.host.colors.amber);
      tinkleLight.distance = 8;
      const fade = Math.max(0, 1 - burst.age / 2.2);
      tinkleLight.intensity = fade * (7 + (this.host.isReducedMotion()
        ? 0 : Math.max(0, Math.sin(burst.age * 18)) * 6));
    } else if (this.chestLightLeased) {
      this.chestLightLeased = false;
      // Do not carry the reward's bright amber peak back onto a crystal.
      if (tinkleLight) tinkleLight.intensity = 0;
    }
    this.runeTinkleAge = Math.min(2, this.runeTinkleAge + delta);
    const tinkleProgress = Math.min(1, this.runeTinkleAge / 0.62);
    const tinkleActive =
      Boolean(tinkleLight) &&
      this.runeTinkleLightLeased &&
      !this.host.isReducedMotion() &&
      tinkleProgress < 1;

    if (tinkleLight) {
      if (tinkleActive) {
        const fade = 1 - tinkleProgress;
        tinkleLight.distance = 4.8;
        tinkleLight.intensity =
          this.runeTinkleBaseIntensity +
          this.runeTinklePeakIntensity * fade * fade;
      } else if (this.runeTinkleLightLeased) {
        // End the lease before returning this slot to ambient tracking so the
        // old tinkle peak does not bleed into its next crystal assignment.
        tinkleLight.distance = 5.8;
        tinkleLight.intensity = this.runeTinkleBaseIntensity;
        this.runeTinkleLightLeased = false;
      }
    }

    const qualityScale = quality === "medium" ? 0.72 : 1;
    for (
      let index = 0;
      index < budget.ritualAmbientSlots;
      index += 1
    ) {
      if (index === 0 && (tinkleActive || chestActive)) continue;
      const slot = this.ritualLightSlots[index];
      if (!slot) continue;
      this.updateRitualAmbientLight(
        slot,
        this.selectRitualLightTarget(
          index,
          budget.ritualAmbientSlots,
        ),
        qualityScale,
        delta,
      );
    }

    for (
      let index = budget.ritualAmbientSlots;
      index < this.ritualLightSlots.length;
      index += 1
    ) {
      if (index === 0 && (tinkleActive || chestActive)) continue;
      const slot = this.ritualLightSlots[index];
      if (!slot) continue;
      slot.target = null;
      slot.light.distance = 5.8;
      slot.light.intensity = 0;
    }
  }

  private updateRuneEffects(delta: number): void {
    this.updateRuneSocketEffects(delta);
    for (const carry of this.ritualCrystals) {
      this.updateRitualCrystalRestoration(carry, delta);
      this.updateRitualCrystalShadow(carry);
    }
    this.updateRitualLights(delta);
    const reducedMotion = this.host.isReducedMotion();
    const heldKickable = this.host.getHeldKickable();
    for (const rune of this.runeStones.values()) {
      const interactionTarget = this.getRitualCrystalTargetObject(
        rune.carry,
      );
      this.host.moveInteraction(
        `ritual-crystal-${rune.id}`,
        interactionTarget.position.x,
        interactionTarget.position.z,
      );
      const pulseWasActive = rune.pulseAge < 0.72;
      const breakAnimationWasActive =
        rune.broken && rune.breakAge < 1.35;
      rune.pulseAge = Math.min(2, rune.pulseAge + delta);
      if (!reducedMotion) rune.ambientRotation += delta;
      let shardMotionActive = false;
      if (rune.broken) {
        rune.breakAge = Math.min(2, rune.breakAge + delta);
        const spinScale = Math.max(0, 1 - rune.breakAge / 1.35);
        for (const shard of rune.shards) {
          if (
            !shard.proxy ||
            !shard.kickable?.enabled
          ) {
            continue;
          }
          shardMotionActive ||= (
            shard.kickable === heldKickable ||
            shard.kickable.velocity.lengthSq() > 0.0004 ||
            shard.proxy.position.distanceToSquared(
              shard.lastMatrixPosition,
            ) > 0.000001 ||
            Math.abs(
              shard.proxy.rotation.x -
                shard.lastMatrixRotation.x,
            ) > 0.0001 ||
            Math.abs(
              shard.proxy.rotation.y -
                shard.lastMatrixRotation.y,
            ) > 0.0001 ||
            Math.abs(
              shard.proxy.rotation.z -
                shard.lastMatrixRotation.z,
            ) > 0.0001
          );
          if (shard.kickable === heldKickable) continue;
          shard.proxy.rotation.x += shard.spin.x * delta * spinScale;
          shard.proxy.rotation.y += shard.spin.y * delta * spinScale;
          shard.proxy.rotation.z += shard.spin.z * delta * spinScale;
        }
      }
      if (
        !reducedMotion ||
        rune.matrixDirty ||
        pulseWasActive ||
        breakAnimationWasActive ||
        shardMotionActive
      ) {
        this.updateRuneCrystalMatrices(rune);
      }
    }

    for (const crystal of this.ritualDecoys.values()) {
      const interactionTarget = this.getRitualCrystalTargetObject(
        crystal.carry,
      );
      this.host.moveInteraction(
        `ritual-crystal-${crystal.id}`,
        interactionTarget.position.x,
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
            shard.kickable === this.host.getHeldKickable()
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
      crystal.groundGlow.material.opacity = 0.2 + pulse * 0.2;
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

    this.updateRuneDiagnosticTrace(delta);
  }

  private updateRuneDiagnosticTrace(delta: number): void {
    const trace = this.runeDiagnosticTrace;
    if (!trace?.active || trace.pointCount < 2) return;
    trace.age = Math.min(trace.duration, trace.age + delta);
    const travelDuration = trace.duration * 0.82;
    const progress = Math.min(1, trace.age / travelDuration);
    const visiblePoints = this.host.isReducedMotion()
      ? trace.pointCount
      : Math.max(1, Math.ceil(progress * trace.pointCount));
    trace.path.geometry.setDrawRange(0, visiblePoints);
    const fadeProgress = THREE.MathUtils.smoothstep(
      trace.age,
      trace.duration * 0.72,
      trace.duration,
    );
    trace.path.material.opacity = (1 - fadeProgress) * 0.92;

    if (!this.host.isReducedMotion()) {
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

    const targetCount = trace.targets.length;
    const restorationDuration = Math.max(
      this.host.isReducedMotion() ? 0.18 : 0.5,
      (travelDuration / targetCount) * 0.92,
    );
    while (
      trace.nextRestorationIndex < targetCount &&
      progress >= (trace.nextRestorationIndex + 1) / targetCount
    ) {
      const restorationIndex = trace.nextRestorationIndex;
      const carry = trace.targets[restorationIndex];
      if (!carry) break;
      if (this.isRitualCrystalBroken(carry)) {
        const rune = this.getRuneForCarry(carry);
        const decoy = this.getDecoyForCarry(carry);
        const color = rune?.color ?? decoy?.color;
        const restoration = this.restoreBrokenRitualCrystal(
          carry,
          restorationDuration,
        );
        trace.restorations[restorationIndex] = restoration;
        if (color && restoration.consumedShards > 0) {
          const magicTarget = carry.object.position.clone();
          magicTarget.y += 0.78;
          this.host.recallFlyingFishMagic(
            magicTarget,
            color,
            restoration.consumedShards,
            restorationDuration,
          );
        }
      }
      trace.nextRestorationIndex += 1;
    }

    while (
      trace.nextTargetIndex < targetCount &&
      progress >= (trace.nextTargetIndex + 1) / targetCount
    ) {
      const targetIndex = trace.nextTargetIndex;
      const carry = trace.targets[targetIndex];
      if (!carry) break;
      const restoration = trace.restorations[targetIndex] ?? {
        restored: false,
        consumedShards: 0,
      };
      this.triggerRitualCrystalTinkle(
        carry,
        restoration.restored ? 1.45 : 0.92,
      );
      if (restoration.restored) {
        trace.path.material.color.setHex(this.host.colors.coral);
        const descriptor =
          carry.affinity === null
            ? null
            : runeCrystalDescriptors[carry.affinity];
        this.host.onStatus(
          `${descriptor ? `The trace reaches ${descriptor.title}` : "The trace finds an unnamed cluster"}. Its scattered facets pull together behind the packet.${
            restoration.consumedShards > 0
              ? " Borrowed colour streams home from the flying shoal."
              : ""
          }`,
        );
      }
      trace.nextTargetIndex += 1;
    }

    if (trace.age >= trace.duration) {
      trace.active = false;
      trace.targets = [];
      trace.restorations = [];
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
    this.host.onStatus(observations[id]);
  }

  private activateFantasyRune(id: RuneId): void {
    const rune = this.runeStones.get(id);
    if (!rune) return;
    if (this.fantasyPuzzleSolved) {
      this.triggerRuneTinkle(rune, 0.72);
      this.host.onStatus("The rune holds its note. The waterfall cave is open.");
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
        this.host.onStatus(
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
      this.host.onStatus(
        `The ${rune.id} crystal gives a dry click. No rooted light answers from: ${missingSymbols}.${fractureWarning}`,
      );
      return;
    }

    const sequence = ["moon", "tide", "ember"];
    const expected = sequence[this.runeProgress];
    if (id !== expected) {
      for (const candidate of this.runeStones.values()) {
        candidate.activated = false;
        candidate.matrixDirty = true;
      }
      this.runeProgress = id === "moon" ? 1 : 0;
      if (id === "moon") {
        rune.activated = true;
        rune.matrixDirty = true;
      }
      this.syncRuneCrystalLocks();
      this.updateRuneInteractionLabels();
      this.host.onStatus(
        `${
          id === "moon"
            ? "Moon rune awake. Its note curls low, like water under stone."
            : "The runes dim together. A pale crescent is the last mark to disappear."
        }${fractureWarning}`,
      );
      return;
    }

    rune.activated = true;
    rune.matrixDirty = true;
    this.runeProgress += 1;
    this.syncRuneCrystalLocks();
    this.updateRuneInteractionLabels();
    if (this.runeProgress < sequence.length) {
      const hints = {
        moon: "Moon rune awake. Its note curls low, like water under stone.",
        tide: "Tide rune awake. Amber reflections tremble across the final crystal.",
      } as const;
      this.host.onStatus(
        `${hints[id as keyof typeof hints] ?? "A rune answers."}${fractureWarning}`,
      );
      return;
    }

    this.fantasyPuzzleSolved = true;
    this.syncRuneCrystalLocks();
    if (this.releaseCaveSealCollision) {
      this.releaseCaveSealCollision();
      this.releaseCaveSealCollision = null;
      this.host.refreshCollisionDebug();
    }
    if (this.caveSeal) this.caveSeal.visible = false;
    this.host.updateInteractionLabel("waterfall-chest", "Open chest");
    this.updateRuneInteractionLabels();
    this.host.onStatus(
      "Moon, tide, ember. The center waterfall parts. Warm light moves behind the water.",
      { kind: "achievement", title: "OPEN SESAME" },
    );
  }
}
