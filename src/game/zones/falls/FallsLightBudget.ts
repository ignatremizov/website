import type { QualityTier } from "../../../world/WorldContracts";

export interface FallsPointLightBudget {
  /**
   * Ritual lights that remain visible for the whole quality tier. The first
   * slot is also the transient rune-tinkle/chest light, so low retains one visible
   * slot even though it has no persistent crystal lighting.
   */
  readonly ritualVisibleSlots: number;
  readonly ritualAmbientSlots: number;
  readonly fireflyVisibleSlots: number;
}

export const fallsRitualLightCapacity = 3;

const fallsPointLightBudgets = {
  low: {
    ritualVisibleSlots: 1,
    ritualAmbientSlots: 0,
    fireflyVisibleSlots: 0,
  },
  medium: {
    ritualVisibleSlots: 2,
    ritualAmbientSlots: 2,
    fireflyVisibleSlots: 1,
  },
  high: {
    ritualVisibleSlots: 3,
    ritualAmbientSlots: 3,
    fireflyVisibleSlots: 2,
  },
} as const satisfies Record<QualityTier, FallsPointLightBudget>;

/**
 * The steady Falls point-light shader budget depends only on quality changes,
 * never on crystal seating, shattering, restoration, tinkle, or chest activity.
 * The chest reward temporarily borrows slot zero; it never adds another light.
 */
export function getFallsPointLightBudget(
  quality: QualityTier,
): FallsPointLightBudget {
  return fallsPointLightBudgets[quality];
}
