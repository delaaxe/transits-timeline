// Bundles src/ into one hashed file under dist/, which is what gets deployed.
// Development still runs straight from the repo root with no build: index.html
// loads src/app.js as native ESM.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, rm, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  entryPoints: [join(root, "src/app.js")],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  write: false,
  absWorkingDir: root,
  plugins: keyPlugin
});

const js = result.outputFiles[0].contents;
const hash = createHash("sha256").update(js).digest("hex").slice(0, 8);
const bundleName = `app.${hash}.js`;
await writeFile(join(dist, bundleName), js);

const html = await readFile(join(root, "index.html"), "utf8");
const marker = '<script type="module" src="src/app.js"></script>';
if (!html.includes(marker)) throw new Error(`index.html no longer contains ${marker}`);
await writeFile(join(dist, "index.html"),
  html.replace(marker, `<script type="module" src="${bundleName}"></script>`));

for (const asset of ASSETS) await copyFile(join(root, asset), join(dist, asset));

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`dist/${bundleName}  ${kb(js.byteLength)}`);
console.log(`dist/index.html     ${kb(Buffer.byteLength(html))}`);
for (const a of ASSETS) console.log(`dist/${a}`);
