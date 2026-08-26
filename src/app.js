import { state } from "./state.js";
import { onRequestUpdate } from "./refresh.js";
import { calcNatalAscDeg, calcNatalMCDeg, chartRulerFromAsc, computeCompositeChart } from "./core/chart.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "./core/ephemeris.js";
import { addDaysLocal, parseBirthUTCFor, parseLocalDateOnly } from "./core/time.js";
import { buildCandidateRules, buildSkyRules } from "./core/transits.js";
import { orderMap } from "./data/bodies.js";
import { cancelCompute, computeEvents } from "./services/compute.js";
import { loadInterpretations, onInterpretationsArrived } from "./data/interpretations.js";
import { chartsState, getActiveChartA, getActiveChartB } from "./storage/charts.js";
import { el, setStatus } from "./ui/dom.js";
import { bootPresets, bootSelects, getCheckedAspects, initCharts, readRuleOptions, wireAdvancedUI, wireAutoUpdate, wireChartsUI, wireInstallHint, wireRangeNav } from "./ui/panels.js";
import { renderFromCache, updateShowMore, wireAxisScrollSync, wireTimelineResize } from "./ui/timeline.js";
import { refreshTooltipContent, wireTooltipDismiss } from "./ui/tooltip.js";

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
    cancelCompute();
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
    let composite = null;
    if (isComposite){
      composite = computeCompositeChart(chartA, chartB);
      lon = composite.location.lon;
      lat = composite.location.lat;
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

    const spanDays = (endExclusive.getTime() - rangeStartLocal.getTime()) / (24 * 3600 * 1000);
    // Windows now carry real times, so this only decides whether showing them
    // helps: on a multi-year view a date is what the eye wants.
    const showTime = spanDays <= 60;

    const natalTargets = Array.from(new Set(candidateRules.map(r => r.natal)));

    let chartRulerKey = null;
    /** @type {Record<string, number>|null} */
    let natalLon = null;
    if (state.appMode === "world"){
      chartRulerKey = null;
    } else if (isComposite && composite){
      natalLon = {};
      for (const k of natalTargets){
        natalLon[k] = (k === "mc") ? composite.mc : composite.lon[k];
      }
      chartRulerKey = chartRulerFromAsc(composite.asc);
    } else {
      natalLon = {};
      const birthAllPlanets = ephemerisAstronomy.getAllPlanets(birthUTC, lon, lat, height);
      for (const k of natalTargets){
        if (k === "mc"){
          natalLon[k] = calcNatalMCDeg(birthUTC, lon);
        } else {
          natalLon[k] = getBodyLonFromAll(birthAllPlanets, k, birthUTC);
        }
      }
      chartRulerKey = chartRulerFromAsc(calcNatalAscDeg(birthUTC, lon, lat));
    }

    const { rules: rulesOut, events: eventsByRule } = await computeEvents({
      mode: state.appMode === "world" ? "world" : "personal",
      startMs: rangeStartLocal.getTime(),
      endMs: endExclusive.getTime(),
      observer: { lon, lat, height },
      natalLon,
      rules: candidateRules
    }, (done, total) => setStatus(`Computing\u2026 ${done}/${total}`));

    const firstHitByRule = eventsByRule.map(events => events[0].start);

    const idxs = rulesOut.map((_, i) => i);
    idxs.sort((a,b) => {
      const da = firstHitByRule[a] - firstHitByRule[b];
      if (da !== 0) return da;
      const pa = (orderMap.get(rulesOut[a].transit) ?? 999) - (orderMap.get(rulesOut[b].transit) ?? 999);
      if (pa !== 0) return pa;
      return (orderMap.get(rulesOut[a].natal) ?? 999) - (orderMap.get(rulesOut[b].natal) ?? 999);
    });

    const rulesSorted = idxs.map(i => rulesOut[i]);
    const eventsSorted = idxs.map(i => eventsByRule[i]);

    // Cache full matches, then render up to the current maxRows
    state.cachedResults = {
      start: rangeStartLocal,
      endExclusive,
      showTime,
      presetKey: state.activePresetKey,
      rules: rulesSorted,
      events: eventsSorted,
      chartRuler: chartRulerKey
    };

    renderFromCache(state.currentMaxRows);
    state.lastTimelineRefreshAt = Date.now();

    const totalMatches = rulesSorted.length;
    const orbLabel = `${Number(el.orb.value || 0).toFixed(1)}°`;
    setStatus(`Done • ${orbLabel} orb • ${totalMatches} matches`);

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
    cancelCompute();
  });

  // Nothing on screen needs the interpretations, so the first timeline does not
  // wait for half a megabyte of prose. They are fetched once it is up, rather
  // than on the first click, so they are almost always there before anyone can
  // open a bar - and a popup opened inside that window is redrawn when they
  // land, since the tooltip holds keys rather than text.
  await updateTimeline();
  onInterpretationsArrived(refreshTooltipContent);
  whenIdle(() => loadInterpretations());
}

// requestIdleCallback where it exists, and a turn of the event loop where it
// does not; either way the first render has already happened.
function whenIdle(fn){
  const idle = /** @type {any} */ (window).requestIdleCallback;
  if (typeof idle === "function") idle(fn, { timeout: 2000 });
  else window.setTimeout(fn, 0);
}

if (typeof document !== "undefined") await boot();
