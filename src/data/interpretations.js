import { aspects } from "./bodies.js";

export let aspectDescriptions = {};

export let mythDescriptions = {};

export async function loadInterpretations(){
  aspectDescriptions = await loadAspectDescriptions();
  mythDescriptions = await loadMythDescriptions();
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
