import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWorldProgress,
  reconcileWorldProgressFromMilestones,
} from "../src/shell/WorldProgressRules.ts";

test("progress recovery restores coupled spell, challenge, and route invariants", () => {
  const recovered = normalizeWorldProgress({
    spellStage: "surge",
    selectedSpellStage: "thunder",
    packetInterferenceUnlocked: false,
    pongChallengeComplete: false,
    cleanPongVictoryComplete: true,
    archivePinballChallengeComplete: true,
    travelingAsteroidZone: "falls",
    travelingAsteroidFromZone: "falls",
  });

  assert.equal(recovered.selectedSpellStage, "surge");
  assert.equal(recovered.pongChallengeComplete, true);
  assert.equal(recovered.travelingAsteroidFromZone, null);
  assert.equal(
    normalizeWorldProgress({
      spellStage: "thunder",
      selectedSpellStage: "spark",
    }).packetInterferenceUnlocked,
    true,
  );
});

test("legacy milestones migrate upward into one coherent progression snapshot", () => {
  const recovered = reconcileWorldProgressFromMilestones(
    normalizeWorldProgress({}),
    {
      surgeRecovered: true,
      cleanPongVictoryComplete: true,
      pongChallengeComplete: false,
      archivePinballChallengeComplete: true,
      wrongAddressUnlocked: true,
    },
  );

  assert.deepEqual(recovered, {
    spellStage: "surge",
    selectedSpellStage: "surge",
    packetInterferenceUnlocked: true,
    pongChallengeComplete: true,
    cleanPongVictoryComplete: true,
    archivePinballChallengeComplete: true,
    travelingAsteroidZone: "field",
    travelingAsteroidFromZone: "archive",
  });
});
