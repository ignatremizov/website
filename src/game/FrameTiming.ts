export const activeFrameRate = 60;
export const idleFrameRate = 30;

export type TargetFrameRate =
  | typeof activeFrameRate
  | typeof idleFrameRate;

const deadlineToleranceMs = 0.5;
const maximumDeadlineDebt = 4;
const metricReportingWindowMs = 1_000;
const maximumFrameTimingSamples = 120;
const displayCadenceSampleCapacity = 24;
const minimumDisplayCadenceSamples = 8;
const minimumDisplayCallbackMs = 3;
const maximumDisplayCallbackMs = 50;

/**
 * Keeps low quality at its documented 30 FPS cap while allowing direct pointer
 * manipulation to use the active cadence. Higher tiers promote any active
 * world motion to that cadence.
 */
export function selectTargetFrameRate(
  lowQuality: boolean,
  directPointerInput: boolean,
  activeWorldMotion: boolean,
): TargetFrameRate {
  if (lowQuality) {
    return directPointerInput ? activeFrameRate : idleFrameRate;
  }
  return activeWorldMotion ? activeFrameRate : idleFrameRate;
}

/**
 * Chooses the whole-number display-callback stride nearest the requested rate.
 * A stable 55/72/75 Hz cadence looks smoother in motion than alternating gaps
 * merely to report 60 FPS on 165/144/75 Hz panels.
 */
export function selectDisplayAlignedStride(
  displayCallbackMs: number,
  targetFrameRate: TargetFrameRate,
): number {
  if (
    !Number.isFinite(displayCallbackMs) ||
    displayCallbackMs <= 0
  ) {
    return 1;
  }
  const callbacksPerTargetFrame =
    1_000 / targetFrameRate / displayCallbackMs;
  // Browser timestamps carry tiny floating-point differences from callback to
  // callback. Bias an exact half-stride consistently upward so 90 Hz cannot
  // flap between one and two callbacks for a 60 Hz target.
  return Math.max(
    1,
    Math.round(callbacksPerTargetFrame + 0.000001),
  );
}

/**
 * Advances from the accumulated deadline instead of the actual render time, so
 * fractional refresh-rate remainder is retained. Large debts are discarded:
 * simulation renders once after a stall and resumes from a fresh deadline
 * rather than trying to service frames that can no longer be shown.
 */
export function advanceFrameDeadline(
  nowMs: number,
  deadlineMs: number,
  frameIntervalMs: number,
): number {
  const latenessMs = nowMs - deadlineMs;
  if (latenessMs > frameIntervalMs * maximumDeadlineDebt) {
    return nowMs + frameIntervalMs;
  }

  const elapsedDeadlines =
    Math.floor(
      (Math.max(0, latenessMs) + deadlineToleranceMs) /
        frameIntervalMs,
    ) + 1;
  return deadlineMs + elapsedDeadlines * frameIntervalMs;
}

/**
 * Stateful only in its retained deadline; decisions are deterministic and do
 * not allocate in the animation loop.
 */
export class FramePacer {
  private readonly displayCallbackSamples = new Float64Array(
    displayCadenceSampleCapacity,
  );
  private readonly sortedDisplayCallbackSamples = new Float64Array(
    displayCadenceSampleCapacity,
  );
  private targetFrameRate: TargetFrameRate | null = null;
  private deadlineMs = 0;
  private previousTimestampMs: number | null = null;
  private displayCallbackSampleCount = 0;
  private displayCallbackSampleCursor = 0;
  private displayCallbackMs: number | null = null;
  private displayCallbackStride: number | null = null;
  private displayCallbackPhase = 0;

  /** Diagnostic view only; reading it must never advance or reset the pacer. */
  get expectedFrameIntervalMs(): number {
    return this.displayCallbackStride !== null && this.displayCallbackMs !== null
      ? this.displayCallbackStride * this.displayCallbackMs
      : 1_000 / (this.targetFrameRate ?? idleFrameRate);
  }

  reset(): void {
    this.targetFrameRate = null;
    this.deadlineMs = 0;
    this.previousTimestampMs = null;
    this.displayCallbackSampleCount = 0;
    this.displayCallbackSampleCursor = 0;
    this.displayCallbackMs = null;
    this.displayCallbackStride = null;
    this.displayCallbackPhase = 0;
  }

  shouldRender(nowMs: number, targetFrameRate: TargetFrameRate): boolean {
    const previousTimestampMs = this.previousTimestampMs;
    const clockRestarted =
      previousTimestampMs !== null &&
      nowMs < previousTimestampMs;
    const callbackGapMs =
      previousTimestampMs === null
        ? null
        : nowMs - previousTimestampMs;
    if (
      callbackGapMs !== null &&
      callbackGapMs >= minimumDisplayCallbackMs &&
      callbackGapMs <= maximumDisplayCallbackMs
    ) {
      this.recordDisplayCallback(callbackGapMs);
    }
    const targetChanged = targetFrameRate !== this.targetFrameRate;
    this.previousTimestampMs = nowMs;
    const displayCallbackStride =
      targetFrameRate === activeFrameRate &&
      this.displayCallbackMs !== null
        ? selectDisplayAlignedStride(
            this.displayCallbackMs,
            targetFrameRate,
          )
        : null;
    const displayAlignmentChanged =
      displayCallbackStride !== this.displayCallbackStride;
    const longCallbackGap =
      callbackGapMs !== null &&
      callbackGapMs > maximumDisplayCallbackMs;

    if (
      clockRestarted ||
      targetChanged ||
      displayAlignmentChanged ||
      longCallbackGap ||
      this.targetFrameRate === null
    ) {
      this.targetFrameRate = targetFrameRate;
      this.displayCallbackStride = displayCallbackStride;
      this.displayCallbackPhase = 0;
      this.deadlineMs = nowMs + 1_000 / targetFrameRate;
      return true;
    }

    if (displayCallbackStride !== null) {
      this.displayCallbackPhase += 1;
      if (this.displayCallbackPhase < displayCallbackStride) {
        return false;
      }
      this.displayCallbackPhase = 0;
      return true;
    }

    if (nowMs + deadlineToleranceMs < this.deadlineMs) {
      return false;
    }

    this.deadlineMs = advanceFrameDeadline(
      nowMs,
      this.deadlineMs,
      1_000 / targetFrameRate,
    );
    return true;
  }

  private recordDisplayCallback(callbackMs: number): void {
    this.displayCallbackSamples[this.displayCallbackSampleCursor] =
      callbackMs;
    this.displayCallbackSampleCursor =
      (this.displayCallbackSampleCursor + 1) %
      displayCadenceSampleCapacity;
    this.displayCallbackSampleCount = Math.min(
      displayCadenceSampleCapacity,
      this.displayCallbackSampleCount + 1,
    );
    if (
      this.displayCallbackSampleCount <
      minimumDisplayCadenceSamples
    ) {
      return;
    }

    const sampleCount = this.displayCallbackSampleCount;
    for (let index = 0; index < sampleCount; index += 1) {
      this.sortedDisplayCallbackSamples[index] =
        this.displayCallbackSamples[index] ?? 0;
    }
    // A tiny fixed-size insertion sort avoids frame-loop allocation and makes
    // the median insensitive to an occasional dropped browser callback.
    for (let index = 1; index < sampleCount; index += 1) {
      const value = this.sortedDisplayCallbackSamples[index] ?? 0;
      let insertionIndex = index - 1;
      while (
        insertionIndex >= 0 &&
        (this.sortedDisplayCallbackSamples[insertionIndex] ?? 0) >
          value
      ) {
        this.sortedDisplayCallbackSamples[insertionIndex + 1] =
          this.sortedDisplayCallbackSamples[insertionIndex] ?? 0;
        insertionIndex -= 1;
      }
      this.sortedDisplayCallbackSamples[insertionIndex + 1] = value;
    }
    const middle = Math.floor(sampleCount / 2);
    this.displayCallbackMs =
      sampleCount % 2 === 0
        ? ((this.sortedDisplayCallbackSamples[middle - 1] ?? 0) +
            (this.sortedDisplayCallbackSamples[middle] ?? 0)) /
          2
        : (this.sortedDisplayCallbackSamples[middle] ?? 0);
  }
}

export interface FrameTimingSummary {
  fps: number;
  p95FrameMs: number;
  worstFrameMs: number;
}

/**
 * Produces nearest-rank p95 and worst rendered-frame durations. FPS uses the
 * same raw wall-clock interval sum, not the simulation's stability clamp.
 */
export function summarizeFrameTimings(
  frameTimesMs: ArrayLike<number>,
  sampleCount: number,
  elapsedMs: number,
): FrameTimingSummary {
  const sortedFrameTimes: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    sortedFrameTimes.push(frameTimesMs[index] ?? 0);
  }
  sortedFrameTimes.sort((left, right) => left - right);

  const p95Index = Math.max(
    0,
    Math.ceil(sortedFrameTimes.length * 0.95) - 1,
  );
  return {
    fps: Math.round((sampleCount * 1_000) / elapsedMs),
    p95FrameMs: Math.round(sortedFrameTimes[p95Index] ?? 0),
    worstFrameMs: Math.round(
      sortedFrameTimes[sortedFrameTimes.length - 1] ?? 0,
    ),
  };
}

/**
 * Records at most a bounded number of raw rendered-frame intervals. The first
 * frame establishes a baseline; callers reset on intentional pauses so hidden
 * document time is not misreported as a rendering hitch.
 */
export class FrameTimingWindow {
  private readonly frameTimesMs = new Float64Array(
    maximumFrameTimingSamples,
  );
  private previousFrameMs: number | null = null;
  private sampleCount = 0;
  private elapsedMs = 0;

  reset(): void {
    this.previousFrameMs = null;
    this.resetSamples();
  }

  recordFrame(nowMs: number): FrameTimingSummary | null {
    if (
      this.previousFrameMs === null ||
      nowMs <= this.previousFrameMs
    ) {
      this.previousFrameMs = nowMs;
      this.resetSamples();
      return null;
    }

    const frameTimeMs = nowMs - this.previousFrameMs;
    this.previousFrameMs = nowMs;
    this.frameTimesMs[this.sampleCount] = frameTimeMs;
    this.sampleCount += 1;
    this.elapsedMs += frameTimeMs;

    if (
      this.elapsedMs < metricReportingWindowMs &&
      this.sampleCount < maximumFrameTimingSamples
    ) {
      return null;
    }

    const summary = summarizeFrameTimings(
      this.frameTimesMs,
      this.sampleCount,
      this.elapsedMs,
    );
    this.resetSamples();
    return summary;
  }

  private resetSamples(): void {
    this.sampleCount = 0;
    this.elapsedMs = 0;
  }
}
