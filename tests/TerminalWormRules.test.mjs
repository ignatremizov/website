import assert from "node:assert/strict";
import test from "node:test";

import {
  createWormAutorunCycle,
  enqueueWormTurn,
  getWormTickDuration,
  getWormVisibilityTransition,
} from "../src/shell/TerminalWormRules.ts";

test("hidden start, restart, and resume suspend WORM until foreground returns", () => {
  assert.equal(getWormVisibilityTransition("playing", false, true), "pause");
  assert.equal(getWormVisibilityTransition("paused", true, true), null);
  assert.equal(getWormVisibilityTransition("paused", true, false), "resume");
  assert.equal(getWormVisibilityTransition("playing", false, false), null);
});

test("visibility never resumes a manually paused or finished WORM round", () => {
  for (const hidden of [true, false]) {
    assert.equal(getWormVisibilityTransition("paused", false, hidden), null);
    for (const phase of ["over", "won"]) {
      assert.equal(getWormVisibilityTransition(phase, true, hidden), null);
    }
  }
});

test("WORM preserves a rapid two-corner turn without allowing a reversal", () => {
  const up = { x: 0, y: -1 };
  const left = { x: -1, y: 0 };
  const down = { x: 0, y: 1 };
  const right = { x: 1, y: 0 };
  const bufferedTurns = [];

  assert.equal(enqueueWormTurn(up, bufferedTurns, left), true);
  assert.equal(enqueueWormTurn(up, bufferedTurns, down), true);
  assert.deepEqual(bufferedTurns, [left, down]);
  assert.equal(enqueueWormTurn(up, bufferedTurns, right), false);

  bufferedTurns.shift();
  assert.equal(enqueueWormTurn(left, bufferedTurns, up), false);
  bufferedTurns.length = 0;
  assert.equal(enqueueWormTurn(left, bufferedTurns, right), false);
});

test("WORM accelerates without reaching its reaction-time floor by packet 25", () => {
  assert.equal(getWormTickDuration(0, false), 150);
  assert.equal(getWormTickDuration(25, false), 100);
  assert.equal(getWormTickDuration(999, false), 90);
  assert.equal(getWormTickDuration(25, true), 125);
  assert.equal(getWormTickDuration(999, true), 110);
});

test("WORM autorun route covers every board address in one closed cycle", () => {
  const columns = 22;
  const rows = 14;
  const cycle = createWormAutorunCycle(columns, rows);
  assert.equal(cycle.length, columns * rows);
  assert.equal(
    new Set(cycle.map((cell) => `${cell.x},${cell.y}`)).size,
    columns * rows,
  );

  for (let index = 0; index < cycle.length; index += 1) {
    const current = cycle[index];
    const next = cycle[(index + 1) % cycle.length];
    assert.equal(
      Math.abs(next.x - current.x) +
        Math.abs(next.y - current.y),
      1,
    );
  }
});
