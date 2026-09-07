import assert from "node:assert/strict";
import test from "node:test";

import { OrderedSpatialIndex } from "../src/game/OrderedSpatialIndex.ts";

function record(id, x, z, halfWidth = 0.5, halfDepth = 0.5) {
  return { id, x, z, halfWidth, halfDepth };
}

test("broadphase queries deduplicate spanning records and preserve registration order", () => {
  const index = new OrderedSpatialIndex(2);
  const spanning = record("spanning", 1.8, 0, 2.2, 0.4);
  const mutable = record("mutable", 0.2, 0);
  const local = record("local", 0, 0);
  const result = [];

  index.add(spanning);
  index.add(mutable, true);
  index.add(local);

  index.queryPoint(0, 0, 0.6, result);

  assert.deepEqual(
    result.map(({ id }) => id),
    ["spanning", "mutable", "local"],
  );
});

test("mutable records are sampled from live coordinates and footprints", () => {
  const index = new OrderedSpatialIndex(2);
  const moving = record("moving", 0, 0);
  const result = [];
  index.add(moving, true);

  index.queryPoint(0, 0, 0, result);
  assert.deepEqual(result, [moving]);

  moving.x = 8;
  moving.z = -6;
  moving.halfWidth = 1.5;

  index.queryPoint(0, 0, 0, result);
  assert.deepEqual(result, []);
  index.queryPoint(6.6, -6, 0, result);
  assert.deepEqual(result, [moving]);
});

test("extent padding conservatively includes support beyond rendered bounds", () => {
  const index = new OrderedSpatialIndex(
    2,
    (candidate) => candidate.supportMargin,
  );
  const platform = {
    ...record("platform", 0, 0),
    supportMargin: 0.8,
  };
  const result = [];
  index.add(platform);

  index.queryPoint(1.25, 0, 0, result);

  assert.deepEqual(result, [platform]);
});

test("marking, removal, and clear never leave stale candidates", () => {
  const index = new OrderedSpatialIndex(2);
  const promoted = record("promoted", 0, 0);
  const removed = record("removed", 0, 0);
  const result = [];
  index.add(promoted);
  index.add(removed);

  index.markMutable(promoted);
  promoted.x = 5;
  index.remove(removed);

  index.queryPoint(0, 0, 0, result);
  assert.deepEqual(result, []);
  index.queryPoint(5, 0, 0, result);
  assert.deepEqual(result, [promoted]);

  index.clear();
  index.queryPoint(5, 0, 0, result);
  assert.deepEqual(result, []);
});
