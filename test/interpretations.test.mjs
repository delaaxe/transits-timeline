// The prose files against what the scan can actually ask for. Both drifted from
// the rules before: aspects.json carried 60 transiting-Midheaven keys no scan can
// produce, and was missing every transiting-Node conjunction except the return,
// so those bars opened with an empty tooltip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCandidateRules, buildSkyRules } from "../src/core/transits.js";
import { aspects, mythKeyFor, planets, transitGroups, natalGroups, transitTiming } from "../src/data/bodies.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) => JSON.parse(await readFile(join(repoRoot, name), "utf8"));

// Quincunx is a checkbox with no prose behind it, which is known and deliberately
// out of scope here; every other aspect must be covered.
const UNWRITTEN_ASPECTS = new Set(["quincunx"]);

/** Every descKey the UI can build, by running the real rule builders over every
 *  combination of controls rather than restating what they do. */
function reachableKeys(){
  const keys = new Set();
  const aspectKeys = aspects.map(a => a[0]);
  for (const [transitGroup] of transitGroups){
    for (const [natalGroup] of natalGroups){
      for (const flags of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]){
        const opts = {
          transitGroup, natalGroup, aspects: aspectKeys, orb: 1,
          includeMoon: !!(flags & 1), includeChiron: !!(flags & 2),
          includeNode: !!(flags & 4), includeMC: !!(flags & 8)
        };
        for (const r of buildCandidateRules(opts)) keys.add(`${r.transit}-${r.aspect}-${r.natal}`);
        for (const r of buildSkyRules(opts)) keys.add(`${r.transit}-${r.aspect}-${r.natal}`);
      }
    }
  }
  return keys;
}

test("every transit the scan can produce has a description", async () => {
  const descriptions = await readJson("aspects.json");
  const missing = [...reachableKeys()]
    .filter(k => !UNWRITTEN_ASPECTS.has(k.split("-")[1]))
    .filter(k => !descriptions[k]);
  assert.deepEqual(missing, [], `bars would open with an empty tooltip: ${missing.join(", ")}`);
});

test("no description is unreachable", async () => {
  const descriptions = await readJson("aspects.json");
  const reachable = reachableKeys();
  const dead = Object.keys(descriptions).filter(k => !reachable.has(k));
  assert.deepEqual(dead, [], `prose no scan can reach: ${dead.join(", ")}`);
});

test("every transit the scan can produce has a myth", async () => {
  const myths = await readJson("myths.json");
  const missing = [...reachableKeys()]
    .map(k => { const [t, , n] = k.split("-"); return mythKeyFor(t, n); })
    .filter(k => !myths[k]);
  assert.deepEqual([...new Set(missing)], [], "a bar would offer no Mythologically toggle");
});

test("every transiting body says how long it takes and whether it repeats", () => {
  // MC is only ever a natal target, so it is the one body with no timing note.
  const transiting = planets.map(p => p[0]).filter(k => k !== "mc");
  const missing = transiting.filter(k => !transitTiming[k]);
  assert.deepEqual(missing, []);
  assert.ok(!transitTiming.mc, "the Midheaven never transits, so it needs no timing note");
});

test("no entry is truncated or padded", async () => {
  // Words that are never proper nouns, so one arriving straight after a
  // lowercase word means a sentence boundary was lost - which is how appending
  // to the seven entries that stopped mid-thought first went wrong.
  const runOn = /[a-z]{3} (?:What|Every|Nothing|Their|It|This|The|Read|Where|Either|Together) [a-z]/;
  for (const name of ["aspects.json", "myths.json"]){
    for (const [key, text] of Object.entries(await readJson(name))){
      assert.equal(text, text.trim(), `${name} ${key} has stray whitespace`);
      assert.match(text, /[.!?]$/, `${name} ${key} stops mid-thought`);
      assert.ok(text.split(/\s+/).length >= 40, `${name} ${key} is too short to read as finished`);
      assert.doesNotMatch(text, runOn, `${name} ${key} runs two sentences together`);
    }
  }
});
