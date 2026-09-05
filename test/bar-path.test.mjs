import test from "node:test";
import assert from "node:assert/strict";
import { barPath } from "../src/ui/timeline.js";

// The cut end is the one the timeline window truncates: it must be a straight
// vertical, never an arc, so it does not read as the transit ending there.
test("a clipped end is cut square and the other stays rounded", () => {
  const cutStart = barPath(10, 0, 100, 20, false, true);
  // The left side closes straight up to the top corner, with no arc.
  assert.match(cutStart, /L 10 20 Z$/);
  // The right side still turns.
  assert.equal((cutStart.match(/A /g) ?? []).length, 2);

  const cutEnd = barPath(10, 0, 100, 20, true, false);
  assert.match(cutEnd, /L 110 0 L 110 20/);
  assert.equal((cutEnd.match(/A /g) ?? []).length, 2);
});

test("both ends clipped gives a plain rectangle", () => {
  const p = barPath(0, 0, 50, 20, false, false);
  assert.equal(p, "M 0 0 L 50 0 L 50 20 L 0 20 Z");
});

test("the radius never exceeds the height or the width it has to fit", () => {
  // A one-day bar: the corners share a width narrower than the bar is tall.
  const narrow = barPath(0, 0, 6, 20, true, true);
  assert.match(narrow, /A 3 3 /);
  assert.ok(!narrow.includes("A 10 10"));
  // One rounded end may use the full width.
  assert.match(barPath(0, 0, 6, 20, true, false), /A 6 6 /);
  // Tall bars clamp at half the height.
  assert.match(barPath(0, 0, 100, 20, true, true), /A 10 10 /);
});
