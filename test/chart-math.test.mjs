// Sidereal time, angles, node and composite math. Reference values come from
// formulas implemented here off different published series than the app uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadReference, angleGap } from "./harness.mjs";
import { midpointAngle } from "../src/core/angles.js";
import { gmstDeg, julianDay, parseBirthUTCFor } from "../src/core/time.js";
import { calcMeanNodeDeg, ephemerisAstronomy, getBodyLonFromAll } from "../src/core/ephemeris.js";
import { calcNatalAscDeg, calcNatalMCDeg, chartRulerFromAsc, computeCompositeChart } from "../src/core/chart.js";
import { zodiacSign } from "../src/data/bodies.js";
const DEG_PER_SECOND_OF_TIME = 360.9856 / 86400;

// The app treats a Date's UTC as UT1. They differ by under 0.9s after 1972,
// and by several seconds before it, hence pre_1972_cases in the fixture.
const UT1_BUDGET_DEG = 1.0 * DEG_PER_SECOND_OF_TIME;

// IAU 2006, a different series from the app's.
function meanObliquityIAU2006(t){
  const arcsec = 84381.406
    - 46.836769 * t
    - 0.0001831 * t * t
    + 0.00200340 * t * t * t;
  return arcsec / 3600;
}

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const wrap = (d) => { const x = d % 360; return x < 0 ? x + 360 : x; };

function expectedMC(gmstDeg, geoLonDeg, t){
  const eps = rad(meanObliquityIAU2006(t));
  const lst = rad(wrap(gmstDeg + geoLonDeg));
  return wrap(deg(Math.atan2(Math.sin(lst) * Math.cos(eps), Math.cos(lst))));
}

function expectedASC(gmstDeg, geoLonDeg, geoLatDeg, t){
  const eps = rad(meanObliquityIAU2006(t));
  const lst = rad(wrap(gmstDeg + geoLonDeg));
  const phi = rad(geoLatDeg);
  const asc = Math.atan2(
    -Math.cos(lst),
    Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)
  ) + Math.PI;
  return wrap(deg(asc));
}

const modernCases = async () => {
  const ref = await loadReference();
  const excluded = new Set(ref.provenance.pre_1972_cases ?? []);
  return ref.cases.filter(c => !excluded.has(c.name));
};

test("gmstDeg matches Skyfield's GMST within the UT1 budget", async () => {
  for (const testCase of await modernCases()){
    const jd = julianDay(new Date(testCase.utc));
    const gap = angleGap(gmstDeg(jd), testCase.gmst_deg);
    assert.ok(
      gap <= UT1_BUDGET_DEG,
      `${testCase.name}: GMST off by ${(gap / DEG_PER_SECOND_OF_TIME).toFixed(3)}s of time, ` +
      `budget 1.0s`
    );
  }
});

test("pre-1972 dates drift by seconds of sidereal time, as expected", async () => {
  const ref = await loadReference();
  const legacy = ref.cases.find(c => (ref.provenance.pre_1972_cases ?? []).includes(c.name));
  assert.ok(legacy, "fixture should retain a pre-1972 case");

  const jd = julianDay(new Date(legacy.utc));
  const seconds = angleGap(gmstDeg(jd), legacy.gmst_deg) / DEG_PER_SECOND_OF_TIME;

  // A few arcminutes on the ascendant. Past 30s it is no longer just UT1.
  assert.ok(seconds > 1, `expected pre-1972 drift, got ${seconds.toFixed(3)}s`);
  assert.ok(seconds < 30, `pre-1972 drift grew to ${seconds.toFixed(3)}s, which is not just UT1`);
});

test("midheaven matches an independent implementation", async () => {
  for (const testCase of await modernCases()){
    const when = new Date(testCase.utc);
    const t = (julianDay(when) - 2451545.0) / 36525.0;
    const expected = expectedMC(testCase.gmst_deg, testCase.lon, t);
    const gap = angleGap(calcNatalMCDeg(when, testCase.lon), expected);
    assert.ok(gap < 0.01, `${testCase.name}: MC off by ${gap.toFixed(5)} deg`);
  }
});

test("ascendant matches an independent implementation, including high latitude", async () => {
  const cases = await modernCases();
  assert.ok(cases.some(c => Math.abs(c.lat) > 60), "fixture should include a high-latitude case");

  for (const testCase of cases){
    const when = new Date(testCase.utc);
    const t = (julianDay(when) - 2451545.0) / 36525.0;
    const expected = expectedASC(testCase.gmst_deg, testCase.lon, testCase.lat, t);
    const gap = angleGap(calcNatalAscDeg(when, testCase.lon, testCase.lat), expected);
    assert.ok(gap < 0.02, `${testCase.name}: ASC off by ${gap.toFixed(5)} deg`);
  }
});

test("moving east by 15 degrees advances the midheaven by 15 degrees of right ascension", async () => {
  const when = new Date("2026-06-15T09:00:00Z");
  // No ephemeris involved, so this isolates the longitude handling.
  const a = calcNatalMCDeg(when, 0);
  const b = calcNatalMCDeg(when, 15);
  const jd = julianDay(when);
  const t = (jd - 2451545.0) / 36525.0;
  const expected = expectedMC(gmstDeg(jd), 15, t);
  assert.ok(angleGap(b, expected) < 0.001, "MC should track geographic longitude exactly");
  assert.ok(angleGap(a, b) > 10, "15 degrees of longitude should visibly move the MC");
});

test("mean node matches Meeus and moves backwards", async () => {
  // Meeus, Astronomical Algorithms, 2nd ed., ch. 47.
  const meeusNode = (when) => {
    const t = (julianDay(when) - 2451545.0) / 36525.0;
    return wrap(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t
      + (t * t * t) / 467441 - (t * t * t * t) / 60616000);
  };

  for (const iso of ["1960-02-29T06:15:00Z", "2000-01-01T12:00:00Z", "2026-08-25T00:00:00Z", "2045-11-02T18:00:00Z"]){
    const when = new Date(iso);
    const gap = angleGap(calcMeanNodeDeg(when), meeusNode(when));
    assert.ok(gap < 0.001, `${iso}: mean node off by ${gap.toFixed(6)} deg`);
  }

  // The nodes regress: a full circuit takes about 19.35 years.
  const start = calcMeanNodeDeg(new Date("2026-01-01T00:00:00Z"));
  const later = calcMeanNodeDeg(new Date("2026-02-01T00:00:00Z"));
  const travelled = wrap(start - later);
  assert.ok(travelled > 1.3 && travelled < 1.9, `expected ~1.6 deg of regression per month, got ${travelled.toFixed(3)}`);
});

test("midpointAngle takes the short way around the wheel", async () => {
  assert.equal(midpointAngle(10, 50), 30);
  // Where a naive average breaks: 350 and 10 meet at 0, not 180.
  assert.equal(midpointAngle(350, 10), 0);
  assert.equal(midpointAngle(10, 350), 0);
  assert.equal(midpointAngle(359, 1), 0);
  for (const [a, b] of [[5, 200], [123, 47], [280, 15]]){
    assert.ok(angleGap(midpointAngle(a, b), midpointAngle(b, a)) < 1e-9,
      `midpoint of ${a} and ${b} should not depend on argument order`);
  }
});

test("a composite of a chart with itself returns that chart", async () => {
  const chart = {
    birthDate: "1985-07-13", birthTime: "18:45",
    tzOffset: 2, lon: 2.3522, lat: 48.8566
  };

  const composite = computeCompositeChart(chart, chart);
  const birthUTC = parseBirthUTCFor(chart);
  const all = ephemerisAstronomy.getAllPlanets(birthUTC, chart.lon, chart.lat, 0);

  for (const body of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]){
    const own = getBodyLonFromAll(all, body, birthUTC);
    assert.ok(angleGap(composite.lon[body], own) < 1e-6,
      `composite ${body} should equal the chart's own ${body}`);
  }
  assert.ok(angleGap(composite.asc, calcNatalAscDeg(birthUTC, chart.lon, chart.lat)) < 1e-6);
  assert.ok(angleGap(composite.mc, calcNatalMCDeg(birthUTC, chart.lon)) < 1e-6);
  assert.ok(Math.abs(composite.location.lat - chart.lat) < 1e-9);
});

test("composite is symmetric in its two charts", async () => {
  const a = { birthDate: "1985-07-13", birthTime: "18:45", tzOffset: 2, lon: 2.3522, lat: 48.8566 };
  const b = { birthDate: "1991-02-02", birthTime: "04:05", tzOffset: -5, lon: -74.0060, lat: 40.7128 };

  const ab = computeCompositeChart(a, b);
  const ba = computeCompositeChart(b, a);

  for (const body of Object.keys(ab.lon)){
    assert.ok(angleGap(ab.lon[body], ba.lon[body]) < 1e-9,
      `composite ${body} should not depend on which chart comes first`);
  }
  assert.ok(angleGap(ab.asc, ba.asc) < 1e-9, "composite ascendant should be symmetric");
});

test("chart ruler and zodiac sign agree on sign boundaries", async () => {
  assert.equal(zodiacSign(0), "Aries");
  assert.equal(zodiacSign(29.999), "Aries");
  assert.equal(zodiacSign(30), "Taurus");
  assert.equal(zodiacSign(359.999), "Pisces");
  assert.equal(zodiacSign(-1), "Pisces", "negative degrees should wrap, not fall off the end");

  assert.equal(chartRulerFromAsc(0), "mars", "Aries rising is ruled by Mars");
  assert.equal(chartRulerFromAsc(125), "sun", "Leo rising is ruled by the Sun");
  assert.equal(chartRulerFromAsc(300), "saturn", "Aquarius rising is ruled by Saturn");
});
