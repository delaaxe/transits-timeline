// How much a transit matters, as one number.
//
// Five factors, multiplied:
//
//   transit x natal x aspect x closeness x passes
//
// Multiplied rather than summed because these are not independent
// contributions to be added up - they qualify one another. A Pluto contact
// that never comes within half a degree is not a big transit plus a small
// miss; it is a big transit discounted.
//
// Everything it reads is already on the rule or the event. peakOrb in
// particular has been computed on every window since the event model landed
// and read nowhere in the app, which is what makes the closeness factor free.
// Nothing new is computed in the worker and nothing new crosses that boundary:
// scoring runs on the main thread once results arrive, so changing a weight
// never costs a rescan.

import { aspectWeight, natalWeight, RETURN_BONUS, RULER_BONUS, transitWeight } from "../data/weights.js";

/** @typedef {import("./events.js").AspectEvent} AspectEvent */
/** @typedef {{transit:string, natal:string, aspect:string, orb?:number|string}} Rule */

// How much of the score survives a window that never comes near exact.
//
// Without a floor, closeness alone decides: a contact that peaks at the very
// edge of orb scores zero however slow the body is, so a Pluto square building
// toward an exact hit just outside the range sorts below a Moon sextile that
// happened to perfect inside it. The window really is the less interesting one
// of the two right now - the score is a property of what is on screen, and
// that is deliberate - but not by a factor of everything.
const CLOSENESS_FLOOR = 0.15;

// A retrograde pass that keeps coming back is more significant than a single
// crossing, but only somewhat: this is the smallest term here on purpose, and
// the tests pin it as smaller than any of the table factors.
const PASS_BONUS = 0.12;

/**
 * How close the window actually came, as a fraction of the orb allowed.
 *
 * Squared, so the falloff is gentle near exact and steep at the edge of orb -
 * which is how orbs behave, and is the reason one global orb slider is a blunt
 * instrument. Exact is 1.
 *
 * @param {number} peakOrb smallest separation reached, in degrees
 * @param {number} orbDeg the orb this rule was scanned with
 */
export function closeness(peakOrb, orbDeg){
  const orb = Number(orbDeg);
  if (!(orb > 0)) return 1;
  const x = Math.min(1, Math.max(0, Number(peakOrb) / orb));
  return CLOSENESS_FLOOR + (1 - CLOSENESS_FLOOR) * (1 - x * x);
}

/** @param {number[]|undefined} exacts */
function passes(exacts){
  const n = Array.isArray(exacts) ? exacts.length : 0;
  return 1 + PASS_BONUS * Math.max(0, n - 1);
}

/**
 * The two ends of the aspect, weighted.
 *
 * World mode is its own branch rather than a special case inside one formula.
 * There is no natal end there - both bodies are in the sky and neither is
 * anybody's chart - so scoring a lunation against a "how personal is this
 * point" table would rank it by an accident of that table. Instead both ends
 * are weighted as movers, and the pair is scored by the slower of the two,
 * softened by the faster: Saturn conjunct Neptune is the once-in-a-generation
 * event, and the Moon crossing anything is not, whichever way round the rule
 * happens to name them.
 *
 * @param {Rule} rule
 * @param {"personal"|"world"} mode
 * @param {string|null} chartRuler
 */
function endsWeight(rule, mode, chartRuler){
  if (mode === "world"){
    const a = transitWeight[rule.transit] ?? 0.3;
    const b = transitWeight[rule.natal] ?? 0.3;
    const slow = Math.max(a, b);
    const fast = Math.min(a, b);
    // The slower body sets the scale; the faster one can only pull it down,
    // and never below half, so a slow pair stays a slow pair.
    return slow * (0.5 + 0.5 * fast);
  }
  const t = transitWeight[rule.transit] ?? 0.3;
  let n = natalWeight[rule.natal] ?? 0.5;
  // The chart ruler is the planet running the chart, and the row labels have
  // underlined it all along. An angle is never a ruler, so this cannot stack
  // with the Ascendant's own weight.
  if (chartRuler && rule.natal === chartRuler) n *= RULER_BONUS;
  return t * n;
}

/**
 * How much one window of one rule matters.
 *
 * @param {Rule} rule
 * @param {AspectEvent} event
 * @param {{mode?:"personal"|"world", orb?:number, chartRuler?:string|null}} [opts]
 * @returns {number}
 */
export function scoreEvent(rule, event, opts = {}){
  if (!rule || !event) return 0;
  const mode = opts.mode === "world" ? "world" : "personal";
  const orb = Number(opts.orb ?? rule.orb ?? 0);
  const isReturn = rule.aspect === "conjunction" && rule.transit === rule.natal;

  return endsWeight(rule, mode, opts.chartRuler ?? null)
    * (aspectWeight[rule.aspect] ?? 0.5)
    * (isReturn ? RETURN_BONUS : 1)
    * closeness(event.peakOrb, orb)
    * passes(event.exacts);
}

/**
 * How much a row matters: its best window, not its total.
 *
 * Max rather than sum, because a row is one contact that the range may happen
 * to cut into several windows. Summing would rank a body that wanders in and
 * out of a wide orb above one that crossed once and exactly, which is backwards.
 *
 * @param {Rule} rule
 * @param {AspectEvent[]} events
 * @param {{mode?:"personal"|"world", orb?:number, chartRuler?:string|null}} [opts]
 * @returns {number}
 */
export function scoreRow(rule, events, opts = {}){
  if (!Array.isArray(events) || events.length === 0) return 0;
  let best = 0;
  for (const e of events){
    const s = scoreEvent(rule, e, opts);
    if (s > best) best = s;
  }
  return best;
}
