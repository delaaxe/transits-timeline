// Reordering the chart chips: what a drop does to the saved list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { moveChart, reorderChartsByIds } from "../src/storage/charts.js";

const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (l) => l.map(p => p.id);

test("a chart moves to the index it was dropped on", () => {
  assert.deepEqual(ids(moveChart(list, "a", 2)), ["b", "c", "a"]);
  assert.deepEqual(ids(moveChart(list, "c", 0)), ["c", "a", "b"]);
  assert.deepEqual(ids(moveChart(list, "b", 1)), ["a", "b", "c"]);
});

test("an out-of-range index lands at the nearest end, and an unknown id changes nothing", () => {
  assert.deepEqual(ids(moveChart(list, "a", 99)), ["b", "c", "a"]);
  assert.deepEqual(ids(moveChart(list, "c", -5)), ["c", "a", "b"]);
  assert.deepEqual(ids(moveChart(list, "zz", 0)), ["a", "b", "c"]);
});

test("the dropped chip order becomes the list order", () => {
  assert.deepEqual(ids(reorderChartsByIds(list, ["c", "a", "b"])), ["c", "a", "b"]);
});

// The chips come from the DOM, which can be stale or partial - a drop must
// never be a way to lose a chart.
test("ids the list does not know are ignored and missing charts are kept", () => {
  assert.deepEqual(ids(reorderChartsByIds(list, ["c", "__add__", "gone", "c"])), ["c", "a", "b"]);
  assert.deepEqual(ids(reorderChartsByIds(list, [])), ["a", "b", "c"]);
});

test("reordering never mutates the list it was given", () => {
  const original = [...list];
  moveChart(list, "a", 2);
  reorderChartsByIds(list, ["c", "b", "a"]);
  assert.deepEqual(list, original);
});
