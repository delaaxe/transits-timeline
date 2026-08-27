// Returns any: typing each lookup would drown the checker in casts.
/** @param {string} id @returns {any} */
export const $ = (id) => (typeof document === "undefined" ? null : document.getElementById(id));

export const el = {
  appModePersonalBtn: $("appModePersonalBtn"),
  appModeWorldBtn: $("appModeWorldBtn"),
  personalPanel: $("personalPanel"),
  personalSection: $("personalSection"),
  chartButtons: $("chartButtons"),
  chartButtonsB: $("chartButtonsB"),
  chartSummary: $("chartSummary"),
  chartSummaryToggle: $("chartSummaryToggle"),
  deleteChartBtn: $("deleteChartBtn"),
  deleteDot: $("deleteDot"),
  composeDot: $("composeDot"),
  composeToggle: $("composeToggle"),
  chartLinks: $("chartLinks"),
  chartPrivacy: $("chartPrivacy"),
  composeHint: $("composeHint"),
  composeStopRow: $("composeStopRow"),
  composeStopBtn: $("composeStopBtn"),
  chartPickerB: $("chartPickerB"),
  mainContent: $("mainContent"),
  natalGroupField: $("natalGroupField"),
  includeMCWrap: $("includeMCWrap"),
  addChartPanel: $("addChartPanel"),
  addChartName: $("addChartName"),
  addChartBirthDate: $("addChartBirthDate"),
  addChartBirthTime: $("addChartBirthTime"),
  placeSearch: $("placeSearch"),
  placeSuggest: $("placeSuggest"),
  presetButtons: $("presetButtons"),
  viewBar: $("viewBar"),
  transitGroup: $("transitGroup"),
  natalGroup: $("natalGroup"),
  rangeStart: $("rangeStart"),
  rangeEnd: $("rangeEnd"),
  orb: $("orb"),
  aspectChecks: $("aspectChecks"),
  advancedToggle: $("advancedToggle"),
  includeMoon: $("includeMoon"),
  includeMC: $("includeMC"),
  includeChiron: $("includeChiron"),
  includeNode: $("includeNode"),
  updateBtn: $("updateBtn"),
  status: $("status"),
  rangeShiftBack: $("rangeShiftBack"),
  rangeExpandBack: $("rangeExpandBack"),
  rangeExpandForward: $("rangeExpandForward"),
  rangeShiftForward: $("rangeShiftForward"),
  dateAxisSvg: $("dateAxisSvg"),
  dateAxisScroll: $("dateAxisScroll"),
  timelineScroll: $("timelineScroll"),
  aspectAxisSvg: $("aspectAxisSvg"),
  timelineSvg: $("timelineSvg"),
  timelineState: $("timelineState"),
  moreWrap: $("moreWrap"),
  showMoreBtn: $("showMoreBtn")
};

export const tooltip = $("tooltip");

export const tooltipBackdrop = $("tooltipBackdrop");

export const installHint = $("installHint");

export const installHintText = $("installHintText");

export function fillSelect(sel, items){
  sel.innerHTML = "";
  for (const it of items){
    const opt = document.createElement("option");
    opt.value = it[0];
    opt.textContent = it[1];
    sel.appendChild(opt);
  }
}

export function setStatus(msg, isError=false){
  el.status.textContent = msg;
  el.status.className = "status" + (isError ? " error" : "");
}

/**
 * The plate drawn where the chart would be. The status line says the same
 * things, but it lives in the options drawer, which is closed by default - so
 * computing, empty and failed all looked identical to an empty chart.
 * @param {string|null} text @param {"busy"|"empty"|"error"|null} kind
 */
export function setTimelineState(text, kind=null){
  const wrap = el.timelineState;
  if (!wrap) return;
  const frame = wrap.parentElement;
  if (!text || !kind){
    wrap.hidden = true;
    wrap.className = "timelineState";
    wrap.textContent = "";
    if (frame) frame.classList.remove("hasState");
    return;
  }
  wrap.className = `timelineState ${kind}`;
  wrap.textContent = "";
  const plate = document.createElement("div");
  plate.className = "timelineStatePlate";
  plate.textContent = text;
  wrap.appendChild(plate);
  wrap.hidden = false;
  if (frame) frame.classList.add("hasState");
}

export function escapeHTML(s){
  return String(s || "").replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function debounce(fn, ms){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

export async function copyTextToClipboard(text){
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext){
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
