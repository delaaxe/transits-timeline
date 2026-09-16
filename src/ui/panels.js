import { setShowRangeNav, state } from "../state.js";
import { requestUpdate } from "../refresh.js";
import { calcNatalAscDeg, calcNatalMCDeg, computeCompositeChart } from "../core/chart.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "../core/ephemeris.js";
import { addDaysLocal, fmtLocalYYYYMMDD, parseBirthUTCFor, parseLocalDateOnly } from "../core/time.js";
import { planetSymbols, summaryPlanetOrder, summaryPointSymbols, summaryTailOrder, zodiacSignSymbol } from "../data/bodies.js";
import { defaultPresetKey, presets } from "../data/presets.js";
import { awsAutocomplete, awsGetPlace, extractPosition } from "../services/places.js";
import { chartsState, defaultChartData, getActiveChart, getActiveChartA, getActiveChartB, isDefaultChart, lastChartKey, loadCharts, newId, normalizeChart, saveCharts } from "../storage/charts.js";
import { $, debounce, el, escapeHTML, installHint, installHintText, setStatus } from "./dom.js";
import { getCheckedAspects, renderAspectChecks } from "./aspects.js";
import { applyBodySets, renderBodyPicker, selectedBodies } from "./bodies.js";
import { clearRowFocus } from "./rowfocus.js";
import { slide } from "./slide.js";
import { renderFromCache } from "./timeline.js";
import { fmtBirthPretty, fmtCoord } from "./format.js";
import { wireChartReorder } from "./chart-drag.js";
import { wireTransferUI } from "./transfer.js";
import { isIOSLike } from "./tooltip.js";
import { errorMessage } from "../core/errors.js";

export function rangeSpanDays(){
  const start = parseLocalDateOnly(el.rangeStart.value);
  const end = parseLocalDateOnly(el.rangeEnd.value);
  const endExclusive = addDaysLocal(end, 1);
  return Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / (24 * 3600 * 1000)));
}

export function setRangeDates(start, end){
  el.rangeStart.value = fmtLocalYYYYMMDD(start);
  el.rangeEnd.value = fmtLocalYYYYMMDD(end);
  requestUpdate();
}

export function shiftRange(direction){
  const start = parseLocalDateOnly(el.rangeStart.value);
  const end = parseLocalDateOnly(el.rangeEnd.value);
  const delta = rangeSpanDays() * direction;
  setRangeDates(addDaysLocal(start, delta), addDaysLocal(end, delta));
}

export function expandRange(direction){
  const start = parseLocalDateOnly(el.rangeStart.value);
  const end = parseLocalDateOnly(el.rangeEnd.value);
  const delta = rangeSpanDays() * direction;
  if (direction < 0){
    setRangeDates(addDaysLocal(start, delta), end);
  } else {
    setRangeDates(start, addDaysLocal(end, delta));
  }
}

/**
 * Shows or hides the arrows that move the range.
 *
 * The corner block is sized from --timeline-nav-total, because it has to cover
 * the label column for the whole height of the axis and the arrows above it.
 * With the arrows gone there is no row to cover, so the variable goes to zero
 * and comes back by being removed rather than by being set: the stylesheet
 * gives the row a taller value on a touch screen, and a number written here
 * would overwrite that.
 *
 * The corner block's height is set at the open end of the slide and cleared at
 * the closed end, so it is never briefly too short - which would let the label
 * column show through the axis. Briefly too tall costs nothing: the axis block
 * around it clips.
 *
 * @param {boolean} isVisible @param {{animate?:boolean}} [opts]
 */
export function setRangeNavVisible(isVisible, { animate = true } = {}){
  setShowRangeNav(isVisible);
  const on = state.showRangeNav;
  if (on) document.documentElement.style.removeProperty("--timeline-nav-total");
  if (el.timelineNavToggle){
    el.timelineNavToggle.setAttribute("aria-expanded", on ? "true" : "false");
    // The same band the preset chips take when they are on, which is how the
    // options button beside it says the same thing.
    el.timelineNavToggle.classList.toggle("active", on);
  }

  // The first call of the session is the stored setting being applied rather
  // than a button being pressed, and a panel sliding out of a page that has not
  // finished arriving is a different thing from one answering a tap.
  const settle = () => {
    if (!on) document.documentElement.style.setProperty("--timeline-nav-total", "0px");
    // The arrows sit inside the sticky axis block, so showing them changes how
    // tall it is and how far the chart has to travel under it.
    if (state.cachedResults) renderFromCache(state.currentMaxRows);
  };
  if (!animate){
    if (el.timelineNav) el.timelineNav.hidden = !on;
    settle();
    return Promise.resolve();
  }
  return slide(el.timelineNav, on).then(settle);
}

export function wireRangeNav(){
  if (el.rangeShiftBack) el.rangeShiftBack.addEventListener("click", () => shiftRange(-1));
  if (el.rangeShiftForward) el.rangeShiftForward.addEventListener("click", () => shiftRange(1));
  if (el.rangeExpandBack) el.rangeExpandBack.addEventListener("click", () => expandRange(-1));
  if (el.rangeExpandForward) el.rangeExpandForward.addEventListener("click", () => expandRange(1));
  setRangeNavVisible(state.showRangeNav, { animate: false });
  if (el.timelineNavToggle){
    el.timelineNavToggle.addEventListener("click", () => setRangeNavVisible(!state.showRangeNav));
  }
}

export function readRuleOptions(){
  const bodies = selectedBodies();
  return {
    mode: state.bodyMode,
    transitBodies: bodies.transit ?? [],
    natalBodies: bodies.natal ?? [],
    involvingBodies: bodies.involving ?? [],
    worldBodies: bodies.world ?? [],
    aspects: getCheckedAspects(),
    orb: Number($("orb").value || 1.0)
  };
}

export let advancedVisible = false;

/** @param {boolean} isVisible @param {{animate?:boolean}} [opts] */
export function setAdvancedVisible(isVisible, { animate = true } = {}){
  advancedVisible = !!isVisible;
  const nodes = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll("[data-advanced]"));
  // The drawer slides out from under the button that opened it. Everything here
  // is a panel of its own, so they each get their own slide rather than a
  // wrapper being animated around them.
  for (const n of nodes){
    if (animate) slide(n, advancedVisible);
    else n.hidden = !advancedVisible;
  }
  if (el.advancedToggle){
    el.advancedToggle.setAttribute("aria-expanded", advancedVisible ? "true" : "false");
    // Sliders rather than a word: this sits in the view bar beside four preset
    // chips, and any label wide enough to read pushes the bar to two lines on a
    // phone. The state is carried by the drawer being open, and by the button
    // taking the chips' active band while it is.
    el.advancedToggle.classList.toggle("active", advancedVisible);
  }
}

/**
 * @param {HTMLElement|null} wrap
 * @param {string|null} activeId
 * @param {{allowAdd?: boolean, disableId?: string|null}} [opts]
 */
export function renderChartButtonsFor(wrap, activeId, { allowAdd=true, disableId=null } = {}){
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const p of chartsState.list){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chartBtn" + ((!chartsState.addMode && p.id === activeId) ? " active" : "");
    btn.dataset.chartId = p.id;
    btn.textContent = p.name || "(unnamed)";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", (!chartsState.addMode && p.id === activeId) ? "true" : "false");
    btn.title = "Drag to reorder";
    if (disableId && p.id === disableId){
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
    }
    wrap.appendChild(btn);
  }
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "chartBtn add" + (chartsState.addMode ? " active" : "");
  addBtn.dataset.chartId = "__add__";
  addBtn.textContent = "＋ Add";
  addBtn.setAttribute("role", "option");
  addBtn.setAttribute("aria-selected", chartsState.addMode ? "true" : "false");
  if (!allowAdd){
    addBtn.disabled = true;
    addBtn.style.visibility = "hidden";
    addBtn.style.pointerEvents = "none";
    addBtn.setAttribute("aria-hidden", "true");
  }
  wrap.appendChild(addBtn);
}

export function buildSymbolPlacementsLine(lonByKey){
  const pieces = [];
  for (const k of summaryPlanetOrder){
    if (summaryTailOrder.includes(k)) continue;
    const lon = lonByKey?.[k];
    if (!Number.isFinite(lon)) continue;
    const planetGlyph = planetSymbols[k];
    if (!planetGlyph) continue;
    pieces.push(`${planetGlyph}\u00A0${zodiacSignSymbol(lon)}`);
  }
  for (const k of summaryTailOrder){
    const lon = lonByKey?.[k];
    if (!Number.isFinite(lon)) continue;
    const glyph = summaryPointSymbols[k] || planetSymbols[k];
    if (!glyph) continue;
    pieces.push(`${glyph}\u00A0${zodiacSignSymbol(lon)}`);
  }
  return pieces.join("\u00A0\u00A0 ");
}

export function buildChartSummaryText(pA, pB, { includePlacementsLine=false } = {}){
  if (chartsState.addMode) return "Add a new chart.";
  if (!pA) return "";
  if (state.appMode !== "personal") return "";
  if (chartsState.mode === "composite" && !pB) return "Pick two charts to build a composite.";
  const parts = [];
  let placementsLine = "";
  try{
    if (ephemerisAstronomy && typeof ephemerisAstronomy.getAllPlanets === "function"){
      if (chartsState.mode === "composite"){
        if (!pB) throw new Error("Select two charts.");
        const composite = computeCompositeChart(pA, pB);
        parts.push(`Composite of ${pA.name} & ${pB.name}`);
        if (includePlacementsLine){
          placementsLine = buildSymbolPlacementsLine({
            ...composite.lon,
            asc: composite.asc,
            mc: composite.mc
          });
        }
      } else {
        const birthUTC = parseBirthUTCFor(pA);
        const allPlanets = ephemerisAstronomy.getAllPlanets(birthUTC, pA.lon, pA.lat, 0);
        if (includePlacementsLine){
          const lonByKey = {};
          for (const key of summaryPlanetOrder){
            // Not getPlanetLonFromAll: the node is computed analytically rather
            // than observed, so that one throws for it - into the catch below,
            // which would have silently dropped the entire line.
            lonByKey[key] = getBodyLonFromAll(allPlanets, key, birthUTC);
          }
          lonByKey.asc = calcNatalAscDeg(birthUTC, pA.lon, pA.lat);
          lonByKey.mc = calcNatalMCDeg(birthUTC, pA.lon);
          placementsLine = buildSymbolPlacementsLine(lonByKey);
        }
      }
    }
  } catch {}
  if (chartsState.mode !== "composite"){
    parts.push(fmtBirthPretty(pA.birthDate, pA.birthTime));
    if (pA.placeLabel) parts.push(pA.placeLabel);
    const cc = fmtCoord(pA.lat, pA.lon);
    if (cc) parts.push(cc);
  }
  const firstLine = parts.join("\u00A0\u00A0 ");
  if (includePlacementsLine && placementsLine){
    return firstLine ? `${firstLine}\n${placementsLine}` : placementsLine;
  }
  return firstLine;
}

export function renderAppModeSection(){
  const appModeIsPersonal = state.appMode === "personal";
  if (el.appModePersonalBtn){
    el.appModePersonalBtn.classList.toggle("active", appModeIsPersonal);
    el.appModePersonalBtn.setAttribute("aria-selected", appModeIsPersonal ? "true" : "false");
  }
  if (el.appModeWorldBtn){
    el.appModeWorldBtn.classList.toggle("active", !appModeIsPersonal);
    el.appModeWorldBtn.setAttribute("aria-selected", appModeIsPersonal ? "false" : "true");
  }
  if (el.personalPanel) el.personalPanel.hidden = !appModeIsPersonal;
  if (el.personalSection) el.personalSection.hidden = !appModeIsPersonal;
  // The natal end of the chooser, and with it both angles, belongs to a birth
  // chart: a world transit has neither a natal side nor an Ascendant.
  renderBodyPicker();
}

export function renderPersonalSection(){
  renderAppModeSection();
  if (state.appMode !== "personal") return;

  const canCompare = chartsState.list.length >= 2;
  if (!canCompare && chartsState.mode !== "single") chartsState.mode = "single";

  const allowAddA = chartsState.mode === "single";
  const disableA = (chartsState.mode === "composite" && chartsState.activeIdB) ? chartsState.activeIdB : null;
  renderChartButtonsFor(el.chartButtons, chartsState.activeIdA, { allowAdd: allowAddA, disableId: disableA });
  renderChartButtonsFor(el.chartButtonsB, chartsState.activeIdB, { allowAdd: false, disableId: chartsState.activeIdA });

  const isComposing = chartsState.mode === "composing";
  const isComposite = chartsState.mode === "composite";
  if (el.chartPickerB) el.chartPickerB.hidden = !canCompare || (!isComposing && !isComposite);
  if (el.composeToggle) el.composeToggle.hidden = !canCompare || isComposing || isComposite;
  if (el.composeDot) el.composeDot.hidden = !canCompare || isComposing || isComposite;
  const linksVisible = !(chartsState.addMode || isComposing || isComposite);
  if (el.chartLinks){
    el.chartLinks.hidden = !linksVisible;
    el.chartLinks.style.display = linksVisible ? "flex" : "none";
  }
  if (el.chartPrivacy) el.chartPrivacy.hidden = !chartsState.addMode;
  const needsB = chartsState.mode === "composing" && !chartsState.activeIdB;
  if (el.composeHint){
    if (needsB){
      el.composeHint.textContent = "The composite chart is the relationship of the two chosen charts (midpoints method)";
      el.composeHint.hidden = false;
    } else if (chartsState.mode === "composing" || chartsState.mode === "composite"){
      el.composeHint.textContent = buildChartSummaryText(getActiveChartA(), getActiveChartB());
      el.composeHint.hidden = false;
    } else {
      el.composeHint.hidden = true;
      el.composeHint.textContent = "";
    }
  }
  if (el.mainContent) el.mainContent.hidden = needsB;
  if (el.composeStopRow){
    const showStop = isComposing || isComposite;
    el.composeStopRow.hidden = !showStop;
    el.composeStopRow.style.display = showStop ? "flex" : "none";
  }


  if (el.chartSummaryToggle){
    el.chartSummaryToggle.textContent = state.chartSummaryVisible ? "Hide data" : "Show data";
    el.chartSummaryToggle.setAttribute("aria-expanded", state.chartSummaryVisible ? "true" : "false");
  }

  const pA = getActiveChartA();
  const pB = getActiveChartB();
  const showDelete = linksVisible && !!pA;
  if (el.deleteChartBtn){
    el.deleteChartBtn.hidden = !showDelete;
    el.deleteChartBtn.disabled = !showDelete;
  }
  if (el.deleteDot) el.deleteDot.hidden = !showDelete;

  if (el.chartSummary){
    if (chartsState.mode === "single"){
      const summaryText = buildChartSummaryText(pA, pB, { includePlacementsLine: true });
      const splitAt = summaryText.indexOf("\n");
      if (splitAt >= 0){
        const metaLine = summaryText.slice(0, splitAt);
        const glyphLine = summaryText.slice(splitAt + 1);
        el.chartSummary.textContent = "";
        if (metaLine){
          el.chartSummary.appendChild(document.createTextNode(metaLine));
          el.chartSummary.appendChild(document.createElement("br"));
        }
        const glyphSpan = document.createElement("span");
        glyphSpan.className = "symbolGlyphText";
        glyphSpan.textContent = glyphLine;
        el.chartSummary.appendChild(glyphSpan);
      } else {
        el.chartSummary.textContent = summaryText;
      }
      el.chartSummary.hidden = !state.chartSummaryVisible;
    } else {
      el.chartSummary.hidden = true;
    }
  }
}

export function setChartSummaryVisible(isVisible){
  state.chartSummaryVisible = !!isVisible;
  renderPersonalSection();
}

export function renderPresetSection(){
  el.presetButtons.innerHTML = "";
  for (const p of presets){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "presetBtn" + (p.key === state.activePresetKey ? " active" : "");
    btn.dataset.presetKey = p.key;
    btn.textContent = p.label;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", p.key === state.activePresetKey ? "true" : "false");
    el.presetButtons.appendChild(btn);
  }
}

export function setAddMode(isAdd){
  if (state.appMode !== "personal"){
    chartsState.addMode = false;
    el.addChartPanel.style.display = "none";
    renderPersonalSection();
    return;
  }
  chartsState.addMode = isAdd;
  el.addChartPanel.style.display = isAdd ? "" : "none";
  if (!isAdd) hideSuggest();
  renderPersonalSection();
}

export function setActiveChartA(id){
  chartsState.activeIdA = id;
  const p = chartsState.list.find(x => x.id === id);
  if (p && !isDefaultChart(p)) localStorage.setItem(lastChartKey, id);
  chartsState.addMode = false;
  el.addChartPanel.style.display = "none";
  hideSuggest();
  renderPersonalSection();
}

export function setActiveChartB(id){
  chartsState.activeIdB = id;
  chartsState.addMode = false;
  el.addChartPanel.style.display = "none";
  hideSuggest();
  if (chartsState.mode === "composing") chartsState.mode = "composite";
  renderPersonalSection();
}

export function setMode(modeKey){
  const canCompare = chartsState.list.length >= 2;
  if (modeKey === "composing" && canCompare) chartsState.mode = "composing";
  else if (modeKey === "composite" && canCompare) chartsState.mode = "composite";
  else chartsState.mode = "single";
  renderPersonalSection();
}

export function toggleCompose(){
  if (chartsState.mode === "single"){
    chartsState.activeIdB = "";
    setMode("composing");
  } else {
    setMode("single");
  }
}

export function setAppMode(modeKey){
  state.appMode = (modeKey === "world") ? "world" : "personal";
  if (state.appMode !== "personal"){
    chartsState.addMode = false;
    state.chartSummaryVisible = false;
    if (el.addChartPanel) el.addChartPanel.style.display = "none";
  }
  // A world transit is not a row of a birth chart, so whatever was focused
  // does not survive the crossing.
  clearRowFocus();
  // A preset describes both modes at once - each carries its own set of bodies
  // for the world - so reapplying it is what puts that half in place. A
  // selection built by hand is left alone: the three lists are separate, and
  // glancing at the World view and coming back is no way to lose one.
  if (state.activePresetKey) applyPreset(state.activePresetKey);
  renderPersonalSection();
}

export function hideSuggest(){
  const box = el.placeSuggest;
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
}

export function showSuggest(items){
  const box = el.placeSuggest;
  box.innerHTML = "";
  if (!items || items.length === 0){
    hideSuggest();
    return;
  }
  for (const it of items){
    const div = document.createElement("div");
    div.className = "suggestItem";
    div.innerHTML = `<div class="suggestTitle">${escapeHTML(it.label)}</div>` + (it.sub ? `<div class="suggestSub">${escapeHTML(it.sub)}</div>` : "");
    div.addEventListener("mousedown", (e) => { e.preventDefault(); selectSuggestion(it); });
    box.appendChild(div);
  }
  box.hidden = false;
}

export async function selectSuggestion(it){
  el.placeSearch.value = it.label;
  el.placeSearch.dataset.placeId = it.placeId;
  hideSuggest();

  try{
    setStatus("Looking up place…");
    const gp = await awsGetPlace(it.placeId);
    const pos = extractPosition(gp);
    if (pos){
      el.placeSearch.dataset.lon = String(pos[0]);
      el.placeSearch.dataset.lat = String(pos[1]);
    }
    const tzName = gp?.TimeZone?.Name || "";
    el.placeSearch.dataset.tzName = tzName;
    setStatus("Place set.");
  } catch (err){
    setStatus(errorMessage(err), true);
  }
}

export const runAutocompleteDebounced = debounce(async () => {
  const q = el.placeSearch.value.trim();
  if (q.length < 2){
    hideSuggest();
    return;
  }
  try{
    const data = await awsAutocomplete(q);
    const items = (data?.ResultItems || []).map(r => {
      const label = r?.Address?.Label || r?.Title || "";
      const sub = (r?.Address?.Country?.Name || r?.Address?.Country?.Code3 || r?.Address?.Country?.Code2 || "");
      return { placeId: r?.PlaceId || "", label, sub };
    }).filter(x => x.placeId && x.label);
    showSuggest(items);
  } catch {
    hideSuggest();
  }
}, 250);

export function enterAddMode(){
  setAddMode(true);

  el.addChartName.value = "";
  const now = new Date();
  el.addChartBirthDate.value = fmtLocalYYYYMMDD(now);
  el.addChartBirthTime.value = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  el.placeSearch.value = "";
  el.placeSearch.dataset.placeId = "";
  el.placeSearch.dataset.lon = "";
  el.placeSearch.dataset.lat = "";
  el.placeSearch.dataset.tzName = "";
  hideSuggest();

  setStatus("Fill the fields and click Save.");
  setTimeout(() => el.addChartName.focus(), 0);
}

export function exitAddMode(){
  setAddMode(false);
  setStatus("");
}

export function switchToChartA(id){
  if (id === "__add__"){
    enterAddMode();
    return;
  }
  setActiveChartA(id);
  requestUpdate();
}

export function switchToChartB(id){
  if (id === "__add__"){
    enterAddMode();
    return;
  }
  setActiveChartB(id);
  requestUpdate();
}

export function addChartFromForm(){
  const name = el.addChartName.value.trim() || "New chart";
  const birthDate = el.addChartBirthDate.value;
  const birthTime = el.addChartBirthTime.value || "00:00";
  const placeLabel = el.placeSearch.value.trim();
  const placeId = el.placeSearch.dataset.placeId || "";
  const lon = Number(el.placeSearch.dataset.lon || NaN);
  const lat = Number(el.placeSearch.dataset.lat || NaN);
  const tzName = el.placeSearch.dataset.tzName || "";

  if (!birthDate) throw new Error("Birth date is required.");
  if (!placeId || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Pick a birth place from the suggestions.");

  const p = normalizeChart({ id: newId(), name, birthDate, birthTime, placeLabel, placeId, lon, lat, tzName });
  if (chartsState.list.length === 1 && isDefaultChart(chartsState.list[0])){
    chartsState.list = [p];
  } else {
    chartsState.list.push(p);
  }
  saveCharts(chartsState.list);

  setActiveChartA(p.id);
  requestUpdate();
}

export function deleteActiveChart(){
  const p = getActiveChart();
  if (!p) return;
  const ok = confirm(`Delete "${p.name}"?`);
  if (!ok) return;

  chartsState.list = chartsState.list.filter(x => x.id !== p.id);
  saveCharts(chartsState.list);

  if (chartsState.list.length === 0){
    chartsState.activeIdA = "";
    chartsState.activeIdB = "";
    localStorage.removeItem(lastChartKey);
    enterAddMode();
    return;
  }
  setActiveChartA(chartsState.list[0].id);
  if (!chartsState.list.some(x => x.id === chartsState.activeIdB)){
    chartsState.activeIdB = chartsState.list[0].id;
  }
  requestUpdate();
}

export function initCharts(){
  chartsState.list = loadCharts();
  if (chartsState.list.length === 0){
    const seed = normalizeChart({
      id: newId(),
      ...defaultChartData
    });
    chartsState.list = [seed];
  }
  const last = localStorage.getItem(lastChartKey);
  chartsState.activeIdA = (last && chartsState.list.some(p => p.id === last)) ? last : chartsState.list[0].id;
  const fallbackB = chartsState.list.find(p => p.id !== chartsState.activeIdA);
  chartsState.activeIdB = fallbackB ? fallbackB.id : chartsState.activeIdA;

  chartsState.addMode = false;
  el.addChartPanel.style.display = "none";
  renderPersonalSection();
  setChartSummaryVisible(false);
}

export function wireChartsUI(){
  wireTransferUI((newChartId) => {
    if (newChartId) setActiveChartA(newChartId);
    else renderPersonalSection();
    requestUpdate();
  });
  wireChartReorder(el.chartButtons, () => renderPersonalSection());
  wireChartReorder(el.chartButtonsB, () => renderPersonalSection());
  el.chartButtons.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-chart-id]");
    if (!btn) return;
    switchToChartA(btn.dataset.chartId);
  });
  if (el.chartButtonsB){
    el.chartButtonsB.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-chart-id]");
      if (!btn) return;
      if (btn.disabled) return;
      switchToChartB(btn.dataset.chartId);
    });
  }
  if (el.composeToggle){
    el.composeToggle.addEventListener("click", () => {
      toggleCompose();
      requestUpdate();
    });
  }
  if (el.composeStopBtn){
    el.composeStopBtn.addEventListener("click", () => {
      toggleCompose();
      requestUpdate();
    });
  }
  if (el.appModePersonalBtn){
    el.appModePersonalBtn.addEventListener("click", () => {
      setAppMode("personal");
      requestUpdate();
    });
  }
  if (el.appModeWorldBtn){
    el.appModeWorldBtn.addEventListener("click", () => {
      setAppMode("world");
      requestUpdate();
    });
  }
  if (el.chartSummaryToggle){
    el.chartSummaryToggle.addEventListener("click", () => {
      setChartSummaryVisible(!state.chartSummaryVisible);
    });
  }
  el.deleteChartBtn.addEventListener("click", deleteActiveChart);

  $("saveChartBtn").addEventListener("click", () => {
    try { addChartFromForm(); }
    catch (err){ setStatus(errorMessage(err), true); }
  });

  $("cancelAddBtn").addEventListener("click", () => {
    if (chartsState.list.length === 0) return;
    exitAddMode();
    renderPersonalSection();
  });

  el.placeSearch.addEventListener("input", () => {
    el.placeSearch.dataset.placeId = "";
    el.placeSearch.dataset.lon = "";
    el.placeSearch.dataset.lat = "";
    el.placeSearch.dataset.tzName = "";
    runAutocompleteDebounced();
  });
  el.placeSearch.addEventListener("focus", () => runAutocompleteDebounced());
  document.addEventListener("click", (e) => {
    const box = el.placeSuggest;
    const wrap = el.placeSearch.parentElement;
    if (box && wrap && !wrap.contains(e.target)) hideSuggest();
  });
}

// The date axis sticks to the bottom edge of the view bar, so that offset has
// to be the bar's real height rather than a guess: the preset chips wrap on a
// narrow phone, and the bar grows when they do. The stylesheet's value is what
// applies until this has measured, and if it never runs.
export function wireViewBar(){
  const bar = el.viewBar;
  if (!bar) return;
  const sync = () => {
    const h = Math.round(bar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--viewbar-h", `${h}px`);
  };
  // Scrolled, the bar sheds a few pixels. The class flips once at the
  // threshold rather than on every frame, and the ResizeObserver above turns
  // the new height into the date axis's sticky offset by itself.
  //
  // The threshold is the bar reaching the top, not a distance down the page.
  // Twenty-four pixels of scroll was the old test, and the bar does not start
  // at the top: on a desktop it opens about a hundred and seventy pixels down,
  // under the header and the chart panel. So a small scroll shrank it where it
  // stood, in the middle of the page, with everything above it untouched - and
  // it stayed shrunk for the whole hundred and fifty pixels before it had
  // anything to be a header for.
  //
  // Asking the bar where it is cannot answer this. Stuck, its top reads zero
  // however far past it the page has gone, so a one-pixel marker in the flow
  // just above it carries the number instead. Everything that moves when the
  // bar resizes is below the marker, so the marker itself never does.
  //
  // The two thresholds are not the same line, and that is the point. Compacting
  // sheds eighteen pixels, the document loses the same eighteen, and at the end
  // of a short page the browser claws the scroll position back by that much -
  // which lifts the marker back over a single shared threshold and un-compacts,
  // which gives the eighteen pixels back, which compacts again. Measured, with
  // one threshold: on at a top of 0, off at 2, on at 0, the scroll position
  // walking backwards each time. Putting the release further away than the bar
  // can ever shed leaves the loop nothing to close through.
  const SHED_MARGIN_PX = 24;
  let compact = false;
  const setCompact = (next) => {
    if (next === compact) return;
    compact = next;
    document.body.classList.toggle("scrolled", compact);
    sync();
  };

  const sentinel = document.createElement("div");
  sentinel.className = "viewBarSentinel";
  sentinel.setAttribute("aria-hidden", "true");
  bar.parentNode?.insertBefore(sentinel, bar);

  const syncCompact = () => {
    const top = sentinel.getBoundingClientRect().top;
    if (!compact && top < -SHED_MARGIN_PX) setCompact(true);
    else if (compact && top > 0) setCompact(false);
  };

  // One read per frame rather than one per scroll event: this measures, and a
  // scroll fires far more often than the screen is drawn.
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncCompact();
    });
  };

  sync();
  syncCompact();
  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(sync).observe(bar);
}

export function wireAdvancedUI(){
  setAdvancedVisible(false, { animate: false });
  el.advancedToggle.addEventListener("click", () => {
    setAdvancedVisible(!advancedVisible);
  });
}

export function wireAutoUpdate(){
  const updateDebounced = debounce(() => requestUpdate(), 150);
  el.rangeStart.addEventListener("change", requestUpdate);
  el.rangeEnd.addEventListener("change", requestUpdate);
  // Bodies, aspects and orb are the shape of the question, and a preset is a
  // name for one shape: edit any of them and no preset describes what is on
  // screen any more, so none is lit. The range is navigation rather than shape -
  // the arrows either side of the chart are for moving around inside a view, not
  // for leaving it - so it leaves the chips alone.
  const divergeFromPreset = () => {
    if (!state.activePresetKey) return;
    state.activePresetKey = null;
    renderPresetSection();
  };
  el.orb.addEventListener("input", () => { divergeFromPreset(); updateDebounced(); });
  el.orb.addEventListener("change", () => { divergeFromPreset(); requestUpdate(); });
  el.aspectChecks.addEventListener("change", () => {
    divergeFromPreset();
    requestUpdate();
  });
}

export function applyPreset(key){
  const p = presets.find(x => x.key === key) ?? presets[0];
  state.activePresetKey = p.key;
  renderPresetSection();

  // Both ends and the world set at once, whichever mode is showing: a preset is a
  // whole query, and half-filling the one that is out of sight would leave the
  // other mode holding a selection nothing chose.
  applyBodySets({ transit: p.transit, natal: p.natal, world: p.world.bodies });
  el.orb.value = String(p.orb);
  state.currentMaxRows = 50;
  renderAspectChecks(p.aspects);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = addDaysLocal(todayStart, p.range.startOffsetDays);
  const end = addDaysLocal(todayStart, p.range.endOffsetDays);
  el.rangeStart.value = fmtLocalYYYYMMDD(start);
  el.rangeEnd.value = fmtLocalYYYYMMDD(end);
}

export function bootPresets(){
  applyPreset(defaultPresetKey);
  wirePresetButtons();
}

export function wirePresetButtons(){
  el.presetButtons.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-preset-key]");
    if (!btn) return;
    applyPreset(btn.dataset.presetKey);
    requestUpdate();
  });
}

export function isRunningAsPWA(){
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches)
    || /** @type {any} */ (window.navigator).standalone === true;
}

export let hasBeforeInstallPrompt = false;

export function wireInstallHint(){
  window.addEventListener("beforeinstallprompt", () => {
    hasBeforeInstallPrompt = true;
    updateInstallHint();
  });
  window.addEventListener("appinstalled", () => {
    hasBeforeInstallPrompt = false;
    updateInstallHint();
  });
  updateInstallHint();
}

export function updateInstallHint(){
  if (!installHint || !installHintText) return;
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = isIOSLike();
  const standalone = isRunningAsPWA();
  const canShow = !standalone && (isIOS || isAndroid || hasBeforeInstallPrompt);
  if (!canShow){
    installHint.hidden = true;
    installHintText.textContent = "";
    return;
  }
  if (isIOS){
    installHintText.textContent = "Tap Share, then Add to Home Screen.";
  } else {
    installHintText.textContent = "Open the browser menu, then tap Add to Home screen or Install app.";
  }
  installHint.hidden = false;
}
