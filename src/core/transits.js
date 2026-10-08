// Which transits to look for. The looking itself is core/events.js.

import { INGRESS, PHASE, aspectAngle, isAngle, maxSeparation, natalKeys, normalizeBodies, phases, signKeys, transitingKeys } from "../data/bodies.js";

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

/**
 * Every sign change a body can make: one rule per body per sign, with the sign
 * where a natal point would go. They ride with the world transits - a body
 * entering a sign is weather, not a contact with anyone's chart - and carry
 * that scope so the chart draws them one plane back the same way.
 *
 * Twelve rules a body rather than one, because a scan is one cusp: Jupiter
 * entering Gemini is a window around 0° Gemini, and its exact hits are each
 * crossing of that line, which a station can make three of. The scan drops the
 * eleven signs a body never reaches in the range, as it drops any rule with
 * nothing in it, and foldIngressRows puts what is left on one line.
 *
 * @param {{bodies:string[], orb:number}} opts
 */
export function buildIngressRules({ bodies, orb }){
  const moving = normalizeBodies(bodies).filter(k => !isAngle(k));
  /** @type {import("./job.js").Rule[]} */
  const rules = [];
  for (const body of moving){
    for (const sign of signKeys){
      rules.push({ transit: body, aspect: INGRESS, natal: sign, orb, scope: "world" });
    }
  }
  return rules;
}

/**
 * The Moon's four phases as rules: Sun and Moon, one named angle each. They
 * ride with the world transits whatever the world list holds, since the
 * lunation is the calendar every chart is read against, and they fold onto
 * one strip the way the sign changes do. The orb is the scan's bracket and
 * nothing the reader sees: the strip draws the moment alone.
 */
export function buildPhaseRules(){
  /** @type {import("./job.js").Rule[]} */
  const rules = [];
  for (const [key] of phases) rules.push({ transit: "sun", aspect: key, natal: "moon", orb: 1, scope: "world" });
  return rules;
}

/**
 * The scan's answer with every rule `isStrip` picks out folded onto one row.
 *
 * The windows keep the rule they were found for, so a marker on the strip
 * still knows it is Jupiter entering Gemini. Only windows with an exact hit
 * count: the strip draws the moment and nothing else, so a body merely within
 * orb would be a row with nothing on it, and a range holding no such moment
 * gets no strip at all.
 *
 * @param {import("./job.js").Rule[]} rules
 * @param {import("./events.js").AspectEvent[][]} events one list per rule
 * @param {(rule: import("./job.js").Rule) => boolean} isStrip
 * @param {string} kind the key the strip's own rule wears on all three ends
 * @returns {{rules: import("./job.js").Rule[], events: import("./events.js").AspectEvent[][]}}
 */
export function foldStripRows(rules, events, isStrip, kind){
  /** @type {import("./job.js").Rule[]} */
  const keptRules = [];
  /** @type {import("./events.js").AspectEvent[][]} */
  const keptEvents = [];
  /** @type {import("./events.js").AspectEvent[]} */
  const strip = [];
  /** @type {import("./job.js").Rule|null} */
  let first = null;
  for (let i = 0; i < rules.length; i++){
    const rule = rules[i];
    if (!isStrip(rule)){
      keptRules.push(rule);
      keptEvents.push(events[i]);
      continue;
    }
    for (const event of events[i]){
      if (!(event.exacts ?? []).length) continue;
      first ??= rule;
      strip.push({ ...event, rule });
    }
  }
  if (first){
    strip.sort((a, b) => a.start - b.start);
    keptRules.push({ transit: kind, aspect: kind, natal: kind, orb: first.orb, scope: "world" });
    keptEvents.push(strip);
  }
  return { rules: keptRules, events: keptEvents };
}

/** Every sign change on one row. See foldStripRows.
 * @param {import("./job.js").Rule[]} rules @param {import("./events.js").AspectEvent[][]} events */
export function foldIngressRows(rules, events){
  return foldStripRows(rules, events, r => r.aspect === INGRESS, INGRESS);
}

/** Every phase of the Moon on one row. See foldStripRows.
 * @param {import("./job.js").Rule[]} rules @param {import("./events.js").AspectEvent[][]} events */
export function foldPhaseRows(rules, events){
  const keys = new Set(phases.map(p => p[0]));
  return foldStripRows(rules, events, r => keys.has(r.aspect), PHASE);
}
