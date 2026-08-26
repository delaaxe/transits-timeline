import { angDist } from "./angles.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "./ephemeris.js";
import { aspectAngle, aspects, natalGroupMap, transitGroupMap } from "../data/bodies.js";

export function buildTransitCacheKey({ rangeStartLocal, endExclusive, stepMillis, lon, lat, height, planetsKey }){
  return [
    rangeStartLocal.toISOString(),
    endExclusive.toISOString(),
    String(stepMillis),
    String(lon),
    String(lat),
    String(height),
    String(planetsKey || "")
  ].join("|");
}

export function uniquePush(arr, v){ if (!arr.includes(v)) arr.push(v); }

export function buildCandidateRules({ transitGroup, natalGroup, aspects, orb,
                              includeMoon, includeChiron, includeNode, includeMC }){
  let transitPlanets = [...(transitGroupMap.get(transitGroup) ?? transitGroupMap.get("outer") ?? [])];
  const natalTargets = [...(natalGroupMap.get(natalGroup) ?? natalGroupMap.get("classical") ?? [])];

  if (includeChiron){
    uniquePush(transitPlanets, "chiron");
    uniquePush(natalTargets, "chiron");
  }
  if (includeNode){
    uniquePush(transitPlanets, "node");
    uniquePush(natalTargets, "node");
  }
  if (includeMC){
    uniquePush(natalTargets, "mc");
  }
  if (!includeMoon){
    transitPlanets = transitPlanets.filter(p => p !== "moon");
  }

  const rules = [];
  for (const tp of transitPlanets){
    for (const np of natalTargets){
      for (const asp of aspects){
        if (tp === "node" && asp !== "conjunction") continue;
        rules.push({ transit: tp, natal: np, aspect: asp, orb });
      }
    }
  }
  return rules;
}

export function buildSkyRules({ transitGroup, aspects, orb, includeMoon, includeChiron, includeNode }){
  let skyPlanets = [...(transitGroupMap.get(transitGroup) ?? transitGroupMap.get("outer") ?? [])];
  if (includeChiron){
    uniquePush(skyPlanets, "chiron");
  }
  if (includeNode){
    uniquePush(skyPlanets, "node");
  }
  if (!includeMoon){
    skyPlanets = skyPlanets.filter(p => p !== "moon");
  }
  skyPlanets = skyPlanets.filter(p => p !== "mc");
  const rules = [];
  for (let i=0; i<skyPlanets.length; i++){
    for (let j=i+1; j<skyPlanets.length; j++){
      for (const asp of aspects){
        if ((skyPlanets[i] === "node" || skyPlanets[j] === "node") && asp !== "conjunction") continue;
        rules.push({ transit: skyPlanets[i], aspect: asp, natal: skyPlanets[j], orb });
      }
    }
  }
  return rules;
}

export function groupActiveIntervalsWithExact(flagsIn, deltasIn, sampleTimes, endExclusive, bridgeTinyGaps){
  const intervals = [];
  if (!sampleTimes.length) return intervals;

  const flags = flagsIn.slice();
  const deltas = deltasIn.slice();
  if (bridgeTinyGaps){
    for (let i=1; i<flags.length-1; i++){
      if (!flags[i] && flags[i-1] && flags[i+1]){
        flags[i] = true;
        deltas[i] = Math.min(deltas[i-1], deltas[i+1]);
      }
    }
  }

  let inRun = false;
  let runStart = null;
  let minDelta = Infinity;
  let exactTime = null;
  let lastActiveSample = null;
  let runClippedStart = false;
  for (let i=0; i<flags.length; i++){
    const active = flags[i];
    if (active){
      if (!inRun){
        inRun = true;
        runStart = sampleTimes[i];
        minDelta = deltas[i];
        exactTime = sampleTimes[i];
        lastActiveSample = sampleTimes[i];
        runClippedStart = (i === 0);
      } else if (deltas[i] < minDelta){
        minDelta = deltas[i];
        exactTime = sampleTimes[i];
      }
      lastActiveSample = sampleTimes[i];
    } else if (inRun){
      inRun = false;
      const exactAtBoundary = runClippedStart && exactTime && exactTime.getTime() === runStart.getTime();
      intervals.push([runStart, sampleTimes[i], exactTime, exactAtBoundary]);
      runStart = null;
      minDelta = Infinity;
      exactTime = null;
      lastActiveSample = null;
      runClippedStart = false;
    }
  }
  if (inRun){
    const exactAtBoundary = runClippedStart
      ? (exactTime && exactTime.getTime() === runStart.getTime())
      : (exactTime && lastActiveSample && exactTime.getTime() === lastActiveSample.getTime());
    intervals.push([runStart, endExclusive, exactTime, exactAtBoundary]);
  }
  return intervals;
}

export function aspectDeltaAt(time, rule, observer, natalLon){
  if (!observer) return null;
  const allPlanets = ephemerisAstronomy.getAllPlanets(time, observer.lon, observer.lat, observer.height);
  const tLon = getBodyLonFromAll(allPlanets, rule.transit, time);
  const nLon = natalLon ? natalLon[rule.natal] : getBodyLonFromAll(allPlanets, rule.natal, time);
  if (nLon === null || nLon === undefined) return null;
  const d = angDist(tLon, nLon);
  return Math.abs(d - aspectAngle(rule.aspect));
}

export function refineExactMinute(approx, rangeStart, rangeEnd, stepMillis, rule, observer, natalLon){
  if (!approx || !observer) return approx;
  const lo = Math.min(rangeStart.getTime(), rangeEnd.getTime());
  const hi = Math.max(rangeStart.getTime(), rangeEnd.getTime());
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return approx;

  let a = lo;
  let b = hi;
  let bestT = approx.getTime();
  let bestD = aspectDeltaAt(new Date(bestT), rule, observer, natalLon);
  if (bestD === null) return approx;

  // Deterministic bracketed search to reduce expensive ephemeris evaluations.
  for (let i=0; i<22 && (b - a) > (2 * 60000); i++){
    const t1 = Math.floor(a + (b - a) / 3);
    const t2 = Math.floor(b - (b - a) / 3);
    const d1 = aspectDeltaAt(new Date(t1), rule, observer, natalLon);
    const d2 = aspectDeltaAt(new Date(t2), rule, observer, natalLon);
    if (d1 !== null && d1 < bestD){ bestD = d1; bestT = t1; }
    if (d2 !== null && d2 < bestD){ bestD = d2; bestT = t2; }
    if (d1 === null || d2 === null) break;
    if (d1 <= d2){
      b = t2;
    } else {
      a = t1;
    }
  }

  const fineLo = Math.max(lo, Math.floor(a / 60000) * 60000);
  const fineHi = Math.min(hi, Math.ceil(b / 60000) * 60000);
  for (let t = fineLo; t <= fineHi; t += 60000){
    const d = aspectDeltaAt(new Date(t), rule, observer, natalLon);
    if (d === null) continue;
    if (d < bestD){
      bestD = d;
      bestT = t;
    }
  }

  // Final local refinement to lock onto the closest minute as accurately as possible.
  const secLo = Math.max(lo, bestT - 60000);
  const secHi = Math.min(hi, bestT + 60000);
  for (let t = secLo; t <= secHi; t += 10000){
    const d = aspectDeltaAt(new Date(t), rule, observer, natalLon);
    if (d === null) continue;
    if (d < bestD){
      bestD = d;
      bestT = t;
    }
  }

  return new Date(Math.round(bestT / 60000) * 60000);
}
