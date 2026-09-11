import test from "node:test";
import assert from "node:assert/strict";
import { closeness, scoreEvent, scoreRow } from "../src/core/significance.js";
import { aspectWeight, natalWeight, tierFor, transitWeight } from "../src/data/weights.js";
import { aspects, order, transitingKeys } from "../src/data/bodies.js";

// These pin orderings, not numbers. A test asserting pluto-square-sun scores
// 0.80 fails the first time a weight is tuned and teaches nobody anything;
// asserting it outranks mercury-sextile-neptune is the actual claim, and it
// survives calibration.

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1);

/** A window that goes exact once, unless told otherwise. */
const win = ({ peakOrb = 0, exacts = 1, fromDay = 10, toDay = 20 } = {}) => ({
  start: T0 + fromDay * DAY,
  end: T0 + toDay * DAY,
  exacts: Array.from({ length: exacts }, (_, i) => T0 + (fromDay + 1 + i) * DAY),
  startClipped: false,
  endClipped: false,
  peakOrb
});

const rule = (transit, aspect, natal, orb = 1) => ({ transit, aspect, natal, orb });
const score = (r, e = win(), opts = {}) => scoreEvent(r, e, { orb: 1, ...opts });

test("a slow body outranks a fast one over the same point", () => {
  assert.ok(
    score(rule("pluto", "conjunction", "sun")) > score(rule("moon", "conjunction", "sun")),
    "Pluto conjunct the Sun should outrank the Moon conjunct the Sun"
  );
  assert.ok(score(rule("saturn", "square", "moon")) > score(rule("mercury", "square", "moon")));
});

test("a personal point outranks a generational one", () => {
  assert.ok(
    score(rule("saturn", "square", "sun")) > score(rule("saturn", "square", "neptune")),
    "a transit to the Sun should outrank the same transit to natal Neptune"
  );
});

test("a hard aspect outranks a soft one between the same ends", () => {
  assert.ok(score(rule("saturn", "conjunction", "sun")) > score(rule("saturn", "opposition", "sun")));
  assert.ok(score(rule("saturn", "opposition", "sun")) > score(rule("saturn", "trine", "sun")));
  assert.ok(score(rule("saturn", "trine", "sun")) > score(rule("saturn", "sextile", "sun")));
});

test("a window that goes exact outranks one that only comes half way", () => {
  const r = rule("jupiter", "square", "venus");
  const exact = score(r, win({ peakOrb: 0, exacts: 1 }));
  const near = score(r, win({ peakOrb: 0.5, exacts: 0 }));
  assert.ok(exact > near, "exact should outrank a half-orb miss");
  // And a near miss still counts for something: the floor keeps a slow body
  // that never perfects from sorting below a fast one that did.
  const slowMiss = score(rule("pluto", "square", "sun"), win({ peakOrb: 1, exacts: 0 }));
  const fastHit = score(rule("moon", "square", "sun"), win({ peakOrb: 0, exacts: 1 }));
  assert.ok(slowMiss > fastHit, "a wide Pluto square should still outrank an exact Moon square");
});

test("closeness is 1 at exact, floored at the edge of orb, and monotonic", () => {
  assert.equal(closeness(0, 1), 1);
  assert.ok(closeness(1, 1) > 0, "a window at the edge of orb keeps a floor");
  assert.ok(closeness(0.25, 1) > closeness(0.5, 1));
  assert.ok(closeness(0.5, 1) > closeness(0.9, 1));
  // Beyond the orb it clamps rather than going negative.
  assert.equal(closeness(5, 1), closeness(1, 1));
  // A degree is a near miss at a 2-degree orb and a full miss at a 1-degree one.
  assert.ok(closeness(1, 2) > closeness(1, 1));
});

test("a three-pass window outranks a one-pass window, and only by a nudge", () => {
  const r = rule("saturn", "square", "sun");
  const once = score(r, win({ exacts: 1 }));
  const thrice = score(r, win({ exacts: 3 }));
  assert.ok(thrice > once, "a triple pass should outrank a single crossing");
  // Smaller than any of the table factors: three passes of a sextile must not
  // overtake one pass of a square.
  const square = score(rule("saturn", "square", "sun"), win({ exacts: 1 }));
  const sextileThrice = score(rule("saturn", "sextile", "sun"), win({ exacts: 3 }));
  assert.ok(square > sextileThrice, "the passes term should not overtake the aspect table");
});

test("a return outranks the same conjunction to a different point", () => {
  // Saturn meeting its own natal place, against Saturn meeting natal Jupiter:
  // the natal weights are equal, so only the return bonus separates them.
  assert.equal(natalWeight.saturn, natalWeight.jupiter);
  assert.ok(score(rule("saturn", "conjunction", "saturn")) > score(rule("saturn", "conjunction", "jupiter")));
});

test("the chart ruler lifts its own point and nothing else", () => {
  const r = rule("saturn", "square", "mercury");
  const plain = score(r);
  const ruling = score(r, win(), { chartRuler: "mercury" });
  assert.ok(ruling > plain, "a transit to the ruling planet should outrank the same transit when it does not rule");

  // Another planet ruling changes nothing for this row.
  assert.equal(score(r, win(), { chartRuler: "venus" }), plain);

  // A ruling Mercury clears the social planets and stays under the lights,
  // which is where the tradition puts it.
  const rulingMercury = score(rule("saturn", "square", "mercury"), win(), { chartRuler: "mercury" });
  assert.ok(rulingMercury > score(rule("saturn", "square", "jupiter")));
  assert.ok(rulingMercury < score(rule("saturn", "square", "sun")));
});

test("a score is unchanged by where the range sits around the window", () => {
  // The invariant that catches accidental duration-dependence: a window wholly
  // inside the range scores on what it is, not on how much room it was given.
  const r = rule("jupiter", "trine", "mars");
  const early = win({ fromDay: 2, toDay: 12 });
  const late = { ...win({ fromDay: 50, toDay: 60 }) };
  assert.equal(score(r, early), score(r, late));

  // And a longer window of the same contact scores the same: duration is
  // already implied by the transiting body, and counting it again would weight
  // the slow bodies twice.
  assert.equal(score(r, win({ fromDay: 10, toDay: 20 })), score(r, win({ fromDay: 10, toDay: 90 })));
});

test("a row scores as its best window, not the sum of them", () => {
  const r = rule("mars", "conjunction", "sun");
  const weak = win({ peakOrb: 0.9, exacts: 0, fromDay: 1, toDay: 3 });
  const strong = win({ peakOrb: 0, exacts: 1, fromDay: 40, toDay: 50 });
  assert.equal(scoreRow(r, [weak, strong], { orb: 1 }), scoreEvent(r, strong, { orb: 1 }));
  // Three weak windows must not add up past one strong one.
  assert.ok(scoreRow(r, [weak, weak, weak], { orb: 1 }) < scoreEvent(r, strong, { orb: 1 }));
  assert.equal(scoreRow(r, [], { orb: 1 }), 0);
});

test("world mode scores without a natal factor", () => {
  const opts = { mode: "world", orb: 1 };
  // Sun-Moon is the lunation; Mercury-Venus is a fast pair nobody writes about.
  const lunation = scoreEvent(rule("sun", "conjunction", "moon"), win(), opts);
  const fast = scoreEvent(rule("mercury", "sextile", "venus"), win(), opts);
  assert.ok(lunation > fast, "a lunation should outrank a Mercury-Venus sextile");

  // The slow pair is the generational one, whichever order the rule names them.
  const slow = scoreEvent(rule("saturn", "conjunction", "neptune"), win(), opts);
  assert.ok(slow > lunation, "Saturn conjunct Neptune should outrank a lunation");
  assert.equal(
    scoreEvent(rule("saturn", "conjunction", "neptune"), win(), opts),
    scoreEvent(rule("neptune", "conjunction", "saturn"), win(), opts),
    "a sky pair has no direction, so naming it either way round must score the same"
  );

  // The natal table must not be reachable here: natal Neptune is 0.35 and
  // natal Sun is 1.00, so if it were, Sun-anything would dominate the sky.
  const moonNeptune = scoreEvent(rule("moon", "conjunction", "neptune"), win(), opts);
  const sunMoon = scoreEvent(rule("sun", "conjunction", "moon"), win(), opts);
  assert.ok(moonNeptune > sunMoon, "Neptune should carry the pair it is in, not be discounted as a natal point");
});

test("the chart ruler is ignored in world mode", () => {
  const r = rule("sun", "conjunction", "mercury");
  const opts = { mode: "world", orb: 1 };
  assert.equal(
    scoreEvent(r, win(), opts),
    scoreEvent(r, win(), { ...opts, chartRuler: "mercury" }),
    "there is no natal chart in the sky, so nothing rules it"
  );
});

test("every body the app can put on either end has a weight", () => {
  // Coverage in both directions, the way the interpretation suite does it: a
  // body added to the chooser without a weight would silently score as the
  // fallback and sort somewhere arbitrary.
  for (const key of transitingKeys){
    assert.ok(transitWeight[key] > 0, `${key} can transit and has no transit weight`);
  }
  for (const key of order){
    assert.ok(natalWeight[key] > 0, `${key} can be a natal target and has no natal weight`);
  }
  for (const key of Object.keys(transitWeight)){
    assert.ok(transitingKeys.includes(key), `${key} has a transit weight but cannot transit`);
  }
  for (const key of Object.keys(natalWeight)){
    assert.ok(order.includes(key), `${key} has a natal weight but is not a point in the chart`);
  }
});

test("every aspect the app offers has a weight, and none is unreachable", () => {
  for (const [key] of aspects){
    assert.ok(aspectWeight[key] > 0, `${key} has no aspect weight`);
  }
  for (const key of Object.keys(aspectWeight)){
    assert.ok(aspects.some(a => a[0] === key), `${key} has a weight but is not an aspect`);
  }
});

test("the tables are ordered the way the comments claim", () => {
  // The transit table is meant to run slowest-first. If someone retunes a
  // number and breaks that, the ordering tests above may still pass by luck.
  const slowestFirst = ["pluto","neptune","uranus","saturn","jupiter","mars","sun","venus","mercury","moon"];
  for (let i = 1; i < slowestFirst.length; i++){
    assert.ok(
      transitWeight[slowestFirst[i - 1]] >= transitWeight[slowestFirst[i]],
      `${slowestFirst[i - 1]} should weigh at least as much as ${slowestFirst[i]}`
    );
  }
  // The lights top the natal table and the outer planets sit at the bottom.
  for (const generational of ["uranus", "neptune", "pluto"]){
    assert.ok(natalWeight.sun > natalWeight[generational]);
    assert.ok(natalWeight.moon > natalWeight[generational]);
  }
});

test("tiers are absolute cuts, in order, and cover every score", () => {
  assert.equal(tierFor(0.9), "major");
  assert.equal(tierFor(0.45), "major");
  assert.equal(tierFor(0.44), "strong");
  assert.equal(tierFor(0.2), "strong");
  assert.equal(tierFor(0.19), "notable");
  assert.equal(tierFor(0.08), "notable");
  assert.equal(tierFor(0.079), "minor");
  assert.equal(tierFor(0), "minor");
});
