import type { QualityTier, ZoneId } from "../world/WorldContracts.ts";

// CPU-side durations, not GPU time. Top-level phases partition the frame;
// navigation and prop physics are separately measured subsets of playerMs.
export const performancePhases = [
  "pacingMs", "playerMs", "actorsMs", "npcsAndFishMs", "fallsRitualMs",
  "fallsEffectsMs", "spellsAndInteractionsMs", "animationMs", "cameraAndDragMs",
  "occlusionMs", "pointerFeedbackMs", "renderSubmitMs", "metricsMs",
] as const;
export const performanceFrameColumns = [
  "sequence", "timeMs", "gameTimeS", "frameGapMs", "expectedFrameMs", "targetFps",
  "callbackGapMaxMs", "callbacksSinceFrame", "callbackDelayMs", "cpuMs",
  "previousCpuMs", "hitch", "zone", "quality", "flags", "x", "y", "z",
  "requestId", "drawCalls", "triangles", "programs", "programDelta",
  "geometries", "textures", "bufferWidth", "bufferHeight", "pixelRatio",
  "kickables", "colliders", "surfaces", "pointerEvents", "pointerCpuMs",
  "pointerWorstMs", "navigationMs", "propPhysicsMs", ...performancePhases,
] as const;
const width = performanceFrameColumns.length;
const phaseOffset = width - performancePhases.length;
const capacity = 16_384;
const hitchCapacity = 32;
const eventCapacity = 192;
const zones = ["field", "falls", "grid", "archive", "math"] as const;
const qualities = ["low", "medium", "high"] as const;
export const performanceFlags = {
  inputLocked: 1, unfocused: 2, transitioning: 4, heldMovement: 8, propHeld: 16,
  routeActive: 32, planning: 64, airborne: 128, spellCharging: 256,
  occlusionPasses: 512, reducedMotion: 1024, visualDebug: 2048,
  navigationFailed: 4096, fallsMotion: 8192, monumentMotion: 16384,
} as const;

/** Borrowed, reused context. No scene objects, DOM text, URLs, or saved state. */
export interface PerformanceFrameContext {
  zone: ZoneId;
  quality: QualityTier;
  flags: number;
  gameTimeS: number;
  x: number; y: number; z: number;
  requestId: number;
  drawCalls: number; triangles: number; programs: number;
  geometries: number; textures: number;
  bufferWidth: number; bufferHeight: number; pixelRatio: number;
  kickables: number; colliders: number; surfaces: number;
}
interface DiagnosticEvent { timeMs: number; kind: string; durationMs?: number; detail?: string }
interface Hitch { score: number; previous: Float64Array; frame: Float64Array }
export interface PerformanceCaptureStatus {
  recording: boolean;
  secondsRemaining: number;
  frames: number;
  retainedFrames: number;
  hitches: number;
  worstGapMs: number;
  reason: string;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Opt-in bounded capture. Typed buffers are allocated on start, never per frame.
 * Clock injection keeps recorder tests deterministic; no renderer is required.
 * Browser observers are optional and copy only timing, never script attribution.
 */
export class PerformanceMonitor {
  recording = false;
  readonly context: PerformanceFrameContext = {
    zone: "field", quality: "low", flags: 0, gameTimeS: 0, x: 0, y: 0, z: 0,
    requestId: 0, drawCalls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0,
    bufferWidth: 0, bufferHeight: 0, pixelRatio: 1, kickables: 0, colliders: 0, surfaces: 0,
  };
  private readonly clock: () => number;
  private readonly onComplete: () => void;
  private data: Float64Array | null = null;
  private readonly row = new Float64Array(width);
  private readonly previousRow = new Float64Array(width);
  private readonly phases = new Float64Array(performancePhases.length);
  private readonly hitches: Hitch[] = [];
  private readonly events: DiagnosticEvent[] = [];
  private eventCursor = 0;
  private eventTotal = 0;
  private total = 0;
  private hitchCount = 0;
  private worstGap = 0;
  private worstCpu = 0;
  private startAt = 0;
  private endAt = 0;
  private stoppedAt = 0;
  private reason = "not started";
  private metadata: Record<string, string | number | boolean> = {};
  private previousRaf: number | null = null;
  private previousExpected = 0;
  private previousCallback: number | null = null;
  private previousCpu = 0;
  private previousPrograms: number | null = null;
  private callbacks = 0;
  private callbackGapMax = 0;
  private callbackAt = 0;
  private frameAt = 0;
  private phaseAt = 0;
  private frameOpen = false;
  private pointerCount = 0;
  private pointerCpu = 0;
  private pointerWorst = 0;
  private inputDepth = 0;
  private navigationMs = 0;
  private propPhysicsMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private observers: PerformanceObserver[] = [];
  private observedTypes: string[] = [];
  private generation = 0;

  constructor(clock = () => performance.now(), onComplete = () => {}) {
    this.clock = clock;
    this.onComplete = onComplete;
  }

  start(seconds = 120, metadata: Record<string, string | number | boolean> = {}): void {
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 300) {
      throw new RangeError("Capture duration must be a whole number from 10 to 300 seconds");
    }
    this.stop("restarted");
    this.data ??= new Float64Array(capacity * width);
    this.total = 0;
    this.hitchCount = 0;
    this.worstGap = 0;
    this.worstCpu = 0;
    this.events.length = 0;
    this.eventCursor = 0;
    this.eventTotal = 0;
    this.hitches.length = 0;
    for (let i = 0; i < hitchCapacity; i++) {
      this.hitches.push({ score: -1, previous: new Float64Array(width), frame: new Float64Array(width) });
    }
    this.startAt = this.clock();
    this.endAt = this.startAt + seconds * 1000;
    this.stoppedAt = 0;
    this.metadata = { ...metadata, requestedSeconds: seconds };
    this.previousPrograms = null;
    this.resetBaseline();
    this.reason = "recording";
    this.recording = true;
    const generation = ++this.generation;
    this.attachObservers(generation);
    // One timer bounds even hidden/background captures. No sampling interval.
    this.timer = setTimeout(() => {
      if (generation !== this.generation || !this.recording) return;
      this.stop("duration complete");
      this.onComplete();
    }, seconds * 1000);
  }

  stop(reason = "stopped"): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const observer of this.observers) {
      try { this.recordBrowserEntries(observer.takeRecords()); }
      catch { /* Optional browser telemetry must not prevent stopping a capture. */ }
      finally { observer.disconnect(); }
    }
    this.observers.length = 0;
    if (this.recording) {
      this.stoppedAt = this.clock();
      this.reason = reason;
    }
    this.recording = false;
    this.frameOpen = false;
    this.inputDepth = 0;
    this.generation++;
  }

  clear(): void {
    this.stop("cleared");
    this.data = null;
    this.total = this.hitchCount = this.worstGap = this.worstCpu = 0;
    this.events.length = this.hitches.length = 0;
    this.eventCursor = this.eventTotal = 0;
    this.metadata = {};
    this.observedTypes = [];
    this.startAt = this.endAt = this.stoppedAt = 0;
    this.reason = "cleared";
    this.resetBaseline();
  }

  /** Record every actual animation callback, including deliberately paced skips. */
  callback(): void {
    if (!this.recording) return;
    const now = this.clock();
    if (now >= this.endAt) {
      this.stop("duration complete");
      this.onComplete();
      return;
    }
    this.callbackAt = now;
    if (this.previousCallback !== null) {
      this.callbackGapMax = Math.max(this.callbackGapMax, Math.max(0, now - this.previousCallback));
    }
    this.previousCallback = now;
    this.callbacks++;
  }

  beginFrame(rafTime: number, expectedMs: number, targetFps: number): void {
    if (!this.recording) return;
    this.row.fill(0);
    this.phases.fill(0);
    this.navigationMs = this.propPhysicsMs = 0;
    this.frameAt = this.callbackAt;
    this.phaseAt = this.callbackAt;
    this.frameOpen = true;
    this.row[0] = this.total + 1;
    this.row[1] = Math.max(0, this.frameAt - this.startAt);
    this.row[3] = this.previousRaf === null ? 0 : Math.max(0, rafTime - this.previousRaf);
    // An idle->active transition must not call its preceding 30 Hz interval a drop.
    this.row[4] = Math.max(expectedMs, this.previousExpected);
    this.row[5] = targetFps;
    this.row[6] = this.callbackGapMax;
    this.row[7] = this.callbacks;
    this.row[8] = Math.max(0, this.frameAt - rafTime);
    this.row[10] = this.previousCpu;
    this.previousRaf = rafTime;
    this.previousExpected = expectedMs;
    this.callbacks = 0;
    this.callbackGapMax = 0;
    this.phase(0);
  }

  phase(index: number): void {
    if (!this.recording || !this.frameOpen) return;
    const now = this.clock();
    this.phases[index] = this.phases[index]! + Math.max(0, now - this.phaseAt);
    this.phaseAt = now;
  }

  addNested(kind: "navigation" | "props", durationMs: number): void {
    if (!this.recording || !this.frameOpen) return;
    if (kind === "navigation") this.navigationMs += Math.max(0, durationMs);
    else this.propPhysicsMs += Math.max(0, durationMs);
  }

  beginInput(): number {
    if (!this.recording) return -1;
    this.inputDepth++;
    return this.inputDepth === 1 ? this.clock() : -1;
  }

  endInput(start: number, kind: "down" | "move" | "up"): void {
    if (!this.recording) return;
    this.inputDepth = Math.max(0, this.inputDepth - 1);
    if (start < 0) return;
    const duration = Math.max(0, this.clock() - start);
    this.pointerCount++;
    this.pointerCpu += duration;
    this.pointerWorst = Math.max(this.pointerWorst, duration);
    if (duration >= 8) this.event("slow-pointer-" + kind, duration);
  }

  endFrame(): void {
    if (!this.recording || !this.frameOpen || !this.data) return;
    const c = this.context;
    const r = this.row;
    r[2] = c.gameTimeS;
    r[9] = Math.max(0, this.clock() - this.frameAt);
    r[11] = Number(r[3]! > Math.max(r[4]! * 1.5, r[4]! + 8) + 0.5 ||
      r[9]! > Math.max(r[4]! * 1.5, r[4]! + 8) + 0.5);
    r[12] = zones.indexOf(c.zone);
    r[13] = qualities.indexOf(c.quality);
    r[14] = c.flags;
    r[15] = c.x; r[16] = c.y; r[17] = c.z;
    r[18] = c.requestId;
    r[19] = c.drawCalls; r[20] = c.triangles;
    r[21] = c.programs;
    r[22] = this.previousPrograms === null ? 0 : c.programs - this.previousPrograms;
    r[23] = c.geometries; r[24] = c.textures;
    r[25] = c.bufferWidth; r[26] = c.bufferHeight; r[27] = c.pixelRatio;
    r[28] = c.kickables; r[29] = c.colliders; r[30] = c.surfaces;
    r[31] = this.pointerCount; r[32] = this.pointerCpu; r[33] = this.pointerWorst;
    r[34] = this.navigationMs; r[35] = this.propPhysicsMs;
    for (let i = 0; i < this.phases.length; i++) r[phaseOffset + i] = this.phases[i]!;
    this.data.set(r, (this.total % capacity) * width);
    this.total++;
    this.worstGap = Math.max(this.worstGap, r[3]!);
    this.worstCpu = Math.max(this.worstCpu, r[9]!);
    if (r[11]) {
      this.hitchCount++;
      const score = Math.max(r[3]!, r[9]!);
      let smallest = this.hitches[0]!;
      for (const hitch of this.hitches) if (hitch.score < smallest.score) smallest = hitch;
      if (score > smallest.score) {
        smallest.score = score;
        smallest.previous.set(this.previousRow);
        smallest.frame.set(r);
      }
    }
    this.previousRow.set(r);
    this.previousCpu = r[9]!;
    this.previousPrograms = c.programs;
    this.pointerCount = this.pointerCpu = this.pointerWorst = 0;
    this.frameOpen = false;
  }

  /** Visibility pauses are gaps in observation, never claimed dropped frames. */
  discontinuity(kind: "hidden" | "visible" | "resume"): void {
    if (!this.recording) return;
    this.event(kind);
    this.resetBaseline();
  }

  event(kind: string, durationMs?: number, detail?: string): void {
    if (!this.recording) return;
    this.appendEvent({ timeMs: round(this.clock() - this.startAt), kind,
      ...(durationMs === undefined ? {} : { durationMs: round(durationMs) }),
      ...(detail === undefined ? {} : { detail }) });
  }

  status(): PerformanceCaptureStatus {
    return { recording: this.recording,
      secondsRemaining: this.recording ? Math.max(0, Math.ceil((this.endAt - this.clock()) / 1000)) : 0,
      frames: this.total, retainedFrames: Math.min(capacity, this.total),
      hitches: this.hitchCount, worstGapMs: round(this.worstGap), reason: this.reason };
  }

  /** Export stops recording first, so serialization cannot contaminate its trace. */
  export(): string {
    this.stop("exported");
    const rows: number[][] = [];
    const count = Math.min(this.total, capacity);
    for (let i = this.total - count; i < this.total; i++) {
      const offset = (i % capacity) * width;
      rows.push(Array.from(this.data!.subarray(offset, offset + width), round));
    }
    const gaps = rows.map(r => r[3]!).filter(n => n > 0).sort((a, b) => a - b);
    const cpu = rows.map(r => r[9]!).sort((a, b) => a - b);
    const percentile = (values: number[], p: number) => values.length
      ? values[Math.max(0, Math.ceil(values.length * p) - 1)]! : null;
    const detail = (row: Float64Array) => Object.fromEntries(
      performanceFrameColumns.map((name, index) => [name, round(row[index]!)]),
    );
    const events = this.events.length < eventCapacity ? this.events.slice()
      : [...this.events.slice(this.eventCursor), ...this.events.slice(0, this.eventCursor)];
    return JSON.stringify({
      version: 1, kind: "world-performance-trace", metadata: this.metadata,
      status: this.status(), durationMs: round(Math.max(0, this.stoppedAt - this.startAt)),
      limits: { frames: capacity, worstHitches: hitchCapacity, events: eventCapacity },
      summary: { recordedFrames: this.total, overwrittenFrames: Math.max(0, this.total - capacity),
        hitchCount: this.hitchCount, worstGapMs: round(this.worstGap), worstCpuMs: round(this.worstCpu),
        retainedFrameGapP50Ms: percentile(gaps, .5), retainedFrameGapP95Ms: percentile(gaps, .95),
        retainedFrameGapP99Ms: percentile(gaps, .99), retainedCpuP95Ms: percentile(cpu, .95),
        eventsRecorded: this.eventTotal },
      notes: [
        "CPU phases time JavaScript and render submission, not GPU completion or displayed presentation.",
        "frameGapMs is the raw interval since the prior rendered callback; previousCpuMs belongs to that preceding frame.",
        "expectedFrameMs accounts for display alignment and the previous frame's idle/active policy.",
        "hitch=1 means raw gap or CPU > max(1.5*expected, expected+8ms)+0.5ms; this is a candidate hitch, not proof of its cause.",
        "Top-level phases cover CPU work except final recorder bookkeeping; playerMs also includes ride/travel updates. navigationMs and propPhysicsMs (including placements) are subsets of playerMs, not additional totals.",
        "Pointer CPU covers event dispatch since the previous rendered frame; synchronous capture events may overlap frame phases, so do not add it to cpuMs.",
        "A program-count increase is a correlation, not a measured shader-compilation duration.",
        "Percentiles describe retained frames. Worst-hitch pairs and maxima cover the entire capture.",
        "Aggregate percentiles mix zones and pacing policies; filter by zone, quality, and targetFps when comparing steady-state performance.",
        "Hidden intervals reset frame/callback baselines; capture duration is wall time, not hidden-time FPS.",
      ],
      browserObservation: { enabledEntryTypes: this.observedTypes, gpuTiming: "not collected" },
      legends: { zones, qualities, flags: performanceFlags },
      worstHitches: this.hitches.filter(h => h.score >= 0).sort((a, b) => b.score - a.score)
        .map(h => ({ previous: h.previous[0] ? detail(h.previous) : null, frame: detail(h.frame) })),
      events, columns: performanceFrameColumns, frames: rows,
    });
  }

  private resetBaseline(): void {
    this.previousRaf = this.previousCallback = null;
    this.previousExpected = this.previousCpu = this.callbacks = this.callbackGapMax = 0;
    this.pointerCount = this.pointerCpu = this.pointerWorst = this.inputDepth = 0;
    this.previousRow.fill(0);
    this.frameOpen = false;
  }

  private appendEvent(event: DiagnosticEvent): void {
    this.events[this.eventCursor] = event;
    this.eventCursor = (this.eventCursor + 1) % eventCapacity;
    this.eventTotal++;
  }

  private attachObservers(generation: number): void {
    this.observedTypes = [];
    if (typeof PerformanceObserver === "undefined") return;
    for (const type of ["longtask", "long-animation-frame"]) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
      let observer: PerformanceObserver | undefined;
      try {
        observer = new PerformanceObserver(list => {
          if (this.recording && this.generation === generation) this.recordBrowserEntries(list.getEntries());
        });
        observer.observe({ type, buffered: false });
        this.observers.push(observer);
        this.observedTypes.push(type);
      } catch { observer?.disconnect(); }
    }
  }

  private recordBrowserEntries(entries: PerformanceEntryList): void {
    if (!this.recording) return;
    for (const entry of entries) {
      if (!Number.isFinite(entry.startTime) || !Number.isFinite(entry.duration) ||
        entry.startTime < this.startAt || entry.startTime > this.endAt || entry.duration < 0 ||
        !["longtask", "long-animation-frame"].includes(entry.entryType)) continue;
      this.appendEvent({ kind: entry.entryType,
        timeMs: round(entry.startTime - this.startAt), durationMs: round(entry.duration) });
    }
  }
}
