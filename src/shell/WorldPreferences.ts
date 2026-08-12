import { getLocalStorage } from "./browserStorage";

export type InterfaceContrast = "atmospheric" | "high";
export type MotionPreference = "system" | "reduced";

export interface WorldPreferences {
  contrast: InterfaceContrast;
  motion: MotionPreference;
  showMetrics: boolean;
}

const storageKey = "portfolio-world-preferences";
const storageVersion = 1;
const defaults: WorldPreferences = {
  contrast: "atmospheric",
  motion: "system",
  showMetrics: true,
};

function isContrast(value: unknown): value is InterfaceContrast {
  return value === "atmospheric" || value === "high";
}

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === "system" || value === "reduced";
}

export function readWorldPreferences(
  storage: Storage | null = getLocalStorage(),
): WorldPreferences {
  if (!storage) return { ...defaults };
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaults };
    const candidate = parsed as {
      version?: unknown;
      contrast?: unknown;
      motion?: unknown;
      showMetrics?: unknown;
    };
    if (candidate.version !== storageVersion) return { ...defaults };
    return {
      contrast: isContrast(candidate.contrast)
        ? candidate.contrast
        : defaults.contrast,
      motion: isMotionPreference(candidate.motion)
        ? candidate.motion
        : defaults.motion,
      showMetrics:
        typeof candidate.showMetrics === "boolean"
          ? candidate.showMetrics
          : defaults.showMetrics,
    };
  } catch {
    return { ...defaults };
  }
}

export function storeWorldPreferences(
  preferences: WorldPreferences,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      storageKey,
      JSON.stringify({
        version: storageVersion,
        ...preferences,
      }),
    );
  } catch {
    // Preferences remain active for the session when storage is unavailable.
  }
}
