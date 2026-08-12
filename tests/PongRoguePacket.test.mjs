import assert from "node:assert/strict";
import test from "node:test";

import {
  findSweptCircleContactProgress,
  resolveRoguePacketVelocity,
} from "../src/game/PongRoguePacket.ts";

test("a fast asteroid resolves at first contact instead of tunneling through the packet", () => {
  assert.ok(
    Math.abs(
      findSweptCircleContactProgress(
        { x: -2, z: 0 },
        { x: 2, z: 0 },
        { x: 0, z: 0 },
        0.7,
      ) - 0.325,
    ) < 1e-10,
  );
});

test("a near miss does not steal Pong ownership", () => {
  assert.equal(
    findSweptCircleContactProgress(
      { x: -2, z: 0.8 },
      { x: 2, z: 0.8 },
      { x: 0, z: 0 },
      0.7,
    ),
    null,
  );
});

test("a gentle collision inherits a viable rally from the displaced packet", () => {
  assert.deepEqual(
    resolveRoguePacketVelocity(
      { x: 0.1, z: 0.05 },
      { x: -2.65, z: 1.3 },
    ),
    { x: -2.65, z: 1.3 },
  );
});

test("a hard throw retains direction within playable limits", () => {
  const velocity = resolveRoguePacketVelocity(
    { x: 9, z: -8 },
    { x: 2.65, z: 1.3 },
  );

  assert.ok(velocity.x > 0);
  assert.ok(velocity.z < 0);
  assert.ok(Math.hypot(velocity.x, velocity.z) <= 6.15 + 1e-10);
  assert.ok(Math.abs(velocity.x) <= 5.45);
  assert.ok(Math.abs(velocity.z) <= 4.55);
});
