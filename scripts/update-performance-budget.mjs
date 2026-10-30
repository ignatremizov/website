import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measureBuild } from "./check-build.mjs";

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
  socialJpeg: join(assetsDirectory, "social", "portfolio.jpg"),
};

const [
  shellJavaScript,
  shellCss,
  gameJavaScript,
  mathJavaScript,
  threeJavaScript,
  heroWebp,
  socialJpeg,
] = await Promise.all([
  measure(paths.shellJavaScript),
  measure(paths.shellCss),
  measure(paths.gameJavaScript),
  measure(paths.mathJavaScript),
  measure(paths.threeJavaScript),
  measure(paths.heroWebp),
  measure(paths.socialJpeg),
]);

const kilobytes = (bytes) => (bytes / 1000).toFixed(2);
const artifactLine = (label, measurement) =>
  `- ${label}: ${kilobytes(measurement.bytes)} kB minified / ${kilobytes(measurement.gzipBytes)} kB gzip.`;
const buildMeasurements = await measureBuild(join(projectRoot, "dist"));
const firstPlayableGzip = Math.round(buildMeasurements.firstPlayableJsGzipBytes / 1000);

const generatedBlock = [
  startMarker,
  artifactLine("Shell JavaScript", shellJavaScript),
  artifactLine("Shell CSS", shellCss),
  `- In-page hero: ${kilobytes(heroWebp.bytes)} kB WebP; stable social-preview JPEG: ${kilobytes(socialJpeg.bytes)} kB (metadata only).`,
  artifactLine("Lazy game code", gameJavaScript),
  artifactLine("Nested Mightymatica code", mathJavaScript),
  artifactLine("Lazy Three.js", threeJavaScript),
  `- First-playable JavaScript after the shell: about ${firstPlayableGzip} kB gzip.`,
  `- Conservative shell payload: ${kilobytes(buildMeasurements.shellTransferBytes)} kB (includes referenced preview/social images).`,
  `- Later Mightymatica payload: ${kilobytes(buildMeasurements.mathTransferBytes)} kB, including all preserved room media.`,
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
