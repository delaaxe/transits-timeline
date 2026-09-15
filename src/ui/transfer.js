// Charts stay on the device. Exporting writes them as AAF - the exchange format
// Astro-Seek and the desktop programs read - to a file you can keep, or to the
// clipboard; importing reads AAF back from either. One dialog serves both ends,
// because both ask the same question: which of these charts?
import { chartsState, isDefaultChart, saveCharts } from "../storage/charts.js";
import { buildPayload, mergeCharts, parseCharts, planImport, transferFileName, transferMimeType } from "../storage/transfer.js";
import { el, setStatus } from "./dom.js";
import { fmtBirthPretty } from "./format.js";

// Three modes: the charts here (export), somewhere to paste or a file to open
// (import), and the charts that turned out to hold (receive). While receiving,
// `plan` says what each of those charts would do to what is already here,
// keyed by the chart's id.
/** @type {{ mode: string, charts: any[], chosen: Set<string>, plan: Map<string, any> }} */
const view = { mode: "export", charts: [], chosen: new Set(), plan: new Map() };

// A birthplace is written out in full - district, city, region, country - which
// is more than a line in a list can carry. The ends are what identify it.
function placeFor(p){
  const parts = (p.placeLabel || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return `${parts[0]}, ${parts.at(-1)}`;
  return parts[0] || `${(+p.lat).toFixed(2)}, ${(+p.lon).toFixed(2)}`;
}

function subtitleFor(p){ return `${fmtBirthPretty(p.birthDate, p.birthTime)} · ${placeFor(p)}`; }

const fieldLabels = {
  name: "Name", birthDate: "Date", birthTime: "Time", placeLabel: "Place",
  lat: "Latitude", lon: "Longitude", tzName: "Time zone", tzOffset: "UTC offset"
};

// A zone stated as a bare number: what AAF gives when a file names no zone.
function fmtOffset(hours){
  const total = Math.round(Math.abs(+hours || 0) * 60);
  const sign = (+hours || 0) < 0 ? "-" : "+";
  return `UTC${sign}${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function fieldText(key, value){
  const n = +value;
  switch (key){
    case "birthDate": return fmtBirthPretty(value, "");
    case "lat": return Number.isFinite(n) ? `${Math.abs(n).toFixed(4)}°${n < 0 ? "S" : "N"}` : "—";
    case "lon": return Number.isFinite(n) ? `${Math.abs(n).toFixed(4)}°${n < 0 ? "W" : "E"}` : "—";
    case "tzOffset": return fmtOffset(value);
    default: return String(value ?? "").trim() || "—";
  }
}

const badges = { new: "New", overwrite: "Overwrites", same: "Already here" };

// An overwrite is the one thing here that destroys something, so it has to be
// readable before it happens: every field that would change, old value beside
// new. The rest of the record is untouched and is left off the row.
function renderDiff(changes){
  const box = document.createElement("div");
  box.className = "transferDiff";
  for (const { key, from, to } of changes){
    const row = document.createElement("div");
    row.className = "transferDiffRow";
    const label = document.createElement("span");
    label.className = "transferDiffField";
    label.textContent = fieldLabels[key] || key;
    const before = document.createElement("span");
    before.className = "transferDiffFrom";
    before.textContent = fieldText(key, from);
    const arrow = document.createElement("span");
    arrow.className = "transferDiffArrow";
    arrow.textContent = "→";
    arrow.setAttribute("aria-label", "becomes");
    const after = document.createElement("span");
    after.className = "transferDiffTo";
    after.textContent = fieldText(key, to);
    row.append(label, before, arrow, after);
    box.appendChild(row);
  }
  return box;
}

function renderList(){
  const list = el.transferList;
  list.innerHTML = "";
  // An ordinary import brings in charts nobody here has, and marking every one
  // of them New marks nothing out. The badges say which row is which, so they
  // are worth the ink only where the rows differ.
  const mixed = view.charts.some((p) => view.plan.get(p.id)?.status !== "new");
  for (const p of view.charts){
    const row = document.createElement("label");
    row.className = "transferItem";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = view.chosen.has(p.id);
    box.addEventListener("change", () => {
      if (box.checked) view.chosen.add(p.id); else view.chosen.delete(p.id);
      renderActions();
    });
    const text = document.createElement("div");
    text.className = "transferItemText";
    const name = document.createElement("div");
    name.className = "transferItemName";
    name.textContent = p.name;
    const entry = view.plan.get(p.id);
    if (entry && mixed){
      const badge = document.createElement("span");
      badge.className = `transferBadge is-${entry.status}`;
      badge.textContent = badges[entry.status];
      name.append(" ", badge);
    }
    const sub = document.createElement("div");
    sub.className = "transferItemSub";
    sub.textContent = subtitleFor(p);
    text.append(name, sub);
    if (entry?.status === "overwrite"){
      row.classList.add("hasDiff");
      text.appendChild(renderDiff(entry.changes));
    }
    row.append(box, text);
    list.appendChild(row);
  }
  renderActions();
}

const titles = { export: "Export charts", import: "Import charts", receive: "Charts to import" };

const copyLabel = "Copy data";
let copyTimer = 0;

function resetCopyLabel(){
  clearTimeout(copyTimer);
  copyTimer = 0;
  el.transferCopyBtn.textContent = copyLabel;
}

// Whether there is anything of one's own to send. The seeded sample is the
// app's, not the reader's, so on a first visit this dialog is import only.
function exportable(){
  return chartsState.list.filter((chart) => !isDefaultChart(chart));
}

// What was found, and what it would do. The counts come from the same plan the
// rows are marked from, so the summary and the list can't disagree.
function receiveHint(){
  const found = view.charts.length;
  const counts = { new: 0, overwrite: 0, same: 0 };
  for (const p of view.charts) counts[view.plan.get(p.id)?.status || "new"]++;
  const label = `${found} chart${found === 1 ? "" : "s"} found`;
  // Nothing here to touch: how many there are is the whole of the news.
  if (counts.new === found) return `${label}.`;
  const parts = [];
  if (counts.new) parts.push(`${counts.new} new`);
  if (counts.overwrite) parts.push(`${counts.overwrite} overwriting a chart already here`);
  if (counts.same) parts.push(`${counts.same} unchanged`);
  const tail = counts.overwrite
    ? " A chart is matched by name; an overwrite lists what it would change."
    : "";
  return `${label}: ${parts.join(", ")}.${tail}`;
}

function renderActions(){
  const n = view.chosen.size;
  const mode = view.mode;
  const plural = n === 1 ? "" : "s";
  const listed = mode !== "import";
  el.transferTitle.textContent = titles[mode];
  el.transferHint.textContent = mode === "export"
    ? "Choose the charts to save as an AAF file, or to copy and paste somewhere else."
    : mode === "import"
      ? "Paste AAF data, or open an .aaf file - from here or from another astrology app."
      : receiveHint();

  el.transferConfirmBtn.textContent = mode === "export"
    ? `Download ${n} chart${plural}`
    : mode === "import" ? "Continue" : `Import ${n} chart${plural}`;
  el.transferConfirmBtn.disabled = mode === "import" ? !el.transferPaste.value.trim() : n === 0;
  el.transferCopyBtn.disabled = n === 0;
  el.transferAllBtn.textContent = n === view.charts.length ? "Select none" : "Select all";
  el.transferModeBtn.textContent = mode === "export" ? "Import charts instead" : "Export charts instead";

  el.transferListHead.hidden = !listed;
  el.transferList.hidden = !listed;
  el.transferPaste.hidden = listed;
  el.transferCopyBtn.hidden = mode !== "export";
  el.transferFileBtn.hidden = mode !== "import";
  // Nothing to go back to on a first visit, and no second mode to offer while
  // reading what an import turned up.
  el.transferModeBtn.hidden = mode === "receive" || (mode === "import" && exportable().length === 0);
}

function show(mode, charts, plan){
  view.mode = mode;
  view.charts = charts;
  view.plan = new Map((plan || []).map((entry) => [entry.chart.id, entry]));
  // Everything is ticked to begin with except the charts that would change
  // nothing: importing those is work with no result, so they start off.
  view.chosen = new Set(charts.filter((p) => view.plan.get(p.id)?.status !== "same").map((p) => p.id));
  resetCopyLabel();
  renderList();
  if (!el.transferDialog.open) el.transferDialog.showModal();
}

function showImport(){
  view.mode = "import";
  view.charts = [];
  view.chosen = new Set();
  view.plan = new Map();
  el.transferPaste.value = "";
  el.transferFile.value = "";
  resetCopyLabel();
  renderActions();
  if (!el.transferDialog.open) el.transferDialog.showModal();
  el.transferPaste.focus();
}

function showExport(){
  show("export", exportable());
}

export function openTransferDialog(){
  if (exportable().length === 0) showImport();
  else showExport();
}

function readData(text){
  try {
    const charts = parseCharts(text);
    show("receive", charts, planImport(chartsState.list, charts));
  }
  catch (err){ el.transferHint.textContent = err?.message || "That data couldn't be read."; }
}

function selectedPayload(){
  return buildPayload(view.charts.filter((p) => view.chosen.has(p.id)));
}

function downloadData(){
  const url = URL.createObjectURL(new Blob([selectedPayload()], { type: transferMimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = transferFileName;
  link.click();
  URL.revokeObjectURL(url);
}

// The clipboard is silent, so the button says what happened and then goes back
// to being a button.
async function copyData(){
  const button = el.transferCopyBtn;
  clearTimeout(copyTimer);
  try {
    await navigator.clipboard.writeText(selectedPayload());
    button.textContent = "Copied!";
  } catch { button.textContent = "Couldn't copy"; }
  copyTimer = setTimeout(resetCopyLabel, 1800);
}

function doReceive(onChanged){
  const chosen = view.charts.filter((p) => view.chosen.has(p.id));
  const { list, added, overwritten, unchanged } = mergeCharts(chartsState.list, chosen);
  chartsState.list = list;
  saveCharts(list);
  el.transferDialog.close();
  const parts = [`Imported ${added.length} chart${added.length === 1 ? "" : "s"}`];
  if (overwritten.length) parts.push(`${overwritten.length} overwritten`);
  if (unchanged.length) parts.push(`${unchanged.length} unchanged`);
  setStatus(`${parts.join(", ")}.`);
  // Whatever the import actually did, land on it: a chart brought up to date is
  // as much the point of the import as one that is new.
  onChanged(added[0]?.id || overwritten[0]?.after.id || "");
}

export function wireTransferUI(onChanged){
  if (!el.transferDialog || !el.transferBtn) return;
  el.transferBtn.addEventListener("click", openTransferDialog);
  // A dialog fills its own box exactly, so a click that lands on the element
  // itself landed on the dimmed page behind it.
  el.transferDialog.addEventListener("click", (event) => {
    if (event.target === el.transferDialog) el.transferDialog.close();
  });
  el.transferCloseBtn.addEventListener("click", () => el.transferDialog.close());
  el.transferAllBtn.addEventListener("click", () => {
    if (view.chosen.size === view.charts.length) view.chosen.clear();
    else view.chosen = new Set(view.charts.map((p) => p.id));
    renderList();
  });
  el.transferModeBtn.addEventListener("click", () => {
    if (view.mode === "export") showImport();
    else showExport();
  });
  el.transferPaste.addEventListener("input", renderActions);
  el.transferFileBtn.addEventListener("click", () => el.transferFile.click());
  el.transferFile.addEventListener("change", async () => {
    const file = el.transferFile.files?.[0];
    if (file) readData(await file.text());
  });
  el.transferCopyBtn.addEventListener("click", copyData);
  el.transferConfirmBtn.addEventListener("click", () => {
    if (view.mode === "export") downloadData();
    else if (view.mode === "import") readData(el.transferPaste.value);
    else doReceive(onChanged);
  });
}
