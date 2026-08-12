import assert from "node:assert/strict";
import test from "node:test";

import { selectSupportedSurfaces } from "../src/game/SurfaceSelection.ts";

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
