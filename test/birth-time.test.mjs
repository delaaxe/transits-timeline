// Birth-time conversion: named zones, fixed offsets, and which wins.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBirthUTCFor, utcFromLocalPartsInTZ } from "../src/core/time.js";

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
