// Charts stay on the device. Exporting writes them as AAF - the exchange format
// Astro-Seek and the desktop programs read - to a file you can keep, or to the
// clipboard; importing reads AAF back from either. One dialog serves both ends,
// because both ask the same question: which of these charts?
import { chartsState, isDefaultChart, saveCharts } from "../storage/charts.js";
import { buildPayload, mergeCharts, parseCharts, transferFileName, transferMimeType } from "../storage/transfer.js";
import { el, setStatus } from "./dom.js";

// Three modes: the charts here (export), somewhere to paste or a file to open
// (import), and the charts that turned out to hold (receive).
const view = { mode: "export", charts: [], chosen: new Set() };

// A birthplace is written out in full - district, city, region, country - which
// is more than a line in a list can carry. The ends are what identify it.
function placeFor(p){
  const parts = (p.placeLabel || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return `${parts[0]}, ${parts.at(-1)}`;
  return parts[0] || `${(+p.lat).toFixed(2)}, ${(+p.lon).toFixed(2)}`;
}

function subtitleFor(p){ return `${p.birthDate} ${p.birthTime} · ${placeFor(p)}`; }

function renderList(){
  const list = el.transferList;
  list.innerHTML = "";
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
    const sub = document.createElement("div");
    sub.className = "transferItemSub";
    sub.textContent = subtitleFor(p);
    text.append(name, sub);
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
      : `${view.charts.length} chart${view.charts.length === 1 ? "" : "s"} found. Charts already here are skipped.`;

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

function show(mode, charts){
  view.mode = mode;
  view.charts = charts;
  view.chosen = new Set(charts.map((p) => p.id));
  resetCopyLabel();
  renderList();
  if (!el.transferDialog.open) el.transferDialog.showModal();
}

function showImport(){
  view.mode = "import";
  view.charts = [];
  view.chosen = new Set();
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
  try { show("receive", parseCharts(text)); }
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
  const { list, added, duplicates } = mergeCharts(chartsState.list, chosen);
  chartsState.list = list;
  saveCharts(list);
  el.transferDialog.close();
  const skipped = duplicates.length ? `, ${duplicates.length} already here` : "";
  setStatus(`Imported ${added.length} chart${added.length === 1 ? "" : "s"}${skipped}.`);
  onChanged(added[0]?.id || "");
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
