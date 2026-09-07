// Where the chart being read actually is: the observer, the birth moment, and
// the natal longitudes a scan needs.
//
// This used to live inside updateTimeline, which was fine while one place asked
// for it. The occurrence search asks the same question about the same chart from
// somewhere else entirely, and two copies of "unless it is a composite, in which
// case the midpoints" is exactly the kind of pair that drifts.

import { calcNatalAscDeg, calcNatalMCDeg, chartRulerFromAsc, computeCompositeChart } from "../core/chart.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "../core/ephemeris.js";
import { parseBirthUTCFor } from "../core/time.js";
import { state } from "../state.js";
import { chartsState, getActiveChartA, getActiveChartB } from "../storage/charts.js";

/**
 * @typedef {Object} ChartContext
 * @property {"personal"|"world"} mode
 * @property {{lon:number, lat:number, height:number}} observer
 * @property {Date|null} birthUTC null in world mode and for a composite
 * @property {any} composite the computed midpoint chart, or null
 */

/** @returns {ChartContext} */
export function currentChartContext(){
  const chartA = getActiveChartA();
  const chartB = getActiveChartB();
  const isPersonal = state.appMode === "personal";
  const isComposite = isPersonal && chartsState.mode === "composite";
  if (isPersonal && !chartA) throw new Error("Pick a chart first.");
  if (isComposite && !chartB) throw new Error("Pick two charts for composite.");

  let lon = Number(chartA?.lon || 0);
  let lat = Number(chartA?.lat || 0);
  /** @type {any} */
  let composite = null;
  if (isComposite){
    composite = computeCompositeChart(chartA, chartB);
    lon = composite.location.lon;
    lat = composite.location.lat;
  }

  return {
    mode: isPersonal ? "personal" : "world",
    observer: { lon, lat, height: 0 },
    birthUTC: (isPersonal && chartA) ? parseBirthUTCFor(chartA) : null,
    composite
  };
}

/**
 * The fixed longitude of each natal point a scan is about to look for. World
 * mode has none: both ends of a sky aspect move.
 *
 * @param {ChartContext} ctx @param {string[]} targets
 * @returns {Record<string, number>|null}
 */
export function natalLongitudes(ctx, targets){
  if (ctx.mode === "world") return null;
  /** @type {Record<string, number>} */
  const out = {};
  if (ctx.composite){
    for (const k of targets){
      out[k] = (k === "mc") ? ctx.composite.mc
        : (k === "asc") ? ctx.composite.asc
        : ctx.composite.lon[k];
    }
    return out;
  }
  const birthUTC = ctx.birthUTC;
  const birthAllPlanets = ephemerisAstronomy.getAllPlanets(birthUTC, ctx.observer.lon, ctx.observer.lat, ctx.observer.height);
  for (const k of targets){
    if (k === "mc"){
      out[k] = calcNatalMCDeg(birthUTC, ctx.observer.lon);
    } else if (k === "asc"){
      out[k] = calcNatalAscDeg(birthUTC, ctx.observer.lon, ctx.observer.lat);
    } else {
      out[k] = getBodyLonFromAll(birthAllPlanets, k, birthUTC);
    }
  }
  return out;
}

/**
 * The traditional ruler of the rising sign, which the row labels underline.
 * @param {ChartContext} ctx
 */
export function chartRulerKeyFor(ctx){
  if (ctx.mode === "world") return null;
  if (ctx.composite) return chartRulerFromAsc(ctx.composite.asc);
  return chartRulerFromAsc(calcNatalAscDeg(ctx.birthUTC, ctx.observer.lon, ctx.observer.lat));
}
