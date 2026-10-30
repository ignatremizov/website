import assert from "node:assert/strict";
import test from "node:test";
import { NavigationTrace } from "../src/game/NavigationTrace.ts";

const event = (id) => ({
  kind: "request", requestId: id, zone: "falls", time: id,
  from: { x: 0, y: -0.16, z: 1 }, target: { x: 2, y: 1.5, z: 0 },
  fromSupport: null, targetSupport: "shelf",
});

test("disabled diagnostics do not retain requests, and enabled history is a bounded chronological ring", () => {
  const trace = new NavigationTrace(3);
  trace.record(event(0));
  assert.deepEqual(trace.snapshot(), []);
  trace.enabled = true;
  for (let id = 1; id <= 8; id++) trace.record(event(id));
  assert.deepEqual(trace.snapshot().map(row => row.requestId), [6, 7, 8]);
  trace.enabled = false;
  trace.record(event(9));
  assert.deepEqual(trace.snapshot().map(row => row.requestId), [6, 7, 8]);
  assert.equal(JSON.parse(trace.export()).events.length, 3);
});

test("diagnostic snapshots cannot mutate game vectors or retained history", () => {
  const trace = new NavigationTrace();
  trace.enabled = true;
  const record = event(1);
  trace.record(record);
  record.target.y = 999;
  const copy = trace.snapshot();
  copy[0].from.y = 999;
  copy[0].target.y = 888;
  assert.equal(trace.snapshot()[0].from.y, -0.16);
  assert.equal(trace.snapshot()[0].target.y, 1.5);
  trace.clear();
  assert.deepEqual(trace.snapshot(), []);
  assert.equal(trace.enabled, true);
});
