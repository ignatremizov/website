/** Meter-scale layout shared by the terrain, inhabitants, ritual, and art export. */
export interface FallsTerrainBlock {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  top: number;
  bottom?: number;
  kind?: "terrace" | "step" | "bridge" | "landing" | "pool";
}

export const fallsFoundationRadius = 18;

export const fallsLandmarks = {
  cave: { x: -5.5, z: -6.5, height: 7.2, floor: 2.4 },
  // Separate the complete rock mass, not just its proxy: the western slit
  // needs room for a 0.8 m-wide player to turn onto the escape apron.
  westernWaterfall: { x: -10.65, z: -4.0, height: 4.6 },
  basin: {
    x: -5.5, z: -5.05, width: 4.45, depth: 2.4,
    floor: 2.0, water: 2.55, rim: 2.63, rimWidth: 0.36,
    // The open lip also keeps the tall front corners outside the first
    // submerged tread's approach, until the player reaches the second tread.
    bankDepth: 0.4, spillWidth: 3.35,
  },
  chest: { x: -5.5, y: 2.63, z: -8.65 },
  bridge: { x: -2.1, y: 2.7, z: 2.4 },
  cache: { x: 9.15, y: 1.05, z: 6.3 },
  sockets: {
    moon: { x: -9.3, y: 4.2, z: -1.75 },
    tide: { x: -5.4, y: 1.35, z: 7.2 },
    ember: { x: 2.6, y: 3.8, z: -4.6 },
  },
  npcs: {
    archivist: { x: -8.7, y: 2.7, z: 2.1 },
    keeper: { x: 6.1, y: 2.7, z: 1.2 },
    tinkerer: { x: 7.5, y: 3.8, z: -4.6 },
  },
  monument: { x: 2.05, z: 5.15 },
} as const;

export const fallsTerrainBlocks: readonly FallsTerrainBlock[] = [
  { id: "crystal-garden", x: 8.0, z: 6.6, width: 7.2, depth: 5.5, top: 1.05 },
  { id: "tide-garden", x: -6.5, z: 6.7, width: 5.4, depth: 4.4, top: 1.35 },
  { id: "reading-terrace", x: -8.65, z: 2.2, width: 5.3, depth: 4.8, top: 2.7 },
  { id: "keeper-terrace", x: 5.6, z: 0.9, width: 6.0, depth: 5.8, top: 2.7 },
  // Extend only the west bank to catch the relocated spring. The eastern
  // edge, socket and runnel outlet retain their existing positions.
  { id: "moon-shrine", x: -9.575, z: -2.3, width: 4.75, depth: 3.8, top: 4.2 },
  { id: "ember-overlook", x: 2.6, z: -4.8, width: 4.8, depth: 4.4, top: 3.8 },
  // These two upper terraces already meet at x=5. An extra bridge across
  // that seam duplicates their paving and causes the Tinkerer's moss to flicker.
  { id: "workshop-nook", x: 7.3, z: -4.4, width: 4.6, depth: 4.0, top: 3.8 },
  // A thin bridge has no full-height box underneath it. The lower river route
  // remains physically separate from the deck and its two bank-side abutments.
  { id: "gorge-bridge", x: -2.1, z: 2.4, width: 9.5, depth: 2.2, top: 2.7, bottom: 2.37, kind: "bridge" },
  { id: "moon-approach", x: -9.4, z: -0.15, width: 2.6, depth: 1.6, top: 3.45, kind: "landing" },
  { id: "cove-first-step", x: -1.7, z: -1.8, width: 1.9, depth: 1.8, top: 0.75, kind: "landing" },
  { id: "cove-second-step", x: -3.5, z: -2.9, width: 2.25, depth: 1.75, top: 1.6, kind: "landing" },
  // The physical bed is below the water. Separate banks frame a real recess
  // while the northern bank still joins the cave floor without a crevice.
  { id: "cove-basin", ...fallsLandmarks.basin, top: fallsLandmarks.basin.floor, kind: "pool" },
  ...createFallsPoolBanks(),
  // Approach along the Moon shelf's eastern face, then turn northwest onto
  // a broad apron just below the pool rim. The old northern approach ran
  // inside the western waterfall's AABB (x <= -8, z >= -5.85): adjacency of
  // its stones did not provide player clearance. Keep the usable turn south
  // of the central pillar's front (z=-5.85) and north of the shelf (z=-4.2).
  { id: "cove-west-escape-1", x: -6.6, z: -2.7, width: 1.8, depth: 1.4, top: 0.8, kind: "landing" },
  { id: "cove-west-escape-2", x: -6.7, z: -3.6, width: 1.8, depth: 1.4, top: 1.6, kind: "landing" },
  { id: "cove-west-escape-3", x: -7.75, z: -5.1, width: 2.4, depth: 2.0, top: 2.4, kind: "landing" },
  { id: "western-crown-1", x: -10.6, z: -4.9, width: 2.0, depth: 1.8, top: 4.95, kind: "landing" },
  { id: "western-crown-2", x: -10.45, z: -6.75, width: 2.1, depth: 1.7, top: 5.7, kind: "landing" },
  { id: "western-crown-3", x: -9.2, z: -8.25, width: 2.0, depth: 1.8, top: 6.45, kind: "landing" },
  { id: "western-crown-4", x: -7.85, z: -9.55, width: 1.9, depth: 1.7, top: 7.2, kind: "landing" },
  { id: "eastern-crown-1", x: 0.25, z: -7.8, width: 1.8, depth: 1.7, top: 4.6, kind: "landing" },
  { id: "eastern-crown-2", x: -1.15, z: -9.1, width: 1.8, depth: 1.7, top: 5.4, kind: "landing" },
  { id: "eastern-crown-3", x: -2.6, z: -10.25, width: 1.8, depth: 1.7, top: 6.25, kind: "landing" },
  { id: "eastern-crown-4", x: -4.1, z: -10.95, width: 1.7, depth: 1.6, top: 7.15, kind: "landing" },
  // The rear nook catches falls 1.3 m below the front escape ledge: jump south
  // through the unchanged 0.95 m passage, then jump back to the pool or Moon.
  // Edge-to-edge solid blocks leave no floating lid or overlapping paving.
  { id: "cove-moon-pillar-footing", x: -8.375, z: -5.0, width: 2.45, depth: 1.7, top: 3.15, kind: "landing" },
  { id: "cove-moon-pillar-nook", x: -8.5, z: -6.6, width: 1.8, depth: 1.5, top: 1.85, kind: "landing" },
  // The northern slit is narrower than a player. Close it at the neighboring
  // crown's height rather than extending a low floor into an inescapable slot.
  { id: "cove-moon-pillar-north-infill", x: -7.9, z: -7.85, width: 0.6, depth: 1.0, top: 6.45, kind: "landing" },
];

function createFallsPoolBanks(): FallsTerrainBlock[] {
  const pool = fallsLandmarks.basin;
  const innerWidth = pool.width - pool.rimWidth * 2;
  const cornerWidth = (innerWidth - pool.spillWidth) / 2;
  const blocks: FallsTerrainBlock[] = [];
  for (const side of [-1, 1]) {
    blocks.push({
      id: `cove-pool-side-${side}`,
      x: pool.x + side * (pool.width - pool.rimWidth) / 2,
      z: pool.z, width: pool.rimWidth, depth: pool.depth,
      bottom: pool.floor, top: pool.rim, kind: "landing",
    }, {
      id: `cove-pool-front-${side}`,
      x: pool.x + side * (pool.spillWidth + cornerWidth) / 2,
      z: pool.z + (pool.depth - pool.bankDepth) / 2,
      width: cornerWidth, depth: pool.bankDepth,
      bottom: pool.floor, top: pool.rim, kind: "landing",
    });
  }
  blocks.push({
    id: "cove-pool-cave-bank", x: pool.x,
    z: pool.z - (pool.depth - pool.bankDepth) / 2,
    width: innerWidth, depth: pool.bankDepth,
    bottom: pool.floor, top: pool.rim, kind: "landing",
  }, {
    id: "cove-pool-spill-sill", x: pool.x,
    z: pool.z + (pool.depth - pool.bankDepth) / 2,
    width: pool.spillWidth, depth: pool.bankDepth,
    bottom: pool.floor, top: pool.water - 0.06, kind: "landing",
  });
  // Broad submerged treads give the shallow pool a walkable eastern exit.
  const tread = 0.64;
  for (let step = 0; step < 2; step += 1) {
    blocks.push({
      id: `cove-pool-exit-${step}`,
      x: pool.x + innerWidth / 2 - tread * (1.5 - step),
      // Leave a body-width channel behind the treads. The old 0.65 m gap
      // admitted a jumping player above the tread, then trapped the 0.8 m
      // body between opposing faces on descent and triggered snapshot recovery.
      z: pool.z + 0.6, width: tread + 0.004, depth: 0.9,
      bottom: pool.floor,
      top: pool.floor + (pool.rim - pool.floor) * (step + 1) / 3,
      kind: "step",
    });
  }
  return blocks;
}

/** Matches the inner water rectangle and its open southern spillway. */
export function isInsideFallsPool(x: number, z: number): boolean {
  const pool = fallsLandmarks.basin;
  const dx = Math.abs(x - pool.x);
  const dz = z - pool.z;
  const innerDepth = pool.depth / 2 - pool.bankDepth;
  return (
    dx < pool.width / 2 - pool.rimWidth &&
    dz > -innerDepth &&
    (dz < innerDepth ||
      (dx < pool.spillWidth / 2 && dz < pool.depth / 2 + 0.1))
  );
}

/** Feet below the elevated bed belong to the lower gorge, not this pool. */
export function isWadingInFallsPool(x: number, z: number, feet: number): boolean {
  return isInsideFallsPool(x, z) &&
    feet >= fallsLandmarks.basin.floor - 0.04 &&
    feet < fallsLandmarks.basin.water - 0.04;
}

/** Tall rear silhouettes leave the socket routes open in the foreground. */
export const fallsBackgroundPillars = [
  { x: 9.8, z: -8.8, width: 3.0, depth: 2.6, top: 9.6 },
  { x: 7.0, z: -10.45, width: 2.8, depth: 2.55, top: 11.3 },
  { x: 4.25, z: -11.4, width: 2.5, depth: 2.35, top: 9.2 },
  { x: 11.75, z: -5.55, width: 2.15, depth: 2.4, top: 7.3 },
  { x: 11.95, z: -1.95, width: 1.85, depth: 2.25, top: 5.8 },
] as const;

/** Small consistent risers form walking routes; larger rocks remain jump routes. */
export const fallsStairways = [
  { id: "garden-entry", x: 8.0, z: 11.9, dx: 0, dz: -1, length: 2.55, width: 2.5, from: 0, to: 1.05, count: 5 },
  { id: "tide-entry", x: -0.3, z: 7.1, dx: -1, dz: 0, length: 3.5, width: 2.4, from: 0, to: 1.35, count: 6 },
  { id: "reading-ascent", x: -8.0, z: 8.2, dx: 0, dz: -1, length: 3.6, width: 2.0, from: 1.35, to: 2.7, count: 6 },
  { id: "shrine-ascent", x: 5.6, z: 8.0, dx: 0, dz: -1, length: 4.2, width: 1.9, from: 1.05, to: 2.7, count: 7 },
  { id: "ember-ascent", x: 3.5, z: 0, dx: 0, dz: -1, length: 2.6, width: 2.15, from: 2.7, to: 3.8, count: 5 },
] as const;

export function forEachFallsTerrainBlock(
  visit: (block: FallsTerrainBlock, index: number) => void,
): void {
  fallsTerrainBlocks.forEach(visit);
  let index = fallsTerrainBlocks.length;
  for (const stairs of fallsStairways) {
    const tread = stairs.length / stairs.count;
    for (let step = 0; step < stairs.count; step += 1) {
      visit({
        id: `${stairs.id}-${step}`,
        x: stairs.x + stairs.dx * tread * (step + 0.5),
        z: stairs.z + stairs.dz * tread * (step + 0.5),
        width: stairs.dx === 0 ? stairs.width : tread + 0.025,
        depth: stairs.dz === 0 ? stairs.width : tread + 0.025,
        top: stairs.from + (stairs.to - stairs.from) * (step + 1) / stairs.count,
        kind: "step",
      }, index++);
    }
  }
}

// Precompute once for vegetation placement and NPC home-height validation. The
// shared player/prop physics still uses its registered colliders and surfaces.
const groundBlocks: FallsTerrainBlock[] = [];
forEachFallsTerrainBlock((block) => {
  if (block.kind !== "bridge") groundBlocks.push(block);
});

export function getFallsTerraceHeight(x: number, z: number): number {
  let height = 0;
  for (const block of groundBlocks) {
    if (
      Math.abs(x - block.x) <= block.width / 2 &&
      Math.abs(z - block.z) <= block.depth / 2
    ) {
      height = Math.max(height, block.top);
    }
  }
  return height;
}

/** Prevent a crystal below an elevated terrace from snapping through its floor. */
export function isAtFallsSocketHeight(crystalY: number, socketY: number): boolean {
  return crystalY >= socketY - 0.28 && crystalY <= socketY + 2.55;
}
