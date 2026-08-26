import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function loadReference(){
  return JSON.parse(await readFile(join(repoRoot, "test", "reference.json"), "utf8"));
}

// Smallest separation between two angles, in degrees.
export function angleGap(a, b){
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
