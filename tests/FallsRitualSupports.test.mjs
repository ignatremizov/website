import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { FallsRuneRitual } from "../src/game/zones/falls/FallsRuneRitual.ts";
import { isWithinWalkingStep, selectPropLandingSurface, selectWalkingStepSurface } from "../src/game/SurfaceSelection.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { disposeObjectTree } from "../src/game/sceneResources.ts";
import { fallsLandmarks, getFallsTerraceHeight } from "../src/game/zones/falls/FallsLayout.ts";

const contains = (surface, x, z) => surface.contains?.(x, z, 0) ??
  (Math.abs(x - surface.x) <= surface.halfWidth &&
    Math.abs(z - surface.z) <= surface.halfDepth);

function fixture() {
  const surfaces = [];
  const solids = [];
  const root = new THREE.Group();
  const stone = new THREE.MeshBasicMaterial();
  const addStaticBox = (x, y, z, halfWidth, halfHeight, halfDepth, clearAbove, solidTop) => {
    const solid = { x, y, z, halfWidth, halfHeight, halfDepth, clearAbove, solidTop };
    solids.push(solid);
    return solid;
  };
  const ritual = new FallsRuneRitual({
    materials: { darkStone: stone, mossDark: stone, parchment: stone, brass: stone, violet: stone },
    addStaticBox,
    addSurface: surface => surfaces.push(surface),
    addInteraction: () => ({}),
    // Mirror the engine adapter's bounds registration, without a renderer.
    registerSolid(object, id, stepHeight) {
      object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const solid = addStaticBox(center.x, center.y, center.z, half.x, half.y, half.z,
        box.max.y - 0.005, box.max.y);
      solid.stepHeight = stepHeight;
      if (!id) return null;
      const surface = { id, x: center.x, z: center.z, halfWidth: half.x - 0.005,
        halfDepth: half.z - 0.005, requiresJump: true, heightAt: () => box.max.y };
      surfaces.push(surface);
      return surface;
    },
  });
  return { ritual, root, surfaces, solids, dispose: () => disposeObjectTree(root) };
}

test("a released body lands above an empty socket while its round corners remain open", () => {
  const f = fixture();
  try {
    f.ritual.createRuneSocket(f.root, "moon", -9.3, -1.75, 0x99aaff, 4.2);
    const landing = selectPropLandingSurface(f.surfaces, -9.3, -1.75, 6, 4.1, contains);
    assert.equal(landing?.id, "ritual-socket-moon-bowl");
    assert.equal(landing.heightAt(-9.3, -1.75), 4.48);
    assert.ok(f.solids.some(s => loosePropIntersectsSolid(-9.3, -1.75, 0.2, 4.25, 4.5, s)));
    assert.ok(f.solids.every(s => !loosePropIntersectsSolid(-8.3, -0.75, 0.1, 4.1, 4.6, s)),
      "the empty AABB corner outside the round bowl must not block a body");
    const base = selectWalkingStepSurface(f.surfaces, -8.4, -1.75, 4.2, contains);
    assert.equal(base?.id, "ritual-socket-moon-base");
    const bowl = selectWalkingStepSurface(f.surfaces, -9.3, -1.75, base.heightAt(), contains);
    assert.equal(bowl?.id, landing.id);
    assert.deepEqual(f.ritual.runeSockets.get("moon").position.toArray(), [-9.3, 4.2, -1.75],
      "physical support must not shift puzzle seating coordinates");
  } finally { f.dispose(); }
});

test("a radius-0.4 player can walk from each actual terrace into the socket without a premature lip collision", () => {
  for (const [id, socket] of Object.entries(fallsLandmarks.sockets)) {
    const f = fixture();
    try {
      f.ritual.createRuneSocket(f.root, id, socket.x, socket.z, 0x99aaff, socket.y);
      assert.equal(getFallsTerraceHeight(socket.x, socket.z), socket.y);
      for (const direction of [-1, 1]) {
        let feet = getFallsTerraceHeight(socket.x + direction * 1.5, socket.z);
        assert.equal(feet, socket.y, "approach starts on the authored terrace");
        for (let sample = 0; sample <= 60; sample += 1) {
          const x = socket.x + direction * (1.5 - sample * 0.025);
          const z = socket.z;
          const support = selectWalkingStepSurface(f.surfaces, x, z, feet, contains);
          if (support) {
            const nextFeet = support.heightAt(x, z);
            assert.ok(Math.abs(nextFeet - feet) <= 0.28 + 1e-9);
            feet = nextFeet;
          }
          for (const solid of f.solids) {
            if (!loosePropIntersectsSolid(x, z, 0.4, feet, feet + 2.3, solid)) continue;
            assert.ok(isWithinWalkingStep(feet, solid.solidTop, solid.stepHeight),
              `${id}: the lip must not block the body before its centre reaches the base`);
          }
        }
        assert.ok(Math.abs(feet - (socket.y + 0.28)) < 1e-9);
      }
      assert.ok(f.surfaces.every(surface => surface.supportMargin === 0 && surface.edgeGrace === 0));
      assert.deepEqual(f.ritual.runeSockets.get(id).position.toArray(), [socket.x, socket.y, socket.z]);
    } finally { f.dispose(); }
  }
});

test("cache base and deck block side entry and catch falls without changing crystal source height", () => {
  const f = fixture();
  try {
    const { x, y, z } = fallsLandmarks.cache;
    assert.equal(getFallsTerraceHeight(x, z), 1.05,
      "the cache is on the crystal garden, not the 1.35-high tide garden");
    const cache = f.ritual.createRitualCrystalCache(f.root, x, z, y);
    assert.equal(cache.heightAt(), 1.37);
    assert.ok(f.solids.some(s => loosePropIntersectsSolid(7.3, 6.3, 0.15, 1.08, 1.2, s)));
    assert.ok(f.solids.some(s => loosePropIntersectsSolid(7.5, 6.3, 0.15, 1.3, 1.36, s)));
    assert.ok(f.solids.every(s => !loosePropIntersectsSolid(9.15, 6.3, 0.15, 1.37, 1.9, s)));
    assert.equal(selectPropLandingSurface(f.surfaces, 9.15, 6.3, 3, 1, contains), cache);
    const base = selectWalkingStepSurface(f.surfaces, 7.4, 6.3, 1.05, contains);
    assert.equal(base?.id, "ritual-crystal-cache-base");
    assert.equal(selectWalkingStepSurface(f.surfaces, 9.15, 6.3, base.heightAt(), contains), cache);
    assert.ok(f.solids.every(s => s.stepHeight === 0.28));
  } finally { f.dispose(); }
});

test("cache entry clears the upper deck before the player's centre reaches the narrow base tread", () => {
  const f = fixture();
  try {
    const cache = fallsLandmarks.cache;
    const top = f.ritual.createRitualCrystalCache(f.root, cache.x, cache.z, cache.y);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      let feet = getFallsTerraceHeight(cache.x + dx * 2.2, cache.z + dz * 2.2);
      assert.equal(feet, cache.y, "start on the actual crystal-garden terrace");
      let reachedBase = false;
      for (let sample = 0; sample <= 88; sample += 1) {
        const distance = 2.2 - sample * 0.025;
        const x = cache.x + dx * distance;
        const z = cache.z + dz * distance;
        const support = selectWalkingStepSurface(f.surfaces, x, z, feet, contains);
        if (support) {
          const nextFeet = support.heightAt(x, z);
          assert.ok(Math.abs(nextFeet - feet) <= 0.28 + 1e-9);
          feet = nextFeet;
          reachedBase ||= support.id === "ritual-crystal-cache-base";
        }
        for (const solid of f.solids) {
          if (!loosePropIntersectsSolid(x, z, 0.4, feet, feet + 2.3, solid)) continue;
          assert.ok(isWithinWalkingStep(feet, solid.solidTop, solid.stepHeight),
            "upper deck contact must not block approach before the lower tread supports the centre");
        }
      }
      assert.ok(reachedBase, "the authored lower tread provides the step to the unchanged source plane");
      assert.equal(feet, top.heightAt());
    }
    assert.equal(top.heightAt(), cache.y + 0.32);
    assert.ok(f.solids.every(solid => solid.solidTop <= cache.y + 0.28 + 1e-7));
    assert.ok(f.surfaces.every(surface => surface.supportMargin === 0 && surface.edgeGrace === 0));
  } finally { f.dispose(); }
});
