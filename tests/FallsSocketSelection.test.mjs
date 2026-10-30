import assert from "node:assert/strict";
import test from "node:test";
import { socketPlacementIsBlocked } from "../src/game/zones/falls/FallsSocketSelection.ts";

test("a correct crystal piled onto a wrong occupant cannot inherit its seat on click, removal, or fracture", () => {
  assert.equal(socketPlacementIsBlocked("tide", null, true), true);
  // Pointer-down or fracture clears occupancy, but not the piled crystal's rejection.
  assert.equal(socketPlacementIsBlocked("tide", "tide", false), true);
});

test("a rejected crystal must leave and return before replacing the removed occupant", () => {
  assert.equal(socketPlacementIsBlocked(null, "tide", false), false);
  assert.equal(socketPlacementIsBlocked("tide", null, false), false);
  assert.equal(socketPlacementIsBlocked("tide", null, true), true);
});

test("rejection belongs to one socket and does not ban wrong colours from another empty socket", () => {
  assert.equal(socketPlacementIsBlocked("moon", "tide", false), false);
  assert.equal(socketPlacementIsBlocked("moon", "tide", true), true);
  assert.equal(socketPlacementIsBlocked("ember", null, false), false);
});
