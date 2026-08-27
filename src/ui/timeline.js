import { state } from "../state.js";
import { aspectColors, aspectSymbol, mythKeyFor, planetLabel, planetSymbols, returnColor } from "../data/bodies.js";
import { darken, isHexColor, lighten } from "./color.js";
import { locale } from "../storage/charts.js";
import { el, tooltip } from "./dom.js";
import { formatExactPretty, formatRangePretty } from "./format.js";
import { clearSvg, computeTimelineLayout, getDayStartsLocal, getHourStartsLocal, getMonthStartsLocal, pickStep, svgEl, svgNs } from "./svg.js";
import { ensureTooltipListeners, hideTooltip, isCoarsePointer, moveTooltip, showTooltip } from "./tooltip.js";

export function updateShowMore(shown, total){
  const wrap = el.moreWrap;
  const btn = el.showMoreBtn;
  if (!wrap || !btn) return;
  if (total >= 100 && total > shown){
    wrap.style.display = "block";
    btn.textContent = `Show 50 more (showing ${shown} of ${total})`;
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

export function renderFromCache(limit){
  if (!state.cachedResults){
    updateShowMore(0, 0);
    return;
  }
  const layout = computeTimelineLayout(el.timelineSvg);
  state.currentLayout = layout;
  const threshold = Math.max(0, layout.labelWMax - layout.labelWMin);
  state.labelsUseSymbols = !!el.timelineScroll && el.timelineScroll.scrollLeft >= threshold;
  const total = state.cachedResults.rules.length;
  const shown = Math.min(total, Math.max(0, Math.floor(Number(limit || 0))));
  const rules = state.cachedResults.rules.slice(0, shown);
  const events = state.cachedResults.events.slice(0, shown);

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

  const total = state.cachedResults.rules.length;
  const shown = Math.min(total, Math.max(0, Math.floor(Number(state.currentMaxRows || 0))));
  renderLabelsSVG({
    svg: el.aspectAxisSvg,
    rules: state.cachedResults.rules.slice(0, shown),
    chartRuler: state.cachedResults.chartRuler,
    layout: state.currentLayout,
    useSymbols: state.labelsUseSymbols
  });
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

  const { totalW, timelineW, labelW, marginL, axisY, axisBottomPad, axisLabelSize, axisTitleSize } = layout;
  const x0 = marginL + labelW;
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

  const useHours = (spanDays <= 2 && showTime);
  const useDays  = (!useHours) && (spanDays <= 45);

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
    const totalMonths = spanDays / 30.44;
    const stepMonths = pickStep(totalMonths, timelineW, minBoxPx, [1,2,3,4,6,12]);
    return [start, ...getMonthStartsLocal(start, endExclusive, stepMonths), endExclusive];
  })();

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
  if (!useHours && !useDays){
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

  if (!useHours && !useDays){
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
  const now = new Date();
  if (now >= start && now < endExclusive){
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

  for (let idx=0; idx<rules.length; idx++){
    const r = rules[idx];
    const y = rowsY0 + idx*(rowH+rowGap);
    const t = svgEl("text", {
      x: labelX,
      y: y + rowH/2 + 4,
      "font-size": String(labelFontSize),
      fill:"var(--text)",
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
  }
}

export function renderTimelineSVG({svg, start, endExclusive, rules, eventsByRule, showTime, presetKey, chartRuler, layout, showYear}){
  clearSvg(svg);

  const { totalW, timelineW, labelW, marginL, rowH, rowGap, bottomPad, rowsY0 } = layout;
  const x0 = marginL + labelW;

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
      const w = Math.max(1, xb - xa);

      const isReturn = r.aspect === "conjunction" && r.transit === r.natal;
      const barColor = isReturn ? returnColor : (aspectColors[r.aspect] || "var(--text)");
      const barH = rowH - 8;
      const rect = svgEl("rect", {
        x: xa, y: y + 4, width: w, height: barH,
        // SVG clamps rx to half the width, so a one-day bar becomes a dot
        // rather than a rectangle with impossible corners.
        rx: barH / 2,
        fill: fillFor(barColor),
        // Two windows that meet in a row would otherwise read as one long bar.
        stroke: isHexColor(barColor) ? darken(barColor, 0.4) : "none",
        "stroke-width": "0.75",
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
      const buildCalendarData = () => ({
        title: calendarTitle,
        segmentStart: a,
        segmentEnd: b,
        exactTime: exactDates[0] ?? null
      });
      const bindSegmentTooltipEvents = (target) => {
        const openPopup = (e) => showTooltip(e, rowLabel, descKey, rangeText, true, mythKey, exactLabel, buildCalendarData());
        target.addEventListener("pointerenter", (e) => {
          if (isCoarsePointer()) return;
          if (tooltip.classList.contains("popup")) return;
          showTooltip(e, rowLabel, descKey, rangeText, false, mythKey, exactLabel);
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
