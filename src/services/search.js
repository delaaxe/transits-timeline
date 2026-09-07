// "When did this last happen, and when does it happen next?"
//
// The timeline answers what is in a window. The other half of the question an
// astrologer asks of a row - the last Saturn square to a natal Sun, the next
// Jupiter return - is about time outside it, and cannot be answered by widening
// the range: a Chiron return is fifty years out and the scan between here and
// there would be fifty years of every other row as well.
//
// So one rule is scanned on its own, over windows that reach further out as the
// near ones come back empty. That ordering is what keeps it cheap: whatever is
// found in the first year is found for the price of a year, and the searches
// that have to reach centuries are searches for slow bodies, which are the ones
// the adaptive scan crosses in the fewest steps.

import { computeEvents } from "./compute.js";

const YEAR_MS = 365.2425 * 24 * 3600 * 1000;

// The far edge of each successive window, in years from where the search
// started. Each window picks up where the last one stopped, so nothing is
// scanned twice. The last reaches back beyond any chart's owner and forward
// past any of their plans, which is the point at which "never, as far as this
// is concerned" is the honest answer - a Neptune-Pluto conjunction really does
// take five centuries.
export const SEARCH_REACH_YEARS = [1, 3, 9, 27, 81, 243];

export const SEARCH_LIMIT_YEARS = SEARCH_REACH_YEARS[SEARCH_REACH_YEARS.length - 1];

/**
 * The windows to scan, nearest first.
 * @param {number} fromMs @param {number} direction -1 for back, +1 for forward
 * @returns {{startMs:number, endMs:number}[]}
 */
export function searchWindows(fromMs, direction){
  const out = [];
  let near = 0;
  for (const far of SEARCH_REACH_YEARS){
    out.push(direction < 0
      ? { startMs: fromMs - far * YEAR_MS, endMs: fromMs - near * YEAR_MS }
      : { startMs: fromMs + near * YEAR_MS, endMs: fromMs + far * YEAR_MS });
    near = far;
  }
  return out;
}

/**
 * The occurrence nearest `fromMs` in `direction`, out of one rule's windows.
 *
 * An exact hit is what "this happened" means where there is one. A pass that
 * comes inside orb and turns back without ever perfecting is still the contact
 * happening - a stationing outer planet does it often - so those count too,
 * dated by the middle of the window, since the closest approach has no other
 * time to its name.
 *
 * A window the scan found running off the far edge is the exception. Its exact
 * hit may be a day past the edge, on the other side of which is the next window
 * along, so calling it "a pass that was never exact" would be a guess about time
 * that was not looked at. It is left for the window that contains it.
 *
 * @param {import("../core/events.js").AspectEvent[]} events
 * @param {number} fromMs @param {number} direction
 */
export function pickOccurrence(events, fromMs, direction){
  let best = null;
  for (const event of events ?? []){
    const hits = (event.exacts ?? []).filter(ms => direction < 0 ? ms < fromMs : ms > fromMs);
    let at = null;
    if (hits.length){
      at = direction < 0 ? Math.max(...hits) : Math.min(...hits);
    } else if ((event.exacts ?? []).length === 0){
      const runsOffFarEdge = direction < 0 ? event.startClipped : event.endClipped;
      const mid = (event.start + event.end) / 2;
      if (!runsOffFarEdge && (direction < 0 ? mid < fromMs : mid > fromMs)) at = mid;
    }
    if (at === null) continue;
    if (!best || (direction < 0 ? at > best.at : at < best.at)){
      best = { at, event, exact: hits.length > 0 };
    }
  }
  return best;
}

/**
 * The range to show a found occurrence in: how many days, and around what.
 *
 * The reader's own zoom is kept wherever it can hold the contact, because the
 * view they were reading is the view they asked the question from. Where the
 * contact is longer than that - three years of Pluto inside orb - the range
 * grows to fit it instead, since a week centred inside it would draw a bar
 * touching both edges and say nothing at all.
 *
 * @param {{at:number, event:{start:number, end:number}}} hit
 * @param {number} spanDays the range the reader is on
 * @param {number} maxDays a ceiling, so a very wide orb cannot answer a question
 *   about one contact with a century
 */
export function occurrenceWindow(hit, spanDays, maxDays){
  const windowDays = Math.max(0, (hit.event.end - hit.event.start) / (24 * 3600 * 1000));
  const wantsWindow = windowDays * 1.2 > spanDays;
  return {
    days: Math.max(1, Math.min(maxDays, wantsWindow ? Math.ceil(windowDays * 1.2) : spanDays)),
    centreMs: wantsWindow ? (hit.event.start + hit.event.end) / 2 : hit.at
  };
}

/**
 * @param {Object} opts
 * @param {{transit:string, natal:string, aspect:string, orb:number}} opts.rule
 * @param {number} opts.direction -1 for the last one, +1 for the next
 * @param {number} opts.fromMs where to look out from
 * @param {"personal"|"world"} opts.mode
 * @param {{lon:number, lat:number, height:number}} opts.observer
 * @param {Record<string, number>|null} opts.natalLon
 * @param {(reachYears:number)=>void} [opts.onReach] how far out the search has got
 * @returns {Promise<{at:number, event:any, exact:boolean}|null>}
 */
export async function findOccurrence({ rule, direction, fromMs, mode, observer, natalLon, onReach }){
  const windows = searchWindows(fromMs, direction);
  for (let i = 0; i < windows.length; i++){
    const w = windows[i];
    onReach?.(SEARCH_REACH_YEARS[i]);
    const res = await computeEvents({
      mode,
      startMs: Math.min(w.startMs, w.endMs),
      endMs: Math.max(w.startMs, w.endMs),
      observer,
      natalLon,
      rules: [rule]
    });
    // A rule with nothing in the window is dropped from the result rather than
    // returned empty, so this is a miss and not an index to trust blindly.
    const events = res.rules?.length ? res.events[0] : [];
    const hit = pickOccurrence(events, fromMs, direction);
    if (hit) return hit;
  }
  return null;
}
