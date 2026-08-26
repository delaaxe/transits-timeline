// Which transits to look for. The looking itself is core/events.js.

import { natalGroupMap, transitGroupMap } from "../data/bodies.js";

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
