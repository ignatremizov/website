import assert from "node:assert/strict";
import test from "node:test";

import {
  FramePacer,
  FrameTimingWindow,
  activeFrameRate,
  idleFrameRate,
  selectDisplayAlignedStride,
  selectTargetFrameRate,
  summarizeFrameTimings,
} from "../src/game/FrameTiming.ts";

function collectRenderedFrames(displayRefreshRate, targetFrameRate) {
  const pacer = new FramePacer();
  const durationMs = 60_000;
  const displayIntervalMs = 1_000 / displayRefreshRate;
  const renderedAt = [];

  for (
    let displayFrame = 0;
    displayFrame * displayIntervalMs <= durationMs;
    displayFrame += 1
  ) {
    if (
      pacer.shouldRender(
        displayFrame * displayIntervalMs,
        targetFrameRate,
      )
    ) {
      renderedAt.push(displayFrame * displayIntervalMs);
    }
  }

  return renderedAt;
}

test("active pacing settles on one stable display-callback stride", () => {
  const expectedCadences = new Map([
    [60.02, 60.02],
    [75, 75],
    [90, 45],
    [100, 50],
    [120, 60],
    [144, 72],
    [165, 55],
  ]);

  for (const [displayRefreshRate, expectedCadence] of expectedCadences) {
    const displayIntervalMs = 1_000 / displayRefreshRate;
    const expectedStride = Math.round(
      displayRefreshRate / activeFrameRate,
    );
    assert.equal(
      selectDisplayAlignedStride(
        displayIntervalMs,
        activeFrameRate,
      ),
      expectedStride,
    );

    const renderedAt = collectRenderedFrames(
      displayRefreshRate,
      activeFrameRate,
    ).filter((timestamp) => timestamp >= 1_000);
    const steadyGaps = new Set(
      renderedAt
        .slice(1)
        .map((timestamp, index) =>
          (timestamp - renderedAt[index]).toFixed(5),
        ),
    );
    assert.equal(
      steadyGaps.size,
      1,
      `${displayRefreshRate} Hz should use one steady callback gap`,
    );
    const measuredCadence =
      ((renderedAt.length - 1) * 1_000) /
      (renderedAt.at(-1) - renderedAt[0]);
    assert.ok(
      Math.abs(measuredCadence - expectedCadence) < 0.03,
      `${displayRefreshRate} Hz should settle near ${expectedCadence} FPS`,
    );
  }
});

test("idle deadline pacing retains its 30 FPS average", () => {
  for (const displayRefreshRate of [75, 90, 100, 144, 165]) {
    const renderedFrames = collectRenderedFrames(
      displayRefreshRate,
      idleFrameRate,
    ).length;
    // The first callback renders immediately and establishes the first deadline.
    assert.ok(
      Math.abs(renderedFrames - 1 - idleFrameRate * 60) <= 1,
      `${displayRefreshRate} Hz should retain the 30 FPS idle average`,
    );
  }
});

test("pacing re-anchors immediately for target changes, resets, and long stalls", () => {
  const pacer = new FramePacer();

  assert.equal(pacer.shouldRender(0, idleFrameRate), true);
  assert.equal(pacer.shouldRender(16, idleFrameRate), false);
  assert.equal(pacer.shouldRender(16, activeFrameRate), true);
  assert.equal(pacer.shouldRender(24, activeFrameRate), false);
  assert.equal(pacer.shouldRender(33, activeFrameRate), true);

  assert.equal(pacer.shouldRender(507, activeFrameRate), true);
  assert.equal(pacer.shouldRender(523, activeFrameRate), false);
  assert.equal(pacer.shouldRender(524, activeFrameRate), true);

  pacer.reset();
  assert.equal(pacer.shouldRender(8_000, idleFrameRate), true);
});

test("low quality stays capped except while direct pointer input is active", () => {
  assert.equal(
    selectTargetFrameRate(false, false, false),
    idleFrameRate,
  );
  assert.equal(
    selectTargetFrameRate(false, false, true),
    activeFrameRate,
  );
  assert.equal(
    selectTargetFrameRate(true, false, true),
    idleFrameRate,
  );
  assert.equal(
    selectTargetFrameRate(true, true, false),
    activeFrameRate,
  );
});

test("raw timing summaries retain p95 and worst-frame hitches", () => {
  const frameTimes = [
    ...Array.from({ length: 94 }, () => 16),
    ...Array.from({ length: 6 }, () => 80),
  ];
  const elapsedMs = frameTimes.reduce(
    (total, frameTime) => total + frameTime,
    0,
  );

  assert.deepEqual(
    summarizeFrameTimings(
      frameTimes,
      frameTimes.length,
      elapsedMs,
    ),
    {
      fps: 50,
      p95FrameMs: 80,
      worstFrameMs: 80,
    },
  );
});

test("metric windows use raw rendered-frame time but exclude intentional visibility pauses", () => {
  const timings = new FrameTimingWindow();

  assert.equal(timings.recordFrame(0), null);
  for (let frame = 1; frame <= 20; frame += 1) {
    assert.equal(timings.recordFrame(frame * 25), null);
  }
  assert.deepEqual(timings.recordFrame(1_100), {
    fps: 19,
    p95FrameMs: 25,
    worstFrameMs: 600,
  });

  timings.reset();
  assert.equal(timings.recordFrame(10_000), null);
  assert.equal(timings.recordFrame(10_500), null);
  assert.deepEqual(timings.recordFrame(11_000), {
    fps: 2,
    p95FrameMs: 500,
    worstFrameMs: 500,
  });
});
