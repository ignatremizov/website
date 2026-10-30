import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectLoadingBoundaries, collectChunkKeys, enforceBuildBudgets } from "../scripts/build-contracts.mjs";
import { measureBuild } from "../scripts/check-build.mjs";

function manifest() {
  return {
    "index.html": { file: "assets/index-shell123.js", isEntry: true, dynamicImports: ["src/game/PortfolioGame.ts"] },
    "src/game/PortfolioGame.ts": { file: "assets/PortfolioGame-game123.js", isDynamicEntry: true,
      imports: ["_three-vendor123.js", "_shared.js"], dynamicImports: ["src/game/math/MightymaticaZone.ts"] },
    "src/game/math/MightymaticaZone.ts": { file: "assets/MightymaticaZone-math123.js", isDynamicEntry: true,
      imports: ["src/game/PortfolioGame.ts", "_three-vendor123.js"] },
    "_three-vendor123.js": { file: "assets/three-vendor123.js" },
    "_shared.js": { file: "assets/shared-123.js", imports: ["index.html"] },
  };
}

test("loading gates allow shared shell dependencies without pulling the game into initial load", () => {
  const groups = inspectLoadingBoundaries(manifest());
  assert.deepEqual([...groups.shellKeys], ["index.html"]);
  assert.ok(groups.gameKeys.has("_three-vendor123.js"));
  assert.ok(!groups.gameKeys.has("src/game/math/MightymaticaZone.ts"));
});

test("an indirect vendor import or eager math import fails the build boundary", () => {
  const eager = manifest();
  eager["index.html"].imports = ["_accidental-helper"];
  eager["_accidental-helper"] = { file: "assets/helper-abc.js", imports: ["_three-vendor123.js"] };
  assert.throws(() => inspectLoadingBoundaries(eager), /Eager shell imports lazy runtime/);
  const math = manifest();
  math["src/game/PortfolioGame.ts"].imports.push("src/game/math/MightymaticaZone.ts");
  assert.throws(() => inspectLoadingBoundaries(math), /eagerly imports Mightymatica/);
});

test("missing dynamic entries, missing dependencies, and fixed lazy filenames fail closed", () => {
  const fixed = manifest();
  fixed["src/game/PortfolioGame.ts"].file = "assets/PortfolioGame.js";
  assert.throws(() => inspectLoadingBoundaries(fixed), /versioned filename/);
  const missing = manifest();
  delete missing["src/game/math/MightymaticaZone.ts"];
  assert.throws(() => inspectLoadingBoundaries(missing), /separate lazy entry/);
  const broken = manifest();
  broken["index.html"].imports = ["missing"];
  assert.throws(() => collectChunkKeys(broken, "index.html"), /Missing build chunk/);
});

test("shared dependency cycles terminate and chunk accounting deduplicates them", () => {
  const cyclic = manifest();
  cyclic["index.html"].imports = ["_shared.js"];
  assert.deepEqual([...collectChunkKeys(cyclic, "index.html")], ["index.html", "_shared.js"]);
  assert.doesNotThrow(() => inspectLoadingBoundaries(cyclic));
});

test("compressed budgets are enforced, not merely printed, and missing metrics cannot pass", () => {
  const passing = { shellTransferBytes: 900_000, firstPlayableJsGzipBytes: 400_000, mathTransferBytes: 400_000 };
  assert.doesNotThrow(() => enforceBuildBudgets(passing));
  for (const [name, value] of [["shellTransferBytes", 1_000_000], ["firstPlayableJsGzipBytes", 500_000], ["mathTransferBytes", 1_500_000]]) {
    assert.throws(() => enforceBuildBudgets({ ...passing, [name]: value }), /Build budget failed/);
  }
  assert.throws(() => enforceBuildBudgets({ ...passing, firstPlayableJsGzipBytes: NaN }), /invalid measurement/);
  assert.throws(() => enforceBuildBudgets({}), /invalid measurement/);
});

test("a stable absolute social image stays in the shell estimate without being counted twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "portfolio-build-media-"));
  try {
    await mkdir(join(root, ".vite"), { recursive: true });
    await mkdir(join(root, "assets/mightymatica"), { recursive: true });
    await mkdir(join(root, "assets/social"), { recursive: true });
    const data = manifest();
    for (const chunk of Object.values(data)) {
      await writeFile(join(root, chunk.file), "export const fixture = true;");
    }
    await writeFile(join(root, ".vite/manifest.json"), JSON.stringify(data));
    await writeFile(join(root, "index.html"), "<title>Portfolio</title>");
    const baseline = await measureBuild(root);
    const social = Buffer.alloc(1_234, 0x5a);
    await writeFile(join(root, "assets/social/portfolio.jpg"), social);
    const html = '<meta property="og:image" content="https://ignatremizov.com/assets/social/portfolio.jpg">';
    await writeFile(join(root, "index.html"), html);
    const withSocial = await measureBuild(root);
    data["index.html"].assets = ["assets/social/portfolio.jpg"];
    await writeFile(join(root, ".vite/manifest.json"), JSON.stringify(data));
    assert.deepEqual(await measureBuild(root), withSocial);
    await writeFile(join(root, "assets/social/portfolio.jpg"), Buffer.alloc(2_468));
    const larger = await measureBuild(root);
    assert.equal(larger.shellTransferBytes - withSocial.shellTransferBytes, 1_234);
    assert.equal(larger.firstPlayableJsGzipBytes, baseline.firstPlayableJsGzipBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
