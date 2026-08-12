import type { WorldProgressState } from "../world/WorldContracts";
import { getLocalStorage } from "./browserStorage";
import {
  normalizeWorldProgress,
  worldProgressDefaults,
} from "./WorldProgressRules";

const storageKey = "portfolio-world-progress";
const storageVersion = 3;

export function readWorldProgress(
  storage: Storage | null = getLocalStorage(),
): WorldProgressState {
  if (!storage) return { ...worldProgressDefaults };
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return { ...worldProgressDefaults };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...worldProgressDefaults };
    }
    const candidate = parsed as {
      version?: unknown;
      state?: unknown;
    };
    if (
      (candidate.version !== 1 &&
        candidate.version !== 2 &&
        candidate.version !== storageVersion) ||
      !candidate.state ||
      typeof candidate.state !== "object"
    ) {
      return { ...worldProgressDefaults };
    }
    return normalizeWorldProgress(
      candidate.state as Partial<WorldProgressState>,
    );
  } catch {
    return { ...worldProgressDefaults };
  }
}

export function storeWorldProgress(
  progress: WorldProgressState,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        version: storageVersion,
        state: normalizeWorldProgress(progress),
      }),
    );
  } catch {
    // The active session remains authoritative when storage is unavailable.
  }
}

export function clearWorldProgress(
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // The caller can still reset the in-memory session when storage is blocked.
  }
}
