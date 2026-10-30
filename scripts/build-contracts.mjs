/** Decimal bytes, matching the documented network budgets. */
export const buildBudgets = Object.freeze({
  shellTransferBytes: 1_000_000,
  firstPlayableJsGzipBytes: 500_000,
  mathTransferBytes: 1_500_000,
});

export function collectChunkKeys(manifest, start, includeDynamic = false) {
  const seen = new Set();
  const visit = key => {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== "string") throw new Error(`Missing build chunk: ${key}`);
    seen.add(key);
    for (const dependency of chunk.imports ?? []) visit(dependency);
    if (includeDynamic) for (const dependency of chunk.dynamicImports ?? []) visit(dependency);
  };
  visit(start);
  return seen;
}

/** Validate actual emitted dependencies, not just a source import spelling. */
export function inspectLoadingBoundaries(manifest) {
  const entry = "index.html";
  const game = "src/game/PortfolioGame.ts";
  const math = "src/game/math/MightymaticaZone.ts";
  if (!manifest[entry]?.isEntry) throw new Error("Missing HTML shell entry");
  for (const key of [game, math]) {
    if (!manifest[key]?.isDynamicEntry) throw new Error(`Expected a separate lazy entry: ${key}`);
    if (!/\/[^/]+-[\w-]+\.js$/.test(manifest[key].file)) {
      throw new Error(`Lazy entry must have a versioned filename: ${manifest[key].file}`);
    }
  }
  const three = Object.keys(manifest).filter(key => /(?:^|\/)three-[\w-]+\.js$/.test(manifest[key].file));
  if (three.length !== 1) throw new Error("Expected exactly one isolated Three.js vendor chunk");
  const shellKeys = collectChunkKeys(manifest, entry);
  const gameKeys = collectChunkKeys(manifest, game);
  const mathKeys = collectChunkKeys(manifest, math);
  for (const key of [game, math, ...three]) {
    if (shellKeys.has(key)) throw new Error(`Eager shell imports lazy runtime: ${key}`);
  }
  if (gameKeys.has(math)) throw new Error("First-playable game eagerly imports Mightymatica");
  if (!collectChunkKeys(manifest, entry, true).has(game)) throw new Error("Shell has no dynamic route to the game");
  if (!collectChunkKeys(manifest, game, true).has(math)) throw new Error("Game has no dynamic route to Mightymatica");
  return { shellKeys, gameKeys, mathKeys };
}

export function chunkFiles(manifest, keys, includeAssets = true) {
  const files = new Set();
  for (const key of keys) {
    const chunk = manifest[key];
    files.add(chunk.file);
    if (includeAssets) {
      for (const file of chunk.css ?? []) files.add(file);
      for (const file of chunk.assets ?? []) files.add(file);
    }
  }
  return files;
}

export function enforceBuildBudgets(measurements, budgets = buildBudgets) {
  const failures = [];
  for (const [name, limit] of Object.entries(budgets)) {
    const actual = measurements[name];
    if (!Number.isFinite(actual) || actual < 0) failures.push(`Missing or invalid measurement: ${name}`);
    else if (actual >= limit) failures.push(`${name}: ${(actual / 1000).toFixed(2)} kB must stay below ${limit / 1000} kB`);
  }
  if (failures.length) throw new Error(`Build budget failed:\n${failures.join("\n")}`);
}
