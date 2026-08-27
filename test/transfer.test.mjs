// Charts moving between devices in a link: what it carries, and what merging does.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShareURL, decodeCharts, encodeCharts, mergeCharts, parseCharts, readShareHash, readShareText } from "../src/storage/transfer.js";

const ada = {
  id: "c_ada", name: "Ada", birthDate: "1815-12-10", birthTime: "12:00",
  placeLabel: "London", lon: -0.1276, lat: 51.5072, tzName: "Europe/London"
};
const alan = { ...ada, id: "c_alan", name: "Alan", birthDate: "1912-06-23" };

test("a link carries the chosen charts and reads back unchanged", async () => {
  const url = await buildShareURL([ada, alan], "https://transits.example/app?x=1");

  // Everything travels in the fragment, which browsers never send to a server.
  assert.equal(url.startsWith("https://transits.example/app?x=1#charts="), true);
  assert.equal(/[+/=]/.test(readShareHash(new URL(url).hash)), false, "base64url only, so pasting survives");

  const back = await decodeCharts(readShareHash(new URL(url).hash));
  assert.deepEqual(back.map(p => p.name), ["Ada", "Alan"]);
  assert.equal(back[0].tzName, "Europe/London");
  assert.equal(back[1].birthDate, "1912-06-23");
});

test("a fistful of charts still fits in a link", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ ...ada, id: `c_${i}`, name: `Chart ${i}` }));
  const url = await buildShareURL(many, "https://transits.example/");
  assert.ok(url.length < 2000, `link was ${url.length} chars`);
  assert.equal((await decodeCharts(readShareHash(new URL(url).hash))).length, 8);
});

test("a link built without compression still opens", async () => {
  const saved = globalThis.CompressionStream;
  // @ts-ignore - standing in for a browser that has no CompressionStream.
  delete globalThis.CompressionStream;
  try {
    const encoded = await encodeCharts([ada]);
    assert.deepEqual((await decodeCharts(encoded)).map(p => p.name), ["Ada"]);
  } finally {
    globalThis.CompressionStream = saved;
  }
});

test("only our own fragment is treated as a share link", () => {
  assert.equal(readShareHash("#charts=abc"), "abc");
  assert.equal(readShareHash("#section=charts"), "");
  assert.equal(readShareHash(""), "");
});

test("a pasted link is read whole, or as just its fragment", async () => {
  const url = await buildShareURL([ada], "https://transits.me/");
  const encoded = readShareHash(new URL(url).hash);

  assert.equal(readShareText(`  ${url}  `), encoded, "a whole URL, with the whitespace a paste brings");
  assert.equal(readShareText(`#charts=${encoded}`), encoded);
  assert.equal(readShareText(`charts=${encoded}`), encoded);
  assert.equal(readShareText("https://transits.me/"), "");
  assert.equal(readShareText(""), "");
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

test("junk is refused with a message rather than imported", async () => {
  assert.throws(() => parseCharts("not json"), /damaged/);
  assert.throws(() => parseCharts('{"charts":[]}'), /no charts/);
  assert.throws(() => parseCharts(`{"format":"something/else","charts":[{"birthDate":"1990-01-01"}]}`), /different app/);
  await assert.rejects(decodeCharts("!!!not-base64!!!"), /damaged/);
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

test("a link opened over the seeded sample replaces it", () => {
  const seeded = [{ ...ada, name: "Elon Musk", isDefault: true }];
  const { list } = mergeCharts(seeded, [alan]);
  assert.deepEqual(list.map(p => p.name), ["Alan"]);
});
