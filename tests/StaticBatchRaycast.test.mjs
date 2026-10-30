import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { accelerateStaticBatchRaycast } from "../src/game/StaticBatchRaycast.ts";

function fixture(indexed) {
  const parts = [-6, 0, 6].map((x, index) => {
    const box = new THREE.BoxGeometry(2, index + 1, 2).translate(x, index, 0);
    return indexed ? box : box.toNonIndexed();
  });
  const geometry = mergeGeometries(parts, false);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const batch = new THREE.Mesh(geometry, material);
  const baseline = new THREE.Mesh(geometry, material);
  accelerateStaticBatchRaycast(batch, parts);
  return { batch, baseline, geometry };
}

function query(mesh, x, z, near = 0, far = 100) {
  return new THREE.Raycaster(
    new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0), near, far,
  ).intersectObject(mesh, false);
}

function comparable(hits) {
  return hits.map(({ distance, point, uv, faceIndex }) => ({
    distance, point: point.toArray(), uv: uv?.toArray(), faceIndex,
  }));
}

test("batched terrain picking preserves hit positions and identities without changing rendered ranges", () => {
  for (const indexed of [false, true]) {
    const { batch, baseline, geometry } = fixture(indexed);
    batch.position.set(1, 2, 3);
    baseline.position.copy(batch.position);
    batch.rotation.y = baseline.rotation.y = Math.PI / 4;
    batch.updateMatrixWorld(true);
    baseline.updateMatrixWorld(true);
    const bounds = geometry.boundingBox.clone();
    const range = { ...geometry.drawRange };
    for (const x of [-8, -4, 0, 1, 4, 7]) {
      for (const z of [-3, 0, 3, 6]) {
        const actual = query(batch, x, z);
        assert.deepEqual(comparable(actual), comparable(query(baseline, x, z)));
        assert.ok(actual.every(hit => hit.object === batch));
        assert.deepEqual(geometry.drawRange, range);
        assert.ok(geometry.boundingBox.equals(bounds));
      }
    }
    // A clipped draw range and near/far limits still belong to the live batch.
    geometry.setDrawRange(36, 36);
    assert.deepEqual(
      comparable(query(batch, 1, 3, 14, 17)),
      comparable(query(baseline, 1, 3, 14, 17)),
    );
  }
});

test("Event Horizon geometry changes abandon the stale per-piece pick bounds", () => {
  const { batch, baseline, geometry } = fixture(true);
  geometry.translate(30, 0, 0);
  assert.deepEqual(comparable(query(batch, 30, 0)), comparable(query(baseline, 30, 0)));
  assert.ok(query(batch, 30, 0).length > 0);

  batch.geometry = baseline.geometry = new THREE.BoxGeometry(3, 3, 3).translate(-30, 0, 0);
  assert.deepEqual(comparable(query(batch, -30, 0)), comparable(query(baseline, -30, 0)));
  assert.ok(query(batch, -30, 0).length > 0);
});

test("a shifted draw range cannot regroup triangles using stale part boundaries", () => {
  for (const indexed of [false, true]) {
    const { batch, baseline, geometry } = fixture(indexed);
    for (const start of [1, 2]) {
      geometry.setDrawRange(start, Infinity);
      for (const x of [-7, -1, 0, 5, 6]) {
        assert.deepEqual(
          comparable(query(batch, x, -1)),
          comparable(query(baseline, x, -1)),
        );
      }
    }
  }
});

test("large static batches reject distant terrain branches without changing equal-distance hit order", (t) => {
  const parts = [];
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    parts.push(new THREE.BoxGeometry(.8, 1, .8).translate(x * 1.5, 0, z * 1.5));
  }
  // Deliberately coincident paving must retain original face ordering.
  parts.push(new THREE.BoxGeometry(.8, 1, .8).translate(15, 0, 15));
  const geometry = mergeGeometries(parts, false);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const batch = new THREE.Mesh(geometry, material);
  const baseline = new THREE.Mesh(geometry, material);
  accelerateStaticBatchRaycast(batch, parts);
  const intersects = THREE.Ray.prototype.intersectsBox;
  let checks = 0;
  t.mock.method(THREE.Ray.prototype, "intersectsBox", function (box) {
    checks++;
    return intersects.call(this, box);
  });
  try {
    const hits = query(batch, 15, 15);
    assert.ok(checks < 100, `one pointer ray must not scan all ${parts.length} parts (${checks} checks)`);
    assert.deepEqual(comparable(hits), comparable(query(baseline, 15, 15)));
    for (const [x, z] of [[0, 0], [4.5, 9], [46.5, 46.5], [15.6, 15.6]]) {
      assert.deepEqual(comparable(query(batch, x, z)), comparable(query(baseline, x, z)));
    }
  } finally {
    for (const part of parts) part.dispose();
    geometry.dispose(); material.dispose();
  }
});
