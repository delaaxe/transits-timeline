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
import { setShowWorldRows, state } from "../state.js";
import { bodyPresets, isAngle, natalKeys, normalizeBodies, planetLabel, planetSymbols, sameBodies, transitingKeys } from "../data/bodies.js";
import { el } from "./dom.js";

/** @type {(() => void)|null} */
let changedHandler = null;

/** Told when the reader edits the selection, rather than when a preset fills it. */
export function onBodiesChanged(fn){ changedHandler = fn; }

/**
 * The panes on screen and the list each one edits. World mode has one: both
 * ends of a world transit move, so there is no transiting side to tell from a
 * natal one. Its heading is the bare word, since the mode is already named at
 * the top of the page and this is the only list it has.
 *
 * A personal chart can have a third. It edits the same list world mode does,
 * from its own pane under the pair rather than in place of them - world
 * transits folded into a chart are another question being asked alongside the
 * first, not one of the two ends of it.
 */
export function activePanes(){
  if (state.appMode === "world"){
    return [{
      field: "world", title: "Bodies", keys: transitingKeys,
      chips: el.transitBodyChips, presets: el.transitBodyPresets
    }];
  }
  // One list, and every point on it: an angle can be involved in a transit -
  // "everything crossing my Ascendant" - it just cannot be the end that moves.
  const personal = (state.bodyMode === "involving")
    ? [{
        field: "involving", title: "Involving", keys: natalKeys,
        chips: el.transitBodyChips, presets: el.transitBodyPresets
      }]
    : [
        { field: "transit", title: "Transiting", keys: transitingKeys,
          chips: el.transitBodyChips, presets: el.transitBodyPresets },
        { field: "natal", title: "Natal points", keys: natalKeys,
          chips: el.natalBodyChips, presets: el.natalBodyPresets }
      ];
  if (!state.showWorldRows) return personal;
  return [...personal, {
    field: "world", title: "Also: world transits", keys: transitingKeys,
    chips: el.worldBodyChips, presets: el.worldBodyPresets
  }];
}

/** @param {"transit"|"natal"|"world"|"involving"} field */
export function getBodies(field){ return normalizeBodies(state.bodies[field]); }

/**
 * The bodies a scan will actually use, whichever mode is showing. A personal
 * chart hands back the world list too when it is carrying world transits;
 * app.js decides what a list too thin to make an aspect means.
 */
export function selectedBodies(){
  if (state.appMode === "world") return { world: getBodies("world") };
  const world = state.showWorldRows ? getBodies("world") : [];
  if (state.bodyMode === "involving") return { involving: getBodies("involving"), world };
  return { transit: getBodies("transit"), natal: getBodies("natal"), world };
}

/**
 * Fills the selection from a preset. Not an edit, so the preset stays lit.
 *
 * The involving list is left alone. A preset is a view - a range, an orb, a set
 * of bodies to watch - and "everything involving Mars" is a question the reader
 * poses rather than a view they picked, so nothing overwrites it behind them.
 *
 * @param {{transit:string[], natal:string[], world:string[]}} sets
 */
export function applyBodySets({ transit, natal, world }){
  state.bodies.transit = normalizeBodies(transit);
  state.bodies.natal = normalizeBodies(natal);
  state.bodies.world = normalizeBodies(world);
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
 * An edit to the selection: any of the lists at once, so a change that touches
 * both ends costs one recompute rather than two.
 *
 * @param {{transit?:string[], natal?:string[], world?:string[],
 *          involving?:string[], mode?:"directed"|"involving"}} selection
 */
export function setSelection(selection){
  const { transit, natal, world, involving, mode } = selection;
  if (transit !== undefined) state.bodies.transit = normalizeBodies(transit);
  if (natal !== undefined) state.bodies.natal = normalizeBodies(natal);
  if (world !== undefined) state.bodies.world = normalizeBodies(world);
  if (involving !== undefined) state.bodies.involving = normalizeBodies(involving);
  if (mode !== undefined) state.bodyMode = (mode === "involving") ? "involving" : "directed";
  edited();
}

/** @param {"transit"|"natal"|"world"|"involving"} field @param {string[]} list */
export function setBodies(field, list){
  setSelection({ [field]: list });
}

/** @param {"transit"|"natal"|"world"|"involving"} field @param {string} key */
export function toggleBody(field, key){
  const cur = new Set(getBodies(field));
  if (cur.has(key)) cur.delete(key);
  else cur.add(key);
  setBodies(field, [...cur]);
}

/** @param {"directed"|"involving"} mode */
export function setBodyMode(mode){
  // Coming in cold, the question starts from whatever was being watched: an
  // empty list would draw an empty chart and leave the reader to guess that it
  // wants a body before it will say anything.
  const seed = (mode === "involving" && getBodies("involving").length === 0)
    ? getBodies("transit")
    : undefined;
  setSelection({ mode, involving: seed });
}

// A chip is its glyph. The names were spelled out at first, and two panes of
// fourteen named chips is most of a phone screen spent on an alphabet the
// reader already has - the same glyphs are on every row label and in the chart
// summary. The name is still on the chip, as its title and as what a screen
// reader says; it is only not drawn.
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

  const none = document.createElement("button");
  none.type = "button";
  none.className = "bodyPresetBtn ghost";
  none.dataset.bodyPreset = "__none__";
  none.textContent = "None";
  wrap.appendChild(none);
}

function renderModeChips(){
  const wrap = el.bodyModeWrap;
  if (!wrap) return;
  // A world transit has no direction to choose and no chart to be involved
  // with.
  wrap.hidden = state.appMode === "world";
  for (const btn of wrap.querySelectorAll("button[data-body-mode]")){
    const on = btn.dataset.bodyMode === state.bodyMode;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

export function renderBodyPicker(){
  const panes = activePanes();
  const showing = new Set(panes.map(p => p.field));
  // Whether the pair is on screen, rather than how many panes there are: the
  // world pane below them is a third pane and not a second column, so counting
  // would have "involving plus world transits" laying itself out as a pair.
  const hasNatalPane = showing.has("natal");
  if (el.natalPane) el.natalPane.hidden = !hasNatalPane;
  if (el.bodyPicker) el.bodyPicker.classList.toggle("oneList", !hasNatalPane);
  // The pane exists whenever a chart does, so there is always something to
  // switch world transits back on with. World mode is nothing else, and has
  // nothing to fold into itself.
  const personal = state.appMode === "personal";
  if (el.worldPane) el.worldPane.hidden = !personal;
  if (el.worldPaneBody) el.worldPaneBody.hidden = !state.showWorldRows;
  if (el.showWorldRows) el.showWorldRows.checked = !!state.showWorldRows;
  if (el.transitPaneTitle) el.transitPaneTitle.textContent = panes[0].title;
  for (const pane of panes){
    renderPresetChips(pane);
    renderBodyChips(pane);
  }
  renderModeChips();
}

export function wireBodyPicker(){
  if (el.showWorldRows){
    el.showWorldRows.addEventListener("change", () => {
      setShowWorldRows(el.showWorldRows.checked);
      // Not an edit to the selection: the preset still describes the chart, it
      // just describes less of it. So the lit chip stays lit, and this does not
      // go through edited().
      renderBodyPicker();
      // A followed row that went with them is dropped by the recompute, which
      // already clears a focus the chart no longer has a line for.
      requestUpdate();
    });
  }

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
      const preset = bodyPresets.find(p => p[0] === key);
      if (!preset) return;
      const pane = activePanes().find(p => p.field === field);
      if (!pane) return;
      setBodies(field, presetBodiesFor(pane, preset[2]) ?? []);
      return;
    }

    const modeBtn = /** @type {any} */ (target.closest("button[data-body-mode]"));
    if (modeBtn) setBodyMode(modeBtn.dataset.bodyMode);
  });
}
