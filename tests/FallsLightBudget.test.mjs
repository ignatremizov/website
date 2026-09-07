import assert from "node:assert/strict";
import test from "node:test";

import {
  fallsRitualLightCapacity,
  getFallsPointLightBudget,
} from "../src/game/zones/falls/FallsLightBudget.ts";

test("Falls keeps a bounded quality-only point-light shader budget", () => {
  const expected = {
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
  };

  for (const quality of ["low", "medium", "high"]) {
    const budget = getFallsPointLightBudget(quality);
    assert.deepEqual(budget, expected[quality]);
    assert.ok(budget.ritualVisibleSlots <= fallsRitualLightCapacity);
    assert.ok(budget.ritualAmbientSlots <= budget.ritualVisibleSlots);
    assert.ok(budget.fireflyVisibleSlots <= 2);
  }

  assert.deepEqual(
    ["low", "medium", "high"].map((quality) => {
      const budget = getFallsPointLightBudget(quality);
      return budget.ritualVisibleSlots + budget.fireflyVisibleSlots;
    }),
    [1, 3, 5],
  );
});
