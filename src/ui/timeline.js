import { state } from "../state.js";
import { isLeadingStub } from "../core/events.js";
import { aspectColors, aspectSymbol, mythKeyFor, orderMap, planetLabel, planetSymbols, returnColor, ruleKey } from "../data/bodies.js";
import { tierFor } from "../data/weights.js";
import { darken, isHexColor, lighten } from "./color.js";
import { locale } from "../storage/charts.js";
import { el, tooltip } from "./dom.js";
import { formatClosestPretty, formatExactPretty, formatRangePretty } from "./format.js";
import { clearSvg, computeTimelineLayout, getDayStartsLocal, getHourStartsLocal, getMonthStartsLocal, getYearStartsLocal, pickStep, svgEl, svgNs } from "./svg.js";
import { ensureTooltipListeners, hideTooltip, isCoarsePointer, moveTooltip, showTooltip } from "./tooltip.js";

/** @type {((e:PointerEvent|MouseEvent, rule:any) => void)|null} */
let rowLabelHandler = null;

// The aspect axis is a separate SVG from the chart and is drawn from a separate
// entry point, so what a row label does when it is tapped is registered rather
// than imported: the module that answers needs the timeline, and importing it
// back the other way would close the loop.
export function onRowLabelClick(fn){ rowLabelHandler = fn; }

// How many rows are drawn before the reader has to ask for more, and how many
// each ask adds.
//
// The cap bounds how much SVG one render builds; it is not there to curate,
// which is now the significance score's job - the rows it keeps are the ones
// that matter rather than the ones that happen to start first. Measured against
// a 1988 chart: all bodies over a month is 115 rows, and the hundred kept cover
// every row above the bottom tier; all bodies over a year is 353 rows, where a
// cap of fifty showed one of the 163 rows in the middle tier and a hundred
// shows fifty-one of them. The cost is about 850 SVG elements against 340, both
// far below the ten thousand an uncapped year view would build.
export const ROW_CAP = 100;
export const ROW_PAGE = 50;

export function updateShowMore(shown, total){
  const wrap = el.moreWrap;
  const btn = el.showMoreBtn;
  if (!wrap || !btn) return;
  // Any row past the cap needs a way back. This used to also require a hundred
  // matches, which is redundant with the comparison beside it and left a real
  // gap: 51 to 99 rows drew fifty and offered nothing, so the remainder could
  // not be reached at all. Reachable by moving one slider - the Month preset at
  // a 2 degree orb is 51 rows.
  if (total > shown){
    wrap.style.display = "block";
    btn.textContent = `Show ${ROW_PAGE} more (showing ${shown} of ${total})`;
  } else {
    wrap.style.display = "none";
  }
}

// An error plate over the previous chart reads as though the chart is the
// answer. Blanking the three SVGs - and their heights, which are attributes
// rather than layout - is what makes the plate the only thing on screen.
export function clearTimeline(){
  for (const svg of [el.timelineSvg, el.aspectAxisSvg, el.dateAxisSvg]){
    if (!svg) continue;
    clearSvg(svg);
    svg.setAttribute("height", "0");
    svg.style.height = "0px";
  }
}

// How much of the range a bar hard against the left edge has to cover before it
// earns a row. A share of the range rather than a pixel count, so that the same
// rows exist at every window width - a threshold in pixels would add and remove
// lines as the chart is resized or the phone is turned, and the row cap counts
// with it.
//
// Five per cent leaves ninety-five per cent of the line empty, which is what the
// eye is reacting to. Bars already floor at minBarW so a sliver stays visible
// and tappable; this is the separate question of whether a line consisting only
// of that sliver is worth the row it costs.
const STUB_FRACTION = 0.05;

// The rows worth drawing, as indices into the cache. Kept as a list rather than
// a slice because the row cap and the label column both have to agree with the
// chart about which lines exist.
function visibleRows(){
  const cache = state.cachedResults;
  const startMs = cache.start.getTime();
  const endMs = cache.endExclusive.getTime();
  const idxs = [];
  for (let i = 0; i < cache.rules.length; i++){
    if (isLeadingStub(cache.events[i], startMs, endMs, STUB_FRACTION)) continue;
    idxs.push(i);
  }
  return idxs;
}

const scoreOf = (i) => state.cachedResults?.scores?.[i] ?? 0;

// Chart order, then natal point: what every ordering here falls back on when
// scores tie, which they do often - the Sun and the Moon carry the same natal
// weight, so two rows can score identically to the digit.
function byChartOrder(a, b){
  const rules = state.cachedResults.rules;
  const pa = (orderMap.get(rules[a].transit) ?? 999) - (orderMap.get(rules[b].transit) ?? 999);
  if (pa !== 0) return pa;
  return (orderMap.get(rules[a].natal) ?? 999) - (orderMap.get(rules[b].natal) ?? 999);
}

/**
 * The rows actually drawn: the most significant `limit` of them, in the order
 * the reader asked for.
 *
 * Selection and ordering are separate jobs and this is the one place both are
 * decided. The cap exists to bound how much SVG a render builds, not to
 * curate - so it takes the rows that matter rather than the ones that happen to
 * start first, which is what a chronological slice was doing. The cache is held
 * in date order, so that is what "date" costs here: nothing.
 *
 * @param {number} limit
 * @returns {{shown:number[], total:number}}
 */
function rowsToDraw(limit){
  const keep = visibleRows();
  const total = keep.length;
  const want = Math.min(total, Math.max(0, Math.floor(Number(limit || 0))));
  if (want >= total){
    return { shown: state.rowSort === "significance" ? [...keep].sort(bySignificance) : keep, total };
  }
  const selected = [...keep].sort(bySignificance).slice(0, want);
  if (state.rowSort === "significance") return { shown: selected, total };
  // Back into date order, which is the order the cache is already in.
  const chosen = new Set(selected);
  return { shown: keep.filter(i => chosen.has(i)), total };
}

function bySignificance(a, b){
  return (scoreOf(b) - scoreOf(a)) || byChartOrder(a, b);
}

export function renderFromCache(limit){
  if (!state.cachedResults){
    updateShowMore(0, 0);
    return;
  }
  const layout = computeTimelineLayout(el.timelineSvg);
  state.currentLayout = layout;
  const threshold = Math.max(0, layout.labelWMax - layout.labelWMin);
  state.labelsUseSymbols = !!el.timelineScroll && el.timelineScroll.scrollLeft >= threshold;
  const { shown: rowIdxs, total } = rowsToDraw(limit);
  const shown = rowIdxs.length;
  const rules = rowIdxs.map(i => state.cachedResults.rules[i]);
  const events = rowIdxs.map(i => state.cachedResults.events[i]);
  const scores = rowIdxs.map(i => scoreOf(i));

  const spanMs = state.cachedResults.endExclusive.getTime() - state.cachedResults.start.getTime();
  const showYear = (spanMs / (365.25 * 24 * 3600 * 1000)) >= 3;

  renderAxisSVG({
    svg: el.dateAxisSvg,
    start: state.cachedResults.start,
    endExclusive: state.cachedResults.endExclusive,
    showTime: state.cachedResults.showTime,
    layout
  });

  renderLabelsSVG({
    svg: el.aspectAxisSvg,
    rules,
    chartRuler: state.cachedResults.chartRuler,
    layout,
    useSymbols: state.labelsUseSymbols
  });

  renderTimelineSVG({
    svg: el.timelineSvg,
    start: state.cachedResults.start,
    endExclusive: state.cachedResults.endExclusive,
    rules,
    eventsByRule: events,
    scores,
    showTime: state.cachedResults.showTime,
    presetKey: state.cachedResults.presetKey,
    chartRuler: state.cachedResults.chartRuler,
    layout,
    showYear
  });

  updateShowMore(shown, total);
  syncAxisTravel();
  updateAxisTransform();
}

const scrollTimelineSupported = typeof CSS !== "undefined"
  && typeof CSS.supports === "function"
  && CSS.supports("animation-timeline", "--x");

// How far each axis has to travel, read once per layout rather than per scroll
// frame. The CSS keyframes interpolate to these.
function syncAxisTravel(){
  if (!el.dateAxisSvg || !el.timelineScroll) return;
  const travel = Math.max(0, el.timelineScroll.scrollWidth - el.timelineScroll.clientWidth);
  el.dateAxisSvg.style.setProperty("--date-axis-travel", `${travel}px`);
  syncAxisAnimations(travel);
}

let axisStyleEl = null;

// The label column holds its narrow width once it has travelled far enough, so
// the keyframes need a stop partway through the scroll. Its position depends on
// the layout, so the rule is written here rather than in the stylesheet. Plain
// lengths only: Safari does not run custom-property or animation-range variants
// on a scroll timeline, though it does run these.
function syncAxisAnimations(maxScroll){
  if (!scrollTimelineSupported) return;
  const layout = state.currentLayout;
  if (!layout) return;

  if (!axisStyleEl){
    axisStyleEl = document.createElement("style");
    axisStyleEl.id = "axisAnimations";
    document.head.appendChild(axisStyleEl);
  }

  const travel = symbolsThreshold();
  if (maxScroll <= 0 || travel <= 0){
    axisStyleEl.textContent = "";
    return;
  }

  const wide = layout.labelWMax;
  const narrow = wide - travel;
  const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--axis-pad")) || 0;
  const hold = Math.min(100, (travel / maxScroll) * 100).toFixed(4);

  const holding = (prop, from, to) =>
    `@keyframes ${prop.name}{0%{${prop.css}:${from}}${hold}%{${prop.css}:${to}}100%{${prop.css}:${to}}}`;

  const rules = [
    holding({ name: "aspectAxisNarrow", css: "width" }, `${wide}px`, `${narrow}px`),
    holding({ name: "aspectAxisSlide", css: "transform" }, "translateX(0)", `translateX(${-travel}px)`),
    holding({ name: "aspectAxisCornerNarrow", css: "width" }, `${wide - 1}px`, `${narrow - 1}px`),
    holding({ name: "aspectAxisNavIndent", css: "margin-left" }, `${wide + pad}px`, `${narrow + pad}px`)
  ].join("\n");

  // renderFromCache runs on every resize tick, and replacing the rule costs a
  // style recalc even when it is identical.
  if (rules !== axisStyleEl.textContent) axisStyleEl.textContent = rules;
}

let lastShift = null;

export function updateAxisTransform(){
  if (!el.dateAxisSvg || !el.timelineScroll) return;
  const scrollLeft = el.timelineScroll.scrollLeft;
  const shift = Math.round(Math.min(Math.max(0, scrollLeft), symbolsThreshold()));

  // The date axis follows a CSS scroll timeline where those exist.
  if (!scrollTimelineSupported){
    el.dateAxisSvg.style.transform = `translate3d(${-Math.round(scrollLeft)}px, 0, 0)`;
  }

  // Where scroll timelines exist the generated keyframes drive the column.
  if (scrollTimelineSupported) return;

  // shift is clamped, so it stops changing early in a scroll. The width each
  // consumer needs is derived from it in CSS, so this is the only value written.
  if (shift !== lastShift){
    lastShift = shift;
    document.documentElement.style.setProperty("--aspect-axis-shift", `${-shift}px`);
  }
}

export function symbolsThreshold(){
  const layout = state.currentLayout;
  if (!layout) return 4;
  return Math.max(0, layout.labelWMax - layout.labelWMin);
}

// Checked every scroll frame so the form changes exactly at the threshold. The
// comparison is all that runs until the crossing, and the crossing redraws only
// the label column, not the timeline and date axis with it.
export function updateLabelsMode(){
  if (!state.cachedResults || !el.timelineScroll || !state.currentLayout) return;
  const shouldUseSymbols = el.timelineScroll.scrollLeft >= symbolsThreshold();
  if (shouldUseSymbols === state.labelsUseSymbols) return;
  state.labelsUseSymbols = shouldUseSymbols;

  const { shown: rowIdxs } = rowsToDraw(state.currentMaxRows);
  renderLabelsSVG({
    svg: el.aspectAxisSvg,
    rules: rowIdxs.map(i => state.cachedResults.rules[i]),
    chartRuler: state.cachedResults.chartRuler,
    layout: state.currentLayout,
    useSymbols: state.labelsUseSymbols
  });
}

/**
 * Whether this rule is one of the rows these results hold at all - which is a
 * different question from whether it is on screen. A row can be a real match and
 * still be behind the cap, and a focus that survived a recompute should not be
 * dropped for that: the cap is a rendering budget, not a filter.
 */
export function hasVisibleRow(rule){
  if (!state.cachedResults || !rule) return false;
  const key = ruleKey(rule);
  return visibleRows().some(i => ruleKey(state.cachedResults.rules[i]) === key);
}

/**
 * The index of a rule among the rows actually drawn, or -1. The row cap, the
 * stub filter and the chosen sort all sit between the cache and the chart, so a
 * rule's place in the cache is not its place on screen.
 */
export function drawnRowIndexOf(rule){
  if (!state.cachedResults || !rule) return -1;
  const key = ruleKey(rule);
  const { shown } = rowsToDraw(state.currentMaxRows);
  for (let i = 0; i < shown.length; i++){
    if (ruleKey(state.cachedResults.rules[shown[i]]) === key) return i;
  }
  return -1;
}

/** Where a rule sits in the significance ranking, ignoring the cap. */
function significanceRankOf(rule){
  const key = ruleKey(rule);
  const ranked = [...visibleRows()].sort(bySignificance);
  for (let i = 0; i < ranked.length; i++){
    if (ruleKey(state.cachedResults.rules[ranked[i]]) === key) return i;
  }
  return -1;
}

// The sticky header is the view bar and the date axis, and a row scrolled to
// the top of the document sits underneath both of them.
function stickyHeaderBottom(){
  const axis = el.dateAxisScroll;
  if (!axis) return 0;
  return Math.max(0, axis.getBoundingClientRect().bottom);
}

/**
 * Brings the focused row onto the screen after a search has moved the range.
 * It may be behind the row cap - the row the reader asked about can be the two
 * hundredth by significance - so the cap is raised until the row is drawn
 * rather than the row being reported as missing.
 */
export function revealFocusRow(){
  if (!state.cachedResults || !state.focusRule) return false;
  if (!hasVisibleRow(state.focusRule)) return false;
  let idx = drawnRowIndexOf(state.focusRule);
  if (idx < 0){
    // Not drawn: it is behind the cap. Raise the cap to the page that holds its
    // place in the ranking, then ask again - under a date sort its position on
    // screen is not its rank, so the index has to be re-read after the render.
    const rank = significanceRankOf(state.focusRule);
    if (rank < 0) return false;
    state.currentMaxRows = Math.ceil((rank + 1) / ROW_PAGE) * ROW_PAGE;
    renderFromCache(state.currentMaxRows);
    idx = drawnRowIndexOf(state.focusRule);
    if (idx < 0) return false;
  }
  const layout = state.currentLayout;
  const svg = el.timelineSvg;
  if (!layout || !svg) return true;

  const rowTop = svg.getBoundingClientRect().top + layout.rowsY0 + idx * (layout.rowH + layout.rowGap);
  const headroom = stickyHeaderBottom() + layout.rowH * 2;
  const floor = window.innerHeight - layout.rowH * 2;
  if (rowTop < headroom || rowTop > floor){
    window.scrollBy({ top: Math.round(rowTop - headroom), behavior: "smooth" });
  }
  return true;
}

export function wireAxisScrollSync(){
  if (!el.dateAxisScroll || !el.timelineScroll) return;
  let frame = null;
  el.timelineScroll.addEventListener("scroll", () => {
    // Straight off the scroll event, not a frame, so the form changes at the
    // threshold rather than whenever the next frame lands.
    updateLabelsMode();
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      updateAxisTransform();
    });
  }, { passive: true });
  updateAxisTransform();
}

export function wireTimelineResize(){
  let animationFrame = null;
  let settleTimer = null;
  const rerender = () => {
    animationFrame = null;
    if (state.cachedResults) renderFromCache(state.currentMaxRows);
  };
  const scheduleRerender = () => {
    if (animationFrame === null){
      animationFrame = window.requestAnimationFrame(rerender);
    }
  };
  const scheduleOrientationRerender = () => {
    scheduleRerender();
    // Mobile browsers may report the final viewport width shortly after
    // orientationchange, so redraw once more after it has settled.
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(scheduleRerender, 250);
  };

  window.addEventListener("resize", scheduleRerender, { passive: true });
  window.addEventListener("orientationchange", scheduleOrientationRerender, { passive: true });
  if ("ResizeObserver" in window && el.timelineScroll){
    new ResizeObserver(scheduleRerender).observe(el.timelineScroll);
  }
}

export function renderAxisSVG({svg, start, endExclusive, showTime, layout}){
  clearSvg(svg);

  const { totalW, containerW, timelineW, labelW, marginL, axisGutter = 0, axisY, axisBottomPad, axisLabelSize, axisTitleSize } = layout;
  const x0 = marginL + labelW + axisGutter;
  const axisHeight = axisY + 40 + axisBottomPad;
  document.documentElement.style.setProperty("--date-axis-h", `${axisHeight}px`);
  svg.setAttribute("viewBox", `0 0 ${totalW} ${axisHeight}`);
  svg.setAttribute("width", String(totalW));
  svg.setAttribute("height", String(axisHeight));
  svg.style.width = `${totalW}px`;
  svg.style.height = `${axisHeight}px`;
  svg.appendChild(svgEl("rect", {x:0, y:0, width: totalW, height: axisHeight, fill:"var(--axis-bg)"}));

  const startMs = start.getTime();
  const endMs = endExclusive.getTime();
  const spanMs = Math.max(1, endMs - startMs);
  const spanDays = spanMs / (24*3600*1000);
  const dateToX = (d) => x0 + ((d.getTime() - startMs) / spanMs) * timelineW;
  const topLabelByMs = new Set();

  svg.appendChild(svgEl("rect", {x:x0, y:axisY, width:timelineW, height:40, fill:"var(--axis-bg)"}));
  svg.appendChild(svgEl("line", {x1:x0, y1:axisY + 40, x2:x0 + timelineW, y2:axisY + 40, stroke:"var(--axis-line)", "stroke-width":"1.5"}));

  const minBoxPx = axisLabelSize * 2.7;
  const minLabelPx = axisLabelSize * 2.2;
  const monthLabelPx = axisLabelSize * 1.6;

  const spanYears = spanDays / 365.25;
  const useHours = (spanDays <= 2 && showTime);
  const useDays  = (!useHours) && (spanDays <= 45);
  // Past about three years the month names stop telling anyone anything: they
  // come round again every twelve boxes, so the axis reads "Jan Jul Jan Jul"
  // for the length of the chart while the year - the one figure that is
  // actually changing - sits in small print above it. From here the year is
  // the label, and the months become an unlabelled rhythm inside it.
  const useYears = (!useHours) && (!useDays) && (spanYears >= 3);

  const stepYears = useYears
    ? pickStep(spanYears, timelineW, minBoxPx, [1,2,5,10,20,25,50,100])
    : 0;

  const boundaries = (() => {
    if (useHours){
      const totalHours = spanMs / (3600 * 1000);
      const stepHours = pickStep(totalHours, timelineW, minBoxPx, [1,2,3,4,6,8,12,24]);
      return [start, ...getHourStartsLocal(start, endExclusive, stepHours), endExclusive];
    }
    if (useDays){
      const totalDays = spanDays;
      const stepDays = pickStep(totalDays, timelineW, minBoxPx, [1,2,3,4,5,7,10,14,21,30]);
      return [start, ...getDayStartsLocal(start, endExclusive, stepDays), endExclusive];
    }
    if (useYears){
      return [start, ...getYearStartsLocal(start, endExclusive, stepYears), endExclusive];
    }
    const totalMonths = spanDays / 30.44;
    const stepMonths = pickStep(totalMonths, timelineW, minBoxPx, [1,2,3,4,6,12]);
    return [start, ...getMonthStartsLocal(start, endExclusive, stepMonths), endExclusive];
  })();

  // A year-wide box says which year and nothing about where inside it, which is
  // the one thing a decade view loses. These are the quarters - or the years,
  // where a box holds several - marked as a short tick and never labelled: the
  // eye gets somewhere to put a bar without another row of words to read past.
  if (useYears){
    const minorStep = stepYears === 1 ? 3 : 12;
    const minor = getMonthStartsLocal(start, endExclusive, minorStep);
    const gap = timelineW / Math.max(1, (spanDays / 30.44) / minorStep);
    if (gap >= 12){
      for (const m of minor){
        const xm = dateToX(m);
        svg.appendChild(svgEl("line", {
          x1: xm, y1: axisY + 30, x2: xm, y2: axisY + 40,
          stroke: "var(--axis-line)", "stroke-width": "1", opacity: "0.45"
        }));
      }
    }
  }

  if (useHours){
    const dateLabel = start.toLocaleDateString(locale, {month:"short", day:"numeric", year:"numeric"});
    const t = svgEl("text", { x: x0 + 6, y: axisY - 6, "font-size": String(axisTitleSize), "font-weight":"700", fill:"var(--text)" });
    t.textContent = dateLabel;
    svg.appendChild(t);
  }

  if (useDays){
    for (let i=0; i<boundaries.length-1; i++){
      const a = boundaries[i];
      const prev = boundaries[i-1];
      const monthChanged = (!prev) || (prev.getMonth() !== a.getMonth()) || (prev.getFullYear() !== a.getFullYear());
      if (monthChanged) topLabelByMs.add(a.getTime());
    }
  }
  if (!useHours && !useDays && !useYears){
    const months = getMonthStartsLocal(start, endExclusive);
    for (const m of months){
      if (m.getMonth() === 0) topLabelByMs.add(m.getTime());
    }
  }

  for (let i=0; i<boundaries.length-1; i++){
    const a = boundaries[i];
    const xa = dateToX(a);
    const xb = dateToX(boundaries[i+1]);
    const w = Math.max(0.5, xb - xa);
    const isTopLabeled = topLabelByMs.has(a.getTime());
    const tickY1 = isTopLabeled ? axisY : (axisY + 20);
    svg.appendChild(svgEl("line", {x1:xa, y1:tickY1, x2:xa, y2:axisY + 40, stroke:"var(--axis-line)", "stroke-width":"1"}));

    let label = "";
    let shouldLabel = false;

    if (useHours){
      const hh = a.getHours();
      label = `${String(hh).padStart(2,"0")}:00`;
      shouldLabel = (w >= minLabelPx);
    } else if (useDays){
      const mon = a.toLocaleString(locale, {month:"short"});
      const dow = a.toLocaleString(locale, {weekday:"short"});

      // Don't repeat the month on every tick: show month only at changes.
      const prev = boundaries[i-1];
      const monthChanged = (!prev) || (prev.getMonth() !== a.getMonth()) || (prev.getFullYear() !== a.getFullYear());

      if (spanDays <= 10){
        label = `${dow} ${a.getDate()}`;
      } else {
        label = `${a.getDate()}`;
      }

      shouldLabel = (w >= minLabelPx);
      if (monthChanged){
        const mtX = Math.max(x0 + 6, xa - 6);
        const mt = svgEl("text", { x: mtX, y: axisY - 6, "font-size": String(axisTitleSize), "font-weight":"700", fill:"var(--text)" });
        mt.textContent = mon;
        svg.appendChild(mt);
      }
    } else if (useYears){
      label = String(a.getFullYear());
      shouldLabel = (w >= minLabelPx);
    } else {
      label = a.toLocaleString(locale, {month:"short"});
      shouldLabel = (w >= monthLabelPx);
    }

    if (shouldLabel){
      const txt = svgEl("text", {x: xa + 6, y: axisY + 25, "font-size": String(axisLabelSize), fill:"var(--text)"});
      txt.textContent = label;
      svg.appendChild(txt);
    }
  }

  if (!useHours && !useDays && !useYears){
    const months = getMonthStartsLocal(start, endExclusive);
    for (const m of months){
      if (m.getMonth() === 0){
        const yearX = Math.max(x0 + 6, dateToX(m) - 6);
        const t = svgEl("text", { x: yearX, y: axisY - 6, "font-size": String(axisTitleSize), "font-weight":"700", fill:"var(--text)" });
        t.textContent = String(m.getFullYear());
        svg.appendChild(t);
      }
    }
  }

  // Now, continued into the chart: this runs from just under the tick labels
  // to the bottom edge of this SVG, and the timeline picks it up at its own
  // y = 0. It starts below the labels rather than at the top of the band,
  // where it used to strike through the dates it was drawn over.
  //
  // Only where the chart does not scroll sideways. Where it does, this SVG
  // follows it on a scroll timeline whose progress is clamped to the scroll
  // range, so an overdrag past either end carries the chart while this stands
  // still and the join comes apart; there the chart draws the whole line and
  // this segment would be the one piece that could break away. The chart is
  // exactly as wide as the scroller can show it when totalW fits containerW.
  const scrollsSideways = totalW > containerW;
  const now = new Date();
  if (!scrollsSideways && now >= start && now < endExclusive){
    const xNow = dateToX(now);
    svg.appendChild(svgEl("line", {
      x1: xNow, y1: axisY + 29, x2: xNow, y2: axisHeight,
      stroke: "var(--accent)", "stroke-width": "1", opacity: "0.55", "pointer-events": "none"
    }));
  }
}

export function renderLabelsSVG({svg, rules, chartRuler, layout, useSymbols=false}){
  if (!svg) return;
  clearSvg(svg);
  const { labelW, rowH, rowGap, bottomPad, rowsY0, labelFontSize } = layout;
  const n = rules.length;
  const totalH = rowsY0 + (n*(rowH+rowGap)) + bottomPad;

  document.documentElement.style.setProperty("--aspect-axis-w", `${labelW}px`);
  svg.setAttribute("viewBox", `0 0 ${labelW} ${totalH}`);
  svg.setAttribute("width", String(labelW));
  svg.setAttribute("height", String(totalH));
  svg.style.width = `${labelW}px`;
  svg.style.height = `${totalH}px`;
  svg.appendChild(svgEl("rect", {x:0, y:0, width: labelW, height: totalH, fill:"var(--axis-bg)"}));

  const labelX = labelW - 8;
  const focusKey = ruleKey(state.focusRule);

  for (let idx=0; idx<rules.length; idx++){
    const r = rules[idx];
    const y = rowsY0 + idx*(rowH+rowGap);
    const isFocused = focusKey && ruleKey(r) === focusKey;
    if (isFocused){
      svg.appendChild(svgEl("rect", {
        x: 0, y, width: labelW, height: rowH,
        fill: "var(--focus-band)", "pointer-events": "none"
      }));
    }
    const t = svgEl("text", {
      x: labelX,
      y: y + rowH/2 + 4,
      "font-size": String(labelFontSize),
      // Colour rather than weight: these labels are already as wide as the
      // column allows, and bold costs a character off the front of the long
      // ones. The band behind it is doing most of the work anyway.
      fill: isFocused ? "var(--accent)" : "var(--text)",
      "text-anchor":"end"
    });

    const transitLabel = useSymbols ? (planetSymbols[r.transit] || planetLabel(r.transit)) : planetLabel(r.transit);
    const natalLabel = useSymbols ? (planetSymbols[r.natal] || planetLabel(r.natal)) : planetLabel(r.natal);
    const parts = [
      { text: transitLabel + " " },
      { text: aspectSymbol(r.aspect) + " " },
      { text: natalLabel, underline: (!useSymbols && chartRuler && r.natal === chartRuler) }
    ];

    for (const p of parts){
      const sp = document.createElementNS(svgNs, "tspan");
      sp.textContent = p.text;
      if (p.underline) sp.setAttribute("text-decoration", "underline");
      t.appendChild(sp);
    }

    svg.appendChild(t);

    // The label itself is a line of text a couple of pixels tall in the places
    // between the glyphs, so the row's whole strip is what is tapped. It sits
    // over the text on purpose: a pointer that is anywhere on the row is on the
    // target, and the text under it is not asked to catch anything.
    const hit = svgEl("rect", {
      x: 0, y, width: labelW, height: rowH,
      fill: "transparent",
      class: "rowLabelHit"
    });
    const title = document.createElementNS(svgNs, "title");
    title.textContent = `Follow ${planetLabel(r.transit)} ${aspectSymbol(r.aspect)} ${planetLabel(r.natal)}: when it last happened, and when it happens next`;
    hit.appendChild(title);
    // A tap, not a drag. The column sits over a chart that scrolls sideways, so
    // a finger that started here and travelled was panning; the browser still
    // synthesises a click for it, and a row quietly taking the highlight at the
    // end of a scroll is a change nobody asked for.
    let downAt = null;
    hit.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
    hit.addEventListener("click", (e) => {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
      rowLabelHandler?.(e, r);
    });
    svg.appendChild(hit);
  }
}

// Narrower than this and a bar stops reading as a segment; narrower than the
// hit floor and there is nothing to hover or tap, so a transparent target sits
// over it, the same trick the exact-hit markers use.
const minBarW = 3;
const minHitW = 12;

// A weighted-down bar still has to read as a bar. The hit target is the row
// strip rather than the shape, so this is about legibility and not about
// whether the bar can be tapped.
const minBarH = 6;

// A bar whose window runs past the edge of the timeline is cut square there and
// left rounded at the end it really has, so the two read differently. The
// radius follows the clamp SVG applies to rx - never more than half the height,
// and never more than the width it has to fit in - so a one-day bar keeps its
// shape instead of growing impossible corners.
export function barPath(x, y, w, h, roundStart, roundEnd){
  const share = (roundStart && roundEnd) ? w / 2 : w;
  const r = Math.max(0, Math.min(h / 2, share));
  const rs = roundStart ? r : 0;
  const re = roundEnd ? r : 0;
  const x2 = x + w;
  const y2 = y + h;
  const p = [`M ${x + rs} ${y}`, `L ${x2 - re} ${y}`];
  if (re) p.push(`A ${re} ${re} 0 0 1 ${x2} ${y + re}`, `L ${x2} ${y2 - re}`, `A ${re} ${re} 0 0 1 ${x2 - re} ${y2}`);
  else p.push(`L ${x2} ${y2}`);
  p.push(`L ${x + rs} ${y2}`);
  if (rs) p.push(`A ${rs} ${rs} 0 0 1 ${x} ${y2 - rs}`, `L ${x} ${y + rs}`, `A ${rs} ${rs} 0 0 1 ${x + rs} ${y}`);
  p.push("Z");
  return p.join(" ");
}

// How a tier is drawn. A compressed range on purpose: an absolute score is the
// honest choice - normalising to the loudest thing on screen would redraw a
// Mercury sextile as the biggest event of a quiet month, which is exactly the
// lie the weighting exists to remove - but a quiet month genuinely holds
// nothing major, and mapped naively it would draw as forty-five stunted, faint
// bars. So the bottom tier is still clearly a bar: two thirds the height and
// barely off full opacity.
//
// Height, not colour. Colour already carries the aspect, and is what a
// red-green colourblind reader has instead of the glyph; asking it to carry a
// second variable would cost that.
const TIER_STYLE = {
  major:   { height: 1.00, opacity: 1 },
  strong:  { height: 0.88, opacity: 1 },
  notable: { height: 0.76, opacity: 0.9 },
  minor:   { height: 0.66, opacity: 0.78 }
};

export function renderTimelineSVG({svg, start, endExclusive, rules, eventsByRule, scores, showTime, presetKey, chartRuler, layout, showYear}){
  clearSvg(svg);

  const { totalW, timelineW, labelW, marginL, axisGutter = 0, rowH, rowGap, bottomPad, rowsY0 } = layout;
  const x0 = marginL + labelW + axisGutter;

  const n = rules.length;
  const totalH = rowsY0 + (n*(rowH+rowGap)) + bottomPad;

  svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
  svg.setAttribute("width", String(totalW));
  svg.setAttribute("height", String(totalH));
  svg.style.width = `${totalW}px`;
  svg.style.height = `${totalH}px`;
  svg.appendChild(svgEl("rect", {x:0, y:0, width: totalW, height: totalH, fill:"var(--panel-bg)"}));

  // A bar with a top edge reads as an object rather than a smear, and the
  // cheapest way to give several hundred of them one is a gradient per colour
  // referenced by fill, rather than an overlay element on each.
  const defs = svgEl("defs");
  svg.appendChild(defs);
  const gradients = new Map();
  const fillFor = (color) => {
    if (!isHexColor(color)) return color;
    let id = gradients.get(color);
    if (!id){
      id = `barGrad${gradients.size}`;
      const grad = svgEl("linearGradient", { id, x1:"0", y1:"0", x2:"0", y2:"1" });
      grad.appendChild(svgEl("stop", { offset:"0", "stop-color": lighten(color, 0.20) }));
      grad.appendChild(svgEl("stop", { offset:"1", "stop-color": darken(color, 0.12) }));
      defs.appendChild(grad);
      gradients.set(color, id);
    }
    return `url(#${id})`;
  };

  const startMs = start.getTime();
  const endMs = endExclusive.getTime();
  const spanMs = Math.max(1, endMs - startMs);
  const dateToX = (d) => x0 + ((d.getTime() - startMs) / spanMs) * timelineW;
  const focusKey = ruleKey(state.focusRule);

  for (let idx=0; idx<rules.length; idx++){
    const r = rules[idx];
    const y = rowsY0 + idx*(rowH+rowGap);

    // Dashes are noise at twelve rows and a moiré at sixty. A band plus a
    // hairline gives the eye the same row to follow for less ink.
    if (idx % 2 === 1){
      svg.appendChild(svgEl("rect", {
        x:x0, y, width: timelineW, height: rowH,
        fill:"var(--row-band)", "pointer-events": "none"
      }));
    }
    // A search that moves the range by fifty years lands on a chart the reader
    // has never seen, and the row they asked about is one of sixty. This is the
    // thread back to it, and it is drawn in both SVGs so it crosses the seam.
    //
    // Over the seam, in fact: the band starts where the label column ends
    // rather than where the ticks do, so the three transparent pixels between
    // the two SVGs are painted too and the highlight arrives unbroken. The
    // three pixels are also exactly what the column gives back as it narrows
    // under a sideways scroll, so the join holds at every scroll position.
    if (focusKey && ruleKey(r) === focusKey){
      svg.appendChild(svgEl("rect", {
        x: marginL + labelW, y, width: timelineW + axisGutter, height: rowH,
        fill:"var(--focus-band)", "pointer-events": "none"
      }));
    }
    svg.appendChild(svgEl("line", {
      x1:x0, y1:y + rowH/2, x2:x0 + timelineW, y2:y + rowH/2,
      stroke:"var(--row-guide)", "stroke-width":"1",
      "pointer-events": "none"
    }));

    const rowLabel = `${planetLabel(r.transit)} ${aspectSymbol(r.aspect)} ${planetLabel(r.natal)}`;

    const events = eventsByRule[idx] ?? [];
    for (const event of events){
      const a = new Date(event.start);
      const b = new Date(event.end);
      const xa = dateToX(a);
      const xb = dateToX(b);
      // A window can leave orb minutes after the range opens, or enter it
      // minutes before the range closes. On a month-wide timeline that is a
      // fraction of a pixel - honest, but it draws as a tick that reads like a
      // stray rule and is too thin to hover. Slivers get a floor width, taken
      // inward from the edge so the bar never leaves the timeline.
      const w = Math.max(minBarW, xb - xa);
      const barX = Math.max(x0, Math.min(xa, x0 + timelineW - w));

      const isReturn = r.aspect === "conjunction" && r.transit === r.natal;
      const barColor = isReturn ? returnColor : (aspectColors[r.aspect] || "var(--text)");
      // The row keeps its height whatever the bar does, so rows never jitter
      // between recomputes and the hit target below is unaffected.
      const fullH = rowH - 8;
      const style = TIER_STYLE[tierFor(scores?.[idx] ?? 0)] ?? TIER_STYLE.minor;
      const barH = Math.max(minBarH, Math.round(fullH * style.height));
      const barY = y + 4 + Math.round((fullH - barH) / 2);
      // A window the scan found already open at the range start, or still open
      // at its end, does not really begin or end here - the timeline just stops
      // showing it. A rounded cap there would claim the transit closed inside
      // the window, so that end is cut square instead.
      const roundStart = !event.startClipped;
      const roundEnd = !event.endClipped;
      const shapeAttrs = (roundStart && roundEnd)
        // SVG clamps rx to half the width, so a one-day bar becomes a dot
        // rather than a rectangle with impossible corners.
        ? { x: barX, y: barY, width: w, height: barH, rx: barH / 2 }
        : { d: barPath(barX, barY, w, barH, roundStart, roundEnd) };
      const rect = svgEl((roundStart && roundEnd) ? "rect" : "path", {
        ...shapeAttrs,
        fill: fillFor(barColor),
        // Two windows that meet in a row would otherwise read as one long bar.
        stroke: isHexColor(barColor) ? darken(barColor, 0.4) : "none",
        "stroke-width": "0.75",
        ...(style.opacity < 1 ? { opacity: String(style.opacity) } : {}),
        class: "bar"
      });

      const rangeText = formatRangePretty(a, b, showTime, showYear);
      // Keys, not prose: the tooltip looks them up when it draws, so bars drawn
      // before the interpretations arrive still open with text once they have.
      const descKey = `${r.transit}-${r.aspect}-${r.natal}`;
      const mythKey = mythKeyFor(r.transit, r.natal);
      const glyphTitleCore = `${planetSymbols[r.transit] || planetLabel(r.transit)} ${aspectSymbol(r.aspect)} ${planetSymbols[r.natal] || planetLabel(r.natal)}`;
      const calendarTitle = (state.appMode === "world") ? `${glyphTitleCore} world` : glyphTitleCore;

      // The scan already found these to the second; a retrograde pass that
      // stays within orb throughout hits more than once.
      const exactDates = (event.exacts ?? []).map(ms => new Date(ms));
      // Each formatted hit can carry its own comma, so they are separated by
      // something a date never contains.
      const exactLabel = exactDates.map(d => formatExactPretty(d, a, b, showYear)).join(" \u00b7 ");
      // Only says anything when there was no exact hit; the popup decides.
      const closestLabel = formatClosestPretty(event.peakOrb, event.peakAt, a, b, showYear);
      const buildCalendarData = () => ({
        title: calendarTitle,
        segmentStart: a,
        segmentEnd: b,
        exactTime: exactDates[0] ?? null
      });
      const bindSegmentTooltipEvents = (target) => {
        const openPopup = (e) => showTooltip(e, rowLabel, descKey, rangeText, true, mythKey, exactLabel, buildCalendarData(), closestLabel);
        target.addEventListener("pointerenter", (e) => {
          if (isCoarsePointer()) return;
          if (tooltip.classList.contains("popup")) return;
          showTooltip(e, rowLabel, descKey, rangeText, false, mythKey, exactLabel, null, closestLabel);
        });
        target.addEventListener("pointermove", (e) => {
          if (tooltip.style.display === "block" && !isCoarsePointer() && !tooltip.classList.contains("popup")){
            moveTooltip(e.clientX, e.clientY);
          }
        });
        target.addEventListener("pointerleave", () => {
          if (isCoarsePointer()) return;
          if (tooltip.classList.contains("popup")) return;
          hideTooltip();
        });
        // Bars sit inside a horizontally scrollable container, so a tap that
        // drifts a little makes the browser claim the gesture and fire
        // pointercancel. Let it arbitrate: it only synthesises click for a real
        // tap, using its own slop, and withholds it after a scroll.
        target.addEventListener("click", openPopup);
      };

      bindSegmentTooltipEvents(rect);

      svg.appendChild(rect);
      if (w < minHitW){
        const hit = svgEl("rect", {
          x: Math.max(x0, barX - (minHitW - w) / 2), y, width: minHitW, height: rowH,
          fill: "transparent",
          class: "bar"
        });
        bindSegmentTooltipEvents(hit);
        svg.appendChild(hit);
      }
      for (const exact of exactDates){
        const xExact = dateToX(exact);
        if (xExact < xa || xExact > xb) continue;
        const cy = y + rowH / 2;
        const hitCircle = svgEl("circle", {
          cx: xExact,
          cy,
          r: 10,
          fill: "transparent",
          class: "bar"
        });
        bindSegmentTooltipEvents(hitCircle);
        svg.appendChild(hitCircle);
        // A hard point. The ring this replaced was a 1.6px stroke and a 1.9px
        // core over a gradient, and at the size it is actually drawn those
        // three edges antialias into each other and read as a smudge.
        svg.appendChild(svgEl("circle", {
          cx: xExact,
          cy,
          r: 3,
          fill: "var(--ink)",
          stroke: isHexColor(barColor) ? darken(barColor, 0.45) : "none",
          "stroke-width": "1",
          "pointer-events": "none"
        }));
      }
    }
  }

  const now = new Date();
  if (now >= start && now < endExclusive){
    const xNow = dateToX(now);
    const yTop = 0;
    const yBottom = totalH - 6;

    svg.appendChild(svgEl("line", {
      x1: xNow, y1: yTop, x2: xNow, y2: yBottom,
      stroke: "var(--accent)",
      "stroke-width": "1",
      // Same opacity as the segment in the axis above it, or the join shows.
      opacity: "0.55",
      "pointer-events": "none"
    }));
  }

  wireSvgLeave(svg);
  ensureTooltipListeners();
}

// The <svg> outlives every render - clearSvg only removes children - so this
// has to attach once rather than once per call, or a ResizeObserver-driven
// session piles up a handler per redraw.
const svgLeaveWired = new WeakSet();

function wireSvgLeave(svg){
  if (svgLeaveWired.has(svg)) return;
  svgLeaveWired.add(svg);
  svg.addEventListener("pointerleave", () => {
    if (isCoarsePointer()) return;
    if (tooltip.classList.contains("popup")) return;
    hideTooltip();
  });
}
