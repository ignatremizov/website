import * as THREE from "three";
import { addBox } from "../scenePrimitives";
import type {
  MathDynamicBoxCollider,
  MathDynamicJumpSurface,
  MathSpellStage,
  MightymaticaZoneContext,
} from "./types";

type Point = readonly [number, number];
type MutablePoint = [number, number];
type ChocolateCell = readonly [column: number, row: number];

interface ChocolateVisual {
  group: THREE.Group;
  footprint: readonly Point[];
}

interface ChocolatePiece {
  group: THREE.Group;
  current: THREE.Vector3;
  target: THREE.Vector3;
  intact: THREE.Vector3;
  separated: THREE.Vector3;
  rearranged: THREE.Vector3;
  selectionCenter: THREE.Vector3;
  selectionSize: THREE.Vector3;
  footprint: THREE.Vector2[];
  worldFootprint: THREE.Vector2[];
  footprintTriangles: number[][];
  velocity: THREE.Vector3;
  angularVelocity: number;
  held: boolean;
  free: boolean;
  playerCollider: MathDynamicBoxCollider;
  playerSurface: MathDynamicJumpSurface;
}

interface ChocolateOverlap {
  depth: number;
  normalX: number;
  normalZ: number;
}

const puzzleScale = 0.44;
// The recovered source cells are 59 × 38 px. Keeping that exact ratio also
// preserves the almost-square silhouette of the original 5 × 8 bar.
const cellAspect = 59 / 38;
const columns = 5;
const rows = 8;
const cellGrooveInsetX = 0.08;
const cellGrooveInsetZ = 0.1;
const up = new THREE.Vector3(0, 1, 0);
const pieceSnapRadius = 1.45;
const maximumSnapReleaseSpeed = 1.1;
const pieceStackGap = 0.018;
const pieceDragClearance = 0.12;
const pieceSupportCatchDistance = 0.16;
const footprintContactEpsilon = 0.006;
const separatedSeamCollisionMargin = 0.045;
const tableHalfWidth = 2.9;
const tableHalfDepth = 2.35;
const floorRestY = -0.675;
const worldHalfExtent = 15.7;

function createShape(points: readonly Point[]): THREE.Shape {
  const first = points[0] ?? [0, 0];
  const shape = new THREE.Shape();
  shape.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
  shape.closePath();
  return shape;
}

function clipBoundary(
  input: readonly MutablePoint[],
  inside: (point: MutablePoint) => boolean,
  intersect: (start: MutablePoint, end: MutablePoint) => MutablePoint,
): MutablePoint[] {
  if (input.length === 0) return [];
  const output: MutablePoint[] = [];
  let start = input[input.length - 1]!;
  for (const end of input) {
    const startInside = inside(start);
    const endInside = inside(end);
    if (endInside) {
      if (!startInside) output.push(intersect(start, end));
      output.push(end);
    } else if (startInside) {
      output.push(intersect(start, end));
    }
    start = end;
  }
  return output;
}

function clipPieceToCell(
  points: readonly Point[],
  column: number,
  row: number,
): MutablePoint[] {
  const cellRight = column + 1;
  const cellBottom = row + 1;
  let clipped = points.map(([x, z]): MutablePoint => [x, z]);
  clipped = clipBoundary(
    clipped,
    ([x]) => x >= column,
    (start, end) => {
      const ratio = (column - start[0]) / (end[0] - start[0]);
      return [column, start[1] + (end[1] - start[1]) * ratio];
    },
  );
  clipped = clipBoundary(
    clipped,
    ([x]) => x <= cellRight,
    (start, end) => {
      const ratio = (cellRight - start[0]) / (end[0] - start[0]);
      return [cellRight, start[1] + (end[1] - start[1]) * ratio];
    },
  );
  clipped = clipBoundary(
    clipped,
    ([, z]) => z >= row,
    (start, end) => {
      const ratio = (row - start[1]) / (end[1] - start[1]);
      return [start[0] + (end[0] - start[0]) * ratio, row];
    },
  );
  return clipBoundary(
    clipped,
    ([, z]) => z <= cellBottom,
    (start, end) => {
      const ratio = (cellBottom - start[1]) / (end[1] - start[1]);
      return [start[0] + (end[0] - start[0]) * ratio, cellBottom];
    },
  );
}

function insetChocolatePad(points: readonly MutablePoint[]): MutablePoint[] {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [x, z] of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, z);
    bottom = Math.max(bottom, z);
  }
  const centerX = (left + right) * 0.5;
  const centerZ = (top + bottom) * 0.5;
  const scaleX = 1 - cellGrooveInsetX * 2;
  const scaleZ = 1 - cellGrooveInsetZ * 2;
  return points.map(([x, z]) => [
    centerX + (x - centerX) * scaleX,
    centerZ + (z - centerZ) * scaleZ,
  ]);
}

function createPiece(
  points: readonly Point[],
  cells: readonly ChocolateCell[],
  color: number,
  name: string,
): ChocolateVisual {
  const piece = new THREE.Group();
  piece.name = name;

  const geometry = new THREE.ExtrudeGeometry(createShape(points), {
    depth: 0.18,
    steps: 1,
    bevelEnabled: false,
  });
  const capMaterial = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const sideMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(0.58),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const base = new THREE.Mesh(geometry, [capMaterial, sideMaterial]);
  base.position.y = 0.29;
  base.rotation.x = Math.PI / 2;
  base.castShadow = true;
  piece.add(base);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 24),
    new THREE.LineBasicMaterial({
      color: 0xf3a54b,
      transparent: true,
      opacity: 0.72,
      toneMapped: false,
    }),
  );
  outline.position.copy(base.position);
  outline.rotation.copy(base.rotation);
  outline.renderOrder = 3;
  piece.add(outline);

  const padShapes = cells
    .map(([column, row]) => clipPieceToCell(points, column, row))
    .filter((pad) => pad.length >= 3)
    .map((pad) => insetChocolatePad(pad))
    .map((pad) => createShape(pad));
  const padGeometry = new THREE.ExtrudeGeometry(padShapes, {
    depth: 0.075,
    steps: 1,
    bevelEnabled: false,
  });
  const pads = new THREE.Mesh(
    padGeometry,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0xd9832f), 0.28),
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  pads.name = `${name}-raised-squares`;
  pads.position.y = 0.375;
  pads.rotation.x = Math.PI / 2;
  pads.castShadow = true;
  piece.add(pads);

  const padOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(padGeometry, 24),
    new THREE.LineBasicMaterial({
      color: 0xf7b665,
      transparent: true,
      opacity: 0.48,
      toneMapped: false,
    }),
  );
  padOutline.position.copy(pads.position);
  padOutline.rotation.copy(pads.rotation);
  padOutline.renderOrder = 4;
  piece.add(padOutline);
  return { group: piece, footprint: points };
}

function point(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

function getPieceCells(): {
  bonus: ChocolateCell[];
  strip: ChocolateCell[];
  upper: ChocolateCell[];
  lower: ChocolateCell[];
} {
  const bonus: ChocolateCell[] = [];
  const strip: ChocolateCell[] = [];
  const upper: ChocolateCell[] = [];
  const lower: ChocolateCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (column === 0 && row === 0) {
        bonus.push([column, row]);
        continue;
      }
      if (column === 0 && row < 6) {
        strip.push([column, row]);
        continue;
      }
      if (column > 0) {
        upper.push([column, row]);
        lower.push([column, row]);
        continue;
      }
      if (row >= 6) lower.push([column, row]);
    }
  }
  return { bonus, strip, upper, lower };
}

export class InfiniteChocolateExhibit {
  private readonly context: MightymaticaZoneContext;
  private readonly group = new THREE.Group();
  private readonly board = new THREE.Group();
  private readonly pieces: ChocolatePiece[] = [];
  private readonly dragProxy: THREE.InstancedMesh;
  private readonly dragDummy = new THREE.Object3D();
  private readonly dragLocalPoint = new THREE.Vector3();
  private readonly dragWorldOrigin = new THREE.Vector3();
  private readonly dragWorldEnd = new THREE.Vector3();
  private readonly selectionOffset = new THREE.Vector3();
  private readonly playerWorldPosition = new THREE.Vector3();
  private readonly pieceWorldPosition = new THREE.Vector3();
  private readonly worldImpulse = new THREE.Vector3();
  private readonly impulseVelocity = new THREE.Vector3();
  private readonly overlapScratch: ChocolateOverlap = {
    depth: 0,
    normalX: 0,
    normalZ: 0,
  };
  private readonly collisionAxes = new Float32Array(8);
  private readonly cutMaterial: THREE.LineBasicMaterial;
  private readonly seamMaterial: THREE.MeshBasicMaterial;
  private readonly bonusGlowMaterial: THREE.MeshBasicMaterial;
  private phase = 0;
  private moving = false;

  constructor(context: MightymaticaZoneContext) {
    this.context = context;
    this.group.name = "chocolate-out-of-nothing-table";
    this.group.position.set(-7.35, 0, 6.35);
    context.root.add(this.group);
    addBox(
      this.group,
      [tableHalfWidth * 2, 0.55, tableHalfDepth * 2],
      [0, 0.4, 0],
      new THREE.MeshStandardMaterial({
        color: 0x3b1f2d,
        emissive: 0x160813,
        emissiveIntensity: 0.6,
        roughness: 0.8,
        metalness: 0.12,
      }),
      { castShadow: false },
    );

    this.board.name = "original-five-by-eight-chocolate-cut";
    this.board.position.set(
      -(columns / 2) * puzzleScale * cellAspect,
      0.72,
      -(rows / 2) * puzzleScale,
    );
    this.board.scale.set(
      puzzleScale * cellAspect,
      1,
      puzzleScale,
    );
    this.group.add(this.board);

    const cells = getPieceCells();
    this.addPiece(
      createPiece(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        cells.bonus,
        0xa84d15,
        "chocolate-bonus-square",
      ),
      point(0, 0),
      point(-0.4, -0.38),
      point(5.72, 1.1),
    );
    this.addPiece(
      createPiece(
        [
          [0, 1],
          [1, 1],
          [1, 6],
          [0, 6],
        ],
        cells.strip,
        0x984112,
        "chocolate-five-square-strip",
      ),
      point(0, 0),
      point(-0.48, 0.1),
      // Align the strip exactly with the reconstructed bar's top-right edge.
      point(4, -1),
    );
    this.addPiece(
      createPiece(
        [
          [1, 0],
          [5, 0],
          [5, 5],
          [1, 6],
        ],
        cells.upper,
        0x82350f,
        "chocolate-four-column-diagonal",
      ),
      point(0, 0),
      point(0.34, -0.34),
      // The shifted slab remains flush with the top and left outer edges.
      point(-1, 0),
    );
    this.addPiece(
      createPiece(
        [
          [0, 6],
          [1, 6],
          [5, 5],
          [5, 8],
          [0, 8],
        ],
        cells.lower,
        0x71300f,
        "chocolate-lower-diagonal",
      ),
      point(0, 0),
      point(0.2, 0.42),
      point(0, 0),
    );

    const dragMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    dragMaterial.colorWrite = false;
    this.dragProxy = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      dragMaterial,
      this.pieces.length,
    );
    this.dragProxy.name = "chocolate-piece-drag-proxies";
    this.dragProxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dragProxy.frustumCulled = false;
    // InstancedMesh caches its first computed broad-phase sphere. The pieces
    // roam well beyond their initial tabletop instances, so keep that cheap
    // broad phase large and let the four per-instance boxes do precise picking.
    this.dragProxy.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      worldHalfExtent * 3,
    );
    this.group.add(this.dragProxy);
    context.registerInstanceDrag({
      object: this.dragProxy,
      maximumDistance: 10,
      getWorldPosition: (instanceId, target) => {
        const piece = this.pieces[instanceId];
        if (!piece) return target.set(0, -100, 0);
        target.copy(piece.group.position);
        return this.group.localToWorld(target);
      },
      onStart: (instanceId) => {
        const piece = this.pieces[instanceId];
        if (!piece) return;
        piece.held = true;
        piece.free = true;
        piece.velocity.set(0, 0, 0);
        piece.angularVelocity = 0;
        piece.target.copy(piece.current);
      },
      onMove: (instanceId, worldPosition, worldVelocity) => {
        const piece = this.pieces[instanceId];
        if (!piece) return;
        piece.held = true;
        piece.free = true;
        this.dragLocalPoint.copy(worldPosition);
        this.group.worldToLocal(this.dragLocalPoint);
        piece.current.set(
          (this.dragLocalPoint.x - this.board.position.x) /
            this.board.scale.x,
          this.dragLocalPoint.y - this.board.position.y,
          (this.dragLocalPoint.z - this.board.position.z) /
            this.board.scale.z,
        );
        piece.target.copy(piece.current);
        this.copyWorldVelocityToBoard(worldVelocity, piece.velocity);
        this.constrainPieceToWorld(piece);
        const baseRestY = this.getPieceBaseRestY(piece);
        const supportRestY = this.getHighestSupportRestY(piece, false);
        if (supportRestY > baseRestY + pieceStackGap) {
          piece.current.y = Math.max(
            piece.current.y,
            supportRestY + pieceDragClearance,
          );
          piece.target.y = piece.current.y;
        }
        this.syncPieceTransform(piece);
        this.syncDragProxies();
      },
      onEnd: (instanceId, worldVelocity) => {
        const piece = this.pieces[instanceId];
        if (!piece) return;
        piece.held = false;
        this.copyWorldVelocityToBoard(worldVelocity, piece.velocity);
        piece.velocity.clampLength(0, 9);
        const releasePlanarSpeed = Math.hypot(
          worldVelocity.x,
          worldVelocity.z,
        );
        if (
          releasePlanarSpeed <= maximumSnapReleaseSpeed &&
          this.trySnapPiece(piece)
        ) {
          return;
        }
        piece.free = true;
        const planarSpeed = Math.hypot(
          piece.velocity.x,
          piece.velocity.z,
        );
        piece.velocity.y =
          planarSpeed > 1.2
            ? Math.min(1.8, (planarSpeed - 1.2) * 0.18)
            : 0;
        piece.angularVelocity =
          THREE.MathUtils.clamp(
            (piece.velocity.x - piece.velocity.z) * 0.08,
            -1.35,
            1.35,
          );
      },
    });
    this.syncDragProxies();

    const cutGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.43, 1),
      new THREE.Vector3(1, 0.43, 1),
      new THREE.Vector3(1, 0.43, 0),
      new THREE.Vector3(1, 0.43, 6),
      new THREE.Vector3(0, 0.43, 6),
      new THREE.Vector3(1, 0.43, 6),
      new THREE.Vector3(1, 0.43, 6),
      new THREE.Vector3(5, 0.43, 5),
    ]);
    this.cutMaterial = new THREE.LineBasicMaterial({
      color: 0x7ff2f0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    });
    const cuts = new THREE.LineSegments(cutGeometry, this.cutMaterial);
    cuts.name = "original-chocolate-cut-guides";
    cuts.renderOrder = 5;
    this.board.add(cuts);

    this.seamMaterial = new THREE.MeshBasicMaterial({
      color: 0x7b3412,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const seamUnderlay = new THREE.Mesh(
      new THREE.ShapeGeometry(
        createShape([
          [0, 6],
          [1, 6],
          [5, 5],
          [4, 5],
        ]),
      ),
      this.seamMaterial,
    );
    seamUnderlay.name = "recessed-area-conservation-seam";
    seamUnderlay.position.y = 0.285;
    seamUnderlay.rotation.x = Math.PI / 2;
    seamUnderlay.renderOrder = 1;
    this.board.add(seamUnderlay);

    this.bonusGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd163,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const bonusGlow = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.025, 1.12),
      this.bonusGlowMaterial,
    );
    bonusGlow.name = "apparent-spare-chocolate-glow";
    bonusGlow.position.set(6.22, 0.12, 1.6);
    this.board.add(bonusGlow);

    context.addStaticBox(
      this.group.position.x,
      0.45,
      this.group.position.z,
      tableHalfWidth,
      0.55,
      tableHalfDepth,
      1,
    );
    context.addJumpSurface(
      "math-chocolate-tabletop",
      this.group.position.x,
      this.group.position.z,
      2.8,
      2.25,
      1.02,
      "You land above the five-by-eight bar. Its old cut lines remain exact.",
    );
    context.addInteraction({
      id: "math-chocolate",
      label: "Begin the original 5 × 8 chocolate cut",
      x: this.group.position.x,
      z: this.group.position.z,
      radius: 3.65,
      action: () => this.advance(true),
    });
    this.applyPhase(true);
  }

  update(delta: number): void {
    const follow = this.context.reducedMotion
      ? 1
      : 1 - Math.exp(-delta * 4.6);
    this.moving = false;
    for (const piece of this.pieces) {
      if (piece.held) {
        this.moving = true;
      } else if (piece.free) {
        this.updateFreePiece(piece, delta);
      } else {
        piece.current.lerp(piece.target, follow);
        piece.group.rotation.y = THREE.MathUtils.lerp(
          piece.group.rotation.y,
          0,
          follow,
        );
      }
      this.syncPieceTransform(piece);
      if (piece.current.distanceToSquared(piece.target) > 0.00004) {
        this.moving = true;
      }
    }
    this.resolvePieceCollisions();
    this.syncDragProxies();

    const arrangementStable = this.pieces.every(
      (piece) =>
        !piece.held &&
        !piece.free &&
        piece.current.distanceToSquared(piece.target) < 0.0025 &&
        Math.abs(piece.group.rotation.y) < 0.025,
    );
    const helperVisibility = arrangementStable ? 1 : 0;
    const cutTarget =
      (this.phase === 1
        ? 1
        : this.phase === 3
          ? 0.82
          : this.phase === 2
            ? 0.08
            : 0.16) * helperVisibility;
    const glowTarget =
      (this.phase === 2 || this.phase === 3 ? 0.66 : 0) *
      helperVisibility;
    const seamTarget =
      (this.phase === 2 ? 0.96 : this.phase === 3 ? 0.58 : 0) *
      helperVisibility;
    this.cutMaterial.opacity = THREE.MathUtils.lerp(
      this.cutMaterial.opacity,
      cutTarget,
      follow,
    );
    this.bonusGlowMaterial.opacity = THREE.MathUtils.lerp(
      this.bonusGlowMaterial.opacity,
      glowTarget,
      follow,
    );
    this.seamMaterial.opacity = THREE.MathUtils.lerp(
      this.seamMaterial.opacity,
      seamTarget,
      follow,
    );
    if (
      Math.abs(this.cutMaterial.opacity - cutTarget) > 0.01 ||
      Math.abs(this.bonusGlowMaterial.opacity - glowTarget) > 0.01 ||
      Math.abs(this.seamMaterial.opacity - seamTarget) > 0.01
    ) {
      this.moving = true;
    }
    if (this.moving) this.context.refreshCollisionDebug();
  }

  advance(announce: boolean): void {
    this.phase = (this.phase + 1) % 4;
    this.applyPhase(this.context.reducedMotion);
    const labels = [
      "Begin the original 5 × 8 chocolate cut",
      "Slide the cut chocolate pieces",
      "Inspect the apparent spare square",
      "Reset the chocolate bar",
    ] as const;
    this.context.updateInteractionLabel(
      "math-chocolate",
      labels[this.phase] ?? labels[0],
    );
    if (!announce) return;
    const messages = [
      "The five-by-eight bar returns whole: forty raised squares and Yuri’s original four-part cut.",
      "One square, a five-square strip, and two shallow diagonal slabs separate along the recovered Chocolate out of nothing construction.",
      "The slabs close ranks while the loose square remains beside the bar. The same five-by-eight grid now appears to contain a forty-first piece.",
      "Nothing multiplied. The shifted diagonal is not perfectly straight: one square’s area is spread through its tiny kink and the slightly narrower groove.",
    ] as const;
    this.context.onStatus(
      messages[this.phase] ?? messages[0],
      this.phase === 2
        ? { kind: "achievement", title: "FREE LUNCH" }
        : undefined,
    );
  }

  hasActiveMotion(): boolean {
    return !this.context.reducedMotion && this.moving;
  }

  applySpellImpulse(stage: MathSpellStage, charge: number): number {
    this.context.copyPlayerPosition(this.playerWorldPosition);
    this.group.updateWorldMatrix(true, false);
    const stageStrength =
      stage === "thunder" ? 5.8 : stage === "surge" ? 4.3 : 2.8;
    const impulse = stageStrength * (0.72 + charge * 0.38);
    const radius =
      (stage === "thunder" ? 8.4 : stage === "surge" ? 6.4 : 4.6) *
      (0.85 + charge * 0.25);
    let affected = 0;
    for (const [index, piece] of this.pieces.entries()) {
      if (piece.held) continue;
      this.pieceWorldPosition
        .copy(piece.selectionCenter)
        .applyAxisAngle(up, piece.group.rotation.y)
        .add(piece.group.position);
      this.group.localToWorld(this.pieceWorldPosition);
      let directionX =
        this.pieceWorldPosition.x - this.playerWorldPosition.x;
      let directionZ =
        this.pieceWorldPosition.z - this.playerWorldPosition.z;
      let directionLength = Math.hypot(directionX, directionZ);
      if (directionLength > radius) continue;
      if (directionLength < 0.08) {
        const fallbackAngle = index * 2.17 + this.phase * 0.71;
        directionX = Math.cos(fallbackAngle);
        directionZ = Math.sin(fallbackAngle);
        directionLength = 1;
      }
      directionX /= directionLength;
      directionZ /= directionLength;
      const proximity =
        1 -
        THREE.MathUtils.smoothstep(directionLength, radius * 0.22, radius);
      const spread = 0.82 + ((index * 37 + this.phase * 11) % 17) / 40;
      const localImpulse = impulse * spread * (0.28 + proximity * 0.72);
      this.worldImpulse.set(
        directionX * localImpulse,
        0.9 + localImpulse * 0.28 + index * 0.06,
        directionZ * localImpulse,
      );
      this.copyWorldVelocityToBoard(
        this.worldImpulse,
        this.impulseVelocity,
      );
      piece.free = true;
      piece.target.copy(piece.current);
      piece.velocity.x += this.impulseVelocity.x;
      piece.velocity.z += this.impulseVelocity.z;
      piece.velocity.y = Math.max(
        piece.velocity.y,
        this.impulseVelocity.y,
      );
      piece.angularVelocity +=
        (index % 2 === 0 ? 1 : -1) *
        (0.38 + localImpulse * 0.075);
      affected += 1;
    }
    if (affected > 0) this.moving = true;
    return affected;
  }

  private addPiece(
    pieceVisual: ChocolateVisual,
    intact: THREE.Vector3,
    separated: THREE.Vector3,
    rearranged: THREE.Vector3,
  ): void {
    const visual = pieceVisual.group;
    // The board uses a non-uniform X/Z scale to preserve the source cell ratio.
    // Bake that scale below a uniformly transformed wrapper so rotating a loose
    // slab cannot shear its geometry.
    const group = new THREE.Group();
    group.name = visual.name;
    visual.name = `${visual.name}-scaled-geometry`;
    visual.scale.set(this.board.scale.x, 1, this.board.scale.z);
    group.add(visual);
    group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(group);
    this.group.add(group);
    const footprint = pieceVisual.footprint.map(
      ([x, z]) =>
        new THREE.Vector2(
          x * this.board.scale.x,
          z * this.board.scale.z,
        ),
    );
    const playerCollider: MathDynamicBoxCollider = {
      x: 0,
      y: 0,
      z: 0,
      halfWidth: 0.1,
      halfHeight: 0.1,
      halfDepth: 0.1,
      clearAbove: 0.2,
      solidTop: 0.2,
      enabled: true,
    };
    const playerSurface: MathDynamicJumpSurface = {
      id: `${group.name}-top`,
      x: 0,
      z: 0,
      halfWidth: 0.1,
      halfDepth: 0.1,
      height: 0.2,
      supportMargin: 0.08,
      debugResolution: 6,
      enabled: true,
    };
    const piece: ChocolatePiece = {
      group,
      current: intact.clone(),
      target: intact.clone(),
      intact,
      separated,
      rearranged,
      selectionCenter: bounds.getCenter(new THREE.Vector3()),
      selectionSize: bounds.getSize(new THREE.Vector3()),
      footprint,
      worldFootprint: pieceVisual.footprint.map(
        () => new THREE.Vector2(),
      ),
      footprintTriangles: THREE.ShapeUtils.triangulateShape(
        footprint,
        [],
      ),
      velocity: new THREE.Vector3(),
      angularVelocity: 0,
      held: false,
      free: false,
      playerCollider,
      playerSurface,
    };
    playerCollider.intersectsHorizontal = (x, z, radius) => {
      // The authored separated arrangement has several narrow but visibly
      // open seams. Expanding every neighboring footprint by the avatar's
      // full radius closes those seams into collision pockets. Keep the
      // chocolate itself solid, but use centre-line clearance through those
      // scripted channels; freely moved pieces retain normal body clearance.
      const margin =
        this.phase === 1 && !piece.free && !piece.held
          ? Math.min(radius, separatedSeamCollisionMargin)
          : radius;
      return this.pieceSupportsWorldPoint(piece, x, z, margin);
    };
    playerSurface.contains = (x, z, margin) =>
      this.pieceSupportsWorldPoint(piece, x, z, margin);
    this.context.registerDynamicBox(playerCollider);
    this.context.registerDynamicJumpSurface(playerSurface);
    this.pieces.push(piece);
    this.syncPieceTransform(piece);
  }

  private syncPieceTransform(piece: ChocolatePiece): void {
    piece.group.position.set(
      this.board.position.x + piece.current.x * this.board.scale.x,
      this.board.position.y + piece.current.y,
      this.board.position.z + piece.current.z * this.board.scale.z,
    );
    this.syncPiecePlayerCollision(piece);
  }

  private syncPiecePlayerCollision(piece: ChocolatePiece): void {
    const cosine = Math.abs(Math.cos(piece.group.rotation.y));
    const sine = Math.abs(Math.sin(piece.group.rotation.y));
    const halfWidth =
      (piece.selectionSize.x * cosine + piece.selectionSize.z * sine) * 0.5;
    const halfDepth =
      (piece.selectionSize.z * cosine + piece.selectionSize.x * sine) * 0.5;
    this.selectionOffset
      .copy(piece.selectionCenter)
      .applyAxisAngle(up, piece.group.rotation.y);
    const centerX =
      this.group.position.x +
      piece.group.position.x +
      this.selectionOffset.x;
    const centerY =
      this.group.position.y +
      piece.group.position.y +
      piece.selectionCenter.y;
    const centerZ =
      this.group.position.z +
      piece.group.position.z +
      this.selectionOffset.z;
    const halfHeight = Math.max(0.025, piece.selectionSize.y * 0.5);
    const top = centerY + halfHeight;

    piece.playerCollider.x = centerX;
    piece.playerCollider.y = centerY;
    piece.playerCollider.z = centerZ;
    piece.playerCollider.halfWidth = halfWidth;
    piece.playerCollider.halfHeight = halfHeight;
    piece.playerCollider.halfDepth = halfDepth;
    piece.playerCollider.clearAbove = top;
    piece.playerCollider.solidTop = top;

    piece.playerSurface.x = centerX;
    piece.playerSurface.z = centerZ;
    piece.playerSurface.halfWidth = halfWidth;
    piece.playerSurface.halfDepth = halfDepth;
    piece.playerSurface.height = top;
    this.updatePieceWorldFootprint(piece);
  }

  private pieceSupportsWorldPoint(
    piece: ChocolatePiece,
    worldX: number,
    worldZ: number,
    margin: number,
  ): boolean {
    const x = worldX - this.group.position.x;
    const z = worldZ - this.group.position.z;
    const footprint = piece.worldFootprint;
    let inside = false;
    for (
      let current = 0, previous = footprint.length - 1;
      current < footprint.length;
      previous = current, current += 1
    ) {
      const start = footprint[previous];
      const end = footprint[current];
      if (!start || !end) continue;
      const crossesRay =
        end.y > z !== start.y > z &&
        x <
          ((start.x - end.x) * (z - end.y)) /
            (start.y - end.y) +
            end.x;
      if (crossesRay) inside = !inside;
    }
    if (inside) return true;
    if (margin <= 0) return false;

    const marginSquared = margin * margin;
    for (
      let current = 0, previous = footprint.length - 1;
      current < footprint.length;
      previous = current, current += 1
    ) {
      const start = footprint[previous];
      const end = footprint[current];
      if (!start || !end) continue;
      const edgeX = end.x - start.x;
      const edgeZ = end.y - start.y;
      const edgeLengthSquared = edgeX * edgeX + edgeZ * edgeZ;
      const progress =
        edgeLengthSquared > 0.000001
          ? THREE.MathUtils.clamp(
              ((x - start.x) * edgeX + (z - start.y) * edgeZ) /
                edgeLengthSquared,
              0,
              1,
            )
          : 0;
      const nearestX = start.x + edgeX * progress;
      const nearestZ = start.y + edgeZ * progress;
      if (
        (x - nearestX) ** 2 + (z - nearestZ) ** 2 <=
        marginSquared
      ) {
        return true;
      }
    }
    return false;
  }

  private applyPhase(snap: boolean): void {
    for (const piece of this.pieces) {
      piece.held = false;
      piece.free = false;
      piece.velocity.set(0, 0, 0);
      piece.angularVelocity = 0;
      const target =
        this.getPhaseTarget(piece);
      piece.target.copy(target);
      if (snap) {
        piece.current.copy(target);
        this.syncPieceTransform(piece);
        piece.group.rotation.y = 0;
      }
    }
    this.syncDragProxies();
    if (snap) {
      this.cutMaterial.opacity =
        this.phase === 1
          ? 1
          : this.phase === 3
            ? 0.82
            : this.phase === 2
              ? 0.08
              : 0.16;
      this.bonusGlowMaterial.opacity =
        this.phase === 2 || this.phase === 3 ? 0.66 : 0;
      this.seamMaterial.opacity =
        this.phase === 2 ? 0.96 : this.phase === 3 ? 0.58 : 0;
      this.context.refreshCollisionDebug();
    }
    this.moving = !snap;
  }

  private getPhaseTarget(piece: ChocolatePiece): THREE.Vector3 {
    return this.phase === 0
      ? piece.intact
      : this.phase === 1
        ? piece.separated
        : piece.rearranged;
  }

  private trySnapPiece(piece: ChocolatePiece): boolean {
    const intended = this.getPhaseTarget(piece);
    if (
      piece.current.y > 1.25 ||
      Math.hypot(
        piece.current.x - intended.x,
        piece.current.z - intended.z,
      ) > pieceSnapRadius
    ) {
      return false;
    }
    const baseRestY = this.getPieceBaseRestY(piece);
    if (
      this.getHighestSupportRestY(piece, false) >
      baseRestY + pieceStackGap
    ) {
      return false;
    }
    piece.free = false;
    piece.velocity.set(0, 0, 0);
    piece.angularVelocity = 0;
    piece.target.copy(intended);
    this.moving = true;
    return true;
  }

  private copyWorldVelocityToBoard(
    worldVelocity: THREE.Vector3,
    target: THREE.Vector3,
  ): void {
    this.board.updateWorldMatrix(true, false);
    this.dragWorldOrigin.setFromMatrixPosition(this.board.matrixWorld);
    this.dragWorldEnd
      .copy(this.dragWorldOrigin)
      .add(worldVelocity);
    this.board.worldToLocal(this.dragWorldOrigin);
    this.board.worldToLocal(this.dragWorldEnd);
    target.subVectors(this.dragWorldEnd, this.dragWorldOrigin);
  }

  private updateFreePiece(piece: ChocolatePiece, delta: number): void {
    const stepCount = Math.max(1, Math.ceil(delta / (1 / 90)));
    const stepDelta = delta / stepCount;
    let airborne = false;
    for (let step = 0; step < stepCount; step += 1) {
      piece.current.addScaledVector(piece.velocity, stepDelta);
      piece.velocity.y -= 5.4 * stepDelta;
      piece.group.rotation.y += piece.angularVelocity * stepDelta;
      this.constrainPieceToWorld(piece);
      const restY = this.getPieceRestY(piece);
      airborne ||= piece.current.y > restY || piece.velocity.y > 0;
      if (piece.current.y <= restY) {
        piece.current.y = restY;
        piece.velocity.y =
          Math.abs(piece.velocity.y) > 0.62
            ? Math.abs(piece.velocity.y) * 0.18
            : 0;
        const friction = Math.exp(-stepDelta * 2.45);
        piece.velocity.x *= friction;
        piece.velocity.z *= friction;
        piece.angularVelocity *= Math.exp(-stepDelta * 3.4);
      } else {
        const airDrag = Math.exp(-stepDelta * 0.48);
        piece.velocity.x *= airDrag;
        piece.velocity.z *= airDrag;
        piece.angularVelocity *= Math.exp(-stepDelta * 0.75);
      }
    }
    piece.target.copy(piece.current);
    if (
      airborne ||
      piece.velocity.lengthSq() > 0.0025 ||
      Math.abs(piece.angularVelocity) > 0.025
    ) {
      this.moving = true;
    } else {
      piece.velocity.set(0, 0, 0);
      piece.angularVelocity = 0;
    }
  }

  private resolvePieceCollisions(): void {
    // Four pieces produce only six pairs. Two passes are enough to separate a
    // small pile without introducing a general-purpose physics dependency.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let first = 0; first < this.pieces.length; first += 1) {
        for (let second = first + 1; second < this.pieces.length; second += 1) {
          const left = this.pieces[first];
          const right = this.pieces[second];
          if (!left || !right || (!left.free && !left.held && !right.free && !right.held)) {
            continue;
          }
          this.resolvePiecePair(left, right);
        }
      }
    }
  }

  private resolvePiecePair(
    left: ChocolatePiece,
    right: ChocolatePiece,
  ): void {
    if (!this.measureHorizontalOverlap(left, right, this.overlapScratch)) {
      return;
    }
    const leftCenterY = left.current.y + left.selectionCenter.y;
    const rightCenterY = right.current.y + right.selectionCenter.y;
    const verticalDistance = Math.abs(rightCenterY - leftCenterY);
    const combinedHalfHeight =
      (left.selectionSize.y + right.selectionSize.y) * 0.5;
    const verticalOverlap = combinedHalfHeight - verticalDistance;
    if (verticalOverlap <= 0) return;

    const upper = rightCenterY >= leftCenterY ? right : left;
    const lower = upper === right ? left : right;
    if (
      !upper.held &&
      verticalDistance > combinedHalfHeight * 0.34
    ) {
      const lowerTop =
        lower.current.y +
        lower.selectionCenter.y +
        lower.selectionSize.y * 0.5;
      const upperBottomOffset =
        upper.selectionCenter.y - upper.selectionSize.y * 0.5;
      upper.current.y =
        lowerTop - upperBottomOffset + pieceStackGap;
      upper.target.copy(upper.current);
      upper.free = true;
      upper.velocity.y = Math.max(0, lower.velocity.y * 0.35);
      upper.velocity.x *= 0.82;
      upper.velocity.z *= 0.82;
      upper.angularVelocity *= 0.78;
      this.syncPieceTransform(upper);
      this.moving = true;
      return;
    }

    const minimumOverlap = this.overlapScratch.depth;
    const normalX = this.overlapScratch.normalX;
    const normalZ = this.overlapScratch.normalZ;

    if (!left.free && !left.held) {
      left.free = true;
      left.target.copy(left.current);
    }
    if (!right.free && !right.held) {
      right.free = true;
      right.target.copy(right.current);
    }
    const leftInverseMass = left.held
      ? 0.025
      : 1 / Math.max(0.3, left.selectionSize.x * left.selectionSize.z);
    const rightInverseMass = right.held
      ? 0.025
      : 1 / Math.max(0.3, right.selectionSize.x * right.selectionSize.z);
    const inverseMassTotal = leftInverseMass + rightInverseMass;
    const leftShare = leftInverseMass / inverseMassTotal;
    const rightShare = rightInverseMass / inverseMassTotal;
    const correction = minimumOverlap + 0.018;
    left.current.x -=
      (normalX * correction * leftShare) / this.board.scale.x;
    left.current.z -=
      (normalZ * correction * leftShare) / this.board.scale.z;
    right.current.x +=
      (normalX * correction * rightShare) / this.board.scale.x;
    right.current.z +=
      (normalZ * correction * rightShare) / this.board.scale.z;

    const leftVelocityX = left.velocity.x * this.board.scale.x;
    const leftVelocityZ = left.velocity.z * this.board.scale.z;
    const rightVelocityX = right.velocity.x * this.board.scale.x;
    const rightVelocityZ = right.velocity.z * this.board.scale.z;
    const relativeNormalSpeed =
      (rightVelocityX - leftVelocityX) * normalX +
      (rightVelocityZ - leftVelocityZ) * normalZ;
    if (relativeNormalSpeed < 0) {
      const impulse =
        (-(1 + 0.2) * relativeNormalSpeed) / inverseMassTotal;
      left.velocity.x -=
        (normalX * impulse * leftInverseMass) / this.board.scale.x;
      left.velocity.z -=
        (normalZ * impulse * leftInverseMass) / this.board.scale.z;
      right.velocity.x +=
        (normalX * impulse * rightInverseMass) / this.board.scale.x;
      right.velocity.z +=
        (normalZ * impulse * rightInverseMass) / this.board.scale.z;
      const tangentSpeed =
        (rightVelocityX - leftVelocityX) * -normalZ +
        (rightVelocityZ - leftVelocityZ) * normalX;
      const spin = THREE.MathUtils.clamp(tangentSpeed * 0.035, -0.3, 0.3);
      left.angularVelocity -= spin * rightShare;
      right.angularVelocity += spin * leftShare;
    }
    left.target.copy(left.current);
    right.target.copy(right.current);
    this.syncPieceTransform(left);
    this.syncPieceTransform(right);
    this.moving = true;
  }

  private measureHorizontalOverlap(
    left: ChocolatePiece,
    right: ChocolatePiece,
    result: ChocolateOverlap,
  ): boolean {
    this.updatePieceWorldFootprint(left);
    this.updatePieceWorldFootprint(right);
    if (!this.footprintsIntersect(left, right)) return false;

    const leftCosine = Math.cos(left.group.rotation.y);
    const leftSine = Math.sin(left.group.rotation.y);
    const rightCosine = Math.cos(right.group.rotation.y);
    const rightSine = Math.sin(right.group.rotation.y);
    const leftCenterX =
      this.board.position.x +
      left.current.x * this.board.scale.x +
      left.selectionCenter.x * leftCosine +
      left.selectionCenter.z * leftSine;
    const leftCenterZ =
      this.board.position.z +
      left.current.z * this.board.scale.z -
      left.selectionCenter.x * leftSine +
      left.selectionCenter.z * leftCosine;
    const rightCenterX =
      this.board.position.x +
      right.current.x * this.board.scale.x +
      right.selectionCenter.x * rightCosine +
      right.selectionCenter.z * rightSine;
    const rightCenterZ =
      this.board.position.z +
      right.current.z * this.board.scale.z -
      right.selectionCenter.x * rightSine +
      right.selectionCenter.z * rightCosine;
    const centerDeltaX = rightCenterX - leftCenterX;
    const centerDeltaZ = rightCenterZ - leftCenterZ;
    const leftHalfX = left.selectionSize.x * 0.5;
    const leftHalfZ = left.selectionSize.z * 0.5;
    const rightHalfX = right.selectionSize.x * 0.5;
    const rightHalfZ = right.selectionSize.z * 0.5;
    this.collisionAxes[0] = leftCosine;
    this.collisionAxes[1] = -leftSine;
    this.collisionAxes[2] = leftSine;
    this.collisionAxes[3] = leftCosine;
    this.collisionAxes[4] = rightCosine;
    this.collisionAxes[5] = -rightSine;
    this.collisionAxes[6] = rightSine;
    this.collisionAxes[7] = rightCosine;
    result.depth = Number.POSITIVE_INFINITY;
    result.normalX = 0;
    result.normalZ = 0;
    for (let index = 0; index < this.collisionAxes.length; index += 2) {
      const axisX = this.collisionAxes[index] ?? 0;
      const axisZ = this.collisionAxes[index + 1] ?? 0;
      const overlap = this.getPieceAxisOverlap(
        centerDeltaX,
        centerDeltaZ,
        axisX,
        axisZ,
        leftCosine,
        leftSine,
        leftHalfX,
        leftHalfZ,
        rightCosine,
        rightSine,
        rightHalfX,
        rightHalfZ,
      );
      if (overlap <= 0) return false;
      if (overlap < result.depth) {
        const direction =
          centerDeltaX * axisX + centerDeltaZ * axisZ >= 0 ? 1 : -1;
        result.depth = overlap;
        result.normalX = axisX * direction;
        result.normalZ = axisZ * direction;
      }
    }
    return true;
  }

  private updatePieceWorldFootprint(piece: ChocolatePiece): void {
    const cosine = Math.cos(piece.group.rotation.y);
    const sine = Math.sin(piece.group.rotation.y);
    const baseX =
      this.board.position.x + piece.current.x * this.board.scale.x;
    const baseZ =
      this.board.position.z + piece.current.z * this.board.scale.z;
    for (const [index, point] of piece.footprint.entries()) {
      const target = piece.worldFootprint[index];
      if (!target) continue;
      target.set(
        baseX + point.x * cosine + point.y * sine,
        baseZ - point.x * sine + point.y * cosine,
      );
    }
  }

  private footprintsIntersect(
    left: ChocolatePiece,
    right: ChocolatePiece,
  ): boolean {
    for (const leftTriangle of left.footprintTriangles) {
      for (const rightTriangle of right.footprintTriangles) {
        if (
          this.trianglesIntersect(
            left.worldFootprint,
            leftTriangle,
            right.worldFootprint,
            rightTriangle,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private trianglesIntersect(
    left: readonly THREE.Vector2[],
    leftTriangle: readonly number[],
    right: readonly THREE.Vector2[],
    rightTriangle: readonly number[],
  ): boolean {
    return (
      this.testTriangleAxes(left, leftTriangle, right, rightTriangle) &&
      this.testTriangleAxes(right, rightTriangle, left, leftTriangle)
    );
  }

  private testTriangleAxes(
    source: readonly THREE.Vector2[],
    sourceTriangle: readonly number[],
    target: readonly THREE.Vector2[],
    targetTriangle: readonly number[],
  ): boolean {
    for (let index = 0; index < 3; index += 1) {
      const start = source[sourceTriangle[index] ?? -1];
      const end = source[sourceTriangle[(index + 1) % 3] ?? -1];
      if (!start || !end) return false;
      const edgeX = end.x - start.x;
      const edgeZ = end.y - start.y;
      const inverseLength = 1 / Math.max(0.0001, Math.hypot(edgeX, edgeZ));
      const axisX = -edgeZ * inverseLength;
      const axisZ = edgeX * inverseLength;
      let leftMinimum = Number.POSITIVE_INFINITY;
      let leftMaximum = Number.NEGATIVE_INFINITY;
      for (const pointIndex of sourceTriangle) {
        const point = source[pointIndex];
        if (!point) return false;
        const projection = point.x * axisX + point.y * axisZ;
        leftMinimum = Math.min(leftMinimum, projection);
        leftMaximum = Math.max(leftMaximum, projection);
      }
      let rightMinimum = Number.POSITIVE_INFINITY;
      let rightMaximum = Number.NEGATIVE_INFINITY;
      for (const pointIndex of targetTriangle) {
        const point = target[pointIndex];
        if (!point) return false;
        const projection = point.x * axisX + point.y * axisZ;
        rightMinimum = Math.min(rightMinimum, projection);
        rightMaximum = Math.max(rightMaximum, projection);
      }
      const overlap =
        Math.min(leftMaximum, rightMaximum) -
        Math.max(leftMinimum, rightMinimum);
      if (overlap <= footprintContactEpsilon) return false;
    }
    return true;
  }

  private getPieceAxisOverlap(
    centerDeltaX: number,
    centerDeltaZ: number,
    axisX: number,
    axisZ: number,
    leftCosine: number,
    leftSine: number,
    leftHalfX: number,
    leftHalfZ: number,
    rightCosine: number,
    rightSine: number,
    rightHalfX: number,
    rightHalfZ: number,
  ): number {
    const leftRadius =
      leftHalfX * Math.abs(axisX * leftCosine - axisZ * leftSine) +
      leftHalfZ * Math.abs(axisX * leftSine + axisZ * leftCosine);
    const rightRadius =
      rightHalfX * Math.abs(axisX * rightCosine - axisZ * rightSine) +
      rightHalfZ * Math.abs(axisX * rightSine + axisZ * rightCosine);
    return (
      leftRadius +
      rightRadius -
      Math.abs(centerDeltaX * axisX + centerDeltaZ * axisZ)
    );
  }

  private getPieceRestY(piece: ChocolatePiece): number {
    return this.getHighestSupportRestY(piece, true);
  }

  private getHighestSupportRestY(
    piece: ChocolatePiece,
    requireSupportBelow: boolean,
  ): number {
    let restY = this.getPieceBaseRestY(piece);
    const pieceCenterY = piece.current.y + piece.selectionCenter.y;
    const pieceBottom =
      pieceCenterY - piece.selectionSize.y * 0.5;
    const pieceBottomOffset =
      piece.selectionCenter.y - piece.selectionSize.y * 0.5;
    for (const support of this.pieces) {
      if (
        support === piece ||
        !this.measureHorizontalOverlap(
          piece,
          support,
          this.overlapScratch,
        )
      ) {
        continue;
      }
      const supportCenterY =
        support.current.y + support.selectionCenter.y;
      const supportTop =
        supportCenterY + support.selectionSize.y * 0.5;
      if (
        requireSupportBelow &&
        (supportCenterY >= pieceCenterY - 0.02 ||
          supportTop > pieceBottom + pieceSupportCatchDistance)
      ) {
        continue;
      }
      restY = Math.max(
        restY,
        supportTop - pieceBottomOffset + pieceStackGap,
      );
    }
    return restY;
  }

  private getPieceBaseRestY(piece: ChocolatePiece): number {
    this.selectionOffset
      .copy(piece.selectionCenter)
      .applyAxisAngle(up, piece.group.rotation.y);
    const centerX =
      this.board.position.x +
      piece.current.x * this.board.scale.x +
      this.selectionOffset.x;
    const centerZ =
      this.board.position.z +
      piece.current.z * this.board.scale.z +
      this.selectionOffset.z;
    return Math.abs(centerX) <= tableHalfWidth &&
      Math.abs(centerZ) <= tableHalfDepth
      ? 0
      : floorRestY;
  }

  private constrainPieceToWorld(piece: ChocolatePiece): void {
    const cosine = Math.abs(Math.cos(piece.group.rotation.y));
    const sine = Math.abs(Math.sin(piece.group.rotation.y));
    const halfWidth =
      (piece.selectionSize.x * cosine + piece.selectionSize.z * sine) *
      0.5;
    const halfDepth =
      (piece.selectionSize.z * cosine + piece.selectionSize.x * sine) *
      0.5;
    this.selectionOffset
      .copy(piece.selectionCenter)
      .applyAxisAngle(up, piece.group.rotation.y);
    const centerX =
      this.group.position.x +
      this.board.position.x +
      piece.current.x * this.board.scale.x +
      this.selectionOffset.x;
    const centerZ =
      this.group.position.z +
      this.board.position.z +
      piece.current.z * this.board.scale.z +
      this.selectionOffset.z;
    if (centerX - halfWidth < -worldHalfExtent) {
      piece.current.x +=
        (-worldHalfExtent - (centerX - halfWidth)) / this.board.scale.x;
      piece.velocity.x = Math.abs(piece.velocity.x) * 0.34;
      piece.angularVelocity *= -0.72;
    } else if (centerX + halfWidth > worldHalfExtent) {
      piece.current.x -=
        (centerX + halfWidth - worldHalfExtent) / this.board.scale.x;
      piece.velocity.x = -Math.abs(piece.velocity.x) * 0.34;
      piece.angularVelocity *= -0.72;
    }
    if (centerZ - halfDepth < -worldHalfExtent) {
      piece.current.z +=
        (-worldHalfExtent - (centerZ - halfDepth)) / this.board.scale.z;
      piece.velocity.z = Math.abs(piece.velocity.z) * 0.34;
      piece.angularVelocity *= -0.72;
    } else if (centerZ + halfDepth > worldHalfExtent) {
      piece.current.z -=
        (centerZ + halfDepth - worldHalfExtent) / this.board.scale.z;
      piece.velocity.z = -Math.abs(piece.velocity.z) * 0.34;
      piece.angularVelocity *= -0.72;
    }
  }

  private syncDragProxies(): void {
    for (const [index, piece] of this.pieces.entries()) {
      this.selectionOffset
        .copy(piece.selectionCenter)
        .applyAxisAngle(up, piece.group.rotation.y);
      this.dragDummy.position
        .copy(piece.group.position)
        .add(this.selectionOffset);
      this.dragDummy.rotation.set(0, piece.group.rotation.y, 0);
      this.dragDummy.scale.set(
        piece.selectionSize.x * 1.03,
        Math.max(0.3, piece.selectionSize.y * 1.18),
        piece.selectionSize.z * 1.03,
      );
      this.dragDummy.updateMatrix();
      this.dragProxy.setMatrixAt(index, this.dragDummy.matrix);
    }
    this.dragProxy.instanceMatrix.needsUpdate = true;
  }
}
