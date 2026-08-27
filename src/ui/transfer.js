// Import/export of charts as a JSON file. One dialog serves both directions,
// because both are the same question: which of these charts?
import { chartsState, saveCharts } from "../storage/charts.js";
import { buildExport, exportFilename, mergeCharts, parseImport } from "../storage/transfer.js";
import { el, setStatus } from "./dom.js";

// Either the stored charts (export) or the ones just read off a file (import).
const view = { mode: "export", charts: [], chosen: new Set() };

function subtitleFor(p){
  const place = p.placeLabel || `${(+p.lat).toFixed(2)}, ${(+p.lon).toFixed(2)}`;
  return `${p.birthDate} ${p.birthTime} · ${place}`;
}

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

function renderActions(){
  const n = view.chosen.size;
  const isExport = view.mode === "export";
  el.transferTitle.textContent = isExport ? "Export charts" : "Import charts";
  el.transferHint.textContent = isExport
    ? "Downloads a JSON file you can open on another device."
    : `${view.charts.length} chart${view.charts.length === 1 ? "" : "s"} in that file. Charts you already have are skipped.`;
  el.transferConfirmBtn.textContent = isExport
    ? (n === 1 ? "Export 1 chart" : `Export ${n} charts`)
    : (n === 1 ? "Import 1 chart" : `Import ${n} charts`);
  el.transferConfirmBtn.disabled = n === 0;
  el.transferAllBtn.textContent = (n === view.charts.length) ? "Select none" : "Select all";
  el.transferFileBtn.hidden = !isExport;
  el.transferFileDot.hidden = !isExport;
}

function show(mode, charts){
  view.mode = mode;
  view.charts = charts;
  view.chosen = new Set(charts.map((p) => p.id));
  renderList();
  if (!el.transferDialog.open) el.transferDialog.showModal();
}

export function openTransferDialog(){
  show("export", chartsState.list.slice());
}

function download(text, filename){
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on a turn of its own: Safari drops the download if the URL dies
  // before it has started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function doExport(){
  const chosen = view.charts.filter((p) => view.chosen.has(p.id));
  download(JSON.stringify(buildExport(chosen), null, 2), exportFilename());
  el.transferDialog.close();
  setStatus(`Exported ${chosen.length} chart${chosen.length === 1 ? "" : "s"}.`);
}

function doImport(onChanged){
  const chosen = view.charts.filter((p) => view.chosen.has(p.id));
  const { list, added, duplicates } = mergeCharts(chartsState.list, chosen);
  chartsState.list = list;
  saveCharts(list);
  el.transferDialog.close();
  const skipped = duplicates.length ? `, ${duplicates.length} already here` : "";
  setStatus(`Imported ${added.length} chart${added.length === 1 ? "" : "s"}${skipped}.`);
  onChanged(added[0]?.id || "");
}

async function readFile(file){
  const text = await file.text();
  return parseImport(text);
}

export function wireTransferUI(onChanged){
  if (!el.transferDialog || !el.transferBtn) return;

  el.transferBtn.addEventListener("click", openTransferDialog);
  el.transferCancelBtn.addEventListener("click", () => el.transferDialog.close());

  el.transferAllBtn.addEventListener("click", () => {
    if (view.chosen.size === view.charts.length) view.chosen.clear();
    else view.chosen = new Set(view.charts.map((p) => p.id));
    renderList();
  });

  el.transferFileBtn.addEventListener("click", () => {
    el.transferFileInput.value = "";
    el.transferFileInput.click();
  });

  el.transferFileInput.addEventListener("change", async () => {
    const file = el.transferFileInput.files?.[0];
    if (!file) return;
    try {
      show("import", await readFile(file));
    } catch (err){
      el.transferHint.textContent = err?.message || "That file couldn't be read.";
    }
  });

  el.transferConfirmBtn.addEventListener("click", () => {
    if (view.mode === "export") doExport();
    else doImport(onChanged);
  });
}
