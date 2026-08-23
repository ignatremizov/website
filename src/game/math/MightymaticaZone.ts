import * as THREE from "three";
import { addBox, addCylinder } from "../scenePrimitives";
import { BuffonNeedleExhibit } from "./BuffonNeedleExhibit";
import { CubeReturnAperture } from "./CubeReturnAperture";
import { FallingSolidsGarden } from "./FallingSolidsGarden";
import { InfiniteChocolateExhibit } from "./InfiniteChocolateExhibit";
import { MindReaderExhibit } from "./MindReaderExhibit";
import { createPythagorasCurator } from "./PythagorasCurator";
import {
  getSierpinskiFloorColor,
  SierpinskiCorner,
  sierpinskiFloorPatch,
} from "./SierpinskiCorner";
import type {
  MathQualityTier,
  MathSpellStage,
  MightymaticaZoneContext,
  MightymaticaZoneRuntime,
} from "./types";

const mathPalette = {
  floor: 0x17142b,
  deep: 0x100c22,
  stone: 0x30274a,
  ivory: 0xe9e0c8,
  cyan: 0x55dce8,
  violet: 0x9e82ff,
  magenta: 0xff5db1,
  amber: 0xffbd55,
  chocolate: 0x6c2f1f,
} as const;

function createPanelTexture(
  title: string,
  subtitle: string,
  accent: string,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const gradient = drawing.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "rgba(10, 7, 25, 0.96)");
    gradient.addColorStop(1, "rgba(31, 19, 55, 0.93)");
    drawing.fillStyle = gradient;
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.strokeStyle = accent;
    drawing.lineWidth = 12;
    drawing.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    drawing.fillStyle = accent;
    drawing.font = "700 68px Georgia, serif";
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    drawing.fillText(title, canvas.width / 2, 118, canvas.width - 96);
    drawing.fillStyle = "#ece5d2";
    drawing.font = "32px ui-sans-serif, system-ui, sans-serif";
    drawing.fillText(subtitle, canvas.width / 2, 220, canvas.width - 82);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createAttributionTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 180;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = drawing.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "rgba(11, 8, 27, 0)");
    gradient.addColorStop(0.16, "rgba(11, 8, 27, 0.82)");
    gradient.addColorStop(0.84, "rgba(11, 8, 27, 0.82)");
    gradient.addColorStop(1, "rgba(11, 8, 27, 0)");
    drawing.fillStyle = gradient;
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "#d9d3c8";
    drawing.font = "500 45px ui-sans-serif, system-ui, sans-serif";
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    drawing.fillText(
      "From Yuri Remizov’s original experiments, rebuilt with love.",
      canvas.width / 2,
      canvas.height / 2,
    );
    drawing.fillStyle = "rgba(255, 189, 85, 0.62)";
    drawing.fillRect(canvas.width / 2 - 155, 143, 310, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "mightymatica-yuri-attribution";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function collectSierpinskiTiles(
  output: Array<{ x: number; z: number; size: number }>,
  x: number,
  z: number,
  size: number,
  depth: number,
): void {
  if (depth <= 0) {
    output.push({ x, z, size });
    return;
  }
  const childSize = size / 3;
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetZ === 0) continue;
      collectSierpinskiTiles(
        output,
        x + offsetX * childSize,
        z + offsetZ * childSize,
        childSize,
        depth - 1,
      );
    }
  }
}

class MightymaticaZone implements MightymaticaZoneRuntime {
  private readonly context: MightymaticaZoneContext;
  private readonly trackedTextures: THREE.Texture[] = [];
  private readonly dimensionFrames: THREE.LineSegments[] = [];
  private readonly mindReader: MindReaderExhibit;
  private readonly fallingSolids: FallingSolidsGarden;
  private readonly buffon: BuffonNeedleExhibit;
  private readonly chocolate: InfiniteChocolateExhibit;
  private readonly sierpinskiCorner: SierpinskiCorner;
  private readonly returnAperture: CubeReturnAperture;
  private readonly pythagorasTexture: THREE.CanvasTexture;
  private readonly pythagoras: THREE.Sprite;
  private readonly pythagorasCancelPendingLoad: () => void;
  private curatorLine = 0;
  private disposed = false;

  constructor(context: MightymaticaZoneContext) {
    this.context = context;
    const root = context.root;

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: mathPalette.floor,
      emissive: 0x08051a,
      emissiveIntensity: 0.72,
      roughness: 0.94,
      metalness: 0.04,
    });
    const sierpinskiMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x213a72,
      emissiveIntensity: 0.62,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.12,
    });
    const deepMaterial = new THREE.MeshStandardMaterial({
      color: mathPalette.deep,
      roughness: 0.9,
      metalness: 0.08,
    });
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: mathPalette.stone,
      roughness: 0.8,
      metalness: 0.18,
    });
    const ivoryMaterial = new THREE.MeshStandardMaterial({
      color: mathPalette.ivory,
      roughness: 0.78,
      metalness: 0.04,
    });

    const foundation = addBox(
      root,
      [34, 1.2, 34],
      [0, -0.7, 0],
      deepMaterial,
    );
    foundation.name = "world-terrain-foundation";
    foundation.castShadow = false;
    const floor = addBox(root, [31, 0.26, 31], [0, -0.06, 0], floorMaterial);
    floor.name = "world-terrain-surface";
    floor.castShadow = false;

    this.createSierpinskiFloor(sierpinskiMaterial);
    this.createDimensionFrame();

    const centralPlinth = addCylinder(
      root,
      3.35,
      3.8,
      0.42,
      16,
      [0, -0.18, 0],
      stoneMaterial,
    );
    centralPlinth.castShadow = false;
    const centralRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.25, 0.07, 5, 40),
      new THREE.MeshBasicMaterial({ color: mathPalette.amber }),
    );
    centralRing.position.y = 0.07;
    centralRing.rotation.x = Math.PI / 2;
    root.add(centralRing);

    const curator = createPythagorasCurator();
    this.pythagorasTexture = curator.texture;
    this.trackedTextures.push(this.pythagorasTexture);
    this.pythagoras = curator.sprite;
    this.pythagorasCancelPendingLoad = curator.cancelPendingLoad;
    root.add(this.pythagoras);
    context.registerPlayerOccluder(this.pythagoras);
    context.addStaticBox(0, 0.9, 0, 0.72, 1.2, 0.72);
    context.addInteraction({
      id: "math-pythagoras",
      label: "Speak with Pythagoras",
      x: 0,
      z: 0,
      radius: 2.55,
      action: () => this.speakWithPythagoras(),
    });

    this.addPanel(
      "MIGHTYMATICA",
      "recovered experiments · rebuilt inside the cube",
      "#ffbd55",
      [0, 6.7, -11.8],
      [0, 0, 0],
      [9.4, 2.94],
    );
    this.addAttribution();

    this.mindReader = new MindReaderExhibit(context);
    this.fallingSolids = new FallingSolidsGarden(
      context,
      () => this.mindReader.getTravelingOrb(),
    );
    this.buffon = new BuffonNeedleExhibit(
      context,
      () => this.mindReader.getTravelingOrb(),
    );
    this.chocolate = new InfiniteChocolateExhibit(context);
    this.addPanel(
      "CHOCOLATE OUT OF NOTHING",
      "a 5 × 8 bar · one apparent spare square",
      "#ff5db1",
      [-10.9, 1.75, 6.35],
      [0, Math.PI / 2, 0],
      [5.7, 1.78],
    );
    this.sierpinskiCorner = new SierpinskiCorner(
      context,
      sierpinskiMaterial,
    );
    this.createArchiveConsole(ivoryMaterial);
    this.returnAperture = new CubeReturnAperture(context);
  }

  update(delta: number, elapsed: number): void {
    if (this.disposed) return;
    this.mindReader.update(delta, elapsed);
    this.fallingSolids.update(delta, elapsed);
    this.buffon.update(delta);
    this.chocolate.update(delta);
    this.sierpinskiCorner.update(delta);
    this.returnAperture.update(delta, elapsed);
    const motionScale = this.context.reducedMotion ? 0.22 : 1;
    for (const [index, frame] of this.dimensionFrames.entries()) {
      frame.rotation.y += delta * (0.018 + index * 0.011) * motionScale;
      frame.rotation.x =
        Math.sin(elapsed * 0.14 * motionScale + index * 0.7) *
        (0.015 + index * 0.004) *
        motionScale;
    }
  }

  setQuality(quality: MathQualityTier): void {
    this.mindReader.setQuality(quality);
    this.fallingSolids.setQuality(quality);
    this.buffon.setQuality(quality);
  }

  reactToSpell(stage: MathSpellStage, charge: number): void {
    if (stage === "spark") {
      this.fallingSolids.triggerWave(false);
    } else {
      this.fallingSolids.triggerGlitchWave();
    }
    const scatteredChocolate = this.chocolate.applySpellImpulse(stage, charge);
    const launchedNeedles = this.buffon.reactToSpell(stage, charge);
    const liftedSymbols = this.mindReader.reactToSpell(stage, charge);
    const intensity =
      stage === "thunder" ? "A thunder proof" : stage === "surge" ? "A violet theorem" : "A binary conjecture";
    const solidsReaction =
      stage === "spark"
        ? "The solids arc into a new arrangement"
        : "The solids fragment into checksum light and rematerialize";
    const chocolateReaction =
      scatteredChocolate === 1
        ? "; one nearby chocolate slab scatters"
        : scatteredChocolate > 1
          ? `; ${scatteredChocolate} nearby chocolate slabs scatter`
          : "";
    this.context.onStatus(
      `${intensity} crosses the workshop. ${solidsReaction}${chocolateReaction}${
        launchedNeedles > 0
          ? ` while ${launchedNeedles} needles rise in staggered waves`
          : ""
      }${
        liftedSymbols > 0
          ? "; the chart’s marks rise in a travelling proof"
          : ""
      }${
        charge > 0.8 ? " with unusual confidence" : ""
      }.`,
    );
  }

  hasActiveMotion(): boolean {
    return (
      this.mindReader.hasActiveMotion() ||
      this.fallingSolids.hasActiveMotion() ||
      this.buffon.hasActiveMotion() ||
      this.chocolate.hasActiveMotion() ||
      this.sierpinskiCorner.hasActiveMotion() ||
      this.returnAperture.hasActiveMotion()
    );
  }

  forEachDynamicObject(visitor: (object: THREE.Object3D) => void): void {
    this.mindReader.forEachDynamicObject(visitor);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mindReader.dispose();
    this.buffon.dispose();
    this.pythagorasCancelPendingLoad();
    for (const texture of this.trackedTextures) texture.dispose();
    this.trackedTextures.length = 0;
    this.pythagoras.material.dispose();
  }

  private createSierpinskiFloor(
    material: THREE.MeshStandardMaterial,
  ): void {
    const tiles: Array<{ x: number; z: number; size: number }> = [];
    collectSierpinskiTiles(tiles, 0, 0, 27, 3);
    const patchHalfSize = sierpinskiFloorPatch.size / 2;
    const staticTiles = tiles.filter((tile) => {
      const renderedHalfSize = tile.size * 0.44;
      return (
        Math.abs(tile.x - sierpinskiFloorPatch.x) >=
          patchHalfSize + renderedHalfSize ||
        Math.abs(tile.z - sierpinskiFloorPatch.z) >=
          patchHalfSize + renderedHalfSize
      );
    });
    const geometry = new THREE.BoxGeometry(1, 0.08, 1);
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      staticTiles.length,
    );
    mesh.name = "sierpinski-carpet-floor";
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    const dummy = new THREE.Object3D();
    for (const [index, tile] of staticTiles.entries()) {
      dummy.position.set(tile.x, 0.115, tile.z);
      dummy.scale.set(tile.size * 0.88, 1, tile.size * 0.88);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(
        index,
        getSierpinskiFloorColor(tile.x, tile.z, tile.size),
      );
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.context.root.add(mesh);
  }

  private createDimensionFrame(): void {
    for (let index = 0; index < 3; index += 1) {
      const size = 30 - index * 2.4;
      const geometry = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(size, 10.5 - index * 0.8, size),
      );
      const material = new THREE.LineBasicMaterial({
        color:
          index === 0
            ? mathPalette.violet
            : index === 1
              ? mathPalette.cyan
              : mathPalette.amber,
        transparent: true,
        opacity: 0.13 + index * 0.035,
      });
      const frame = new THREE.LineSegments(geometry, material);
      frame.name = `cube-subdimension-frame-${index}`;
      frame.position.y = 5.1;
      frame.rotation.y = index * 0.16;
      this.context.root.add(frame);
      this.dimensionFrames.push(frame);
    }
  }

  private addPanel(
    title: string,
    subtitle: string,
    accent: string,
    position: [number, number, number],
    rotation: [number, number, number],
    size: [number, number],
  ): void {
    const texture = createPanelTexture(title, subtitle, accent);
    this.trackedTextures.push(texture);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    panel.position.set(...position);
    panel.rotation.set(...rotation);
    panel.renderOrder = 2;
    this.context.root.add(panel);
  }

  private addAttribution(): void {
    const texture = createAttributionTexture();
    this.trackedTextures.push(texture);
    const attribution = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 1.08),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    attribution.name = "mightymatica-understated-attribution";
    attribution.position.set(0, 4.62, -11.72);
    attribution.renderOrder = 3;
    this.context.root.add(attribution);
  }

  private speakWithPythagoras(): void {
    const lines = [
      "Welcome beneath the Grid. Yuri Remizov’s original experiments have been rebuilt here for a browser that no longer needs Flash.",
      "The needle table lets chance approach pi. The whole carpet corner repeats one missing-middle rule. The chocolate only seems to make room.",
      "Nothing here replaces the preserved originals. This room lets their ideas move again while the source remains archived.",
    ] as const;
    const line = lines[this.curatorLine % lines.length] ?? lines[0];
    this.curatorLine += 1;
    this.context.onStatus(line, { kind: "speech", speaker: "Pythagoras" });
  }

  private createArchiveConsole(material: THREE.Material): void {
    const orbRadius = 0.52;
    const orbY = 1.15;
    const orbCollisionHalfExtent = 0.44;
    const orbTop = orbY + orbRadius;
    const group = new THREE.Group();
    group.position.set(0, 0, -8.7);
    this.context.root.add(group);
    addBox(group, [3.4, 0.32, 1.45], [0, 0.42, 0], material);
    const archive = new THREE.Mesh(
      new THREE.IcosahedronGeometry(orbRadius, 1),
      new THREE.MeshStandardMaterial({
        color: mathPalette.violet,
        emissive: mathPalette.violet,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.4,
      }),
    );
    archive.position.y = orbY;
    archive.castShadow = false;
    group.add(archive);
    this.context.addStaticBox(0, 0.55, -8.7, 1.7, 0.7, 0.72, 0.6);
    this.context.addStaticBox(
      0,
      orbY,
      -8.7,
      orbCollisionHalfExtent,
      orbRadius,
      orbCollisionHalfExtent,
      orbTop,
    );
    this.context.addJumpSurface(
      "math-provenance-console-top",
      0,
      -8.7,
      1.58,
      0.65,
      0.61,
    );
    this.context.addJumpSurface(
      "math-provenance-orb-top",
      0,
      -8.7,
      orbCollisionHalfExtent,
      orbCollisionHalfExtent,
      orbTop,
      "The recovery orb hums beneath your boots. The preserved files remain elsewhere.",
    );
    this.context.addInteraction({
      id: "math-provenance-console",
      label: "Read the recovery catalogue",
      x: 0,
      z: -8.7,
      radius: 2.25,
      action: () => {
        this.context.onStatus(
          "This opening workshop curates Mindread, Buffon’s needle, the chocolate segment of Paradox Box, Sierpiński Carpet, and Falling Figure. Ladder Cat, MindCoins, and Twin Structures remain preserved for later rooms.",
        );
      },
    });
  }
}

export function createMightymaticaZone(
  context: MightymaticaZoneContext,
): MightymaticaZoneRuntime {
  return new MightymaticaZone(context);
}
