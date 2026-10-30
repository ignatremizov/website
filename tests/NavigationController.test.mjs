import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { NavigationController } from "../src/game/NavigationController.ts";
import { canGuidedJump, hasGuidedJumpClearance } from "../src/game/ClickNavigation.ts";
import { jumpDisplacement, jumpVelocityAfter, playerJumpLaunchVelocity } from "../src/game/JumpMotion.ts";
import { selectDescendingLandingSurface } from "../src/game/SurfaceSelection.ts";

function fixture({ sample = () => 0, canJump = () => false, jumpDelay,
  supportHeight = point => point.y, slow = false } = {}) {
  const frame = {
    position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0),
    zone: "falls", revision: 1, elapsed: 0, surfaceOffset: 0, jumpHeight: 0, jumpVelocity: 0,
    activePlatform: null, speedMultiplier: 1, walkingSpeed: 4.25, sprintingSpeed: 6.8,
    inputEnabled: true, transitioning: false, locked: false, collapsing: false,
    spellHeld: false, continuous: false, heldTarget: null,
  };
  let clock = 0;
  let contexts = 0;
  const statuses = [];
  const host = {
    readFrame: () => frame,
    now: () => slow ? ++clock : 0,
    refreshTarget: target => { if (target.surface?.enabled === false) target.reachable = false; },
    isTargetReachable: target => target.reachable && target.surface?.enabled !== false,
    distanceToSurface: target => Math.hypot(target.position.x - frame.position.x, target.position.z - frame.position.z),
    goalClearance: () => 0.3,
    findLegacyPath: target => [frame.position.clone(), target.clone()],
    createContext: () => {
      contexts++;
      return { sample, canLand: point => supportHeight(point) !== null, canJump, supports: [] };
    },
    supportHeight, canJumpFrom: canJump, jumpDelay, sampleWalkHeight: sample,
    surfaceContains: (surface, x, z) => surface.contains?.(x, z, 0) ?? true,
    onBegin() {}, onHoverTarget() {}, onClearFeedback() {}, cancelPress() {},
    onStatus: message => statuses.push(message),
  };
  const controller = new NavigationController(host);
  const axes = () => ({ horizontal: 0, forward: 0, running: false });
  const tick = (delta = 1 / 60, manual = false) => {
    frame.elapsed += delta;
    const input = axes();
    controller.update(input, delta, manual, false);
    return input;
  };
  return { frame, controller, tick, statuses, get contexts() { return contexts; } };
}

function target(x, y = 0, z = 0, surface = null) {
  return { position: new THREE.Vector3(x, y, z), markerY: y + 0.045, surface,
    surfaceOffsetX: surface ? x - surface.x : 0, surfaceOffsetZ: surface ? z - surface.z : 0,
    reachable: true };
}

function finishPlanning(h) {
  for (let step = 0; step < 10000 && h.controller.hasPending; step++) h.tick();
  assert.equal(h.controller.hasPending, false, "planning finishes within a bounded number of steps");
}

function move(h, input, dt = 1 / 60) {
  const speed = (input.running ? h.frame.sprintingSpeed : h.frame.walkingSpeed) * h.frame.speedMultiplier;
  h.frame.position.addScaledVector(h.frame.forward, input.forward * speed * dt)
    .addScaledVector(h.frame.right, input.horizontal * speed * dt);
}

test("a rise-first jump rechecks takeoff clearance and cancellation cannot retain its delayed steering", () => {
  let allowed = true;
  const h = fixture({ canJump: () => allowed, jumpDelay: () => allowed ? .165 : null });
  h.controller.begin(target(1.6, .98));
  // Complete the job without executing its newly published departure yet.
  for (let i = 0; h.controller.hasPending && i < 1000; i++) h.controller.updatePlanning();
  assert.ok(h.controller.route);
  assert.equal(h.controller.route.jumpTriggered, false);
  allowed = false;
  assert.equal(h.tick().horizontal, 0);
  assert.equal(h.controller.consumeJump(), false, "a blocked takeoff cannot launch a stale profile");
  h.controller.cancel();

  allowed = true;
  h.controller.begin(target(1.6, .98));
  finishPlanning(h);
  assert.equal(h.controller.consumeJump(), true);
  h.frame.jumpHeight = jumpDisplacement(.05);
  h.frame.jumpVelocity = jumpVelocityAfter(.05);
  assert.equal(h.tick(.05).horizontal, 0, "the physical jump is rising, not yet translating");
  h.controller.cancel("User cancelled during lift");
  for (let step = 0; step < 12; step++) {
    h.frame.jumpHeight += jumpDisplacement(1 / 60, h.frame.jumpVelocity);
    h.frame.jumpVelocity = jumpVelocityAfter(1 / 60, h.frame.jumpVelocity);
    assert.equal(h.tick().horizontal, 0);
  }
  assert.equal(h.controller.consumeJump(), false);
  assert.equal(h.controller.hasFeedback, false);
  // A later ordinary walk must not inherit the cancelled jump's rise delay.
  h.frame.jumpHeight = h.frame.jumpVelocity = 0;
  h.controller.begin(target(1));
  finishPlanning(h);
  assert.ok(h.tick().horizontal > 0);
});

test("turtle takeoffs wait for temporary clearance but retire permanently blocked jumps", () => {
  for (const clears of [true, false]) {
    let allowed = false;
    const h = fixture({ canJump: () => allowed });
    h.frame.zone = "field";
    const shell = { id: "void-turtle-shell", x: 2, z: 0, halfWidth: 1, halfDepth: 1,
      heightAt: () => 1.4, requiresJump: true };
    assert.equal(h.controller.begin(target(2, 1.4, 0, shell)), true);
    for (let frame = 0; frame < 22; frame++) {
      const input = h.tick(.05);
      assert.equal(input.horizontal, 0);
      assert.equal(h.controller.consumeJump(), false);
    }
    assert.equal(h.controller.failure, null, "a bob cycle must not reject the destination immediately");
    if (clears) {
      allowed = true;
      h.tick();
      assert.equal(h.controller.consumeJump(), true);
    } else {
      for (let frame = 0; frame < 80; frame++) h.tick(.05);
      assert.equal(h.controller.route, null);
      assert.equal(h.controller.failure.reason, "Route stopped");
      assert.equal(h.controller.consumeJump(), false);
    }
  }
});

test("farther repeated clicks keep moving while the replacement tail is planned and validated", () => {
  const h = fixture({ slow: true }); // Only one cooperative work unit per frame.
  h.controller.begin(target(12));
  finishPlanning(h);
  let movingFrames = 0;
  let latest = 14;
  for (let step = 0; step < 600 && (h.controller.route || h.controller.hasPending); step += 1) {
    if ([0, 8, 20].includes(step)) {
      latest += 0.6;
      assert.equal(h.controller.begin(target(latest)), true);
    }
    const input = h.tick();
    if (latest - h.frame.position.x > 0.025) {
      assert.ok(input.horizontal > 0, `an extension must not freeze at x=${h.frame.position.x}, frame=${step}`);
      movingFrames += 1;
    }
    move(h, input);
  }
  assert.ok(movingFrames > 60);
  assert.equal(h.controller.failure, null);
  assert.equal(h.controller.hasPending, false);
  assert.equal(h.controller.route, null);
  assert.ok(Math.abs(h.frame.position.x - latest) < 0.025);
});

test("an unfinished extension waits at the last checked waypoint, never beyond it", () => {
  const h = fixture({ slow: true });
  h.controller.begin(target(0.2));
  finishPlanning(h);
  h.controller.begin(target(24));
  for (let step = 0; step < 20; step += 1) move(h, h.tick());
  assert.ok(h.controller.hasPending);
  assert.ok(h.frame.position.x <= 0.200001, "never extrapolate movement into unchecked space");
  h.controller.cancel("manual movement");
  for (let step = 0; step < 80; step += 1) assert.equal(h.tick().horizontal, 0);
  assert.equal(h.controller.hasFeedback, false);
});

test("reversing direction cancels a queued walking extension rather than retaining its future anchor", () => {
  const h = fixture({ slow: true });
  h.controller.begin(target(8));
  finishPlanning(h);
  h.controller.begin(target(10));
  for (let step = 0; step < 3; step += 1) move(h, h.tick());
  h.controller.begin(target(-2));
  finishPlanning(h);
  assert.equal(h.controller.route.target.position.x, -2);
  const input = h.tick();
  assert.ok(input.horizontal < 0);
});

test("a changed floor or a failed extension retires the retained prefix instead of reviving the old destination", () => {
  for (const geometryChanged of [false, true]) {
    const h = fixture({ slow: true, supportHeight: point => point.x <= 9 ? point.y : null });
    h.controller.begin(target(8));
    finishPlanning(h);
    h.controller.begin(target(10));
    if (geometryChanged) h.frame.revision += 1;
    else finishPlanning(h);
    assert.equal(h.tick().horizontal, 0);
    assert.equal(h.controller.route, null);
    assert.equal(h.controller.consumeJump(), false);
    if (!geometryChanged) assert.equal(h.controller.failure.reason, "No route found");
  }
});

test("accepted clicks own their target and cancellation cannot publish an abandoned job", () => {
  const h = fixture({ slow: true });
  h.controller.trace.enabled = true;
  const clicked = target(4);
  assert.equal(h.controller.begin(clicked), true);
  clicked.position.x = 900;
  assert.equal(h.controller.pendingTarget.position.x, 4);
  h.tick();
  h.controller.cancel("manual movement");
  for (let step = 0; step < 30; step++) h.tick();
  assert.equal(h.controller.route, null);
  assert.equal(h.controller.hasFeedback, false);
  assert.ok(h.controller.trace.snapshot().some(event => event.kind === "cancel" && event.reason === "manual movement"));
  assert.ok(!h.controller.trace.snapshot().some(event => event.kind === "publish"));
});

test("blocked held samples retain the accepted request; valid samples coalesce to the latest goal", () => {
  const h = fixture({ slow: true });
  h.frame.continuous = true;
  h.frame.heldTarget = target(4);
  h.controller.begin(h.frame.heldTarget);
  const blocked = target(9);
  blocked.reachable = false;
  assert.equal(h.controller.retarget(blocked), false);
  assert.equal(h.controller.pendingTarget.position.x, 4);
  assert.equal(h.controller.retarget(target(6)), true);
  assert.equal(h.controller.pendingTarget.position.x, 6);
  finishPlanning(h);
  assert.equal(h.controller.route.target.position.x, 6);
});

test("geometry changes replace an unfinished job, and zone departure discards it", () => {
  const h = fixture({ slow: true });
  h.controller.begin(target(4));
  h.tick();
  const before = h.contexts;
  h.frame.revision++;
  h.tick();
  assert.equal(h.contexts, before + 1);
  assert.equal(h.controller.pendingTarget.position.x, 4);
  h.frame.zone = "field";
  h.tick();
  assert.equal(h.controller.hasPending, false);
  assert.equal(h.controller.route, null);
});

test("a failed destination remains visible until an explicit cancellation or new request", () => {
  const h = fixture({ supportHeight: () => null });
  h.controller.begin(target(4));
  finishPlanning(h);
  assert.equal(h.controller.failure.reason, "No route found");
  for (let frame = 0; frame < 8; frame++) h.tick();
  assert.equal(h.controller.hasFeedback, true);
  assert.equal(h.statuses.length, 1);
  h.controller.cancel();
  assert.equal(h.controller.failure, null);
});

test("published walking routes cap movement at waypoints instead of stepping beyond them", () => {
  const h = fixture();
  h.controller.begin(target(0.09));
  finishPlanning(h);
  const input = h.tick(1 / 20);
  const speed = input.running ? 6.8 : 4.25;
  h.frame.position.x += input.horizontal * speed / 20;
  h.frame.position.z += input.forward * speed / 20;
  assert.ok(Math.abs(h.frame.position.x - 0.09) < 1e-10);
  h.tick();
  assert.equal(h.controller.route, null);
});

test("a planner-approved elevated route executes through the real follower and landing rules at all cadences", () => {
  const shelf = { id: "test-shelf", x: 3.5, z: 0, halfWidth: 0.52, halfDepth: 1,
    requiresJump: true, heightAt: () => 1.5, contains: x => x >= 2.98 };
  // Production jumpable supports allow a small foot-overlap margin.
  const contains = (_surface, x) => x >= 2.98 - 0.136;
  const landingHeight = (px, pz, py, x, z, y) => {
    const found = selectDescendingLandingSurface([shelf], px, pz, py, x, z, y, contains);
    return found ? 1.5 : null;
  };
  const canJump = (from, to) => canGuidedJump(Math.hypot(to.x - from.x, to.z - from.z), to.y - from.y) &&
    hasGuidedJumpClearance(from, to, 6.8, () => true, landingHeight);
  for (const cadence of [[1 / 30], [1 / 60], [1 / 120], [0.011, 0.033, 0.05, 0.016]]) {
    const h = fixture({ canJump, sample: () => 0 });
    h.controller.trace.enabled = true;
    h.controller.begin(target(3, 1.5, 0, shelf));
    finishPlanning(h);
    for (let step = 0; step < 300 && h.controller.route; step++) {
      const dt = cadence[step % cadence.length];
      const f = h.frame;
      const previousX = f.position.x;
      const previousFeet = f.surfaceOffset + f.jumpHeight;
      if (h.controller.consumeJump()) {
        f.jumpVelocity = playerJumpLaunchVelocity;
        f.jumpHeight += f.surfaceOffset;
        f.surfaceOffset = 0;
      }
      if (f.jumpVelocity !== 0 || f.jumpHeight > 0) {
        f.jumpHeight += jumpDisplacement(dt, f.jumpVelocity);
        f.jumpVelocity = jumpVelocityAfter(dt, f.jumpVelocity);
      }
      const input = h.tick(dt);
      const speed = input.running ? 6.8 : 4.25;
      f.position.x += input.horizontal * speed * dt;
      f.position.z += input.forward * speed * dt;
      const land = f.jumpVelocity < 0 ? landingHeight(previousX, 0, previousFeet, f.position.x, f.position.z, f.jumpHeight) : null;
      if (land !== null) {
        f.surfaceOffset = land;
        f.jumpHeight = 0;
        f.jumpVelocity = 0;
        f.activePlatform = shelf;
      }
    }
    assert.equal(h.controller.route, null, `route must complete at ${cadence}`);
    assert.equal(h.controller.failure, null, `route must actually land at ${cadence}`);
    assert.equal(h.frame.surfaceOffset, 1.5);
    assert.ok(h.controller.trace.snapshot().some(event => event.kind === "jump-landing" && event.reason === "landed"));
  }
});
