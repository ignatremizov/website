export interface WormDirection {
  x: number;
  y: number;
}

export interface WormCell {
  x: number;
  y: number;
}

export function getWormVisibilityTransition(
  phase: "playing" | "paused" | "over" | "won",
  automaticallyPaused: boolean,
  hidden: boolean,
): "pause" | "resume" | null {
  if (hidden && phase === "playing") return "pause";
  if (!hidden && phase === "paused" && automaticallyPaused) return "resume";
  return null;
}

const maxBufferedTurns = 2;
const normalTickStart = 150;
const normalTickFloor = 90;
const reducedMotionTickStart = 175;
const reducedMotionTickFloor = 110;
const millisecondsPerPacket = 2;

export function getWormTickDuration(
  score: number,
  reducedMotion: boolean,
): number {
  const packetCount = Number.isFinite(score)
    ? Math.max(0, Math.floor(score))
    : 0;
  const start = reducedMotion
    ? reducedMotionTickStart
    : normalTickStart;
  const floor = reducedMotion
    ? reducedMotionTickFloor
    : normalTickFloor;
  return Math.max(
    floor,
    start - packetCount * millisecondsPerPacket,
  );
}

export function createWormAutorunCycle(
  columns: number,
  rows: number,
): WormCell[] {
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    rows < 2 ||
    rows % 2 !== 0
  ) {
    throw new Error(
      "WORM autorun requires at least a 2 × 2 board with an even row count.",
    );
  }

  const cycle: WormCell[] = [];
  for (let x = 0; x < columns; x += 1) {
    cycle.push({ x, y: 0 });
  }
  for (let y = 1; y < rows; y += 1) {
    if (y % 2 === 1) {
      for (let x = columns - 1; x >= 1; x -= 1) {
        cycle.push({ x, y });
      }
    } else {
      for (let x = 1; x < columns; x += 1) {
        cycle.push({ x, y });
      }
    }
  }
  for (let y = rows - 1; y >= 1; y -= 1) {
    cycle.push({ x: 0, y });
  }
  return cycle;
}

export function enqueueWormTurn(
  currentDirection: WormDirection,
  bufferedTurns: WormDirection[],
  nextDirection: WormDirection,
): boolean {
  if (bufferedTurns.length >= maxBufferedTurns) return false;
  const referenceDirection =
    bufferedTurns[bufferedTurns.length - 1] ?? currentDirection;
  const repeatsDirection =
    nextDirection.x === referenceDirection.x &&
    nextDirection.y === referenceDirection.y;
  const reversesDirection =
    nextDirection.x === -referenceDirection.x &&
    nextDirection.y === -referenceDirection.y;
  if (repeatsDirection || reversesDirection) return false;
  bufferedTurns.push(nextDirection);
  return true;
}
