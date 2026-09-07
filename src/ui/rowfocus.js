// What a row does when it is tapped on the aspect axis.
//
// The label column was the one part of the chart that did nothing. It is also
// the part a reader points at: a row is a question - "Saturn square my Sun" -
// and the chart only ever answers it for the window on screen. Tapping the
// label opens that question instead of one of its passes, and carries the two
// answers the window cannot give: when this last happened, and when it happens
// next. Both live outside the range by definition, so both move the range.
//
// The focus bar is what makes the second and third tap cheap. A found
// occurrence can be fifty years away and the chart it lands on is one the
// reader has never seen, so the bar stays up naming the row, keeps the
// highlight on it, and offers the same two steps again.

import { addDaysLocal, fmtLocalYYYYMMDD, parseLocalDateOnly } from "../core/time.js";
import { DAY_MS } from "../core/events.js";
import { aspectSymbol, mythKeyFor, planetLabel, ruleKey } from "../data/bodies.js";
import { requestUpdate } from "../refresh.js";
import { currentChartContext, natalLongitudes } from "../services/chart-context.js";
import { SEARCH_LIMIT_YEARS, findOccurrence, occurrenceWindow } from "../services/search.js";
import { state } from "../state.js";
import { renderAspectChecks } from "./aspects.js";
import { setSelection } from "./bodies.js";
import { el } from "./dom.js";
import { fmtDatePretty } from "./format.js";
import { onRowLabelClick, renderFromCache, revealFocusRow } from "./timeline.js";
import { onRowAction, showTooltip } from "./tooltip.js";

// A range wide enough to hold the whole of one contact, and no wider: a ten
// degree orb on Pluto is a window measured in decades, and centring the view on
// all of it would put the reader back where they started.
const MAX_JUMP_DAYS = 3650;

/** @param {{transit:string, aspect:string, natal:string}} rule */
function ruleTitle(rule){
  return `${planetLabel(rule.transit)} ${aspectSymbol(rule.aspect)} ${planetLabel(rule.natal)}`;
}

function rangeDays(){
  const start = parseLocalDateOnly(el.rangeStart.value);
  const end = parseLocalDateOnly(el.rangeEnd.value);
  return Math.max(1, Math.round((addDaysLocal(end, 1).getTime() - start.getTime()) / DAY_MS));
}

/** @param {{transit:string, aspect:string, natal:string, orb?:number}|null} rule */
export function setFocusRule(rule){
  state.focusRule = rule ? { transit: rule.transit, aspect: rule.aspect, natal: rule.natal, orb: rule.orb } : null;
  state.focusStatus = "";
  renderRowFocus();
  if (state.cachedResults) renderFromCache(state.currentMaxRows);
}

export function clearRowFocus(){
  if (!state.focusRule && !state.focusStatus) return;
  state.focusRule = null;
  state.focusStatus = "";
  state.focusSearching = false;
  renderRowFocus();
  if (state.cachedResults) renderFromCache(state.currentMaxRows);
}

export function renderRowFocus(){
  const bar = el.rowFocus;
  if (!bar) return;
  const rule = state.focusRule;
  bar.hidden = !rule;
  if (!rule) return;
  if (el.rowFocusTitle) el.rowFocusTitle.textContent = ruleTitle(rule);
  if (el.rowFocusResult) el.rowFocusResult.textContent = state.focusStatus;
  for (const btn of [el.rowFocusPrev, el.rowFocusNext]){
    if (btn) btn.disabled = state.focusSearching;
  }
}

function setFocusStatus(text){
  state.focusStatus = text;
  if (el.rowFocusResult) el.rowFocusResult.textContent = text;
}

/**
 * The two dates the range inputs take, for a found occurrence.
 * @param {{at:number, event:{start:number, end:number}}} hit
 */
export function jumpRangeFor(hit){
  const { days, centreMs } = occurrenceWindow(hit, rangeDays(), MAX_JUMP_DAYS);
  const centre = new Date(centreMs);
  const centreDay = new Date(centre.getFullYear(), centre.getMonth(), centre.getDate());
  const half = Math.floor(days / 2);
  return { start: addDaysLocal(centreDay, -half), end: addDaysLocal(centreDay, days - half - 1) };
}

/** @param {number} direction -1 for the last one, +1 for the next */
async function stepOccurrence(direction){
  const rule = state.focusRule;
  if (!rule || state.focusSearching) return;

  const orb = Number(el.orb.value || 1);
  const searchRule = { transit: rule.transit, natal: rule.natal, aspect: rule.aspect, orb };
  const fromMs = direction < 0
    ? parseLocalDateOnly(el.rangeStart.value).getTime()
    : addDaysLocal(parseLocalDateOnly(el.rangeEnd.value), 1).getTime();
  const word = direction < 0 ? "before" : "after";

  state.focusSearching = true;
  renderRowFocus();
  try {
    const ctx = currentChartContext();
    const hit = await findOccurrence({
      rule: searchRule,
      direction,
      fromMs,
      mode: ctx.mode,
      observer: ctx.observer,
      natalLon: natalLongitudes(ctx, [rule.natal]),
      onReach: (years) => setFocusStatus(`Looking ${years === 1 ? "a year" : `${years} years`} ${word} this range…`)
    });
    if (!hit){
      setFocusStatus(`Nothing in the ${SEARCH_LIMIT_YEARS} years ${word} this range.`);
      return;
    }
    const at = new Date(hit.at);
    const when = fmtDatePretty(at, true);
    const { start, end } = jumpRangeFor(hit);
    el.rangeStart.value = fmtLocalYYYYMMDD(start);
    el.rangeEnd.value = fmtLocalYYYYMMDD(end);
    setFocusStatus(hit.exact
      ? `${direction < 0 ? "Last" : "Next"} exact ${when}`
      : `${direction < 0 ? "Last" : "Next"} pass around ${when}, never quite exact`);
    await requestUpdate();
    revealFocusRow();
  } catch (err){
    setFocusStatus(String(err?.message || err));
  } finally {
    state.focusSearching = false;
    renderRowFocus();
  }
}

/** Narrows the chooser to the focused row: this pairing, this aspect, alone. */
function showOnlyFocused(){
  const rule = state.focusRule;
  if (!rule) return;
  renderAspectChecks([rule.aspect]);
  if (state.appMode === "world") setSelection({ sky: [rule.transit, rule.natal] });
  else setSelection({ transit: [rule.transit], natal: [rule.natal], link: "directed" });
}

function openRowMenu(e, rule){
  setFocusRule(rule);
  // No dates: a bar's popup is about one pass and opens with the window it
  // covers, and this is about the pairing itself. What it carries instead is
  // the reading, and the three things there are to do with a row.
  showTooltip(e, ruleTitle(rule), ruleKey(rule), "", true, mythKeyFor(rule.transit, rule.natal), "", null, [
    { action: "prev", label: "‹ Last time" },
    { action: "next", label: "Next time ›" },
    { action: "only", label: "Only this" }
  ]);
}

export function wireRowFocus(){
  onRowLabelClick(openRowMenu);
  onRowAction((action) => {
    if (action === "prev") stepOccurrence(-1);
    else if (action === "next") stepOccurrence(1);
    else if (action === "only") showOnlyFocused();
  });
  if (el.rowFocusPrev) el.rowFocusPrev.addEventListener("click", () => stepOccurrence(-1));
  if (el.rowFocusNext) el.rowFocusNext.addEventListener("click", () => stepOccurrence(1));
  if (el.rowFocusClear) el.rowFocusClear.addEventListener("click", () => clearRowFocus());
  renderRowFocus();
}
