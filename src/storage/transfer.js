// Moving charts between devices as a file. The wire shape is deliberately
// plain: a version, and the same chart records the app already stores, so a
// file exported today still reads back after the chart shape grows.
import { isDefaultChart, newId, normalizeChart, safeJSONParse } from "./charts.js";

export const transferFormat = "transits-timeline/charts";
export const transferVersion = 1;

/** @param {any[]} charts @param {Date} [now] */
export function buildExport(charts, now = new Date()){
  return {
    format: transferFormat,
    version: transferVersion,
    exportedAt: now.toISOString(),
    charts: charts.map((p) => {
      const c = normalizeChart(p);
      // isDefault marks the seeded sample, which is a local fact, not a chart.
      delete c.isDefault;
      return c;
    })
  };
}

export function exportFilename(now = new Date()){
  const day = now.toISOString().slice(0, 10);
  return `transits-charts-${day}.json`;
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

/** @param {string} text @returns {any[]} */
export function parseImport(text){
  const data = safeJSONParse(text, null);
  if (!data) throw new Error("That file isn't valid JSON.");
  const raw = Array.isArray(data) ? data : data.charts;
  if (!Array.isArray(raw)) throw new Error("That file has no charts in it.");
  if (!Array.isArray(data) && data.format && data.format !== transferFormat){
    throw new Error("That file was exported by a different app.");
  }
  const charts = raw
    .filter((p) => p && typeof p === "object" && (p.birthDate || p.date))
    .map((p) => {
      const c = normalizeChart(p);
      delete c.isDefault;
      return c;
    });
  if (charts.length === 0) throw new Error("That file has no charts in it.");
  return charts;
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
