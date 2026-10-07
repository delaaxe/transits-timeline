import { wrap360 } from "../core/angles.js";

export const planets = [
  ["sun","Sun"], ["moon","Moon"], ["mercury","Mercury"], ["venus","Venus"], ["mars","Mars"],
  ["jupiter","Jupiter"], ["saturn","Saturn"], ["uranus","Uranus"], ["neptune","Neptune"], ["pluto","Pluto"],
  ["node","Node"],
  ["chiron","Chiron"],
  ["mc","Mc"],
  ["asc","Asc"],
];

/** @type {Record<string, string>} */
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
  // PLUTO FORM TWO (U+2BD3), the chart symbol - a circle held in a crescent
  // over a cross - rather than U+2647, the PL monogram from Percival Lowell's
  // initials that the astronomers gave it in 1930.
  pluto: "\u2BD3",
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
/** @type {Record<string, number>} */
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
// bounded and some world transits between the three simply cannot happen: a
// Sun-Mercury square needs 90 degrees of separation and Mercury never manages 28.
// Measured against this ephemeris over 1990-2050 (27.8, 47.2, 73.8) and rounded
// up, with test/events.test.mjs re-measuring them so a wrong figure fails rather
// than quietly dropping real aspects. Only world mode is constrained this way -
// a natal Venus sits wherever it sits, so buildCandidateRules ignores this.
export const maxSeparationDeg = {
  "sun-mercury": 28,
  "sun-venus": 48,
  "mercury-venus": 76
};

/** The widest these two can get apart in the sky, or Infinity if unbounded.
 * @param {string} a @param {string} b @returns {number} */
export function maxSeparation(a, b){
  const key = (orderMap.get(a) ?? 0) <= (orderMap.get(b) ?? 0) ? `${a}-${b}` : `${b}-${a}`;
  return (/** @type {Record<string, number>} */ (maxSeparationDeg))[key] ?? Infinity;
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

// Everything the app can put on either end of a transit, in chart order, split
// by what each end can hold: an angle is a place in the chart rather than
// something in the sky, so nothing is there to move and it can only be aspected.
export const angleKeys = ["mc", "asc"];

export const transitingKeys = order.filter(k => !angleKeys.includes(k));

export const natalKeys = [...order];

/** @param {string} key */
export function isAngle(key){ return angleKeys.includes(key); }

/** A body list in chart order, with repeats and unknown keys dropped.
 * @param {string[]|undefined|null} list @returns {string[]} */
export function normalizeBodies(list){
  const wanted = new Set(list ?? []);
  return order.filter(k => wanted.has(k));
}

/** Whether two lists name the same bodies, in whatever order they were given.
 * @param {string[]|undefined|null} a @param {string[]|undefined|null} b */
export function sameBodies(a, b){
  const x = normalizeBodies(a);
  const y = normalizeBodies(b);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}

// What the two dropdowns used to offer. They were never anything but named sets
// of bodies, and naming a set is not the same as being the only sets on offer:
// "Mars and Venus, whichever of the two is transiting" was not expressible at
// all. So they are presets over the chips now - tapping one fills the selection
// rather than constraining it - and the Node, Chiron and the two angles, which
// were five separate checkboxes bolted onto whichever group was chosen, are
// chips like every other body, named by the presets that want them.
/** @type {[string, string, string[]][]} */
export const bodyPresets = [
  ["personal",  "Personal",  ["sun","moon","mercury","venus","mars"]],
  ["classical", "Classical", ["sun","moon","mercury","venus","mars","jupiter","saturn"]],
  ["outer",     "Outer",     ["jupiter","saturn","uranus","neptune","pluto"]],
  ["slow",      "Slow",      ["saturn","uranus","neptune","pluto"]],
  ["angles",    "Angles",    ["mc","asc"]],
  ["all",       "All",       [...order]]
];

/** @param {string} key */
export function planetLabel(key){ return planets.find(p => p[0] === key)?.[1] ?? key; }

/** @param {string} key @returns {number} */
export function aspectAngle(key){ return aspects.find(a => a[0] === key)?.[2] ?? 0; }

/** @param {string} key */
export function aspectSymbol(key){
  if (key === INGRESS) return "→";
  return aspects.find(a => a[0] === key)?.[1]?.split(" ")[0] ?? "•";
}

/** @param {string} a @param {string} b */
export function mythKeyFor(a, b){
  const pa = String(a || "");
  const pb = String(b || "");
  const ia = orderMap.get(pa) ?? Number.MAX_SAFE_INTEGER;
  const ib = orderMap.get(pb) ?? Number.MAX_SAFE_INTEGER;
  const [first, second] = (ia === ib) ? [pa, pb] : (ia < ib ? [pa, pb] : [pb, pa]);
  return `${first}-aspect-${second}`;
}

export const signSymbols = ["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"];

export const signNames = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

// The key a sign is known by where a rule names one: the far end of an ingress
// row is a sign rather than a body, and it sits in the same field a natal point
// would. Lowercase like the body keys, so "jupiter-ingress-gemini" reads like
// "jupiter-conjunction-sun" and is told apart by its aspect, not its spelling.
export const signKeys = signNames.map(n => n.toLowerCase());

/** @param {string} key */
export function isSignKey(key){ return signKeys.includes(key); }

/** @param {string} key @returns {number} 0 for Aries through 11 for Pisces, or -1 */
export function signIndexOf(key){ return signKeys.indexOf(key); }

/** @param {number} deg @returns {number} 0 for Aries through 11 for Pisces */
export function signIndexAt(deg){ return Math.floor(wrap360(deg) / 30) % 12; }

/**
 * A longitude as an astrologer writes it: "14°03′ Pisces". Rounded to the
 * minute before it is split, so 29°59.6′ Aquarius comes out as 0°00′ Pisces
 * rather than 30°00′ of a sign that stops at thirty.
 * @param {number} deg
 */
export function fmtZodiacDeg(deg){
  const parts = zodiacParts(deg);
  return parts ? `${parts.degrees} ${parts.sign}` : "";
}

/**
 * The same longitude in two pieces, for a line that wants to say the sign in
 * one place and the degree in another.
 * @param {number} deg
 * @returns {{degrees: string, sign: string}|null}
 */
export function zodiacParts(deg){
  if (!Number.isFinite(deg)) return null;
  const totalMin = Math.round(wrap360(deg) * 60) % 21600;
  const sign = Math.floor(totalMin / 1800);
  const rem = totalMin - sign * 1800;
  const d = Math.floor(rem / 60);
  const m = rem % 60;
  return { degrees: `${d}°${String(m).padStart(2, "0")}′`, sign: signNames[sign] };
}

// A body entering a sign. Not in the aspect list: it is not an angle between
// two things, there is no checkbox for it, and the rows it makes are switched
// on and off as a kind rather than ticked one by one.
export const INGRESS = "ingress";

/** @param {{aspect?: string}|null|undefined} rule */
export function isIngressRule(rule){ return !!rule && rule.aspect === INGRESS; }

// The one row every sign change is drawn on. A row per body per sign was a
// dozen lines saying the same small thing, so they are folded into one strip
// after the scan: each window on it remembers the rule it came from, which is
// what the popup and the glyph on the bar read.
export const INGRESS_ROW_LABEL = "Sign changes";

/** @param {{transit?: string, aspect?: string}|null|undefined} rule */
export function isIngressRow(rule){ return isIngressRule(rule) && rule?.transit === INGRESS; }

/**
 * The cusp an ingress row watches, in degrees. A body going the ordinary way
 * enters a sign at its first degree; the mean node only ever moves backward,
 * so it enters a sign from the far end, over the cusp the sign shares with the
 * one after it. Either way the row is named for the sign being entered, which
 * is the sign the reader will find the body in afterwards.
 * @param {string} transit @param {string} signKey @returns {number|null}
 */
export function ingressCuspDeg(transit, signKey){
  const idx = signIndexOf(signKey);
  if (idx < 0) return null;
  return wrap360((transit === "node" ? idx + 1 : idx) * 30);
}

/**
 * The key of the sign an ingress into `signKey` leaves behind - the one on the
 * other side of the cusp, which for the backward-moving node is the next sign
 * along rather than the one before.
 * @param {string} transit @param {string} signKey
 */
export function ingressFromSignKey(transit, signKey){
  const idx = signIndexOf(signKey);
  if (idx < 0) return "";
  return signKeys[(idx + (transit === "node" ? 1 : 11)) % 12];
}

/** The same sign by name. @param {string} transit @param {string} signKey */
export function ingressFromSign(transit, signKey){
  const key = ingressFromSignKey(transit, signKey);
  return key ? signNames[signIndexOf(key)] : "";
}

/**
 * What a crossing of the cusp actually did. A rule watches one cusp and names
 * the sign on the far side of it, but a body that stations there crosses it
 * both ways, and the crossing back puts the body in the sign it came from.
 * This is the rule as the reader should see that crossing: named for the sign
 * the body is in afterwards, and marked so the prose can say "back".
 *
 * @param {{transit: string, natal: string, aspect: string, orb?: number|string, scope?: "personal"|"world"}} rule
 * @param {boolean} entering whether the body ended up in the rule's sign
 */
export function ingressAsCrossed(rule, entering){
  if (entering) return { rule, back: false };
  return { rule: { ...rule, natal: ingressFromSignKey(rule.transit, rule.natal) }, back: true };
}

/**
 * The prose a sign change shows, written here rather than looked up: twelve
 * signs for each body is a file nobody has written, and what the popup has to
 * say is mostly arithmetic anyway.
 *
 * `back` is a crossing against the body's usual direction - a planet
 * retrograding out of a sign it had entered, which is a real event and the
 * one the reader most wants named. The node has no such thing: backward is
 * its usual direction, and it never turns.
 *
 * @param {{transit: string, natal: string}} rule named for the sign the body is in afterwards
 * @param {boolean} [back]
 */
export function ingressDescription(rule, back = false){
  const body = rule.transit === "node" ? "The mean node" : planetLabel(rule.transit);
  const into = endLabel(rule.natal);
  if (back){
    // The sign it slips back out of is the one the forward crossing goes to.
    const outOf = signNames[(signIndexOf(rule.natal) + 1) % 12];
    return `${body}, retrograde, slips back out of ${outOf} and into ${into}. It will cross into ${outOf} again once it turns direct.`;
  }
  const from = ingressFromSign(rule.transit, rule.natal);
  const way = rule.transit === "node" ? " backward" : "";
  return `${body} crosses${way} out of ${from} and into ${into}.`;
}

/**
 * A row's name: "Saturn □ Sun", "Mars ☌ Jupiter", "Jupiter → Gemini". In words
 * or in glyphs, and the same three parts either way.
 * @param {{transit:string, aspect:string, natal:string}} rule
 * @param {{glyphs?: boolean}} [opts]
 */
export function rulePairing(rule, { glyphs = false } = {}){
  const end = glyphs ? endGlyph : endLabel;
  return `${end(rule.transit)} ${aspectSymbol(rule.aspect)} ${end(rule.natal)}`;
}

/**
 * Whether a row has to say it is a world transit. A pair of moving bodies over
 * a personal chart does, or "Mars □ Saturn" reads as a contact with the birth
 * chart. An ingress is drawn on the same plane but names its own kind: nothing
 * in anyone's chart is called Gemini, so the label would be saying what the
 * arrow already says.
 * @param {{scope?: string, aspect?: string}} rule
 */
export function needsWorldLabel(rule){
  return rule.scope === "world" && !isIngressRule(rule);
}

/** The name of either end of a rule: a body, a point, or a sign. @param {string} key */
export function endLabel(key){
  const idx = signIndexOf(key);
  return idx >= 0 ? signNames[idx] : planetLabel(key);
}

/** The glyph for either end of a rule, or its name where it has none. @param {string} key */
export function endGlyph(key){
  const idx = signIndexOf(key);
  return idx >= 0 ? signSymbols[idx] : (planetSymbols[key] || planetLabel(key));
}

// The node stays in the lookup - the line still needs its longitude - but it
// is drawn last, after Ac and Mc: it is a point rather than a body, and it
// reads as one at the end of the line.
export const summaryPlanetOrder = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node"];
export const summaryTailOrder = ["asc","mc","node"];

export const summaryPointSymbols = { asc: "Ac", mc: "Mc" };

/** @param {number} deg */
export function zodiacSignSymbol(deg){
  return signSymbols[signIndexAt(deg)] || "";
}

/** @param {number} deg */
export function zodiacSign(deg){
  return signNames[signIndexAt(deg)] || "";
}

/**
 * The key a row is known by, which is how the followed row is told from the
 * other fifty-nine.
 *
 * The scope is part of it because a chart can hold both kinds at once: Mars
 * square Saturn as a world transit and transiting Mars square a natal Saturn are the
 * same three words and two different rows, and without the scope following one
 * of them would light both.
 *
 * Not the key the prose is filed under - that is the pairing alone, and each
 * scope has its own file to look it up in.
 */
/** @param {{scope?: string, transit: string, aspect: string, natal: string}|null|undefined} rule */
export function ruleKey(rule){
  return rule ? `${rule.scope ?? "personal"}-${rule.transit}-${rule.aspect}-${rule.natal}` : "";
}

// What a world row adds to its own name, so a card headed "Mercury ☍ Saturn"
// over a personal chart is not read as a contact with the birth chart. It is a
// label on the row rather than part of the pairing, which is why it is written
// once here: the places that append it and the one place that takes it back off
// have to agree on the exact characters, separator included.
export const worldTitleSuffix = " · world transit";

/**
 * The pairing alone, with the world label taken off if it is there.
 *
 * Copying a popup's title is how a transit leaves the app - into a note, a
 * message, a calendar entry someone types themselves - and the label is the app
 * talking about its own chart, not part of the event's name. Wherever the text
 * lands there is no personal row beside it to be told apart from.
 *
 * @param {string} title
 */
export function titleWithoutWorldSuffix(title){
  const text = String(title ?? "");
  return text.endsWith(worldTitleSuffix) ? text.slice(0, -worldTitleSuffix.length) : text;
}
