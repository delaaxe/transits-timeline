// Charts moving between devices: what the file says, and what merging does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, mergeCharts, parseImport, transferFormat } from "../src/storage/transfer.js";

const ada = {
  id: "c_ada", name: "Ada", birthDate: "1815-12-10", birthTime: "12:00",
  placeLabel: "London", lon: -0.1276, lat: 51.5072, tzName: "Europe/London"
};
const alan = { ...ada, id: "c_alan", name: "Alan", birthDate: "1912-06-23" };

test("an export carries the chosen charts and reads back unchanged", () => {
  const payload = buildExport([ada, alan]);
  assert.equal(payload.format, transferFormat);
  assert.equal(payload.charts.length, 2);
  assert.equal("isDefault" in payload.charts[0], false);

  const back = parseImport(JSON.stringify(payload));
  assert.deepEqual(back.map(p => p.name), ["Ada", "Alan"]);
  assert.equal(back[0].tzName, "Europe/London");
  assert.equal(back[1].birthDate, "1912-06-23");
});

test("a bare array and the legacy field names still import", () => {
  const back = parseImport(JSON.stringify([
    { name: "Grace", date: "1906-12-09", time: "09:00", place: "NYC", longitude: -74, latitude: 40.7 }
  ]));
  assert.equal(back[0].birthDate, "1906-12-09");
  assert.equal(back[0].placeLabel, "NYC");
  assert.equal(back[0].lon, -74);
  assert.ok(back[0].id);
});

test("junk is refused with a message rather than imported", () => {
  assert.throws(() => parseImport("not json"), /valid JSON/);
  assert.throws(() => parseImport('{"charts":[]}'), /no charts/);
  assert.throws(() => parseImport('{"format":"something/else","charts":[{"birthDate":"1990-01-01"}]}'), /different app/);
});

test("merging adds what is new, skips what is already here, and never collides ids", () => {
  const existing = [{ ...ada }];

  const same = mergeCharts(existing, parseImport(JSON.stringify(buildExport([ada, alan]))));
  assert.deepEqual(same.added.map(p => p.name), ["Alan"]);
  assert.deepEqual(same.duplicates.map(p => p.name), ["Ada"]);
  assert.equal(same.list.length, 2);

  // Same id, different person: the incoming chart is rehomed, not dropped.
  const clash = mergeCharts(existing, [{ ...alan, id: "c_ada" }]);
  assert.equal(clash.list.length, 2);
  assert.notEqual(clash.list[1].id, "c_ada");
});

test("importing over the seeded sample replaces it", () => {
  const seeded = [{ ...ada, name: "Elon Musk", isDefault: true }];
  const { list } = mergeCharts(seeded, [alan]);
  assert.deepEqual(list.map(p => p.name), ["Alan"]);
});
