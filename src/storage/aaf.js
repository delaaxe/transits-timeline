// AAF, the astrological exchange format (Garms/Ferber, AAF'97), as read and
// written by Astro-Seek, Astrodienst and most desktop astrology software. A
// file is a stream of records; a record is an #A93 chunk (what a person reads:
// name, sex, date, civil time, place) optionally followed by a #B93 chunk (what
// a computer needs: Julian day, latitude, longitude, zone offset, time type)
// and annotation chunks. Fields are comma separated, so no field may hold a
// comma, and `*` stands for a value nobody knows.
import { tzOffsetMinutesAt } from "../core/time.js";

const SIGNLESS = "*";

// A birth moment is stored here as a wall clock plus an IANA zone, which is
// what the chart maths wants; AAF instead wants the zone's standard offset and
// a flag for the daylight hour on top. The offset in force at birth is the sum,
// and the standard offset is the smallest the zone reaches over that year, so
// what is left over is the daylight part.
export function zoneOffsetsAt(chart, year){
  const tzName = chart.tzName;
  if (!tzName) return { standard: +chart.tzOffset * 60 || 0, dst: 0 };
  const at = (month) => tzOffsetMinutesAt(new Date(Date.UTC(year, month, 15, 12)), tzName);
  let standard = Infinity;
  for (let month = 0; month < 12; month++) standard = Math.min(standard, at(month));
  const [y, m, d] = String(chart.birthDate).split("-").map(Number);
  const [hh, mm] = String(chart.birthTime || "00:00").split(":").map(Number);
  // Two passes, because reading the offset needs a moment and building the
  // moment needs the offset; the second reading is the one that holds.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = tzOffsetMinutesAt(new Date(guess), tzName);
  const actual = tzOffsetMinutesAt(new Date(guess - first * 60000), tzName);
  return { standard, dst: actual - standard };
}

// `0` plain, `1` the usual daylight hour, `2` a double one, `h` a half hour.
function timeTypeFor(dstMinutes){
  if (dstMinutes >= 120) return "2";
  if (dstMinutes >= 60) return "1";
  if (dstMinutes > 0) return "h";
  return "0";
}

function dstMinutesFor(timeType){
  const t = String(timeType || "0").trim();
  if (t === "1" || t.toLowerCase() === "w") return 60;
  if (t === "2") return 120;
  if (t === "h") return 30;
  return 0;
}

function pad(n){ return String(Math.trunc(Math.abs(n))).padStart(2, "0"); }

// Degrees as AAF writes them: whole degrees, then the hemisphere letter in
// place of a separator, then arc minutes and seconds.
function formatDegrees(value, positive, negative){
  const sign = value < 0 ? negative : positive;
  const total = Math.round(Math.abs(value) * 3600);
  const deg = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${deg}${sign}${pad(min)}:${pad(sec)}`;
}

function parseDegrees(text, positive, negative){
  const m = /^\s*(\d+)\s*([a-z])\s*(\d+)(?::(\d+(?:\.\d+)?))?\s*$/i.exec(text || "");
  if (!m) return null;
  const sign = m[2].toLowerCase();
  if (sign !== positive && sign !== negative) return null;
  const value = +m[1] + (+m[3]) / 60 + (+(m[4] || 0)) / 3600;
  return sign === negative ? -value : value;
}

// The zone offset field wears its sign as `he`/`hw` rather than a hemisphere
// letter, so it gets its own pair.
function formatOffset(minutes){
  const sign = minutes < 0 ? "hw" : "he";
  const total = Math.round(Math.abs(minutes) * 60);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return ss ? `${hh}${sign}${pad(mm)}:${pad(ss)}` : `${hh}${sign}${pad(mm)}`;
}

function parseOffset(text){
  const m = /^\s*(-?\d+)\s*(he|hw|h)\s*(\d+)?(?::(\d+))?\s*$/i.exec(text || "");
  if (!m) return null;
  const minutes = +m[1] * 60 + (+(m[3] || 0)) + (+(m[4] || 0)) / 60;
  return /w/i.test(m[2]) ? -minutes : minutes;
}

// AAF splits a person into last name and first names. Nothing here knows which
// part of a name is which, so the last word goes in the surname field, which is
// the convention that survives a round trip through Astro-Seek unharmed.
function splitName(name){
  const clean = String(name || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return { last: "(unnamed)", first: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { last: parts[0], first: "" };
  return { last: parts.at(-1), first: parts.slice(0, -1).join(" ") };
}

function joinName(last, first){
  const l = clean(last), f = clean(first);
  const name = [f, l].filter(Boolean).join(" ").trim();
  return name || "(unnamed)";
}

// A birthplace is held here as one written line, "district, city, country";
// AAF keeps the country apart from the rest and forbids commas in either.
function splitPlace(placeLabel){
  const parts = String(placeLabel || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { place: "", country: "" };
  if (parts.length === 1) return { place: parts[0], country: "" };
  return { place: parts.slice(0, -1).join(" "), country: parts.at(-1) };
}

function clean(field){
  const value = String(field ?? "").trim();
  return value === SIGNLESS || value === "^" ? "" : value;
}

function formatDate(birthDate){
  const [y, m, d] = String(birthDate || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return SIGNLESS;
  return `${d}.${m}.${y}`;
}

function parseDate(text){
  const m = /^\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(-?\d{1,6})\s*[gj]?\s*$/i.exec(text || "");
  if (!m) return "";
  const year = +m[3];
  const sign = year < 0 ? "-" : "";
  return `${sign}${String(Math.abs(year)).padStart(4, "0")}-${pad(+m[2])}-${pad(+m[1])}`;
}

// Hours may be separated from minutes by `:` or `h`, and both minutes and
// seconds are optional. Seconds are dropped: nothing here keeps them.
function parseTime(text){
  const m = /^\s*(\d{1,2})\s*(?::|h)?\s*(\d{1,2})?\s*(?::\s*(\d{1,2}))?\s*$/i.exec(text || "");
  if (!m) return "";
  return `${pad(+m[1])}:${pad(+(m[2] || 0))}`;
}

/**
 * One chart as an AAF record.
 * @param {any} chart @returns {string}
 */
export function formatRecord(chart){
  const { last, first } = splitName(chart.name);
  const { place, country } = splitPlace(chart.placeLabel);
  const year = +String(chart.birthDate).slice(0, 4) || 2000;
  const { standard, dst } = zoneOffsetsAt(chart, year);
  const lines = [
    `#A93:${last},${first},${SIGNLESS},${formatDate(chart.birthDate)},${chart.birthTime || SIGNLESS},${place},${country}`,
    `#B93:${SIGNLESS},${formatDegrees(+chart.lat, "n", "s")},${formatDegrees(+chart.lon, "e", "w")},${formatOffset(standard)},${timeTypeFor(dst)}`
  ];
  // The zone name is the one thing AAF has no field for that this app would
  // rather not lose: with it a re-import gets the daylight rules back, without
  // it only the offset written above.
  if (chart.tzName) lines.push(`#ZNAM:${chart.tzName}`);
  return lines.join("\n");
}

/**
 * A whole file: a comment chunk naming the writer, then a record per chart.
 * @param {any[]} charts @returns {string}
 */
export function formatAAF(charts){
  const head = "#: Transits Timeline - AAF (Astrological Exchange Format)";
  return [head, ...charts.map(formatRecord), ""].join("\n");
}

function chunkOf(line){
  // `#:` is the invisible chunk, which carries no id and no meaning.
  const m = /^#([A-Za-z0-9_]*):(.*)$/.exec(line);
  if (!m) return null;
  return { id: m[1].toUpperCase(), body: m[2] };
}

function recordToChart(record){
  const a = record.a93;
  const b = record.b93 || [];
  const birthDate = parseDate(a[3]);
  if (!birthDate) return null;
  const lat = parseDegrees(b[1], "n", "s");
  const lon = parseDegrees(b[2], "e", "w");
  const offset = parseOffset(b[3]);
  const dst = dstMinutesFor(b[4]);
  const placeLabel = [clean(a[5]), clean(a[6])].filter(Boolean).join(", ");
  const chart = {
    name: joinName(a[0], a[1]),
    birthDate,
    birthTime: parseTime(a[4]) || "12:00",
    placeLabel,
    lon: lon ?? 0,
    lat: lat ?? 0,
    tzName: /\//.test(record.znam || "") || /^UTC$/i.test(record.znam || "") ? record.znam : "",
    tzOffset: offset === null ? 0 : (offset + dst) / 60
  };
  return chart;
}

/**
 * Every record in an AAF file. Chunks this app has no use for - positions,
 * aspects, house cusps, sources - are read past rather than refused, and so are
 * embedded #SUB charts, which are variants of a record rather than charts of
 * their own.
 * @param {string} text @returns {any[]}
 */
export function parseAAF(text){
  const charts = [];
  let record = null;
  let skipping = false;
  const finish = () => {
    if (!record) return;
    const chart = recordToChart(record);
    if (chart) charts.push(chart);
    record = null;
  };
  for (const raw of String(text).split(/\r?\n/)){
    const line = raw.trimEnd();
    const chunk = chunkOf(line);
    if (!chunk) continue;
    if (chunk.id === "A93"){
      finish();
      skipping = false;
      record = { a93: chunk.body.split(","), b93: null, znam: "" };
      continue;
    }
    if (chunk.id.startsWith("SUB")){ skipping = true; continue; }
    if (!record || skipping) continue;
    if (chunk.id === "B93") record.b93 = chunk.body.split(",");
    else if (chunk.id === "ZNAM") record.znam = clean(chunk.body);
  }
  finish();
  return charts;
}

export function looksLikeAAF(text){
  return /^\s*#[A-Za-z0-9_]*:/m.test(String(text));
}
