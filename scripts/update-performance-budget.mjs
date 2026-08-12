import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDirectory = join(projectRoot, "dist", "assets");
const budgetPath = join(projectRoot, "docs", "preproduction", "performance-budget.md");
const startMarker = "<!-- build-metrics:start -->";
const endMarker = "<!-- build-metrics:end -->";

const assetNames = await readdir(assetsDirectory);

function findAsset(label, pattern) {
  const matches = assetNames.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} artifact in dist/assets, found ${matches.length}: ${matches.join(", ") || "none"}`,
    );
  }
  return join(assetsDirectory, matches[0]);
}

async function measure(path) {
  const [metadata, contents] = await Promise.all([stat(path), readFile(path)]);
  return {
    bytes: metadata.size,
    gzipBytes: gzipSync(contents, { level: 6 }).length,
  };
}

const paths = {
  shellJavaScript: findAsset("shell JavaScript", /^index-[^.]+\.js$/),
  shellCss: findAsset("shell CSS", /^index-[^.]+\.css$/),
  gameJavaScript: findAsset(
    "lazy game JavaScript",
    /^PortfolioGame(?:-[^.]+)?\.js$/,
  ),
  mathJavaScript: findAsset(
    "lazy Mightymatica JavaScript",
    /^MightymaticaZone(?:-[^.]+)?\.js$/,
  ),
  threeJavaScript: findAsset("Three.js", /^three-[^.]+\.js$/),
  heroWebp: findAsset("hero WebP", /^field-arch-hero-[^.]+\.webp$/),
  heroJpeg: findAsset("hero JPEG", /^field-arch-hero-[^.]+\.jpg$/),
};

const [
  shellJavaScript,
  shellCss,
  gameJavaScript,
  mathJavaScript,
  threeJavaScript,
  heroWebp,
  heroJpeg,
] = await Promise.all([
  measure(paths.shellJavaScript),
  measure(paths.shellCss),
  measure(paths.gameJavaScript),
  measure(paths.mathJavaScript),
  measure(paths.threeJavaScript),
  measure(paths.heroWebp),
  measure(paths.heroJpeg),
]);

const kilobytes = (bytes) => (bytes / 1000).toFixed(2);
const artifactLine = (label, measurement) =>
  `- ${label}: ${kilobytes(measurement.bytes)} kB minified / ${kilobytes(measurement.gzipBytes)} kB gzip.`;
const firstPlayableGzip = Math.round(
  (gameJavaScript.gzipBytes + threeJavaScript.gzipBytes) / 1000,
);

const generatedBlock = [
  startMarker,
  artifactLine("Shell JavaScript", shellJavaScript),
  artifactLine("Shell CSS", shellCss),
  `- In-page hero: ${kilobytes(heroWebp.bytes)} kB WebP (the ${kilobytes(heroJpeg.bytes)} kB JPEG remains social metadata only).`,
  artifactLine("Lazy game code", gameJavaScript),
  artifactLine("Nested Mightymatica code", mathJavaScript),
  artifactLine("Lazy Three.js", threeJavaScript),
  `- First-playable JavaScript after the shell: about ${firstPlayableGzip} kB gzip.`,
  endMarker,
].join("\n");

const budget = await readFile(budgetPath, "utf8");
const markerPattern = new RegExp(
  `${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
);
if (!markerPattern.test(budget)) {
  throw new Error(`Could not find generated metric markers in ${budgetPath}`);
}

const updatedBudget = budget.replace(markerPattern, generatedBlock);
if (updatedBudget === budget) {
  console.log("Performance budget metrics are already current.");
} else {
  await writeFile(budgetPath, updatedBudget);
  console.log("Updated docs/preproduction/performance-budget.md from dist artifacts.");
}
