import * as ephNS from "../../vendor/ephemeris-astronomy.js";
import { wrap360 } from "./angles.js";
import { julianDay } from "./time.js";

export const ephemerisAstronomy = ephNS.default ?? ephNS;

export function getPlanetLonFromAll(allPlanets, planetKey){
  const obs = allPlanets?.observed?.[planetKey];
  if (!obs || typeof obs.apparentLongitudeDd !== "number"){
    throw new Error(`Couldn't read apparentLongitudeDd for "${planetKey}".`);
  }
  return wrap360(obs.apparentLongitudeDd);
}

export function calcMeanNodeDeg(dateObj){
  const t = (julianDay(dateObj) - 2451545.0) / 36525.0;
  return wrap360(
    125.04455501
    - 1934.1361849 * t
    + 0.0020762 * t * t
    + (t * t * t) / 467410
    - (t * t * t * t) / 60616000
  );
}

export function getBodyLonFromAll(allPlanets, planetKey, dateObj){
  if (planetKey === "node") return calcMeanNodeDeg(dateObj);
  return getPlanetLonFromAll(allPlanets, planetKey);
}

// One body at one time. getAllPlanets computes every body whether or not the
// caller wants it; the event scan asks for a single longitude many thousands of
// times, and this returns the identical number for a fraction of the work.
export function getBodyLonAt(planetKey, dateObj, observer){
  if (planetKey === "node") return calcMeanNodeDeg(dateObj);
  const one = ephemerisAstronomy.getPlanet(planetKey, dateObj, observer.lon, observer.lat, observer.height);
  return getPlanetLonFromAll(one, planetKey);
}
