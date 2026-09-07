export const zoneIds = [
  "field",
  "falls",
  "grid",
  "archive",
  "math",
] as const;

export type ZoneId = (typeof zoneIds)[number];

export const initiallyIndexedZoneIds = [
  "field",
  "falls",
  "grid",
  "archive",
] as const satisfies readonly ZoneId[];

export const zoneLabels: Readonly<Record<ZoneId, string>> = {
  field: "Field Station",
  falls: "Luminous Falls",
  grid: "Signal Grid",
  archive: "Space Archive",
  math: "Mightymatica",
};

const zoneAliasMap: Readonly<Record<string, ZoneId>> = {
  field: "field",
  station: "field",
  hub: "field",
  falls: "falls",
  waterfall: "falls",
  waterfalls: "falls",
  luminous: "falls",
  grid: "grid",
  signal: "grid",
  neon: "grid",
  archive: "archive",
  space: "archive",
  mightymatica: "math",
  math: "math",
};

export function resolveZone(value: string): ZoneId | null {
  return zoneAliasMap[value.trim().toLowerCase()] ?? null;
}

export function isZoneId(value: unknown): value is ZoneId {
  return (
    typeof value === "string" &&
    (zoneIds as readonly string[]).includes(value)
  );
}

const qualityTiers = ["low", "medium", "high"] as const;
export type QualityTier = (typeof qualityTiers)[number];

export function isQualityTier(value: unknown): value is QualityTier {
  return (
    typeof value === "string" &&
    (qualityTiers as readonly string[]).includes(value)
  );
}

export const spellStages = ["spark", "surge", "thunder"] as const;
export type SpellStage = (typeof spellStages)[number];

export const spellRank: Readonly<Record<SpellStage, number>> = {
  spark: 0,
  surge: 1,
  thunder: 2,
};

export function isSpellStage(value: unknown): value is SpellStage {
  return (
    typeof value === "string" &&
    (spellStages as readonly string[]).includes(value)
  );
}

export interface WorldProgressState {
  /** Highest spell form earned by progression or an explicit terminal override. */
  spellStage: SpellStage;
  /** Spell form currently equipped for casting. */
  selectedSpellStage: SpellStage;
  packetInterferenceUnlocked: boolean;
  pongChallengeComplete: boolean;
  cleanPongVictoryComplete: boolean;
  archivePinballChallengeComplete: boolean;
  /** World currently holding the Archive pinball after WRONG ADDRESS. */
  travelingAsteroidZone: ZoneId | null;
  /** World whose portal should receive it on the next materialization. */
  travelingAsteroidFromZone: ZoneId | null;
}

export interface WorldStatusOptions {
  kind?: "notice" | "speech" | "achievement";
  speaker?: string;
  title?: string;
  /** Exact speech terms rendered in the terminal typeface. */
  monospaceTerms?: readonly string[];
  toastPolicy?: "replace" | "after-achievement" | "alongside-achievement";
  /** Protected narration admitted while the destructive finale owns the HUD. */
  channel?: "world" | "event-horizon";
}
