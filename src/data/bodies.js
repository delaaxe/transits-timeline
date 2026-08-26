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

export const aspectColors = {
  conjunction: "#1d4ed8",
  sextile: "#15803d",
  square: "#b91c1c",
  trine: "#166534",
  opposition: "#c2410c",
  quincunx: "#0f766e"
};

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

export const summaryPlanetOrder = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"];

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
