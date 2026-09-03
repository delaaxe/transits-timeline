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
export function buildPayload(charts){
  return formatAAF(charts.map((p) => normalizeChart(p)));
}

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
    const c = normalizeChart(p);
    // isDefault marks the seeded sample, which is a local fact, not a chart.
    delete c.isDefault;
    return c;
  });
  if (charts.length === 0) throw new Error("That data has no charts in it.");
  return charts;
}

// What makes two records the same chart to a human: same person, same moment,
// same place. Ids don't survive a round trip through two devices.
function identityOf(p){
  return [
    (p.name || "").trim().toLowerCase(),
    p.birthDate, p.birthTime,
    (+p.lon).toFixed(4), (+p.lat).toFixed(4)
  ].join("|");
}

// Merge is additive and never edits an existing chart: a chart already here
// wins, and anything genuinely new arrives with an id that can't collide.
/**
 * @param {any[]} existing @param {any[]} incoming
 * @returns {{ list: any[], added: any[], duplicates: any[] }}
 */
export function mergeCharts(existing, incoming){
  // The seeded sample is a placeholder; a real import replaces it.
  const base = (existing.length === 1 && isDefaultChart(existing[0])) ? [] : existing.slice();
  const seen = new Set(base.map(identityOf));
  const ids = new Set(base.map((p) => p.id));
  const added = [];
  const duplicates = [];
  for (const chart of incoming){
    const key = identityOf(chart);
    if (seen.has(key)){
      duplicates.push(chart);
      continue;
    }
    seen.add(key);
    const c = { ...chart, id: ids.has(chart.id) ? newId() : chart.id };
    ids.add(c.id);
    base.push(c);
    added.push(c);
  }
  return { list: base, added, duplicates };
}
