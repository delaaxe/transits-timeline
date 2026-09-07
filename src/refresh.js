// Panels ask for a recompute without importing the orchestrator, which would
// make the dependency circular.

let handler = null;

export function onRequestUpdate(fn){ handler = fn; }

// The handler's promise comes back out: the occurrence search moves the range
// and then has to wait for the chart it moved to before it can scroll the row
// it went looking for into view.
export function requestUpdate(){ return handler ? handler() : undefined; }
