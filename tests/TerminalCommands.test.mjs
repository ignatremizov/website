import assert from "node:assert/strict";
import test from "node:test";

import {
  isTerminalCommandName,
  resolveTerminalCommandName,
} from "../src/shell/TerminalCommands.ts";

test("terminal aliases resolve through the shared registry", () => {
  assert.equal(resolveTerminalCommandName("teleport"), "tp");
  assert.equal(resolveTerminalCommandName("home"), "respawn");
  assert.equal(resolveTerminalCommandName("hitboxes"), "colliders");
  assert.equal(resolveTerminalCommandName("projects"), "portfolio");
  assert.equal(resolveTerminalCommandName("c2"), "worm");
  assert.equal(isTerminalCommandName("collision"), true);
});
