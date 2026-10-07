// The whole transit computation as one call: rules and a range in, events out.
// It lives apart from the worker that usually runs it so that Node can import it
// directly, which is what makes the event model testable.

import { wrap360 } from "./angles.js";
import { wrap180, aspectTargets, scanAspectWindows } from "./events.js";
import { getBodyLonAt } from "./ephemeris.js";
import { aspectAngle, ingressCuspDeg, isIngressRule, maxSpeedDegPerDay } from "../data/bodies.js";

/**
 * @typedef {{transit: string, natal: string, aspect: string, orb: number|string,
 *            scope?: "personal"|"world"}} Rule
 * @typedef {import("./events.js").AspectEvent} AspectEvent
 *
 * @typedef {Object} TransitJob
 * @property {"personal"|"world"} [mode] the scope of any rule that carries none
 * @property {number} startMs
 * @property {number} endMs exclusive
 * @property {{lon:number, lat:number, height:number}} observer
 * @property {Record<string, number>|null} natalLon fixed natal longitudes; world rules need none
 * @property {Rule[]} rules
 */

/**
 * Which question a rule asks. It is a property of the rule rather than of the
 * job, because one job now carries both: a personal chart with world transits
 * folded into it scans both kinds in the same pass, over one
 * cache of longitudes. The job's mode is the fallback for a rule that predates
 * the stamp - the occurrence search builds one by hand, and the tests pass
 * plain literals.
 *
 * @param {Rule} rule @param {"personal"|"world"|undefined} jobMode
 */
function scopeOf(rule, jobMode){
  return (rule.scope ?? jobMode) === "world" ? "world" : "personal";
}

// Longitudes are read at times the scan chooses, so repeats are incidental
// rather than systematic; this makes them free when they happen, and is dropped
// wholesale rather than evicted an entry at a time.
const CACHE_LIMIT = 200000;

/** @param {{lon:number, lat:number, height:number}} observer */
function makeLonReader(observer){
  const cache = new Map();
  let calls = 0;
  /** @param {string} body @param {number} ms */
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
 * points are fixed, so they are offsets on the same longitude. For a world rule
 * both ends move, so the shared angle is the separation and a scan covers one
 * pair of bodies.
 *
 * The two kinds can arrive in the same list, so the scope is part of the group
 * key: "mars|saturn|1" as a world pair and a natal contact on transiting Mars are
 * different scans and must not land in the same bucket.
 *
 * An ingress is the first kind of scan whatever scope it carries: one body
 * against a fixed degree, the degree being a cusp rather than a natal point.
 * So it joins the transiting body's single-body group, and on a personal chart
 * that is the very scan the natal contacts are read from - a sign change costs
 * twelve more offsets on a longitude already being read.
 *
 * @param {Rule[]} rules
 * @param {"personal"|"world"|undefined} mode the scope of rules that carry none
 * @param {Record<string, number>|null} natalLon
 */
export function groupRules(rules, mode, natalLon){
  /** @type {Map<string, {scope:"personal"|"world", transit:string, natal:string, orb:number, offsets:number[], members:{ruleIndex:number, slots:number[]}[]}>} */
  const groups = new Map();

  for (let i = 0; i < rules.length; i++){
    const r = rules[i];
    const ingress = isIngressRule(r);
    // The scope of the scan, which for an ingress is the single-body kind
    // whatever the rule says about where the row belongs.
    const scope = ingress ? "personal" : scopeOf(r, mode);
    const isWorld = scope === "world";
    const orb = Number(r.orb) || 0;
    const natalDeg = isWorld ? 0 : (ingress ? ingressCuspDeg(r.transit, r.natal) : Number(natalLon?.[r.natal]));
    // A natal point this chart does not carry is not an error, it just has no
    // transits. Nor is a sign that does not exist.
    if (!isWorld && !Number.isFinite(natalDeg)) continue;

    const key = isWorld ? `world|${r.transit}|${r.natal}|${orb}` : `personal|${r.transit}|${orb}`;
    let g = groups.get(key);
    if (!g){
      g = { scope, transit: r.transit, natal: r.natal, orb, offsets: [], members: [] };
      groups.set(key, g);
    }

    // An aspect contributes one offset for a conjunction or an opposition and
    // two otherwise, since a sextile is exact both ahead and behind. An ingress
    // is one cusp, which is the one offset a conjunction would have.
    const slots = aspectTargets(ingress ? 0 : aspectAngle(r.aspect)).map(sep => {
      const offset = isWorld ? wrap360(sep) : wrap360(Number(natalDeg) + sep);
      const found = g.offsets.indexOf(offset);
      if (found !== -1) return found;
      g.offsets.push(offset);
      return g.offsets.length - 1;
    });
    g.members.push({ ruleIndex: i, slots });
  }

  return [...groups.values()];
}

/** @param {string} scope @param {string} transit @param {string} natal */
function speedCeiling(scope, transit, natal){
  const t = maxSpeedDegPerDay[transit] ?? 25;
  if (scope !== "world") return t;
  return t + (maxSpeedDegPerDay[natal] ?? 25);
}

/**
 * @param {TransitJob} job
 * @param {(done:number, total:number)=>void} [onProgress] done is fractional:
 *   it advances within a group as well as between them
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
    const baseAt = (g.scope === "world")
      ? (/** @type {number} */ ms) => wrap180(lon.read(g.transit, ms) - lon.read(g.natal, ms))
      : (/** @type {number} */ ms) => lon.read(g.transit, ms);

    const perOffset = scanAspectWindows({
      offsets: g.offsets,
      orbDeg: g.orb,
      startMs,
      endMs,
      baseAt,
      maxSpeedDegPerDay: speedCeiling(g.scope, g.transit, g.natal),
      // Groups are wildly uneven - a Saturn scan is a few dozen steps and a
      // lunar one is tens of thousands - so done advances through a group as
      // well as between groups, and is fractional.
      onProgress: onProgress ? (frac) => onProgress(gi + frac, groups.length) : undefined
    });

    for (const member of g.members){
      const rule = rules[member.ruleIndex];
      const events = member.slots.flatMap(slot => perOffset[slot]);
      events.sort((a, b) => a.start - b.start);
      // Where each exact hit happens, as well as when. The reads are the ones
      // the scan just made, so they come out of the cache for nothing - and
      // where a transit lands is how an astrologer remembers it, which the
      // time alone never says.
      const ingress = isIngressRule(rule);
      const cusp = ingress ? Number(ingressCuspDeg(rule.transit, rule.natal)) : NaN;
      for (const event of events){
        event.exactLon = event.exacts.map(ms => lon.read(g.transit, ms));
        event.exactLonNatal = (g.scope === "world")
          ? event.exacts.map(ms => lon.read(g.natal, ms))
          : event.exacts.map(() => ingress ? cusp : Number(natalLon?.[rule.natal]));
        // Which way the cusp was crossed. A body a few hours before the
        // crossing is on one side of it or the other, and the side says
        // whether it entered the rule's sign or fell back out of it. The node
        // enters from above, since it only ever moves backward; everything
        // else enters from below.
        if (ingress){
          event.entering = event.exacts.map(ms => {
            const side = wrap180(lon.read(g.transit, ms - 6 * 3600 * 1000) - cusp);
            return rule.transit === "node" ? side > 0 : side < 0;
          });
        }
      }
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
