// The chooser's side of the app: a selection is a set of bodies, and what the
// two builders make of one. The dropdowns this replaced could only ever name a
// handful of groups, so most of what is asserted here was not expressible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { INGRESS, ingressAsCrossed, isIngressRow, angleKeys, aspectSymbol, bodyPresets, fmtZodiacDeg, ingressCuspDeg, ingressDescription, natalKeys, needsWorldLabel, normalizeBodies, order, ruleKey, rulePairing, sameBodies, signKeys, titleWithoutWorldSuffix, transitingKeys, worldTitleSuffix } from "../src/data/bodies.js";
import { presets } from "../src/data/presets.js";
import { buildCandidateRules, buildIngressRules, buildWorldRules, foldIngressRows } from "../src/core/transits.js";

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

test("a world pair is named once, in chart order, whichever order it was chosen in", () => {
  const forwards = keysOf(buildWorldRules({ bodies: ["mars", "venus"], aspects: ["trine"], orb: 1 }));
  const backwards = keysOf(buildWorldRules({ bodies: ["venus", "mars"], aspects: ["trine"], orb: 1 }));
  assert.deepEqual(forwards, ["venus-trine-mars"], "Venus comes before Mars in the chart, so it comes first here");
  assert.deepEqual(forwards, backwards);

  // One body is not a pair, and no body aspects itself.
  assert.deepEqual(buildWorldRules({ bodies: ["mars"], aspects: ["trine"], orb: 1 }), []);
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
    for (const [side, list] of [["transit", p.transit], ["natal", p.natal], ["world", p.world.bodies]]){
      assert.equal(normalizeBodies(list).length, list.length,
        `the ${side} set of "${p.label}" names a body that does not exist, or names one twice`);
    }
    assert.ok(p.transit.every(k => !angleKeys.includes(k)), `"${p.label}" has an angle transiting`);
    assert.ok(p.world.bodies.every(k => !angleKeys.includes(k)), `"${p.label}" has an angle in its world set`);
    assert.ok(p.world.bodies.length >= 2, `"${p.label}" cannot make a world transit out of one body`);
    assert.ok(p.transit.length > 0 && p.natal.length > 0, `"${p.label}" would draw nothing`);
  }
});

// A chart can now hold both kinds of row at once, so which question a rule came
// from has to travel on the rule: by the time one reaches the scan there is
// nothing else about it that says.
test("a rule carries the question it was built for", () => {
  const opts = { aspects: ["square"], orb: 1 };
  const personal = buildCandidateRules({ transitBodies: ["mars"], natalBodies: ["saturn"], ...opts });
  const involving = buildCandidateRules({ mode: "involving", involvingBodies: ["mars"], ...opts });
  const world = buildWorldRules({ bodies: ["mars", "saturn"], ...opts });

  assert.ok(personal.length > 0 && involving.length > 0 && world.length > 0);
  assert.ok(personal.every(r => r.scope === "personal"), "a natal contact is personal");
  assert.ok(involving.every(r => r.scope === "personal"), "and so is one asked about the other way round");
  assert.ok(world.every(r => r.scope === "world"), "a world transit is not");
});

// The two rules below are the same three words. The row key is what keeps the
// followed one from lighting both.
test("the same pairing as a world transit and in a chart are different rows", () => {
  const world = buildWorldRules({ bodies: ["mars", "saturn"], aspects: ["square"], orb: 1 })[0];
  const natal = buildCandidateRules({
    transitBodies: ["mars"], natalBodies: ["saturn"], aspects: ["square"], orb: 1
  })[0];

  assert.equal(`${world.transit}-${world.aspect}-${world.natal}`, `${natal.transit}-${natal.aspect}-${natal.natal}`,
    "the pairing the prose is filed under is the same for both");
  assert.notEqual(ruleKey(world), ruleKey(natal), "but the row they name is not");
  assert.equal(ruleKey({ ...natal, scope: undefined }), ruleKey(natal),
    "an unstamped rule is a personal one, so a followed row survives the change");
  assert.equal(ruleKey(null), "");
});

// The label is the app naming one of its own rows. A copied title is read
// somewhere else, where there is no other row to be told apart from.
test("a copied popup title carries the pairing without the world label", () => {
  assert.equal(titleWithoutWorldSuffix(`Mercury ☍ Saturn${worldTitleSuffix}`), "Mercury ☍ Saturn",
    "the separator goes with the words it introduces");
  assert.equal(titleWithoutWorldSuffix("Mars □ Saturn"), "Mars □ Saturn",
    "a natal contact never carried the label and is copied whole");
  assert.equal(titleWithoutWorldSuffix(`Mercury ☍ Saturn${worldTitleSuffix} (exact)`),
    `Mercury ☍ Saturn${worldTitleSuffix} (exact)`,
    "only the label at the end is the label - the same words mid-title are someone's text");
  assert.equal(titleWithoutWorldSuffix(""), "");
  assert.equal(titleWithoutWorldSuffix(null), "");
});

test("a longitude is written the way an astrologer reads it", () => {
  assert.equal(fmtZodiacDeg(0), "0°00′ Aries");
  assert.equal(fmtZodiacDeg(344.05), "14°03′ Pisces");
  assert.equal(fmtZodiacDeg(254.5), "14°30′ Sagittarius");
  assert.equal(fmtZodiacDeg(-16), "14°00′ Pisces", "wrapped like every other angle");
  // Rounded to the minute before the sign is read off, so the last seconds of
  // a sign are the first minute of the next rather than a thirtieth degree.
  assert.equal(fmtZodiacDeg(29.9999), "0°00′ Taurus");
  assert.equal(fmtZodiacDeg(359.9999), "0°00′ Aries");
  assert.equal(fmtZodiacDeg(NaN), "");
});

test("an ingress row is named for the sign being entered, whichever way the body goes", () => {
  assert.equal(ingressCuspDeg("sun", "aries"), 0);
  assert.equal(ingressCuspDeg("jupiter", "gemini"), 60);
  assert.equal(ingressCuspDeg("jupiter", "pisces"), 330);
  // The mean node only ever moves backward, so it enters a sign over the far
  // cusp: into Pisces at 0° Aries, into Aries at 0° Taurus.
  assert.equal(ingressCuspDeg("node", "pisces"), 0);
  assert.equal(ingressCuspDeg("node", "aries"), 30);
  assert.equal(ingressCuspDeg("sun", "sun"), null, "a body is not a sign");

  assert.equal(ingressDescription({ transit: "jupiter", natal: "gemini" }), "Jupiter crosses out of Taurus and into Gemini.");
  assert.match(ingressDescription({ transit: "node", natal: "pisces" }), /^The mean node crosses backward out of Aries and into Pisces\./);
  assert.match(ingressDescription({ transit: "jupiter", natal: "taurus" }, true), /^Jupiter, retrograde, slips back out of Gemini and into Taurus\./);

  // A crossing back is named for where the body ends up, so the marker and
  // the card agree with the sky rather than with the rule that found them.
  const rule = { transit: "jupiter", aspect: INGRESS, natal: "gemini", orb: 1, scope: "world" };
  assert.deepEqual(ingressAsCrossed(rule, true), { rule, back: false });
  assert.deepEqual(ingressAsCrossed(rule, false), { rule: { ...rule, natal: "taurus" }, back: true });
  const node = { transit: "node", aspect: INGRESS, natal: "pisces", orb: 1, scope: "world" };
  assert.equal(ingressAsCrossed(node, false).rule.natal, "aries", "the node falls back the other way");
});

test("sign changes are one rule per body per sign, riding with the world transits", () => {
  const rules = buildIngressRules({ bodies: ["jupiter", "mc", "asc", "node"], orb: 1 });
  assert.equal(rules.length, 24, "twelve signs for each of the two bodies, and none for the angles");
  assert.ok(rules.every(r => r.aspect === INGRESS && r.scope === "world" && r.orb === 1));
  assert.deepEqual(rules.filter(r => r.transit === "jupiter").map(r => r.natal), signKeys);
  assert.equal(buildIngressRules({ bodies: [], orb: 1 }).length, 0);
});

test("an ingress row names its own kind and carries no world label", () => {
  const ingress = { transit: "jupiter", aspect: INGRESS, natal: "gemini", scope: "world" };
  assert.equal(aspectSymbol(INGRESS), "→");
  assert.equal(rulePairing(ingress), "Jupiter → Gemini");
  assert.equal(rulePairing(ingress, { glyphs: true }), "♃ → ♊");
  assert.equal(needsWorldLabel(ingress), false, "nothing in a birth chart is called Gemini");
  assert.equal(needsWorldLabel({ transit: "mars", aspect: "square", natal: "saturn", scope: "world" }), true);
  assert.equal(needsWorldLabel({ transit: "mars", aspect: "square", natal: "saturn", scope: "personal" }), false);
  assert.equal(rulePairing({ transit: "saturn", aspect: "square", natal: "asc" }), "Saturn □ Asc");
  assert.equal(ruleKey(ingress), "world-jupiter-ingress-gemini", "a row like any other on the axis");
});

test("every sign change is folded onto one row that remembers each window's rule", () => {
  const natal = { transit: "saturn", aspect: "square", natal: "sun", orb: 1, scope: "personal" };
  const jup = { transit: "jupiter", aspect: INGRESS, natal: "gemini", orb: 1, scope: "world" };
  const sun = { transit: "sun", aspect: INGRESS, natal: "aries", orb: 1, scope: "world" };
  const w = (start) => ({ start, end: start + 10, exacts: [start + 5], startClipped: false, endClipped: false, peakOrb: 0 });
  const { rules, events } = foldIngressRows([jup, natal, sun], [[w(300)], [w(100)], [w(200), w(400)]]);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], natal, "a natal contact keeps its own row, in its place");
  assert.ok(isIngressRow(rules[1]));
  assert.equal(rules[1].scope, "world");
  assert.deepEqual(events[1].map(e => e.start), [200, 300, 400], "the strip is in date order across bodies");
  assert.deepEqual(events[1].map(e => e.rule.transit), ["sun", "jupiter", "sun"]);
  assert.equal(events[0][0].rule, undefined, "only the strip's windows carry a rule");

  const none = foldIngressRows([natal], [[w(1)]]);
  assert.equal(none.rules.length, 1, "no strip when there is nothing to put on it");
  assert.equal(isIngressRow(natal), false);
});
