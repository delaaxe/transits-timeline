import { degToRad, midpointAngle, radToDeg, wrap360 } from "./angles.js";
import { ephemerisAstronomy, getBodyLonFromAll } from "./ephemeris.js";
import { gmstDeg, julianDay, meanObliquityDeg, parseBirthUTCFor } from "./time.js";
import { order } from "../data/bodies.js";

// Mean sidereal time + mean obliquity.
export function calcNatalMCDeg(birthUTC, lonDeg){
  const jd = julianDay(birthUTC);
  const t = (jd - 2451545.0) / 36525.0;
  const eps = degToRad(meanObliquityDeg(t));
  const lst = degToRad(wrap360(gmstDeg(jd) + lonDeg)); // east-positive
  const lam = Math.atan2(Math.sin(lst) * Math.cos(eps), Math.cos(lst));
  return wrap360(radToDeg(lam));
}

export function calcNatalAscDeg(birthUTC, lonDeg, latDeg){
  const jd = julianDay(birthUTC);
  const t = (jd - 2451545.0) / 36525.0;
  const eps = degToRad(meanObliquityDeg(t));
  const lst = degToRad(wrap360(gmstDeg(jd) + lonDeg)); // east-positive
  const phi = degToRad(latDeg);

  // Ascendant (ecliptic longitude rising) - standard formula
  const ascRad = Math.atan2(
    -Math.cos(lst),
    (Math.sin(lst) * Math.cos(eps)) + (Math.tan(phi) * Math.sin(eps))
  ) + Math.PI;

  return wrap360(radToDeg(ascRad));
}

export function chartRulerFromAsc(ascDeg){
  const sign = Math.floor(wrap360(ascDeg) / 30); // 0=Aries..11=Pisces
  const rulers = ["mars","venus","mercury","moon","sun","mercury","venus","mars","jupiter","saturn","saturn","jupiter"]; // traditional
  return rulers[sign] || null;
}

export function computeCompositeChart(pA, pB){
  const birthUTCA = parseBirthUTCFor(pA);
  const birthUTCB = parseBirthUTCFor(pB);
  const allA = ephemerisAstronomy.getAllPlanets(birthUTCA, pA.lon, pA.lat, 0);
  const allB = ephemerisAstronomy.getAllPlanets(birthUTCB, pB.lon, pB.lat, 0);
  const lon = {};
  for (const k of order){
    if (k === "mc") continue;
    lon[k] = midpointAngle(getBodyLonFromAll(allA, k, birthUTCA), getBodyLonFromAll(allB, k, birthUTCB));
  }
  const mcA = calcNatalMCDeg(birthUTCA, pA.lon);
  const mcB = calcNatalMCDeg(birthUTCB, pB.lon);
  lon.mc = midpointAngle(mcA, mcB);
  const ascA = calcNatalAscDeg(birthUTCA, pA.lon, pA.lat);
  const ascB = calcNatalAscDeg(birthUTCB, pB.lon, pB.lat);
  const asc = midpointAngle(ascA, ascB);
  const compLon = midpointAngle(pA.lon, pB.lon);
  const compLat = (Number.isFinite(pA.lat) && Number.isFinite(pB.lat)) ? ((pA.lat + pB.lat) / 2) : (Number(pA.lat) || 0);
  return { lon, asc, mc: lon.mc, location: { lon: compLon, lat: compLat } };
}
