// How much a transit matters, as tables rather than as code.
//
// Every bar used to carry the same visual weight and rows sorted only by first
// hit, so transiting Pluto conjunct your Sun drew exactly like Mercury sextile
// Mars - and on a wide selection the Pluto one was often not on screen at all,
// because a fifty-row cap applied to a chronological list keeps the first fifty
// dates rather than the fifty that matter.
//
// These are judgements, and judgements belong in a table where an argument
// about whether Chiron outranks Jupiter is an argument about one number. The
// scoring that reads them is core/significance.js, and the tests pin the
// orderings these produce rather than the numbers themselves: a test asserting
// pluto-square-sun scores 0.80 fails the first time a weight is tuned and
// teaches nobody anything, while one asserting it outranks mercury-sextile-
// neptune is the actual claim.

/**
 * How much weight the transiting body carries: how slow the crossing is, and
 * how long it is until the next one.
 *
 * Deliberately not derived from maxSpeedDegPerDay. The speeds span a factor of
 * 380 between the Moon and Pluto, and no astrologer weights a lunar contact at
 * one three-hundred-and-eightieth of a Pluto one - the Moon is quick, not
 * meaningless. This is the same ordering as the speeds, compressed by hand.
 *
 * @type {Record<string, number>}
 */
export const transitWeight = {
  pluto: 1.00,    // once in a life, and in orb for years
  neptune: 0.95,  // two or three years, three passes
  uranus: 0.90,   // a year or more, three passes
  saturn: 0.85,   // a degree a month; the return everyone has heard of
  chiron: 0.60,   // a degree in about seven weeks
  jupiter: 0.60,  // a degree in twelve days, back every twelve years
  node: 0.45,     // conjunctions only, and a nineteen-year cycle
  mars: 0.40,     // a degree in two days, but it stations
  sun: 0.30,      // a degree a day, back within the year
  venus: 0.22,    // under a day direct, three passes when it turns
  mercury: 0.20,  // under a day direct, and it stations often
  moon: 0.08      // a degree every two hours, back next month
};

/**
 * How personal the point being crossed is.
 *
 * The lights and the angles are the chart's own axes. The outer planets sit
 * within a degree or two of where they sit for everyone born the same year, so
 * a transit to natal Neptune is a transit to a generation - real, but not
 * personal in the way this table means.
 *
 * The angles are here at close to full weight because that is astrologically
 * right, with the caveat that they are the least reliable points in any chart:
 * four minutes of birth-time error moves the Ascendant a degree, which is more
 * than the default orb. That is a caveat to state in the popup rather than a
 * reason to weight them below what they are.
 *
 * @type {Record<string, number>}
 */
export const natalWeight = {
  sun: 1.00,
  moon: 1.00,
  asc: 0.95,
  mc: 0.90,
  mercury: 0.70,
  venus: 0.70,
  mars: 0.70,
  jupiter: 0.55,
  saturn: 0.55,
  node: 0.45,
  chiron: 0.45,
  uranus: 0.35,
  neptune: 0.35,
  pluto: 0.35
};

/** @type {Record<string, number>} */
export const aspectWeight = {
  conjunction: 1.00,  // the same degree, with nothing in between
  opposition: 0.85,   // hard, and visible right across the chart
  square: 0.80,       // hard, and the one people report feeling
  trine: 0.60,        // soft; easy to miss while it is happening
  sextile: 0.40       // softest of the five
};

// A return - a body meeting its own natal place - is already drawn in gold in
// the timeline, so the table should agree with what the chart already says.
export const RETURN_BONUS = 1.15;

/**
 * The traditional ruler of the rising sign, as a multiplier on the natal end.
 *
 * The row labels have underlined this point since before there was a score:
 * chartRulerKeyFor derives it from the Ascendant, and renderLabelsSVG marks it.
 * The UI has therefore been asserting that this planet is special while the
 * ordering ignored it entirely, and this closes that gap - the chart ruler is
 * the planet running the chart, and a transit to it lands on the steering
 * rather than on one more placement.
 *
 * A multiplier rather than a table row, because which planet rules is a fact
 * about the chart and not about the planet: Mars for an Aries rising, Venus for
 * a Taurus one. At 1.25 a ruling Mercury (0.70) reaches 0.875 - above the
 * social planets, still below the lights, which is where the tradition puts it.
 *
 * It inherits the Ascendant's dependence on birth time, but far more weakly:
 * the ruler only changes when the Ascendant crosses a whole sign, which is
 * around two hours of birth time rather than the four minutes that move the
 * Ascendant past its own orb. Where the ruler IS the Sun or Moon - Leo or
 * Cancer rising - the natal factor exceeds 1, and that is intended: the score
 * is a relative quantity and was never normalised to a maximum of one.
 */
export const RULER_BONUS = 1.25;

/**
 * The tier a score falls in, as an absolute cut rather than relative to
 * whatever else is on screen.
 *
 * Absolute is the whole point. Normalising to the maximum in view would redraw
 * a Mercury sextile as the biggest thing in a quiet month simply because
 * nothing else was happening, which is exactly the lie the weighting exists to
 * remove. The cost is that a quiet month genuinely contains no major transits
 * and should look like it - so the visual range these drive is compressed
 * (see BAR_HEIGHT_SCALE in ui/timeline.js), not the full range of the row.
 *
 * Measured over a 1988 chart: a one-month view peaks at 0.24, a year at 0.57,
 * five years at 0.90. Four tiers put roughly a fifth of any view in the bottom
 * band and single figures in the top.
 */
export const TIERS = [
  { key: "major", min: 0.45 },
  { key: "strong", min: 0.20 },
  { key: "notable", min: 0.08 },
  { key: "minor", min: 0 }
];

/** @param {number} score @returns {"major"|"strong"|"notable"|"minor"} */
export function tierFor(score){
  for (const t of TIERS){
    if (score >= t.min) return /** @type {any} */ (t.key);
  }
  return "minor";
}
