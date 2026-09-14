// Charts moving between devices as AAF: what a record carries, what still reads
// from the older JSON files, and what merging does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, diffChart, mergeCharts, parseCharts, planImport } from "../src/storage/transfer.js";
import { parseBirthUTCFor } from "../src/core/time.js";

const ada = {
  id: "c_ada", name: "Ada Lovelace", birthDate: "1815-12-10", birthTime: "12:00",
  placeLabel: "London, United Kingdom", lon: -0.1276, lat: 51.5072, tzName: "Europe/London"
};
const alan = { ...ada, id: "c_alan", name: "Alan Turing", birthDate: "1912-06-23" };

test("an exported AAF file carries the chosen charts and reads back unchanged", () => {
  const text = buildPayload([ada, alan]);
  const back = parseCharts(text);
  assert.deepEqual(back.map(p => p.name), ["Ada Lovelace", "Alan Turing"]);
  assert.equal(back[0].tzName, "Europe/London");
  assert.equal(back[0].placeLabel, "London, United Kingdom");
  assert.equal(back[1].birthDate, "1912-06-23");
  assert.equal(back[1].birthTime, "12:00");
  assert.ok(Math.abs(back[0].lon - ada.lon) < 0.001);
  assert.ok(Math.abs(back[0].lat - ada.lat) < 0.001);
});

// The chunk names, field order and separators are the format's, not ours: an
// AAF reader elsewhere only recognises this exact shape.
test("an exported record is written the way AAF spells it", () => {
  const lines = buildPayload([{
    ...ada, name: "Elon Musk", birthDate: "1971-06-28", birthTime: "07:30",
    placeLabel: "Pretoria, South Africa", lon: 28.2293, lat: -25.7479,
    tzName: "Africa/Johannesburg"
  }]).split("\n");
  assert.ok(lines.includes("#A93:Musk,Elon,*,28.6.1971,07:30,Pretoria,South Africa"));
  assert.ok(lines.includes("#B93:2441130.729167,25s44:52,28e13:45,2he00,0"));
  assert.ok(lines.includes("#ZNAM:Africa/Johannesburg"));
});

// The format definition works one record through in full. Reproducing it is the
// only check available here that another program's reader would recognise what
// this one writes.
test("a record matches the worked example in the AAF definition", () => {
  const text = buildPayload([{
    ...ada, name: "Peter Niehenke", birthDate: "1949-05-09", birthTime: "22:30",
    placeLabel: "Hamm, D", lon: 7.8167, lat: 51.6833, tzName: "Europe/Berlin"
  }]);
  assert.ok(text.includes("#A93:Niehenke,Peter,*,9.5.1949,22:30,Hamm,D"));
  // The definition prints this as `2433046.354167,51n41,7e49,1he,1`; the arc
  // seconds and zero minutes here are the same values written out in full.
  assert.ok(text.includes("#B93:2433046.354167,51n41:00,7e49:00,1he00,1"));
});

// AAF states the zone's standard offset and flags the daylight hour separately,
// so a summer birth has to come back as the same moment, not an hour off.
test("a daylight-saving birth keeps its moment through a round trip", () => {
  const summer = {
    ...ada, name: "Nadia", birthDate: "1985-07-13", birthTime: "18:45",
    placeLabel: "Paris, France", lon: 2.3522, lat: 48.8566, tzName: "Europe/Paris"
  };
  const text = buildPayload([summer]);
  assert.ok(text.includes(",1he00,1"));
  assert.equal(
    parseBirthUTCFor(parseCharts(text)[0]).toISOString(),
    parseBirthUTCFor(summer).toISOString()
  );
});

// A file from another program has no zone name to offer, only the offset, and
// half-hour zones are real.
test("a record without a zone name falls back to the offset it states", () => {
  const [chart] = parseCharts([
    "#A93:Sen,Ravi,m,5.1.1990,4:05,Mumbai,India",
    "#B93:*,19n04:34,72e52:40,5he30,0"
  ].join("\n"));
  assert.equal(chart.tzName, "");
  assert.equal(chart.tzOffset, 5.5);
  assert.equal(parseBirthUTCFor(chart).toISOString(), "1990-01-04T22:35:00.000Z");
});

// Position, aspect and sub-record chunks are another program's business; a
// record wrapped in them still has to arrive.
test("chunks this app has no use for are read past, not refused", () => {
  const charts = parseCharts([
    "#: exported by something else",
    "#A93:Hopper,Grace,f,9.12.1906,09:00,New York,US",
    "#B93:*,40n42,74w00,5hw00,0",
    "#SRC:Birth certificate",
    "#LPOS:So16Sg53:00,Mo29Le06:17",
    "#SUB1_ALT:^,^,^,^,09:22,^,^",
    "#B93:*,40n42,74w00,5hw00,0"
  ].join("\n"));
  assert.equal(charts.length, 1);
  assert.equal(charts[0].name, "Grace Hopper");
  assert.equal(charts[0].birthTime, "09:00");
  assert.equal(charts[0].placeLabel, "New York, US");
  assert.equal(charts[0].tzOffset, -5);
});

// The seeded sample is the app's chart, not the reader's: the dialog keeps it
// off the list, and the payload has nowhere to say what it was.
test("an export never carries the seeded-sample marker", () => {
  const text = buildPayload([{ ...ada, isDefault: true }]);
  assert.equal("isDefault" in parseCharts(text)[0], false);
});

test("files this app exported as JSON before still read", () => {
  const back = parseCharts(JSON.stringify({
    format: "transits-timeline/charts", version: 1, charts: [ada]
  }));
  assert.equal(back[0].name, "Ada Lovelace");
  assert.equal(back[0].tzName, "Europe/London");

  assert.deepEqual(parseCharts(JSON.stringify([ada])).map(p => p.name), ["Ada Lovelace"]);
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
  assert.throws(() => parseCharts("#A93:Nobody,,*,*,*,*,*"), /no charts/);
  assert.throws(() => parseCharts(`{"format":"something/else","charts":[{"birthDate":"1990-01-01"}]}`), /different app/);
});

test("merging adds what is new and never collides ids", () => {
  const existing = [{ ...ada }];

  const same = mergeCharts(existing, [ada, alan]);
  assert.deepEqual(same.added.map(p => p.name), ["Alan Turing"]);
  assert.deepEqual(same.unchanged.map(p => p.name), ["Ada Lovelace"]);
  assert.deepEqual(same.overwritten, []);
  assert.equal(same.list.length, 2);

  // Same id, different person: the incoming chart is rehomed, not dropped.
  const clash = mergeCharts(existing, [{ ...alan, id: "c_ada" }]);
  assert.equal(clash.list.length, 2);
  assert.notEqual(clash.list[1].id, "c_ada");
});

// The name is the key, so a corrected birth time arrives as a correction to the
// chart already here rather than as a second chart of the same person.
test("a chart with a name already here overwrites it in place", () => {
  const existing = [{ ...alan }, { ...ada }];
  const corrected = { ...ada, id: "c_elsewhere", birthTime: "13:15", placeLabel: "Paris, France" };

  const { list, added, overwritten, unchanged } = mergeCharts(existing, [corrected]);
  assert.deepEqual(added, []);
  assert.deepEqual(unchanged, []);
  assert.equal(overwritten.length, 1);
  assert.equal(list.length, 2);

  // Kept where it was, and still the same chart to everything else here.
  const [, after] = list;
  assert.equal(after.id, "c_ada");
  assert.equal(after.birthTime, "13:15");
  assert.equal(after.placeLabel, "Paris, France");
  assert.equal(after.birthDate, ada.birthDate);
  assert.equal(overwritten[0].before.birthTime, "12:00");
  assert.equal(overwritten[0].after, after);
});

test("the name is matched past case and surrounding space", () => {
  const { list, overwritten } = mergeCharts([{ ...ada }], [{ ...ada, name: "  ADA LOVELACE ", birthTime: "05:00" }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].birthTime, "05:00");
  assert.deepEqual(overwritten[0].changes.map(c => c.key), ["name", "birthTime"]);
});

test("a diff names every field an import would change, and nothing else", () => {
  assert.deepEqual(diffChart(ada, { ...ada }), []);
  assert.deepEqual(
    diffChart(ada, { ...ada, lat: 48.8566, lon: 2.3522, placeLabel: "Paris, France", tzName: "Europe/Paris" }).map(c => c.key),
    ["placeLabel", "lat", "lon", "tzName"]
  );
  const [change] = diffChart(ada, { ...ada, birthTime: "13:15" });
  assert.deepEqual(change, { key: "birthTime", from: "12:00", to: "13:15" });
});

test("a zone is compared by name where a record has one, by offset where it doesn't", () => {
  // Nothing but the number to go on: the number is the zone.
  const bare = { ...ada, tzName: "", tzOffset: 0 };
  assert.deepEqual(diffChart(bare, { ...bare, tzOffset: 5.5 }).map(c => c.key), ["tzOffset"]);
  // With a name on the record the offset follows from it, and a file states it
  // in its own terms - the app's included, which is to say not at all.
  assert.deepEqual(diffChart(ada, { ...ada, tzOffset: 5.5 }), []);
  assert.deepEqual(diffChart(ada, { ...ada, tzName: "Europe/Paris" }).map(c => c.key), ["tzName"]);
});

// A chart sent to another device and brought back is the same chart: the dialog
// must not offer to overwrite it with a worse-spelled copy of itself. AAF
// rounds coordinates to arc seconds and has nowhere to put the commas in a
// place label, and neither of those is a change to the chart.
test("a chart that has been out through a file and back reads as unchanged", () => {
  const here = {
    ...ada, name: "Frida Kahlo", birthDate: "1907-07-06", birthTime: "08:30",
    placeLabel: "Coyoacán, Mexico City, Mexico", lon: -99.1618, lat: 19.3467,
    tzName: "America/Mexico_City"
  };
  const [back] = parseCharts(buildPayload([here]));
  assert.notEqual(back.placeLabel, here.placeLabel);
  assert.notEqual(back.lat, here.lat);
  assert.deepEqual(diffChart(here, back), []);

  const { added, overwritten, unchanged, list } = mergeCharts([here], [back]);
  assert.deepEqual([added.length, overwritten.length, unchanged.length], [0, 0, 1]);
  assert.deepEqual(list, [here]);
});

// The dialog marks every row before anything is written, and has to mark it the
// way the merge will act.
test("the plan says what each incoming chart would do", () => {
  const plan = planImport([{ ...ada }], [
    { ...ada, birthTime: "13:15" },
    { ...ada, name: "Ada Lovelace", id: "c_third" },
    alan
  ]);
  assert.deepEqual(plan.map(e => e.status), ["overwrite", "overwrite", "new"]);
  assert.deepEqual(plan[0].changes.map(c => c.key), ["birthTime"]);
  assert.equal(plan[0].before.id, "c_ada");
  // A file naming the same person twice reads as an import onto an import, so
  // the second record is measured against the first, not against what is here.
  assert.deepEqual(plan[1].changes.map(c => c.key), ["birthTime"]);
  assert.equal(plan[2].before, null);
  assert.deepEqual(plan[2].changes, []);
});

test("a record that says what is already here changes nothing", () => {
  const { list, added, overwritten, unchanged } = mergeCharts([{ ...ada }], [{ ...ada, id: "c_elsewhere" }]);
  assert.deepEqual(added, []);
  assert.deepEqual(overwritten, []);
  assert.equal(unchanged.length, 1);
  assert.deepEqual(list, [ada]);
});

test("an import over the seeded sample replaces it", () => {
  const seeded = [{ ...ada, name: "Elon Musk", isDefault: true }];
  const { list } = mergeCharts(seeded, [alan]);
  assert.deepEqual(list.map(p => p.name), ["Alan Turing"]);

  // Even a chart of the same name as the sample arrives as a chart of one's
  // own rather than as an edit to the app's placeholder.
  const over = mergeCharts(seeded, [{ ...ada, name: "Elon Musk", birthTime: "07:30" }]);
  assert.deepEqual(over.added.map(p => p.name), ["Elon Musk"]);
  assert.equal(over.list.length, 1);
  assert.equal(over.list[0].isDefault, false);
});
