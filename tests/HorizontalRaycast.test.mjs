import assert from "node:assert/strict";
import test from "node:test";

import { findFirstHorizontalRayBoxDistance } from "../src/game/HorizontalRaycast.ts";

const box = {
  x: 5,
  y: 1,
  z: 0,
  halfWidth: 1,
  halfHeight: 1,
  halfDepth: 1,
};

test("horizontal ray returns the nearest box entry", () => {
  const distance = findFirstHorizontalRayBoxDistance(
    0,
    0,
    1,
    0,
    1,
    [box, { ...box, x: 9 }],
  );

  assert.equal(distance, 4);
});

test("horizontal ray ignores boxes outside the carrier height", () => {
  const distance = findFirstHorizontalRayBoxDistance(
    0,
    0,
    1,
    0,
    3.1,
    [box],
  );

  assert.equal(distance, null);
});

test("horizontal ray ignores disabled and optically transparent boxes", () => {
  const distance = findFirstHorizontalRayBoxDistance(
    0,
    0,
    1,
    0,
    1,
    [
      { ...box, enabled: false },
      { ...box, x: 8, blocksRay: false },
    ],
  );

  assert.equal(distance, null);
});

test("minimum clearance ignores the emitter's containing proxy", () => {
  const distance = findFirstHorizontalRayBoxDistance(
    0,
    0,
    1,
    0,
    1,
    [
      { ...box, x: 0, halfWidth: 0.6 },
      { ...box, x: 5 },
    ],
    0.45,
  );

  assert.equal(distance, 4);
});

test("horizontal ray respects its far-distance guard", () => {
  const distance = findFirstHorizontalRayBoxDistance(
    0,
    0,
    1,
    0,
    1,
    [box],
    0,
    3.9,
  );

  assert.equal(distance, null);
});
