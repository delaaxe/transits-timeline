// The body chooser: a chip per body, on each end of a transit.
//
// It replaced two dropdowns and five checkboxes, which were the same idea said
// twice. The dropdowns could only offer named groups, so an ordinary question -
// "only Mars and Venus, whichever of the two is transiting" - was not
// expressible at all; the checkboxes existed because Chiron, the Node and the
// two angles are bodies that no group happened to name, and being a checkbox
// meant they were bolted onto whichever group was chosen rather than chosen.
// Now every body is a chip, the groups are presets that fill the chips, and the
// selection is a set that can be anything.

import { requestUpdate } from "../refresh.js";
import { state } from "../state.js";
import { bodyPresets, isAngle, natalKeys, normalizeBodies, planetLabel, planetSymbols, sameBodies, transitingKeys } from "../data/bodies.js";
import { el } from "./dom.js";

/** @type {(() => void)|null} */
let changedHandler = null;

/** Told when the reader edits the selection, rather than when a preset fills it. */
export function onBodiesChanged(fn){ changedHandler = fn; }

/**
 * The panes on screen and the list each one edits. World mode has one: both
 * ends of a sky aspect move, so there is no transiting side to tell from a
 * natal one.
 */
export function activePanes(){
  if (state.appMode === "world"){
    return [{
      field: "sky", title: "Bodies in the sky", keys: transitingKeys,
      chips: el.transitBodyChips, presets: el.transitBodyPresets, mirror: false
    }];
  }
  return [
    { field: "transit", title: "Transiting", keys: transitingKeys,
      chips: el.transitBodyChips, presets: el.transitBodyPresets, mirror: false },
    { field: "natal", title: "Natal points", keys: natalKeys,
      chips: el.natalBodyChips, presets: el.natalBodyPresets, mirror: true }
  ];
}

/** @param {"transit"|"natal"|"sky"} field */
export function getBodies(field){ return normalizeBodies(state.bodies[field]); }

/** The bodies a scan will actually use, whichever mode is showing. */
export function selectedBodies(){
  if (state.appMode === "world") return { sky: getBodies("sky") };
  return { transit: getBodies("transit"), natal: getBodies("natal") };
}

/**
 * Fills the selection from a preset. Not an edit, so the preset stays lit.
 * @param {{transit:string[], natal:string[], sky:string[],
 *          link?:"directed"|"either"}} sets
 */
export function applyBodySets({ transit, natal, sky, link }){
  state.bodies.transit = normalizeBodies(transit);
  state.bodies.natal = normalizeBodies(natal);
  state.bodies.sky = normalizeBodies(sky);
  state.bodyLink = (link === "either") ? "either" : "directed";
  renderBodyPicker();
}

function edited(){
  // The view presets name a whole query, so the moment one of their bodies is
  // changed the chart is no longer that view. Saying so - by lighting no chip -
  // beats leaving "Week" lit over something that is not the week's selection.
  state.activePresetKey = null;
  renderBodyPicker();
  changedHandler?.();
  requestUpdate();
}

/**
 * An edit to the selection: any of the three lists and the link at once, so a
 * change that touches both ends costs one recompute rather than two.
 *
 * @param {{transit?:string[], natal?:string[], sky?:string[],
 *          link?:"directed"|"either"}} selection
 */
export function setSelection(selection){
  const { transit, natal, sky, link } = selection;
  if (transit !== undefined) state.bodies.transit = normalizeBodies(transit);
  if (natal !== undefined) state.bodies.natal = normalizeBodies(natal);
  if (sky !== undefined) state.bodies.sky = normalizeBodies(sky);
  if (link !== undefined) state.bodyLink = (link === "either") ? "either" : "directed";
  edited();
}

/** @param {"transit"|"natal"|"sky"} field @param {string[]} list */
export function setBodies(field, list){
  setSelection({ [field]: list });
}

/** @param {"transit"|"natal"|"sky"} field @param {string} key */
export function toggleBody(field, key){
  const cur = new Set(getBodies(field));
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  setBodies(field, [...cur]);
}

/** @param {"directed"|"either"} link */
export function setBodyLink(link){
  setSelection({ link });
}

// A chip is its glyph. The names were spelled out at first, and two panes of
// fourteen named chips is most of a phone screen spent on an alphabet the
// reader already has - this app writes the same glyphs on every row label, in
// the chart summary, and in the line under these chips. The name is still on
// the chip, as its title and as what a screen reader says; it is only not drawn.
function chipGlyph(key){
  return planetSymbols[key] || planetLabel(key);
}

function renderBodyChips(pane){
  const wrap = pane.chips;
  if (!wrap) return;
  const selected = new Set(getBodies(pane.field));
  wrap.innerHTML = "";
  wrap.dataset.bodyField = pane.field;
  for (const key of pane.keys){
    const on = selected.has(key);
    const btn = document.createElement("button");
    btn.type = "button";
    // The two angles are written rather than drawn - "Mc" and "Ac" are their
    // glyph forms - so they take the label font at a size that sits level with
    // the symbols instead of towering over them.
    btn.className = "bodyChip" + (on ? " on" : "") + (isAngle(key) ? " lettered" : "");
    btn.dataset.bodyKey = key;
    btn.textContent = chipGlyph(key);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", planetLabel(key));
    // The name a chip no longer draws. A pointer gets it on hover; a screen
    // reader has it from aria-label either way.
    btn.title = planetLabel(key);
    wrap.appendChild(btn);
  }
}

/** A preset filtered to what this end can hold, or null where nothing is left. */
function presetBodiesFor(pane, keys){
  const allowed = new Set(pane.keys);
  const list = normalizeBodies(keys.filter(k => allowed.has(k)));
  return list.length ? list : null;
}

function renderPresetChips(pane){
  const wrap = pane.presets;
  if (!wrap) return;
  const current = getBodies(pane.field);
  wrap.innerHTML = "";
  wrap.dataset.bodyField = pane.field;

  for (const [key, label, keys] of bodyPresets){
    const list = presetBodiesFor(pane, keys);
    if (!list) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    const on = sameBodies(current, list);
    btn.className = "bodyPresetBtn" + (on ? " on" : "");
    btn.dataset.bodyPreset = key;
    btn.textContent = label;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    wrap.appendChild(btn);
  }

  if (pane.mirror){
    const mirror = document.createElement("button");
    mirror.type = "button";
    mirror.className = "bodyPresetBtn ghost";
    mirror.dataset.bodyPreset = "__mirror__";
    mirror.textContent = "Same as transiting";
    wrap.appendChild(mirror);
  }

  const none = document.createElement("button");
  none.type = "button";
  none.className = "bodyPresetBtn ghost";
  none.dataset.bodyPreset = "__none__";
  none.textContent = "None";
  wrap.appendChild(none);
}

function glyphList(keys){
  return keys.map(k => planetSymbols[k] || planetLabel(k)).join(" ");
}

/**
 * What the chips add up to, in one line, for the reader who has just tapped
 * eleven of them and wants to know what they asked for.
 */
export function bodySummaryText(){
  if (state.appMode === "world"){
    const sky = getBodies("sky");
    if (sky.length < 2) return "Pick at least two bodies: a sky aspect needs both ends.";
    return `${glyphList(sky)} · every pair between them`;
  }
  const transit = getBodies("transit").filter(k => !isAngle(k));
  const natal = getBodies("natal");
  if (!transit.length) return "Pick at least one transiting body.";
  if (!natal.length) return "Pick at least one natal point.";
  const arrow = state.bodyLink === "either" ? "↔" : "→";
  const note = state.bodyLink === "either" ? " · either side" : "";
  return `${glyphList(transit)} ${arrow} ${glyphList(natal)}${note}`;
}

function renderLinkChips(){
  const wrap = el.bodyLinkWrap;
  if (!wrap) return;
  wrap.hidden = state.appMode === "world";
  for (const btn of wrap.querySelectorAll("button[data-body-link]")){
    const on = btn.dataset.bodyLink === state.bodyLink;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

export function renderBodyPicker(){
  const isWorld = state.appMode === "world";
  if (el.natalPane) el.natalPane.hidden = isWorld;
  if (el.transitPaneTitle) el.transitPaneTitle.textContent = isWorld ? "Bodies in the sky" : "Transiting";
  for (const pane of activePanes()){
    renderPresetChips(pane);
    renderBodyChips(pane);
  }
  renderLinkChips();
  if (el.bodySummary){
    el.bodySummary.textContent = bodySummaryText();
    el.bodySummary.classList.toggle("warn", /^Pick /.test(bodySummaryText()));
  }
}

export function wireBodyPicker(){
  const picker = el.bodyPicker;
  if (!picker) return;
  picker.addEventListener("click", (e) => {
    const target = /** @type {any} */ (e.target);

    const chip = /** @type {any} */ (target.closest("button[data-body-key]"));
    if (chip){
      const field = chip.parentElement?.dataset.bodyField;
      if (field) toggleBody(field, chip.dataset.bodyKey);
      return;
    }

    const presetBtn = /** @type {any} */ (target.closest("button[data-body-preset]"));
    if (presetBtn){
      const field = presetBtn.parentElement?.dataset.bodyField;
      if (!field) return;
      const key = presetBtn.dataset.bodyPreset;
      if (key === "__none__"){
        setBodies(field, []);
        return;
      }
      if (key === "__mirror__"){
        setBodies(field, getBodies("transit"));
        return;
      }
      const preset = bodyPresets.find(p => p[0] === key);
      if (!preset) return;
      const pane = activePanes().find(p => p.field === field);
      if (!pane) return;
      setBodies(field, presetBodiesFor(pane, preset[2]) ?? []);
      return;
    }

    const linkBtn = /** @type {any} */ (target.closest("button[data-body-link]"));
    if (linkBtn) setBodyLink(linkBtn.dataset.bodyLink);
  });
}
