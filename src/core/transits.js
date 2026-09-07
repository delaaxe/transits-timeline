// Which transits to look for. The looking itself is core/events.js.

import { aspectAngle, isAngle, maxSkySeparation, normalizeBodies } from "../data/bodies.js";

/**
 * Every transiting-body-to-natal-point pair the selection asks for.
 *
 * The two ends are independent sets, so any combination is expressible: the
 * named groups the dropdowns used to offer, and equally "just Mars and Venus
 * against just natal Mars and Venus", which no pair of dropdowns could say.
 *
 * `link` covers the one thing two sets cannot say between them. Directed reads
 * left to right - these bodies transiting those points - which is the usual
 * question. "Either side" adds each pair's mirror image, so a Mars on the
 * transiting side and a whole chart on the natal side also brings back
 * everything crossing natal Mars: one body, both roles, without having to put
 * every other body on both sides to get there.
 *
 * @param {{transitBodies:string[], natalBodies:string[], aspects:string[],
 *          orb:number, link?:"directed"|"either"}} opts
 */
export function buildCandidateRules({ transitBodies, natalBodies, aspects, orb, link = "directed" }){
  const transit = normalizeBodies(transitBodies).filter(k => !isAngle(k));
  const natal = normalizeBodies(natalBodies);

  /** @type {[string, string][]} */
  const pairs = [];
  const seen = new Set();
  const addPair = (tp, np) => {
    // An angle is a place rather than a body, so it never transits - not even
    // when the mirror of a pair would put it on the moving side.
    if (isAngle(tp)) return;
    const key = `${tp}|${np}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([tp, np]);
  };

  for (const tp of transit) for (const np of natal) addPair(tp, np);
  if (link === "either"){
    for (const tp of natal) for (const np of transit) addPair(tp, np);
  }

  const rules = [];
  for (const [tp, np] of pairs){
    for (const asp of aspects){
      if (tp === "node" && asp !== "conjunction") continue;
      rules.push({ transit: tp, natal: np, aspect: asp, orb });
    }
  }
  return rules;
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
