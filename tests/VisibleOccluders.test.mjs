import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { VisibleOccluders } from "../src/game/VisibleOccluders.ts";

test("registering both cliff assemblies and their ledges does not repeat outline queries", () => {
  const registry = new VisibleOccluders();
  const assembly = new THREE.Group();
  const ledge = new THREE.Mesh();
  assembly.add(ledge);
  // Builders can register the climbable child before the finished assembly.
  registry.add(ledge);
  registry.add(assembly);
  registry.add(ledge);
  let queries = 0;
  ledge.raycast = () => { queries += 1; };
  registry.prepare();
  registry.intersects(new THREE.Raycaster());
  assert.equal(queries, 1);

  // A prop detached from its assembly remains an independently registered
  // occluder. An optimization must not cache its former parent permanently.
  ledge.removeFromParent();
  registry.prepare();
  registry.intersects(new THREE.Raycaster());
  assert.equal(queries, 2);
});

test("hidden seals and hidden descendants cannot enable a player outline", () => {
  const registry = new VisibleOccluders();
  const assembly = new THREE.Group();
  const seal = new THREE.Mesh();
  assembly.add(seal);
  registry.add(assembly);
  registry.add(seal);
  let queries = 0;
  seal.raycast = (_ray, hits) => {
    queries += 1;
    hits.push({ distance: 1, object: seal });
  };
  const raycaster = new THREE.Raycaster();
  registry.prepare();
  assert.equal(registry.intersects(raycaster), true);

  seal.visible = false;
  registry.prepare();
  assert.equal(registry.intersects(raycaster), false);
  seal.visible = true;
  assembly.visible = false;
  registry.prepare();
  assert.equal(registry.intersects(raycaster), false);
  assert.equal(queries, 1);

  assembly.visible = true;
  registry.prepare();
  assert.equal(registry.intersects(raycaster), true);
});

test("zone teardown releases prepared outline candidates before the next query", () => {
  const registry = new VisibleOccluders();
  const ledge = new THREE.Mesh();
  ledge.raycast = () => assert.fail("a departed zone must not be raycast");
  registry.add(ledge);
  registry.prepare();
  registry.clear();
  assert.equal(registry.intersects(new THREE.Raycaster()), false);
  assert.equal(registry.objects.length, 0);
});
