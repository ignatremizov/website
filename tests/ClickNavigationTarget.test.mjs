import assert from "node:assert/strict";
import test from "node:test";
import { findNearbyClickLanding, findWallClickSurface, findWallClickLanding } from "../src/game/ClickNavigationTarget.ts";
import { loosePropIntersectsSolid } from "../src/game/LoosePropCollision.ts";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import * as THREE from "three";
import { OrderedSpatialIndex } from "../src/game/OrderedSpatialIndex.ts";
import { fallsBackgroundPillars, fallsLandmarks, forEachFallsTerrainBlock } from "../src/game/zones/falls/FallsLayout.ts";
import { createLayeredCliffGeometry } from "../src/game/zones/falls/FallsScenery.ts";
import { buildFallsTerrain } from "../src/game/zones/falls/FallsTerrain.ts";
import { disposeObjectTree } from "../src/game/sceneResources.ts";
import { canGuidedJump, hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { NavigationJob, planNavigationWork } from "../src/game/NavigationPlanning.ts";
import { selectDescendingLandingSurface } from "../src/game/SurfaceSelection.ts";
import { NavigationController } from "../src/game/NavigationController.ts";
import { FailedWalkingRequestCache } from "../src/game/GuidedWalkingRoute.ts";

// Load the actual runtime methods without constructing a renderer. The Vite
// graph uses extensionless imports and a few TS parameter properties.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      return {
        format: "module", shortCircuit: true,
        source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), { mode: "transform" }),
      };
    }
    return nextLoad(url, context);
  },
});
let PortfolioGame, VoidTurtleRide;
try {
  ({ PortfolioGame } = await import("../src/game/PortfolioGame.ts"));
  ({ VoidTurtleRide } = await import("../src/game/zones/field/VoidTurtleRide.ts"));
} finally {
  hooks.deregister();
}

const bounds = { kind: "circle", radius: 16.4 };

// The scene fixture still executes real picking/collision methods. Queue and
// follower state now belong to the real NavigationController, not PortfolioGame.
function attachNavigation(game) {
  const fields = {
    position: () => game.playerPosition,
    forward: () => game.cameraForward ?? new THREE.Vector3(0, 0, -1),
    right: () => game.cameraRight ?? new THREE.Vector3(1, 0, 0),
    zone: () => game.currentZone, revision: () => game.walkingGeometryRevision,
    elapsed: () => game.elapsed ?? 0, surfaceOffset: () => game.surfaceOffset,
    jumpHeight: () => game.jumpHeight, jumpVelocity: () => game.jumpVelocity ?? 0,
    activePlatform: () => game.activePlatform, speedMultiplier: () => game.speedMultiplier ?? 1,
    walkingSpeed: () => 4.25, sprintingSpeed: () => 6.8,
    inputEnabled: () => game.externalInputEnabled ?? true,
    transitioning: () => game.transitioning ?? false,
    locked: () => false, collapsing: () => game.worldCollapse != null,
    spellHeld: () => game.input?.isSpellHeld() ?? false,
    continuous: () => game.clickNavigationPress?.continuous ?? false,
    heldTarget: () => game.clickNavigationPress?.target ?? null,
  };
  const frame = Object.defineProperties({}, Object.fromEntries(
    Object.entries(fields).map(([key, get]) => [key, { get }]),
  ));
  game.navigation = new NavigationController({
    readFrame: () => frame, now: () => 0,
    refreshTarget: target => game.refreshClickNavigationTarget(target),
    isTargetReachable: target => game.isClickNavigationTargetPotentiallyReachable(target),
    distanceToSurface: target => game.distanceToClickNavigationSurface(target),
    goalClearance: target => game.getClickNavigationGoalClearance(target),
    findLegacyPath: (target, clearance) => game.findGuidedPath(target, clearance),
    createContext: (start, goal) => game.createNavigationPlanningContext(start, goal),
    supportHeight: point => game.navigationSupportHeight(point),
    canJumpFrom: (from, to) => game.canGuideJumpFrom(from, to),
    jumpDelay: (from, to) => game.findGuideJumpDelay(from, to),
    canDropFrom: (from, to) => game.canGuideDropFrom(from, to),
    sampleWalkHeight: (...args) => game.sampleGuidedWalkHeight(...args),
    surfaceContains: (...args) => game.surfaceContainsPoint(...args),
    onBegin() {},
    onHoverTarget: target => { game.clickNavigationHover = target; },
    onClearFeedback: () => {
      game.clickNavigationHover = null;
      game.clickNavigationHoverProjectionDirty = true;
      game.clickNavigationMarker?.hide();
    },
    cancelPress: () => { game.clickNavigationPress = null; },
    onStatus: message => game.hooks?.onStatus(message),
  });
}

function runtimeFixture() {
  const game = Object.assign(Object.create(PortfolioGame.prototype), {
    currentZone: "falls", bounds, playerRadius: 0.4, playerCollisionHeight: 2.3,
    playerPosition: new THREE.Vector3(7.6, 0, -5.75),
    surfaceOffset: fallsLandmarks.npcs.tinkerer.y + 1.1, jumpHeight: 0,
    activePlatform: null, walkingGeometryRevision: 0,
    surfaceAreas: [], staticColliders: [], surfaceAreaCandidates: [], staticColliderCandidates: [],
    clickNavigationSnapObstacles: [],
    surfaceAreaIndex: new OrderedSpatialIndex(), staticColliderIndex: new OrderedSpatialIndex(),
    tempBounds: new THREE.Box3(),
    hooks: { onStatus() {} },
  });
  // Constructor-owned callbacks only adapt the production methods.
  game.containsWalkingSupport = (surface, x, z) => game.isWithinSurfaceSupport(surface, x, z);
  game.sampleGuidedWalkHeight = (x, z, height) =>
    game.sampleWalkingHeight(x, z, height, game.playerRadius + 0.04, game.playerCollisionHeight, true);
  game.isGuidedJumpPositionClear = (x, z, feet, ascending, verticalTakeoff = false) => {
    const radius = game.playerRadius + (verticalTakeoff ? 0 : .02);
    const solids = game.staticColliderIndex.queryPoint(x, z, radius, game.staticColliderCandidates);
    return solids.every(solid =>
      solid.solidTop !== undefined && feet >= solid.solidTop - 0.015 ||
      ascending && solid.clearAbove !== undefined && feet >= solid.clearAbove - 0.01 ||
      !loosePropIntersectsSolid(x, z, radius, feet, feet + 2.3, solid));
  };
  game.guidedJumpLandingHeight = (px, pz, py, x, z, y) => {
    const surfaces = game.surfaceAreaIndex.queryPoint(x, z, 0, game.surfaceAreaCandidates);
    const found = selectDescendingLandingSurface(surfaces, px, pz, py, x, z, y,
      (surface, sx, sz) => game.surfaceContainsPoint(surface, sx, sz,
        surface.supportMargin ?? (surface.requiresJump ? 0.136 : 0)));
    return found?.heightAt(x, z) ?? null;
  };
  attachNavigation(game);
  return game;
}

function targetFor(surface) {
  return {
    surface, position: new THREE.Vector3(surface.x, surface.heightAt(surface.x, surface.z), surface.z),
    surfaceOffsetX: 0, surfaceOffsetZ: 0, markerY: 0, reachable: true,
  };
}

function queuedNavigationFixture() {
  const game = runtimeFixture();
  Object.assign(game, {
    externalInputEnabled: true, transitioning: false, worldCollapse: null,
    preferReducedMotion: true,
    pendingClickNavigation: null, deferredClickNavigationTarget: null, clickNavigation: null,
    failedWalkingRequests: new FailedWalkingRequestCache(), jumpVelocity: 0, speedMultiplier: 1,
    walkingRoutePosition: new THREE.Vector3(),
    cameraForward: new THREE.Vector3(0, 0, -1), cameraRight: new THREE.Vector3(1, 0, 0),
    input: { isSpellHeld: () => false }, isNavigationLocked: () => false,
  });
  game.playerPosition.set(0, 0, 10);
  game.surfaceOffset = 0;
  // Isolate queue/publication ownership with a clear floor. Terrain and the
  // actual follower's sequential-axis collisions are covered separately below.
  game.createNavigationPlanningContext = () => ({
    sample: () => 0, supports: [], canLand: () => true, canJump: () => false,
  });
  const surface = {
    id: "held-target-floor", x: 0, z: 14, halfWidth: 10, halfDepth: 10,
    requiresJump: false, heightAt: () => 0,
  };
  const target = (x = 0) => ({
    ...targetFor(surface), position: new THREE.Vector3(x, 0, 14), surfaceOffsetX: x,
  });
  return { game, target };
}

function onePlanningOperationPerFrame(t) {
  const advance = NavigationJob.prototype.advance;
  // Model a busy frame reaching its deadline after one cooperative operation,
  // without sleeps or wall-clock-dependent assertions.
  t.mock.method(NavigationJob.prototype, "advance", function () {
    advance.call(this, 1);
  });
}

// Exercise the production pointer dispatch as well as the real controller.
// Picking/DOM adapters are inert; no browser, renderer, or generated method body.
function pointerNavigationFixture() {
  const { game, target } = queuedNavigationFixture();
  const captures = new Set();
  let picked = target();
  Object.assign(game, {
    elapsed: 1,
    clickNavigationPress: null,
    telekinesisPointerId: null,
    consumeFocusReclaimPointer: () => false,
    canvas: {
      style: {}, focus() {},
      setPointerCapture: id => captures.add(id),
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture: id => captures.delete(id),
    },
    pongChallenge: { isMounted: () => false, isActive: () => false },
    voidTurtleRide: { isRiding: () => false },
    beginMathInstanceDrag: () => false,
    archiveSignalPuzzle: { beginPointerDrag: () => false },
    findPointedPointerAction: () => null,
    isPointingAtWornCompass: () => false,
    isPointingAtWornPencil: () => false,
    archiveOrbitPlayground: { beginPointerDrag: () => false },
    findPointedKickable: () => null,
    beginAmbientGridDrag: () => false,
    findClickNavigationTarget: () => picked,
    findClickNavigationTargetAt: () => picked,
  });
  const event = (type, overrides = {}) => ({
    type, isPrimary: true, button: 0, pointerId: 1, pointerType: "mouse",
    clientX: 200, clientY: 200, timeStamp: game.elapsed * 1000,
    preventDefault() {}, ...overrides,
  });
  const destination = z => ({
    ...target(), position: new THREE.Vector3(0, 0, z), surfaceOffsetZ: z - 14,
  });
  const tick = dt => {
    game.elapsed += dt;
    game.updateClickNavigationHold();
    const axes = { horizontal: 0, forward: 0, running: false };
    game.navigation.update(axes, dt, false, false);
    const speed = (axes.running ? 6.8 : 4.25) * dt;
    game.playerPosition.addScaledVector(game.cameraForward, axes.forward * speed)
      .addScaledVector(game.cameraRight, axes.horizontal * speed);
    return axes;
  };
  const start = () => {
    game.navigation.begin(destination(14));
    for (let i = 0; i < 1000 && game.navigation.hasPending; i++) game.navigation.updatePlanning();
    assert.ok(game.navigation.route, "fixture has an accepted walking route");
  };
  return { game, event, destination, tick, start, pick: value => { picked = value; } };
}

test("actual successive pointer clicks preserve walking before release and throughout retarget validation", (t) => {
  const advance = NavigationJob.prototype.advance;
  t.mock.method(NavigationJob.prototype, "advance", function () { advance.call(this, 8); });
  for (const cadence of [[1 / 30], [1 / 60], [0.011, 0.033, 0.05, 0.016]]) {
    const h = pointerNavigationFixture();
    h.start();
    h.game.navigation.trace.enabled = true;
    let destination = h.destination(14);
    for (let frame = 0; frame < 180 && h.game.navigation.hasFeedback; frame++) {
      if ([0, 8, 16].includes(frame)) {
        destination = h.destination(14.6 + frame / 8 * 0.5);
        h.pick(destination);
        const route = h.game.navigation.route;
        h.game.handleTelekinesisDown(h.event("pointerdown"));
        assert.equal(h.game.navigation.route, route,
          "pressing on a new destination must not discard the route before it can be extended");
      }
      if ([2, 10, 18].includes(frame)) {
        assert.equal(h.game.finishClickNavigationPress(h.event("pointerup")), true);
        assert.equal(h.game.finishClickNavigationPress(h.event("lostpointercapture")), false);
      }
      const before = h.game.playerPosition.clone();
      const shouldMove = destination.position.distanceTo(before) > 0.035;
      h.tick(cadence[frame % cadence.length]);
      if (shouldMove) assert.ok(h.game.playerPosition.distanceTo(before) > 0.0001,
        `pointer press/release inserted a stop at frame ${frame}, cadence ${cadence}`);
    }
    assert.equal(h.game.navigation.failure, null);
    assert.equal(h.game.navigation.hasPending, false);
    assert.ok(h.game.playerPosition.distanceTo(destination.position) < 0.035);
    assert.equal(h.game.navigation.trace.snapshot().some(entry =>
      entry.kind === "cancel" && entry.reason !== "Destination reached"), false);
  }
});

test("pointer presses keep pending work and cancelled replacement gestures cannot erase it", () => {
  for (const ending of ["pointercancel", "lostpointercapture"]) {
    const h = pointerNavigationFixture();
    h.game.navigation.begin(h.destination(14));
    const pending = h.game.navigation.pending;
    h.pick(h.destination(15));
    h.game.handleTelekinesisDown(h.event("pointerdown"));
    assert.equal(h.game.navigation.pending, pending);
    h.game.finishClickNavigationPress(h.event(ending));
    assert.equal(h.game.navigation.pending, pending);
    assert.equal(h.game.navigation.pendingTarget.position.z, 14, "cancel is not a new destination");
  }
});

test("deliberate holds and drags still stop on release after uninterrupted pointer steering", () => {
  for (const drag of [false, true]) {
    const h = pointerNavigationFixture();
    h.start();
    h.pick(h.destination(15));
    h.game.handleTelekinesisDown(h.event("pointerdown"));
    if (drag) h.game.updateClickNavigationPress(h.event("pointermove", { clientX: 230 }));
    for (let frame = 0; frame < (drag ? 3 : 13); frame++) {
      const before = h.game.playerPosition.clone();
      h.tick(1 / 30);
      assert.ok(h.game.playerPosition.distanceTo(before) > 0, "hold/drag steering stays active");
    }
    h.game.finishClickNavigationPress(h.event("pointerup", { clientX: drag ? 230 : 200 }));
    assert.equal(h.game.navigation.hasFeedback, false);
    assert.equal(h.game.navigation.consumeJump(), false);
  }
});

test("non-primary mouse buttons and locked input never interrupt an accepted route", () => {
  for (const locked of [false, true]) {
    const h = pointerNavigationFixture();
    h.start();
    const route = h.game.navigation.route;
    h.game.externalInputEnabled = !locked;
    h.game.handleTelekinesisDown(h.event("pointerdown", { button: locked ? 0 : 2 }));
    assert.equal(h.game.navigation.route, route);
    assert.equal(h.game.clickNavigationPress, null);
  }
});

test("pointer interaction priority still cancels movement for mechanisms, drags, focus recovery, and empty picks", () => {
  for (const kind of ["mechanism", "math", "optics", "orbit", "fabric", "compass", "pong-ball", "pong-paddle", "pong-court", "focus", "empty"]) {
    const h = pointerNavigationFixture();
    h.start();
    let actionRan = false;
    if (kind === "mechanism") {
      h.game.findPointedPointerAction = () => ({ object: {}, action() {} });
      h.game.runWorldAction = () => {
        assert.equal(h.game.navigation.hasFeedback, false, "movement stops before mechanism action");
        actionRan = true;
      };
    }
    if (kind === "math") h.game.beginMathInstanceDrag = () => true;
    if (kind === "optics") h.game.archiveSignalPuzzle.beginPointerDrag = () => true;
    if (kind === "orbit") h.game.archiveOrbitPlayground.beginPointerDrag = () => true;
    if (kind === "fabric") h.game.beginAmbientGridDrag = () => true;
    if (kind.startsWith("pong-")) {
      h.game.pongChallenge = {
        isMounted: () => true, isActive: () => true,
        beginBallDrag: () => kind === "pong-ball",
        beginPaddleDrag: () => kind === "pong-paddle",
      };
    }
    if (kind === "compass") {
      const kickable = {};
      h.game.findPointedKickable = () => kickable;
      h.game.compassProp = { kickable };
      h.game.acquireFieldCompass = () => { actionRan = true; };
    }
    if (kind === "focus") h.game.consumeFocusReclaimPointer = () => true;
    if (kind === "empty") h.pick(null);
    h.game.handleTelekinesisDown(h.event("pointerdown"));
    assert.equal(h.game.navigation.hasFeedback, false, `${kind} retains its priority over walking`);
    if (["mechanism", "compass"].includes(kind)) assert.equal(actionRan, true);
    if (kind === "focus") {
      h.game.finishClickNavigationPress(h.event("pointerup"));
      assert.equal(h.game.navigation.hasFeedback, false, "the focus-reclaiming click never commits navigation");
    }
  }
});

test("held blocked repicks preserve accepted work while showing the current local obstruction", (t) => {
  onePlanningOperationPerFrame(t);
  const { game, target } = queuedNavigationFixture();
  const accepted = target();
  game.navigation.queue(accepted);
  const pending = game.navigation.pending;
  const invalid = target(1);
  invalid.blockedAtPick = true;
  invalid.reachable = false;
  let picked = invalid;
  let shown;
  Object.assign(game, {
    elapsed: 1, clickNavigationMarkerPosition: new THREE.Vector3(),
    canvas: { style: {} },
    pongChallenge: { isActive: () => false }, voidTurtleRide: { isRiding: () => false },
    clickNavigationPress: {
      continuous: true, target: accepted, nextRetargetAt: 0,
      startedAt: 0, startClientX: 0, startClientY: 0,
      currentClientX: 10, currentClientY: 0, pointerType: "mouse",
    },
    findClickNavigationTargetAt: () => picked,
    clickNavigationMarker: {
      show(position, mode) { shown = { x: position.x, mode }; }, hide() {}, update() {}, showRouteAnchor() {},
    },
  });
  for (let frame = 0; frame < 12; frame += 1) {
    game.elapsed += 0.08;
    game.updateClickNavigationHold();
    assert.equal(game.navigation.pending, pending, "a rejected held sample cannot cancel useful work");
    assert.equal(pending.job.done, false);
    assert.equal(game.clickNavigationPress.target, accepted);
    game.updateClickNavigationMarker();
    assert.deepEqual(shown, { x: invalid.position.x, mode: "blocked" });
  }
  invalid.blockedAtPick = false;
  invalid.reachable = true;
  game.navigation.failures.remember(pending.start, invalid.position, invalid.surface.id, 0);
  game.elapsed += 0.08;
  game.updateClickNavigationHold();
  assert.equal(game.navigation.pending, pending, "a cached rejected retarget cannot cancel the accepted job");
  assert.equal(game.clickNavigationPress.target, accepted);
  picked = accepted;
  for (let frame = 0; frame < 150 && !game.navigation.routeState; frame += 1) {
    game.elapsed += 0.08;
    game.updateClickNavigationHold();
    game.navigation.updatePlanning();
  }
  assert.ok(game.navigation.routeState, "the actual held entry publishes after rejected repicks without restarting its job");
  assert.equal(game.navigation.pending, null);
  game.updateClickNavigationMarker();
  assert.deepEqual(shown, { x: accepted.position.x, mode: "reachable" });
});

test("a completed unsuccessful request retains readable failure feedback after hover leaves", () => {
  const { game, target } = queuedNavigationFixture();
  const destination = target(2);
  const messages = [];
  let shown;
  Object.assign(game, {
    hooks: { onStatus: message => messages.push(message) },
    elapsed: 1, clickNavigationPointerInside: false,
    clickNavigationMarkerPosition: new THREE.Vector3(),
    clickNavigationMarker: {
      show(position, mode, reason) { shown = { x: position.x, mode, reason }; },
      hide() { shown = null; }, update() {}, showRouteAnchor() {},
    },
  });
  game.navigation.queue(destination);
  game.navigation.pending.job = new NavigationJob((function* () { return null; })());
  game.navigation.updatePlanning();
  assert.equal(game.navigation.pending, null);
  game.clickNavigationHover = null;
  for (let frame = 0; frame < 12; frame += 1) game.updateClickNavigationMarker();
  assert.deepEqual(shown, { x: 2, mode: "failed", reason: "No route found" });
  assert.equal(messages.length, 1, "failure status is emitted on transition, not on every marker frame");
  game.navigation.queue(destination);
  assert.equal(messages.length, 1, "the cached identical failure does not spam another status");
  game.navigation.queue(target(-2));
  assert.equal(game.navigation.failureState, null, "a newly accepted command clears the previous failure");
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "planning");
  game.navigation.cancel();
  game.updateClickNavigationMarker();
  assert.equal(shown, null, "manual cancellation clears owned failure feedback too");
});

test("coalesced pending intent owns its snapshot instead of a mutable pointer record", () => {
  const { game, target } = queuedNavigationFixture();
  game.navigation.queue(target());
  const latest = target(1);
  game.navigation.queue(latest);
  latest.position.x = 8;
  latest.reachable = false;
  assert.equal(game.navigation.pending.latest.position.x, 1);
  assert.equal(game.navigation.pending.latest.reachable, true,
    "later picker reuse cannot turn an accepted request into a silent rejection");
});

test("disabled pending destinations finish with a landing reason rather than disappearing", () => {
  const { game, target } = queuedNavigationFixture();
  game.hooks = { onStatus() {} };
  const destination = target();
  game.navigation.queue(destination);
  destination.surface.enabled = false;
  game.navigation.pending.job = new NavigationJob((function* () { return null; })());
  game.navigation.updatePlanning();
  assert.equal(game.navigation.pending, null);
  assert.equal(game.navigation.failureState.reason, "Landing changed");
});

test("authored routes and pending requests expire when geometry or jump speed changes", () => {
  const { game, target } = queuedNavigationFixture();
  const initial = game.getNavigationRouteGraph();
  assert.equal(game.getNavigationRouteGraph(), initial);

  game.addStaticCollider({
    x: 2, y: 1, z: 12, halfWidth: 0.5, halfHeight: 1, halfDepth: 0.5,
  });
  const changedGeometry = game.getNavigationRouteGraph();
  assert.notEqual(changedGeometry, initial);
  game.setSpeedMultiplier(1);
  assert.equal(game.getNavigationRouteGraph(), changedGeometry, "an unchanged command does not discard warm edges");

  game.navigation.queue(target());
  const previousRequest = game.navigation.pending;
  game.setSpeedMultiplier(2);
  assert.notEqual(game.getNavigationRouteGraph(), changedGeometry);
  game.navigation.updatePlanning();
  assert.equal(previousRequest.job.done, true, "old arc assumptions cannot survive in a suspended job");
  assert.equal(previousRequest.job.result, null);
  assert.notEqual(game.navigation.pending, previousRequest);
  assert.equal(game.navigation.pending.revision, game.walkingGeometryRevision);

  const changedSpeed = game.getNavigationRouteGraph();
  game.clearSurfaceAreas();
  assert.notEqual(game.getNavigationRouteGraph(), changedSpeed, "teardown registration changes retire old edge checks");
  game.currentZone = "grid";
  assert.equal(game.getNavigationRouteGraph(), undefined, "Falls anchors are not offered in another world");
});

test("a clicked destination remains visible while planning, independently of hover and pointer position", () => {
  const { game, target } = queuedNavigationFixture();
  let shown = null;
  let canceled = 0;
  Object.assign(game, {
    clickNavigationPointerInside: true,
    clickNavigationMarkerPosition: new THREE.Vector3(),
    elapsed: 1, preferReducedMotion: true,
    clickNavigationMarker: {
      show(position, mode) { shown = { position: position.clone(), mode }; },
      hide() { shown = null; },
      update() {},
      showRouteAnchor() {},
    },
  });
  const destination = target(2);
  game.navigation.pending = {
    latest: destination, job: { cancel() { canceled += 1; } },
  };
  game.clickNavigationHover = target(-3);
  // No camera is needed: the committed request owns the marker, so idle-hover
  // picking must be skipped even if the mouse has moved elsewhere.
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "planning");
  assert.equal(shown.position.x, 2);

  game.clickNavigationPointerInside = false;
  game.clickNavigationHover = null;
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "planning", "leaving the canvas does not abandon a one-shot destination");
  assert.equal(shown.position.z, 14);

  game.navigation.routeState = { target: destination };
  game.navigation.pending.latest = target(4);
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "planning");
  assert.equal(shown.position.x, 4, "a replacement shows the new request while the old route can still move");
  game.navigation.pending = null;
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "active", "publication changes feedback from searching to moving");
  assert.equal(shown.position.x, 2);

  game.navigation.deferredTarget = target(3);
  game.updateClickNavigationMarker();
  assert.equal(shown.mode, "planning", "coalesced intent keeps feedback between jobs");
  game.navigation.pending = { latest: target(3), job: { cancel() { canceled += 1; } } };
  game.navigation.cancel();
  game.updateClickNavigationMarker();
  assert.equal(shown, null);
  assert.equal(canceled, 1);
  assert.equal(game.navigation.deferredTarget, null);
});

test("a continuously retargeted held route publishes checked geometry and starts moving", (t) => {
  onePlanningOperationPerFrame(t);
  const { game, target } = queuedNavigationFixture();
  let latest = target();
  game.navigation.queue(latest);
  let moving = false;
  for (let frame = 0; frame < 150 && !game.navigation.routeState; frame += 1) {
    if (frame % 5 === 0) {
      latest = target(frame / 5 * 0.04);
      game.navigation.queue(latest);
    }
    const axes = { forward: 0, horizontal: 0, running: false };
    game.navigation.update(axes, 1 / 60, false, false);
    moving = Math.abs(axes.forward) > 0.01 || Math.abs(axes.horizontal) > 0.01;
  }
  const route = game.navigation.routeState;
  assert.ok(route, "later pointer updates must not veto every completed validation");
  assert.ok(moving, "publication permits actual follower input, not another immediate freeze");
  assert.equal(game.navigation.pending, null);
  assert.deepEqual(route.legs.at(-1).path.at(-1), {
    x: route.target.position.x, y: route.target.position.y, z: route.target.position.z,
  }, "the active target must describe the checked endpoint, not newer unchecked intent");
  assert.ok(route.target.position.x < latest.position.x);
  assert.deepEqual(game.navigation.deferredTarget.position, latest.position);

  const newer = target(latest.position.x + 0.04);
  game.navigation.queue(newer);
  assert.equal(game.navigation.pending, null, "a held event still coalesces the deferred intent");
  const axes = { forward: 0, horizontal: 0, running: false };
  game.navigation.update(axes, 1 / 60, false, false);
  assert.equal(game.navigation.pending.validating, false, "the replacement starts in the background");
  assert.deepEqual(game.navigation.pending.latest.position, newer.position);
  assert.ok(Math.abs(axes.forward) > 0.01, "the checked route continues while its replacement is planned");

  game.navigation.cancel();
  game.navigation.updatePlanning();
  assert.equal(game.navigation.pending, null);
  assert.equal(game.navigation.deferredTarget, null, "cancel cannot resurrect a deferred destination");
});

test("sub-arrival held-pointer drift is measured from the checked endpoint, not successive events", (t) => {
  onePlanningOperationPerFrame(t);
  const { game, target } = queuedNavigationFixture();
  game.navigation.queue(target());
  for (let frame = 0; frame < 150 && !game.navigation.routeState; frame += 1) {
    if (frame % 5 === 0) game.navigation.queue(target(frame * 0.00001));
    game.navigation.updatePlanning();
  }
  assert.ok(game.navigation.routeState);
  assert.equal(game.navigation.deferredTarget, null);
  const checkedX = game.navigation.routeState.target.position.x;
  game.navigation.queue(target(checkedX + 0.02));
  assert.equal(game.navigation.pending, null);
  game.navigation.queue(target(checkedX + 0.04));
  assert.ok(game.navigation.pending, "accumulated drift eventually requires a checked retarget");
});

test("a deferred replacement validates the moved start and eventually reaches the newest held destination", (t) => {
  onePlanningOperationPerFrame(t);
  const { game, target } = queuedNavigationFixture();
  let latest = target();
  game.navigation.queue(latest);
  let publications = 0;
  let previousRoute = null;
  let validatedMovedStart = false;
  const delta = 1 / 60;
  for (let frame = 0; frame < 900; frame += 1) {
    if (frame <= 120 && frame % 5 === 0) {
      latest = target(frame / 5 * 0.04);
      game.navigation.queue(latest);
    }
    const axes = { forward: 0, horizontal: 0, running: false };
    game.navigation.update(axes, delta, false, false);
    const pending = game.navigation.pending;
    if (pending?.validating && Math.abs(pending.start.z - 10) > 0.1) {
      validatedMovedStart = true;
    }
    const route = game.navigation.routeState;
    if (route && route !== previousRoute) {
      publications += 1;
      const checkedGoal = route.legs.at(-1).path.at(-1);
      assert.equal(checkedGoal.x, route.target.position.x);
      assert.equal(checkedGoal.z, route.target.position.z);
      assert.ok(Math.hypot(route.path[0].x - game.playerPosition.x,
        route.path[0].z - game.playerPosition.z) <= 0.025,
      "replacement publication uses the current validated start");
    }
    previousRoute = route;
    // Clear-floor locomotion; ownership, jobs, and follower input are real.
    // The separate terrain fixture exercises physical collision/support updates.
    const distance = (axes.running ? 6.8 : 4.25) * delta;
    game.playerPosition.addScaledVector(game.cameraForward, axes.forward * distance)
      .addScaledVector(game.cameraRight, axes.horizontal * distance);
    if (frame > 120 && !route && !pending && !game.navigation.deferredTarget) break;
  }
  assert.ok(publications >= 2, "a replacement must publish after the initial checked route");
  assert.equal(validatedMovedStart, true);
  assert.equal(game.navigation.pending, null);
  assert.equal(game.navigation.deferredTarget, null);
  assert.equal(game.navigation.routeState, null);
  assert.ok(game.playerPosition.distanceTo(latest.position) < 0.035,
    "newer intent survives completion of older routes");
});

test("surface changes supersede pending validation; committed jumps retain deferred intent", (t) => {
  onePlanningOperationPerFrame(t);
  const { game, target } = queuedNavigationFixture();
  game.navigation.queue(target());
  for (let frame = 0; !game.navigation.pending.validating && frame < 100; frame += 1) {
    game.navigation.updatePlanning();
  }
  const changed = target(0.04);
  changed.surface = { ...changed.surface, id: "other-support" };
  game.navigation.queue(changed);
  for (let frame = 0; frame < 150 && !game.navigation.routeState; frame += 1) {
    game.navigation.updatePlanning();
  }
  assert.equal(game.navigation.routeState.target.surface, changed.surface);
  assert.deepEqual(game.navigation.routeState.target.position, changed.position);

  game.navigation.deferredTarget = target(0.1);
  game.navigation.routeState.jumpTriggered = true;
  game.navigation.updatePlanning();
  assert.equal(game.navigation.pending, null, "never replace a committed jump");
  assert.ok(game.navigation.deferredTarget, "retain newer intent until a safe grounded transition");
  game.navigation.routeState.jumpTriggered = false;
  const route = game.navigation.routeState;
  route.legIndex = route.legs.length - 1;
  game.navigation.advanceLeg(route);
  assert.equal(game.navigation.routeState, null);
  assert.ok(game.navigation.deferredTarget, "finishing the older route must not discard newer intent");
  game.navigation.updatePlanning();
  assert.ok(game.navigation.pending);
});

function executionFixture(withTerrain = true) {
  const game = runtimeFixture();
  Object.assign(game, {
    speedMultiplier: 1, jumpVelocity: 0, spawn: new THREE.Vector3(),
    walkingRoutePosition: new THREE.Vector3(), cameraForward: new THREE.Vector3(0, 0, -1),
    cameraRight: new THREE.Vector3(1, 0, 0), movement: new THREE.Vector3(),
    collisionSafeLanding: { valid: false }, surfaceSelection: {}, surfaceSelectionFrame: {},
    surfaceAreaIndex: new OrderedSpatialIndex(4, surface =>
      Math.max(surface.supportMargin ?? (surface.requiresJump ? 0.136 : 0),
        surface.edgeGrace ?? (surface.requiresJump ? 0.136 : 0))),
    pendingClickNavigation: null, clickNavigationJumpQueued: false, noclip: false,
    supportsSurface: (surface, x, z) => game.isWithinSurfaceSupport(surface, x, z),
    updateSplash: () => {}, hooks: { onStatus: () => {} },
    cancelClickNavigation: () => { game.navigation.routeState = null; },
    failClickNavigation: () => { assert.fail("generated route failed during actual movement"); },
    queueClickNavigation: () => { assert.fail(`generated route stalled or requested replanning: ${JSON.stringify({
      position: game.playerPosition, height: game.surfaceOffset,
      waypoint: game.navigation.routeState?.path[game.navigation.routeState.waypointIndex],
      path: game.navigation.routeState?.path,
      sample: game.sampleGuidedWalkHeight(game.playerPosition.x, game.playerPosition.z, game.surfaceOffset),
      solids: game.staticColliders.filter(solid => loosePropIntersectsSolid(
        game.playerPosition.x, game.playerPosition.z, 0.44, game.surfaceOffset, game.surfaceOffset + 2.3, solid)),
    })}`); },
  });
  if (withTerrain) forEachFallsTerrainBlock(block => {
    const bottom = block.bottom ?? 0;
    const solid = game.addStaticBox(block.x, (block.top + bottom) / 2, block.z,
      block.width / 2, (block.top - bottom) / 2, block.depth / 2,
      block.top - 0.005, block.top);
    solid.stepHeight = 0.28;
    game.addSurfaceArea({
      id: `falls-${block.id}`, x: block.x, z: block.z,
      halfWidth: block.width / 2 - 0.005, halfDepth: block.depth / 2 - 0.005,
      requiresJump: false, stepHeight: 0.28, snapGroundedHeight: true,
      supportMargin: block.kind === "step" ? 0.015 : 0.12,
      edgeGrace: block.kind === "step" ? 0.015 : 0.12,
      heightAt: () => block.top,
    });
  });
  game.navigation.queue = game["queueClickNavigation"];
  game.navigation.failRoute = game["failClickNavigation"];

  return game;
}

test("clicking the sleeping turtle approaches the real rim, lands, and yields to its bounce; awake shells allow landing", () => {
  for (const awake of [false, true]) for (const cadence of [[1 / 30], [1 / 60], [.011, .033, .05, .016]]) {
    const game = executionFixture(false);
    Object.assign(game, {
      currentZone: "field", bounds: { kind: "circle", radius: 18.2 }, elapsed: 0,
      surfaceOffset: 0, jumpHeight: 0, activePlatform: null,
      externalInputEnabled: true, transitioning: false, worldCollapse: null,
      input: { isSpellHeld: () => false }, canvas: { style: {}, hasPointerCapture: () => false },
      clickNavigationPress: null,
    });
    const shell = { id: "void-turtle-shell", x: 15, z: 15, halfWidth: 2.2, halfDepth: 2.35,
      requiresJump: true, heightAt: () => 1.46 + Math.sin(game.elapsed + .7) * .16 };
    const ride = new VoidTurtleRide({});
    ride.turtle = { surface: shell, riding: false, awake, buckAge: 2 };
    game.voidTurtleRide = ride;
    game.addSurfaceArea(shell, true);
    game.playerPosition.set(10, 0, 10);
    attachNavigation(game);
    game.navigation.trace.enabled = true;
    const destination = targetFor(shell);
    game.snapClickNavigationTarget(destination);
    assert.equal(game.isClickNavigationTargetPotentiallyReachable(destination), true,
      "the registered shell is a valid jump target outside the ordinary ground disk");
    assert.equal(game.surfaceContainsPoint(shell, destination.position.x, destination.position.z), true);
    assert.equal(game.isInsidePlayableBounds(destination.position.x, destination.position.z), false,
      "snapping must keep the turtle landing on its shell, not unrelated island ground");
    assert.ok(Math.abs(destination.position.y - shell.heightAt()) < .001);
    assert.equal(game.sampleClickNavigationLanding(null, 15, 15), null,
      "the exception does not turn surrounding void into walkable ground");
    assert.equal(game.sampleClickNavigationLanding({ ...shell }, 15, 15), null,
      "a copied ID is not the registered turtle's boundary exception");
    assert.equal(game.navigation.begin(destination), true);
    let launched = false, bounced = false, landedAwake = false;
    for (let frame = 0; frame < 1800; frame++) {
      const dt = cadence[frame % cadence.length];
      game.elapsed += dt;
      const previousFeet = game.surfaceOffset + game.jumpHeight;
      const previousX = game.playerPosition.x, previousZ = game.playerPosition.z;
      const requested = game.navigation.consumeJump();
      launched ||= requested;
      game.updateJump(dt, requested);
      const axes = { horizontal: 0, forward: 0, running: false };
      game.navigation.update(axes, dt, false, false);
      game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
        .addScaledVector(game.cameraRight, axes.horizontal)
        .multiplyScalar((axes.running ? 6.8 : 4.25) * dt);
      const desired = game.playerPosition.clone().add(game.movement);
      game.constrainToBounds(desired);
      if (Math.abs(axes.horizontal) > .01 || Math.abs(axes.forward) > .01)
        game.moveWithCollisions(desired, previousFeet);
      game.updateWorldSurface(dt, game.playerPosition, previousFeet, previousX, previousZ);
      if (ride.turtle.buckAge === 0) { bounced = true; break; }
      if (game.activePlatform === shell) { landedAwake = true; break; }
      if (game.navigation.failure) break;
    }
    assert.equal(launched, true, `no jump at cadence ${cadence}`);
    assert.equal(game.navigation.failure, null, JSON.stringify(game.navigation.trace.snapshot()));
    if (awake) {
      assert.equal(landedAwake, true, JSON.stringify(game.navigation.trace.snapshot()));
      const resting = game.playerPosition.clone();
      game.constrainToBounds(resting);
      assert.ok(resting.distanceTo(game.playerPosition) < .001, "awake support must not snap back to the island");
      assert.equal(ride.triggerShellBounce(), null);
      const onShell = { ...destination, position: new THREE.Vector3(15.2, shell.heightAt(), 15.1),
        surfaceOffsetX: .2, surfaceOffsetZ: .1 };
      game.snapClickNavigationTarget(onShell);
      assert.ok(Math.abs(onShell.position.x - 15.2) < .001, "awake shell walks do not snap to the entry cap");
      assert.equal(game.findGuidedPath(onShell.position).length, 2,
        "moving on the awake shell does not re-approach from the island");
    } else {
      assert.equal(bounced, true, JSON.stringify(game.navigation.trace.snapshot()));
      assert.equal(game.navigation.hasFeedback, false, "bounce owns movement instead of retrying the same landing");
      assert.equal(game.navigation.consumeJump(), false);
      assert.ok(game.jumpVelocity > 7.4, "shell provides the existing trampoline impulse");
    }
  }
});

test("clear Field rim clicks do not fail because a rounded pathfinding cell lies outside the disk", () => {
  const game = runtimeFixture();
  Object.assign(game, { currentZone: "field", bounds: { kind: "circle", radius: 18.2 },
    surfaceOffset: 0, jumpHeight: 0, voidTurtleRide: { getShellSurface: () => null } });
  for (let i = 0; i < 72; i++) {
    const angle = i * Math.PI * 2 / 72;
    game.playerPosition.set(Math.cos(angle - .12) * 17.55, 0, Math.sin(angle - .12) * 17.55);
    const target = new THREE.Vector3(Math.cos(angle) * 17.65, 0, Math.sin(angle) * 17.65);
    assert.equal(game.isInsidePlayableBounds(target.x, target.z), true);
    const path = game.findGuidedPath(target, .3);
    assert.ok(path.length > 0, `clear border connection at bearing ${i}`);
    assert.deepEqual(path.at(-1), target);
  }
});

test("a generated river-to-right-stairs walking plan survives the real movement/support frame order", () => {
  const game = executionFixture();
  const start = { x: 1.3, y: -0.16, z: 3.4 };
  const goal = { x: 5.6, y: 1.05 + (2.7 - 1.05) / 7 * 4, z: 5.9 };
  game.playerPosition.set(start.x, 0, start.z);
  game.surfaceOffset = start.y;
  const context = game.createNavigationPlanningContext(start, goal);
  // This scenario specifically verifies the authored walking connection,
  // independently of the planner's optional faster jumping shortcuts.
  context.canJump = () => false;
  const job = new NavigationJob(planNavigationWork(start, goal, context));
  for (let frame = 0; !job.done && frame < 10000; frame += 1) job.advance(192);
  assert.equal(job.done, true);
  assert.ok(job.result, "the request must generate a real route before execution");
  assert.ok(job.result.every(leg => leg.kind === "walk"));
  const route = {
    legs: job.result, legIndex: -1, target: { position: new THREE.Vector3(goal.x, goal.y, goal.z) },
  };
  game.navigation.routeState = route;
  game.navigation.advanceLeg(route);
  const delta = 1 / 60;
  for (let frame = 0; game.navigation.routeState && frame < 1800; frame += 1) {
    const previousFeet = game.surfaceOffset + game.jumpHeight;
    const previousX = game.playerPosition.x;
    const previousZ = game.playerPosition.z;
    const requested = game.navigation.jumpQueued;
    game.navigation.jumpQueued = false;
    game.updateJump(delta, requested);
    const axes = { horizontal: 0, forward: 0, running: false };
    game.navigation.updatePlanned(route, axes, delta);
    game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
      .addScaledVector(game.cameraRight, axes.horizontal)
      .multiplyScalar((axes.running ? 6.8 : 4.25) * delta);
    // Match the frame's movement threshold; tiny steering must not create
    // artificial test-only motion that makes exact waypoint arrival pass.
    if (Math.abs(axes.horizontal) > 0.01 || Math.abs(axes.forward) > 0.01) {
      game.moveWithCollisions(game.playerPosition.clone().add(game.movement), previousFeet);
    }
    game.updateWorldSurface(delta, game.playerPosition, previousFeet, previousX, previousZ);
  }
  assert.equal(game.navigation.routeState, null, "the real follower reaches the generated goal");
  assert.ok(Math.hypot(game.playerPosition.x - goal.x, game.playerPosition.z - goal.z) < 0.035);
  assert.ok(Math.abs(game.surfaceOffset - goal.y) < 0.08);
});

test("a narrow 1.5m landing survives actual player collision and support execution at Low and variable cadence", () => {
  for (const cadence of [[1 / 30], [1 / 60], [0.011, 0.033, 0.05, 0.016]]) {
    const game = executionFixture(false);
    game.playerPosition.set(8, 0, 8);
    game.surfaceOffset = 0;
    game.jumpHeight = 0;
    game.addStaticBox(11.5, 0.75, 8, 0.52, 0.75, 1, 1.495, 1.5);
    const shelf = {
      id: "cadence-regression-shelf", x: 11.5, z: 8, halfWidth: 0.515, halfDepth: 0.995,
      requiresJump: true, supportMargin: 0.015, edgeGrace: 0.015, heightAt: () => 1.5,
    };
    game.addSurfaceArea(shelf);
    game.canGuideJumpFrom = (from, to) => hasGuidedJumpClearance(from, to, 6.8,
      (x, z, feet, ascending) => game.staticColliders.every(solid =>
        feet >= solid.solidTop - 0.015 ||
        (ascending && feet >= solid.clearAbove - 0.01) ||
        !loosePropIntersectsSolid(x, z, 0.42, feet, feet + 2.3, solid)),
      (px, pz, py, x, z, y) => {
        const hit = selectDescendingLandingSurface(game.surfaceAreas, px, pz, py, x, z, y,
          (surface, sx, sz) => game.surfaceContainsPoint(surface, sx, sz, surface.supportMargin ?? 0.136));
        return hit?.heightAt(x, z) ?? null;
      });
    // Use real planning and the extracted controller; only the scene construction
    // is headless. Unlike the simple queue fixtures, movement/collision/support
    // run PortfolioGame's actual production methods in the real frame order.
    attachNavigation(game);
    game.navigation.trace.enabled = true;
    const destination = { ...targetFor(shelf), position: new THREE.Vector3(11, 1.5, 8), surfaceOffsetX: -0.5 };
    assert.equal(game.navigation.begin(destination), true);
    let launched = false;
    for (let frame = 0; frame < 600 && (game.navigation.route || game.navigation.hasPending); frame++) {
      const delta = cadence[frame % cadence.length];
      game.elapsed = (game.elapsed ?? 0) + delta;
      const previousFeet = game.surfaceOffset + game.jumpHeight;
      const previousX = game.playerPosition.x;
      const previousZ = game.playerPosition.z;
      const requested = game.navigation.consumeJump();
      launched ||= requested;
      game.updateJump(delta, requested);
      const axes = { horizontal: 0, forward: 0, running: false };
      game.navigation.update(axes, delta, false, false);
      game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
        .addScaledVector(game.cameraRight, axes.horizontal)
        .multiplyScalar((axes.running ? 6.8 : 4.25) * delta);
      if (Math.abs(axes.horizontal) > 0.01 || Math.abs(axes.forward) > 0.01) {
        game.moveWithCollisions(game.playerPosition.clone().add(game.movement), previousFeet);
      }
      game.updateWorldSurface(delta, game.playerPosition, previousFeet, previousX, previousZ);
    }
    assert.equal(launched, true);
    assert.equal(game.navigation.failure, null, `actual landing fails at cadence ${cadence}: ${JSON.stringify({ position: game.playerPosition, offset: game.surfaceOffset, height: game.jumpHeight, velocity: game.jumpVelocity, platform: game.activePlatform?.id, trace: game.navigation.trace.snapshot() })}`);
    assert.equal(game.navigation.route, null);
    assert.equal(game.navigation.hasPending, false);
    assert.equal(game.activePlatform, shelf);
    assert.ok(Math.abs(game.surfaceOffset - 1.5) < 0.015);
  }
});

test("trace 148 returns beneath the bridge and walks the Tide stairs without jump impulses", () => {
  // Exact endpoints from navigation-trace(1).json, not inferred from screenshots.
  const cove = { x: -1.5728980737719507, y: 0.75, z: -1.6387011013496444 };
  const tread = { x: -1.6789769986613639, y: 0.6750000059604646, z: 6.973266508577014 };
  for (const cadence of [[1 / 30], [1 / 60], [0.011, 0.033, 0.05, 0.016]]) {
    for (const returning of [true, false]) {
      const game = executionFixture();
      attachNavigation(game);
      game.addStaticBox(2.05, 0.7, 5.15, 1.25, 0.75, 1.25, 0.7, 0.82);
      game.addSurfaceArea({ id: "rune-altar", x: 2.05, z: 5.15, halfWidth: 1.08,
        halfDepth: 1.08, requiresJump: true, heightAt: () => 0.82 });
      const from = returning ? cove : tread;
      const to = returning ? tread : cove;
      game.playerPosition.set(from.x, 0, from.z);
      game.surfaceOffset = from.y;
      game.activePlatform = game.surfaceAreas.find(surface => surface.id ===
        (returning ? "falls-cove-first-step" : "falls-tide-entry-2"));
      const targetSurface = game.surfaceAreas.find(surface => surface.id ===
        (returning ? "falls-tide-entry-2" : "falls-cove-first-step"));
      const destination = { ...targetFor(targetSurface), position: new THREE.Vector3(to.x, to.y, to.z),
        surfaceOffsetX: to.x - targetSurface.x, surfaceOffsetZ: to.z - targetSurface.z };
      const bridge = game.staticColliders.find(solid => Math.abs(solid.x + 2.1) < 0.001 && Math.abs(solid.z - 2.4) < 0.001);
      game.navigation.trace.enabled = true;
      assert.equal(game.navigation.begin(destination), true);
      let jumps = 0;
      let walkedUnderBridge = false;
      const published = [];
      let previousRoute;
      for (let frame = 0; frame < 2400 && (game.navigation.route || game.navigation.hasPending); frame++) {
        const dt = cadence[frame % cadence.length];
        game.elapsed = (game.elapsed ?? 0) + dt;
        const previousFeet = game.surfaceOffset + game.jumpHeight;
        const previousX = game.playerPosition.x, previousZ = game.playerPosition.z;
        const requested = game.navigation.consumeJump();
        jumps += Number(requested);
        game.updateJump(dt, requested);
        const axes = { horizontal: 0, forward: 0, running: false };
        game.navigation.update(axes, dt, false, false);
        if (game.navigation.route && game.navigation.route !== previousRoute) {
          published.push(game.navigation.route.legs.map(leg => leg.kind));
          previousRoute = game.navigation.route;
        }
        game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
          .addScaledVector(game.cameraRight, axes.horizontal)
          .multiplyScalar((axes.running ? 6.8 : 4.25) * dt);
        if (Math.abs(axes.horizontal) > 0.01 || Math.abs(axes.forward) > 0.01) {
          game.moveWithCollisions(game.playerPosition.clone().add(game.movement), previousFeet);
        }
        game.updateWorldSurface(dt, game.playerPosition, previousFeet, previousX, previousZ);
        const feet = game.surfaceOffset + game.jumpHeight;
        assert.equal(loosePropIntersectsSolid(game.playerPosition.x, game.playerPosition.z,
          0.4, feet, feet + 2.3, bridge), false, "the executed body must not intersect the bridge");
        walkedUnderBridge ||= game.playerPosition.z > 1.5 && game.playerPosition.z < 3 && feet < 0.05;
      }
      const detail = JSON.stringify({ returning, cadence, position: game.playerPosition, height: game.surfaceOffset,
        published, trace: game.navigation.trace.snapshot() });
      assert.equal(game.navigation.failure, null, detail);
      assert.equal(game.navigation.hasPending, false, detail);
      assert.equal(game.navigation.route, null, detail);
      assert.equal(walkedUnderBridge, true);
      assert.equal(jumps, returning ? 0 : 1, "only the ascent onto the waterfall platform needs a jump");
      assert.equal(game.navigation.trace.snapshot().some(event => event.kind === "collision-recovery"), false);
      assert.ok(Math.hypot(game.playerPosition.x - to.x, game.playerPosition.z - to.z) < 0.15, detail);
      assert.ok(Math.abs(game.surfaceOffset - to.y) < 0.08, detail);
    }
  }
});

test("trace 369 jumps from beside the monument without visiting the Tide stairs", () => {
  // Exact request endpoints from navigation-trace(2).json. The original plan
  // walked to falls-tide-entry-0 before its fourth leg jumped to rune-altar.
  const starts = [
    { x: 1.7167451451269071, y: -0.16, z: 6.824321326906388 },
    // Physical contact leaves 6 mm separation; it must not require moving
    // away to satisfy navigation's extra 2 cm horizontal travel margin.
    { x: 1.7167451451269071, y: -0.16, z: 6.806 },
    { x: 0.394, y: -0.16, z: 5.15 },
    { x: 3.706, y: -0.16, z: 5.15 },
  ];
  const to = { x: 2.0988782901473773, y: 0.82, z: 5.272540106231773 };
  for (const from of starts) for (const cadence of [[1 / 30], [1 / 60], [0.011, 0.033, 0.05, 0.016]]) {
    const game = executionFixture();
    attachNavigation(game);
    const { x, z } = fallsLandmarks.monument;
    const altar = game.addStaticBox(x, 0.7, z, 1.25, 0.75, 1.25, 0.7, 0.82);
    const surface = { id: "rune-altar", x, z, halfWidth: 1.08, halfDepth: 1.08,
      requiresJump: true, heightAt: () => 0.82 };
    game.addSurfaceArea(surface);
    game.playerPosition.set(from.x, 0, from.z);
    game.surfaceOffset = from.y;
    game.navigation.trace.enabled = true;
    const target = { ...targetFor(surface), position: new THREE.Vector3(to.x, to.y, to.z),
      surfaceOffsetX: to.x - x, surfaceOffsetZ: to.z - z };
    assert.equal(game.navigation.begin(target), true);
    let jumps = 0;
    let plan;
    for (let frame = 0; frame < 240 && (game.navigation.route || game.navigation.hasPending); frame++) {
      const delta = cadence[frame % cadence.length];
      game.elapsed = (game.elapsed ?? 0) + delta;
      const previousFeet = game.surfaceOffset + game.jumpHeight;
      const previousX = game.playerPosition.x, previousZ = game.playerPosition.z;
      const requested = game.navigation.consumeJump();
      jumps += Number(requested);
      if (requested) {
        assert.ok(Math.hypot(previousX - from.x, previousZ - from.z) < 0.025,
          "the first takeoff is the clicked-from river position, not a stair");
      }
      game.updateJump(delta, requested);
      const axes = { horizontal: 0, forward: 0, running: false };
      game.navigation.update(axes, delta, false, false);
      if (game.navigation.route && !plan) {
        plan = game.navigation.route.legs;
        assert.deepEqual(plan.map(leg => leg.kind), ["jump"], JSON.stringify(plan));
      }
      game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
        .addScaledVector(game.cameraRight, axes.horizontal)
        .multiplyScalar((axes.running ? 6.8 : 4.25) * delta);
      if (Math.abs(axes.horizontal) > 0.01 || Math.abs(axes.forward) > 0.01) {
        const proposed = game.playerPosition.clone().add(game.movement);
        game.moveWithCollisions(proposed, previousFeet);
        assert.ok(Math.hypot(game.playerPosition.x - proposed.x, game.playerPosition.z - proposed.z) < 1e-8,
          "the chosen trajectory must not rely on the collision solver stopping it against the plinth");
      }
      game.updateWorldSurface(delta, game.playerPosition, previousFeet, previousX, previousZ);
      const feet = game.surfaceOffset + game.jumpHeight;
      assert.ok(!game.activePlatform || game.activePlatform === surface,
        "no intermediate stair or terrace support");
      assert.ok(feet >= altar.solidTop - 0.015 ||
        (game.jumpVelocity > 0 && feet >= altar.clearAbove - 0.01) ||
        !loosePropIntersectsSolid(game.playerPosition.x, game.playerPosition.z,
          game.playerRadius, feet, feet + game.playerCollisionHeight, altar),
      "the direct jump must respect the altar's existing physical clearance");
    }
    const detail = JSON.stringify({ cadence, trace: game.navigation.trace.snapshot() });
    assert.ok(plan, detail);
    assert.equal(game.navigation.failure, null, detail);
    assert.equal(game.navigation.hasPending, false, detail);
    assert.equal(game.navigation.route, null, detail);
    assert.equal(jumps, 1, detail);
    assert.equal(game.activePlatform, surface, detail);
    assert.ok(Math.hypot(game.playerPosition.x - to.x, game.playerPosition.z - to.z) < 0.035, detail);
    assert.ok(Math.abs(game.surfaceOffset - to.y) < 0.015, detail);
    assert.equal(game.navigation.trace.snapshot().some(event => event.kind === "collision-recovery"), false);
  }
});

test("rune monument top is eligible above its authored coarse collision box", () => {
  const game = runtimeFixture();
  const { x, z } = fallsLandmarks.monument;
  // Same registration as buildFalls: decorative geometry extends above the
  // walkable solidTop. Do not replace it with an idealized .82-high box.
  game.addStaticBox(x, 0.7, z, 1.25, 0.75, 1.25, 0.7, 0.82);
  const surface = {
    id: "rune-altar", x, z, halfWidth: 1.08, halfDepth: 1.08,
    requiresJump: true, heightAt: () => 0.82,
  };
  game.addSurfaceArea(surface);
  const target = targetFor(surface);
  game.snapClickNavigationTarget(target);
  assert.equal(game.isClickNavigationTargetPotentiallyReachable(target), true);
  assert.deepEqual(target.position.toArray(), [x, 0.82, z], "keep the selected monument top");
  assert.equal(game.sampleClickNavigationLanding(surface, x, z), 0.82);

  game.addStaticBox(x, 2, z, 2, 0.1, 2);
  assert.equal(game.isClickNavigationTargetPotentiallyReachable(target), false,
    "an unrelated overhead solid still blocks a full-height body");
  assert.equal(game.sampleClickNavigationLanding(surface, x, z), null);
});

test("a resting stair endpoint is not rejected by its walkable next riser", () => {
  const game = runtimeFixture();
  game.addSurfaceArea({
    id: "lower-tread", x: 5.6, z: 6.5, halfWidth: 0.95, halfDepth: 0.29,
    stepHeight: 0.28, requiresJump: false, heightAt: () => 1.75,
  });
  const next = game.addStaticBox(5.6, 1, 5.9, 0.95, 1, 0.31, 1.995, 2);
  next.stepHeight = 0.28;
  const feet = { x: 5.6, y: 1.75, z: 6.5 };
  assert.equal(game.navigationSupportHeight(feet), 1.75);
  next.stepHeight = undefined;
  assert.equal(game.navigationSupportHeight(feet), null, "unmarked taller solids retain body clearance");
  assert.equal(game.navigationSupportHeight({ x: 18, y: 0, z: 0 }), null,
    "intermediate supports must remain inside physical player bounds");
});

test("rear-pillar ground routes find the narrow terrace passage and execute without jumps", () => {
  for (const quality of ["low", "medium", "high"]) {
    const game = executionFixture(false);
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const materials = new Proxy({}, { get: () => material });
    try {
      // Register the actual terrain, primary pillars, companion shafts, and
      // furniture; simplified pillar-only boxes miss this narrow ground lane.
      buildFallsTerrain(root, { quality, materials,
        registerSolid: (mesh, id, stepHeight) => game.registerClimbableBox(
          mesh, id, undefined, undefined, false, true, stepHeight),
      });
      const outer = { x: 13.23, y: 0, z: -5.55 };
      const inner = { x: 9.974999997615814, y: 0, z: -6.95 };
      for (const [start, requestedGoal] of [[outer, inner], [inner, outer]]) {
        for (const cadence of [[1 / 30], [1 / 60], [.011, .033, .05, .016]]) {
          game.playerPosition.set(start.x, 0, start.z);
          game.surfaceOffset = 0;
          game.jumpHeight = game.jumpVelocity = 0;
          game.activePlatform = null;
          game.collisionSafeLanding.valid = false;
          const target = { surface: null, position: new THREE.Vector3(requestedGoal.x, 0, requestedGoal.z),
            markerY: 0, reachable: true, surfaceOffsetX: 0, surfaceOffsetZ: 0 };
          game.snapClickNavigationTarget(target);
          assert.equal(target.reachable, true);
          const goal = { x: target.position.x, y: target.position.y, z: target.position.z };
          assert.equal(game.collidesAt(start.x, start.z, 0, false), false);
          assert.equal(game.collidesAt(goal.x, goal.z, 0, false), false);
          const context = game.createNavigationPlanningContext(start, goal);
          const job = new NavigationJob(planNavigationWork(start, goal, context));
          for (let slice = 0; !job.done && slice < 2000; slice++) job.advance(192);
          assert.equal(job.done, true);
          assert.ok(job.result, `${quality}: the rear lane must remain connected`);
          assert.ok(job.result.every(leg => leg.kind === "walk"),
            "clear ground must not require a terrace climb or a jump shortcut");
          const route = { legs: job.result, legIndex: -1,
            target: { position: new THREE.Vector3(goal.x, goal.y, goal.z) } };
          game.navigation.routeState = route;
          game.navigation.advanceLeg(route);
          for (let frame = 0; game.navigation.routeState && frame < 1800; frame++) {
            const delta = cadence[frame % cadence.length];
            const feet = game.surfaceOffset + game.jumpHeight;
            const { x, z } = game.playerPosition;
            assert.equal(game.navigation.consumeJump(), false);
            game.updateJump(delta, false);
            const axes = { horizontal: 0, forward: 0, running: false };
            game.navigation.updatePlanned(route, axes, delta);
            game.movement.copy(game.cameraForward).multiplyScalar(axes.forward)
              .addScaledVector(game.cameraRight, axes.horizontal)
              .multiplyScalar((axes.running ? 6.8 : 4.25) * delta);
            if (Math.abs(axes.horizontal) > .01 || Math.abs(axes.forward) > .01) {
              const desired = game.playerPosition.clone().add(game.movement);
              game.constrainToBounds(desired);
              game.moveWithCollisions(desired, feet);
            }
            game.updateWorldSurface(delta, game.playerPosition, feet, x, z);
            assert.equal(game.collidesAt(game.playerPosition.x, game.playerPosition.z, 0, false), false);
            assert.ok(Math.abs(game.surfaceOffset) < .001, "the route stays on the ground");
          }
          assert.equal(game.navigation.routeState, null, "actual movement reaches the destination");
          assert.ok(Math.hypot(game.playerPosition.x - goal.x, game.playerPosition.z - goal.z) < .035);
        }
      }
    } finally { disposeObjectTree(root); material.dispose(); }
  }
});

test("actual rear pillar tops remain candidate goals from the desk and lower ground", () => {
  const game = runtimeFixture();
  const material = new THREE.MeshBasicMaterial();
  try {
    for (const [index, pillar] of fallsBackgroundPillars.entries()) {
      const geometry = createLayeredCliffGeometry(
        pillar.width, pillar.top, pillar.depth, "low", 811 + index * 13,
      );
      try {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pillar.x, pillar.top / 2, pillar.z);
        const surface = game.registerClimbableBox(mesh, `falls-rear-pillar-${index}`,
          undefined, undefined, false);
        const target = targetFor(surface);
        game.snapClickNavigationTarget(target);
        assert.equal(game.sampleClickNavigationLanding(surface, target.position.x, target.position.z),
          target.position.y, "actual generated geometry supplies a clear landing");
        game.surfaceOffset = fallsLandmarks.npcs.tinkerer.y + 1.1;
        assert.equal(game.isClickNavigationTargetPotentiallyReachable(target), true,
          "route planner, not a coarse single-hop gate, decides how to leave the desk");
        game.surfaceOffset = 0;
        assert.equal(canGuidedJump(0.5, target.position.y), false);
        assert.equal(game.isClickNavigationTargetPotentiallyReachable(target), true,
          "intermediate supports may reach a top beyond one ground-level jump");
        surface.enabled = false;
        assert.equal(game.isClickNavigationTargetPotentiallyReachable(target), false);
      } finally { geometry.dispose(); }
    }
  } finally { material.dispose(); }
});

test("wall side below an upper deck selects only lower support, never the rail above the hit", () => {
  const terrace = {
    id: "reading", x: -8.65, z: 2.2, halfWidth: 2.65, halfDepth: 2.4,
    requiresJump: false, heightAt: () => 2.7,
  };
  const rail = { ...terrace, id: "rail", heightAt: () => 3.08 };
  const point = { x: -6.8, y: 2.9, z: 3.4 };
  assert.equal(findWallClickSurface(point, 0, [rail, terrace]).surface, terrace);
  assert.equal(findWallClickSurface({ ...point, y: 1.2 }, 0, [terrace, rail]), null);
  assert.equal(findWallClickSurface(point, 0, [{ ...terrace, enabled: false }]), null);
});

test("a nearby higher ledge does not steal a wall click from the support directly below it", () => {
  const lower = {
    id: "front-landing", x: 0, z: 0, halfWidth: 2, halfDepth: 1,
    requiresJump: false, heightAt: () => 3.8,
  };
  const higher = {
    ...lower, id: "side-ledge", x: -2.3, halfWidth: 0.3,
    heightAt: () => 4.6,
  };
  for (const x of [-0.79, -0.81]) {
    const point = { x, y: 5, z: 0 };
    assert.equal(findWallClickSurface(point, 0, [lower, higher]).surface, lower,
      "crossing a neighboring ledge's 1.2m search radius must not shift support");
    assert.equal(findWallClickSurface(point, 0, [higher, lower]).surface, lower,
      "registration order must not decide the endpoint");
  }
});

test("actual wall picker prefers clear footing by its visible face over a farther raised ledge", () => {
  const game = runtimeFixture();
  const material = new THREE.MeshBasicMaterial();
  const geometry = new THREE.BoxGeometry(0.2, 8, 0.2);
  try {
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(0, 4, -0.1);
    game.zoneGroup = new THREE.Group();
    game.zoneGroup.add(wall);
    game.zoneGroup.updateMatrixWorld(true);
    Object.assign(game, {
      clickNavigationVisualBlockers: [], clickNavigationVisualHits: [],
      clickNavigationPlane: new THREE.Plane(), clickNavigationPoint: new THREE.Vector3(),
      pointerRaycaster: new THREE.Raycaster(new THREE.Vector3(0, 8, 8),
        new THREE.Vector3(0, -0.5, -1).normalize()),
      portalNetwork: { findPointed: () => null },
      updatePointerRayAt: () => {},
    });
    const surface = {
      id: "wall-side-landing", x: 1, z: 0, halfWidth: 0.2, halfDepth: 0.2,
      requiresJump: true, heightAt: () => 3.8,
    };
    game.addSurfaceArea(surface);
    game.addStaticBox(0, 4, -0.1, 0.1, 4, 0.1);
    const target = game.findClickNavigationTargetAt(0, 0);
    assert.ok(target);
    assert.equal(target.surface, null);
    assert.equal(target.reachable, true);
    assert.ok(target.position.distanceTo(new THREE.Vector3(0,
      game.getClickNavigationTerrainFootHeight(0, 0.445), 0.445)) < 1e-7,
      "closer cleared ground competes with the raised footprint");

    game.addStaticBox(1, 5, 0, 0.5, 0.1, 0.5);
    const blocked = game.findClickNavigationTargetAt(0, 0);
    assert.equal(blocked.surface, null);
    assert.equal(blocked.reachable, true,
      "a blocked adjacent ledge cannot take away the valid ground endpoint");
  } finally { geometry.dispose(); material.dispose(); }
});

test("wall fallback compares cleared positions, not raised-footprint priority", () => {
  const bank = {
    id: "bank", x: -1, z: 0, halfWidth: 0.1, halfDepth: 1,
    requiresJump: true, heightAt: () => 2.63,
  };
  const wall = { x: 0, z: -0.2, halfWidth: 0.4, halfDepth: 0.2 };
  const sample = (surface, x, z) => surface === bank
    ? (Math.abs(x + 1) <= 0.1 ? 2.63 : null)
    : (z >= 0.44 ? -0.16 : null);
  const hit = { x: 0, y: 5, z: 0 };
  const ground = findWallClickLanding(hit, bounds, [bank], sample, [wall]);
  assert.equal(ground.surface, null);
  assert.equal(ground.position.y, -0.16);
  assert.ok(ground.position.z < 0.45);
  const bankOnly = findWallClickLanding(hit, bounds, [bank],
    (s, x, z) => s ? sample(s, x, z) : null, [wall]);
  assert.equal(bankOnly.surface, bank, "blocked ground still permits a valid nearby raised landing");
  assert.equal(findWallClickLanding({ ...hit, y: 1 }, bounds, [bank],
    (s, x, z) => s ? sample(s, x, z) : null, [wall]), null,
  "wall hits below an overhead bank cannot select its top");
});

test("a rejected wall pick cannot queue a clear bank through the back of the wall", () => {
  const game = runtimeFixture();
  const material = new THREE.MeshBasicMaterial();
  const geometry = new THREE.BoxGeometry(4, 8, 0.2);
  try {
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(0, 4, 0);
    game.zoneGroup = new THREE.Group();
    game.zoneGroup.add(wall);
    game.zoneGroup.updateMatrixWorld(true);
    Object.assign(game, {
      clickNavigationVisualBlockers: [], clickNavigationVisualHits: [],
      clickNavigationPlane: new THREE.Plane(), clickNavigationPoint: new THREE.Vector3(),
      pointerRaycaster: new THREE.Raycaster(new THREE.Vector3(0, 4, 3),
        new THREE.Vector3(0, -0.2, -1).normalize()),
      portalNetwork: { findPointed: () => null }, updatePointerRayAt: () => {},
      isNavigationLocked: () => false, pongChallenge: { isActive: () => false },
      voidTurtleRide: { isRiding: () => false },
      pendingClickNavigation: null, failedWalkingRequests: new FailedWalkingRequestCache(),
    });
    game.addStaticBox(0, 4, 0, 2, 4, 0.1);
    game.addStaticBox(0, 1, 1.3, 3, 0.1, 1.2);
    game.addStaticBox(0, 0.375, -0.95, 1.5, 0.375, 0.2);
    const bank = {
      id: "back-bank", x: 0, z: -0.95, halfWidth: 1.5, halfDepth: 0.2,
      requiresJump: true, heightAt: () => 0.75,
    };
    game.addSurfaceArea(bank);
    const blocked = game.findClickNavigationTargetAt(0, 0);
    assert.equal(blocked.surface, bank);
    assert.equal(blocked.reachable, false);
    assert.equal(game.sampleClickNavigationLanding(bank, blocked.position.x, blocked.position.z), 0.75);
    assert.equal(game.navigation.begin(blocked), false,
      "entry revalidation must retain the picker's stricter wall-side restriction");
    assert.equal(game.navigation.pending, null);

    game.pointerRaycaster.ray.origin.set(0, 5, -0.95);
    game.pointerRaycaster.ray.direction.set(0, -1, 0);
    const direct = game.findClickNavigationTargetAt(0, 0, blocked);
    assert.equal(direct, blocked, "hover records can be reused");
    assert.equal(direct.surface, bank);
    assert.equal(direct.reachable, true, "a later direct top pick clears the old rejection");
    assert.equal(direct.blockedAtPick, false);
  } finally { geometry.dispose(); material.dispose(); }
});

test("tiny wall-pointer movement slides along the face instead of choosing another radial direction", () => {
  const wall = { x: 0, z: 0, y: 4, halfWidth: 0.5, halfDepth: 4, halfHeight: 4 };
  const sample = (x, z) => loosePropIntersectsSolid(x, z, 0.44, 0, 2.3, wall) ? null : 0;
  let previous;
  for (let step = 0; step < 100; step += 1) {
    const requested = { x: 0.7, y: 0, z: -1.2 + step * 0.002 };
    const landing = findNearbyClickLanding(requested, bounds, sample, [wall]);
    assert.ok(landing);
    assert.ok(Math.abs(landing.x - 0.945) < 1e-8);
    assert.equal(landing.z, requested.z);
    if (previous) assert.ok(Math.hypot(landing.x - previous.x, landing.z - previous.z) < 0.003);
    previous = landing;
  }
});

test("faceted wall depth changes preserve the visible side and its continuous ground target", () => {
  const game = runtimeFixture();
  const material = new THREE.MeshBasicMaterial();
  const geometry = createLayeredCliffGeometry(1.1, 8, 2.5, "medium", 11.27);
  try {
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(-3.95, 4, -7.1);
    game.zoneGroup = new THREE.Group();
    game.zoneGroup.add(wall);
    game.registerClimbableBox(wall, "cliff-cap", undefined, undefined, false);
    game.zoneGroup.updateMatrixWorld(true);
    Object.assign(game, {
      clickNavigationVisualBlockers: [], clickNavigationVisualHits: [],
      clickNavigationPlane: new THREE.Plane(), clickNavigationPoint: new THREE.Vector3(),
      pointerRaycaster: new THREE.Raycaster(),
      portalNetwork: { findPointed: () => null }, updatePointerRayAt: () => {},
    });
    const offset = new THREE.Vector3(11.5, 14.5, 11.5);
    game.pointerRaycaster.ray.direction.copy(offset).negate().normalize();
    let previous;
    for (let step = 0; step < 60; step += 1) {
      game.pointerRaycaster.ray.origin.set(-2.7 + step * 0.005, 5, -5.85).add(offset);
      const target = game.findClickNavigationTargetAt(0, 0);
      assert.ok(target?.reachable);
      assert.equal(target.surface, null);
      assert.ok(target.position.x > -3,
        "the visible east face cannot target ground behind the same wall");
      if (previous) assert.ok(target.position.distanceTo(previous) < 0.012,
        "sub-centimeter pointer motion must not jump between rendered grooves");
      previous = target.position.clone();
    }
  } finally { geometry.dispose(); material.dispose(); }
});

test("visible Falls foundation snaps inside physical bounds before local clearance search", () => {
  const clicked = { x: 18, y: 0, z: 0 };
  const landing = findNearbyClickLanding(clicked, bounds, () => 0);
  assert.deepEqual(clicked, { x: 18, y: 0, z: 0 });
  assert.ok(Math.abs(landing.x - 15.85) < 1e-12);
  assert.equal(landing.z, 0);
  assert.ok(clicked.x - landing.x > 1.2, "rim clamp is not limited by clearance radius");
});

test("Moon descent click beside south bridge parapet stays on clear reading terrace", () => {
  const clicked = { x: -6.8, y: 2.7, z: 3.4 };
  const parapet = {
    x: -6.08, z: 3.47, y: (2.7 + 3.08) / 2,
    halfWidth: 0.54, halfDepth: 0.1, halfHeight: (3.08 - 2.7) / 2,
  };
  const sample = (x, z) => {
    if (Math.abs(x + 8.65) > 2.65 || Math.abs(z - 2.2) > 2.4) return null;
    return loosePropIntersectsSolid(x, z, 0.44, 2.7, 5.0, parapet) ? null : 2.7;
  };
  assert.equal(sample(clicked.x, clicked.z), null);
  const landing = findNearbyClickLanding(clicked, bounds, sample);
  assert.ok(landing);
  assert.equal(landing.y, 2.7, "never substitute higher bridge rail or lower ground");
  assert.equal(sample(landing.x, landing.z), 2.7);
  assert.ok(Math.hypot(landing.x - clicked.x, landing.z - clicked.z) <= 1.2);
  assert.deepEqual(findNearbyClickLanding(clicked, bounds, sample), landing);
});

test("headroom rejection finds a nearby clear endpoint without changing cave floor height", () => {
  const ceiling = { x: 0, z: 0, y: 1.5, halfWidth: 0.1, halfDepth: 0.1, halfHeight: 0.2 };
  const sample = (x, z) =>
    loosePropIntersectsSolid(x, z, 0.44, -0.16, 2.14, ceiling) ? null : -0.16;
  const landing = findNearbyClickLanding({ x: 0, y: -0.16, z: 0 }, bounds, sample);
  assert.ok(landing);
  assert.equal(landing.y, -0.16);
  assert.equal(sample(landing.x, landing.z), -0.16);
});

test("a blocked high ledge remains blocked with at most 37 probes, not a ground fallback", () => {
  let probes = 0;
  const requested = { x: 0, y: 4.48, z: 0 };
  const result = findNearbyClickLanding(requested, bounds, (x, z) => {
    probes += 1;
    assert.ok(Math.hypot(x, z) <= 1.2 + 1e-12);
    return null;
  });
  assert.equal(result, null);
  assert.equal(probes, 37);
  assert.equal(requested.y, 4.48);
});

test("square rim candidates stay inside both physical insets and valid points do not jitter", () => {
  const square = { kind: "square", halfWidth: 10, halfDepth: 8 };
  const landing = findNearbyClickLanding({ x: 12, y: 0, z: 10 }, square, (x, z) => {
    assert.ok(x <= 9.45 && z <= 7.45);
    return 0;
  });
  assert.deepEqual(landing, { x: 9.45, y: 0, z: 7.45 });
  assert.deepEqual(findNearbyClickLanding(landing, square, () => 0), landing);
});
