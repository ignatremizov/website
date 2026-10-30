import assert from "node:assert/strict";
import test from "node:test";
import { hasGuidedDropClearance } from "../src/game/DropNavigation.ts";
import { hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { selectDescendingLandingSurface } from "../src/game/SurfaceSelection.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";

const from = { x: 0, y: 0.75, z: 0 };
const landing = { x: 2, y: -0.16, z: 0 };
const sample = (x, _z, previous) => x < 0.85 && Math.abs(previous - 0.75) < 0.08 ? 0.75
  : Math.abs(previous + 0.16) < 0.08 ? -0.16 : null;
const floor = () => -0.16;

test("a step-off can finish below low headroom without inventing an upward jump", () => {
  const ceiling = { x: 1.65, y: 3.22, z: 0, halfWidth: 1, halfHeight: 0.12, halfDepth: 1 };
  const clear = (x, z, feet) => !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, ceiling);
  assert.equal(hasGuidedDropClearance(from, landing, 6.8, sample, clear, () => null, floor), true);
  assert.equal(hasGuidedJumpClearance(from, landing, 6.8, clear), false);
});

test("drops reject an intervening deck, insufficient headroom, upward goals, and unbounded inputs", () => {
  const shelf = { x: 1.8, z: 0, halfWidth: 0.6, halfDepth: 1, requiresJump: true, heightAt: () => 0.55 };
  const landingHeight = (px, pz, py, x, z, feet) => {
    const hit = selectDescendingLandingSurface([shelf], px, pz, py, x, z, feet,
      (surface, sx) => Math.abs(sx - surface.x) <= surface.halfWidth);
    return hit?.heightAt(x, z) ?? null;
  };
  assert.equal(hasGuidedDropClearance(from, landing, 6.8, sample, () => true, landingHeight, floor), false);
  assert.equal(hasGuidedDropClearance(from, landing, 6.8, sample,
    (x, _z, feet) => x < 1 || feet + 2.3 <= 2.4, () => null, floor), false);
  for (const to of [{ ...landing, y: 1 }, { ...landing, x: Infinity }, { ...landing, y: -20 }]) {
    assert.equal(hasGuidedDropClearance(from, to, 6.8, sample, () => true, () => null, floor), false);
  }
});
