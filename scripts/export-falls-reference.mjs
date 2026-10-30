/**
 * Art-only geology/layout references using the runtime mesh builders.
 * Shaders, gameplay, foliage, and collision behavior stay in the game.
 * See docs/preproduction/asset-pipeline.md before using these as runtime assets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  addWaterfallCaveLining,
  addWaterfallOutcroppings,
  createLayeredCliffGeometry,
  createWaterfallSheetGeometry,
} from "../src/game/zones/falls/FallsScenery.ts";
import { addFallsCoveWater, buildFallsTerrain } from "../src/game/zones/falls/FallsTerrain.ts";
import { fallsLandmarks } from "../src/game/zones/falls/FallsLayout.ts";
import { createFallsRiverRibbonGeometry, createFallsRiverSpillGeometry } from "../src/game/fallsRiver.ts";

const quality = process.argv[2] ?? "medium";
const layout = process.argv.includes("--layout");
if (!["low", "medium", "high"].includes(quality)) {
  throw new Error("Usage: node --experimental-strip-types scripts/export-falls-reference.mjs [low|medium|high] [--layout]");
}

// Binary, texture-free GLTFExporter only needs this browser FileReader method.
// Keep the adapter in this offline script, outside every application bundle.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const scene = new THREE.Scene();
scene.name = `Falls ${layout ? "terrain layout" : "geology study"} (${quality})`;
scene.userData.note =
  "Art reference, not a playable zone. Materials are flat approximations; runtime water and procedural texture maps are not baked.";
const material = (name, color, vertexColors = false) =>
  new THREE.MeshStandardMaterial({
    name,
    color,
    roughness: 0.92,
    flatShading: true,
    vertexColors,
  });
const materials = {
  cliff: material("slate-reference", 0x657274, true),
  cliffDark: material("recessed-slate-reference", 0x52605f, true),
  moss: material("moss-reference", 0x566c44),
  rock: material("grey-stone-reference", 0x7f898a),
  wetRock: material("wet-stone-reference", 0x465b61),
  ground: material("garden-reference", 0x526a56),
  groundDark: material("lower-gorge-reference", 0x3b4b4c),
  wood: material("wood-reference", 0x79604c),
  brass: material("brass-reference", 0xc99e59),
  parchment: material("page-reference", 0xe9d7ad),
  cyan: material("cyan-reference", 0x64e2dc),
  violet: material("violet-reference", 0x9d83e5),
  amber: material("amber-reference", 0xf7b968),
};
const water = material("water-sheet-reference", 0x69ccd7);
water.side = THREE.DoubleSide;
water.roughness = 0.4;

function mass(parent, name, size, position, seed, stone = materials.cliff) {
  const mesh = new THREE.Mesh(
    createLayeredCliffGeometry(...size, quality, seed),
    stone,
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.userData.authoredExtents = size;
  parent.add(mesh);
  return mesh;
}

if (layout) {
  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 18, 1.7, 18),
    materials.groundDark,
  );
  foundation.position.y = -0.85;
  foundation.name = "foundation-guide";
  scene.add(foundation);
  const garden = new THREE.Mesh(
    new THREE.CylinderGeometry(14.6, 14.6, 0.35, 20),
    materials.ground,
  );
  garden.position.y = -0.05;
  garden.name = "lower-field-guide";
  scene.add(garden);
  scene.add(new THREE.Mesh(createFallsRiverRibbonGeometry(0.205, 0), water));
  const spillWater = water.clone();
  spillWater.name = "water-void-spill-reference";
  spillWater.vertexColors = true;
  spillWater.transparent = true;
  spillWater.depthWrite = false;
  scene.add(new THREE.Mesh(createFallsRiverSpillGeometry(), spillWater));
  // This is the actual runtime terrain builder. Flat export materials replace
  // canvas textures, but vertices, stairs, nooks, and bridge undersides match.
  buildFallsTerrain(scene, {
    quality,
    materials,
    registerSolid(object, id, stepHeight) {
      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object);
      object.userData.runtimeSolid = {
        id, minimum: bounds.min.toArray(), maximum: bounds.max.toArray(),
        stepHeight,
      };
      return null;
    },
  });
  addFallsCoveWater(scene, water, null, quality);
  for (const [id, point] of Object.entries(fallsLandmarks.sockets)) {
    const socket = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 4, 16), materials.brass);
    socket.name = `socket-position-guide-${id}`;
    socket.position.set(point.x, point.y + 0.2, point.z);
    socket.rotation.x = Math.PI / 2;
    scene.add(socket);
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      id === "moon" ? materials.violet : id === "tide" ? materials.cyan : materials.amber,
    );
    crystal.name = `seated-crystal-scale-guide-${id}`;
    crystal.position.set(point.x, point.y + 0.8, point.z);
    crystal.scale.y = 1.8;
    scene.add(crystal);
  }
  for (const [id, point] of Object.entries(fallsLandmarks.npcs)) {
    const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 3, 5), materials.parchment);
    figure.name = `NPC-scale-guide-${id}`;
    figure.position.set(point.x, point.y + 0.85, point.z);
    scene.add(figure);
  }
  const cache = fallsLandmarks.cache;
  for (let index = 0; index < 6; index += 1) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), materials.violet);
    crystal.name = "loose-crystal-scale-guide";
    crystal.scale.y = 1.7;
    crystal.position.set(cache.x + (index % 3 - 1) * 1.05, cache.y + 1, cache.z + (Math.floor(index / 3) * 2 - 1) * 0.65);
    scene.add(crystal);
  }
  const monument = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.25, 0.82, 8),
    materials.brass,
  );
  monument.name = "river-monument-position-guide";
  monument.position.set(fallsLandmarks.monument.x, 0.41, fallsLandmarks.monument.z);
  scene.add(monument);
}

// Cave shells are inspection assemblies of the same rock builders; the
// runtime still owns the animated seal, spring material, and cove interactions.
const waterfalls = layout ? [
  [fallsLandmarks.cave.x, fallsLandmarks.cave.z, fallsLandmarks.cave.height, true],
  [fallsLandmarks.westernWaterfall.x, fallsLandmarks.westernWaterfall.z, fallsLandmarks.westernWaterfall.height, false],
] : [
  [-4.5, -8, 3.6, false],
  [0, -9.5, 5, true],
  [4.5, -8, 3.1, false],
];
for (const [x, z, height, cave] of waterfalls) {
  const group = new THREE.Group();
  group.name = cave ? "central-cave-study" : `side-waterfall-study-${x}`;
  group.position.set(x, 0, z);
  scene.add(group);
  let index = 0;
  const addRock = (name, size, position, stone) =>
    mass(group, name, size, position, x * 0.47 + height * 1.31 + index++ * 2.17, stone);
  if (cave) {
    for (const side of [-1, 1]) {
      addRock(`cave-pillar-${side}`, [1.1, height + 0.8, 2.5], [side * 1.55, (height + 0.8) / 2, -0.6]);
    }
    addRock("cave-cap", [2.1, 1.1, 2.5], [0, height + 0.25, -0.6]);
    addRock("cave-back", [4.2, height + 0.8, 0.38], [0, (height + 0.8) / 2, -3.38], materials.cliffDark);
    for (const side of [-1, 1]) {
      addRock(`cave-rear-wall-${side}`, [1.1, height + 0.8, 1.36], [side * 1.55, (height + 0.8) / 2, -2.52]);
    }
    addRock("cave-rear-roof", [2.1, 0.32, 1.36], [0, height + 0.64, -2.52]);
    if (layout) {
      addRock("raised-cave-plinth", [2.1, 2.63, 4], [0, 2.63 / 2, -1.55]);
    }
    addWaterfallCaveLining(group, height, materials.cliffDark);
  } else {
    addRock("cliff-mass", [4.2, height + 0.8, 2.5], [0, (height + 0.8) / 2, -0.6]);
  }
  addWaterfallOutcroppings(group, height, cave, materials, x * 0.37 + height);
  const waterBottom = layout ? (cave ? fallsLandmarks.basin.water : 4.2) : 0;
  const sheetHeight = layout ? height + 0.78 - waterBottom : cave ? height - 0.31 : height;
  for (const side of cave ? [-1, 1] : [0]) {
    const mesh = new THREE.Mesh(
      createWaterfallSheetGeometry(cave ? 1.16 : 2.35, sheetHeight, quality, x + side * 0.73),
      water,
    );
    mesh.name = `water-guide-${side}`;
    mesh.position.set(side * 0.575, waterBottom + sheetHeight / 2, 0.79);
    group.add(mesh);
  }
}

// A broad terrace and two small landings show how one material/geometry family
// reads across very different scales. These are separate editable objects.
if (layout) {
  const runnelStart = fallsLandmarks.westernWaterfall.x + 1.2;
  const runnelEnd = -7.12;
  const runnel = new THREE.Mesh(new THREE.PlaneGeometry(runnelEnd - runnelStart, 0.8), water);
  runnel.rotation.x = -Math.PI / 2;
  runnel.position.set((runnelStart + runnelEnd) / 2, fallsLandmarks.sockets.moon.y + 0.025, -3.17);
  scene.add(runnel);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 1), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(fallsLandmarks.westernWaterfall.x, fallsLandmarks.sockets.moon.y + 0.025, -3.15);
  scene.add(pool);
  const spill = new THREE.Mesh(createWaterfallSheetGeometry(0.8, 4.2, quality, 6), water);
  spill.rotation.y = Math.PI / 2;
  spill.position.set(-7.14, 2.1, -3.17);
  scene.add(spill);
  const tributary = new THREE.Mesh(createWaterfallSheetGeometry(1.5, 3.8, quality, 4), water);
  tributary.position.set(0.14, 1.9, -4.75);
  tributary.rotation.y = -Math.PI / 2;
  scene.add(tributary);
} else {
  mass(scene, "terrace-study", [4, 2.7, 4], [-7.6, 1.2, -8.3], 40);
  mass(scene, "landing-study-low", [2.25, 0.28, 1.72], [-7.9, 0.58, -3.6], 80);
  mass(scene, "landing-study-high", [2.08, 0.28, 1.65], [-7.9, 1.24, -5.1], 82.71, materials.cliffDark);
}

let triangles = 0;
let meshes = 0;
scene.traverse((object) => {
  if (!object.isMesh) return;
  meshes += 1;
  triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
});
scene.updateMatrixWorld(true);
const binary = await new GLTFExporter().parseAsync(scene, { binary: true });
const directory = new URL("../art/blender/", import.meta.url);
await mkdir(directory, { recursive: true });
const output = new URL(`falls-${layout ? "layout" : "geology"}-${quality}.glb`, directory);
await writeFile(output, Buffer.from(binary));
console.log(`${fileURLToPath(output)}: ${meshes} meshes, ${triangles.toLocaleString()} triangles, ${(binary.byteLength / 1024).toFixed(1)} KiB`);
