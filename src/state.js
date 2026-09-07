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
  /** @type {{transit:string[], natal:string[], sky:string[]}} */
  bodies: { transit: [], natal: [], sky: [] },
  // "directed" reads left to right; "either" also counts each pair the other
  // way round. See buildCandidateRules.
  /** @type {"directed"|"either"} */
  bodyLink: "directed",
  // The row picked off the aspect axis, if any: {transit, aspect, natal}. It is
  // highlighted in the chart and is what the previous/next search steps through.
  /** @type {{transit:string, aspect:string, natal:string, orb?:number}|null} */
  focusRule: null,
  focusStatus: "",
  focusSearching: false,
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
