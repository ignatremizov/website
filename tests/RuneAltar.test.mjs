import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RuneAltar } from "../src/game/RuneAltar.ts";
import { disposeObjectTree } from "../src/game/sceneResources.ts";

function fixture() {
  const palette = {
    stone: new THREE.MeshStandardMaterial(),
    moss: new THREE.MeshStandardMaterial(),
    brass: new THREE.MeshStandardMaterial(),
    cyan: new THREE.MeshBasicMaterial({ color: 0x65efff }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffbc66 }),
  };
  let prepares = 0;
  let reveals = 0;
  const altar = new RuneAltar(palette, {
    onStatus: () => {},
    getRevealTarget: target => target.set(4, 2.46, 1),
    onPreparePortfolio: () => { prepares += 1; },
    onRevealPortfolio: () => { reveals += 1; },
  });
  const lights = [];
  let packets = null;
  altar.object.traverse(object => {
    if (object instanceof THREE.PointLight) lights.push(object);
    if (object instanceof THREE.InstancedMesh) packets = object;
  });
  return { altar, lights, packets, prepares: () => prepares, reveals: () => reveals };
}

test("monument flash, transmission, and close retain the same quality-tier light slots", () => {
  for (const quality of ["low", "medium", "high"]) {
    for (const reducedMotion of [false, true]) {
      const { altar, lights, packets, prepares, reveals } = fixture();
      altar.setQuality(quality);
      const expected = quality === "low" ? [] : lights;
      let elapsed = 0;
      const step = () => {
        elapsed += 1 / 60;
        altar.update(1 / 60, elapsed, reducedMotion);
        assert.deepEqual(lights.filter(light => light.visible), expected,
          "animation must not change the shader light-count variant");
        if (quality === "low") assert.ok(lights.every(light => light.intensity === 0));
        if (packets.visible && packets.material.opacity > 0) {
          assert.equal(packets.count, packets.instanceMatrix.count,
            "transmission restores the packet capacity after zero-instance warmup");
        }
      };
      for (let index = 0; index < 4; index += 1) step();
      assert.ok(lights.every(light => light.intensity === 0));
      for (let cycle = 1; cycle <= 2; cycle += 1) {
        altar.activate(reducedMotion);
        assert.equal(prepares(), cycle);
        let frames = 0;
        while (reveals() < cycle && frames++ < 180) step();
        assert.equal(reveals(), cycle, "the animated beam must still open the portfolio");
        for (let index = 0; index < 5; index += 1) step();
        if (quality !== "low") assert.ok(lights.every(light => light.intensity > 0));
        altar.releasePortfolio(reducedMotion);
        for (let index = 0; index < 90; index += 1) step();
        assert.ok(lights.every(light => light.intensity === 0),
          "reserved slots must contribute no light after winding down");
      }
      disposeObjectTree(altar.object);
    }
  }
});

test("entry warms invisible beam buffers, then returns to idle without delaying immediate activation", () => {
  for (const activateImmediately of [false, true]) {
    const { altar, packets, reveals } = fixture();
    const idleCulling = new Map();
    altar.object.traverse(object => {
      if (object instanceof THREE.Mesh) idleCulling.set(object, object.frustumCulled);
    });
    altar.setQuality("medium");
    if (activateImmediately) altar.activate(false);
    altar.update(1 / 60, 1 / 60, false);
    assert.equal(packets.visible, true);
    assert.equal(packets.count, 0);
    assert.equal(packets.material.opacity, 0);
    assert.equal(packets.material.depthWrite, false);
    assert.equal(packets.frustumCulled, false);
    for (let frame = 2; frame < 12; frame += 1) {
      altar.update(1 / 60, frame / 60, false);
    }
    assert.equal(packets.visible, false, "warmup must not add perpetual idle draws");
    for (const [mesh, culled] of idleCulling) assert.equal(mesh.frustumCulled, culled);

    if (!activateImmediately) altar.activate(false);
    for (let frame = 12; frame < 150; frame += 1) {
      altar.update(1 / 60, frame / 60, false);
    }
    assert.equal(reveals(), 1);
    assert.equal(packets.visible, true);
    assert.equal(packets.count, packets.instanceMatrix.count);
    disposeObjectTree(altar.object);
  }
});

test("changing quality during a monument transmission does not let animation re-enable Low lights", () => {
  const { altar, lights } = fixture();
  altar.setQuality("high");
  altar.activate(false);
  let elapsed = 0;
  for (let index = 0; index < 85; index += 1) {
    elapsed += 1 / 60;
    altar.update(1 / 60, elapsed, false);
  }
  assert.ok(lights.every(light => light.intensity > 0));
  altar.setQuality("low");
  for (let index = 0; index < 10; index += 1) {
    elapsed += 1 / 60;
    altar.update(1 / 60, elapsed, false);
    assert.ok(lights.every(light => !light.visible && light.intensity === 0));
  }
  altar.setQuality("medium");
  altar.update(1 / 60, elapsed + 1 / 60, false);
  assert.ok(lights.every(light => light.visible && light.intensity > 0));
  disposeObjectTree(altar.object);
});
