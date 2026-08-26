// Bundles src/ into hashed files under dist/, which is what gets deployed.
// Development still runs straight from the repo root with no build: index.html
// loads src/app.js as native ESM and the worker is its sibling source file.
//
// There are two entry points, the page and the transit worker, and they share
// the ephemeris. esbuild's code splitting puts it in one chunk both import, so
// it is downloaded once rather than bundled into each.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, rm, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// Fetched at runtime by page-relative URL, so they sit beside index.html.
const ASSETS = ["aspects.json", "myths.json", "apple-touch-icon.png"];

// api-key.js is gitignored, so CI has no copy. It can still prove everything
// bundles; ALLOW_MISSING_API_KEY says the output is a check, not a deployable.
let keyPlugin = [];
try {
  await access(join(root, "api-key.js"));
} catch {
  if (!process.env.ALLOW_MISSING_API_KEY){
    throw new Error("api-key.js is missing. Set ALLOW_MISSING_API_KEY=1 to build anyway; the result will not work.");
  }
  console.warn("api-key.js missing: bundling a placeholder, output is NOT deployable.");
  keyPlugin = [{
    name: "placeholder-api-key",
    setup(b){
      b.onResolve({ filter: /api-key\.js$/ }, () => ({ path: "api-key", namespace: "placeholder" }));
      b.onLoad({ filter: /.*/, namespace: "placeholder" }, () => ({
        contents: 'export const awsApiKey = "";', loader: "js"
      }));
    }
  }];
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const result = await build({
  entryPoints: { app: join(root, "src/app.js"), worker: join(root, "src/core/worker.js") },
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  metafile: true,
  outdir: dist,
  entryNames: "[name].[hash]",
  chunkNames: "chunk.[hash]",
  absWorkingDir: root,
  plugins: keyPlugin
});

const entryFor = (source) => {
  const hits = Object.entries(result.metafile.outputs)
    .filter(([, out]) => out.entryPoint === source)
    .map(([path]) => basename(path));
  if (hits.length !== 1) throw new Error(`Expected one output for ${source}, got ${hits.length}`);
  return hits[0];
};

const workerName = entryFor("src/core/worker.js");
const appBuilt = entryFor("src/app.js");

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const outputs = new Map(result.outputFiles.map(f => [basename(f.path), f.contents]));

// core/worker-url.js names the worker as a sibling of whatever is running,
// which is true in src/ and true again here once the hashed name is written in.
let appSource = decoder.decode(outputs.get(appBuilt));
const occurrences = appSource.split('"worker.js"').length - 1;
if (occurrences !== 1){
  throw new Error(`Expected exactly one "worker.js" in the bundle to point at ${workerName}, found ${occurrences}`);
}
appSource = appSource.replace('"worker.js"', JSON.stringify(workerName));
const appBytes = encoder.encode(appSource);

// Rehashed because the substitution changed the bytes esbuild hashed. Nothing
// imports an entry point, so renaming this one breaks no reference.
const appName = `app.${createHash("sha256").update(appBytes).digest("hex").slice(0, 8)}.js`;
outputs.delete(appBuilt);
outputs.set(appName, appBytes);

for (const [name, contents] of outputs) await writeFile(join(dist, name), contents);

const html = await readFile(join(root, "index.html"), "utf8");
const marker = '<script type="module" src="src/app.js"></script>';
if (!html.includes(marker)) throw new Error(`index.html no longer contains ${marker}`);
await writeFile(join(dist, "index.html"),
  html.replace(marker, `<script type="module" src="${appName}"></script>`));

for (const asset of ASSETS) await copyFile(join(root, asset), join(dist, asset));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const [name, contents] of outputs) console.log(`dist/${name}`.padEnd(28) + kb(contents.byteLength));
console.log("dist/index.html".padEnd(28) + kb(Buffer.byteLength(html)));
for (const a of ASSETS) console.log(`dist/${a}`);
