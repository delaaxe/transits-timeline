// The transit computation runs here so a long range cannot stall the page.
// Everything it does is in job.js, which Node imports directly; this file is
// only the wire between that and the main thread.

import { computeTransitEvents } from "./job.js";

// The DOM lib has no type for a worker's global scope, and it cannot be loaded
// alongside one that does, so this is the one place the checker is told to
// stand down.
/** @type {any} */
const ctx = self;

ctx.onmessage = (e) => {
  const { id, job } = e.data ?? {};
  try {
    const result = computeTransitEvents(job, (done, total) => {
      ctx.postMessage({ id, type: "progress", done, total });
    });
    ctx.postMessage({ id, type: "done", ...result });
  } catch (err){
    ctx.postMessage({ id, type: "error", message: String(err?.message || err) });
  }
};
