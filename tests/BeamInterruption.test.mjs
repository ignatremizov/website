import assert from "node:assert/strict";
import test from "node:test";

import { findFirstBeamInterruption } from "../src/game/BeamInterruption.ts";

function result() {
  return {
    segmentIndex: -1,
    progress: 0,
    x: 0,
    y: 0,
    z: 0,
  };
}

const standingBlocker = {
  x: 5,
  z: 0,
  minY: 0.12,
  maxY: 2.25,
  radius: 0.5,
};

test("beam stops where it enters the player's collision cylinder", () => {
  const interruption = result();
  const blocked = findFirstBeamInterruption(
    [{ x: 0, y: 1.4, z: 0 }],
    [{ x: 10, y: 1.4, z: 0 }],
    1,
    standingBlocker,
    interruption,
  );

  assert.equal(blocked, true);
  assert.equal(interruption.segmentIndex, 0);
  assert.ok(Math.abs(interruption.x - 4.5) < 1e-8);
  assert.ok(Math.abs(interruption.progress - 0.45) < 1e-8);
});

test("ordered routes stop at the first intersected segment", () => {
  const interruption = result();
  const blocked = findFirstBeamInterruption(
    [
      { x: 0, y: 1.4, z: 0 },
      { x: 10, y: 1.4, z: 0 },
    ],
    [
      { x: 10, y: 1.4, z: 0 },
      { x: 0, y: 1.4, z: 0 },
    ],
    2,
    standingBlocker,
    interruption,
  );

  assert.equal(blocked, true);
  assert.equal(interruption.segmentIndex, 0);
});

test("jumping above the carrier clears the route", () => {
  const interruption = result();
  const blocked = findFirstBeamInterruption(
    [{ x: 0, y: 1.4, z: 0 }],
    [{ x: 10, y: 1.4, z: 0 }],
    1,
    {
      ...standingBlocker,
      minY: 1.8,
      maxY: 4,
    },
    interruption,
  );

  assert.equal(blocked, false);
  assert.equal(interruption.segmentIndex, -1);
});

test("a beam outside the player's horizontal radius remains continuous", () => {
  const interruption = result();
  const blocked = findFirstBeamInterruption(
    [{ x: 0, y: 1.4, z: 0.51 }],
    [{ x: 10, y: 1.4, z: 0.51 }],
    1,
    standingBlocker,
    interruption,
  );

  assert.equal(blocked, false);
});
