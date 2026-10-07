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

test("markers within one width of a run's first member join it, and no run is wider than that", async () => {
  const { clusterByGap } = await import("../src/ui/timeline.js");
  const at = (...xs) => xs.map(x => ({ x }));
  assert.deepEqual(clusterByGap(at(0, 5, 9, 40, 100, 104), 10).map(run => run.map(m => m.x)),
    [[0, 5, 9], [40], [100, 104]]);
  // A chain of near neighbours is cut every width, not kept as one run.
  assert.deepEqual(clusterByGap(at(0, 8, 16, 24), 10).map(run => run.map(m => m.x)), [[0, 8], [16, 24]]);
  assert.deepEqual(clusterByGap([], 10), []);
});

test("a folded marker leads with the Sun, then the classical planets, and never the Moon", async () => {
  const { leadMarker } = await import("../src/ui/timeline.js");
  const of = (...bodies) => bodies.map((body, i) => ({ body, i }));
  assert.equal(leadMarker(of("mercury", "sun", "chiron")).body, "sun");
  assert.equal(leadMarker(of("chiron", "jupiter")).body, "jupiter", "Jupiter over Chiron");
  assert.equal(leadMarker(of("neptune", "saturn")).body, "saturn", "Saturn over Neptune");
  assert.equal(leadMarker(of("mercury", "jupiter")).body, "jupiter", "slowest of the classical planets first");
  assert.equal(leadMarker(of("moon", "node")).body, "node", "the Moon leads nothing");
  assert.equal(leadMarker(of("venus", "venus")).i, 0, "the earliest of a tie");
});
