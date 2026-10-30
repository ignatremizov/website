import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import * as THREE from "three";
import { FallsRuneRitual } from "../src/game/zones/falls/FallsRuneRitual.ts";
import { surfaceOverlapsCircle } from "../src/game/SurfaceSelection.ts";
import { OrderedSpatialIndex } from "../src/game/OrderedSpatialIndex.ts";
import { disposeObjectTree } from "../src/game/sceneResources.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";

// Exercise the actual scene-owned drag/release/loose-physics methods without
// constructing WebGL or a browser. Only unrelated input systems are omitted.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), { mode: "transform" }) };
    return next(url, context);
  },
});
let PortfolioGame;
try { ({ PortfolioGame } = await import("../src/game/PortfolioGame.ts")); }
finally { hooks.deregister(); }

const no = () => false;
const noop = () => {};
function fixture() {
  const root = new THREE.Group();
  const game = Object.assign(Object.create(PortfolioGame.prototype), {
    currentZone: "falls", bounds: { kind: "circle", radius: 16.4 }, elapsed: 1,
    playerPosition: new THREE.Vector3(15, 0, 0), playerRadius: .4, playerCollisionHeight: 2.3,
    surfaceOffset: 0, jumpHeight: 0, movement: new THREE.Vector3(),
    kickables: [], staticColliders: [], surfaceAreas: [], staticColliderCandidates: [], surfaceAreaCandidates: [],
    staticColliderIndex: new OrderedSpatialIndex(), surfaceAreaIndex: new OrderedSpatialIndex(),
    walkingGeometryRevision: 0, pencilProps: [], interactions: [], heldKickable: null,
    telekinesisPointerId: null, telekinesisFixedBody: false, clickNavigationPress: null,
    telekinesisPlane: new THREE.Plane(), pointerRaycaster: new THREE.Raycaster(),
    telekinesisPreviousRay: new THREE.Ray(), telekinesisGripOffset: new THREE.Vector3(),
    telekinesisPreviousPoint: new THREE.Vector3(), telekinesisPoint: new THREE.Vector3(),
    telekinesisBodyFeet: new THREE.Vector3(), telekinesisPointerMotion: new THREE.Vector3(),
    tempBounds: new THREE.Box3(), tempDirection: new THREE.Vector3(), pointerActionHits: [],
    windowFocused: true, externalInputEnabled: true, transitioning: false,
    canvas: { style: {}, focus: noop, setPointerCapture: noop, hasPointerCapture: no, releasePointerCapture: noop },
    navigation: { cancel: noop }, consumeFocusReclaimPointer: no, isWorldPointerInteractionLocked: no,
    pongChallenge: { isMounted: no, isActive: no, releaseBallDrag: no, releasePaddleDrag: no, hasPointerDrag: no },
    archiveOrbitPlayground: { beginPointerDrag: no, releasePointerDrag: no, hasPointerDrag: no },
    archiveSignalPuzzle: { beginPointerDrag: no, releasePointerDrag: no, hasPointerDrag: no },
    voidTurtleRide: { isBoundKickable: no, isOrbitControlled: no, releaseAsteroidTelekinesis: no, releaseCargoTelekinesis: no },
    fallsCrystalFrog: { beginHold: no, releaseHold: no, owns: no, canGrab: no },
    beginMathInstanceDrag: no, releaseMathInstanceDrag: no, releaseAmbientGridDrag: no,
    findPointedPointerAction: () => null, isPointingAtWornCompass: no, isPointingAtWornPencil: no,
    updatePointerRay: noop, updatePointerRayAt: noop, tryCaptureTravelingAsteroidAsPongPacket: no,
    hooks: { onStatus: noop },
  });
  game.containsPropSurface = (surface, x, z, radius = 0) => radius > 0
    ? surfaceOverlapsCircle(surface, x, z, radius) : game.surfaceContainsPoint(surface, x, z);
  game.containsTelekinesisSupport = game.containsPropSurface;
  const ritual = new FallsRuneRitual({
    registerKickable: (...args) => game.registerKickable(...args), addAnimatedItem: noop,
    addInteraction: () => ({}), getElapsed: () => game.elapsed, isReducedMotion: no,
    getHeldKickable: () => game.heldKickable, getTelekinesisPlacementSurface: () => game.telekinesisPlacementSurface,
    surfaceContainsPoint: (...args) => game.surfaceContainsPoint(...args),
    onStatus: noop, getPlayerPosition: () => game.playerPosition,
  });
  // Texture content is unrelated to collision. No canvas is needed for its map.
  const glowTexture = new THREE.Texture();
  ritual.getRuneGroundGlowTexture = () => glowTexture;
  game.fallsRuneRitual = ritual;
  function block(id, x, z, width, depth, top, bottom = 0) {
    game.addStaticBox(x, (top + bottom) / 2, z, width / 2, (top - bottom) / 2, depth / 2, top - .005, top);
    const surface = { id, x, z, halfWidth: width / 2 - .005, halfDepth: depth / 2 - .005,
      requiresJump: false, heightAt: () => top };
    game.addSurfaceArea(surface);
    return surface;
  }
  function crystal(surface, x = surface.x, z = surface.z, decoy = false) {
    let carry;
    if (decoy) {
      const material = new THREE.MeshBasicMaterial({ color: 0xccccff });
      ritual.createRitualDecoyCrystal(root, "test-decoy", x, z, material, surface);
      material.dispose();
      carry = ritual.ritualCrystals.at(-1);
    } else {
      const state = ritual.createRuneCrystal(root, "moon", "Moon", x, z, -9.3, -1.75, 0xccccff, surface, 4.2);
      ritual.runeStones.set("moon", state);
      carry = state.carry;
    }
    return carry;
  }
  function aim(point, grip = game.telekinesisGripOffset, direction = new THREE.Vector3(-.6, -.8, -.5).normalize()) {
    game.pointerRaycaster.ray.direction.copy(direction);
    game.pointerRaycaster.ray.origin.copy(point).add(grip).addScaledVector(direction, -20);
  }
  function grab(carry) {
    aim(carry.object.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3());
    game.findPointedKickable = () => carry.kickable;
    game.handleTelekinesisDown(event("pointerdown"));
    assert.equal(game.heldKickable, carry.kickable);
  }
  function drag(carry, point, frames = 120, dt = 1 / 60, direction) {
    aim(point, game.telekinesisGripOffset, direction);
    game.telekinesisMoved = true;
    for (let i = 0; i < frames; i++) {
      game.elapsed += dt;
      game.updateHeldKickableFromPointer(dt);
    }
  }
  function event(type) { return { type, pointerType: "mouse", pointerId: 1, button: 0,
    isPrimary: true, clientX: 200, clientY: 200, timeStamp: game.elapsed * 1000, preventDefault: noop }; }
  function release(type = "pointerup") {
    game.handleTelekinesisUp(event(type));
    assert.equal(game.heldKickable, null);
  }
  function settle(frames = 180, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) { game.elapsed += dt; game.updateKickables(dt, false); }
  }
  return { game, ritual, root, block, crystal, aim, grab, drag, release, settle,
    dispose() { disposeObjectTree(root); glowTexture.dispose(); } };
}

test("a crystal released before placement dwell stays on its real floor despite the visual aura", () => {
  for (const decoy of [false, true]) {
    const f = fixture();
    try {
      const floor = f.block("bridge", 0, 0, 8, 2.2, 2.7, 2.37);
      const carry = f.crystal(floor);
      f.grab(carry);
      // Release immediately after an actual projected drag: no artificial dwell
      // that hides a bad transition behind the stable-placement fast path.
      f.drag(carry, new THREE.Vector3(.3, 2.71, 0), 1);
      f.game.telekinesisPlacementSettledFor = 0;
      f.release();
      f.settle();
      assert.ok(carry.object.position.y >= floor.heightAt() - .025,
        `crystal fell through bridge: decoy=${decoy}, y=${carry.object.position.y}`);
      assert.equal(carry.kickable.platform, floor);
      assert.equal(carry.kickable.onPlatform, true);
    } finally { f.dispose(); }
  }
});

test("a held crystal crosses a low bridge parapet on the same deck without getting pinned to its side", () => {
  const f = fixture();
  try {
    const floor = f.block("bridge", 0, 0, 8, 6, 2.7, 2.37);
    f.block("bridge-parapet", 0, 0, 8, .2, 3.08, 2.7);
    const carry = f.crystal(floor, 0, 1.6);
    f.grab(carry);
    f.drag(carry, new THREE.Vector3(0, 3.32, -1.6));
    assert.ok(Math.abs(carry.object.position.z + 1.6) < .1,
      `crystal stuck at parapet: ${JSON.stringify(carry.object.position)}`);
    f.release();
    f.settle();
    assert.equal(carry.kickable.platform, floor);
  } finally { f.dispose(); }
});


test("named and decoy crystals lift to higher terraces and release safely at different frame cadences", () => {
  for (const decoy of [false, true]) for (const cadence of [[1 / 30], [1 / 60], [.011, .033, .05, .016]]) {
    const f = fixture();
    try {
      const lower = f.block("lower-terrace", 3.5, 0, 4, 5, 1.35);
      const upper = f.block("upper-terrace", -2, 0, 4, 5, 4.2);
      const carry = f.crystal(lower);
      f.grab(carry);
      const goal = new THREE.Vector3(-2, 4.82, 0);
      f.aim(goal);
      f.game.telekinesisMoved = true;
      for (let frame = 0; frame < 300; frame++) {
        const dt = cadence[frame % cadence.length];
        f.game.elapsed += dt;
        f.game.updateHeldKickableFromPointer(dt);
        const p = carry.object.position;
        assert.ok(f.game.staticColliders.every(solid => !loosePropIntersectsSolid(
          p.x, p.z, carry.kickable.radius, p.y, p.y + carry.kickable.collisionHeight, solid)),
        `held body must not cross terrace solids: ${JSON.stringify(p)}`);
      }
      assert.ok(carry.object.position.distanceTo(goal) < .01,
        `higher target must be reached: ${JSON.stringify(carry.object.position)}`);
      f.release();
      for (let i = 0; i < 300; i++) f.settle(1, cadence[i % cadence.length]);
      assert.equal(carry.kickable.platform, upper);
      assert.equal(carry.kickable.onPlatform, true);
      assert.ok(Math.abs(carry.object.position.y - 4.2) < .025);
      const ray = new THREE.Raycaster(carry.object.position.clone().add(new THREE.Vector3(0, 6, 0)), new THREE.Vector3(0, -1, 0));
      carry.object.updateWorldMatrix(true, true);
      assert.ok(ray.intersectObject(carry.object, true).length > 0, "released crystal remains physically selectable");
    } finally { f.dispose(); }
  }
});

test("a crystal grabbed under a bridge hits its underside and returns to the lower floor on release", () => {
  const f = fixture();
  try {
    const lower = f.block("river-bed", 0, 0, 10, 8, .16, -.1);
    const bridge = f.block("bridge", 0, 0, 8, 3, 2.7, 2.37);
    const carry = f.crystal(lower);
    f.grab(carry);
    f.drag(carry, new THREE.Vector3(0, 3.32, 0), 100, 1 / 30, new THREE.Vector3(0, -1, 0));
    assert.ok(carry.object.position.y + carry.kickable.collisionHeight < 2.37,
      "projecting an upper deck must not pull a crystal through its underside");
    assert.notEqual(f.game.telekinesisPlacementSurface, bridge,
      "the shadow/placement cue must not claim the unreachable overhead deck");
    f.release();
    f.settle(180, 1 / 30);
    assert.notEqual(carry.kickable.platform, bridge);
    assert.equal(carry.kickable.platform, lower);
    assert.ok(Math.abs(carry.object.position.y - .16) < .025);
  } finally { f.dispose(); }
});

test("a partly overhanging crystal uses the same physical footprint for held contact and released support", () => {
  const f = fixture();
  try {
    const platform = f.block("narrow-deck", 0, 0, 2, 2, 2.7, 2.37);
    const carry = f.crystal(platform);
    f.grab(carry);
    // This is a clear held pose with part of the base still over the deck.
    carry.object.position.set(1.08, 2.7, 0);
    f.game.telekinesisPlacementSettledFor = 0;
    f.release();
    f.settle();
    assert.equal(carry.kickable.platform, platform);
    assert.ok(carry.object.position.y >= 2.675,
      "a release must not fall inside a slab that just supported the held body");
    f.ritual.updateRitualCrystalShadow(carry);
    assert.ok(Math.abs(carry.shadow.position.y - 2.712) < .001,
      "the shadow follows the same overhanging support as the physical body");
  } finally { f.dispose(); }
});

test("changing aura scale and restoration animation cannot change a released crystal's physical floor", () => {
  const f = fixture();
  try {
    const platform = f.block("terrace", 0, 0, 6, 6, 2.7);
    const carry = f.crystal(platform);
    f.grab(carry);
    f.drag(carry, new THREE.Vector3(0, 3.32, 0));
    const state = f.ritual.runeStones.get("moon");
    state.aura.scale.set(4, 8, 4);
    carry.object.scale.setScalar(.04);
    f.release();
    for (let i = 0; i < 180; i++) {
      carry.object.scale.setScalar(Math.min(1, .04 + i / 60));
      f.settle(1);
    }
    assert.equal(carry.kickable.platform, platform);
    assert.ok(Math.abs(carry.object.position.y - 2.7) < .025);
  } finally { f.dispose(); }
});

test("cancelled or lost crystal captures drop safely rather than applying the last fling", () => {
  for (const type of ["pointercancel", "lostpointercapture", "owner-cancel"]) {
    const f = fixture();
    try {
      const platform = f.block("bridge", 0, 0, 8, 2.2, 2.7, 2.37);
      const carry = f.crystal(platform);
      f.grab(carry);
      f.drag(carry, new THREE.Vector3(0, 3.32, 0));
      carry.kickable.velocity.set(8, 2, 0);
      f.game.telekinesisPreviousTime = f.game.elapsed * 1000;
      if (type === "owner-cancel") f.game.cancelTelekinesisHold();
      else f.release(type);
      assert.deepEqual(carry.kickable.velocity.toArray(), [0, 0, 0]);
      f.settle();
      assert.equal(carry.kickable.platform, platform);
      assert.ok(Math.abs(carry.object.position.x) < .025);
    } finally { f.dispose(); }
  }
});

test("repeated pickup and release cannot accumulate crystal floor offset or switch to a lower overlapping floor", () => {
  const f = fixture();
  try {
    f.block("river", 0, 0, 8, 8, .16, -.1);
    const bridge = f.block("bridge", 0, 0, 8, 2.2, 2.7, 2.37);
    const carry = f.crystal(bridge);
    for (let cycle = 0; cycle < 8; cycle++) {
      f.grab(carry);
      f.drag(carry, new THREE.Vector3(cycle % 2 ? .25 : -.25, 3.32, 0), 45, 1 / 30);
      f.release();
      f.settle(120, 1 / 30);
      assert.equal(carry.kickable.platform, bridge);
      assert.ok(Math.abs(carry.object.position.y - 2.7) < .025);
      assert.ok(Math.abs(carry.kickable.platformOffset) < .025);
    }
  } finally { f.dispose(); }
});
