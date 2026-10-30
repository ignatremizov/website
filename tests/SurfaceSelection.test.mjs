import assert from "node:assert/strict";
import test from "node:test";

import { isWithinWalkingStep, selectPropLandingSurface, selectSupportedSurfaces, selectWalkingStepSurface, surfaceOverlapsCircle } from "../src/game/SurfaceSelection.ts";
import { hasWalkingClearance } from "../src/game/GuidedWalkingRoute.ts";
import { forEachFallsTerrainBlock } from "../src/game/zones/falls/FallsLayout.ts";

function surface(id, height, requiresJump = false) {
  return {
    id,
    x: 0,
    z: 0,
    halfWidth: 2,
    halfDepth: 2,
    requiresJump,
    heightAt: () => height,
  };
}

function selection() {
  return { active: null, landing: null, grounded: null };
}

function frame(changes = {}) {
  return {
    activeSurface: null,
    x: 0,
    z: 0,
    previousX: 0,
    previousZ: 0,
    feetHeight: 0,
    previousFeetHeight: 0,
    descending: false,
    grounded: false,
    ...changes,
  };
}

const supportsEverything = () => true;

test("a frog resting partly over a bench edge lands on its feet instead of falling through the side", () => {
  const bench = { ...surface("bench", 2.4), halfWidth: 0.9, halfDepth: 0.34 };
  const supportsFeet = (support, x, z) => surfaceOverlapsCircle(support, x, z, 0.55);
  assert.equal(selectPropLandingSurface([bench], 1.15, 0, 2.6, 2.3, supportsFeet), bench);
  assert.equal(selectPropLandingSurface([bench], 1.6, 0, 2.6, 2.3, supportsFeet), null,
    "moving fully clear of the bench releases support");
  assert.equal(selectPropLandingSurface([bench], 1.4, 0.8, 2.6, 2.3, supportsFeet), null,
    "diagonal corners use the foot circle, not its expanded bounding square");
  assert.equal(selectPropLandingSurface([bench], 0, 0, 1.9, 1.8, supportsFeet), null,
    "a frog beneath the bench cannot land on its overhead top");
});

test("flung crystals catch the highest crossed terrace, including thin bridge decks", () => {
  const terrace = surface("terrace", 1.35);
  const bridge = surface("bridge", 2.7);
  const overhead = surface("overhead", 4.2);
  assert.equal(
    selectPropLandingSurface([terrace, bridge, overhead], 0, 0, 3.1, 1.1, supportsEverything),
    bridge,
  );
  assert.equal(
    selectPropLandingSurface([bridge], 0, 0, 1.5, 1.1, supportsEverything),
    null,
    "a crystal beneath the bridge must not snap up through it",
  );
  assert.equal(
    selectPropLandingSurface([bridge], 0, 0, 2.5, 2.9, supportsEverything),
    null,
    "rising props must finish their arc",
  );
  assert.equal(
    selectPropLandingSurface([{ ...bridge, enabled: false }], 0, 0, 3.1, 2.5, supportsEverything),
    null,
  );
});

test("descent chooses the highest crossed surface", () => {
  const lower = surface("lower", 1);
  const upper = surface("upper", 2);
  const result = selectSupportedSurfaces(
    [lower, upper],
    frame({
      activeSurface: lower,
      feetHeight: 0.8,
      previousFeetHeight: 2.4,
      descending: true,
    }),
    supportsEverything,
    selection(),
  );

  assert.equal(result.active, lower);
  assert.equal(result.landing, upper);
});

test("grounded selection ignores jump-only surfaces", () => {
  const walkable = surface("walkable", 1.5);
  const jumpOnly = surface("jump-only", 2.5, true);
  const result = selectSupportedSurfaces(
    [jumpOnly, walkable],
    frame({ grounded: true }),
    supportsEverything,
    selection(),
  );

  assert.equal(result.grounded, walkable);
  assert.equal(result.landing, null);
});

test("an active surface is released when it loses support", () => {
  const active = surface("active", 1);
  const result = selectSupportedSurfaces(
    [active],
    frame({
      activeSurface: active,
      x: 3,
      z: 3,
      feetHeight: 1,
      previousFeetHeight: 1,
      grounded: true,
    }),
    () => false,
    selection(),
  );

  assert.equal(result.active, null);
  assert.equal(result.grounded, null);
});

test("stairs admit the next riser without lifting feet onto an overhead deck", () => {
  const lower = { ...surface("lower", 1.35), stepHeight: 0.28 };
  const next = { ...surface("next-tread", 1.575), stepHeight: 0.28 };
  const upper = { ...surface("overhead-deck", 2.7), stepHeight: 0.28 };
  const result = selectSupportedSurfaces(
    [upper, lower, next],
    frame({ grounded: true, feetHeight: 1.35, activeSurface: lower }),
    supportsEverything,
    selection(),
  );
  assert.equal(result.grounded, next);
  assert.equal(result.active, lower);
  assert.equal(isWithinWalkingStep(1.35, 1.575, 0.28), true);
  assert.equal(isWithinWalkingStep(1.35, 2.7, 0.28), false);
  assert.equal(isWithinWalkingStep(1.35, 1.575, undefined), false);
});

test("leaving a raised terrace falls instead of snapping to a remote lower stair", () => {
  const lower = { ...surface("low-tread", 0.9), stepHeight: 0.28 };
  const overhead = { ...surface("bridge", 2.7), stepHeight: 0.28 };
  const result = selectSupportedSurfaces(
    [lower, overhead],
    frame({ grounded: true, feetHeight: 1.8 }),
    supportsEverything,
    selection(),
  );
  assert.equal(result.grounded, null);

  selectSupportedSurfaces(
    [lower, overhead],
    frame({ feetHeight: 2.6, previousFeetHeight: 2.8, descending: true }),
    supportsEverything,
    result,
  );
  assert.equal(result.landing, overhead);
});

test("the reading stairs check the next riser from the acquired tread, not the lower terrace", () => {
  const supports = [];
  const solids = [];
  forEachFallsTerrainBlock((block) => {
    if (!block.id.startsWith("reading-ascent")) return;
    supports.push({
      ...surface(block.id, block.top), x: block.x, z: block.z,
      halfWidth: block.width / 2, halfDepth: block.depth / 2, stepHeight: 0.28,
    });
    solids.push({
      x: block.x, y: block.top / 2, z: block.z,
      halfWidth: block.width / 2, halfHeight: block.top / 2, halfDepth: block.depth / 2,
      solidTop: block.top, stepHeight: 0.28,
    });
  });
  const contains = (s, x, z) =>
    Math.abs(x - s.x) <= s.halfWidth + 0.01 &&
    Math.abs(z - s.z) <= s.halfDepth + 0.01;
  const x = -8;
  const z = 7.99;
  const step = selectWalkingStepSurface(supports, x, z, 1.35, contains);
  assert.equal(step?.id, "reading-ascent-0");
  assert.equal(hasWalkingClearance(solids, x, z, 1.35, 0.4, 2.3), false);
  assert.equal(hasWalkingClearance(solids, x, z, step.heightAt(x, z), 0.4, 2.3), true);
  assert.equal(
    selectWalkingStepSurface(supports, -8, 4.9, 1.35, contains),
    null,
    "a grounded shortcut must not lift feet straight to a distant upper tread",
  );
});
