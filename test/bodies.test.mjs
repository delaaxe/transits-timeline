// The chooser's side of the app: a selection is a set of bodies, and what the
// two builders make of one. The dropdowns this replaced could only ever name a
// handful of groups, so most of what is asserted here was not expressible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { angleKeys, bodyPresets, natalKeys, normalizeBodies, order, sameBodies, transitingKeys } from "../src/data/bodies.js";
import { presets } from "../src/data/presets.js";
import { buildCandidateRules, buildSkyRules } from "../src/core/transits.js";

const keysOf = (rules) => rules.map(r => `${r.transit}-${r.aspect}-${r.natal}`);

test("a body list is read in chart order, without repeats or inventions", () => {
  assert.deepEqual(normalizeBodies(["pluto", "sun", "pluto", "moon"]), ["sun", "moon", "pluto"]);
  assert.deepEqual(normalizeBodies(["ceres", "sun"]), ["sun"], "a key no body answers to is dropped");
  assert.deepEqual(normalizeBodies([]), []);
  assert.deepEqual(normalizeBodies(null), []);

  assert.ok(sameBodies(["mars", "venus"], ["venus", "mars"]), "the order they were tapped in means nothing");
  assert.ok(!sameBodies(["mars"], ["mars", "venus"]));
});

test("both ends move independently, so any pair of sets is a query", () => {
  // The question the dropdowns could not ask: only these two bodies, in either
  // role, and nothing else in the chart.
  const rules = buildCandidateRules({
    transitBodies: ["venus", "mars"], natalBodies: ["venus", "mars"],
    aspects: ["square"], orb: 1
  });
  assert.deepEqual(keysOf(rules).sort(), [
    "mars-square-mars", "mars-square-venus", "venus-square-mars", "venus-square-venus"
  ], "every pairing of the two, its own return included");
});

test("either side adds the mirror of each pair and nothing twice", () => {
  const opts = { transitBodies: ["mars"], natalBodies: ["sun", "moon"], aspects: ["trine"], orb: 1 };

  assert.deepEqual(keysOf(buildCandidateRules(opts)).sort(),
    ["mars-trine-moon", "mars-trine-sun"],
    "directed reads left to right: this body, over those points");

  assert.deepEqual(keysOf(buildCandidateRules({ ...opts, link: "either" })).sort(),
    ["mars-trine-moon", "mars-trine-sun", "moon-trine-mars", "sun-trine-mars"],
    "either side also brings back what crosses the natal Mars");

  // The mirror of a pair that is already there is the same pair.
  const symmetric = { transitBodies: ["venus", "mars"], natalBodies: ["venus", "mars"], aspects: ["square"], orb: 1 };
  assert.deepEqual(
    keysOf(buildCandidateRules({ ...symmetric, link: "either" })).sort(),
    keysOf(buildCandidateRules(symmetric)).sort()
  );
});

test("the mean node is read by conjunction alone, on the side that moves", () => {
  const rules = buildCandidateRules({
    transitBodies: ["node"], natalBodies: ["node", "sun"],
    aspects: ["conjunction", "square", "opposition"], orb: 1
  });
  assert.deepEqual(keysOf(rules).sort(), ["node-conjunction-node", "node-conjunction-sun"]);

  // A natal node is a place like any other, and everything reaches it.
  const toNatalNode = buildCandidateRules({
    transitBodies: ["saturn"], natalBodies: ["node"],
    aspects: ["conjunction", "square", "opposition"], orb: 1
  });
  assert.equal(toNatalNode.length, 3);
});

test("a sky pair is named once, in chart order, whichever order it was chosen in", () => {
  const forwards = keysOf(buildSkyRules({ bodies: ["mars", "venus"], aspects: ["trine"], orb: 1 }));
  const backwards = keysOf(buildSkyRules({ bodies: ["venus", "mars"], aspects: ["trine"], orb: 1 }));
  assert.deepEqual(forwards, ["venus-trine-mars"], "Venus comes before Mars in the chart, so it comes first here");
  assert.deepEqual(forwards, backwards);

  // One body is not a pair, and no body aspects itself in the sky.
  assert.deepEqual(buildSkyRules({ bodies: ["mars"], aspects: ["trine"], orb: 1 }), []);
});

test("the sets each end can hold are the ones that make sense there", () => {
  assert.deepEqual(angleKeys, ["mc", "asc"]);
  assert.ok(angleKeys.every(k => !transitingKeys.includes(k)), "nothing at an angle can move");
  assert.ok(angleKeys.every(k => natalKeys.includes(k)), "but both can be aspected");
  assert.deepEqual(natalKeys, order);
});

test("every preset names bodies that exist, on ends that can hold them", () => {
  for (const [key, label, bodies] of bodyPresets){
    assert.ok(bodies.length > 0, `${key} selects nothing`);
    assert.deepEqual(normalizeBodies(bodies), normalizeBodies(bodies).filter(k => order.includes(k)),
      `${label} names something the app has no body for`);
    assert.equal(normalizeBodies(bodies).length, new Set(bodies).size, `${label} repeats a body`);
  }

  for (const p of presets){
    for (const [side, list] of [["transit", p.transit], ["natal", p.natal], ["sky", p.world.bodies]]){
      assert.equal(normalizeBodies(list).length, list.length,
        `the ${side} set of "${p.label}" names a body that does not exist, or names one twice`);
    }
    assert.ok(p.transit.every(k => !angleKeys.includes(k)), `"${p.label}" has an angle transiting`);
    assert.ok(p.world.bodies.every(k => !angleKeys.includes(k)), `"${p.label}" has an angle in the sky`);
    assert.ok(p.world.bodies.length >= 2, `"${p.label}" cannot make a sky aspect out of one body`);
    assert.ok(p.transit.length > 0 && p.natal.length > 0, `"${p.label}" would draw nothing`);
  }
});
