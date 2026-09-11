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
  // What decides the order rows are drawn in. Which rows are drawn at all is a
  // separate question, always decided by significance - see rowsToDraw.
  //
  // Date is the default because this is a timeline: rows in date order make a
  // cascade the eye can follow, and scrambling them costs more than the ranking
  // gains. Significance is for the other question - what matters most in this
  // window, whenever it happens.
  /** @type {"date"|"significance"} */
  rowSort: "date",
  // Last computation, so "Show more" can paginate without recomputing.
  cachedResults: null,
  // Replaced with ROW_CAP on the first update; this is only what the app holds
  // before anything has been computed.
  currentMaxRows: 100,
  isComputing: false,
  cancelRequested: false,
  pendingUpdate: false,
  lastTimelineRefreshAt: 0,
  lastRefocusCheckAt: 0,
  labelsUseSymbols: false,
  currentLayout: null
};
