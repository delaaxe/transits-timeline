import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayRules, formatTodaySummary, todayTransitBodies } from "../src/services/today.js";
import { aspects, natalKeys } from "../src/data/bodies.js";

test("the day's reading moves every body but the Moon, over every natal point, in every aspect", () => {
  assert.ok(!todayTransitBodies.includes("moon"));
  assert.ok(!todayTransitBodies.includes("mc") && !todayTransitBodies.includes("asc"));
  const rules = buildTodayRules({ personal: true, orb: 1 });
  const personal = rules.filter(r => r.scope === "personal");
  const world = rules.filter(r => r.scope === "world");
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
});
