import type { NavigationRouteGraphDefinition } from "../../NavigationRouteGraph.ts";
import { fallsLandmarks, fallsStairways } from "./FallsLayout.ts";

const tide = fallsStairways.find(stairs => stairs.id === "tide-entry")!;
const firstTreadHeight = tide.to / tide.count;
const fourthTreadHeight = firstTreadHeight * 4;

/**
 * Common terrace, river, and crown travel chains. The bridge deck and river
 * underpass are separate floors; crown landings and takeoffs are separate
 * corners where the next riser needs room for the player's ascending body.
 * Each listed direction is validated against the live authored scene before use.
 */
export const fallsNavigationRoutes: NavigationRouteGraphDefinition = {
  nodes: [
    { id: "portal-approach", point: { x: 0, y: 0, z: 13 } },
    { id: "tide-entry-south", point: { x: -0.3725, y: firstTreadHeight, z: 8.215 } },
    { id: "tide-entry-north", point: { x: -0.3725, y: firstTreadHeight, z: 5.985 } },
    ...Array.from({ length: tide.count }, (_, index) => ({
      id: `tide-tread-${index}`,
      point: {
        x: tide.x + tide.dx * tide.length * (index + 0.5) / tide.count,
        y: tide.from + (tide.to - tide.from) * (index + 1) / tide.count,
        z: tide.z,
      },
    })),
    { id: "tide-fourth-north", point: { x: -2.1225, y: fourthTreadHeight, z: 5.985 } },
    { id: "tide-terrace", point: { x: -4.5, y: tide.to, z: 6.5 } },
    { id: "monument", point: { ...fallsLandmarks.monument, y: 0.82 } },
    { id: "river-south", point: { x: 0.265, y: -0.16, z: 6.395 } },
    // The water bed is 0.16 m below the dry bank. Approach the first 0.225 m
    // tread through that bank, not across its river-facing side (a 0.385 m rise).
    { id: "tide-dry-approach", point: { x: 0.24, y: 0, z: tide.z } },
    { id: "monument-west", point: { x: 0.25, y: -0.16, z: fallsLandmarks.monument.z } },
    { id: "river-turn", point: { x: 0.353, y: -0.16, z: 3.453 } },
    { id: "underpass-south", point: { x: -1.2, y: -0.16, z: 2.8 } },
    { id: "underpass-north", point: { x: -1.2, y: -0.16, z: 1 } },
    { id: "cove-first-south", point: { x: -1.7, y: 0.75, z: -0.985 } },
    { id: "cove-first", point: { x: -1.7, y: 0.75, z: -1.8 } },
    { id: "cove-second", point: { x: -3.5, y: 1.6, z: -2.9 } },
    { id: "river-cove-landing", point: { x: -1.2, y: -0.16, z: 0.4 } },
    { id: "reading-approach", point: { x: -6.83, y: 1.35, z: 8.06 } },
    { id: "reading-first-tread", point: { x: -7.31, y: 1.575, z: 8.06 } },
    { id: "reading-terrace", point: { x: -7.31, y: 2.7, z: 3.26 } },
    { id: "bridge-west", point: { x: -5.87, y: 2.7, z: 2.3 } },
    { id: "bridge-deck", point: { x: -2.1, y: 2.7, z: 2.4 } },
    { id: "ember-takeoff", point: { x: 1.065, y: 3.8, z: -5.4 } },
    { id: "eastern-first-takeoff", point: { x: 1.065, y: 4.6, z: -7.8 } },
    { id: "eastern-second-takeoff", point: { x: -0.335, y: 5.4, z: -9.1 } },
    { id: "eastern-third-takeoff", point: { x: -1.785, y: 6.25, z: -10.25 } },
    { id: "eastern-fourth-takeoff", point: { x: -3.335, y: 7.15, z: -10.95 } },
    { id: "summit-east-rear", point: { x: -3.5, y: 8, z: -9.985 } },
    { id: "summit-east-front", point: { x: -3.95, y: 8, z: -6.25 } },
    { id: "moon-takeoff", point: { x: -7.285, y: 4.2, z: -2.3 } },
    // The nominal first western crown is occluded by this taller waterfall cap.
    { id: "western-cap-landing", point: { x: -8.635, y: 5.4, z: -4.6 } },
    { id: "western-cap-takeoff", point: { x: -8.635, y: 5.4, z: -5.765 } },
    { id: "western-second-landing", point: { x: -9.485, y: 5.7, z: -5.985 } },
    { id: "western-second-takeoff", point: { x: -11.415, y: 5.7, z: -6.75 } },
    { id: "western-third-landing", point: { x: -10.115, y: 6.45, z: -7.435 } },
    { id: "western-third-takeoff", point: { x: -10.115, y: 6.45, z: -9.065 } },
    { id: "western-fourth-landing", point: { x: -8.715, y: 7.2, z: -8.785 } },
    { id: "western-fourth-takeoff", point: { x: -8.715, y: 7.2, z: -10.315 } },
    { id: "summit-west-rear", point: { x: -7.5, y: 8, z: -9.985 } },
    { id: "summit-west-front", point: { x: -6.8, y: 8, z: -6.3 } },
  ],
  edges: [
    ...walkBoth("portal-approach", "tide-entry-south"),
    ...walkBoth("tide-entry-south", "tide-tread-0"),
    ...walkBoth("tide-entry-north", "tide-tread-0"),
    ...Array.from({ length: tide.count - 1 }, (_, index) =>
      walkBoth(`tide-tread-${index}`, `tide-tread-${index + 1}`)).flat(),
    ...walkBoth("tide-tread-5", "tide-terrace"),
    ...walkBoth("tide-tread-3", "tide-fourth-north"),
    ...jumpBoth("monument", "tide-fourth-north"),
    ...jumpBoth("monument", "monument-west"),
    ...walkBoth("river-south", "tide-dry-approach"),
    ...walkBoth("tide-dry-approach", "tide-tread-0"),
    ...walkBoth("river-south", "monument-west"),
    ...walkBoth("monument-west", "river-turn"),
    ...walkBoth("river-turn", "underpass-south"),
    ...walkBoth("underpass-south", "underpass-north"),
    ...jumpBoth("underpass-north", "cove-first-south"),
    ...walkBoth("cove-first-south", "cove-first"),
    ...jumpBoth("cove-first", "cove-second"),
    ...walkBoth("river-cove-landing", "underpass-north"),
    ...jumpBoth("cove-first-south", "river-cove-landing"),
    ...jumpBoth("cove-second", "river-cove-landing"),
    ...walkBoth("tide-terrace", "reading-approach"),
    ...walkBoth("reading-approach", "reading-first-tread"),
    ...walkBoth("reading-first-tread", "reading-terrace"),
    ...walkBoth("reading-terrace", "bridge-west"),
    ...walkBoth("bridge-west", "bridge-deck"),
    ...jumpBoth("ember-takeoff", "eastern-first-takeoff"),
    ...jumpBoth("eastern-first-takeoff", "eastern-second-takeoff"),
    ...jumpBoth("eastern-second-takeoff", "eastern-third-takeoff"),
    ...jumpBoth("eastern-third-takeoff", "eastern-fourth-takeoff"),
    ...jumpBoth("eastern-fourth-takeoff", "summit-east-rear"),
    ...walkBoth("summit-east-rear", "summit-east-front"),
    ...jumpBoth("moon-takeoff", "western-cap-landing"),
    ...walkBoth("western-cap-landing", "western-cap-takeoff"),
    ...jumpBoth("western-cap-takeoff", "western-second-landing"),
    ...walkBoth("western-second-landing", "western-second-takeoff"),
    ...jumpBoth("western-second-takeoff", "western-third-landing"),
    ...walkBoth("western-third-landing", "western-third-takeoff"),
    ...jumpBoth("western-third-takeoff", "western-fourth-landing"),
    ...walkBoth("western-fourth-landing", "western-fourth-takeoff"),
    ...jumpBoth("western-fourth-takeoff", "summit-west-rear"),
    ...walkBoth("summit-west-rear", "summit-west-front"),
    ...walkBoth("summit-west-rear", "summit-east-rear"),
    ...walkBoth("summit-west-front", "summit-east-front"),
  ],
};

// Bidirectional authoring shorthand still emits independently validated
// directed edges: a safe descent does not imply that the ascent is safe.
function walkBoth(from: string, to: string): NavigationRouteGraphDefinition["edges"] {
  return [{ from, to, kind: "walk" }, { from: to, to: from, kind: "walk" }];
}

function jumpBoth(from: string, to: string): NavigationRouteGraphDefinition["edges"] {
  return [{ from, to, kind: "jump" }, { from: to, to: from, kind: "jump" }];
}
