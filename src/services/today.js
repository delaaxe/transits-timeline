// Everything that perfects today, as two lines of text.
//
// This is what the hidden corner of the chart copies: a complete reading of the
// day rather than the chart's current view of it. The chooser narrows the chart
// to what the reader wants to look at; this ignores that and takes every body on
// both ends and every aspect, so the text can be pasted somewhere else as "what
// is going on today" without first widening the selection. The one body left
// out is the transiting Moon, which is in orb of something every few hours and
// would be half the list.

import { computeTransitEvents } from "../core/job.js";
import { addDaysLocal } from "../core/time.js";
import { buildCandidateRules, buildIngressRules, buildPhaseRules, buildWorldRules } from "../core/transits.js";
import { aspects, ingressAsCrossed, isIngressRule, natalKeys, phaseFor, rulePairing, transitingKeys, zodiacSign } from "../data/bodies.js";
import { natalLongitudes } from "./chart-context.js";

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
 * The Moon is back for the sign changes. It is left out of the aspects
 * because it is in orb of something every few hours; it changes sign every
 * two and a half days, and "Moon enters Scorpio" is the one line of the
 * day's weather everyone reads.
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
 * The scan's answer sorted into the four lists the reading is made of. Only
 * what perfects inside the range counts, for all four: the scan clips every
 * window to the range and lists the exact hits inside it, so a rule is in
 * when any of its windows has one. A body merely within orb all day - Pluto
 * sits in orb of something for months - is left out: the line is what
 * happens today, not what is hanging over it.
 *
 * A sign change and a phase are moments rather than rows, so they come back
 * as text in the order they happen, named the way the chart names them: the
 * sign the body is in afterwards, which for a retrograde slipping back is the
 * one it came from, and the phase with the Moon's sign beside it.
 *
 * @param {import("../core/job.js").Rule[]} rules
 * @param {import("../core/events.js").AspectEvent[][]} events one list per rule
 */
export function summarizeToday(rules, events){
  /** @type {import("../core/job.js").Rule[]} */
  const personal = [];
  /** @type {import("../core/job.js").Rule[]} */
  const world = [];
  /** @type {{at:number, text:string}[]} */
  const ingresses = [];
  /** @type {{at:number, text:string}[]} */
  const phases = [];
  rules.forEach((rule, i) => {
    const phase = phaseFor(rule.aspect);
    if (phase || isIngressRule(rule)){
      for (const event of events[i]){
        (event.exacts ?? []).forEach((at, k) => {
          if (phase){
            const sign = zodiacSign(event.exactLonNatal?.[k] ?? NaN);
            phases.push({ at, text: sign ? `${phase[1]} in ${sign}` : phase[1] });
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
  const inOrder = (/** @type {{at:number, text:string}[]} */ list) => list.sort((a, b) => a.at - b.at).map(m => m.text);
  return { personal, world, ingresses: inOrder(ingresses), phases: inOrder(phases) };
}

/**
 * The lines. A phase of the Moon leads, and only on a day that has one: the
 * lunation is the calendar the rest is read against, and a line saying there
 * is no phase today would be most days. The world line goes the same way -
 * sign changes close it, after the aspects, since they are the same weather,
 * and a day with neither has no world line. The natal line is written when
 * something perfects, and otherwise only when it would be the whole reading:
 * a copy that comes back empty looks like a tap that did nothing, so a chart
 * with a quiet day says "na" - but not beside a phase or a world line, where
 * the day has already said what it has to say. Where there is no chart to
 * read against - world view - it is left out altogether, since "na" would be
 * saying something about a chart nobody picked.
 *
 * @param {{personal: import("../core/job.js").Rule[]|null, world: import("../core/job.js").Rule[],
 *          ingresses?: string[], phases?: string[]}} found
 */
export function formatTodaySummary({ personal, world, ingresses = [], phases = [] }){
  const named = (/** @type {import("../core/job.js").Rule[]} */ rules) => rules.map(r => rulePairing(r));
  const lines = [];
  if (phases.length) lines.push(`- Moon phase: ${phases.join(", ")}`);
  if (personal?.length) lines.push(`- Transits: ${named(personal).join(", ")}`);
  const sky = [...named(world), ...ingresses];
  if (sky.length) lines.push(`- World transits: ${sky.join(", ")}`);
  if (personal && lines.length === 0) lines.push("- Transits: na");
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
  return formatTodaySummary({ ...day, personal: personal ? day.personal : null });
}
