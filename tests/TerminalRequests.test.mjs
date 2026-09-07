import assert from "node:assert/strict";
import test from "node:test";
import { TerminalRequests } from "../src/shell/TerminalRequests.ts";

test("a pending payload cannot start after close and reopen during loading", async () => {
  const requests = new TerminalRequests();
  let open = true;
  const isCurrent = requests.begin(() => open);
  const loading = Promise.withResolvers();
  let started = false;
  const command = (async () => {
    await loading.promise;
    if (isCurrent()) started = true;
  })();
  open = false;
  assert.equal(isCurrent(), false); // Native dialog close, before its queued event.
  requests.invalidate();
  open = true;
  loading.resolve();
  await command;
  assert.equal(started, false);
});

test("a newer shell command supersedes an older loading request", async () => {
  const requests = new TerminalRequests();
  const loading = Promise.withResolvers();
  const first = requests.begin(() => true);
  const effects = [];
  const pending = loading.promise.then(() => {
    if (first()) effects.push("worm");
  });
  const second = requests.begin(() => true);
  effects.push("help");
  loading.resolve();
  await pending;
  assert.deepEqual(effects, ["help"]);
  assert.equal(second(), true);
});

test("authorized travel survives its own close but cannot update a newer session", async () => {
  const requests = new TerminalRequests();
  const current = requests.begin(() => true);
  assert.equal(current(), true);
  requests.invalidate(); // Intentional close immediately before travel.
  const ownsCompletion = requests.checkpoint();
  assert.equal(current(), false);
  assert.equal(ownsCompletion(), true);
  const traveling = Promise.withResolvers();
  let settled = false;
  let shellUpdated = false;
  const pending = (async () => {
    await traveling.promise;
    settled = true;
    if (ownsCompletion()) shellUpdated = true;
  })();
  requests.invalidate(); // Reopen while already-authorized travel is running.
  traveling.resolve();
  await pending;
  assert.equal(settled, true);
  assert.equal(shellUpdated, false);
});

for (const supersededBy of [null, "session", "command"]) {
  test(`accepted travel reports rejection after its own close${supersededBy ? ` unless superseded by a newer ${supersededBy}` : ""}`, async () => {
    const requests = new TerminalRequests();
    let open = true;
    const isCurrent = requests.begin(() => open);
    open = false;
    requests.invalidate(); // The accepted command intentionally closes.
    const ownsCompletion = requests.checkpoint();
    const traveling = Promise.withResolvers();
    const failures = [];
    const pending = (async () => {
      try {
        await traveling.promise;
      } catch (error) {
        if (ownsCompletion()) failures.push(error.message);
      }
    })();
    if (supersededBy === "session") {
      requests.invalidate();
      open = true;
    } else if (supersededBy === "command") {
      requests.begin(() => true);
    }
    assert.equal(isCurrent(), false);
    traveling.reject(new Error("destination module could not load"));
    await pending;
    assert.deepEqual(
      failures,
      supersededBy ? [] : ["destination module could not load"],
    );
  });
}
