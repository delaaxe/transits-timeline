// Shared app state. One home for what used to be free-floating globals;
// each module still owns the state only it touches.
import { defaultPresetKey } from "./data/presets.js";

export const state = {
  activePresetKey: defaultPresetKey,
  chartSummaryVisible: false,
  appMode: "personal",
  // Last computation, so "Show more" can paginate without recomputing.
  cachedResults: null,
  currentMaxRows: 50,
  transitCache: null,
  cachedObserver: null,
  cachedNatalLon: null,
  isComputing: false,
  cancelRequested: false,
  pendingUpdate: false,
  lastTimelineRefreshAt: 0,
  lastRefocusCheckAt: 0,
  labelsUseSymbols: false,
  currentLayout: null
};
