// Moving charts between devices as AAF, the astrological exchange format that
// Astro-Seek and the desktop programs read and write, so charts saved here can
// be opened elsewhere and charts kept elsewhere can be brought in. Files this
// app wrote in its own JSON before the change still read.
import { isDefaultChart, newId, normalizeChart, safeJSONParse } from "./charts.js";
import { formatAAF, looksLikeAAF, parseAAF } from "./aaf.js";

export const transferFormat = "transits-timeline/charts";
export const transferVersion = 1;
export const transferFileName = "transits-timeline-charts.aaf";
export const transferMimeType = "text/plain";

/** @param {any[]} charts @returns {string} */
/** @param {any[]} charts @returns {string} */
export function buildPayload(charts){
  return formatAAF(charts.map((p) => normalizeChart(p)));
}

/** @param {string} text @returns {any[]|null} */
function fromJSON(text){
  const data = safeJSONParse(text, null);
  if (!data) return null;
  const raw = Array.isArray(data) ? data : data.charts;
  if (!Array.isArray(raw)) throw new Error("That data has no charts in it.");
  if (!Array.isArray(data) && data.format && data.format !== transferFormat){
    throw new Error("That data came from a different app.");
  }
  return raw.filter((p) => p && typeof p === "object" && (p.birthDate || p.date));
}

/** @param {string} text @returns {any[]} */
export function parseCharts(text){
  const raw = looksLikeAAF(text) ? parseAAF(text) : fromJSON(text);
  if (!raw) throw new Error("That data is damaged.");
  const charts = raw.map((p) => {
    // isDefault marks the seeded sample, which is a local fact, not a chart.
    const { isDefault, ...c } = normalizeChart(p);
    return c;
  });
  if (charts.length === 0) throw new Error("That data has no charts in it.");
  return charts;
}

// What makes two records the same chart is the name it is filed under: a
// person is one chart here, and re-importing them is meant to bring their
// details up to date rather than leave a second Ada Lovelace on the list. Ids
// don't survive a round trip through two devices, and the birth data is the
// very thing an import is likely to be correcting, so neither can be the key.
/** @param {{name?: string}} p */
function identityOf(p){
  return (p.name || "").trim().toLowerCase();
}

// The fields an overwrite can actually change, in the order a reader reads
// them.
const chartFields = ["name", "birthDate", "birthTime", "placeLabel", "lat", "lon", "tzName", "tzOffset"];

const numericFields = new Set(["lat", "lon", "tzOffset"]);

// AAF states coordinates in whole arc seconds, so a chart that has been out to
// a file and back sits up to half a second off where it started - thirty
// metres, which is the same place by any standard a birth chart works to.
// Calling that a change would show a diff on every chart of every round trip.
const coordTolerance = 1 / 3600;

// A place is written out as one comma-separated line and AAF has no way to keep
// a comma inside a field, so a label comes back with its commas spaced out
// instead. Same place, same words, re-punctuated by the format.
/** @param {unknown} value */
function placeKey(value){
  return String(value ?? "").replace(/[\s,]+/g, " ").trim().toLowerCase();
}

/** Two values off the same field of two charts, straight from parsed JSON.
 * @param {string} key @param {any} a @param {any} b */
function sameValue(key, a, b){
  if (numericFields.has(key)) return Math.abs((+a || 0) - (+b || 0)) < coordTolerance;
  if (key === "placeLabel") return placeKey(a) === placeKey(b);
  return String(a ?? "").trim() === String(b ?? "").trim();
}

// Field by field, what importing `after` over `before` would change. An empty
// list means the two records say the same thing, whatever their ids.
/** @param {any} before @param {any} after @returns {{ key: string, from: any, to: any }[]} */
export function diffChart(before, after){
  // A zone given by name carries its own offset with it - a file states that
  // offset outright, this app looks it up - so the stored number is only the
  // record's own word where there is no name to speak for it.
  const named = !!(String(before.tzName ?? "").trim() || String(after.tzName ?? "").trim());
  const changes = [];
  for (const key of chartFields){
    if (key === "tzOffset" && named) continue;
    if (!sameValue(key, before[key], after[key])) changes.push({ key, from: before[key], to: after[key] });
  }
  return changes;
}

// The seeded sample is a placeholder, not a chart of the reader's: a real
// import replaces it rather than merging with it.
/** @param {any[]} existing @returns {any[]} */
function importBase(existing){
  return (existing.length === 1 && isDefaultChart(existing[0])) ? [] : existing.slice();
}

/**
 * What an import would do, chart by chart, so the dialog can show it before
 * anything is written: a chart is new, it overwrites the chart already filed
 * under that name, or it says exactly what that chart already says.
 * @param {any[]} existing @param {any[]} incoming
 * @returns {{ chart: any, before: any, changes: { key: string, from: any, to: any }[], status: "new" | "overwrite" | "same" }[]}
 */
export function planImport(existing, incoming){
  const byName = new Map(importBase(existing).map((p) => [identityOf(p), p]));
  /** @type {{ chart: any, before: any, changes: { key: string, from: any, to: any }[], status: "new" | "overwrite" | "same" }[]} */
  const plan = [];
  for (const chart of incoming){
    const key = identityOf(chart);
    const before = byName.get(key) || null;
    const changes = before ? diffChart(before, chart) : [];
    plan.push({ chart, before, changes, status: !before ? "new" : (changes.length ? "overwrite" : "same") });
    // A file naming the same person twice reads like an import onto an import:
    // the last record wins, the same way it would over two separate imports.
    byName.set(key, chart);
  }
  return plan;
}

// Merging follows that plan. An overwritten chart keeps its id and its place in
// the list, because it is the same chart to everything else here - the chip on
// screen, the chart last opened, whichever side of a synastry it is on.
/**
 * @param {any[]} existing @param {any[]} incoming
 * @returns {{ list: any[], added: any[], overwritten: { before: any, after: any, changes: { key: string, from: any, to: any }[] }[], unchanged: any[] }}
 */
export function mergeCharts(existing, incoming){
  const list = importBase(existing);
  const index = new Map(list.map((p, i) => [identityOf(p), i]));
  const ids = new Set(list.map((p) => p.id));
  const added = [];
  const overwritten = [];
  const unchanged = [];
  for (const { chart, changes, status } of planImport(list, incoming)){
    const at = index.get(identityOf(chart));
    if (status === "same"){
      unchanged.push(chart);
      continue;
    }
    if (status === "overwrite" && at !== undefined){
      const before = list[at];
      const after = { ...chart, id: before.id, isDefault: false };
      list[at] = after;
      overwritten.push({ before, after, changes });
      continue;
    }
    const c = { ...chart, id: ids.has(chart.id) ? newId() : chart.id, isDefault: false };
    ids.add(c.id);
    index.set(identityOf(c), list.length);
    list.push(c);
    added.push(c);
  }
  return { list, added, overwritten, unchanged };
}
