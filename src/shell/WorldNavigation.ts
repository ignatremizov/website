import {
  initiallyIndexedZoneIds,
  isZoneId,
  zoneIds,
  type ZoneId,
} from "../world/WorldContracts";
import { getLocalStorage } from "./browserStorage";

const storageKey = "portfolio-world-navigation";
const storageVersion = 1;

interface StoredWorldNavigation {
  version: number;
  discovered: ZoneId[];
  visited: ZoneId[];
}

export interface ZoneVisitResult {
  firstVisit: boolean;
  firstDiscovery: boolean;
}

function readStoredState(storage: Storage | null): StoredWorldNavigation | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as {
      version?: unknown;
      discovered?: unknown;
      visited?: unknown;
    };
    if (candidate.version !== storageVersion) return null;
    return {
      version: storageVersion,
      discovered: Array.isArray(candidate.discovered)
        ? candidate.discovered.filter(isZoneId)
        : [],
      visited: Array.isArray(candidate.visited)
        ? candidate.visited.filter(isZoneId)
        : [],
    };
  } catch {
    return null;
  }
}

export class WorldNavigation {
  private readonly storage: Storage | null;
  private readonly discovered: Set<ZoneId>;
  private readonly visited: Set<ZoneId>;

  constructor(storage: Storage | null = getLocalStorage()) {
    this.storage = storage;
    const stored = readStoredState(storage);
    const visited = stored?.visited ?? [];
    this.discovered = new Set([
      ...initiallyIndexedZoneIds,
      ...(stored?.discovered ?? []),
      // A visited route is necessarily discovered. Preserve that invariant
      // when recovering older, partially written, or manually edited state.
      ...visited,
    ]);
    this.visited = new Set(visited);
  }

  isDiscovered(zone: ZoneId): boolean {
    return this.discovered.has(zone);
  }

  getIndexedZones(): ZoneId[] {
    return zoneIds.filter((zone) => this.discovered.has(zone));
  }

  recordVisit(zone: ZoneId): ZoneVisitResult {
    const firstVisit = !this.visited.has(zone);
    const firstDiscovery = !this.discovered.has(zone);
    this.visited.add(zone);
    this.discovered.add(zone);
    if (firstVisit || firstDiscovery) this.persist();
    return { firstVisit, firstDiscovery };
  }

  reset(): void {
    this.discovered.clear();
    for (const zone of initiallyIndexedZoneIds) this.discovered.add(zone);
    this.visited.clear();
    try {
      this.storage?.removeItem(storageKey);
    } catch {
      // The in-memory atlas is still reset when storage is unavailable.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const state: StoredWorldNavigation = {
      version: storageVersion,
      discovered: [...this.discovered],
      visited: [...this.visited],
    };
    try {
      this.storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Discovery remains valid for the session when persistent storage is blocked.
    }
  }
}
