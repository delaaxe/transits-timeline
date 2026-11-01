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
import { aspects, endLabel, ingressAsCrossed, isIngressRule, natalKeys, phaseFor, rulePairing, transitingKeys, zodiacSign } from "../data/bodies.js";
import { locale } from "../storage/charts.js";
import { natalLongitudes } from "./chart-context.js";

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
 * @property {{name:string, sign:string, at:number}|null} phase the phase exact
 *   today, with the Moon's sign at that moment, or null
 * @property {{sign:string, at:number}|null} ingress the sign the Moon enters
 *   today and when, or null; the Moon never turns, so it only ever enters
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
            moon.phase ??= { name: phase[1], sign: zodiacSign(event.exactLonNatal?.[k] ?? NaN), at };
          } else if (rule.transit === "moon"){
            // The rule names the sign; the longitude at the exact moment sits
            // on the cusp and rounds to either side of it.
            moon.ingress ??= { sign: endLabel(ingressAsCrossed(rule, event.entering?.[k] ?? true).rule.natal), at };
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

/**
 * The Moon's line. Where it is and what phase it is in, as of now - and on a
 * day with an exact phase, that phase and its time instead, with the Moon's
 * sign at that moment, since "Full Moon in Taurus" is what gets looked up.
 * Then the sign it enters today, with the time, if it does.
 *
 * @param {{sign:string, phase:string}} now where the Moon is as this is read
 * @param {MoonMoments} moments
 * @param {(ms:number)=>string} fmtTime
 */
export function describeMoon(now, moments, fmtTime){
  const head = moments.phase
    ? `${moments.phase.name} in ${moments.phase.sign} ${fmtTime(moments.phase.at)}`
    : `${now.phase} in ${now.sign}`;
  const tail = moments.ingress ? `, enters ${moments.ingress.sign} ${fmtTime(moments.ingress.at)}` : "";
  return `${head}${tail}`;
}

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
 * is happening today if it is exact at some moment of it.
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
  const moonLon = getBodyLonAt("moon", now, ctx.observer);
  const sunLon = getBodyLonAt("sun", now, ctx.observer);
  const moon = describeMoon(
    { sign: zodiacSign(moonLon), phase: moonPhaseName(moonLon, sunLon) },
    day.moon,
    ms => timeFmt.format(new Date(ms))
  );
  return formatTodaySummary({ moon, personal: personal ? day.personal : null, world: day.world, ingresses: day.ingresses });
}
