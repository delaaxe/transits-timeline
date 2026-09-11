// "When did this last happen, and when does it happen next?" - the part of the
// answer that is arithmetic rather than ephemeris: which spans of time get
// looked at, in what order, which of what comes back counts as the occurrence,
// and what range it should be shown in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS } from "../src/core/events.js";
import { SEARCH_LIMIT_YEARS, SEARCH_REACH_YEARS, occurrenceWindow, pickOccurrence, returnRange, searchWindows } from "../src/services/search.js";

const YEAR_MS = 365.2425 * DAY_MS;
const T0 = Date.UTC(2026, 0, 1);
const years = (ms) => (ms - T0) / YEAR_MS;

test("the windows are contiguous, grow, and start at the moment asked about", () => {
  for (const direction of [-1, 1]){
    const windows = searchWindows(T0, direction);
    assert.equal(windows.length, SEARCH_REACH_YEARS.length);

    const nearFirst = windows.map(w => (direction < 0 ? w.endMs : w.startMs));
    const farOf = windows.map(w => (direction < 0 ? w.startMs : w.endMs));

    assert.equal(nearFirst[0], T0, "the first window starts where the search does");
    for (let i = 0; i < windows.length; i++){
      // Nothing is scanned twice and nothing is skipped: each window picks up
      // exactly where the one before it stopped.
      if (i > 0) assert.equal(nearFirst[i], farOf[i - 1]);
      assert.ok(Math.abs(Math.abs(years(farOf[i])) - SEARCH_REACH_YEARS[i]) < 1e-6);
      assert.ok(Math.sign(years(farOf[i])) === direction);
      assert.ok(windows[i].endMs > windows[i].startMs, "a window runs forward whichever way it looks");
    }
    assert.ok(Math.abs(Math.abs(years(farOf[farOf.length - 1])) - SEARCH_LIMIT_YEARS) < 1e-6);
  }
});

const event = (startDays, endDays, exactDays, clip = {}) => ({
  start: T0 + startDays * DAY_MS,
  end: T0 + endDays * DAY_MS,
  exacts: exactDays.map(d => T0 + d * DAY_MS),
  startClipped: !!clip.start,
  endClipped: !!clip.end,
  peakOrb: 0
});
const daysOf = (hit) => (hit === null ? null : Math.round((hit.at - T0) / DAY_MS));

test("the nearest exact hit in the direction asked for is the answer", () => {
  const events = [event(-400, -390, [-397, -395]), event(-20, -10, [-18, -13])];
  const back = pickOccurrence(events, T0, -1);
  assert.equal(daysOf(back), -13, "the latest hit of the nearest window, not the window's first");
  assert.equal(back.exact, true);

  const forward = pickOccurrence([event(10, 20, [12, 17]), event(400, 410, [405])], T0, 1);
  assert.equal(daysOf(forward), 12, "and forwards it is the earliest");
});

test("hits on the wrong side of the moment asked about are not answers", () => {
  // A window open at the moment the search starts from has hits either side of
  // it, and only the ones behind are the last time this happened.
  const straddling = [event(-5, 5, [-3, 2])];
  assert.equal(daysOf(pickOccurrence(straddling, T0, -1)), -3);
  assert.equal(daysOf(pickOccurrence(straddling, T0, 1)), 2);
  assert.equal(pickOccurrence([event(10, 20, [15])], T0, -1), null, "nothing behind is nothing to report");
});

test("a pass that never perfects still counts, dated by the middle of it", () => {
  // A body that stations inside orb and turns back never becomes exact, but the
  // contact happened and the reader is owed the date.
  const hit = pickOccurrence([event(-30, -10, [])], T0, -1);
  assert.equal(daysOf(hit), -20);
  assert.equal(hit.exact, false, "and is not reported as an exact hit");
});

test("a pass running off the far edge of the window is left to the next window", () => {
  // Its exact hit can be a day past the edge, which this window did not look at.
  // Calling it "never exact" here would be a statement about time nobody scanned.
  assert.equal(pickOccurrence([event(-365, -100, [], { start: true })], T0, -1), null);
  assert.equal(pickOccurrence([event(100, 365, [], { end: true })], T0, 1), null);

  // Clipped at the near edge instead, the window holds the whole of the far end
  // of the contact, so it is an answer.
  assert.equal(daysOf(pickOccurrence([event(-300, -100, [], { end: true })], T0, -1)), -200);
});

test("an exact hit beats a vaguer pass that is nearer", () => {
  // Both are occurrences; only one of them has a date worth printing, and the
  // vaguer one is what the window happened to catch.
  const hit = pickOccurrence([event(-40, -30, [-33]), event(-20, -10, [], { start: true })], T0, -1);
  assert.equal(daysOf(hit), -33);
});

test("the jump keeps the reader's own zoom unless the contact is longer than it", () => {
  const short = { at: T0, event: { start: T0 - 2 * DAY_MS, end: T0 + 2 * DAY_MS } };
  const kept = occurrenceWindow(short, 30, 3650);
  assert.equal(kept.days, 30, "a four-day contact fits in the month being read");
  assert.equal(kept.centreMs, T0, "centred on the hit itself");

  const long = { at: T0, event: { start: T0 - 300 * DAY_MS, end: T0 + 500 * DAY_MS } };
  const widened = occurrenceWindow(long, 30, 3650);
  assert.equal(widened.days, Math.ceil(800 * 1.2), "a contact wider than the view widens the view");
  assert.equal(widened.centreMs, T0 + 100 * DAY_MS, "centred on the contact rather than on one of its hits");

  const enormous = { at: T0, event: { start: T0 - 20000 * DAY_MS, end: T0 + 20000 * DAY_MS } };
  assert.equal(occurrenceWindow(enormous, 30, 3650).days, 3650, "and the ceiling holds");
});

const range = (start, end) => ({ start, end });
const jump = (from, to, direction) => ({ from, to, direction });

const home = range("2026-01-01", "2026-03-31");
const far = range("2270-05-01", "2270-07-29");

test("a press the other way walks the jump that got here back", () => {
  // The case the trail exists for: next reaches 2270, and the 243 years behind
  // 2270 stop short of the year the reader left, so the search is honestly
  // empty and the only way home is the way they came.
  const trail = [jump(home, far, 1)];
  assert.deepEqual(returnRange(trail, far, -1), home);

  // And the same in reverse, for a reader who pressed "last time" into 1780.
  assert.deepEqual(returnRange([jump(home, far, -1)], far, 1), home);
});

test("pressing on in the direction already travelled does not bounce back", () => {
  // Two presses of "next time" mean the reader wants a third thing, not the
  // second one again.
  assert.equal(returnRange([jump(home, far, 1)], far, 1), null);
});

test("a range the reader moved themselves is not stepped off", () => {
  // They have answered the question of where they want to be, and a button
  // labelled "last time" should not overrule it.
  const moved = range("2200-01-01", "2200-03-31");
  assert.equal(returnRange([jump(home, far, 1)], moved, -1), null);
  assert.equal(returnRange([], home, -1), null, "and nowhere to go back to is nothing to report");
});

test("only the step immediately behind is offered, and the trail keeps the rest", () => {
  // Walking back is one step at a time: from the far end of two jumps the
  // reader lands on the middle one, which is where the next press starts from.
  const middle = range("2150-01-01", "2150-03-31");
  const trail = [jump(home, middle, 1), jump(middle, far, 1)];
  assert.deepEqual(returnRange(trail, far, -1), middle);
  trail.pop();
  assert.deepEqual(returnRange(trail, middle, -1), home, "and the step before it is still there");
});
