// How a birth moment reads on screen: the chart summary and the transfer dialog
// both show it as "Sep 9, 1990, 11:28".

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fmtBirthPretty } from "../src/ui/format.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a birth moment reads as a short month, a day, a year and a 24-hour clock", () => {
  assert.equal(fmtBirthPretty("1990-09-09", "11:28"), "Sep 9, 1990, 11:28");
  assert.equal(fmtBirthPretty("1971-06-28", "07:30"), "Jun 28, 1971, 07:30");
  assert.equal(fmtBirthPretty("2001-01-01", "00:00"), "Jan 1, 2001, 00:00");
  // An hour written without its leading zero, as the older JSON files have it.
  assert.equal(fmtBirthPretty("1990-09-09", "9:05"), "Sep 9, 1990, 09:05");
  assert.equal(fmtBirthPretty("1990-09-09", ""), "Sep 9, 1990");
});

// The year is what tells two charts of the same calendar day apart, and this is
// the only line in the app that shows it.
test("two births a year apart do not read alike", () => {
  assert.notEqual(fmtBirthPretty("1990-09-09", "11:28"), fmtBirthPretty("1962-09-09", "11:28"));
});

// The birth time is a clock on the wall where someone was born, not a moment in
// the reader's day. Two ways that goes wrong once a Date carries it: a date that
// lands on the day either side, and an hour the reader's own clock skips over -
// 2:30 a.m. on the morning New York springs forward, which a Date quietly moves
// to 3:30. The zone is process-wide and read when this module loads, so each one
// is asked in a process of its own.
test("a birth moment reads the same in every zone the reader might be in", () => {
  const script = 'import("./src/ui/format.js").then(m => '
    + 'console.log(m.fmtBirthPretty("1990-04-01", "02:30")))';
  for (const TZ of ["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Midway"]){
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: repoRoot, encoding: "utf8", env: { ...process.env, TZ }
    });
    assert.equal(out.trim(), "Apr 1, 1990, 02:30", `read wrong in ${TZ}`);
  }
});

// Nothing here can turn a BC year or a half filled record into a month and a
// day, and a guess would be worse than the digits themselves.
test("what isn't a plain date is left as it was written", () => {
  assert.equal(fmtBirthPretty("-0044-03-15", "12:00"), "-0044-03-15 12:00");
  assert.equal(fmtBirthPretty("", "11:28"), "11:28");
  assert.equal(fmtBirthPretty("", ""), "");
});
