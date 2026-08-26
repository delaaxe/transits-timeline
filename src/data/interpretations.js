export let aspectDescriptions = {};

export let mythDescriptions = {};

// Batches of prose that have landed. The two files are independent, so neither
// waits on the other: whichever arrives first is usable immediately.
let arrived = 0;
/** @type {Promise<void>|null} */
let loading = null;
/** @type {(() => void)[]} */
const listeners = [];

/**
 * Half a megabyte of prose that nothing on screen needs until a bar is opened,
 * so the page does not wait for it. Callers read through the accessors below
 * rather than holding the text, which means a lookup before this resolves is an
 * empty string rather than a stale one, and the next lookup has the real thing.
 */
export function loadInterpretations(){
  if (loading) return loading;
  const announce = () => { arrived++; for (const fn of listeners) fn(); };
  loading = Promise.all([
    loadAspectDescriptions().then(data => { aspectDescriptions = data; announce(); }),
    loadMythDescriptions().then(data => { mythDescriptions = data; announce(); })
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

export async function loadAspectDescriptions(){
  try{
    const res = await fetch("aspects.json");
    if (!res.ok) throw new Error(`Aspect descriptions load failed (${res.status}).`);
    const data = await res.json();
    if (data && typeof data === "object") return data;
  } catch (err){
    console.warn("Aspect descriptions unavailable:", err);
  }
  return {};
}

export async function loadMythDescriptions(){
  try{
    const res = await fetch("myths.json");
    if (!res.ok) throw new Error(`Myth descriptions load failed (${res.status}).`);
    const data = await res.json();
    if (data && typeof data === "object") return data;
  } catch (err){
    console.warn("Myth descriptions unavailable:", err);
  }
  return {};
}
