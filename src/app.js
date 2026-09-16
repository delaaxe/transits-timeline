import { state } from "./state.js";
import { onRequestUpdate } from "./refresh.js";
import { ephemerisAstronomy } from "./core/ephemeris.js";
import { addDaysLocal, parseLocalDateOnly } from "./core/time.js";
import { buildCandidateRules, buildWorldRules } from "./core/transits.js";
import { orderMap } from "./data/bodies.js";
import { chartRulerKeyFor, currentChartContext, natalLongitudes } from "./services/chart-context.js";
import { cancelCompute, computeEvents } from "./services/compute.js";
import { loadInterpretations, onInterpretationsArrived } from "./data/interpretations.js";
import { el, setStatus, setTimelineState } from "./ui/dom.js";
import { getCheckedAspects, wireAspectShortcuts } from "./ui/aspects.js";
import { onBodiesChanged, wireBodyPicker } from "./ui/bodies.js";
import { bootPresets, initCharts, readRuleOptions, renderPresetSection, wireAdvancedUI, wireAutoUpdate, wireChartsUI, wireInstallHint, wireRangeNav, wireViewBar } from "./ui/panels.js";
import { clearRowFocus, renderRowFocus, wireRowFocus } from "./ui/rowfocus.js";
import { clearTimeline, renderFromCache, updateShowMore, visibleRowIndexOf, wireAxisScrollSync, wireTimelineResize } from "./ui/timeline.js";
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

/**
 * Every rule the chart is about to draw, in the order the rows start out in.
 *
 * World mode is world transits alone, as it always was. A personal chart is the
 * natal contacts, and - unless the reader has turned it off - the world
 * transits folded in after them, so one scan answers both and the rows sort
 * together by first hit.
 *
 * The world half is never the reason a chart fails to draw. A selection too
 * thin to make a world transit contributes nothing rather than throwing: the
 * reader was asking about their chart, and a setting they left on months ago
 * should not be able to take that away from them.
 *
 * @param {import("./services/chart-context.js").ChartContext} ctx
 * @param {ReturnType<typeof readRuleOptions>} opts
 */
function buildRules(ctx, opts){
  const worldRulesFor = (bodies) => (bodies.length >= 2)
    ? buildWorldRules({ bodies, aspects: opts.aspects, orb: opts.orb })
    : [];

  if (ctx.mode === "world"){
    if (opts.worldBodies.length < 2) throw new Error("Pick at least two bodies: a world transit needs both ends.");
    return worldRulesFor(opts.worldBodies);
  }

  const worldRules = state.showWorldRows ? worldRulesFor(opts.worldBodies) : [];
  // With world transits on screen the chart is not empty, so an empty personal
  // selection is a narrowing rather than a mistake, and saying so would be
  // telling the reader to fix something that is not broken.
  const demand = (message) => { if (worldRules.length === 0) throw new Error(message); };
  if (opts.mode === "involving"){
    if (opts.involvingBodies.length === 0) demand("Pick at least one body to look for.");
  } else {
    if (opts.transitBodies.length === 0) demand("Pick at least one transiting body.");
    if (opts.natalBodies.length === 0) demand("Pick at least one natal point.");
  }
  return [...buildCandidateRules(opts), ...worldRules];
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
    // A recompute over an existing chart leaves it up: the old answer is still
    // roughly the right shape, and replacing it with a plate is a worse wait.
    const hadResults = !!state.cachedResults;
    if (!hadResults) setTimelineState("Computing…", "busy");

    const ctx = currentChartContext();

    state.currentMaxRows = 50;

    const rangeStartLocal = parseLocalDateOnly(el.rangeStart.value);
    const rangeEndLocal = parseLocalDateOnly(el.rangeEnd.value);
    const endExclusive = addDaysLocal(rangeEndLocal, 1);
    if (!(rangeStartLocal < endExclusive)) throw new Error("Timeline end must be after start.");

    const ruleOptions = readRuleOptions();
    const aspectsChecked = getCheckedAspects();
    if (aspectsChecked.length === 0) throw new Error("Select at least one aspect.");
    const candidateRules = buildRules(ctx, ruleOptions);

    const spanDays = (endExclusive.getTime() - rangeStartLocal.getTime()) / (24 * 3600 * 1000);
    // Windows now carry real times, so this only decides whether showing them
    // helps: on a multi-year view a date is what the eye wants.
    const showTime = spanDays <= 60;

    // The personal rules only: the far end of a world rule is a moving body,
    // and asking a birth chart where it sits would be answering a question
    // nothing asked.
    const natalTargets = Array.from(new Set(
      candidateRules.filter(r => r.scope !== "world").map(r => r.natal)
    ));
    const natalLon = natalLongitudes(ctx, natalTargets);
    const chartRulerKey = chartRulerKeyFor(ctx);

    // No mode on the job: every rule carries its own scope, and a chart that
    // holds both kinds has no single one to name.
    const { rules: rulesOut, events: eventsByRule } = await computeEvents({
      startMs: rangeStartLocal.getTime(),
      endMs: endExclusive.getTime(),
      observer: ctx.observer,
      natalLon,
      rules: candidateRules
    }, (done, total) => {
      // A percentage rather than a count of groups: done is fractional now, and
      // "3.4/7" reads worse than the figure it replaced. It also stops the
      // display implying that the seven groups are seven equal pieces of work,
      // which they never were.
      const pct = total > 0 ? Math.min(99, Math.round((done / total) * 100)) : 0;
      setStatus(`Computing\u2026 ${pct}%`);
      if (!hadResults) setTimelineState(`Computing\u2026 ${pct}%`, "busy");
    });

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
    // A row picked off the axis keeps its highlight across recomputes, but only
    // while it is still one of the rows: narrowing the chooser past it, or
    // switching charts, leaves nothing to point at. Nothing scrolls here - only
    // a search, which moves the range out from under the reader, has earned
    // that; a recompute they asked for should leave the page where it was.
    if (state.focusRule && rulesSorted.length > 0 && visibleRowIndexOf(state.focusRule) < 0) clearRowFocus();

    const nothingFound = rulesSorted.length === 0;
    setTimelineState(nothingFound ? "No transits match these settings in this range." : null,
      nothingFound ? "empty" : null);

    const totalMatches = rulesSorted.length;
    const orbLabel = `${Number(el.orb.value || 0).toFixed(1)}°`;
    setStatus(`Done • ${orbLabel} orb • ${totalMatches} matches`);

  } catch (err){
    if (state.cancelRequested && String(err?.message || err) === "Cancelled"){
      setStatus("Cancelled.");
      state.cachedResults = null;
      clearTimeline();
      setTimelineState("Cancelled.", "empty");
      updateShowMore(0, 0);
      return;
    }
    console.error(err);
    setStatus(String(err?.message || err), true);
    state.cachedResults = null;
    clearTimeline();
    setTimelineState(String(err?.message || err), "error");
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
  wireBodyPicker();
  onBodiesChanged(() => {
    renderPresetSection();
    renderRowFocus();
  });
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
  wireAspectShortcuts();
  wireRowFocus();
  wireViewBar();
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
