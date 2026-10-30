import assert from "node:assert/strict";
import test from "node:test";
import { PerformanceMonitor, performancePhases } from "../src/game/PerformanceMonitor.ts";
import { FramePacer } from "../src/game/FrameTiming.ts";

function fixture(t, seconds = 120) {
  let now = 1000;
  let completed = 0;
  const monitor = new PerformanceMonitor(() => now, () => completed++);
  t.after(() => monitor.clear());
  monitor.start(seconds, { build: "test-capture" });
  const sample = (at, expected = 1000 / 60, costs = []) => {
    now = at;
    monitor.callback();
    if (!monitor.recording) return;
    monitor.beginFrame(at, expected, expected > 25 ? 30 : 60);
    for (let i = 1; i < performancePhases.length; i++) {
      now += costs[i] ?? 0;
      monitor.phase(i);
    }
    monitor.endFrame();
  };
  return { monitor, sample, set time(value) { now = value; }, get time() { return now; },
    get completed() { return completed; } };
}

function objects(trace) {
  return trace.frames.map(row => Object.fromEntries(trace.columns.map((key, i) => [key, row[i]])));
}

test("disabled performance recording does not read clocks, create observers, or retain input", () => {
  const monitor = new PerformanceMonitor(() => assert.fail("disabled diagnostics must not sample time"));
  monitor.callback(); monitor.beginFrame(10, 16, 60); monitor.phase(1);
  monitor.addNested("navigation", 12); monitor.endFrame();
  assert.equal(monitor.beginInput(), -1);
  monitor.endInput(-1, "move"); monitor.event("ignored"); monitor.discontinuity("visible");
  assert.equal(monitor.status().frames, 0);
  const data = JSON.parse(monitor.export());
  assert.deepEqual(data.frames, []);
  assert.deepEqual(data.events, []);
  assert.equal(monitor.data, null, "large capture buffer is lazy");
});

test("display-aligned 30/60 pacing and target transitions are not mislabeled as hitches", t => {
  for (const hz of [60, 75, 90, 120, 144, 165]) {
    const h = fixture(t);
    const pacer = new FramePacer();
    const unobserved = new FramePacer();
    for (let callback = 0; callback < hz * 2; callback++) {
      const at = 1000 + callback * 1000 / hz;
      const target = callback < hz / 2 || callback >= hz * 1.5 ? 30 : 60;
      h.time = at;
      h.monitor.callback();
      const rendered = pacer.shouldRender(at, target);
      assert.equal(rendered, unobserved.shouldRender(at, target));
      const expected = pacer.expectedFrameIntervalMs;
      if (!rendered) continue;
      h.monitor.beginFrame(at, expected, target);
      h.time += 2;
      h.monitor.phase(11);
      h.monitor.endFrame();
    }
    const report = JSON.parse(h.monitor.export());
    assert.equal(report.summary.hitchCount, 0, `intentional ${hz}Hz pacing should not raise alarms`);
    const rows = objects(report);
    assert.ok(rows.some(row => row.callbacksSinceFrame > 1), "paced skips are visible in diagnostics");
    assert.ok(rows.every(row => row.expectedFrameMs > 0));
  }
});

test("a delayed frame retains the preceding expensive work rather than blaming its fast successor", t => {
  const h = fixture(t);
  h.monitor.context.programs = 10;
  h.sample(1000, 1000 / 60, { 1: 1, 11: 2 });
  h.monitor.context.programs = 11;
  h.sample(1017, 1000 / 60, { 1: 2, 11: 80 });
  h.sample(1130, 1000 / 60, { 1: 1, 11: 2 });
  const data = JSON.parse(h.monitor.export());
  const rows = objects(data);
  assert.equal(rows[1].cpuMs, 82);
  assert.equal(rows[1].renderSubmitMs, 80);
  assert.equal(rows[1].programDelta, 1);
  assert.equal(rows[2].frameGapMs, 113);
  assert.equal(rows[2].previousCpuMs, 82);
  assert.equal(rows[2].cpuMs, 3);
  assert.equal(data.worstHitches[0].previous.sequence, rows[1].sequence);
  assert.equal(data.worstHitches[0].frame.sequence, rows[2].sequence);
  assert.equal(data.browserObservation.gpuTiming, "not collected");
});

test("hidden time resets both callback and frame baselines without erasing the prior capture", t => {
  const h = fixture(t);
  h.sample(1000);
  h.sample(1017);
  h.time = 1020;
  h.monitor.discontinuity("hidden");
  h.time = 40_000;
  h.monitor.discontinuity("visible");
  h.sample(40_000);
  h.sample(40_017);
  const data = JSON.parse(h.monitor.export());
  assert.equal(data.summary.hitchCount, 0);
  assert.equal(data.summary.recordedFrames, 4);
  const resumed = objects(data)[2];
  assert.equal(resumed.frameGapMs, 0);
  assert.equal(resumed.callbackGapMaxMs, 0);
  assert.equal(resumed.previousCpuMs, 0);
  assert.deepEqual(data.events.map(e => e.kind), ["hidden", "visible"]);
});

test("a two-minute capture self-stops exactly once and rejects invalid durations", t => {
  const h = fixture(t);
  for (const seconds of [0, 9, 301, 1.5, NaN, Infinity]) {
    assert.throws(() => h.monitor.start(seconds), RangeError);
  }
  const pacer = new FramePacer();
  for (let callback = 0; callback <= 14_400; callback++) {
    h.time = 1000 + callback * 1000 / 120;
    h.monitor.callback();
    if (!pacer.shouldRender(h.time, 60)) continue;
    h.monitor.beginFrame(h.time, pacer.expectedFrameIntervalMs, 60);
    if (h.monitor.recording) {
      h.time += 1;
      h.monitor.phase(1);
      h.time += 2;
      h.monitor.phase(11);
      h.monitor.endFrame();
    }
  }
  assert.equal(h.monitor.recording, false);
  assert.equal(h.completed, 1);
  const status = h.monitor.status();
  assert.ok(status.frames > 7100 && status.frames < 7250);
  h.monitor.callback();
  assert.equal(h.completed, 1);
  assert.equal(h.monitor.status().frames, status.frames);
  assert.equal(h.monitor.timer, null);
  assert.equal(JSON.parse(h.monitor.export()).status.reason, "duration complete");
});

test("ring overflow is explicit and the worst hitch pair survives newer smooth frames", t => {
  const h = fixture(t, 300);
  h.sample(1000);
  h.sample(1100, 1000 / 60, { 11: 45 });
  for (let i = 0; i < 17_000; i++) h.sample(1150 + i * 10);
  const data = JSON.parse(h.monitor.export());
  assert.equal(data.frames.length, data.limits.frames);
  assert.equal(data.summary.overwrittenFrames, 17_002 - data.limits.frames);
  const rows = objects(data);
  assert.equal(rows.at(-1).sequence, 17_002);
  assert.equal(data.worstHitches[0].frame.sequence, 2);
  assert.equal(data.worstHitches[0].previous.sequence, 1);
  assert.equal(data.summary.worstGapMs, 100);
  assert.equal(data.summary.retainedFrameGapP99Ms, 10);
  const immutable = JSON.stringify(data.worstHitches);
  h.monitor.start(10);
  h.sample(200_000);
  assert.equal(JSON.stringify(data.worstHitches), immutable);
});

test("input spans coalesce nested capture events and nested CPU measurements remain subsets", t => {
  const h = fixture(t);
  const outer = h.monitor.beginInput();
  h.time += 3;
  const inner = h.monitor.beginInput();
  h.time += 5;
  h.monitor.endInput(inner, "up");
  h.time += 2;
  h.monitor.endInput(outer, "down");
  h.time = 1020;
  h.monitor.callback(); h.monitor.beginFrame(1020, 1000 / 60, 60);
  h.time += 12;
  h.monitor.addNested("navigation", 4); h.monitor.addNested("props", 3);
  h.monitor.phase(1); h.monitor.endFrame();
  const data = JSON.parse(h.monitor.export());
  const frame = objects(data)[0];
  assert.equal(frame.pointerEvents, 1);
  assert.equal(frame.pointerCpuMs, 10);
  assert.equal(frame.playerMs, 12);
  assert.equal(frame.cpuMs, 12);
  assert.equal(frame.navigationMs, 4);
  assert.equal(frame.propPhysicsMs, 3);
  assert.equal(data.events[0].kind, "slow-pointer-down");
});

test("browser observers are feature-detected, bounded, sanitized, drained, and disconnected", t => {
  const previous = globalThis.PerformanceObserver;
  const instances = [];
  class Observer {
    static supportedEntryTypes = ["longtask", "long-animation-frame"];
    constructor(callback) { this.callback = callback; this.records = []; instances.push(this); }
    observe(options) { assert.equal(options.buffered, false); this.type = options.type; }
    takeRecords() { const rows = this.records; this.records = []; return rows; }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  globalThis.PerformanceObserver = Observer;
  t.after(() => { if (previous === undefined) delete globalThis.PerformanceObserver; else globalThis.PerformanceObserver = previous; });
  const h = fixture(t);
  const secret = "https://example.invalid/private-script?token=should-not-be-recorded";
  const entry = (i) => ({ entryType: "longtask", startTime: 1100 + i, duration: 51,
    name: secret, attribution: [{ name: secret }] });
  instances[0].emit([entry(-200), { ...entry(1), entryType: "resource" }, entry(2)]);
  for (let i = 0; i < 220; i++) instances[0].emit([entry(i)]);
  instances[1].records.push({ ...entry(230), entryType: "long-animation-frame" });
  const text = h.monitor.export();
  assert.equal(text.includes(secret), false);
  const report = JSON.parse(text);
  assert.equal(report.events.length, report.limits.events);
  assert.equal(report.events.at(-1).kind, "long-animation-frame");
  assert.equal(report.summary.eventsRecorded, 222);
  assert.ok(instances.every(i => i.disconnected));
  h.monitor.start(10);
  instances[0].emit([entry(0)]);
  assert.equal(JSON.parse(h.monitor.export()).events.length, 0, "old observer delivery cannot contaminate a new capture");
});

test("a hidden capture's one-shot timer stops and cleans up without animation callbacks", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = fixture(t, 10);
  h.monitor.discontinuity("hidden");
  h.time = 11_000;
  t.mock.timers.tick(10_000);
  assert.equal(h.monitor.recording, false);
  assert.equal(h.completed, 1);
  t.mock.timers.tick(10_000);
  assert.equal(h.completed, 1);
  assert.equal(h.monitor.status().reason, "duration complete");
});
