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
import { aspects, mythKeyFor, natalKeys, planets, transitingKeys, transitTiming } from "../src/data/bodies.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) => JSON.parse(await readFile(join(repoRoot, name), "utf8"));

/** Every descKey a mode can build, by running the real rule builders rather than
 *  restating what they do.
 *
 *  The chooser holds sets now, so this no longer has to sweep combinations of
 *  controls: both builders are monotone in the bodies they are given - adding a
 *  body only ever adds rules - so every selection's keys are a subset of the
 *  keys the full sets produce, in both link modes. The orb is still swept, since
 *  buildSkyRules drops aspects a pair cannot reach and how many depends on how
 *  wide the orb is. */
function reachableKeys(build){
  const keys = new Set();
  const aspectKeys = aspects.map(a => a[0]);
  for (const orb of [1, 8, 30]){
    for (const mode of ["directed", "involving"]){
      const rules = build({
        mode, transitBodies: transitingKeys, natalBodies: natalKeys,
        involvingBodies: natalKeys, bodies: natalKeys,
        aspects: aspectKeys, orb
      });
      for (const r of rules) keys.add(`${r.transit}-${r.aspect}-${r.natal}`);
    }
  }
  return keys;
}

const personalKeys = () => reachableKeys(buildCandidateRules);
const worldKeys = () => reachableKeys(buildSkyRules);
const allKeys = () => new Set([...personalKeys(), ...worldKeys()]);

test("every transit the scan can produce has a description", async () => {
  const descriptions = await readJson("aspects.json");
  const missing = [...allKeys()].filter(k => !descriptions[k]);
  assert.deepEqual(missing, [], `bars would open with an empty tooltip: ${missing.join(", ")}`);
});

test("no description is unreachable", async () => {
  const descriptions = await readJson("aspects.json");
  const reachable = allKeys();
  const dead = Object.keys(descriptions).filter(k => !reachable.has(k));
  assert.deepEqual(dead, [], `prose no scan can reach: ${dead.join(", ")}`);
});

test("every transit the scan can produce has a myth", async () => {
  const myths = await readJson("myths.json");
  const missing = [...allKeys()]
    .map(k => { const [t, , n] = k.split("-"); return mythKeyFor(t, n); })
    .filter(k => !myths[k]);
  assert.deepEqual([...new Set(missing)], [], "a bar would offer no Mythologically toggle");
});

test("every sky-to-sky aspect has a world reading", async () => {
  const world = await readJson("world.json");
  const missing = [...worldKeys()].filter(k => !world[k]);
  assert.deepEqual(missing, [], `world bars would open with an empty tooltip: ${missing.join(", ")}`);
});

test("no world reading is unreachable", async () => {
  const world = await readJson("world.json");
  const reachable = worldKeys();
  const dead = Object.keys(world).filter(k => !reachable.has(k));
  assert.deepEqual(dead, [], `world prose no sky scan can reach: ${dead.join(", ")}`);
});

test("world readings never address a person", async () => {
  // Two bodies meeting in the sky is nobody's transit. Second person or the word
  // "natal" here means a natal entry has been copied across.
  for (const [key, text] of Object.entries(await readJson("world.json"))){
    assert.doesNotMatch(text, /\b(you|your|yours|natal)\b/i, `world.json ${key} is written as a personal transit`);
  }
});

test("every transiting body says how long it takes and whether it repeats", () => {
  // The two angles are only ever natal targets, so they are the entries with no
  // timing note: there is nothing at either point to move.
  const angles = ["mc", "asc"];
  const transiting = planets.map(p => p[0]).filter(k => !angles.includes(k));
  const missing = transiting.filter(k => !transitTiming[k]);
  assert.deepEqual(missing, []);
  for (const k of angles){
    assert.ok(!transitTiming[k], `${k} never transits, so it needs no timing note`);
  }
});

test("no entry is truncated or padded", async () => {
  // Words that are never proper nouns, so one arriving straight after a
  // lowercase word means a sentence boundary was lost - which is how appending
  // to the seven entries that stopped mid-thought first went wrong.
  const runOn = /[a-z]{3} (?:What|Every|Nothing|Their|It|This|The|Read|Where|Either|Together) [a-z]/;
  // World readings run shorter on purpose - a few hours of Moon square Mercury
  // does not warrant the paragraph that Saturn conjunct Pluto does.
  const floor = { "aspects.json": 40, "myths.json": 40, "world.json": 18 };
  for (const name of ["aspects.json", "myths.json", "world.json"]){
    for (const [key, text] of Object.entries(await readJson(name))){
      assert.equal(text, text.trim(), `${name} ${key} has stray whitespace`);
      assert.match(text, /[.!?]$/, `${name} ${key} stops mid-thought`);
      assert.ok(text.split(/\s+/).length >= floor[name], `${name} ${key} is too short to read as finished`);
      assert.doesNotMatch(text, runOn, `${name} ${key} runs two sentences together`);
    }
  }
});
