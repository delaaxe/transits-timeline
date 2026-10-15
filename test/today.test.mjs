import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayRules, formatTodaySummary, summarizeToday, todayTransitBodies } from "../src/services/today.js";
import { INGRESS, isIngressRule, isPhaseRule } from "../src/data/bodies.js";
import { aspects, natalKeys } from "../src/data/bodies.js";

test("the day's reading moves every body but the Moon, over every natal point, in every aspect", () => {
  assert.ok(!todayTransitBodies.includes("moon"));
  assert.ok(!todayTransitBodies.includes("mc") && !todayTransitBodies.includes("asc"));
  const rules = buildTodayRules({ personal: true, orb: 1 });
  const personal = rules.filter(r => r.scope === "personal");
  const world = rules.filter(r => r.scope === "world" && !isIngressRule(r) && !isPhaseRule(r));
  // The Moon's sign changes are in, and so are its phases.
  assert.ok(rules.some(r => isIngressRule(r) && r.transit === "moon"));
  assert.ok(rules.some(r => isPhaseRule(r)));
  assert.ok(personal.every(r => r.transit !== "moon"));
  assert.ok(world.every(r => r.transit !== "moon" && r.natal !== "moon"));
  // The natal Moon is still there to be transited.
  assert.ok(personal.some(r => r.natal === "moon"));
  assert.deepEqual(new Set(personal.map(r => r.natal)), new Set(natalKeys));
  assert.deepEqual(new Set(personal.map(r => r.transit)), new Set(todayTransitBodies));
  // The node only conjoins; every other pair carries every aspect.
  const sunSun = personal.filter(r => r.transit === "sun" && r.natal === "sun").map(r => r.aspect);
  assert.deepEqual(sunSun, aspects.map(a => a[0]));
  assert.ok(rules.every(r => r.orb === 1));
});

test("world view scans only the sky", () => {
  const rules = buildTodayRules({ personal: false, orb: 2 });
  assert.ok(rules.length > 0);
  assert.ok(rules.every(r => r.scope === "world"));
  assert.ok(rules.some(r => isIngressRule(r)) && rules.some(r => isPhaseRule(r)));
});

test("the summary is one line per kind, in words and glyphs", () => {
  const venusUranus = { transit: "venus", aspect: "sextile", natal: "uranus", orb: 1, scope: "personal" };
  const marsSaturn = { transit: "mars", aspect: "trine", natal: "saturn", orb: 1, scope: "world" };
  assert.equal(
    formatTodaySummary({ personal: [venusUranus, { ...venusUranus, natal: "mc", aspect: "square" }], world: [marsSaturn] }),
    "- Transits: Venus ⚹ Uranus, Venus □ Mc\n- World transits: Mars △ Saturn"
  );
  assert.equal(formatTodaySummary({ personal: [], world: [] }), "- Transits: none\n- World transits: none");
  // No chart, no natal line.
  assert.equal(formatTodaySummary({ personal: null, world: [marsSaturn] }), "- World transits: Mars △ Saturn");
  // A phase leads, and sign changes close the world line.
  assert.equal(
    formatTodaySummary({ personal: null, world: [marsSaturn], ingresses: ["Moon → Scorpio"], phases: ["Full Moon in Aries"] }),
    "- Moon phase: Full Moon in Aries\n- World transits: Mars △ Saturn, Moon → Scorpio"
  );
  assert.equal(formatTodaySummary({ personal: null, world: [], ingresses: ["Moon → Scorpio"] }), "- World transits: Moon → Scorpio");
});

test("only what is exact at some moment of the day is in the reading", () => {
  const a = { transit: "venus", aspect: "sextile", natal: "uranus", orb: 1, scope: "personal" };
  const b = { transit: "pluto", aspect: "square", natal: "sun", orb: 1, scope: "personal" };
  const c = { transit: "mars", aspect: "trine", natal: "saturn", orb: 1, scope: "world" };
  const window = (exacts, extra = {}) => ({ start: 0, end: 1, exacts, startClipped: true, endClipped: true, peakOrb: 0.1, ...extra });
  const day = summarizeToday([a, b, c], [
    [window([5])],                 // perfects today
    [window([])],                  // in orb all day, exact some other day
    [window([]), window([7, 9])]   // a second window with hits still counts
  ]);
  assert.deepEqual(day, { personal: [a], world: [c], ingresses: [], phases: [] });
});

test("sign changes and phases come back as text, in the order of the day", () => {
  const moonIn = { transit: "moon", aspect: INGRESS, natal: "scorpio", orb: 1, scope: "world" };
  const marsIn = { transit: "mars", aspect: INGRESS, natal: "leo", orb: 1, scope: "world" };
  const full = { transit: "sun", aspect: "fullmoon", natal: "moon", orb: 1, scope: "world" };
  const window = (exacts, extra = {}) => ({ start: 0, end: 1, exacts, startClipped: true, endClipped: true, peakOrb: 0.1, ...extra });
  const day = summarizeToday([moonIn, marsIn, full], [
    [window([20], { entering: [true] })],
    // Retrograde Mars slipping back over the Leo cusp lands in Cancer.
    [window([10], { entering: [false] })],
    // exactLonNatal is the Moon's longitude: 15° Aries.
    [window([15], { exactLon: [195], exactLonNatal: [15] })]
  ]);
  assert.deepEqual(day.ingresses, ["Mars → Cancer", "Moon → Scorpio"]);
  assert.deepEqual(day.phases, ["Full Moon in Aries"]);
  assert.deepEqual(day.personal, []);
  assert.deepEqual(day.world, []);
});
