// The whole transit computation as one call: rules and a range in, events out.
// It lives apart from the worker that usually runs it so that Node can import it
// directly, which is what makes the event model testable.

import { wrap360 } from "./angles.js";
import { wrap180, aspectTargets, scanAspectWindows } from "./events.js";
import { getBodyLonAt } from "./ephemeris.js";
import { aspectAngle, maxSpeedDegPerDay } from "../data/bodies.js";

/**
 * @typedef {{transit: string, natal: string, aspect: string, orb: number|string}} Rule
 * @typedef {import("./events.js").AspectEvent} AspectEvent
 *
 * @typedef {Object} TransitJob
 * @property {"personal"|"world"} mode
 * @property {number} startMs
 * @property {number} endMs exclusive
 * @property {{lon:number, lat:number, height:number}} observer
 * @property {Record<string, number>|null} natalLon fixed natal longitudes; world mode has none
 * @property {Rule[]} rules
 */

// Longitudes are read at times the scan chooses, so repeats are incidental
// rather than systematic; this makes them free when they happen, and is dropped
// wholesale rather than evicted an entry at a time.
const CACHE_LIMIT = 200000;

function makeLonReader(observer){
  const cache = new Map();
  let calls = 0;
  const read = (body, ms) => {
    const key = `${body}|${ms}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    calls++;
    const lon = getBodyLonAt(body, new Date(ms), observer);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, lon);
    return lon;
  };
  return { read, evaluations: () => calls };
}

/**
 * Rules that share one moving angle share one scan. Against a natal chart that
 * is every rule with the same transiting body, whatever it aspects: the natal
 * points are fixed, so they are offsets on the same longitude. In world mode
 * both ends move, so the shared angle is the separation and a scan covers one
 * pair of bodies.
 *
 * @param {Rule[]} rules
 * @param {"personal"|"world"} mode
 * @param {Record<string, number>|null} natalLon
 */
export function groupRules(rules, mode, natalLon){
  const isWorld = mode === "world";
  /** @type {Map<string, {transit:string, natal:string, orb:number, offsets:number[], members:{ruleIndex:number, slots:number[]}[]}>} */
  const groups = new Map();

  for (let i = 0; i < rules.length; i++){
    const r = rules[i];
    const orb = Number(r.orb) || 0;
    const natalDeg = isWorld ? 0 : Number(natalLon?.[r.natal]);
    // A natal point this chart does not carry is not an error, it just has no
    // transits.
    if (!isWorld && !Number.isFinite(natalDeg)) continue;

    const key = isWorld ? `${r.transit}|${r.natal}|${orb}` : `${r.transit}|${orb}`;
    let g = groups.get(key);
    if (!g){
      g = { transit: r.transit, natal: r.natal, orb, offsets: [], members: [] };
      groups.set(key, g);
    }

    // An aspect contributes one offset for a conjunction or an opposition and
    // two otherwise, since a sextile is exact both ahead and behind.
    const slots = aspectTargets(aspectAngle(r.aspect)).map(sep => {
      const offset = isWorld ? wrap360(sep) : wrap360(natalDeg + sep);
      const found = g.offsets.indexOf(offset);
      if (found !== -1) return found;
      g.offsets.push(offset);
      return g.offsets.length - 1;
    });
    g.members.push({ ruleIndex: i, slots });
  }

  return [...groups.values()];
}

function speedCeiling(mode, transit, natal){
  const t = maxSpeedDegPerDay[transit] ?? 25;
  if (mode !== "world") return t;
  return t + (maxSpeedDegPerDay[natal] ?? 25);
}

/**
 * @param {TransitJob} job
 * @param {(done:number, total:number)=>void} [onProgress]
 * @returns {{rules: Rule[], events: AspectEvent[][], evaluations: number}}
 */
export function computeTransitEvents(job, onProgress){
  const { mode, startMs, endMs, observer, natalLon, rules } = job;
  const lon = makeLonReader(observer);

  const groups = groupRules(rules, mode, natalLon);
  /** @type {AspectEvent[][]} */
  const byRule = rules.map(() => []);

  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const baseAt = (mode === "world")
      ? (ms) => wrap180(lon.read(g.transit, ms) - lon.read(g.natal, ms))
      : (ms) => lon.read(g.transit, ms);

    const perOffset = scanAspectWindows({
      offsets: g.offsets,
      orbDeg: g.orb,
      startMs,
      endMs,
      baseAt,
      maxSpeedDegPerDay: speedCeiling(mode, g.transit, g.natal)
    });

    for (const member of g.members){
      const events = member.slots.flatMap(slot => perOffset[slot]);
      events.sort((a, b) => a.start - b.start);
      byRule[member.ruleIndex] = events;
    }

    if (onProgress) onProgress(gi + 1, groups.length);
  }

  const keptRules = [];
  const keptEvents = [];
  for (let i = 0; i < rules.length; i++){
    if (byRule[i].length === 0) continue;
    keptRules.push(rules[i]);
    keptEvents.push(byRule[i]);
  }

  return { rules: keptRules, events: keptEvents, evaluations: lon.evaluations() };
}
