import "./styles.css";

import type {
  GameMetrics,
  PortfolioGame,
  PortfolioRevealSource,
} from "./game/PortfolioGame";
import {
  isQualityTier,
  resolveZone,
  spellRank,
  spellStages,
  zoneLabels,
  type QualityTier,
  type SpellStage,
  type WorldProgressState,
  type WorldStatusOptions,
  type ZoneId,
} from "./world/WorldContracts";
import {
  AchievementLedger,
  achievementCatalog,
} from "./shell/AchievementLedger";
import {
  armWorldCollapse,
  readWorldMeta,
  recordWorldCollapse,
  storeWorldMeta,
  type WorldMetaState,
} from "./shell/WorldMeta";
import { WorldNavigation } from "./shell/WorldNavigation";
import {
  readWorldPreferences,
  storeWorldPreferences,
  type InterfaceContrast,
  type MotionPreference,
  type WorldPreferences,
} from "./shell/WorldPreferences";
import {
  clearWorldProgress,
  readWorldProgress,
  storeWorldProgress,
} from "./shell/WorldProgress";
import { reconcileWorldProgressFromMilestones } from "./shell/WorldProgressRules";
import {
  isTerminalCommandName,
  resolveTerminalCommandName,
  terminalCommandNames,
} from "./shell/TerminalCommands";
import {
  getLocalStorage,
  getSessionStorage,
} from "./shell/browserStorage";

const expeditionRebootSessionKey = "portfolio-world-expedition-reboot";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
};

const stage = byId<HTMLElement>("game-stage");
const canvas = byId<HTMLCanvasElement>("game-canvas");
const entryLanding = byId<HTMLElement>("entry-landing");
const entryStatus = byId<HTMLElement>("entry-status");
const exploreButton = byId<HTMLButtonElement>("explore-button");
const loadingPanel = byId<HTMLElement>("loading-panel");
const loadingDetail = byId<HTMLElement>("loading-detail");
const worldHud = byId<HTMLElement>("world-hud");
const zoneLabel = byId<HTMLElement>("zone-label");
const metricChip = byId<HTMLElement>("metric-chip");
const metricFps = byId<HTMLElement>("metric-fps");
const metricDraws = byId<HTMLElement>("metric-draws");
const spellButton = byId<HTMLButtonElement>("spell-button");
const spellLabel = byId<HTMLElement>("spell-label");
const lanternButton = byId<HTMLButtonElement>("lantern-button");
const lanternLabel = byId<HTMLElement>("lantern-label");
const compassChip = byId<HTMLElement>("compass-chip");
const compassHeading = byId<HTMLElement>("compass-heading");
const interactionPrompt = byId<HTMLElement>("interaction-prompt");
const interactionLabel = byId<HTMLElement>("interaction-label");
const worldToast = byId<HTMLElement>("world-toast");
const worldDialogue = byId<HTMLElement>("world-dialogue");
const turtleMediaPlayer = byId<HTMLElement>("turtle-media-player");
const voidRideAtmosphere = byId<HTMLElement>("void-ride-atmosphere");
const voidRideTelemetry = byId<HTMLElement>("void-ride-telemetry");
const pongHud = byId<HTMLElement>("pong-hud");
const pongPlayerScore = byId<HTMLElement>("pong-player-score");
const pongDaemonScore = byId<HTMLElement>("pong-daemon-score");
const touchControls = byId<HTMLElement>("touch-controls");
const touchJump = byId<HTMLButtonElement>("touch-jump");
const touchInteract = byId<HTMLButtonElement>("touch-interact");
const touchInteractLabel = byId<HTMLElement>("touch-interact-label");
const joystick = byId<HTMLElement>("joystick");
const joystickKnob = byId<HTMLElement>("joystick-knob");
const terminalPanel = byId<HTMLDialogElement>("terminal-panel");
const terminalTitle = byId<HTMLElement>("terminal-title");
const terminalOutput = byId<HTMLElement>("terminal-output");
const terminalForm = byId<HTMLFormElement>("terminal-form");
const terminalInput = byId<HTMLInputElement>("terminal-input");
const terminalPrompt = byId<HTMLElement>("terminal-prompt");
const transitionVeil = byId<HTMLElement>("transition-veil");
const liveStatus = byId<HTMLElement>("live-status");
const fieldMenuButton = byId<HTMLButtonElement>("field-menu-button");
const fieldMenuCount = byId<HTMLElement>("field-menu-count");
const fieldMenuDialog = byId<HTMLDialogElement>("field-menu-dialog");
const achievementList = byId<HTMLElement>("achievement-list");
const achievementProgressValue = byId<HTMLElement>(
  "achievement-progress-value",
);
const achievementProgressBar = byId<HTMLElement>("achievement-progress-bar");
const folioZoneValue = byId<HTMLElement>("folio-zone-value");
const folioQualityValue = byId<HTMLElement>("folio-quality-value");
const folioFpsValue = byId<HTMLElement>("folio-fps-value");
const folioDrawsValue = byId<HTMLElement>("folio-draws-value");
const qualitySettingDescription = byId<HTMLElement>(
  "quality-setting-description",
);
const metricsSetting = byId<HTMLButtonElement>("metrics-setting");
const spellSelectionStatus = byId<HTMLElement>("spell-selection-status");
const packetSpellStatus = byId<HTMLElement>("packet-spell-status");
const progressResetButton =
  byId<HTMLButtonElement>("progress-reset-button");
const collapseCommandButton =
  byId<HTMLButtonElement>("collapse-command-button");
const progressResetQuietButton =
  byId<HTMLButtonElement>("progress-reset-quiet-button");
const progressResetStatus = byId<HTMLElement>("progress-reset-status");
const progressResetModule = byId<HTMLElement>("record-reset-module");
const progressResetHeading = byId<HTMLElement>("record-reset-heading");
const portfolioDialog = byId<HTMLDialogElement>("portfolio");
const helpDialog = byId<HTMLDialogElement>("help-dialog");
const mathMapDestination =
  document.querySelector<HTMLButtonElement>('[data-discovery-zone="math"]');
const resumeAfterExpeditionReset = consumeExpeditionReboot();
if (resumeAfterExpeditionReset) {
  stage.dataset.state = "loading";
  entryLanding.hidden = true;
  loadingPanel.hidden = false;
}

const dialogs = {
  portfolio: portfolioDialog,
  fieldMenu: fieldMenuDialog,
  help: helpDialog,
};

const PORTFOLIO_HASH = "#portfolio";
const PORTFOLIO_HISTORY_KEY = "portfolioOverlay";
let synchronizingPortfolioRoute = false;

type FolioTab = "journal" | "atlas" | "spells" | "settings";

const terminalZoneLabels: Record<ZoneId, string> = {
  field: "Field",
  falls: "Falls",
  grid: "Grid",
  archive: "Archive",
  math: "Mightymatica",
};
type TerminalDirectory = "/" | `/${ZoneId}`;
const terminalDirectoryFiles: Record<ZoneId, readonly string[]> = {
  field: ["atlas.txt", "gate.conf", "weather.log"],
  falls: ["lore.txt", "runes.log", "waterfall.lock"],
  grid: ["checksum.state", "daemon.log", "legacy.mount"],
  archive: ["markets.csv", "observability.log", "orbit.cfg"],
  math: ["catalogue.txt", "mindreader.note", "provenance.txt"],
};
const terminalFiles: Readonly<Record<string, readonly string[]>> = {
  "/README.txt": [
    "This shell lists only destinations indexed by physical discovery.",
    "Use cd <place> for a direct process-rewrite route.",
    "goto <place> closes the terminal and walks a collision-aware route through portals.",
    "tp <place> performs the drawn-circle rite and requires the cyan pencil equipped.",
  ],
  "/portfolio.link": [
    "The complete work record is mounted outside the world simulation.",
    "Run portfolio or projects to open it.",
  ],
  "/field/atlas.txt": [
    "Three thresholds surround a five-channel mark. None agree on the shape of north.",
  ],
  "/field/gate.conf": [
    "arrival=tent",
    "return=matching_threshold",
    "autolock=1.25s",
  ],
  "/field/weather.log": [
    "quiet skies; intermittent binary precipitation; one impossible reptile beyond the edge",
  ],
  "/falls/lore.txt": [
    "The water kept three names after the crown forgot them.",
    "Moon bowed first. Tide answered. Ember endured.",
  ],
  "/falls/runes.log": [
    "six fragments recovered; three bases worn smooth; sequence checksum incomplete",
  ],
  "/falls/waterfall.lock": [
    "seal: listening",
    "cache: dry",
  ],
  "/grid/checksum.state": [
    "INGRESS -> BUFFER -> SETTLE",
    "legal ordering preserved across mounted spaces",
  ],
  "/grid/daemon.log": [
    "The Controller’s coral hand predicts straight roads. Curved packets are filed as heresy.",
  ],
  "/grid/legacy.mount": [
    "source: recovered Flash-era archive",
    "carrier: sealed cube at grid coordinate -6,1",
    "indexing: first physical crossing",
  ],
  "/archive/markets.csv": [
    "instrument,signal,state",
    "ledger,balanced,simulated",
    "risk,visible,simulated",
  ],
  "/archive/observability.log": [
    "metrics / logs / traces",
    "the lens records more than Spark can pronounce",
  ],
  "/archive/orbit.cfg": [
    "planets=6",
    "asteroid=loose",
    "smiley_monitor=true",
  ],
  "/math/catalogue.txt": [
    "active: Mind Reader, Buffon needle, Infinite Chocolate, Sierpinski Carpet, Falling Solids",
    "preserved for later rooms: Ladder Cat, MindCoins, Twin Structures",
  ],
  "/math/mindreader.note": [
    "Choose any two-digit number; add its digits; subtract that sum from the original.",
    "Find the result on the chart, remember its symbol, then ask the orb.",
    "The mechanism is explained inside the exhibit only after its first reveal.",
  ],
  "/math/provenance.txt": [
    "From Yuri Remizov's original experiments, rebuilt with love.",
    "The room is a browser-native interpretation of recovered SWF, XFL, ActionScript, and authored source.",
    "Original files remain preserved separately; this mounted world does not replace them.",
  ],
};

const qualityDescriptions: Record<QualityTier, string> = {
  low: "1× pixels · flat lighting · 30 FPS",
  medium: "1.25× pixels · 512px cached shadows",
  high: "1.5× pixels · 1024px cached shadows",
};
const spellNames: Record<SpellStage, string> = {
  spark: "Spark",
  surge: "Surge",
  thunder: "Thunder",
};
const compassDirections: Record<string, { angle: number; label: string }> = {
  N: { angle: 0, label: "north" },
  NE: { angle: 45, label: "northeast" },
  E: { angle: 90, label: "east" },
  SE: { angle: 135, label: "southeast" },
  S: { angle: 180, label: "south" },
  SW: { angle: 225, label: "southwest" },
  W: { angle: 270, label: "west" },
  NW: { angle: 315, label: "northwest" },
};

function nearestEquivalentAngle(
  currentAngle: number,
  targetAngle: number,
): number {
  const wrappedCurrent = ((currentAngle % 360) + 360) % 360;
  const shortestDelta =
    ((targetAngle - wrappedCurrent + 540) % 360) - 180;
  return currentAngle + shortestDelta;
}

const worldNavigation = new WorldNavigation();
const achievementLedger = new AchievementLedger();
const lastEmberMessage =
  "You asked the world to forget you. Something remembered.";
const worldCollapseCommand =
  "sudo collapse world --event-horizon --arm";
let collapseUnlockTerminalAnnounced = false;
let worldMeta: WorldMetaState = readWorldMeta();
if (
  worldMeta.eventHorizonWitnessed &&
  worldMeta.lastCollapseZone &&
  worldMeta.lastCollapseAt
) {
  achievementLedger.record(
    "THE LAST EMBER",
    lastEmberMessage,
    worldMeta.lastCollapseZone,
    new Date(worldMeta.lastCollapseAt),
  );
}
let worldPreferences: WorldPreferences = readWorldPreferences();
let worldProgress: WorldProgressState = readWorldProgress();

worldProgress = reconcileWorldProgressFromMilestones(worldProgress, {
  surgeRecovered: achievementLedger.hasUnlocked("DRY SPELL"),
  cleanPongVictoryComplete:
    achievementLedger.hasUnlocked("DAEMON SLAYER"),
  pongChallengeComplete: achievementLedger.hasUnlocked("PACKET LOSS"),
  archivePinballChallengeComplete:
    achievementLedger.hasUnlocked("WRONG ADDRESS") ||
    achievementLedger.hasUnlocked("WARRANTY VOID"),
  wrongAddressUnlocked: achievementLedger.hasUnlocked("WRONG ADDRESS"),
});
storeWorldProgress(worldProgress);

function isZoneDiscovered(zone: ZoneId): boolean {
  return worldNavigation.isDiscovered(zone);
}

function getZoneMilestoneProgress(
  zone: ZoneId,
): { unlocked: number; total: number } {
  const definitions = achievementCatalog.filter(
    (definition) => definition.zone === zone,
  );
  return {
    unlocked: definitions.filter((definition) =>
      achievementLedger.hasUnlocked(definition.title),
    ).length,
    total: definitions.length,
  };
}

function isCollapseCommandDiscovered(): boolean {
  return achievementCatalog.every((definition) =>
    achievementLedger.hasUnlocked(definition.title),
  );
}

function canUseExplicitTerminalRoute(zone: ZoneId): boolean {
  return isZoneDiscovered(zone) || zone === "math";
}

function getIndexedZoneIds(): ZoneId[] {
  return worldNavigation.getIndexedZones();
}

function getIndexedDestinationNames(): string[] {
  return getIndexedZoneIds().flatMap((zone) =>
    zone === "math" ? ["mightymatica", "math"] : [zone],
  );
}

function terminalDestinationUsage(): string {
  return getIndexedDestinationNames()
    .filter((destination) => destination !== "math")
    .join("|");
}

function syncDiscoverySurfaces(): void {
  if (mathMapDestination) {
    const discovered = isZoneDiscovered("math");
    mathMapDestination.disabled = !discovered;
    mathMapDestination.dataset.locked = String(!discovered);
    mathMapDestination.setAttribute("aria-disabled", String(!discovered));
    mathMapDestination.setAttribute(
      "aria-label",
      discovered
        ? "Travel to Mightymatica, indexed beneath Signal Grid"
        : "Unresolved depth beneath Signal Grid; not yet indexed",
    );
    const label = mathMapDestination.querySelector<HTMLElement>(
      "[data-discovery-label]",
    );
    const detail = mathMapDestination.querySelector<HTMLElement>(
      "[data-discovery-detail]",
    );
    if (label) {
      label.textContent = discovered ? "Mightymatica" : "Unresolved depth";
    }
    if (detail) {
      detail.textContent = discovered
        ? "Grid depth · recovered experiments"
        : "Grid sub-layer · no stable route";
    }
    const starmap = mathMapDestination.closest<HTMLElement>(".atlas-starmap");
    if (starmap) starmap.dataset.mathIndexed = String(discovered);
  }
}

function recordZoneVisit(zone: ZoneId): void {
  const { firstVisit, firstDiscovery } = worldNavigation.recordVisit(zone);
  if (!firstVisit && !firstDiscovery) return;
  syncDiscoverySurfaces();
  if (firstDiscovery && zone === "math") {
    setWorldStatus(
      "Signal indexed: Mightymatica. Atlas and terminal fast-travel routes are now registered.",
      { kind: "achievement", title: "CUBE ROOT" },
    );
  }
}

syncDiscoverySurfaces();

type WorldJournalKind = NonNullable<WorldStatusOptions["kind"]>;

interface WorldJournalEntry {
  id: number;
  recordedAt: Date;
  zone: ZoneId;
  kind: WorldJournalKind;
  speaker?: string;
  title?: string;
  message: string;
}

interface DeferredWorldToast {
  message: string;
  options: WorldStatusOptions;
}

const maximumWorldJournalEntries = 80;
const maximumTerminalLines = 320;
const pendingTerminalLines: HTMLParagraphElement[] = [];
let game: PortfolioGame | null = null;
let gamePromise: Promise<PortfolioGame> | null = null;
let worldCollapseInProgress = false;
let commandHistory: string[] = [];
let historyIndex = 0;
let worldJournalSequence = 0;
const worldJournal: WorldJournalEntry[] = [];
let joystickPointer: number | null = null;
let spellPointerId: number | null = null;
let fieldMenuPulseTimer = 0;
let toastTimer = 0;
let toastHideTimer = 0;
let dialogueTimer = 0;
let dialogueHideTimer = 0;
let activeToastKind: WorldJournalKind | null = null;
let deferredWorldToast: DeferredWorldToast | null = null;
let turtleMediaHideTimer = 0;
let voidRideHideTimer = 0;
let turtleMediaShowFrame = 0;
let terminalCloseTimer = 0;
let terminalFocusFrame = 0;
let terminalFlushFrame = 0;
let terminalReturnFocus: HTMLElement | null = null;
let terminalCloseFocus: "return" | "world" = "return";
let progressResetConfirmTimer = 0;
let terminalPhysicalZone: ZoneId = "field";
let terminalDirectory: TerminalDirectory = "/";
let previousTerminalDirectory: TerminalDirectory = "/";
let visualViewportFrame = 0;
let compassNeedleAngle = 0;
let compassNeedleInitialized = false;

const coarsePointer = window.matchMedia("(pointer: coarse)");
const journalTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const achievementDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function readStoredQuality(): QualityTier | null {
  try {
    const value = getLocalStorage()?.getItem("portfolio-quality");
    return isQualityTier(value) ? value : null;
  } catch {
    return null;
  }
}

function chooseAutomaticQuality(): QualityTier {
  const lowPower =
    coarsePointer.matches ||
    window.innerWidth < 760 ||
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
  return lowPower ? "low" : "medium";
}

function storeQuality(quality: QualityTier): void {
  try {
    getLocalStorage()?.setItem("portfolio-quality", quality);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function syncQualityControls(quality: QualityTier): void {
  folioQualityValue.textContent = quality;
  qualitySettingDescription.textContent = qualityDescriptions[quality];
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-quality-setting]",
  )) {
    const active = button.dataset.qualitySetting === quality;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function syncSpellControls(
  selected: SpellStage = worldProgress.selectedSpellStage,
  highest: SpellStage = worldProgress.spellStage,
): void {
  const unlockedCount = spellRank[highest] + 1;
  spellSelectionStatus.textContent =
    `${spellNames[selected]} equipped · ${unlockedCount} of ${spellStages.length} forms recovered`;
  packetSpellStatus.textContent = worldProgress.packetInterferenceUnlocked
    ? "PACKET INTERFERENCE // ARMED"
    : "PACKET INTERFERENCE // DORMANT";
  packetSpellStatus.dataset.active = String(
    worldProgress.packetInterferenceUnlocked,
  );

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-spell-setting]",
  )) {
    const stage = button.dataset.spellSetting as SpellStage | undefined;
    if (!stage || !spellStages.includes(stage)) continue;
    const unlocked = spellRank[stage] <= spellRank[highest];
    const active = stage === selected;
    button.disabled = !unlocked;
    button.dataset.active = String(active);
    button.dataset.locked = String(!unlocked);
    button.setAttribute("aria-pressed", String(active));
    const state = button.querySelector<HTMLElement>("[data-spell-state]");
    if (state) {
      state.textContent = active
        ? "EQUIPPED"
        : unlocked
          ? "AVAILABLE"
          : "SEALED";
    }
  }
}

function markExpeditionReboot(): void {
  try {
    getSessionStorage()?.setItem(expeditionRebootSessionKey, "1");
  } catch {
    // A normal reload remains available when session storage is blocked.
  }
}

function clearExpeditionReboot(): void {
  try {
    getSessionStorage()?.removeItem(expeditionRebootSessionKey);
  } catch {
    // A stale marker cannot affect in-memory reset behavior.
  }
}

function consumeExpeditionReboot(): boolean {
  try {
    const storage = getSessionStorage();
    const active = storage?.getItem(expeditionRebootSessionKey) === "1";
    if (active) storage?.removeItem(expeditionRebootSessionKey);
    return active;
  } catch {
    return false;
  }
}

function clearExpeditionRecord(resumeInteractiveWorld = false): void {
  window.clearTimeout(progressResetConfirmTimer);
  achievementLedger.clear();
  worldNavigation.reset();
  clearWorldProgress();
  commandHistory = [];
  historyIndex = 0;
  worldJournal.splice(0, worldJournal.length);
  if (resumeInteractiveWorld) markExpeditionReboot();
  else clearExpeditionReboot();
  window.location.reload();
}

function syncProgressResetControl(): void {
  const armed = worldMeta.collapseArmed;
  const commandDiscovered = isCollapseCommandDiscovered();
  progressResetModule.dataset.collapseArmed = String(armed);
  progressResetModule.dataset.commandDiscovered = String(commandDiscovered);
  collapseCommandButton.hidden = armed || !commandDiscovered;
  progressResetQuietButton.hidden = !armed;
  if (
    progressResetButton.dataset.confirming === "true" ||
    progressResetQuietButton.dataset.confirming === "true"
  ) {
    return;
  }
  progressResetHeading.textContent = armed
    ? "Event horizon protocol"
    : commandDiscovered
      ? "Root protocol discovered"
      : "Local expedition record";
  progressResetButton.textContent = armed
    ? "Collapse expedition into event horizon"
    : commandDiscovered
      ? "Reset without Event Horizon"
      : "Reset expedition record";
  progressResetQuietButton.textContent = "Reset without sequence";
  progressResetStatus.textContent = armed
    ? worldMeta.eventHorizonWitnessed
      ? `The satchel remembers ${worldMeta.collapseCount} completed collapse${
          worldMeta.collapseCount === 1 ? "" : "s"
        }. Expedition progress will be consumed; appearance settings and the Last Ember remain.`
      : "The satchel knows the Event Horizon protocol. Expedition progress will be consumed; appearance settings remain."
    : commandDiscovered
      ? "Every expedition seal answers. Send the assembled command to the terminal; it remains inert until you press Enter."
      : "Achievements, indexed routes, and spell progression. Appearance settings remain.";
}

function disarmProgressReset(): void {
  window.clearTimeout(progressResetConfirmTimer);
  progressResetConfirmTimer = 0;
  progressResetButton.dataset.confirming = "false";
  progressResetQuietButton.dataset.confirming = "false";
  syncProgressResetControl();
}

async function beginEventHorizonReset(): Promise<void> {
  if (worldCollapseInProgress) return;
  let instance = game;
  if (!instance) {
    try {
      instance = await ensureGame();
    } catch {
      setWorldStatus(
        "The Event Horizon could not reach a live world. The expedition record remains intact.",
      );
      return;
    }
  }
  worldCollapseInProgress = true;
  stage.classList.add("world-collapse-active");
  window.clearTimeout(progressResetConfirmTimer);
  progressResetButton.disabled = true;
  progressResetQuietButton.disabled = true;
  closeDialogs();
  closeTerminal("world");
  resetJoystick();
  try {
    const collapseZone = await instance.beginWorldCollapse();
    const collapseAt = new Date();
    worldMeta = recordWorldCollapse(
      worldMeta,
      collapseZone,
      collapseAt,
    );
    storeWorldMeta(worldMeta);
    clearExpeditionRecord(true);
  } catch (error) {
    worldCollapseInProgress = false;
    stage.classList.remove("world-collapse-active");
    transitionVeil.classList.remove("is-active");
    progressResetButton.disabled = false;
    progressResetQuietButton.disabled = false;
    disarmProgressReset();
    setWorldStatus(
      error instanceof Error
        ? `The Event Horizon failed to stabilize: ${error.message}`
        : "The Event Horizon failed to stabilize. The expedition record remains intact.",
    );
  }
}

function applyWorldPreferences(): void {
  document.body.dataset.interfaceContrast = worldPreferences.contrast;
  document.body.dataset.reduceMotion = String(
    worldPreferences.motion === "reduced",
  );
  metricChip.hidden = !worldPreferences.showMetrics;
  metricsSetting.setAttribute(
    "aria-checked",
    String(worldPreferences.showMetrics),
  );
  const metricsLabel = metricsSetting.querySelector("strong");
  if (metricsLabel) {
    metricsLabel.textContent = worldPreferences.showMetrics
      ? "Visible"
      : "Hidden";
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-contrast-setting]",
  )) {
    const active = button.dataset.contrastSetting === worldPreferences.contrast;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-motion-setting]",
  )) {
    const active = button.dataset.motionSetting === worldPreferences.motion;
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }
  game?.setReducedMotionPreference(worldPreferences.motion === "reduced");
}

function updateWorldPreferences(
  changes: Partial<WorldPreferences>,
): void {
  worldPreferences = { ...worldPreferences, ...changes };
  storeWorldPreferences(worldPreferences);
  applyWorldPreferences();
}

function renderAchievementLedger(): void {
  const entries = achievementLedger.getEntries();
  const unlockedCount = entries.filter((entry) => entry.record !== null).length;
  const total = entries.length;
  const progress = total === 0 ? 0 : unlockedCount / total;
  fieldMenuCount.textContent = `${unlockedCount}/${total}`;
  achievementProgressValue.textContent = `${unlockedCount} / ${total}`;
  achievementProgressBar.style.setProperty(
    "--achievement-progress",
    progress.toFixed(4),
  );

  const cards = entries.map((entry, index) => {
    const article = document.createElement("article");
    const unlocked = entry.record !== null;
    article.className = "achievement-card";
    article.dataset.unlocked = String(unlocked);
    article.dataset.zone = entry.definition.zone;

    const seal = document.createElement("span");
    seal.className = "achievement-seal";
    seal.setAttribute("aria-hidden", "true");
    seal.textContent = unlocked ? "✦" : String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    const meta = document.createElement("p");
    meta.className = "achievement-meta";
    const region = document.createElement("span");
    region.textContent = zoneLabels[entry.definition.zone];
    meta.append(region);

    const title = document.createElement("h4");
    const message = document.createElement("p");
    message.className = "achievement-copy";
    if (entry.record) {
      title.textContent = entry.record.title;
      message.textContent =
        entry.definition.message ?? entry.record.message;
      const unlockedAt = document.createElement("time");
      unlockedAt.dateTime = entry.record.unlockedAt.toISOString();
      unlockedAt.textContent = achievementDateFormatter.format(
        entry.record.unlockedAt,
      );
      meta.append(unlockedAt);
    } else {
      title.textContent = "UNDISCOVERED";
      message.textContent =
        "The clasp holds. This account will write itself when it is earned.";
      const locked = document.createElement("span");
      locked.textContent = "SEALED";
      meta.append(locked);
    }
    copy.append(meta, title, message);
    article.append(seal, copy);
    return article;
  });
  achievementList.replaceChildren(...cards);
  syncProgressResetControl();
}

function pulseFieldMenu(): void {
  window.clearTimeout(fieldMenuPulseTimer);
  fieldMenuButton.classList.remove("has-new-entry");
  void fieldMenuButton.offsetWidth;
  fieldMenuButton.classList.add("has-new-entry");
  fieldMenuPulseTimer = window.setTimeout(() => {
    fieldMenuButton.classList.remove("has-new-entry");
  }, 3400);
}

function selectFolioTab(tab: FolioTab): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-folio-tab]",
  )) {
    const active = button.dataset.folioTab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const panel of document.querySelectorAll<HTMLElement>(
    "[data-folio-panel]",
  )) {
    panel.hidden = panel.dataset.folioPanel !== tab;
  }
}

function setWorldStatus(
  message: string,
  options: WorldStatusOptions = {},
): void {
  // The collapse keeps the world physically playable, so ordinary simulation
  // events can still fire as scenery and the player fall through released
  // surfaces. Keep that incidental chatter out of the finale's narration lane.
  if (
    worldCollapseInProgress &&
    options.channel !== "event-horizon"
  ) {
    return;
  }
  const kind = options.kind ?? "notice";
  const spoken = kind === "speech";
  const recordedAt = new Date();
  worldJournal.push({
    id: ++worldJournalSequence,
    recordedAt,
    zone: terminalPhysicalZone,
    kind,
    speaker: options.speaker,
    title: options.title,
    message,
  });
  // Finale achievements are visual cues until the sequence resolves. The
  // world-meta commit after blackout is their sole durable transaction.
  const newAchievement =
    options.channel !== "event-horizon" &&
    kind === "achievement" &&
    options.title &&
    achievementLedger.record(
      options.title,
      message,
      terminalPhysicalZone,
      recordedAt,
    );
  if (newAchievement) {
    renderAchievementLedger();
    pulseFieldMenu();
    if (
      options.title &&
      achievementLedger.isCatalogued(options.title)
    ) {
      game?.refreshPortalMilestones();
    }
  }
  if (worldJournal.length > maximumWorldJournalEntries) {
    worldJournal.splice(0, worldJournal.length - maximumWorldJournalEntries);
  }
  const accessibleMessage =
    spoken && options.speaker
      ? `${options.speaker} says: ${message}`
      : kind === "achievement"
        ? options.title
          ? `Milestone ${options.title} recorded: ${message}`
          : `Milestone recorded: ${message}`
      : message;
  if (!terminalPanel.open) {
    liveStatus.textContent = accessibleMessage;
  }
  if (stage.dataset.state !== "playing") {
    entryStatus.textContent = accessibleMessage;
  }
  if (stage.dataset.state === "playing") showWorldToast(message, options);
  if (terminalPanel.open) {
    writeTerminal(
      spoken && options.speaker
        ? `[${options.speaker}] ${message}`
        : kind === "achievement"
          ? `[milestone${options.title ? `: ${options.title}` : ""}] ${message}`
          : `[world] ${message}`,
      kind === "achievement" ? "ok" : "muted",
    );
  }
}

function showWorldToast(
  message: string,
  options: WorldStatusOptions = {},
): void {
  const kind = options.kind ?? "notice";
  if (
    kind === "speech" &&
    options.toastPolicy === "alongside-achievement" &&
    activeToastKind === "achievement" &&
    !worldToast.hidden
  ) {
    showParallelWorldDialogue(message, options);
    return;
  }
  if (
    options.toastPolicy === "after-achievement" &&
    activeToastKind === "achievement" &&
    !worldToast.hidden
  ) {
    deferredWorldToast = { message, options };
    return;
  }
  // A direct replacement supersedes anything queued behind the previous
  // toast. Otherwise stale observations can surface after an unrelated speech
  // or achievement has finished.
  deferredWorldToast = null;
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);
  activeToastKind = kind;
  const spoken = kind === "speech";
  worldToast.dataset.kind = kind;
  if (spoken) {
    const speaker = document.createElement("span");
    speaker.className = "world-toast-speaker";
    speaker.textContent = options.speaker ?? "Unknown signal";
    const quote = document.createElement("q");
    quote.className = "world-toast-quote";
    quote.textContent = message;
    worldToast.replaceChildren(speaker, quote);
  } else if (kind === "achievement") {
    const label = document.createElement("span");
    label.className = "world-toast-achievement-label";
    label.textContent = options.title ?? "Milestone recorded";
    const copy = document.createElement("span");
    copy.className = "world-toast-achievement-copy";
    copy.textContent = message;
    worldToast.replaceChildren(label, copy);
  } else {
    worldToast.textContent = message;
  }
  worldToast.setAttribute("aria-hidden", "false");
  worldToast.hidden = false;
  window.requestAnimationFrame(() => worldToast.classList.add("is-visible"));
  const visibleDuration = spoken
    ? Math.max(12000, Math.min(26000, 5000 + message.length * 78))
    : kind === "achievement"
      ? Math.max(14000, Math.min(28000, 6000 + message.length * 85))
      : 4400;
  toastTimer = window.setTimeout(() => {
    worldToast.classList.remove("is-visible");
    toastHideTimer = window.setTimeout(() => {
      worldToast.hidden = true;
      worldToast.setAttribute("aria-hidden", "true");
      activeToastKind = null;
      const deferred = deferredWorldToast;
      deferredWorldToast = null;
      if (deferred) showWorldToast(deferred.message, deferred.options);
    }, 260);
  }, visibleDuration);
}

function showParallelWorldDialogue(
  message: string,
  options: WorldStatusOptions,
): void {
  window.clearTimeout(dialogueTimer);
  window.clearTimeout(dialogueHideTimer);
  const speaker = document.createElement("span");
  speaker.className = "world-toast-speaker";
  speaker.textContent = options.speaker ?? "Unknown signal";
  const quote = document.createElement("q");
  quote.className = "world-toast-quote";
  quote.textContent = message;
  worldDialogue.dataset.kind = "speech";
  worldDialogue.replaceChildren(speaker, quote);
  worldDialogue.hidden = false;
  worldDialogue.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => {
    worldDialogue.classList.add("is-visible");
  });
  const visibleDuration = Math.max(
    12000,
    Math.min(26000, 5000 + message.length * 78),
  );
  dialogueTimer = window.setTimeout(() => {
    worldDialogue.classList.remove("is-visible");
    dialogueHideTimer = window.setTimeout(() => {
      worldDialogue.hidden = true;
      worldDialogue.setAttribute("aria-hidden", "true");
    }, 260);
  }, visibleDuration);
}

function setTurtleMediaActive(active: boolean): void {
  window.clearTimeout(turtleMediaHideTimer);
  window.clearTimeout(voidRideHideTimer);
  window.cancelAnimationFrame(turtleMediaShowFrame);
  turtleMediaShowFrame = 0;
  stage.classList.toggle("void-ride-active", active);
  if (!active) {
    voidRideAtmosphere.classList.remove("is-visible");
    voidRideTelemetry.classList.remove("is-visible");
    voidRideAtmosphere.setAttribute("aria-hidden", "true");
    turtleMediaPlayer.classList.remove("is-visible");
    turtleMediaPlayer.replaceChildren();
    turtleMediaPlayer.setAttribute("aria-hidden", "true");
    turtleMediaHideTimer = window.setTimeout(() => {
      turtleMediaPlayer.hidden = true;
    }, 220);
    voidRideHideTimer = window.setTimeout(() => {
      voidRideAtmosphere.hidden = true;
      voidRideTelemetry.hidden = true;
    }, 520);
    return;
  }

  voidRideAtmosphere.hidden = false;
  voidRideTelemetry.hidden = false;
  voidRideAtmosphere.setAttribute("aria-hidden", "false");

  const source = new URL(
    "https://www.youtube-nocookie.com/embed/KtC-pl9P3kE",
  );
  source.searchParams.set("autoplay", "1");
  source.searchParams.set("controls", "1");
  source.searchParams.set("playsinline", "1");
  source.searchParams.set("rel", "0");
  source.searchParams.set("fs", "0");

  const iframe = document.createElement("iframe");
  iframe.src = source.toString();
  iframe.title =
    "It’s Raining Somewhere Else by Toby Fox (official YouTube player)";
  iframe.loading = "eager";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  const policyDocument = document as Document & {
    featurePolicy?: {
      allowedFeatures?: () => string[];
    };
    permissionsPolicy?: {
      features?: () => string[];
    };
  };
  const supportedPolicyFeatures =
    policyDocument.featurePolicy?.allowedFeatures?.() ??
    policyDocument.permissionsPolicy?.features?.() ??
    [];
  if (supportedPolicyFeatures.includes("autoplay")) {
    iframe.setAttribute("allow", "autoplay");
  }
  turtleMediaPlayer.replaceChildren(iframe);
  turtleMediaPlayer.hidden = false;
  turtleMediaPlayer.setAttribute("aria-hidden", "false");
  turtleMediaShowFrame = window.requestAnimationFrame(() => {
    turtleMediaShowFrame = 0;
    if (!stage.classList.contains("void-ride-active")) return;
    voidRideAtmosphere.classList.add("is-visible");
    voidRideTelemetry.classList.add("is-visible");
    turtleMediaPlayer.classList.add("is-visible");
  });
}

function updateMetrics(metrics: GameMetrics): void {
  metricFps.textContent = `${metrics.fps} FPS`;
  metricDraws.textContent = `${metrics.drawCalls} calls`;
  metricDraws.title = `${metrics.triangles.toLocaleString()} rendered triangles`;
  folioFpsValue.textContent = `${metrics.fps} FPS`;
  folioDrawsValue.textContent = `${metrics.drawCalls} DRAW CALLS · ${metrics.triangles.toLocaleString()} TRI`;
}

function hasOpenOverlay(): boolean {
  return (
    terminalPanel.open ||
    Object.values(dialogs).some((dialog) => dialog.open)
  );
}

function syncGameInput(): void {
  const enabled = !hasOpenOverlay();
  game?.setInputEnabled(enabled);
  if (!enabled) {
    resetJoystick();
    finishSpellPointer(false);
  }
}

function syncVisualViewport(): void {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty(
    "--visual-viewport-height",
    `${viewport?.height ?? window.innerHeight}px`,
  );
  document.documentElement.style.setProperty(
    "--visual-viewport-offset-top",
    `${viewport?.offsetTop ?? 0}px`,
  );
  window.cancelAnimationFrame(visualViewportFrame);
  visualViewportFrame = window.requestAnimationFrame(() => {
    if (terminalPanel.open) {
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
  });
}

function closeTerminal(
  focus: "return" | "world" = "return",
): void {
  window.clearTimeout(terminalCloseTimer);
  terminalCloseTimer = 0;
  window.cancelAnimationFrame(terminalFocusFrame);
  terminalFocusFrame = 0;
  if (!terminalPanel.open) return;
  terminalCloseFocus = focus;
  terminalPanel.close();
}

function scheduleTerminalClose(delay: number): void {
  window.clearTimeout(terminalCloseTimer);
  terminalCloseTimer = window.setTimeout(() => {
    terminalCloseTimer = 0;
    closeTerminal("world");
  }, delay);
}

function updateTerminalChrome(): void {
  terminalTitle.textContent = `${terminalZoneLabels[terminalPhysicalZone]} terminal`;
  terminalPrompt.textContent = `${terminalDirectory}$`;
}

function scheduleTerminalFocus(): void {
  window.cancelAnimationFrame(terminalFocusFrame);
  terminalFocusFrame = window.requestAnimationFrame(() => {
    terminalFocusFrame = 0;
    if (terminalPanel.open) {
      terminalInput.focus({ preventScroll: true });
    }
  });
}

function openTerminal(): void {
  if (worldCollapseInProgress) return;
  if (terminalPanel.open) {
    scheduleTerminalFocus();
    return;
  }
  window.clearTimeout(terminalCloseTimer);
  terminalCloseTimer = 0;
  const focusedElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  terminalReturnFocus = focusedElement?.closest("dialog")
    ? game
      ? fieldMenuButton
      : exploreButton
    : focusedElement;
  terminalCloseFocus = "return";
  for (const dialog of Object.values(dialogs)) {
    if (dialog.open) dialog.close();
  }
  updateTerminalChrome();
  syncVisualViewport();
  terminalPanel.showModal();
  syncGameInput();
  if (
    isCollapseCommandDiscovered() &&
    !worldMeta.collapseArmed &&
    !collapseUnlockTerminalAnnounced
  ) {
    collapseUnlockTerminalAnnounced = true;
    writeTerminal(
      "Every expedition milestone is recorded. Root access discovered: sudo.",
      "ok",
    );
    writeTerminal(
      "The four portal fragments complete an inert Event Horizon protocol. Assemble it here when you are ready.",
      "muted",
    );
  }
  scheduleTerminalFocus();
}

function toggleTerminal(): void {
  if (!terminalPanel.open) openTerminal();
  else closeTerminal();
}

function closeDialogs(): void {
  for (const dialog of Object.values(dialogs)) {
    if (dialog.open) dialog.close();
  }
}

function openDialog(
  name: keyof typeof dialogs,
  revealSource: PortfolioRevealSource = "standard",
): void {
  if (worldCollapseInProgress) return;
  closeTerminal();
  for (const [dialogName, dialog] of Object.entries(dialogs)) {
    if (dialogName !== name && dialog.open) dialog.close();
  }
  const dialog = dialogs[name];
  if (dialog === portfolioDialog) {
    dialog.dataset.revealSource = revealSource;
  }
  if (!dialog.open) {
    dialog.scrollTop = 0;
    dialog.showModal();
    dialog.scrollTop = 0;
  }
  syncGameInput();
}

function portfolioRouteUrl(hash: string): string {
  const url = new URL(window.location.href);
  url.hash = hash;
  return `${url.pathname}${url.search}${url.hash}`;
}

function openPortfolio(
  revealSource: PortfolioRevealSource = "standard",
  updateRoute = true,
): void {
  if (worldCollapseInProgress) return;
  if (updateRoute && window.location.hash !== PORTFOLIO_HASH) {
    const currentState =
      typeof window.history.state === "object" &&
      window.history.state !== null
        ? window.history.state
        : {};
    window.history.pushState(
      { ...currentState, [PORTFOLIO_HISTORY_KEY]: true },
      "",
      portfolioRouteUrl(PORTFOLIO_HASH),
    );
  }
  openDialog("portfolio", revealSource);
}

function clearPortfolioRoute(): void {
  if (window.location.hash !== PORTFOLIO_HASH) return;

  const currentState =
    typeof window.history.state === "object" &&
    window.history.state !== null
      ? window.history.state
      : null;
  if (
    currentState?.[PORTFOLIO_HISTORY_KEY] === true &&
    window.history.length > 1
  ) {
    window.history.back();
    return;
  }

  window.history.replaceState(currentState, "", portfolioRouteUrl(""));
}

function syncPortfolioRoute(): void {
  synchronizingPortfolioRoute = true;
  try {
    if (window.location.hash === PORTFOLIO_HASH) {
      openPortfolio("standard", false);
    } else if (portfolioDialog.open) {
      portfolioDialog.close();
    }
  } finally {
    synchronizingPortfolioRoute = false;
  }
}

function openFieldMenu(tab: FolioTab = "journal"): void {
  if (worldCollapseInProgress) return;
  renderAchievementLedger();
  syncQualityControls(game?.getQuality() ?? readStoredQuality() ?? chooseAutomaticQuality());
  syncSpellControls();
  folioZoneValue.textContent = zoneLabels[game?.getCurrentZone() ?? "field"];
  selectFolioTab(tab);
  openDialog("fieldMenu");
}

function closeOverlay(name: string): void {
  if (name === "terminal") {
    closeTerminal();
    return;
  }
  const dialog = dialogs[name as keyof typeof dialogs];
  if (dialog?.open) dialog.close();
  syncGameInput();
}

function flushTerminalOutput(): void {
  terminalFlushFrame = 0;
  if (pendingTerminalLines.length === 0) return;

  const fragment = document.createDocumentFragment();
  for (const line of pendingTerminalLines) fragment.append(line);
  pendingTerminalLines.length = 0;
  terminalOutput.append(fragment);

  let excess = terminalOutput.childElementCount - maximumTerminalLines;
  while (excess > 0) {
    terminalOutput.firstElementChild?.remove();
    excess -= 1;
  }
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function scheduleTerminalFlush(): void {
  if (terminalFlushFrame !== 0) return;
  terminalFlushFrame = window.requestAnimationFrame(
    flushTerminalOutput,
  );
}

function clearTerminalOutput(): void {
  window.cancelAnimationFrame(terminalFlushFrame);
  terminalFlushFrame = 0;
  pendingTerminalLines.length = 0;
  terminalOutput.replaceChildren();
}

function writeTerminal(
  message: string,
  tone: "normal" | "muted" | "ok" | "error" | "omen" = "normal",
): void {
  const line = document.createElement("p");
  if (tone !== "normal") line.className = `terminal-${tone}`;
  line.textContent = message;
  pendingTerminalLines.push(line);
  if (pendingTerminalLines.length > maximumTerminalLines) {
    pendingTerminalLines.splice(
      0,
      pendingTerminalLines.length - maximumTerminalLines,
    );
  }
  scheduleTerminalFlush();
}

async function ensureGame(destination: ZoneId | null = null): Promise<PortfolioGame> {
  if (!gamePromise && !game) {
    stage.dataset.state = "loading";
    window.scrollTo(0, 0);
    entryLanding.hidden = true;
    loadingPanel.hidden = false;
    loadingDetail.textContent = "Loading renderer and world systems…";
    exploreButton.disabled = true;

    gamePromise = (async () => {
      const { PortfolioGame: Game } = await import("./game/PortfolioGame");
      loadingDetail.textContent = "Surveying the Field Station…";

      const instance = new Game(canvas, {
        onZoneChange: (zone, label) => {
          zoneLabel.textContent = label;
          folioZoneValue.textContent = label;
          document.body.dataset.zone = zone;
          terminalPhysicalZone = zone;
          updateTerminalChrome();
          recordZoneVisit(zone);
        },
        onInteractionChange: (label) => {
          interactionPrompt.hidden = label === null;
          interactionLabel.textContent = label ?? "Interact";
          touchInteract.disabled = label === null;
          touchInteract.setAttribute("aria-disabled", String(label === null));
        },
        onStatus: setWorldStatus,
        onMetrics: updateMetrics,
        onTransition: (active) => {
          transitionVeil.classList.toggle("is-active", active);
        },
        onRequestMap: () => openFieldMenu("atlas"),
        onRequestTerminal: openTerminal,
        onRequestPortfolio: (source) =>
          openPortfolio(source ?? "standard"),
        onQualityChange: (quality) => {
          syncQualityControls(quality);
          storeQuality(quality);
        },
        onPongChange: (active, playerScore, daemonScore) => {
          pongHud.hidden = !active;
          pongPlayerScore.textContent = String(playerScore);
          pongDaemonScore.textContent = String(daemonScore);
          touchInteractLabel.textContent = active ? "Exit Pong" : "Interact";
          document.body.classList.toggle("pong-active", active);
        },
        onSpellChange: (spell, packetInterferenceUnlocked) => {
          const name = spellNames[spell];
          const packetReady = spell === "surge" && packetInterferenceUnlocked;
          spellLabel.textContent = packetReady
            ? "Cast packet surge"
            : `Cast ${name.toLowerCase()}`;
          spellButton.dataset.spell = spell;
          spellButton.dataset.interference = String(packetInterferenceUnlocked);
          spellButton.setAttribute(
            "aria-label",
            `Hold to charge and release ${name}${
              packetReady ? " with Packet Interference ready" : ""
            }${spell === "thunder" ? ", fully evolved" : ""}`,
          );
          syncSpellControls(spell);
        },
        onProgressChange: (progress) => {
          worldProgress = progress;
          storeWorldProgress(worldProgress);
          syncSpellControls();
        },
        onSpellCharge: (charge, charging) => {
          spellButton.dataset.charging = String(charging);
          spellButton.dataset.full = String(charging && charge >= 0.985);
          spellButton.style.setProperty("--spell-charge", charge.toFixed(3));
        },
        onLanternChange: (active) => {
          lanternButton.dataset.active = String(active);
          lanternButton.setAttribute("aria-pressed", String(active));
          lanternButton.setAttribute(
            "aria-label",
            active ? "Put away lantern" : "Raise lantern",
          );
          lanternLabel.textContent = active ? "Put away lantern" : "Raise lantern";
        },
        onCompassChange: (owned: boolean, heading: string) => {
          if (!owned) {
            compassChip.hidden = true;
            compassNeedleInitialized = false;
            return;
          }

          const normalizedHeading = heading.toUpperCase();
          const direction = compassDirections[normalizedHeading] ?? {
            angle: 0,
            label: "north",
          };
          compassNeedleAngle = compassNeedleInitialized
            ? nearestEquivalentAngle(compassNeedleAngle, direction.angle)
            : direction.angle;
          compassNeedleInitialized = true;
          compassChip.dataset.heading = normalizedHeading;
          compassChip.style.setProperty(
            "--compass-angle",
            `${compassNeedleAngle}deg`,
          );
          compassChip.setAttribute("aria-label", `Compass heading ${direction.label}`);
          compassHeading.textContent = normalizedHeading;
          compassChip.hidden = false;
        },
        onTurtleMediaChange: setTurtleMediaActive,
        isZoneDiscovered,
        hasAchievement: (title) => achievementLedger.hasUnlocked(title),
        getZoneMilestoneProgress,
        initialProgress: worldProgress,
      });

      try {
        instance.setReducedMotionPreference(
          worldPreferences.motion === "reduced",
        );
        await instance.init(
          readStoredQuality() ?? chooseAutomaticQuality(),
        );
        instance.start();
        game = instance;
        stage.dataset.state = "playing";
        loadingPanel.hidden = true;
        worldHud.hidden = false;
        fieldMenuButton.hidden = false;
        touchControls.hidden = !coarsePointer.matches;
        exploreButton.disabled = false;
        canvas.focus({ preventScroll: true });
        syncGameInput();
        showWorldToast(
          "WASD move · Shift sprint · Space jump · hold/release Q cast · F lantern · drag props",
        );
        return instance;
      } catch (error) {
        try {
          instance.dispose();
        } catch (cleanupError) {
          console.error(
            "Failed to release a partially initialized world runtime",
            cleanupError,
          );
        }
        throw error;
      }
    })();
  }

  let instance: PortfolioGame;
  try {
    const readyInstance = game ?? (await gamePromise);
    if (!readyInstance) {
      throw new Error("The world runtime did not initialize.");
    }
    instance = readyInstance;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown renderer error";
    stage.dataset.state = "idle";
    window.scrollTo(0, 0);
    entryLanding.hidden = false;
    loadingPanel.hidden = true;
    worldHud.hidden = true;
    fieldMenuButton.hidden = true;
    exploreButton.disabled = false;
    entryStatus.textContent =
      "Interactive mode could not start here. The complete portfolio is still available.";
    writeTerminal(`renderer error: ${detail}`, "error");
    throw error;
  } finally {
    if (!game) gamePromise = null;
  }

  if (destination && instance.getCurrentZone() !== destination) {
    await instance.teleport(destination);
  }
  return instance;
}

async function runTerminalCommand(rawCommand: string): Promise<void> {
  const trimmed = rawCommand.trim();
  if (!trimmed) return;

  const [command = "", ...args] = trimmed.split(/\s+/);
  const enteredCommand = command.toLowerCase();
  const normalized = resolveTerminalCommandName(enteredCommand);
  writeTerminal(`❯ ${trimmed}`);

  if (normalized === "clear") {
    clearTerminalOutput();
    return;
  }

  if (normalized === "reset") {
    const subject = (args[0] ?? "").toLowerCase();
    const confirmed = (args[1] ?? "").toLowerCase() === "confirm";
    if (subject === "history") {
      commandHistory = [];
      historyIndex = 0;
      worldJournal.splice(0, worldJournal.length);
      writeTerminal("session command and world-message history cleared.", "ok");
      return;
    }
    if (subject === "progress" && confirmed) {
      writeTerminal(
        "reset confirmed. Clearing achievements, indexed routes, and spell progression…",
        "ok",
      );
      window.setTimeout(clearExpeditionRecord, 420);
      return;
    }
    if (subject === "progress") {
      writeTerminal(
        "This clears achievements, indexed routes, and spell progression. Appearance settings remain.",
        "muted",
      );
      writeTerminal("Run: reset progress confirm", "error");
      return;
    }
    writeTerminal("usage: reset <history|progress confirm>", "error");
    return;
  }

  if (normalized === "help") {
    writeTerminal("shell       ls [path] · cd <place> · pwd · cat <file> · tree · history [clear]");
    writeTerminal("journal     log [count|speech|achievements|clear] · reset history");
    writeTerminal(
      `navigation  map · goto <${terminalDestinationUsage()}> · tp <${terminalDestinationUsage()}> · zone`,
    );
    writeTerminal("             open <atlas|folio|spells|portfolio>");
    writeTerminal("identity    whoami · portfolio · projects");
    writeTerminal(
      "sandbox     speed <1-3> · noclip · spark · lantern [on|off] · respawn · quality <low|medium|high>",
    );
    writeTerminal("debug       colliders [on|off] · hitboxes [on|off]");
    writeTerminal("spellbook   spell [spark|surge|thunder] · forms must be recovered first");
    writeTerminal("override    override spell <spark|surge|thunder> · surge · thunder");
    writeTerminal("records     reset progress confirm", "muted");
    writeTerminal("secret      ritual", "muted");
    return;
  }

  if (normalized === "pwd") {
    writeTerminal(terminalDirectory, "ok");
    return;
  }

  if (normalized === "ls") {
    const rawRequested = (
      args.find((argument) => !argument.startsWith("-")) ?? "."
    ).toLowerCase();
    const requested =
      rawRequested === "/" ? rawRequested : rawRequested.replace(/\/$/, "");
    let directory: TerminalDirectory | null = null;
    if (requested === "." || requested === "") {
      directory = terminalDirectory;
    } else if (requested === "/" || requested === "..") {
      directory = "/";
    } else {
      const destination = resolveZone(
        requested.replace(/^\.\//, "").replace(/^\//, ""),
      );
      if (destination && !isZoneDiscovered(destination)) {
        writeTerminal(`ls: '${requested}': destination not indexed`, "error");
        return;
      }
      if (destination) directory = `/${destination}`;
    }
    if (!directory) {
      writeTerminal(`ls: cannot access '${requested}': no such place`, "error");
      return;
    }
    writeTerminal(
      directory === "/"
        ? `${getIndexedZoneIds()
            .map((zone) => `${zone === "math" ? "mightymatica" : zone}/`)
            .join("  ")}  README.txt  portfolio.link`
        : terminalDirectoryFiles[directory.slice(1) as ZoneId].join("  "),
    );
    return;
  }

  if (normalized === "cd") {
    const requested = (args[0] ?? "~").toLowerCase();
    if (requested === "/" || requested === "..") {
      previousTerminalDirectory = terminalDirectory;
      terminalDirectory = "/";
      updateTerminalChrome();
      return;
    }
    if (requested === ".") return;
    const targetDirectory =
      requested === "-"
        ? previousTerminalDirectory
        : requested === "~"
          ? "/field"
          : `/${requested.replace(/^\.\//, "").replace(/^\//, "").replace(/\/$/, "")}`;
    if (targetDirectory === "/") {
      const originDirectory = terminalDirectory;
      terminalDirectory = "/";
      previousTerminalDirectory = originDirectory;
      updateTerminalChrome();
      return;
    }
    const destination = resolveZone(targetDirectory.slice(1));
    if (!destination) {
      writeTerminal(`cd: ${requested}: no such place`, "error");
      return;
    }
    if (!canUseExplicitTerminalRoute(destination)) {
      writeTerminal(`cd: ${requested}: destination not indexed`, "error");
      return;
    }
    if (destination === "math" && !isZoneDiscovered("math")) {
      writeTerminal(
        "unindexed carrier accepted: resolving a hidden Mightymatica signal…",
        "muted",
      );
    }
    const originDirectory = terminalDirectory;
    const instance = await ensureGame();
    const originZone = instance.getCurrentZone();
    if (originZone !== destination) {
      writeTerminal(
        `exec: fracture current process image -> /${destination}`,
        "muted",
      );
      closeTerminal("world");
      await instance.terminalTeleport(destination);
    }
    if (instance.getCurrentZone() !== destination) {
      writeTerminal(
        `cd: /${destination}: threshold crossing did not settle`,
        "error",
      );
      return;
    }
    previousTerminalDirectory = originDirectory;
    terminalDirectory = `/${destination}`;
    updateTerminalChrome();
    writeTerminal(`/${instance.getCurrentZone()}`, "ok");
    return;
  }

  if (normalized === "cat") {
    const requested = args[0];
    if (!requested) {
      writeTerminal("usage: cat <file>", "error");
      return;
    }
    const normalizedPath = requested.replace(/^\.\//, "");
    const unresolvedPath = normalizedPath.startsWith("/")
      ? normalizedPath
      : terminalDirectory === "/"
        ? `/${normalizedPath}`
        : `${terminalDirectory}/${normalizedPath}`;
    const path = unresolvedPath.replace(
      /^\/mightymatica(?=\/|$)/,
      "/math",
    );
    if (
      !isZoneDiscovered("math") &&
      (path === "/math" ||
        path.startsWith("/math/") ||
        path === "/mightymatica" ||
        path.startsWith("/mightymatica/"))
    ) {
      writeTerminal(`cat: ${requested}: destination not indexed`, "error");
      return;
    }
    const contents = terminalFiles[path];
    if (!contents) {
      writeTerminal(`cat: ${requested}: no such file`, "error");
      return;
    }
    for (const line of contents) writeTerminal(line);
    return;
  }

  if (normalized === "tree") {
    writeTerminal("/");
    for (const zone of getIndexedZoneIds()) {
      const directoryName = zone === "math" ? "mightymatica" : zone;
      writeTerminal(`├── ${directoryName}/`);
      const entries = [
        ...terminalDirectoryFiles[zone],
        ...(zone === "grid" && isZoneDiscovered("math")
          ? ["cube@ -> /mightymatica"]
          : []),
      ];
      for (const [index, entry] of entries.entries()) {
        writeTerminal(
          `${index === entries.length - 1 ? "│   └──" : "│   ├──"} ${entry}`,
        );
      }
    }
    writeTerminal("├── README.txt");
    writeTerminal("└── portfolio.link");
    return;
  }

  if (normalized === "history") {
    if ((args[0] ?? "").toLowerCase() === "clear") {
      commandHistory = [];
      historyIndex = 0;
      writeTerminal("command history cleared.", "ok");
      return;
    }
    commandHistory.forEach((entry, index) => {
      writeTerminal(`${String(index + 1).padStart(2, " ")}  ${entry}`);
    });
    return;
  }

  if (normalized === "log") {
    const requested = (args[0] ?? "12").toLowerCase();
    if (requested === "clear") {
      worldJournal.splice(0, worldJournal.length);
      writeTerminal("current expedition message log cleared.", "ok");
      return;
    }
    const filter =
      requested === "speech" || requested === "npc"
        ? "speech"
        : requested === "achievement" ||
            requested === "achievements" ||
            requested === "milestone" ||
            requested === "milestones"
          ? "achievement"
          : null;
    const requestedCount =
      requested === "all"
        ? maximumWorldJournalEntries
        : filter
          ? 20
          : Number.parseInt(requested, 10);
    if (
      !filter &&
      requested !== "all" &&
      (!Number.isFinite(requestedCount) || requestedCount < 1)
    ) {
      writeTerminal(
        "usage: log [count|all|speech|achievements|clear]",
        "error",
      );
      return;
    }
    const matchingEntries = filter
      ? worldJournal.filter((entry) => entry.kind === filter)
      : worldJournal;
    const count = Math.min(maximumWorldJournalEntries, requestedCount);
    const entries = matchingEntries.slice(-count);
    if (entries.length === 0) {
      writeTerminal(
        filter
          ? `No ${filter === "speech" ? "NPC speech" : "milestones"} recorded yet.`
          : "The current expedition journal is empty.",
        "muted",
      );
      return;
    }
    writeTerminal(
      `world journal · ${entries.length} of ${matchingEntries.length} matching entries`,
      "ok",
    );
    for (const entry of entries) {
      const source =
        entry.kind === "speech"
          ? entry.speaker ?? "unknown speaker"
          : entry.kind === "achievement"
            ? entry.title
              ? `milestone:${entry.title}`
              : "milestone"
            : "world";
      writeTerminal(
        `${journalTimeFormatter.format(entry.recordedAt)} [${entry.zone}/${source}] ${entry.message}`,
        entry.kind === "achievement" ? "ok" : entry.kind === "notice" ? "muted" : "normal",
      );
    }
    return;
  }

  if (normalized === "echo") {
    writeTerminal(args.join(" "));
    return;
  }

  if (normalized === "date") {
    writeTerminal(new Date().toString());
    return;
  }

  if (normalized === "uname") {
    writeTerminal("strange-skies webgl three.js");
    return;
  }

  if (normalized === "which") {
    const candidate = (args[0] ?? "").toLowerCase();
    writeTerminal(
      isTerminalCommandName(candidate)
        ? `/world/bin/${candidate}`
        : `${candidate || "which"} not found`,
      isTerminalCommandName(candidate) ? "ok" : "error",
    );
    return;
  }

  if (normalized === "man") {
    const requestedCandidate = (args[0] ?? "").toLowerCase();
    const candidate = resolveTerminalCommandName(requestedCandidate);
    const manuals: Readonly<Record<string, string>> = {
      cd: `cd <${terminalDestinationUsage()}|..|/>: change place by dissolving and rewriting the current world process`,
      ls: "ls [place]: list mounted places or the files held by one",
      cat: "cat <file>: read a file in the current mounted place",
      history: "history [clear]: replay or clear commands from this terminal session",
      log: "log [count|all|speech|achievements|clear]: replay or clear the current expedition's world messages",
      goto:
        "goto <place>: close the terminal and follow a collision-aware physical route through portals",
      tp: "tp <place>: perform a cyan-pencil teleport rite and draw the route into the world",
      spell: "spell [spark|surge|thunder]: inspect or equip a recovered spell form",
      reset:
        "reset history: clear session logs; reset progress confirm: clear local expedition progression",
      ritual: "ritual [open]: trace the Falls circuit, or invoke the known override",
      colliders:
        "colliders [on|off]: overlay coral blocking volumes and cyan landing surfaces",
      sudo:
        `sudo: the recovered root protocol accepts only '${worldCollapseCommand}'`,
    };
    writeTerminal(
      manuals[candidate] ?? "No manual entry. Try help.",
      requestedCandidate ? "normal" : "error",
    );
    return;
  }

  if (normalized === "open") {
    const target = (args[0] ?? "").toLowerCase();
    if (target === "portfolio" || target === "projects") {
      openPortfolio();
      return;
    }
    if (target === "map" || target === "atlas") {
      openFieldMenu("atlas");
      return;
    }
    if (
      target === "folio" ||
      target === "journal" ||
      target === "achievements" ||
      target === "spells" ||
      target === "spellbook" ||
      target === "settings"
    ) {
      openFieldMenu(
        target === "settings"
          ? "settings"
          : target === "spells" || target === "spellbook"
            ? "spells"
            : "journal",
      );
      return;
    }
    writeTerminal("usage: open <atlas|folio|spells|portfolio>", "error");
    return;
  }

  if (normalized === "exit") {
    closeTerminal("world");
    return;
  }

  if (normalized === "whoami") {
    writeTerminal("Ignat Remizov · CTO, systems builder, creative technologist.", "ok");
    writeTerminal("Building legible systems across payments, compliance, risk, and cloud.");
    return;
  }

  if (normalized === "map") {
    openFieldMenu("atlas");
    return;
  }

  if (normalized === "portfolio") {
    openPortfolio();
    return;
  }

  if (normalized === "goto") {
    const requested = (args[0] ?? "").toLowerCase();
    const destination = resolveZone(requested);
    if (!destination) {
      writeTerminal(`usage: goto <${terminalDestinationUsage()}>`, "error");
      return;
    }
    if (!canUseExplicitTerminalRoute(destination)) {
      writeTerminal(
        `goto: ${requested || destination}: destination not indexed`,
        "error",
      );
      return;
    }
    if (destination === "math" && !isZoneDiscovered("math")) {
      writeTerminal(
        "unindexed carrier accepted: resolving a hidden Mightymatica threshold…",
        "muted",
      );
    }
    const instance = await ensureGame();
    const result = instance.walkTo(destination);
    if (result === "walking") {
      writeTerminal(`goto: walk graph engaged -> /${destination}`, "ok");
      closeTerminal("world");
      return;
    }
    writeTerminal(
      result === "already-here"
        ? `goto: already in /${destination}`
        : `goto: no walkable threshold route to /${destination}`,
      result === "already-here" ? "muted" : "error",
    );
    return;
  }

  if (normalized === "tp") {
    const destination = resolveZone(args[0] ?? "");
    if (!destination) {
      writeTerminal(`usage: tp <${terminalDestinationUsage()}>`, "error");
      return;
    }
    if (!canUseExplicitTerminalRoute(destination)) {
      writeTerminal(
        `tp: ${(args[0] ?? destination).toLowerCase()}: destination not indexed`,
        "error",
      );
      return;
    }
    const instance = await ensureGame();
    if (!instance.hasEquippedTeleportPencil()) {
      writeTerminal(
        "tp: rite unavailable. Equip the cyan pencil first, or use cd <place> for an immediate shell route.",
        "error",
      );
      return;
    }
    if (destination === "math" && !isZoneDiscovered("math")) {
      writeTerminal(
        "unindexed carrier accepted: resolving a hidden Mightymatica signal…",
        "muted",
      );
    }
    writeTerminal(
      "cyan implement accepted. Commit the circle; let the route fold inward.",
      "ok",
    );
    closeTerminal("world");
    const traveled = await instance.ritualTeleport(destination);
    writeTerminal(
      traveled
        ? `ritual route settled: ${instance.getCurrentZone()}`
        : "tp: the circle broke before the route settled",
      traveled ? "ok" : "error",
    );
    return;
  }

  if (normalized === "zone") {
    const instance = await ensureGame();
    writeTerminal(`current zone: ${instance.getCurrentZone()}`, "ok");
    return;
  }

  if (normalized === "quality") {
    const requested = args[0] ?? "";
    if (!isQualityTier(requested)) {
      writeTerminal("usage: quality <low|medium|high>", "error");
      return;
    }
    const instance = await ensureGame();
    instance.setQuality(requested);
    writeTerminal(`render quality: ${requested}`, "ok");
    return;
  }

  if (normalized === "speed") {
    const requested = Number(args[0]);
    if (!Number.isFinite(requested) || requested < 1 || requested > 3) {
      writeTerminal("usage: speed <1|2|3>", "error");
      return;
    }
    const instance = await ensureGame();
    writeTerminal(`movement multiplier: ${instance.setSpeedMultiplier(requested)}x`, "ok");
    return;
  }

  if (normalized === "noclip") {
    const instance = await ensureGame();
    writeTerminal(`noclip: ${instance.toggleNoclip() ? "on" : "off"}`, "ok");
    return;
  }

  const debugSubject =
    normalized === "debug" ? (args[0] ?? "").toLowerCase() : normalized;
  if (
    debugSubject === "colliders" ||
    debugSubject === "collision" ||
    debugSubject === "hitboxes"
  ) {
    const requested = (
      normalized === "debug" ? args[1] ?? "" : args[0] ?? ""
    ).toLowerCase();
    if (
      requested !== "" &&
      requested !== "toggle" &&
      requested !== "on" &&
      requested !== "off"
    ) {
      writeTerminal("usage: colliders [on|off]", "error");
      return;
    }
    const force =
      requested === "on" ? true : requested === "off" ? false : undefined;
    const instance = await ensureGame();
    const enabled = instance.toggleCollisionDebug(force);
    writeTerminal(
      enabled
        ? "collision debug: on · coral = blockers · cyan = landing/support surfaces · avatar clearance adds 0.4m"
        : "collision debug: off",
      "ok",
    );
    scheduleTerminalClose(360);
    return;
  }
  if (normalized === "debug") {
    writeTerminal("usage: debug <colliders|hitboxes> [on|off]", "error");
    return;
  }

  const requestedSpellStage = args[0]?.toLowerCase();
  const parsedRequestedSpellStage =
    requestedSpellStage &&
    spellStages.includes(requestedSpellStage as SpellStage)
      ? (requestedSpellStage as SpellStage)
      : null;
  const overrideArgument = args[1]?.toLowerCase();
  const explicitOverrideStage =
    normalized === "override" &&
    requestedSpellStage === "spell" &&
    overrideArgument &&
    spellStages.includes(overrideArgument as SpellStage)
      ? (overrideArgument as SpellStage)
      : null;
  const overrideStage: SpellStage | null =
    normalized === "surge" || normalized === "thunder"
      ? normalized
      : explicitOverrideStage;
  if (overrideStage) {
    const instance = await ensureGame();
    instance.grantSpellStage(overrideStage);
    instance.selectSpellStage(overrideStage);
    writeTerminal(
      `spell compiler override: ${overrideStage} recovered and equipped`,
      "ok",
    );
    return;
  }
  if (normalized === "override") {
    writeTerminal(
      "usage: override spell <spark|surge|thunder>",
      "error",
    );
    return;
  }

  if (
    normalized === "packet" &&
    (args[0] ?? "").toLowerCase() === "interference"
  ) {
    const instance = await ensureGame();
    instance.grantPacketInterference();
    writeTerminal("packet interference armed.", "ok");
    return;
  }

  if (normalized === "spell") {
    const instance = await ensureGame();
    if (!requestedSpellStage) {
      writeTerminal(
        `equipped: ${worldProgress.selectedSpellStage} · highest recovered: ${worldProgress.spellStage}`,
        "ok",
      );
      return;
    }
    if (!parsedRequestedSpellStage) {
      writeTerminal("usage: spell <spark|surge|thunder>", "error");
      return;
    }
    if (!instance.selectSpellStage(parsedRequestedSpellStage)) {
      writeTerminal(
        `spell: ${parsedRequestedSpellStage}: form remains sealed`,
        "error",
      );
      return;
    }
    writeTerminal(`spell equipped: ${parsedRequestedSpellStage}`, "ok");
    return;
  }

  if (normalized === "spark") {
    const instance = await ensureGame();
    instance.castSpell(0.5);
    writeTerminal("current spell cast at half charge.", "ok");
    return;
  }

  if (normalized === "lantern") {
    const instance = await ensureGame();
    const requested = (args[0] ?? "").toLowerCase();
    const active =
      requested === "on"
        ? instance.toggleLantern(true)
        : requested === "off"
          ? instance.toggleLantern(false)
          : instance.toggleLantern();
    writeTerminal(`lantern: ${active ? "raised" : "stowed"}`, "ok");
    return;
  }

  if (normalized === "respawn") {
    const instance = await ensureGame();
    instance.respawn();
    writeTerminal("position restored.", "ok");
    return;
  }

  if (normalized === "ritual") {
    const instance = await ensureGame("falls");
    instance.setSpeedMultiplier(1);
    if ((args[0] ?? "").toLowerCase() === "open") {
      const opened = instance.completeFantasyRitual();
      writeTerminal(
        opened ? "ritual complete. The center waterfall is parting." : "ritual unavailable.",
        opened ? "ok" : "error",
      );
      scheduleTerminalClose(420);
      return;
    }
    const traced = instance.traceFantasyRitual();
    writeTerminal(
      traced
        ? "world-side ritual trace launched."
        : "ritual trace unavailable in current world state.",
      traced ? "ok" : "error",
    );
    scheduleTerminalClose(traced ? 220 : 520);
    return;
  }

  if (normalized === "sudo") {
    const invocation = args.map((argument) => argument.toLowerCase());
    const collapseTarget =
      (invocation[0] === "collapse" && invocation[1] === "world") ||
      (invocation[0] === "world" && invocation[1] === "collapse");
    if (
      invocation.length === 4 &&
      collapseTarget &&
      invocation[2] === "--event-horizon" &&
      invocation[3] === "--arm"
    ) {
      const newlyArmed = !worldMeta.collapseArmed;
      worldMeta = armWorldCollapse(worldMeta);
      storeWorldMeta(worldMeta);
      disarmProgressReset();
      pulseFieldMenu();
      if (newlyArmed) {
        writeTerminal(
          "Root rite accepted. The Event Horizon sleeps beneath the satchel clasp.",
          "ok",
        );
        writeTerminal(
          "Open the expedition record when thou wouldst wake it. The world shall close around its last ember.",
          "omen",
        );
      } else {
        writeTerminal(
          "The seal is already cut. The Event Horizon waits within the expedition record.",
          "omen",
        );
      }
      return;
    }
    writeTerminal(
      `sudo: root protocol not recognized. Expected: ${worldCollapseCommand}`,
      "error",
    );
    return;
  }

  writeTerminal(`command not found: ${normalized}. Try help.`, "error");
}

exploreButton.addEventListener("click", () => {
  void ensureGame().catch(() => {
    // The accessible fallback and recovery message are handled by ensureGame.
  });
});

canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));

for (const control of document.querySelectorAll<HTMLElement>("[data-action]")) {
  control.addEventListener("click", (event) => {
    const action = control.dataset.action;
    if (action === "map") openFieldMenu("atlas");
    if (action === "field-menu") openFieldMenu("journal");
    if (action === "terminal") openTerminal();
    if (action === "portfolio") {
      event.preventDefault();
      openPortfolio();
    }
    if (action === "help") openDialog("help");
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-close]")) {
  button.addEventListener("click", () => closeOverlay(button.dataset.close ?? ""));
}

for (const dialog of Object.values(dialogs)) {
  dialog.addEventListener("close", () => {
    if (dialog === portfolioDialog) {
      game?.notifyPortfolioClosed();
      if (!synchronizingPortfolioRoute) clearPortfolioRoute();
    }
    syncGameInput();
    if (
      game &&
      stage.dataset.state === "playing" &&
      !hasOpenOverlay()
    ) {
      canvas.focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

terminalPanel.addEventListener("close", () => {
  syncGameInput();
  const focusMode = terminalCloseFocus;
  terminalCloseFocus = "return";
  const returnFocus = terminalReturnFocus;
  terminalReturnFocus = null;
  if (hasOpenOverlay()) return;
  if (
    focusMode === "world" &&
    game &&
    stage.dataset.state === "playing"
  ) {
    canvas.focus({ preventScroll: true });
    return;
  }
  if (
    returnFocus?.isConnected &&
    !returnFocus.closest("dialog:not([open])")
  ) {
    returnFocus.focus({ preventScroll: true });
    return;
  }
  if (game && stage.dataset.state === "playing") {
    canvas.focus({ preventScroll: true });
  } else {
    exploreButton.focus({ preventScroll: true });
  }
});
terminalPanel.addEventListener("click", (event) => {
  if (event.target === terminalPanel) closeTerminal();
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-zone]")) {
  button.addEventListener("click", () => {
    const destination = resolveZone(button.dataset.zone ?? "");
    if (!destination || !isZoneDiscovered(destination)) return;
    closeDialogs();
    void ensureGame()
      .then((instance) => instance.travelFromAtlas(destination))
      .catch(() => {
        // ensureGame exposes its own fallback on failure.
      });
  });
}

document.querySelector<HTMLAnchorElement>(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  openPortfolio();
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-folio-tab]",
)) {
  button.addEventListener("click", () => {
    const tab = button.dataset.folioTab as FolioTab | undefined;
    if (tab) selectFolioTab(tab);
  });
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [
      ...document.querySelectorAll<HTMLButtonElement>("[data-folio-tab]"),
    ];
    const currentIndex = tabs.indexOf(button);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    const next = tabs[nextIndex];
    const tab = next?.dataset.folioTab as FolioTab | undefined;
    if (!next || !tab) return;
    selectFolioTab(tab);
    next.focus();
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-quality-setting]",
)) {
  button.addEventListener("click", () => {
    const quality = button.dataset.qualitySetting;
    if (!isQualityTier(quality)) return;
    if (game) {
      game.setQuality(quality);
    } else {
      storeQuality(quality);
      syncQualityControls(quality);
    }
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-spell-setting]",
)) {
  button.addEventListener("click", () => {
    const stage = button.dataset.spellSetting as SpellStage | undefined;
    if (!stage || !spellStages.includes(stage)) return;
    void ensureGame()
      .then((instance) => {
        if (!instance.selectSpellStage(stage)) return;
        setWorldStatus(
          `${spellNames[stage]} settles into the active spell lattice.`,
        );
      })
      .catch(() => {
        // ensureGame exposes its own fallback on failure.
      });
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-contrast-setting]",
)) {
  button.addEventListener("click", () => {
    const contrast = button.dataset.contrastSetting as
      | InterfaceContrast
      | undefined;
    if (contrast !== "atmospheric" && contrast !== "high") return;
    updateWorldPreferences({ contrast });
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-motion-setting]",
)) {
  button.addEventListener("click", () => {
    const motion = button.dataset.motionSetting as MotionPreference | undefined;
    if (motion !== "system" && motion !== "reduced") return;
    updateWorldPreferences({ motion });
  });
}

metricsSetting.addEventListener("click", () => {
  updateWorldPreferences({ showMetrics: !worldPreferences.showMetrics });
});

collapseCommandButton.addEventListener("click", () => {
  closeDialogs();
  openTerminal();
  terminalInput.value = worldCollapseCommand;
  terminalInput.setSelectionRange(
    worldCollapseCommand.length,
    worldCollapseCommand.length,
  );
  writeTerminal(
    "Root protocol staged but not executed. Press Enter to arm the Event Horizon.",
    "muted",
  );
  scheduleTerminalFocus();
});

progressResetButton.addEventListener("click", () => {
  if (progressResetButton.dataset.confirming === "true") {
    if (worldMeta.collapseArmed) void beginEventHorizonReset();
    else clearExpeditionRecord();
    return;
  }
  progressResetQuietButton.dataset.confirming = "false";
  progressResetButton.dataset.confirming = "true";
  progressResetButton.textContent = worldMeta.collapseArmed
    ? "Confirm: open the event horizon"
    : isCollapseCommandDiscovered()
      ? "Confirm: reset without Event Horizon"
      : "Confirm: erase local expedition";
  progressResetStatus.textContent =
    worldMeta.collapseArmed
      ? "Press once more within eight seconds. You retain control until the final pull."
      : isCollapseCommandDiscovered()
        ? "This bypasses the discovered cinematic. Press once more within eight seconds to erase the expedition directly."
        : "Press once more within eight seconds. Render and accessibility settings will remain.";
  window.clearTimeout(progressResetConfirmTimer);
  progressResetConfirmTimer = window.setTimeout(disarmProgressReset, 8000);
});

progressResetQuietButton.addEventListener("click", () => {
  if (progressResetQuietButton.dataset.confirming === "true") {
    clearExpeditionRecord();
    return;
  }
  progressResetButton.dataset.confirming = "false";
  progressResetQuietButton.dataset.confirming = "true";
  progressResetQuietButton.textContent = "Confirm quiet reset";
  progressResetButton.textContent = "Collapse expedition into event horizon";
  progressResetStatus.textContent =
    "Press once more within eight seconds. The expedition will restart without the collapse sequence.";
  window.clearTimeout(progressResetConfirmTimer);
  progressResetConfirmTimer = window.setTimeout(disarmProgressReset, 8000);
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-folio-action]",
)) {
  button.addEventListener("click", () => {
    const action = button.dataset.folioAction;
    if (action === "help") openDialog("help");
    if (action === "respawn" && game) {
      closeDialogs();
      game.respawn();
    }
  });
}

spellButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !game || spellPointerId !== null) return;
  event.preventDefault();
  spellPointerId = event.pointerId;
  spellButton.setPointerCapture(event.pointerId);
  game.beginSpellCharge();
});
function finishSpellPointer(
  cast: boolean,
  event?: PointerEvent,
): void {
  if (
    event &&
    (spellPointerId === null || spellPointerId !== event.pointerId)
  ) {
    return;
  }
  const pointerId = spellPointerId;
  if (pointerId === null) return;
  spellPointerId = null;
  if (spellButton.hasPointerCapture(pointerId)) {
    spellButton.releasePointerCapture(pointerId);
  }
  if (cast) game?.releaseSpellCharge();
  else game?.cancelSpellCharge();
  if (cast && !hasOpenOverlay()) canvas.focus({ preventScroll: true });
}
spellButton.addEventListener("pointerup", (event) => {
  finishSpellPointer(true, event);
});
spellButton.addEventListener("pointercancel", (event) => {
  finishSpellPointer(false, event);
});
spellButton.addEventListener("lostpointercapture", (event) => {
  finishSpellPointer(false, event);
});
spellButton.addEventListener("click", (event) => {
  if (event.detail !== 0) return;
  game?.castSpell(0.3);
  canvas.focus({ preventScroll: true });
});

lanternButton.addEventListener("click", () => {
  game?.toggleLantern();
  canvas.focus({ preventScroll: true });
});

terminalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = terminalInput.value;
  if (!command.trim()) return;
  commandHistory = [...commandHistory.slice(-29), command];
  historyIndex = commandHistory.length;
  terminalInput.value = "";
  void runTerminalCommand(command).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : "command failed";
    writeTerminal(detail, "error");
  });
});

terminalInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    historyIndex = Math.max(0, historyIndex - 1);
    terminalInput.value = commandHistory[historyIndex] ?? "";
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    historyIndex = Math.min(commandHistory.length, historyIndex + 1);
    terminalInput.value = commandHistory[historyIndex] ?? "";
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const value = terminalInput.value.trimStart();
    const [command = "", fragment = ""] = value.toLowerCase().split(/\s+/, 2);
    const canonicalCommand = resolveTerminalCommandName(command);
    if (
      value.includes(" ") &&
      ["cd", "goto", "tp"].includes(canonicalCommand)
    ) {
      const match = getIndexedDestinationNames().find((candidate) =>
        candidate.startsWith(fragment.replace(/^\//, "")),
      );
      if (match) terminalInput.value = `${command} ${match}`;
      return;
    }
    const match = terminalCommandNames.find((candidate) =>
      candidate.startsWith(command),
    );
    if (match) terminalInput.value = match;
  }
});

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("a, button, input, textarea, select, [contenteditable]") !==
      null
  );
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTerminal();
    closeDialogs();
    return;
  }
  if (isEditableTarget(event.target)) return;
  if (hasOpenOverlay()) return;

  if (
    event.key === "Enter" &&
    !event.repeat &&
    !entryLanding.hidden &&
    !exploreButton.disabled &&
    !isInteractiveTarget(event.target)
  ) {
    event.preventDefault();
    exploreButton.click();
  } else if (event.code === "Backquote" || event.code === "KeyT") {
    event.preventDefault();
    toggleTerminal();
  } else if (event.code === "KeyM") {
    event.preventDefault();
    openFieldMenu("atlas");
  } else if (event.code === "KeyJ") {
    event.preventDefault();
    openFieldMenu("journal");
  } else if (event.code === "KeyP") {
    event.preventDefault();
    openPortfolio();
  } else if (
    event.code === "KeyR" &&
    game &&
    !worldCollapseInProgress
  ) {
    event.preventDefault();
    game.respawn();
  } else if (event.code === "KeyF" && game) {
    event.preventDefault();
    game.toggleLantern();
  } else if (
    game &&
    (event.code === "KeyE" ||
      (event.code === "Enter" &&
        (event.target === document.body || event.target === canvas)))
  ) {
    event.preventDefault();
    game.interact();
  }
});

function resetJoystick(event?: PointerEvent): void {
  if (
    event &&
    (joystickPointer === null || event.pointerId !== joystickPointer)
  ) {
    return;
  }
  const pointerId = joystickPointer;
  joystickPointer = null;
  if (pointerId !== null && joystick.hasPointerCapture(pointerId)) {
    joystick.releasePointerCapture(pointerId);
  }
  joystickKnob.style.transform = "translate(-50%, -50%)";
  game?.setTouchAxes(0, 0);
}

function updateJoystick(event: PointerEvent): void {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  const rect = joystick.getBoundingClientRect();
  const limit = rect.width * 0.29;
  const rawX = event.clientX - (rect.left + rect.width / 2);
  const rawY = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > limit ? limit / distance : 1;
  const x = rawX * scale;
  const y = rawY * scale;
  joystickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  game?.setTouchAxes(x / limit, -y / limit);
}

joystick.addEventListener("pointerdown", (event) => {
  if (
    joystickPointer !== null ||
    (event.pointerType === "mouse" && event.button !== 0)
  ) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystick.addEventListener("pointermove", updateJoystick);
joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);
joystick.addEventListener("lostpointercapture", resetJoystick);

touchJump.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  game?.jump();
});
touchJump.addEventListener("click", (event) => {
  if (event.detail === 0) game?.jump();
});
touchInteract.addEventListener("click", () => game?.interact());

coarsePointer.addEventListener("change", () => {
  touchControls.hidden = !coarsePointer.matches || !game;
  if (!coarsePointer.matches) resetJoystick();
});

window.addEventListener("pointerup", resetJoystick);
window.addEventListener("pointercancel", resetJoystick);
window.addEventListener("blur", () => {
  resetJoystick();
  finishSpellPointer(false);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) return;
  resetJoystick();
  finishSpellPointer(false);
});

renderAchievementLedger();
syncQualityControls(readStoredQuality() ?? chooseAutomaticQuality());
syncSpellControls();
syncProgressResetControl();
applyWorldPreferences();
syncVisualViewport();
syncPortfolioRoute();
window.addEventListener("hashchange", syncPortfolioRoute);
window.addEventListener("popstate", syncPortfolioRoute);
window.visualViewport?.addEventListener("resize", syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", syncVisualViewport, { passive: true });
window.addEventListener("resize", syncVisualViewport, { passive: true });

window.addEventListener("beforeunload", () => game?.dispose(), { once: true });

if (resumeAfterExpeditionReset) {
  void ensureGame().catch(() => {
    // ensureGame restores the normal accessible fallback on failure.
  });
}
