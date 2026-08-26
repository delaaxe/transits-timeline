// Panels ask for a recompute without importing the orchestrator, which would
// make the dependency circular.

let handler = null;

export function onRequestUpdate(fn){ handler = fn; }

export function requestUpdate(){ if (handler) handler(); }
