export interface MovementAxes {
  horizontal: number;
  forward: number;
  running: boolean;
}

const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "KeyQ",
]);

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest("button, a, [role='button']") !== null ||
    target.isContentEditable
  );
}

export class InputController {
  private readonly pressed = new Set<string>();
  private readonly movement: MovementAxes = {
    horizontal: 0,
    forward: 0,
    running: false,
  };
  private touchHorizontal = 0;
  private touchForward = 0;
  private jumpQueued = false;
  private spellQueued = false;
  private spellHeld = false;
  private enabled = true;
  private connected = false;

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.clear);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  setTouchAxes(horizontal: number, forward: number): void {
    this.touchHorizontal = Math.max(-1, Math.min(1, horizontal));
    this.touchForward = Math.max(-1, Math.min(1, forward));
  }

  queueJump(): void {
    if (this.enabled) this.jumpQueued = true;
  }

  getMovement(): MovementAxes {
    if (!this.enabled) {
      this.movement.horizontal = 0;
      this.movement.forward = 0;
      this.movement.running = false;
      return this.movement;
    }

    const keyboardHorizontal =
      Number(this.pressed.has("KeyD") || this.pressed.has("ArrowRight")) -
      Number(this.pressed.has("KeyA") || this.pressed.has("ArrowLeft"));
    const keyboardForward =
      Number(this.pressed.has("KeyW") || this.pressed.has("ArrowUp")) -
      Number(this.pressed.has("KeyS") || this.pressed.has("ArrowDown"));

    let horizontal = keyboardHorizontal + this.touchHorizontal;
    let forward = keyboardForward + this.touchForward;
    const length = Math.hypot(horizontal, forward);
    if (length > 1) {
      horizontal /= length;
      forward /= length;
    }

    this.movement.horizontal = horizontal;
    this.movement.forward = forward;
    this.movement.running =
      this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight");
    return this.movement;
  }

  isActive(): boolean {
    return (
      this.enabled &&
      (this.pressed.size > 0 ||
        this.jumpQueued ||
        this.spellQueued ||
        this.spellHeld ||
        Math.abs(this.touchHorizontal) > 0.01 ||
        Math.abs(this.touchForward) > 0.01)
    );
  }

  consumeJump(): boolean {
    if (!this.enabled || !this.jumpQueued) return false;
    this.jumpQueued = false;
    return true;
  }

  consumeSpell(): boolean {
    if (!this.enabled || !this.spellQueued) return false;
    this.spellQueued = false;
    return true;
  }

  isSpellHeld(): boolean {
    return this.enabled && this.spellHeld;
  }

  clear = (): void => {
    this.pressed.clear();
    this.touchHorizontal = 0;
    this.touchForward = 0;
    this.jumpQueued = false;
    this.spellQueued = false;
    this.spellHeld = false;
  };

  dispose(): void {
    if (this.connected) {
      this.connected = false;
      window.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("keyup", this.handleKeyUp);
      window.removeEventListener("blur", this.clear);
    }
    this.enabled = false;
    this.clear();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || isInteractiveTarget(event.target)) return;
    if (!movementKeys.has(event.code)) return;

    if (event.code === "Space") {
      if (!event.repeat) this.jumpQueued = true;
      event.preventDefault();
      return;
    }
    if (event.code === "KeyQ") {
      if (!event.repeat) this.spellHeld = true;
      event.preventDefault();
      return;
    }

    this.pressed.add(event.code);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!movementKeys.has(event.code)) return;
    if (event.code === "KeyQ") {
      if (this.spellHeld) this.spellQueued = true;
      this.spellHeld = false;
      event.preventDefault();
      return;
    }
    this.pressed.delete(event.code);
  };
}
