import assert from "node:assert/strict";
import test from "node:test";

import {
  ignitionPanicDuration,
  reducedIgnitionPanicDuration,
  sampleIgnitionPanic,
} from "../src/game/PlayerIgnitionPanic.ts";

function frame() {
  return {
    active: false,
    phase: "idle",
    movementSpeed: 0,
    headingOffset: 0,
    proneBlend: 0,
    rollAngle: 0,
    flailStrength: 0,
    flameStrength: 0,
    smokeStrength: 0,
  };
}

test("full ignition panic runs, drops, rolls, and recovers", () => {
  const sampled = frame();

  sampleIgnitionPanic(0.1, false, sampled);
  assert.equal(sampled.phase, "startle");
  assert.equal(sampled.movementSpeed, 0);

  sampleIgnitionPanic(0.8, false, sampled);
  assert.equal(sampled.phase, "run");
  assert.ok(sampled.movementSpeed > 5);
  assert.equal(sampled.flameStrength, 1);

  sampleIgnitionPanic(2.45, false, sampled);
  assert.equal(sampled.phase, "drop");
  assert.ok(sampled.proneBlend > 0);

  sampleIgnitionPanic(3.2, false, sampled);
  assert.equal(sampled.phase, "roll");
  assert.ok(sampled.rollAngle > Math.PI);
  assert.ok(sampled.flameStrength < 1);
  assert.ok(sampled.smokeStrength > 0);

  sampleIgnitionPanic(4.2, false, sampled);
  assert.equal(sampled.phase, "recover");
  assert.ok(sampled.proneBlend > 0 && sampled.proneBlend < 1);
  assert.ok(sampled.smokeStrength > sampled.flameStrength);

  sampleIgnitionPanic(ignitionPanicDuration, false, sampled);
  assert.equal(sampled.active, false);
  assert.equal(sampled.phase, "idle");
});

test("reduced motion keeps the brief panic but omits the ground roll", () => {
  const sampled = frame();

  sampleIgnitionPanic(0.5, true, sampled);
  assert.equal(sampled.phase, "run");
  assert.equal(sampled.rollAngle, 0);
  assert.equal(sampled.proneBlend, 0);

  sampleIgnitionPanic(0.9, true, sampled);
  assert.equal(sampled.phase, "recover");
  assert.equal(sampled.rollAngle, 0);

  sampleIgnitionPanic(reducedIgnitionPanicDuration, true, sampled);
  assert.equal(sampled.active, false);
});
