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
  // The body chooser's selection. Three lists rather than two: world mode asks
  // about one set of bodies in the sky, and losing a personal selection because
  // the sky was glanced at would be its own small annoyance.
  /** @type {{transit:string[], natal:string[], sky:string[], involving:string[]}} */
  bodies: { transit: [], natal: [], sky: [], involving: [] },
  // Which question is being asked, and so which lists the chooser shows.
  // See buildCandidateRules.
  /** @type {"directed"|"involving"} */
  bodyMode: "directed",
  // The row picked off the aspect axis, if any: {transit, aspect, natal}. It is
  // highlighted in the chart and is what the previous/next search steps through.
  /** @type {{transit:string, aspect:string, natal:string, orb?:number}|null} */
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
