// Charts move between devices as a link. One dialog serves both ends, because
// both ask the same question: which of these charts? Sending is a link you
// copy; receiving is that link being opened.
import { chartsState, saveCharts } from "../storage/charts.js";
import { buildShareURL, decodeCharts, mergeCharts, readShareHash, readShareText } from "../storage/transfer.js";
import { el, setStatus } from "./dom.js";

// Three modes, one dialog: the charts here (send), a link typed in by hand
// (paste), and the charts a link turned out to hold (receive). Pasting exists
// because an installed web app on iOS cannot be the thing a link opens.
const view = { mode: "send", charts: [], chosen: new Set() };

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

const titles = {
  send: "Send charts to another device",
  paste: "Add charts from a link",
  receive: "Charts from a link"
};

function renderActions(){
  const n = view.chosen.size;
  const mode = view.mode;
  const plural = n === 1 ? "" : "s";
  el.transferTitle.textContent = titles[mode];
  el.transferHint.textContent = mode === "send"
    ? "The link carries the charts themselves. Nothing is uploaded: everything after the # stays in the browser."
    : mode === "paste"
      ? "Paste a link you sent yourself. Opening it works too, unless this is an app on the home screen."
      : `${view.charts.length} chart${view.charts.length === 1 ? "" : "s"} in that link. Charts you already have are skipped.`;
  el.transferConfirmBtn.textContent = mode === "send"
    ? `Copy link to ${n} chart${plural}`
    : mode === "paste" ? "Read the link" : `Add ${n} chart${plural}`;
  el.transferConfirmBtn.disabled = (mode === "paste") ? !el.transferPaste.value.trim() : n === 0;
  el.transferAllBtn.textContent = (n === view.charts.length) ? "Select none" : "Select all";
  el.transferAllBtn.hidden = mode === "paste";
  el.transferPasteBtn.hidden = mode !== "send";
  el.transferPasteDot.hidden = mode !== "send";
  el.transferList.hidden = mode === "paste";
  el.transferPaste.hidden = mode !== "paste";
  el.transferLink.hidden = true;
}

function show(mode, charts){
  view.mode = mode;
  view.charts = charts;
  view.chosen = new Set(charts.map((p) => p.id));
  renderList();
  if (!el.transferDialog.open) el.transferDialog.showModal();
}

export function openTransferDialog(){
  show("send", chartsState.list.slice());
}

function showPaste(){
  view.mode = "paste";
  el.transferPaste.value = "";
  renderActions();
  el.transferPaste.focus();
}

async function doPaste(){
  const encoded = readShareText(el.transferPaste.value);
  if (!encoded){
    el.transferHint.textContent = "That doesn't look like a charts link.";
    return;
  }
  try {
    show("receive", await decodeCharts(encoded));
  } catch (err){
    el.transferHint.textContent = err?.message || "That link couldn't be read.";
  }
}

// Where a shared link should land: this page, without whatever fragment
// brought us here.
function shareBase(){
  return location.origin + location.pathname + location.search;
}

async function doSend(){
  const chosen = view.charts.filter((p) => view.chosen.has(p.id));
  const url = await buildShareURL(chosen, shareBase());
  // Shown either way: clipboard permission is not a thing to depend on, and a
  // link you can select is a link you can send.
  el.transferLink.value = url;
  el.transferLink.hidden = false;
  try {
    await navigator.clipboard.writeText(url);
    el.transferHint.textContent = "Link copied. Open it on the other device.";
  } catch {
    el.transferHint.textContent = "Copy this link and open it on the other device.";
  }
}

function doReceive(onChanged){
  const chosen = view.charts.filter((p) => view.chosen.has(p.id));
  const { list, added, duplicates } = mergeCharts(chartsState.list, chosen);
  chartsState.list = list;
  saveCharts(list);
  el.transferDialog.close();
  const skipped = duplicates.length ? `, ${duplicates.length} already here` : "";
  setStatus(`Added ${added.length} chart${added.length === 1 ? "" : "s"}${skipped}.`);
  onChanged(added[0]?.id || "");
}

// A link that has been opened has been spent: dropping the fragment keeps a
// refresh from asking the same question again.
function clearShareHash(){
  history.replaceState(null, "", shareBase());
}

export async function checkShareLink(){
  const encoded = readShareHash(location.hash);
  if (!encoded) return;
  clearShareHash();
  try {
    show("receive", await decodeCharts(encoded));
  } catch (err){
    setStatus(err?.message || "That link couldn't be read.", true);
  }
}

export function wireTransferUI(onChanged){
  if (!el.transferDialog || !el.transferBtn) return;

  el.transferBtn.addEventListener("click", openTransferDialog);
  // A link opened while the app is already up changes the fragment and nothing
  // else - no reload, so the boot-time check never sees it.
  window.addEventListener("hashchange", checkShareLink);
  el.transferCancelBtn.addEventListener("click", () => el.transferDialog.close());

  el.transferAllBtn.addEventListener("click", () => {
    if (view.chosen.size === view.charts.length) view.chosen.clear();
    else view.chosen = new Set(view.charts.map((p) => p.id));
    renderList();
  });

  el.transferPasteBtn.addEventListener("click", showPaste);
  el.transferPaste.addEventListener("input", renderActions);

  el.transferConfirmBtn.addEventListener("click", () => {
    if (view.mode === "send") doSend();
    else if (view.mode === "paste") doPaste();
    else doReceive(onChanged);
  });
}
