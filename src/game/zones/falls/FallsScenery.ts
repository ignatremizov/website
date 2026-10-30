import * as THREE from "three";

import type { QualityTier } from "../../../world/WorldContracts";

export interface FallsOutcropMaterials {
  cliff: THREE.Material;
  cliffDark: THREE.Material;
  moss: THREE.Material;
  rock: THREE.Material;
  wetRock: THREE.Material;
}

interface CliffVertex {
  x: number;
  y: number;
  z: number;
}

function cliffNoise(seed: number, first: number, second: number): number {
  const value =
    Math.sin(
      seed * 17.173 +
        first * 31.417 +
        second * 73.719,
    ) *
    43758.5453;
  return value - Math.floor(value);
}

function appendCliffTriangle(
  positions: number[],
  uvs: number[],
  first: CliffVertex,
  second: CliffVertex,
  third: CliffVertex,
  firstUv: readonly [number, number],
  secondUv: readonly [number, number],
  thirdUv: readonly [number, number],
): void {
  positions.push(
    first.x,
    first.y,
    first.z,
    second.x,
    second.y,
    second.z,
    third.x,
    third.y,
    third.z,
  );
  uvs.push(...firstUv, ...secondUv, ...thirdUv);
}

/**
 * Bake quiet mineral variation and upward-facing moss into the mesh. This
 * keeps every cliff on the same batchable material, with no extra texture
 * lookup, point light, or per-frame update.
 */
export function shadeFallsStoneGeometry<T extends THREE.BufferGeometry>(
  geometry: T,
  seed: number,
): T {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const upward = Math.max(0, normals.getY(index));
    const mineral = Math.sin(x * 2.1 + y * 0.77 + z * 1.63 + seed);
    const moss =
      upward * upward *
      THREE.MathUtils.smoothstep(
        Math.sin(x * 2.8 - z * 2.2 + seed * 0.9),
        -0.35,
        0.8,
      );
    const shade = 0.88 + mineral * 0.075 + upward * 0.07;
    colors[index * 3] = shade * (1 - moss * 0.25);
    colors[index * 3 + 1] = shade * (0.98 + moss * 0.015);
    colors[index * 3 + 2] = shade * (1 - moss * 0.38);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Builds a flat-topped cliff inside the exact authored extents. Fracture
 * heights vary around the perimeter so the walls read as broken stone rather
 * than a stack of horizontal bands. The broad, chipped rim retains cardinal
 * anchors at the authored dimensions for the established parkour bounds.
 */
export function createLayeredCliffGeometry(
  width: number,
  height: number,
  depth: number,
  quality: QualityTier,
  seed: number,
): THREE.BufferGeometry {
  const perimeterCount =
    quality === "low" ? 12 : quality === "medium" ? 16 : 24;
  const bevelFraction = Math.min(0.14, 0.09 / height);
  const layerFractions =
    height < 0.48
      ? [0, 0.28, 1 - bevelFraction, 1]
      : quality === "low"
        ? [0, 0.3, 0.68, 1 - bevelFraction, 1]
        : quality === "medium"
          ? [0, 0.2, 0.43, 0.72, 1 - bevelFraction, 1]
          : [0, 0.17, 0.34, 0.55, 0.77, 1 - bevelFraction, 1];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const shallow = height < 0.48;
  const cardinalStep = perimeterCount / 4;
  const rings: CliffVertex[][] = [];
  const footprintExponent =
    (shallow ? 0.26 : 0.5) + cliffNoise(seed, 91, 7) * 0.16;

  for (
    let layerIndex = 0;
    layerIndex < layerFractions.length;
    layerIndex += 1
  ) {
    const fraction = layerFractions[layerIndex]!;
    const isTop = layerIndex === layerFractions.length - 1;
    const isBevel = layerIndex === layerFractions.length - 2;
    const isBottom = layerIndex === 0;
    const broadScale =
      isTop
        ? 0.975
        : isBevel
          ? 0.985
          : isBottom
            ? 0.94
            : 0.91 + (cliffNoise(seed, layerIndex, 43) - 0.5) * 0.1;
    const ring: CliffVertex[] = [];
    for (let point = 0; point < perimeterCount; point += 1) {
      const cardinal = point % cardinalStep === 0;
      const angle =
        (point / perimeterCount) * Math.PI * 2 +
        (cardinal ? 0 : (cliffNoise(seed, point, 61) - 0.5) * 0.095);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const baseX =
        Math.sign(cosine) *
        Math.pow(Math.abs(cosine), footprintExponent);
      const baseZ =
        Math.sign(sine) *
        Math.pow(Math.abs(sine), footprintExponent);
      const pointErosion = cardinal
        ? 0
        : -cliffNoise(seed, point, 13) *
          (shallow ? 0.035 : 0.1);
      const layerErosion = isTop || isBevel
        ? 0
        : (cliffNoise(seed, point, layerIndex + 73) - 0.5) *
          (shallow ? 0.14 : 0.26);
      const radialScale = cardinal && isTop
        ? 1
        : THREE.MathUtils.clamp(
            broadScale + pointErosion + layerErosion,
            0.8,
            0.995,
          );
      const fractureHeight = isTop || isBottom
        ? 0
        : isBevel
          ? -cliffNoise(seed, point, 87) * bevelFraction * 0.35
          : (cliffNoise(seed, point, layerIndex + 97) - 0.5) *
            Math.min(
              fraction - layerFractions[layerIndex - 1]!,
              layerFractions[layerIndex + 1]! - fraction,
            ) * 0.85;
      ring.push({
        x: baseX * halfWidth * radialScale,
        y: -halfHeight + (fraction + fractureHeight) * height,
        z: baseZ * halfDepth * radialScale,
      });
    }
    rings.push(ring);
  }

  // Give every mass a stable, seed-specific crop at an approximately
  // world-sized texel density. The old normalized UVs restarted the same
  // horizontal bands on every pillar, ledge, and crown, making the assembled
  // waterfall read like repeated woodgrain rather than fractured stone.
  const textureWorldScale = 6.2;
  const uOffset = cliffNoise(seed, 151, 3) * 4;
  const vOffset = cliffNoise(seed, 157, 5) * 4;
  const topRotation = cliffNoise(seed, 163, 11) * Math.PI * 2;
  const topRotationCosine = Math.cos(topRotation);
  const topRotationSine = Math.sin(topRotation);
  const referenceRing = rings.at(-1)!;
  const perimeterDistances = new Float32Array(perimeterCount + 1);
  for (let point = 0; point < perimeterCount; point += 1) {
    const current = referenceRing[point]!;
    const next = referenceRing[(point + 1) % perimeterCount]!;
    perimeterDistances[point + 1] =
      perimeterDistances[point]! +
      Math.hypot(next.x - current.x, next.z - current.z);
  }
  const planarUv = (
    vertex: CliffVertex,
  ): readonly [number, number] => [
    uOffset +
      (vertex.x * topRotationCosine -
        vertex.z * topRotationSine) /
        textureWorldScale,
    vOffset +
      (vertex.x * topRotationSine +
        vertex.z * topRotationCosine) /
        textureWorldScale,
  ];

  const positions: number[] = [];
  const uvs: number[] = [];
  for (let layer = 0; layer < rings.length - 1; layer += 1) {
    const lower = rings[layer]!;
    const upper = rings[layer + 1]!;
    for (let point = 0; point < perimeterCount; point += 1) {
      const next = (point + 1) % perimeterCount;
      const u =
        uOffset +
        perimeterDistances[point]! / textureWorldScale;
      const nextU =
        uOffset +
        perimeterDistances[point + 1]! / textureWorldScale;
      appendCliffTriangle(
        positions,
        uvs,
        lower[point]!,
        upper[next]!,
        lower[next]!,
        [u, vOffset + lower[point]!.y / textureWorldScale],
        [nextU, vOffset + upper[next]!.y / textureWorldScale],
        [nextU, vOffset + lower[next]!.y / textureWorldScale],
      );
      appendCliffTriangle(
        positions,
        uvs,
        lower[point]!,
        upper[point]!,
        upper[next]!,
        [u, vOffset + lower[point]!.y / textureWorldScale],
        [u, vOffset + upper[point]!.y / textureWorldScale],
        [nextU, vOffset + upper[next]!.y / textureWorldScale],
      );
    }
  }

  const top = rings.at(-1)!;
  const topCenter: CliffVertex = { x: 0, y: halfHeight, z: 0 };
  const bottom = rings[0]!;
  const bottomCenter: CliffVertex = { x: 0, y: -halfHeight, z: 0 };
  for (let point = 0; point < perimeterCount; point += 1) {
    const next = (point + 1) % perimeterCount;
    const currentTop = top[point]!;
    const nextTop = top[next]!;
    appendCliffTriangle(
      positions,
      uvs,
      topCenter,
      nextTop,
      currentTop,
      planarUv(topCenter),
      planarUv(nextTop),
      planarUv(currentTop),
    );
    const currentBottom = bottom[point]!;
    const nextBottom = bottom[next]!;
    appendCliffTriangle(
      positions,
      uvs,
      bottomCenter,
      currentBottom,
      nextBottom,
      planarUv(bottomCenter),
      planarUv(currentBottom),
      planarUv(nextBottom),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = "falls-fractured-stone-mass";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  shadeFallsStoneGeometry(geometry, seed);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds a lightly folded sheet whose silhouette and surface catch the camera
 * differently from a flat rectangle. Collision remains owned by the authored
 * cliff volumes; this geometry is visual water only.
 */
export function createWaterfallSheetGeometry(
  width: number,
  height: number,
  quality: QualityTier,
  phase: number,
): THREE.PlaneGeometry {
  const horizontalSegments =
    quality === "low" ? 5 : quality === "medium" ? 8 : 12;
  const verticalSegments =
    quality === "low" ? 14 : quality === "medium" ? 24 : 36;
  const geometry = new THREE.PlaneGeometry(
    width,
    height,
    horizontalSegments,
    verticalSegments,
  );
  geometry.name = "falls-folded-waterfall-sheet";
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const sourceX = positions.getX(vertex);
    const sourceY = positions.getY(vertex);
    const u = sourceX / width + 0.5;
    const v = sourceY / height + 0.5;
    const descent = 1 - v;
    const widthPulse =
      1 +
      Math.sin(v * Math.PI * 5.5 + phase) * 0.026 +
      descent * descent * 0.055;
    const lateralDrift =
      Math.sin(v * Math.PI * 7 + phase * 1.7) *
      width *
      0.012 *
      (0.35 + descent);
    const fold =
      Math.sin(u * Math.PI * 5 + v * Math.PI * 9 + phase) * 0.045 +
      Math.sin(u * Math.PI * 2 - v * Math.PI * 13 + phase * 0.7) * 0.024;
    positions.setXYZ(
      vertex,
      sourceX * widthPulse + lateralDrift,
      sourceY,
      fold + descent ** 3 * 0.17,
    );
    // PlaneGeometry numbers V upward; invert it so decreasing texture offset
    // moves both the river and vertical sheets in their physical flow direction.
    uvs.setY(vertex, 1 - uvs.getY(vertex));
  }
  positions.needsUpdate = true;
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Recessed inner stone seals the joins between the cave's fractured outer
 * masses. All pieces remain inside the existing cave-shell collision volumes,
 * including the crown support plane; no extra movement barriers are needed.
 */
export function addWaterfallCaveLining(
  parent: THREE.Object3D,
  height: number,
  material: THREE.Material,
): void {
  const pieces = [
    { size: [3.4, 0.1, 3.55], position: [0, height + 0.67, -1.48] },
    { size: [0.78, height + 0.55, 3.85], position: [-1.55, (height + 0.55) / 2, -1.48] },
    { size: [0.78, height + 0.55, 3.85], position: [1.55, (height + 0.55) / 2, -1.48] },
    { size: [3.8, height + 0.55, 0.16], position: [0, (height + 0.55) / 2, -3.35] },
  ] as const;
  for (const [index, { size, position }] of pieces.entries()) {
    // Match the non-indexed cliff attributes so the static batch can absorb
    // these small seam liners into the existing shared stone draw call.
    const geometry = shadeFallsStoneGeometry(
      new THREE.BoxGeometry(...size).toNonIndexed(),
      170 + index,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `falls-cave-inner-lining-${index}`;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

/**
 * Breaks the rectangular cliff silhouette with low-poly stones kept inside the
 * existing structural footprint. They add readable geology without creating
 * tempting visual ledges that lack matching collision.
 */
export function addWaterfallOutcroppings(
  parent: THREE.Object3D,
  height: number,
  hasCave: boolean,
  materials: FallsOutcropMaterials,
  phase: number,
): void {
  type RockMaterial =
    | "cliff"
    | "cliffDark"
    | "moss"
    | "rock"
    | "wetRock";
  type RockLayout = readonly [
    x: number,
    y: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    material: RockMaterial,
  ];
  const spillLipY = height + (hasCave ? 0.78 : 0.81);
  const layouts: RockLayout[] = [
    // Broad faceted shoulders break up the larger cliff envelope without
    // extending beyond its authored collision footprint.
    [-1.76, 0.58, 0.42, 0.58, 0.42, 0.2, "wetRock"],
    [1.78, 0.62, 0.42, 0.55, 0.45, 0.2, "rock"],
    [-1.79, height * 0.34, 0.42, 0.5, 0.78, 0.2, "rock"],
    [1.78, height * 0.37, 0.42, 0.48, 0.72, 0.2, "cliffDark"],
    [-1.76, height * 0.68, 0.42, 0.54, 0.82, 0.2, "rock"],
    [1.76, height * 0.7, 0.42, 0.52, 0.76, 0.2, "wetRock"],

    // A controlled wet lip hides the water/cliff seam. These stones sit fully
    // in front of the sheet, unlike the old near-coplanar crown geometry.
    [-0.84, spillLipY, 0.95, 0.56, 0.17, 0.08, "wetRock"],
    [-0.29, spillLipY + 0.035, 0.96, 0.46, 0.15, 0.08, "rock"],
    [0.27, spillLipY + 0.015, 0.96, 0.47, 0.16, 0.08, "wetRock"],
    [0.82, spillLipY - 0.015, 0.95, 0.54, 0.18, 0.08, "rock"],

    // Broken landing stones catch the cyan water light at the plunge pool.
    [-0.92, 0.3, 0.43, 0.7, 0.3, 0.2, "wetRock"],
    [0.84, 0.28, 0.43, 0.64, 0.28, 0.2, "rock"],

    // Crown stones keep moss in the palette while introducing grey geology.
    [-1.52, height + 0.43, -0.12, 0.55, 0.34, 0.44, "rock"],
    [1.43, height + 0.48, -0.25, 0.5, 0.35, 0.42, "moss"],
    [-0.92, height + 0.62, 0.13, 0.38, 0.25, 0.34, "cliff"],
    [0.88, height + 0.61, 0.14, 0.4, 0.27, 0.35, "rock"],
  ];
  const geometry = shadeFallsStoneGeometry(
    new THREE.DodecahedronGeometry(1, 0),
    phase,
  );
  geometry.name = "falls-waterfall-outcrop-rock";
  const materialLookup: Record<RockMaterial, THREE.Material> = {
    cliff: materials.cliff,
    cliffDark: materials.cliffDark,
    moss: materials.moss,
    rock: materials.rock,
    wetRock: materials.wetRock,
  };
  for (
    const [
      index,
      [x, y, z, scaleX, scaleY, scaleZ, material],
    ] of layouts.entries()
  ) {
    const rock = new THREE.Mesh(
      geometry,
      materialLookup[material],
    );
    rock.name = `falls-waterfall-outcrop-${index}`;
    rock.position.set(x, y, z);
    rock.rotation.set(
      Math.sin(phase + index * 1.7) * 0.22,
      phase * 0.31 + index * 0.83,
      Math.cos(phase * 0.7 + index) * 0.18,
    );
    rock.scale.set(
      scaleX,
      scaleY,
      scaleZ,
    );
    rock.castShadow = false;
    rock.receiveShadow = true;
    parent.add(rock);
  }
}
