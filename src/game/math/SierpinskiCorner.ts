import * as THREE from "three";
import type { MightymaticaZoneContext } from "./types";

interface CarpetTile {
  x: number;
  z: number;
  size: number;
}

interface CarpetTileTransition {
  x: number;
  z: number;
  color: THREE.Color;
}

const maximumGeneration = 4;
const maximumTiles = 8 ** maximumGeneration;
const maximumCutouts = 8 ** (maximumGeneration - 1);
const baseSize = 3;
const revealDuration = 0.96;

export const sierpinskiFloorPatch = {
  // This is an existing 3 × 3 parent in the northeast floor corner. At the
  // room's normal depth it contains eight one-unit tiles and an empty center.
  x: 12,
  z: 12,
  size: baseSize,
} as const;

export const sierpinskiFloorColors = [
  new THREE.Color(0x9e82ff),
  new THREE.Color(0x55dce8),
  new THREE.Color(0xff5db1),
  new THREE.Color(0xffbd55),
] as const;

export function getSierpinskiFloorColor(
  x: number,
  z: number,
  size: number,
): THREE.Color {
  const safeSize = Math.max(0.0001, size);
  const gridX = Math.round(x / safeSize);
  const gridZ = Math.round(z / safeSize);
  const generation = Math.round(Math.log(27 / safeSize) / Math.log(3));
  const rawIndex = gridX * 3 + gridZ * 5 + generation;
  const index =
    ((rawIndex % sierpinskiFloorColors.length) +
      sierpinskiFloorColors.length) %
    sierpinskiFloorColors.length;
  return sierpinskiFloorColors[index] ?? sierpinskiFloorColors[0];
}

function collectCarpetTiles(
  output: CarpetTile[],
  x: number,
  z: number,
  size: number,
  generation: number,
): void {
  const childSize = size / 3;
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      // Every parent loses its middle square. The rule is applied to every
      // survivor, producing one complete sub-carpet rather than a trail that
      // repeatedly selects only another corner.
      if (offsetX === 0 && offsetZ === 0) continue;
      const childX = x + offsetX * childSize;
      const childZ = z + offsetZ * childSize;
      if (generation <= 1) {
        output.push({
          x: childX,
          z: childZ,
          size: childSize,
        });
      } else {
        collectCarpetTiles(
          output,
          childX,
          childZ,
          childSize,
          generation - 1,
        );
      }
    }
  }
}

export class SierpinskiCorner {
  private readonly context: MightymaticaZoneContext;
  private readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly cutoutMesh: THREE.InstancedMesh;
  private readonly selection: THREE.LineLoop;
  private readonly selectionMaterial: THREE.LineBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly transitionColor = new THREE.Color();
  private tiles: CarpetTile[] = [];
  private tileTransitions: CarpetTileTransition[] = [];
  private cutouts: CarpetTile[] = [];
  private generation = 1;
  private revealAge = revealDuration;

  constructor(
    context: MightymaticaZoneContext,
    floorMaterial: THREE.MeshStandardMaterial,
  ) {
    this.context = context;
    this.group.name = "sierpinski-live-floor-subcarpet";
    this.group.position.set(
      sierpinskiFloorPatch.x,
      0,
      sierpinskiFloorPatch.z,
    );
    context.root.add(this.group);

    // This dynamic mesh uses the same lit material, thickness, elevation, gap,
    // and color rule as the static carpet around it. It is a replaceable part
    // of that floor, not a second black exhibit laid over the corner.
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.08, 1),
      floorMaterial,
      maximumTiles,
    );
    this.mesh.name = "sierpinski-live-floor-tiles";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.cutoutMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.08, 1),
      floorMaterial,
      maximumCutouts,
    );
    this.cutoutMesh.name = "sierpinski-sinking-center-cutouts";
    this.cutoutMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cutoutMesh.castShadow = false;
    this.cutoutMesh.receiveShadow = true;
    this.cutoutMesh.frustumCulled = false;
    this.cutoutMesh.count = 0;
    this.group.add(this.cutoutMesh);

    this.selectionMaterial = new THREE.LineBasicMaterial({
      color: 0xb8fff2,
      transparent: true,
      opacity: 0.68,
      toneMapped: false,
    });
    const half = baseSize / 2;
    const selectionGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(half, 0, half),
      new THREE.Vector3(-half, 0, half),
    ]);
    this.selection = new THREE.LineLoop(
      selectionGeometry,
      this.selectionMaterial,
    );
    this.selection.name = "sierpinski-live-floor-boundary";
    this.selection.position.y = 0.162;
    this.group.add(this.selection);

    context.addInteraction({
      id: "math-sierpinski-corner",
      label: "Deepen the carpet corner · generation 1/4",
      x: this.group.position.x,
      z: this.group.position.z,
      radius: 2.35,
      action: () => this.recurse(),
    });
    this.rebuild();
    this.updateMatrices(1);
  }

  update(delta: number): void {
    if (this.revealAge >= revealDuration) return;
    this.revealAge = Math.min(revealDuration, this.revealAge + delta);
    const progress = this.context.reducedMotion
      ? 1
      : THREE.MathUtils.smoothstep(this.revealAge, 0, revealDuration);
    this.updateMatrices(progress);
  }

  hasActiveMotion(): boolean {
    return !this.context.reducedMotion && this.revealAge < revealDuration;
  }

  private recurse(): void {
    if (this.generation >= maximumGeneration) {
      this.generation = 1;
      this.revealAge = revealDuration;
      this.cutouts = [];
      this.cutoutMesh.count = 0;
      this.rebuild();
      this.updateMatrices(1);
      this.context.updateInteractionLabel(
        "math-sierpinski-corner",
        "Deepen the carpet corner · generation 1/4",
      );
      this.context.onStatus(
        "The corner returns to eight broad floor cells. Its middle remains open.",
      );
      return;
    }

    const previousTiles = this.tiles;
    this.generation += 1;
    this.revealAge = this.context.reducedMotion ? revealDuration : 0;
    this.buildNextGeneration(previousTiles);
    this.prepareCutouts(previousTiles);
    this.updateMatrices(this.context.reducedMotion ? 1 : 0);
    this.context.updateInteractionLabel(
      "math-sierpinski-corner",
      this.generation === maximumGeneration
        ? "Reset the fourth-generation carpet"
        : `Deepen the carpet corner · generation ${this.generation}/4`,
    );

    if (this.generation === maximumGeneration) {
      this.context.onStatus(
        "The whole corner resolves into a fourth-generation sub-carpet: 4,096 surviving cells, with every middle square absent.",
        { kind: "achievement", title: "IT’S NOT CHEESE" },
      );
      return;
    }

    this.context.onStatus(
      `Generation ${this.generation}: every surviving floor cell divides together while its new middle square sinks away.`,
    );
  }

  private rebuild(): void {
    const tiles: CarpetTile[] = [];
    collectCarpetTiles(tiles, 0, 0, baseSize, this.generation);
    this.tiles = tiles;
    this.tileTransitions = tiles.map((tile) => ({
      x: tile.x,
      z: tile.z,
      color: getSierpinskiFloorColor(
        this.group.position.x + tile.x,
        this.group.position.z + tile.z,
        tile.size,
      ),
    }));
    this.mesh.count = tiles.length;
    for (const [index, tile] of tiles.entries()) {
      this.mesh.setColorAt(
        index,
        getSierpinskiFloorColor(
          this.group.position.x + tile.x,
          this.group.position.z + tile.z,
          tile.size,
        ),
      );
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private buildNextGeneration(
    previousTiles: readonly CarpetTile[],
  ): void {
    const tiles: CarpetTile[] = [];
    const transitions: CarpetTileTransition[] = [];
    for (const parent of previousTiles) {
      const childSize = parent.size / 3;
      // Nine compressed cells exactly reconstruct the parent's old 0.88-wide
      // footprint. Their centres then travel to true thirds, growing the
      // carpet into its finer spacing before the middle cell is removed.
      const compressedStep = childSize * 0.88;
      const parentColor = getSierpinskiFloorColor(
        this.group.position.x + parent.x,
        this.group.position.z + parent.z,
        parent.size,
      );
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetZ === 0) continue;
          tiles.push({
            x: parent.x + offsetX * childSize,
            z: parent.z + offsetZ * childSize,
            size: childSize,
          });
          transitions.push({
            x: parent.x + offsetX * compressedStep,
            z: parent.z + offsetZ * compressedStep,
            color: parentColor,
          });
        }
      }
    }

    this.tiles = tiles;
    this.tileTransitions = transitions;
    this.mesh.count = tiles.length;
    for (const [index, transition] of transitions.entries()) {
      this.mesh.setColorAt(index, transition.color);
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  private prepareCutouts(previousTiles: readonly CarpetTile[]): void {
    this.cutouts = previousTiles.map((tile) => ({
      x: tile.x,
      z: tile.z,
      size: tile.size / 3,
    }));
    this.cutoutMesh.count = this.cutouts.length;
    for (const [index, tile] of this.cutouts.entries()) {
      this.cutoutMesh.setColorAt(
        index,
        getSierpinskiFloorColor(
          this.group.position.x + (previousTiles[index]?.x ?? tile.x),
          this.group.position.z + (previousTiles[index]?.z ?? tile.z),
          previousTiles[index]?.size ?? tile.size,
        ),
      );
    }
    if (this.cutoutMesh.instanceColor) {
      this.cutoutMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateMatrices(progress: number): void {
    const growthProgress = THREE.MathUtils.smoothstep(
      progress,
      0,
      0.56,
    );
    const growthBulge =
      Math.sin(growthProgress * Math.PI) * 0.035;
    for (const [index, tile] of this.tiles.entries()) {
      const transition = this.tileTransitions[index];
      const startX = transition?.x ?? tile.x;
      const startZ = transition?.z ?? tile.z;
      const scale = (0.88 + growthBulge) * tile.size;
      this.dummy.position.set(
        THREE.MathUtils.lerp(startX, tile.x, growthProgress),
        0.115,
        THREE.MathUtils.lerp(startZ, tile.z, growthProgress),
      );
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(scale, 1, scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      const finalColor = getSierpinskiFloorColor(
        this.group.position.x + tile.x,
        this.group.position.z + tile.z,
        tile.size,
      );
      this.transitionColor
        .copy(transition?.color ?? finalColor)
        .lerp(finalColor, growthProgress);
      this.mesh.setColorAt(index, this.transitionColor);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    const cutProgress = THREE.MathUtils.smoothstep(
      progress,
      0.48,
      1,
    );
    const cutScale = Math.max(0.001, 1 - cutProgress);
    for (const [index, tile] of this.cutouts.entries()) {
      this.dummy.position.set(
        tile.x,
        0.115 - cutProgress * 0.18,
        tile.z,
      );
      this.dummy.rotation.set(0, cutProgress * 0.16, 0);
      this.dummy.scale.set(
        tile.size * 0.88 * cutScale,
        Math.max(0.08, cutScale),
        tile.size * 0.88 * cutScale,
      );
      this.dummy.updateMatrix();
      this.cutoutMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.cutoutMesh.instanceMatrix.needsUpdate = true;
    if (progress >= 0.999) this.cutoutMesh.count = 0;

    this.selectionMaterial.opacity = THREE.MathUtils.lerp(
      0.32,
      0.68,
      progress,
    );
  }
}
