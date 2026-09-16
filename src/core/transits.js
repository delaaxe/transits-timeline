// Which transits to look for. The looking itself is core/events.js.

import { aspectAngle, isAngle, maxSeparation, natalKeys, normalizeBodies, transitingKeys } from "../data/bodies.js";

/**
 * Every transiting-body-to-natal-point pair the selection asks for.
 *
 * Two modes, because there are two questions and they do not have the same
 * shape. "directed" is the usual one - these bodies crossing those points -
 * and it needs two sets read left to right. "involving" is the other one an
 * astrologer asks: everything a body is part of, whichever end it lands on.
 * That question has no direction and no second set: the far end is the rest of
 * the chart, so asking for it would be asking for a field whose only sensible
 * answer is "all of it".
 *
 * Every rule is stamped with the scope it was built for, because a chart can
 * now hold both kinds at once: the world rows sit among the natal ones, and by
 * the time a rule reaches the scan there is nothing else about it that says
 * which of the two questions it came from.
 *
 * @param {{mode?:"directed"|"involving", transitBodies?:string[],
 *          natalBodies?:string[], involvingBodies?:string[],
 *          aspects:string[], orb:number}} opts
 */
export function buildCandidateRules({ mode = "directed", transitBodies, natalBodies, involvingBodies, aspects, orb }){
  const pairs = (mode === "involving")
    ? involvingPairs(involvingBodies)
    : directedPairs(transitBodies, natalBodies);

  /** @type {import("./job.js").Rule[]} */
  const rules = [];
  for (const [tp, np] of pairs){
    for (const asp of aspects){
      if (tp === "node" && asp !== "conjunction") continue;
      rules.push({ transit: tp, natal: np, aspect: asp, orb, scope: "personal" });
    }
  }
  return rules;
}

/** @param {string[]|undefined} transitBodies @param {string[]|undefined} natalBodies @returns {[string, string][]} */
function directedPairs(transitBodies, natalBodies){
  // An angle is a place rather than a body: nothing is there to move, so it can
  // be aspected and never aspects.
  const transit = normalizeBodies(transitBodies).filter(k => !isAngle(k));
  const natal = normalizeBodies(natalBodies);
  /** @type {[string, string][]} */
  const pairs = [];
  for (const tp of transit) for (const np of natal) pairs.push([tp, np]);
  return pairs;
}

/**
 * Every pair with one of these at one end and anything at the other. A body
 * appears on both sides - transiting Mars over the chart, and everything in the
 * chart over natal Mars - which between them is what "involving Mars" means.
 *
 * @param {string[]|undefined} involvingBodies
 * @returns {[string, string][]}
 */
function involvingPairs(involvingBodies){
  const wanted = new Set(normalizeBodies(involvingBodies));
  /** @type {[string, string][]} */
  const pairs = [];
  const seen = new Set();
  /** @param {string} tp @param {string} np */
  const add = (tp, np) => {
    if (isAngle(tp)) return;
    const key = `${tp}|${np}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([tp, np]);
  };
  for (const key of wanted){
    for (const np of natalKeys) add(key, np);
    for (const tp of transitingKeys) add(tp, key);
  }
  return pairs;
}

/**
 * Every world transit: an aspect between two moving bodies. One set rather
 * than two: both
 * ends move, so a pair has no direction and each is generated once, in chart
 * order.
 *
 * These carry scope "world", which is what tells the scan to read both ends as
 * moving and the chart to read the row as a world transit rather than a
 * contact with a birth chart.
 *
 * @param {{bodies:string[], aspects:string[], orb:number}} opts
 */
export function buildWorldRules({ bodies, aspects, orb }){
  const world = normalizeBodies(bodies).filter(k => !isAngle(k));
  /** @type {import("./job.js").Rule[]} */
  const rules = [];
  for (let i=0; i<world.length; i++){
    for (let j=i+1; j<world.length; j++){
      for (const asp of aspects){
        if ((world[i] === "node" || world[j] === "node") && asp !== "conjunction") continue;
        // An aspect the pair can never reach is not a transit that never fires,
        // it is a scan of the whole range looking for nothing.
        if (aspectAngle(asp) - orb > maxSeparation(world[i], world[j])) continue;
        rules.push({ transit: world[i], aspect: asp, natal: world[j], orb, scope: "world" });
      }
    }
  }
  return rules;
}
