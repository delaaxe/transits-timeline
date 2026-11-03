import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayRules, describeMoon, formatTodaySummary, moonPhaseName, summarizeToday, todayTransitBodies, voidWindows } from "../src/services/today.js";
import { INGRESS, eclipseKind, isIngressRule, isPhaseRule } from "../src/data/bodies.js";
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

test("the summary is the Moon, then the chart, then the sky", () => {
  const venusUranus = { transit: "venus", aspect: "sextile", natal: "uranus", orb: 1, scope: "personal" };
  const marsSaturn = { transit: "mars", aspect: "trine", natal: "saturn", orb: 1, scope: "world" };
  const moon = "Waxing Gibbous in Scorpio";
  assert.equal(
    formatTodaySummary({ moon, personal: [venusUranus, { ...venusUranus, natal: "mc", aspect: "square" }], world: [marsSaturn] }),
    "- Moon: Waxing Gibbous in Scorpio\n- Transits: Venus ⚹ Uranus, Venus □ Mc\n- World transits: Mars △ Saturn"
  );
  // The Moon is always there; nothing in the chart is "na"; nothing in the
  // sky is no line at all.
  assert.equal(formatTodaySummary({ moon, personal: [], world: [] }), "- Moon: Waxing Gibbous in Scorpio\n- Transits: na");
  // No chart, no natal line.
  assert.equal(formatTodaySummary({ moon, personal: null, world: [] }), "- Moon: Waxing Gibbous in Scorpio");
  // Sign changes close the world line.
  assert.equal(
    formatTodaySummary({ moon, personal: null, world: [marsSaturn], ingresses: ["Mars → Leo"] }),
    "- Moon: Waxing Gibbous in Scorpio\n- World transits: Mars △ Saturn, Mars → Leo"
  );
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
  assert.deepEqual(day, { personal: [a], world: [c], ingresses: [], moon: { phase: null, ingress: null } });
});

test("the Moon's moments go to its line and the other sign changes to the sky's, in the order of the day", () => {
  const moonIn = { transit: "moon", aspect: INGRESS, natal: "scorpio", orb: 1, scope: "world" };
  const marsIn = { transit: "mars", aspect: INGRESS, natal: "leo", orb: 1, scope: "world" };
  const sunIn = { transit: "sun", aspect: INGRESS, natal: "scorpio", orb: 1, scope: "world" };
  const full = { transit: "sun", aspect: "fullmoon", natal: "moon", orb: 1, scope: "world" };
  const window = (exacts, extra = {}) => ({ start: 0, end: 1, exacts, startClipped: true, endClipped: true, peakOrb: 0.1, ...extra });
  const day = summarizeToday([moonIn, marsIn, sunIn, full], [
    [window([20], { entering: [true], exactLon: [210] })],
    // Retrograde Mars slipping back over the Leo cusp lands in Cancer.
    [window([10], { entering: [false] })],
    [window([3], { entering: [true] })],
    // exactLonNatal is the Moon's longitude: 15° Aries.
    [window([15], { exactLon: [195], exactLonNatal: [15] })]
  ]);
  assert.deepEqual(day.ingresses, ["Sun → Scorpio", "Mars → Cancer"]);
  assert.deepEqual(day.moon, { phase: { name: "Full Moon", sign: "♈", at: 15, eclipse: "" }, ingress: { sign: "♏", at: 20 } });
  assert.deepEqual(day.personal, []);
  assert.deepEqual(day.world, []);
});

test("the Moon's line is the day's: its phase, its sign or its move, or the exact phase and when", () => {
  const clock = { dayStart: 0, dayEnd: 1000, fmtTime: (ms) => `t${ms}` };
  const day = { sign: "♏", phase: "Waxing Gibbous" };
  const quiet = { phase: null, ingress: null };
  assert.equal(describeMoon(day, quiet, [], clock), "Waxing Gibbous in ♏");
  assert.equal(describeMoon(day, { phase: null, ingress: { sign: "♐", at: 700 } }, [], clock), "Waxing Gibbous, ♏ → ♐ t700");
  assert.equal(describeMoon(day, { phase: { name: "Full Moon", sign: "♉", at: 400, eclipse: "" }, ingress: null }, [], clock), "Full Moon in ♉ t400");
  assert.equal(describeMoon(day, { phase: { name: "New Moon", sign: "♏", at: 400, eclipse: "solar eclipse" }, ingress: { sign: "♐", at: 900 } }, [], clock),
    "New Moon in ♏ t400, solar eclipse, ♏ → ♐ t900");
});

test("the void is a window of the day, with its ends named where they fall outside it", () => {
  const clock = { dayStart: 0, dayEnd: 1000, fmtTime: (ms) => `t${ms}` };
  const day = { sign: "♏", phase: "Waxing Gibbous" };
  const quiet = { phase: null, ingress: null };
  assert.equal(describeMoon(day, quiet, [{ from: 50, until: 700 }], clock), "Waxing Gibbous in ♏, void t50 to t700");
  assert.equal(describeMoon(day, quiet, [{ from: -50, until: 700 }], clock), "Waxing Gibbous in ♏, void from yesterday t-50 to t700");
  assert.equal(describeMoon(day, quiet, [{ from: 600, until: 1200 }], clock), "Waxing Gibbous in ♏, void t600 to tomorrow t1200");
  assert.equal(describeMoon(day, quiet, [{ from: -50, until: 1200 }], clock), "Waxing Gibbous in ♏, void all day");
  // Two in one day: one ending in the morning, one starting at night.
  assert.equal(describeMoon(day, { phase: null, ingress: { sign: "♐", at: 100 } }, [{ from: -50, until: 100 }, { from: 900, until: 1300 }], clock),
    "Waxing Gibbous, ♏ → ♐ t100, void from yesterday t-50 to t100, void t900 to tomorrow t1300");
});

test("each void runs from the last aspect in a sign to the sign change, and only those touching the day count", () => {
  // Sign changes at -900, 0, 1000, 1900; the day is [0, 1000).
  const changes = [1900, -900, 0, 1000];
  // Aspects: -950 (before the first sign), 200 and 400 in the day's sign, 1200 in the next.
  assert.deepEqual(voidWindows(changes, [-950, 200, 400, 1200], 0, 1000),
    [{ from: -900, until: 0 }, { from: 400, until: 1000 }].filter(v => v.until > 0));
  // The void of the sign before, ending at midnight exactly, does not touch the day.
  assert.deepEqual(voidWindows(changes, [-950, 200, 400, 1200], 0, 1000), [{ from: 400, until: 1000 }]);
  // The next sign's void starts tonight and runs into tomorrow.
  assert.deepEqual(voidWindows(changes, [-950, 200, 400, 950, 1200], 0, 2000), [{ from: 950, until: 1000 }, { from: 1200, until: 1900 }]);
  // No aspect in a sign at all: void the whole sign.
  assert.deepEqual(voidWindows([0, 1000], [-50, 1200], 0, 1000), [{ from: 0, until: 1000 }]);
  // A sign the scan did not see both ends of is not named.
  assert.deepEqual(voidWindows([1000], [200], 0, 1000), []);
});

test("a New Moon near a node is a solar eclipse, a Full Moon a lunar one, nothing else is", () => {
  assert.equal(eclipseKind("newmoon", 10, 12), "solar eclipse");
  assert.equal(eclipseKind("newmoon", 10, 192), "solar eclipse");   // the other node
  assert.equal(eclipseKind("newmoon", 10, 40), "");
  assert.equal(eclipseKind("fullmoon", 10, 25), "lunar eclipse");
  assert.equal(eclipseKind("fullmoon", 10, 30), "");
  assert.equal(eclipseKind("firstquarter", 10, 10), "");
  assert.equal(eclipseKind("newmoon", NaN, 10), "");
});

test("between the exact phases the Moon is a crescent or gibbous, waxing then waning", () => {
  assert.equal(moonPhaseName(30, 0), "Waxing Crescent");
  assert.equal(moonPhaseName(100, 0), "Waxing Gibbous");
  assert.equal(moonPhaseName(200, 0), "Waning Gibbous");
  assert.equal(moonPhaseName(10, 50), "Waning Crescent");
});
