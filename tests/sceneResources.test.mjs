import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { disposeObjectTree } from "../src/game/sceneResources.ts";

function countDisposals(resource) {
  let count = 0;
  resource.addEventListener("dispose", () => {
    count += 1;
  });
  return () => count;
}

test("zone teardown releases every instance owner while disposing shared resources once", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const first = new THREE.InstancedMesh(geometry, material, 2);
  const hidden = new THREE.InstancedMesh(geometry, material, 3);
  hidden.visible = false;
  root.add(first, hidden);
  const firstDisposals = countDisposals(first);
  const hiddenDisposals = countDisposals(hidden);
  const geometryDisposals = countDisposals(geometry);
  const materialDisposals = countDisposals(material);
  const textureDisposals = countDisposals(texture);

  disposeObjectTree(root);

  assert.equal(firstDisposals(), 1);
  assert.equal(hiddenDisposals(), 1);
  assert.equal(geometryDisposals(), 1);
  assert.equal(materialDisposals(), 1);
  assert.equal(textureDisposals(), 1);
});

test("retiring an instanced prop preserves its borrowed palette material and texture", () => {
  const texture = new THREE.Texture();
  const paletteMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry();
  const prop = new THREE.InstancedMesh(geometry, paletteMaterial, 2);
  const propDisposals = countDisposals(prop);
  const geometryDisposals = countDisposals(geometry);
  const materialDisposals = countDisposals(paletteMaterial);
  const textureDisposals = countDisposals(texture);

  disposeObjectTree(prop, (material) => material !== paletteMaterial);

  assert.equal(propDisposals(), 1);
  assert.equal(geometryDisposals(), 1);
  assert.equal(materialDisposals(), 0);
  assert.equal(textureDisposals(), 0);
});
