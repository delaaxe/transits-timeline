// Interval grouping and birth-time conversion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { groupActiveIntervalsWithExact } from "../src/core/transits.js";
import { parseBirthUTCFor, utcFromLocalPartsInTZ } from "../src/core/time.js";
const HOUR = 3600 * 1000;
const base = Date.UTC(2026, 0, 1, 0, 0, 0);
const samples = (n) => Array.from({ length: n }, (_, i) => new Date(base + i * HOUR));
const at = (i) => new Date(base + i * HOUR);

test("a run in the middle becomes one interval, exact at the smallest delta", async () => {
  const times = samples(6);
  const flags  = [false, true, true, true, false, false];
  const deltas = [9, 0.8, 0.2, 0.5, 9, 9];

  const intervals = groupActiveIntervalsWithExact(flags, deltas, times, at(6), false);

  assert.equal(intervals.length, 1);
  const [start, end, exact, atBoundary] = intervals[0];
  assert.equal(start.getTime(), at(1).getTime());
  assert.equal(end.getTime(), at(4).getTime(), "the interval closes at the first inactive sample");
  assert.equal(exact.getTime(), at(2).getTime(), "exact should land on the smallest delta");
  assert.equal(atBoundary, false);
});

test("a run still open at the last sample closes at endExclusive", async () => {
  const times = samples(4);
  const flags  = [false, false, true, true];
  const deltas = [9, 9, 0.4, 0.1];
  const endExclusive = at(4);

  const intervals = groupActiveIntervalsWithExact(flags, deltas, times, endExclusive, false);

  assert.equal(intervals.length, 1);
  assert.equal(intervals[0][1].getTime(), endExclusive.getTime());
  assert.equal(intervals[0][2].getTime(), at(3).getTime());
  // Minimum on the last sample: the real one is likely outside the window.
  assert.equal(intervals[0][3], true, "exact on the trailing edge is a boundary hit");
});

test("a run already active at the first sample is flagged as clipped", async () => {
  const times = samples(4);
  const flags  = [true, true, false, false];
  const deltas = [0.1, 0.6, 9, 9];

  const [interval] = groupActiveIntervalsWithExact(flags, deltas, times, at(4), false);

  assert.equal(interval[0].getTime(), at(0).getTime());
  assert.equal(interval[2].getTime(), at(0).getTime());
  assert.equal(interval[3], true, "exact on the leading edge is a boundary hit");
});

test("separate runs stay separate", async () => {
  const times = samples(8);
  const flags  = [false, true, true, false, false, true, true, false];
  const deltas = [9, 0.5, 0.3, 9, 9, 0.7, 0.2, 9];

  const intervals = groupActiveIntervalsWithExact(flags, deltas, times, at(8), true);

  assert.equal(intervals.length, 2, "a two-sample gap must not be bridged");
  assert.equal(intervals[0][2].getTime(), at(2).getTime());
  assert.equal(intervals[1][2].getTime(), at(6).getTime());
});

test("bridgeTinyGaps closes a single-sample hole, and only when asked", async () => {
  const times = samples(5);
  const flags  = [false, true, false, true, false];
  const deltas = [9, 0.5, 9, 0.3, 9];

  const bridged = groupActiveIntervalsWithExact(flags, deltas, times, at(5), true);
  assert.equal(bridged.length, 1, "a one-sample hole is a sampling artifact, not two transits");
  assert.equal(bridged[0][0].getTime(), at(1).getTime());
  assert.equal(bridged[0][1].getTime(), at(4).getTime());

  const unbridged = groupActiveIntervalsWithExact(flags, deltas, times, at(5), false);
  assert.equal(unbridged.length, 2, "without bridging the hole splits the run");
});

test("bridging does not mutate the caller's arrays", async () => {
  const times = samples(5);
  const flags  = [false, true, false, true, false];
  const deltas = [9, 0.5, 9, 0.3, 9];

  groupActiveIntervalsWithExact(flags, deltas, times, at(5), true);

  assert.deepEqual(flags, [false, true, false, true, false]);
  assert.deepEqual(deltas, [9, 0.5, 9, 0.3, 9]);
});

test("no samples and no active samples both produce no intervals", async () => {
  assert.deepEqual(groupActiveIntervalsWithExact([], [], [], at(0), true), []);
  const times = samples(3);
  assert.deepEqual(groupActiveIntervalsWithExact([false, false, false], [9, 9, 9], times, at(3), true), []);
});

test("birth times convert through named zones, including across DST", async () => {

  // Paris runs UTC+1 in January, UTC+2 in July.
  assert.equal(
    utcFromLocalPartsInTZ(2026, 1, 15, 12, 0, "Europe/Paris").toISOString(),
    "2026-01-15T11:00:00.000Z"
  );
  assert.equal(
    utcFromLocalPartsInTZ(2026, 7, 15, 12, 0, "Europe/Paris").toISOString(),
    "2026-07-15T10:00:00.000Z"
  );

  // New York: UTC-5 in winter, UTC-4 in summer.
  assert.equal(
    utcFromLocalPartsInTZ(2026, 1, 15, 12, 0, "America/New_York").toISOString(),
    "2026-01-15T17:00:00.000Z"
  );
  assert.equal(
    utcFromLocalPartsInTZ(2026, 7, 15, 12, 0, "America/New_York").toISOString(),
    "2026-07-15T16:00:00.000Z"
  );

  // India: half-hour offset, no DST.
  assert.equal(
    utcFromLocalPartsInTZ(2026, 3, 10, 9, 30, "Asia/Kolkata").toISOString(),
    "2026-03-10T04:00:00.000Z"
  );
});

test("a fixed numeric offset is honoured when no zone name is stored", async () => {

  assert.equal(
    parseBirthUTCFor({ birthDate: "1985-07-13", birthTime: "18:45", tzOffset: 2 }).toISOString(),
    "1985-07-13T16:45:00.000Z"
  );
  assert.equal(
    parseBirthUTCFor({ birthDate: "1991-02-02", birthTime: "04:05", tzOffset: -5 }).toISOString(),
    "1991-02-02T09:05:00.000Z"
  );
  // Missing time means midnight, not an error.
  assert.equal(
    parseBirthUTCFor({ birthDate: "2000-01-01", tzOffset: 0 }).toISOString(),
    "2000-01-01T00:00:00.000Z"
  );
});

test("a stored zone name wins over a stored numeric offset", async () => {
  const chart = {
    birthDate: "1985-07-13", birthTime: "18:45",
    tzOffset: 99, tzName: "Europe/Paris"
  };
  assert.equal(parseBirthUTCFor(chart).toISOString(), "1985-07-13T16:45:00.000Z");
});
