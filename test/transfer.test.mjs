// Charts moving between devices as JSON: what it carries, and what merging does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, mergeCharts, parseCharts } from "../src/storage/transfer.js";

const ada = {
  id: "c_ada", name: "Ada", birthDate: "1815-12-10", birthTime: "12:00",
  placeLabel: "London", lon: -0.1276, lat: 51.5072, tzName: "Europe/London"
};
const alan = { ...ada, id: "c_alan", name: "Alan", birthDate: "1912-06-23" };

test("an exported JSON payload carries the chosen charts and reads back unchanged", () => {
  const json = JSON.stringify(buildPayload([ada, alan]));
  const back = parseCharts(json);
  assert.deepEqual(back.map(p => p.name), ["Ada", "Alan"]);
  assert.equal(back[0].tzName, "Europe/London");
  assert.equal(back[1].birthDate, "1912-06-23");
});

// The seeded sample is the app's chart, not the reader's: the dialog keeps it
// off the list, and the payload drops the marker that says what it was.
test("an export never carries the seeded-sample marker", () => {
  const payload = buildPayload([{ ...ada, isDefault: true }]);
  assert.equal("isDefault" in payload.charts[0], false);
  assert.equal("isDefault" in parseCharts(JSON.stringify(payload))[0], false);
});

test("a raw array remains valid import data", () => {
  assert.deepEqual(parseCharts(JSON.stringify([ada])).map(p => p.name), ["Ada"]);
});

test("legacy field names still read", () => {
  const back = parseCharts(JSON.stringify([
    { name: "Grace", date: "1906-12-09", time: "09:00", place: "NYC", longitude: -74, latitude: 40.7 }
  ]));
  assert.equal(back[0].birthDate, "1906-12-09");
  assert.equal(back[0].placeLabel, "NYC");
  assert.equal(back[0].lon, -74);
  assert.ok(back[0].id);
});

test("junk is refused with a message rather than imported", () => {
  assert.throws(() => parseCharts("not json"), /damaged/);
  assert.throws(() => parseCharts('{"charts":[]}'), /no charts/);
  assert.throws(() => parseCharts(`{"format":"something/else","charts":[{"birthDate":"1990-01-01"}]}`), /different app/);
});

test("merging adds what is new, skips what is already here, and never collides ids", () => {
  const existing = [{ ...ada }];

  const same = mergeCharts(existing, [ada, alan]);
  assert.deepEqual(same.added.map(p => p.name), ["Alan"]);
  assert.deepEqual(same.duplicates.map(p => p.name), ["Ada"]);
  assert.equal(same.list.length, 2);

  // Same id, different person: the incoming chart is rehomed, not dropped.
  const clash = mergeCharts(existing, [{ ...alan, id: "c_ada" }]);
  assert.equal(clash.list.length, 2);
  assert.notEqual(clash.list[1].id, "c_ada");
});

test("an import over the seeded sample replaces it", () => {
  const seeded = [{ ...ada, name: "Elon Musk", isDefault: true }];
  const { list } = mergeCharts(seeded, [alan]);
  assert.deepEqual(list.map(p => p.name), ["Alan"]);
});
