// The view presets: what "Today" or "Year" means as a query.
//
// Each names the bodies on both ends outright. They used to name a dropdown
// group and then correct it with a handful of checkboxes, which meant a preset
// could only ever say what those controls could hold between them; a body list
// says anything the chooser can.

const ALL_ASPECTS = ["conjunction","sextile","square","trine","opposition"];

// The transiting bodies each view watches. Everything below Saturn moves fast
// enough to fill a month with contacts, so the wider the window the fewer of
// them earn a row: a year of transiting Moon is thirteen thousand bars.
const TRANSIT_TODAY = ["sun","moon","mercury","venus","mars","node","chiron"];
const TRANSIT_WEEK = ["sun","mercury","venus","mars","node","chiron"];
const TRANSIT_MONTH = ["sun","mercury","venus","mars","jupiter","saturn","node","chiron"];
const TRANSIT_YEAR = ["jupiter","saturn","uranus","neptune","pluto","node","chiron"];

// What a natal chart offers when nothing has been narrowed. The classical seven
// carry the near view; a year is long enough for a transit to reach the outer
// planets' own places, which is where the generational readings live.
const NATAL_NEAR = ["sun","moon","mercury","venus","mars","jupiter","saturn","node","chiron","mc","asc"];
const NATAL_ALL = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node","chiron","mc","asc"];

// World mode has one set rather than two: both ends of a sky aspect move, so
// there is no transiting side and no natal side to tell apart.
const SKY_ALL = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","node","chiron"];
const SKY_NO_MOON = SKY_ALL.filter(k => k !== "moon");
const SKY_OUTER = ["jupiter","saturn","uranus","neptune","pluto","node","chiron"];

export const defaultPresetKey = "week";

/** @type {{key:string, label:string, transit:string[], natal:string[],
 *   link:"directed"|"either", aspects:string[], orb:number,
 *   range:{startOffsetDays:number, endOffsetDays:number},
 *   world:{bodies:string[]}}[]} */
export const presets = [
  { key:"today", label:"Today",
    transit: TRANSIT_TODAY, natal: NATAL_NEAR, link:"directed",
    aspects: ALL_ASPECTS, orb:1.5,
    range:{startOffsetDays:0, endOffsetDays:0},
    world:{ bodies: SKY_ALL } },
  { key:"week", label:"Week",
    transit: TRANSIT_WEEK, natal: NATAL_NEAR, link:"directed",
    aspects: ALL_ASPECTS, orb:1.0,
    range:{startOffsetDays:-1, endOffsetDays:6},
    world:{ bodies: SKY_NO_MOON } },
  { key:"month", label:"Month",
    transit: TRANSIT_MONTH, natal: NATAL_NEAR, link:"directed",
    aspects: ALL_ASPECTS, orb:1.0,
    range:{startOffsetDays:-7, endOffsetDays:29},
    world:{ bodies: SKY_NO_MOON } },
  { key:"basic_longterm", label:"Year",
    transit: TRANSIT_YEAR, natal: NATAL_ALL, link:"directed",
    aspects: ALL_ASPECTS, orb:1.0,
    range:{startOffsetDays:-90, endOffsetDays:364},
    world:{ bodies: SKY_OUTER } }
];
