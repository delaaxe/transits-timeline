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

test("involving asks about a body rather than about a direction", () => {
  // The other question: everything Mars is part of, whichever end it lands on.
  // One list and no direction - the far end is the rest of the chart, so there
  // is no second set to ask for.
  const rules = buildCandidateRules({
    mode: "involving", involvingBodies: ["mars"], aspects: ["trine"], orb: 1
  });
  const keys = keysOf(rules);

  assert.ok(keys.includes("mars-trine-sun"), "Mars crossing the chart");
  assert.ok(keys.includes("sun-trine-mars"), "and the chart crossing natal Mars");
  assert.ok(keys.includes("mars-trine-mars"), "its own return included");
  assert.ok(keys.includes("mars-trine-mc") && keys.includes("mars-trine-asc"),
    "the angles are points Mars can reach");
  assert.ok(!keys.includes("mc-trine-mars") && !keys.includes("asc-trine-mars"),
    "but they are never the end that moves");
  assert.ok(keys.every(k => k.includes("mars")), "and nothing that is not about Mars");
  assert.equal(new Set(keys).size, keys.length, "no pair is generated twice");
});

test("involving several bodies is the union, and each pair is named once", () => {
  const keys = keysOf(buildCandidateRules({
    mode: "involving", involvingBodies: ["venus", "mars"], aspects: ["square"], orb: 1
  }));
  assert.equal(new Set(keys).size, keys.length, "Venus-Mars is reachable from both and appears once");
  assert.ok(keys.includes("venus-square-mars") && keys.includes("mars-square-venus"),
    "both directions of the pair, since either of them can be the one transiting");
  assert.ok(keys.includes("venus-square-saturn") && keys.includes("saturn-square-mars"));
  assert.ok(keys.every(k => k.includes("venus") || k.includes("mars")));
});

test("involving over every body is the whole chart, and no more than it", () => {
  // The two modes meet here: asking about everything is the same question as
  // asking for everything against everything.
  const opts = { aspects: ["conjunction", "square"], orb: 1 };
  const involving = keysOf(buildCandidateRules({ ...opts, mode: "involving", involvingBodies: natalKeys })).sort();
  const directed = keysOf(buildCandidateRules({ ...opts, transitBodies: transitingKeys, natalBodies: natalKeys })).sort();
  assert.deepEqual(involving, directed);
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
