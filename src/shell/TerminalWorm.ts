import {
  createWormAutorunCycle,
  enqueueWormTurn,
  getWormTickDuration,
  getWormVisibilityTransition,
  type WormCell,
  type WormDirection,
} from "./TerminalWormRules";

export type TerminalWormTone =
  | "normal"
  | "muted"
  | "ok"
  | "error";

export interface TerminalWormHost {
  appendElement: (element: HTMLElement) => void;
  onActiveChange: (active: boolean) => void;
  onExit: (message: string, tone: TerminalWormTone) => void;
  requestFocus: () => void;
  isReducedMotion: () => boolean;
}

export interface TerminalWormStartOptions {
  autorun?: boolean;
}

type WormPhase = "playing" | "paused" | "over" | "won";
type WormFailureKind = "firewall" | "route";

const boardColumns = 22;
const boardRows = 14;
const logicalCellSize = 20;
const boardWidth = boardColumns * logicalCellSize;
const boardHeight = boardRows * logicalCellSize;
const autorunCycle = createWormAutorunCycle(
  boardColumns,
  boardRows,
);

const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const satisfies Readonly<Record<string, WormDirection>>;

const directionByKey: Readonly<Record<string, WormDirection>> = {
  ArrowUp: directions.up,
  ArrowDown: directions.down,
  ArrowLeft: directions.left,
  ArrowRight: directions.right,
  w: directions.up,
  W: directions.up,
  s: directions.down,
  S: directions.down,
  a: directions.left,
  A: directions.left,
  d: directions.right,
  D: directions.right,
};

/**
 * A terminal-owned Snake runtime. It owns only its bounded canvas, controls,
 * scalar game state, and low-frequency tick timer; Three.js and world
 * simulation remain behind the terminal overlay and are never imported here.
 */
export class TerminalWorm {
  private root: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private scoreLabel: HTMLElement | null = null;
  private statusLabel: HTMLElement | null = null;
  private hintLabel: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private snake: WormCell[] = [];
  private food: WormCell = { x: 0, y: 0 };
  private direction: WormDirection = directions.right;
  private readonly queuedDirections: WormDirection[] = [];
  private phase: WormPhase = "playing";
  private score = 0;
  private highScore = 0;
  private failureReason = "";
  private failureKind: WormFailureKind | null = null;
  private tickTimer = 0;
  private victoryFrame = 0;
  private victoryStartedAt = 0;
  private victoryProgress = 0;
  private autorun = false;
  private assistedRound = false;
  private autorunCycleIndex = 0;
  private automaticallyPaused = false;
  private swipePointer: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;

  constructor(private readonly host: TerminalWormHost) {}

  get isActive(): boolean {
    return this.root !== null;
  }

  start(options: TerminalWormStartOptions = {}): void {
    this.autorun = options.autorun === true;
    if (this.isActive) {
      this.resetRound();
      this.host.requestFocus();
      return;
    }

    this.buildInterface();
    if (!this.root || !this.context) {
      this.stop("WORM.COM: video memory allocation failed.", true);
      return;
    }
    this.host.appendElement(this.root);
    this.host.onActiveChange(true);
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.resetRound();
    this.host.requestFocus();
  }

  stop(
    reason = "WORM.COM unloaded. Carrier returned to the shell.",
    announce = true,
  ): void {
    if (!this.isActive) return;
    window.clearTimeout(this.tickTimer);
    this.tickTimer = 0;
    window.cancelAnimationFrame(this.victoryFrame);
    this.victoryFrame = 0;
    this.victoryStartedAt = 0;
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.context = null;
    this.scoreLabel = null;
    this.statusLabel = null;
    this.hintLabel = null;
    this.pauseButton = null;
    this.swipePointer = null;
    this.automaticallyPaused = false;
    this.host.onActiveChange(false);
    if (announce) this.host.onExit(reason, "muted");
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isActive) return false;

    const direction = directionByKey[event.key];
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      this.queueDirection(direction);
      return true;
    }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      this.togglePauseOrRestart();
      return true;
    }
    if (
      event.key === "Enter" &&
      (this.phase === "over" || this.phase === "won")
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.resetRound();
      return true;
    }
    if (
      event.key === "Escape" ||
      event.key.toLowerCase() === "q" ||
      (event.ctrlKey && event.key.toLowerCase() === "c")
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.stop();
      return true;
    }
    return false;
  }

  private buildInterface(): void {
    const root = document.createElement("section");
    root.className = "terminal-worm";
    root.tabIndex = -1;
    root.setAttribute("role", "application");
    root.setAttribute(
      "aria-label",
      "C2 WORM.COM terminal Snake game. Use arrow keys, W A S D, swipe, or the directional controls.",
    );

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "C2://192.168.0.1:31337/WORM.COM";
    const score = document.createElement("span");
    score.className = "terminal-worm-score";
    header.append(title, score);

    const canvas = document.createElement("canvas");
    canvas.className = "terminal-worm-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(boardWidth * pixelRatio);
    canvas.height = Math.round(boardHeight * pixelRatio);
    canvas.style.aspectRatio = `${boardColumns} / ${boardRows}`;
    const context = canvas.getContext("2d");
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const status = document.createElement("p");
    status.className = "terminal-worm-status";
    status.setAttribute("aria-live", "polite");

    const controls = document.createElement("div");
    controls.className = "terminal-worm-controls";
    controls.setAttribute("aria-label", "C2 WORM controls");
    const controlConfigs = [
      ["up", "↑", "Steer up", directions.up],
      ["left", "←", "Steer left", directions.left],
      ["pause", "Ⅱ", "Pause or restart WORM", null],
      ["right", "→", "Steer right", directions.right],
      ["down", "↓", "Steer down", directions.down],
    ] as const;
    for (const [area, glyph, label, direction] of controlConfigs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `terminal-worm-control terminal-worm-control-${area}`;
      button.textContent = glyph;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", () => {
        if (direction) this.queueDirection(direction);
        else this.togglePauseOrRestart();
        this.host.requestFocus();
      });
      controls.append(button);
      if (area === "pause") this.pauseButton = button;
    }

    const hint = document.createElement("p");
    hint.className = "terminal-worm-hint";
    hint.textContent =
      "ARROWS / WASD / SWIPE · SPACE PAUSES · ENTER RESTARTS · ESC / ^C UNLOADS";

    canvas.addEventListener("pointerdown", (event) => {
      if (this.swipePointer !== null) return;
      this.swipePointer = event.pointerId;
      this.swipeStartX = event.clientX;
      this.swipeStartY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointerup", (event) => {
      if (this.swipePointer !== event.pointerId) return;
      this.swipePointer = null;
      const deltaX = event.clientX - this.swipeStartX;
      const deltaY = event.clientY - this.swipeStartY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 14) {
        this.queueDirection(
          Math.abs(deltaX) > Math.abs(deltaY)
            ? deltaX > 0
              ? directions.right
              : directions.left
            : deltaY > 0
              ? directions.down
              : directions.up,
        );
      }
      this.host.requestFocus();
    });
    canvas.addEventListener("pointercancel", () => {
      this.swipePointer = null;
    });

    root.append(header, canvas, status, controls, hint);
    this.root = root;
    this.canvas = canvas;
    this.context = context;
    this.scoreLabel = score;
    this.statusLabel = status;
    this.hintLabel = hint;
  }

  private resetRound(): void {
    window.clearTimeout(this.tickTimer);
    this.tickTimer = 0;
    window.cancelAnimationFrame(this.victoryFrame);
    this.victoryFrame = 0;
    this.victoryStartedAt = 0;
    this.victoryProgress = 0;
    if (this.autorun) {
      this.autorunCycleIndex = Math.floor(boardColumns / 2);
      this.snake = [];
      for (let offset = 0; offset < 4; offset += 1) {
        const cycleIndex =
          (this.autorunCycleIndex - offset + autorunCycle.length) %
          autorunCycle.length;
        const cell = autorunCycle[cycleIndex]!;
        this.snake.push({ x: cell.x, y: cell.y });
      }
      this.direction = directions.right;
    } else {
      const centerX = Math.floor(boardColumns / 2);
      const centerY = Math.floor(boardRows / 2);
      this.snake = [
        { x: centerX, y: centerY },
        { x: centerX - 1, y: centerY },
        { x: centerX - 2, y: centerY },
        { x: centerX - 3, y: centerY },
      ];
      this.direction = directions.right;
    }
    this.assistedRound = this.autorun;
    this.queuedDirections.length = 0;
    this.phase = "playing";
    this.score = 0;
    this.failureReason = "";
    this.failureKind = null;
    this.automaticallyPaused = false;
    this.placeFood();
    this.setStatus(
      this.autorun
        ? "AUTORUN // safe route locked // any direction hijacks the carrier"
        : "carrier live // consume loose packets without touching the frame or your own route",
    );
    this.updateInterface();
    this.render();
    this.scheduleTick();
  }

  private queueDirection(direction: WormDirection): void {
    if (this.phase !== "playing") return;
    if (this.autorun) {
      this.autorun = false;
      this.setStatus(
        "manual hijack // autorun score excluded from the high-water mark",
      );
      this.updateInterface();
    }
    enqueueWormTurn(
      this.direction,
      this.queuedDirections,
      direction,
    );
  }

  private togglePauseOrRestart(): void {
    if (this.phase === "over" || this.phase === "won") {
      this.resetRound();
      return;
    }
    if (this.phase === "playing") {
      this.phase = "paused";
      window.clearTimeout(this.tickTimer);
      this.tickTimer = 0;
      this.automaticallyPaused = false;
      this.setStatus(
        `${this.autorun ? "AUTORUN // " : ""}carrier paused // space resumes`,
      );
      this.updateInterface();
      this.render();
      return;
    }
    this.phase = "playing";
    this.automaticallyPaused = false;
    this.setStatus(
      `${this.autorun ? "AUTORUN // " : ""}carrier resumed // packet hunt continues`,
    );
    this.updateInterface();
    this.render();
    this.scheduleTick();
  }

  private scheduleTick(): void {
    // A start/restart or explicit resume can happen after the document already
    // became hidden, without another visibilitychange event to suspend it.
    if (document.hidden) this.handleVisibilityChange();
    if (
      this.tickTimer !== 0 ||
      this.phase !== "playing" ||
      document.hidden ||
      !this.root?.isConnected
    ) {
      return;
    }
    this.tickTimer = window.setTimeout(
      this.runTick,
      this.getTickDuration(),
    );
  }

  private readonly runTick = (): void => {
    this.tickTimer = 0;
    if (document.hidden) this.handleVisibilityChange();
    if (this.phase !== "playing" || !this.root?.isConnected) return;
    this.advance();
    this.scheduleTick();
  };

  private getTickDuration(): number {
    return getWormTickDuration(
      this.score,
      this.host.isReducedMotion(),
    );
  }

  private advance(): void {
    const head = this.snake[0];
    if (!head) return;
    if (this.autorun) {
      this.autorunCycleIndex =
        (this.autorunCycleIndex + 1) % autorunCycle.length;
      const target = autorunCycle[this.autorunCycleIndex]!;
      const deltaX = target.x - head.x;
      const deltaY = target.y - head.y;
      this.direction =
        deltaX > 0
          ? directions.right
          : deltaX < 0
            ? directions.left
            : deltaY > 0
              ? directions.down
              : directions.up;
    } else {
      this.direction =
        this.queuedDirections.shift() ?? this.direction;
    }
    const next = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y,
    };
    const ateFood = next.x === this.food.x && next.y === this.food.y;
    const occupiedLength = ateFood
      ? this.snake.length
      : Math.max(0, this.snake.length - 1);
    const hitFirewall =
      next.x < 0 ||
      next.x >= boardColumns ||
      next.y < 0 ||
      next.y >= boardRows;
    if (hitFirewall) {
      const firewallFailures = [
        "FIREWALL DROP",
        "EGRESS DENIED",
        "PORT 31337 CLOSED",
      ] as const;
      const edgeIndex =
        Math.abs(next.x * 3 + next.y + this.score) %
        firewallFailures.length;
      this.endRound(firewallFailures[edgeIndex]!, "firewall");
      return;
    }

    let collidedWithRoute = false;
    for (
      let index = 0;
      !collidedWithRoute && index < occupiedLength;
      index += 1
    ) {
      const cell = this.snake[index];
      collidedWithRoute = cell?.x === next.x && cell.y === next.y;
    }
    if (collidedWithRoute) {
      const routeFailures = [
        "SEGMENTATION FAULT",
        "ROUTING LOOP",
        "HEAP CORRUPTION",
        "PACKET COLLISION",
      ] as const;
      const failureIndex =
        Math.abs(next.x * 5 + next.y * 3 + this.score) %
        routeFailures.length;
      this.endRound(routeFailures[failureIndex]!, "route");
      return;
    }

    this.snake.unshift(next);
    if (ateFood) {
      this.score += 1;
      if (!this.assistedRound) {
        this.highScore = Math.max(this.highScore, this.score);
      }
      if (this.snake.length >= boardColumns * boardRows) {
        this.completeRound();
        return;
      }
      this.placeFood();
      this.setStatus(
        `${this.autorun ? "AUTORUN // " : ""}packet ${String(this.score).padStart(2, "0")} absorbed // carrier clock ${this.getTickDuration()} ms`,
      );
    } else {
      this.snake.pop();
    }
    this.updateInterface();
    this.render();
  }

  private completeRound(): void {
    // ROOT PWNED is intentionally a local mastery ending rather than a
    // persistent achievement. Global achievements are exploration checkpoints
    // and participate in Event Horizon progression.
    this.phase = "won";
    this.failureReason = "";
    this.failureKind = null;
    window.clearTimeout(this.tickTimer);
    this.tickTimer = 0;
    if (!this.assistedRound) {
      this.highScore = Math.max(this.highScore, this.score);
    }
    this.victoryProgress = this.host.isReducedMotion() ? 1 : 0;
    this.setStatus(
      `ROOT PWNED // ${boardColumns * boardRows}/${boardColumns * boardRows} addresses occupied // enter or ↻ relaunches`,
    );
    this.updateInterface();
    this.render();
    if (this.victoryProgress < 1) {
      this.victoryFrame = window.requestAnimationFrame(
        this.animateVictory,
      );
    }
  }

  private readonly animateVictory = (timestamp: number): void => {
    this.victoryFrame = 0;
    if (this.phase !== "won" || !this.root?.isConnected) return;
    if (this.victoryStartedAt === 0) this.victoryStartedAt = timestamp;
    this.victoryProgress = Math.min(
      1,
      (timestamp - this.victoryStartedAt) / 1650,
    );
    this.render();
    if (this.victoryProgress < 1) {
      this.victoryFrame = window.requestAnimationFrame(
        this.animateVictory,
      );
    }
  };

  private endRound(
    reason: string,
    failureKind: WormFailureKind = "route",
  ): void {
    this.phase = "over";
    this.failureReason = reason;
    this.failureKind = failureKind;
    window.clearTimeout(this.tickTimer);
    this.tickTimer = 0;
    if (!this.assistedRound) {
      this.highScore = Math.max(this.highScore, this.score);
    }
    this.setStatus(
      `${reason} // ${this.score} packet${this.score === 1 ? "" : "s"} retained // enter or ↻ restarts`,
    );
    this.updateInterface();
    this.render();
  }

  private placeFood(): void {
    if (this.autorun) {
      const freeCells = autorunCycle.length - this.snake.length;
      if (freeCells > 0) {
        const distance =
          1 + Math.floor(Math.random() * freeCells);
        const cell =
          autorunCycle[
            (this.autorunCycleIndex + distance) %
              autorunCycle.length
          ]!;
        this.food = { x: cell.x, y: cell.y };
        return;
      }
    }
    const available: WormCell[] = [];
    for (let y = 0; y < boardRows; y += 1) {
      for (let x = 0; x < boardColumns; x += 1) {
        if (!this.snake.some((cell) => cell.x === x && cell.y === y)) {
          available.push({ x, y });
        }
      }
    }
    this.food =
      available[Math.floor(Math.random() * available.length)] ??
      { x: 0, y: 0 };
  }

  private updateInterface(): void {
    if (this.root) {
      this.root.dataset.phase = this.phase;
      this.root.dataset.autorun = String(this.autorun);
      this.root.setAttribute(
        "aria-label",
        this.autorun
          ? "C2 WORM.COM autorun. Any arrow key, W A S D key, swipe, or directional control takes manual control."
          : "C2 WORM.COM terminal Snake game. Use arrow keys, W A S D, swipe, or the directional controls.",
      );
    }
    if (this.scoreLabel) {
      const mode = this.autorun
        ? "AUTO · "
        : this.assistedRound
          ? "HIJACK · "
          : "";
      this.scoreLabel.textContent =
        `${mode}PACKETS ${String(this.score).padStart(2, "0")} · ` +
        `HIGH ${String(this.highScore).padStart(2, "0")}`;
    }
    if (this.hintLabel) {
      this.hintLabel.textContent = this.autorun
        ? "AUTORUN · ANY DIRECTION HIJACKS · SPACE PAUSES · ESC / ^C UNLOADS"
        : "ARROWS / WASD / SWIPE · SPACE PAUSES · ENTER RESTARTS · ESC / ^C UNLOADS";
    }
    if (this.pauseButton) {
      this.pauseButton.textContent =
        this.phase === "over" || this.phase === "won"
          ? "↻"
          : this.phase === "paused"
            ? "▶"
            : "Ⅱ";
      this.pauseButton.setAttribute(
        "aria-label",
        this.phase === "won"
          ? "Restart WORM after taking root"
          : this.phase === "over"
          ? "Restart WORM"
          : this.phase === "paused"
            ? "Resume WORM"
            : "Pause WORM",
      );
    }
  }

  private setStatus(message: string): void {
    if (this.statusLabel) this.statusLabel.textContent = message;
  }

  private render(): void {
    const context = this.context;
    const canvas = this.canvas;
    if (!context || !canvas) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, boardWidth, boardHeight);
    context.fillStyle = "#02090c";
    context.fillRect(0, 0, boardWidth, boardHeight);

    context.strokeStyle = "rgba(98, 220, 232, 0.075)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 1; x < boardColumns; x += 1) {
      const lineX = x * logicalCellSize + 0.5;
      context.moveTo(lineX, 0);
      context.lineTo(lineX, boardHeight);
    }
    for (let y = 1; y < boardRows; y += 1) {
      const lineY = y * logicalCellSize + 0.5;
      context.moveTo(0, lineY);
      context.lineTo(boardWidth, lineY);
    }
    context.stroke();

    const foodX = this.food.x * logicalCellSize;
    const foodY = this.food.y * logicalCellSize;
    context.fillStyle = "rgba(255, 91, 82, 0.2)";
    context.fillRect(foodX + 2, foodY + 2, 16, 16);
    context.fillStyle = "#ff6b5f";
    context.fillRect(foodX + 5, foodY + 5, 10, 10);
    context.fillStyle = "#f0b45b";
    context.fillRect(foodX + 8, foodY + 3, 4, 3);

    for (let index = this.snake.length - 1; index >= 0; index -= 1) {
      const cell = this.snake[index]!;
      const fade = 1 - index / Math.max(1, this.snake.length) * 0.5;
      context.fillStyle =
        index === 0
          ? "#f0b45b"
          : `rgba(98, 220, 232, ${fade.toFixed(3)})`;
      context.fillRect(
        cell.x * logicalCellSize + 2,
        cell.y * logicalCellSize + 2,
        logicalCellSize - 4,
        logicalCellSize - 4,
      );
      if (index > 0 && index % 3 === 0) {
        context.fillStyle = "rgba(143, 238, 153, 0.62)";
        context.fillRect(
          cell.x * logicalCellSize + 6,
          cell.y * logicalCellSize + 6,
          logicalCellSize - 12,
          logicalCellSize - 12,
        );
      }
    }

    context.strokeStyle = "rgba(98, 220, 232, 0.6)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, boardWidth - 2, boardHeight - 2);

    if (this.phase === "won") {
      const easedProgress =
        1 - Math.pow(1 - this.victoryProgress, 3);
      const centerX = (boardColumns - 1) * 0.5;
      const centerY = (boardRows - 1) * 0.5;
      const farthestDistance = Math.hypot(centerX, centerY);
      for (let y = 0; y < boardRows; y += 1) {
        for (let x = 0; x < boardColumns; x += 1) {
          const distance =
            Math.hypot(x - centerX, y - centerY) /
            farthestDistance;
          if (distance > easedProgress) continue;
          const wake =
            Math.max(0, 1 - Math.abs(distance - easedProgress) * 7);
          context.fillStyle =
            (x + y) % 4 === 0
              ? `rgba(240, 180, 91, ${(0.3 + wake * 0.55).toFixed(3)})`
              : `rgba(143, 238, 153, ${(0.2 + wake * 0.42).toFixed(3)})`;
          context.fillRect(
            x * logicalCellSize + 2,
            y * logicalCellSize + 2,
            logicalCellSize - 4,
            logicalCellSize - 4,
          );
        }
      }
      const titleOpacity = Math.max(
        0,
        Math.min(1, (this.victoryProgress - 0.3) / 0.3),
      );
      context.fillStyle = `rgba(1, 9, 7, ${(0.16 + titleOpacity * 0.48).toFixed(3)})`;
      context.fillRect(
        boardWidth * 0.19,
        boardHeight * 0.36,
        boardWidth * 0.62,
        boardHeight * 0.28,
      );
      context.strokeStyle = `rgba(240, 180, 91, ${(0.28 + titleOpacity * 0.68).toFixed(3)})`;
      context.lineWidth = 2;
      context.strokeRect(
        4,
        4,
        boardWidth - 8,
        boardHeight - 8,
      );
      context.globalAlpha = titleOpacity;
      context.fillStyle = "#f0b45b";
      context.font =
        "700 23px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        "ROOT PWNED",
        boardWidth / 2,
        boardHeight / 2 - 10,
      );
      context.fillStyle = "#8fee99";
      context.font =
        "700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      context.fillText(
        `${boardColumns * boardRows} / ${boardColumns * boardRows} ADDRESSES`,
        boardWidth / 2,
        boardHeight / 2 + 18,
      );
      context.globalAlpha = 1;
    } else if (this.phase !== "playing") {
      context.fillStyle = "rgba(1, 6, 8, 0.72)";
      context.fillRect(0, 0, boardWidth, boardHeight);
      const messageY =
        boardHeight / 2 +
        (this.phase === "over" && this.failureKind === "firewall"
          ? 17
          : 0);
      if (this.phase === "over" && this.failureKind === "firewall") {
        context.font =
          '24px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          "🔥  🧱  🔥",
          boardWidth / 2,
          boardHeight / 2 - 21,
        );
      }
      context.fillStyle =
        this.phase === "over" ? "#ff8f86" : "#8feee4";
      context.font =
        `700 ${this.failureReason.length > 18 ? 14 : 17}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        this.phase === "over"
          ? this.failureReason || "CARRIER FAULT"
          : "CARRIER PAUSED",
        boardWidth / 2,
        messageY,
      );
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this.isActive) return;
    const transition = getWormVisibilityTransition(
      this.phase,
      this.automaticallyPaused,
      document.hidden,
    );
    if (transition === "pause") {
      this.automaticallyPaused = true;
      this.phase = "paused";
      window.clearTimeout(this.tickTimer);
      this.tickTimer = 0;
      this.setStatus(
        `${this.autorun ? "AUTORUN // " : ""}carrier paused // background process suspended`,
      );
      this.updateInterface();
      this.render();
      return;
    }
    if (transition === "resume") {
      this.automaticallyPaused = false;
      this.phase = "playing";
      this.setStatus(
        `${this.autorun ? "AUTORUN // " : ""}carrier resumed // foreground clock restored`,
      );
      this.updateInterface();
      this.render();
      this.scheduleTick();
    }
  };
}
