export let aspectDescriptions = {};

export let mythDescriptions = {};

export let worldDescriptions = {};

// Batches of prose that have landed. The files are independent, so none waits
// on another: whichever arrives first is usable immediately.
let arrived = 0;
/** @type {Promise<void>|null} */
let loading = null;
/** @type {(() => void)[]} */
const listeners = [];

/**
 * Most of a megabyte of prose that nothing on screen needs until a bar is
 * opened, so the page does not wait for it. Callers read through the accessors
 * below rather than holding the text, which means a lookup before this resolves
 * is an empty string rather than a stale one, and the next lookup has the real
 * thing.
 */
export function loadInterpretations(){
  if (loading) return loading;
  const announce = () => { arrived++; for (const fn of listeners) fn(); };
  loading = Promise.all([
    loadAspectDescriptions().then(data => { aspectDescriptions = data; announce(); }),
    loadMythDescriptions().then(data => { mythDescriptions = data; announce(); }),
    loadWorldDescriptions().then(data => { worldDescriptions = data; announce(); })
  ]).then(() => undefined);
  return loading;
}

/** Runs `fn` as each batch lands, and once straight away if any already has. */
export function onInterpretationsArrived(fn){
  listeners.push(fn);
  if (arrived > 0) fn();
}

export function aspectDescription(key){ return aspectDescriptions[key] || ""; }

export function mythDescription(key){ return mythDescriptions[key] || ""; }

export function worldDescription(key){ return worldDescriptions[key] || ""; }

/**
 * A missing file leaves the rest of the app working, so a failed fetch warns and
 * resolves empty rather than rejecting: the tooltip then shows no prose instead
 * of no tooltip.
 * @param {string} name @param {string} label
 */
async function loadJson(name, label){
  try{
    const res = await fetch(name);
    if (!res.ok) throw new Error(`${label} load failed (${res.status}).`);
    const data = await res.json();
    if (data && typeof data === "object") return data;
  } catch (err){
    console.warn(`${label} unavailable:`, err);
  }
  return {};
}

export function loadAspectDescriptions(){ return loadJson("aspects.json", "Aspect descriptions"); }

export function loadMythDescriptions(){ return loadJson("myths.json", "Myth descriptions"); }

export function loadWorldDescriptions(){ return loadJson("world.json", "World descriptions"); }
