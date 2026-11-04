// Everything that perfects today, as two lines of text.
//
// This is what the hidden corner of the chart copies: a complete reading of the
// day rather than the chart's current view of it. The chooser narrows the chart
// to what the reader wants to look at; this ignores that and takes every body on
// both ends and every aspect, so the text can be pasted somewhere else as "what
// is going on today" without first widening the selection. The one body left
// out is the transiting Moon, which is in orb of something every few hours and
// would be half the list.

import { wrap360 } from "../core/angles.js";
import { getBodyLonAt } from "../core/ephemeris.js";
import { computeTransitEvents } from "../core/job.js";
import { addDaysLocal } from "../core/time.js";
import { buildCandidateRules, buildIngressRules, buildPhaseRules, buildWorldRules } from "../core/transits.js";
import { aspects, eclipseKind, endGlyph, ingressAsCrossed, isIngressRule, natalKeys, phaseFor, rulePairing, transitingKeys, zodiacSignSymbol } from "../data/bodies.js";
import { locale } from "../storage/charts.js";
import { natalLongitudes } from "./chart-context.js";

// A sign glyph for the copied text. The zodiac signs are emoji by default on
// iOS, which pastes them as purple tiles; U+FE0E, the text-presentation
// selector, asks for the monochrome glyph from the text font instead. It is
// invisible, travels with the text, and does nothing where the signs are
// text already. The aspect glyphs and the arrow have no emoji form.
export const TEXT_PRESENTATION = "\uFE0E";

/** @param {number} deg */
const signGlyph = (deg) => zodiacSignSymbol(deg) + TEXT_PRESENTATION;

// The Moon's moments carry a time. The same clock as the chart's labels, built
// once here rather than borrowed from ui/format, which the typed half of the
// app does not import.
const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Every body that moves, the Moon aside. */
export const todayTransitBodies = transitingKeys.filter(k => k !== "moon");

/** Every aspect the app knows. */
export const todayAspects = aspects.map(a => a[0]);

/**
 * The rules a day's reading scans: every transiting body over every natal
 * point where there is a chart, every pair of transiting bodies either way,
 * every body's sign changes, and the Moon's phases. The orb is the reader's,
 * since it is the one number on the aspect panel that says what "in orb"
 * means to them.
 *
 * The Moon is back for the sign changes and the phases, which feed its own
 * line rather than the world's. It is left out of the aspects because it is
 * in orb of something every few hours.
 *
 * @param {{personal: boolean, orb: number}} opts
 * @returns {import("../core/job.js").Rule[]}
 */
export function buildTodayRules({ personal, orb }){
  return [
    ...(personal
      ? buildCandidateRules({ transitBodies: todayTransitBodies, natalBodies: natalKeys, aspects: todayAspects, orb })
      : []),
    ...buildWorldRules({ bodies: todayTransitBodies, aspects: todayAspects, orb }),
    ...buildIngressRules({ bodies: transitingKeys, orb }),
    ...buildPhaseRules()
  ];
}

/**
 * @typedef {Object} MoonMoments what the scan found of the Moon's own day
 * @property {{name:string, sign:string, at:number, eclipse:string}|null} phase
 *   the phase exact today, with the glyph of the Moon's sign at that moment
 *   and "solar eclipse", "lunar eclipse" or "" for what kind of eclipse it
 *   is, or null
 * @property {{sign:string, at:number}|null} ingress the glyph of the sign the
 *   Moon enters today and when, or null; the Moon never turns, so it only
 *   ever enters
 */

/**
 * The scan's answer sorted into what the reading is made of. Only what
 * perfects inside the range counts: the scan clips every window to the range
 * and lists the exact hits inside it, so a rule is in when any of its windows
 * has one. A body merely within orb all day - Pluto sits in orb of something
 * for months - is left out: the line is what happens today, not what is
 * hanging over it.
 *
 * A sign change is a moment rather than a row, so it comes back as text in
 * the order it happens, named the way the chart names it: the sign the body
 * is in afterwards, which for a retrograde slipping back is the one it came
 * from. The Moon's own moments - its phase and its sign change - go to its
 * line rather than the world's.
 *
 * @param {import("../core/job.js").Rule[]} rules
 * @param {import("../core/events.js").AspectEvent[][]} events one list per rule
 * @returns {{personal: import("../core/job.js").Rule[], world: import("../core/job.js").Rule[],
 *            ingresses: string[], moon: MoonMoments}}
 */
export function summarizeToday(rules, events){
  /** @type {import("../core/job.js").Rule[]} */
  const personal = [];
  /** @type {import("../core/job.js").Rule[]} */
  const world = [];
  /** @type {{at:number, text:string}[]} */
  const ingresses = [];
  /** @type {MoonMoments} */
  const moon = { phase: null, ingress: null };
  rules.forEach((rule, i) => {
    const phase = phaseFor(rule.aspect);
    if (phase || isIngressRule(rule)){
      for (const event of events[i]){
        (event.exacts ?? []).forEach((at, k) => {
          if (phase){
            // Two phases cannot fall on one day; the first found stands.
            moon.phase ??= {
              name: phase[1],
              sign: signGlyph(event.exactLonNatal?.[k] ?? NaN),
              at,
              eclipse: eclipseKind(phase[0], event.exactLon?.[k] ?? NaN, event.exactLonNode?.[k] ?? NaN)
            };
          } else if (rule.transit === "moon"){
            // The rule names the sign; the longitude at the exact moment sits
            // on the cusp and rounds to either side of it.
            moon.ingress ??= { sign: endGlyph(ingressAsCrossed(rule, event.entering?.[k] ?? true).rule.natal) + TEXT_PRESENTATION, at };
          } else {
            ingresses.push({ at, text: rulePairing(ingressAsCrossed(rule, event.entering?.[k] ?? true).rule) });
          }
        });
      }
      return;
    }
    if (!events[i].some(e => (e.exacts ?? []).length > 0)) return;
    (rule.scope === "world" ? world : personal).push(rule);
  });
  return { personal, world, ingresses: ingresses.sort((a, b) => a.at - b.at).map(m => m.text), moon };
}

/**
 * The Moon's phase as a name, from how far it is ahead of the Sun. The four
 * exact phases have their own names and their own moments, which the scan
 * finds; between them the Moon is a crescent or gibbous, waxing to the full
 * and waning after it, and that is what this says.
 * @param {number} moonLon @param {number} sunLon
 */
export function moonPhaseName(moonLon, sunLon){
  const ahead = wrap360(moonLon - sunLon);
  if (ahead < 90) return "Waxing Crescent";
  if (ahead < 180) return "Waxing Gibbous";
  if (ahead < 270) return "Waning Gibbous";
  return "Waning Crescent";
}

// The bodies whose aspects end a void of course. The Sun through Pluto, which
// is the modern reading; the traditional one stops at Saturn, and nobody
// counts the node or Chiron.
export const voidOfCourseBodies = ["sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto"];

/**
 * Every void of course that touches the day: from the Moon's last exact
 * aspect in a sign to the moment it leaves the sign, for each sign the Moon
 * is in at any point of the day. Pure, so it can be tested: the scan's exact
 * moments come in, the windows come out, in order.
 *
 * A sign runs between two consecutive sign changes; its void begins at the
 * last aspect inside it, or at its start if the Moon makes none - the rare
 * void that lasts a whole sign. A sign the scan did not see both ends of is
 * skipped, which is why the scan reaches days either side of the one asked.
 *
 * @param {number[]} ingressTimes when the Moon changed sign, around the day
 * @param {number[]} aspectTimes when the Moon was exact to another body
 * @param {number} dayStart @param {number} dayEnd
 * @returns {{from:number, until:number}[]}
 */
export function voidWindows(ingressTimes, aspectTimes, dayStart, dayEnd){
  const changes = [...ingressTimes].sort((a, b) => a - b);
  /** @type {{from:number, until:number}[]} */
  const out = [];
  for (let i = 1; i < changes.length; i++){
    const start = changes[i - 1];
    const until = changes[i];
    const inSign = aspectTimes.filter(t => t > start && t < until);
    const from = inSign.length ? Math.max(...inSign) : start;
    if (from < dayEnd && until > dayStart) out.push({ from, until });
  }
  return out;
}

/**
 * The Moon's line, fixed by the day rather than by the moment it is read, and
 * the same shape every day: the phase, the sign, the void.
 *
 * The phase word is the day's, read at noon - or, on a day with an exact
 * phase, that phase with the Moon's sign at that moment and the time, and
 * whether it is an eclipse. The sign is the one the Moon is in as the day
 * begins, or the move where it changes sign during the day, "♍ → ♎". The
 * move carries no time: a sign change always ends a void, so the void that
 * follows ends at the move, and its window says when. Each void that touches
 * the day is a window with both ends on the clock, "yesterday" and "tomorrow"
 * where an end falls outside the day.
 *
 * @param {{sign:string, phase:string}} day the glyph of the sign the Moon is
 *   in as the day begins, and the phase word at its middle
 * @param {MoonMoments} moments
 * @param {{from:number, until:number}[]} voids the voids that touch the day
 * @param {{dayStart:number, dayEnd:number, fmtTime:(ms:number)=>string}} clock
 */
export function describeMoon(day, moments, voids, { dayStart, dayEnd, fmtTime }){
  const parts = [];
  const sign = moments.ingress ? `${day.sign} → ${moments.ingress.sign}` : day.sign;
  if (moments.phase){
    const p = moments.phase;
    parts.push(`${p.name} ${p.sign} ${fmtTime(p.at)}`);
    if (p.eclipse) parts.push(p.eclipse);
    if (moments.ingress) parts.push(sign);
  } else {
    parts.push(`${day.phase} ${sign}`);
  }
  for (const v of voids){
    const from = v.from < dayStart ? `from yesterday ${fmtTime(v.from)}` : fmtTime(v.from);
    const until = v.until >= dayEnd ? `tomorrow ${fmtTime(v.until)}` : fmtTime(v.until);
    parts.push(`void ${from} to ${until}`);
  }
  return parts.join(", ");
}

/**
 * The voids that touch the day, from a scan of their own: the Moon's aspects
 * and sign changes over the week around it. Three days back reaches the
 * start of the sign the day begins in, which the Moon never stays in longer;
 * four days ahead reaches the end of the sign it ends in.
 * @param {{lon:number, lat:number, height:number}} observer
 * @param {number} dayStart @param {number} dayEnd
 */
export function voidsOfCourse(observer, dayStart, dayEnd){
  const rules = [
    ...buildWorldRules({ bodies: voidOfCourseBodies, aspects: todayAspects, orb: 1 })
      .filter(r => r.transit === "moon" || r.natal === "moon"),
    ...buildIngressRules({ bodies: ["moon"], orb: 1 })
  ];
  const found = computeTransitEvents({
    startMs: dayStart - 3 * DAY_MS,
    endMs: dayEnd + 4 * DAY_MS,
    observer,
    natalLon: null,
    rules
  });
  /** @type {number[]} */
  const ingressTimes = [];
  /** @type {number[]} */
  const aspectTimes = [];
  found.rules.forEach((rule, i) => {
    const into = isIngressRule(rule) ? ingressTimes : aspectTimes;
    for (const event of found.events[i]) into.push(...(event.exacts ?? []));
  });
  return voidWindows(ingressTimes, aspectTimes, dayStart, dayEnd);
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * The lines. The Moon leads, every day: the lunation is the calendar the rest
 * is read against, and the Moon is always somewhere, so its line is never
 * empty. The natal line is written when something perfects, and "na" where
 * there is a chart and nothing does - a reading of a chart that said nothing
 * about the chart would have left something out. Where there is no chart to
 * read against - world view - it is left out altogether, since "na" would be
 * saying something about a chart nobody picked. The world line closes with
 * the sign changes, after the aspects, since they are the same weather, and
 * a day with neither has no world line.
 *
 * @param {{moon: string, personal: import("../core/job.js").Rule[]|null,
 *          world: import("../core/job.js").Rule[], ingresses?: string[]}} found
 */
export function formatTodaySummary({ moon, personal, world, ingresses = [] }){
  const named = (/** @type {import("../core/job.js").Rule[]} */ rules) => rules.map(r => rulePairing(r));
  const lines = [`- Moon: ${moon}`];
  if (personal) lines.push(`- Transits: ${personal.length ? named(personal).join(", ") : "na"}`);
  const sky = [...named(world), ...ingresses];
  if (sky.length) lines.push(`- World transits: ${sky.join(", ")}`);
  return lines.join("\n");
}

/**
 * The reading itself. Scanned here on the main thread rather than in the
 * worker: a day without the Moon is a few dozen longitude reads, and the
 * answer has to be ready inside the tap that asked for it, because that is
 * the only moment the clipboard will take it from.
 *
 * "Today" is the reader's local day, and a transit, a sign change or a phase
 * is happening today if it is exact at some moment of it. The text is a
 * function of the day alone: two taps hours apart copy the same thing.
 *
 * @param {import("./chart-context.js").ChartContext} ctx
 * @param {number} orb
 * @param {Date} [now]
 */
export function todaySummary(ctx, orb, now = new Date()){
  const personal = ctx.mode === "personal";
  const rules = buildTodayRules({ personal, orb });
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const natalLon = personal ? natalLongitudes(ctx, natalKeys) : null;
  const found = computeTransitEvents({
    startMs: start.getTime(),
    endMs: addDaysLocal(start, 1).getTime(),
    observer: ctx.observer,
    natalLon,
    rules
  });
  const day = summarizeToday(found.rules, found.events);
  // Nothing below reads the clock: the sign is the day's first and the phase
  // word its middle's, so the same day copies the same text at any hour.
  const dayStart = start.getTime();
  const dayEnd = addDaysLocal(start, 1).getTime();
  const noon = new Date(dayStart + DAY_MS / 2);
  const moon = describeMoon(
    { sign: signGlyph(getBodyLonAt("moon", start, ctx.observer)),
      phase: moonPhaseName(getBodyLonAt("moon", noon, ctx.observer), getBodyLonAt("sun", noon, ctx.observer)) },
    day.moon,
    voidsOfCourse(ctx.observer, dayStart, dayEnd),
    { dayStart, dayEnd, fmtTime: ms => timeFmt.format(new Date(ms)) }
  );
  return formatTodaySummary({ moon, personal: personal ? day.personal : null, world: day.world, ingresses: day.ingresses });
}
