// Runs a transit job in a worker, and computes it here if the browser has none.
//
// The worker is kept warm between updates: starting one costs parsing the
// ephemeris, which is most of the bundle. It is thrown away only when a
// computation is cancelled, since a dedicated worker cannot read its own
// messages while a synchronous scan is running, and terminating it is the only
// way to stop one that is already under way.

import { computeTransitEvents } from "../core/job.js";
import { workerUrl } from "../core/worker-url.js";

/** @typedef {import("../core/job.js").TransitJob} TransitJob */

/** @type {Worker|null} */
let worker = null;
/** @type {{id:number, resolve:Function, reject:Function, job:TransitJob, onProgress?:Function}|null} */
let pending = null;
let nextId = 1;
let workerUnavailable = typeof Worker === "undefined";

function runHere(entry){
  const current = entry;
  pending = null;
  try {
    current.resolve(computeTransitEvents(current.job, (done, total) => current.onProgress?.(done, total)));
  } catch (err){
    current.reject(err);
  }
}

function ensureWorker(){
  if (worker) return worker;
  try {
    worker = new Worker(workerUrl, { type: "module" });
  } catch {
    workerUnavailable = true;
    return null;
  }

  worker.onmessage = (e) => {
    const msg = e.data;
    if (!pending || !msg || msg.id !== pending.id) return;
    if (msg.type === "progress"){
      pending.onProgress?.(msg.done, msg.total);
      return;
    }
    const current = pending;
    pending = null;
    if (msg.type === "error") current.reject(new Error(msg.message));
    else current.resolve({ rules: msg.rules, events: msg.events, evaluations: msg.evaluations });
  };

  // A module worker that the browser refuses to start reports it here rather
  // than by throwing, so this is where the fallback is decided.
  worker.onerror = (e) => {
    e.preventDefault?.();
    workerUnavailable = true;
    worker?.terminate();
    worker = null;
    if (pending) runHere(pending);
  };

  return worker;
}

/** Stops the computation in flight, if any. Its promise rejects with "Cancelled". */
export function cancelCompute(){
  if (worker){
    worker.terminate();
    worker = null;
  }
  if (pending){
    const current = pending;
    pending = null;
    current.reject(new Error("Cancelled"));
  }
}

/**
 * @param {TransitJob} job
 * @param {(done:number, total:number)=>void} [onProgress]
 * @returns {Promise<{rules: any[], events: any[][], evaluations: number}>}
 */
export function computeEvents(job, onProgress){
  cancelCompute();
  return new Promise((resolve, reject) => {
    const entry = { id: nextId++, resolve, reject, job, onProgress };
    pending = entry;
    const w = workerUnavailable ? null : ensureWorker();
    if (!w){
      runHere(entry);
      return;
    }
    w.postMessage({ id: entry.id, job });
  });
}
