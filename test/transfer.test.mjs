// Charts moving between devices as AAF: what a record carries, what still reads
// from the older JSON files, and what merging does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, mergeCharts, parseCharts } from "../src/storage/transfer.js";
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

test("merging adds what is new, skips what is already here, and never collides ids", () => {
  const existing = [{ ...ada }];

  const same = mergeCharts(existing, [ada, alan]);
  assert.deepEqual(same.added.map(p => p.name), ["Alan Turing"]);
  assert.deepEqual(same.duplicates.map(p => p.name), ["Ada Lovelace"]);
  assert.equal(same.list.length, 2);

  // Same id, different person: the incoming chart is rehomed, not dropped.
  const clash = mergeCharts(existing, [{ ...alan, id: "c_ada" }]);
  assert.equal(clash.list.length, 2);
  assert.notEqual(clash.list[1].id, "c_ada");
});

test("an import over the seeded sample replaces it", () => {
  const seeded = [{ ...ada, name: "Elon Musk", isDefault: true }];
  const { list } = mergeCharts(seeded, [alan]);
  assert.deepEqual(list.map(p => p.name), ["Alan Turing"]);
});
