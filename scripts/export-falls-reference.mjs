/**
 * Art-only geology study using the runtime mesh builders. This is deliberately
 * not a whole-level exporter: shaders, gameplay, foliage, and collision stay in
 * the game. See docs/preproduction/asset-pipeline.md before using it as an asset.
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

const quality = process.argv[2] ?? "medium";
if (!["low", "medium", "high"].includes(quality)) {
  throw new Error("Usage: node --experimental-strip-types scripts/export-falls-reference.mjs [low|medium|high]");
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
scene.name = `Falls geology study (${quality})`;
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

// Representative assemblies at the current game scale, not a second runtime
// layout. Names, dimensions, and local origins make these useful Blender guides.
for (const [x, z, height, cave] of [
  [-4.5, -8, 3.6, false],
  [0, -9.5, 5, true],
  [4.5, -8, 3.1, false],
]) {
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
    addWaterfallCaveLining(group, height, materials.cliffDark);
  } else {
    addRock("cliff-mass", [4.2, height + 0.8, 2.5], [0, (height + 0.8) / 2, -0.6]);
  }
  addWaterfallOutcroppings(group, height, cave, materials, x * 0.37 + height);
  const sheetHeight = cave ? height - 0.31 : height;
  for (const side of cave ? [-1, 1] : [0]) {
    const mesh = new THREE.Mesh(
      createWaterfallSheetGeometry(cave ? 1.16 : 2.35, sheetHeight, quality, x + side * 0.73),
      water,
    );
    mesh.name = `water-guide-${side}`;
    mesh.position.set(side * 0.575, sheetHeight / 2, 0.79);
    group.add(mesh);
  }
}

// A broad terrace and two small landings show how one material/geometry family
// reads across very different scales. These are separate editable objects.
mass(scene, "terrace-study", [4, 2.7, 4], [-7.6, 1.2, -8.3], 40);
mass(scene, "landing-study-low", [2.25, 0.28, 1.72], [-7.9, 0.58, -3.6], 80);
mass(scene, "landing-study-high", [2.08, 0.28, 1.65], [-7.9, 1.24, -5.1], 82.71, materials.cliffDark);

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
const output = new URL(`falls-geology-${quality}.glb`, directory);
await writeFile(output, Buffer.from(binary));
console.log(`${fileURLToPath(output)}: ${meshes} meshes, ${triangles.toLocaleString()} triangles, ${(binary.byteLength / 1024).toFixed(1)} KiB`);
