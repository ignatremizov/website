import type { WalkPoint } from "./GuidedWalkingRoute.ts";
import type { ZoneId } from "../world/WorldContracts.ts";

export type NavigationTraceKind =
  | "request" | "plan" | "retarget" | "publish" | "cancel" | "failed"
  | "jump-takeoff" | "jump-landing" | "drop-start" | "drop-landing" | "collision-recovery" | "arrived";

export interface NavigationTraceRecord {
  kind: NavigationTraceKind;
  requestId: number;
  zone: ZoneId;
  time: number;
  from: WalkPoint;
  target: WalkPoint | null;
  fromSupport: string | null;
  targetSupport: string | null;
  reason?: string;
  work?: number;
}

export interface NavigationTraceEntry extends NavigationTraceRecord {
  sequence: number;
}

function copyEntry(entry: NavigationTraceEntry): NavigationTraceEntry {
  return { ...entry, from: { ...entry.from }, target: entry.target ? { ...entry.target } : null };
}

/** Opt-in, bounded, session-only diagnostics. Nothing is written to storage. */
export class NavigationTrace {
  enabled = false;
  readonly capacity: number;
  private readonly entries: (NavigationTraceEntry | undefined)[];
  private next = 0;
  private count = 0;
  private sequence = 0;

  constructor(capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1024) {
      throw new RangeError("Navigation trace capacity must be between 1 and 1024");
    }
    this.capacity = capacity;
    this.entries = new Array(capacity);
  }

  record(record: NavigationTraceRecord): void {
    if (!this.enabled) return;
    this.entries[this.next] = copyEntry({ ...record, sequence: ++this.sequence });
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  clear(): void {
    this.entries.fill(undefined);
    this.next = 0;
    this.count = 0;
  }

  snapshot(): NavigationTraceEntry[] {
    const result: NavigationTraceEntry[] = [];
    const start = (this.next - this.count + this.capacity) % this.capacity;
    for (let index = 0; index < this.count; index += 1) {
      result.push(copyEntry(this.entries[(start + index) % this.capacity]!));
    }
    return result;
  }

  export(): string {
    return JSON.stringify({ version: 1, enabled: this.enabled, capacity: this.capacity, events: this.snapshot() }, null, 2);
  }
}
