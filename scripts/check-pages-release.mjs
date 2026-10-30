// Final read-only gate for the combined portfolio + MightyMatica Pages artifact.
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const maximumBytes = 1_000_000_000;
let bytes = 0;
let files = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Pages must not contain symlinks: ${path}`);
    if (entry.isDirectory()) await walk(path);
    else {
      if (/^(?:COMMUNICATION\.md|restoration-report\.json|\.env(?:\..*)?)$/i.test(entry.name)
        || /\.(?:swf|fla|xfl|jar|exe)$/i.test(entry.name)) {
        throw new Error(`Non-public or legacy executable file in Pages artifact: ${path}`);
      }
      bytes += (await stat(path)).size;
      files++;
    }
  }
}

const portfolio = await readFile(join(root, "index.html"), "utf8");
const collection = await readFile(join(root, "mightymatica/index.html"), "utf8");
if (!portfolio.includes("Systems Under Strange Skies")
  || !collection.includes("/mightymatica/assets/")) {
  throw new Error("The combined artifact must contain the portfolio and correctly based MightyMatica build.");
}
await walk(root);
if (bytes >= maximumBytes) throw new Error(`Combined Pages artifact exceeds the conservative 1 GB limit: ${bytes} bytes.`);
console.log(`Combined Pages release: ${files} files, ${bytes} bytes; both sites present, native-only, below 1 GB.`);
