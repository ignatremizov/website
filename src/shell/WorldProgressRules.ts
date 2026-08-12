import {
  isSpellStage,
  isZoneId,
  spellRank,
  type WorldProgressState,
} from "../world/WorldContracts.ts";

export const worldProgressDefaults: Readonly<WorldProgressState> = {
  spellStage: "spark",
  selectedSpellStage: "spark",
  packetInterferenceUnlocked: false,
  pongChallengeComplete: false,
  cleanPongVictoryComplete: false,
  archivePinballChallengeComplete: false,
  travelingAsteroidZone: null,
  travelingAsteroidFromZone: null,
};

export interface LegacyProgressMilestones {
  surgeRecovered: boolean;
  cleanPongVictoryComplete: boolean;
  pongChallengeComplete: boolean;
  archivePinballChallengeComplete: boolean;
  wrongAddressUnlocked: boolean;
}

export function normalizeWorldProgress(
  value: Partial<WorldProgressState>,
): WorldProgressState {
  const spellStage = isSpellStage(value.spellStage)
    ? value.spellStage
    : worldProgressDefaults.spellStage;
  const selectedSpellStage =
    isSpellStage(value.selectedSpellStage) &&
    spellRank[value.selectedSpellStage] <= spellRank[spellStage]
      ? value.selectedSpellStage
      : spellStage;
  const cleanPongVictoryComplete =
    value.cleanPongVictoryComplete === true;
  const travelingAsteroidZone = isZoneId(value.travelingAsteroidZone)
    ? value.travelingAsteroidZone
    : null;
  const candidateAsteroidOrigin = isZoneId(
    value.travelingAsteroidFromZone,
  )
    ? value.travelingAsteroidFromZone
    : null;

  return {
    spellStage,
    selectedSpellStage,
    packetInterferenceUnlocked:
      value.packetInterferenceUnlocked === true || spellStage === "thunder",
    pongChallengeComplete:
      value.pongChallengeComplete === true || cleanPongVictoryComplete,
    cleanPongVictoryComplete,
    archivePinballChallengeComplete:
      value.archivePinballChallengeComplete === true,
    travelingAsteroidZone,
    travelingAsteroidFromZone:
      travelingAsteroidZone &&
      candidateAsteroidOrigin !== travelingAsteroidZone
        ? candidateAsteroidOrigin
        : null,
  };
}

/**
 * Reconciles saves written before scene-independent progression existed.
 * Milestones may only add earned state; a newer explicit save remains authoritative.
 */
export function reconcileWorldProgressFromMilestones(
  progress: WorldProgressState,
  milestones: LegacyProgressMilestones,
): WorldProgressState {
  const normalized = normalizeWorldProgress(progress);
  const cleanPongVictoryComplete =
    normalized.cleanPongVictoryComplete ||
    milestones.cleanPongVictoryComplete;
  const pongChallengeComplete =
    normalized.pongChallengeComplete ||
    cleanPongVictoryComplete ||
    milestones.pongChallengeComplete;
  const archivePinballChallengeComplete =
    normalized.archivePinballChallengeComplete ||
    milestones.archivePinballChallengeComplete;
  const travelingAsteroidZone =
    normalized.travelingAsteroidZone ??
    (milestones.wrongAddressUnlocked ? "field" : null);
  const candidateAsteroidOrigin =
    normalized.travelingAsteroidFromZone ??
    (milestones.wrongAddressUnlocked ? "archive" : null);
  const travelingAsteroidFromZone =
    travelingAsteroidZone &&
    candidateAsteroidOrigin !== travelingAsteroidZone
      ? candidateAsteroidOrigin
      : null;
  const spellStage =
    normalized.spellStage === "spark" && milestones.surgeRecovered
      ? "surge"
      : normalized.spellStage;
  const selectedSpellStage =
    normalized.spellStage === "spark" && spellStage === "surge"
      ? "surge"
      : spellRank[normalized.selectedSpellStage] <= spellRank[spellStage]
        ? normalized.selectedSpellStage
        : spellStage;

  return {
    spellStage,
    selectedSpellStage,
    packetInterferenceUnlocked:
      normalized.packetInterferenceUnlocked ||
      spellStage === "thunder" ||
      (spellStage === "surge" && archivePinballChallengeComplete),
    pongChallengeComplete,
    cleanPongVictoryComplete,
    archivePinballChallengeComplete,
    travelingAsteroidZone,
    travelingAsteroidFromZone,
  };
}
