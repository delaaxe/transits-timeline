// The event model: root-finding, the adaptive scan, and the speed ceilings the
// scan's safety rests on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, aspectTargets, brentRoot, scanAspectWindows, wrap180 } from "../src/core/events.js";
import { computeTransitEvents } from "../src/core/job.js";
import { buildCandidateRules, buildSkyRules } from "../src/core/transits.js";
import { angDist } from "../src/core/angles.js";
import { ephemerisAstronomy, getBodyLonAt, getBodyLonFromAll } from "../src/core/ephemeris.js";
import { aspectAngle, maxSpeedDegPerDay } from "../src/data/bodies.js";

const T0 = Date.UTC(2026, 0, 1);
const days = (ms) => (ms - T0) / DAY_MS;
const at = (d) => T0 + d * DAY_MS;
const OBSERVER = { lon: 2.35, lat: 48.85, height: 0 };

test("wrap180 lands in (-180, 180] and is continuous through the wrap", async () => {
  assert.equal(wrap180(0), 0);
  assert.equal(wrap180(180), 180);
  assert.equal(wrap180(-180), 180, "both edges name the same angle, and it is +180");
  assert.equal(wrap180(181), -179);
  assert.equal(wrap180(-181), 179);
  assert.equal(wrap180(720 + 45), 45);
  assert.equal(wrap180(-720 - 45), -45);
});

test("a conjunction and an opposition have one target, everything else has two", async () => {
  assert.deepEqual(aspectTargets(0), [0]);
  assert.deepEqual(aspectTargets(180), [180], "wrap180(sep-180) and wrap180(sep+180) are one function");
  assert.deepEqual(aspectTargets(60), [60, -60], "a sextile is exact both ahead and behind");
  assert.deepEqual(aspectTargets(90), [90, -90]);
});

test("brentRoot finds a root it is given a bracket for, and refuses one it is not", async () => {
  const f = (x) => Math.sin(x / 1000);
  const root = brentRoot(f, 2000, 4000, f(2000), f(4000), 1e-6);
  assert.ok(root !== null);
  assert.ok(Math.abs(root - Math.PI * 1000) < 1e-5, `expected pi*1000, got ${root}`);

  assert.equal(brentRoot(f, 100, 200, f(100), f(200), 1e-6), null, "same sign at both ends is not a bracket");
  assert.equal(brentRoot(f, 0, 5000, 0, f(5000), 1e-6), 0, "a root already on the endpoint is returned as is");
});

test("a body at a constant speed hits every aspect where the arithmetic says", async () => {
  // sep(t) = 5 + 10*days, so a conjunction falls where that reaches a multiple
  // of 360, a sextile where it reaches 60 or 300, an opposition at 180.
  const baseAt = (ms) => wrap180(days(ms) * 10 + 5);
  const scan = (angle) => scanAspectWindows({
    offsets: aspectTargets(angle), orbDeg: 1, startMs: T0, endMs: at(72),
    baseAt, maxSpeedDegPerDay: 10
  });

  const exactsOf = (result) => result.flat().flatMap(e => e.exacts).map(days).sort((a, b) => a - b);
  const close = (got, want, what) => {
    assert.equal(got.length, want.length, `${what}: expected ${want.length} hits, got ${got.length}`);
    got.forEach((g, i) => assert.ok(Math.abs(g - want[i]) < 1e-4, `${what}: ${g} vs ${want[i]}`));
  };

  close(exactsOf(scan(0)), [35.5, 71.5], "conjunction");
  close(exactsOf(scan(60)), [5.5, 29.5, 41.5, 65.5], "sextile, both sides");
  close(exactsOf(scan(180)), [17.5, 53.5], "opposition");

  // The window is the orb divided by the speed, either side of exact.
  const [first] = scan(0).flat();
  assert.ok(Math.abs(days(first.start) - 35.4) < 1e-4);
  assert.ok(Math.abs(days(first.end) - 35.6) < 1e-4);
  assert.equal(first.startClipped, false);
  assert.equal(first.endClipped, false);
});

test("a retrograde triple pass is one window or three, depending on the orb", async () => {
  // Roots at exactly 10, 15 and 20 days; the turns between them reach 1.92
  // degrees, so an orb either side of that decides whether the passes merge.
  const baseAt = (ms) => { const x = days(ms); return (x - 10) * (x - 15) * (x - 20) / 25; };
  const scan = (orbDeg) => scanAspectWindows({
    offsets: [0], orbDeg, startMs: at(5), endMs: at(25), baseAt, maxSpeedDegPerDay: 11
  })[0];

  const wide = scan(2);
  assert.equal(wide.length, 1, "an orb wider than the turns holds all three passes in one window");
  assert.equal(wide[0].exacts.length, 3);
  wide[0].exacts.map(days).forEach((d, i) => {
    assert.ok(Math.abs(d - [10, 15, 20][i]) < 1e-4, `pass ${i + 1} at ${d}`);
  });

  const narrow = scan(1.5);
  assert.equal(narrow.length, 3, "a narrower orb lets the body leave between passes");
  assert.deepEqual(narrow.map(w => w.exacts.length), [1, 1, 1]);
});

test("a window open at either end of the range is reported as clipped", async () => {
  const baseAt = (ms) => wrap180(days(ms) * 10 - 0.3);
  const [event] = scanAspectWindows({
    offsets: [0], orbDeg: 1, startMs: T0, endMs: at(0.05), baseAt, maxSpeedDegPerDay: 10
  })[0];

  assert.equal(event.startClipped, true);
  assert.equal(event.endClipped, true);
  assert.equal(event.start, T0);
  assert.equal(event.end, at(0.05));
  assert.ok(Math.abs(days(event.exacts[0]) - 0.03) < 1e-4, "the exact hit inside is still found");
});

test("a near miss is a window with no exact hit", async () => {
  // Turns back 0.4 degrees short of exact.
  const baseAt = (ms) => { const x = days(ms) - 10; return 0.4 + x * x / 20; };
  const [event] = scanAspectWindows({
    offsets: [0], orbDeg: 1, startMs: at(0), endMs: at(20), baseAt, maxSpeedDegPerDay: 1
  })[0];

  assert.deepEqual(event.exacts, [], "close is not exact");
  assert.ok(event.peakOrb <= 0.45 && event.peakOrb >= 0.4, `peak orb ${event.peakOrb} should be about 0.4`);
});

test("the speed ceilings really do bound the ephemeris", async () => {
  // The scan steps by (distance to the orb boundary) / these, so one set too
  // low would silently step over transits. Each span is picked to contain that
  // body's fastest stretch - perihelion for the slow ones, perigee for the
  // Moon - rather than to re-derive the 1900-2100 maximum the table records.
  const cases = [
    ["moon",    30,   2026, 2026.4],
    ["mercury", 120,  2026, 2028],
    ["venus",   240,  2026, 2028],
    ["sun",     240,  2026, 2027],
    ["mars",    360,  2016, 2019],
    ["jupiter", 1440, 2033, 2036],
    ["saturn",  1440, 2029, 2035],
    ["uranus",  1440, 2046, 2052],
    ["neptune", 1440, 2026, 2032],
    ["pluto",   1440, 2026, 2032],
    ["chiron",  1440, 2044, 2049]
  ];

  const yearMs = (y) => Date.UTC(Math.floor(y), 0, 1) + (y % 1) * 365.25 * DAY_MS;

  for (const [body, stepMin, y0, y1] of cases){
    const step = stepMin * 60000;
    let prev = null;
    let worst = 0;
    for (let t = yearMs(y0); t <= yearMs(y1); t += step){
      const lon = getBodyLonAt(body, new Date(t), OBSERVER);
      if (prev !== null) worst = Math.max(worst, Math.abs(wrap180(lon - prev)) / (stepMin / 1440));
      prev = lon;
    }
    assert.ok(
      worst < maxSpeedDegPerDay[body],
      `${body} reached ${worst.toFixed(4)} deg/day, ceiling is ${maxSpeedDegPerDay[body]}`
    );
    assert.ok(
      worst > maxSpeedDegPerDay[body] * 0.55,
      `${body}'s ceiling of ${maxSpeedDegPerDay[body]} is far above its measured ${worst.toFixed(4)}, which only wastes work`
    );
  }
});

function natalLonFor(birthUTC){
  const all = ephemerisAstronomy.getAllPlanets(birthUTC, OBSERVER.lon, OBSERVER.lat, 0);
  const out = {};
  for (const k of ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node","chiron"]){
    out[k] = getBodyLonFromAll(all, k, birthUTC);
  }
  return out;
}

test("every exact hit really is exact", async () => {
  const natalLon = natalLonFor(new Date("1985-07-13T16:45:00Z"));
  const rules = buildCandidateRules({
    transitGroup: "classical", natalGroup: "classical",
    aspects: ["conjunction","sextile","square","trine","opposition"],
    orb: 1, includeMoon: true, includeChiron: true, includeNode: true, includeMC: false
  });
  const res = computeTransitEvents({
    mode: "personal", startMs: Date.UTC(2026, 0, 1), endMs: Date.UTC(2026, 1, 1),
    observer: OBSERVER, natalLon, rules
  });

  let checked = 0;
  let worst = 0;
  for (let i = 0; i < res.rules.length; i++){
    const r = res.rules[i];
    for (const event of res.events[i]){
      for (const ms of event.exacts){
        const tLon = getBodyLonAt(r.transit, new Date(ms), OBSERVER);
        const off = Math.abs(angDist(tLon, natalLon[r.natal]) - aspectAngle(r.aspect));
        worst = Math.max(worst, off);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `expected a month of transits to hold more than 100 exact hits, got ${checked}`);
  // A second of the Moon's motion is 0.00018 degrees, and it is the fastest
  // thing here; anything under a thousandth of a degree is the root tolerance.
  assert.ok(worst < 0.001, `worst exact hit was ${worst.toFixed(6)} degrees off`);
});

test("the scan agrees with brute-force sampling about when a transit is on", async () => {
  // The property that matters: the windows are exactly the times a dense
  // sampler would have flagged. Anything the scan stepped over shows up here.
  const natalLon = natalLonFor(new Date("1990-03-02T09:20:00Z"));
  const rules = buildCandidateRules({
    transitGroup: "personal", natalGroup: "classical",
    aspects: ["conjunction","square","opposition"],
    orb: 1, includeMoon: true, includeChiron: false, includeNode: false, includeMC: false
  });
  const startMs = Date.UTC(2026, 5, 1);
  const endMs = Date.UTC(2026, 5, 15);
  const res = computeTransitEvents({ mode: "personal", startMs, endMs, observer: OBSERVER, natalLon, rules });

  const byRule = new Map(res.rules.map((r, i) => [`${r.transit}|${r.aspect}|${r.natal}`, res.events[i]]));
  const STEP = 20 * 60000;
  let disagreements = 0;
  let onSamples = 0;

  for (const r of rules){
    const events = byRule.get(`${r.transit}|${r.aspect}|${r.natal}`) ?? [];
    for (let t = startMs; t < endMs; t += STEP){
      const tLon = getBodyLonAt(r.transit, new Date(t), OBSERVER);
      const sampledOn = Math.abs(angDist(tLon, natalLon[r.natal]) - aspectAngle(r.aspect)) <= Number(r.orb);
      const modelOn = events.some(e => t >= e.start && t <= e.end);
      if (sampledOn) onSamples++;
      // A sample within a root tolerance of an edge may legitimately fall on
      // either side of it.
      if (sampledOn !== modelOn){
        const nearEdge = events.some(e => Math.abs(t - e.start) < 2000 || Math.abs(t - e.end) < 2000);
        if (!nearEdge) disagreements++;
      }
    }
  }

  assert.ok(onSamples > 200, `the sampler should have found plenty of active moments, found ${onSamples}`);
  assert.equal(disagreements, 0, `${disagreements} moments where the scan and a dense sampler disagree`);
});

test("world mode scans both ends of the pair", async () => {
  const rules = buildSkyRules({
    transitGroup: "classical", aspects: ["conjunction","opposition"],
    orb: 1, includeMoon: false, includeChiron: false, includeNode: false
  });
  const startMs = Date.UTC(2026, 0, 1);
  const endMs = Date.UTC(2026, 3, 1);
  const res = computeTransitEvents({ mode: "world", startMs, endMs, observer: OBSERVER, natalLon: null, rules });

  assert.ok(res.rules.length > 0, "a quarter of sky should hold some aspects between the classical bodies");
  let checked = 0;
  for (let i = 0; i < res.rules.length; i++){
    const r = res.rules[i];
    for (const event of res.events[i]){
      for (const ms of event.exacts){
        const a = getBodyLonAt(r.transit, new Date(ms), OBSERVER);
        const b = getBodyLonAt(r.natal, new Date(ms), OBSERVER);
        assert.ok(Math.abs(angDist(a, b) - aspectAngle(r.aspect)) < 0.001, `${r.transit} ${r.aspect} ${r.natal}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 5, `expected several exact sky aspects, got ${checked}`);
});

test("the scan reaches exact times for a fraction of what sampling to them costs", async () => {
  const natalLon = natalLonFor(new Date("1985-07-13T16:45:00Z"));
  const rules = buildCandidateRules({
    transitGroup: "outer", natalGroup: "all",
    aspects: ["conjunction","sextile","square","trine","opposition"],
    orb: 1, includeMoon: false, includeChiron: true, includeNode: true, includeMC: false
  });
  const startMs = Date.UTC(2026, 0, 1);
  const endMs = Date.UTC(2031, 0, 1);
  const res = computeTransitEvents({ mode: "personal", startMs, endMs, observer: OBSERVER, natalLon, rules });

  // The comparison the event model actually wins is against sampling fine
  // enough to place an edge where it does. The old sampler walked five years at
  // four-day steps for roughly the same cost, and quantized every edge to a
  // whole day.
  const sampledToTheMinute = (endMs - startMs) / 60000;
  assert.ok(
    res.evaluations < sampledToTheMinute / 500,
    `${res.evaluations} reads against ${sampledToTheMinute} to sample the same range by the minute`
  );

  // A budget rather than a ratio, so a change that makes the scan much more
  // expensive fails here instead of quietly on someone's phone.
  assert.ok(res.evaluations < 6000, `five years of outer transits took ${res.evaluations} reads`);
  assert.ok(res.rules.length > 20, "five years of outer transits should match plenty of rules");
});
