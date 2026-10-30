import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { WebGLLights } from 'three/src/renderers/webgl/WebGLLights.js';
import { FallsRuneRitual } from '../src/game/zones/falls/FallsRuneRitual.ts';
import { getFallsPointLightBudget } from '../src/game/zones/falls/FallsLightBudget.ts';
import { disposeObjectTree } from '../src/game/sceneResources.ts';
import { PerformanceMonitor } from '../src/game/PerformanceMonitor.ts';

// Use the same headless runtime loading as the collision/pointer regressions.
// No renderer, browser, storage, or network is constructed.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }) };
    return next(url, context);
  },
});
let PortfolioGame;
try { ({ PortfolioGame } = await import('../src/game/PortfolioGame.ts')); }
finally { hooks.deregister(); }

function chestFixture(quality, reduced) {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  let claims = 0;
  const host = {
    colors: { amber: 0xffba55, cyan: 0x88eeff, violet: 0xcc99ff },
    materials: { wood: material, brass: material, amber: material },
    getQuality: () => quality, isReducedMotion: () => reduced, getElapsed: () => 0,
    getHeldKickable: () => null, addAnimatedItem() {}, onStatus() {},
    updateInteractionLabel() {}, claimChestReward() { claims++; return {}; },
  };
  const ritual = new FallsRuneRitual(host);
  ritual.createHiddenChest(parent, -5.5, -8.65, 2.63);
  ritual.createRuneEffects(parent);
  const lighting = new WebGLLights({ has: () => false });
  const signature = () => {
    const lights = [];
    parent.traverseVisible(object => { if (object.isLight) lights.push(object); });
    lighting.setup(lights);
    return { ids: lights.map(light => light.id), version: lighting.state.version,
      points: lighting.state.point.length };
  };
  return { ritual, host, parent, signature, claims: () => claims,
    dispose: () => disposeObjectTree(parent) };
}

test('opening and fading the chest never changes the compiled light layout on any quality tier', () => {
  for (const quality of ['low', 'medium', 'high']) for (const reduced of [false, true]) {
    const f = chestFixture(quality, reduced);
    try {
      const before = f.signature();
      assert.equal(before.points, getFallsPointLightBudget(quality).ritualVisibleSlots);
      f.ritual.openHiddenChest();
      assert.equal(f.claims(), 0, 'a locked chest still grants nothing');
      f.ritual.fantasyPuzzleSolved = true;
      f.ritual.openHiddenChest();
      f.ritual.openHiddenChest();
      assert.equal(f.claims(), 1, 'inspect does not replay the reward');
      for (let frame = 0; frame < 180; frame++) {
        if (frame === 15) {
          f.ritual.triggerCrystalTinkle(new THREE.Vector3(), new THREE.Color(0x00ffff), 0);
          f.ritual.refreshQuality();
        }
        f.ritual.update(1 / 60);
        assert.deepEqual(f.signature(), before, `${quality}: no light-count shader variant at frame ${frame}`);
        if (frame === 0) {
          const light = f.ritual.ritualLightSlots[0].light;
          assert.ok(light.intensity > 0);
          assert.ok(light.position.distanceTo(new THREE.Vector3(-5.5, 3.83, -8.65)) < 1e-9);
        }
      }
      assert.equal(f.ritual.ritualLightSlots[0].light.intensity, 0, 'spent flash cannot leak into another lease');
      f.ritual.triggerCrystalTinkle(new THREE.Vector3(2, 1, 3), new THREE.Color(0x00ffff), 0);
      f.ritual.update(1 / 60);
      assert.deepEqual(f.signature(), before, 'the tinkle slot can be reused after the reward');
    } finally { f.dispose(); }
  }
});

test('chest coins are prewarmable at zero instances and quality changes cannot reveal dormant coins', () => {
  const f = chestFixture('low', false);
  try {
    const burst = f.ritual.chestBurst;
    const mesh = burst.coins;
    assert.equal(mesh.visible, true);
    assert.equal(mesh.count, 0);
    assert.equal(mesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
    for (const quality of ['high', 'low', 'medium']) {
      f.host.getQuality = () => quality;
      f.ritual.refreshQuality();
      assert.equal(mesh.count, 0);
    }
    f.ritual.fantasyPuzzleSolved = true;
    f.ritual.openHiddenChest();
    assert.equal(mesh.count, 18);
    for (let i = 0; i < 150; i++) f.ritual.update(1 / 60);
    assert.equal(mesh.count, 0);
    assert.equal(f.ritual.chestBurst.coins, mesh, 'effect reuses its original geometry and buffers');
  } finally { f.dispose(); }
});

const no = () => false;
function hoverFixture() {
  const counters = { icons: 0, targets: 0, rects: 0, marked: [] };
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100);
  camera.position.set(0, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const game = Object.assign(Object.create(PortfolioGame.prototype), {
    camera, elapsed: 1, windowFocused: true, externalInputEnabled: true, transitioning: false,
    worldCollapse: null, playerPosition: new THREE.Vector3(), surfaceOffset: 0, jumpHeight: 0,
    clickNavigationPointerInside: false, clickNavigationPress: null, clickNavigationHover: null,
    clickNavigationHoverProjectionDirty: false, clickNavigationHoverProjectionCaptured: false,
    nextClickNavigationHoverProjectionAt: 0, // Old implementations are replayable too.
    clickNavigationHoverCameraWorldMatrix: new THREE.Matrix4(),
    clickNavigationHoverProjectionMatrix: new THREE.Matrix4(),
    clickNavigationHoverPlayerPosition: new THREE.Vector3(), clickNavigationHoverFeetHeight: 0,
    clickNavigationMarkerPosition: new THREE.Vector3(), preferReducedMotion: true,
    pointer: new THREE.Vector2(), pointerRaycaster: new THREE.Raycaster(), pendingPointerHover: null,
    pointerPickFrameActive: false, pointerPickRayPrepared: false, hoverPointerActiveUntil: 0,
    navigation: { route: null, hasPending: false, pendingTarget: null, failure: null },
    canvas: { style: {}, getBoundingClientRect() { counters.rects++; return { left: 0, top: 0, width: 1000, height: 800 }; } },
    isWorldPointerInteractionLocked: no, isNavigationLocked: no, hasActivePointerDrag: no,
    heldKickable: null, telekinesisPointerId: null,
    pongChallenge: { isActive: no, updateBallDrag: no, isPointingAtBall: no, isPointingAtPaddle: no },
    voidTurtleRide: { isRiding: no },
    archiveSignalPuzzle: { updatePointerDrag: no, isPointingAtRelay: no },
    archiveOrbitPlayground: { updatePointerDrag: no, isPointingAtPlanet: no },
    updateAmbientGridDrag: no, updateMathInstanceDrag: no,
    isPointingAtWornCompass: no, isPointingAtWornPencil: no,
    findPointedMathInstanceDrag: no, findPointedKickable: no, isPointingAtAmbientGrid: no,
    refreshClickNavigationTarget() {},
    clickNavigationMarker: { show(position) { counters.marked.push(position.x); }, hide() {}, update() {}, showRouteAnchor() {} },
  });
  game.findPointedPointerAction = event => {
    counters.icons++;
    game.updatePointerRay(event); game.updatePointerRay(event);
    return null;
  };
  game.findClickNavigationTargetAt = (x, y) => {
    counters.targets++;
    game.updatePointerRayAt(x, y);
    return { position: new THREE.Vector3(x, 0, y), markerY: 0, surface: null, reachable: true };
  };
  const event = (x, type = 'pointermove') => ({ type, buttons: 0, button: -1,
    pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: x, clientY: 200,
    timeStamp: game.elapsed * 1000, preventDefault() {} });
  return { game, counters, event };
}

test('rapid idle pointer events do no picking until the frame and use only the latest coordinates', () => {
  const { game, counters, event } = hoverFixture();
  for (let i = 0; i < 100; i++) game.handleTelekinesisMove(event(300 + i));
  assert.equal(counters.icons + counters.targets + counters.rects, 0);
  game.updatePointerFeedback();
  assert.deepEqual([counters.icons, counters.targets, counters.rects], [1, 1, 1]);
  assert.equal(counters.marked.at(-1), 399);
  // Scope must end: an actual input event measures current canvas layout again.
  game.updatePointerRayAt(399, 200);
  assert.equal(counters.rects, 2);
});

test('performance recording preserves coalesced hover and immediate drag dispatch, including exceptions', t => {
  const { game, counters, event } = hoverFixture();
  let now = 1000;
  const monitor = new PerformanceMonitor(() => now);
  t.after(() => monitor.clear());
  game.performanceMonitor = monitor;
  monitor.start(10);
  for (let i = 0; i < 100; i++) game.handleTelekinesisMove(event(300 + i));
  assert.equal(counters.icons + counters.targets + counters.rects, 0);
  monitor.callback(); monitor.beginFrame(now, 1000 / 60, 60);
  game.updatePointerFeedback();
  monitor.phase(10); monitor.endFrame();
  assert.deepEqual([counters.icons, counters.targets, counters.rects], [1, 1, 1]);
  assert.equal(counters.marked.at(-1), 399);
  let dragged = 0;
  game.hasActivePointerDrag = () => true;
  game.updateAmbientGridDrag = () => { now += 9; dragged++; return true; };
  game.handleTelekinesisMove(event(210));
  assert.equal(dragged, 1, 'captured movement is still dispatched immediately');
  game.updateAmbientGridDrag = () => { now += 3; throw new Error('test error'); };
  assert.throws(() => game.handleTelekinesisMove(event(211)), /test error/);
  assert.equal(monitor.inputDepth, 0, 'exception cannot leave the recorder inside an event');
  const report = JSON.parse(monitor.export());
  assert.equal(report.frames[0][report.columns.indexOf('pointerEvents')], 100);
  assert.ok(report.events.some(e => e.kind === 'slow-pointer-move' && e.durationMs === 9));
});

test('moving hover targets update every active frame, while a stationary pointer does no repeat picking', (t) => {
  const { game, counters, event } = hoverFixture();
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  for (let i = 0; i < 12; i++) {
    clock += 1000 / 60;
    game.elapsed += 1 / 60;
    game.recordClickNavigationPointer(event(200 + i));
    game.refreshClickNavigationHoverFromPointer();
    assert.equal(game.clickNavigationHover.position.x, 200 + i);
  }
  assert.equal(counters.targets, 12, 'no second 30 Hz gate on a 60 Hz render');
  const activeUntil = game.hoverPointerActiveUntil;
  assert.equal(activeUntil, clock + 150, 'hover cadence boost is bounded after real motion');
  for (let i = 0; i < 12; i++) {
    clock += 1000 / 60; game.elapsed += 1 / 60;
    game.refreshClickNavigationHoverFromPointer();
  }
  assert.equal(counters.targets, 12);
  assert.equal(game.hoverPointerActiveUntil, activeUntil, 'stationary frames cannot extend the active-cadence lease');
  assert.ok(clock > activeUntil);
  game.camera.position.x += 1;
  game.refreshClickNavigationHoverFromPointer();
  assert.equal(counters.targets, 13, 'a moved camera invalidates the stationary projection');
});

test('hover batching cannot delay an active drag or replace a committed navigation marker', () => {
  const { game, counters, event } = hoverFixture();
  let dragged = 0;
  game.hasActivePointerDrag = () => true;
  game.updateAmbientGridDrag = () => { dragged++; return true; };
  game.handleTelekinesisMove(event(210));
  assert.equal(dragged, 1);
  assert.equal(game.pendingPointerHover, null);
  game.hasActivePointerDrag = no;
  game.navigation.route = { target: { position: new THREE.Vector3(999, 0, 0), markerY: 0, reachable: true } };
  game.handleTelekinesisMove(event(220));
  game.updatePointerFeedback();
  assert.equal(counters.targets, 0);
  assert.equal(counters.marked.at(-1), 999);
  game.findPointedPointerAction = () => { throw new Error('test error'); };
  game.handleTelekinesisMove(event(230));
  assert.throws(() => game.updatePointerFeedback(), /test error/);
  assert.equal(game.pointerPickFrameActive, false);
  assert.equal(game.pointerPickRayPrepared, false);
});

test('prop picking keeps nearest-owner and grabbable-frog priority without subtree ownership searches', () => {
  const { game, event } = hoverFixture();
  delete game.findPointedKickable;
  const material = new THREE.MeshBasicMaterial();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const make = (y, enabled) => {
    const object = new THREE.Group();
    const child = new THREE.Mesh(geometry, material); object.add(child);
    object.position.set(0, y, 0); object.updateMatrixWorld(true);
    return { object, enabled };
  };
  const lower = make(1, true), frog = make(3, false), disabled = make(5, false);
  game.kickables = [lower, disabled, frog]; game.kickablePickHits = [];
  game.fallsCrystalFrog = { canGrab: body => body === frog };
  game.updatePointerRay = () => { game.pointerRaycaster.ray.set(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0)); };
  try {
    assert.equal(game.findPointedKickable(event(0)), frog);
    game.fallsCrystalFrog.canGrab = no;
    assert.equal(game.findPointedKickable(event(0)), lower);
    lower.enabled = false;
    assert.equal(game.findPointedKickable(event(0)), null);
  } finally { geometry.dispose(); material.dispose(); }
});

test('held cursor follows each display sample while route requests stay throttled and the checked dot stays put', () => {
  const { game, counters } = hoverFixture();
  const checked = { position: new THREE.Vector3(5, 0, 200), markerY: 0, surface: null, reachable: true };
  const requests = [];
  const anchors = [];
  game.navigation.route = { target: checked };
  game.navigation.retarget = target => { requests.push(target.position.clone()); return true; };
  game.clickNavigationMarker.showRouteAnchor = point => anchors.push(point?.clone() ?? null);
  game.clickNavigationPress = {
    continuous: true, currentClientX: 20, currentClientY: 200,
    startClientX: 20, startClientY: 200, startedAt: 0, nextRetargetAt: -Infinity,
    pointerType: 'mouse', target: checked, visualTarget: null,
  };
  for (let frame = 0; frame < 12; frame++) {
    game.elapsed += 1 / 60;
    game.clickNavigationPress.currentClientX = 20 + frame;
    game.updatePointerFeedback();
    assert.equal(counters.marked.at(-1), 20 + frame, 'ring must not wait for a route submission');
    assert.equal(anchors.at(-1).x, 5, 'dot describes the published route, not the pending goal');
    assert.equal(checked.position.x, 5, 'visual picking cannot mutate the checked target');
  }
  assert.equal(counters.targets, 12, 'one local pick per rendered frame, not two on submission frames');
  assert.equal(requests.length, 3, '75 ms request throttle is unchanged');
  game.navigation.pendingTarget = { ...checked, position: new THREE.Vector3(99, 0, 200) };
  game.elapsed += 1 / 60;
  game.updatePointerFeedback();
  assert.equal(anchors.at(-1).x, 5, 'an unfinished job is not a calculated path');
  game.findClickNavigationTargetAt = () => null;
  let hidden = false;
  game.clickNavigationMarker.hide = () => { hidden = true; };
  game.elapsed += 1 / 60;
  game.updatePointerFeedback();
  assert.equal(hidden, true, 'empty sky does not pin the cursor to an old surface');
  assert.equal(anchors.at(-1).x, 5, 'the checked destination survives a temporary ray miss');
  game.clickNavigationPress = null;
  game.updateClickNavigationMarker();
  assert.equal(anchors.at(-1), null, 'the auxiliary dot is held-input feedback only');
  assert.equal(counters.marked.at(-1), 99, 'one-shot planning feedback retains its original ownership');
});
