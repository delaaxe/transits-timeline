// What a row does when it is tapped on the aspect axis.
//
// The label column was the one part of the chart that did nothing. It is also
// the part a reader points at: a row is a question - "Saturn square my Sun" -
// and the chart only ever answers it for the window on screen.
//
// So a tap on a label follows the row rather than opening anything over it. The
// row lights up and the focus bar appears, carrying what the window cannot
// give: when this last happened, and when it happens next. Both live outside
// the range by definition, so both move the range - and a found occurrence can
// be fifty years away, on a chart the reader has never seen, which is why the
// bar stays up naming the row and offering the same steps again rather than
// being a card that has to be reopened.
//
// A card is what the bars are for. Reading the prose about a pairing means
// tapping one of its passes, where the dates that prose is about are.

import { addDaysLocal, fmtLocalYYYYMMDD, parseLocalDateOnly } from "../core/time.js";
import { DAY_MS } from "../core/events.js";
import { aspectSymbol, planetLabel, planetSymbols } from "../data/bodies.js";
import { requestUpdate } from "../refresh.js";
import { currentChartContext, natalLongitudes } from "../services/chart-context.js";
import { SEARCH_LIMIT_YEARS, findOccurrence, occurrenceWindow } from "../services/search.js";
import { state } from "../state.js";
import { renderAspectChecks } from "./aspects.js";
import { setSelection } from "./bodies.js";
import { el } from "./dom.js";
import { fmtDatePretty } from "./format.js";
import { onRowLabelClick, renderFromCache, revealFocusRow } from "./timeline.js";

// A range wide enough to hold the whole of one contact, and no wider: a ten
// degree orb on Pluto is a window measured in decades, and centring the view on
// all of it would put the reader back where they started.
const MAX_JUMP_DAYS = 3650;

/** @param {{transit:string, aspect:string, natal:string}} rule */
function ruleTitle(rule){
  return `${planetLabel(rule.transit)} ${aspectSymbol(rule.aspect)} ${planetLabel(rule.natal)}`;
}

/**
 * The same pairing in glyphs, for when the words do not fit.
 *
 * Truncation would have been the other answer, and a worse one: an ellipsis eats
 * the natal end, and "Neptune △ Nep…" is exactly the half nobody can guess.
 * Glyphs lose no half, and are the same width whatever the pairing.
 *
 * @param {{transit:string, aspect:string, natal:string}} rule
 */
function ruleGlyphs(rule){
  const glyph = (k) => planetSymbols[k] || planetLabel(k);
  return `${glyph(rule.transit)} ${aspectSymbol(rule.aspect)} ${glyph(rule.natal)}`;
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
  if (el.rowFocusResult) el.rowFocusResult.textContent = state.focusStatus;
  for (const btn of [el.rowFocusPrev, el.rowFocusNext, el.rowFocusOnly]){
    if (btn) btn.disabled = state.focusSearching;
  }
  fitFocusTitle();
}

/**
 * The words wherever they fit, and the glyphs where they do not.
 *
 * A pairing is anything from "Sun ☌ Mc" to "Neptune △ Neptune" - four times the
 * width - so which of the two forms the bar has room for is a question about
 * this pairing at this width, not about the screen. It is asked by writing the
 * words and looking: if the buttons are still on the title's line they fit, and
 * if they have dropped to the next one they did not. Either way the full name
 * stays on the title and the accessible name.
 */
export function fitFocusTitle(){
  const title = el.rowFocusTitle;
  const rule = state.focusRule;
  if (!title || !rule || el.rowFocus?.hidden) return;

  const words = ruleTitle(rule);
  title.title = words;
  title.setAttribute("aria-label", words);
  title.textContent = words;

  const last = el.rowFocusOnly;
  if (!last) return;
  // Below the title's last line, not merely lower than its top: the row centres
  // its items, so a taller button on the same line already starts above the
  // title's own top and comparing those would read as a wrap every time.
  const wrapped = last.getBoundingClientRect().top > title.getBoundingClientRect().bottom;
  if (wrapped) title.textContent = ruleGlyphs(rule);
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
  else setSelection({ mode: "directed", transit: [rule.transit], natal: [rule.natal] });
}

export function wireRowFocus(){
  onRowLabelClick((e, rule) => setFocusRule(rule));
  if (el.rowFocusPrev) el.rowFocusPrev.addEventListener("click", () => stepOccurrence(-1));
  if (el.rowFocusNext) el.rowFocusNext.addEventListener("click", () => stepOccurrence(1));
  if (el.rowFocusOnly) el.rowFocusOnly.addEventListener("click", () => showOnlyFocused());
  if (el.rowFocusClear) el.rowFocusClear.addEventListener("click", () => clearRowFocus());
  // Turning a phone gives the bar another 400px, or takes them away.
  window.addEventListener("resize", () => fitFocusTitle(), { passive: true });
  renderRowFocus();
}
