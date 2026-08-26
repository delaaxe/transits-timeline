// Longitudes against JPL DE421. See reference.json for how it was generated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadReference, angleGap } from "./harness.mjs";
import { ephemerisAstronomy, getBodyLonFromAll } from "../src/core/ephemeris.js";
// Measured worst case: 0.003 deg, and 0.010 for the Moon, whose Moshier series
// is truncated. Both budgets leave about 2x headroom.
const TOLERANCE_DEG = 0.005;
const MOON_TOLERANCE_DEG = 0.02;

test("planetary longitudes agree with JPL DE421", async () => {
  const ref = await loadReference();

  let comparisons = 0;
  for (const testCase of ref.cases){
    const when = new Date(testCase.utc);
    const all = ephemerisAstronomy.getAllPlanets(when, testCase.lon, testCase.lat, 0);

    for (const [body, expected] of Object.entries(testCase.longitudes)){
      const actual = getBodyLonFromAll(all, body, when);
      assert.equal(typeof actual, "number", `${testCase.name}: ${body} produced no longitude`);

      const gap = angleGap(actual, expected);
      const budget = body === "moon" ? MOON_TOLERANCE_DEG : TOLERANCE_DEG;
      assert.ok(
        gap <= budget,
        `${testCase.name}: ${body} off by ${gap.toFixed(6)} deg ` +
        `(${(gap * 3600).toFixed(1)} arcsec), budget ${budget} deg. ` +
        `Got ${actual.toFixed(6)}, DE421 says ${expected.toFixed(6)}.`
      );
      comparisons++;
    }
  }

  assert.ok(comparisons >= 70, `expected a broad comparison, only made ${comparisons}`);
});

test("the Sun sits near 0 degrees at the March equinox", async () => {
  // An equinox is the Sun crossing the vernal point, so this pins the zero point.
  const equinox2026 = new Date("2026-03-20T14:46:00Z");
  const all = ephemerisAstronomy.getAllPlanets(equinox2026, 0, 0, 0);
  const sun = getBodyLonFromAll(all, "sun", equinox2026);
  assert.ok(
    angleGap(sun, 0) < 0.02,
    `Sun should be within 0.02 deg of the vernal point at the equinox, got ${sun.toFixed(4)}`
  );
});

test("outer planets move slowly and inner planets move fast", async () => {
  const t0 = new Date("2026-01-01T00:00:00Z");
  const t1 = new Date("2026-01-08T00:00:00Z");
  const a = ephemerisAstronomy.getAllPlanets(t0, 0, 0, 0);
  const b = ephemerisAstronomy.getAllPlanets(t1, 0, 0, 0);

  const movedInAWeek = (body) =>
    angleGap(getBodyLonFromAll(a, body, t0), getBodyLonFromAll(b, body, t1));

  // Scale, not precision: catches a units or epoch mix-up.
  assert.ok(movedInAWeek("moon") > 60, "the Moon should cover most of a sign in a week");
  assert.ok(movedInAWeek("sun") > 5 && movedInAWeek("sun") < 9, "the Sun moves about a degree a day");
  assert.ok(movedInAWeek("pluto") < 1, "Pluto should barely move in a week");
  assert.ok(movedInAWeek("neptune") < 1, "Neptune should barely move in a week");
});
