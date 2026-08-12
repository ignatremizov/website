import { isZoneId, type ZoneId } from "../world/WorldContracts";
import { getLocalStorage } from "./browserStorage";

const storageKey = "portfolio-world-achievements";
const storageVersion = 1;

export interface AchievementDefinition {
  title: string;
  zone: ZoneId;
  message?: string;
}

export interface AchievementRecord {
  title: string;
  zone: ZoneId;
  message: string;
  unlockedAt: Date;
}

export interface AchievementLedgerEntry {
  definition: AchievementDefinition;
  record: AchievementRecord | null;
}

interface StoredAchievementRecord {
  title: string;
  zone: ZoneId;
  message: string;
  unlockedAt: string;
}

interface StoredAchievementLedger {
  version: number;
  records: StoredAchievementRecord[];
}

export const achievementCatalog = [
  { title: "RISE AND SHINE", zone: "field" },
  { title: "ROCK COLLECTOR", zone: "field" },
  { title: "OPEN SESAME", zone: "falls" },
  { title: "DRY SPELL", zone: "falls" },
  { title: "WORTH IT", zone: "falls" },
  { title: "SCHOOL OF MAGIC", zone: "falls" },
  { title: "PACKET LOSS", zone: "grid" },
  { title: "DAEMON SLAYER", zone: "grid" },
  { title: "MIDDLE MANAGEMENT", zone: "grid" },
  { title: "CASH FLOW", zone: "grid" },
  {
    title: "WRONG ADDRESS",
    zone: "archive",
    message:
      "The violet portal misroutes one asteroid into Field Station, where it remains loose enough to send elsewhere.",
  },
  { title: "WARRANTY VOID", zone: "archive" },
  { title: "TO THE MOON", zone: "archive" },
  {
    title: "THE LONG LISTEN",
    zone: "archive",
    message:
      "Four phases close through observability. The route disappears, revealing an eclipsed world whose cold transmission leaves the mapped sky.",
  },
  { title: "CUBE ROOT", zone: "math" },
  { title: "MIND OVER MATH", zone: "math" },
  { title: "NEEDLE DROP", zone: "math" },
  { title: "FREE LUNCH", zone: "math" },
  { title: "IT’S NOT CHEESE", zone: "math" },
] as const satisfies readonly AchievementDefinition[];

function normalizeTitle(title: string): string {
  // Achievement IDs are persistence keys, not display copy. Locale-sensitive
  // casing can change an existing key when the browser language changes.
  return title.trim().replaceAll("'", "’").toUpperCase();
}

const catalogTitleKeys = new Set(
  achievementCatalog.map((definition) => normalizeTitle(definition.title)),
);

function parseRecord(value: unknown): AchievementRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    title?: unknown;
    zone?: unknown;
    message?: unknown;
    unlockedAt?: unknown;
  };
  if (
    typeof candidate.title !== "string" ||
    !isZoneId(candidate.zone) ||
    typeof candidate.message !== "string" ||
    typeof candidate.unlockedAt !== "string"
  ) {
    return null;
  }
  const unlockedAt = new Date(candidate.unlockedAt);
  if (Number.isNaN(unlockedAt.getTime())) return null;
  return {
    title: candidate.title,
    zone: candidate.zone,
    message: candidate.message,
    unlockedAt,
  };
}

function readStoredRecords(storage: Storage | null): AchievementRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const candidate = parsed as {
      version?: unknown;
      records?: unknown;
    };
    if (
      candidate.version !== storageVersion ||
      !Array.isArray(candidate.records)
    ) {
      return [];
    }
    return candidate.records
      .map(parseRecord)
      .filter((record): record is AchievementRecord => record !== null);
  } catch {
    return [];
  }
}

export class AchievementLedger {
  private readonly storage: Storage | null;
  private readonly records = new Map<string, AchievementRecord>();

  constructor(storage: Storage | null = getLocalStorage()) {
    this.storage = storage;
    for (const record of readStoredRecords(storage)) {
      this.records.set(normalizeTitle(record.title), record);
    }
  }

  record(
    title: string,
    message: string,
    zone: ZoneId,
    unlockedAt = new Date(),
  ): boolean {
    const key = normalizeTitle(title);
    if (this.records.has(key)) return false;
    this.records.set(key, { title, message, zone, unlockedAt });
    this.persist();
    return true;
  }

  getEntries(): AchievementLedgerEntry[] {
    const entries: AchievementLedgerEntry[] = achievementCatalog.map(
      (definition) => ({
        definition,
        record: this.records.get(normalizeTitle(definition.title)) ?? null,
      }),
    );
    for (const record of this.records.values()) {
      if (catalogTitleKeys.has(normalizeTitle(record.title))) continue;
      entries.push({
        definition: { title: record.title, zone: record.zone },
        record,
      });
    }
    return entries;
  }

  getUnlockedCount(): number {
    return this.getEntries().filter((entry) => entry.record !== null).length;
  }

  hasUnlocked(title: string): boolean {
    return this.records.has(normalizeTitle(title));
  }

  isCatalogued(title: string): boolean {
    return catalogTitleKeys.has(normalizeTitle(title));
  }

  clear(): void {
    this.records.clear();
    try {
      this.storage?.removeItem(storageKey);
    } catch {
      // The in-memory ledger is still cleared when storage is unavailable.
    }
  }

  private persist(): void {
    if (!this.storage) return;
    const state: StoredAchievementLedger = {
      version: storageVersion,
      records: [...this.records.values()].map((record) => ({
        ...record,
        unlockedAt: record.unlockedAt.toISOString(),
      })),
    };
    try {
      this.storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // The in-memory ledger remains usable when storage is unavailable.
    }
  }
}
