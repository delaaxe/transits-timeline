// Everything within orb today, as two lines of text.
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
import { buildCandidateRules, buildWorldRules } from "../core/transits.js";
import { aspects, natalKeys, rulePairing, transitingKeys } from "../data/bodies.js";
import { natalLongitudes } from "./chart-context.js";

/** Every body that moves, the Moon aside. */
export const todayTransitBodies = transitingKeys.filter(k => k !== "moon");

/** Every aspect the app knows. */
export const todayAspects = aspects.map(a => a[0]);

/**
 * The rules a day's reading scans: every transiting body over every natal
 * point where there is a chart, and every pair of transiting bodies either
 * way. The orb is the reader's, since it is the one number on the aspect
 * panel that says what "in orb" means to them.
 *
 * @param {{personal: boolean, orb: number}} opts
 * @returns {import("../core/job.js").Rule[]}
 */
export function buildTodayRules({ personal, orb }){
  return [
    ...(personal
      ? buildCandidateRules({ transitBodies: todayTransitBodies, natalBodies: natalKeys, aspects: todayAspects, orb })
      : []),
    ...buildWorldRules({ bodies: todayTransitBodies, aspects: todayAspects, orb })
  ];
}

/**
 * The two lines. The natal line is left out altogether where there is no chart
 * to read against - world view - rather than written as empty, since "none"
 * would be saying something about a chart nobody picked.
 *
 * @param {{personal: import("../core/job.js").Rule[]|null, world: import("../core/job.js").Rule[]}} found
 */
export function formatTodaySummary({ personal, world }){
  const list = (/** @type {import("../core/job.js").Rule[]} */ rules) =>
    rules.length ? rules.map(r => rulePairing(r)).join(", ") : "none";
  const lines = [];
  if (personal) lines.push(`- Transits: ${list(personal)}`);
  lines.push(`- World transits: ${list(world)}`);
  return lines.join("\n");
}

/**
 * The reading itself. Scanned here on the main thread rather than in the
 * worker: a day without the Moon is a few dozen longitude reads, and the
 * answer has to be ready inside the tap that asked for it, because that is
 * the only moment the clipboard will take it from.
 *
 * "Today" is the reader's local day, and a transit is happening today if its
 * orb window touches any part of it - the scan clips windows to the range, so
 * anything it returns qualifies.
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
  return formatTodaySummary({
    personal: personal ? found.rules.filter(r => r.scope !== "world") : null,
    world: found.rules.filter(r => r.scope === "world")
  });
}
