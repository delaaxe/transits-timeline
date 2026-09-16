// Shared app state. One home for what used to be free-floating globals;
// each module still owns the state only it touches.
import { defaultPresetKey } from "./data/presets.js";

export const state = {
  // Null once the reader edits the query the preset filled: no chip is lit,
  // because none of them describes what is on screen any more.
  /** @type {string|null} */
  activePresetKey: defaultPresetKey,
  chartSummaryVisible: false,
  appMode: "personal",
  // Whether a personal chart also carries the world transits. On by default:
  // what the planets are doing to each other is the weather every chart is read
  // in, and a reader who has never found the World view has never been offered
  // it. World mode is unaffected - it is world transits and nothing else, so
  // there is nothing to fold in.
  showWorldRows: loadShowWorldRows(),
  // The body chooser's selection. Three lists rather than two: world transits
  // ask about one set of bodies, and losing a personal selection because the
  // World view was glanced at would be its own small annoyance.
  /** @type {{transit:string[], natal:string[], world:string[], involving:string[]}} */
  bodies: { transit: [], natal: [], world: [], involving: [] },
  // Which question is being asked, and so which lists the chooser shows.
  // See buildCandidateRules.
  /** @type {"directed"|"involving"} */
  bodyMode: "directed",
  // The row picked off the aspect axis, if any: {transit, aspect, natal}. It is
  // highlighted in the chart and is what the previous/next search steps through.
  // The scope comes with it because a chart can hold both a natal contact and a
  // world transit on the same three bodies, and they are different rows.
  /** @type {{transit:string, aspect:string, natal:string, orb?:number, scope:"personal"|"world"}|null} */
  focusRule: null,
  focusStatus: "",
  focusSearching: false,
  // The jumps the previous/next search has made, newest last, so a press in the
  // other direction can walk one back rather than stranding the reader in a
  // century the search cannot see home from. See returnRange in services/search.
  /** @type {import("./services/search.js").Jump[]} */
  focusTrail: [],
  // Last computation, so "Show more" can paginate without recomputing.
  cachedResults: null,
  currentMaxRows: 50,
  isComputing: false,
  cancelRequested: false,
  pendingUpdate: false,
  lastTimelineRefreshAt: 0,
  lastRefocusCheckAt: 0,
  labelsUseSymbols: false,
  currentLayout: null
};

export const showWorldRowsKey = "tt_show_world_rows";

// Remembered between visits, and defaulting to on. Guarded because this module
// is imported by tests in Node, where there is no localStorage, and because a
// browser with storage blocked should still get a working page rather than a
// blank one.
function loadShowWorldRows(){
  try {
    return localStorage.getItem(showWorldRowsKey) !== "0";
  } catch {
    return true;
  }
}

/** @param {boolean} on */
export function setShowWorldRows(on){
  state.showWorldRows = !!on;
  try {
    localStorage.setItem(showWorldRowsKey, on ? "1" : "0");
  } catch {
    // A reader with storage blocked keeps the setting for this visit only,
    // which is better than the toggle refusing to move.
  }
}
