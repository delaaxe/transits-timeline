import { wrap360 } from "../core/angles.js";

export const planets = [
  ["sun","Sun"], ["moon","Moon"], ["mercury","Mercury"], ["venus","Venus"], ["mars","Mars"],
  ["jupiter","Jupiter"], ["saturn","Saturn"], ["uranus","Uranus"], ["neptune","Neptune"], ["pluto","Pluto"],
  ["node","Node"],
  ["chiron","Chiron"],
  ["mc","Mc"],
  ["asc","Asc"],
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
  mc: "Mc",
  // "Ac" rather than "Asc": this is the glyph form, used where the row labels
  // shorten, and summaryPointSymbols has spelled the point that way all along.
  asc: "Ac"
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
  mc: 0,
  asc: 0
};

// How long a contact from each transiting body lasts, and whether it comes back.
// The scan already finds the repeat hits - a retrograde pass that stays within
// orb hits more than once, which is why an event carries a list of exact times -
// but nothing on screen said which bodies do that, so a two-day Sun contact read
// with the same weight as a two-year Pluto one. The rates are mean apparent
// geocentric motion; the bar itself supplies the actual dates.
/** @type {Record<string, string>} */
export const transitTiming = {
  sun: "The Sun covers a degree a day and never turns retrograde, so this crosses once and returns in a year.",
  moon: "The Moon covers a degree every two hours and never turns retrograde, so this crosses once and returns in a month.",
  mercury: "Mercury covers a degree in well under a day when direct, but stations often, and can cross the same degree three times in a few weeks.",
  venus: "Venus covers a degree in under a day when direct, and crosses three times over some weeks when it turns retrograde here.",
  mars: "Mars covers a degree in about two days, and crosses three times over some months when it stations here.",
  jupiter: "Jupiter covers a degree in about twelve days, and often crosses three times across a year as it stations.",
  saturn: "Saturn covers a degree in about a month, and usually crosses three times across a year or two as it stations.",
  uranus: "Uranus covers a degree in about three months, typically crossing three times over a year or more.",
  neptune: "Neptune covers a degree in about six months, often crossing three times over two or three years.",
  pluto: "Pluto covers a degree in anything from half a year to a year, depending where it is in its eccentric orbit, and can cross three to five times over several years.",
  chiron: "Chiron covers a degree in about seven weeks on average, usually crossing three times over about a year.",
  node: "The mean node drifts backward a degree in three weeks and never turns, so this crosses once and not again for about nineteen years."
};

/**
 * Which body sets the pace. Against a natal point only the transiting body
 * moves; in world mode both do, and the faster of the two is what opens and
 * closes the window.
 */
/**
 * Only the transiting body moves against a natal point, so it alone sets the
 * pace. World mode has no note of this kind - see setTooltipContent.
 * @param {string} transitKey @returns {string}
 */
export function transitTimingFor(transitKey){
  return transitTiming[transitKey] || "";
}

export const order = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node","chiron","mc","asc"];

export const orderMap = new Map(order.map((k,i)=>[k,i]));

// Mercury and Venus orbit inside Earth's, so their elongation from the Sun is
// bounded and some sky-to-sky aspects between the three simply cannot happen: a
// Sun-Mercury square needs 90 degrees of separation and Mercury never manages 28.
// Measured against this ephemeris over 1990-2050 (27.8, 47.2, 73.8) and rounded
// up, with test/events.test.mjs re-measuring them so a wrong figure fails rather
// than quietly dropping real aspects. Only world mode is constrained this way -
// a natal Venus sits wherever it sits, so buildCandidateRules ignores this.
export const maxSkySeparationDeg = {
  "sun-mercury": 28,
  "sun-venus": 48,
  "mercury-venus": 76
};

/** The widest these two can get apart in the sky, or Infinity if unbounded. */
export function maxSkySeparation(a, b){
  const key = (orderMap.get(a) ?? 0) <= (orderMap.get(b) ?? 0) ? `${a}-${b}` : `${b}-${a}`;
  return maxSkySeparationDeg[key] ?? Infinity;
}

/** @type {[string, string, number][]} */
export const aspects = [
  ["conjunction", "☌ 0°", 0],
  ["sextile",     "⚹ 60°", 60],
  ["square",      "□ 90°", 90],
  ["trine",       "△ 120°", 120],
  ["opposition",  "☍ 180°", 180],
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
  opposition: "#ff9f43"
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
  .filter(k => k !== "node" && k !== "chiron" && k !== "mc" && k !== "asc")
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

// The node stays in the lookup - the line still needs its longitude - but it
// is drawn last, after Ac and Mc: it is a point rather than a body, and it
// reads as one at the end of the line.
export const summaryPlanetOrder = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node"];
export const summaryTailOrder = ["asc","mc","node"];

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
