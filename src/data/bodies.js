import { wrap360 } from "../core/angles.js";

export const planets = [
  ["sun","Sun"], ["moon","Moon"], ["mercury","Mercury"], ["venus","Venus"], ["mars","Mars"],
  ["jupiter","Jupiter"], ["saturn","Saturn"], ["uranus","Uranus"], ["neptune","Neptune"], ["pluto","Pluto"],
  ["node","Node"],
  ["chiron","Chiron"],
  ["mc","Mc"],
];

export const planetSymbols = {
  sun: "☉",
  moon: "☾",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  node: "☊",
  chiron: "⚷",
  mc: "Mc"
};

// Ceilings on apparent geocentric daily motion, in degrees per day. The event
// scan steps by (distance to the orb boundary) / this figure, so a value set too
// low would let it step over a transit. Each is the maximum measured against the
// ephemeris over 1900-2100 with margin added, and test/events.test.mjs
// re-measures a sample of them so a wrong one fails rather than quietly losing
// transits. This library's longitudes are geocentric, so none of it depends on
// where the observer is.
export const maxSpeedDegPerDay = {
  sun: 1.05,      // 1.020
  moon: 15.6,     // 15.389
  mercury: 2.3,   // 2.203
  venus: 1.32,    // 1.259
  mars: 0.85,     // 0.791
  jupiter: 0.26,  // 0.242
  saturn: 0.14,   // 0.130
  uranus: 0.07,   // 0.063
  neptune: 0.05,  // 0.042
  pluto: 0.05,    // 0.041
  chiron: 0.18,   // 0.146
  node: 0.06,     // 0.0530, and analytic rather than measured
  mc: 0
};

export const order = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node","chiron","mc"];

export const orderMap = new Map(order.map((k,i)=>[k,i]));

/** @type {[string, string, number][]} */
export const aspects = [
  ["conjunction", "☌ 0°", 0],
  ["sextile",     "⚹ 60°", 60],
  ["square",      "□ 90°", 90],
  ["trine",       "△ 120°", 120],
  ["opposition",  "☍ 180°", 180],
  ["quincunx",    "⚻ 150°", 150],
];

// Lifted off a light-page palette onto a dark one, and every aspect given its
// own hue: sextile #15803d against trine #166534 was one green twice, which a
// 12px bar cannot tell apart. Soft aspects stay cool, hard aspects warm, and
// the glyph in the row label is what carries the distinction where colour
// cannot - a red-green colourblind reader reads the chart from that.
export const aspectColors = {
  conjunction: "#4f8cff",
  sextile: "#43c8c0",
  square: "#ff6b5e",
  trine: "#3fbf7f",
  opposition: "#ff9f43",
  quincunx: "#b08ce8"
};

// A return - the transiting body meeting its own natal place - is the one
// event that is not really an aspect, and it has always been drawn in gold.
export const returnColor = "#ffc94d";

// Dropdown groups exclude Node/Chiron/MC; checkboxes add them.
export const baseGroups = [
  ["luminaries","Luminaries (Sun, Moon)", ["sun","moon"]],
  ["personal",  "Personal (Sun–Mars)", ["sun","moon","mercury","venus","mars"]],
  ["classical", "Classical (Sun–Saturn)", ["sun","moon","mercury","venus","mars","jupiter","saturn"]],
  ["outer",     "Outer (Jupiter–Pluto)", ["jupiter","saturn","uranus","neptune","pluto"]],
  ["social",    "Social (Jupiter–Saturn)", ["jupiter","saturn"]],
  ["slow",      "Slow (Saturn–Pluto)",   ["saturn","uranus","neptune","pluto"]],
  ["all",       "All (Sun-Pluto)", ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"]],
];

export const individualPlanets = planets
  .map(p => p[0])
  .filter(k => k !== "node" && k !== "chiron" && k !== "mc")
  .map(k => [k, planetLabel(k), [k]]);

export const sharedGroups = [...baseGroups, ...individualPlanets];

export const transitGroups = sharedGroups;

export const natalGroups = sharedGroups;

export function planetLabel(key){ return planets.find(p => p[0] === key)?.[1] ?? key; }

export function aspectAngle(key){ return aspects.find(a => a[0] === key)?.[2] ?? 0; }

export function aspectSymbol(key){ return aspects.find(a => a[0] === key)?.[1]?.split(" ")[0] ?? "•"; }

export function mythKeyFor(a, b){
  const pa = String(a || "");
  const pb = String(b || "");
  const ia = orderMap.has(pa) ? orderMap.get(pa) : Number.MAX_SAFE_INTEGER;
  const ib = orderMap.has(pb) ? orderMap.get(pb) : Number.MAX_SAFE_INTEGER;
  const [first, second] = (ia === ib) ? [pa, pb] : (ia < ib ? [pa, pb] : [pb, pa]);
  return `${first}-aspect-${second}`;
}

export const signSymbols = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];

// The node trails the planets: it is a point rather than a body, and it reads
// as one alongside Ac and Mc at the end of the line.
export const summaryPlanetOrder = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node"];

export const summaryPointSymbols = { asc: "Ac", mc: "Mc" };

export function zodiacSignSymbol(deg){
  const idx = Math.floor(wrap360(deg) / 30) % 12;
  return signSymbols[idx] || "";
}

export function zodiacSign(deg){
  const signs = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const idx = Math.floor(wrap360(deg) / 30) % 12;
  return signs[idx] || "";
}

export function groupByKey(list){
  const m = new Map();
  for (const [key, label, arr] of list) m.set(key, arr);
  return m;
}

export const transitGroupMap = groupByKey(transitGroups);

export const natalGroupMap = groupByKey(natalGroups);
