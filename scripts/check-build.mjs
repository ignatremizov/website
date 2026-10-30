import { readFile, readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { inspectLoadingBoundaries, chunkFiles, enforceBuildBudgets } from "./build-contracts.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function directoryFiles(root, relative) {
  const result = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await directoryFiles(root, name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

/** Conservative static transfer estimate; runtime timings still need a playtest. */
export async function measureBuild(outputDirectory = join(projectRoot, "dist")) {
  const root = resolve(outputDirectory);
  const manifest = JSON.parse(await readFile(join(root, ".vite", "manifest.json"), "utf8"));
  const { shellKeys, gameKeys, mathKeys } = inspectLoadingBoundaries(manifest);
  const shellFiles = chunkFiles(manifest, shellKeys);
  shellFiles.add("index.html");
  // The stable absolute social URL is served from public/ and therefore is not
  // emitted into Vite's imported-asset graph. Retain it in this deliberately
  // conservative estimate without double-counting a future manifest reference.
  const shellHtml = await readFile(join(root, "index.html"), "utf8");
  const socialImage = "assets/social/portfolio.jpg";
  if (shellHtml.includes(socialImage)) shellFiles.add(socialImage);
  const gameFiles = chunkFiles(manifest, gameKeys);
  const mathFiles = chunkFiles(manifest, mathKeys);
  // These media URLs are assembled at runtime and intentionally aren't imports.
  // Include all preserved math media rather than undercounting the lazy room.
  for (const file of await directoryFiles(root, "assets/mightymatica")) mathFiles.add(file);
  for (const file of shellFiles) { gameFiles.delete(file); mathFiles.delete(file); }
  for (const file of gameFiles) mathFiles.delete(file);

  const cache = new Map();
  async function measure(file) {
    if (file.startsWith("/") || file.split(/[\\/]/).includes("..")) throw new Error(`Invalid build asset path: ${file}`);
    if (!cache.has(file)) {
      const bytes = await readFile(join(root, file));
      const text = /\.(?:js|css|html|json|svg|txt|xml)$/.test(file);
      cache.set(file, text ? gzipSync(bytes, { level: 6 }).length : bytes.length);
    }
    return cache.get(file);
  }
  const sum = async files => (await Promise.all([...files].map(measure))).reduce((a, b) => a + b, 0);
  const result = {
    shellTransferBytes: await sum(shellFiles),
    firstPlayableJsGzipBytes: await sum([...gameFiles].filter(file => file.endsWith(".js"))),
    mathTransferBytes: await sum(mathFiles),
  };
  enforceBuildBudgets(result);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measurements = await measureBuild(process.argv[2]);
  console.log("Loading boundaries and compressed transfer budgets passed.");
  for (const [name, bytes] of Object.entries(measurements)) console.log(`${name}: ${(bytes / 1000).toFixed(2)} kB`);
}
