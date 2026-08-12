import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { isTraversalSnapshotMeshEligible } from "../src/game/TraversalSnapshotEligibility.ts";

function mesh(material = new THREE.MeshBasicMaterial()) {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
}

test("snapshot keeps visible body and equipment beneath its avatar root", () => {
  const avatar = new THREE.Group();
  const body = mesh();
  const equipment = new THREE.Group();
  const lantern = mesh();
  equipment.add(lantern);
  avatar.add(body, equipment);

  assert.equal(
    isTraversalSnapshotMeshEligible(body, avatar),
    true,
  );
  assert.equal(
    isTraversalSnapshotMeshEligible(lantern, avatar),
    true,
  );
});

test("snapshot excludes meshes beneath an invisible child assembly", () => {
  const avatar = new THREE.Group();
  const hiddenSpellOrb = new THREE.Group();
  hiddenSpellOrb.visible = false;
  const orbCore = mesh(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
    }),
  );
  hiddenSpellOrb.add(orbCore);
  avatar.add(hiddenSpellOrb);

  assert.equal(
    isTraversalSnapshotMeshEligible(orbCore, avatar),
    false,
  );
});

test("arrival can snapshot children while the avatar root is hidden", () => {
  const avatar = new THREE.Group();
  avatar.visible = false;
  const body = mesh();
  avatar.add(body);

  assert.equal(
    isTraversalSnapshotMeshEligible(body, avatar),
    true,
  );
});

test("snapshot excludes transparent support meshes and marked effects", () => {
  const avatar = new THREE.Group();
  const zeroOpacityMesh = mesh(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
    }),
  );
  const transientEffect = new THREE.Group();
  transientEffect.userData.terminalTraversalSnapshot = false;
  const visibleEffectMesh = mesh();
  transientEffect.add(visibleEffectMesh);
  avatar.add(zeroOpacityMesh, transientEffect);

  assert.equal(
    isTraversalSnapshotMeshEligible(zeroOpacityMesh, avatar),
    false,
  );
  assert.equal(
    isTraversalSnapshotMeshEligible(visibleEffectMesh, avatar),
    false,
  );
});
