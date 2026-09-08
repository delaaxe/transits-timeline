// Which transits to look for. The looking itself is core/events.js.

import { aspectAngle, isAngle, maxSkySeparation, natalKeys, normalizeBodies, transitingKeys } from "../data/bodies.js";

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
 * @param {{mode?:"directed"|"involving", transitBodies?:string[],
 *          natalBodies?:string[], involvingBodies?:string[],
 *          aspects:string[], orb:number}} opts
 */
export function buildCandidateRules({ mode = "directed", transitBodies, natalBodies, involvingBodies, aspects, orb }){
  const pairs = (mode === "involving")
    ? involvingPairs(involvingBodies)
    : directedPairs(transitBodies, natalBodies);

  const rules = [];
  for (const [tp, np] of pairs){
    for (const asp of aspects){
      if (tp === "node" && asp !== "conjunction") continue;
      rules.push({ transit: tp, natal: np, aspect: asp, orb });
    }
  }
  return rules;
}

/** @returns {[string, string][]} */
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
 * sky over natal Mars - which between them is what "involving Mars" means.
 *
 * @returns {[string, string][]}
 */
function involvingPairs(involvingBodies){
  const wanted = new Set(normalizeBodies(involvingBodies));
  /** @type {[string, string][]} */
  const pairs = [];
  const seen = new Set();
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
 * Every aspect between two bodies in the sky. One set rather than two: both
 * ends move, so a pair has no direction and each is generated once, in chart
 * order.
 *
 * @param {{bodies:string[], aspects:string[], orb:number}} opts
 */
export function buildSkyRules({ bodies, aspects, orb }){
  const sky = normalizeBodies(bodies).filter(k => !isAngle(k));
  const rules = [];
  for (let i=0; i<sky.length; i++){
    for (let j=i+1; j<sky.length; j++){
      for (const asp of aspects){
        if ((sky[i] === "node" || sky[j] === "node") && asp !== "conjunction") continue;
        // An aspect the pair can never reach is not a transit that never fires,
        // it is a scan of the whole range looking for nothing.
        if (aspectAngle(asp) - orb > maxSkySeparation(sky[i], sky[j])) continue;
        rules.push({ transit: sky[i], aspect: asp, natal: sky[j], orb });
      }
    }
  }
  return rules;
}
