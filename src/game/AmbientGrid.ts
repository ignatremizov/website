import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources";
import type { QualityTier, ZoneId } from "../world/WorldContracts";

const selectionLayer = 2;
const hiddenY = -500;
const fastDragTearSpeed = 7.1;
const fastPointerSweepSpeed = 1.05;
const lampSnagTearSpeed = 3;
const worldUp = new THREE.Vector3(0, 1, 0);
const fabricCollapsePhase = {
  instabilityStart: 0.168,
  instabilityEnd: 0.386,
  pullStart: 0.304,
  pullEnd: 0.98,
  orbitStart: 0.175,
  orbitEnd: 0.982,
  shrinkStart: 0.593,
  shrinkEnd: 0.984,
} as const;

interface GridPiece {
  outputLength: number;
  outputOffset: number;
  authoredPositions: Float32Array;
  repairPositions: Float32Array;
  authoredOffset: THREE.Vector3;
  restPositions: Float32Array;
  positions: Float32Array;
  previousPositions: Float32Array;
  lineNodes: Uint16Array;
  constraintLengths: Float32Array;
  constraintActive: Uint8Array;
  proxy: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  surface: AmbientGridLandingSurfaceState;
}

interface BodyPiece {
  piece: GridPiece;
  offset: THREE.Vector3;
}

interface TearSection {
  pieces: BodyPiece[];
  shift: THREE.Vector3;
  proxy: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  surface: AmbientGridLandingSurfaceState;
  next: TearPlan | null;
}

interface TearPlan {
  main: TearSection;
  loose: TearSection;
}

interface FragmentBody {
  familyId: number;
  pieces: BodyPiece[];
  selectionProxy: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  landingSurface: AmbientGridLandingSurfaceState;
  tearPlan: TearPlan | null;
  position: THREE.Vector3;
  anchor: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  baseRotation: THREE.Euler;
  angularVelocity: THREE.Vector3;
  phase: number;
  driftSpeed: number;
  radius: number;
  detail: number;
  active: boolean;
  visible: boolean;
  landedZone: ZoneId | null;
  contactLocal: THREE.Vector3;
  contactStrength: number;
  impact: number;
  stress: number;
  grabLocal: THREE.Vector3;
  dragStretchLocal: THREE.Vector3;
  stretchStrength: number;
  collisionNormalLocal: THREE.Vector3;
  snagStrength: number;
  clothSettling: boolean;
  entangled: boolean;
  unfurling: boolean;
  unfurlDelay: number;
  unfurlBoost: number;
  assembling: boolean;
  repairProgress: number;
  pendingTear: boolean;
}

interface CollapseFragmentState {
  startPosition: THREE.Vector3;
  startRotation: THREE.Euler;
  startRadius: number;
  startAngle: number;
  turns: number;
  phase: number;
  scale: number;
}

interface AmbientGridCollapseState {
  origin: THREE.Vector3;
  progress: number;
  reducedMotion: boolean;
  bodies: Map<FragmentBody, CollapseFragmentState>;
}

interface FragmentDrag {
  body: FragmentBody;
  pointerId: number;
  plane: THREE.Plane;
  point: THREE.Vector3;
  grabOffset: THREE.Vector3;
  previousPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  constrainedPosition: THREE.Vector3;
  hoverY: number;
  previousTime: number;
  snagPoints: readonly SnagPoint[] | null;
  colliders: readonly AmbientGridDragCollider[] | null;
  surfaces: readonly AmbientGridDragSurface[] | null;
  playerPosition: THREE.Vector3;
  solverPosition: THREE.Vector3;
  solverRotation: THREE.Quaternion;
  releaseVelocity: THREE.Vector3;
}

interface FragmentFamily {
  id: number;
  pieces: readonly GridPiece[];
  selectionProxy: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  landingSurface: AmbientGridLandingSurfaceState;
  tearPlan: TearPlan;
  width: number;
  height: number;
  repairEnergy: number;
}

interface SnagPoint {
  position: THREE.Vector3;
}

export interface AmbientGridDragCollider {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
}

export interface AmbientGridDragSurface {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  heightAt: (x: number, z: number) => number;
}

interface FragmentConfig {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  phase: number;
  detail: number;
}

export interface AmbientGridLandingSurface {
  id: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  requiresJump: boolean;
  supportMargin: number;
  edgeGrace: number;
  landingMessage?: string;
  heightAt: (x: number, z: number) => number;
}

interface AmbientGridLandingSurfaceState extends AmbientGridLandingSurface {
  height: number;
}

export type AmbientGridLandingRegion =
  | {
      zone: ZoneId;
      kind: "circle";
      radius: number;
      surfaceY: number;
    }
  | {
      zone: ZoneId;
      kind: "square";
      halfWidth: number;
      halfDepth: number;
      surfaceY: number;
    };

export type AmbientGridPencilResult =
  | "none"
  | "traced"
  | "assembly-started";

const zoneGridColors: Readonly<
  Record<ZoneId, { substrate: number; fragments: number }>
> = {
  field: { substrate: 0x69b9b1, fragments: 0x8ad8ca },
  falls: { substrate: 0x62a48d, fragments: 0x8bcca1 },
  grid: { substrate: 0x4ba7b6, fragments: 0x6cebf3 },
  archive: { substrate: 0x777fca, fragments: 0xa2a9f3 },
  math: { substrate: 0x8b70bd, fragments: 0xb9a1ff },
};

const fragmentConfigs: readonly FragmentConfig[] = [
  {
    x: -20.8,
    y: -2.05,
    z: 1.5,
    width: 7.6,
    height: 5.4,
    rotationX: -1.3,
    rotationY: 0.16,
    rotationZ: -0.2,
    phase: 0.4,
    detail: 0,
  },
  {
    x: 1.4,
    y: -1.95,
    z: -20.7,
    width: 6.8,
    height: 4.8,
    rotationX: -1.18,
    rotationY: -0.22,
    rotationZ: 0.16,
    phase: 2.1,
    detail: 1,
  },
  {
    x: -16.4,
    y: -1.75,
    z: 14.8,
    width: 6.2,
    height: 7.1,
    rotationX: -1.22,
    rotationY: 0.28,
    rotationZ: 0.34,
    phase: 4.3,
    detail: 2,
  },
  {
    x: 18.8,
    y: -2.2,
    z: 13.2,
    width: 8.1,
    height: 4.4,
    rotationX: -1.36,
    rotationY: -0.14,
    rotationZ: -0.28,
    phase: 6.5,
    detail: 3,
  },
  {
    x: 1.8,
    y: -2.35,
    z: 21.2,
    width: 7.2,
    height: 5.2,
    rotationX: -1.14,
    rotationY: 0.34,
    rotationZ: 0.08,
    phase: 8.2,
    detail: 4,
  },
] as const;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createWarpedBackdropGeometry(): THREE.BufferGeometry {
  const size = 76;
  const divisions = 20;
  const step = size / divisions;
  const points = new Float32Array((divisions + 1) * (divisions + 1) * 3);
  const random = createRandom(0x7a11f10a);

  for (let row = 0; row <= divisions; row += 1) {
    for (let column = 0; column <= divisions; column += 1) {
      const x = -size / 2 + column * step;
      const z = -size / 2 + row * step;
      const index = (row * (divisions + 1) + column) * 3;
      points[index] =
        x +
        Math.sin(z * 0.17 + row * 0.21) * 0.46 +
        (random() - 0.5) * 0.16;
      points[index + 1] = 0;
      points[index + 2] =
        z +
        Math.sin(x * 0.13 - column * 0.17) * 0.52 +
        (random() - 0.5) * 0.16;
    }
  }

  const linePositions: number[] = [];
  const addPoint = (row: number, column: number): void => {
    const index = (row * (divisions + 1) + column) * 3;
    linePositions.push(
      points[index] ?? 0,
      points[index + 1] ?? 0,
      points[index + 2] ?? 0,
    );
  };
  for (let row = 0; row <= divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      if (random() < 0.09) continue;
      addPoint(row, column);
      addPoint(row, column + 1);
    }
  }
  for (let column = 0; column <= divisions; column += 1) {
    for (let row = 0; row < divisions; row += 1) {
      if (random() < 0.09) continue;
      addPoint(row, column);
      addPoint(row + 1, column);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

interface TornGridLayout {
  linePositions: Float32Array;
  constraintActive: Uint8Array;
}

function createTornGridPositions(
  width: number,
  height: number,
  seed: number,
): TornGridLayout {
  const columns = Math.max(5, Math.round(width * 1.35));
  const rows = Math.max(4, Math.round(height * 1.25));
  const pointColumns = columns + 1;
  const points = new Float32Array((rows + 1) * pointColumns * 3);
  const leftInsets = new Uint8Array(rows + 1);
  const rightInsets = new Uint8Array(rows + 1);
  const random = createRandom(seed);
  const columnStep = width / columns;
  const rowStep = height / rows;

  for (let row = 0; row <= rows; row += 1) {
    leftInsets[row] =
      row === 0 || row === rows
        ? 1
        : random() > 0.72
          ? 1
          : 0;
    rightInsets[row] =
      row === 0 || row === rows
        ? random() > 0.4
          ? 1
          : 0
        : random() > 0.76
          ? 1
          : 0;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const v = row / rows;
      const index = (row * pointColumns + column) * 3;
      points[index] =
        (u - 0.5) * width +
        Math.sin(v * Math.PI * 2.7 + seed * 0.013) * columnStep * 0.14 +
        (random() - 0.5) * columnStep * 0.14;
      points[index + 1] =
        (v - 0.5) * height +
        Math.sin(u * Math.PI * 2.2 - seed * 0.017) * rowStep * 0.13 +
        (random() - 0.5) * rowStep * 0.14;
      points[index + 2] =
        Math.sin(u * Math.PI * 2.4 + v * Math.PI * 1.7 + seed) * 0.075;
    }
  }

  const holeX = 0.32 + random() * 0.36;
  const holeY = 0.3 + random() * 0.4;
  const holeRadius = 0.075 + random() * 0.06;
  const linePositions: number[] = [];
  const constraintActive: number[] = [];
  const crossesHole = (
    firstColumn: number,
    firstRow: number,
    secondColumn: number,
    secondRow: number,
  ): boolean => {
    const midpointX =
      (firstColumn + secondColumn) / (2 * Math.max(1, columns));
    const midpointY =
      (firstRow + secondRow) / (2 * Math.max(1, rows));
    return (
      (midpointX - holeX) ** 2 + (midpointY - holeY) ** 2 <
      holeRadius ** 2
    );
  };
  const addPoint = (row: number, column: number): void => {
    const index = (row * pointColumns + column) * 3;
    linePositions.push(
      points[index] ?? 0,
      points[index + 1] ?? 0,
      points[index + 2] ?? 0,
    );
  };

  for (let row = 0; row <= rows; row += 1) {
    const left = leftInsets[row] ?? 0;
    const right = rightInsets[row] ?? 0;
    for (let column = 0; column < columns; column += 1) {
      const visible =
        column >= left &&
        column < columns - right &&
        random() >= 0.045 &&
        !crossesHole(column, row, column + 1, row);
      addPoint(row, column);
      addPoint(row, column + 1);
      constraintActive.push(visible ? 1 : 0);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    const left = Math.max(leftInsets[row] ?? 0, leftInsets[row + 1] ?? 0);
    const right = Math.max(
      rightInsets[row] ?? 0,
      rightInsets[row + 1] ?? 0,
    );
    for (let column = 0; column <= columns; column += 1) {
      const visible =
        column >= left &&
        column <= columns - right &&
        random() >= 0.045 &&
        !crossesHole(column, row, column, row + 1);
      addPoint(row, column);
      addPoint(row + 1, column);
      constraintActive.push(visible ? 1 : 0);
    }
  }

  return {
    linePositions: new Float32Array(linePositions),
    constraintActive: new Uint8Array(constraintActive),
  };
}

function createClothTopology(linePositions: Float32Array): {
  restPositions: Float32Array;
  lineNodes: Uint16Array;
  constraintLengths: Float32Array;
} {
  const nodeByPosition = new Map<string, number>();
  const nodeValues: number[] = [];
  const endpointCount = linePositions.length / 3;
  const lineNodes = new Uint16Array(endpointCount);
  for (let endpoint = 0; endpoint < endpointCount; endpoint += 1) {
    const offset = endpoint * 3;
    const x = linePositions[offset] ?? 0;
    const y = linePositions[offset + 1] ?? 0;
    const z = linePositions[offset + 2] ?? 0;
    const key = `${x}|${y}|${z}`;
    let node = nodeByPosition.get(key);
    if (node === undefined) {
      node = nodeValues.length / 3;
      nodeByPosition.set(key, node);
      nodeValues.push(x, y, z);
    }
    lineNodes[endpoint] = node;
  }

  const restPositions = new Float32Array(nodeValues);
  const constraintLengths = new Float32Array(endpointCount / 2);
  for (let constraint = 0; constraint < constraintLengths.length; constraint += 1) {
    const first = (lineNodes[constraint * 2] ?? 0) * 3;
    const second = (lineNodes[constraint * 2 + 1] ?? 0) * 3;
    constraintLengths[constraint] = Math.max(
      0.001,
      Math.hypot(
        (restPositions[second] ?? 0) - (restPositions[first] ?? 0),
        (restPositions[second + 1] ?? 0) -
          (restPositions[first + 1] ?? 0),
        (restPositions[second + 2] ?? 0) -
          (restPositions[first + 2] ?? 0),
      ),
    );
  }
  return { restPositions, lineNodes, constraintLengths };
}

/**
 * A rendered strand must belong to the cloth graph that owns its drag handle.
 * Random edge omissions can otherwise leave one-line islands inside a large
 * rectangular proxy, making an unattached strand move with a distant sheet.
 */
function retainLargestConnectedLineComponent(
  layout: TornGridLayout,
): TornGridLayout {
  const { linePositions } = layout;
  const segmentCount = Math.floor(linePositions.length / 6);
  if (segmentCount <= 1) return layout;

  const nodeByPosition = new Map<string, number>();
  const parents: number[] = [];
  const ranks: number[] = [];
  const segmentNodes = new Uint32Array(segmentCount * 2);
  const getNode = (x: number, y: number, z: number): number => {
    const key = `${x}|${y}|${z}`;
    const existing = nodeByPosition.get(key);
    if (existing !== undefined) return existing;
    const node = parents.length;
    nodeByPosition.set(key, node);
    parents.push(node);
    ranks.push(0);
    return node;
  };
  const find = (node: number): number => {
    let root = node;
    while ((parents[root] ?? root) !== root) {
      root = parents[root] ?? root;
    }
    let current = node;
    while ((parents[current] ?? current) !== root) {
      const next = parents[current] ?? root;
      parents[current] = root;
      current = next;
    }
    return root;
  };
  const union = (first: number, second: number): void => {
    let firstRoot = find(first);
    let secondRoot = find(second);
    if (firstRoot === secondRoot) return;
    const firstRank = ranks[firstRoot] ?? 0;
    const secondRank = ranks[secondRoot] ?? 0;
    if (firstRank < secondRank) {
      [firstRoot, secondRoot] = [secondRoot, firstRoot];
    }
    parents[secondRoot] = firstRoot;
    if (firstRank === secondRank) ranks[firstRoot] = firstRank + 1;
  };

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const offset = segment * 6;
    const first = getNode(
      linePositions[offset] ?? 0,
      linePositions[offset + 1] ?? 0,
      linePositions[offset + 2] ?? 0,
    );
    const second = getNode(
      linePositions[offset + 3] ?? 0,
      linePositions[offset + 4] ?? 0,
      linePositions[offset + 5] ?? 0,
    );
    segmentNodes[segment * 2] = first;
    segmentNodes[segment * 2 + 1] = second;
    if (layout.constraintActive[segment] !== 0) {
      union(first, second);
    }
  }

  const componentSizes = new Map<number, number>();
  let largestRoot = -1;
  let largestSize = 0;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if (layout.constraintActive[segment] === 0) continue;
    const root = find(segmentNodes[segment * 2] ?? 0);
    const size = (componentSizes.get(root) ?? 0) + 1;
    componentSizes.set(root, size);
    if (size > largestSize) {
      largestRoot = root;
      largestSize = size;
    }
  }
  if (largestRoot < 0) return layout;

  const constraintActive = layout.constraintActive.slice();
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if (
      constraintActive[segment] !== 0 &&
      find(segmentNodes[segment * 2] ?? 0) !== largestRoot
    ) {
      constraintActive[segment] = 0;
    }
  }
  return { linePositions, constraintActive };
}

/**
 * Sparse world-space atmosphere behind the playable platforms.
 *
 * Every visible fragment is transformed into one dynamic line buffer. A small
 * Verlet constraint mesh gives each scrap local cloth motion; severed constraints
 * disappear from that same buffer, while a bounded prebuilt tear tree lets large
 * sections become independently draggable without allocating geometry per frame.
 */
export class AmbientGrid {
  private readonly root = new THREE.Group();
  private readonly substrateMaterial = new THREE.LineBasicMaterial({
    color: zoneGridColors.field.substrate,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  private readonly fragmentMaterial = new THREE.LineBasicMaterial({
    color: zoneGridColors.field.fragments,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  private readonly selectionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly selectionGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly substrate: THREE.LineSegments;
  private readonly fragments: FragmentBody[] = [];
  private readonly families: FragmentFamily[] = [];
  private readonly allPieces: GridPiece[] = [];
  private readonly landingSurfaces: AmbientGridLandingSurfaceState[] = [];
  private readonly fragmentPositions: Float32Array;
  private readonly fragmentPositionAttribute: THREE.BufferAttribute;
  private readonly fragmentLines: THREE.LineSegments;
  private readonly selectionRaycaster = new THREE.Raycaster();
  private readonly selectionHits: THREE.Intersection[] = [];
  private readonly temporaryPoint = new THREE.Vector3();
  private readonly temporaryPointB = new THREE.Vector3();
  private readonly temporaryOffset = new THREE.Vector3();
  private readonly temporaryTarget = new THREE.Vector3();
  private readonly temporaryConstrainedTarget = new THREE.Vector3();
  private readonly temporaryDragDesired = new THREE.Vector3();
  private readonly temporaryDragPosition = new THREE.Vector3();
  private readonly temporaryDragRemaining = new THREE.Vector3();
  private readonly temporaryCollisionNormal = new THREE.Vector3();
  private readonly temporaryCollisionNormalLocal = new THREE.Vector3();
  private readonly temporarySweepNormal = new THREE.Vector3();
  private readonly temporaryVelocity = new THREE.Vector3();
  private readonly temporaryQuaternion = new THREE.Quaternion();
  private readonly temporaryQuaternionB = new THREE.Quaternion();
  private readonly temporaryCameraRight = new THREE.Vector3();
  private readonly temporaryCameraUp = new THREE.Vector3();
  private drag: FragmentDrag | null = null;
  private quality: QualityTier = "medium";
  private currentZone: ZoneId = "field";
  private previousSweepX = 0;
  private previousSweepY = 0;
  private previousSweepTime = 0;
  private lastSweepTearTime = -1000;
  private dragSweepHitTime = Number.POSITIVE_INFINITY;
  private collapse: AmbientGridCollapseState | null = null;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.root.name = "ambient-parallax-grid";
    this.substrate = new THREE.LineSegments(
      createWarpedBackdropGeometry(),
      this.substrateMaterial,
    );
    this.substrate.name = "ambient-warped-grid-substrate";
    this.substrate.position.y = -2.8;
    this.substrate.frustumCulled = false;
    this.root.add(this.substrate);

    let outputOffset = 0;
    for (const [index, config] of fragmentConfigs.entries()) {
      const coreWidth = config.width * 0.52;
      const middleWidth = config.width * 0.27;
      const looseWidth = config.width * 0.24;
      const core = this.createPiece(
        coreWidth,
        config.height,
        0x12af30 + index * 97,
        outputOffset,
        `ambient-grid-${index}-core`,
      );
      outputOffset += core.outputLength;
      const middle = this.createPiece(
        middleWidth,
        config.height * 0.9,
        0x31c94a + index * 113,
        outputOffset,
        `ambient-grid-${index}-middle`,
      );
      outputOffset += middle.outputLength;
      const loose = this.createPiece(
        looseWidth,
        config.height * 0.78,
        0x4bd713 + index * 131,
        outputOffset,
        `ambient-grid-${index}-loose`,
      );
      outputOffset += loose.outputLength;
      const coreOffset = new THREE.Vector3(-config.width * 0.24, 0, 0);
      const middleOffset = new THREE.Vector3(
        config.width * 0.15,
        config.height * 0.025,
        0.01,
      );
      const looseOffset = new THREE.Vector3(
        config.width * 0.405,
        config.height * 0.055,
        0.018,
      );
      core.authoredOffset.copy(coreOffset);
      middle.authoredOffset.copy(middleOffset);
      loose.authoredOffset.copy(looseOffset);
      this.configurePieceRepairTarget(
        core,
        config.height,
        config.height,
      );
      this.configurePieceRepairTarget(
        middle,
        config.height * 0.9,
        config.height,
      );
      this.configurePieceRepairTarget(
        loose,
        config.height * 0.78,
        config.height,
      );
      const repairStitch = this.createRepairStitchPiece(
        config.width,
        config.height,
        [
          (coreOffset.x + coreWidth * 0.5 +
            middleOffset.x -
            middleWidth * 0.5) *
            0.5,
          (middleOffset.x + middleWidth * 0.5 +
            looseOffset.x -
            looseWidth * 0.5) *
            0.5,
        ],
        outputOffset,
        core.proxy,
        core.surface,
      );
      outputOffset += repairStitch.outputLength;
      const mainWidth = config.width * 0.785;
      const mainShift = new THREE.Vector3(
        -config.width * 0.1075,
        config.height * 0.0125,
        0.005,
      );
      const coreRelative = coreOffset.clone().sub(mainShift);
      const middleRelative = middleOffset.clone().sub(mainShift);
      const mainProxy = this.createSelectionProxy(mainWidth, config.height);
      mainProxy.visible = false;
      const mainSurface = this.createLandingSurface(
        mainWidth,
        config.height,
        `ambient-grid-${index}-main`,
      );
      const selectionProxy = this.createSelectionProxy(
        config.width,
        config.height,
      );
      const landingSurface = this.createLandingSurface(
        config.width,
        config.height,
        `ambient-grid-${index}-whole`,
      );
      selectionProxy.visible = true;
      const secondTear: TearPlan = {
        main: {
          pieces: [{ piece: core, offset: new THREE.Vector3() }],
          shift: coreRelative,
          proxy: core.proxy,
          surface: core.surface,
          next: null,
        },
        loose: {
          pieces: [{ piece: middle, offset: new THREE.Vector3() }],
          shift: middleRelative,
          proxy: middle.proxy,
          surface: middle.surface,
          next: null,
        },
      };
      const tearPlan: TearPlan = {
        main: {
          pieces: [
            { piece: core, offset: coreRelative.clone() },
            { piece: middle, offset: middleRelative.clone() },
          ],
          shift: mainShift,
          proxy: mainProxy,
          surface: mainSurface,
          next: secondTear,
        },
        loose: {
          pieces: [{ piece: loose, offset: new THREE.Vector3() }],
          shift: looseOffset,
          proxy: loose.proxy,
          surface: loose.surface,
          next: null,
        },
      };
      const position = new THREE.Vector3(config.x, config.y, config.z);
      const rotation = new THREE.Euler(
        config.rotationX,
        config.rotationY,
        config.rotationZ,
      );
      const body: FragmentBody = {
        familyId: index,
        pieces: [
          { piece: core, offset: coreOffset },
          { piece: middle, offset: middleOffset },
          { piece: loose, offset: looseOffset },
        ],
        selectionProxy,
        landingSurface,
        tearPlan,
        position,
        anchor: position.clone(),
        velocity: new THREE.Vector3(),
        rotation,
        baseRotation: rotation.clone(),
        angularVelocity: new THREE.Vector3(),
        phase: config.phase,
        driftSpeed: 0.16 + index * 0.018,
        radius: Math.hypot(config.width, config.height) * 0.36,
        detail: config.detail,
        active: true,
        visible: true,
        landedZone: null,
        contactLocal: new THREE.Vector3(),
        contactStrength: 0,
        impact: 0,
        stress: 0,
        grabLocal: new THREE.Vector3(),
        dragStretchLocal: new THREE.Vector3(),
        stretchStrength: 0,
        collisionNormalLocal: new THREE.Vector3(),
        snagStrength: 0,
        clothSettling: false,
        entangled: false,
        unfurling: false,
        unfurlDelay: 0,
        unfurlBoost: 0,
        assembling: false,
        repairProgress: 0,
        pendingTear: false,
      };
      this.fragments.push(body);
      this.families.push({
        id: index,
        pieces: [core, middle, loose, repairStitch],
        selectionProxy,
        landingSurface,
        tearPlan,
        width: config.width,
        height: config.height,
        repairEnergy: 0,
      });
    }

    this.fragmentPositions = new Float32Array(outputOffset);
    const fragmentGeometry = new THREE.BufferGeometry();
    this.fragmentPositionAttribute = new THREE.BufferAttribute(
      this.fragmentPositions,
      3,
    );
    this.fragmentPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    fragmentGeometry.setAttribute("position", this.fragmentPositionAttribute);
    fragmentGeometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      90,
    );
    this.fragmentLines = new THREE.LineSegments(
      fragmentGeometry,
      this.fragmentMaterial,
    );
    this.fragmentLines.name = "ambient-torn-grid-fragment-batch";
    this.fragmentLines.frustumCulled = false;
    this.root.add(this.fragmentLines);
    // Pick the rendered line batch itself. The invisible rectangular proxies
    // remain useful for bounds and landing support, but are too broad to be an
    // honest mouse/touch handle around holes and torn edges.
    this.selectionRaycaster.layers.set(0);
    this.selectionRaycaster.params.Line.threshold = 0.2;
    this.scene.add(this.root);
    this.setQuality(this.quality);
    this.update(0.016, 0, new THREE.Vector3(), true);
  }

  private createPiece(
    width: number,
    height: number,
    seed: number,
    outputOffset: number,
    id: string,
  ): GridPiece {
    const proxy = this.createSelectionProxy(width, height);
    proxy.visible = false;
    const layout = retainLargestConnectedLineComponent(
      createTornGridPositions(width, height, seed),
    );
    const { linePositions } = layout;
    const topology = createClothTopology(linePositions);
    const piece: GridPiece = {
      outputLength: linePositions.length,
      outputOffset,
      authoredPositions: topology.restPositions.slice(),
      repairPositions: topology.restPositions.slice(),
      authoredOffset: new THREE.Vector3(),
      restPositions: topology.restPositions,
      positions: topology.restPositions.slice(),
      previousPositions: topology.restPositions.slice(),
      lineNodes: topology.lineNodes,
      constraintLengths: topology.constraintLengths,
      constraintActive: layout.constraintActive,
      proxy,
      surface: this.createLandingSurface(width, height, id),
    };
    this.allPieces.push(piece);
    return piece;
  }

  private createRepairStitchPiece(
    width: number,
    height: number,
    seamXs: readonly number[],
    outputOffset: number,
    proxy: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    surface: AmbientGridLandingSurfaceState,
  ): GridPiece {
    const positions: number[] = [];
    const rows = Math.max(7, Math.round(height * 1.35));
    const stitchHalfLength = Math.max(0.055, width * 0.012);
    for (const seamX of seamXs) {
      for (let row = 0; row <= rows; row += 1) {
        const y = (row / rows - 0.5) * height;
        positions.push(
          seamX - stitchHalfLength,
          y,
          0,
          seamX + stitchHalfLength,
          y,
          0,
        );
      }
    }
    const linePositions = new Float32Array(positions);
    const topology = createClothTopology(linePositions);
    const piece: GridPiece = {
      outputLength: linePositions.length,
      outputOffset,
      authoredPositions: topology.restPositions.slice(),
      repairPositions: topology.restPositions.slice(),
      authoredOffset: new THREE.Vector3(),
      restPositions: topology.restPositions,
      positions: topology.restPositions.slice(),
      previousPositions: topology.restPositions.slice(),
      lineNodes: topology.lineNodes,
      constraintLengths: topology.constraintLengths,
      constraintActive: new Uint8Array(
        topology.constraintLengths.length,
      ),
      proxy,
      surface,
    };
    this.allPieces.push(piece);
    return piece;
  }

  private configurePieceRepairTarget(
    piece: GridPiece,
    sourceHeight: number,
    familyHeight: number,
  ): void {
    const verticalScale = familyHeight / Math.max(0.001, sourceHeight);
    for (
      let index = 0;
      index < piece.authoredPositions.length;
      index += 3
    ) {
      piece.repairPositions[index] =
        piece.authoredPositions[index] ?? 0;
      piece.repairPositions[index + 1] =
        (piece.authoredPositions[index + 1] ?? 0) * verticalScale -
        piece.authoredOffset.y;
      piece.repairPositions[index + 2] =
        piece.authoredPositions[index + 2] ?? 0;
    }
  }

  private updatePieceConstraintLengths(
    piece: GridPiece,
    positions: Float32Array,
  ): void {
    for (
      let constraint = 0;
      constraint < piece.constraintLengths.length;
      constraint += 1
    ) {
      const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
      const second =
        (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
      piece.constraintLengths[constraint] = Math.max(
        0.001,
        Math.hypot(
          (positions[second] ?? 0) - (positions[first] ?? 0),
          (positions[second + 1] ?? 0) -
            (positions[first + 1] ?? 0),
          (positions[second + 2] ?? 0) -
            (positions[first + 2] ?? 0),
        ),
      );
    }
  }

  private createSelectionProxy(
    width: number,
    height: number,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const proxy = new THREE.Mesh(
      this.selectionGeometry,
      this.selectionMaterial,
    );
    proxy.name = "ambient-grid-selection-proxy";
    proxy.scale.set(width * 0.94, height * 0.88, 1);
    proxy.layers.set(selectionLayer);
    this.root.add(proxy);
    return proxy;
  }

  private createLandingSurface(
    width: number,
    height: number,
    id: string,
  ): AmbientGridLandingSurfaceState {
    const surface: AmbientGridLandingSurfaceState = {
      id,
      x: 1000,
      z: 1000,
      halfWidth: width * 0.43,
      halfDepth: height * 0.41,
      requiresJump: true,
      supportMargin: 0.08,
      edgeGrace: 0.16,
      height: 0,
      heightAt: () => surface.height,
    };
    this.landingSurfaces.push(surface);
    return surface;
  }

  setZone(zone: ZoneId): void {
    this.currentZone = zone;
    const colors = zoneGridColors[zone];
    this.substrateMaterial.color.setHex(colors.substrate);
    this.fragmentMaterial.color.setHex(colors.fragments);
    this.setQuality(this.quality);
  }

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    const visibleDetail =
      quality === "low" ? 2 : quality === "medium" ? 4 : 5;
    this.substrateMaterial.opacity =
      quality === "low" ? 0.1 : quality === "medium" ? 0.145 : 0.18;
    this.fragmentMaterial.opacity =
      quality === "low" ? 0.3 : quality === "medium" ? 0.38 : 0.44;
    for (const body of this.fragments) {
      body.visible =
        body.active &&
        (body === this.drag?.body || body.detail < visibleDetail) &&
        (body.landedZone === null || body.landedZone === this.currentZone);
      body.selectionProxy.visible = body.visible;
      this.syncLandingSurface(body);
    }
  }

  /**
   * Enlist the independently rendered cloth scraps in the finale. Their node
   * positions and severed constraints remain untouched; only each scrap's
   * world transform is animated so torn, stretched, and repaired silhouettes
   * survive all the way into the event horizon.
   */
  beginWorldCollapse(
    origin: THREE.Vector3,
    reducedMotion: boolean,
  ): void {
    if (this.disposed || this.collapse) return;
    this.cancelDrag();
    this.collapse = {
      origin: origin.clone(),
      progress: 0,
      reducedMotion,
      bodies: new Map(),
    };
    for (const body of this.fragments) {
      if (!body.active || !body.visible) continue;
      this.captureCollapseBody(body);
    }
  }

  setWorldCollapseProgress(progress: number): void {
    if (!this.collapse) return;
    this.collapse.progress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  update(
    delta: number,
    elapsed: number,
    cameraFocus: THREE.Vector3,
    reduceMotion: boolean,
    playerPosition: THREE.Vector3 | null = null,
    playerFeetY = 0,
  ): void {
    if (this.disposed) return;
    const motionScale = reduceMotion ? 0 : 1;
    this.substrate.position.set(
      cameraFocus.x * 0.76 + Math.sin(elapsed * 0.16) * 1.08 * motionScale,
      -2.8,
      cameraFocus.z * 0.76 + Math.cos(elapsed * 0.13) * 0.92 * motionScale,
    );
    this.substrate.rotation.y =
      Math.sin(elapsed * 0.09) * 0.038 * motionScale;

    for (const body of this.fragments) {
      if (!body.active) continue;
      const collapseBody = this.collapse
        ? this.collapse.bodies.get(body) ??
          (body.visible ? this.captureCollapseBody(body) : null)
        : null;
      const held = this.drag?.body === body;
      if (held) {
        body.entangled = false;
        body.snagStrength *= Math.exp(-delta * 3.4);
      }
      if (body.pendingTear) {
        if (body.tearPlan) {
          const shift = this.tear(
            body,
            body.velocity,
            body.snagStrength > 0.12,
          );
          if (held && shift && this.drag) {
            this.drag.grabOffset.add(shift);
            this.drag.targetPosition.add(shift);
            this.drag.constrainedPosition.add(shift);
            this.drag.previousPosition.copy(body.position);
          }
        } else {
          body.pendingTear = false;
        }
      }
      const landed = body.landedZone !== null;
      if (collapseBody && this.collapse) {
        this.updateCollapseBody(body, collapseBody, delta);
      } else if (held && this.drag) {
        body.position.lerp(
          this.drag.constrainedPosition,
          1 - Math.exp(-delta * 15),
        );
        body.position.y = this.drag.hoverY;
      } else if (!landed) {
        this.temporaryTarget.set(
          body.anchor.x +
            Math.sin(elapsed * body.driftSpeed + body.phase) *
              0.46 *
              motionScale,
          body.anchor.y +
            Math.sin(elapsed * body.driftSpeed * 1.37 + body.phase) *
              0.2 *
              motionScale,
          body.anchor.z +
            Math.cos(elapsed * body.driftSpeed * 0.81 + body.phase) *
              0.52 *
              motionScale,
        );
        this.temporaryVelocity
          .subVectors(this.temporaryTarget, body.position)
          .multiplyScalar(delta * 0.34);
        body.velocity.add(this.temporaryVelocity);
        body.velocity.multiplyScalar(Math.exp(-delta * 0.72));
        body.position.addScaledVector(body.velocity, delta);
        body.baseRotation.x += body.angularVelocity.x * delta;
        body.baseRotation.y += body.angularVelocity.y * delta;
        body.baseRotation.z += body.angularVelocity.z * delta;
        body.angularVelocity.multiplyScalar(Math.exp(-delta * 1.1));
      } else if (landed) {
        body.velocity.multiplyScalar(Math.exp(-delta * 8));
        body.angularVelocity.multiplyScalar(Math.exp(-delta * 8));
      }
      if (!collapseBody && !held && body.clothSettling) {
        if (reduceMotion) this.bakeBodyClothRest(body);
        else this.settleReleasedCloth(body, delta);
      }
      if (!collapseBody && !held && body.assembling) {
        this.updateRepairAssembly(body, delta, reduceMotion);
      } else if (
        !collapseBody &&
        !held &&
        body.unfurling &&
        !body.clothSettling
      ) {
        this.updateBodyUnfurl(body, delta, reduceMotion);
      }
      body.unfurlBoost *= Math.exp(-delta * 0.7);
      if (!collapseBody) {
        const bodyMotionScale = held || landed ? 0 : motionScale;
        body.rotation.set(
          body.baseRotation.x +
            Math.sin(elapsed * body.driftSpeed * 0.72 + body.phase) *
              0.055 *
              bodyMotionScale,
          body.baseRotation.y +
            Math.cos(elapsed * body.driftSpeed * 0.56 + body.phase) *
              0.045 *
              bodyMotionScale,
          body.baseRotation.z +
            Math.sin(elapsed * body.driftSpeed * 0.91 + body.phase) *
              0.04 *
              bodyMotionScale,
        );
        this.updatePlayerContact(
          body,
          delta,
          playerPosition,
          playerFeetY,
        );
      } else {
        body.contactStrength = 0;
        body.impact = 0;
      }
      body.impact *= Math.exp(-delta * 3.6);
      if (this.drag?.body !== body) {
        body.stress *= Math.exp(-delta * 0.34);
        body.stretchStrength *= Math.exp(-delta * 5.2);
        body.dragStretchLocal.multiplyScalar(Math.exp(-delta * 5.2));
        body.snagStrength *= Math.exp(-delta * 7.2);
      }
      this.syncSelectionProxy(body);
      this.syncLandingSurface(body);
    }

    for (let index = 0; index < this.fragmentPositions.length; index += 3) {
      this.fragmentPositions[index] = 0;
      this.fragmentPositions[index + 1] = hiddenY;
      this.fragmentPositions[index + 2] = 0;
    }
    for (const body of this.fragments) {
      if (!body.visible) continue;
      if (this.drag?.body === body) {
        this.compensateHeldClothTransform(body);
      }
      this.temporaryQuaternion.setFromEuler(body.rotation);
      for (const bodyPiece of body.pieces) {
        this.writePiece(
          body,
          bodyPiece,
          this.temporaryQuaternion,
          delta,
          elapsed,
          motionScale,
        );
      }
    }
    this.fragmentPositionAttribute.needsUpdate = true;
  }

  private captureCollapseBody(
    body: FragmentBody,
  ): CollapseFragmentState {
    const collapse = this.collapse;
    if (!collapse) {
      throw new Error("Cannot capture a cloth scrap outside a world collapse.");
    }
    const offsetX = body.position.x - collapse.origin.x;
    const offsetZ = body.position.z - collapse.origin.z;
    const state: CollapseFragmentState = {
      startPosition: body.position.clone(),
      startRotation: body.rotation.clone(),
      startRadius: Math.max(0.45, Math.hypot(offsetX, offsetZ)),
      startAngle: Math.atan2(offsetZ, offsetX),
      turns: 1.35 + ((body.familyId * 37 + body.detail * 11) % 7) * 0.16,
      phase: body.phase + body.familyId * 0.71,
      scale: 1,
    };
    collapse.bodies.set(body, state);
    body.landedZone = null;
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    this.syncLandingSurface(body);
    return state;
  }

  private updateCollapseBody(
    body: FragmentBody,
    state: CollapseFragmentState,
    delta: number,
  ): void {
    const collapse = this.collapse;
    if (!collapse) return;

    if (collapse.reducedMotion) {
      const pull = THREE.MathUtils.smoothstep(collapse.progress, 0.12, 0.96);
      const easedPull = pull * pull;
      body.position.lerpVectors(
        state.startPosition,
        collapse.origin,
        easedPull,
      );
      body.rotation.set(
        state.startRotation.x,
        state.startRotation.y + pull * 0.35,
        state.startRotation.z + pull * 0.5,
      );
      state.scale = Math.max(0.008, 1 - easedPull * 0.992);
      return;
    }

    const instability = THREE.MathUtils.smoothstep(
      collapse.progress,
      fabricCollapsePhase.instabilityStart,
      fabricCollapsePhase.instabilityEnd,
    );
    const pull = THREE.MathUtils.smoothstep(
      collapse.progress,
      fabricCollapsePhase.pullStart,
      fabricCollapsePhase.pullEnd,
    );
    const orbit = THREE.MathUtils.smoothstep(
      collapse.progress,
      fabricCollapsePhase.orbitStart,
      fabricCollapsePhase.orbitEnd,
    );
    const contraction = Math.pow(pull, 1.38);
    const angle =
      state.startAngle +
      orbit * Math.PI * 2 * state.turns +
      Math.sin(orbit * Math.PI * 3 + state.phase) * instability * 0.24;
    const resistance =
      1 +
      Math.sin(orbit * Math.PI * 2.6 + state.phase) *
        instability *
        (1 - pull) *
        0.08;
    const radius =
      state.startRadius *
      resistance *
      Math.max(0.002, 1 - contraction);
    const verticalOrbit =
      Math.sin(angle * 1.45 + state.phase) *
      Math.min(2.4, state.startRadius * 0.12) *
      instability *
      (1 - pull * 0.72);
    body.position.set(
      collapse.origin.x + Math.cos(angle) * radius,
      THREE.MathUtils.lerp(
        state.startPosition.y + verticalOrbit,
        collapse.origin.y,
        contraction,
      ),
      collapse.origin.z + Math.sin(angle) * radius,
    );

    const tumble = orbit * Math.PI * 2;
    body.rotation.set(
      state.startRotation.x +
        tumble * (0.62 + (body.detail % 3) * 0.13),
      state.startRotation.y +
        tumble * (0.44 + (body.familyId % 4) * 0.09),
      state.startRotation.z +
        tumble * (0.78 + (body.detail % 2) * 0.18),
    );
    body.velocity
      .subVectors(body.position, state.startPosition)
      .multiplyScalar(Math.min(1, delta * 60));
    state.scale = Math.max(
      0.006,
      1 -
        Math.pow(
          THREE.MathUtils.smoothstep(
            collapse.progress,
            fabricCollapsePhase.shrinkStart,
            fabricCollapsePhase.shrinkEnd,
          ),
          1.45,
        ) *
          0.994,
    );
  }

  /**
   * Node state is stored in body-local coordinates, but a held cloth must not
   * inherit every translation and yaw change as if it were a rigid sign. Move
   * the state into the body's new frame first: unpinned nodes retain their
   * world-space inertia while the grabbed neighbourhood is pulled after the
   * pointer by the constraint solver.
   */
  private compensateHeldClothTransform(body: FragmentBody): void {
    const drag = this.drag;
    if (!drag || drag.body !== body) return;
    this.temporaryQuaternion.setFromEuler(body.rotation);
    if (
      drag.solverPosition.distanceToSquared(body.position) < 0.0000001 &&
      1 - Math.abs(drag.solverRotation.dot(this.temporaryQuaternion)) <
        0.0000001
    ) {
      return;
    }
    this.temporaryQuaternionB.copy(this.temporaryQuaternion).invert();
    for (const { piece, offset } of body.pieces) {
      for (
        let index = 0;
        index < piece.positions.length;
        index += 3
      ) {
        this.temporaryPoint
          .set(
            (piece.positions[index] ?? 0) + offset.x,
            (piece.positions[index + 1] ?? 0) + offset.y,
            (piece.positions[index + 2] ?? 0) + offset.z,
          )
          .applyQuaternion(drag.solverRotation)
          .add(drag.solverPosition)
          .sub(body.position)
          .applyQuaternion(this.temporaryQuaternionB)
          .sub(offset);
        piece.positions[index] = this.temporaryPoint.x;
        piece.positions[index + 1] = this.temporaryPoint.y;
        piece.positions[index + 2] = this.temporaryPoint.z;

        this.temporaryPoint
          .set(
            (piece.previousPositions[index] ?? 0) + offset.x,
            (piece.previousPositions[index + 1] ?? 0) + offset.y,
            (piece.previousPositions[index + 2] ?? 0) + offset.z,
          )
          .applyQuaternion(drag.solverRotation)
          .add(drag.solverPosition)
          .sub(body.position)
          .applyQuaternion(this.temporaryQuaternionB)
          .sub(offset);
        piece.previousPositions[index] = this.temporaryPoint.x;
        piece.previousPositions[index + 1] = this.temporaryPoint.y;
        piece.previousPositions[index + 2] = this.temporaryPoint.z;
      }
    }
    drag.solverPosition.copy(body.position);
    drag.solverRotation.copy(this.temporaryQuaternion);
  }

  private updatePlayerContact(
    body: FragmentBody,
    delta: number,
    playerPosition: THREE.Vector3 | null,
    playerFeetY: number,
  ): void {
    let targetStrength = 0;
    if (playerPosition && body.visible) {
      this.temporaryQuaternionB.setFromEuler(body.rotation).invert();
      this.temporaryPoint
        .set(playerPosition.x, playerFeetY, playerPosition.z)
        .sub(body.position)
        .applyQuaternion(this.temporaryQuaternionB);
      const edgeX =
        1 -
        THREE.MathUtils.smoothstep(
          Math.abs(this.temporaryPoint.x),
          body.landingSurface.halfWidth * 0.72,
          body.landingSurface.halfWidth + 0.72,
        );
      const edgeY =
        1 -
        THREE.MathUtils.smoothstep(
          Math.abs(this.temporaryPoint.y),
          body.landingSurface.halfDepth * 0.72,
          body.landingSurface.halfDepth + 0.72,
        );
      const normalDistance = Math.abs(this.temporaryPoint.z);
      const normalContact =
        1 - THREE.MathUtils.smoothstep(normalDistance, 0.08, 1.18);
      targetStrength = Math.max(0, edgeX * edgeY * normalContact);
      if (targetStrength > 0.01) {
        const contactFollow = 1 - Math.exp(-delta * 12);
        body.contactLocal.lerp(this.temporaryPoint, contactFollow);
      }
    }
    const follow =
      1 -
      Math.exp(
        -delta * (targetStrength > body.contactStrength ? 11 : 4.2),
      );
    body.contactStrength = THREE.MathUtils.lerp(
      body.contactStrength,
      targetStrength,
      follow,
    );
  }

  private writePiece(
    body: FragmentBody,
    bodyPiece: BodyPiece,
    rotation: THREE.Quaternion,
    delta: number,
    elapsed: number,
    motionScale: number,
  ): void {
    const { piece, offset } = bodyPiece;
    const held = this.drag?.body === body;
    if (held) {
      this.solveHeldClothPiece(body, bodyPiece, delta, elapsed, motionScale);
    }
    const source =
      held || body.clothSettling
        ? piece.positions
        : piece.restPositions;
    const targetOffset = piece.outputOffset;
    const collapseScale =
      this.collapse?.bodies.get(body)?.scale ?? 1;
    const interactionFlex = Math.min(body.velocity.length() * 0.022, 0.32);
    const passiveFlex =
      (body.landedZone === null ? 0.13 : 0.068) * motionScale;
    const flex = passiveFlex + interactionFlex;
    for (
      let constraint = 0;
      constraint < piece.constraintActive.length;
      constraint += 1
    ) {
      const output = targetOffset + constraint * 6;
      if (piece.constraintActive[constraint] === 0) {
        this.fragmentPositions[output] = 0;
        this.fragmentPositions[output + 1] = hiddenY;
        this.fragmentPositions[output + 2] = 0;
        this.fragmentPositions[output + 3] = 0;
        this.fragmentPositions[output + 4] = hiddenY;
        this.fragmentPositions[output + 5] = 0;
        continue;
      }
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        const node = piece.lineNodes[constraint * 2 + endpoint] ?? 0;
        const index = node * 3;
        let sourceX = source[index] ?? 0;
        let sourceY = source[index + 1] ?? 0;
        let sourceZ = source[index + 2] ?? 0;
        if (!held) {
          const broadRipple =
            Math.sin(
              elapsed * 0.72 +
                sourceX * 0.48 +
                sourceY * 0.31 +
                body.phase,
            ) * flex;
          const crossRipple =
            Math.sin(
              elapsed * 0.43 -
                sourceX * 0.22 +
                sourceY * 0.57 -
                body.phase,
            ) *
            flex *
            0.42;
          const contactX = sourceX + offset.x - body.contactLocal.x;
          const contactY = sourceY + offset.y - body.contactLocal.y;
          const contactRadius = Math.max(
            1.1,
            Math.min(
              body.landingSurface.halfWidth,
              body.landingSurface.halfDepth,
            ) * 0.9,
          );
          const contactFalloff = THREE.MathUtils.smoothstep(
            1 - Math.hypot(contactX, contactY) / contactRadius,
            0,
            1,
          );
          const contactDeformation = body.contactStrength * contactFalloff;
          const contactDirection = body.contactLocal.z >= 0 ? -1 : 1;
          const impactWave =
            Math.sin(
              Math.hypot(contactX, contactY) * 4.2 -
                elapsed * (4.8 + body.impact * 3),
            ) *
            body.impact *
            contactFalloff *
            0.16;
          sourceX +=
            crossRipple * 0.08 +
            contactX *
              contactDeformation *
              (body.landedZone === null ? 0.18 : 0.09);
          sourceY +=
            broadRipple * 0.04 +
            contactY *
              contactDeformation *
              (body.landedZone === null ? 0.18 : 0.09);
          sourceZ +=
            broadRipple +
            crossRipple +
            contactDirection *
              contactDeformation *
              (body.landedZone === null ? 0.06 : 0.22 + body.impact * 0.12) +
            impactWave;
        }
        this.temporaryPoint
          .set(
            (sourceX + offset.x) * collapseScale,
            (sourceY + offset.y) * collapseScale,
            (sourceZ + offset.z) * collapseScale,
          )
          .applyQuaternion(rotation)
          .add(body.position);
        const endpointOutput = output + endpoint * 3;
        this.fragmentPositions[endpointOutput] = this.temporaryPoint.x;
        this.fragmentPositions[endpointOutput + 1] = this.temporaryPoint.y;
        this.fragmentPositions[endpointOutput + 2] = this.temporaryPoint.z;
      }
    }
  }

  private solveHeldClothPiece(
    body: FragmentBody,
    bodyPiece: BodyPiece,
    delta: number,
    elapsed: number,
    motionScale: number,
  ): void {
    const { piece, offset } = bodyPiece;
    const rest = piece.restPositions;
    const positions = piece.positions;
    const previous = piece.previousPositions;
    const frameScale = THREE.MathUtils.clamp(delta * 60, 0.35, 1.8);
    const damping = Math.pow(0.9, frameScale);
    const grabRadius = Math.max(
      0.72,
      Math.min(
        body.selectionProxy.scale.x,
        body.selectionProxy.scale.y,
      ) * 0.24,
    );
    const contactRadius = Math.max(
      0.8,
      Math.min(
        body.landingSurface.halfWidth,
        body.landingSurface.halfDepth,
      ) * 0.72,
    );
    const snagNormalX = body.collisionNormalLocal.x;
    const snagNormalY = body.collisionNormalLocal.y;
    const snagEdgeExtent =
      Math.abs(snagNormalX) * body.selectionProxy.scale.x * 0.5 +
      Math.abs(snagNormalY) * body.selectionProxy.scale.y * 0.5;

    for (let index = 0; index < positions.length; index += 3) {
      const restX = rest[index] ?? 0;
      const restY = rest[index + 1] ?? 0;
      const restZ = rest[index + 2] ?? 0;
      const currentX = positions[index] ?? restX;
      const currentY = positions[index + 1] ?? restY;
      const currentZ = positions[index + 2] ?? restZ;
      const velocityX = (currentX - (previous[index] ?? restX)) * damping;
      const velocityY =
        (currentY - (previous[index + 1] ?? restY)) * damping;
      const velocityZ =
        (currentZ - (previous[index + 2] ?? restZ)) * damping;
      previous[index] = currentX;
      previous[index + 1] = currentY;
      previous[index + 2] = currentZ;

      // Length constraints provide the cloth's memory. Per-node tethers to the
      // authored rectangle made folds visibly morph home while still held.
      let nextX = currentX + velocityX;
      let nextY = currentY + velocityY;
      let nextZ = currentZ + velocityZ;
      const passiveWave =
        Math.sin(
          elapsed * 0.78 +
            (restX + offset.x) * 0.52 +
            (restY + offset.y) * 0.34 +
            body.phase,
        ) *
        0.035 *
        motionScale;
      nextZ += passiveWave * frameScale * 0.18;

      const grabX = restX + offset.x - body.grabLocal.x;
      const grabY = restY + offset.y - body.grabLocal.y;
      const grabInfluence =
        THREE.MathUtils.smoothstep(
          1 - Math.hypot(grabX, grabY) / grabRadius,
          0,
          1,
        ) * body.stretchStrength;
      if (grabInfluence > 0.001) {
        const drive = 1 - Math.exp(-delta * 22);
        nextX = THREE.MathUtils.lerp(
          nextX,
          restX + body.dragStretchLocal.x * grabInfluence,
          drive,
        );
        nextY = THREE.MathUtils.lerp(
          nextY,
          restY + body.dragStretchLocal.y * grabInfluence,
          drive,
        );
        nextZ = THREE.MathUtils.lerp(
          nextZ,
          restZ + body.dragStretchLocal.z * grabInfluence,
          drive,
        );
      }

      if (
        body.snagStrength > 0.001 &&
        snagEdgeExtent > 0.001
      ) {
        const projection =
          (restX + offset.x) * snagNormalX +
          (restY + offset.y) * snagNormalY;
        const edgeDistance = Math.max(0, projection + snagEdgeExtent);
        const edgePin =
          (1 - THREE.MathUtils.smoothstep(edgeDistance, 0.04, 1.1)) *
          body.snagStrength;
        if (edgePin > 0.001) {
          const pin = (1 - Math.exp(-delta * 28)) * edgePin;
          nextX = THREE.MathUtils.lerp(nextX, restX, pin);
          nextY = THREE.MathUtils.lerp(nextY, restY, pin);
          nextZ = THREE.MathUtils.lerp(nextZ, restZ, pin * 0.72);
          // Project the contacted edge away from the obstacle and let the
          // excess length buckle upward. This is the same positional-contact
          // idea used by PBD cloth, kept local to the actively held scrap.
          const compression =
            edgePin *
            body.stretchStrength *
            (0.08 + body.snagStrength * 0.18);
          nextX += snagNormalX * compression;
          nextY += snagNormalY * compression;
          nextZ +=
            compression *
            (0.45 +
              Math.sin(
                restX * 2.7 + restY * 2.1 + elapsed * 9,
              ) *
                0.35);
        }
      }

      const contactX = restX + offset.x - body.contactLocal.x;
      const contactY = restY + offset.y - body.contactLocal.y;
      const contactInfluence =
        THREE.MathUtils.smoothstep(
          1 - Math.hypot(contactX, contactY) / contactRadius,
          0,
          1,
        ) * body.contactStrength;
      if (contactInfluence > 0.001) {
        nextZ +=
          (body.contactLocal.z >= 0 ? -1 : 1) *
          contactInfluence *
          (0.12 + body.impact * 0.1);
      }

      positions[index] = nextX;
      positions[index + 1] = nextY;
      positions[index + 2] = nextZ;
    }

    const iterations = this.quality === "low" ? 2 : 3;
    let breaksRemaining = this.quality === "high" ? 2 : 1;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (
        let constraint = 0;
        constraint < piece.constraintActive.length;
        constraint += 1
      ) {
        if (piece.constraintActive[constraint] === 0) continue;
        const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
        const second = (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
        const deltaX =
          (positions[second] ?? 0) - (positions[first] ?? 0);
        const deltaY =
          (positions[second + 1] ?? 0) -
          (positions[first + 1] ?? 0);
        const deltaZ =
          (positions[second + 2] ?? 0) -
          (positions[first + 2] ?? 0);
        const length = Math.max(
          0.0001,
          Math.hypot(deltaX, deltaY, deltaZ),
        );
        const restLength = piece.constraintLengths[constraint] ?? length;
        const tearRatio = THREE.MathUtils.lerp(
          1.62,
          1.3,
          THREE.MathUtils.clamp(body.stress, 0, 1),
        );
        if (
          iteration === 0 &&
          breaksRemaining > 0 &&
          body.snagStrength > 0.28 &&
          body.stretchStrength > 0.42 &&
          length / restLength > tearRatio
        ) {
          piece.constraintActive[constraint] = 0;
          breaksRemaining -= 1;
          body.stress = Math.min(1.2, body.stress + 0.12);
          body.pendingTear = body.tearPlan !== null;
          continue;
        }
        const correction =
          THREE.MathUtils.clamp(
            (length - restLength) / length,
            -0.35,
            0.55,
          ) * 0.28;
        positions[first] =
          (positions[first] ?? 0) + deltaX * correction;
        positions[first + 1] =
          (positions[first + 1] ?? 0) + deltaY * correction;
        positions[first + 2] =
          (positions[first + 2] ?? 0) + deltaZ * correction;
        positions[second] =
          (positions[second] ?? 0) - deltaX * correction;
        positions[second + 1] =
          (positions[second + 1] ?? 0) - deltaY * correction;
        positions[second + 2] =
          (positions[second + 2] ?? 0) - deltaZ * correction;
      }
    }
    this.projectHeldPieceCollisions(body, bodyPiece);
  }

  private projectHeldPieceCollisions(
    body: FragmentBody,
    bodyPiece: BodyPiece,
  ): void {
    const drag = this.drag;
    if (!drag || drag.body !== body) return;
    const { piece, offset } = bodyPiece;
    const positions = piece.positions;
    const previous = piece.previousPositions;
    this.temporaryQuaternion.setFromEuler(body.rotation);
    this.temporaryQuaternionB.copy(this.temporaryQuaternion).invert();
    this.temporaryCollisionNormal.set(0, 0, 0);
    let projectedNodes = 0;

    for (let index = 0; index < positions.length; index += 3) {
      const localX = positions[index] ?? 0;
      const localY = positions[index + 1] ?? 0;
      const localZ = positions[index + 2] ?? 0;
      this.temporaryPoint
        .set(
          localX + offset.x,
          localY + offset.y,
          localZ + offset.z,
        )
        .applyQuaternion(this.temporaryQuaternion)
        .add(body.position);
      this.temporaryPointB
        .set(
          (previous[index] ?? localX) + offset.x,
          (previous[index + 1] ?? localY) + offset.y,
          (previous[index + 2] ?? localZ) + offset.z,
        )
        .applyQuaternion(this.temporaryQuaternion)
        .add(body.position);
      const originalX = this.temporaryPoint.x;
      const originalY = this.temporaryPoint.y;
      const originalZ = this.temporaryPoint.z;
      let projected = false;

      if (drag.colliders) {
        for (const collider of drag.colliders) {
          projected =
            this.projectSweptPointFromBox(
              this.temporaryPoint,
              this.temporaryPointB,
              collider,
              0.045,
            ) || projected;
        }
      }

      if (drag.surfaces) {
        for (const surface of drag.surfaces) {
          if (
            surface.id.startsWith("ambient-grid-") ||
            Math.abs(this.temporaryPoint.x - surface.x) > surface.halfWidth ||
            Math.abs(this.temporaryPoint.z - surface.z) > surface.halfDepth
          ) {
            continue;
          }
          const height = surface.heightAt(
            this.temporaryPoint.x,
            this.temporaryPoint.z,
          );
          const previousHeight = surface.heightAt(
            this.temporaryPointB.x,
            this.temporaryPointB.z,
          );
          if (
            this.temporaryPoint.y < height + 0.04 &&
            (this.temporaryPoint.y > height - 0.52 ||
              this.temporaryPointB.y >= previousHeight + 0.02)
          ) {
            this.temporaryPoint.y = height + 0.04;
            projected = true;
          }
        }
      }

      if (drag.snagPoints) {
        for (const snag of drag.snagPoints) {
          projected =
            this.projectSweptPointFromVerticalCircle(
              this.temporaryPoint,
              this.temporaryPointB,
              snag.position.x,
              snag.position.z,
              0.25,
            ) || projected;
        }
      }
      projected =
        this.projectSweptPointFromVerticalCircle(
          this.temporaryPoint,
          this.temporaryPointB,
          drag.playerPosition.x,
          drag.playerPosition.z,
          0.62,
        ) || projected;
      if (!projected) continue;

      projectedNodes += 1;
      this.temporaryCollisionNormal.set(
        this.temporaryCollisionNormal.x +
          this.temporaryPoint.x -
          originalX,
        this.temporaryCollisionNormal.y +
          this.temporaryPoint.y -
          originalY,
        this.temporaryCollisionNormal.z +
          this.temporaryPoint.z -
          originalZ,
      );
      this.temporaryPoint
        .sub(body.position)
        .applyQuaternion(this.temporaryQuaternionB)
        .sub(offset);
      const correctionX = this.temporaryPoint.x - localX;
      const correctionY = this.temporaryPoint.y - localY;
      const correctionZ = this.temporaryPoint.z - localZ;
      positions[index] = this.temporaryPoint.x;
      positions[index + 1] = this.temporaryPoint.y;
      positions[index + 2] = this.temporaryPoint.z;
      previous[index] = (previous[index] ?? localX) + correctionX;
      previous[index + 1] =
        (previous[index + 1] ?? localY) + correctionY;
      previous[index + 2] =
        (previous[index + 2] ?? localZ) + correctionZ;
    }

    const projectedSegments =
      this.projectHeldPieceSegmentCircles(body, bodyPiece);
    const collisionCount = projectedNodes + projectedSegments;
    if (collisionCount === 0) return;
    body.entangled = true;
    body.snagStrength = Math.max(
      body.snagStrength,
      THREE.MathUtils.clamp(
        0.24 + collisionCount / Math.max(8, positions.length / 7.5),
        0.24,
        1,
      ),
    );
    if (this.temporaryCollisionNormal.lengthSq() > 0.000001) {
      this.temporaryCollisionNormal
        .applyQuaternion(this.temporaryQuaternionB)
        .setZ(0);
      if (this.temporaryCollisionNormal.lengthSq() > 0.000001) {
        this.temporaryCollisionNormal.normalize();
        body.collisionNormalLocal
          .lerp(this.temporaryCollisionNormal, 0.58)
          .normalize();
      }
    }
  }

  private projectSweptPointFromBox(
    point: THREE.Vector3,
    previousPoint: THREE.Vector3,
    collider: AmbientGridDragCollider,
    margin: number,
  ): boolean {
    const minimumX = collider.x - collider.halfWidth - margin;
    const maximumX = collider.x + collider.halfWidth + margin;
    const minimumY = collider.y - collider.halfHeight - margin;
    const maximumY = collider.y + collider.halfHeight + margin;
    const minimumZ = collider.z - collider.halfDepth - margin;
    const maximumZ = collider.z + collider.halfDepth + margin;
    const previousInside =
      previousPoint.x > minimumX &&
      previousPoint.x < maximumX &&
      previousPoint.y > minimumY &&
      previousPoint.y < maximumY &&
      previousPoint.z > minimumZ &&
      previousPoint.z < maximumZ;

    if (!previousInside) {
      const movementX = point.x - previousPoint.x;
      const movementY = point.y - previousPoint.y;
      const movementZ = point.z - previousPoint.z;
      let enter = 0;
      let exit = 1;
      let normalX = 0;
      let normalY = 0;
      let normalZ = 0;

      if (Math.abs(movementX) < 0.000001) {
        if (previousPoint.x < minimumX || previousPoint.x > maximumX) {
          enter = 2;
        }
      } else {
        const near =
          ((movementX > 0 ? minimumX : maximumX) - previousPoint.x) /
          movementX;
        const far =
          ((movementX > 0 ? maximumX : minimumX) - previousPoint.x) /
          movementX;
        if (near > enter) {
          enter = near;
          normalX = movementX > 0 ? -1 : 1;
          normalY = 0;
          normalZ = 0;
        }
        exit = Math.min(exit, far);
      }
      if (Math.abs(movementY) < 0.000001) {
        if (previousPoint.y < minimumY || previousPoint.y > maximumY) {
          enter = 2;
        }
      } else {
        const near =
          ((movementY > 0 ? minimumY : maximumY) - previousPoint.y) /
          movementY;
        const far =
          ((movementY > 0 ? maximumY : minimumY) - previousPoint.y) /
          movementY;
        if (near > enter) {
          enter = near;
          normalX = 0;
          normalY = movementY > 0 ? -1 : 1;
          normalZ = 0;
        }
        exit = Math.min(exit, far);
      }
      if (Math.abs(movementZ) < 0.000001) {
        if (previousPoint.z < minimumZ || previousPoint.z > maximumZ) {
          enter = 2;
        }
      } else {
        const near =
          ((movementZ > 0 ? minimumZ : maximumZ) - previousPoint.z) /
          movementZ;
        const far =
          ((movementZ > 0 ? maximumZ : minimumZ) - previousPoint.z) /
          movementZ;
        if (near > enter) {
          enter = near;
          normalX = 0;
          normalY = 0;
          normalZ = movementZ > 0 ? -1 : 1;
        }
        exit = Math.min(exit, far);
      }

      if (enter <= exit && enter >= 0 && enter <= 1) {
        const movementLength = Math.max(
          0.001,
          Math.hypot(movementX, movementY, movementZ),
        );
        const safeTime = Math.max(0, enter - 0.012 / movementLength);
        point.set(
          previousPoint.x + movementX * safeTime + normalX * 0.008,
          previousPoint.y + movementY * safeTime + normalY * 0.008,
          previousPoint.z + movementZ * safeTime + normalZ * 0.008,
        );
        this.temporarySweepNormal.set(normalX, normalY, normalZ);
        return true;
      }
    }

    if (
      point.x <= minimumX ||
      point.x >= maximumX ||
      point.y <= minimumY ||
      point.y >= maximumY ||
      point.z <= minimumZ ||
      point.z >= maximumZ
    ) {
      return false;
    }
    const left = point.x - minimumX;
    const right = maximumX - point.x;
    const front = point.z - minimumZ;
    const back = maximumZ - point.z;
    const top = maximumY - point.y;
    const nearest = Math.min(left, right, front, back, top);
    if (nearest === top) point.y = maximumY;
    else if (nearest === left) point.x = minimumX;
    else if (nearest === right) point.x = maximumX;
    else if (nearest === front) point.z = minimumZ;
    else point.z = maximumZ;
    return true;
  }

  private projectSweptPointFromVerticalCircle(
    point: THREE.Vector3,
    previousPoint: THREE.Vector3,
    centerX: number,
    centerZ: number,
    radius: number,
  ): boolean {
    const movementX = point.x - previousPoint.x;
    const movementZ = point.z - previousPoint.z;
    const previousX = previousPoint.x - centerX;
    const previousZ = previousPoint.z - centerZ;
    const previousDistanceSquared =
      previousX * previousX + previousZ * previousZ;
    const radiusSquared = radius * radius;
    const movementSquared =
      movementX * movementX + movementZ * movementZ;
    if (
      previousDistanceSquared >= radiusSquared &&
      movementSquared > 0.000001
    ) {
      const projection = previousX * movementX + previousZ * movementZ;
      const discriminant =
        projection * projection -
        movementSquared * (previousDistanceSquared - radiusSquared);
      if (discriminant >= 0) {
        const hitTime =
          (-projection - Math.sqrt(discriminant)) / movementSquared;
        if (hitTime >= 0 && hitTime <= 1) {
          const hitX = previousX + movementX * hitTime;
          const hitZ = previousZ + movementZ * hitTime;
          const hitLength = Math.max(0.001, Math.hypot(hitX, hitZ));
          point.x = centerX + (hitX / hitLength) * (radius + 0.008);
          point.z = centerZ + (hitZ / hitLength) * (radius + 0.008);
          return true;
        }
      }
    }

    const deltaX = point.x - centerX;
    const deltaZ = point.z - centerZ;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared >= radiusSquared) return false;
    const distance = Math.sqrt(distanceSquared);
    if (distance < 0.001) {
      const movementLength = Math.hypot(movementX, movementZ);
      if (movementLength > 0.001) {
        point.x = centerX - (movementX / movementLength) * radius;
        point.z = centerZ - (movementZ / movementLength) * radius;
      } else {
        point.x = centerX + radius;
      }
      return true;
    }
    point.x = centerX + (deltaX / distance) * radius;
    point.z = centerZ + (deltaZ / distance) * radius;
    return true;
  }

  /**
   * Sparse node projection alone can leave a visible strand crossing a thin
   * lantern pole or the player between two legal endpoints. Resolve the actual
   * rendered segment against those rounded obstacles as a final cloth pass.
   */
  private projectHeldPieceSegmentCircles(
    body: FragmentBody,
    bodyPiece: BodyPiece,
  ): number {
    const drag = this.drag;
    if (!drag || drag.body !== body) return 0;
    const { piece, offset } = bodyPiece;
    const positions = piece.positions;
    const previous = piece.previousPositions;
    const snagCount = drag.snagPoints?.length ?? 0;
    let projected = 0;
    this.temporaryQuaternion.setFromEuler(body.rotation);
    this.temporaryQuaternionB.copy(this.temporaryQuaternion).invert();

    for (
      let constraint = 0;
      constraint < piece.constraintActive.length;
      constraint += 1
    ) {
      if (piece.constraintActive[constraint] === 0) continue;
      const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
      const second = (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
      this.temporaryTarget
        .set(
          (positions[first] ?? 0) + offset.x,
          (positions[first + 1] ?? 0) + offset.y,
          (positions[first + 2] ?? 0) + offset.z,
        )
        .applyQuaternion(this.temporaryQuaternion)
        .add(body.position);
      this.temporaryConstrainedTarget
        .set(
          (positions[second] ?? 0) + offset.x,
          (positions[second + 1] ?? 0) + offset.y,
          (positions[second + 2] ?? 0) + offset.z,
        )
        .applyQuaternion(this.temporaryQuaternion)
        .add(body.position);

      for (let obstacle = -1; obstacle < snagCount; obstacle += 1) {
        const center =
          obstacle < 0
            ? drag.playerPosition
            : drag.snagPoints?.[obstacle]?.position;
        if (!center) continue;
        const radius = obstacle < 0 ? 0.62 : 0.25;
        const segmentX =
          this.temporaryConstrainedTarget.x - this.temporaryTarget.x;
        const segmentZ =
          this.temporaryConstrainedTarget.z - this.temporaryTarget.z;
        const segmentLengthSquared =
          segmentX * segmentX + segmentZ * segmentZ;
        const along =
          segmentLengthSquared > 0.000001
            ? THREE.MathUtils.clamp(
                ((center.x - this.temporaryTarget.x) * segmentX +
                  (center.z - this.temporaryTarget.z) * segmentZ) /
                  segmentLengthSquared,
                0,
                1,
              )
            : 0;
        const closestX = this.temporaryTarget.x + segmentX * along;
        const closestZ = this.temporaryTarget.z + segmentZ * along;
        let normalX = closestX - center.x;
        let normalZ = closestZ - center.z;
        const distance = Math.hypot(normalX, normalZ);
        if (distance >= radius) continue;
        if (distance < 0.001) {
          const segmentLength = Math.max(
            0.001,
            Math.sqrt(segmentLengthSquared),
          );
          normalX = -segmentZ / segmentLength;
          normalZ = segmentX / segmentLength;
        } else {
          normalX /= distance;
          normalZ /= distance;
        }
        const firstWeight = 1 - along;
        const secondWeight = along;
        const weightScale = Math.max(
          0.2,
          firstWeight * firstWeight + secondWeight * secondWeight,
        );
        const correction = (radius - distance + 0.01) / weightScale;
        this.temporaryVelocity
          .set(normalX, 0, normalZ)
          .applyQuaternion(this.temporaryQuaternionB);
        const firstCorrection = correction * firstWeight;
        const secondCorrection = correction * secondWeight;
        positions[first] =
          (positions[first] ?? 0) +
          this.temporaryVelocity.x * firstCorrection;
        positions[first + 1] =
          (positions[first + 1] ?? 0) +
          this.temporaryVelocity.y * firstCorrection;
        positions[first + 2] =
          (positions[first + 2] ?? 0) +
          this.temporaryVelocity.z * firstCorrection;
        positions[second] =
          (positions[second] ?? 0) +
          this.temporaryVelocity.x * secondCorrection;
        positions[second + 1] =
          (positions[second + 1] ?? 0) +
          this.temporaryVelocity.y * secondCorrection;
        positions[second + 2] =
          (positions[second + 2] ?? 0) +
          this.temporaryVelocity.z * secondCorrection;
        previous[first] =
          (previous[first] ?? 0) +
          this.temporaryVelocity.x * firstCorrection;
        previous[first + 1] =
          (previous[first + 1] ?? 0) +
          this.temporaryVelocity.y * firstCorrection;
        previous[first + 2] =
          (previous[first + 2] ?? 0) +
          this.temporaryVelocity.z * firstCorrection;
        previous[second] =
          (previous[second] ?? 0) +
          this.temporaryVelocity.x * secondCorrection;
        previous[second + 1] =
          (previous[second + 1] ?? 0) +
          this.temporaryVelocity.y * secondCorrection;
        previous[second + 2] =
          (previous[second + 2] ?? 0) +
          this.temporaryVelocity.z * secondCorrection;
        this.temporaryCollisionNormal.x += normalX * correction;
        this.temporaryCollisionNormal.z += normalZ * correction;
        this.temporaryTarget.x += normalX * firstCorrection;
        this.temporaryTarget.z += normalZ * firstCorrection;
        this.temporaryConstrainedTarget.x +=
          normalX * secondCorrection;
        this.temporaryConstrainedTarget.z +=
          normalZ * secondCorrection;
        projected += 1;
      }
    }
    return projected;
  }

  private syncSelectionProxy(body: FragmentBody): void {
    body.selectionProxy.visible = body.visible;
    body.selectionProxy.position.copy(body.position);
    body.selectionProxy.rotation.copy(body.rotation);
  }

  private syncLandingSurface(body: FragmentBody): void {
    const surface = body.landingSurface;
    if (
      !body.visible ||
      body.landedZone === null ||
      body.landedZone !== this.currentZone
    ) {
      surface.x = 1000;
      surface.z = 1000;
      surface.height = 0;
      return;
    }
    surface.x = body.position.x;
    surface.z = body.position.z;
    surface.height =
      body.position.y +
      0.08 -
      body.contactStrength * 0.12 -
      body.impact * 0.04;
  }

  getLandingSurfaces(): readonly AmbientGridLandingSurface[] {
    return this.landingSurfaces;
  }

  private pickBody(ray: THREE.Ray): FragmentBody | null {
    this.root.updateMatrixWorld(true);
    this.selectionRaycaster.ray.copy(ray);
    this.selectionHits.length = 0;
    this.selectionRaycaster.intersectObject(
      this.fragmentLines,
      false,
      this.selectionHits,
    );
    for (const hit of this.selectionHits) {
      if (hit.index === undefined) continue;
      for (const piece of this.allPieces) {
        const firstVertex = piece.outputOffset / 3;
        const endVertex =
          (piece.outputOffset + piece.outputLength) / 3;
        if (hit.index < firstVertex || hit.index >= endVertex) continue;
        for (const body of this.fragments) {
          if (!body.visible) continue;
          for (const bodyPiece of body.pieces) {
            if (bodyPiece.piece === piece) return body;
          }
        }
      }
    }
    return null;
  }

  isPointedAt(ray: THREE.Ray): boolean {
    return this.pickBody(ray) !== null;
  }

  beginDrag(
    ray: THREE.Ray,
    pointerId: number,
    time: number,
  ): boolean {
    if (this.drag) return false;
    const body = this.pickBody(ray);
    if (!body) return false;
    if (body.assembling) {
      this.updateRepairAssembly(body, 0, true);
    }
    this.root.updateMatrixWorld(true);
    const hoverY = THREE.MathUtils.clamp(
      Math.max(0.92, body.position.y + 0.36),
      0.92,
      3.2,
    );
    const plane = new THREE.Plane(worldUp, -hoverY);
    const point = new THREE.Vector3();
    if (!ray.intersectPlane(plane, point)) return false;
    body.position.y = hoverY;
    const initialYaw = body.rotation.z;
    body.baseRotation.set(-Math.PI / 2, 0, initialYaw);
    body.rotation.copy(body.baseRotation);
    this.temporaryPointB.copy(point);
    this.root.worldToLocal(this.temporaryPointB);
    this.temporaryQuaternionB.setFromEuler(body.rotation).invert();
    body.grabLocal
      .copy(this.temporaryPointB)
      .sub(body.position)
      .applyQuaternion(this.temporaryQuaternionB);
    this.prepareBodyClothForDrag(body);
    this.drag = {
      body,
      pointerId,
      plane,
      point,
      grabOffset: body.position
        .clone()
        .sub(this.temporaryPointB)
        .setY(0),
      previousPosition: body.position.clone(),
      targetPosition: body.position.clone(),
      constrainedPosition: body.position.clone(),
      hoverY,
      previousTime: time,
      snagPoints: null,
      colliders: null,
      surfaces: null,
      playerPosition: new THREE.Vector3(),
      solverPosition: body.position.clone(),
      solverRotation: new THREE.Quaternion().setFromEuler(body.rotation),
      releaseVelocity: new THREE.Vector3(),
    };
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.landedZone = null;
    body.entangled = false;
    body.unfurling = false;
    body.unfurlDelay = 0;
    body.baseRotation.copy(body.rotation);
    // Repeated handling should fatigue a scrap instead of repairing most of its
    // accumulated strain on every new grab. Ordinary clicks remain harmless,
    // while persistent manipulation eventually primes the next moving pull.
    body.stress = Math.min(1.2, body.stress + 0.045);
    body.impact = Math.max(body.impact, 0.18);
    body.dragStretchLocal.set(0, 0, 0);
    body.stretchStrength = 0;
    body.collisionNormalLocal.set(0, 0, 0);
    body.snagStrength = 0;
    this.syncLandingSurface(body);
    return true;
  }

  private resetBodyCloth(body: FragmentBody): void {
    for (const { piece } of body.pieces) {
      piece.positions.set(piece.restPositions);
      piece.previousPositions.set(piece.restPositions);
    }
    body.clothSettling = false;
  }

  private prepareBodyClothForDrag(body: FragmentBody): void {
    if (!body.clothSettling) {
      this.resetBodyCloth(body);
      return;
    }
    for (const { piece } of body.pieces) {
      piece.previousPositions.set(piece.positions);
    }
    body.clothSettling = false;
  }

  /**
   * Remove accidental whole-sheet solver recoil while retaining a small amount
   * of relative fold motion. World translation is handled by the body release
   * velocity; the cloth buffer should only continue its internal motion.
   */
  private conditionBodyClothForRelease(body: FragmentBody): void {
    for (const { piece } of body.pieces) {
      const positions = piece.positions;
      const previous = piece.previousPositions;
      const nodeCount = Math.max(1, positions.length / 3);
      let meanX = 0;
      let meanY = 0;
      let meanZ = 0;
      for (let index = 0; index < positions.length; index += 3) {
        meanX +=
          (positions[index] ?? 0) - (previous[index] ?? 0);
        meanY +=
          (positions[index + 1] ?? 0) -
          (previous[index + 1] ?? 0);
        meanZ +=
          (positions[index + 2] ?? 0) -
          (previous[index + 2] ?? 0);
      }
      meanX /= nodeCount;
      meanY /= nodeCount;
      meanZ /= nodeCount;
      for (let index = 0; index < positions.length; index += 3) {
        const currentX = positions[index] ?? 0;
        const currentY = positions[index + 1] ?? 0;
        const currentZ = positions[index + 2] ?? 0;
        const velocityX = THREE.MathUtils.clamp(
          currentX - (previous[index] ?? currentX) - meanX,
          -0.055,
          0.055,
        );
        const velocityY = THREE.MathUtils.clamp(
          currentY - (previous[index + 1] ?? currentY) - meanY,
          -0.055,
          0.055,
        );
        const velocityZ = THREE.MathUtils.clamp(
          currentZ - (previous[index + 2] ?? currentZ) - meanZ,
          -0.055,
          0.055,
        );
        previous[index] = currentX - velocityX * 0.38;
        previous[index + 1] = currentY - velocityY * 0.38;
        previous[index + 2] = currentZ - velocityZ * 0.38;
      }
    }
  }

  private settleReleasedCloth(body: FragmentBody, delta: number): void {
    const frameScale = THREE.MathUtils.clamp(delta * 60, 0.35, 1.8);
    const damping = Math.pow(0.84, frameScale);
    const recenter = 1 - Math.exp(-delta * 3.2);
    let maximumMotion = 0;

    for (const { piece } of body.pieces) {
      const rest = piece.restPositions;
      const positions = piece.positions;
      const previous = piece.previousPositions;
      let restCenterX = 0;
      let restCenterY = 0;
      let restCenterZ = 0;
      let currentCenterX = 0;
      let currentCenterY = 0;
      let currentCenterZ = 0;
      const nodeCount = Math.max(1, positions.length / 3);
      for (let index = 0; index < positions.length; index += 3) {
        const restX = rest[index] ?? 0;
        const restY = rest[index + 1] ?? 0;
        const restZ = rest[index + 2] ?? 0;
        const currentX = positions[index] ?? restX;
        const currentY = positions[index + 1] ?? restY;
        const currentZ = positions[index + 2] ?? restZ;
        const velocityX = THREE.MathUtils.clamp(
          (currentX - (previous[index] ?? restX)) * damping,
          -0.065,
          0.065,
        );
        const velocityY = THREE.MathUtils.clamp(
          (currentY - (previous[index + 1] ?? restY)) * damping,
          -0.065,
          0.065,
        );
        const velocityZ = THREE.MathUtils.clamp(
          (currentZ - (previous[index + 2] ?? restZ)) * damping,
          -0.065,
          0.065,
        );
        previous[index] = currentX;
        previous[index + 1] = currentY;
        previous[index + 2] = currentZ;
        positions[index] = currentX + velocityX;
        positions[index + 1] = currentY + velocityY;
        positions[index + 2] = currentZ + velocityZ;
        restCenterX += restX;
        restCenterY += restY;
        restCenterZ += restZ;
        currentCenterX += positions[index] ?? currentX;
        currentCenterY += positions[index + 1] ?? currentY;
        currentCenterZ += positions[index + 2] ?? currentZ;
        maximumMotion = Math.max(
          maximumMotion,
          Math.abs(velocityX),
          Math.abs(velocityY),
          Math.abs(velocityZ),
        );
      }

      maximumMotion = Math.max(
        maximumMotion,
        this.relaxPieceConstraints(piece, 2, 0.3),
      );
      const shiftX =
        (restCenterX - currentCenterX) / nodeCount * recenter;
      const shiftY =
        (restCenterY - currentCenterY) / nodeCount * recenter;
      const shiftZ =
        (restCenterZ - currentCenterZ) / nodeCount * recenter;
      for (let index = 0; index < positions.length; index += 3) {
        positions[index] = (positions[index] ?? 0) + shiftX;
        positions[index + 1] = (positions[index + 1] ?? 0) + shiftY;
        positions[index + 2] = (positions[index + 2] ?? 0) + shiftZ;
      }
      maximumMotion = Math.max(
        maximumMotion,
        Math.abs(shiftX),
        Math.abs(shiftY),
        Math.abs(shiftZ),
      );
    }

    if (maximumMotion < 0.0025) this.bakeBodyClothRest(body);
  }

  private relaxPieceConstraints(
    piece: GridPiece,
    iterations: number,
    strength: number,
  ): number {
    const positions = piece.positions;
    let maximumCorrection = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (
        let constraint = 0;
        constraint < piece.constraintActive.length;
        constraint += 1
      ) {
        if (piece.constraintActive[constraint] === 0) continue;
        const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
        const second = (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
        const deltaX =
          (positions[second] ?? 0) - (positions[first] ?? 0);
        const deltaY =
          (positions[second + 1] ?? 0) -
          (positions[first + 1] ?? 0);
        const deltaZ =
          (positions[second + 2] ?? 0) -
          (positions[first + 2] ?? 0);
        const length = Math.max(
          0.0001,
          Math.hypot(deltaX, deltaY, deltaZ),
        );
        const restLength = piece.constraintLengths[constraint] ?? length;
        const correction =
          THREE.MathUtils.clamp(
            (length - restLength) / length,
            -0.35,
            0.55,
          ) *
          strength;
        maximumCorrection = Math.max(
          maximumCorrection,
          Math.abs(deltaX * correction),
          Math.abs(deltaY * correction),
          Math.abs(deltaZ * correction),
        );
        positions[first] =
          (positions[first] ?? 0) + deltaX * correction;
        positions[first + 1] =
          (positions[first + 1] ?? 0) + deltaY * correction;
        positions[first + 2] =
          (positions[first + 2] ?? 0) + deltaZ * correction;
        positions[second] =
          (positions[second] ?? 0) - deltaX * correction;
        positions[second + 1] =
          (positions[second + 1] ?? 0) - deltaY * correction;
        positions[second + 2] =
          (positions[second + 2] ?? 0) - deltaZ * correction;
      }
    }
    return maximumCorrection;
  }

  private bakeBodyClothRest(body: FragmentBody): void {
    for (const { piece } of body.pieces) {
      piece.restPositions.set(piece.positions);
      piece.previousPositions.set(piece.positions);
    }
    body.clothSettling = false;
    body.unfurling = !body.entangled && !body.assembling;
    if (body.unfurling) {
      body.unfurlDelay = Math.max(body.unfurlDelay, 0.85);
    }
  }

  private updateBodyUnfurl(
    body: FragmentBody,
    delta: number,
    reduceMotion: boolean,
  ): void {
    if (body.entangled || body.assembling) {
      body.unfurling = false;
      return;
    }
    body.unfurlDelay = Math.max(0, body.unfurlDelay - delta);
    if (body.unfurlDelay > 0) return;
    const follow = reduceMotion
      ? 1
      : 1 -
        Math.exp(
          -delta * (0.075 + body.unfurlBoost * 0.52),
        );
    let maximumShift = 0;
    for (const { piece } of body.pieces) {
      for (
        let index = 0;
        index < piece.restPositions.length;
        index += 1
      ) {
        const current = piece.restPositions[index] ?? 0;
        const target = piece.authoredPositions[index] ?? current;
        const next = THREE.MathUtils.lerp(current, target, follow);
        maximumShift = Math.max(maximumShift, Math.abs(next - current));
        piece.restPositions[index] = next;
        piece.positions[index] = next;
        piece.previousPositions[index] = next;
      }
    }
    if (maximumShift < 0.00008 || reduceMotion) {
      body.unfurling = false;
      body.unfurlBoost = 0;
    }
  }

  private updateRepairAssembly(
    body: FragmentBody,
    delta: number,
    reduceMotion: boolean,
  ): void {
    const family = this.families[body.familyId];
    if (!family) {
      body.assembling = false;
      return;
    }
    body.repairProgress = reduceMotion
      ? 1
      : Math.min(
          1,
          body.repairProgress +
            delta * (0.3 + body.unfurlBoost * 0.16),
        );
    const gather = reduceMotion
      ? 1
      : 1 - Math.exp(-delta * (0.9 + body.repairProgress * 1.7));
    const reveal = THREE.MathUtils.smoothstep(
      body.repairProgress,
      0.06,
      0.96,
    );
    let maximumShift = 0;
    let constraintOrdinal = 0;
    let constraintCount = 0;
    for (const { piece } of body.pieces) {
      constraintCount += piece.constraintActive.length;
    }

    for (const bodyPiece of body.pieces) {
      const { piece, offset } = bodyPiece;
      const beforeX = offset.x;
      const beforeY = offset.y;
      const beforeZ = offset.z;
      offset.lerp(piece.authoredOffset, gather);
      maximumShift = Math.max(
        maximumShift,
        Math.abs(offset.x - beforeX),
        Math.abs(offset.y - beforeY),
        Math.abs(offset.z - beforeZ),
      );
      for (
        let index = 0;
        index < piece.restPositions.length;
        index += 1
      ) {
        const target = piece.repairPositions[index] ?? 0;
        const rest = piece.restPositions[index] ?? target;
        const position = piece.positions[index] ?? rest;
        const nextRest = THREE.MathUtils.lerp(rest, target, gather);
        const nextPosition = THREE.MathUtils.lerp(
          position,
          target,
          gather,
        );
        maximumShift = Math.max(
          maximumShift,
          Math.abs(nextRest - rest),
          Math.abs(nextPosition - position),
        );
        piece.restPositions[index] = nextRest;
        piece.positions[index] = nextPosition;
        piece.previousPositions[index] = nextPosition;
      }
      for (
        let constraint = 0;
        constraint < piece.constraintActive.length;
        constraint += 1
      ) {
        const threshold =
          constraintCount > 0
            ? (constraintOrdinal + 0.5) / constraintCount
            : 0;
        if (threshold <= reveal) {
          piece.constraintActive[constraint] = 1;
        }
        constraintOrdinal += 1;
      }
    }

    if (
      body.repairProgress < 1 ||
      (!reduceMotion && maximumShift >= 0.00065)
    ) {
      return;
    }
    for (const bodyPiece of body.pieces) {
      const { piece, offset } = bodyPiece;
      offset.copy(piece.authoredOffset);
      piece.authoredPositions.set(piece.repairPositions);
      piece.restPositions.set(piece.repairPositions);
      piece.positions.set(piece.repairPositions);
      piece.previousPositions.set(piece.repairPositions);
      piece.constraintActive.fill(1);
      this.updatePieceConstraintLengths(
        piece,
        piece.repairPositions,
      );
    }
    body.selectionProxy = family.selectionProxy;
    body.landingSurface = family.landingSurface;
    body.tearPlan = family.tearPlan;
    body.radius = Math.hypot(family.width, family.height) * 0.36;
    body.assembling = false;
    body.repairProgress = 0;
    body.unfurling = false;
    body.unfurlBoost = 0;
    family.repairEnergy = 0;
    this.syncSelectionProxy(body);
    this.syncLandingSurface(body);
  }

  hasDrag(pointerId?: number): boolean {
    return (
      this.drag !== null &&
      (pointerId === undefined || this.drag.pointerId === pointerId)
    );
  }

  hasActiveMotion(): boolean {
    if (this.drag) return true;
    for (const body of this.fragments) {
      if (
        body.visible &&
        (body.clothSettling || body.assembling)
      ) {
        return true;
      }
    }
    return false;
  }

  getDragTarget(target: THREE.Vector3): boolean {
    if (!this.drag) return false;
    target.copy(this.drag.targetPosition);
    return true;
  }

  reactToSpell(
    worldPoint: THREE.Vector3,
    stage: "spark" | "surge" | "thunder",
    charge: number,
    range: number,
  ): number {
    const stageEnergy =
      stage === "thunder" ? 1.2 : stage === "surge" ? 0.86 : 0.56;
    let affected = 0;
    for (const body of this.fragments) {
      if (
        !body.active ||
        !body.visible ||
        this.drag?.body === body
      ) {
        continue;
      }
      let awayX = body.position.x - worldPoint.x;
      let awayZ = body.position.z - worldPoint.z;
      const distance = Math.hypot(awayX, awayZ);
      if (distance > range + body.radius * 0.45) continue;
      if (distance < 0.01) {
        awayX = Math.cos(body.phase);
        awayZ = Math.sin(body.phase);
      } else {
        awayX /= distance;
        awayZ /= distance;
      }
      const influence =
        (1 -
          THREE.MathUtils.smoothstep(
            distance,
            range * 0.24,
            range + body.radius * 0.45,
          )) *
        stageEnergy *
        (0.72 + charge * 0.62);
      if (influence <= 0.001) continue;

      if (!body.clothSettling) {
        for (const { piece } of body.pieces) {
          piece.positions.set(piece.restPositions);
          piece.previousPositions.set(piece.restPositions);
        }
        body.clothSettling = true;
      }
      this.temporaryQuaternionB.setFromEuler(body.rotation).invert();
      this.temporaryVelocity
        .set(
          awayX * influence * 0.032,
          influence * 0.018,
          awayZ * influence * 0.032,
        )
        .applyQuaternion(this.temporaryQuaternionB);
      for (const { piece } of body.pieces) {
        for (
          let index = 0;
          index < piece.positions.length;
          index += 3
        ) {
          const authoredX = piece.authoredPositions[index] ?? 0;
          const authoredY = piece.authoredPositions[index + 1] ?? 0;
          const wave =
            0.62 +
            Math.sin(
              authoredX * 2.3 +
                authoredY * 1.8 +
                body.phase,
            ) *
              0.38;
          piece.previousPositions[index] =
            (piece.positions[index] ?? 0) -
            this.temporaryVelocity.x * wave;
          piece.previousPositions[index + 1] =
            (piece.positions[index + 1] ?? 0) -
            this.temporaryVelocity.y * wave;
          piece.previousPositions[index + 2] =
            (piece.positions[index + 2] ?? 0) -
            this.temporaryVelocity.z * wave;
        }
      }
      if (
        body.entangled &&
        stage !== "spark" &&
        charge >= 0.72
      ) {
        body.entangled = false;
      }
      if (!body.entangled) {
        body.unfurling = !body.assembling;
        body.unfurlDelay = 0;
        body.unfurlBoost = Math.max(
          body.unfurlBoost,
          influence,
        );
      }
      if (body.landedZone === null) {
        body.velocity.x += awayX * influence * 0.48;
        body.velocity.z += awayZ * influence * 0.48;
      }
      body.impact = Math.max(body.impact, Math.min(1, influence));
      affected += 1;
    }
    return affected;
  }

  redrawWithPencil(
    worldPoint: THREE.Vector3,
    amount: number,
    viewRay: THREE.Ray | null = null,
  ): AmbientGridPencilResult {
    if (this.disposed) return "none";
    let nearestBody: FragmentBody | null = null;
    let nearestPiece: BodyPiece | null = null;
    let nearestDistanceSquared = viewRay
      ? 0.72 * 0.72
      : 1.25 * 1.25;

    for (const body of this.fragments) {
      if (!body.active || !body.visible) continue;
      this.temporaryQuaternion.setFromEuler(body.rotation);
      for (const bodyPiece of body.pieces) {
        const { piece, offset } = bodyPiece;
        const source = body.clothSettling
          ? piece.positions
          : piece.restPositions;
        for (
          let constraint = 0;
          constraint < piece.constraintActive.length;
          constraint += 1
        ) {
          const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
          const second =
            (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
          this.temporaryPoint
            .set(
              ((source[first] ?? 0) + (source[second] ?? 0)) * 0.5 +
                offset.x,
              ((source[first + 1] ?? 0) +
                (source[second + 1] ?? 0)) *
                0.5 +
                offset.y,
              ((source[first + 2] ?? 0) +
                (source[second + 2] ?? 0)) *
                0.5 +
                offset.z,
            )
            .applyQuaternion(this.temporaryQuaternion)
            .add(body.position);
          const deltaX = this.temporaryPoint.x - worldPoint.x;
          const deltaZ = this.temporaryPoint.z - worldPoint.z;
          const verticalDistance = Math.abs(
            this.temporaryPoint.y - worldPoint.y,
          );
          const distanceSquared = viewRay
            ? viewRay.distanceSqToPoint(this.temporaryPoint)
            : deltaX * deltaX + deltaZ * deltaZ;
          if (
            (viewRay !== null || verticalDistance <= 2.25) &&
            distanceSquared < nearestDistanceSquared
          ) {
            nearestDistanceSquared = distanceSquared;
            nearestBody = body;
            nearestPiece = bodyPiece;
          }
        }
      }
    }
    if (!nearestBody || !nearestPiece) return "none";

    const family = this.families[nearestBody.familyId];
    if (!family) return "none";
    const traceAmount = THREE.MathUtils.clamp(amount, 0.006, 0.16);
    let repairBudget = Math.max(1, Math.floor(traceAmount * 48));
    let repaired = 0;
    for (const body of this.fragments) {
      if (!body.active || body.familyId !== family.id) continue;
      this.temporaryQuaternion.setFromEuler(body.rotation);
      for (const bodyPiece of body.pieces) {
        const { piece, offset } = bodyPiece;
        for (
          let constraint = 0;
          constraint < piece.constraintActive.length &&
          repairBudget > 0;
          constraint += 1
        ) {
          if (piece.constraintActive[constraint] !== 0) continue;
          const first = (piece.lineNodes[constraint * 2] ?? 0) * 3;
          const second =
            (piece.lineNodes[constraint * 2 + 1] ?? 0) * 3;
          this.temporaryPoint
            .set(
              ((piece.positions[first] ?? 0) +
                (piece.positions[second] ?? 0)) *
                0.5 +
                offset.x,
              ((piece.positions[first + 1] ?? 0) +
                (piece.positions[second + 1] ?? 0)) *
                0.5 +
                offset.y,
              ((piece.positions[first + 2] ?? 0) +
                (piece.positions[second + 2] ?? 0)) *
                0.5 +
                offset.z,
            )
            .applyQuaternion(this.temporaryQuaternion)
            .add(body.position);
          const withinPencilTrace = viewRay
            ? viewRay.distanceSqToPoint(this.temporaryPoint) <=
              0.9 * 0.9
            : Math.abs(this.temporaryPoint.y - worldPoint.y) <= 2.25 &&
              (this.temporaryPoint.x - worldPoint.x) ** 2 +
                (this.temporaryPoint.z - worldPoint.z) ** 2 <=
                1.35 * 1.35;
          if (
            !withinPencilTrace
          ) {
            continue;
          }
          piece.constraintActive[constraint] = 1;
          repairBudget -= 1;
          repaired += 1;
          body.pendingTear = false;
        }
      }
      body.entangled = false;
      body.unfurling = !body.assembling;
      body.unfurlDelay = 0;
      body.unfurlBoost = Math.max(body.unfurlBoost, 0.72);
    }

    family.repairEnergy = Math.min(
      1,
      family.repairEnergy +
        traceAmount * (1.05 + Math.min(4, repaired) * 0.16),
    );
    if (nearestBody.assembling) {
      nearestBody.repairProgress = Math.min(
        1,
        nearestBody.repairProgress + traceAmount * 0.24,
      );
      return "traced";
    }
    if (
      family.repairEnergy >= 0.38 &&
      this.startFamilyRepairAssembly(
        family,
        nearestBody,
        nearestPiece,
      )
    ) {
      return "assembly-started";
    }
    return "traced";
  }

  private startFamilyRepairAssembly(
    family: FragmentFamily,
    primary: FragmentBody,
    referencePiece: BodyPiece,
  ): boolean {
    if (
      this.drag?.body.familyId === family.id ||
      !primary.active ||
      primary.assembling
    ) {
      return false;
    }
    const sources = this.fragments.filter(
      (body) =>
        body.active &&
        body.familyId === family.id &&
        body.pieces.length > 0,
    );
    if (sources.length === 0) return false;

    const primaryRotation = new THREE.Quaternion().setFromEuler(
      primary.rotation,
    );
    const inversePrimaryRotation = primaryRotation.clone().invert();
    const referenceWorldCenter = referencePiece.offset
      .clone()
      .applyQuaternion(primaryRotation)
      .add(primary.position);
    const authoredReferenceOffsetWorld =
      referencePiece.piece.authoredOffset
      .clone()
      .applyQuaternion(primaryRotation);
    const familyCenter = referenceWorldCenter
      .clone()
      .sub(authoredReferenceOffsetWorld);
    const mergedPieces: BodyPiece[] = [];
    const sourceRotation = new THREE.Quaternion();
    const frameRotation = new THREE.Quaternion();
    const worldCenter = new THREE.Vector3();
    const transformed = new THREE.Vector3();
    let remainsLanded = false;

    for (const source of sources) {
      sourceRotation.setFromEuler(source.rotation);
      frameRotation
        .copy(inversePrimaryRotation)
        .multiply(sourceRotation);
      remainsLanded ||= source.landedZone === this.currentZone;
      for (const bodyPiece of source.pieces) {
        const { piece, offset } = bodyPiece;
        worldCenter
          .copy(offset)
          .applyQuaternion(sourceRotation)
          .add(source.position);
        const mergedOffset = worldCenter
          .clone()
          .sub(familyCenter)
          .applyQuaternion(inversePrimaryRotation);
        for (
          let index = 0;
          index < piece.positions.length;
          index += 3
        ) {
          transformed
            .set(
              piece.positions[index] ?? 0,
              piece.positions[index + 1] ?? 0,
              piece.positions[index + 2] ?? 0,
            )
            .applyQuaternion(frameRotation);
          piece.positions[index] = transformed.x;
          piece.positions[index + 1] = transformed.y;
          piece.positions[index + 2] = transformed.z;
          transformed
            .set(
              piece.previousPositions[index] ?? 0,
              piece.previousPositions[index + 1] ?? 0,
              piece.previousPositions[index + 2] ?? 0,
            )
            .applyQuaternion(frameRotation);
          piece.previousPositions[index] = transformed.x;
          piece.previousPositions[index + 1] = transformed.y;
          piece.previousPositions[index + 2] = transformed.z;
          transformed
            .set(
              piece.restPositions[index] ?? 0,
              piece.restPositions[index + 1] ?? 0,
              piece.restPositions[index + 2] ?? 0,
            )
            .applyQuaternion(frameRotation);
          piece.restPositions[index] = transformed.x;
          piece.restPositions[index + 1] = transformed.y;
          piece.restPositions[index + 2] = transformed.z;
        }
        mergedPieces.push({ piece, offset: mergedOffset });
      }
      source.selectionProxy.visible = false;
      source.landingSurface.x = 1000;
      source.landingSurface.z = 1000;
      source.landingSurface.height = 0;
      if (source !== primary) {
        source.active = false;
        source.visible = false;
        source.pieces = [];
      }
    }
    for (const piece of family.pieces) {
      if (
        mergedPieces.some(
          (bodyPiece) => bodyPiece.piece === piece,
        )
      ) {
        continue;
      }
      piece.restPositions.set(piece.authoredPositions);
      piece.positions.set(piece.authoredPositions);
      piece.previousPositions.set(piece.authoredPositions);
      piece.constraintActive.fill(0);
      mergedPieces.push({
        piece,
        offset: piece.authoredOffset.clone(),
      });
    }

    primary.pieces = mergedPieces;
    primary.position.copy(familyCenter);
    primary.anchor.copy(familyCenter);
    primary.velocity.set(0, 0, 0);
    primary.angularVelocity.set(0, 0, 0);
    primary.baseRotation.copy(primary.rotation);
    primary.selectionProxy = family.selectionProxy;
    primary.landingSurface = family.landingSurface;
    primary.tearPlan = null;
    primary.radius = Math.hypot(family.width, family.height) * 0.36;
    primary.active = true;
    primary.landedZone = remainsLanded ? this.currentZone : null;
    primary.clothSettling = false;
    primary.entangled = false;
    primary.unfurling = false;
    primary.unfurlDelay = 0;
    primary.unfurlBoost = 1;
    primary.assembling = true;
    primary.repairProgress = 0;
    primary.pendingTear = false;
    this.setQuality(this.quality);
    this.syncSelectionProxy(primary);
    this.syncLandingSurface(primary);
    return true;
  }

  updateDrag(
    ray: THREE.Ray,
    pointerId: number,
    time: number,
    snagPoints: readonly SnagPoint[],
    colliders: readonly AmbientGridDragCollider[],
    surfaces: readonly AmbientGridDragSurface[],
    playerPosition: THREE.Vector3,
  ): boolean {
    const drag = this.drag;
    if (!drag || drag.pointerId !== pointerId) return false;
    if (!ray.intersectPlane(drag.plane, drag.point)) return true;
    drag.snagPoints = snagPoints;
    drag.colliders = colliders;
    drag.surfaces = surfaces;
    drag.playerPosition.copy(playerPosition);
    this.root.updateMatrixWorld(true);
    this.temporaryPointB.copy(drag.point);
    this.root.worldToLocal(this.temporaryPointB);
    this.temporaryPointB.y = drag.hoverY;
    this.temporaryTarget
      .copy(this.temporaryPointB)
      .add(drag.grabOffset);
    this.temporaryTarget.y = drag.hoverY;
    this.temporaryTarget.x = THREE.MathUtils.clamp(
      this.temporaryTarget.x,
      -34,
      34,
    );
    this.temporaryTarget.z = THREE.MathUtils.clamp(
      this.temporaryTarget.z,
      -34,
      34,
    );
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (time - drag.previousTime) / 1000),
    );
    this.temporaryVelocity
      .subVectors(this.temporaryTarget, drag.targetPosition)
      .divideScalar(deltaTime)
      .clampLength(0, 18);
    if (this.temporaryVelocity.lengthSq() > 0.12) {
      this.rotateDraggedBodyToward(
        drag.body,
        this.temporaryVelocity.x,
        this.temporaryVelocity.z,
        deltaTime,
      );
      this.syncDragGrabOffset(drag);
      this.temporaryTarget
        .copy(this.temporaryPointB)
        .add(drag.grabOffset);
      this.temporaryTarget.x = THREE.MathUtils.clamp(
        this.temporaryTarget.x,
        -34,
        34,
      );
      this.temporaryTarget.z = THREE.MathUtils.clamp(
        this.temporaryTarget.z,
        -34,
        34,
      );
    }
    drag.body.velocity
      .subVectors(this.temporaryTarget, drag.targetPosition)
      .divideScalar(deltaTime)
      .clampLength(0, 18);
    drag.targetPosition.copy(this.temporaryTarget);
    this.temporaryConstrainedTarget.copy(this.temporaryTarget);
    const snagged = this.constrainDragTarget(
      drag.body,
      this.temporaryConstrainedTarget,
      drag.previousPosition,
      drag.hoverY,
      snagPoints,
      colliders,
      surfaces,
      playerPosition,
    );
    drag.constrainedPosition.copy(this.temporaryConstrainedTarget);
    drag.body.position.lerp(
      this.temporaryConstrainedTarget,
      snagged ? 0.6 : 0.78,
    );
    drag.body.position.y = drag.hoverY;
    this.temporaryVelocity
      .subVectors(drag.body.position, drag.previousPosition)
      .setY(0)
      .divideScalar(deltaTime)
      .clampLength(0, 9);
    drag.releaseVelocity.lerp(
      this.temporaryVelocity,
      1 - Math.exp(-deltaTime * 16),
    );
    drag.releaseVelocity.clampLength(0, 5.4);
    drag.body.velocity.copy(this.temporaryVelocity);
    this.temporaryOffset.subVectors(
      this.temporaryTarget,
      drag.body.position,
    );
    this.temporaryOffset.addScaledVector(drag.body.velocity, 0.032);
    const stretchAmount = Math.min(2.6, this.temporaryOffset.length());
    if (stretchAmount > 0.001) {
      this.temporaryOffset.clampLength(0, 2.6);
      this.temporaryQuaternionB.setFromEuler(drag.body.rotation).invert();
      this.temporaryOffset.applyQuaternion(this.temporaryQuaternionB);
      drag.body.dragStretchLocal.lerp(this.temporaryOffset, 0.46);
      drag.body.stretchStrength = THREE.MathUtils.lerp(
        drag.body.stretchStrength,
        THREE.MathUtils.smoothstep(stretchAmount, 0.08, 0.72),
        0.48,
      );
    } else {
      drag.body.dragStretchLocal.multiplyScalar(0.68);
      drag.body.stretchStrength *= 0.72;
    }
    if (snagged && this.temporaryCollisionNormal.lengthSq() > 0.001) {
      this.temporaryVelocity
        .subVectors(
          this.temporaryConstrainedTarget,
          drag.previousPosition,
        )
        .setY(0);
      if (this.temporaryVelocity.lengthSq() > 0.0025) {
        this.rotateDraggedBodyToward(
          drag.body,
          this.temporaryVelocity.x,
          this.temporaryVelocity.z,
          deltaTime,
          12,
        );
        this.syncDragGrabOffset(drag);
      }
      this.temporaryQuaternionB.setFromEuler(drag.body.rotation).invert();
      this.temporaryCollisionNormalLocal
        .copy(this.temporaryCollisionNormal)
        .applyQuaternion(this.temporaryQuaternionB)
        .setZ(0);
      if (this.temporaryCollisionNormalLocal.lengthSq() > 0.001) {
        this.temporaryCollisionNormalLocal.normalize();
        if (
          drag.body.collisionNormalLocal.lengthSq() < 0.001 ||
          drag.body.collisionNormalLocal.dot(
            this.temporaryCollisionNormalLocal,
          ) < -0.2
        ) {
          drag.body.collisionNormalLocal.copy(
            this.temporaryCollisionNormalLocal,
          );
        } else {
          drag.body.collisionNormalLocal
            .lerp(this.temporaryCollisionNormalLocal, 0.42)
            .normalize();
        }
      }
      drag.body.snagStrength = THREE.MathUtils.lerp(
        drag.body.snagStrength,
        THREE.MathUtils.clamp(
          0.2 + THREE.MathUtils.smoothstep(stretchAmount, 0.06, 0.9) * 0.8,
          0,
          1,
        ),
        0.44,
      );
    } else {
      drag.body.snagStrength *= 0.68;
    }
    const dragSpeed = drag.body.velocity.length();
    drag.body.stress *= Math.exp(-deltaTime * 0.72);
    if (dragSpeed > 4.2) {
      drag.body.stress +=
        (dragSpeed - 4.2) * deltaTime * 1.65;
      drag.body.impact = Math.max(
        drag.body.impact,
        THREE.MathUtils.clamp(dragSpeed / 18, 0.2, 1),
      );
    }
    if (snagged) {
      drag.body.stress +=
        stretchAmount * deltaTime * 2.8 +
        Math.max(0, dragSpeed - lampSnagTearSpeed) *
          deltaTime *
          0.65;
    }
    if (
      drag.body.tearPlan &&
      ((dragSpeed >= 11.5 && drag.body.stress >= 0.06) ||
        (dragSpeed >= fastDragTearSpeed && drag.body.stress >= 0.18) ||
        (snagged &&
          drag.body.snagStrength >= 0.3 &&
          stretchAmount >= 0.46 &&
          drag.body.stress >= 0.08) ||
        drag.body.stress >= 0.52)
    ) {
      const mainShift = this.tear(
        drag.body,
        drag.body.velocity,
        snagged,
      );
      if (mainShift) {
        drag.grabOffset.add(mainShift);
        drag.targetPosition.add(mainShift);
        drag.constrainedPosition.add(mainShift);
      }
    }
    drag.previousPosition.copy(drag.body.position);
    drag.previousTime = time;
    return true;
  }

  private rotateDraggedBodyToward(
    body: FragmentBody,
    directionX: number,
    directionZ: number,
    delta: number,
    response = 9,
  ): void {
    if (directionX * directionX + directionZ * directionZ < 0.0001) return;
    const targetYaw = Math.atan2(-directionZ, directionX);
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - body.baseRotation.z),
      Math.cos(targetYaw - body.baseRotation.z),
    );
    body.baseRotation.x = -Math.PI / 2;
    body.baseRotation.y = 0;
    body.baseRotation.z +=
      yawDelta * (1 - Math.exp(-delta * response));
    body.rotation.copy(body.baseRotation);
  }

  private syncDragGrabOffset(drag: FragmentDrag): void {
    this.temporaryQuaternion.setFromEuler(drag.body.rotation);
    this.temporaryOffset
      .copy(drag.body.grabLocal)
      .applyQuaternion(this.temporaryQuaternion);
    drag.grabOffset.set(
      -this.temporaryOffset.x,
      0,
      -this.temporaryOffset.z,
    );
  }

  private constrainDragTarget(
    body: FragmentBody,
    target: THREE.Vector3,
    previousPosition: THREE.Vector3,
    hoverY: number,
    snagPoints: readonly SnagPoint[],
    colliders: readonly AmbientGridDragCollider[],
    surfaces: readonly AmbientGridDragSurface[],
    playerPosition: THREE.Vector3,
  ): boolean {
    let collided = false;
    // Constrain only the knot beneath the pointer. Treating the full authored
    // rectangle as a rigid footprint stopped it before a visible strand could
    // reach a prop, so the node solver never had an opportunity to drape.
    const footprintHalfWidth = 0.14;
    const footprintHalfDepth = 0.14;
    this.temporaryQuaternion.setFromEuler(body.rotation);
    this.temporaryOffset
      .copy(body.grabLocal)
      .applyQuaternion(this.temporaryQuaternion);
    const gripY = hoverY + this.temporaryOffset.y;
    this.temporaryDragDesired
      .copy(target)
      .add(this.temporaryOffset)
      .setY(gripY);
    this.temporaryDragPosition
      .copy(previousPosition)
      .add(this.temporaryOffset)
      .setY(gripY);
    this.temporaryDragRemaining
      .subVectors(this.temporaryDragDesired, this.temporaryDragPosition)
      .setY(0);
    this.temporaryCollisionNormal.set(0, 0, 0);

    // Two passes are enough for a point swept against a box corner: the first
    // blocks the inward component and the second advances along the free edge.
    for (let pass = 0; pass < 2; pass += 1) {
      if (this.temporaryDragRemaining.lengthSq() < 0.000001) break;
      this.dragSweepHitTime = Number.POSITIVE_INFINITY;
      this.temporarySweepNormal.set(0, 0, 0);

      for (const collider of colliders) {
        const bottom = collider.y - collider.halfHeight;
        const top = collider.y + collider.halfHeight;
        if (gripY < bottom - 0.22 || gripY > top + 0.32) continue;
        this.considerBoxDragCollision(
          this.temporaryDragPosition,
          this.temporaryDragRemaining,
          collider.x - collider.halfWidth - footprintHalfWidth,
          collider.x + collider.halfWidth + footprintHalfWidth,
          collider.z - collider.halfDepth - footprintHalfDepth,
          collider.z + collider.halfDepth + footprintHalfDepth,
        );
      }
      for (const surface of surfaces) {
        if (surface.id.startsWith("ambient-grid-")) continue;
        const surfaceHeight = surface.heightAt(surface.x, surface.z);
        if (surfaceHeight < gripY - 0.3) continue;
        this.considerBoxDragCollision(
          this.temporaryDragPosition,
          this.temporaryDragRemaining,
          surface.x - surface.halfWidth - footprintHalfWidth,
          surface.x + surface.halfWidth + footprintHalfWidth,
          surface.z - surface.halfDepth - footprintHalfDepth,
          surface.z + surface.halfDepth + footprintHalfDepth,
        );
      }
      for (const snag of snagPoints) {
        this.considerFootprintCircleDragCollision(
          this.temporaryDragPosition,
          this.temporaryDragRemaining,
          snag.position.x,
          snag.position.z,
          footprintHalfWidth,
          footprintHalfDepth,
          0.16,
        );
      }
      this.considerFootprintCircleDragCollision(
        this.temporaryDragPosition,
        this.temporaryDragRemaining,
        playerPosition.x,
        playerPosition.z,
        footprintHalfWidth,
        footprintHalfDepth,
        0.52,
      );

      if (!Number.isFinite(this.dragSweepHitTime)) {
        this.temporaryDragPosition.add(this.temporaryDragRemaining);
        this.temporaryDragRemaining.set(0, 0, 0);
        break;
      }

      collided = true;
      const movementLength = Math.max(
        0.001,
        this.temporaryDragRemaining.length(),
      );
      const safeTime = Math.max(
        0,
        this.dragSweepHitTime - 0.014 / movementLength,
      );
      this.temporaryDragPosition.addScaledVector(
        this.temporaryDragRemaining,
        safeTime,
      );
      this.temporaryCollisionNormal.add(this.temporarySweepNormal);
      this.temporaryDragRemaining.multiplyScalar(
        Math.max(0, 1 - this.dragSweepHitTime),
      );
      const inwardMotion = this.temporaryDragRemaining.dot(
        this.temporarySweepNormal,
      );
      if (inwardMotion < 0) {
        this.temporaryDragRemaining.addScaledVector(
          this.temporarySweepNormal,
          -inwardMotion,
        );
      }
      this.temporaryDragRemaining.multiplyScalar(0.985);
      this.temporaryDragPosition.addScaledVector(
        this.temporarySweepNormal,
        0.012,
      );
    }
    target
      .copy(this.temporaryDragPosition)
      .sub(this.temporaryOffset)
      .setY(hoverY);
    if (this.temporaryCollisionNormal.lengthSq() > 0.001) {
      this.temporaryCollisionNormal.normalize();
    }
    return collided;
  }

  /**
   * Sweeps the small rounded grip knot around a circular obstacle. Straight
   * sides plus rounded corners form the exact boundary; the visible remainder
   * is resolved later by the node/segment cloth collision pass.
   */
  private considerFootprintCircleDragCollision(
    start: THREE.Vector3,
    movement: THREE.Vector3,
    centerX: number,
    centerZ: number,
    halfWidth: number,
    halfDepth: number,
    radius: number,
  ): void {
    this.considerVerticalDragBoundary(
      start,
      movement,
      centerX - halfWidth - radius,
      centerZ - halfDepth,
      centerZ + halfDepth,
      -1,
    );
    this.considerVerticalDragBoundary(
      start,
      movement,
      centerX + halfWidth + radius,
      centerZ - halfDepth,
      centerZ + halfDepth,
      1,
    );
    this.considerHorizontalDragBoundary(
      start,
      movement,
      centerZ - halfDepth - radius,
      centerX - halfWidth,
      centerX + halfWidth,
      -1,
    );
    this.considerHorizontalDragBoundary(
      start,
      movement,
      centerZ + halfDepth + radius,
      centerX - halfWidth,
      centerX + halfWidth,
      1,
    );
    for (const sideX of [-1, 1] as const) {
      for (const sideZ of [-1, 1] as const) {
        this.considerCircleDragCollision(
          start,
          movement,
          centerX + sideX * halfWidth,
          centerZ + sideZ * halfDepth,
          radius,
          sideX,
          sideZ,
        );
      }
    }
  }

  private considerVerticalDragBoundary(
    start: THREE.Vector3,
    movement: THREE.Vector3,
    boundaryX: number,
    minimumZ: number,
    maximumZ: number,
    normalX: -1 | 1,
  ): void {
    if (Math.abs(movement.x) < 0.000001) return;
    const hitTime = (boundaryX - start.x) / movement.x;
    if (hitTime < 0 || hitTime > 1) return;
    const hitZ = start.z + movement.z * hitTime;
    if (hitZ < minimumZ || hitZ > maximumZ) return;
    this.recordDragSweepHit(hitTime, normalX, 0, movement);
  }

  private considerHorizontalDragBoundary(
    start: THREE.Vector3,
    movement: THREE.Vector3,
    boundaryZ: number,
    minimumX: number,
    maximumX: number,
    normalZ: -1 | 1,
  ): void {
    if (Math.abs(movement.z) < 0.000001) return;
    const hitTime = (boundaryZ - start.z) / movement.z;
    if (hitTime < 0 || hitTime > 1) return;
    const hitX = start.x + movement.x * hitTime;
    if (hitX < minimumX || hitX > maximumX) return;
    this.recordDragSweepHit(hitTime, 0, normalZ, movement);
  }

  private considerBoxDragCollision(
    start: THREE.Vector3,
    movement: THREE.Vector3,
    minimumX: number,
    maximumX: number,
    minimumZ: number,
    maximumZ: number,
  ): void {
    if (
      start.x > minimumX &&
      start.x < maximumX &&
      start.z > minimumZ &&
      start.z < maximumZ
    ) {
      return;
    }
    let nearX = Number.NEGATIVE_INFINITY;
    let farX = Number.POSITIVE_INFINITY;
    let nearZ = Number.NEGATIVE_INFINITY;
    let farZ = Number.POSITIVE_INFINITY;
    if (Math.abs(movement.x) < 0.000001) {
      if (start.x < minimumX || start.x > maximumX) return;
    } else {
      const first = (minimumX - start.x) / movement.x;
      const second = (maximumX - start.x) / movement.x;
      nearX = Math.min(first, second);
      farX = Math.max(first, second);
    }
    if (Math.abs(movement.z) < 0.000001) {
      if (start.z < minimumZ || start.z > maximumZ) return;
    } else {
      const first = (minimumZ - start.z) / movement.z;
      const second = (maximumZ - start.z) / movement.z;
      nearZ = Math.min(first, second);
      farZ = Math.max(first, second);
    }
    const nearTime = Math.max(nearX, nearZ);
    const farTime = Math.min(farX, farZ);
    if (
      nearTime > farTime ||
      farTime < 0 ||
      nearTime < 0 ||
      nearTime > 1
    ) {
      return;
    }
    const normalX =
      nearX > nearZ ? (movement.x > 0 ? -1 : 1) : 0;
    const normalZ =
      nearZ >= nearX ? (movement.z > 0 ? -1 : 1) : 0;
    this.recordDragSweepHit(
      nearTime,
      normalX,
      normalZ,
      movement,
    );
  }

  private considerCircleDragCollision(
    start: THREE.Vector3,
    movement: THREE.Vector3,
    centerX: number,
    centerZ: number,
    radius: number,
    quadrantX: -1 | 0 | 1 = 0,
    quadrantZ: -1 | 0 | 1 = 0,
  ): void {
    const relativeX = start.x - centerX;
    const relativeZ = start.z - centerZ;
    const radiusSquared = radius * radius;
    const startDistanceSquared =
      relativeX * relativeX + relativeZ * relativeZ;
    if (startDistanceSquared < radiusSquared) {
      const distance = Math.sqrt(startDistanceSquared);
      if (distance < 0.001) return;
      if (
        (quadrantX !== 0 && relativeX * quadrantX < -0.0001) ||
        (quadrantZ !== 0 && relativeZ * quadrantZ < -0.0001)
      ) {
        return;
      }
      this.recordDragSweepHit(
        0,
        relativeX / distance,
        relativeZ / distance,
        movement,
      );
      return;
    }
    const movementLengthSquared =
      movement.x * movement.x + movement.z * movement.z;
    if (movementLengthSquared < 0.000001) return;
    const projection =
      relativeX * movement.x + relativeZ * movement.z;
    const discriminant =
      projection * projection -
      movementLengthSquared * (startDistanceSquared - radiusSquared);
    if (discriminant < 0) return;
    const hitTime =
      (-projection - Math.sqrt(discriminant)) /
      movementLengthSquared;
    if (hitTime < 0 || hitTime > 1) return;
    const hitX = relativeX + movement.x * hitTime;
    const hitZ = relativeZ + movement.z * hitTime;
    if (
      (quadrantX !== 0 && hitX * quadrantX < -0.0001) ||
      (quadrantZ !== 0 && hitZ * quadrantZ < -0.0001)
    ) {
      return;
    }
    const hitLength = Math.max(0.001, Math.hypot(hitX, hitZ));
    this.recordDragSweepHit(
      hitTime,
      hitX / hitLength,
      hitZ / hitLength,
      movement,
    );
  }

  private recordDragSweepHit(
    time: number,
    normalX: number,
    normalZ: number,
    movement: THREE.Vector3,
  ): void {
    if (
      time >= this.dragSweepHitTime ||
      movement.x * normalX + movement.z * normalZ >= -0.000001
    ) {
      return;
    }
    this.dragSweepHitTime = time;
    this.temporarySweepNormal.set(normalX, 0, normalZ);
  }

  releaseDrag(
    pointerId: number,
    time: number,
    landingRegion: AmbientGridLandingRegion | null = null,
  ): boolean {
    const drag = this.drag;
    if (!drag || drag.pointerId !== pointerId) return false;
    if (drag.body.pendingTear && drag.body.tearPlan) {
      const shift = this.tear(
        drag.body,
        drag.body.velocity,
        drag.body.snagStrength > 0.12,
      );
      if (shift) {
        drag.grabOffset.add(shift);
        drag.targetPosition.add(shift);
        drag.constrainedPosition.add(shift);
      }
    }
    const landsOnPlatform =
      landingRegion !== null &&
      this.isInsideLandingRegion(drag.body, landingRegion);
    const releasedEntangled =
      drag.body.entangled || drag.body.snagStrength >= 0.24;
    this.conditionBodyClothForRelease(drag.body);
    if (landsOnPlatform) {
      drag.body.velocity.set(0, 0, 0);
      drag.body.position.y = landingRegion.surfaceY + 0.14;
      // Keep the user's settled orientation. Landing used to zero yaw, which
      // made a rotated/deformed scrap visibly swivel back to its authored pose.
      drag.body.baseRotation.set(
        -Math.PI / 2,
        0,
        drag.body.baseRotation.z,
      );
      drag.body.rotation.copy(drag.body.baseRotation);
      drag.body.angularVelocity.set(0, 0, 0);
      drag.body.landedZone = landingRegion.zone;
    } else if (time - drag.previousTime > 110) {
      drag.body.velocity.set(0, 0, 0);
      drag.body.landedZone = null;
    } else {
      // Release follows the smoothed movement of the held body, not the last
      // solver correction or yaw-adjusted pointer offset.
      drag.body.velocity
        .copy(drag.releaseVelocity)
        .multiplyScalar(0.62)
        .clampLength(0, 3.35);
      drag.body.landedZone = null;
    }
    drag.body.anchor.copy(drag.body.position);
    drag.body.dragStretchLocal.set(0, 0, 0);
    drag.body.stretchStrength = 0;
    drag.body.collisionNormalLocal.set(0, 0, 0);
    drag.body.snagStrength = 0;
    drag.body.entangled = releasedEntangled;
    drag.body.unfurling = false;
    drag.body.unfurlDelay = releasedEntangled ? 0 : 1.05;
    drag.body.clothSettling = true;
    this.drag = null;
    this.setQuality(this.quality);
    this.syncLandingSurface(drag.body);
    return true;
  }

  private isInsideLandingRegion(
    body: FragmentBody,
    region: AmbientGridLandingRegion,
  ): boolean {
    const margin = Math.min(1.2, body.radius * 0.32);
    if (region.kind === "circle") {
      return (
        Math.hypot(body.position.x, body.position.z) <=
        region.radius - margin
      );
    }
    return (
      Math.abs(body.position.x) <= region.halfWidth - margin &&
      Math.abs(body.position.z) <= region.halfDepth - margin
    );
  }

  cancelDrag(): number | null {
    const pointerId = this.drag?.pointerId ?? null;
    if (this.drag) {
      const releasedEntangled =
        this.drag.body.entangled ||
        this.drag.body.snagStrength >= 0.24;
      this.conditionBodyClothForRelease(this.drag.body);
      this.drag.body.velocity.set(0, 0, 0);
      this.drag.body.anchor.copy(this.drag.body.position);
      this.drag.body.landedZone = null;
      this.drag.body.dragStretchLocal.set(0, 0, 0);
      this.drag.body.stretchStrength = 0;
      this.drag.body.collisionNormalLocal.set(0, 0, 0);
      this.drag.body.snagStrength = 0;
      this.drag.body.entangled = releasedEntangled;
      this.drag.body.unfurling = false;
      this.drag.body.unfurlDelay = releasedEntangled ? 0 : 1.05;
      this.drag.body.clothSettling = true;
      this.drag = null;
      this.setQuality(this.quality);
    }
    return pointerId;
  }

  observePointerSweep(
    ray: THREE.Ray,
    camera: THREE.Camera,
    clientX: number,
    clientY: number,
    pointerType: string,
    time: number,
  ): boolean {
    const deltaTime = time - this.previousSweepTime;
    const deltaX = clientX - this.previousSweepX;
    const deltaY = clientY - this.previousSweepY;
    this.previousSweepX = clientX;
    this.previousSweepY = clientY;
    this.previousSweepTime = time;
    if (
      pointerType !== "mouse" ||
      this.drag ||
      deltaTime <= 0 ||
      deltaTime > 140 ||
      time - this.lastSweepTearTime < 650 ||
      Math.hypot(deltaX, deltaY) / deltaTime < fastPointerSweepSpeed
    ) {
      return false;
    }
    const body = this.pickBody(ray);
    if (!body?.tearPlan) return false;

    camera.updateMatrixWorld();
    this.temporaryCameraRight
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .multiplyScalar(deltaX);
    this.temporaryCameraUp
      .setFromMatrixColumn(camera.matrixWorld, 1)
      .multiplyScalar(-deltaY);
    this.temporaryVelocity
      .copy(this.temporaryCameraRight)
      .add(this.temporaryCameraUp)
      .normalize()
      .multiplyScalar(8);
    this.root.getWorldQuaternion(this.temporaryQuaternionB).invert();
    this.temporaryVelocity.applyQuaternion(this.temporaryQuaternionB);
    const torn = this.tear(body, this.temporaryVelocity, false) !== null;
    if (torn) this.lastSweepTearTime = time;
    return torn;
  }

  private tear(
    body: FragmentBody,
    impulse: THREE.Vector3,
    snagged: boolean,
  ): THREE.Vector3 | null {
    const plan = body.tearPlan;
    if (!plan) return null;
    const previousPosition = this.temporaryPointB.copy(body.position);
    this.temporaryQuaternion.setFromEuler(body.rotation);
    const mainDistance = body.grabLocal.distanceToSquared(plan.main.shift);
    const looseDistance = body.grabLocal.distanceToSquared(plan.loose.shift);
    const kept = looseDistance < mainDistance ? plan.loose : plan.main;
    const detached = kept === plan.main ? plan.loose : plan.main;
    const keptShift = kept.shift
      .clone()
      .applyQuaternion(this.temporaryQuaternion);
    const detachedShift = detached.shift
      .clone()
      .applyQuaternion(this.temporaryQuaternion);
    const normalizedImpulse = this.temporaryVelocity
      .copy(impulse)
      .normalize();
    if (normalizedImpulse.lengthSq() < 0.001) {
      normalizedImpulse.set(1, 0, 0);
    }

    body.selectionProxy.visible = false;
    body.landingSurface.x = 1000;
    body.landingSurface.z = 1000;
    body.landingSurface.height = 0;
    const keptSeparation = snagged ? 0.12 : 0.08;
    const detachedSeparation = snagged ? 0.42 : 0.3;
    body.position
      .copy(previousPosition)
      .add(keptShift)
      .addScaledVector(normalizedImpulse, keptSeparation);
    body.anchor.copy(body.position);
    body.pieces = kept.pieces.map(({ piece, offset }) => ({
      piece,
      offset: offset.clone(),
    }));
    body.selectionProxy = kept.proxy;
    body.landingSurface = kept.surface;
    body.selectionProxy.visible = body.visible;
    body.tearPlan = kept.next;
    body.landedZone = null;
    body.stress = 0;
    body.contactStrength *= 0.45;
    body.grabLocal.sub(kept.shift);
    body.dragStretchLocal.set(0, 0, 0);
    body.stretchStrength = 0;
    body.collisionNormalLocal.set(0, 0, 0);
    body.snagStrength = 0;
    body.clothSettling = false;
    body.entangled = false;
    body.unfurling = false;
    body.unfurlDelay = 1.05;
    body.assembling = false;
    body.repairProgress = 0;
    body.pendingTear = false;
    body.radius =
      Math.hypot(
        body.selectionProxy.scale.x,
        body.selectionProxy.scale.y,
      ) * 0.36;
    body.baseRotation.copy(body.rotation);
    body.velocity.addScaledVector(
      normalizedImpulse,
      snagged ? 1.15 : 0.85,
    );
    body.angularVelocity.add(
      this.temporaryOffset.set(
        normalizedImpulse.z * 0.11,
        -normalizedImpulse.x * 0.08,
        0.2,
      ),
    );

    const detachedPosition = previousPosition
      .clone()
      .add(detachedShift)
      .addScaledVector(normalizedImpulse, -detachedSeparation);
    const detachedVelocity = body.velocity
      .clone()
      .multiplyScalar(snagged ? -0.08 : -0.16)
      .addScaledVector(normalizedImpulse, snagged ? -2.25 : -1.9);
    const detachedBody: FragmentBody = {
      familyId: body.familyId,
      pieces: detached.pieces.map(({ piece, offset }) => ({
        piece,
        offset: offset.clone(),
      })),
      selectionProxy: detached.proxy,
      landingSurface: detached.surface,
      tearPlan: detached.next,
      position: detachedPosition,
      anchor: detachedPosition.clone(),
      velocity: detachedVelocity,
      rotation: body.rotation.clone(),
      baseRotation: body.rotation.clone(),
      angularVelocity: new THREE.Vector3(
        -normalizedImpulse.z * 0.28,
        normalizedImpulse.x * 0.22,
        -0.52,
      ),
      phase: body.phase + 1.73,
      driftSpeed: body.driftSpeed * 1.13,
      radius: Math.max(
        0.8,
        Math.hypot(
          detached.proxy.scale.x,
          detached.proxy.scale.y,
        ) * 0.36,
      ),
      detail: body.detail,
      active: true,
      visible: body.visible,
      landedZone: null,
      contactLocal: new THREE.Vector3(),
      contactStrength: 0,
      impact: body.impact * 0.7,
      stress: 0,
      grabLocal: new THREE.Vector3(),
      dragStretchLocal: new THREE.Vector3(),
      stretchStrength: 0,
      collisionNormalLocal: new THREE.Vector3(),
      snagStrength: 0,
      clothSettling: true,
      entangled: false,
      unfurling: false,
      unfurlDelay: 1.05,
      unfurlBoost: 0,
      assembling: false,
      repairProgress: 0,
      pendingTear: false,
    };
    detachedBody.selectionProxy.visible = detachedBody.visible;
    this.fragments.push(detachedBody);
    this.syncSelectionProxy(body);
    this.syncSelectionProxy(detachedBody);
    this.syncLandingSurface(body);
    this.syncLandingSurface(detachedBody);
    return keptShift.addScaledVector(
      normalizedImpulse,
      keptSeparation,
    );
  }

  impactSurface(
    surfaceId: string,
    verticalSpeed: number,
    direction: THREE.Vector3,
  ): boolean {
    const body = this.fragments.find(
      (candidate) =>
        candidate.landedZone === this.currentZone &&
        candidate.landingSurface.id === surfaceId,
    );
    if (!body) return false;
    const strength = THREE.MathUtils.clamp(verticalSpeed, 0, 12);
    body.impact = Math.max(
      body.impact,
      THREE.MathUtils.clamp(0.28 + strength / 9, 0.28, 1),
    );
    body.stress += THREE.MathUtils.clamp(
      0.16 + strength * 0.075,
      0.16,
      0.92,
    );
    if (!body.tearPlan || body.stress < 0.92) return false;
    this.temporaryVelocity.set(
      direction.x,
      Math.max(1.6, strength * 0.38),
      direction.z,
    );
    if (this.temporaryVelocity.lengthSq() < 0.01) {
      this.temporaryVelocity.set(0.8, 1.8, -0.4);
    }
    return this.tear(body, this.temporaryVelocity, false) !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.drag = null;
    this.collapse?.bodies.clear();
    this.collapse = null;
    this.scene.remove(this.root);
    disposeObjectTree(this.root);
    this.fragments.length = 0;
    this.allPieces.length = 0;
    this.landingSurfaces.length = 0;
  }
}
