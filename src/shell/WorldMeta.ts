import { isZoneId, type ZoneId } from "../world/WorldContracts";
import { getLocalStorage } from "./browserStorage";

const storageKey = "portfolio-world-meta";
const storageVersion = 1;

export interface WorldMetaState {
  collapseArmed: boolean;
  eventHorizonWitnessed: boolean;
  collapseCount: number;
  lastCollapseZone: ZoneId | null;
  lastCollapseAt: string | null;
}

const defaults: WorldMetaState = {
  collapseArmed: false,
  eventHorizonWitnessed: false,
  collapseCount: 0,
  lastCollapseZone: null,
  lastCollapseAt: null,
};

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function normalizeWorldMeta(value: Partial<WorldMetaState>): WorldMetaState {
  const eventHorizonWitnessed = value.eventHorizonWitnessed === true;
  return {
    collapseArmed:
      value.collapseArmed === true || eventHorizonWitnessed,
    eventHorizonWitnessed,
    collapseCount:
      typeof value.collapseCount === "number" &&
      Number.isFinite(value.collapseCount)
        ? Math.max(0, Math.floor(value.collapseCount))
        : 0,
    lastCollapseZone: isZoneId(value.lastCollapseZone)
      ? value.lastCollapseZone
      : null,
    lastCollapseAt: isTimestamp(value.lastCollapseAt)
      ? value.lastCollapseAt
      : null,
  };
}

export function readWorldMeta(
  storage: Storage | null = getLocalStorage(),
): WorldMetaState {
  if (!storage) return { ...defaults };
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    const candidate = parsed as {
      version?: unknown;
      state?: unknown;
    };
    if (
      candidate.version !== storageVersion ||
      !candidate.state ||
      typeof candidate.state !== "object"
    ) {
      return { ...defaults };
    }
    return normalizeWorldMeta(candidate.state as Partial<WorldMetaState>);
  } catch {
    return { ...defaults };
  }
}

export function storeWorldMeta(
  state: WorldMetaState,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        version: storageVersion,
        state: normalizeWorldMeta(state),
      }),
    );
  } catch {
    // Meta progression remains valid for the active page when storage is blocked.
  }
}

export function armWorldCollapse(state: WorldMetaState): WorldMetaState {
  return {
    ...state,
    collapseArmed: true,
  };
}

export function recordWorldCollapse(
  state: WorldMetaState,
  zone: ZoneId,
  at = new Date(),
): WorldMetaState {
  return {
    collapseArmed: true,
    eventHorizonWitnessed: true,
    collapseCount: state.collapseCount + 1,
    lastCollapseZone: zone,
    lastCollapseAt: at.toISOString(),
  };
}
