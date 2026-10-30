import * as THREE from "three";

import type { QualityTier } from "../../../world/WorldContracts";
import type { SurfaceArea } from "../../SurfaceSelection";
import { addBox, addCylinder } from "../../scenePrimitives.ts";
import {
  fallsLandmarks,
  fallsBackgroundPillars,
  forEachFallsTerrainBlock,
  type FallsTerrainBlock,
} from "./FallsLayout.ts";
import { createLayeredCliffGeometry, createWaterfallSheetGeometry } from "./FallsScenery.ts";

/** Shared with the art export so the basin and lower spill stay in alignment. */
export function addFallsCoveWater(
  parent: THREE.Group,
  water: THREE.Material,
  foam: THREE.Material | null,
  quality: QualityTier,
): void {
  const basin = fallsLandmarks.basin;
  const halfWidth = basin.width / 2 - basin.rimWidth;
  const halfDepth = basin.depth / 2 - basin.bankDepth;
  const spillHalf = basin.spillWidth / 2;
  const frontLip = basin.depth / 2 + 0.1;
  // One water skin joins the recessed pool to its lowered overflow slot.
  // There is no second coplanar sheet laid over the southern rim.
  const shape = new THREE.Shape(([
    [-halfWidth, -halfDepth], [halfWidth, -halfDepth],
    [halfWidth, halfDepth], [spillHalf, halfDepth],
    [spillHalf, frontLip], [-spillHalf, frontLip],
    [-spillHalf, halfDepth], [-halfWidth, halfDepth],
  ] as const).map(([x, z]) => new THREE.Vector2(x, -z)));
  const poolGeometry = new THREE.ShapeGeometry(shape);
  const uvs = poolGeometry.getAttribute("uv");
  for (let vertex = 0; vertex < uvs.count; vertex += 1) {
    uvs.setXY(vertex, uvs.getX(vertex) * 0.22, uvs.getY(vertex) * 0.22);
  }
  const poolMaterial = water.clone();
  poolMaterial.name = "falls-recessed-pool-water";
  poolMaterial.transparent = true;
  poolMaterial.opacity = 0.64;
  if ("color" in poolMaterial && poolMaterial.color instanceof THREE.Color) {
    poolMaterial.color.setHex(0xa0e5df);
  }
  const pool = new THREE.Mesh(poolGeometry, poolMaterial);
  pool.name = "falls-raised-cove-pool";
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(basin.x, basin.water, basin.z);
  parent.add(pool);

  const spillZ = basin.z + basin.depth / 2 + 0.1;
  const spillHeight = basin.water - 0.205;
  const spill = new THREE.Mesh(
    createWaterfallSheetGeometry(basin.spillWidth, spillHeight, quality, 8.7),
    water,
  );
  spill.name = "falls-cove-basin-lower-cascade";
  spill.position.set(basin.x, 0.205 + spillHeight / 2, spillZ);
  parent.add(spill);
  if (foam) {
    const impact = new THREE.Mesh(new THREE.PlaneGeometry(basin.spillWidth + 0.65, 1.3), foam);
    impact.name = "falls-cove-lower-impact-foam";
    impact.rotation.x = -Math.PI / 2;
    impact.position.set(basin.x, 0.24, spillZ + 0.16);
    impact.renderOrder = 2;
    parent.add(impact);
  }
}

export interface FallsTerrainMaterials {
  cliff: THREE.Material;
  cliffDark: THREE.Material;
  ground: THREE.Material;
  groundDark: THREE.Material;
  wood: THREE.Material;
  brass: THREE.Material;
  parchment: THREE.Material;
  cyan: THREE.Material;
  violet: THREE.Material;
  amber: THREE.Material;
}

interface FallsTerrainHost {
  quality: QualityTier;
  materials: FallsTerrainMaterials;
  registerSolid: (
    object: THREE.Object3D,
    id: string,
    stepHeight?: number,
  ) => SurfaceArea | null;
}

/** Static, batchable terrain and inhabited nooks. The host owns collision life. */
export function buildFallsTerrain(parent: THREE.Group, host: FallsTerrainHost): void {
  const { materials, quality } = host;
  const plainStone = new THREE.MeshStandardMaterial({
    name: "falls-terrace-dressed-stone",
    color: 0x7f8b87,
    emissive: 0x283334,
    emissiveIntensity: 0.28,
    roughness: 0.94,
    flatShading: true,
  });
  const mossStone = new THREE.MeshStandardMaterial({
    name: "falls-terrace-moss-caps",
    color: 0x647757,
    emissive: 0x293520,
    emissiveIntensity: 0.24,
    roughness: 0.98,
    flatShading: true,
  });
  const poolStone = plainStone.clone();
  poolStone.name = "falls-recessed-pool-bed";
  poolStone.color.setHex(0x375f65);
  poolStone.emissive.setHex(0x162d33);
  poolStone.roughness = 0.64;
  const mineral = new THREE.MeshStandardMaterial({
    name: "falls-small-mineral-outcrops",
    color: 0x877ead,
    emissive: 0x392459,
    emissiveIntensity: 0.5,
    roughness: 0.64,
    flatShading: true,
  });
  const fernMaterial = new THREE.MeshStandardMaterial({
    name: "falls-terrace-fern-leaves",
    color: 0x597f67,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
  const leafShape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(-0.13, 0.24),
    new THREE.Vector2(0, 0.65),
    new THREE.Vector2(0.13, 0.24),
  ]);
  const leafGeometry = new THREE.ShapeGeometry(leafShape);

  const solid = (
    mesh: THREE.Mesh,
    id: string,
    step = false,
  ): void => {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
    const surface = host.registerSolid(
      mesh,
      `falls-${id}`,
      0.28,
    );
    if (surface) {
      surface.stepHeight = 0.28;
      surface.requiresJump = false;
      surface.snapGroundedHeight = true;
      if (step) {
        surface.supportMargin = 0.015;
        surface.edgeGrace = 0.015;
      }
    }
  };

  const stoneBox = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material,
    collidable = false,
  ): THREE.Mesh => {
    const mesh = addBox(parent, size, position, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (collidable) host.registerSolid(mesh, name);
    return mesh;
  };

  const dressTerrace = (block: FallsTerrainBlock, index: number): void => {
    if (block.kind === "step") return;
    const bridge = block.kind === "bridge";
    const tileSize = quality === "low" ? 1.55 : 1.18;
    const columns = Math.max(1, Math.floor(block.width / tileSize));
    const rows = Math.max(1, Math.floor(block.depth / tileSize));
    const width = block.width / columns;
    const depth = block.depth / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        // The inset core below the paving prevents nearly coplanar faces.
        // Tile tops match the continuous collision plane; joints are visual.
        const tile = new THREE.Mesh(
          createLayeredCliffGeometry(
            width - 0.035,
            0.095,
            depth - 0.035,
            "low",
            300 + index * 9.7 + row * 3.2 + column,
          ),
          block.kind === "pool" ? poolStone :
            (column + row + index) % 5 === 0 ? mossStone : plainStone,
        );
        tile.position.set(
          block.x - block.width / 2 + width * (column + 0.5),
          block.top - 0.0475,
          block.z - block.depth / 2 + depth * (row + 0.5),
        );
        tile.name = "falls-terrace-paving";
        tile.castShadow = false;
        tile.receiveShadow = true;
        parent.add(tile);
      }
    }
    if (bridge || block.kind === "landing" || block.kind === "pool") return;

    // These small mineral/fern clusters are scenery, well below the scale of
    // the six movable puzzle crystals. Keep socket circles and paths clear.
    const accents = quality === "low" ? 3 : 6;
    for (let accent = 0; accent < accents; accent += 1) {
      const side = accent % 2 === 0 ? -1 : 1;
      const x = block.x + side * (block.width / 2 - 0.34);
      const z = block.z + ((accent / accents) - 0.38) * block.depth * 0.8;
      const cluster = new THREE.Group();
      cluster.name = "falls-terrace-mineral-fern";
      cluster.userData.clickNavigationPassThrough = true;
      cluster.position.set(x, block.top, z);
      for (let shard = 0; shard < 3; shard += 1) {
        const crystal = new THREE.Mesh(crystalGeometry, mineral);
        crystal.position.set((shard - 1) * 0.16, 0.18, shard % 2 * 0.12);
        crystal.scale.set(0.09, 0.2 + shard * 0.065, 0.085);
        crystal.rotation.z = (shard - 1) * 0.3;
        cluster.add(crystal);
      }
      for (let leaf = 0; leaf < 5; leaf += 1) {
        const mesh = new THREE.Mesh(leafGeometry, fernMaterial);
        mesh.rotation.set(0.35, leaf * 1.256, 0.48);
        mesh.scale.setScalar(0.55 + leaf * 0.05);
        cluster.add(mesh);
      }
      parent.add(cluster);
    }
    // Flat leaf fans hang over exposed faces without growing a collider wall.
    for (let vine = 0; vine < (quality === "low" ? 2 : 4); vine += 1) {
      const x = block.x - block.width * 0.32 + vine * block.width * 0.2;
      for (let leaf = 0; leaf < 5; leaf += 1) {
        const mesh = new THREE.Mesh(leafGeometry, mossStone);
        mesh.name = "falls-terrace-hanging-vine";
        mesh.userData.clickNavigationPassThrough = true;
        mesh.position.set(
          x + Math.sin(leaf * 1.7 + vine) * 0.1,
          block.top - 0.1 - leaf * 0.19,
          block.z + block.depth / 2 + 0.025,
        );
        mesh.rotation.z = Math.PI + (leaf % 2 ? 0.55 : -0.55);
        mesh.scale.setScalar(0.48);
        parent.add(mesh);
      }
    }
  };

  forEachFallsTerrainBlock((block, index) => {
    const bottom = block.bottom ?? 0;
    const height = block.top - bottom;
    // A broad continuous support core prevents decorative seams between
    // separately chipped stones from becoming holes in the route.
    const geometry = new THREE.BoxGeometry(block.width, height, block.depth);
    geometry.computeBoundingBox();
    const core = new THREE.Mesh(geometry, block.kind === "pool" ? poolStone : plainStone);
    core.name = `falls-terrain-${block.id}`;
    core.position.set(block.x, bottom + height / 2, block.z);
    solid(core, block.id, block.kind === "step");
    if (block.kind !== "step") {
      // Registration above captures the full support volume. Recess only the
      // rendered core top beneath the paving, keeping physical seams closed.
      const positions = geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        if (positions.getY(vertex) > 0) {
          positions.setY(vertex, positions.getY(vertex) - 0.075);
        }
      }
      positions.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
    dressTerrace(block, index);

    if (block.kind === "step" || block.kind === "bridge") return;
    // Each exposed wall is a bank of offset, flat-faced columns. Their tops
    // stop below the route so the model never crowds the player's feet.
    const count = Math.max(2, Math.ceil(block.width / 1.3));
    for (let column = 0; column < count; column += 1) {
      const width = block.width / count;
      const rockHeight = height * (0.86 + (column % 3) * 0.045);
      const rock = new THREE.Mesh(
        createLayeredCliffGeometry(width, rockHeight, 0.48, quality, 500 + index * 13 + column),
        column % 3 === 0 ? materials.cliffDark : materials.cliff,
      );
      rock.position.set(
        block.x - block.width / 2 + width * (column + 0.5),
        bottom + rockHeight / 2,
        block.z + block.depth / 2 - 0.13,
      );
      rock.name = "falls-fractured-terrace-column";
      rock.castShadow = false;
      rock.receiveShadow = true;
      parent.add(rock);
    }
  });

  for (const [index, pillar] of fallsBackgroundPillars.entries()) {
    const mesh = new THREE.Mesh(
      createLayeredCliffGeometry(
        pillar.width, pillar.top, pillar.depth, quality, 811 + index * 13,
      ),
      index % 2 ? materials.cliff : materials.cliffDark,
    );
    mesh.name = `falls-rear-pillar-${index}`;
    mesh.position.set(pillar.x, pillar.top / 2, pillar.z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    host.registerSolid(mesh, mesh.name);
    // Short companion shafts make broken, clustered silhouettes rather than
    // another continuous rectangular wall along the horizon.
    const buttress = new THREE.Mesh(
      createLayeredCliffGeometry(
        pillar.width * 0.46, pillar.top * 0.63, pillar.depth * 0.58,
        quality, 947 + index,
      ),
      materials.cliff,
    );
    buttress.name = `falls-rear-pillar-foot-${index}`;
    buttress.position.set(
      pillar.x - pillar.width * 0.32, pillar.top * 0.315,
      pillar.z + pillar.depth * 0.46,
    );
    parent.add(buttress);
    host.registerSolid(buttress, buttress.name);
  }

  // Bank-side bridge supports leave a broad, unobstructed underpass. The low
  // parapets have their own small colliders and can themselves be jumped onto.
  for (const x of [-6.4, 2.2]) {
    stoneBox("falls-bridge-abutment", [0.62, 2.37, 2.4], [x, 1.185, 2.4], plainStone, true);
  }
  for (const z of [1.33, 3.47]) {
    for (let segment = 0; segment < 8; segment += 1) {
      stoneBox(
        `falls-bridge-parapet-${z}-${segment}`,
        [1.08, 0.38, 0.2],
        [-6.08 + segment * 1.14, 2.89, z],
        segment % 3 === 0 ? mossStone : plainStone,
        true,
      );
    }
  }

  const lamp = (x: number, y: number, z: number): void => {
    addCylinder(parent, 0.08, 0.12, 0.9, 5, [x, y + 0.45, z], materials.brass).castShadow = false;
    stoneBox("falls-nook-lamp-frame", [0.32, 0.48, 0.32], [x, y + 1.02, z], materials.brass);
    stoneBox("falls-nook-lamp-glass", [0.26, 0.36, 0.34], [x, y + 1.02, z], materials.amber);
  };

  const reader = fallsLandmarks.npcs.archivist;
  stoneBox("falls-reading-bookshelf", [2.4, 1.85, 0.44], [-9.45, reader.y + 0.925, 0.3], materials.wood, true);
  for (let shelf = 0; shelf < 3; shelf += 1) {
    stoneBox("falls-reading-shelf", [2.45, 0.07, 0.58], [-9.45, reader.y + 0.28 + shelf * 0.55, 0.35], materials.brass);
    for (let book = 0; book < 8; book += 1) {
      stoneBox("falls-reading-volume", [0.16, 0.25 + book % 3 * 0.065, 0.16],
        [-10.4 + book * 0.26, reader.y + 0.45 + shelf * 0.55, 0.55],
        [materials.parchment, materials.violet, materials.wood][book % 3]!);
    }
  }
  stoneBox("falls-reading-bench", [1.9, 0.48, 0.68], [-10.35, reader.y + 0.24, 3.35], materials.wood, true);
  const lectern = stoneBox("falls-reading-lectern", [1.12, 0.12, 0.88], [-7.25, reader.y + 0.95, 1.2], materials.wood);
  lectern.rotation.x = 0.2;
  host.registerSolid(lectern, "falls-reading-lectern");
  const book = stoneBox("falls-reading-open-book", [0.91, 0.045, 0.71], [-7.25, reader.y + 1.04, 1.2], materials.parchment);
  book.rotation.x = 0.2;
  host.registerSolid(book, "falls-reading-open-book");
  stoneBox("falls-lectern-stem", [0.34, 0.85, 0.4], [-7.25, reader.y + 0.425, 1.2], plainStone, true);
  lamp(-10.45, reader.y, 1.35);

  const keeper = fallsLandmarks.npcs.keeper;
  for (const x of [4.5, 6.6]) {
    stoneBox("falls-shrine-upright", [0.48, 2.55, 0.48], [x, keeper.y + 1.275, -0.1], mossStone, true);
  }
  stoneBox("falls-shrine-lintel", [2.65, 0.38, 0.65], [5.55, keeper.y + 2.62, -0.1], plainStone, true);
  const shrineGem = new THREE.Mesh(crystalGeometry, materials.cyan);
  shrineGem.position.set(5.55, keeper.y + 1.25, -0.1);
  shrineGem.scale.set(0.28, 0.75, 0.23);
  parent.add(shrineGem);
  lamp(7.75, keeper.y, -0.85);

  const tinkerer = fallsLandmarks.npcs.tinkerer;
  stoneBox("falls-workshop-table", [2.15, 0.2, 0.95], [7.6, tinkerer.y + 1.0, -5.75], materials.wood, true);
  for (const x of [6.85, 8.35]) {
    stoneBox("falls-workshop-table-leg", [0.2, 0.9, 0.55], [x, tinkerer.y + 0.45, -5.75], materials.brass, true);
  }
  for (let cog = 0; cog < 3; cog += 1) {
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.18 + cog * 0.045, 0.035, 4, 8), materials.brass);
    gear.position.set(6.9 + cog * 0.6, tinkerer.y + 1.15, -5.75);
    gear.rotation.x = Math.PI / 2;
    parent.add(gear);
  }
  stoneBox("falls-workshop-crate", [0.8, 0.72, 0.8], [8.85, tinkerer.y + 0.36, -3.4], materials.wood, true);
  lamp(6.0, tinkerer.y, -5.7);
}
