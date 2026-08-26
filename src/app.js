import { state } from "./state.js";
import { onRequestUpdate } from "./refresh.js";
import { angDist } from "./core/angles.js";
import { calcNatalAscDeg, calcNatalMCDeg, chartRulerFromAsc, computeCompositeChart } from "./core/chart.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "./core/ephemeris.js";
import { addDaysLocal, parseBirthUTCFor, parseLocalDateOnly } from "./core/time.js";
import { buildCandidateRules, buildSkyRules, buildTransitCacheKey, groupActiveIntervalsWithExact } from "./core/transits.js";
import { aspectAngle, orderMap } from "./data/bodies.js";
import { loadInterpretations } from "./data/interpretations.js";
import { presets } from "./data/presets.js";
import { chartsState, getActiveChartA, getActiveChartB } from "./storage/charts.js";
import { el, setStatus } from "./ui/dom.js";
import { bootPresets, bootSelects, getCheckedAspects, initCharts, readRuleOptions, wireAdvancedUI, wireAutoUpdate, wireChartsUI, wireInstallHint, wireRangeNav } from "./ui/panels.js";
import { renderFromCache, updateShowMore, wireAxisScrollSync, wireTimelineResize } from "./ui/timeline.js";
import { wireTooltipDismiss } from "./ui/tooltip.js";

export function maybeRefreshTimelineOnRefocus(){
  if (document.visibilityState === "hidden") return;
  if (state.isComputing) return;
  const now = Date.now();
  if ((now - state.lastRefocusCheckAt) < 1500) return;
  state.lastRefocusCheckAt = now;
  if (!state.lastTimelineRefreshAt || (now - state.lastTimelineRefreshAt) > (60 * 60 * 1000)){
    updateTimeline();
  }
}

export function wireStaleRefreshOnRefocus(){
  window.addEventListener("focus", maybeRefreshTimelineOnRefocus);
  window.addEventListener("pageshow", maybeRefreshTimelineOnRefocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"){
      maybeRefreshTimelineOnRefocus();
    }
  });
}

export async function updateTimeline(){
  if (state.isComputing){
    state.cancelRequested = true;
    state.pendingUpdate = true;
    return;
  }
  try{
    if (!ephemerisAstronomy || typeof ephemerisAstronomy.getAllPlanets !== "function"){
      throw new Error("Ephemeris library didn't load correctly (no getAllPlanets).");
    }

    state.isComputing = true;
    state.cancelRequested = false;
    state.pendingUpdate = false;
    el.updateBtn.style.display = "inline-block";
    el.updateBtn.disabled = false;
    setStatus("Computing…");

    const chartA = getActiveChartA();
    const chartB = getActiveChartB();
    const isPersonalMode = state.appMode === "personal";
    const isComposite = isPersonalMode && chartsState.mode === "composite";
    if (isPersonalMode && !chartA) throw new Error("Pick a chart first.");
    if (isComposite && !chartB) throw new Error("Pick two charts for composite.");
    let lon = Number(chartA?.lon || 0);
    let lat = Number(chartA?.lat || 0);
    const height = 0;
    state.cachedObserver = { lon, lat, height };
    let composite = null;
    if (isComposite){
      composite = computeCompositeChart(chartA, chartB);
      lon = composite.location.lon;
      lat = composite.location.lat;
      state.cachedObserver = { lon, lat, height };
    }

    state.currentMaxRows = 50;

    const birthUTC = (isPersonalMode && chartA) ? parseBirthUTCFor(chartA) : null;

    const rangeStartLocal = parseLocalDateOnly(el.rangeStart.value);
    const rangeEndLocal = parseLocalDateOnly(el.rangeEnd.value);
    const endExclusive = addDaysLocal(rangeEndLocal, 1);
    if (!(rangeStartLocal < endExclusive)) throw new Error("Timeline end must be after start.");

    const ruleOptions = readRuleOptions();
    const candidateRules = (state.appMode === "world") ? buildSkyRules(ruleOptions) : buildCandidateRules(ruleOptions);
    const aspectsChecked = getCheckedAspects();
    if (aspectsChecked.length === 0) throw new Error("Select at least one aspect.");

    const preset = presets.find(p => p.key === state.activePresetKey) ?? presets[0];
    const rangeDays = (endExclusive.getTime() - rangeStartLocal.getTime()) / (24 * 3600 * 1000);
    const stepDaysBase = preset?.stepDays ?? 1;
    const rangeYears = rangeDays / 365.25;
    const minStepDays = rangeYears > 4 ? 4 : (rangeYears > 2 ? 2 : 1);
    const stepDays = Math.max(minStepDays, stepDaysBase);

    let stepMillis;
    if (rangeDays <= 35){
      stepMillis = 1 * 3600 * 1000;
    } else {
      stepMillis = Math.max(1, Number(stepDays)) * 24 * 3600 * 1000;
    }

    const transitPlanetsAll = (state.appMode === "world")
      ? Array.from(new Set(candidateRules.flatMap(r => [r.transit, r.natal])))
      : Array.from(new Set(candidateRules.map(r => r.transit)));
    const transitPlanetsFiltered = transitPlanetsAll.filter(p => p !== "mc");
    const planetsKey = transitPlanetsFiltered.slice().sort().join(",");
    const cacheKey = buildTransitCacheKey({ rangeStartLocal, endExclusive, stepMillis, lon, lat, height, planetsKey });
    let sampleTimes;
    let transitLonBySample;

    if (state.transitCache && state.transitCache.key === cacheKey){
      sampleTimes = state.transitCache.sampleTimes;
      transitLonBySample = state.transitCache.transitLonBySample;
    } else {
      sampleTimes = [];
      for (let t = rangeStartLocal.getTime(); t < endExclusive.getTime(); t += stepMillis){
        sampleTimes.push(new Date(t));
      }
      if (sampleTimes.length === 0) throw new Error("Range too small to sample.");

      transitLonBySample = {};
      for (const p of transitPlanetsFiltered) transitLonBySample[p] = new Array(sampleTimes.length);

      for (let i=0; i<sampleTimes.length; i++){
        if (state.cancelRequested) throw new Error("Cancelled");
        const d = sampleTimes[i];
        if (i % 120 === 0) await new Promise(r => setTimeout(r, 0));
        const allPlanets = ephemerisAstronomy.getAllPlanets(d, lon, lat, height);
        for (const p of transitPlanetsFiltered){
          transitLonBySample[p][i] = getBodyLonFromAll(allPlanets, p, d);
        }
        if (i % 10 === 0 || i === sampleTimes.length - 1){
          setStatus(`Computing… ${i+1}/${sampleTimes.length}`);
        }
      }

      state.transitCache = { key: cacheKey, sampleTimes, transitLonBySample };
    }

    const natalTargets = Array.from(new Set(candidateRules.map(r => r.natal)));
    const transitPlanets = Array.from(new Set(candidateRules.map(r => r.transit)));

    let chartRulerKey = null;
    const natalLon = {};
    if (state.appMode === "world"){
      chartRulerKey = null;
      state.cachedNatalLon = null;
    } else if (isComposite && composite){
      for (const k of natalTargets){
        natalLon[k] = (k === "mc") ? composite.mc : composite.lon[k];
      }
      chartRulerKey = chartRulerFromAsc(composite.asc);
      state.cachedNatalLon = natalLon;
    } else {
      const birthAllPlanets = ephemerisAstronomy.getAllPlanets(birthUTC, lon, lat, height);
      for (const k of natalTargets){
        if (k === "mc"){
          natalLon[k] = calcNatalMCDeg(birthUTC, lon);
        } else {
          natalLon[k] = getBodyLonFromAll(birthAllPlanets, k, birthUTC);
        }
      }
      chartRulerKey = chartRulerFromAsc(calcNatalAscDeg(birthUTC, lon, lat));
      state.cachedNatalLon = natalLon;
    }

    const rulesOut = [];
    const intervalsByRule = [];
    const firstHitByRule = [];

    for (let rIdx=0; rIdx<candidateRules.length; rIdx++){
      if (state.cancelRequested) throw new Error("Cancelled");
      const r = candidateRules[rIdx];
      const asp = aspectAngle(r.aspect);
      const orb = Number(r.orb);

      const flags = new Array(sampleTimes.length).fill(false);
      const deltas = new Array(sampleTimes.length).fill(0);
      for (let i=0; i<sampleTimes.length; i++){
        if (state.cancelRequested) throw new Error("Cancelled");
        const tLon = transitLonBySample[r.transit][i];
        const nLon = (state.appMode === "world")
          ? transitLonBySample[r.natal][i]
          : natalLon[r.natal];
        const d = angDist(tLon, nLon);
        const delta = Math.abs(d - asp);
        deltas[i] = delta;
        if (delta <= orb) flags[i] = true;
      }

      const intervals = groupActiveIntervalsWithExact(flags, deltas, sampleTimes, endExclusive, true);
      if (intervals.length > 0){
        rulesOut.push(r);
        intervalsByRule.push(intervals);
        firstHitByRule.push(intervals[0][0].getTime());
      }
    }

    const idxs = rulesOut.map((_, i) => i);
    idxs.sort((a,b) => {
      const da = firstHitByRule[a] - firstHitByRule[b];
      if (da !== 0) return da;
      const pa = (orderMap.get(rulesOut[a].transit) ?? 999) - (orderMap.get(rulesOut[b].transit) ?? 999);
      if (pa !== 0) return pa;
      return (orderMap.get(rulesOut[a].natal) ?? 999) - (orderMap.get(rulesOut[b].natal) ?? 999);
    });

    const rulesSorted = idxs.map(i => rulesOut[i]);
    const intervalsSorted = idxs.map(i => intervalsByRule[i]);

    // Cache full matches, then render up to the current maxRows
    state.cachedResults = {
      start: rangeStartLocal,
      endExclusive,
      stepMillis,
      presetKey: state.activePresetKey,
      rules: rulesSorted,
      intervals: intervalsSorted,
      chartRuler: chartRulerKey,
      observer: state.cachedObserver,
      natalLon: state.cachedNatalLon
    };

    renderFromCache(state.currentMaxRows);
    state.lastTimelineRefreshAt = Date.now();

    const totalMatches = rulesSorted.length;
    const showTime = stepMillis < 24*3600*1000;
    const stepLabel = showTime ? `${Math.round(stepMillis/(3600*1000))}h` : `${Math.round(stepMillis/(24*3600*1000))}d`;
    const orbLabel = `${Number(el.orb.value || 0).toFixed(1)}°`;
    setStatus(`Done • ${stepLabel} step • ${orbLabel} orb • ${totalMatches} matches`);

  } catch (err){
    if (state.cancelRequested && String(err?.message || err) === "Cancelled"){
      setStatus("Cancelled.");
      state.cachedResults = null;
      updateShowMore(0, 0);
      return;
    }
    console.error(err);
    setStatus(String(err?.message || err), true);
    state.cachedResults = null;
    updateShowMore(0, 0);
  } finally {
    state.isComputing = false;
    state.cancelRequested = false;
    el.updateBtn.style.display = "none";
    el.updateBtn.disabled = false;
    if (state.pendingUpdate){
      state.pendingUpdate = false;
      updateTimeline();
    }
  }
}

export // All DOM work hangs off boot, so every module stays importable in Node.
async function boot(){
  onRequestUpdate(updateTimeline);
  bootSelects();
  bootPresets();

  if (el.showMoreBtn){
    el.showMoreBtn.addEventListener("click", () => {
      state.currentMaxRows = state.currentMaxRows + 50;
      renderFromCache(state.currentMaxRows);
    });
  }

  // init charts UI
  await loadInterpretations();
  initCharts();
  wireChartsUI();
  wireAdvancedUI();
  wireAutoUpdate();
  wireAxisScrollSync();
  wireTimelineResize();
  wireRangeNav();
  wireTooltipDismiss();
  wireStaleRefreshOnRefocus();
  wireInstallHint();

  el.updateBtn.addEventListener("click", () => {
    if (!state.isComputing) return;
    state.cancelRequested = true;
    setStatus("Cancelling…");
  });
  updateTimeline();
}

if (typeof document !== "undefined") await boot();
